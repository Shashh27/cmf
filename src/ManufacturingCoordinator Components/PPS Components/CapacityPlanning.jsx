import React, { useEffect, useState } from "react";
import {Card,DatePicker,Button,Row,Col,Typography,Spin,message,InputNumber,Select,Tag} from "antd";
import { ReloadOutlined, CalendarOutlined, SearchOutlined } from "@ant-design/icons";
import axios from "axios";
import dayjs from "dayjs";
import {ResponsiveContainer,BarChart,Bar,XAxis,YAxis,Tooltip,CartesianGrid,Legend} from "recharts";

import { SCHEDULING_API_BASE_URL } from "../Config/schedulingconfig.js";

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

// --- CUSTOM TICK COMPONENT ---
const CustomXAxisTick = ({ x, y, payload }) => {
  const label = payload.value;
  const truncatedLabel = label.length > 15 ? `${label.substring(0, 15)}...` : label;

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={16}
        textAnchor="end"
        fill="#666"
        transform="rotate(-35)"
        fontSize={12}
      >
        <title>{label}</title>
        {truncatedLabel}
      </text>
    </g>
  );
};

// --- CUSTOM TOOLTIP COMPONENT ---
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const dataItem = payload[0].payload;
    // Try different possible field names for workcenter
    const workcenterName = dataItem.work_center_name || dataItem.work_center || dataItem.workcenter || "N/A";
    
    return (
      <div
        style={{
          backgroundColor: "#fff",
          padding: "10px",
          border: "1px solid #ccc",
          borderRadius: "4px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        }}
      >
        <p style={{ fontWeight: "bold", marginBottom: 5 }}>{label}</p>
        <p style={{ margin: 0, color: "#1890ff" }}>
          Available: {dataItem.available_hours}h
        </p>
        <p style={{ margin: 0, color: "#52c41a" }}>
          Remaining: {dataItem.remaining_hours}h
        </p>
        <p style={{ margin: 0, color: "#8c8c8c", fontSize: "12px", marginTop: 5 }}>
          Workcenter: {workcenterName}
        </p>
      </div>
    );
  }
  return null;
};

const CapacityPlanning = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState(null);
  const [selectedWorkcenter, setSelectedWorkcenter] = useState(null);

  const [efficiency, setEfficiency] = useState(0.85);
  const [saving, setSaving] = useState(false);

  // Range presets
  const rangePresets = [
    { label: 'Today', value: [dayjs(), dayjs()] },
    { label: 'This Week', value: [dayjs().startOf('week'), dayjs().endOf('week')] },
    { label: 'This Month', value: [dayjs().startOf('month'), dayjs().endOf('month')] },
    { label: 'Last Month', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
  ];

  // ----------------------------
  // FETCH EFFICIENCY
  // ----------------------------
  const fetchEfficiency = async () => {
    try {
      const res = await axios.get(`${SCHEDULING_API_BASE_URL}/machine-utilization/efficiency`);
      setEfficiency(res.data.efficiency_factor);
    } catch {
      message.error("Failed to fetch efficiency");
    }
  };

  // ----------------------------
  // UPDATE EFFICIENCY
  // ----------------------------
  const updateEfficiency = async () => {
    try {
      setSaving(true);

      await axios.put(`${SCHEDULING_API_BASE_URL}/machine-utilization/efficiency`, {
        efficiency_factor: parseFloat(efficiency),
      });

      message.success("Efficiency updated");

      if (range) fetchRange();
      else fetchMonthly();

    } catch {
      message.error("Failed to update efficiency");
    } finally {
      setSaving(false);
    }
  };

  // ----------------------------
  // MONTH
  // ----------------------------
  const fetchMonthly = async () => {
    try {
      setLoading(true);
      const res = await axios.get(
        `${SCHEDULING_API_BASE_URL}/machine-utilization/machine-utilization`
      );
      setData(res.data);
      // Initialize range to current month
      setRange([dayjs().startOf('month'), dayjs().endOf('month')]);
    } catch {
      message.error("Failed to fetch utilization");
    } finally {
      setLoading(false);
    }
  };

  // ----------------------------
  // RANGE
  // ----------------------------
  const fetchRange = async () => {
    if (!range) return message.warning("Select date range");

    try {
      setLoading(true);

      const start_date = range[0].format("YYYY-MM-DD");
      const end_date = range[1].format("YYYY-MM-DD");

      const res = await axios.get(
        `${SCHEDULING_API_BASE_URL}/machine-utilization/machine-utilization/range`,
        { params: { start_date, end_date } }
      );

      setData(res.data);
    } catch {
      message.error("Failed range data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMonthly();
    fetchEfficiency();
  }, []);

  // Derived workcenters for dropdown
  const workcenters = [...new Set(data.map(item => 
    item.work_center_name || item.work_center || item.workcenter || "N/A"
  ))].sort();

  // Filtered data for chart
  const filteredData = selectedWorkcenter 
    ? data.filter(item => (item.work_center_name || item.work_center || item.workcenter || "N/A") === selectedWorkcenter)
    : data;

  return (
    <div style={{ padding: 20 }}>
      {/* <Title level={3}>Machine Capacity Planning</Title> */}

      {/* CONTROLS */}
      <Card style={{ marginBottom: 20 }}>
        <Row gutter={[16, 16]} align="bottom">

          {/* RANGE */}
          <Col xs={24} sm={12} md={5}>
            <Text strong style={{ display: "block", marginBottom: 8 }}>Select Date Range</Text>
            <RangePicker
              style={{ width: "100%" }}
              value={range}
              presets={rangePresets}
              format="DD-MM-YYYY"
              onChange={(val) => setRange(val)}
            />
          </Col>

          {/* RANGE BUTTON */}
          <Col xs={24} sm={12} md={2}>
            <Button type="primary" icon={<SearchOutlined />} onClick={fetchRange}>
              Get Data
            </Button>
          </Col>

          {/* WORKCENTER FILTER */}
          <Col xs={24} sm={12} md={5}>
            <Text strong style={{ display: "block", marginBottom: 8 }}>Filter by Workcenter</Text>
            <Select
              showSearch
              allowClear
              style={{ width: "100%" }}
              placeholder="Select Workcenter"
              onChange={setSelectedWorkcenter}
              value={selectedWorkcenter}
            >
              {workcenters.map(wc => (
                <Select.Option key={wc} value={wc}>{wc}</Select.Option>
              ))}
            </Select>
          </Col>

          {/* EFFICIENCY INPUT */}
          <Col xs={24} sm={12} md={4}>
            <Text strong style={{ display: "block", marginBottom: 8 }}>Efficiency Factor</Text>
            <div style={{ display: "flex", gap: 8 }}>
              <InputNumber
                style={{ width: "100%" }}
                min={0.1}
                max={1}
                step={0.01}
                value={efficiency}
                onChange={(val) => setEfficiency(val)}
              />
              <Button
                type="primary"
                loading={saving}
                onClick={updateEfficiency}
              >
                Update
              </Button>
            </div>
          </Col>

          {/* RANGE DISPLAY */}
          <Col xs={24} md={8} style={{ textAlign: "right" }}>
            {range && (
              <div style={{ paddingBottom: 5 }}>
                <Text type="secondary">Showing data for: </Text>
                <Tag color="blue" icon={<CalendarOutlined />} style={{ fontSize: '13px', padding: '2px 8px', marginRight: 0 }}>
                  {range[0].format("DD-MM-YYYY")} to {range[1].format("DD-MM-YYYY")}
                </Tag>
              </div>
            )}
          </Col>

        </Row>
      </Card>

      <Card>
  {loading ? (
    <div style={{ textAlign: "center", padding: 40 }}>
      <Spin size="large" />
    </div>
  ) : (

    //  SCROLLABLE WRAPPER
    <div style={{ overflowX: "auto" }}>
      <div style={{ width: Math.max(filteredData.length * 80, 800) }}>

        <ResponsiveContainer width="100%" height={420}>
          <BarChart data={filteredData}>
            <CartesianGrid strokeDasharray="3 3" />

            <XAxis
              dataKey="machine_make"
              interval={0}
              tick={<CustomXAxisTick />}
              height={100}
            />

            <YAxis />
            <Tooltip content={<CustomTooltip />} />
            <Legend />

            <Bar dataKey="available_hours" fill="#1890ff" />
            <Bar dataKey="remaining_hours" fill="#52c41a" />

          </BarChart>
        </ResponsiveContainer>

      </div>
    </div>

  )}
</Card>
</div>
  );
};

export default CapacityPlanning;
