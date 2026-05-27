import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Button, message, Spin, Empty, Tag, Input, Space, Typography, Tabs, Modal, Tooltip, Alert } from 'antd';
import { CheckCircleOutlined, EyeOutlined, CloudDownloadOutlined, InfoCircleOutlined, AppstoreOutlined } from '@ant-design/icons';

import dayjs from 'dayjs';
import axios from 'axios';
import { QUALITY_API_BASE_URL } from '../Config/qualityconfig';

const { Text } = Typography;

/** Helper: Matches new "Balloon document" uploads and legacy BALOON / typo baloon. */
function isBalloonOperationDocument(d) {
  if (!d) return false;
  const t = String(d.document_type || '').trim().toLowerCase();
  return t === 'baloon' || t === 'balloon' || t.includes('balloon');
}

/** Helper: PDF iframes in preview/review: hide toolbar and left thumbnail/outline pane. */
function pdfEmbedSrcForReview(url) {
  if (!url) return '';
  const base = url.split('#')[0];
  return `${base}#toolbar=0&navpanes=0&pagemode=none`;
}

const InspectionPlanNotifications = ({ dateRange, onCount }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [query, setQuery] = useState('');

  // FTP Modal States
  const [ftpApproveModalOpen, setFtpApproveModalOpen] = useState(false);
  const [ftpApproveLoading, setFtpApproveLoading] = useState(false);
  const [ftpApproveRows, setFtpApproveRows] = useState([]);
  const [ftpApproveContext, setFtpApproveContext] = useState(null);
  const [planDrawingUrl, setPlanDrawingUrl] = useState(null);
  const [planDrawingIsPdf, setPlanDrawingIsPdf] = useState(true);
  const [planDrawingFileName, setPlanDrawingFileName] = useState(null);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${QUALITY_API_BASE_URL}/operator/inspection-plan-notifications`);
      const data = Array.isArray(res.data) ? res.data : [];
      setNotifications(data);
      if (onCount) onCount(data.filter((n) => !n.is_ack).length);
    } catch (error) {
      console.error(error);
      message.error(error.response?.data?.detail || error.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [onCount]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const { planRequests, ftpRequests } = useMemo(() => {
    let rows = notifications;
    const q = query.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (n) =>
          String(n.sale_order_number || '')
            .toLowerCase()
            .includes(q) ||
          String(n.part_number || '')
            .toLowerCase()
            .includes(q) ||
          String(n.requested_by_username || '')
            .toLowerCase()
            .includes(q),
      );
    }
    if (dateRange?.[0]) {
      const start = dayjs(dateRange[0]).startOf('day');
      rows = rows.filter((n) => n.created_at && !dayjs(n.created_at).isBefore(start));
    }
    if (dateRange?.[1]) {
      const end = dayjs(dateRange[1]).endOf('day');
      rows = rows.filter((n) => n.created_at && !dayjs(n.created_at).isAfter(end));
    }

    return {
      planRequests: rows.filter((r) => r.category !== 'ftp_request'),
      ftpRequests: rows.filter((r) => r.category === 'ftp_request'),
    };
  }, [notifications, query, dateRange]);

  const handleAcknowledge = async (id) => {
    let ackBy = '';
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      ackBy = (u.user_name || u.username || '').trim();
    } catch { /* ignore */ }
    
    if (!ackBy) {
      message.error('Could not read your username. Please log in again.');
      return;
    }
    try {
      await axios.put(`${QUALITY_API_BASE_URL}/operator/inspection-plan-notifications/${id}/ack`, {
        ack_by: ackBy,
      });
      message.success('Acknowledged.');
      fetchNotifications();
    } catch (error) {
      console.error(error);
      message.error(error.response?.data?.detail || error.message || 'Failed to acknowledge');
    }
  };

  const handleOpenQmsSoftware = async (record) => {
    const hideLoading = message.loading('Resolving project details...', 0);
    try {
      // 1. Resolve Part ID if missing
      let partPk = record.part_id;
      if (!partPk && record.part_number) {
        const pRes = await axios.get(`${QUALITY_API_BASE_URL}/parts/part-number/${record.part_number}`);
        partPk = pRes.data?.id;
      }
      if (!partPk) throw new Error('Could not resolve Part ID');

      // 2. Resolve Operation + Drawing Details
      const [opRes, docsRes] = await Promise.all([
        axios.get(`${QUALITY_API_BASE_URL}/operations/${record.operation_id}`),
        axios.get(`${QUALITY_API_BASE_URL}/operation-documents/operation/${record.operation_id}`)
      ]);
      const op = opRes.data;
      const docs = Array.isArray(docsRes.data) ? docsRes.data : [];

      // 3. Find 2D Drawing
      const isDrawing = (d) => {
        const type = (d.document_type || "").toLowerCase();
        const name = (d.document_name || "").toLowerCase();
        return type.includes('2d') || type.includes('drawing') || name.includes('drawing') || name.endsWith('.pdf');
      };
      const drawing = docs.find(isDrawing) || docs[0];
      const drawingUrl = drawing ? `${QUALITY_API_BASE_URL}/operation-documents/${drawing.id}/preview` : '';
      const isPdf = drawing ? (drawing.document_name || '').toLowerCase().endsWith('.pdf') : false;

      // 4. Resolve Project Name (via Part -> Product)
      let projectName = 'PROJECT';
      try {
        const partDetails = await axios.get(`${QUALITY_API_BASE_URL}/parts/${partPk}`);
        const productId = partDetails.data?.productId;
        if (productId) {
          const prodRes = await axios.get(`${QUALITY_API_BASE_URL}/products/${productId}`);
          projectName = prodRes.data?.product_name || 'PROJECT';
        }
      } catch (err) { console.warn('Project name resolution failed', err); }

      const qs = new URLSearchParams({
        partId: String(partPk),
        partNumber: record.part_number || '',
        orderId: String(record.order_id),
        projectName,
        partName: op?.part_name || 'PART',
        operationName: op?.operation_name || `OP ${record.op_no}`,
        operationNumber: String(record.op_no),
        drawingUrl,
        isPdf: String(isPdf),
        fileName: drawing?.document_name || 'Drawing',
        mode: 'PLAN'
      });
      if (drawing?.id) qs.set('documentId', String(drawing.id));

      const path = window.location.pathname.startsWith('/supervisor') ? '/supervisor/qms-inspector' : '/admin/qms-inspector';
      navigate(`${path}?${qs.toString()}`);
    } catch (err) {
      console.error(err);
      message.error('Failed to resolve context for QMS Inspector');
    } finally {
      hideLoading();
    }
  };

  // Helper Functions for FTP Modal
  const parseNum = (value) => {
    if (value == null) return null;
    const s = String(value).replace(',', '.').trim();
    if (s === '' || s === '—' || s === '-') return null;
    // Try direct number first
    const n = Number(s);
    if (Number.isFinite(n)) return n;
    // Try extracting first number (e.g. "0.5 X 45" -> 0.5)
    const match = s.match(/[-+]?\d*\.?\d+/);
    if (match) {
      const mn = Number(match[0]);
      return Number.isFinite(mn) ? mn : null;
    }
    return null;
  };

  const computeMeanFromMeasurements = (r) => {
    if (!Array.isArray(r.measurements)) return null;
    const vals = r.measurements.map(parseNum).filter((v) => v != null);
    if (!vals.length) return null;
    const m = vals.reduce((x, y) => x + y, 0) / vals.length;
    return Number.isFinite(m) ? m : null;
  };

  const rowHasMeasured123 = (r) => {
    if (!Array.isArray(r.measurements)) return false;
    return r.measurements.some(m => parseNum(m) !== null);
  };

  const fmt4 = (value) => {
    const n = parseNum(value);
    return n == null ? '—' : n.toFixed(4);
  };

  const fmtTol = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    if (Math.abs(n) < 1e-9) return '0';
    return String(n);
  };

  const dimensionTypeTagColor = (value) => {
    const s = String(value || '').trim();
    if (!s) return 'default';
    const u = s.toUpperCase();
    if (u.startsWith('GDT') || u.includes('GD&T')) return 'purple';
    if (u.includes('DIAMETER') || u.includes('∅') || u.includes('⌀') || /\bDIA\b/i.test(s)) return 'orange';
    if (u.includes('LENGTH') || /^length$/i.test(s)) return 'blue';
    return 'cyan';
  };

  const buildFtpIpid = (partNo, opNo) => {
    const pn = (partNo || 'PART').toString().trim().replace(/[^A-Za-z0-9_-]+/g, '_');
    const op = Number.isFinite(Number(opNo)) ? Number(opNo) : 'NA';
    return `FTP_${pn}_OP_${op}`;
  };

  const ftpApproveDecoratedRows = useMemo(() => {
    return (ftpApproveRows || []).map((r) => {
      const nominal = parseNum(r.nominal_value);
      const upper = parseNum(r.uppertol);
      const lower = parseNum(r.lowertol);
      const mean = computeMeanFromMeasurements(r);
      const upperLimit = nominal != null ? nominal + (upper || 0) : null;
      const lowerLimit = nominal != null ? nominal + (lower || 0) : null;
      // We consider it checkable if nominal is present
      const hasTolerance = nominal != null;
      const withinTolerance =
        hasTolerance &&
        mean != null &&
        upperLimit != null &&
        lowerLimit != null &&
        mean <= upperLimit &&
        mean >= lowerLimit;
      const outOfTolerance = hasTolerance && mean != null && !withinTolerance;
      const status = !hasTolerance ? 'no_tolerance' : withinTolerance ? 'within' : outOfTolerance ? 'out' : 'pending';
      return { ...r, _upperLimit: upperLimit, _lowerLimit: lowerLimit, _computedMean: mean, _status: status };
    });
  }, [ftpApproveRows]);

  const ftpApproveAllReadingsEmpty = useMemo(() => {
    if (!ftpApproveRows?.length) return false;
    return ftpApproveRows.every((r) => !rowHasMeasured123(r));
  }, [ftpApproveRows]);

  const ftpApproveMeasurementsDone = useMemo(() => {
    if (!ftpApproveRows?.length) return false;
    return ftpApproveRows.every((r) => {
      if (!Array.isArray(r.measurements) || r.measurements.length === 0) return false;
      return r.measurements.every(m => parseNum(m) !== null);
    });
  }, [ftpApproveRows]);

  const ftpApproveSummary = useMemo(() => {
    const total = ftpApproveDecoratedRows.length;
    const within = ftpApproveDecoratedRows.filter((r) => r._status === 'within').length;
    const out = ftpApproveDecoratedRows.filter((r) => r._status === 'out').length;
    const noTol = ftpApproveDecoratedRows.filter((r) => r._status === 'no_tolerance').length;
    const passRate = total ? ((within / total) * 100).toFixed(1) : '0.0';
    return { total, within, out, noTol, passRate };
  }, [ftpApproveDecoratedRows]);

  const openFtpApproveModal = async (record) => {
    let partPk = record.part_id;
    let opNameHint = '';
    
    // Resolve Part ID and Operation metadata if missing
    try {
      const [pRes, opRes] = await Promise.all([
        !partPk && record.part_number ? axios.get(`${QUALITY_API_BASE_URL}/parts/part-number/${record.part_number}`) : Promise.resolve({ data: { id: partPk } }),
        record.operation_id ? axios.get(`${QUALITY_API_BASE_URL}/operations/${record.operation_id}`) : Promise.resolve({ data: null })
      ]);
      partPk = pRes.data?.id;
      opNameHint = opRes.data?.operation_name || '';
    } catch (err) {
      console.warn('Metadata resolution failed:', err);
    }

    if (!record.order_id || !record.part_number || !partPk) {
      message.error('Required context for FTP review is missing.');
      return;
    }

    setFtpApproveContext({
      notificationId: record.id,
      opNo: record.op_no,
      opName: opNameHint, 
      partNo: record.part_number,
      partId: partPk,
      orderId: record.order_id,
      operationId: record.operation_id,
      saleOrderNumber: record.sale_order_number || String(record.order_id),
      isAck: record.is_ack
    });
    setFtpApproveModalOpen(true);
    setFtpApproveRows([]);
    setFtpApproveLoading(true);
    setPlanDrawingUrl(null);
    setPlanDrawingFileName(null);
    setPlanDrawingIsPdf(true);

    const ipid = buildFtpIpid(record.part_number, record.op_no);
    try {
      // Ensure records exist
      try {
        await axios.post(`${QUALITY_API_BASE_URL}/quality/stage-inspection/ensure`, null, {
          params: {
            part_id: partPk,
            part_number: record.part_number,
            sale_order_id: record.order_id,
            op_no: record.op_no,
            quantity_no: 1,
            ipid,
            user_id: 1,
          },
        });
      } catch (ensureErr) {
        console.warn('stage-inspection/ensure', ensureErr);
      }

      // Fetch measurements and balloon documents
      const [res, docsRes] = await Promise.all([
        axios.get(`${QUALITY_API_BASE_URL}/quality/stage-inspection`, {
          params: {
            part_id: partPk,
            sale_order_id: record.order_id,
            op_no: record.op_no,
            quantity_no: 1,
          },
        }),
        axios.get(`${QUALITY_API_BASE_URL}/operation-documents/operation/${record.operation_id}`),
      ]);

      setFtpApproveRows(Array.isArray(res.data) ? res.data : []);

      // Handle ballooned drawing
      const docs = Array.isArray(docsRes.data) ? docsRes.data : [];
      const baloonDoc = docs
        .filter(isBalloonOperationDocument)
        .sort((a, b) => Number(b?.id || 0) - Number(a?.id || 0))[0];

      if (baloonDoc) {
        const name = baloonDoc.document_name || '';
        setPlanDrawingIsPdf(/\.pdf$/i.test(name));
        setPlanDrawingFileName(name || null);
        setPlanDrawingUrl(`${QUALITY_API_BASE_URL}/operation-documents/${baloonDoc.id}/preview`);
      }
    } catch (err) {
      console.error(err);
      message.error('Failed to load quality data for FTP review.');
    } finally {
      setFtpApproveLoading(false);
    }
  };

  const confirmAndApproveFtp = () => {
    const ctx = ftpApproveContext;
    if (!ctx) return;
    
    let approvedBy = '';
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      approvedBy = (u.user_name || u.username || '').trim();
    } catch { /* ignore */ }

    if (!approvedBy) {
      message.error('Could not determine your login name. Please log in again.');
      return;
    }

    Modal.confirm({
      title: 'Confirm FTP Approval',
      content: 'I hereby approve the first-time pass (FTP) for this operation. This will allow the operator to proceed with serial production.',
      okText: 'Approve',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          // 1. Update FTP Status in Backend
          await axios.put(`${QUALITY_API_BASE_URL}/quality/ftp-status`, {
            order_id: ctx.orderId,
            ipid: buildFtpIpid(ctx.partNo, ctx.opNo),
            status: 'approved',
            is_completed: true,
            part_number: ctx.partNo,
            op_no: ctx.opNo,
            operation_id: ctx.operationId || 0,
            approved_by_username: approvedBy
          });

          // 2. Acknowledge Notification
          await axios.put(`${QUALITY_API_BASE_URL}/operator/inspection-plan-notifications/${ctx.notificationId}/ack`, {
            ack_by: approvedBy
          });

          message.success('FTP Approved and Notification Acknowledged.');
          setFtpApproveModalOpen(false);
          fetchNotifications();
        } catch (err) {
          console.error(err);
          message.error('Failed to approve FTP.');
        }
      }
    });
  };

  const handleDownloadPlanDrawing = () => {
    if (!planDrawingUrl) return;
    const id = planDrawingUrl.match(/operation-documents\/(\d+)\//)?.[1];
    if (!id) return;
    const a = document.createElement('a');
    a.href = `${QUALITY_API_BASE_URL}/operation-documents/${id}/download`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.download = planDrawingFileName || `ftp_review_balloon.pdf`;
    a.click();
  };

  const commonColumns = [
    {
      title: 'Sl No',
      key: 'sl_no',
      width: 60,
      render: (_, __, index) => (currentPage - 1) * pageSize + index + 1,
    },
    {
      title: 'Order',
      dataIndex: 'sale_order_number',
      key: 'sale_order_number',
      render: (text, record) => text || `ID ${record.order_id}`,
    },
    {
      title: 'Part',
      dataIndex: 'part_number',
      key: 'part_number',
    },
    {
      title: 'OP',
      dataIndex: 'op_no',
      key: 'op_no',
      width: 60,
    },
    {
      title: 'Requested by',
      dataIndex: 'requested_by_username',
      key: 'requested_by_username',
      render: (t) => t || '—',
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text) => (text ? dayjs(text).format('DD/MM/YYYY HH:mm') : '—'),
    },
  ];

  const planColumns = [
    ...commonColumns,
    {
      title: 'Approved by Name',
      dataIndex: 'ack_by',
      key: 'ack_by',
      width: 150,
      render: (t) => t || '—',
    },
    {
      title: 'Approved At',
      dataIndex: 'ack_at',
      key: 'ack_at',
      width: 150,
      render: (t) => (t ? dayjs(t).format('DD/MM/YYYY HH:mm') : '—'),
    },
    {
      title: 'Status',
      dataIndex: 'is_ack',
      key: 'is_ack',
      width: 120,
      render: (val) => <Tag color={val ? 'green' : 'orange'}>{val ? 'Acknowledged' : 'Pending'}</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 250,
      render: (_, record) => (
        <Space wrap>
          {!record.is_ack && (
            <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => handleAcknowledge(record.id)}>
              Acknowledge
            </Button>
          )}
          <Button icon={<AppstoreOutlined />} onClick={() => handleOpenQmsSoftware(record)}>
            Open QMS Software
          </Button>
        </Space>
      ),
    },
  ];

  const ftpColumns = [
    ...commonColumns,
    {
      title: 'Approved by Name',
      dataIndex: 'ack_by',
      key: 'ack_by',
      render: (t) => t || '—',
    },
    {
      title: 'Approved At',
      dataIndex: 'ack_at',
      key: 'ack_at',
      render: (t) => (t ? dayjs(t).format('DD/MM/YYYY HH:mm') : '—'),
    },
    {
      title: 'Status',
      dataIndex: 'is_ack',
      key: 'is_ack',
      render: (val) => <Tag color={val ? 'green' : 'orange'}>{val ? 'Approved' : 'Pending Review'}</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      render: (_, record) => (
        <Space wrap>
          {!record.is_ack ? (
            <Button type="primary" danger icon={<CheckCircleOutlined />} onClick={() => openFtpApproveModal(record)}>
              Approve FTP
            </Button>
          ) : (
            <Button icon={<EyeOutlined />} onClick={() => openFtpApproveModal(record)}>
              Review
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 12, maxWidth: 360 }}>
        <Input.Search
          allowClear
          placeholder="Search order, part, operator…"
          onSearch={setQuery}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <Spin spinning={loading}>
        <Tabs
          defaultActiveKey="1"
          items={[
            {
              key: '1',
              label: `Approval Notifications (${planRequests.length})`,
              children: (
                <Table
                  rowKey="id"
                  dataSource={planRequests}
                  columns={planColumns}
                  pagination={{
                    current: currentPage,
                    pageSize,
                    onChange: (p, ps) => { setCurrentPage(p); setPageSize(ps); },
                    showSizeChanger: true,
                  }}
                  locale={{ emptyText: <Empty description="No inspection plan requests" /> }}
                />
              ),
            },
            {
              key: '2',
              label: `FTP Notifications (${ftpRequests.length})`,
              children: (
                <Table
                  rowKey="id"
                  dataSource={ftpRequests}
                  columns={ftpColumns}
                  pagination={{ pageSize: 10, showSizeChanger: true }}
                  locale={{ emptyText: <Empty description="No FTP approval requests" /> }}
                />
              ),
            },
          ]}
        />
      </Spin>

      {/* Review FTP Modal (Copied and adapted from QualityManagement.jsx) */}
      <Modal
        title={ftpApproveContext ? `Review FTP: Order ${ftpApproveContext.saleOrderNumber}, Part ${ftpApproveContext.partNo}, OP ${ftpApproveContext.opNo}${ftpApproveContext.opName ? ' (' + ftpApproveContext.opName + ')' : ''}` : 'Review FTP'}
        centered
        open={ftpApproveModalOpen}
        onCancel={() => setFtpApproveModalOpen(false)}
        width="95%"
        footer={
          <Space>
            <Button onClick={() => setFtpApproveModalOpen(false)}>Close</Button>
            {!ftpApproveContext?.isAck && (
              <Button 
                type="primary" 
                onClick={confirmAndApproveFtp} 
                disabled={ftpApproveLoading || !ftpApproveMeasurementsDone}
              >
                Approve FTP
              </Button>
            )}
          </Space>
        }
        styles={{ body: { padding: 12, height: '80vh', background: '#f7f8fa' } }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1.45fr 1fr', gap: 14, height: '100%', fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace' }}>
          {/* Left: Measurement Table */}
          <div style={{ border: '1px solid #dfe4ea', borderRadius: 10, overflow: 'hidden', background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '0 2px 10px rgba(15,23,42,0.04)' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #eef0f3', background: '#fafbfc', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <Text strong style={{ color: '#111827', fontSize: 18 }}>Qty 1 Measurements</Text>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Review data below before approving serial production</div>
              </div>
              <Space>
                <Tag color="blue">{ftpApproveSummary.total} Total</Tag>
                <Tag color="green">{ftpApproveSummary.within} Passed</Tag>
                {ftpApproveSummary.out > 0 && <Tag color="red">{ftpApproveSummary.out} Failed</Tag>}
              </Space>
            </div>

            <div style={{ padding: '0 10px 10px', flex: 1, overflow: 'auto' }}>
              <Table
                size="small"
                loading={ftpApproveLoading}
                dataSource={ftpApproveDecoratedRows}
                rowKey="id"
                pagination={false}
                onRow={(r) => ({
                  style: {
                    background: r._status === 'out' ? '#fff1f0' : r._status === 'within' ? '#f6ffed' : 'inherit'
                  }
                })}
                columns={[
                  {
                    title: 'Characteristic',
                    key: 'feat',
                    width: 140,
                    render: (_, r) => (
                      <div>
                        <Text strong style={{ fontSize: 13 }}>{r.dimension_type}</Text>
                        <br />
                        <Tag color={dimensionTypeTagColor(r.dimension_type)} style={{ fontSize: 10, marginTop: 4 }}>{r.zone || 'No Zone'}</Tag>
                      </div>
                    ),
                  },
                  {
                    title: 'Specs (Nominal/Tol)',
                    key: 'specs',
                    width: 160,
                    render: (_, r) => (
                      <div style={{ fontSize: 13 }}>
                        <Text strong>{r.nominal_value}</Text>
                        <span style={{ fontSize: 11, marginLeft: 6, color: '#6b7280' }}>
                          +{fmtTol(r.uppertol)} / {fmtTol(r.lowertol)}
                        </span>
                        <div style={{ fontSize: 10, color: '#9ca3af' }}>
                          Lim: {fmt4(r._lowerLimit)} to {fmt4(r._upperLimit)}
                        </div>
                      </div>
                    ),
                  },
                  {
                    title: 'Qty 1 Readings',
                    key: 'readings',
                    width: 180,
                    render: (_, r) => (
                      <Space size={4} style={{ display: 'flex', flexWrap: 'wrap' }}>
                        {(r.measurements || ['', '', '']).map((v, i) => {
                          const val = parseNum(v);
                          // A value is "comparable" if limits are resolved
                          const canCompare = r._lowerLimit != null && r._upperLimit != null;
                          const isWithin = canCompare && val !== null && val <= r._upperLimit && val >= r._lowerLimit;
                          const isOut = canCompare && val !== null && !isWithin;
                          return (
                            <div key={i} style={{ 
                              background: isWithin ? '#f0fdf4' : isOut ? '#fef2f2' : (v ? '#f1f5f9' : '#fff'), 
                              border: `1px solid ${isWithin ? '#bbf7d0' : isOut ? '#fecaca' : '#e2e8f0'}`, 
                              borderRadius: 4, 
                              padding: '1px 6px', 
                              fontSize: 12, 
                              minWidth: 50, 
                              textAlign: 'center', 
                              color: isWithin ? '#15803d' : isOut ? '#dc2626' : (v ? '#1e293b' : '#94a3b8'),
                              fontWeight: isWithin || isOut ? 600 : 400
                            }}>
                              {v || '—'}
                            </div>
                          );
                        })}
                      </Space>
                    ),
                  },
                  {
                    title: 'Mean',
                    key: 'mean',
                    width: 90,
                    align: 'center',
                    render: (_, r) => (
                      <Text strong style={{ 
                        fontSize: 14, 
                        color: r._status === 'within' ? '#059669' : r._status === 'out' ? '#dc2626' : '#111827' 
                      }}>
                        {fmt4(r._computedMean)}
                      </Text>
                    ),
                  },
                  {
                    title: 'Status',
                    key: 'status',
                    width: 100,
                    align: 'center',
                    render: (_, r) => {
                      if (r._status === 'within') return <Tag color="success">PASS</Tag>;
                      if (r._status === 'out') return <Tag color="error">FAIL</Tag>;
                      if (r._status === 'no_tolerance') return <Tag>N/A</Tag>;
                      return <Tag color="warning">PENDING</Tag>;
                    },
                  },
                ]}
              />
            </div>
            
            {ftpApproveSummary.out > 0 && (
              <div style={{ padding: '8px 16px' }}>
                <Alert
                  type="warning"
                  showIcon
                  message="One or more characteristics are out of tolerance. Please review carefully."
                  style={{ borderRadius: 8 }}
                />
              </div>
            )}
            {ftpApproveAllReadingsEmpty && !ftpApproveLoading && (
              <div style={{ padding: '0 16px 16px' }}>
                <Alert
                  type="error"
                  showIcon
                  message="No measurements recorded yet. Ensure quantity 1 is measured on the shop floor first."
                  style={{ borderRadius: 8 }}
                />
              </div>
            )}
          </div>

          {/* Right: Balloon Drawing Preview */}
          <div style={{ border: '1px solid #dfe4ea', borderRadius: 10, overflow: 'hidden', background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '0 2px 10px rgba(15,23,42,0.04)' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #eef0f3', background: '#fafbfc', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Space>
                <InfoCircleOutlined style={{ color: '#3b82f6' }} />
                <Text strong style={{ color: '#111827', fontSize: 16 }}>Ballooned Drawing</Text>
              </Space>
              {planDrawingUrl && (
                <Button 
                  size="small" 
                  type="text" 
                  icon={<CloudDownloadOutlined />} 
                  onClick={handleDownloadPlanDrawing}
                >
                  Download
                </Button>
              )}
            </div>
            <div style={{ flex: 1, padding: 10, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {planDrawingUrl ? (
                planDrawingIsPdf ? (
                  <iframe
                    src={pdfEmbedSrcForReview(planDrawingUrl)}
                    width="100%"
                    height="100%"
                    title="FTP Drawing"
                    style={{
                      height: 'min(72vh, 900px)',
                      border: '1px solid #e5e7eb',
                      borderRadius: 10,
                      background: '#fff',
                      boxShadow: '0 2px 10px rgba(15,23,42,0.08)',
                    }}
                  />
                ) : (
                  <img
                    src={planDrawingUrl}
                    alt="Ballooned drawing"
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain',
                      border: '1px solid #e5e7eb',
                      borderRadius: 10,
                      background: '#fff',
                      boxShadow: '0 2px 10px rgba(15,23,42,0.08)',
                    }}
                  />
                )
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Empty description="No balloon document found for this operation" />
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default InspectionPlanNotifications;