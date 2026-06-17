/**
 * File: src/RawMaterialComponents/RawMaterialSummaryTab.jsx
 *
 * Simple table-based Raw Material Summary showing all orders with their material data
 */

import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth";
import {
  Card, Table, Button, Select, Input, Space, Empty, Spin, Modal, Row, Col, Statistic, App
} from "antd";
import {
  SearchOutlined, ReloadOutlined, DownloadOutlined,
  ShoppingCartOutlined, CheckCircleOutlined, ExclamationCircleOutlined,
  InboxOutlined, FileTextOutlined, UnorderedListOutlined
} from "@ant-design/icons";
import { RawMaterialSummaryPdfDownload } from "../DownloadReports/RawMaterialSummaryPdfDownload";
import OrderMaterialsPdfDownload from "../DownloadReports/OrderMaterialsPdfDownload";

const { Option } = Select;

const RawMaterialSummaryTab = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [filterOrder, setFilterOrder] = useState(null);
  const [filterRequiredMaterial, setFilterRequiredMaterial] = useState(null);
  const [filterProcuredMaterial, setFilterProcuredMaterial] = useState(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderDetailData, setOrderDetailData] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [ordersPagination, setOrdersPagination] = useState({ current: 1, pageSize: 10 });
  const [detailSearchText, setDetailSearchText] = useState("");
  const [detailFilterPartNumber, setDetailFilterPartNumber] = useState(null);
  const [detailFilterMaterial, setDetailFilterMaterial] = useState(null);
  const [detailFilterSourceType, setDetailFilterSourceType] = useState(null);

  const getCurrentUserId = () => {
    try {
      const u = JSON.parse(localStorage.getItem("user") || "{}");
      return u?.id ?? null;
    } catch {
      return null;
    }
  };

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const uid = getCurrentUserId();
      const params = {};
      if (uid) params.admin_id = uid;

      const res = await axios.get(`${API_BASE_URL}/raw-material-summary/`, { params });
      setData(res.data);
    } catch (err) {
      console.error(err);
      message.error("Failed to load raw material summary");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, []);

  const fetchOrderDetail = async (orderId) => {
    setLoadingDetail(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/raw-material-summary/${orderId}`);
      setOrderDetailData(res.data);
      setDetailModalVisible(true);
    } catch (err) {
      console.error(err);
      message.error("Failed to load order details");
    } finally {
      setLoadingDetail(false);
    }
  };

  // Filter orders
  const filteredOrders = (data?.orders || []).filter((order) => {
    if (searchText) {
      const q = searchText.toLowerCase();
      const matchesSearch =
        order.order_number?.toLowerCase().includes(q) ||
        order.customer_name?.toLowerCase().includes(q) ||
        order.product_name?.toLowerCase().includes(q) ||
        order.materials?.some(
          (m) =>
            m.material_name?.toLowerCase().includes(q) ||
            m.vendor_names?.toLowerCase().includes(q)
        );
      if (!matchesSearch) return false;
    }

    if (filterOrder && order.order_number !== filterOrder) {
      return false;
    }

    // Filter by Required Materials
    if (filterRequiredMaterial) {
      const extractedMaterials = new Set();
      order.materials?.forEach(material => {
        material.parts?.forEach(part => {
          if (part.extracted_material) {
            const normalized = part.extracted_material.toUpperCase().replace(/\s+/g, "");
            extractedMaterials.add(normalized);
          }
        });
      });
      const filterNormalized = filterRequiredMaterial.toUpperCase().replace(/\s+/g, "");
      if (!extractedMaterials.has(filterNormalized)) {
        return false;
      }
    }

    // Filter by Materials Procured
    if (filterProcuredMaterial) {
      const procuredMaterials = new Set();
      order.materials?.filter(m => m.source_type === "order").forEach(material => {
        if (material.material_name) {
          const normalized = material.material_name.toUpperCase().replace(/\s+/g, "");
          procuredMaterials.add(normalized);
        }
      });
      const filterNormalized = filterProcuredMaterial.toUpperCase().replace(/\s+/g, "");
      if (!procuredMaterials.has(filterNormalized)) {
        return false;
      }
    }

    return true;
  });

  const stats = data?.stats || {};

  // Simple table columns
  const tableColumns = [
    {
      title: "Sl No",
      key: "sl_no",
      width: 60,
      render: (_, __, index) => index + 1,
    },
    {
      title: "Project Number",
      dataIndex: "order_number",
      key: "order_number",
      width: 120,
      render: (text, record) => (
        <Button
          type="link"
          onClick={() => {
            setSelectedOrder(record);
            fetchOrderDetail(record.order_id);
          }}
          style={{ padding: 0, fontWeight: 600 }}
        >
          {text}
        </Button>
      ),
    },
    
    {
      title: "Project Name",
      dataIndex: "product_name",
      key: "product_name",
      width: 200,
    },
     {
      title: "Required Materials",
      key: "required_materials",
      width: 250,
      render: (_, record) => {
        const extractedMaterials = new Map(); // Use Map to track normalized -> original
        record.materials?.forEach(material => {
          material.parts?.forEach(part => {
            if (part.extracted_material) {
              // Normalize: uppercase and remove spaces
              const normalized = part.extracted_material.toUpperCase().replace(/\s+/g, "");
              // Store first occurrence of each normalized material
              if (!extractedMaterials.has(normalized)) {
                extractedMaterials.set(normalized, part.extracted_material);
              }
            }
          });
        });
        // Get unique materials and sort
        const uniqueMaterials = Array.from(extractedMaterials.values()).sort();
        return uniqueMaterials.join(", ") || "—";
      },
    },
    {
      title: "Materials Procured",
      key: "materials_procured",
      width: 150,
      render: (_, record) => {
        const procuredMaterials = record.materials?.filter(m => m.source_type === "order") || [];
        // Normalize material names to handle duplicates (e.g., "45C8" and "45C8" should be one)
        const uniqueMaterials = new Map(); // Use Map to track normalized -> original
        procuredMaterials.forEach(material => {
          if (material.material_name) {
            const normalized = material.material_name.toUpperCase().replace(/\s+/g, "");
            if (!uniqueMaterials.has(normalized)) {
              uniqueMaterials.set(normalized, material.material_name);
            }
          }
        });
        const materialNames = Array.from(uniqueMaterials.values()).sort();
        return materialNames.length > 0 ? materialNames.join(", ") : "—";
      },
    },
    
    {
      title: "Total Parts",
      dataIndex: "total_parts",
      key: "total_parts",
      width: 100,
      align: "center",
    },
    {
      title: "Parts with RM",
      dataIndex: "parts_with_material",
      key: "parts_with_material",
      width: 100,
      align: "center",
    },
    {
      title: "Parts Pending RM",
      dataIndex: "parts_pending_material",
      key: "parts_pending_material",
      width: 120,
      align: "center",
    },
   
    {
      title: "Action",
      key: "action",
      width: 100,
      align: "center",
      render: (_, record) => (
        <Button
          type="primary"
          size="small"
          icon={<UnorderedListOutlined />}
          onClick={() => {
            setSelectedOrder(record);
            fetchOrderDetail(record.order_id);
          }}
        >
          Details
        </Button>
      ),
    },
  ];

  // Detail table columns for order breakdown
  const orderDetailColumns = [
    {
      title: "Material Name",
      dataIndex: "material_name",
      key: "material_name",
      width: 150,
    },
    {
      title: "Form Type",
      dataIndex: "form_type",
      key: "form_type",
      width: 100,
    },
    {
      title: "Process Type",
      dataIndex: "process_type",
      key: "process_type",
      width: 100,
    },
    {
      title: "Stock Size",
      dataIndex: "stock_size",
      key: "stock_size",
      width: 150,
    },
    {
      title: "Source",
      dataIndex: "source_type",
      key: "source_type",
      width: 100,
    },
    {
      title: "Total Qty",
      dataIndex: "total_stock_qty",
      key: "total_stock_qty",
      width: 100,
      align: "center",
    },
    {
      title: "Weight (kg)",
      dataIndex: "stock_size_kg",
      key: "stock_size_kg",
      width: 100,
      align: "right",
      render: (val) => val ? val.toFixed(3) : "—",
    },
    {
      title: "Est. Cost (₹)",
      dataIndex: "estimated_cost",
      key: "estimated_cost",
      width: 120,
      align: "right",
      render: (val) => val ? `₹${val.toLocaleString()}` : "—",
    },
    {
      title: "Final Cost (₹)",
      dataIndex: "final_cost",
      key: "final_cost",
      width: 120,
      align: "right",
      render: (val) => val ? `₹${val.toLocaleString()}` : "—",
    },
    {
      title: "Vendor",
      dataIndex: "received_vendor_name",
      key: "received_vendor_name",
      width: 150,
      render: (val) => val || "—",
    },
  ];

  // Part detail columns
  const partDetailColumns = [
    {
      title: "Part Number",
      dataIndex: "part_number",
      key: "part_number",
      width: 120,
    },
    {
      title: "Part Name",
      dataIndex: "part_name",
      key: "part_name",
      width: 160,
    },
    {
      title: "Extracted Material",
      dataIndex: "extracted_material",
      key: "extracted_material",
      width: 110,
      render: (val) => val || "—",
    },
    {
      title: "Extracted Size",
      dataIndex: "extracted_stock_size",
      key: "extracted_stock_size",
      width: 110,
      render: (val) => val || "—",
    },
    {
      title: "Assigned Material",
      dataIndex: "assigned_material_name",
      key: "assigned_material_name",
      width: 110,
    },
    {
      title: "Form Type",
      dataIndex: "assigned_form_type",
      key: "assigned_form_type",
      width: 80,
      render: (val) => val || "—",
    },
    {
      title: "	Assigned Dimensions",
      dataIndex: "unit_dimensions",
      key: "unit_dimensions",
      width: 130,
    },
    {
      title: "Required Length",
      dataIndex: "assigned_required_length",
      key: "assigned_required_length",
      width: 100,
      align: "right",
      render: (val) => val ? `${val} mm` : "—",
    },
    {
      title: "Status",
      dataIndex: "assigned_status",
      key: "assigned_status",
      width: 80,
      render: (status) => {
        if (status === "assigned") {
          return <span style={{ color: "#52c41a" }}>Assigned</span>;
        } else {
          return <span style={{ color: "#faad14" }}>Pending</span>;
        }
      },
    },
  ];


  return (
    <div style={{ padding: "16px", background: "#f5f7fa", minHeight: "100vh" }}>
      {/* KPI Cards */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          {
            title: "Total Orders",
            value: stats.total_orders || 0,
            icon: <ShoppingCartOutlined />,
            color: "#1890ff",
            bg: "#e6f7ff",
          },
          {
            title: "Parts with RM",
            value: stats.total_materials_assigned || 0,
            icon: <CheckCircleOutlined />,
            color: "#52c41a",
            bg: "#f6ffed",
          },
          {
            title: "Parts Pending RM",
            value: stats.total_materials_pending || 0,
            icon: <ExclamationCircleOutlined />,
            color: "#ff4d4f",
            bg: "#fff1f0",
          },
          {
            title: "Total Parts",
            value: stats.total_parts || 0,
            icon: <InboxOutlined />,
            color: "#722ed1",
            bg: "#f9f0ff",
          },
          {
            title: "Total Purchased Cost",
            value: `₹${(stats.total_purchased_cost || 0).toLocaleString()}`,
            icon: <FileTextOutlined />,
            color: "#fa8c16",
            bg: "#fff7e6",
          },
        ].map((s, i) => (
          <Col key={i} style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                background: "#fff",
                borderRadius: 10,
                padding: "12px 14px",
                border: `1px solid ${s.color}22`,
                boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: s.bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: s.color,
                  fontSize: 18,
                  marginBottom: 8,
                }}
              >
                {s.icon}
              </div>
              <div style={{ fontSize: 11, color: "#8c8c8c", marginBottom: 2 }}>{s.title}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#141414" }}>{s.value}</div>
            </div>
          </Col>
        ))}
      </Row>

      {/* Filters */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[8, 8]} align="middle">
          <Col xs={24} sm={12} md={4}>
            <Input
              prefix={<SearchOutlined style={{ color: "#bfbfbf" }} />}
              placeholder="Search..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
              size="small"
            />
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Select
              placeholder="Project Number"
              allowClear
              value={filterOrder}
              onChange={setFilterOrder}
              style={{ width: "100%" }}
              size="small"
            >
              {(data?.orders || [])
                .map((o) => o.order_number)
                .filter(Boolean)
                .sort()
                .map((orderNumber) => (
                  <Option key={orderNumber} value={orderNumber}>
                    {orderNumber}
                  </Option>
                ))}
            </Select>
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Select
              placeholder="Required Raw Materials"
              allowClear
              value={filterRequiredMaterial}
              onChange={setFilterRequiredMaterial}
              style={{ width: "100%" }}
              size="small"
            >
              {Array.from(
                new Set(
                  (data?.orders || [])
                    .flatMap((o) => {
                      const materials = [];
                      o.materials?.forEach(material => {
                        material.parts?.forEach(part => {
                          if (part.extracted_material) {
                            materials.push(part.extracted_material);
                          }
                        });
                      });
                      return materials;
                    })
                    .filter(Boolean)
                )
              )
                .sort()
                .map((material) => (
                  <Option key={material} value={material}>
                    {material}
                  </Option>
                ))}
            </Select>
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Select
              placeholder="Procured Raw Materials"
              allowClear
              value={filterProcuredMaterial}
              onChange={setFilterProcuredMaterial}
              style={{ width: "100%" }}
              size="small"
            >
              {Array.from(
                new Set(
                  (data?.orders || [])
                    .flatMap((o) => {
                      const materials = [];
                      o.materials?.filter(m => m.source_type === "order").forEach(material => {
                        if (material.material_name) {
                          materials.push(material.material_name);
                        }
                      });
                      return materials;
                    })
                    .filter(Boolean)
                )
              )
                .sort()
                .map((material) => (
                  <Option key={material} value={material}>
                    {material}
                  </Option>
                ))}
            </Select>
          </Col>
          <Col xs={24} sm={12} md={8} style={{ textAlign: "right" }}>
            <RawMaterialSummaryPdfDownload orders={filteredOrders} />
          </Col>
        </Row>
      </Card>

      {/* Main Table */}
      <Card
        title="Raw Material Summary by Order"
        extra={<span style={{ color: "#666" }}>{filteredOrders.length} orders</span>}
      >
        <Spin spinning={loading}>
          {filteredOrders.length > 0 ? (
            <Table
              dataSource={filteredOrders}
              columns={tableColumns}
              rowKey="order_id"
              pagination={{
                current: ordersPagination.current,
                pageSize: ordersPagination.pageSize,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} orders`,
                pageSizeOptions: ['10', '20', '50', '100'],
                placement: 'bottom',
                responsive: true,
              }}
              onChange={(paginationConfig) => {
                setOrdersPagination({
                  current: paginationConfig.current,
                  pageSize: paginationConfig.pageSize,
                });
              }}
              scroll={{ x: 1400 }}
              size="small"
              bordered
            />
          ) : (
            <Empty description="No orders found matching your filters" />
          )}
        </Spin>
      </Card>

      {/* Order Detail Modal */}
      <Modal
        title={
          <Space>
            <UnorderedListOutlined />
            <span>Order Details - {selectedOrder?.order_number}</span>
          </Space>
        }
        open={detailModalVisible}
        onCancel={() => {
          setDetailModalVisible(false);
          setOrderDetailData(null);
          setSelectedOrder(null);
        }}
        width={1600}
        footer={null}
        style={{ top: 20 }}
      >
        <Spin spinning={loadingDetail}>
          {orderDetailData && (
            <div>
              {/* Order Info */}
              <Card size="small" style={{ marginBottom: 16 }}>
                <Row gutter={16}>
                  <Col span={6}>
                    <div style={{ fontSize: 11, color: "#8c8c8c" }}>Customer:</div>
                    <div style={{ fontWeight: 600 }}>{selectedOrder?.customer_name}</div>
                  </Col>
                  <Col span={6}>
                    <div style={{ fontSize: 11, color: "#8c8c8c" }}>Project Name:</div>
                    <div style={{ fontWeight: 600 }}>{selectedOrder?.product_name}</div>
                  </Col>
                  <Col span={6}>
                    <div style={{ fontSize: 11, color: "#8c8c8c" }}>Total Parts:</div>
                    <div style={{ fontWeight: 600 }}>{selectedOrder?.total_parts}</div>
                  </Col>
                  <Col span={6}>
                    <div style={{ fontSize: 11, color: "#8c8c8c" }}>RM Assignment:</div>
                    <div style={{ fontWeight: 600, color: "#52c41a" }}>
                      {selectedOrder?.parts_with_material}/{selectedOrder?.total_parts}
                    </div>
                  </Col>
                </Row>
              </Card>

              {/* Materials Table */}
              <div style={{ marginBottom: 12, fontWeight: 600 }}>Procured & Available Materials</div>
              <Row gutter={[8, 8]} style={{ marginBottom: 12 }}>
                <Col xs={24} sm={12} md={5}>
                  <Input
                    prefix={<SearchOutlined style={{ color: "#bfbfbf" }} />}
                    placeholder="Search material/part..."
                    value={detailSearchText}
                    onChange={(e) => setDetailSearchText(e.target.value)}
                    allowClear
                    size="small"
                  />
                </Col>
                <Col xs={24} sm={12} md={5}>
                  <Select
                    placeholder="Part Number"
                    allowClear
                    value={detailFilterPartNumber}
                    onChange={setDetailFilterPartNumber}
                    style={{ width: "100%" }}
                    size="small"
                  >
                    {Array.from(
                      new Set(
                        (orderDetailData?.materials || [])
                          .flatMap((m) => m.parts || [])
                          .map((p) => p.part_number)
                          .filter(Boolean)
                      )
                    )
                      .sort()
                      .map((partNumber) => (
                        <Option key={partNumber} value={partNumber}>
                          {partNumber}
                        </Option>
                      ))}
                  </Select>
                </Col>
                <Col xs={24} sm={12} md={5}>
                  <Select
                    placeholder="Material Name"
                    allowClear
                    value={detailFilterMaterial}
                    onChange={setDetailFilterMaterial}
                    style={{ width: "100%" }}
                    size="small"
                  >
                    {Array.from(
                      new Set(
                        (orderDetailData?.materials || [])
                          .map((m) => m.material_name)
                          .filter(Boolean)
                      )
                    )
                      .sort()
                      .map((material) => (
                        <Option key={material} value={material}>
                          {material}
                        </Option>
                      ))}
                  </Select>
                </Col>
                <Col xs={24} sm={12} md={5}>
                  <Select
                    placeholder="Source Type"
                    allowClear
                    value={detailFilterSourceType}
                    onChange={setDetailFilterSourceType}
                    style={{ width: "100%" }}
                    size="small"
                  >
                    <Option value="general">General</Option>
                    <Option value="order">Order</Option>
                  </Select>
                </Col>
                <Col xs={24} sm={12} md={4} style={{ textAlign: "right" }}>
                  <OrderMaterialsPdfDownload
                    materials={orderDetailData?.materials || []}
                    orderNumber={selectedOrder?.order_number}
                  />
                </Col>
              </Row>
              <Table
                dataSource={(orderDetailData.materials || []).filter((m) => {
                  if (detailSearchText) {
                    const q = detailSearchText.toLowerCase();
                    // Search in material fields
                    const materialMatches =
                      m.material_name?.toLowerCase().includes(q) ||
                      m.form_type?.toLowerCase().includes(q) ||
                      m.process_type?.toLowerCase().includes(q) ||
                      m.vendor_names?.toLowerCase().includes(q);
                    // Search in part fields
                    const partMatches = m.parts?.some(p =>
                      p.part_number?.toLowerCase().includes(q) ||
                      p.part_name?.toLowerCase().includes(q)
                    );
                    if (!materialMatches && !partMatches) return false;
                  }
                  if (detailFilterPartNumber) {
                    const hasPart = m.parts?.some(p =>
                      p.part_number?.toLowerCase().includes(detailFilterPartNumber.toLowerCase())
                    );
                    if (!hasPart) return false;
                  }
                  if (detailFilterMaterial) {
                    if (m.material_name !== detailFilterMaterial) return false;
                  }
                  if (detailFilterSourceType) {
                    if (m.source_type !== detailFilterSourceType) return false;
                  }
                  return true;
                })}
                columns={orderDetailColumns}
                rowKey={(record) => `${record.material_id}-${record.stock_id || 'general'}`}
                pagination={false}
                scroll={{ x: 1200 }}
                size="small"
                bordered
                expandable={{
                  expandedRowRender: (record) => {
                    const hasParts = record.parts && Array.isArray(record.parts) && record.parts.length > 0;
                    const isNotAssigned = record.material_name === "⚠ Not Assigned";
                    let partsToShow = record.parts || [];
                    
                    // If material has no parts, show parts not assigned to any material
                    if (!hasParts && orderDetailData?.unassigned_parts) {
                      partsToShow = orderDetailData.unassigned_parts;
                    }
                    
                    return (
                      <div style={{ padding: 0, background: "#fafafa", border: "1px solid #d9d9d9" }}>
                        <div style={{ marginBottom: 12, fontWeight: 600, borderBottom: "1px solid #d9d9d9", paddingBottom: 8, padding: "16px 24px 8px 24px" }}>
                          {isNotAssigned ? "Parts Not Assigned to Any Raw Material" : 
                           (hasParts ? "Parts Assigned to this Material" : "Parts Not Assigned to Any Raw Material")}
                        </div>
                        <div style={{ padding: "0 24px 16px 24px" }}>
                          <Table
                        dataSource={partsToShow.map(part => {
                          let unitDimensions = "";
                          // Only calculate dimensions if material is assigned
                          if (!isNotAssigned && hasParts) {
                            if (part.assigned_form_type === "Pipe") {
                              unitDimensions = `⌀${record.dimensions?.match(/⌀(\d+\.\d+\/\d+\.\d+)/)?.[1] || "—"} × ${part.assigned_required_length || 0}mm`;
                            } else if (part.assigned_form_type === "Round") {
                              unitDimensions = `⌀${record.dimensions?.match(/⌀(\d+\.\d+)/)?.[1] || "—"} × ${part.assigned_required_length || 0}mm`;
                            } else if (part.assigned_form_type === "Square") {
                              const dims = record.dimensions?.match(/(\d+\.\d+) × (\d+\.\d+) × (\d+\.\d+)/);
                              if (dims) {
                                unitDimensions = `${dims[1]} × ${dims[2]} × ${part.assigned_required_length || 0}mm`;
                              }
                            } else {
                              unitDimensions = `${record.dimensions || "—"} × ${part.assigned_required_length || 0}mm`;
                            }
                          } else {
                            unitDimensions = "—";
                          }
                          return {
                            ...part,
                            unit_dimensions: unitDimensions,
                          };
                        })}
                        columns={partDetailColumns}
                        rowKey="part_id"
                        pagination={false}
                        size="small"
                        scroll={{ x: 1100 }}
                        bordered
                        components={{
                          header: {
                            cell: (props) => (
                              <th {...props} style={{ ...props.style, borderTop: "1px solid #d9d9d9" }} />
                            ),
                          },
                        }}
                      />
                        </div>
                    </div>
                    );
                  },
                  rowExpandable: (record) => true,
                }}
              />
            </div>
          )}
        </Spin>
      </Modal>
    </div>
  );
};

// Wrap with AntApp context if used Customer Name
const RawMaterialSummaryTabWrapped = () => (
  <App>
    <RawMaterialSummaryTab />
  </App>
);

export default RawMaterialSummaryTabWrapped;
