import React, { useState, useEffect } from 'react';
import { Layout, Tabs, Card, Spin, Alert, Space } from 'antd';
import { BarChartOutlined, ReloadOutlined } from '@ant-design/icons';
import * as echarts from 'echarts';
import moment from 'moment';
import { API_BASE_URL } from '../../Config/auth';
import { authFetch } from '../../api/client.js';

const { Content } = Layout;
const { TabPane } = Tabs;

const DetailGraph = ({ machineId }) => {
  const [timeRange, setTimeRange] = useState('24h');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [detailData, setDetailData] = useState({ current: [], power: [], energy: [] });

  const getTimeRange = (range) => {
    const end = moment();
    const start = moment();
    switch (range) {
      case '1h':
        start.subtract(1, 'hours');
        break;
      case '24h':
        start.subtract(24, 'hours');
        break;
      case '7d':
        start.subtract(7, 'days');
        break;
      default:
        start.subtract(24, 'hours');
    }
    return { start, end };
  };

  const fetchDetailData = async () => {
    setLoading(true);
    try {
      const { start, end } = getTimeRange(timeRange);
      const response = await authFetch(
        `${API_BASE_URL}/energy-monitoring/get_machine_history/${machineId}?start_time=${start.format('YYYY-MM-DD HH:mm:ss')}&end_time=${end.format('YYYY-MM-DD HH:mm:ss')}`
      );
      const data = await response.json();
      
      if (Array.isArray(data)) {
        setDetailData({
          current: data.map(item => ({ timestamp: item.timestamp, value: item.current ?? item.avg_three_phase_current })),
          power: data.map(item => ({ timestamp: item.timestamp, value: item.power ?? item.total_instantaneous_power })),
          energy: data.map(item => ({ timestamp: item.timestamp, value: item.energy ?? item.active_energy_delivered }))
        });
      }
    } catch (err) {
      setError('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (machineId) {
      fetchDetailData();
    }
  }, [machineId, timeRange]);

  const getParameterConfig = (param) => {
    switch(param.toLowerCase()) {
      case 'current':
        return { label: 'Current (A)', color: '#2563eb' };
      case 'power':
        return { label: 'Power (kW)', color: '#16a34a' };
      case 'energy':
        return { label: 'Energy (kWh)', color: '#9333ea' };
      default:
        return { label: param, color: '#2563eb' };
    }
  };

  const getChartOption = (data, parameter) => {
    const config = getParameterConfig(parameter);

    return {
      tooltip: {
        trigger: 'axis',
        formatter: function(params) {
          const dataPoint = params[0];
          return `
            <div>
              <div>${moment(dataPoint.name).format('YYYY-MM-DD HH:mm:ss')}</div>
              <div>${config.label}: ${dataPoint.value.toFixed(2)}</div>
            </div>
          `;
        }
      },
      grid: {
        top: 40,
        right: 30,
        bottom: 60,
        left: 60,
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: data.map(item => item.timestamp),
        axisLabel: {
          rotate: 45,
          formatter: (value) => moment(value).format('HH:mm')
        },
        axisTick: {
          alignWithLabel: true
        }
      },
      yAxis: {
        type: 'value',
        name: config.label,
        nameLocation: 'middle',
        nameGap: 50,
        splitLine: {
          lineStyle: {
            type: 'dashed'
          }
        }
      },
      series: [{
        data: data.map(item => item.value),
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: {
          color: config.color,
          width: 3
        },
        itemStyle: {
          color: config.color
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
              color: `${config.color}33`
            }, {
              offset: 1,
              color: `${config.color}11`
            }]
          }
        }
      }],
      dataZoom: [{
        type: 'slider',
        show: true,
        start: 0,
        end: 100,
        bottom: 10
      }, {
        type: 'inside',
        start: 0,
        end: 100
      }]
    };
  };

  const TimeRangeSelector = () => (
    <Space className="mb-4">
      {[
        { label: 'Last Hour', value: '1h' },
        { label: 'Last 24 Hours', value: '24h' },
        { label: 'Last 7 Days', value: '7d' }
      ].map(({ label, value }) => (
        <button
          key={value}
          onClick={() => setTimeRange(value)}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            background: timeRange === value ? '#2c6e49' : '#f0f0f0',
            color: timeRange === value ? 'white' : 'black',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          {label}
        </button>
      ))}
    </Space>
  );

  return (
    <Card 
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BarChartOutlined style={{ color: '#2c6e49' }} />
          <span>Machine Parameters Analysis</span>
        </div>
      }
      extra={
        <button
          onClick={fetchDetailData}
          style={{
            padding: '8px',
            borderRadius: '8px',
            background: '#f0f0f0',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          <ReloadOutlined />
        </button>
      }
    >
      <TimeRangeSelector />

      {error && (
        <Alert
          message="Error"
          description={error}
          type="error"
          showIcon
          style={{ marginBottom: '16px' }}
        />
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
          <Spin size="large" />
        </div>
      ) : (
        <Tabs defaultActiveKey="current">
          {['current', 'power', 'energy'].map(parameter => (
            <TabPane tab={parameter.charAt(0).toUpperCase() + parameter.slice(1)} key={parameter}>
              <div style={{ height: '500px', background: 'white', borderRadius: '8px', padding: '16px' }}>
                <echarts-for-react
                  option={getChartOption(detailData[parameter] || [], parameter)}
                  style={{ height: '100%', width: '100%' }}
                  opts={{ renderer: 'svg' }}
                />
              </div>
            </TabPane>
          ))}
        </Tabs>
      )}
    </Card>
  );
};

export default DetailGraph;
