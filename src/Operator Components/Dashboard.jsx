import React, { useEffect, useState } from 'react';
import { Card,Row,Col,Typography,Button,Tag,Space,DatePicker,Select,Input,Tabs,Badge } from 'antd';
import { ToolOutlined,DashboardOutlined,ClockCircleOutlined,ProfileOutlined,SettingOutlined,FileTextOutlined,DownloadOutlined,WarningOutlined } from '@ant-design/icons';
import machineImg from '../assets/machine.png';
import PokaYokeChecklist from './PokaYokeChecklist';
import ReportIssue from './ReportIssue';
import SelectJob from './SelectJob';
import PartDocumentTab from './PartDocumentTab';
import ProductionLog from './ProductionLog';
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
    hasRework: false,
    reworkRemarks: ''
  });
  const [latestHelpReply, setLatestHelpReply] = useState(null);

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

  // Fetch production stats for the selected job
  const fetchReworkData = async (operationId) => {
    if (!operationId) {
      setProductionStats({ totalProduced: 0, totalRework: 0, hasRework: false, reworkRemarks: '' });
      return;
    }
    
    try {
      const response = await fetch(`${SCHEDULING_API_BASE_URL}/production-logs/operation/${operationId}?skip=0`);
      if (response.ok) {
        const logs = await response.json();
        const stats = logs.reduce((acc, log) => {
          acc.totalProduced += (log.produced_quantity || 0);
          acc.totalRework += (log.rework_quantity || 0);
          if (log.status === 'rework') {
            acc.hasRework = true;
            acc.reworkRemarks = log.remarks || acc.reworkRemarks;
          }
          return acc;
        }, { totalProduced: 0, totalRework: 0, hasRework: false, reworkRemarks: '' });
        
        setProductionStats(stats);
      } else {
        setProductionStats({ totalProduced: 0, totalRework: 0, hasRework: false, reworkRemarks: '' });
      }
    } catch (error) {
      console.error('Error fetching production stats:', error);
      setProductionStats({ totalProduced: 0, totalRework: 0, hasRework: false, reworkRemarks: '' });
    }
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

  useEffect(() => {
    const checkChecklistStatus = async () => {
      if (!machineId) return;

      try {
        // 1. Fetch all assignments for this machine
        const assignRes = await fetch(`${API_BASE_URL}/pokayoke-checklists/machines/${machineId}/assignments`);
        const assignData = await assignRes.json();
        const assignments = Array.isArray(assignData) ? assignData : [];

        // 2. Filter assignments due today (Same logic as in PokaYokeChecklist.jsx)
        const today = new Date();
        const istOptions = { timeZone: 'Asia/Kolkata' };
        const dayOfWeek = today.toLocaleDateString('en-US', { ...istOptions, weekday: 'long' });
        const dayOfMonth = today.toLocaleDateString('en-US', { ...istOptions, day: 'numeric' });
        const currentHour = parseInt(today.toLocaleTimeString('en-US', { ...istOptions, hour: 'numeric', hour12: false }));

        const dueToday = assignments.filter(item => {
          const frequency = (item?.frequency || '').toLowerCase();
          const scheduledDay = (item?.scheduled_day || '');

          if (frequency === 'daily') return true; // Show all daily checklists
          if (frequency === 'weekly') return scheduledDay.toLowerCase() === dayOfWeek.toLowerCase();
          if (frequency === 'monthly') return String(scheduledDay) === String(dayOfMonth);
          return false;
        });

        if (dueToday.length === 0) {
          setChecklistPending(false);
          return;
        }

        // 3. Fetch completed logs for today
        const logsRes = await fetch(`${API_BASE_URL}/pokayoke-completed-logs/machines/${machineId}/logs`);
        const logsData = await logsRes.json();
        const logs = Array.isArray(logsData) ? logsData : [];

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
                const logs = approvalData.completed_logs || [];
                // Get the latest log for this machine today
                const latestLog = logs
                  .filter(l => l.machine_id === machineId && new Date(l.completed_at) >= startOfToday)
                  .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))[0];

                if (latestLog) {
                  if (latestLog.overall_approval_status === 'rejected') {
                    allApproved = false;
                    rejected.push({
                      ...item,
                      rejection_details: latestLog
                    });
                  } else if (latestLog.overall_approval_status !== 'approved') {
                    allApproved = false; // pending or unknown
                  }
                } else {
                  allApproved = false; // No log found despite being in completedTodayIds?
                }
              } else {
                allApproved = false;
              }
            } catch (err) {
              console.error('Error fetching approval status:', err);
              allApproved = false;
            }
          } else {
            allApproved = false; // Not completed yet
          }
        }

        setRejectedChecklists(rejected);
        setChecklistPending(!allApproved);
      } catch (error) {
        console.error('Error checking checklist status:', error);
      }
    };

    checkChecklistStatus();
  }, [machineId, showChecklist]); // Re-check when machine changes or checklist modal closes

  useEffect(() => {
    const id = setInterval(() => setCurrentTime(new Date()), 1000);
    // const replyInterval = setInterval(() => fetchLatestReply(machineId), 30000);
    return () => {
      clearInterval(id);
      // clearInterval(replyInterval);
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
    // Re-fetch production stats to update the dashboard immediately
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
            
            {/* Rework Information */}
            {productionStats.hasRework && (
              <div style={{ 
                marginTop: 16, 
                background: '#FFF2E8', 
                borderRadius: 12, 
                padding: 12, 
                border: '1px solid #FFBB96',
                minHeight: 'auto'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <WarningOutlined style={{ color: '#FA8C16', fontSize: 16, flexShrink: 0 }} />
                  <Text strong style={{ color: '#FA8C16', fontSize: 14 }}>Rework Required</Text>
                </div>
                <div style={{ display: 'flex', gap: 12, flexDirection: window.innerWidth < 768 ? 'column' : 'row' }}>
                  <div style={{ 
                    flex: 1, 
                    minWidth: window.innerWidth < 768 ? '100%' : 'auto',
                    marginBottom: window.innerWidth < 768 ? 8 : 0
                  }}>
                    <Text style={{ color: '#64748b', fontSize: 12, display: 'block' }}>Rework Quantity</Text>
                    <div style={{ marginTop: 4, fontWeight: 700, color: '#FA8C16', fontSize: 16 }}>
                      {productionStats.totalRework || 0}
                    </div>
                  </div>
                  <div style={{ 
                    flex: 2, 
                    minWidth: window.innerWidth < 768 ? '100%' : 'auto'
                  }}>
                    <Text style={{ color: '#64748b', fontSize: 12, display: 'block' }}>Remarks</Text>
                    <div style={{ 
                      marginTop: 4, 
                      fontWeight: 600, 
                      color: '#8C4A00', 
                      fontSize: 12,
                      wordBreak: 'break-word',
                      maxWidth: '100%'
                    }}>
                      {productionStats.reworkRemarks || 'No remarks'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* MC Reply Information */}
            {latestHelpReply && (
              <div style={{ 
                marginTop: 16, 
                background: '#F6FFED', 
                borderRadius: 12, 
                padding: 12, 
                border: '1px solid #B7EB8F',
                minHeight: 'auto'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ 
                    width: 24, 
                    height: 24, 
                    borderRadius: '50%', 
                    background: '#52C41A', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center' 
                  }}>
                    <SettingOutlined style={{ color: 'white', fontSize: 14 }} />
                  </div>
                  <Text strong style={{ color: '#389E0D', fontSize: 14 }}>MC Response</Text>
                  {latestHelpReply.replied_at && (
                    <Text type="secondary" style={{ fontSize: 11, marginLeft: 'auto' }}>
                      {new Date(latestHelpReply.replied_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  )}
                </div>
                <div style={{ 
                  background: 'white', 
                  borderRadius: 8, 
                  padding: '8px 12px', 
                  border: '1px solid #D9F7BE'
                }}>
                  <Text style={{ color: '#237804', fontSize: 13, display: 'block', fontStyle: 'italic' }}>
                    "{latestHelpReply.mc_reply}"
                  </Text>
                  <div style={{ marginTop: 4, textAlign: 'right' }}>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      — {latestHelpReply.replied_by_name || 'Manufacturing Coordinator'}
                    </Text>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <ProductionLog 
            isActivated={isActivated} 
            selectedJob={selectedJob} 
            cardHeight={cardHeight} 
            onProductionSubmit={handleProductionSubmit}
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
                {rejectedChecklists.map((rc, idx) => (
                  <div key={idx} style={{ marginBottom: idx < rejectedChecklists.length - 1 ? 8 : 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#851111' }}>
                      • {rc.name || rc.title || 'Checklist'} ({rc.frequency} {rc.shift})
                    </div>
                    {rc.rejection_details?.items?.some(i => i.approval_status === 'rejected') && (
                      <div style={{ fontSize: 11, color: '#ff4d4f', marginLeft: 10, fontStyle: 'italic' }}>
                        Items rejected: {rc.rejection_details.items.filter(i => i.approval_status === 'rejected').map(i => i.item_text).join(', ')}
                      </div>
                    )}
                  </div>
                ))}
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
      <PokaYokeChecklist
        open={showChecklist}
        onClose={() => setShowChecklist(false)}
        machineId={machineId}
      />
      <ReportIssue
        open={showReportIssue}
        onClose={() => setShowReportIssue(false)}
        machineId={machineId}
      />
      <SelectJob
        open={showSelectJob}
        onClose={() => setShowSelectJob(false)}
        onSelectJob={(job) => {
          setSelectedJob(job);
          const isJobActivated = [job.status, job.operation_status].some(s => {
            const up = s?.toString().toUpperCase();
            return up === 'INPROGRESS' || up === 'IN-PROGRESS' || up === 'IN PROGRESS';
          });
          setIsActivated(isJobActivated);
          setShowSelectJob(false);
          
          // Fetch rework data for this operation
          const operationId = job.id || job.operation_id || job.job_id || job.schedule_id;
          fetchReworkData(operationId);
        }}
      />
    </div>
  );
};

export default Dashboard;
