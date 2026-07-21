import React, { useEffect, useState, useCallback } from 'react';
import { Card, Row, Col, Typography, Spin, Badge, Space, Alert, Select, DatePicker, Button } from 'antd';
import { ThunderboltOutlined, SearchOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area } from 'recharts';
import dayjs from 'dayjs';
import { API_BASE_URL } from '../../Config/auth';
import { authFetch } from '../../api/client.js';

const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

const RealtimeGraph = ({ machineId, machineName }) => {
  const [parameters, setParameters] = useState(null);
  const [initialLoad, setInitialLoad] = useState(true);
  const [apiError, setApiError] = useState(null);
  const [selectedParameter, setSelectedParameter] = useState('avgPhaseVoltage');
  const [chartData, setChartData] = useState([]);
  const [chartError, setChartError] = useState(null);
  
  const [isLive, setIsLive] = useState(true);
  const [dateRange, setDateRange] = useState([
    dayjs().subtract(7, 'day'),
    dayjs()
  ]);
  const [chartLoading, setChartLoading] = useState(false);

  const handleLiveToggle = () => {
    setIsLive(!isLive);
    if (!isLive) {
      setChartData([]);
    }
  };

  const handleSubmitFilteredData = async () => {
    if (!selectedParameter || !dateRange || !dateRange[0] || !dateRange[1]) {
      setChartError("Please select a parameter and date range");
      return;
    }

    setChartLoading(true);
    setChartError(null);
    setChartData([]);
    setIsLive(false);

    try {
      const apiParamMap = {
        'phaseAVoltage': 'phase_a_voltage',
        'phaseBVoltage': 'phase_b_voltage',
        'phaseCVoltage': 'phase_c_voltage',
        'avgPhaseVoltage': 'avg_phase_voltage',
        'phaseACurrent': 'phase_a_current',
        'phaseBCurrent': 'phase_b_current',
        'phaseCCurrent': 'phase_c_current',
        'avgThreePhaseCurrent': 'avg_three_phase_current',
        'frequency': 'frequency',
        'totalInstantaneousPower': 'total_instantaneous_power',
        'activeEnergyDelivered': 'active_energy_delivered'
      };
      
      const apiParamName = apiParamMap[selectedParameter] || selectedParameter;

      const response = await authFetch(
        `${API_BASE_URL}/energy-monitoring/get_machine_history/${machineId}?start_time=${dateRange[0].format('YYYY-MM-DD 00:00:00')}&end_time=${dateRange[1].format('YYYY-MM-DD 23:59:59')}`
      );
      const data = await response.json();

      if (!data || !Array.isArray(data) || data.length === 0) {
        setChartError(`No data available for the selected date range`);
        setChartData([]);
        return;
      }

      const formattedData = data.map((point, index) => {
        let formattedTimestamp;
        try {
          const date = new Date(point.timestamp);
          formattedTimestamp = date.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit'
          });
        } catch (error) {
          formattedTimestamp = `Point ${index + 1}`;
        }
        
        const paramValue = point[apiParamName];
        let numericValue;
        
        if (typeof paramValue === 'string') {
          numericValue = parseFloat(paramValue);
        } else if (typeof paramValue === 'number') {
          numericValue = paramValue;
        } else {
          numericValue = getDefaultValue(selectedParameter);
        }
        
        return {
          key: index,
          timestamp: formattedTimestamp,
          rawTimestamp: point.timestamp,
          value: isNaN(numericValue) ? getDefaultValue(selectedParameter) : numericValue
        };
      });

      if (formattedData.length === 0) {
        setChartError(`No valid data points available`);
        setChartData([]);
      } else {
        setChartData(formattedData);
      }
    } catch (error) {
      console.error("Error in handleSubmitFilteredData:", error);
      setChartError(error.message || "Failed to fetch filtered history data");
      setChartData([]);
    } finally {
      setChartLoading(false);
    }
  };

  const getDefaultValue = useCallback((paramKey) => {
    switch(paramKey) {
      case 'phaseAVoltage':
      case 'phaseBVoltage':
      case 'phaseCVoltage':
      case 'avgPhaseVoltage':
        return 220;
      case 'phaseACurrent':
      case 'phaseBCurrent':
      case 'phaseCCurrent':
      case 'avgThreePhaseCurrent':
        return 10;
      case 'frequency':
        return 50;
      case 'totalInstantaneousPower':
        return 8;
      case 'activeEnergyDelivered':
        return 350;
      default:
        return 100;
    }
  }, []);

  const getParameterDisplayName = (paramKey) => {
    const parameterMap = {
      'phaseAVoltage': 'Phase A Voltage (V)',
      'phaseBVoltage': 'Phase B Voltage (V)',
      'phaseCVoltage': 'Phase C Voltage (V)',
      'avgPhaseVoltage': 'Avg Phase Voltage (V)',
      'phaseACurrent': 'Phase A Current (A)',
      'phaseBCurrent': 'Phase B Current (A)',
      'phaseCCurrent': 'Phase C Current (A)',
      'avgThreePhaseCurrent': 'Avg Current (A)',
      'frequency': 'Frequency (Hz)',
      'totalInstantaneousPower': 'Total Power (kW)',
      'activeEnergyDelivered': 'Energy Delivered (kWh)'
    };
    
    return parameterMap[paramKey] || paramKey;
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setApiError(null);
        const response = await authFetch(`${API_BASE_URL}/energy-monitoring/live_recent?machine_id=${machineId}`);
        const data = await response.json();
        
        if (data) {
          setParameters(data);
          setInitialLoad(false);
        }
      } catch (error) {
        console.error("Error fetching machine data:", error);
        setApiError(error.message || "Failed to fetch machine data");
      }
    };
    
    fetchData();
    
    if (isLive) {
      const interval = setInterval(fetchData, 5000);
      return () => clearInterval(interval);
    }
  }, [machineId, isLive]);

  useEffect(() => {
    if (isLive && selectedParameter && parameters) {
      const paramValue = parameters[mapParamName(selectedParameter)];
      let numericValue;
      
      if (typeof paramValue === 'string') {
        numericValue = parseFloat(paramValue);
      } else if (typeof paramValue === 'number') {
        numericValue = paramValue;
      } else {
        numericValue = getDefaultValue(selectedParameter);
      }
      
      if (numericValue !== undefined && !isNaN(numericValue)) {
        const now = new Date();
        const formattedTimestamp = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        const newDataPoint = {
          key: Date.now(),
          timestamp: formattedTimestamp,
          rawTimestamp: now.toISOString(),
          value: numericValue
        };
        
        setChartData(prevData => {
          const newData = [...prevData, newDataPoint];
          return newData.length > 20 ? newData.slice(-20) : newData;
        });
      }
    }
  }, [parameters, selectedParameter, getDefaultValue, isLive]);

  const mapParamName = (param) => {
    const map = {
      'phaseAVoltage': 'phase_a_voltage',
      'phaseBVoltage': 'phase_b_voltage',
      'phaseCVoltage': 'phase_c_voltage',
      'avgPhaseVoltage': 'avg_phase_voltage',
      'phaseACurrent': 'phase_a_current',
      'phaseBCurrent': 'phase_b_current',
      'phaseCCurrent': 'phase_c_current',
      'avgThreePhaseCurrent': 'avg_three_phase_current',
      'frequency': 'frequency',
      'totalInstantaneousPower': 'total_instantaneous_power',
      'activeEnergyDelivered': 'active_energy_delivered'
    };
    return map[param] || param;
  };

  const isDateRangeValid = () => {
    if (!dateRange || !dateRange[0] || !dateRange[1]) {
      return false;
    }
    return dateRange[0].isBefore(dateRange[1]) || dateRange[0].isSame(dateRange[1], 'day');
  };

  const isSubmitDisabled = () => {
    if (isLive) return true;
    if (!selectedParameter) return true;
    if (!isDateRangeValid()) return true;
    return false;
  };

  const getStatusInfo = (status) => {
    switch (status) {
      case 0: return { text: 'Off', color: '#94A3B8', badgeStatus: 'default', bgColor: '#F1F5F9' };
      case 1: return { text: 'Idle/On', color: '#eab308', badgeStatus: 'warning', bgColor: '#FEF9C3' };
      case 2: return { text: 'Production', color: '#22c55e', badgeStatus: 'success', bgColor: '#DCFCE7' };
      default: return { text: 'Unknown', color: '#64748B', badgeStatus: 'default', bgColor: '#F1F5F9' };
    }
  };

  const getValueColor = (value, min, max) => {
    if (value === undefined || value === null) return '#64748B';
    const percent = (value - min) / (max - min);
    if (percent < 0.33) return '#ef4444';
    if (percent < 0.66) return '#eab308';
    return '#22c55e';
  };

  const formatValue = (value, unit, precision = 2) => {
    if (value === undefined || value === null || isNaN(value) || typeof value !== 'number') {
      return '--';
    }
    try {
      return `${value.toFixed(precision)}${unit}`;
    } catch (error) {
      return `${value}${unit}`;
    }
  };

  if (initialLoad || !parameters) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px', flexDirection: 'column', gap: '16px' }}>
        <Spin size="large" />
        <Text type="secondary">Loading machine data...</Text>
      </div>
    );
  }

  const statusInfo = getStatusInfo(parameters.status || 0);

  return (
    <div style={{ padding: '0 4px' }}>
      <Card style={{ marginBottom: '8px', borderRadius: '6px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <Row justify="space-between" align="middle" style={{ marginBottom: '8px' }}>
          <Col xs={24} sm={16}>
            <Space align="center" wrap>
              <Badge status={statusInfo.badgeStatus} dot size="large" />
              <Title level={4} style={{ margin: 0, fontSize: '16px' }}>{machineName}</Title>
              <Text strong style={{ color: statusInfo.color, marginLeft: '4px', backgroundColor: statusInfo.bgColor, padding: '1px 6px', borderRadius: '4px', fontSize: '12px' }}>
                {statusInfo.text}
              </Text>
            </Space>
          </Col>
          <Col xs={24} sm={8}>
            <Space size="small" wrap style={{ justifyContent: 'flex-end' }}>
              <Text type="secondary" style={{ fontSize: '12px' }}>Updated: {new Date().toLocaleTimeString()}</Text>
            </Space>
          </Col>
        </Row>

        <Row gutter={[8, 8]}>
          <Col xs={24} sm={12} lg={6}>
            <Card style={{ borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', background: '#f0f9ff', height: '100%' }} bodyStyle={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                  <Text strong style={{ fontSize: '16px', color: '#3b82f6' }}>Average Voltage</Text>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: getValueColor(parameters.avg_phase_voltage, 200, 240), margin: '8px 0' }}>
                    {formatValue(parameters.avg_phase_voltage, 'V', 1)}
                  </div>
                </div>
                <div style={{ fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <Text>Phase A:</Text>
                    <Text strong style={{ color: getValueColor(parameters.phase_a_voltage, 200, 240) }}>{formatValue(parameters.phase_a_voltage, 'V')}</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <Text>Phase B:</Text>
                    <Text strong style={{ color: getValueColor(parameters.phase_b_voltage, 200, 240) }}>{formatValue(parameters.phase_b_voltage, 'V')}</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text>Phase C:</Text>
                    <Text strong style={{ color: getValueColor(parameters.phase_c_voltage, 200, 240) }}>{formatValue(parameters.phase_c_voltage, 'V')}</Text>
                  </div>
                </div>
              </div>
            </Card>
          </Col>

          <Col xs={24} sm={12} lg={6}>
            <Card style={{ borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', background: '#faf5ff', height: '100%' }} bodyStyle={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                  <Text strong style={{ fontSize: '16px', color: '#8b5cf6' }}>Average Current</Text>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: getValueColor(parameters.avg_three_phase_current, 5, 15), margin: '8px 0' }}>
                    {formatValue(parameters.avg_three_phase_current, 'A', 1)}
                  </div>
                </div>
                <div style={{ fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <Text>Phase A:</Text>
                    <Text strong style={{ color: getValueColor(parameters.phase_a_current, 5, 15) }}>{formatValue(parameters.phase_a_current, 'A')}</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <Text>Phase B:</Text>
                    <Text strong style={{ color: getValueColor(parameters.phase_b_current, 5, 15) }}>{formatValue(parameters.phase_b_current, 'A')}</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text>Phase C:</Text>
                    <Text strong style={{ color: getValueColor(parameters.phase_c_current, 5, 15) }}>{formatValue(parameters.phase_c_current, 'A')}</Text>
                  </div>
                </div>
              </div>
            </Card>
          </Col>

          <Col xs={24} sm={12} lg={6}>
            <Card style={{ borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', background: '#fff1f2', height: '100%' }} bodyStyle={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                  <Text strong style={{ fontSize: '16px', color: '#ef4444' }}>Power</Text>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: getValueColor(parameters.total_instantaneous_power, 0, 15), margin: '8px 0' }}>
                    {formatValue(parameters.total_instantaneous_power, 'kW', 1)}
                  </div>
                </div>
                <div style={{ fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text>Frequency:</Text>
                    <Text strong style={{ color: getValueColor(parameters.frequency, 49.8, 50.2) }}>{formatValue(parameters.frequency, 'Hz')}</Text>
                  </div>
                </div>
              </div>
            </Card>
          </Col>

          <Col xs={24} sm={12} lg={6}>
            <Card style={{ borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', background: '#f0fdf4', height: '100%' }} bodyStyle={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                  <Text strong style={{ fontSize: '16px', color: '#22c55e' }}>Energy</Text>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: getValueColor(parameters.active_energy_delivered, 100, 500), margin: '8px 0' }}>
                    {formatValue(parameters.active_energy_delivered, 'kWh', 1)}
                  </div>
                </div>
                <div style={{ fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text>Today's Usage:</Text>
                    <Text strong style={{ color: getValueColor(parameters.active_energy_delivered, 100, 500) }}>{formatValue(parameters.active_energy_delivered, 'kWh')}</Text>
                  </div>
                </div>
              </div>
            </Card>
          </Col>
        </Row>
      </Card>

      <Card style={{ borderRadius: '6px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '8px' }}>
        <Row justify="space-between" align="middle" style={{ marginBottom: '8px' }}>
          <Col xs={24} sm={12}>
            <Title level={4} style={{ margin: 0, fontSize: '16px' }}>{isLive ? 'Live Production Timeline' : 'Historical Production Timeline'}</Title>
            <Text type="secondary" style={{ fontSize: '12px' }}>{machineName}</Text>
          </Col>
          <Col xs={24} sm={12}>
            <Space size="small" wrap style={{ justifyContent: 'flex-end' }}>
              <Select style={{ width: '180px' }} placeholder="Select Parameter" value={selectedParameter} onChange={setSelectedParameter} allowClear={false} size="small">
                <Option value="phaseAVoltage">Phase A Voltage</Option>
                <Option value="phaseBVoltage">Phase B Voltage</Option>
                <Option value="phaseCVoltage">Phase C Voltage</Option>
                <Option value="avgPhaseVoltage">Avg Phase Voltage</Option>
                <Option value="phaseACurrent">Phase A Current</Option>
                <Option value="phaseBCurrent">Phase B Current</Option>
                <Option value="phaseCCurrent">Phase C Current</Option>
                <Option value="avgThreePhaseCurrent">Avg Current</Option>
                <Option value="frequency">Frequency</Option>
                <Option value="totalInstantaneousPower">Total Power</Option>
                <Option value="activeEnergyDelivered">Energy Delivered</Option>
              </Select>
              <RangePicker style={{ width: '240px' }} onChange={setDateRange} value={dateRange} allowClear={false} disabled={isLive} size="small" />
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSubmitFilteredData} disabled={isSubmitDisabled()} loading={chartLoading} size="small">Submit</Button>
              <Button type={isLive ? "primary" : "default"} icon={<PlayCircleOutlined />} style={{ ...(isLive && { backgroundColor: '#22c55e', borderColor: '#22c55e' }) }} onClick={handleLiveToggle} size="small">{isLive ? 'Live' : 'Go Live'}</Button>
            </Space>
          </Col>
        </Row>
        <div style={{ padding: '8px', background: '#f8fafc', borderRadius: '4px', minHeight: '250px', border: '1px solid #e2e8f0' }}>
          {chartLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '250px' }}>
              <Spin size="large" />
            </div>
          ) : chartError ? (
            <Alert message="No Data Available" description={chartError} type="info" showIcon style={{ margin: '16px', textAlign: 'center' }} />
          ) : chartData.length > 0 ? (
            <>
              <div style={{ marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text strong style={{ fontSize: '12px' }}>{selectedParameter && getParameterDisplayName(selectedParameter)}</Text>
              </div>
              <ResponsiveContainer width="100%" height={250} minHeight={250}>
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }} style={{ overflow: 'visible' }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#8884d8" stopOpacity={0.2}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="timestamp" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#64748b' }} tickLine={{ stroke: '#64748b' }} allowDataOverflow={false} padding={{ left: 10, right: 10 }} tickMargin={5} />
                  <YAxis label={{ value: getParameterDisplayName(selectedParameter).split(' ')[0], angle: -90, position: 'insideLeft', offset: 0, fontSize: 11, fill: '#64748b' }} domain={['auto', 'auto']} tickFormatter={(value) => value.toFixed(1)} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#64748b' }} tickLine={{ stroke: '#64748b' }} allowDataOverflow={false} padding={{ top: 10, bottom: 10 }} tickMargin={5} />
                  <Tooltip formatter={(value) => [`${value.toFixed(2)} ${getParameterDisplayName(selectedParameter).split('(')[1]?.replace(')', '') || ''}`, getParameterDisplayName(selectedParameter).split(' ')[0]]} labelFormatter={(label) => `Time: ${label}`} contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', padding: '8px' }} isAnimationActive={false} cursor={{ stroke: '#64748b', strokeWidth: 1, strokeDasharray: '5 5' }} />
                  <Legend wrapperStyle={{ paddingTop: '5px', fontSize: '12px' }} formatter={(value) => <span style={{ color: '#64748b' }}>{value}</span>} iconSize={8} verticalAlign="bottom" height={20} />
                  <Line type="stepAfter" dataKey="value" stroke="#8884d8" strokeWidth={2} activeDot={{ r: 5, fill: '#8884d8', stroke: '#fff', strokeWidth: 2 }} dot={{ r: 2.5, fill: '#8884d8', strokeWidth: 0 }} name={getParameterDisplayName(selectedParameter)} isAnimationActive={false} connectNulls />
                  <Area type="stepAfter" dataKey="value" stroke="none" fillOpacity={0.5} fill="url(#colorValue)" isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '250px', color: '#666' }}>
              <Text type="secondary" style={{ fontSize: '14px', marginBottom: '4px' }}>{isLive ? 'Waiting for live data...' : 'Select dates and click Submit to view historical data'}</Text>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default React.memo(RealtimeGraph);