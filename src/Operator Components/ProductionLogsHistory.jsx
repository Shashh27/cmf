import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Table, Typography, Tag, message, Input, DatePicker, Button, Space, Select, Tooltip } from 'antd';
import { SearchOutlined, ReloadOutlined, CheckCircleOutlined, ClockCircleOutlined, SyncOutlined, DownloadOutlined } from '@ant-design/icons';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SCHEDULING_API_BASE_URL } from '../Config/schedulingconfig';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

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

const ProductionLogsHistory = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [dateRange, setDateRange] = useState(null);
  const [selectedMachines, setSelectedMachines] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fetchProductionLogs = useCallback(async () => {
    setLoading(true);
    try {
      let operatorId = null;
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        try { operatorId = JSON.parse(storedUser).id; }
        catch (e) { console.error('Error parsing user from localStorage', e); }
      }
      if (!operatorId) operatorId = localStorage.getItem('operator_id');

      if (!operatorId) {
        message.error('Operator not found in session. Please log in again.');
        setLoading(false);
        return;
      }

      const response = await fetch(
        `${SCHEDULING_API_BASE_URL}/production-logs/?hierarchical=true&operator_id=${operatorId}`
      );

      if (!response.ok) throw new Error('Failed to fetch production logs');

      const data = await response.json();
      const produced = (data || [])
        .filter(log => (log.produced_quantity || 0) > 0)
        .sort((a, b) =>
          (b.created_at ? dayjs(b.created_at).valueOf() : 0) -
          (a.created_at ? dayjs(a.created_at).valueOf() : 0)
        );

      setLogs(produced);
    } catch (error) {
      console.error('Error fetching production logs:', error);
      message.error('Failed to fetch production logs');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProductionLogs(); }, [fetchProductionLogs]);

  const machineOptions = useMemo(() => {
    const names = new Set();
    logs.forEach(log => {
      const name = log.machine?.make && log.machine?.model
        ? `(${log.machine.make}) ${log.machine.model}`
        : log.machine?.make || log.machine?.model || log.machine?.name;
      if (name) names.add(name);
    });
    return Array.from(names).sort().map(name => ({ label: name, value: name }));
  }, [logs]);

  const filteredLogs = useMemo(() => {
    let result = logs;

    if (selectedMachines.length > 0) {
      result = result.filter(log => {
        const name = log.machine?.make && log.machine?.model
          ? `(${log.machine.make}) ${log.machine.model}`
          : log.machine?.make || log.machine?.model || log.machine?.name || '';
        return selectedMachines.includes(name);
      });
    }

    if (dateRange && dateRange.length === 2) {
      const [start, end] = dateRange;
      result = result.filter(log => {
        const d = log.from_date ? dayjs(log.from_date) : null;
        return d && d.isAfter(start.startOf('day')) && d.isBefore(end.endOf('day'));
      });
    }

    if (searchText) {
      const q = searchText.toLowerCase();
      result = result.filter(log => [
        log.operation?.operation_number,
        log.operation?.operation_name,
        log.operation?.order?.sale_order_number,
        log.operation?.product?.product_name,
        log.operation?.part?.part_name,
        log.operation?.part?.part_number,
        log.operation?.part?.quantity,
        log.machine?.make,
        log.machine?.model,
        log.from_date,
        log.to_date,
        log.produced_quantity,
        log.approved_quantity,
        log.rework_quantity,
        log.rejected_quantity,
        log.status,
        log.supervisor?.user_name,
        log.remarks,
      ].some(f => f && String(f).toLowerCase().includes(q)));
    }

    return result;
  }, [logs, selectedMachines, dateRange, searchText]);

  const rowClassName = (record) => {
    if (!searchText) return '';
    const q = searchText.toLowerCase();
    const matches = [
      record.operation?.operation_number,
      record.operation?.operation_name,
      record.operation?.order?.sale_order_number,
      record.operation?.product?.product_name,
      record.operation?.part?.part_name,
      record.operation?.part?.part_number,
      record.machine?.make,
      record.machine?.model,
      record.status,
      record.supervisor?.user_name,
      record.remarks,
    ].some(f => f && String(f).toLowerCase().includes(q));
    return matches ? 'search-highlight-row' : '';
  };

  const getStatusTag = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed':   return <Tag color="success" icon={<CheckCircleOutlined />}>Completed</Tag>;
      case 'pending':     return <Tag color="processing" icon={<SyncOutlined spin />}>Pending</Tag>;
      case 'rework':      return <Tag color="warning" icon={<ClockCircleOutlined />}>Rework</Tag>;
      case 'approved':    return <Tag color="success">Approved</Tag>;
      case 'rejected':    return <Tag color="error">Rejected</Tag>;
      case 'submitted':   return <Tag color="cyan">Submitted</Tag>;
      case 'in_progress': return <Tag color="blue">In Progress</Tag>;
      default:            return <Tag color="default">{status || 'Unknown'}</Tag>;
    }
  };

  const formatDateTime = (date, time) => {
    if (!date) return 'N/A';
    const datePart = dayjs(date).format('DD-MM-YYYY');
    const timePart = time ? time.replace('.000Z', '').substring(0, 8) : '';
    return timePart ? `${datePart}, ${timePart}` : datePart;
  };

  const getMachineName = (log) =>
    log.machine?.make && log.machine?.model
      ? `(${log.machine.make}) ${log.machine.model}`
      : log.machine?.make || log.machine?.model || log.machine?.name || 'N/A';

  const handleDownloadPDF = () => {
    try {
      const doc = new jsPDF('l', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      
      doc.setFontSize(18);
      doc.text('Production Logs History', pageWidth / 2, 15, { align: 'center' });
      
      doc.setFontSize(10);
      doc.text(`Generated on: ${dayjs().format('DD-MM-YYYY HH:mm:ss')}`, pageWidth / 2, 22, { align: 'center' });
      
      if (filteredLogs.length === 0) {
        doc.setFontSize(12);
        doc.text('No data available', pageWidth / 2, 40, { align: 'center' });
        doc.save('production_logs_history.pdf');
        return;
      }

      const tableData = filteredLogs.map((log, index) => [
        index + 1,
        log.operation?.order?.sale_order_number || '-',
        log.operation?.product?.product_name || '-',
        log.operation?.part?.part_name || '-',
        log.operation?.part?.part_number || '-',
        log.operation?.operation_name || '-',
        log.operation?.operation_number || '-',
        getMachineName(log),
        formatDateTime(log.from_date, log.from_time),
        formatDateTime(log.to_date, log.to_time),
        log.operation?.part?.quantity || 0,
        log.produced_quantity || 0,
        log.approved_quantity || 0,
        log.rework_quantity || 0,
        log.rejected_quantity || 0,
        log.status || '-',
        log.supervisor?.user_name || 'N/A',
        log.remarks || '-',
      ]);

      autoTable(doc, {
        startY: 30,
        head: [
          ['SL No', 'Sale Order', 'Product', 'Part Name', 'Part No', 'Operation', 'Op No', 
           'Machine', 'From Time', 'To Time', 'Part Qty', 'Produced', 'Approved', 'Rework', 
           'Rejected', 'Status', 'Supervisor', 'Remarks']
        ],
        body: tableData,
        styles: {
          fontSize: 7,
          cellPadding: 2,
          overflow: 'linebreak',
        },
        headStyles: {
          fillColor: [24, 144, 255],
          textColor: 255,
          fontStyle: 'bold',
        },
        alternateRowStyles: {
          fillColor: [240, 248, 255],
        },
        columnStyles: {
          0: { cellWidth: 10 },
          1: { cellWidth: 25 },
          2: { cellWidth: 30 },
          3: { cellWidth: 25 },
          4: { cellWidth: 20 },
          5: { cellWidth: 25 },
          6: { cellWidth: 15 },
          7: { cellWidth: 25 },
          8: { cellWidth: 25 },
          9: { cellWidth: 25 },
          10: { cellWidth: 15 },
          11: { cellWidth: 15 },
          12: { cellWidth: 15 },
          13: { cellWidth: 15 },
          14: { cellWidth: 15 },
          15: { cellWidth: 18 },
          16: { cellWidth: 20 },
          17: { cellWidth: 30 },
        },
      });

      doc.save('production_logs_history.pdf');
      message.success('PDF downloaded successfully');
    } catch (error) {
      console.error('Error generating PDF:', error);
      message.error('Failed to generate PDF');
    }
  };

  const columns = [
    {
      title: 'Sl No',
      key: 'sl_no',
      align: 'center',
      width: 60,
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
          <Text strong>{highlightText(record.operation?.operation_name, searchText)}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>#{highlightText(record.operation?.operation_number, searchText)}</Text>
        </Space>
      ),
    },
    {
      title: 'Machine',
      key: 'machine',
      width: 120,
      render: (_, record) => (
        <Text style={{ fontSize: 12 }}>{highlightText(getMachineName(record), searchText)}</Text>
      ),
    },
    {
      title: 'From Time',
      key: 'from',
      width: 120,
      sorter: (a, b) => {
        const dA = a.from_date && a.from_time ? dayjs(`${a.from_date} ${a.from_time}`).valueOf() : a.from_date ? dayjs(a.from_date).valueOf() : 0;
        const dB = b.from_date && b.from_time ? dayjs(`${b.from_date} ${b.from_time}`).valueOf() : b.from_date ? dayjs(b.from_date).valueOf() : 0;
        return dA - dB;
      },
      sortDirections: ['ascend', 'descend'],
      render: (_, record) => (
        <Text style={{ fontSize: 12 }}>{formatDateTime(record.from_date, record.from_time)}</Text>
      ),
    },
    {
      title: 'To Time',
      key: 'to',
      width: 120,
      sorter: (a, b) => {
        const dA = a.to_date && a.to_time ? dayjs(`${a.to_date} ${a.to_time}`).valueOf() : a.to_date ? dayjs(a.to_date).valueOf() : 0;
        const dB = b.to_date && b.to_time ? dayjs(`${b.to_date} ${b.to_time}`).valueOf() : b.to_date ? dayjs(b.to_date).valueOf() : 0;
        return dA - dB;
      },
      sortDirections: ['ascend', 'descend'],
      render: (_, record) => (
        <Text style={{ fontSize: 12 }}>{formatDateTime(record.to_date, record.to_time)}</Text>
      ),
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
      title: 'Part Qty',
      key: 'part_qty',
      width: 80,
      align: 'center',
      render: (_, record) => <Text>{record.operation?.part?.quantity || 0} {record.operation?.part?.unit || ''}</Text>,
    },
    {
      title: 'Produced Qty',
      dataIndex: 'produced_quantity',
      key: 'produced_quantity',
      width: 80,
      align: 'center',
      render: (qty) => <Text style={{ fontSize: 12 }}>{qty ?? '-'}</Text>,
    },
    {
      title: 'Approved Qty',
      dataIndex: 'approved_quantity',
      key: 'approved_quantity',
      width: 80,
      align: 'center',
      render: (qty) => <Text style={{ fontSize: 12 }}>{qty ?? '-'}</Text>,
    },
    {
      title: 'Rework Qty',
      dataIndex: 'rework_quantity',
      key: 'rework_quantity',
      width: 80,
      align: 'center',
      render: (qty) => <Text style={{ fontSize: 12 }}>{qty ?? '-'}</Text>,
    },
    {
      title: 'Rejected Qty',
      dataIndex: 'rejected_quantity',
      key: 'rejected_quantity',
      width: 80,
      align: 'center',
      render: (qty) => <Text style={{ fontSize: 12 }}>{qty ?? '-'}</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      filters: [
        { text: 'Pending',     value: 'pending' },
        { text: 'Completed',   value: 'completed' },
        { text: 'Rework',      value: 'rework' },
        { text: 'Approved',    value: 'approved' },
        { text: 'Rejected',    value: 'rejected' },
        { text: 'In Progress', value: 'in_progress' },
      ],
      onFilter: (value, record) => record.status?.toLowerCase() === value,
      render: (status) => getStatusTag(status),
    },
    {
      title: 'Approved By',
      key: 'supervisor',
      width: 100,
      render: (_, record) => (
        <Text style={{ fontSize: 12 }}>{highlightText(record.supervisor?.user_name, searchText) || 'N/A'}</Text>
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
  ];

  return (
    <div style={{ padding: 24, height: '100%', display: 'flex', flexDirection: 'column' }}>
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

      <Card style={{ height: '84vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 16 } }}
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
              onChange={(val) => { setSelectedMachines(val); setCurrentPage(1); }}
              options={machineOptions}
              optionFilterProp="label"
            />
            <Input
              placeholder="Search any field..."
              allowClear
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => { setSearchText(e.target.value); setCurrentPage(1); }}
              style={{ minWidth: 200, maxWidth: 300 }}
            />
            <RangePicker
              allowClear
              placeholder={['Start Date', 'End Date']}
              value={dateRange}
              onChange={(dates) => { setDateRange(dates); setCurrentPage(1); }}
              format="DD-MM-YYYY"
              style={{ minWidth: 250 }}
            />
          </Space>
          <Space>
            <Button icon={<DownloadOutlined />} onClick={handleDownloadPDF}>
              Download PDF
            </Button>
            <Button icon={<ReloadOutlined />} onClick={fetchProductionLogs} loading={loading}>
              Refresh
            </Button>
          </Space>
        </div>

        <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <Table
            columns={columns}
            dataSource={filteredLogs}
            rowKey="id"
            loading={loading}
            rowClassName={rowClassName}
            className="modern-table"
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
            scroll={{ x: 'max-content', y: 'calc(83vh - 200px)' }}
          />
        </div>
      </Card>
    </div>
  );
};

export default ProductionLogsHistory;