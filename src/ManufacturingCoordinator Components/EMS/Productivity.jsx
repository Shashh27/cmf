import React, { useState, useEffect, useRef } from 'react';
import { Typography, Button, Space, Card, DatePicker, Modal, Progress } from 'antd';
import { ArrowLeftOutlined, ReloadOutlined, FileTextOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import moment from 'moment';
import { API_BASE_URL } from '../../Config/auth';
import Report from './Reportnew';
import { authFetch } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';

const { Title, Text } = Typography;

const formatEnergy = (value) =>
  Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatCompact = (value) => {
  const v = Number(value) || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(2);
};

const getGaugeMax = (value) => {
  const v = Number(value) || 0;
  if (v <= 0) return 100;
  if (v >= 1_000_000) {
    const m = v / 1_000_000;
    const steps = [0.4, 0.8, 1.2, 1.6, 2.0, 2.5, 3.0, 4.0, 5.0, 6.0, 8.0, 10.0];
    for (const step of steps) {
      if (m <= step) return step * 1_000_000;
    }
    return Math.ceil(m / 2) * 2 * 1_000_000;
  }
  if (v >= 1000) return Math.ceil(v / 400) * 400;
  return Math.max(40, Math.ceil(v * 1.25 / 10) * 10);
};

const formatAxisValue = (v) => `${Math.round(Number(v) || 0)}`;

const getEnergyMeterOptions = (value, maxEnergy) => ({
  backgroundColor: 'transparent',
  series: [{
    type: 'gauge',
    startAngle: 180,
    endAngle: 0,
    min: 0,
    max: maxEnergy,
    splitNumber: 5,
    radius: '110%',
    center: ['50%', '70%'],
    axisLine: {
      lineStyle: {
        width: 16,
        color: [
          [0.2, '#93c5fd'],
          [0.45, '#3b82f6'],
          [0.7, '#6366f1'],
          [1, '#ef4444'],
        ],
      },
    },
    progress: { show: false },
    pointer: {
      show: true,
      length: '58%',
      width: 5,
      itemStyle: {
        color: '#1f2937',
        shadowBlur: 4,
        shadowColor: 'rgba(0,0,0,0.3)',
      },
    },
    axisTick: {
      show: true,
      distance: -16,
      length: 5,
      splitNumber: 5,
      lineStyle: { color: '#94a3b8', width: 1 },
    },
    splitLine: {
      show: true,
      distance: -16,
      length: 12,
      lineStyle: { color: '#475569', width: 2 },
    },
    axisLabel: {
      distance: 20,
      fontSize: 8,
      color: '#475569',
      fontWeight: 600,
      formatter: formatAxisValue,
    },
    anchor: {
      show: true,
      size: 9,
      itemStyle: { color: '#1f2937', borderWidth: 2, borderColor: '#fff' },
    },
    detail: { show: false },
    data: [{ value: value || 0 }],
    animation: true,
    animationDuration: 900,
    animationEasing: 'cubicOut',
  }],
});

const EnergyMachineCard = ({ machine }) => {
  const total = Number(machine.energy || 0);
  const shift1 = Number(machine.first_shift || 0);
  const shift2 = Number(machine.second_shift || 0);
  const shiftTotal = shift1 + shift2;
  const shift1Pct = shiftTotal > 0 ? (shift1 / shiftTotal) * 100 : 0;
  const shift2Pct = shiftTotal > 0 ? (shift2 / shiftTotal) * 100 : 0;
  const gaugeMax = getGaugeMax(total);

  return (
    <Card
      style={{
        borderRadius: 14,
        height: '100%',
        background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
        border: '1px solid #e2e8f0',
        boxShadow: '0 4px 12px rgba(15, 23, 42, 0.07)',
        overflow: 'hidden',
      }}
      styles={{ body: { padding: '12px 0 0' } }}
    >
      <div style={{ padding: '0 12px' }}>
        <Text style={{
          fontSize: 15,
          fontWeight: 700,
          color: '#0f172a',
          display: 'block',
          lineHeight: 1.3,
          marginBottom: 10,
        }}>
          {machine.machine_name}
        </Text>
      </div>

      <div style={{
        height: 1,
        background: '#e2e8f0',
        marginBottom: 10,
      }} />

      <div
        className="energy-card-main"
        style={{
          display: 'grid',
          gridTemplateColumns: '0.85fr 1.25fr',
          gap: 6,
          alignItems: 'center',
          marginBottom: 8,
          padding: '0 12px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{
            fontSize: 9,
            fontWeight: 700,
            color: '#94a3b8',
            letterSpacing: 0.8,
            marginBottom: 4,
          }}>
            TOTAL ENERGY
          </div>
          <div style={{
            fontSize: 'clamp(14px, 1.6vw, 18px)',
            fontWeight: 800,
            color: '#0f172a',
            lineHeight: 1.15,
            wordBreak: 'break-word',
          }}>
            {formatEnergy(total)}
            <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginLeft: 3 }}>kWh</span>
          </div>
        </div>
        <div className="energy-card-gauge" style={{ height: 118, overflow: 'hidden' }}>
          <ReactECharts
            option={getEnergyMeterOptions(total, gaugeMax)}
            style={{ height: '100%', width: '100%' }}
            opts={{ renderer: 'svg' }}
          />
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 8,
        borderTop: '1px solid #e2e8f0',
        padding: '8px 12px 10px',
        background: 'rgba(255,255,255,0.65)',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
            <span style={{ width: 3, height: 12, background: '#3b82f6', borderRadius: 2 }} />
            <Text style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>Shift 1</Text>
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#111827', marginBottom: 2 }}>
            {formatEnergy(shift1)} <span style={{ fontSize: 9, color: '#64748b' }}>kWh</span>
          </div>
          <Progress
            percent={Math.round(shift1Pct)}
            showInfo={false}
            strokeColor="#3b82f6"
            trailColor="#eff6ff"
            size="small"
          />
          <div style={{ fontSize: 9, color: '#3b82f6', fontWeight: 600, marginTop: 1 }}>
            {shift1Pct.toFixed(1)}%
          </div>
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
            <span style={{ width: 3, height: 12, background: '#22c55e', borderRadius: 2 }} />
            <Text style={{ fontSize: 10, color: '#64748b', fontWeight: 500 }}>Shift 2</Text>
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#111827', marginBottom: 2 }}>
            {formatEnergy(shift2)} <span style={{ fontSize: 9, color: '#64748b' }}>kWh</span>
          </div>
          <Progress
            percent={Math.round(shift2Pct)}
            showInfo={false}
            strokeColor="#22c55e"
            trailColor="#f0fdf4"
            size="small"
          />
          <div style={{ fontSize: 9, color: '#22c55e', fontWeight: 600, marginTop: 1 }}>
            {shift2Pct.toFixed(1)}%
          </div>
        </div>
      </div>
    </Card>
  );
};

const Productivity = ({ onBack }) => {
  const { isAuthenticated, bootstrapping } = useAuth();
  const [selectedDateRange, setSelectedDateRange] = useState(null);
  const [fromDate, setFromDate] = useState(null);
  const [toDate, setToDate] = useState(null);
  const [isLive, setIsLive] = useState(true);
  const [machineData, setMachineData] = useState([]);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const prevDataRef = useRef([]);
  const [showReport, setShowReport] = useState(false);
  const [toPickerOpen, setToPickerOpen] = useState(false);

  const processRows = (rows) =>
    rows.map((machine) => ({
      id: machine.machine_id,
      machine_name: machine.machine_name,
      energy: parseFloat(machine.total_energy || 0),
      first_shift: parseFloat(machine.first_shift || 0),
      second_shift: parseFloat(machine.second_shift || 0),
      timestamp: machine.timestamp,
    }));

  const fetchLiveShiftwiseData = async () => {
    try {
      const response = await authFetch(`${API_BASE_URL}/energy-monitoring/shiftwise-energy/live`);
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data)) {
        const processedData = processRows(data);
        setMachineData(processedData);
        prevDataRef.current = processedData;
      }
      setIsDataLoading(false);
    } catch (error) {
      console.error('Error fetching live shiftwise data:', error);
      setIsDataLoading(false);
    }
  };

  const fetchHistoricalShiftwiseData = async (from, to) => {
    try {
      const response = await authFetch(
        `${API_BASE_URL}/energy-monitoring/shiftwise-energy/history?start_date=${from}&end_date=${to}`
      );
      if (!response.ok) {
        setMachineData([]);
        prevDataRef.current = [];
        setIsDataLoading(false);
        return;
      }
      const payload = await response.json();
      const rows = Array.isArray(payload) ? payload : (payload?.data || []);
      const processedData = processRows(rows);
      setMachineData(processedData);
      prevDataRef.current = processedData;
      setIsDataLoading(false);
    } catch (error) {
      console.error('Error fetching historical shiftwise data:', error);
      setMachineData([]);
      prevDataRef.current = [];
      setIsDataLoading(false);
    }
  };

  useEffect(() => {
    if (bootstrapping || !isAuthenticated || !isLive) return undefined;
    fetchLiveShiftwiseData();
    const interval = setInterval(fetchLiveShiftwiseData, 5000);
    return () => clearInterval(interval);
  }, [isLive, isAuthenticated, bootstrapping]);

  const loadHistoryForRange = async (from, to) => {
    try {
      setIsDataLoading(true);
      setSelectedDateRange([from, to]);
      setIsLive(false);
      await fetchHistoricalShiftwiseData(
        from.format('YYYY-MM-DD'),
        to.format('YYYY-MM-DD')
      );
    } catch (error) {
      console.error('Error loading historical range:', error);
      setMachineData([]);
      prevDataRef.current = [];
      setIsDataLoading(false);
    }
  };

  const handleFromDateChange = (date) => {
    setFromDate(date);
    if (date && toDate && toDate.isBefore(date, 'day')) {
      setToDate(null);
      setSelectedDateRange(null);
      setIsLive(true);
      setToPickerOpen(true);
    } else if (date && toDate && !toDate.isBefore(date, 'day')) {
      loadHistoryForRange(date, toDate);
    } else if (!date) {
      setToDate(null);
      setSelectedDateRange(null);
      setIsLive(true);
      setToPickerOpen(false);
    } else {
      setToPickerOpen(true);
    }
  };

  const handleToDateChange = (date) => {
    setToDate(date);
    setToPickerOpen(false);
    if (fromDate && date && !date.isBefore(fromDate, 'day')) {
      loadHistoryForRange(fromDate, date);
    } else if (!date) {
      setSelectedDateRange(null);
      setIsLive(true);
    }
  };

  const handleGoLive = () => {
    setIsDataLoading(true);
    setSelectedDateRange(null);
    setFromDate(null);
    setToDate(null);
    setToPickerOpen(false);
    setIsLive(true);
    setMachineData([]);
    prevDataRef.current = [];
    fetchLiveShiftwiseData();
  };

  const getDateRangeDisplay = () => {
    if (!selectedDateRange || selectedDateRange.length !== 2) return '';
    const [start, end] = selectedDateRange;
    if (start.format('YYYY-MM-DD') === end.format('YYYY-MM-DD')) {
      return start.format('MMM D, YYYY');
    }
    return `${start.format('MMM D')} – ${end.format('MMM D, YYYY')}`;
  };

  return (
    <div className="productivity-page" style={{ padding: '16px 20px', background: '#f5f7fa', minHeight: '100%', boxSizing: 'border-box' }}>
      <div className="productivity-toolbar" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        flexWrap: 'wrap',
        gap: 12,
        background: '#fff',
        padding: '12px 16px',
        borderRadius: 10,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Button
            type="text"
            icon={<ArrowLeftOutlined style={{ fontSize: 16 }} />}
            onClick={onBack}
            style={{ width: 36, height: 36, padding: 0 }}
          />
          <Title level={4} style={{ margin: 0, color: '#111827', fontWeight: 700, fontSize: 18 }}>
            {isLive ? 'Live Energy Monitoring' : `Historical Energy — ${getDateRangeDisplay()}`}
          </Title>
        </div>
        <Space size="middle" wrap>
          <DatePicker
            value={fromDate}
            onChange={handleFromDateChange}
            placeholder="From Date"
            format="YYYY-MM-DD"
            allowClear
            style={{ width: 140 }}
            disabledDate={(current) => current && current > moment().endOf('day')}
          />
          <DatePicker
            value={toDate}
            onChange={handleToDateChange}
            placeholder="To Date"
            format="YYYY-MM-DD"
            allowClear
            style={{ width: 140 }}
            disabled={!fromDate}
            open={toPickerOpen}
            onOpenChange={(open) => {
              if (!fromDate) {
                setToPickerOpen(false);
                return;
              }
              setToPickerOpen(open);
            }}
            disabledDate={(current) => {
              if (!current) return false;
              if (current > moment().endOf('day')) return true;
              if (fromDate && current.isBefore(fromDate, 'day')) return true;
              return false;
            }}
          />
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            onClick={handleGoLive}
            style={{
              backgroundColor: isLive ? '#22c55e' : '#64748b',
              borderColor: isLive ? '#16a34a' : '#475569',
            }}
          >
            Go Live
          </Button>
          <Button
            type="primary"
            icon={<FileTextOutlined />}
            onClick={() => setShowReport(true)}
            disabled={machineData.length === 0}
            style={{ backgroundColor: '#3b82f6', borderColor: '#2563eb' }}
          >
            View Report
          </Button>
          {isLive && !isDataLoading && (
            <div style={{
              background: '#22c55e',
              padding: '6px 14px',
              borderRadius: 20,
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              fontWeight: 600,
            }}>
              <div style={{
                width: 8,
                height: 8,
                background: 'white',
                borderRadius: '50%',
                animation: 'pulse 1.5s infinite',
              }} />
              <span>Live</span>
            </div>
          )}
        </Space>
      </div>

      {isDataLoading && (
        <div style={{ textAlign: 'center', padding: '40px 0', background: '#fff', borderRadius: 12 }}>
          <Text style={{ fontSize: 16, color: '#64748b' }}>
            {isLive ? 'Loading live energy data...' : 'Loading historical shift-wise data...'}
          </Text>
        </div>
      )}

      {!isDataLoading && selectedDateRange && machineData.length === 0 && (
        <div style={{ textAlign: 'center', padding: '80px 0', background: '#fff', borderRadius: 12 }}>
          <Text style={{ fontSize: 18, display: 'block', marginBottom: 16, color: '#64748b' }}>
            No shift-wise energy data for {getDateRangeDisplay()}
          </Text>
          <Button type="primary" icon={<ReloadOutlined />} onClick={handleGoLive}>
            Return to Live Data
          </Button>
        </div>
      )}

      {!isDataLoading && machineData.length > 0 && (
        <div className="productivity-grid">
          {machineData.map((machine) => (
            <EnergyMachineCard
              key={machine.id}
              machine={machine}
            />
          ))}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0% { opacity: 0.4; }
          50% { opacity: 1; }
          100% { opacity: 0.4; }
        }
        .productivity-page {
          width: 100%;
          max-width: 100%;
          overflow-x: hidden;
        }
        .productivity-toolbar {
          width: 100%;
        }
        .productivity-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 14px;
          width: 100%;
        }
        @media (max-width: 1600px) {
          .productivity-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        }
        @media (max-width: 1280px) {
          .productivity-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
        @media (max-width: 960px) {
          .productivity-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 600px) {
          .productivity-page { padding: 12px; }
          .productivity-grid { grid-template-columns: 1fr; }
          .energy-card-main {
            grid-template-columns: 1fr !important;
          }
          .energy-card-gauge {
            height: 130px !important;
          }
        }
      `}</style>

      <Modal
        title="Energy Consumption Report"
        open={showReport}
        onCancel={() => setShowReport(false)}
        footer={null}
        width="90%"
        style={{ top: 20 }}
      >
        <Report
          date={selectedDateRange ? selectedDateRange[0].format('YYYY-MM-DD') : moment().format('YYYY-MM-DD')}
          fromDate={selectedDateRange ? selectedDateRange[0].format('YYYY-MM-DD') : moment().format('YYYY-MM-DD')}
          toDate={selectedDateRange ? selectedDateRange[1].format('YYYY-MM-DD') : moment().format('YYYY-MM-DD')}
          machineData={machineData.map((machine) => ({
            ...machine,
            cost: parseFloat((machine.energy * 12.5).toFixed(2)),
            third_shift: 0,
          }))}
          returnPath="/manufacturing-coordinator/energy-monitoring"
        />
      </Modal>
    </div>
  );
};

export default Productivity;
