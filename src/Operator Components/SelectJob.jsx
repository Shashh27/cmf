import React, { useState, useEffect } from 'react';
import { Drawer, Card, Select, Button, Tag, Typography, Row, Col, Space, Empty, Spin } from 'antd';
import { CalendarOutlined, BuildOutlined, CloseCircleOutlined } from '@ant-design/icons';
import axios from 'axios';
import { SCHEDULING_API_BASE_URL } from '../Config/schedulingconfig';

const { Text, Title } = Typography;
const { Option } = Select;

const SelectJob = ({ open, onClose, onSelectJob }) => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [priorityFilter, setPriorityFilter] = useState(null);
  const [orderFilter, setOrderFilter] = useState(null);
  const [machineName, setMachineName] = useState('');
  const [machineId, setMachineId] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null); // ✅ track selected card

  useEffect(() => {
    const stored = localStorage.getItem('selectedMachine');
    if (stored) {
      try {
        const m = JSON.parse(stored);
        const name = m?.name || [m?.type, m?.make, m?.model].filter(Boolean).join('-') || '';
        setMachineName(name);
        const id = m?.id ?? m?.machine_id ?? m?.machineId ?? m?.machine?.id ?? null;
        setMachineId(id);
      } catch (e) {
        console.error('Error parsing selectedMachine from localStorage', e);
      }
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchJobs();
      setSelectedJob(null); // ✅ reset selection when drawer opens
    }
  }, [open, machineId]);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const response = await axios.get(
        `${SCHEDULING_API_BASE_URL}/scheduling/machine-operations/${machineId || 1}`
      );
      if (response.status === 200) {
        setJobs(response.data.operations || []);
      }
    } catch (error) {
      console.error('Error fetching jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  // API already filters by machine — only apply part/priority/order filters here
  const filteredJobs = jobs.filter(job => {
    const searchMatch =
      !searchText || job.part_number === searchText;

    const priorityMatch =
      !priorityFilter || job.priority === priorityFilter;

    const orderMatch =
      !orderFilter || job.sale_order_number === orderFilter;

    return searchMatch && priorityMatch && orderMatch;
  });

  // Sort jobs by priority (lower numbers = higher priority)
  const sortedJobs = [...filteredJobs].sort((a, b) => {
    const priorityA = a.priority || 999;
    const priorityB = b.priority || 999;
    return priorityA - priorityB;
  });

  // Check if a job is completed based on status
  const isJobCompleted = (job) => {
    const status = (job.operation_status || job.status || '').toUpperCase();
    return status === 'COMPLETED';
  };

  const isJobInProgress = (job) => {
    const status = (job.operation_status || job.status || '').toUpperCase();
    return status === 'INPROGRESS' || status === 'IN-PROGRESS' || status === 'IN PROGRESS';
  };

  // Find the first non-completed job in priority order
  const firstAvailableJobIndex = sortedJobs.findIndex(job => !isJobCompleted(job));

  // Check if a job card should be enabled for clicking
  const isJobCardEnabled = (job, index) => {
    // Disable completed jobs completely
    if (isJobCompleted(job)) return false;
    
    // If no jobs are available, all are disabled
    if (firstAvailableJobIndex === -1) return false;
    
    // Only enable the first available (non-completed) job
    return index === firstAvailableJobIndex;
  };

  const handleResetFilters = () => {
    setSearchText('');
    setPriorityFilter(null);
    setOrderFilter(null);
  };

  const uniquePartNumbers = [...new Set(jobs.map(j => j.part_number))].filter(Boolean).sort();
  const uniquePriorities = [...new Set(jobs.map(j => j.priority))].filter(Boolean);
  const uniqueOrders = [...new Set(jobs.map(j => j.sale_order_number))].filter(Boolean);

  if (!machineId && !machineName) {
    return (
      <Drawer open={open} onClose={onClose} width={600} title="Job Selection">
        <Empty description="No machine selected. Please select a machine from the settings." />
      </Drawer>
    );
  }

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <Title level={4} style={{ margin: 0 }}>Job Selection</Title>
          <CloseCircleOutlined onClick={onClose} style={{ cursor: 'pointer', fontSize: 20, color: '#bfbfbf' }} />
        </div>
      }
      placement="right"
      onClose={onClose}
      open={open}
      width={600}
      closable={false}
      bodyStyle={{ padding: '24px' }}
      headerStyle={{ borderBottom: 'none', padding: '16px 24px' }}
    >
      <div style={{ marginBottom: 24 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#1677FF', marginBottom: 8 }}>
            <div style={{ background: '#E6F4FF', padding: '6px', borderRadius: '4px', display: 'flex' }}>
              <BuildOutlined style={{ fontSize: 16 }} />
            </div>
            <Text strong style={{ color: '#1677FF' }}>Jobs</Text>
          </div>

          <div>
            <Text strong style={{ fontSize: 16 }}>{filteredJobs.length} jobs available</Text>
          </div>

          <Row gutter={[12, 12]}>
            <Col span={8}>
              <Text type="secondary" style={{ fontSize: 11, fontWeight: 500 }}>Production Order</Text>
              <Select
                placeholder="Filter by order..."
                style={{ width: '100%' }}
                value={orderFilter}
                onChange={setOrderFilter}
                allowClear
                dropdownStyle={{ borderRadius: 6 }}
              >
                {uniqueOrders.map(o => (
                  <Option key={o} value={o}>{o}</Option>
                ))}
              </Select>
            </Col>
            <Col span={8}>
              <Text type="secondary" style={{ fontSize: 11, fontWeight: 500 }}>Part Number</Text>
              <Select
                placeholder="Filter by part no..."
                style={{ width: '100%' }}
                value={searchText || null}
                onChange={val => setSearchText(val || '')}
                allowClear
                dropdownStyle={{ borderRadius: 6 }}
              >
                {uniquePartNumbers.map(p => (
                  <Option key={p} value={p}>{p}</Option>
                ))}
              </Select>
            </Col>
            <Col span={8}>
              <Text type="secondary" style={{ fontSize: 11, fontWeight: 500 }}>Priority</Text>
              <Select
                placeholder="Filter by priority"
                style={{ width: '100%' }}
                value={priorityFilter}
                onChange={setPriorityFilter}
                allowClear
                dropdownStyle={{ borderRadius: 6 }}
              >
                {uniquePriorities.map(p => (
                  <Option key={p} value={p}>{p}</Option>
                ))}
              </Select>
            </Col>
          </Row>

          <div style={{ textAlign: 'right' }}>
            <Button type="default" onClick={handleResetFilters} style={{ borderRadius: 6 }}>
              Reset Filters
            </Button>
          </div>
        </Space>
      </div>

      <Spin spinning={loading}>
        {sortedJobs.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 80 }}>
            {sortedJobs.map((job, index) => {
              const isSelected = selectedJob?.schedule_id === job.schedule_id;
              const isEnabled = isJobCardEnabled(job, index);
              const isCompleted = isJobCompleted(job);
              
              return (
                <Card
                  key={job.schedule_id}
                  hoverable={isEnabled}
                  style={{
                    borderRadius: 12,
                    border: '1px solid #f0f0f0',
                    // Blue left border + light blue background when selected
                    borderLeft: isSelected ? '4px solid #1677FF' : '1px solid #f0f0f0',
                    background: isSelected ? '#F0F7FF' : (isEnabled ? '#fff' : '#f5f5f5'),
                    transition: 'all 0.2s ease',
                    opacity: isEnabled ? 1 : 0.6,
                    cursor: isEnabled ? 'pointer' : 'not-allowed',
                  }}
                  bodyStyle={{ padding: 16 }}
                  onClick={() => {
                    if (isEnabled) {
                      setSelectedJob(job);
                      onSelectJob(job);
                    }
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <Title level={4} style={{ margin: 0, color: isEnabled ? 'inherit' : '#8c8c8c' }}>
                        {job.part_number || 'N/A'}
                      </Title>
                      <Text type={isEnabled ? 'secondary' : 'secondary'} style={{ fontSize: 12, color: isEnabled ? 'inherit' : '#8c8c8c' }}>
                        {job.operation_name || 'No description'}
                      </Text>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <Tag color={isCompleted ? 'green' : (isJobInProgress(job) ? 'processing' : 'blue')} style={{ borderRadius: 4, margin: 0 }}>
                        {isCompleted ? 'Completed' : (isJobInProgress(job) ? 'In Progress' : `Priority ${job.priority || 'N/A'}`)}
                      </Tag>
                      {!isEnabled && !isCompleted && !isJobInProgress(job) && (
                        <Tag color="orange" style={{ borderRadius: 4, margin: 0, fontSize: 11 }}>
                          Blocked
                        </Tag>
                      )}
                    </div>
                  </div>

                  <Row gutter={[16, 16]}>
                    <Col span={12}>
                      <div style={{ marginBottom: 8 }}>
                        <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Production Order</Text>
                        <Text strong>{job.sale_order_number || 'N/A'}</Text>
                      </div>
                      <div>
                        <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Quantity</Text>
                        <Text strong>{job.total_quantity || 0}</Text>
                      </div>
                    </Col>
                    <Col span={12}>
                      <div style={{ marginBottom: 8 }}>
                        <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Total Operations</Text>
                        <Text strong>{job.total_operations || 1}</Text>
                      </div>
                      <div>
                        <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Remaining</Text>
                        <Text strong>
                          {Math.max(0, (job.total_quantity || 0) - ((job.produced_quantity || 0) - (job.rework_quantity || 0)))}
                        </Text>
                      </div>
                    </Col>
                  </Row>

                  <div style={{ marginTop: 12 }}>
                    <Space direction="vertical" size={2}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <CalendarOutlined style={{ color: '#52c41a' }} />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Start: {job.planned_start_time
                            ? (() => { const d = new Date(job.planned_start_time); return d.toLocaleDateString('en-GB').replace(/\//g, '-') + ', ' + d.toLocaleTimeString('en-GB'); })() : 'N/A'}
                        </Text>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <CalendarOutlined style={{ color: '#f5222d' }} />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          End: {job.planned_end_time
                            ? (() => { const d = new Date(job.planned_end_time); return d.toLocaleDateString('en-GB').replace(/\//g, '-') + ', ' + d.toLocaleTimeString('en-GB'); })() : 'N/A'}
                        </Text>
                      </div>
                    </Space>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <Empty description="No jobs found for this machine" />
        )}
      </Spin>

      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '16px 20px', background: '#fff', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <Button onClick={onClose}>Cancel</Button>
      </div>
    </Drawer>
  );
};

export default SelectJob;