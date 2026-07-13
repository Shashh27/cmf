import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Typography, Spin, Card, Row, Col, Button, Space } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import * as echarts from 'echarts-for-react';
import { API_BASE_URL } from '../../Config/auth';

const { Title, Text } = Typography;

function MachineDetails() {
  const { machineId } = useParams();
  const navigate = useNavigate();
  const [machineName, setMachineName] = useState('');
  const [machineDetails, setMachineDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API_BASE_URL}/energy-monitoring/live_recent?machine_id=${machineId}`);
        const data = await response.json();
        setMachineDetails(data);
        setMachineName(data.machine_name || `Machine ${machineId}`);
      } catch (error) {
        console.error('Error:', error);
        setError(error.message || 'Failed to fetch machine details');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const intervalId = setInterval(fetchData, 30000);

    return () => {
      clearInterval(intervalId);
    };
  }, [machineId]);

  const getGaugeOptions = (value, title, color, unit) => ({
    series: [{
      type: 'gauge',
      startAngle: 200,
      endAngle: -20,
      min: 0,
      max: value * 1.5 || 100,
      splitNumber: 10,
      radius: '85%',
      center: ['50%', '60%'],
      itemStyle: {
        color: color
      },
      progress: {
        show: true,
        roundCap: true,
        width: 18
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
          return numValue.toFixed(2) + ` ${unit}`;
        },
        offsetCenter: [0, '-10%']
      },
      data: [{
        value: value || 0,
        name: title
      }]
    }]
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '24px' }}>
        <Card>
          <Title level={4}>Error</Title>
          <Text type="danger">{error}</Text>
          <Button 
            type="primary" 
            onClick={() => navigate(-1)} 
            style={{ marginTop: '16px' }}
          >
            Go Back
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Button 
            icon={<ArrowLeftOutlined />} 
            onClick={() => navigate(-1)}
          >
            Back
          </Button>
          <Title level={2} style={{ margin: 0 }}>{machineName}</Title>
        </div>

        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <Card>
              <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                <Text strong style={{ fontSize: '16px' }}>Current</Text>
              </div>
              <echarts-for-react
                option={getGaugeOptions(machineDetails?.avg_three_phase_current, 'Current', '#2563eb', 'A')}
                style={{ height: '220px' }}
              />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card>
              <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                <Text strong style={{ fontSize: '16px' }}>Power</Text>
              </div>
              <echarts-for-react
                option={getGaugeOptions(machineDetails?.total_instantaneous_power, 'Power', '#16a34a', 'kW')}
                style={{ height: '220px' }}
              />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card>
              <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                <Text strong style={{ fontSize: '16px' }}>Energy</Text>
              </div>
              <echarts-for-react
                option={getGaugeOptions(machineDetails?.active_energy_delivered, 'Energy', '#9333ea', 'kWh')}
                style={{ height: '220px' }}
              />
            </Card>
          </Col>
        </Row>
      </Space>
    </div>
  );
}

export default MachineDetails;
