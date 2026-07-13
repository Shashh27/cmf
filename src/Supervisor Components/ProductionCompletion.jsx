import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table, Typography, Tag, message, Button, Space,
  Tooltip, Empty, Modal, Input, Select, DatePicker, Card, Spin,
} from 'antd';
import {
  SearchOutlined, CheckCircleOutlined, ClockCircleOutlined,
  SyncOutlined, ReloadOutlined, EditOutlined, CheckSquareOutlined,
  DownloadOutlined, ClearOutlined,
} from '@ant-design/icons';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import dayjs from 'dayjs';
import { SCHEDULING_API_BASE_URL } from '../Config/schedulingconfig';
import { API_BASE_URL } from '../Config/auth.js';
import cmtisLogo from '../assets/cmtis.png';

const { Text } = Typography;
const { TextArea } = Input;
const { RangePicker } = DatePicker;

const clearButtonStyle = { color: '#ff4d4f', borderColor: '#ff4d4f' };

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

const getApprovedByName = (log) =>
  log?.supervisor?.user_name ||
  log?.reviewer?.user_name ||
  (log?.supervisor_id ? `User #${log.supervisor_id}` : null) ||
  (log?.user_id ? `User #${log.user_id}` : null) ||
  '-';

const getTotalPresented = (log) =>
  (log?.produced_quantity || 0) + (log?.operator_rework_quantity || 0);

const isLogReviewed = (log) =>
  log?.approved_quantity !== null && log?.approved_quantity !== undefined;

const canReviewLog = (log) =>
  log?.can_review !== false &&
  !log?.review_locked &&
  !isLogReviewed(log) &&
  (log?.status?.toLowerCase() === 'pending' || log?.status?.toLowerCase() === 'inprogress');

const hasLogSubmission = (log) =>
  (log?.produced_quantity || 0) > 0 || (log?.operator_rework_quantity || 0) > 0;

const ProductionCompletion = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMachines, setSelectedMachines] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [dateRange, setDateRange] = useState(null);
  const [orders, setOrders] = useState([]);
  const [parts, setParts] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [selectedParts, setSelectedParts] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [remarkModal, setRemarkModal] = useState({
    visible: false, log: null, newStatus: '', remark: '', approvedQuantity: 0,
  });

  const [updateModal, setUpdateModal] = useState({
    visible: false, log: null, approvedQty: 0, reworkQty: 0, rejectedQty: 0, remark: '',
  });

  const [pdfPreview, setPdfPreview] = useState({ open: false, url: null, filename: '', recordCount: 0 });
  const [pdfGenerating, setPdfGenerating] = useState(false);

  const getSupervisorId = () => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        return user.id ?? user.user_id ?? user.userId ?? null;
      } catch (e) {
        console.error('Error parsing user from localStorage', e);
      }
    }
    return localStorage.getItem('supervisor_id') || localStorage.getItem('user_id') || null;
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

      const visibleLogs = allLogs.filter(
        (log) => log.operator_status?.toLowerCase() !== 'inprogress' && hasLogSubmission(log)
      );

      if (visibleLogs.length === 0) { setLogs([]); return; }

      const enrichedLogs = visibleLogs.map((log) => ({
        ...log,
        planned_schedule_item: {
          machine_name: log.machine?.make && log.machine?.model
            ? `(${log.machine.make}) ${log.machine.model}`
            : log.machine?.make || log.machine?.model || 'N/A',
          operation_name: log.operation?.operation_name || 'N/A',
          operation_number: log.operation?.operation_number || 'N/A',
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

  const supervisorMeta = useMemo(() => {
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

  const hasActiveFilters = useMemo(() => (
    selectedMachines.length > 0 ||
    Boolean(searchText?.trim()) ||
    Boolean(selectedProjectId) ||
    selectedParts.length > 0 ||
    (dateRange && dateRange.length === 2)
  ), [selectedMachines, searchText, selectedProjectId, selectedParts, dateRange]);

  const clearFilters = () => {
    setSelectedMachines([]);
    setSearchText('');
    setSelectedProjectId(null);
    setSelectedParts([]);
    setParts([]);
    setDateRange(null);
    setCurrentPage(1);
  };

  const selectedSaleOrder = useMemo(() => {
    if (!selectedProjectId) return null;
    return orders.find((o) => o.id === selectedProjectId)?.sale_order_number ?? null;
  }, [selectedProjectId, orders]);

  const handleProjectChange = (orderId) => {
    setSelectedProjectId(orderId);
    setSelectedParts([]);
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

  const getFilterPeriodLabel = () => {
    if (dateRange && dateRange.length === 2) {
      return `${dateRange[0].format('DD-MM-YYYY')} to ${dateRange[1].format('DD-MM-YYYY')}`;
    }
    return 'All Dates';
  };

  const applyBaseFilters = useCallback((source) => {
    let result = source;

    if (selectedMachines.length > 0) {
      result = result.filter((log) =>
        selectedMachines.includes(log.planned_schedule_item?.machine_name)
      );
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

    if (dateRange && dateRange.length === 2) {
      const [start, end] = dateRange;
      const startDay = start.startOf('day');
      const endDay = end.endOf('day');
      result = result.filter((log) => {
        const d = log.from_date ? dayjs(log.from_date) : (log.created_at ? dayjs(log.created_at) : null);
        return d && d.valueOf() >= startDay.valueOf() && d.valueOf() <= endDay.valueOf();
      });
    }

    return result;
  }, [selectedMachines, selectedSaleOrder, selectedParts, dateRange]);

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
    logs.forEach((log) => {
      const name = log.planned_schedule_item?.machine_name;
      if (name) names.add(name);
    });
    return Array.from(names).sort().map(name => ({ label: name, value: name }));
  }, [logs]);

  const filteredLogs = useMemo(() => {
    let result = applyBaseFilters(logs);

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
        getApprovedByName(log),
        log.status,
        log.notes,
        log.remarks,
      ].some(f => f && String(f).toLowerCase().includes(q)));
    }

    return result;
  }, [logs, applyBaseFilters, searchText]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filteredLogs.length / pageSize) || 1);
    if (currentPage > maxPage) setCurrentPage(maxPage);
  }, [filteredLogs.length, pageSize, currentPage]);

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

    const totalPresented = getTotalPresented(log);

    if (totalAssigned !== totalPresented) {
      message.error(`Total of approved (${totalApproved}) + rework (${totalRework}) + rejected (${totalRejected}) must equal presented quantity (${totalPresented}) = produced (${log.produced_quantity || 0}) + operator rework (${log.operator_rework_quantity || 0}). Got total ${totalAssigned} instead.`);
      return;
    }
    if (totalRework < 0 || totalRejected < 0) {
      message.error('Rework and rejected quantities cannot be negative.');
      return;
    }

    if (!supervisorId) {
      message.error('User not found in session. Please log in again.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${SCHEDULING_API_BASE_URL}/production-logs/${log.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'inprogress',
          user_id: supervisorId,
          remarks: remark || null,
          approved_quantity: totalApproved,
          rework_quantity: totalRework,
          rejected_quantity: totalRejected,
        }),
      });

      if (response.ok) {
        const updated = await response.json();
        message.success(
          updated.remaining_to_close === 0
            ? 'Review saved — part order is complete'
            : 'Quantities updated successfully'
        );
        setLogs(prev => prev.map(l => l.id === log.id
          ? {
            ...l,
            ...updated,
            planned_schedule_item: l.planned_schedule_item,
            operator_name: l.operator_name,
          }
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
    if (!supervisorId) {
      message.error('User not found in session. Please log in again.');
      return;
    }

    setLoading(true);

    const payload = {
      operation_id: log.operation_id,
      operator_id: log.operator_id,
      user_id: supervisorId,
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
      const totalPresented = getTotalPresented(log);
      if (newStatus === 'rework' && approvedQuantity >= totalPresented) {
        message.error(`For rework status, approved quantity (${approvedQuantity}) must be less than presented quantity (${totalPresented})`);
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
      getApprovedByName(record),
      record.status,
      record.notes,
      record.remarks,
    ].some(f => f && String(f).toLowerCase().includes(q));
    return matches ? 'search-highlight-row' : '';
  };

  const formatDateTime = (date, time) => {
    if (!date) return 'N/A';
    const datePart = dayjs(date).format('DD-MM-YYYY');
    const timePart = time ? time.replace('.000Z', '').substring(0, 8) : '';
    return timePart ? `${datePart}, ${timePart}` : datePart;
  };

  const getMachineName = (log) => log.planned_schedule_item?.machine_name || 'N/A';

  const buildPdfDocument = async () => {
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
              content: 'PRODUCTION COMPLETION',
              colSpan: 2,
              styles: { fontStyle: 'bold', fontSize: 13, halign: 'center', valign: 'middle', minCellHeight: 16 },
            },
          ],
          [
            { content: 'Supervisor :', styles: metaLabel },
            { content: supervisorMeta.name, styles: metaValue },
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
        return { doc, recordCount: 0 };
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
        log.planned_schedule_item?.operation_name || '-',
        log.planned_schedule_item?.operation_number || '-',
        log.operator?.user_name || log.operator_name || 'N/A',
        getMachineName(log),
        partQty(log),
        log.produced_quantity ?? '-',
        log.operator_rework_quantity ?? '-',
        getTotalPresented(log),
        log.approved_quantity ?? '-',
        log.rework_quantity ?? '-',
        log.rejected_quantity ?? '-',
        log.remaining_to_close ?? '-',
        log.rework_due ?? '-',
        log.reject_due ?? '-',
        log.notes || '-',
        formatDateTime(log.from_date, log.from_time),
        formatDateTime(log.to_date, log.to_time),
        log.remarks || '-',
        getApprovedByName(log),
      ]);

      const pdfColWeights = [8, 16, 20, 16, 14, 16, 10, 16, 18, 12, 10, 10, 10, 10, 10, 10, 10, 10, 10, 14, 20, 20, 16, 14];
      const pdfColWeightTotal = pdfColWeights.reduce((sum, w) => sum + w, 0);
      const pdfColumnStyles = Object.fromEntries(
        pdfColWeights.map((weight, index) => [
          index,
          {
            cellWidth: (weight / pdfColWeightTotal) * tableWidth,
            ...(index === 0 || [6, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].includes(index) ? { halign: 'center' } : {}),
          },
        ])
      );

      autoTable(doc, {
        startY,
        margin: { left: margin, right: margin },
        tableWidth,
        head: [[
          'Sl No', 'Sale Order', 'Product', 'Part Name', 'Part No', 'Operation', 'Op No',
          'Operator', 'Machine', 'Total Qty', 'New Prod.', 'Rework Sub.', 'Produced',
          'Approved', 'Rework', 'Rejected', 'Rem. Close', 'Rework Due', 'Reject Due',
          'Notes', 'Start Time', 'End Time', 'Remarks', 'Approved By',
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

      return { doc, recordCount: exportLogs.length };
  };

  const closePdfPreview = () => {
    if (pdfPreview.url) URL.revokeObjectURL(pdfPreview.url);
    setPdfPreview({ open: false, url: null, filename: '', recordCount: 0 });
  };

  const handleOpenPdfPreview = async () => {
    try {
      setPdfGenerating(true);
      const { doc, recordCount } = await buildPdfDocument();
      const url = doc.output('bloburl');
      setPdfPreview({
        open: true,
        url,
        filename: 'production_completion.pdf',
        recordCount,
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      message.error('Failed to generate PDF preview');
    } finally {
      setPdfGenerating(false);
    }
  };

  const handleConfirmPdfDownload = () => {
    if (!pdfPreview.url) return;
    const link = document.createElement('a');
    link.href = pdfPreview.url;
    link.download = pdfPreview.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    message.success('PDF downloaded successfully');
    closePdfPreview();
  };

  const ActionButtons = ({ record }) => {
    const reviewable = canReviewLog(record);
    return (
      <Tooltip title={reviewable ? 'Review quantities' : 'Already reviewed'}>
        <Button
          type="link"
          size="small"
          icon={<EditOutlined />}
          disabled={!reviewable}
          onClick={() => openUpdateModal(record)}
        >
          Review
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
      title: 'New Produced',
      dataIndex: 'produced_quantity',
      key: 'produced_quantity',
      width: 80,
      align: 'center',
      render: (qty) => <Text style={{ fontSize: 12 }}>{qty ?? '-'}</Text>,
    },
    {
      title: 'Rework Submit',
      dataIndex: 'operator_rework_quantity',
      key: 'operator_rework_quantity',
      width: 85,
      align: 'center',
      render: (qty) => <Text style={{ fontSize: 12, color: qty > 0 ? '#FA8C16' : undefined }}>{qty ?? '-'}</Text>,
    },
    {
      title: 'Produced',
      key: 'presented',
      width: 75,
      align: 'center',
      render: (_, record) => (
        <Text strong style={{ fontSize: 12 }}>{getTotalPresented(record)}</Text>
      ),
    },
    {
      title: 'Approved',
      dataIndex: 'approved_quantity',
      key: 'approved_quantity',
      width: 75,
      align: 'center',
      render: (qty) => (
        <Text style={{ fontSize: 12, color: qty > 0 ? '#52c41a' : undefined, fontWeight: qty > 0 ? 600 : 400 }}>
          {qty ?? '-'}
        </Text>
      ),
    },
    {
      title: 'Rework (rev.)',
      dataIndex: 'rework_quantity',
      key: 'rework_quantity',
      width: 85,
      align: 'center',
      render: (qty) => <Text style={{ fontSize: 12, color: qty > 0 ? '#FA8C16' : undefined }}>{qty ?? '-'}</Text>,
    },
    {
      title: 'Rejected',
      dataIndex: 'rejected_quantity',
      key: 'rejected_quantity',
      width: 75,
      align: 'center',
      render: (qty) => <Text style={{ fontSize: 12, color: qty > 0 ? '#ff4d4f' : undefined }}>{qty ?? '-'}</Text>,
    },
    {
      title: 'Order Ledger',
      key: 'ledger',
      width: 95,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: 11 }}>Close: <strong>{record.remaining_to_close ?? '-'}</strong></Text>
          {(record.rework_due > 0) && (
            <Text style={{ fontSize: 11, color: '#FA8C16' }}>Rework: {record.rework_due}</Text>
          )}
          {(record.reject_due > 0) && (
            <Text style={{ fontSize: 11, color: '#FF4D4F' }}>Reject: {record.reject_due}</Text>
          )}
        </Space>
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
      title: 'Approved By',
      key: 'approved_by',
      width: 110,
      render: (_, record) => (
        <Text style={{ fontSize: 12 }}>{highlightText(getApprovedByName(record), searchText)}</Text>
      ),
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
            <Input
              placeholder="Search any field..."
              allowClear
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => { setSearchText(e.target.value); setCurrentPage(1); }}
              style={{ minWidth: 200, maxWidth: 300 }}
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
              onChange={(val) => { setSelectedParts(val); setCurrentPage(1); }}
              style={{ minWidth: 220, maxWidth: 320 }}
              options={parts.map((p) => ({
                value: p.part_number,
                label: p.part_name ? `${p.part_name} (${p.part_number})` : p.part_number,
              }))}
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
            {hasActiveFilters && (
              <Button icon={<ClearOutlined />} onClick={clearFilters} style={clearButtonStyle}>
                Clear
              </Button>
            )}
            <Button icon={<DownloadOutlined />} onClick={handleOpenPdfPreview} loading={pdfGenerating}>
              Download PDF
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => { setRefreshing(true); fetchLogs(); }} loading={refreshing}>
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
            locale={{
              emptyText: (
                <Empty description={selectedMachines.length > 0 ? 'No production logs found for selected machines' : 'No production logs found'} />
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
              position: ['bottomCenter'],
              onChange: (page, size) => { setCurrentPage(page); setPageSize(size); },
              onShowSizeChange: (_, size) => { setCurrentPage(1); setPageSize(size); },
            }}
            scroll={{ x: 'max-content', y: 'calc(84vh - 280px)' }}
          />
        </div>

      <Modal
        title="Production Completion — PDF Preview"
        open={pdfPreview.open}
        onCancel={closePdfPreview}
        width="92%"
        style={{ maxWidth: 1200, top: 20 }}
        destroyOnClose
        footer={[
          <Button key="close" onClick={closePdfPreview}>Close</Button>,
          <Button key="download" type="primary" icon={<DownloadOutlined />} onClick={handleConfirmPdfDownload}>
            Download PDF
          </Button>,
        ]}
      >
        <Card size="small" style={{ marginBottom: 16, background: '#f0f5ff', borderColor: '#adc6ff' }}>
          <Space wrap size="large">
            <Text><Text strong>Supervisor:</Text> {supervisorMeta.name}</Text>
            <Text><Text strong>Period:</Text> {getFilterPeriodLabel()}</Text>
            <Text><Text strong>Records:</Text> {pdfPreview.recordCount}</Text>
            <Text><Text strong>Generated:</Text> {dayjs().format('DD-MM-YYYY, HH:mm:ss')}</Text>
          </Space>
        </Card>
        {pdfPreview.url ? (
          <iframe
            src={pdfPreview.url}
            title="Production Completion PDF Preview"
            style={{ width: '100%', height: '68vh', border: '1px solid #d9d9d9', borderRadius: 4 }}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>
        )}
      </Modal>

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
        okText="Submit Review"
        okButtonProps={{ loading }}
        cancelText="Cancel"
        title={
          <Space align="center">
            <EditOutlined style={{ color: '#1677ff', fontSize: 18, marginRight: 8 }} />
            <span>Review Quantities</span>
          </Space>
        }
        destroyOnClose
      >
        {updateModal.log && (
          <>
            <div style={{ marginBottom: 16 }}>
              <Text strong style={{ display: 'block', marginBottom: 6 }}>New Produced</Text>
              <Input type="number" value={updateModal.log.produced_quantity} disabled style={{ backgroundColor: '#f5f5f5' }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <Text strong style={{ display: 'block', marginBottom: 6 }}>Operator Rework Submitted</Text>
              <Input type="number" value={updateModal.log.operator_rework_quantity || 0} disabled style={{ backgroundColor: '#f5f5f5' }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <Text strong style={{ display: 'block', marginBottom: 6 }}>Total Presented</Text>
              <Input
                type="number"
                value={getTotalPresented(updateModal.log)}
                disabled
                style={{ backgroundColor: '#f5f5f5' }}
              />
            </div>

            <QuantityInput
              label="Approved"
              value={updateModal.approvedQty}
              onChange={(val) => setUpdateModal(prev => ({ ...prev, approvedQty: val }))}
            />
            <QuantityInput
              label="Rework (review)"
              value={updateModal.reworkQty}
              onChange={(val) => setUpdateModal(prev => ({ ...prev, reworkQty: val }))}
            />
            <QuantityInput
              label="Rejected"
              value={updateModal.rejectedQty}
              onChange={(val) => setUpdateModal(prev => ({ ...prev, rejectedQty: val }))}
            />

            {(() => {
              const totalPresented = getTotalPresented(updateModal.log);
              const assigned = (parseInt(updateModal.approvedQty, 10) || 0)
                + (parseInt(updateModal.reworkQty, 10) || 0)
                + (parseInt(updateModal.rejectedQty, 10) || 0);
              const matches = assigned === totalPresented;
              return (
                <Text
                  type={matches ? 'success' : 'danger'}
                  style={{ fontSize: 12, display: 'block', marginBottom: 12 }}
                >
                  Split total: {assigned} / {totalPresented} presented
                  {!matches && ' — must match before submit'}
                </Text>
              );
            })()}

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
              Total of approved + rework + rejected must equal presented quantity (produced + operator rework)
            </Text>
          </>
        )}
      </Modal>
    </div>
  );
};

export default ProductionCompletion;