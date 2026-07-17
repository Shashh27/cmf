import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Tabs, Button, Typography, Card, Row, Col, Statistic, Spin, Select, DatePicker, Switch } from 'antd';
import { ArrowLeftOutlined, LineChartOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { API_BASE_URL } from '../../Config/auth';
import dayjs from 'dayjs';

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

const ParameterCard = ({ title, value, unit, color }) => (
  <Card 
    size="small" 
    style={{ 
      marginBottom: '2px',
      borderRadius: '4px',
      borderLeft: `2px solid ${color}`,
      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
      padding: '4px 8px'
    }}
  >
    <div style={{ 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center',
      gap: '8px'
    }}>
      <span style={{ 
        fontSize: '12px', 
        color: '#666',
        fontWeight: '500'
      }}>
        {title}
      </span>
      <span style={{ 
        fontSize: '12px',
        color: color,
        fontWeight: 'bold'
      }}>
        {value.toFixed(2)}{unit}
      </span>
    </div>
  </Card>
);

const MemoizedChart = React.memo(({ options }) => {
  return (
    <ReactECharts
      option={options}
      style={{ height: '100%', width: '100%' }}
      opts={{ renderer: 'svg' }}
      notMerge={false}
    />
  );
});

const TimelineControls = React.memo(({ 
  selectedParameter, 
  onParameterChange, 
  isLive, 
  startTime, 
  endTime, 
  onDateChange, 
  onLiveToggle 
}) => (
  <div style={{ 
    display: 'flex', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    marginBottom: '4px',
    gap: '8px'
  }}>
    <Title level={5} style={{ margin: 0, fontSize: '14px' }}>Production Timeline</Title>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <Select
        style={{ width: '180px' }}
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
          style={{ width: '300px' }}
        />
      )}
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span style={{ fontSize: '12px' }}>Live</span>
        <Switch
          checked={isLive}
          onChange={onLiveToggle}
          size="small"
        />
      </div>
    </div>
  </div>
));

const MachineOverlay = ({ machineId, machineName, onBack }) => {
  const [activeTab, setActiveTab] = useState('1');
  const [selectedParameter, setSelectedParameter] = useState('phase_b_voltage');
  const [isLive, setIsLive] = useState(true);
  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);
  const [machineParameters, setMachineParameters] = useState(null);
  const [parameterHistoryData, setParameterHistoryData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const pollingRef = useRef(null);

  useEffect(() => {
    const fetchParameters = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/energy-monitoring/live_recent?machine_id=${machineId}`);
        const data = await response.json();
        setMachineParameters(data);
        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching parameters:', error);
        setIsLoading(false);
      }
    };

    fetchParameters();
    pollingRef.current = setInterval(fetchParameters, 5000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [machineId]);

  useEffect(() => {
    const fetchParameterHistory = async () => {
      if (!isLive && startTime && endTime) {
        try {
          const response = await fetch(
            `${API_BASE_URL}/energy-monitoring/get_machine_history/${machineId}?start_time=${startTime.format('YYYY-MM-DD HH:mm:ss')}&end_time=${endTime.format('YYYY-MM-DD HH:mm:ss')}`
          );
          const data = await response.json();
          const paramData = data.map(item => ({
            timestamp: item.timestamp,
            value: item[selectedParameter] || 0
          }));
          setParameterHistoryData(paramData);
        } catch (error) {
          console.error('Error fetching parameter history:', error);
        }
      }
    };

    fetchParameterHistory();
  }, [machineId, selectedParameter, isLive, startTime, endTime]);

  useEffect(() => {
    if (isLive && machineParameters) {
      const newDataPoint = {
        timestamp: new Date().toLocaleTimeString(),
        value: machineParameters[selectedParameter] || 0
      };
      setParameterHistoryData(prev => {
        const newData = [...prev, newDataPoint];
        return newData.length > 50 ? newData.slice(-50) : newData;
      });
    }
  }, [machineParameters, selectedParameter, isLive]);

  const handleParameterChange = useCallback((value) => {
    setSelectedParameter(value);
    if (isLive) {
      setParameterHistoryData([]);
    }
  }, [isLive]);

  const handleLiveToggle = useCallback((checked) => {
    setIsLive(checked);
    if (checked) {
      setStartTime(null);
      setEndTime(null);
      setParameterHistoryData([]);
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
    const selectedParam = PARAMETER_OPTIONS.find(p => p.value === selectedParameter);
    const unit = selectedParam ? selectedParam.label.match(/\((.*?)\)/)?.[1] || '' : '';

    const baseOptions = {
      grid: {
        top: 50,
        right: 30,
        bottom: 50,
        left: 60,
        containLabel: true
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#ccc',
        borderWidth: 1,
        textStyle: {
          color: '#333',
          fontSize: 12,
          fontWeight: 'bold'
        },
        formatter: function(params) {
          const param = params[0];
          return `<div style="font-weight: bold; margin-bottom: 4px;">${param.name}</div>
                  <div style="display: flex; align-items: center;">
                    <span style="display: inline-block; width: 10px; height: 10px; background: #1890ff; margin-right: 8px;"></span>
                    <span>${param.value} ${unit}</span>
                  </div>`;
        }
      },
      xAxis: {
        type: 'category',
        data: parameterHistoryData.map(d => d.timestamp),
        axisLabel: {
          fontSize: 12,
          color: '#666',
          rotate: 45,
          margin: 12,
          fontWeight: 'bold'
        },
        axisLine: {
          lineStyle: {
            color: '#666',
            width: 2
          }
        },
        axisTick: {
          show: false
        }
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          fontSize: 12,
          color: '#666',
          fontWeight: 'bold',
          formatter: `{value} ${unit}`
        },
        splitLine: {
          lineStyle: {
            color: '#ddd',
            type: 'solid',
            width: 1
          }
        },
        axisLine: {
          show: true,
          lineStyle: {
            color: '#666',
            width: 2
          }
        },
        axisTick: {
          show: false
        }
      },
      series: [{
        name: selectedParam?.label || selectedParameter,
        type: 'line',
        step: 'middle',
        data: parameterHistoryData.map(d => d.value),
        smooth: false,
        symbol: 'none',
        sampling: 'average',
        itemStyle: {
          color: '#1890ff'
        },
        lineStyle: {
          width: 2,
          color: '#1890ff'
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [{
              offset: 0,
              color: 'rgba(24, 144, 255, 0.2)'
            }, {
              offset: 1,
              color: 'rgba(24, 144, 255, 0.05)'
            }]
          }
        },
        emphasis: {
          focus: 'series',
          itemStyle: {
            color: '#1890ff'
          },
          lineStyle: {
            width: 3,
            color: '#1890ff'
          }
        }
      }],
      animation: true,
      animationDuration: 300,
      animationEasing: 'cubicInOut',
      dataZoom: [
        {
          type: 'inside',
          start: 0,
          end: 100
        },
        {
          type: 'slider',
          start: 0,
          end: 100,
          height: 20,
          bottom: 0,
          borderColor: 'transparent',
          backgroundColor: '#f0f2f5',
          fillerColor: 'rgba(24, 144, 255, 0.1)',
          handleStyle: {
            color: '#1890ff',
            borderColor: '#1890ff'
          },
          moveHandleStyle: {
            color: '#1890ff',
            borderColor: '#1890ff'
          }
        }
      ]
    };

    if (!isLive && (!parameterHistoryData || parameterHistoryData.length === 0)) {
      return {
        ...baseOptions,
        graphic: [{
          type: 'text',
          left: 'center',
          top: 'middle',
          style: {
            text: 'No data available for the selected time range',
            fontSize: 16,
            fontWeight: 'bold',
            fill: '#999'
          }
        }]
      };
    }

    return baseOptions;
  }, [selectedParameter, parameterHistoryData, isLive]);

  const handleBack = () => {
    onBack();
  };

  const handleTabChange = (key) => {
    setActiveTab(key);
  };

  const items = [
    {
      key: '1',
      label: (
        <span>
          <LineChartOutlined /> Overview
        </span>
      ),
      children: (
        <div style={{ padding: '8px' }}>
          <Row gutter={[8, 8]}>
            <Col span={8}>
              <Card 
                size="small" 
                title={<span style={{ fontSize: '14px', fontWeight: 'bold', color: '#6b4e8f' }}>Voltage Parameters</span>}
                style={{ 
                  height: '100%',
                  background: 'linear-gradient(to bottom right, #f5f3f8 0%, #f8f9fa 100%)',
                  border: '2px solid #6b4e8f',
                  boxShadow: '0 4px 12px rgba(107, 78, 143, 0.15)',
                  borderRadius: '8px'
                }}
                headStyle={{
                  background: 'rgba(107, 78, 143, 0.08)',
                  borderBottom: '2px solid #6b4e8f',
                  padding: '12px 16px'
                }}
              >
                <Row gutter={[2, 2]}>
                  <Col span={12}>
                    <ParameterCard title="Phase A V" value={machineParameters?.phase_a_voltage || 0} unit="V" color="#722ed1" />
                  </Col>
                  <Col span={12}>
                    <ParameterCard title="Phase B V" value={machineParameters?.phase_b_voltage || 0} unit="V" color="#722ed1" />
                  </Col>
                  <Col span={12}>
                    <ParameterCard title="Phase C V" value={machineParameters?.phase_c_voltage || 0} unit="V" color="#722ed1" />
                  </Col>
                  <Col span={12}>
                    <ParameterCard title="Avg Phase V" value={machineParameters?.avg_phase_voltage || 0} unit="V" color="#722ed1" />
                  </Col>
                </Row>
              </Card>
            </Col>

            <Col span={8}>
              <Card 
                size="small" 
                title={<span style={{ fontSize: '14px', fontWeight: 'bold', color: '#8c6d3f' }}>Current Parameters</span>}
                style={{ 
                  height: '100%',
                  background: 'linear-gradient(to bottom right, #f8f6f2 0%, #f9f7f5 100%)',
                  border: '2px solid #8c6d3f',
                  boxShadow: '0 4px 12px rgba(140, 109, 63, 0.15)',
                  borderRadius: '8px'
                }}
                headStyle={{
                  background: 'rgba(140, 109, 63, 0.08)',
                  borderBottom: '2px solid #8c6d3f',
                  padding: '12px 16px'
                }}
              >
                <Row gutter={[2, 2]}>
                  <Col span={12}>
                    <ParameterCard title="Phase A A" value={machineParameters?.phase_a_current || 0} unit="A" color="#fa8c16" />
                  </Col>
                  <Col span={12}>
                    <ParameterCard title="Phase B A" value={machineParameters?.phase_b_current || 0} unit="A" color="#fa8c16" />
                  </Col>
                  <Col span={12}>
                    <ParameterCard title="Phase C A" value={machineParameters?.phase_c_current || 0} unit="A" color="#fa8c16" />
                  </Col>
                  <Col span={12}>
                    <ParameterCard title="Avg 3P A" value={machineParameters?.avg_three_phase_current || 0} unit="A" color="#fa8c16" />
                  </Col>
                </Row>
              </Card>
            </Col>

            <Col span={8}>
              <Card 
                size="small" 
                title={<span style={{ fontSize: '14px', fontWeight: 'bold', color: '#4a6b8a' }}>Power & Frequency</span>}
                style={{ 
                  height: '100%',
                  background: 'linear-gradient(to bottom right, #f2f5f8 0%, #f5f7f9 100%)',
                  border: '2px solid #4a6b8a',
                  boxShadow: '0 4px 12px rgba(74, 107, 138, 0.15)',
                  borderRadius: '8px'
                }}
                headStyle={{
                  background: 'rgba(74, 107, 138, 0.08)',
                  borderBottom: '2px solid #4a6b8a',
                  padding: '12px 16px'
                }}
              >
                <Row gutter={[2, 2]}>
                  <Col span={12}>
                    <ParameterCard title="Frequency" value={machineParameters?.frequency || 0} unit="Hz" color="#2f54eb" />
                  </Col>
                  <Col span={12}>
                    <ParameterCard title="Total Power" value={machineParameters?.total_instantaneous_power || 0} unit="kW" color="#52c41a" />
                  </Col>
                  <Col span={24}>
                    <ParameterCard title="Energy Delivered" value={machineParameters?.active_energy_delivered || 0} unit="kWh" color="#52c41a" />
                  </Col>
                </Row>
              </Card>
            </Col>
          </Row>

          <Card style={{ marginTop: '8px' }}>
            <TimelineControls
              selectedParameter={selectedParameter}
              onParameterChange={handleParameterChange}
              isLive={isLive}
              startTime={startTime}
              endTime={endTime}
              onDateChange={handleDateChange}
              onLiveToggle={handleLiveToggle}
            />
            <div style={{ height: '300px', width: '100%' }}>
              <MemoizedChart options={chartOptions} />
            </div>
          </Card>
        </div>
      ),
    }
  ];

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ 
      padding: '12px', 
      background: '#f0f2f5', 
      height: '100vh', 
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{ 
        marginBottom: '12px', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        background: 'white',
        padding: '12px',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
      }}>
        <Button 
          type="primary" 
          icon={<ArrowLeftOutlined />} 
          onClick={handleBack}
        >
          Back
        </Button>
        <Title level={3} style={{ margin: 0 }}>{machineName || `Machine ${machineId}`}</Title>
        <div style={{ width: '80px' }}></div>
      </div>
      
      <div style={{ 
        flex: 1, 
        overflow: 'hidden',
        display: 'grid',
        gridTemplateRows: 'auto 1fr',
        gap: '12px',
        background: 'white',
        borderRadius: '8px',
        padding: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
      }}>
        <Tabs 
          activeKey={activeTab}
          onChange={handleTabChange}
          items={items}
          style={{ overflow: 'hidden' }}
        />
      </div>
    </div>
  );
};

export default React.memo(MachineOverlay);