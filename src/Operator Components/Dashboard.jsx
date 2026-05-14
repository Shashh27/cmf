import React, { useEffect, useRef, useState } from 'react';
import { Card,Row,Col,Typography,Button,Tag,Space,DatePicker,Select,Input,Tabs,Badge } from 'antd';
import { ToolOutlined,DashboardOutlined,ClockCircleOutlined,ProfileOutlined,SettingOutlined,FileTextOutlined,DownloadOutlined,WarningOutlined } from '@ant-design/icons';
import machineImg from '../assets/machine.png';
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
  // Per-job approved qty map — fetched once here, passed to SelectJob for display
  const [jobStatsMap, setJobStatsMap] = useState({});
  const [latestHelpReply, setLatestHelpReply] = useState(null);

  // ─── Cached checklist data passed down to PokaYokeChecklist ───────────────
  // This prevents PokaYokeChecklist from re-fetching data that Dashboard
  // already fetched in checkChecklistStatus.
  const [cachedAssignments, setCachedAssignments] = useState([]);
  const [cachedLogs, setCachedLogs] = useState([]);
  const [cachedApprovalStatuses, setCachedApprovalStatuses] = useState({});

  // Clear localStorage on mount to always start fresh
  useEffect(() => {
    localStorage.removeItem('selectedJob');
  }, []);

  // Prevents checkChecklistStatus from running more than once per machineId load.
  // It will be reset to false only when showChecklist closes (so the badge
  // refreshes after the operator submits a checklist).
  const checklistStatusFetchedRef = useRef(false);

  // Fetch latest help reply
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

  // Fetch production stats for the selected job (passed to PartDocumentTab via productionStats)
  const fetchReworkData = async (operationId) => {
    if (!operationId) {
      setProductionStats({ totalProduced: 0, totalRework: 0, totalApproved: 0, hasRework: false, reworkRemarks: '' });
      return;
    }
    try {
      const response = await fetch(`${SCHEDULING_API_BASE_URL}/production-logs/operation/${operationId}?skip=0`);
      if (response.ok) {
        const logs = await response.json();
        // Sort logs by created_at in descending order to get the latest entry first
        const sortedLogs = logs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        const latestLog = sortedLogs.length > 0 ? sortedLogs[0] : null;
        
        // Calculate totals by summing up values from ALL logs
        const totalProducedSum = logs.reduce((sum, log) => sum + (log.produced_quantity || 0), 0);
        const totalReworkSum = logs.reduce((sum, log) => sum + (log.rework_quantity || 0), 0);
        const totalApprovedSum = logs.reduce((sum, log) => sum + (log.approved_quantity || 0), 0);

        if (latestLog) {
          const stats = {
            totalProduced: totalProducedSum,
            totalRework: totalReworkSum,
            totalApproved: totalApprovedSum,
            latestProduced: latestLog.produced_quantity || 0,
            latestRework: latestLog.rework_quantity || 0,
            hasRework: latestLog.status === 'rework',
            reworkRemarks: latestLog.remarks || '',
            operatorStatus: latestLog.operator_status,
            activationTime: latestLog.from_date && latestLog.from_time ? `${latestLog.from_date} ${latestLog.from_time}` : null
          };
          setProductionStats(stats);

          // If the latest log says inprogress, update the dashboard's activation state
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

  // Fetch approved_quantity for a list of operations in parallel.
  // Called after SelectJob loads its jobs, so stats are ready when cards render.
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
          
          // Get operator_status from latest log
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
        const id =
          m?.id ?? m?.machine_id ?? m?.machineId ?? m?.machine?.id ?? null;
        setMachineId(id);
        fetchLatestReply(id);
      }
    } catch (e) {
      setMachineName('');
      setMachineId(null);
    }
  }, []);

  // ─── Single source-of-truth fetch for checklist status ───────────────────
  // Runs once when machineId is available, and again every time the checklist
  // modal closes (showChecklist: true→false) so the badge stays up-to-date.
  useEffect(() => {
    if (!machineId) return;

    // If the modal just opened we do NOT re-fetch — the data is already cached.
    // We only re-fetch when the modal closes (showChecklist goes true → false).
    if (showChecklist) return;

    // Guard: skip if we already fetched and the modal was never opened
    // (i.e. this is the initial mount run that already completed).
    if (checklistStatusFetchedRef.current) return;

    checklistStatusFetchedRef.current = true;

    const checkChecklistStatus = async () => {
      try {
        // 1. Fetch all assignments for this machine
        const assignRes = await fetch(`${API_BASE_URL}/pokayoke-checklists/machines/${machineId}/assignments`);
        const assignData = await assignRes.json();
        const assignments = Array.isArray(assignData) ? assignData : [];

        // 2. Filter assignments due today (same logic as PokaYokeChecklist.jsx)
        const today = new Date();
        const istOptions = { timeZone: 'Asia/Kolkata' };
        const dayOfWeek = today.toLocaleDateString('en-US', { ...istOptions, weekday: 'long' });
        const dayOfMonth = today.toLocaleDateString('en-US', { ...istOptions, day: 'numeric' });

        const dueToday = assignments.filter(item => {
          const frequency = (item?.frequency || '').toLowerCase();
          const scheduledDay = (item?.scheduled_day || '');

          if (frequency === 'daily') return true;
          if (frequency === 'weekly') return scheduledDay.toLowerCase() === dayOfWeek.toLowerCase();
          if (frequency === 'monthly') return String(scheduledDay) === String(dayOfMonth);
          return false;
        });

        // Cache the full (unfiltered) assignment list for PokaYokeChecklist
        setCachedAssignments(assignments);

        if (dueToday.length === 0) {
          setChecklistPending(false);
          setCachedLogs([]);
          setCachedApprovalStatuses({});
          return;
        }

        // 3. Fetch completed logs for today
        const logsRes = await fetch(`${API_BASE_URL}/pokayoke-completed-logs/machines/${machineId}/logs`);
        const logsData = await logsRes.json();
        const logs = Array.isArray(logsData) ? logsData : [];

        // Cache logs for PokaYokeChecklist
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

        // 4. Fetch approval status for each due checklist
        const rejected = [];
        const approvalStatuses = {};
        let allApproved = true;

        for (const item of dueToday) {
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
                    // Fetch the checklist name so the Dashboard badge shows the
                    // real name instead of a fallback like "Checklist (Daily Morning)"
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

        // Cache approval statuses for PokaYokeChecklist
        setCachedApprovalStatuses(approvalStatuses);
        setRejectedChecklists(rejected);
        setChecklistPending(!allApproved);
      } catch (error) {
        console.error('Error checking checklist status:', error);
      }
    };

    checkChecklistStatus();
  }, [machineId, showChecklist]);

  // When the checklist modal closes:
  // - If the operator actually submitted something (wasSubmitted=true), reset
  //   the ref so the effect re-runs and the badge/rejected list refresh.
  // - If they just dismissed the modal without submitting, keep the ref as-is
  //   so NO extra network calls are made.
  const handleChecklistClose = (wasSubmitted = false) => {
    setShowChecklist(false);
    if (wasSubmitted) {
      checklistStatusFetchedRef.current = false;
    }
  };

  useEffect(() => {
    const id = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => {
      clearInterval(id);
    };
  }, [machineId]);

  const handleSelectJobClick = () => {
    if (checklistPending) {
      message.warning('Please complete the due Poka Yoke checklist before selecting a job.');
      setShowChecklist(true);
    } else {
      setShowSelectJob(true);
    }
  };

  const handleProductionSubmit = (submittedQuantity) => {
    setCompletedQuantity(prev => prev + submittedQuantity);
    const operationId = selectedJob?.id || selectedJob?.operation_id || selectedJob?.job_id || selectedJob?.schedule_id;
    if (operationId) {
      fetchReworkData(operationId);
    }
  };

  const hourOptions = Array.from({ length: 24 }, (_, i) => i);
  const minuteOptions = [0, 15, 30, 45];
  const [cardHeight, setCardHeight] = useState(520);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      setCardHeight(w < 992 ? 'auto' : 520);
      setIsMobile(w < 768);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  const docTabs = ['All Documents', 'MPP', 'Drawing', 'CNC Programs', 'Raw Materials', 'Tools'];
  const keyFromLabel = (l) => l.toLowerCase().replace(/\s+/g, '_');
  const labelFromKey = (k) => docTabs.find((l) => keyFromLabel(l) === k) || 'All Documents';

  const sampleDocuments = [
    {
      id: 1,
      name: 'DRG–62027912-300-F0052.1_001of001',
      tag: 'Engineering Drawing',
      size: '3076 KB',
      type: 'Drawing',
      version: '1.0',
      format: 'PDF',
    },
    {
      id: 2,
      name: 'MPP–62027912AA',
      tag: 'MPP',
      size: '2658 KB',
      type: 'MPP',
      version: '1.0',
      format: 'PDF',
    },
  ];

  return (
    <div style={{ padding: '16px', background: 'transparent', overflowX: 'hidden' }}>
      {/* Header */}
      <Card
        style={{
          borderRadius: 16,
          marginBottom: 16,
          borderColor: '#e5e7eb',
        }}
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
            <Title level={4} style={{ margin: 0, color: '#0f172a' }}>
              Operator Dashboard
            </Title>
            <Text style={{ color: '#64748b', fontSize: 13 }}>
              {machineName || 'CNCM-DMU-60T'}
            </Text>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: '#64748b',
              fontSize: 13,
            }}
          >
            <Text>
              {currentTime.toLocaleDateString('en-GB').replace(/\//g, '-')}{", "}
              {currentTime.toLocaleTimeString()}
            </Text>
          </div>
          <Button 
            type="primary" 
            size="large"
            onClick={handleSelectJobClick}
          >
            Select Job
          </Button>
        </div>
      </Card>

      {/* Top row */}
      <Row gutter={[16, 16]} style={{ marginTop: '16px' }}>
        <Col xs={24} lg={8}>
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Space>
                  <ToolOutlined style={{ color: '#1677FF' }} />
                  <span>Machine Status</span>
                </Space>
                <Space>
                  <Button
                    type="link"
                    danger
                    className="report-issue-link"
                    onClick={() => setShowReportIssue(true)}
                  >
                    <span className="report-issue-icon">
                      <WarningOutlined />
                    </span>
                    Report Issue
                  </Button>
                </Space>
              </div>
            }
            style={{ borderRadius: '16px', height: cardHeight, display: 'flex', flexDirection: 'column' }}
            headStyle={{ borderRadius: '16px 16px 0 0' }}
            bodyStyle={{ padding: 16, display: 'flex', flexDirection: 'column', flex: 1, overflow: 'auto' }}
          >
            <div
              style={{
                background: 'linear-gradient(90deg, #E6F4FF 0%, #FFFFFF 70%)',
                borderRadius: 12,
                border: '1px solid #dbeafe',
                padding: 16,
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <Title level={4} style={{ margin: 0 }}>{machineName || 'Machine'}</Title>
                  <div style={{ marginTop: 8, display: 'inline-block', padding: '2px 10px', borderRadius: 8, background: '#FFFBE6', border: '1px solid #FFE58F', color: '#AD8B00', fontWeight: 600 }}>
                    {machineStatus}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                    <ClockCircleOutlined style={{ color: '#94a3b8' }} />
                    <Text type="secondary">Updated: 3 months ago</Text>
                  </div>
                </div>
                <div style={{ position: 'relative' }}>
                  <img
                    src={machineImg}
                    alt="Machine"
                    style={{ maxWidth: 200, height: 160, objectFit: 'contain' }}
                  />
                </div>
              </div>
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
              <div style={{ flex: 1, background: '#EAF6FF', borderRadius: 12, padding: 12, border: '1px solid #e6e6e6' }}>
                <Text style={{ color: '#64748b' }}>Active Program</Text>
                <div style={{ marginTop: 6, fontWeight: 600 }}>None</div>
              </div>
              <div style={{ flex: 1, background: '#EAF6FF', borderRadius: 12, padding: 12, border: '1px solid #e6e6e6' }}>
                <Text style={{ color: '#64748b' }}>Part Count</Text>
                <div style={{ marginTop: 6, fontWeight: 700, color: '#52C41A' }}>{productionStats.totalProduced || 0}</div>
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <MCResponseRework 
            productionStats={productionStats}
            latestHelpReply={latestHelpReply}
            cardHeight={cardHeight}
          />
        </Col>

        <Col xs={24} lg={8}>
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <DashboardOutlined style={{ color: '#1677FF' }} />
                <span>Current Job</span>
              </div>
            }
            style={{ borderRadius: '16px', height: cardHeight, display: 'flex', flexDirection: 'column' }}
            headStyle={{ borderRadius: '16px 16px 0 0' }}
            bodyStyle={{ padding: 16, display: 'flex', flexDirection: 'column', flex: 1, overflow: 'auto' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: '#E6F4FF', borderRadius: 12, padding: 12, border: '1px solid #e6e6e6' }}>
                <Text style={{ color: '#64748b' }}>Production Order</Text>
                <div style={{ fontWeight: 700, color: '#1677FF', marginTop: 6 }}>
                  {selectedJob?.sale_order_number || selectedJob?.production_order || 'None'}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  Priority {selectedJob?.priority || '0'}
                </div>
              </div>
              <div style={{ background: '#E6F4FF', borderRadius: 12, padding: 12, border: '1px solid #e6e6e6' }}>
                <Text style={{ color: '#64748b' }}>Part Number</Text>
                <div style={{ fontWeight: 700, color: '#1677FF', marginTop: 6 }}>
                  {selectedJob?.part_number || 'None'}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  {selectedJob?.part_name || 'No description'}
                </div>
              </div>
              {selectedJob && (
                <div style={{ background: '#f0f7ff', borderRadius: 12, padding: 12, border: '1px solid #d4e8ff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <ClockCircleOutlined style={{ color: '#52c41a', fontSize: 14 }} />
                    <Text strong style={{ color: '#1677FF', fontSize: 13 }}>Job Schedule</Text>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <div style={{ marginBottom: 6 }}>
                      <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Start Date & Time</Text>
                      <Text strong style={{ fontSize: 12, color: '#52c41a' }}>
                        {selectedJob.planned_start_time
                          ? (() => { 
                              const d = new Date(selectedJob.planned_start_time); 
                              return d.toLocaleDateString('en-GB').replace(/\//g, '-') + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); 
                            })()
                          : 'N/A'}
                      </Text>
                    </div>
                    <div>
                      <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>End Date & Time</Text>
                      <Text strong style={{ fontSize: 12, color: '#f5222d' }}>
                        {selectedJob.planned_end_time
                          ? (() => { 
                              const d = new Date(selectedJob.planned_end_time); 
                              return d.toLocaleDateString('en-GB').replace(/\//g, '-') + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); 
                            })()
                          : 'N/A'}
                      </Text>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </Col>
      </Row>

      {/* Bottom row */}
      <Row gutter={[16, 16]} style={{ marginTop: 24, marginBottom: 8 }}>
        {/* Documents / Operations */}
        <Col xs={24} lg={16}>
          <PartDocumentTab 
            selectedJob={selectedJob} 
            isActivated={isActivated}
            onActivate={() => setIsActivated(true)}
            completedQuantity={completedQuantity}
            productionStats={productionStats}
          />
        </Col>

        {/* Poka Yoke & Operator Handover (single card) */}
        <Col xs={24} lg={8}>
          <Card
            style={{ borderRadius: 16 }}
            headStyle={{ borderRadius: '16px 16px 0 0' }}
            title={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Poka Yoke & Feedback</span>
                {rejectedChecklists.length > 0 && (
                  <Badge count={rejectedChecklists.length} offset={[10, 0]}>
                    <FileTextOutlined style={{ color: '#ff4d4f', fontSize: 18 }} />
                  </Badge>
                )}
              </div>
            }
          >
            {/* Poka Yoke section */}
            <Button
              type="primary"
              block
              style={{
                borderRadius: 9999,
                background: rejectedChecklists.length > 0 ? '#ff4d4f' : '#1677FF',
                borderColor: rejectedChecklists.length > 0 ? '#ff4d4f' : '#1677FF',
              }}
              onClick={() => setShowChecklist(true)}
            >
              {rejectedChecklists.length > 0 ? 'Redo Rejected Checklists' : 'Open Poka Yoke Checklist'}
            </Button>
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: '#94a3b8',
                textAlign: 'center',
              }}
            >
              {rejectedChecklists.length > 0 
                ? 'Some checklists were rejected. Please review and resubmit.' 
                : 'Review and complete poka yoke checkpoints'}
            </div>

            {/* Rejected Details */}
            {rejectedChecklists.length > 0 && (
              <div style={{ marginTop: 16, padding: '12px', background: '#fff1f0', borderRadius: 8, border: '1px solid #ffccc7' }}>
                <div style={{ fontWeight: 600, color: '#cf1322', marginBottom: 8, fontSize: 13 }}>
                  Rejected Checklists:
                </div>
                {rejectedChecklists.map((rc, idx) => {
                  console.log('Rejected Checklist Item:', rc);
                  return (
                  <div key={idx} style={{ marginBottom: idx < rejectedChecklists.length - 1 ? 8 : 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#851111' }}>
                      • {rc.checklist_name || rc.name || rc.title || 'Checklist'} ({rc.frequency} {rc.shift})
                    </div>
                    {rc.rejection_details?.items?.some(i => i.approval_status === 'rejected') && (
                      <div style={{ fontSize: 11, color: '#ff4d4f', marginLeft: 10, fontStyle: 'italic' }}>
                        Items rejected: {rc.rejection_details.items.filter(i => i.approval_status === 'rejected').map(i => i.item_text).join(', ')}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}

            {/* Divider */}
            <div
              style={{
                borderTop: '1px solid #e5e7eb',
                margin: '16px -16px 12px',
              }}
            />

          </Card>
        </Col>
      </Row>

      {/* PokaYokeChecklist receives pre-fetched data — no duplicate API calls */}
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
        }}
      />
    </div>
  );
};

export default Dashboard;