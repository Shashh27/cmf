import React, { useEffect, useRef, useState } from 'react';
import { Card, Row, Col, Typography, Button, Tag, Space, DatePicker, Select, Input, Tabs, Badge, Modal } from 'antd';
import { DashboardOutlined, ClockCircleOutlined, ProfileOutlined, ContainerOutlined, SettingOutlined, FileTextOutlined, DownloadOutlined, WarningOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import PokaYokeChecklist from './PokaYokeChecklist';
import ReportIssue from './ReportIssue';
import SelectJob from './SelectJob';
import PartDocumentTab from './PartDocumentTab';
import MCResponseRework from './MCResponseRework';
import { API_BASE_URL } from '../Config/auth.js';
import { SCHEDULING_API_BASE_URL } from '../Config/schedulingconfig.js';
import { message } from 'antd';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;
const { TabPane } = Tabs;

const isRejectedCheckpoint = (item) =>
  item?.needs_resubmit === true
  || String(item?.latest_submission_status ?? '').toLowerCase() === 'rejected';

const normalizeDueCheckpoint = (cp) => ({
  id: cp.checklist_item_id ?? cp.assignment_item_id ?? cp.id,
  checklist_item_id: cp.checklist_item_id,
  assignment_item_id: cp.assignment_item_id,
  schedule_id: cp.schedule_id,
  sequence_number: cp.sequence_number ?? cp.checklist_item?.sequence_number,
  item_text: cp.item_text ?? cp.checkpoint_name ?? cp.checklist_item?.item_text ?? cp.name,
  item_type: cp.item_type ?? cp.checklist_item?.item_type,
  expected_value: cp.expected_value ?? cp.checklist_item?.expected_value,
  frequency_type: cp.frequency_type ?? cp.frequency ?? cp.checklist_item?.frequency_type,
  interval_value: cp.interval_value ?? cp.checklist_item?.interval_value,
  interval_unit: cp.interval_unit ?? cp.checklist_item?.interval_unit,
  is_required: cp.is_required ?? cp.checklist_item?.is_required ?? true,
  next_due_date: cp.next_due_date,
  is_due: cp.is_due ?? true,
  has_pending_submission: cp.has_pending_submission ?? false,
  latest_submission_status: cp.latest_submission_status,
  needs_resubmit: cp.needs_resubmit ?? false,
  rejection_comments: cp.rejection_comments,
});

const normalizeDueAssignment = (raw) => {
  const checkpoints = (raw.checkpoints ?? raw.due_items ?? raw.items ?? []).map(normalizeDueCheckpoint);
  return {
    assignment_id: raw.assignment_id ?? raw.id,
    checklist_id: raw.checklist_id,
    checklist: {
      id: raw.checklist_id,
      name: raw.checklist_name ?? raw.checklist?.name ?? `Checklist #${raw.checklist_id}`,
      items: checkpoints,
    },
  };
};

const parseDueSchedulesResponse = (data) => {
  const rawList = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.schedules)
        ? data.schedules
        : [];

  if (rawList.length > 0 && (rawList[0].checkpoints || rawList[0].checklist)) {
    const assignments = rawList.map(normalizeDueAssignment);
    const pmDueToday = [];
    assignments.forEach((assignment) => {
      (assignment.checklist?.items ?? []).forEach((item) => {
        pmDueToday.push({
          checklist_name: assignment.checklist.name,
          checkpoint_name: item.item_text,
          frequency: item.frequency_type,
          frequency_type: item.frequency_type,
          interval_value: item.interval_value,
          interval_unit: item.interval_unit,
        });
      });
    });
    return { assignments, pmDueToday };
  }

  const assignmentMap = new Map();
  const pmDueToday = [];

  rawList.forEach((item) => {
    const checklistItem = item.checklist_item ?? {};
    const checklistId = item.checklist_id ?? checklistItem.checklist_id ?? item.checklist?.id ?? 'unknown';
    const checklistName = item.checklist_name ?? item.checklist?.name ?? `Checklist #${checklistId}`;
    const checkpointName = item.item_text ?? item.checkpoint_name ?? checklistItem.item_text ?? item.name;

    pmDueToday.push({
      checklist_name: checklistName,
      checkpoint_name: checkpointName,
      frequency: item.frequency_type ?? item.frequency ?? checklistItem.frequency_type,
      frequency_type: item.frequency_type ?? item.frequency ?? checklistItem.frequency_type,
      interval_value: item.interval_value ?? checklistItem.interval_value,
      interval_unit: item.interval_unit ?? checklistItem.interval_unit,
    });

    if (!assignmentMap.has(checklistId)) {
      assignmentMap.set(checklistId, {
        assignment_id: item.assignment_id,
        checklist_id: checklistId,
        checklist_name: checklistName,
        checkpoints: [],
      });
    }
    assignmentMap.get(checklistId).checkpoints.push({
      ...item,
      item_text: checkpointName,
      frequency_type: item.frequency_type ?? checklistItem.frequency_type,
      interval_value: item.interval_value ?? checklistItem.interval_value,
      interval_unit: item.interval_unit ?? checklistItem.interval_unit,
      sequence_number: item.sequence_number ?? checklistItem.sequence_number,
      expected_value: item.expected_value ?? checklistItem.expected_value,
      is_required: item.is_required ?? checklistItem.is_required,
      checklist_item_id: item.checklist_item_id ?? checklistItem.id,
    });
  });

  const assignments = Array.from(assignmentMap.values()).map(normalizeDueAssignment);
  return { assignments, pmDueToday };
};

const fetchDueSchedules = async (machineId) => {
  const res = await fetch(`${API_BASE_URL}/pm/schedules/machine/${machineId}/due`, {
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to fetch due schedules');
  const data = await res.json();
  return parseDueSchedulesResponse(data);
};

const formatFrequency = (item) => {
  const ft = (item.frequency_type ?? item.frequency ?? '').toLowerCase();
  if (ft === 'time based') {
    const v = item.interval_value;
    const u = item.interval_unit ?? '';
    if (!v && !u) return 'Time Based';
    return `Every ${v ?? ''} ${u}${v > 1 ? 's' : ''}`.trim();
  }
  if (ft === 'usage based') return item.trigger_hours ? `Every ${item.trigger_hours} hrs` : 'Usage Based';
  if (ft === 'condition based') return item.inspection_interval ? `${item.inspection_interval} inspection` : 'Condition Based';
  return item.frequency_type ?? item.frequency ?? '—';
};

const Dashboard = () => {
  const [machineStatus] = useState('ON');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [machineName, setMachineName] = useState('');
  const [docFilter, setDocFilter] = useState('All Documents');
  const [showChecklist, setShowChecklist] = useState(false);
  const [machineId, setMachineId] = useState(null);
  const [showReportIssue, setShowReportIssue] = useState(false);
  const [showSelectJob, setShowSelectJob] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [productName, setProductName] = useState(null);
  const [checklistPending, setChecklistPending] = useState(false);
  const [rejectedChecklists, setRejectedChecklists] = useState([]);
  const [isActivated, setIsActivated] = useState(false);
  const [completedQuantity, setCompletedQuantity] = useState(0);
  const [productionStats, setProductionStats] = useState({
    totalProduced: 0,
    totalRework: 0,
    totalApproved: 0,
    hasRework: false,
    reworkRemarks: ''
  });
  const [jobStatsMap, setJobStatsMap] = useState({});
  const [latestHelpReply, setLatestHelpReply] = useState(null);

  const [cachedAssignments, setCachedAssignments] = useState([]);
  const [cachedLogs, setCachedLogs] = useState([]);
  const [cachedApprovalStatuses, setCachedApprovalStatuses] = useState({});
  const [pmItemsDueToday, setPmItemsDueToday] = useState([]);

  useEffect(() => {
    try {
      const storedJob = localStorage.getItem('selectedJob');
      const storedActivation = localStorage.getItem('isActivated');
      if (storedJob) {
        const job = JSON.parse(storedJob);
        setSelectedJob(job);
        if (storedActivation) {
          setIsActivated(JSON.parse(storedActivation));
        }
        const operationId = job.id || job.operation_id || job.job_id || job.schedule_id;
        fetchReworkData(operationId);
        if (job.sale_order_id) {
          fetchOrderDetails(job.sale_order_id);
        }
      }
    } catch (e) {
      console.error('Error loading selected job from localStorage', e);
    }
  }, []);

  const checklistStatusFetchedRef = useRef(false);

  const fetchLatestReply = async (mId) => {
    if (!mId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/maintenance/help-support`);
      if (res.ok) {
        const data = await res.json();
        const machineReplies = data
          .filter(item => item.machine_id === mId && item.mc_reply)
          .sort((a, b) => b.id - a.id);
        if (machineReplies.length > 0) {
          setLatestHelpReply(machineReplies[0]);
        } else {
          setLatestHelpReply(null);
        }
      }
    } catch (error) {
      console.error('Error fetching help reply:', error);
    }
  };

  const fetchOrderDetails = async (saleOrderId) => {
    if (!saleOrderId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/orders/${saleOrderId}`);
      if (res.ok) {
        const order = await res.json();
        setProductName(order.product_name);
      }
    } catch (error) {
      console.error('Error fetching order details:', error);
    }
  };

  const fetchReworkData = async (operationId) => {
    if (!operationId) {
      setProductionStats({ totalProduced: 0, totalRework: 0, totalApproved: 0, hasRework: false, reworkRemarks: '' });
      return;
    }
    try {
      const response = await fetch(`${SCHEDULING_API_BASE_URL}/production-logs/operation/${operationId}?skip=0`);
      if (response.ok) {
        const logs = await response.json();
        const sortedLogs = logs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        const latestLog = sortedLogs.length > 0 ? sortedLogs[0] : null;
        const totalProducedSum = logs.reduce((sum, log) => sum + (log.produced_quantity || 0), 0);
        const totalReworkSum = logs.reduce((sum, log) => sum + (log.rework_quantity || 0), 0);
        const totalApprovedSum = logs.reduce((sum, log) => sum + (log.approved_quantity || 0), 0);

        if (latestLog) {
          const stats = {
            totalProduced: totalProducedSum,
            totalRework: totalReworkSum,
            totalApproved: totalApprovedSum,
            latestProduced: latestLog.produced_quantity || 0,
            latestApproved: latestLog.approved_quantity || 0,
            latestRework: latestLog.rework_quantity || 0,
            latestRejected: latestLog.rejected_quantity || 0,
            latestRemarks: latestLog.remarks || '',
            hasRework: (latestLog.rework_quantity || 0) > 0 || (latestLog.rejected_quantity || 0) > 0,
            reworkRemarks: latestLog.remarks || '',
            operatorStatus: latestLog.operator_status,
            activationTime: latestLog.from_date && latestLog.from_time ? `${latestLog.from_date} ${latestLog.from_time}` : null
          };
          setProductionStats(stats);
          const opStatus = latestLog.operator_status?.toString().toUpperCase();
          if (opStatus === 'INPROGRESS' || opStatus === 'IN-PROGRESS' || opStatus === 'IN PROGRESS') {
            setIsActivated(true);
          }
        } else {
          setProductionStats({ totalProduced: 0, totalRework: 0, totalApproved: 0, hasRework: false, reworkRemarks: '' });
        }
      } else {
        setProductionStats({ totalProduced: 0, totalRework: 0, totalApproved: 0, hasRework: false, reworkRemarks: '' });
      }
    } catch (error) {
      console.error('Error fetching production stats:', error);
      setProductionStats({ totalProduced: 0, totalRework: 0, totalApproved: 0, hasRework: false, reworkRemarks: '' });
    }
  };

  const fetchJobStatsMap = async (ops) => {
    if (!ops || ops.length === 0) return;
    const results = await Promise.allSettled(
      ops.map(async (job) => {
        const opId = job.id || job.operation_id || job.job_id || job.schedule_id;
        if (!opId) return { opId: null, totalApproved: 0, operatorStatus: null };
        try {
          const r = await fetch(`${SCHEDULING_API_BASE_URL}/production-logs/operation/${opId}?skip=0`);
          if (!r.ok) return { opId, totalApproved: 0, operatorStatus: null };
          const logs = await r.json();
          const totalApproved = logs.reduce((sum, log) => sum + (log.approved_quantity || 0), 0);
          const sortedLogs = logs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          const operatorStatus = sortedLogs.length > 0 ? sortedLogs[0].operator_status : null;
          const activationTime = sortedLogs.length > 0 && sortedLogs[0].from_date && sortedLogs[0].from_time
            ? `${sortedLogs[0].from_date} ${sortedLogs[0].from_time}`
            : null;
          return { opId, totalApproved, operatorStatus, activationTime };
        } catch {
          return { opId, totalApproved: 0, operatorStatus: null, activationTime: null };
        }
      })
    );
    const map = {};
    results.forEach((r) => {
      if (r.status === 'fulfilled' && r.value.opId != null) {
        map[r.value.opId] = {
          totalApproved: r.value.totalApproved,
          operatorStatus: r.value.operatorStatus,
          activationTime: r.value.activationTime
        };
      }
    });
    setJobStatsMap(map);
  };

  useEffect(() => {
    try {
      const stored = localStorage.getItem('selectedMachine');
      if (stored) {
        const m = JSON.parse(stored);
        const candidate =
          m?.name ||
          [m?.type, m?.make, m?.model].filter(Boolean).join('-') ||
          '';
        setMachineName(candidate);
        const id = m?.id ?? m?.machine_id ?? m?.machineId ?? m?.machine?.id ?? null;
        setMachineId(id);
        fetchLatestReply(id);
      }
    } catch (e) {
      setMachineName('');
      setMachineId(null);
    }
  }, []);

  useEffect(() => {
    if (!machineId) return;
    if (showChecklist) return;
    if (checklistStatusFetchedRef.current) return;
    checklistStatusFetchedRef.current = true;

    const checkChecklistStatus = async () => {
      try {
        const { assignments, pmDueToday } = await fetchDueSchedules(machineId);

        setCachedAssignments(assignments);
        setPmItemsDueToday(pmDueToday);
        setChecklistPending(pmDueToday.length > 0);

        if (assignments.length === 0) {
          setCachedLogs([]);
          setCachedApprovalStatuses({});
          setRejectedChecklists([]);
          return;
        }
      } catch (error) {
        console.error('Error checking checklist status:', error);
        setPmItemsDueToday([]);
        setCachedAssignments([]);
        setChecklistPending(false);
      }
    };

    checkChecklistStatus();
  }, [machineId, showChecklist]);

  const handleChecklistClose = (wasSubmitted = false) => {
    setShowChecklist(false);
    if (wasSubmitted) {
      checklistStatusFetchedRef.current = false;
    } else {
      const restoreAssignments = async () => {
        try {
          const { assignments, pmDueToday } = await fetchDueSchedules(machineId);
          setCachedAssignments(assignments);
          setPmItemsDueToday(pmDueToday);
          setChecklistPending(pmDueToday.length > 0);
        } catch (error) {
          console.error('Error restoring assignments:', error);
        }
      };
      restoreAssignments();
    }
  };

  const [pmSubmitModalOpen, setPmSubmitModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checkpointResponses, setCheckpointResponses] = useState({});

  const allPmDueItems = cachedAssignments.flatMap((assignment) =>
    (assignment.checklist?.items ?? []).map((item) => ({
      ...item,
      checklistName: assignment.checklist?.name,
    }))
  );
  const allPmAnswered = allPmDueItems.length > 0
    && allPmDueItems.every((item) => checkpointResponses[item.id] !== undefined);
  const pmNeedsRedo = allPmDueItems.some(isRejectedCheckpoint);

  const handlePmSubmit = async () => {
    setSubmitting(true);
    try {
      const items = allPmDueItems;

      if (items.length === 0) {
        message.warning('No checkpoints due today');
        return;
      }

      const unanswered = items.filter((item) => checkpointResponses[item.id] === undefined);
      if (unanswered.length > 0) {
        message.warning('Please answer all checkpoints before submitting');
        return;
      }

      // Get operator ID from localStorage
      let operatorId = null;
      try {
        const raw = localStorage.getItem('selectedOperator')
                 ?? localStorage.getItem('operator')
                 ?? localStorage.getItem('selectedUser')
                 ?? localStorage.getItem('user');
        if (raw) {
          let operator;
          try { operator = JSON.parse(raw); } catch { operator = raw; }
          operatorId = operator?.id || operator?.operator_id || operator?.operatorId || operator?.user_id || operator?.userId || operator?.user?.id;
        }
      } catch (e) {
        console.error('Error parsing operator ID:', e);
      }

      if (!operatorId) {
        message.error('Operator not found in session. Please log in again.');
        return;
      }

      const submissions = items
        .map((item) => {
          if (!item.schedule_id || !item.assignment_item_id) {
            throw new Error(`Missing schedule or assignment info for checkpoint: ${item.item_text ?? item.id}`);
          }
          const response = checkpointResponses[item.id] || item.expected_value || 'yes';
          return {
            schedule_id: item.schedule_id,
            assignment_item_id: item.assignment_item_id,
            response_value: String(response).toLowerCase(),
            operator_comments: '',
          };
        })
        .filter(Boolean);

      const res = await fetch(`${API_BASE_URL}/pm/operator/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          operator_id: Number(operatorId),
          submissions,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail = err?.detail;
        throw new Error(
          typeof detail === 'string' ? detail : detail ? JSON.stringify(detail) : 'Submission failed'
        );
      }

      message.success('All checkpoints submitted successfully');
      checklistStatusFetchedRef.current = false;
      setPmSubmitModalOpen(false);
      setCheckpointResponses({});
      
      // Refresh data
      const { assignments, pmDueToday } = await fetchDueSchedules(machineId);
      setCachedAssignments(assignments);
      setPmItemsDueToday(pmDueToday);
      setChecklistPending(pmDueToday.length > 0);
    } catch (error) {
      console.error('Submission error:', error);
      message.error('Failed to submit checklist');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenPmSubmit = () => {
    setCheckpointResponses({});
    setPmSubmitModalOpen(true);
  };

  const handleClosePmSubmit = () => {
    setPmSubmitModalOpen(false);
    setCheckpointResponses({});
  };

  const handlePmResponse = (itemId, value) => {
    setCheckpointResponses((prev) => ({ ...prev, [itemId]: value }));
  };

  useEffect(() => {
    const id = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => { clearInterval(id); };
  }, [machineId]);

  const handleSelectJobClick = () => {
      setShowSelectJob(true);
  };

  const handleProductionSubmit = (submittedQuantity) => {
    setCompletedQuantity(prev => prev + submittedQuantity);
    const operationId = selectedJob?.id || selectedJob?.operation_id || selectedJob?.job_id || selectedJob?.schedule_id;
    if (operationId) {
      fetchReworkData(operationId);
    }
  };

  const [cardHeight, setCardHeight] = useState(320);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      setCardHeight(w < 992 ? 'auto' : 320);
      setIsMobile(w < 768);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const docTabs = ['All Documents', 'MPP', 'Drawing', 'CNC Programs', 'Raw Materials', 'Tools'];
  const keyFromLabel = (l) => l.toLowerCase().replace(/\s+/g, '_');
  const labelFromKey = (k) => docTabs.find((l) => keyFromLabel(l) === k) || 'All Documents';

  // Helper to format datetime
  const formatDateTime = (dtStr) => {
    if (!dtStr) return 'N/A';
    const d = new Date(dtStr);
    return d.toLocaleDateString('en-GB').replace(/\//g, '-') + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };

  const plannedQty = selectedJob?.planned_quantity ?? selectedJob?.quantity ?? 0;
  const completedQty = productionStats?.totalApproved ?? 0;
  const remainingQty = Math.max(0, plannedQty - completedQty);

  return (
    <div style={{ padding: '16px', background: 'transparent', overflowX: 'hidden' }}>

      {/* ── Header ── */}
      <Card
        style={{ borderRadius: 16, marginBottom: 16, borderColor: '#e5e7eb' }}
        bodyStyle={{
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <DashboardOutlined style={{ color: '#1677FF', fontSize: 20 }} />
          <div>
            <Title level={4} style={{ margin: 0, color: '#0f172a', fontWeight: 700 }}>
              {machineName || 'CNCM-DMU-60T'}
            </Title>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Text style={{ color: '#64748b', fontSize: 13 }}>
            {currentTime.toLocaleDateString('en-GB').replace(/\//g, '-')}{', '}
            {currentTime.toLocaleTimeString()}
          </Text>
          <Button type="primary" size="large" onClick={handleSelectJobClick}>
            Select Job
          </Button>
        </div>
      </Card>

      {/* ── Top Row ── */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>

        {/* Current Job Card */}
        <Col xs={24} lg={12}>
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ContainerOutlined style={{ color: '#1677FF' }} />
                <span>Current Job</span>
              </div>
            }
            style={{ borderRadius: 16, height: cardHeight, display: 'flex', flexDirection: 'column' }}
            headStyle={{ borderRadius: '16px 16px 0 0' }}
            bodyStyle={{ padding: 16, display: 'flex', flexDirection: 'column', flex: 1, overflow: 'auto', gap: 16 }}
          >
            {/* ── Row 1: Production Order | Part Number | Start+End Time | Status ── */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1.5fr auto',
              gap: 16,
              alignItems: 'start',
              paddingBottom: 16,
              borderBottom: '1px solid #f0f0f0',
            }}>
              {/* Production Order */}
              <div>
                <Text style={{ color: '#94a3b8', fontSize: 12 }}>Production Order</Text>
                <div style={{ fontWeight: 700, color: '#1677FF', fontSize: 14, marginTop: 4 }}>
                  {selectedJob?.sale_order_number || selectedJob?.production_order || 'None'}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  {productName || 'None'}
                </div>
              </div>

              {/* Part Number */}
              <div>
                <Text style={{ color: '#94a3b8', fontSize: 12 }}>Part Number</Text>
                <div style={{ fontWeight: 700, color: '#1677FF', fontSize: 14, marginTop: 4 }}>
                  {selectedJob?.part_number || 'None'}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  {selectedJob?.part_name || 'No description'}
                </div>
              </div>

              {/* Start & End Time */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Start */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <ClockCircleOutlined style={{ color: '#52c41a', fontSize: 13 }} />
                    <Text style={{ color: '#94a3b8', fontSize: 12 }}>Start Time</Text>
                  </div>
                  <div style={{ fontWeight: 600, color: '#52c41a', fontSize: 13, marginTop: 2 }}>
                    {formatDateTime(selectedJob?.planned_start_time)}
                  </div>
                </div>
                {/* End */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <ClockCircleOutlined style={{ color: '#f5222d', fontSize: 13 }} />
                    <Text style={{ color: '#94a3b8', fontSize: 12 }}>End Time</Text>
                  </div>
                  <div style={{ fontWeight: 600, color: '#f5222d', fontSize: 13, marginTop: 2 }}>
                    {formatDateTime(selectedJob?.planned_end_time)}
                  </div>
                </div>
              </div>

              {/* Status */}
              <div>
                <Text style={{ color: '#94a3b8', fontSize: 12 }}>Status</Text>
                <div style={{ marginTop: 6 }}>
                  {isActivated ? (
                    <Tag
                      color="processing"
                      style={{ borderRadius: 20, fontWeight: 600, fontSize: 12, padding: '2px 12px' }}
                    >
                      In Progress
                    </Tag>
                  ) : (
                    <Tag
                      style={{
                        borderRadius: 20,
                        fontWeight: 600,
                        fontSize: 12,
                        padding: '2px 12px',
                        color: '#94a3b8',
                        borderColor: '#d9d9d9',
                        background: '#fafafa',
                      }}
                    >
                      Not Started
                    </Tag>
                  )}
                </div>
              </div>
            </div>

            {/* ── Preventive Maintenance Section ── */}
            {pmItemsDueToday.length > 0 && (
              <div style={{
                padding: 12,
                background: '#FFF7E6',
                border: '1px solid #FFD591',
                borderRadius: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <WarningOutlined style={{ color: '#FA8C16', fontSize: 14 }} />
                    <Text strong style={{ color: '#FA8C16', fontSize: 13 }}>Preventive Maintenance (PM) Due Today</Text>
                  </div>
                  <Button
                    size="small"
                    type="primary"
                    danger={pmNeedsRedo}
                    onClick={handleOpenPmSubmit}
                    style={{ borderRadius: 4, fontSize: 12 }}
                  >
                    {pmNeedsRedo ? 'Redo' : 'Submit'}
                  </Button>
                </div>
                {/* Group by checklist */}
                {(() => {
                  const groupedByChecklist = {};
                  pmItemsDueToday.forEach(pm => {
                    if (!groupedByChecklist[pm.checklist_name]) {
                      groupedByChecklist[pm.checklist_name] = [];
                    }
                    groupedByChecklist[pm.checklist_name].push(pm);
                  });
                  return Object.entries(groupedByChecklist).map(([checklistName, items], idx) => (
                    <div key={idx} style={{
                      marginBottom: idx < Object.keys(groupedByChecklist).length - 1 ? 12 : 0,
                      padding: 10,
                      background: '#fff',
                      border: '1px solid #FFE7BA',
                      borderRadius: 6,
                    }}>
                      <Text strong style={{ color: '#D48806', fontSize: 13, display: 'block', marginBottom: 6 }}>
                        {checklistName}
                      </Text>
                      {items.map((pm, pmIdx) => (
                        <div key={pmIdx} style={{ fontSize: 12, color: '#8C4A00', marginBottom: pmIdx < items.length - 1 ? 4 : 0, marginLeft: 8 }}>
                          <strong>•</strong> {pm.checkpoint_name}
                          <span style={{ marginLeft: 8, color: '#A08000' }}>
                            ({pm.frequency_type || pm.frequency}{pm.interval_value && pm.interval_unit && ` - ${pm.interval_value} ${pm.interval_unit}`})
                          </span>
                        </div>
                      ))}
                    </div>
                  ));
                })()}
              </div>
            )}
          </Card>
        </Col>

        {/* MC Response & Rework Card */}
        <Col xs={24} lg={12}>
          <MCResponseRework
            productionStats={productionStats}
            latestHelpReply={latestHelpReply}
            cardHeight={cardHeight}
            onReportIssue={() => setShowReportIssue(true)}
          />
        </Col>
      </Row>

      {/* ── Bottom Row ── */}
      <Row gutter={[16, 16]} style={{ marginTop: 24, marginBottom: 8 }}>

        {/* Documents / Operations */}
        <Col xs={24} lg={24}>
          <PartDocumentTab
            selectedJob={selectedJob}
            isActivated={isActivated}
            onActivate={() => setIsActivated(true)}
            completedQuantity={completedQuantity}
            productionStats={productionStats}
          />
        </Col>
      </Row>

      {/* ── Modals ── */}
      <PokaYokeChecklist
        open={showChecklist}
        onClose={handleChecklistClose}
        machineId={machineId}
        initialAssignments={cachedAssignments}
        initialLogs={cachedLogs}
        initialApprovalStatuses={cachedApprovalStatuses}
      />
      <ReportIssue
        open={showReportIssue}
        onClose={() => setShowReportIssue(false)}
        machineId={machineId}
      />
      <SelectJob
        open={showSelectJob}
        onClose={() => setShowSelectJob(false)}
        jobStatsMap={jobStatsMap}
        onJobsLoaded={fetchJobStatsMap}
        onSelectJob={(job) => {
          setSelectedJob(job);
          const isJobActivated = [job.status, job.operation_status].some(s => {
            const up = s?.toString().toUpperCase();
            return up === 'INPROGRESS' || up === 'IN-PROGRESS' || up === 'IN PROGRESS';
          });
          setIsActivated(isJobActivated);
          setShowSelectJob(false);
          const operationId = job.id || job.operation_id || job.job_id || job.schedule_id;
          fetchReworkData(operationId);
          if (job.sale_order_id) {
            fetchOrderDetails(job.sale_order_id);
          }
          localStorage.setItem('selectedJob', JSON.stringify(job));
          localStorage.setItem('isActivated', JSON.stringify(isJobActivated));
        }}
      />

      <Modal
        open={pmSubmitModalOpen}
        onCancel={handleClosePmSubmit}
        title={(
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SafetyCertificateOutlined style={{ color: '#1677ff', fontSize: 18 }} />
            <Text strong style={{ fontSize: 15 }}>Checklist Details</Text>
          </div>
        )}
        width={860}
        footer={[
          <Button key="cancel" onClick={handleClosePmSubmit}>Cancel</Button>,
          <Button
            key="submit"
            type="primary"
            danger={pmNeedsRedo}
            loading={submitting}
            disabled={!allPmAnswered}
            onClick={handlePmSubmit}
          >
            {pmNeedsRedo ? 'Redo All' : 'Submit All'}
          </Button>,
        ]}
        destroyOnClose
        styles={{ body: { overflow: 'hidden', padding: '12px 24px' } }}
      >
        <style>{`
          .pm-submit-table { width: 100%; border-collapse: collapse; font-size: 13px; }
          .pm-submit-table thead > tr > th {
            background: linear-gradient(to bottom, #f0f5ff, #e6f0ff);
            font-weight: 600;
            border-bottom: 2px solid #1890ff;
            padding: 10px 12px;
            color: #111827;
            position: sticky;
            top: 0;
            z-index: 1;
          }
          .pm-submit-table tbody > tr > td {
            border-bottom: 1px solid #f0f0f0;
            padding: 10px 12px;
            vertical-align: middle;
            background: #fff;
          }
          .pm-submit-table tbody > tr:hover > td { background: #f0f8ff !important; }
        `}</style>
        <div style={{
          maxHeight: 492,
          overflowY: 'auto',
          overflowX: 'hidden',
          paddingRight: 4,
        }}>
        {cachedAssignments.map((assignment) => {
          const items = assignment.checklist?.items ?? [];
          if (items.length === 0) return null;
          const checklistName = assignment.checklist?.name ?? `Checklist #${assignment.checklist_id}`;

          return (
            <Card
              key={assignment.checklist_id ?? checklistName}
              style={{
                marginBottom: 16,
                borderRadius: 12,
                border: '1px solid #e5e7eb',
                boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              }}
              styles={{ body: { padding: 16 } }}
            >
              <Text strong style={{ fontSize: 14, color: '#111827', display: 'block', marginBottom: 12 }}>
                {checklistName}
              </Text>
              <div style={{ overflow: 'hidden', borderRadius: 8, border: '1px solid #f0f0f0' }}>
                <table className="pm-submit-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', width: '38%' }}>Checkpoint</th>
                      <th style={{ textAlign: 'left', width: '22%' }}>Frequency</th>
                      <th style={{ textAlign: 'left', width: '15%' }}>Expected</th>
                      <th style={{ textAlign: 'center', width: '25%' }}>Response</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const val = checkpointResponses[item.id];
                      const type = (item.item_type ?? '').toLowerCase();
                      const isBool = type.includes('bool') || (!type.includes('num') && !type.includes('text'));

                      return (
                        <tr key={item.id ?? idx}>
                          <td>
                            <Text strong>
                              {item.is_required && <span style={{ color: '#ef4444', marginRight: 4 }}>*</span>}
                              {item.item_text}
                            </Text>
                          </td>
                          <td style={{ color: '#374151' }}>{formatFrequency(item)}</td>
                          <td style={{ color: '#374151' }}>{item.expected_value ?? '—'}</td>
                          <td style={{ textAlign: 'center' }}>
                            {isBool ? (
                              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                                {['yes', 'no'].map((opt) => (
                                  val === opt ? (
                                    <Tag
                                      key={opt}
                                      color={opt === 'yes' ? 'success' : 'error'}
                                      style={{ margin: 0, borderRadius: 12, padding: '2px 12px', cursor: 'pointer' }}
                                      onClick={() => handlePmResponse(item.id, opt)}
                                    >
                                      {opt === 'yes' ? 'Yes' : 'No'}
                                    </Tag>
                                  ) : (
                                    <button
                                      key={opt}
                                      type="button"
                                      onClick={() => handlePmResponse(item.id, opt)}
                                      style={{
                                        minWidth: 56,
                                        padding: '4px 12px',
                                        borderRadius: 12,
                                        cursor: 'pointer',
                                        fontSize: 12,
                                        fontWeight: 500,
                                        border: '1px solid #d9d9d9',
                                        background: '#fff',
                                        color: '#8c8c8c',
                                      }}
                                    >
                                      {opt === 'yes' ? 'Yes' : 'No'}
                                    </button>
                                  )
                                ))}
                              </div>
                            ) : (
                              <Input
                                size="small"
                                placeholder={item.expected_value || 'Enter value'}
                                value={checkpointResponses[item.id] || ''}
                                onChange={(e) => handlePmResponse(item.id, e.target.value)}
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })}
        </div>
        {!allPmAnswered && allPmDueItems.length > 0 && (
          <div style={{ fontSize: 12, color: '#595959' }}>
            Answer all checkpoints across every checklist to enable Submit All.
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Dashboard;
