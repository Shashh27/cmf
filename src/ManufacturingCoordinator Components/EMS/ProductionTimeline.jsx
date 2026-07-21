import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import * as echarts from 'echarts';
import moment from 'moment';
import { Empty, DatePicker } from 'antd';
import { API_BASE_URL } from '../../Config/auth';
import { authFetch } from '../../api/client.js';

function ProductionTimeline({ machineId }) {
  const [selectedDate, setSelectedDate] = useState(moment());
  const [productionData, setProductionData] = useState(null);
  const [loading, setLoading] = useState(false);
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const initializedRef = useRef(false);

  const fetchProductionData = async (date) => {
    if (!machineId) return;
    
    setLoading(true);
    try {
      const response = await authFetch(
        `${API_BASE_URL}/energy-monitoring/get_production_data?date=${date.format('YYYY-MM-DD')}&machine_id=${machineId}`
      );
      const data = await response.json();
      setProductionData(data);
    } catch (error) {
      console.error('Error fetching production data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProductionData(selectedDate);
    const interval = setInterval(() => fetchProductionData(selectedDate), 10000);
    return () => clearInterval(interval);
  }, [machineId, selectedDate]);

  const processedData = useMemo(() => {
    const dataPoints = productionData?.dataPoints || [];
    
    if (!Array.isArray(dataPoints) || dataPoints.length === 0) {
      return null;
    }

    let chartData = [];
    const firstPoint = dataPoints[0];
    const baseDate = moment(firstPoint.timestamp).utc();
    const dayStart = moment(baseDate).utc().set({ hour: 8, minute: 30, second: 0 });
    const dayEnd = moment(dayStart).utc().add(1, 'day');

    dataPoints.forEach(point => {
      const statusValue = point.status === 2 ? 2 : point.status === 1 ? 1 : 0;
      const startTime = moment(point.timestamp).utc();

      chartData.push([
        startTime.format('YYYY-MM-DD HH:mm:ss'),
        statusValue,
        point.status === 2 ? 'PRODUCTION' : point.status === 1 ? 'ON' : 'OFF',
        startTime.format('HH:mm:ss')
      ]);
    });

    chartData.sort((a, b) => moment.utc(a[0]).valueOf() - moment.utc(b[0]).valueOf());

    return {
      chartData,
      dayStart: dayStart.format('YYYY-MM-DD HH:mm:ss'),
      dayEnd: dayEnd.format('YYYY-MM-DD HH:mm:ss')
    };
  }, [productionData]);

  const getChartOption = useCallback((data) => {
    if (!data) return null;

    return {
      title: {
        text: 'Machine Status Timeline',
        left: 'center'
      },
      tooltip: {
        trigger: 'axis',
        formatter: function(params) {
          const time = params[0].value[3];
          const status = params[0].value[2];
          return `Time: ${time}<br/>Status: ${status}`;
        }
      },
      grid: {
        left: '5%',
        right: '5%',
        bottom: '10%',
        top: '15%',
        containLabel: true
      },
      xAxis: {
        type: 'time',
        boundaryGap: false,
        min: data.dayStart,
        max: data.dayEnd,
        axisLabel: {
          formatter: function(value) {
            return moment.utc(value).format('HH:mm');
          },
          interval: 'auto'
        },
        splitLine: {
          show: true,
          lineStyle: {
            type: 'dashed'
          }
        }
      },
      yAxis: {
        type: 'category',
        data: ['OFF', 'ON', 'PRODUCTION'],
        axisLine: { show: true },
        axisTick: { show: true },
        splitLine: {
          show: true,
          lineStyle: {
            type: 'dashed'
          }
        }
      },
      series: [{
        name: 'Status',
        type: 'line',
        step: 'start',
        symbolSize: 8,
        lineStyle: { width: 2 },
        itemStyle: {
          color: function(params) {
            return params.value[1] === 2 ? '#52c41a' :
                   params.value[1] === 1 ? '#faad14' :
                   '#f5222d';
          }
        },
        data: data.chartData
      }],
      dataZoom: [{
        type: 'inside',
        start: 0,
        end: 100
      }, {
        show: true,
        type: 'slider',
        bottom: 25,
        start: 0,
        end: 100
      }],
      animation: false
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current || initializedRef.current) return;

    chartInstance.current = echarts.init(chartRef.current);
    initializedRef.current = true;

    const option = getChartOption(processedData);
    if (option) {
      chartInstance.current.setOption(option);
    }

    const handleResize = () => {
      chartInstance.current && chartInstance.current.resize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
      initializedRef.current = false;
    };
  }, [processedData, getChartOption]);

  useEffect(() => {
    if (!chartInstance.current || !processedData) return;

    chartInstance.current.setOption({
      xAxis: {
        min: processedData.dayStart,
        max: processedData.dayEnd,
        animation: false
      },
      series: [{
        data: processedData.chartData,
        animation: false
      }]
    }, { 
      notMerge: false, 
      lazyUpdate: true, 
      silent: true,
      animation: false
    });
  }, [processedData]);

  if (!processedData) {
    return (
      <div style={{ 
        width: '100%', 
        height: '300px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fff'
      }}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="No production data available for this machine"
        />
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <DatePicker
          value={selectedDate}
          onChange={(date) => setSelectedDate(date)}
          format="YYYY-MM-DD"
          disabledDate={(current) => current && current > moment().endOf('day')}
        />
      </div>
      <div 
        ref={chartRef} 
        style={{ 
          width: '100%', 
          height: '300px'
        }} 
      />
    </div>
  );
}

export default React.memo(ProductionTimeline, (prevProps, nextProps) => {
  return prevProps.machineId === nextProps.machineId;
});
