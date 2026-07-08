import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, DatePicker, Typography, Space, Spin } from 'antd';
import * as echarts from 'echarts';
import moment from 'moment';
import { API_BASE_URL } from '../Config/auth';

const { Title } = Typography;

function ProductionStatus({ machineId }) {
    const [selectedDate, setSelectedDate] = useState(() => moment());
    const [loading, setLoading] = useState(false);
    const [chartData, setChartData] = useState([]);

    const handleDateChange = async (date) => {
        if (!date) return;
        
        setSelectedDate(date);
        
        if (machineId) {
            try {
                setLoading(true);
                const response = await fetch(
                    `${API_BASE_URL}/energy-monitoring/get_production_data?date=${date.format('YYYY-MM-DD')}&machine_id=${machineId}`
                );
                const data = await response.json();
                
                const transformedData = [];
                
                const dayStart = moment(date)
                    .utc()
                    .hours(8)
                    .minutes(0)
                    .seconds(0)
                    .milliseconds(0);

                if (data.dataPoints && data.dataPoints.length > 0) {
                    const firstDataPoint = moment(data.dataPoints[0].timestamp).utc();
                    
                    // Add OFF state from 8:00 to first data point
                    transformedData.push({
                        x: dayStart.valueOf(),
                        x2: firstDataPoint.valueOf(),
                        y: 0,
                        status: 'OFF',
                        color: '#4A4A4A',
                        name: 'OFF'
                    });

                    // Add the rest of the data points
                    data.dataPoints.forEach(point => {
                        const status = point.status === 2 ? 'PRODUCTION' : point.status === 1 ? 'ON' : 'OFF';
                        transformedData.push({
                            x: moment(point.timestamp).utc().valueOf(),
                            x2: moment(point.timestamp).utc().add(300, 'seconds').valueOf(),
                            y: 0,
                            status: status,
                            name: status,
                            color: status === 'PRODUCTION' ? '#228B22' :
                                   status === 'ON' ? '#DAA520' : '#4A4A4A'
                        });
                    });
                }

                setChartData(transformedData);
            } catch (error) {
                console.error('Error loading data:', error);
                setChartData([]);
            } finally {
                setLoading(false);
            }
        }
    };

    useEffect(() => {
        handleDateChange(selectedDate);
    }, [machineId, selectedDate]);

    const startTime = moment(selectedDate)
        .utc()
        .hours(8)
        .minutes(0)
        .seconds(0)
        .milliseconds(0);
    
    const endTime = moment(selectedDate)
        .utc()
        .add(1, 'day')
        .hours(8)
        .minutes(0)
        .seconds(0)
        .milliseconds(0);

    const chartOptions = useMemo(() => ({
        title: {
            text: 'Production Timeline',
            left: 'center',
            style: {
                fontSize: '18px',
                fontWeight: '600',
                color: '#2c6e49'
            }
        },
        tooltip: {
            trigger: 'axis',
            formatter: function(params) {
                if (params && params.length > 0) {
                    const point = params[0];
                    const start = moment(point.value[0]).utc();
                    const duration = moment.duration(point.value[1] - point.value[0]);
                    const hours = Math.floor(duration.asHours());
                    const minutes = duration.minutes();
                    
                    let statusColor;
                    switch(point.value[2]) {
                        case 'PRODUCTION':
                            statusColor = '#228B22';
                            break;
                        case 'ON':
                            statusColor = '#DAA520';
                            break;
                        default:
                            statusColor = '#4A4A4A';
                    }
                    
                    return `
                        <div style="padding: 10px; min-width: 200px;">
                            <div style="
                                font-size: 14px;
                                font-weight: 600;
                                color: ${statusColor};
                                margin-bottom: 8px;
                                border-bottom: 1px solid #eee;
                                padding-bottom: 5px;
                            ">
                                ${point.value[2]}
                            </div>
                            <div style="color: #666; line-height: 1.5;">
                                <div>
                                    <span style="font-weight: 500;">Start:</span> 
                                    ${start.format('HH:mm')} GMT
                                </div>
                                <div style="
                                    margin-top: 5px;
                                    padding-top: 5px;
                                    border-top: 1px solid #eee;
                                    font-weight: 500;
                                    color: ${statusColor};
                                ">
                                    Duration: ${hours}h ${minutes}m
                                </div>
                            </div>
                        </div>
                    `;
                }
                return '';
            }
        },
        grid: {
            left: '10%',
            right: '10%',
            bottom: '15%',
            top: '15%'
        },
        xAxis: {
            type: 'time',
            min: startTime.valueOf(),
            max: endTime.valueOf(),
            axisLabel: {
                formatter: function(value) {
                    return moment(value).utc().format('HH:mm');
                },
                rotate: 45,
                style: {
                    fontSize: '13px',
                    color: '#666',
                    fontWeight: '500'
                }
            },
            splitLine: {
                lineStyle: {
                    type: 'dashed'
                }
            }
        },
        yAxis: {
            type: 'category',
            data: [machineId],
            axisLabel: {
                style: {
                    fontSize: '14px',
                    color: '#2c6e49',
                    fontWeight: '500'
                }
            },
            splitLine: {
                lineStyle: {
                    type: 'dashed'
                }
            }
        },
        series: [{
            type: 'bar',
            barWidth: 20,
            data: chartData.map(point => ({
                value: [point.x, point.x2, point.status],
                itemStyle: {
                    color: point.color
                }
            }))
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
    }), [chartData, machineId, startTime, endTime]);

    return (
        <Card style={{ 
            width: '100%', 
            overflow: 'hidden',
            boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
        }}>
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
                <div style={{ 
                    position: 'relative',
                    width: '100%',
                    height: '500px',
                    margin: '20px 0',
                    overflow: 'hidden',
                    borderRadius: '8px',
                    backgroundColor: '#fff'
                }}>
                    {loading ? (
                        <div style={{ 
                            position: 'absolute', 
                            top: '50%', 
                            left: '50%', 
                            transform: 'translate(-50%, -50%)' 
                        }}>
                            <Spin size="large" />
                        </div>
                    ) : (
                        <echarts-for-react
                            option={chartOptions}
                            style={{ height: '100%', width: '100%' }}
                            opts={{ renderer: 'svg' }}
                        />
                    )}
                </div>

                <div style={{ 
                    display: 'flex', 
                    gap: '20px', 
                    justifyContent: 'center',
                    padding: '10px',
                    backgroundColor: '#f8f8f8',
                    borderRadius: '6px'
                }}>
                    {[
                        { status: 'PRODUCTION', color: '#228B22' },
                        { status: 'ON', color: '#DAA520' },
                        { status: 'OFF', color: '#4A4A4A' }
                    ].map(item => (
                        <div key={item.status} style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '8px',
                            padding: '8px 12px',
                            backgroundColor: '#fff',
                            borderRadius: '4px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                        }}>
                            <div style={{ 
                                width: '16px', 
                                height: '16px', 
                                backgroundColor: item.color,
                                borderRadius: '3px'
                            }}></div>
                            <span style={{ 
                                fontSize: '14px',
                                fontWeight: '500',
                                color: '#333'
                            }}>{item.status}</span>
                        </div>
                    ))}
                </div>
            </Space>
        </Card>
    );
}

export default ProductionStatus;
