import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table, Card, Typography, Tag, message, Button, Space,
  Tooltip, Empty, Modal, Input, Select, DatePicker,
} from 'antd';
import {
  SearchOutlined, CheckCircleOutlined, ClockCircleOutlined,
  SyncOutlined, ReloadOutlined, EditOutlined, CheckSquareOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { SCHEDULING_API_BASE_URL } from '../Config/schedulingconfig';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;
const { RangePicker } = DatePicker;

// ── Highlight helper ──────────────────────────────────────────────────────────
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
          <mark key={i} style={{ backgroundColor: '#bae0ff', color: 'inherit', padding: '0 1px', borderRadius: 2 }}>
            {part}
          </mark>
        ) : part
      )}
    </>
  );
};

// ── Reusable quantity input ───────────────────────────────────────────────────
const QuantityInput = ({ label, value, onChange }) => (
  <div style={{ marginBottom: 16 }}>
    <Text strong style={{ display: 'block', marginBottom: 6 }}>{label}</Text>
    <Input
      type="number"
      placeholder={`Enter ${label.toLowerCase()}`}
      value={value}
      onChange={(e) => {
        let val = e.target.value;
        if (val.length > 6) val = val.slice(0, 6);
        onChange(val);
      }}
      onKeyDown={(e) => {
        if (['-', '+', 'e', 'E'].includes(e.key)) e.preventDefault();
      }}
      min={0}
    />
  </div>
);

const ProductionCompletion = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMachines, setSelectedMachines] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [dateRange, setDateRange] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [remarkModal, setRemarkModal] = useState({
    visible: false, log: null, newStatus: '', remark: '', approvedQuantity: 0,
  });

  const [updateModal, setUpdateModal] = useState({
    visible: false, log: null, approvedQty: 0, reworkQty: 0, rejectedQty: 0, remark: '',
  });

  const getSupervisorId = () => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try { return JSON.parse(storedUser).id; }
      catch (e) { console.error('Error parsing user from localStorage', e); }
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
          (log.supervisor_id === null || String(log.supervisor_id) === String(supervisorId)) &&
          log.operator_status?.toLowerCase() !== 'inprogress'
      );

      if (supervisorLogs.length === 0) { setLogs([]); return; }

      const enrichedLogs = supervisorLogs.map((log) => ({
        ...log,
        planned_schedule_item: {
          ...log.planned_schedule_item,
          machine_name: log.machine?.make && log.machine?.model
            ? `(${log.machine.make}) ${log.machine.model}`
            : log.machine?.make || log.machine?.model || log.machine?.name || 'N/A',
          operation_name: log.operation?.operation_name || log.operation?.name || 'N/A',
          operation_number: log.operation?.operation_number || log.operation?.number || 'N/A',
        },
        operator_name: log.operator?.user_name || `Operator #${log.operator_id}`,
      }));

      setLogs(
        enrichedLogs.sort((a, b) =>
          (b.created_at ? dayjs(b.created_at).valueOf() : 0) -
          (a.created_at ? dayjs(a.created_at).valueOf() : 0)
        )
      );
    } catch (error) {
      console.error('Error fetching production logs:', error);
      message.error('Failed to load production logs. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [supervisorId]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const machineOptions = useMemo(() => {
    const names = new Set();
    logs.forEach((log) => {
      const name = log.planned_schedule_item?.machine_name;
      if (name) names.add(name);
    });
    return Array.from(names).sort().map(name => ({ label: name, value: name }));
  }, [logs]);

  const filteredLogs = useMemo(() => {
    let result = logs;
    if (selectedMachines.length > 0) {
      result = result.filter(log => selectedMachines.includes(log.planned_schedule_item?.machine_name));
    }
    if (searchText) {
      const q = searchText.toLowerCase();
      result = result.filter(log => [
        log.operation?.order?.sale_order_number,
        log.operation?.product?.product_name,
        log.operation?.part?.part_name,
        log.operation?.part?.part_number,
        log.planned_schedule_item?.operation_name,
        log.planned_schedule_item?.operation_number,
        log.planned_schedule_item?.machine_name,
        log.operator?.user_name,
        log.status,
        log.notes,
        log.remarks,
      ].some(f => f && String(f).toLowerCase().includes(q)));
    }
    if (dateRange && dateRange.length === 2) {
      const [startDate, endDate] = dateRange;
      result = result.filter(log => {
        const logDate = log.created_at ? dayjs(log.created_at) : null;
        if (!logDate) return false;
        return logDate.isAfter(startDate.startOf('day')) && logDate.isBefore(endDate.endOf('day'));
      });
    }
    return result;
  }, [logs, selectedMachines, searchText, dateRange]);

  const openRemarkModal = (log, newStatus) =>
    setRemarkModal({ visible: true, log, newStatus, remark: '', approvedQuantity: 0 });
  const closeRemarkModal = () =>
    setRemarkModal({ visible: false, log: null, newStatus: '', remark: '', approvedQuantity: 0 });

  const openUpdateModal = (log) =>
    setUpdateModal({
      visible: true, log,
      approvedQty: log.approved_quantity || 0,
      reworkQty: log.rework_quantity || 0,
      rejectedQty: log.rejected_quantity || 0,
      remark: log.remarks || '',
    });
  const closeUpdateModal = () =>
    setUpdateModal({ visible: false, log: null, approvedQty: 0, reworkQty: 0, rejectedQty: 0, remark: '' });

  const handleUpdateQuantities = async () => {
    const { log, approvedQty, reworkQty, rejectedQty, remark } = updateModal;
    const totalApproved = parseInt(approvedQty) || 0;
    const totalRework = parseInt(reworkQty) || 0;
    const totalRejected = parseInt(rejectedQty) || 0;
    const totalAssigned = totalApproved + totalRework + totalRejected;

    if (totalAssigned !== log.produced_quantity) {
      message.error(`Total of approved (${totalApproved}) + rework (${totalRework}) + rejected (${totalRejected}) must equal produced quantity (${log.produced_quantity}). Got total ${totalAssigned} instead.`);
      return;
    }
    if (totalApproved > log.produced_quantity) {
      message.error(`Approved quantity (${totalApproved}) cannot be greater than produced quantity (${log.produced_quantity}).`);
      return;
    }
    if (totalRework < 0 || totalRejected < 0) {
      message.error('Rework and rejected quantities cannot be negative.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${SCHEDULING_API_BASE_URL}/production-logs/${log.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'inprogress',
          supervisor_id: supervisorId,
          remarks: remark || null,
          approved_quantity: totalApproved,
          rework_quantity: totalRework,
          rejected_quantity: totalRejected,
        }),
      });

      if (response.ok) {
        message.success('Quantities updated successfully');
        setLogs(prev => prev.map(l => l.id === log.id
          ? { ...l, approved_quantity: totalApproved, rework_quantity: totalRework, rejected_quantity: totalRejected, status: 'completed' }
          : l
        ));
        closeUpdateModal();
      } else {
        const err = await response.json();
        message.error(`Failed to update quantities: ${err.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error updating quantities:', error);
      message.error('An error occurred while updating the quantities.');
    } finally {
      setLoading(false);
    }
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
      const response = await fetch(`${SCHEDULING_API_BASE_URL}/production-logs/${log.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        message.success(`Status updated to '${newStatus}'.`);
        setLogs(prev => prev.map(l => l.id === log.id ? { ...l, status: newStatus, remarks: remark || null } : l));
        closeRemarkModal();
      } else {
        const err = await response.json();
        message.error(`Failed to update status: ${err.detail || 'Unknown error'}`);
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
      case 'completed': return <Tag color="success" icon={<CheckCircleOutlined />}>Completed</Tag>;
      case 'pending':   return <Tag color="processing" icon={<SyncOutlined spin />}>Pending</Tag>;
      case 'rework':    return <Tag color="warning" icon={<ClockCircleOutlined />}>Rework</Tag>;
      default:          return <Tag color="default">{status || 'Unknown'}</Tag>;
    }
  };

  const rowClassName = (record) => {
    if (!searchText) return '';
    const q = searchText.toLowerCase();
    const matches = [
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
    ].some(f => f && String(f).toLowerCase().includes(q));
    return matches ? 'search-highlight-row' : '';
  };

  const ActionButtons = ({ record }) => {
    const hasQuantities = (record.approved_quantity > 0) || (record.rework_quantity > 0) || (record.rejected_quantity > 0);
    const isDisabled = record.status === 'completed' || record.status === 'rework' || hasQuantities;
    return (
      <Tooltip title="Update Quantities">
        <Button
          type="link"
          size="small"
          icon={<EditOutlined />}
          disabled={isDisabled}
          onClick={() => openUpdateModal(record)}
        >
          Update
        </Button>
      </Tooltip>
    );
  };

  const columns = [
    {
      title: 'Sl No',
      key: 'sl_no',
      width: 50,
      align: 'center',
      render: (_, __, index) => (currentPage - 1) * pageSize + index + 1,
    },
    {
      title: 'Project Details',
      key: 'project_details',
      width: 120,
      fixed: 'left',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{highlightText(record.operation?.order?.sale_order_number, searchText)}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{highlightText(record.operation?.product?.product_name, searchText)}</Text>
        </Space>
      ),
    },
    {
      title: 'Part Details',
      key: 'part_details',
      width: 120,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{highlightText(record.operation?.part?.part_name, searchText)}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{highlightText(record.operation?.part?.part_number, searchText)}</Text>
        </Space>
      ),
    },
    {
      title: 'Operation Details',
      key: 'operation_details',
      width: 120,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{highlightText(record.planned_schedule_item?.operation_name, searchText)}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>#{highlightText(record.planned_schedule_item?.operation_number, searchText)}</Text>
        </Space>
      ),
    },
    {
      title: 'Operator',
      key: 'operator',
      render: (_, record) => <Text style={{ fontSize: 12 }}>{highlightText(record.operator?.user_name, searchText)}</Text>,
    },
    {
      title: 'Machine',
      key: 'machine',
      width: 120,
      render: (_, record) => <Text style={{ fontSize: 12 }}>{highlightText(record.planned_schedule_item?.machine_name, searchText)}</Text>,
    },
    {
      title: 'Total Qty',
      key: 'total_quantity',
      width: 80,
      render: (_, record) => <Text>{record.operation?.part?.quantity || 'N/A'} {record.operation?.part?.unit || ''}</Text>,
    },
    {
      title: 'Produced Qty',
      dataIndex: 'produced_quantity',
      key: 'produced_quantity',
      width: 80,
      render: (qty) => <Text style={{ fontSize: 12 }}>{qty ?? '-'}</Text>,
    },
    {
      title: 'Approved Qty',
      dataIndex: 'approved_quantity',
      key: 'approved_quantity',
      width: 80,
      render: (qty) => <Text style={{ fontSize: 12 }}>{qty ?? '-'}</Text>,
    },
    {
      title: 'Rework Qty',
      dataIndex: 'rework_quantity',
      key: 'rework_quantity',
      width: 80,
      render: (qty) => <Text style={{ fontSize: 12 }}>{qty ?? '-'}</Text>,
    },
    {
      title: 'Rejected Qty',
      dataIndex: 'rejected_quantity',
      key: 'rejected_quantity',
      width: 80,
      render: (qty) => <Text style={{ fontSize: 12 }}>{qty ?? '-'}</Text>,
    },
    {
      title: 'Notes',
      dataIndex: 'notes',
      key: 'notes',
      width: 100,
      render: (notes) => {
        const display = notes ? (notes.length > 20 ? `${notes.substring(0, 20)}...` : notes) : '-';
        return (
          <Tooltip title={notes || ''}>
            <Text style={{ fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
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
        const dA = a.from_date && a.from_time ? dayjs(`${a.from_date} ${a.from_time}`).valueOf() : a.from_date ? dayjs(a.from_date).valueOf() : 0;
        const dB = b.from_date && b.from_time ? dayjs(`${b.from_date} ${b.from_time}`).valueOf() : b.from_date ? dayjs(b.from_date).valueOf() : 0;
        return dA - dB;
      },
      sortDirections: ['ascend', 'descend'],
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: 12 }}>{record.from_date ? dayjs(record.from_date).format('DD-MM-YYYY,') : 'N/A'}</Text>
          <Text style={{ fontSize: 12 }}>{record.from_time ? record.from_time.substring(0, 8) : 'N/A'}</Text>
        </Space>
      ),
    },
    {
      title: 'To Time',
      key: 'to',
      sorter: (a, b) => {
        const dA = a.to_date && a.to_time ? dayjs(`${a.to_date} ${a.to_time}`).valueOf() : a.to_date ? dayjs(a.to_date).valueOf() : 0;
        const dB = b.to_date && b.to_time ? dayjs(`${b.to_date} ${b.to_time}`).valueOf() : b.to_date ? dayjs(b.to_date).valueOf() : 0;
        return dA - dB;
      },
      sortDirections: ['ascend', 'descend'],
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: 12 }}>{record.to_date ? dayjs(record.to_date).format('DD-MM-YYYY,') : 'N/A'}</Text>
          <Text style={{ fontSize: 12 }}>{record.to_time ? record.to_time.substring(0, 8) : 'N/A'}</Text>
        </Space>
      ),
    },
    {
      title: 'Remarks',
      dataIndex: 'remarks',
      key: 'remarks',
      width: 100,
      render: (remarks) => {
        const display = remarks ? (remarks.length > 20 ? `${remarks.substring(0, 20)}...` : remarks) : '-';
        return (
          <Tooltip title={remarks || ''}>
            <Text style={{ fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
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
      width: 80,
      filters: [
        { text: 'Pending', value: 'pending' },
        { text: 'Completed', value: 'completed' },
        { text: 'In Progress', value: 'inprogress' },
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

  // ── Remark modal derived values ───────────────────────────────────────────
  const isComplete = remarkModal.newStatus === 'completed';

  return (
    <div style={{ padding: 24 }}>
      <style>{`
        .modern-table .ant-table-thead > tr > th {
          background: linear-gradient(to bottom, #f0f5ff, #e6f0ff);
          font-weight: 600;
          border-bottom: 2px solid #1890ff;
        }
        .modern-table .ant-table-tbody > tr:hover > td { background: #f0f8ff !important; }
        .modern-table .ant-table-tbody > tr > td { border-bottom: 1px solid #f0f0f0; }
        .search-highlight-row > td { background-color: #e6f4ff !important; }
        .search-highlight-row:hover > td { background-color: #bae0ff !important; }
      `}</style>

      <Card
        title={
          <Space>
            <Title level={4} style={{ margin: 0 }}>Production Completion Monitor</Title>
            {refreshing && <SyncOutlined spin />}
          </Space>
        }
        className="shadow-sm"
      >
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <Space wrap>
            <Select
              mode="multiple"
              allowClear
              showSearch
              placeholder="Filter by machines..."
              style={{ minWidth: 250, maxWidth: 400 }}
              value={selectedMachines}
              onChange={setSelectedMachines}
              options={machineOptions}
              optionFilterProp="label"
            />
            <Input
              placeholder="Search any field..."
              allowClear
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ minWidth: 200, maxWidth: 300 }}
            />
            <RangePicker
              allowClear
              placeholder={['Start Date', 'End Date']}
              value={dateRange}
              onChange={setDateRange}
              format="DD-MM-YYYY"
              style={{ minWidth: 250 }}
            />
          </Space>
          <Button icon={<ReloadOutlined />} onClick={() => { setRefreshing(true); fetchLogs(); }} loading={refreshing}>
            Refresh
          </Button>
        </div>

        <Table
          columns={columns}
          dataSource={filteredLogs}
          rowKey="id"
          loading={loading}
          rowClassName={rowClassName}
          className="modern-table"
          locale={{
            emptyText: (
              <Empty description={selectedMachines.length > 0 ? 'No production logs found for selected machines' : 'No production logs found for this supervisor'} />
            ),
          }}
          pagination={{
            current: currentPage,
            pageSize,
            total: filteredLogs.length,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
            pageSizeOptions: ['10', '20', '50', '100'],
            onChange: (page, size) => { setCurrentPage(page); setPageSize(size); },
            onShowSizeChange: (_, size) => { setCurrentPage(1); setPageSize(size); },
          }}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      {/* ── Remark / Status Modal ─────────────────────────────────────────── */}
      <Modal
        open={remarkModal.visible}
        onCancel={closeRemarkModal}
        onOk={handleUpdateStatus}
        okText={isComplete ? 'Yes, Complete' : 'Yes, Rework'}
        okButtonProps={{
          style: isComplete ? { backgroundColor: '#52c41a', borderColor: '#52c41a' } : {},
          danger: !isComplete,
          loading,
        }}
        cancelText="Cancel"
        title={
          <Space align="center">
            {isComplete
              ? <CheckSquareOutlined style={{ color: '#52c41a', fontSize: 18, marginRight: 8 }} />
              : <EditOutlined style={{ color: '#ff4d4f', fontSize: 18, marginRight: 8 }} />}
            <span>{isComplete ? 'Confirm Completion' : 'Confirm Rework'}</span>
          </Space>
        }
        destroyOnClose
      >
        <p style={{ marginBottom: 16, color: '#595959' }}>
          {isComplete
            ? 'Are you sure you want to mark this production log as completed?'
            : 'Are you sure you want to mark this production log for rework?'}
        </p>

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
                setRemarkModal(prev => ({ ...prev, approvedQuantity: val }));
              }}
              onKeyDown={(e) => { if (['-', '+', 'e', 'E'].includes(e.key)) e.preventDefault(); }}
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
          onChange={(e) => setRemarkModal(prev => ({ ...prev, remark: e.target.value }))}
          maxLength={500}
          showCount
        />
      </Modal>

      {/* ── Update Quantities Modal ───────────────────────────────────────── */}
      <Modal
        open={updateModal.visible}
        onCancel={closeUpdateModal}
        onOk={handleUpdateQuantities}
        okText="Update"
        okButtonProps={{ loading }}
        cancelText="Cancel"
        title={
          <Space align="center">
            <EditOutlined style={{ color: '#1677ff', fontSize: 18, marginRight: 8 }} />
            <span>Update Quantities</span>
          </Space>
        }
        destroyOnClose
      >
        {updateModal.log && (
          <>
            <div style={{ marginBottom: 16 }}>
              <Text strong style={{ display: 'block', marginBottom: 6 }}>Total Produced</Text>
              <Input type="number" value={updateModal.log.produced_quantity} disabled style={{ backgroundColor: '#f5f5f5' }} />
            </div>

            <QuantityInput
              label="Approved Qty"
              value={updateModal.approvedQty}
              onChange={(val) => setUpdateModal(prev => ({ ...prev, approvedQty: val }))}
            />
            <QuantityInput
              label="Rework Qty"
              value={updateModal.reworkQty}
              onChange={(val) => setUpdateModal(prev => ({ ...prev, reworkQty: val }))}
            />
            <QuantityInput
              label="Rejected Qty"
              value={updateModal.rejectedQty}
              onChange={(val) => setUpdateModal(prev => ({ ...prev, rejectedQty: val }))}
            />

            <div style={{ marginBottom: 16 }}>
              <Text strong style={{ display: 'block', marginBottom: 6 }}>
                Remark <Text type="secondary" style={{ fontWeight: 400 }}>(optional)</Text>
              </Text>
              <TextArea
                rows={3}
                placeholder="Enter your remark here..."
                value={updateModal.remark}
                onChange={(e) => setUpdateModal(prev => ({ ...prev, remark: e.target.value }))}
                maxLength={500}
                showCount
              />
            </div>

            <Text type="secondary" style={{ fontSize: 12 }}>
              Total of approved + rework + rejected must not exceed produced quantity
            </Text>
          </>
        )}
      </Modal>
    </div>
  );
};

export default ProductionCompletion;