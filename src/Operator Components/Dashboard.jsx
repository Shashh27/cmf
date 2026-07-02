import React, { useEffect, useRef, useState } from 'react';
import { Card,Row,Col,Typography,Button,Tag,Space,DatePicker,Select,Input,Tabs,Badge } from 'antd';
import { DashboardOutlined,ClockCircleOutlined,ProfileOutlined,ContainerOutlined,SettingOutlined,FileTextOutlined,DownloadOutlined,WarningOutlined } from '@ant-design/icons';
import PokaYokeChecklist from './PokaYokeChecklist';
import ReportIssue from './ReportIssue';
import SelectJob from './SelectJob';
import PartDocumentTab from './PartDocumentTab';
import MCResponseRework from './MCResponseRework';
import { API_BASE_URL } from '../Config/auth.js';
import config from '../Config/config.js';
import { SCHEDULING_API_BASE_URL } from '../Config/schedulingconfig.js';
import { message } from 'antd';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;
const { TabPane } = Tabs;

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
        const assignRes = await fetch(`${API_BASE_URL}/pokayoke-checklists/machines/${machineId}/today-assignments`);
        const assignData = await assignRes.json();
        const assignments = Array.isArray(assignData) ? assignData : [];

        setCachedAssignments(assignments);

        // Filter PM items due today based on next_due_date
        const pmTodayStart = new Date();
        pmTodayStart.setHours(0, 0, 0, 0);
        const pmTomorrow = new Date(pmTodayStart);
        pmTomorrow.setDate(pmTomorrow.getDate() + 1);

        const pmDueToday = [];
        assignments.forEach(assignment => {
          const checklist = assignment.checklist;
          if (checklist && checklist.items) {
            checklist.items.forEach(item => {
              if (item.next_due_date) {
                const dueDate = new Date(item.next_due_date);
                // Include items due today OR overdue (past due)
                if (dueDate < pmTomorrow) {
                  pmDueToday.push({
                    checklist_name: checklist.name,
                    checkpoint_name: item.item_text,
                    frequency: item.frequency_type,
                    interval_value: item.interval_value,
                    interval_unit: item.interval_unit
                  });
                }
              }
            });
          }
        });
        setPmItemsDueToday(pmDueToday);

        if (assignments.length === 0) {
          setChecklistPending(false);
          setCachedLogs([]);
          setCachedApprovalStatuses({});
          return;
        }

        const logsRes = await fetch(`${API_BASE_URL}/pokayoke-completed-logs/machines/${machineId}/logs`);
        const logsData = await logsRes.json();
        const logs = Array.isArray(logsData) ? logsData : [];
        setCachedLogs(logs);

        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const completedTodayIds = new Set(
          logs
            .filter(log => new Date(log.completed_at) >= startOfToday)
            .map(log => {
              const cid = String(log.checklist_id);
              const freq = (log.frequency || '').toLowerCase();
              const shift = (log.shift || '').toLowerCase();
              return `${cid}-${freq}-${shift}`;
            })
        );

        const rejected = [];
        const approvalStatuses = {};
        let allApproved = true;

        for (const item of assignments) {
          const cid = String(item?.checklist_id ?? item?.pokayoke_checklist_id ?? item?.checklistId ?? item?.checklist?.id);
          const freq = (item?.frequency || '').toLowerCase();
          const shift = (item?.shift || '').toLowerCase();
          const key = `${cid}-${freq}-${shift}`;

          if (completedTodayIds.has(key)) {
            try {
              const approvalRes = await fetch(`${config.API_BASE_URL}/pokayoke-completed-logs/checklists/${cid}/approval-status`);
              if (approvalRes.ok) {
                const approvalData = await approvalRes.json();
                const approvalLogs = approvalData.completed_logs || [];
                const latestLog = approvalLogs
                  .filter(l => l.machine_id === machineId && new Date(l.completed_at) >= startOfToday)
                  .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))[0];

                if (latestLog) {
                  approvalStatuses[key] = {
                    status: latestLog.overall_approval_status,
                    rejection_details: latestLog,
                  };
                  if (latestLog.overall_approval_status === 'rejected') {
                    allApproved = false;
                    let checklistName = item?.name ?? item?.title ?? null;
                    if (!checklistName) {
                      try {
                        const nameRes = await fetch(`${API_BASE_URL}/pokayoke-checklists/${cid}`, { headers: { accept: 'application/json' } });
                        if (nameRes.ok) {
                          const nameData = await nameRes.json();
                          checklistName = nameData?.name ?? nameData?.title ?? `Checklist #${cid}`;
                        }
                      } catch { /* keep fallback */ }
                    }
                    rejected.push({
                      ...item,
                      checklist_name: checklistName ?? `Checklist #${cid}`,
                      rejection_details: latestLog
                    });
                  } else if (latestLog.overall_approval_status !== 'approved') {
                    allApproved = false;
                  }
                } else {
                  allApproved = false;
                }
              } else {
                allApproved = false;
              }
            } catch (err) {
              console.error('Error fetching approval status:', err);
              allApproved = false;
            }
          } else {
            allApproved = false;
          }
        }

        setCachedApprovalStatuses(approvalStatuses);
        setRejectedChecklists(rejected);
        setChecklistPending(!allApproved);
      } catch (error) {
        console.error('Error checking checklist status:', error);
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
          const assignRes = await fetch(`${API_BASE_URL}/pokayoke-checklists/machines/${machineId}/today-assignments`);
          const assignData = await assignRes.json();
          setCachedAssignments(Array.isArray(assignData) ? assignData : []);
        } catch (error) {
          console.error('Error restoring assignments:', error);
        }
      };
      restoreAssignments();
    }
  };

  const [inlineSubmission, setInlineSubmission] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkpointResponses, setCheckpointResponses] = useState({});

  const handleInlineSubmit = async () => {
    setSubmitting(true);
    try {
      const checklistName = inlineSubmission;
      const assignment = cachedAssignments.find(a => a.checklist?.name === checklistName);
      if (!assignment) return;

      const checklistId = assignment.checklist.id;
      const allItems = assignment.checklist.items || [];

      // Filter items to only submit those with next_due_date matching today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const items = allItems.filter(item => {
        if (item.next_due_date) {
          const dueDate = new Date(item.next_due_date);
          return dueDate >= today && dueDate < tomorrow;
        }
        return false;
      });

      if (items.length === 0) {
        message.warning('No checkpoints due today for this checklist');
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

      // Create completed log
      const logRes = await fetch(`${API_BASE_URL}/pokayoke-completed-logs/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checklist_id: checklistId,
          machine_id: machineId,
          operator_id: operatorId,
          overall_status: 'pending',
          shift: 'Morning',
          completed_at: new Date().toISOString(),
        }),
      });

      if (!logRes.ok) throw new Error('Failed to create log');
      const log = await logRes.json();

      // Submit each item with user-entered values
      for (const item of items) {
        const response = checkpointResponses[item.id] || item.expected_value || 'OK';
        await fetch(`${API_BASE_URL}/pokayoke-completed-logs/item-responses`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            completed_log_id: log.id,
            item_id: item.id,
            response_value: response,
            remarks: '',
            timestamp: new Date().toISOString(),
          }),
        });
      }

      // Recalculate all_items_passed - since only due items are submitted, check if all are confirming
      const allConfirming = items.every(item => {
        const response = checkpointResponses[item.id] || item.expected_value || 'OK';
        return response.toLowerCase() === (item.expected_value || 'OK').toLowerCase();
      });
      
      await fetch(`${API_BASE_URL}/pokayoke-completed-logs/${log.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          all_items_passed: allConfirming,
        }),
      });

      message.success('Checklist submitted successfully');
      checklistStatusFetchedRef.current = false;
      setInlineSubmission(null);
      setCheckpointResponses({});
      
      // Refresh data
      const assignRes = await fetch(`${API_BASE_URL}/pokayoke-checklists/machines/${machineId}/today-assignments`);
      const assignData = await assignRes.json();
      const assignments = Array.isArray(assignData) ? assignData : [];
      setCachedAssignments(assignments);

      const pmTodayStart = new Date();
      pmTodayStart.setHours(0, 0, 0, 0);
      const pmTomorrow = new Date(pmTodayStart);
      pmTomorrow.setDate(pmTomorrow.getDate() + 1);

      const pmDueToday = [];
      assignments.forEach(assignment => {
        const checklist = assignment.checklist;
        if (checklist && checklist.items) {
          checklist.items.forEach(item => {
            if (item.next_due_date) {
              const dueDate = new Date(item.next_due_date);
              // Include items due today OR overdue (past due)
              if (dueDate < pmTomorrow) {
                pmDueToday.push({
                  checklist_name: checklist.name,
                  checkpoint_name: item.item_text,
                  frequency: item.frequency_type,
                  interval_value: item.interval_value,
                  interval_unit: item.interval_unit
                });
              }
            }
          });
        }
      });
      setPmItemsDueToday(pmDueToday);
    } catch (error) {
      console.error('Submission error:', error);
      message.error('Failed to submit checklist');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExpandInline = (checklistName) => {
    setInlineSubmission(inlineSubmission === checklistName ? null : checklistName);
    setCheckpointResponses({});
  };

  const handleCheckpointChange = (itemId, value) => {
    setCheckpointResponses(prev => ({
      ...prev,
      [itemId]: value
    }));
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
            <Title level={4} style={{ margin: 0, color: '#0f172a' }}>Operator Dashboard</Title>
            <Text style={{ color: '#64748b', fontSize: 13 }}>{machineName || 'CNCM-DMU-60T'}</Text>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <WarningOutlined style={{ color: '#FA8C16', fontSize: 14 }} />
                  <Text strong style={{ color: '#FA8C16', fontSize: 13 }}>Preventive Maintenance (PM) Due Today</Text>
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
                  return Object.entries(groupedByChecklist).map(([checklistName, items], idx) => {
                    const isExpanded = inlineSubmission === checklistName;
                    const assignment = cachedAssignments.find(a => a.checklist?.name === checklistName);
                    const allChecklistItems = assignment?.checklist?.items || [];
                    
                    // Filter items to only show those with next_due_date matching today
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const tomorrow = new Date(today);
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    
                    const checklistItems = allChecklistItems.filter(item => {
                      if (item.next_due_date) {
                        const dueDate = new Date(item.next_due_date);
                        // Include items due today OR overdue (past due)
                        return dueDate < tomorrow;
                      }
                      return false;
                    });
                    
                    return (
                      <div key={idx} style={{
                        marginBottom: idx < Object.keys(groupedByChecklist).length - 1 ? 12 : 0,
                        padding: 10,
                        background: '#fff',
                        border: '1px solid #FFE7BA',
                        borderRadius: 6,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <Text strong style={{ color: '#D48806', fontSize: 13 }}>{checklistName}</Text>
                          <Space size={4}>
                            <Button
                              size="small"
                              onClick={() => handleExpandInline(checklistName)}
                              style={{ borderRadius: 4, fontSize: 12 }}
                            >
                              {isExpanded ? 'Collapse' : 'Submit'}
                            </Button>
                          </Space>
                        </div>
                        {items.map((pm, pmIdx) => (
                          <div key={pmIdx} style={{ fontSize: 12, color: '#8C4A00', marginBottom: pmIdx < items.length - 1 ? 4 : 0, marginLeft: 8 }}>
                            <strong>•</strong> {pm.checkpoint_name}
                            <span style={{ marginLeft: 8, color: '#A08000' }}>
                              ({pm.frequency_type}{pm.interval_value && pm.interval_unit && ` - ${pm.interval_value} ${pm.interval_unit}`})
                            </span>
                          </div>
                        ))}
                        {isExpanded && (
                          <div style={{ marginTop: 8, padding: 12, background: '#FAFAFA', borderRadius: 4 }}>
                            <Text strong style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 8 }}>
                              Enter values for each checkpoint:
                            </Text>
                            {checklistItems.map((item, itemIdx) => (
                              <div key={item.id} style={{ marginBottom: itemIdx < checklistItems.length - 1 ? 8 : 0 }}>
                                <div style={{ fontSize: 12, color: '#333', marginBottom: 4 }}>
                                  {item.sequence_number}. {item.item_text}
                                  {item.is_required && <span style={{ color: '#ff4d4f', marginLeft: 4 }}>*</span>}
                                </div>
                                <Input
                                  size="small"
                                  placeholder={item.expected_value || 'Enter value'}
                                  value={checkpointResponses[item.id] || ''}
                                  onChange={(e) => handleCheckpointChange(item.id, e.target.value)}
                                  style={{ fontSize: 12 }}
                                />
                              </div>
                            ))}
                            <Button
                              type="primary"
                              size="small"
                              onClick={handleInlineSubmit}
                              loading={submitting}
                              style={{ marginTop: 12, borderRadius: 4, fontSize: 12 }}
                            >
                              Submit All Checkpoints
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  });
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
    </div>
  );
};

export default Dashboard;
