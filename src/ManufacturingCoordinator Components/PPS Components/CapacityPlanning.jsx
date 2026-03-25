import React, { useEffect, useState } from "react";
import {
  Card,
  DatePicker,
  Button,
  Row,
  Col,
  Typography,
  Spin,
  message,
  InputNumber
} from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import axios from "axios";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

import { SCHEDULING_API_BASE_URL } from "../Config/schedulingconfig.js";

const { Title } = Typography;
const { RangePicker } = DatePicker;

const CapacityPlanning = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState(null);

  const [efficiency, setEfficiency] = useState(0.85);
  const [saving, setSaving] = useState(false);

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

  return (
    <div style={{ padding: 20 }}>
      <Title level={3}>Machine Capacity Planning</Title>

      {/* CONTROLS */}
      <Card style={{ marginBottom: 20 }}>
        <Row gutter={[12, 12]} align="middle">

          {/* RANGE */}
          <Col xs={24} sm={12} md={6}>
            <RangePicker
              style={{ width: "100%" }}
              onChange={(val) => setRange(val)}
            />
          </Col>

          {/* RANGE BUTTON */}
          <Col xs={24} sm={12} md={4}>
            <Button block type="primary" onClick={fetchRange}>
              Get Range Data
            </Button>
          </Col>

          {/* CURRENT MONTH */}
          <Col xs={24} sm={12} md={4}>
            <Button block icon={<ReloadOutlined />} onClick={fetchMonthly}>
              Current Month
            </Button>
          </Col>

          {/* EFFICIENCY INPUT */}
          <Col xs={24} sm={12} md={6}>
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

        </Row>
      </Card>

      CHART
      <Card>
  {loading ? (
    <div style={{ textAlign: "center", padding: 40 }}>
      <Spin size="large" />
    </div>
  ) : (

    // 🔥 SCROLLABLE WRAPPER
    <div style={{ overflowX: "auto" }}>
      <div style={{ width: data.length * 80 }}>

        <ResponsiveContainer width="100%" height={420}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />

            <XAxis
              dataKey="machine_make"
              interval={0}
              angle={-35}
              textAnchor="end"
              height={80}
            />

            <YAxis />
            <Tooltip />
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
      {/* <Card>
        {loading ? (
          <div style={{ textAlign: "center", padding: 40 }}>
            <Spin size="large" />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={420}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="machine_make" 
                angle={-35} 
                textAnchor="end"
                interval={0}
                height={80}
              />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="available_hours" fill="#1890ff" />
              <Bar dataKey="remaining_hours" fill="#52c41a" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}; */}

export default CapacityPlanning;
