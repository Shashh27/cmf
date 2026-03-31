import React, { useEffect, useState } from 'react';
import { Card,Row,Col,Typography,Button,Tag,Space,DatePicker,Select,Input,Tabs } from 'antd';
import { ToolOutlined,DashboardOutlined,ClockCircleOutlined,ProfileOutlined,SettingOutlined,FileTextOutlined,DownloadOutlined,WarningOutlined } from '@ant-design/icons';
import machineImg from '../assets/machine.png';
import PokaYokeChecklist from './PokaYokeChecklist';
import ReportIssue from './ReportIssue';
import SelectJob from './SelectJob';
import PartDocumentTab from './PartDocumentTab';

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
      }
    } catch (e) {
      setMachineName('');
      setMachineId(null);
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

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
    <div style={{ padding: '0px', background: 'transparent' }}>
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
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 9999,
                background: '#ff4d4f',
                display: 'inline-block',
              }}
            />
            <Text>{currentTime.toLocaleString()}</Text>
          </div>
          <Button 
            type="primary" 
            size="large"
            onClick={() => setShowSelectJob(true)}
          >
            Select Job
          </Button>
        </div>
      </Card>

      {/* Top row */}
      <Row gutter={[24, 24]} style={{ marginTop: '16px' }}>
        <Col xs={24} lg={8}>
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Space>
                  <ToolOutlined style={{ color: '#1677FF' }} />
                  <span>Machine Status</span>
                </Space>
                <Space>
                  {/* <span style={{ width: 8, height: 8, borderRadius: 9999, background: '#ff4d4f', display: 'inline-block' }} /> */}
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
            bodyStyle={{ padding: 16, display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
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
                    style={{ width: 200, height: 160, objectFit: 'contain' }}
                  />
                  <div style={{ position: 'absolute', right: -8, top: -8, background: '#FFF0F6', border: '1px solid #f0d5e5', borderRadius: 12, padding: 6, boxShadow: '0 2px 6px rgba(0,0,0,0.06)' }}>
                    <SettingOutlined style={{ color: '#faad14' }} />
                  </div>
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
                <div style={{ marginTop: 6, fontWeight: 700, color: '#52C41A' }}>0</div>
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Space>
                  <ProfileOutlined style={{ color: '#1677FF' }} />
                  <span>Production Progress</span>
                </Space>
                <Tag color="default">No operation</Tag>
              </div>
            }
            style={{ borderRadius: '16px', height: cardHeight, display: 'flex', flexDirection: 'column' }}
            headStyle={{ borderRadius: '16px 16px 0 0' }}
            bodyStyle={{ padding: 16, display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
          >
            <div
              style={{
                background: '#E6F4FF',
                border: '1px solid #e6e6e6',
                borderRadius: 12,
                padding: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <Text style={{ fontWeight: 600 }}>Production Log Entry</Text>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 12, color: '#64748b' }}>
                <span style={{ fontWeight: 600, color: '#1677FF' }}>Time</span>
                <span>Qty</span>
                <span>Log</span>
              </div>
              <Row gutter={12} style={{ marginBottom: 12 }}>
                <Col xs={24} md={12}>
                  <Text style={{ display: 'block', marginBottom: 6 }}>From Date & Time</Text>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <DatePicker style={{ flex: 1 }} />
                    <Select placeholder="Hour" style={{ width: 90 }}>
                      {hourOptions.map(h => <Option key={h} value={h}>{h}</Option>)}
                    </Select>
                    <Select placeholder="Minute" style={{ width: 110 }}>
                      {minuteOptions.map(m => <Option key={m} value={m}>{m}</Option>)}
                    </Select>
                  </div>
                </Col>
                <Col xs={24} md={12}>
                  <Text style={{ display: 'block', marginBottom: 6 }}>To Date & Time</Text>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <DatePicker style={{ flex: 1 }} />
                    <Select placeholder="Hour" style={{ width: 90 }}>
                      {hourOptions.map(h => <Option key={h} value={h}>{h}</Option>)}
                    </Select>
                    <Select placeholder="Minute" style={{ width: 110 }}>
                      {minuteOptions.map(m => <Option key={m} value={m}>{m}</Option>)}
                    </Select>
                  </div>
                </Col>
              </Row>
              <Text style={{ display: 'block', marginBottom: 6 }}>Notes (optional)</Text>
              <TextArea rows={3} placeholder="Enter notes" />
              <Button
                disabled
                block
                style={{
                  marginTop: 12,
                  background: '#EEF2FF',
                  color: '#64748b',
                  borderColor: '#e6e6e6',
                }}
              >
                Submit Production Log
              </Button>
            </div>
            <div
              style={{
                marginTop: 12,
                background: '#FFFFFF',
                border: '1px solid #e6e6e6',
                borderRadius: 12,
                padding: 16,
                textAlign: 'center',
                color: '#64748b',
              }}
            >
              <div style={{ fontSize: 13 }}>No operation selected</div>
              <div style={{ fontSize: 12 }}>Select an operation to log production</div>
            </div>
          </Card>
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
            bodyStyle={{ padding: 16, display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
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
                  {selectedJob?.operation_name || selectedJob?.part_name || 'No description'}
                </div>
              </div>
              <div style={{ background: '#fff', borderRadius: 12, padding: 12, border: '1px solid #e6e6e6' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ color: '#64748b' }}>Current Operation</Text>
                  <Tag>{selectedJob ? 'Selected' : 'Not Selected'}</Tag>
                </div>
                <div style={{ marginTop: 8, color: '#94a3b8' }}>
                  {selectedJob ? 'Operation in progress' : 'No operation selected'}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  {selectedJob ? 'View details in the Operations tab' : 'Select an operation from the Select Job'}
                </div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Bottom row */}
      <Row gutter={[24, 24]} style={{ marginTop: 24, marginBottom: 8 }}>
        {/* Documents / Operations */}
        <Col xs={24} lg={16}>
          <PartDocumentTab selectedJob={selectedJob} />
        </Col>

        {/* Poka Yoke & Operator Handover (single card) */}
        <Col xs={24} lg={8}>
          <Card
            style={{ borderRadius: 16 }}
            headStyle={{ borderRadius: '16px 16px 0 0' }}
            title="Poka Yoke & Feedback"
          >
            {/* Poka Yoke section */}
            <Button
              type="primary"
              block
              style={{
                borderRadius: 9999,
                background: '#1677FF',
                borderColor: '#1677FF',
              }}
              onClick={() => setShowChecklist(true)}
            >
              Open Poka Yoke Checklist
            </Button>
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: '#94a3b8',
                textAlign: 'center',
              }}
            >
              Review and complete poka yoke checkpoints
            </div>

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
          setShowSelectJob(false);
        }}
      />
    </div>
  );
};

export default Dashboard;
