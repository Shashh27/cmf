import React, { useState, useEffect } from 'react';
import {Table,Select,Typography,Card,Button,Space,Tag,Modal,message,} from 'antd';
import {ReloadOutlined,FileTextOutlined,CheckCircleOutlined,CloseCircleOutlined,} from '@ant-design/icons';
import { API_BASE_URL } from "../Config/auth";

const { Title, Text } = Typography;
const { Option } = Select;

/* ─── Design tokens (matching Machine Assignments) ────────────────────────── */
const T = {
  bg:         '#FDFBF7',
  surface:    '#FFFFFF',
  sidebar:    '#F5F5F5',
  border:     '#D1D5DB',
  borderMid:  '#E5E5E5',
  primary:    '#4A6CF7',
  primaryBg:  '#EEF2FF',
  success:    '#22C55E',
  successBg:  '#DCFCE7',
  warning:    '#F59E0B',
  warningBg:  '#FEF3C7',
  weekend:    '#F9FAFB',
  text:       '#111827',
  textMid:    '#374151',
  textSub:    '#6B7280',
  textMuted:  '#9CA3AF',
  radius:     '12px',
  radiusSm:   '8px',
  shadow:     '0 1px 4px rgba(0,0,0,0.07), 0 4px 16px rgba(0,0,0,0.05)',
};

const PokaYokeCompletedLogs = ({ machines = [], fetchMachines, machinesLoading }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });

  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);
  const [selectedLogDetails, setSelectedLogDetails] = useState(null);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async (machineId = null) => {
    try {
      setLoading(true);
      const url = machineId
        ? `${API_BASE_URL}/pokayoke-completed-logs/machines/${machineId}/logs`
        : `${API_BASE_URL}/pokayoke-completed-logs/`;

      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch completion logs');
      const data = await response.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch (error) {
      message.error(error.message || 'Failed to load completion logs');
    } finally {
      setLoading(false);
    }
  };

  const handleMachineChange = (value) => {
    const newMachine = value || null;
    setSelectedMachine(newMachine);
    fetchLogs(newMachine);
  };

  const handleRefresh = () => {
    fetchLogs(selectedMachine);
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '-';

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;
    const hoursStr = String(hours).padStart(2, '0');

    return `${day}/${month}/${year}, ${hoursStr}:${minutes}:${seconds} ${ampm}`;
  };

  const getMachineLabel = (id) => {
    const machine = machines.find((m) => m.id === id);
    if (!machine) return '-';
    if (machine.make && machine.model) {
      return `${machine.make} ${machine.model}`;
    }
    return machine.make || `Machine ${machine.id}`;
  };

  const getStatusTag = (allItemsPassed) => {
    if (allItemsPassed) {
      return (
        <Tag color="green" style={{ borderRadius: '16px', padding: '0 12px' }}>
          ALL PASSED
        </Tag>
      );
    }
    return (
      <Tag color="red" style={{ borderRadius: '16px', padding: '0 12px' }}>
        HAS FAILURES
      </Tag>
    );
  };

  const handleViewDetails = (log) => {
    setSelectedLog(log);
    setDetailModalVisible(true);
    setSelectedLogDetails(log);
  };

  const getItemText = (response) => {
    return response.item?.item_text || '-';
  };

  const getResponseStatusTag = (isConfirming) => {
    if (isConfirming) {
      return (
        <Tag color="green" style={{ borderRadius: '12px', padding: '0 10px' }}>
          PASSED
        </Tag>
      );
    }
    return (
      <Tag color="red" style={{ borderRadius: '12px', padding: '0 10px' }}>
        FAILED
      </Tag>
    );
  };

  const columns = [
    {
      title: 'ID',
      key: 'sl_no',
      width: 70,
      align: 'center',
      className: 'table-header-styled',
      render: (_, __, index) => index + 1,
    },
    {
      title: 'Checklist',
      dataIndex: 'checklist',
      key: 'checklist',
      width: 200,
      className: 'table-header-styled',
      sorter: (a, b) => (a.checklist?.name || '').localeCompare(b.checklist?.name || ''),
      render: (checklist) => <Text strong>{checklist?.name || '-'}</Text>,
    },
    {
      title: 'Machine',
      dataIndex: 'machine',
      key: 'machine',
      width: 260,
      className: 'table-header-styled',
      sorter: (a, b) => {
        const machineA = a.machine ? `${a.machine.make} ${a.machine.model || ''}` : '';
        const machineB = b.machine ? `${b.machine.make} ${b.machine.model || ''}` : '';
        return machineA.localeCompare(machineB);
      },
      render: (machine) => (
        <div style={{ whiteSpace: 'normal' }}>
          <Text>{machine ? `${machine.make} ${machine.model || ''}` : '-'}</Text>
        </div>
      ),
    },
    {
      title: 'Frequency',
      dataIndex: 'frequency',
      key: 'frequency',
      width: 120,
      className: 'table-header-styled',
      sorter: (a, b) => (a.frequency || '').localeCompare(b.frequency || ''),
      render: (frequency, record) => {
        const shift = record?.shift;
        return (
          <div>
            {frequency ? (
              <Tag color="blue" style={{ borderRadius: '12px' }}>
                {frequency}{shift ? ` (${shift})` : ''}
              </Tag>
            ) : (
              '-'
            )}
          </div>
        );
      },
    },
    {
      title: 'Operator',
      dataIndex: 'operator',
      key: 'operator',
      width: 160,
      className: 'table-header-styled',
      sorter: (a, b) => (a.operator?.user_name || '').localeCompare(b.operator?.user_name || ''),
      render: (operator) => operator?.user_name || '-',
    },
    {
      title: 'Completed At',
      dataIndex: 'completed_at',
      key: 'completed_at',
      width: 220,
      className: 'table-header-styled',
      sorter: (a, b) =>
        new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime(),
      render: (date) => formatDateTime(date),
    },
    {
      title: 'Status',
      dataIndex: 'all_items_passed',
      key: 'status',
      width: 140,
      align: 'center',
      className: 'table-header-styled',
      sorter: (a, b) => a.all_items_passed - b.all_items_passed,
      render: (value) => getStatusTag(value),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      align: 'center',
      className: 'table-header-styled',
      render: (_, record) => (
        <Button
          type="text"
          icon={<FileTextOutlined />}
          onClick={() => handleViewDetails(record)}
        />
      ),
    },
  ];

  const responseColumns = [
    {
      title: 'Checklist Item',
      key: 'item_id',
      width: 250,
      className: 'table-header-styled',
      render: (_, record) => getItemText(record),
    },
    {
      title: 'Response',
      dataIndex: 'response_value',
      key: 'response_value',
      width: 150,
      className: 'table-header-styled',
    },
    {
      title: 'Status',
      dataIndex: 'is_confirming',
      key: 'is_confirming',
      width: 120,
      align: 'center',
      className: 'table-header-styled',
      render: (value) => getResponseStatusTag(value),
    },
    {
      title: 'Timestamp',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 220,
      className: 'table-header-styled',
      render: (date) => formatDateTime(date),
    },
  ];

  return (
    <div style={{ padding: 0, fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif", background: T.bg }}>
      {/* ── Top bar ── */}
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius,
        padding: '10px 14px', marginBottom: 10, boxShadow: T.shadow,
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <Text strong style={{ fontSize: 13, color: T.textMid, whiteSpace: 'nowrap' }}>Completion Logs:</Text>
        <div style={{ flex: '0 0 400px', maxWidth: '100%' }}>
          <Select
            allowClear
            placeholder="Select Machine"
            loading={machinesLoading}
            onFocus={() => fetchMachines()}
            style={{ width: '100%' }}
            value={selectedMachine}
            onChange={handleMachineChange}
            showSearch
            optionFilterProp="children"
          >
            {machines.map((machine) => (
              <Option key={machine.id} value={machine.id}>
                {getMachineLabel(machine.id)}
              </Option>
            ))}
          </Select>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Button
            icon={<ReloadOutlined />}
            onClick={handleRefresh}
            loading={loading}
            style={{ borderRadius: 8 }}
          >Refresh</Button>
        </div>
      </div>

      {/* ── Main content card ── */}
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: T.radius, boxShadow: T.shadow, overflow: 'hidden',
        minHeight: 'calc(100vh - 320px)',
      }}>
        <Table
        columns={columns}
        dataSource={logs}
        loading={loading}
        rowKey="id"
        size="small"
        scroll={{ x: 1100 }}
        bordered
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) =>
            `${range[0]}-${range[1]} of ${total} items`,
          pageSizeOptions: ['10', '20', '50', '100'],
          onChange: (page, pageSize) => {
            setPagination({ current: page, pageSize: pageSize });
          },
          onShowSizeChange: (current, size) => {
            setPagination({ current: 1, pageSize: size });
          },
        }}
        style={{
          background: T.surface,
        }}
      />
      </div>

      <Modal
        title={
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Checklist Completion Details</span>
              {selectedLogDetails && (
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 13,
                  }}
                >
                  {selectedLogDetails.all_items_passed ? (
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                  ) : (
                    <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                  )}
                  <span>
                    {selectedLogDetails.all_items_passed
                      ? 'All Items Passed'
                      : 'Has Failures'}
                  </span>
                </span>
              )}
            </div>
          </div>
        }
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={
          <Button onClick={() => setDetailModalVisible(false)}>Close</Button>
        }
        width={900}
      >
        {selectedLogDetails && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card
                bordered={false}
                style={{ background: '#fafafa', borderRadius: 8 }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    rowGap: 8,
                    columnGap: 40,
                  }}
                >
                  <div>
                    <Text type="secondary">Checklist</Text>
                    <div style={{ fontWeight: 500 }}>
                      {selectedLogDetails.checklist?.name || '-'}
                    </div>
                  </div>
                  <div>
                    <Text type="secondary">Machine</Text>
                    <div style={{ fontWeight: 500 }}>
                      {selectedLogDetails.machine ? `${selectedLogDetails.machine.make} ${selectedLogDetails.machine.model || ''}` : '-'}
                    </div>
                  </div>
                  <div>
                    <Text type="secondary">Operator</Text>
                    <div style={{ fontWeight: 500 }}>
                      {selectedLogDetails.operator?.user_name || '-'}
                    </div>
                  </div>
                  <div>
                    <Text type="secondary">Completed At</Text>
                    <div style={{ fontWeight: 500 }}>
                      {formatDateTime(selectedLogDetails.completed_at)}
                    </div>
                  </div>
                  <div>
                    <Text type="secondary">Frequency</Text>
                    <div style={{ fontWeight: 500 }}>
                      {selectedLogDetails.frequency ? (
                        <Tag color="blue" style={{ borderRadius: '12px' }}>
                          {selectedLogDetails.frequency}{selectedLogDetails.shift ? ` (${selectedLogDetails.shift})` : ''}
                        </Tag>
                      ) : '-'}
                    </div>
                  </div>
                </div>
              </Card>

              <Card
                bordered={false}
                style={{
                  background: '#f5f9ff',
                  borderRadius: 8,
                }}
              >
                <Text strong style={{ display: 'block', marginBottom: 8 }}>
                  Operator Comments
                </Text>
                <div style={{ minHeight: 40 }}>
                  {selectedLogDetails.comments || '-'}
                </div>
              </Card>

              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8,
                  }}
                >
                  <Text strong>Checklist Responses</Text>
                </div>
                <Table
                  columns={responseColumns}
                  dataSource={selectedLogDetails.item_responses || []}
                  rowKey="id"
                  pagination={false}
                  size="small"
                  scroll={{ x: 800 }}
                  style={{
                    background: '#fff',
                    borderRadius: 8,
                  }}
                />
              </div>
            </div>
          )}
      </Modal>
    </div>
  );
};

export default PokaYokeCompletedLogs;
