import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, Typography, Tag, message, DatePicker, Button, Space, Select, Tooltip } from 'antd';
import { ReloadOutlined, CheckCircleOutlined, ClockCircleOutlined, SyncOutlined, DownloadOutlined, ClearOutlined } from '@ant-design/icons';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SCHEDULING_API_BASE_URL } from '../Config/schedulingconfig';
import { API_BASE_URL } from '../Config/auth.js';
import dayjs from 'dayjs';
import cmtisLogo from '../assets/cmtis.png';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const clearButtonStyle = { color: '#ff4d4f', borderColor: '#ff4d4f' };

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
  const [dateRange, setDateRange] = useState(null);
  const [selectedMachines, setSelectedMachines] = useState([]);
  const [orders, setOrders] = useState([]);
  const [parts, setParts] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [selectedParts, setSelectedParts] = useState([]);
  const [selectedOperations, setSelectedOperations] = useState([]);
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

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/orders/`);
        if (res.ok) {
          const data = await res.json();
          setOrders(Array.isArray(data) ? data : []);
        }
      } catch (e) {
        console.error('Error fetching orders:', e);
      }
    };
    fetchOrders();
  }, []);

  const selectedSaleOrder = useMemo(() => {
    if (!selectedProjectId) return null;
    return orders.find((o) => o.id === selectedProjectId)?.sale_order_number ?? null;
  }, [selectedProjectId, orders]);

  const handleProjectChange = (orderId) => {
    setSelectedProjectId(orderId);
    setSelectedParts([]);
    setSelectedOperations([]);
    setParts([]);
    setCurrentPage(1);

    if (!orderId) return;

    const order = orders.find((o) => o.id === orderId);
    const saleOrder = order?.sale_order_number;
    if (!saleOrder) return;

    fetch(`${API_BASE_URL}/orders/sale-order/${saleOrder}/parts`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const list = Array.isArray(d) ? d : (d.parts || []);
        setParts(list);
      })
      .catch(() => setParts([]));
  };

  const applyBaseFilters = useCallback((source) => {
    let result = source;

    if (selectedMachines.length > 0) {
      result = result.filter((log) => {
        const name = log.machine?.make && log.machine?.model
          ? `(${log.machine.make}) ${log.machine.model}`
          : log.machine?.make || log.machine?.model || log.machine?.name || '';
        return selectedMachines.includes(name);
      });
    }

    if (selectedSaleOrder) {
      result = result.filter(
        (log) => log.operation?.order?.sale_order_number === selectedSaleOrder
      );
    }

    if (selectedParts.length > 0) {
      result = result.filter((log) =>
        selectedParts.includes(log.operation?.part?.part_number)
      );
    }

    if (selectedOperations.length > 0) {
      result = result.filter((log) =>
        selectedOperations.includes(String(log.operation?.operation_number ?? ''))
      );
    }

    if (dateRange && dateRange.length === 2) {
      const [start, end] = dateRange;
      const startDay = start.startOf('day');
      const endDay = end.endOf('day');
      result = result.filter((log) => {
        const d = log.from_date ? dayjs(log.from_date) : null;
        return d && d.valueOf() >= startDay.valueOf() && d.valueOf() <= endDay.valueOf();
      });
    }

    return result;
  }, [selectedMachines, selectedSaleOrder, selectedParts, selectedOperations, dateRange]);

  const operatorMeta = useMemo(() => {
    try {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        const user = JSON.parse(storedUser);
        return {
          name: user.user_name || user.name || user.username || 'N/A',
          id: user.id ?? null,
        };
      }
    } catch { /* ignore */ }
    return { name: 'N/A', id: null };
  }, []);

  const getFilterPeriodLabel = () => {
    if (dateRange && dateRange.length === 2) {
      return `${dateRange[0].format('DD-MM-YYYY')} to ${dateRange[1].format('DD-MM-YYYY')}`;
    }
    return 'All Dates';
  };

  const getPdfExportLogs = () => applyBaseFilters(logs);

  const loadImageAsDataUrl = (src) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = src;
    });

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

  const operationOptions = useMemo(() => {
    const opMap = new Map();
    logs.forEach((log) => {
      if (selectedSaleOrder && log.operation?.order?.sale_order_number !== selectedSaleOrder) return;
      if (selectedParts.length > 0 && !selectedParts.includes(log.operation?.part?.part_number)) return;

      const opNum = log.operation?.operation_number;
      if (opNum === undefined || opNum === null || opMap.has(String(opNum))) return;

      const opName = log.operation?.operation_name;
      const label = opName ? `${opName} (#${opNum})` : `#${opNum}`;
      opMap.set(String(opNum), label);
    });
    return Array.from(opMap.entries()).map(([value, label]) => ({ value, label }));
  }, [logs, selectedSaleOrder, selectedParts]);

  const hasActiveFilters = useMemo(
    () =>
      selectedMachines.length > 0 ||
      !!selectedProjectId ||
      selectedParts.length > 0 ||
      selectedOperations.length > 0 ||
      (dateRange && dateRange.length === 2),
    [selectedMachines, selectedProjectId, selectedParts, selectedOperations, dateRange]
  );

  const handleClearFilters = () => {
    setSelectedMachines([]);
    setSelectedProjectId(null);
    setSelectedParts([]);
    setSelectedOperations([]);
    setParts([]);
    setDateRange(null);
    setCurrentPage(1);
  };

  const filteredLogs = useMemo(() => applyBaseFilters(logs), [logs, applyBaseFilters]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filteredLogs.length / pageSize) || 1);
    if (currentPage > maxPage) setCurrentPage(maxPage);
  }, [filteredLogs.length, pageSize, currentPage]);

  const rowClassName = () => '';

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

  const handleDownloadPDF = async () => {
    try {
      const exportLogs = getPdfExportLogs();
      const doc = new jsPDF('l', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 10;
      let logoDataUrl = null;
      try {
        logoDataUrl = await loadImageAsDataUrl(cmtisLogo);
      } catch {
        /* logo optional */
      }

      const metaLabel = { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: [0, 0, 0] };
      const metaValue = { fillColor: [255, 255, 255], textColor: [0, 0, 0] };
      const tableWidth = pageWidth - margin * 2;
      const headerColRest = (tableWidth - 32) / 2;

      autoTable(doc, {
        startY: 8,
        margin: { left: margin, right: margin },
        tableWidth,
        theme: 'grid',
        styles: {
          fontSize: 8,
          cellPadding: 2.5,
          lineColor: [0, 0, 0],
          lineWidth: 0.2,
          valign: 'middle',
        },
        body: [
          [
            { content: '', styles: { minCellHeight: 16 } },
            {
              content: 'PRODUCTION LOGS',
              colSpan: 2,
              styles: { fontStyle: 'bold', fontSize: 13, halign: 'center', valign: 'middle', minCellHeight: 16 },
            },
          ],
          [
            { content: 'Operator :', styles: metaLabel },
            { content: operatorMeta.name, styles: metaValue },
            { content: `Date : ${dayjs().format('DD/MM/YYYY')}`, styles: metaValue },
          ],
          [
            { content: 'Period :', styles: metaLabel },
            { content: getFilterPeriodLabel(), styles: metaValue },
            { content: `Generated At: ${dayjs().format('DD-MM-YYYY, HH:mm:ss')}`, styles: metaValue },
          ],
        ],
        columnStyles: {
          0: { cellWidth: 32 },
          1: { cellWidth: headerColRest },
          2: { cellWidth: headerColRest },
        },
        didDrawCell: (data) => {
          if (data.section === 'body' && data.row.index === 0 && data.column.index === 0 && logoDataUrl) {
            const pad = 2;
            doc.addImage(
              logoDataUrl,
              'PNG',
              data.cell.x + pad,
              data.cell.y + pad,
              data.cell.width - pad * 2,
              data.cell.height - pad * 2
            );
          }
        },
      });

      const startY = (doc.lastAutoTable?.finalY ?? 40) + 4;

      if (exportLogs.length === 0) {
        doc.setFontSize(11);
        doc.text('No production logs found.', pageWidth / 2, startY + 10, { align: 'center' });
        doc.save('production_logs_history.pdf');
        message.success('PDF downloaded successfully');
        return;
      }

      const partQty = (log) => {
        const qty = log.operation?.part?.quantity ?? 0;
        const unit = log.operation?.part?.unit || '';
        return unit ? `${qty} ${unit}` : String(qty);
      };

      const tableData = exportLogs.map((log, index) => [
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
        log.notes || '-',
        partQty(log),
        log.produced_quantity ?? '-',
        log.approved_quantity ?? '-',
        log.rework_quantity ?? '-',
        log.rejected_quantity ?? '-',
        log.supervisor?.user_name || log.reviewer?.user_name || 'N/A',
        log.remarks || '-',
      ]);

      const pdfColWeights = [8, 16, 20, 16, 14, 16, 10, 18, 20, 20, 14, 11, 11, 11, 11, 11, 14, 16];
      const pdfColWeightTotal = pdfColWeights.reduce((sum, w) => sum + w, 0);
      const pdfColumnStyles = Object.fromEntries(
        pdfColWeights.map((weight, index) => [
          index,
          {
            cellWidth: (weight / pdfColWeightTotal) * tableWidth,
            ...(index === 0 || [6, 11, 12, 13, 14, 15].includes(index) ? { halign: 'center' } : {}),
          },
        ])
      );

      autoTable(doc, {
        startY,
        margin: { left: margin, right: margin },
        tableWidth,
        head: [[
          'Sl No', 'Sale Order', 'Product', 'Part Name', 'Part No', 'Operation', 'Op No',
          'Machine', 'Start Time', 'End Time', 'Notes', 'Part Qty', 'Produced',
          'Approved', 'Rework', 'Rejected', 'Approved By', 'Remarks',
        ]],
        body: tableData,
        theme: 'grid',
        styles: {
          fontSize: 6,
          cellPadding: 1.5,
          overflow: 'linebreak',
          valign: 'middle',
          lineColor: [0, 0, 0],
          lineWidth: 0.15,
          textColor: [0, 0, 0],
        },
        bodyStyles: {
          textColor: [0, 0, 0],
          fontStyle: 'normal',
        },
        headStyles: {
          fillColor: [220, 220, 220],
          textColor: [0, 0, 0],
          fontStyle: 'bold',
          halign: 'center',
        },
        columnStyles: pdfColumnStyles,
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
          <Text strong>{highlightText(record.operation?.order?.sale_order_number, '')}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{highlightText(record.operation?.product?.product_name, '')}</Text>
        </Space>
      ),
    },
    {
      title: 'Part Details',
      key: 'part_details',
      width: 120,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{highlightText(record.operation?.part?.part_name, '')}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{highlightText(record.operation?.part?.part_number, '')}</Text>
        </Space>
      ),
    },
    {
      title: 'Operation Details',
      key: 'operation_details',
      width: 120,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{highlightText(record.operation?.operation_name, '')}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>#{highlightText(record.operation?.operation_number, '')}</Text>
        </Space>
      ),
    },
    {
      title: 'Machine',
      key: 'machine',
      width: 120,
      render: (_, record) => (
        <Text style={{ fontSize: 12 }}>{highlightText(getMachineName(record), '')}</Text>
      ),
    },
    {
      title: 'Start Time',
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
      title: 'End Time',
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
              {highlightText(display, '')}
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
        <Text style={{ fontSize: 12 }}>
          {highlightText(record.supervisor?.user_name || record.reviewer?.user_name, '') || 'N/A'}
        </Text>
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
              {highlightText(display, '')}
            </Text>
          </Tooltip>
        );
      },
    },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
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
        .production-log-table-wrap {
          flex: 1;
          min-height: 0;
          overflow: auto;
        }
      `}</style>

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
            <Select
              placeholder="Select Project"
              showSearch
              allowClear
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              value={selectedProjectId}
              onChange={handleProjectChange}
              style={{ minWidth: 180 }}
              options={orders.map((o) => ({
                value: o.id,
                label: o.sale_order_number || `Order ${o.id}`,
              }))}
            />
            <Select
              mode="multiple"
              placeholder="Select Parts"
              showSearch
              allowClear
              disabled={!selectedProjectId}
              maxTagCount={1}
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              value={selectedParts}
              onChange={(val) => {
                setSelectedParts(val);
                setSelectedOperations([]);
                setCurrentPage(1);
              }}
              style={{ minWidth: 220, maxWidth: 320 }}
              options={parts.map((p) => ({
                value: p.part_number,
                label: p.part_name ? `${p.part_name} (${p.part_number})` : p.part_number,
              }))}
            />
            <Select
              mode="multiple"
              placeholder="Select Operations"
              showSearch
              allowClear
              disabled={!selectedProjectId}
              maxTagCount={1}
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              value={selectedOperations}
              onChange={(val) => { setSelectedOperations(val); setCurrentPage(1); }}
              style={{ minWidth: 220, maxWidth: 320 }}
              options={operationOptions}
            />
            <RangePicker
              allowClear
              placeholder={['Start Date', 'End Date']}
              value={dateRange}
              onChange={(dates) => { setDateRange(dates); setCurrentPage(1); }}
              format="DD-MM-YYYY"
              style={{ minWidth: 250 }}
            />
            {hasActiveFilters && (
              <Button icon={<ClearOutlined />} onClick={handleClearFilters} style={clearButtonStyle}>
                Clear
              </Button>
            )}
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

        <div className="production-log-table-wrap">
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
              position: ['bottomCenter'],
              onChange: (page, size) => { setCurrentPage(page); setPageSize(size); },
              onShowSizeChange: (_, size) => { setCurrentPage(1); setPageSize(size); },
            }}
            scroll={{ x: 'max-content', y: 'calc(84vh - 280px)' }}
          />
        </div>
    </div>
  );
};

export default ProductionLogsHistory;