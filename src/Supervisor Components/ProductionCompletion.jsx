import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {Table, Card, Typography, Tag, message, Button, Space,Tooltip, Empty, Grid, Modal, Input, Select, Pagination} from 'antd';
import {SearchOutlined, CheckCircleOutlined,ClockCircleOutlined,SyncOutlined,ReloadOutlined,EditOutlined,CheckSquareOutlined,CloseCircleOutlined,RedoOutlined} from '@ant-design/icons';
import dayjs from 'dayjs';
import { SCHEDULING_API_BASE_URL } from '../Config/schedulingconfig';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { useBreakpoint } = Grid;
const { Option } = Select;

// ── Highlight helper ──────────────────────────────────────────────────────────
// Splits `text` around every case-insensitive occurrence of `query` and wraps
// each match in a light-blue <mark> span.
const highlightText = (text, query) => {
  if (!query || !text) return text ?? '-';
  const str = String(text);
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = str.split(new RegExp(`(${escaped})`, 'gi'));
  if (parts.length === 1) return str;
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark
            key={i}
            style={{
              backgroundColor: '#bae0ff',
              color: 'inherit',
              padding: '0 1px',
              borderRadius: 2,
            }}
          >
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
};

const ProductionCompletion = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMachines, setSelectedMachines] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // ── Remark modal state ────────────────────────────────────────────────────
  const [remarkModal, setRemarkModal] = useState({
    visible: false,
    log: null,
    newStatus: '',
    remark: '',
    approvedQuantity: 0,
  });

  const screens = useBreakpoint();
  const isMobile = !screens.md;

  const getSupervisorId = () => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        return user.id;
      } catch (e) {
        console.error('Error parsing user from localStorage', e);
      }
    }
    return null;
  };

  const supervisorId = getSupervisorId();

  const fetchLogs = useCallback(async () => {
    if (!supervisorId) {
      message.error('Supervisor ID not found in session. Please log in again.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${SCHEDULING_API_BASE_URL}/production-logs/`);
      if (!response.ok) throw new Error('Failed to fetch production logs');

      const allLogs = await response.json();

      const supervisorLogs = allLogs.filter(
        (log) =>
          log.supervisor_id === null ||
          String(log.supervisor_id) === String(supervisorId)
      );

      if (supervisorLogs.length === 0) {
        setLogs([]);
        return;
      }

      const enrichedLogs = supervisorLogs.map((log) => {
        const operationName = log.operation?.operation_name || log.operation?.name || 'N/A';
        const operationNumber = log.operation?.operation_number || log.operation?.number || 'N/A';
        const machineName = log.machine?.make && log.machine?.model
          ? `(${log.machine.make}) ${log.machine.model}`
          : log.machine?.make || log.machine?.model || log.machine?.name || 'N/A';

        return {
          ...log,
          planned_schedule_item: {
            ...log.planned_schedule_item,
            machine_name: machineName,
            operation_name: operationName,
            operation_number: operationNumber,
          },
          operator_name: log.operator?.user_name || `Operator #${log.operator_id}`,
        };
      });

      const sortedLogs = enrichedLogs.sort((a, b) => {
        const dateA = a.created_at ? dayjs(a.created_at).valueOf() : 0;
        const dateB = b.created_at ? dayjs(b.created_at).valueOf() : 0;
        return dateB - dateA;
      });

      setLogs(sortedLogs);
    } catch (error) {
      console.error('Error fetching production logs:', error);
      message.error('Failed to load production logs. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [supervisorId]);

  const machineOptions = useMemo(() => {
    const names = new Set();
    logs.forEach((log) => {
      const machineName = log.planned_schedule_item?.machine_name;
      if (machineName) names.add(machineName);
    });
    return Array.from(names).sort().map(name => ({ label: name, value: name }));
  }, [logs]);

  const filteredLogs = useMemo(() => {
    let result = logs;

    if (selectedMachines.length > 0) {
      result = result.filter(log => {
        const machineName = log.planned_schedule_item?.machine_name;
        return selectedMachines.includes(machineName);
      });
    }

    if (searchText) {
      const lowercasedSearch = searchText.toLowerCase();
      result = result.filter(log => {
        const projectName = String(log.operation?.order?.sale_order_number || '').toLowerCase();
        const productName = String(log.operation?.product?.product_name || '').toLowerCase();
        const partName = String(log.operation?.part?.part_name || '').toLowerCase();
        const partNumber = String(log.operation?.part?.part_number || '').toLowerCase();
        const operationName = String(log.planned_schedule_item?.operation_name || '').toLowerCase();
        const operationNumber = String(log.planned_schedule_item?.operation_number || '').toLowerCase();
        const machineName = String(log.planned_schedule_item?.machine_name || '').toLowerCase();
        const operatorName = String(log.operator?.user_name || '').toLowerCase();
        const status = String(log.status || '').toLowerCase();
        const notes = String(log.notes || '').toLowerCase();
        const remarks = String(log.remarks || '').toLowerCase();

        return (
          projectName.includes(lowercasedSearch) ||
          productName.includes(lowercasedSearch) ||
          partName.includes(lowercasedSearch) ||
          partNumber.includes(lowercasedSearch) ||
          operationName.includes(lowercasedSearch) ||
          operationNumber.includes(lowercasedSearch) ||
          machineName.includes(lowercasedSearch) ||
          operatorName.includes(lowercasedSearch) ||
          status.includes(lowercasedSearch) ||
          notes.includes(lowercasedSearch) ||
          remarks.includes(lowercasedSearch)
        );
      });
    }

    return result;
  }, [logs, selectedMachines, searchText]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchLogs();
  };

  const openRemarkModal = (log, newStatus) => {
    setRemarkModal({ visible: true, log, newStatus, remark: '', approvedQuantity: 0 });
  };

  const closeRemarkModal = () => {
    setRemarkModal({ visible: false, log: null, newStatus: '', remark: '', approvedQuantity: 0 });
  };

  const handleUpdateStatus = async () => {
    const { log, newStatus, remark } = remarkModal;
    setLoading(true);

    const payload = {
      operation_id: log.operation_id,
      operator_id: log.operator_id,
      supervisor_id: supervisorId,
      notes: log.notes,
      remarks: remark || null,
      from_date: log.from_date,
      from_time: log.from_time,
      to_date: log.to_date,
      to_time: log.to_time,
      status: newStatus,
    };

    if (newStatus !== 'completed') {
      const approvedQuantity = parseInt(remarkModal.approvedQuantity) || 0;
      if (newStatus === 'rework' && approvedQuantity >= log.produced_quantity) {
        message.error(`For rework status, approved quantity (${approvedQuantity}) must be less than produced quantity (${log.produced_quantity})`);
        setLoading(false);
        return;
      }
      payload.approved_quantity = approvedQuantity;
    }

    try {
      const response = await fetch(
        `${SCHEDULING_API_BASE_URL}/production-logs/${log.id}/status`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      if (response.ok) {
        message.success(`Status updated to '${newStatus}'.`);
        setLogs((prev) =>
          prev.map((l) =>
            l.id === log.id ? { ...l, status: newStatus, remarks: remark || null } : l
          )
        );
        closeRemarkModal();
      } else {
        const errorData = await response.json();
        message.error(`Failed to update status: ${errorData.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error updating status:', error);
      message.error('An error occurred while updating the status.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusTag = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return <Tag color="success" icon={<CheckCircleOutlined />}>Completed</Tag>;
      case 'pending':
        return <Tag color="processing" icon={<SyncOutlined spin />}>Pending</Tag>;
      case 'rework':
        return <Tag color="warning" icon={<ClockCircleOutlined />}>Rework</Tag>;
      default:
        return <Tag color="default">{status || 'Unknown'}</Tag>;
    }
  };

  // ── Row highlight: entire row gets light-blue background when any field matches ──
  const rowClassName = (record) => {
    if (!searchText) return '';
    const q = searchText.toLowerCase();
    const fields = [
      record.operation?.order?.sale_order_number,
      record.operation?.product?.product_name,
      record.operation?.part?.part_name,
      record.operation?.part?.part_number,
      record.planned_schedule_item?.operation_name,
      record.planned_schedule_item?.operation_number,
      record.planned_schedule_item?.machine_name,
      record.operator?.user_name,
      record.status,
      record.notes,
      record.remarks,
    ];
    const matches = fields.some(f => f && String(f).toLowerCase().includes(q));
    return matches ? 'search-highlight-row' : '';
  };

  const ActionButtons = ({ record }) => {
    const isDisabled = record.status === 'completed' || record.status === 'rework';
    return (
      <Space>
        <Tooltip title="Mark as Completed">
          <span
            style={{
              color: isDisabled ? '#bfbfbf' : '#52c41a',
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              fontSize: '16px'
            }}
            onClick={() => !isDisabled && openRemarkModal(record, 'completed')}
          >
            <CheckCircleOutlined />
          </span>
        </Tooltip>
        <Tooltip title="Mark as Rework">
          <span
            style={{
              color: isDisabled ? '#bfbfbf' : '#ff4d4f',
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              fontSize: '16px'
            }}
            onClick={() => !isDisabled && openRemarkModal(record, 'rework')}
          >
            <RedoOutlined />
          </span>
        </Tooltip>
      </Space>
    );
  };

  // ── Mobile: stacked cards ─────────────────────────────────────────────────
  const MobileList = () => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedLogs = filteredLogs.slice(startIndex, endIndex);

    if (filteredLogs.length === 0) {
      return <Empty description={selectedMachines.length > 0 ? "No production logs found for selected machines" : "No production logs found for this supervisor"} />;
    }

    const isRowMatch = (record) => {
      if (!searchText) return false;
      const q = searchText.toLowerCase();
      const fields = [
        record.operation?.order?.sale_order_number,
        record.operation?.product?.product_name,
        record.operation?.part?.part_name,
        record.operation?.part?.part_number,
        record.planned_schedule_item?.operation_name,
        record.planned_schedule_item?.operation_number,
        record.planned_schedule_item?.machine_name,
        record.operator?.user_name,
        record.status,
        record.notes,
        record.remarks,
      ];
      return fields.some(f => f && String(f).toLowerCase().includes(q));
    };

    return (
      <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {paginatedLogs.map((record) => (
            <Card
              key={record.id}
              size="small"
              style={{
                borderRadius: 8,
                boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                // Highlight matching cards with a light-blue border + tinted background
                ...(isRowMatch(record) && {
                  backgroundColor: '#f0f8ff',
                  border: '1.5px solid #91caff',
                }),
              }}
              bodyStyle={{ padding: '12px 14px' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <Text strong style={{ fontSize: 14 }}>
                    {highlightText(record.operation?.product?.product_name, searchText)}
                  </Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Project #{highlightText(record.operation?.order?.sale_order_number, searchText)}
                  </Text>
                </div>
                {getStatusTag(record.status)}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', marginBottom: 10 }}>
                <div>
                  <Text type="secondary" style={{ fontSize: 11 }}>Part Name</Text>
                  <br />
                  <Text style={{ fontSize: 13 }}>{highlightText(record.operation?.part?.part_name, searchText)}</Text>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 11 }}>Part Number</Text>
                  <br />
                  <Text style={{ fontSize: 13 }}>{highlightText(record.operation?.part?.part_number, searchText)}</Text>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 11 }}>Operation</Text>
                  <br />
                  <Text style={{ fontSize: 13 }}>
                    {highlightText(record.planned_schedule_item?.operation_name, searchText)}
                  </Text>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 11 }}>Operator</Text>
                  <br />
                  <Text style={{ fontSize: 13 }}>{highlightText(record.operator?.user_name, searchText)}</Text>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 11 }}>Machine</Text>
                  <br />
                  <Text style={{ fontSize: 13 }}>
                    {highlightText(record.planned_schedule_item?.machine_name, searchText)}
                  </Text>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 11 }}>Op. Number</Text>
                  <br />
                  <Text style={{ fontSize: 13 }}>
                    #{highlightText(record.planned_schedule_item?.operation_number, searchText)}
                  </Text>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 11 }}>Total Quantity</Text>
                  <br />
                  <Text style={{ fontSize: 13 }}>
                    {record.operation?.part?.quantity || 'N/A'} {record.operation?.part?.unit || ''}
                  </Text>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 11 }}>Approved Quantity</Text>
                  <br />
                  <Text style={{ fontSize: 13 }}>
                    {record.approved_quantity !== null && record.approved_quantity !== undefined ? record.approved_quantity : '-'}
                  </Text>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 11 }}>From</Text>
                  <br />
                  <Text style={{ fontSize: 13 }}>
                    {record.from_date ? dayjs(record.from_date).format('DD-MM-YYYY') : 'N/A'}
                    <br />{record.from_time ? record.from_time.substring(0, 8) : ''}
                  </Text>
                </div>
                <div>
                  <Text type="secondary" style={{ fontSize: 11 }}>To</Text>
                  <br />
                  <Text style={{ fontSize: 13 }}>
                    {record.to_date ? dayjs(record.to_date).format('DD-MM-YYYY') : 'N/A'}
                    <br />{record.to_time ? record.to_time.substring(0, 8) : ''}
                  </Text>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>Created At</Text>
                  <br />
                  <Text style={{ fontSize: 13 }}>
                    {record.created_at ? dayjs(record.created_at).format('DD-MM-YYYY, HH:mm:ss') : 'N/A'}
                  </Text>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>Notes</Text>
                  <br />
                  <Tooltip title={record.notes || ''}>
                    <Text style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {highlightText(record.notes, searchText) || 'N/A'}
                    </Text>
                  </Tooltip>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
                <ActionButtons record={record} />
              </div>
            </Card>
          ))}
        </div>

        {filteredLogs.length > pageSize && (
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Pagination
              current={currentPage}
              pageSize={pageSize}
              total={filteredLogs.length}
              showSizeChanger
              showQuickJumper
              showTotal={(total, range) => `${range[0]}-${range[1]} of ${total}`}
              pageSizeOptions={['10', '20', '50', '100']}
              onChange={(page, size) => {
                setCurrentPage(page);
                setPageSize(size);
              }}
              onShowSizeChange={(current, size) => {
                setCurrentPage(1);
                setPageSize(size);
              }}
              size="small"
              simple={isMobile}
            />
          </div>
        )}
      </>
    );
  };

  // ── Desktop table columns ─────────────────────────────────────────────────
  const columns = [
    {
      title: 'Project Details',
      key: 'project_details',
      fixed: 'left',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{highlightText(record.operation?.order?.sale_order_number, searchText)}</Text>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {highlightText(record.operation?.product?.product_name, searchText)}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Part Details',
      key: 'part_details',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{highlightText(record.operation?.part?.part_name, searchText)}</Text>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {highlightText(record.operation?.part?.part_number, searchText)}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Operation Details',
      key: 'operation_details',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{highlightText(record.planned_schedule_item?.operation_name, searchText)}</Text>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            #{highlightText(record.planned_schedule_item?.operation_number, searchText)}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Operator',
      key: 'operator',
      render: (_, record) => (
        <Text style={{ fontSize: '12px' }}>
          {highlightText(record.operator?.user_name, searchText)}
        </Text>
      ),
    },
    {
      title: 'Machine',
      key: 'machine',
      render: (_, record) => (
        <Text style={{ fontSize: '12px' }}>
          {highlightText(record.planned_schedule_item?.machine_name, searchText)}
        </Text>
      ),
    },
    {
      title: 'Total Qty',
      key: 'total_quantity',
      render: (_, record) => (
        <Text>{record.operation?.part?.quantity || 'N/A'} {record.operation?.part?.unit || ''}</Text>
      ),
      width: 100,
    },
    {
      title: 'Produced Qty',
      dataIndex: 'produced_quantity',
      key: 'produced_quantity',
      width: 100,
      render: (quantity) => (
        <Text style={{ fontSize: '12px' }}>
          {quantity !== null && quantity !== undefined ? quantity : '-'}
        </Text>
      ),
    },
    {
      title: 'Approved Qty',
      dataIndex: 'approved_quantity',
      key: 'approved_quantity',
      width: 100,
      render: (quantity) => (
        <Text style={{ fontSize: '12px' }}>
          {quantity !== null && quantity !== undefined ? quantity : '-'}
        </Text>
      ),
    },
    {
      title: 'Notes',
      dataIndex: 'notes',
      key: 'notes',
      width: 120,
      render: (notes) => {
        const display = notes
          ? notes.length > 20
            ? `${notes.substring(0, 20)}...`
            : notes
          : '-';
        return (
          <Tooltip title={notes || ''}>
            <Text style={{ fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {highlightText(display, searchText)}
            </Text>
          </Tooltip>
        );
      },
    },
    {
      title: 'From Time',
      key: 'from',
      sorter: (a, b) => {
        const dateTimeA = a.from_date && a.from_time
          ? dayjs(`${a.from_date} ${a.from_time}`).valueOf()
          : a.from_date ? dayjs(a.from_date).valueOf() : 0;
        const dateTimeB = b.from_date && b.from_time
          ? dayjs(`${b.from_date} ${b.from_time}`).valueOf()
          : b.from_date ? dayjs(b.from_date).valueOf() : 0;
        return dateTimeA - dateTimeB;
      },
      sortDirections: ['ascend', 'descend'],
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: '12px' }}>
            {record.from_date ? dayjs(record.from_date).format('DD-MM-YYYY,') : 'N/A'}
          </Text>
          <Text style={{ fontSize: '12px' }}>{record.from_time ? record.from_time.substring(0, 8) : 'N/A'}</Text>
        </Space>
      ),
    },
    {
      title: 'To Time',
      key: 'to',
      sorter: (a, b) => {
        const dateTimeA = a.to_date && a.to_time
          ? dayjs(`${a.to_date} ${a.to_time}`).valueOf()
          : a.to_date ? dayjs(a.to_date).valueOf() : 0;
        const dateTimeB = b.to_date && b.to_time
          ? dayjs(`${b.to_date} ${b.to_time}`).valueOf()
          : b.to_date ? dayjs(b.to_date).valueOf() : 0;
        return dateTimeA - dateTimeB;
      },
      sortDirections: ['ascend', 'descend'],
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: '12px' }}>
            {record.to_date ? dayjs(record.to_date).format('DD-MM-YYYY,') : 'N/A'}
          </Text>
          <Text style={{ fontSize: '12px' }}>{record.to_time ? record.to_time.substring(0, 8) : 'N/A'}</Text>
        </Space>
      ),
    },
    {
      title: 'Remarks',
      dataIndex: 'remarks',
      key: 'remarks',
      width: 120,
      render: (remarks) => {
        const display = remarks
          ? remarks.length > 20
            ? `${remarks.substring(0, 20)}...`
            : remarks
          : '-';
        return (
          <Tooltip title={remarks || ''}>
            <Text style={{ fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {highlightText(display, searchText)}
            </Text>
          </Tooltip>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      filters: [
        { text: 'Pending', value: 'pending' },
        { text: 'Completed', value: 'completed' },
        { text: 'Rework', value: 'rework' },
      ],
      onFilter: (value, record) => record.status?.toLowerCase() === value,
      render: (status) => getStatusTag(status),
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right',
      render: (_, record) => <ActionButtons record={record} />,
    },
  ];

  const isComplete = remarkModal.newStatus === 'completed';
  const modalTitle = isComplete ? 'Confirm Completion' : 'Confirm Rework';
  const modalOkText = isComplete ? 'Yes, Complete' : 'Yes, Rework';
  const modalOkStyle = isComplete
    ? { backgroundColor: '#52c41a', borderColor: '#52c41a' }
    : {};
  const modalIcon = isComplete
    ? <CheckSquareOutlined style={{ color: '#52c41a', fontSize: 18, marginRight: 8 }} />
    : <EditOutlined style={{ color: '#ff4d4f', fontSize: 18, marginRight: 8 }} />;
  const modalDesc = isComplete
    ? 'Are you sure you want to mark this production log as completed?'
    : 'Are you sure you want to mark this production log for rework?';

  return (
    <div style={{ padding: isMobile ? '12px' : '24px' }}>
      {/* Inject row highlight CSS */}
      <style>{`
        .search-highlight-row > td {
          background-color: #e6f4ff !important;
        }
        .search-highlight-row:hover > td {
          background-color: #bae0ff !important;
        }
      `}</style>

      <Card
        title={
          <Space>
            <Title level={4} style={{ margin: 0, fontSize: isMobile ? 15 : 20 }}>
              Production Completion Monitor
            </Title>
            {refreshing && <SyncOutlined spin />}
          </Space>
        }
        className="shadow-sm"
        bodyStyle={{ padding: isMobile ? '8px' : '24px' }}
      >
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <Space wrap style={{ flex: 1 }}>
            <Select
              mode="multiple"
              allowClear
              showSearch
              placeholder="Filter by machines..."
              style={{ minWidth: 250, maxWidth: 400 }}
              value={selectedMachines}
              onChange={setSelectedMachines}
              options={machineOptions}
              filterOption={(input, option) =>
                option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
              }
              size={isMobile ? 'small' : 'middle'}
            />
            <Input
              placeholder="Search any field..."
              allowClear
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ minWidth: 200, maxWidth: 300 }}
              size={isMobile ? 'small' : 'middle'}
            />
          </Space>
          <Button
            type="default"
            icon={<ReloadOutlined />}
            onClick={handleRefresh}
            loading={refreshing}
            size={isMobile ? 'small' : 'middle'}
          >
            {!isMobile && 'Refresh'}
          </Button>
        </div>

        {isMobile ? (
          loading ? (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <SyncOutlined spin style={{ fontSize: 24, color: '#1677ff' }} />
            </div>
          ) : (
            <MobileList filteredLogs={filteredLogs} />
          )
        ) : (
          <Table
            columns={columns}
            dataSource={filteredLogs}
            rowKey="id"
            loading={loading}
            rowClassName={rowClassName}
            locale={{
              emptyText: (
                <Empty description={selectedMachines.length > 0 ? "No production logs found for selected machines" : "No production logs found for this supervisor"} />
              ),
            }}
            pagination={{
              current: currentPage,
              pageSize: pageSize,
              total: filteredLogs.length,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
              pageSizeOptions: ['10', '20', '50', '100'],
              onChange: (page, size) => {
                setCurrentPage(page);
                setPageSize(size);
              },
              onShowSizeChange: (current, size) => {
                setCurrentPage(1);
                setPageSize(size);
              },
            }}
            scroll={{ x: 'max-content' }}
          />
        )}
      </Card>

      <Modal
        open={remarkModal.visible}
        onCancel={closeRemarkModal}
        onOk={handleUpdateStatus}
        okText={modalOkText}
        okButtonProps={{
          style: isComplete ? modalOkStyle : {},
          danger: !isComplete,
          loading: loading,
        }}
        cancelText="Cancel"
        title={
          <Space align="center">
            {modalIcon}
            <span>{modalTitle}</span>
          </Space>
        }
        destroyOnClose
      >
        <p style={{ marginBottom: 16, color: '#595959' }}>{modalDesc}</p>

        <div>
          {!isComplete && (
            <div>
              <Text strong style={{ display: 'block', marginBottom: 6, marginTop: 12 }}>
                Approved Quantity <Text type="danger" style={{ fontWeight: 400 }}>*</Text>
              </Text>
              <Input
                type="number"
                placeholder="Enter approved quantity"
                value={remarkModal.approvedQuantity}
                onChange={(e) => {
                  let val = e.target.value;
                  if (val.length > 6) val = val.slice(0, 6);
                  setRemarkModal((prev) => ({ ...prev, approvedQuantity: val }));
                }}
                onKeyDown={(e) => {
                  if (e.key === '-' || e.key === '+' || e.key === 'e' || e.key === 'E') {
                    e.preventDefault();
                  }
                }}
                min={0}
                style={{ marginBottom: 8 }}
              />
            </div>
          )}
          <Text strong style={{ display: 'block', marginBottom: 6 }}>
            Remark <Text type="secondary" style={{ fontWeight: 400 }}>(optional)</Text>
          </Text>
          <TextArea
            rows={4}
            placeholder="Enter your remark here..."
            value={remarkModal.remark}
            onChange={(e) =>
              setRemarkModal((prev) => ({ ...prev, remark: e.target.value }))
            }
            maxLength={500}
            showCount
          />
        </div>
      </Modal>
    </div>
  );
};

export default ProductionCompletion;