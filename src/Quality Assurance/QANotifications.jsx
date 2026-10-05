import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  App,
  Badge,
  Button,
  Card,
  DatePicker,
  Empty,
  Grid,
  Input,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from "antd";
import {
  BellOutlined,
  CheckOutlined,
  ClearOutlined,
  ExperimentOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client.js";

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;
const { RangePicker } = DatePicker;
const { Option } = Select;

const fmtDate = (v) => (v ? dayjs(v).format("DD/MM/YYYY") : "—");

const DATE_PRESETS = [
  { label: "Today", value: [dayjs().startOf("day"), dayjs().endOf("day")] },
  { label: "Yesterday", value: [dayjs().subtract(1, "day").startOf("day"), dayjs().subtract(1, "day").endOf("day")] },
  { label: "Last 7 days", value: [dayjs().subtract(6, "day").startOf("day"), dayjs().endOf("day")] },
  { label: "Last 30 days", value: [dayjs().subtract(29, "day").startOf("day"), dayjs().endOf("day")] },
  { label: "This month", value: [dayjs().startOf("month"), dayjs().endOf("month")] },
  { label: "Last month", value: [dayjs().subtract(1, "month").startOf("month"), dayjs().subtract(1, "month").endOf("month")] },
];

const QANotifications = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [pendingOnly, setPendingOnly] = useState(true);
  const [dateRange, setDateRange] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [materialFilter, setMaterialFilter] = useState([]);
  const [formFilter, setFormFilter] = useState([]);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        pending_only: pendingOnly,
        limit: 500,
      };
      if (dateRange?.[0]) {
        params.start_date = dateRange[0].startOf("day").toISOString();
      }
      if (dateRange?.[1]) {
        params.end_date = dateRange[1].endOf("day").toISOString();
      }
      const response = await api.get(`/qa-rm-notifications/`, { params });
      setNotifications(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Error fetching QA notifications:", error);
      message.error(
        error?.response?.data?.detail || "Failed to fetch notifications"
      );
    } finally {
      setLoading(false);
    }
  }, [message, pendingOnly, dateRange]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const materialOptions = useMemo(() => {
    const set = new Set();
    notifications.forEach((n) => {
      if (n.material_name) set.add(n.material_name);
    });
    return Array.from(set).sort();
  }, [notifications]);

  const formOptions = useMemo(() => {
    const set = new Set();
    notifications.forEach((n) => {
      if (n.form_type) set.add(n.form_type);
    });
    return Array.from(set).sort();
  }, [notifications]);

  const filteredNotifications = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return notifications.filter((n) => {
      if (materialFilter.length > 0 && !materialFilter.includes(n.material_name)) {
        return false;
      }
      if (formFilter.length > 0 && !formFilter.includes(n.form_type)) {
        return false;
      }
      if (!q) return true;
      const hay = [
        n.sale_order_number,
        n.product_name,
        n.material_name,
        n.process_type,
        n.form_type,
        n.dimensions,
        n.stock_status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [notifications, searchText, materialFilter, formFilter]);

  const pendingCount = useMemo(
    () => filteredNotifications.filter((n) => !n.is_ack).length,
    [filteredNotifications]
  );

  const clearFilters = () => {
    setDateRange(null);
    setSearchText("");
    setMaterialFilter([]);
    setFormFilter([]);
    setPendingOnly(true);
  };

  const acknowledgeOne = async (id) => {
    try {
      await api.put(`/qa-rm-notifications/${id}/acknowledge`);
      message.success("Notification acknowledged");
      fetchNotifications();
    } catch (error) {
      message.error(
        error?.response?.data?.detail || "Failed to acknowledge notification"
      );
    }
  };

  const acknowledgeAll = async () => {
    try {
      const response = await api.put(`/qa-rm-notifications/acknowledge-all`);
      const count = response.data?.acknowledged_count ?? 0;
      message.success(
        count > 0
          ? `Acknowledged ${count} notification${count === 1 ? "" : "s"}`
          : "No pending notifications"
      );
      fetchNotifications();
    } catch (error) {
      message.error(
        error?.response?.data?.detail || "Failed to acknowledge all"
      );
    }
  };

  const openInventory = (row) => {
    const stockId = row?.stock_id;
    if (!stockId) {
      navigate("/quality_assurance/rawmaterials");
      return;
    }
    navigate(`/quality_assurance/rawmaterials?highlightStockId=${stockId}`);
  };

  const columns = [
    {
      title: "Order No",
      key: "order",
      width: 130,
      render: (_, row) => (
        <div>
          <div className="font-medium text-xs">
            {row.sale_order_number || (row.order_id ? `#${row.order_id}` : "—")}
          </div>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {row.product_name || "—"}
          </Text>
        </div>
      ),
    },
    {
      title: "Material",
      dataIndex: "material_name",
      key: "material_name",
      width: 140,
      ellipsis: true,
      render: (text) => text || "—",
    },
    {
      title: "Process",
      dataIndex: "process_type",
      key: "process_type",
      width: 100,
      responsive: ["lg"],
      render: (text) => text || "—",
    },
    {
      title: "Form",
      dataIndex: "form_type",
      key: "form_type",
      width: 90,
      responsive: ["md"],
      render: (text) => text || "—",
    },
    {
      title: "Dimensions",
      dataIndex: "dimensions",
      key: "dimensions",
      width: 150,
      render: (text) => (
        <span style={{ fontFamily: "monospace", fontSize: 12 }}>{text || "—"}</span>
      ),
    },
    {
      title: "Qty",
      dataIndex: "quantity",
      key: "quantity",
      width: 70,
      render: (q) => q ?? "—",
    },
    {
      title: "Mass (kg)",
      dataIndex: "mass",
      key: "mass",
      width: 90,
      responsive: ["lg"],
      render: (m) => (m != null ? Number(m).toFixed(2) : "—"),
    },
    {
      title: "Final Cost",
      dataIndex: "final_cost",
      key: "final_cost",
      width: 100,
      responsive: ["xl"],
      render: (c) => (c != null ? Number(c).toLocaleString("en-IN") : "—"),
    },
    {
      title: "Stock Status",
      dataIndex: "stock_status",
      key: "stock_status",
      width: 110,
      responsive: ["md"],
      render: (s) =>
        s ? (
          <Tag color={s === "available" ? "green" : "default"}>
            {String(s).replace(/_/g, " ")}
          </Tag>
        ) : (
          "—"
        ),
    },
    {
      title: "Ack",
      key: "ack_status",
      width: 110,
      render: (_, row) =>
        row.is_ack ? (
          <Tag color="green">Acknowledged</Tag>
        ) : (
          <Tag color="orange">Pending</Tag>
        ),
    },
    {
      title: "Received",
      dataIndex: "created_at",
      key: "created_at",
      width: 110,
      render: (v) => fmtDate(v),
    },
    {
      title: "Action",
      key: "action",
      fixed: isMobile ? undefined : "right",
      width: isMobile ? 150 : 210,
      render: (_, row) => (
        <Space size={4} wrap>
          {!row.is_ack && (
            <Button
              type="primary"
              size="small"
              icon={<CheckOutlined />}
              onClick={() => acknowledgeOne(row.id)}
            >
              {isMobile ? "Ack" : "Acknowledge"}
            </Button>
          )}
          <Button
            size="small"
            icon={<ExperimentOutlined />}
            onClick={() => openInventory(row)}
          >
            Inventory
          </Button>
        </Space>
      ),
    },
  ];

  const renderMobileCards = () => (
    <div className="flex flex-col gap-3">
      {filteredNotifications.map((row) => (
        <Card
          key={row.id}
          size="small"
          className="shadow-sm"
          styles={{ body: { padding: 12 } }}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0">
              <div className="font-semibold text-sm truncate">
                {row.sale_order_number || (row.order_id ? `#${row.order_id}` : "—")}
              </div>
              <Text type="secondary" className="text-xs block truncate">
                {row.product_name || "—"}
              </Text>
            </div>
            {row.is_ack ? (
              <Tag color="green">Acknowledged</Tag>
            ) : (
              <Tag color="orange">Pending</Tag>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs mb-3">
            <div>
              <Text type="secondary">Material</Text>
              <div className="font-medium break-words">{row.material_name || "—"}</div>
            </div>
            <div>
              <Text type="secondary">Form</Text>
              <div className="font-medium">{row.form_type || "—"}</div>
            </div>
            <div className="col-span-2">
              <Text type="secondary">Dimensions</Text>
              <div className="font-medium font-mono">{row.dimensions || "—"}</div>
            </div>
            <div>
              <Text type="secondary">Qty</Text>
              <div className="font-medium">{row.quantity ?? "—"}</div>
            </div>
            <div>
              <Text type="secondary">Mass</Text>
              <div className="font-medium">
                {row.mass != null ? `${Number(row.mass).toFixed(2)} kg` : "—"}
              </div>
            </div>
            <div>
              <Text type="secondary">Process</Text>
              <div className="font-medium">{row.process_type || "—"}</div>
            </div>
            <div>
              <Text type="secondary">Received</Text>
              <div className="font-medium">{fmtDate(row.created_at)}</div>
            </div>
            <div>
              <Text type="secondary">Stock</Text>
              <div>
                {row.stock_status ? (
                  <Tag color={row.stock_status === "available" ? "green" : "default"}>
                    {String(row.stock_status).replace(/_/g, " ")}
                  </Tag>
                ) : (
                  "—"
                )}
              </div>
            </div>
            <div>
              <Text type="secondary">Final Cost</Text>
              <div className="font-medium">
                {row.final_cost != null
                  ? Number(row.final_cost).toLocaleString("en-IN")
                  : "—"}
              </div>
            </div>
          </div>

          <Space wrap className="w-full">
            {!row.is_ack && (
              <Button
                type="primary"
                size="small"
                icon={<CheckOutlined />}
                onClick={() => acknowledgeOne(row.id)}
              >
                Acknowledge
              </Button>
            )}
            <Button
              size="small"
              icon={<ExperimentOutlined />}
              onClick={() => openInventory(row)}
            >
              Inventory
            </Button>
          </Space>
        </Card>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-2 sm:p-4 lg:p-6 w-full max-w-[100vw] overflow-x-hidden">
      <Card className="shadow-sm w-full" styles={{ body: { padding: isMobile ? 12 : 20 } }}>
        <div className="flex flex-col gap-3 mb-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start sm:items-center gap-2 min-w-0">
            <BellOutlined style={{ fontSize: 20, color: "#2563eb", flexShrink: 0 }} />
            <div className="min-w-0">
              <Title level={4} style={{ margin: 0, fontSize: isMobile ? 16 : 20 }}>
                Raw Material Received Notifications
              </Title>
              <Text type="secondary" style={{ fontSize: 12 }} className="block">
                Filter by date / material and acknowledge single or all
              </Text>
            </div>
            <Badge count={pendingCount} overflowCount={99} />
          </div>
          <Space wrap size={[8, 8]} className="w-full lg:w-auto">
            <Button
              type={pendingOnly ? "primary" : "default"}
              size={isMobile ? "small" : "middle"}
              onClick={() => setPendingOnly(true)}
            >
              Pending
            </Button>
            <Button
              type={!pendingOnly ? "primary" : "default"}
              size={isMobile ? "small" : "middle"}
              onClick={() => setPendingOnly(false)}
            >
              All
            </Button>
            <Button
              icon={<ReloadOutlined />}
              size={isMobile ? "small" : "middle"}
              onClick={fetchNotifications}
            >
              Refresh
            </Button>
            <Button
              type="primary"
              icon={<CheckOutlined />}
              size={isMobile ? "small" : "middle"}
              disabled={pendingCount === 0}
              onClick={acknowledgeAll}
            >
              Acknowledge All
            </Button>
          </Space>
        </div>

        <div className="bg-gray-50 border border-gray-100 rounded-lg p-2 sm:p-3 mb-4">
          <div className="flex flex-wrap gap-2 items-center">
            <RangePicker
              value={dateRange}
              onChange={setDateRange}
              format="DD/MM/YYYY"
              allowClear
              size={isMobile ? "small" : "middle"}
              className="w-full sm:w-auto"
              style={{ minWidth: isMobile ? "100%" : 260 }}
              presets={DATE_PRESETS}
              placeholder={["From date", "To date"]}
            />
            <Input
              allowClear
              prefix={<SearchOutlined className="text-gray-400" />}
              placeholder="Search order / material / dimensions"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              size={isMobile ? "small" : "middle"}
              className="w-full sm:w-[220px]"
            />
            <Select
              mode="multiple"
              allowClear
              placeholder="Material"
              value={materialFilter}
              onChange={setMaterialFilter}
              size={isMobile ? "small" : "middle"}
              className="w-full sm:min-w-[160px] sm:w-auto"
              maxTagCount="responsive"
              optionFilterProp="children"
              showSearch
            >
              {materialOptions.map((m) => (
                <Option key={m} value={m}>{m}</Option>
              ))}
            </Select>
            <Select
              mode="multiple"
              allowClear
              placeholder="Form"
              value={formFilter}
              onChange={setFormFilter}
              size={isMobile ? "small" : "middle"}
              className="w-full sm:min-w-[120px] sm:w-auto"
              maxTagCount="responsive"
            >
              {formOptions.map((f) => (
                <Option key={f} value={f}>{f}</Option>
              ))}
            </Select>
            <Button
              icon={<ClearOutlined />}
              size={isMobile ? "small" : "middle"}
              onClick={clearFilters}
            >
              Clear filters
            </Button>
          </div>
          {dateRange?.[0] && dateRange?.[1] && (
            <Text type="secondary" style={{ fontSize: 11 }} className="mt-2 block">
              Showing {fmtDate(dateRange[0])} to {fmtDate(dateRange[1])}
              {` · ${filteredNotifications.length} result${filteredNotifications.length === 1 ? "" : "s"}`}
            </Text>
          )}
        </div>

        <Spin spinning={loading}>
          {filteredNotifications.length === 0 ? (
            <Empty description="No notifications for selected filters" />
          ) : isMobile ? (
            renderMobileCards()
          ) : (
            <div className="w-full overflow-x-auto">
              <Table
                rowKey="id"
                columns={columns}
                dataSource={filteredNotifications}
                pagination={{
                  pageSize: 15,
                  showSizeChanger: true,
                  responsive: true,
                  showTotal: (total) => `Total ${total}`,
                }}
                size="small"
                bordered
                scroll={{ x: "max-content" }}
              />
            </div>
          )}
        </Spin>
      </Card>
    </div>
  );
};

const QANotificationsPage = () => (
  <App>
    <QANotifications />
  </App>
);

export default QANotificationsPage;
