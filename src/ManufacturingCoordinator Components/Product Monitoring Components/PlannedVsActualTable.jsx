import React, { useState, useEffect } from 'react';
import axios from 'axios';
import config from '../../Config/config';
import { Card, Typography, DatePicker, Input, Button, Space, Spin, Alert, Empty } from 'antd';
import { Search, RefreshCw } from 'lucide-react';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const PlannedVsActualTable = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState(null);
  const [machineId, setMachineId] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const params = {};
      if (dateRange && dateRange.length === 2) {
        params.start_date = dateRange[0].format('YYYY-MM-DD HH:mm:ss');
        params.end_date = dateRange[1].format('YYYY-MM-DD HH:mm:ss');
      }
      if (machineId) {
        params.machine_id = machineId;
      }

      const response = await axios.get(`${config.API_BASE_URL}/production-analytics/combined-schedule-production/`, { params });
      setData(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to fetch data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFilter = () => {
    fetchData();
  };

  const handleReset = () => {
    setDateRange(null);
    setMachineId('');
    setTimeout(() => {
      fetchData();
    }, 100);
  };

  if (loading) {
    return (
      <div style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
          <Spin size="large" tip="Loading data..." />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '24px' }}>
        <Alert message="Error" description={error} type="error" showIcon />
      </div>
    );
  }

  return (
    <div>
      {/* Filters */}
      <Card style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
          <Title level={4} style={{ margin: 0 }}>Filters</Title>
        </div>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: '300px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Date Range:</label>
            <RangePicker
              value={dateRange}
              onChange={setDateRange}
              showTime
              format="YYYY-MM-DD HH:mm"
              style={{ width: '100%' }}
              placeholder={['Start Date', 'End Date']}
            />
          </div>
          <div style={{ minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Machine ID:</label>
            <Input
              type="number"
              value={machineId}
              onChange={(e) => setMachineId(e.target.value)}
              placeholder="Enter Machine ID"
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <Space>
              <Button 
                type="primary" 
                icon={<Search size={16} />}
                onClick={handleFilter}
                loading={loading}
              >
                Apply Filters
              </Button>
              <Button 
                icon={<RefreshCw size={16} />}
                onClick={handleReset}
                disabled={loading}
              >
                Reset
              </Button>
            </Space>
          </div>
        </div>
      </Card>

      {/* Data Display */}
      {!data || (!data.planned_operations?.length && !data.actual_production_logs?.length) ? (
        <Card>
          <Empty description="No data available for the selected criteria" />
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Planned Operations */}
          {data.planned_operations && data.planned_operations.length > 0 && (
            <Card>
              <Title level={4} style={{ marginBottom: '16px', color: '#d46b08' }}>
                Planned Operations ({data.planned_operations.length})
              </Title>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ background: '#fff7e6' }}>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #d46b08', fontWeight: '600' }}>ID</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #d46b08', fontWeight: '600' }}>Part Number</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #d46b08', fontWeight: '600' }}>Operation ID</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #d46b08', fontWeight: '600' }}>Machine</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #d46b08', fontWeight: '600' }}>Planned Start</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #d46b08', fontWeight: '600' }}>Planned End</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #d46b08', fontWeight: '600' }}>Total Qty</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #d46b08', fontWeight: '600' }}>Remaining Qty</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #d46b08', fontWeight: '600' }}>Status</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #d46b08', fontWeight: '600' }}>Sale Order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.planned_operations.map((item) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #ffe7ba', '&:hover': { backgroundColor: '#fff7e6' } }}>
                        <td style={{ padding: '12px' }}>{item.id}</td>
                        <td style={{ padding: '12px', fontWeight: '500' }}>{item.part_number}</td>
                        <td style={{ padding: '12px' }}>{item.operation_id}</td>
                        <td style={{ padding: '12px' }}>{item.machine_name || 'N/A'}</td>
                        <td style={{ padding: '12px' }}>{dayjs(item.planned_start_time).format('YYYY-MM-DD HH:mm')}</td>
                        <td style={{ padding: '12px' }}>{dayjs(item.planned_end_time).format('YYYY-MM-DD HH:mm')}</td>
                        <td style={{ padding: '12px' }}>{item.total_quantity}</td>
                        <td style={{ padding: '12px' }}>{item.remaining_quantity}</td>
                        <td style={{ padding: '12px' }}>
                          <span style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            background: item.status === 'completed' ? '#d4edda' : '#fff3cd',
                            color: item.status === 'completed' ? '#155724' : '#856404',
                            fontWeight: '500'
                          }}>
                            {item.status || 'Pending'}
                          </span>
                        </td>
                        <td style={{ padding: '12px' }}>{item.sale_order_number}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Actual Production Logs */}
          {data.actual_production_logs && data.actual_production_logs.length > 0 && (
            <Card>
              <Title level={4} style={{ marginBottom: '16px', color: '#389e0d' }}>
                Actual Production Logs ({data.actual_production_logs.length})
              </Title>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ background: '#f6ffed' }}>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #389e0d', fontWeight: '600' }}>ID</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #389e0d', fontWeight: '600' }}>Part Number</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #389e0d', fontWeight: '600' }}>Operation ID</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #389e0d', fontWeight: '600' }}>Machine</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #389e0d', fontWeight: '600' }}>From Date</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #389e0d', fontWeight: '600' }}>From Time</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #389e0d', fontWeight: '600' }}>To Date</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #389e0d', fontWeight: '600' }}>To Time</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #389e0d', fontWeight: '600' }}>Produced Qty</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #389e0d', fontWeight: '600' }}>Approved Qty</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #389e0d', fontWeight: '600' }}>Operator</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #389e0d', fontWeight: '600' }}>Status</th>
                      <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #389e0d', fontWeight: '600' }}>Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.actual_production_logs.map((log) => (
                      <tr key={log.id} style={{ borderBottom: '1px solid #d9f7be', '&:hover': { backgroundColor: '#f6ffed' } }}>
                        <td style={{ padding: '12px' }}>{log.id}</td>
                        <td style={{ padding: '12px', fontWeight: '500' }}>{log.part_number || 'N/A'}</td>
                        <td style={{ padding: '12px' }}>{log.operation_id}</td>
                        <td style={{ padding: '12px' }}>{log.machine_name || 'N/A'}</td>
                        <td style={{ padding: '12px' }}>{log.from_date}</td>
                        <td style={{ padding: '12px' }}>{log.from_time}</td>
                        <td style={{ padding: '12px' }}>{log.to_date || 'N/A'}</td>
                        <td style={{ padding: '12px' }}>{log.to_time || 'N/A'}</td>
                        <td style={{ padding: '12px' }}>{log.produced_quantity}</td>
                        <td style={{ padding: '12px' }}>{log.approved_quantity || 'N/A'}</td>
                        <td style={{ padding: '12px' }}>{log.operator_name || 'N/A'}</td>
                        <td style={{ padding: '12px' }}>
                          <span style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            background: log.status === 'completed' ? '#d4edda' : log.status === 'rework' ? '#f8d7da' : '#fff3cd',
                            color: log.status === 'completed' ? '#155724' : log.status === 'rework' ? '#721c24' : '#856404',
                            fontWeight: '500'
                          }}>
                            {log.status}
                          </span>
                        </td>
                        <td style={{ padding: '12px' }}>
                          {log.is_completed ? (
                            <span style={{ color: '#52c41a', fontWeight: 'bold', fontSize: '16px' }}>✓</span>
                          ) : (
                            <span style={{ color: '#faad14', fontSize: '16px' }}>○</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

export default PlannedVsActualTable;
