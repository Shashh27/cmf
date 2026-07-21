import React, { useState, useEffect, useRef } from 'react';
import { Typography, Button, Space, Card, Row, Col, DatePicker, Modal } from 'antd';
import { ArrowLeftOutlined, ReloadOutlined, FileTextOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import moment from 'moment';
import { API_BASE_URL } from '../Config/auth';
import Report from './Reportnew';
import { authFetch } from '../api/client.js';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const Productivity = ({ onBack }) => {
  const [selectedDateRange, setSelectedDateRange] = useState(null);
  const [isLive, setIsLive] = useState(true);
  const [machineData, setMachineData] = useState([]);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const prevDataRef = useRef([]);
  const [showReport, setShowReport] = useState(false);

  // Fetch live shiftwise energy data
  const fetchLiveShiftwiseData = async () => {
    try {
      const response = await authFetch(`${API_BASE_URL}/energy-monitoring/shiftwise-energy/live`);
      const data = await response.json();
      
      if (Array.isArray(data)) {
        const processedData = data.map(machine => ({
          id: machine.machine_id,
          machine_name: machine.machine_name,
          energy: parseFloat(machine.total_energy || 0),
          max_energy: Math.max(40, parseFloat(machine.total_energy || 0) * 1.2),
          first_shift: parseFloat(machine.first_shift || 0),
          second_shift: parseFloat(machine.second_shift || 0),
          timestamp: machine.timestamp
        }));
        setMachineData(processedData);
        prevDataRef.current = processedData;
      }
      setIsDataLoading(false);
    } catch (error) {
      console.error('Error fetching live shiftwise data:', error);
      setIsDataLoading(false);
    }
  };

  // Fetch historical shiftwise energy data
  const fetchHistoricalShiftwiseData = async (fromDate, toDate) => {
    try {
      const response = await authFetch(
        `${API_BASE_URL}/energy-monitoring/shiftwise-energy/history?start_date=${fromDate}&end_date=${toDate}`
      );
      const data = await response.json();
      
      if (Array.isArray(data)) {
        const processedData = data.map(machine => ({
          id: machine.machine_id,
          machine_name: machine.machine_name,
          energy: parseFloat(machine.total_energy || 0),
          max_energy: Math.max(40, parseFloat(machine.total_energy || 0) * 1.2),
          first_shift: parseFloat(machine.first_shift || 0),
          second_shift: parseFloat(machine.second_shift || 0),
          timestamp: machine.timestamp
        }));
        setMachineData(processedData);
        prevDataRef.current = processedData;
      } else {
        setMachineData([]);
        prevDataRef.current = [];
      }
      setIsDataLoading(false);
    } catch (error) {
      console.error('Error fetching historical shiftwise data:', error);
      setMachineData([]);
      prevDataRef.current = [];
      setIsDataLoading(false);
    }
  };

  // Load data when component mounts
  useEffect(() => {
    if (isLive) {
      fetchLiveShiftwiseData();
      const interval = setInterval(fetchLiveShiftwiseData, 5000);
      return () => clearInterval(interval);
    }
  }, [isLive]);

  const handleDateRangeChange = async (dates) => {
    try {
      setIsDataLoading(true);
      setSelectedDateRange(dates);
      setIsLive(!dates);
      
      if (!dates || dates.length === 0) {
        setIsLive(true);
        return;
      }
      
      const [fromDate, toDate] = dates;
      const formattedFromDate = fromDate.format('YYYY-MM-DD');
      const formattedToDate = toDate.format('YYYY-MM-DD');
      
      await fetchHistoricalShiftwiseData(formattedFromDate, formattedToDate);
    } catch (error) {
      console.error('Error in handleDateRangeChange:', error);
      setMachineData([]);
      prevDataRef.current = [];
      setIsDataLoading(false);
    }
  };

  const handleGoLive = () => {
    setIsDataLoading(true);
    setSelectedDateRange(null);
    setIsLive(true);
    setMachineData([]);
    prevDataRef.current = [];
    fetchLiveShiftwiseData();
  };

  const handleViewReport = () => {
    setShowReport(true);
  };

  const getGaugeOptions = (machine) => ({
    backgroundColor: 'transparent',
    series: [{
      type: 'gauge',
      startAngle: 200,
      endAngle: -20,
      min: 0,
      max: machine.max_energy || 40,
      splitNumber: 10,
      radius: '85%',
      center: ['50%', '60%'],
      itemStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 1,
          y2: 0,
          colorStops: [{
            offset: 0, color: '#60A5FA'
          }, {
            offset: 0.5, color: '#3B82F6'
          }, {
            offset: 1, color: '#1D4ED8'
          }]
        }
      },
      progress: {
        show: true,
        roundCap: true,
        width: 18,
        itemStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 1,
            y2: 0,
            colorStops: [{
              offset: 0, color: '#60A5FA'
            }, {
              offset: 0.5, color: '#3B82F6'
            }, {
              offset: 1, color: '#1D4ED8'
            }]
          }
        }
      },
      pointer: {
        show: false
      },
      axisLine: {
        roundCap: true,
        lineStyle: {
          width: 18,
          color: [[1, '#E5E7EB']]
        }
      },
      axisTick: {
        show: false
      },
      splitLine: {
        show: false
      },
      axisLabel: {
        show: false
      },
      title: {
        show: false
      },
      detail: {
        show: true,
        width: 50,
        height: 14,
        fontSize: 24,
        color: '#1F2937',
        fontWeight: 'bold',
        formatter: function(value) {
          const numValue = parseFloat(value) || 0;
          if (Math.abs(numValue) >= 1000) {
            return numValue.toFixed(1) + ' kWh';
          } else {
            return numValue.toFixed(3) + ' kWh';
          }
        },
        offsetCenter: [0, '-10%']
      },
      data: [{
        value: machine.energy || 0,
        name: machine.machine_name || `Machine-${machine.id}`
      }],
      animation: true,
      animationDuration: 1000,
      animationEasing: 'cubicOut'
    }]
  });

  const getDateRangeDisplay = () => {
    if (!selectedDateRange || selectedDateRange.length !== 2) return '';
    const [fromDate, toDate] = selectedDateRange;
    
    if (fromDate.format('YYYY-MM-DD') === toDate.format('YYYY-MM-DD')) {
      return fromDate.format('MMMM D, YYYY');
    }
    
    return `${fromDate.format('MMM D')} - ${toDate.format('MMM D, YYYY')}`;
  };

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <Space>
          <Button 
            type="primary"
            icon={<ArrowLeftOutlined />}
            onClick={onBack}
            style={{
              backgroundColor: '#1890ff',
              borderRadius: '6px'
            }}
          >
            Back
          </Button>
        </Space>
        <Title 
          level={2} 
          style={{ 
            margin: 0,
            color: '#000000',
            fontWeight: 600
          }}
        >
          {isLive ? 'Live Energy Monitoring' : `Historical Energy Data - ${getDateRangeDisplay()}`}
        </Title>
        <Space size="middle">
          <RangePicker 
            value={selectedDateRange}
            onChange={handleDateRangeChange}
            style={{ width: '300px' }}
            placeholder={['From Date', 'To Date']}
            format="YYYY-MM-DD"
            disabledDate={(current) => {
              return current && current > moment().endOf('day');
            }}
            allowClear={true}
          />
        
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            onClick={handleGoLive}
            style={{
              backgroundColor: isLive ? '#22c55e' : '#64748b',
              borderColor: isLive ? '#16a34a' : '#475569'
            }}
          >
            Go Live
          </Button>
          <Button
            type="primary"
            icon={<FileTextOutlined />}
            onClick={handleViewReport}
            disabled={machineData.length === 0}
            style={{
              backgroundColor: '#3b82f6',
              borderColor: '#2563eb'
            }}
          >
            View Report
          </Button>
          {isLive && !isDataLoading && (
            <div style={{ 
              background: '#22c55e',
              padding: '8px 16px',
              borderRadius: '20px',
              color: 'white',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '14px',
              fontWeight: '500'
            }}>
              <div style={{ 
                width: '8px', 
                height: '8px', 
                background: 'white',
                borderRadius: '50%',
                animation: 'pulse 1.5s infinite'
              }}></div>
              <span>Live Data</span>
            </div>
          )}
        </Space>
      </div>

      {isDataLoading && (
        <div style={{ 
          textAlign: 'center', 
          padding: '40px 0',
          background: '#f9fafb',
          borderRadius: '12px',
          margin: '20px 0'
        }}>
          <Text style={{ fontSize: '16px', color: '#64748b' }}>
            {isLive ? 'Loading live energy data...' : 'Loading historical data...'}
          </Text>
        </div>
      )}

      {!isDataLoading && selectedDateRange && machineData.length === 0 && (
        <div style={{ 
          textAlign: 'center', 
          padding: '80px 0',
          background: '#f9fafb',
          borderRadius: '12px',
          margin: '20px 0'
        }}>
          <Text 
            style={{ 
              fontSize: '18px', 
              display: 'block',
              marginBottom: '16px',
              color: '#64748b'
            }}
          >
            No energy monitoring data available for {getDateRangeDisplay()}
          </Text>
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            onClick={handleGoLive}
          >
            Return to Live Data
          </Button>
        </div>
      )}

      {!isDataLoading && machineData.length > 0 && (
        <Row gutter={[16, 16]}>
          {machineData.map((machine) => (
            <Col xs={24} sm={12} lg={8} xl={6} key={machine.id}>
              <Card 
                style={{ 
                  borderRadius: '12px',
                  height: '100%',
                  background: 'white'
                }}
                bodyStyle={{ padding: '16px' }}
              >
                <div style={{
                  textAlign: 'center',
                  marginBottom: '12px',
                  paddingBottom: '12px',
                  borderBottom: '1px solid #E5E7EB'
                }}>
                  <Text style={{ 
                    fontSize: '16px', 
                    fontWeight: '600',
                    color: '#1F2937'
                  }}>
                    {machine.machine_name}
                  </Text>
                </div>
                <ReactECharts
                  option={getGaugeOptions(machine)}
                  style={{ height: '220px' }}
                  opts={{ renderer: 'svg' }}
                />
                <div style={{ 
                  marginTop: '12px',
                  padding: '12px',
                  background: '#F9FAFB',
                  borderRadius: '8px',
                  textAlign: 'center'
                }}>
                  <Text type="secondary" style={{ fontSize: '13px' }}>Total Energy</Text>
                  <div style={{ 
                    color: '#3B82F6', 
                    fontWeight: '600', 
                    fontSize: '20px',
                    marginTop: '2px'
                  }}>
                       {(machine.energy || 0).toFixed(2)} kWh
                  </div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      )}
      
      <style>{`
        @keyframes pulse {
          0% { opacity: 0.4; }
          50% { opacity: 1; }
          100% { opacity: 0.4; }
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
          machineData={machineData.map(machine => ({
            ...machine,
            cost: parseFloat((machine.energy * 12.5).toFixed(2)),
            third_shift: 0
          }))}
          returnPath="/admin/energy-monitoring"
        />
      </Modal>
    </div>
  );
};

export default Productivity;
