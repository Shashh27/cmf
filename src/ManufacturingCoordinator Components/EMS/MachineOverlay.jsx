import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Button, Typography, Card, Row, Col, Spin, Select, DatePicker, Switch, Empty, Alert } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import { API_BASE_URL } from '../../Config/auth';
import { authFetch } from '../../api/client.js';

const { Title } = Typography;

const PARAMETER_OPTIONS = [
  { value: 'phase_a_voltage', label: 'Phase A Voltage (V)' },
  { value: 'phase_b_voltage', label: 'Phase B Voltage (V)' },
  { value: 'phase_c_voltage', label: 'Phase C Voltage (V)' },
  { value: 'avg_phase_voltage', label: 'Average Phase Voltage (V)' },
  { value: 'phase_a_current', label: 'Phase A Current (A)' },
  { value: 'phase_b_current', label: 'Phase B Current (A)' },
  { value: 'phase_c_current', label: 'Phase C Current (A)' },
  { value: 'avg_three_phase_current', label: 'Average Three Phase Current (A)' },
  { value: 'frequency', label: 'Frequency (Hz)' },
  { value: 'total_instantaneous_power', label: 'Total Instantaneous Power (kW)' },
  { value: 'active_energy_delivered', label: 'Active Energy Delivered (kWh)' }
];

const ParameterCard = ({ title, value, unit, color }) => {
  const numeric = Number(value);
  const display = Number.isFinite(numeric) ? numeric.toFixed(2) : '--';
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        background: '#fff',
        borderRadius: 4,
        borderLeft: `3px solid ${color}`,
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        marginBottom: 0,
      }}
    >
      <span style={{ fontSize: 12, color: '#666', fontWeight: 500 }}>{title}</span>
      <span style={{ fontSize: 12, color, fontWeight: 700, whiteSpace: 'nowrap' }}>
        {display}{unit}
      </span>
    </div>
  );
};

const MemoizedChart = React.memo(({ options }) => (
  <ReactECharts
    option={options}
    style={{ height: '100%', width: '100%' }}
    opts={{ renderer: 'svg' }}
    notMerge
    lazyUpdate
  />
));

const TimelineControls = React.memo(({
  selectedParameter,
  onParameterChange,
  isLive,
  startTime,
  endTime,
  onDateChange,
  onLiveToggle,
}) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
      gap: 10,
      flexWrap: 'nowrap',
    }}
  >
    <Title level={5} style={{ margin: 0, fontSize: 14, whiteSpace: 'nowrap' }}>
      Production Timeline
    </Title>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
      <Select
        style={{ width: 190 }}
        value={selectedParameter}
        onChange={onParameterChange}
        options={PARAMETER_OPTIONS}
        size="small"
      />
      {!isLive && (
        <DatePicker.RangePicker
          showTime
          format="YYYY-MM-DD HH:mm"
          value={[startTime, endTime]}
          onChange={onDateChange}
          size="small"
          style={{ width: 400, minWidth: 400 }}
          popupStyle={{ minWidth: 420 }}
          disabledDate={(current) => current && current > dayjs().endOf('day')}
        />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12 }}>Live</span>
        <Switch checked={isLive} onChange={onLiveToggle} size="small" />
      </div>
    </div>
  </div>
));

const ParamGroupCard = ({ title, titleColor, borderColor, bg, headBg, children }) => (
  <Card
    size="small"
    title={<span style={{ fontSize: 13, fontWeight: 700, color: titleColor }}>{title}</span>}
    styles={{
      body: { padding: '8px' },
      header: {
        minHeight: 32,
        padding: '6px 10px',
        background: headBg,
        borderBottom: `2px solid ${borderColor}`,
      },
    }}
    style={{
      height: '100%',
      background: bg,
      border: `1px solid ${borderColor}`,
      boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
      borderRadius: 8,
    }}
  >
    {children}
  </Card>
);

const MachineOverlay = ({ machineId, machineName, onBack }) => {
  const [selectedParameter, setSelectedParameter] = useState('phase_b_voltage');
  const [isLive, setIsLive] = useState(true);
  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);
  const [machineParameters, setMachineParameters] = useState(null);
  const [displayName, setDisplayName] = useState(machineName || null);
  const [parameterHistoryData, setParameterHistoryData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const pollingRef = useRef(null);
  const lastLiveTimestampRef = useRef(null);

  const formatLiveTimestamp = (isoTimestamp) => {
    if (!isoTimestamp) return null;
    const date = new Date(isoTimestamp);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  };

  useEffect(() => {
    setDisplayName(machineName || null);
  }, [machineName, machineId]);

  useEffect(() => {
    lastLiveTimestampRef.current = null;
    setParameterHistoryData([]);
    setMachineParameters(null);
    setIsLoading(true);

    const fetchParameters = async () => {
      try {
        const response = await authFetch(`${API_BASE_URL}/energy-monitoring/live_recent?machine_id=${machineId}`);
        if (!response.ok) {
          setMachineParameters(null);
          setIsLoading(false);
          return;
        }
        const data = await response.json();
        if (data?.machine_name) {
          setDisplayName(data.machine_name);
        }
        setMachineParameters(data?.offline ? null : data);
        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching parameters:', error);
        setIsLoading(false);
      }
    };

    fetchParameters();
    pollingRef.current = setInterval(fetchParameters, 5000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [machineId]);

  useEffect(() => {
    const fetchParameterHistory = async () => {
      if (!isLive && startTime && endTime) {
        try {
          const response = await authFetch(
            `${API_BASE_URL}/energy-monitoring/get_machine_history/${machineId}?start_time=${startTime.format('YYYY-MM-DD HH:mm:ss')}&end_time=${endTime.format('YYYY-MM-DD HH:mm:ss')}`
          );
          const data = await response.json();
          const paramData = (Array.isArray(data) ? data : []).map((item) => ({
            timestamp: formatLiveTimestamp(item.timestamp) || item.timestamp,
            rawTimestamp: item.timestamp,
            value: item[selectedParameter] ?? null,
          })).filter((d) => d.value !== null && d.value !== undefined && !Number.isNaN(Number(d.value)));
          setParameterHistoryData(paramData);
        } catch (error) {
          console.error('Error fetching parameter history:', error);
          setParameterHistoryData([]);
        }
      }
    };

    fetchParameterHistory();
  }, [machineId, selectedParameter, isLive, startTime, endTime]);

  useEffect(() => {
    if (!isLive || !machineParameters?.timestamp) return;

    const rawTimestamp = machineParameters.timestamp;
    if (lastLiveTimestampRef.current === rawTimestamp) return;

    const value = machineParameters[selectedParameter];
    if (value === null || value === undefined || Number.isNaN(Number(value))) return;

    const label = formatLiveTimestamp(rawTimestamp);
    if (!label) return;

    lastLiveTimestampRef.current = rawTimestamp;
    setParameterHistoryData((prev) => {
      const next = [...prev, { timestamp: label, rawTimestamp, value: Number(value) }];
      return next.length > 50 ? next.slice(-50) : next;
    });
  }, [machineParameters, selectedParameter, isLive]);

  const handleParameterChange = useCallback((value) => {
    setSelectedParameter(value);
    if (isLive) {
      lastLiveTimestampRef.current = null;
      setParameterHistoryData([]);
    }
  }, [isLive]);

  const handleLiveToggle = useCallback((checked) => {
    setIsLive(checked);
    lastLiveTimestampRef.current = null;
    setParameterHistoryData([]);
    if (checked) {
      setStartTime(null);
      setEndTime(null);
    }
  }, []);

  const handleDateChange = useCallback((dates) => {
    if (dates && dates.length === 2) {
      setStartTime(dates[0]);
      setEndTime(dates[1]);
    } else {
      setStartTime(null);
      setEndTime(null);
    }
  }, []);

  const chartOptions = useMemo(() => {
    const selectedParam = PARAMETER_OPTIONS.find((p) => p.value === selectedParameter);
    const unit = selectedParam ? selectedParam.label.match(/\((.*?)\)/)?.[1] || '' : '';
    const pointCount = parameterHistoryData.length;
    const maxLabels = isLive ? 12 : 8;
    const labelInterval = pointCount > maxLabels
      ? Math.max(0, Math.ceil(pointCount / maxLabels) - 1)
      : 0;
    const hasData = pointCount > 0;

    return {
      graphic: hasData
        ? []
        : [{
            type: 'text',
            left: 'center',
            top: 'middle',
            style: {
              text: isLive
                ? 'No live data for the selected machine'
                : 'No data available for the selected time range',
              fontSize: 14,
              fontWeight: 'bold',
              fill: '#999',
            },
          }],
      grid: {
        top: 36,
        right: 16,
        bottom: isLive ? 36 : 28,
        left: 48,
        containLabel: true,
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#ccc',
        borderWidth: 1,
        textStyle: { color: '#333', fontSize: 12, fontWeight: 'bold' },
        formatter(params) {
          const param = params[0];
          return `<div style="font-weight: bold; margin-bottom: 4px;">${param.name}</div>
                  <div style="display: flex; align-items: center;">
                    <span style="display: inline-block; width: 10px; height: 10px; background: #1890ff; margin-right: 8px;"></span>
                    <span>${param.value} ${unit}</span>
                  </div>`;
        },
      },
      xAxis: {
        type: 'category',
        data: parameterHistoryData.map((d) => d.timestamp),
        axisLabel: {
          fontSize: 10,
          color: '#666',
          rotate: pointCount > 20 ? 35 : 0,
          margin: 8,
          fontWeight: 600,
          interval: labelInterval,
          hideOverlap: true,
        },
        axisLine: { lineStyle: { color: '#666', width: 1 } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          fontSize: 10,
          color: '#666',
          fontWeight: 600,
          formatter: `{value} ${unit}`,
        },
        splitLine: { lineStyle: { color: '#eee', type: 'solid', width: 1 } },
        axisLine: { show: true, lineStyle: { color: '#666', width: 1 } },
        axisTick: { show: false },
      },
      series: [{
        name: selectedParam?.label || selectedParameter,
        type: 'line',
        step: 'middle',
        data: parameterHistoryData.map((d) => d.value),
        smooth: false,
        symbol: 'none',
        sampling: 'lttb',
        itemStyle: { color: '#1890ff' },
        lineStyle: { width: 2, color: '#1890ff' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(24, 144, 255, 0.2)' },
              { offset: 1, color: 'rgba(24, 144, 255, 0.05)' },
            ],
          },
        },
      }],
      animation: true,
      animationDuration: 300,
      animationEasing: 'cubicInOut',
      dataZoom: isLive
        ? [
            { type: 'inside', start: 0, end: 100 },
            {
              type: 'slider',
              start: 0,
              end: 100,
              height: 14,
              bottom: 0,
              borderColor: 'transparent',
              backgroundColor: '#f0f2f5',
              fillerColor: 'rgba(24, 144, 255, 0.1)',
              handleStyle: { color: '#1890ff', borderColor: '#1890ff' },
              moveHandleStyle: { color: '#1890ff', borderColor: '#1890ff' },
            },
          ]
        : [{ type: 'inside', start: 0, end: 100 }],
    };
  }, [selectedParameter, parameterHistoryData, isLive]);

  const hasLiveData = Boolean(machineParameters && !machineParameters.offline && machineParameters.timestamp);
  const titleName = displayName || machineName || `Machine ${machineId}`;

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div
      style={{
        padding: '8px 16px 8px 10px',
        background: '#f0f2f5',
        height: '100%',
        width: '100%',
        maxWidth: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
          flexShrink: 0,
        }}
      >
        <Button
          type="text"
          size="small"
          icon={<ArrowLeftOutlined style={{ fontSize: 16 }} />}
          onClick={onBack}
          style={{ padding: '0 4px', height: 32, width: 32 }}
        />
        <Title level={4} style={{ margin: 0, fontSize: 22, lineHeight: 1.25, fontWeight: 700 }}>
          {titleName}
        </Title>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          width: '100%',
          maxWidth: '100%',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          background: 'white',
          borderRadius: 8,
          padding: '10px 12px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ flexShrink: 0 }}>
          {!hasLiveData ? (
            <Alert
              type="warning"
              showIcon
              message="No live data for the selected machine"
              description={`${titleName} has no live EMS row. Turn Live off and pick a date range for history.`}
              style={{ marginBottom: 0, padding: '4px 10px' }}
            />
          ) : (
            <Row gutter={[10, 8]}>
              <Col span={8}>
                <ParamGroupCard
                  title="Voltage Parameters"
                  titleColor="#6b4e8f"
                  borderColor="#6b4e8f"
                  bg="linear-gradient(to bottom right, #f5f3f8 0%, #f8f9fa 100%)"
                  headBg="rgba(107, 78, 143, 0.1)"
                >
                  <Row gutter={[6, 6]}>
                    <Col span={12}><ParameterCard title="Phase A V" value={machineParameters?.phase_a_voltage} unit="V" color="#722ed1" /></Col>
                    <Col span={12}><ParameterCard title="Phase B V" value={machineParameters?.phase_b_voltage} unit="V" color="#722ed1" /></Col>
                    <Col span={12}><ParameterCard title="Phase C V" value={machineParameters?.phase_c_voltage} unit="V" color="#722ed1" /></Col>
                    <Col span={12}><ParameterCard title="Avg Phase V" value={machineParameters?.avg_phase_voltage} unit="V" color="#722ed1" /></Col>
                  </Row>
                </ParamGroupCard>
              </Col>
              <Col span={8}>
                <ParamGroupCard
                  title="Current Parameters"
                  titleColor="#8c6d3f"
                  borderColor="#8c6d3f"
                  bg="linear-gradient(to bottom right, #f8f6f2 0%, #f9f7f5 100%)"
                  headBg="rgba(140, 109, 63, 0.1)"
                >
                  <Row gutter={[6, 6]}>
                    <Col span={12}><ParameterCard title="Phase A A" value={machineParameters?.phase_a_current} unit="A" color="#fa8c16" /></Col>
                    <Col span={12}><ParameterCard title="Phase B A" value={machineParameters?.phase_b_current} unit="A" color="#fa8c16" /></Col>
                    <Col span={12}><ParameterCard title="Phase C A" value={machineParameters?.phase_c_current} unit="A" color="#fa8c16" /></Col>
                    <Col span={12}><ParameterCard title="Avg 3P A" value={machineParameters?.avg_three_phase_current} unit="A" color="#fa8c16" /></Col>
                  </Row>
                </ParamGroupCard>
              </Col>
              <Col span={8}>
                <ParamGroupCard
                  title="Power & Frequency"
                  titleColor="#4a6b8a"
                  borderColor="#4a6b8a"
                  bg="linear-gradient(to bottom right, #f2f5f8 0%, #f5f7f9 100%)"
                  headBg="rgba(74, 107, 138, 0.1)"
                >
                  <Row gutter={[6, 6]}>
                    <Col span={12}><ParameterCard title="Frequency" value={machineParameters?.frequency} unit="Hz" color="#2f54eb" /></Col>
                    <Col span={12}><ParameterCard title="Total Power" value={machineParameters?.total_instantaneous_power} unit="kW" color="#52c41a" /></Col>
                    <Col span={24}><ParameterCard title="Energy Delivered" value={machineParameters?.active_energy_delivered} unit="kWh" color="#52c41a" /></Col>
                  </Row>
                </ParamGroupCard>
              </Col>
            </Row>
          )}
        </div>

        <Card
          size="small"
          styles={{ body: { padding: 10, height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' } }}
          style={{
            flex: 1,
            minHeight: 0,
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxSizing: 'border-box',
          }}
        >
          <TimelineControls
            selectedParameter={selectedParameter}
            onParameterChange={handleParameterChange}
            isLive={isLive}
            startTime={startTime}
            endTime={endTime}
            onDateChange={handleDateChange}
            onLiveToggle={handleLiveToggle}
          />
          <div style={{ flex: 1, minHeight: 0, width: '100%' }}>
            {!hasLiveData && isLive ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No live data" style={{ marginTop: 40 }} />
            ) : (
              <MemoizedChart options={chartOptions} />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default React.memo(MachineOverlay);
