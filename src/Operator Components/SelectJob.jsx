import React, { useState, useEffect } from 'react';
import { Drawer, Card, Select, Button, Tag, Typography, Row, Col, Space, Empty, Spin, Radio, message } from 'antd';
import { CalendarOutlined, BuildOutlined, CloseCircleOutlined } from '@ant-design/icons';
import axios from 'axios';
import { SCHEDULING_API_BASE_URL } from '../Config/schedulingconfig';
import {
  getJobRemainingQty,
  getJobTotalQty,
  isJobReviewCompleted,
  isJobReviewInProgress,
  jobStatusLabel,
  isUnitWiseJob,
} from '../PPS Components/scheduling/jobs/unitWiseJobUtils';
import {
  canSwitchSchedule,
  fetchSchedulingModes,
  jobAllowedOnSchedule,
  jobFilterEngines,
  persistScheduleMode,
  readPersistedScheduleMode,
  resolveScheduleMode,
} from '../PPS Components/scheduling/api/schedulingModesApi';

const { Text, Title } = Typography;
const { Option } = Select;

const formatJobDateTime = (value) => {
  if (!value) return 'N/A';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'N/A';
  return `${d.toLocaleDateString('en-GB').replace(/\//g, '-')}, ${d.toLocaleTimeString('en-GB')}`;
};

const SelectJob = ({ open, onClose, onSelectJob, currentSelectedJob }) => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [priorityFilter, setPriorityFilter] = useState(null);
  const [orderFilter, setOrderFilter] = useState(null);
  const [machineName, setMachineName] = useState('');
  const [machineId, setMachineId] = useState(null);
  const [schedulingModes, setSchedulingModes] = useState({
    shop_plan: 'batch',
    batch_scheduling: true,
    unit_wise_scheduling: false,
  });
  const [scheduleMode, setScheduleMode] = useState(
    () => resolveScheduleMode(
      { shop_plan: 'batch', batch_scheduling: true, unit_wise_scheduling: false },
      readPersistedScheduleMode()
    )
  );

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
    }
  }, [open, machineId]);

  const isSameJob = (job, selected) => {
    if (!job || !selected) return false;
    if (job.schedule_id != null && selected.schedule_id != null) {
      return job.schedule_id === selected.schedule_id;
    }
    const jobId = job.id || job.operation_id || job.job_id;
    const selectedId = selected.id || selected.operation_id || selected.job_id;
    return jobId != null && jobId === selectedId;
  };

  const getCardHighlightStyle = (isCompleted, isSelected) => {
    if (isCompleted) {
      return {
        border: '1px solid #f0f0f0',
        borderLeft: '4px solid #52c41a',
        background: '#f6ffed',
      };
    }
    if (isSelected) {
      return {
        border: '1px solid #f0f0f0',
        borderLeft: '4px solid #1677FF',
        background: '#F0F7FF',
      };
    }
    return {
      border: '1px solid #f0f0f0',
      background: '#fff',
    };
  };

  const mapUnitCards = (unitJobs) => (unitJobs || []).map((job) => {
    const bandQty = (job.unit_from != null && job.unit_to != null)
      ? Number(job.unit_to) - Number(job.unit_from) + 1
      : Number(job.quantity || 0);
    return {
      ...job,
      is_unit_wise: true,
      schedule_id: `unit-${job.order_id}-${job.part_id}-${job.operation_id}-${job.unit_from}-${job.unit_to}`,
      sale_order_number: job.order_number,
      sale_order_id: job.order_id,
      quantity: bandQty,
      total_quantity: bandQty,
      planned_start_time: job.planned_start,
      planned_end_time: job.planned_end,
      total_operations: 1,
    };
  });

  const fetchJobs = async (forcedMode = null) => {
    setLoading(true);
    try {
      const machineKey = machineId || 1;
      const modes = await fetchSchedulingModes({ machineId: machineKey, force: true }).catch(() => ({
        shop_plan: 'batch',
        batch_scheduling: true,
        unit_wise_scheduling: false,
        toggle_allowed: true,
        part_engines: {},
        machine_part_engines: {},
      }));
      setSchedulingModes(modes);
      let mode = forcedMode || resolveScheduleMode(modes, readPersistedScheduleMode());
      if (modes.in_progress_engine) {
        mode = modes.in_progress_engine;
        persistScheduleMode(mode);
      }
      setScheduleMode(mode);

      if (!mode) {
        setJobs([]);
        return;
      }

      const partEngines = jobFilterEngines(modes);
      const keepJob = (job) => jobAllowedOnSchedule(job, mode, partEngines);

      if (mode === 'unit_wise') {
        const res = await axios.get(
          `${SCHEDULING_API_BASE_URL}/scheduling/unit-wise/machine-jobs/${machineKey}`
        );
        const next = mapUnitCards(res.data?.jobs || []).filter(keepJob);
        setJobs(next);
        return;
      }

      const res = await axios.get(
        `${SCHEDULING_API_BASE_URL}/scheduling/machine-operations/${machineKey}`
      );
      const next = (res.data?.operations || []).map((job) => ({
        ...job,
        is_unit_wise: false,
      })).filter(keepJob);
      setJobs(next);
    } catch (error) {
      console.error('Error fetching jobs:', error);
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleScheduleModeChange = (mode) => {
    if (!canSwitchSchedule(schedulingModes)) {
      message.warning(
        schedulingModes.toggle_lock_reason
        || 'Finish or submit the open job card before switching schedule.'
      );
      return;
    }
    persistScheduleMode(mode);
    setScheduleMode(mode);
    fetchJobs(mode);
  };

  const isJobCompleted = (job) => isJobReviewCompleted(job);

  const isJobInProgress = (job) => isJobReviewInProgress(job);

  // ─── Sort ALL jobs by priority first (source of truth for lock order) ───────
  const allJobsSorted = [...jobs].sort((a, b) => {
    const priorityA = a.priority || 999;
    const priorityB = b.priority || 999;
    return priorityA - priorityB;
  });

  // ─── Apply filters for display only ─────────────────────────────────────────
  const filteredJobs = allJobsSorted.filter(job => {
    const searchMatch  = !searchText    || job.part_number      === searchText;
    const priorityMatch = !priorityFilter || job.priority        === priorityFilter;
    const orderMatch   = !orderFilter   || job.sale_order_number === orderFilter;
    return searchMatch && priorityMatch && orderMatch;
  });

  const handleResetFilters = () => {
    setSearchText('');
    setPriorityFilter(null);
    setOrderFilter(null);
  };

  const uniquePartNumbers = [...new Set(jobs.map(j => j.part_number))].filter(Boolean).sort();
  const uniquePriorities  = [...new Set(jobs.map(j => j.priority))].filter(Boolean);
  const uniqueOrders      = [...new Set(jobs.map(j => j.sale_order_number))].filter(Boolean);

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

          {schedulingModes.shop_plan && (
            <Tag color={scheduleMode === 'unit_wise' ? 'purple' : 'blue'}>
              {scheduleMode === 'unit_wise'
                ? 'Shop floor follows unit-wise'
                : 'Shop floor follows batch'}
            </Tag>
          )}
          {!schedulingModes.shop_plan && schedulingModes.batch_scheduling && schedulingModes.unit_wise_scheduling && (
            <div>
              <Text type="secondary" style={{ fontSize: 11, fontWeight: 500, display: 'block', marginBottom: 6 }}>
                Schedule
              </Text>
              <Radio.Group
                value={scheduleMode}
                onChange={(e) => handleScheduleModeChange(e.target.value)}
                optionType="button"
                buttonStyle="solid"
                disabled={!canSwitchSchedule(schedulingModes)}
                options={[
                  { label: 'Unit-wise', value: 'unit_wise' },
                  { label: 'Batch', value: 'batch' },
                ]}
              />
              {!canSwitchSchedule(schedulingModes) && schedulingModes.toggle_lock_reason && (
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
                  {schedulingModes.toggle_lock_reason}
                </Text>
              )}
            </div>
          )}
          {!schedulingModes.shop_plan && scheduleMode === 'unit_wise' && !schedulingModes.batch_scheduling && (
            <Tag color="purple">Unit-wise schedule</Tag>
          )}
          {!schedulingModes.shop_plan && scheduleMode === 'batch' && !schedulingModes.unit_wise_scheduling && (
            <Tag color="blue">Batch schedule</Tag>
          )}
          {!scheduleMode && (
            <Empty description="No live schedule is enabled for this shop floor." />
          )}

          <div>
            <Text strong style={{ fontSize: 16 }}>{filteredJobs.length} jobs available</Text>
          </div>

          <Row gutter={[12, 12]}>
            <Col span={8}>
              <Text type="secondary" style={{ fontSize: 11, fontWeight: 500 }}>Project</Text>
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
        {filteredJobs.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 80 }}>
            {filteredJobs.map((job) => {
              const isSelected  = isSameJob(job, currentSelectedJob);
              const isCompleted = isJobCompleted(job);
              const hasBlockReason = job.blocked_by && job.blocked_by.length > 0;
              const cardHighlightStyle = getCardHighlightStyle(isCompleted, isSelected);

              return (
                <Card
                  key={job.schedule_id}
                  hoverable={!isCompleted}
                  style={{
                    borderRadius: 12,
                    transition: 'all 0.2s ease',
                    cursor: isCompleted ? 'not-allowed' : 'pointer',
                    opacity: isCompleted ? 0.85 : 1,
                    pointerEvents: isCompleted ? 'none' : 'auto',
                    ...cardHighlightStyle,
                  }}
                  bodyStyle={{ padding: 16 }}
                  onClick={() => {
                    if (isCompleted) return;
                    onSelectJob(job);
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <Title level={4} style={{ margin: 0 }}>
                        {job.part_number || 'N/A'}
                      </Title>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {job.operation_name || 'No description'}
                      </Text>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      {job.is_unit_wise && (
                        <Tag color="purple" style={{ borderRadius: 4, margin: 0 }}>
                          Unit wise
                        </Tag>
                      )}
                      <Tag color="blue" style={{ borderRadius: 4, margin: 0 }}>
                        Priority {job.priority ?? 'N/A'}
                      </Tag>
                      <Tag
                        color={isCompleted ? 'green' : (isJobInProgress(job) ? 'processing' : 'default')}
                        style={{ borderRadius: 4, margin: 0 }}
                      >
                        {jobStatusLabel(job)}
                      </Tag>
                    </div>
                  </div>

                  <Row gutter={[16, 16]}>
                    <Col span={12}>
                      <div style={{ marginBottom: 8 }}>
                        <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Project Details</Text>
                        <Text strong>{job.sale_order_number || 'N/A'}</Text>
                      </div>
                      <div>
                        <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Quantity</Text>
                        <Text strong>
                          {isUnitWiseJob(job) && job.unit_from != null
                            ? `${getJobTotalQty(job)} (units ${job.unit_from}–${job.unit_to})`
                            : getJobTotalQty(job)}
                        </Text>
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
                          {getJobRemainingQty(job)}
                        </Text>
                      </div>
                    </Col>
                  </Row>

                  {/* Block Reason Message */}
                  {hasBlockReason && (
                    <div style={{ 
                      marginTop: 12, 
                      padding: 12, 
                      background: '#fff2e8', 
                      border: '1px solid #ffbb96', 
                      borderRadius: 6,
                      marginBottom: 12 
                    }}>
                      <Text style={{ color: '#8c4a00', fontSize: 12, lineHeight: 1.4 }}>
                        {job.block_reason || 'Prior operation(s) must be completed first.'}
                      </Text>
                    </div>
                  )}

                  <div style={{ marginTop: 12 }}>
                    <Space direction="vertical" size={2}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <CalendarOutlined style={{ color: '#52c41a' }} />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Start: {formatJobDateTime(job.planned_start_time)}
                        </Text>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <CalendarOutlined style={{ color: '#f5222d' }} />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          End: {formatJobDateTime(job.planned_end_time)}
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