import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Table, Typography, Tag, Spin, message, Button, Row, Col, Tabs, Badge, Input, Space, Modal, Tooltip, Alert, Empty } from 'antd';
import { BellOutlined, CheckOutlined, ReloadOutlined, CheckCircleOutlined, EyeOutlined, CloudDownloadOutlined, InfoCircleOutlined, AppstoreOutlined } from '@ant-design/icons';
import { SCHEDULING_API_BASE_URL } from '../Config/schedulingconfig';
import config from '../Config/config';
import { QUALITY_API_BASE_URL } from '../Config/qualityconfig';
import dayjs from 'dayjs';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import InteractiveDrawing from '../Quality Management Components/InspectorComponents/InteractiveDrawing';
import { parseMasterBocBboxToPdfRect } from '../Quality Management Components/InspectorComponents/bocMappers';
import PokayokeOperationNotification from './PokayokeOperationNotification';

const { Title, Text } = Typography;

const MONO_FONT = '"JetBrains Mono", "Consolas", "Courier New", monospace';

function isBalloonOperationDocument(d) {
  if (!d) return false;
  const t = String(d.document_type || '').trim().toLowerCase();
  return t === 'baloon' || t === 'balloon' || t.includes('balloon');
}

function isDrawingDocument(d) {
  if (!d || isBalloonOperationDocument(d)) return false;
  const type = (d.document_type || '').toLowerCase();
  const name = (d.document_name || '').toLowerCase();
  const url = (d.document_url || '').toLowerCase();
  const isPdfFile = url.endsWith('.pdf') || type.includes('pdf');
  return (
    type.includes('2d') ||
    type.includes('drawing') ||
    name.includes('drawing') ||
    isPdfFile ||
    url.endsWith('.png') ||
    url.endsWith('.jpg') ||
    url.endsWith('.jpeg')
  );
}

function toPlanDrawingInfo(doc, endpoint) {
  const isPdf =
    (doc.document_url || '').toLowerCase().endsWith('.pdf') ||
    (doc.document_type || '').toLowerCase().includes('pdf');
  return {
    url: `${QUALITY_API_BASE_URL}/${endpoint}/${doc.id}/preview`,
    isPdf,
    name: doc.document_name,
    apiDocumentId: doc.id,
    endpoint,
  };
}

function resolvePlanDrawing(operationDocs, partDocs) {
  const opDocs = Array.isArray(operationDocs) ? operationDocs : [];
  const partDocList = Array.isArray(partDocs) ? partDocs : [];

  const balloonOp = opDocs
    .filter(isBalloonOperationDocument)
    .sort((a, b) => Number(b?.id || 0) - Number(a?.id || 0))[0];
  if (balloonOp) return toPlanDrawingInfo(balloonOp, 'operation-documents');

  const nonBalloonOp = opDocs.filter((d) => !isBalloonOperationDocument(d));
  const nonBalloonPart = partDocList.filter((d) => !isBalloonOperationDocument(d));
  const previewDrawing =
    nonBalloonOp.find(isDrawingDocument) ||
    nonBalloonPart.find(isDrawingDocument) ||
    nonBalloonOp[0] ||
    nonBalloonPart[0] ||
    opDocs[0] ||
    partDocList[0];

  if (!previewDrawing) {
    return { url: null, isPdf: false, name: '', apiDocumentId: null, endpoint: null };
  }

  const endpoint = previewDrawing.operation_id != null ? 'operation-documents' : 'documents';
  return toPlanDrawingInfo(previewDrawing, endpoint);
}

const fmtPlanTol = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) < 1e-12) return '0';
  return n > 0 ? `+${n}` : `${n}`;
};

const planDimensionTypeTagColor = (value) => {
  const v = (value || '').toString().toLowerCase();
  if (!v) return 'default';
  if (v.includes('diameter')) return 'gold';
  if (v.includes('length') || v.includes('linear')) return 'blue';
  if (v.includes('angle')) return 'purple';
  return 'geekblue';
};

const Notifications = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [pokayokeNotifications, setPokayokeNotifications] = useState([]);
  const [inspectionNotifications, setInspectionNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pokayokeLoading, setPokayokeLoading] = useState(true);
  const [inspectionLoading, setInspectionLoading] = useState(true);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [pokayokePagination, setPokayokePagination] = useState({ current: 1, pageSize: 10 });
  const [inspectionPagination, setInspectionPagination] = useState({ current: 1, pageSize: 10 });
  const [activeTab, setActiveTab] = useState('production');
  const [acknowledgingIds, setAcknowledgingIds] = useState(new Set());
  const [query, setQuery] = useState('');
  const [pokayokeChecklistUnacknowledgedCount, setPokayokeChecklistUnacknowledgedCount] = useState(0);

  // FTP Modal States
  const [ftpApproveModalOpen, setFtpApproveModalOpen] = useState(false);
  const [ftpApproveLoading, setFtpApproveLoading] = useState(false);
  const [ftpApproveRows, setFtpApproveRows] = useState([]);
  const [ftpApproveContext, setFtpApproveContext] = useState(null);
  const [planDrawingUrl, setPlanDrawingUrl] = useState(null);
  const [planDrawingIsPdf, setPlanDrawingIsPdf] = useState(true);
  const [planDrawingFileName, setPlanDrawingFileName] = useState(null);

  const [planViewOpen, setPlanViewOpen] = useState(false);
  const [planViewLoading, setPlanViewLoading] = useState(false);
  const [planViewMeta, setPlanViewMeta] = useState(null);
  const [planViewTableRows, setPlanViewTableRows] = useState([]);
  const [planViewDrawingUrl, setPlanViewDrawingUrl] = useState('');
  const [planViewDrawingIsPdf, setPlanViewDrawingIsPdf] = useState(true);
  const [planViewDrawingFileName, setPlanViewDrawingFileName] = useState('');
  const [planViewBalloonDocumentId, setPlanViewBalloonDocumentId] = useState(null);
  const [planViewDrawingEndpoint, setPlanViewDrawingEndpoint] = useState(null);
  const [planViewActiveBalloonId, setPlanViewActiveBalloonId] = useState(null);

  useEffect(() => {
    fetchNotifications();
    fetchPokayokeNotifications();
    fetchInspectionNotifications();
  }, []);

  useEffect(() => {
    if (activeTab !== 'approval') return;
    const refresh = () => {
      void fetchInspectionNotifications();
    };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [activeTab]);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      // Get supervisor ID from localStorage
      let supervisorId = null;
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        try {
          const user = JSON.parse(storedUser);
          supervisorId = user.id;
        } catch (e) {
          console.error("Error parsing user from local storage", e);
        }
      }
      if (!supervisorId) supervisorId = localStorage.getItem('supervisor_id');

      if (!supervisorId) {
        message.error('Supervisor not found in session. Please log in again.');
        setLoading(false);
        return;
      }

      // Fetch all production logs with hierarchical data
      const apiUrl = `${SCHEDULING_API_BASE_URL}/production-logs/?hierarchical=true`;

      const response = await fetch(apiUrl);
      if (response.ok) {
        const data = await response.json();
        // Get supervisor ID from localStorage
        const storedUser = localStorage.getItem('user');
        let supervisorId = null;
        if (storedUser) {
          try {
            const user = JSON.parse(storedUser);
            supervisorId = user.id;
          } catch (e) {
            console.error("Error parsing user from local storage", e);
          }
        }
        if (!supervisorId) supervisorId = localStorage.getItem('supervisor_id');

        // Filter to show all logs related to supervisor:
        // - logs where supervisor hasn't responded yet (supervisor_id is null)
        // - logs where supervisor has responded (supervisor_id matches current supervisor)
        // and produced_quantity > 0
        const supervisorLogs = (data || []).filter(
          log => ((log.supervisor_id === null || log.supervisor_id === undefined) ||
                 String(log.supervisor_id) === String(supervisorId)) &&
                 (log.produced_quantity || 0) > 0
        );
        // Sort by acknowledgment status first (unacknowledged at top), then by created_at descending
        const sortedLogs = supervisorLogs.sort((a, b) => {
          const isAckA = a.supervisor_acknowledged_at || a.acknowledged;
          const isAckB = b.supervisor_acknowledged_at || b.acknowledged;
          // Unacknowledged (false) comes before acknowledged (true)
          if (isAckA !== isAckB) {
            return isAckA ? 1 : -1;
          }
          // Within same acknowledgment status, sort by created_at descending
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateB - dateA;
        });
        setNotifications(sortedLogs || []);
      } else {
        message.error('Failed to fetch notifications');
        setNotifications([]);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
      message.error('Failed to fetch notifications');
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchPokayokeNotifications = async () => {
    setPokayokeLoading(true);
    try {
      // Get supervisor ID from localStorage
      let supervisorId = null;
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        try {
          const user = JSON.parse(storedUser);
          supervisorId = user.id;
        } catch (e) {
          console.error("Error parsing user from local storage", e);
        }
      }
      if (!supervisorId) supervisorId = localStorage.getItem('supervisor_id');

      if (!supervisorId) {
        message.error('Supervisor not found in session. Please log in again.');
        setPokayokeLoading(false);
        return;
      }

      // Fetch all Pokayoke completed logs
      const apiUrl = `${config.API_BASE_URL}/pokayoke-completed-logs/simple`;

      const response = await fetch(apiUrl);
      if (response.ok) {
        const data = await response.json();
        // Show all logs, sort by acknowledgment status first (unacknowledged at top), then by completed_at descending
        const sortedLogs = (data || []).sort((a, b) => {
          const isAckA = a.supervisor_acknowledged;
          const isAckB = b.supervisor_acknowledged;
          // Unacknowledged (false) comes before acknowledged (true)
          if (isAckA !== isAckB) {
            return isAckA ? 1 : -1;
          }
          // Within same acknowledgment status, sort by completed_at descending
          const dateA = new Date(a.completed_at).getTime();
          const dateB = new Date(b.completed_at).getTime();
          return dateB - dateA;
        });
        setPokayokeNotifications(sortedLogs || []);
      } else {
        message.error('Failed to fetch Pokayoke notifications');
        setPokayokeNotifications([]);
      }
    } catch (error) {
      console.error('Error fetching Pokayoke notifications:', error);
      message.error('Failed to fetch Pokayoke notifications');
      setPokayokeNotifications([]);
    } finally {
      setPokayokeLoading(false);
    }
  };

  const handleAcknowledge = async (logId) => {
    try {
      // Add to acknowledging set to disable button
      setAcknowledgingIds(prev => new Set(prev).add(logId));

      // Get supervisor ID from localStorage
      const storedUser = localStorage.getItem('user');
      let supervisorId = null;
      if (storedUser) {
        try {
          const user = JSON.parse(storedUser);
          supervisorId = user.id;
        } catch (e) {
          console.error("Error parsing user from local storage", e);
        }
      }
      if (!supervisorId) supervisorId = localStorage.getItem('supervisor_id');

      // Call the PUT endpoint for acknowledgment with supervisor_id as query parameter
      const response = await fetch(`${SCHEDULING_API_BASE_URL}/production-logs/${logId}/acknowledge?supervisor_id=${supervisorId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        message.success('Notification acknowledged');
        // Refresh the notifications list to update the UI
        fetchNotifications();
      } else {
        const errorData = await response.json();
        console.error('Acknowledgment error:', errorData);
        let errorMessage = 'Unknown error';
        if (Array.isArray(errorData.detail)) {
          errorMessage = errorData.detail.map(err => err.msg || err.message || err).join(', ');
        } else if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        } else if (errorData.error) {
          errorMessage = errorData.error;
        }
        message.error(`Failed to acknowledge notification: ${errorMessage}`);
        // Remove from acknowledging set on error
        setAcknowledgingIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(logId);
          return newSet;
        });
      }
    } catch (error) {
      console.error('Error acknowledging notification:', error);
      message.error('Failed to acknowledge notification');
      // Remove from acknowledging set on error
      setAcknowledgingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(logId);
        return newSet;
      });
    }
  };

  const fetchInspectionNotifications = async () => {
    setInspectionLoading(true);
    try {
      const res = await axios.get(`${QUALITY_API_BASE_URL}/operator/inspection-plan-notifications`);
      const data = Array.isArray(res.data) ? res.data : [];
      setInspectionNotifications(data);
    } catch (error) {
      console.error(error);
      message.error(error.response?.data?.detail || error.message || 'Failed to load inspection notifications');
    } finally {
      setInspectionLoading(false);
    }
  };

  const handleInspectionAcknowledge = async (id) => {
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
      fetchInspectionNotifications();
    } catch (error) {
      console.error(error);
      message.error(error.response?.data?.detail || error.message || 'Failed to acknowledge');
    }
  };

  const planViewInteractiveBalloons = useMemo(() => {
    return (planViewTableRows || [])
      .map((r, idx) => {
        const rect = parseMasterBocBboxToPdfRect(r.bbox);
        if (!rect) return null;
        return {
          id: String(r.id),
          label: String(idx + 1),
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          page: rect.page || 1,
        };
      })
      .filter(Boolean);
  }, [planViewTableRows]);

  const openPlanViewModal = async (record) => {
    setPlanViewMeta({
      orderNo: record.sale_order_number ?? record.order_id ?? '—',
      partNo: record.part_number || '—',
      opNo: record.op_no ?? '—',
      opName: '',
    });
    setPlanViewOpen(true);
    setPlanViewLoading(true);
    setPlanViewTableRows([]);
    setPlanViewDrawingUrl('');
    setPlanViewDrawingFileName('');
    setPlanViewBalloonDocumentId(null);
    setPlanViewDrawingEndpoint(null);
    setPlanViewActiveBalloonId(null);

    const opNo = Number(record.op_no);
    try {
      let partPk = record.part_id;
      if (!partPk && record.part_number) {
        const pRes = await axios.get(`${QUALITY_API_BASE_URL}/parts/part-number/${record.part_number}`);
        partPk = pRes.data?.id;
      }

      const [opDocsRes, partDocsRes, bocRes, opRes] = await Promise.all([
        axios.get(`${QUALITY_API_BASE_URL}/operation-documents/operation/${record.operation_id}`),
        partPk
          ? axios.get(`${QUALITY_API_BASE_URL}/documents/part/${partPk}`)
          : Promise.resolve({ data: [] }),
        axios.get(`${QUALITY_API_BASE_URL}/quality/master-boc`, {
          params: {
            part_id: record.part_number,
            sales_order_id: Number(record.order_id),
            op_no: Number.isFinite(opNo) ? opNo : undefined,
          },
        }),
        axios.get(`${QUALITY_API_BASE_URL}/operations/${record.operation_id}`),
      ]);

      const opName = opRes.data?.operation_name || '';
      setPlanViewMeta((prev) => (prev ? { ...prev, opName } : prev));

      const opDocs = Array.isArray(opDocsRes.data) ? opDocsRes.data : [];
      const partDocs = Array.isArray(partDocsRes.data) ? partDocsRes.data : [];
      const { url, isPdf, name, apiDocumentId, endpoint } = resolvePlanDrawing(opDocs, partDocs);

      if (url && apiDocumentId) {
        setPlanViewDrawingUrl(url);
        setPlanViewDrawingIsPdf(isPdf);
        setPlanViewDrawingFileName(name || '');
        setPlanViewBalloonDocumentId(apiDocumentId);
        setPlanViewDrawingEndpoint(endpoint);
      }

      setPlanViewTableRows(Array.isArray(bocRes.data) ? bocRes.data : []);
    } catch (err) {
      console.error(err);
      const detail = err.response?.data?.detail;
      message.error(typeof detail === 'string' ? detail : err.message || 'Failed to load plan details');
    } finally {
      setPlanViewLoading(false);
    }
  };

  const handleDownloadPlanViewDrawing = () => {
    if (!planViewDrawingUrl) return;
    const id =
      planViewBalloonDocumentId ??
      planViewDrawingUrl.match(/(?:operation-documents|documents)\/(\d+)\//)?.[1];
    if (!id) return;
    const endpoint = planViewDrawingEndpoint || 'operation-documents';
    const a = document.createElement('a');
    a.href = `${QUALITY_API_BASE_URL}/${endpoint}/${id}/download`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.download = planViewDrawingFileName || `operation_${planViewMeta?.opNo || 'plan'}_drawing.pdf`;
    a.click();
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
      if (record.operation_id) qs.set('operationId', String(record.operation_id));

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
    const n = Number(s);
    if (Number.isFinite(n)) return n;
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

      const isBalloonOperationDocument = (d) => {
        if (!d) return false;
        const t = String(d.document_type || '').trim().toLowerCase();
        return t === 'baloon' || t === 'balloon' || t.includes('balloon');
      };

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

          await axios.put(`${QUALITY_API_BASE_URL}/operator/inspection-plan-notifications/${ctx.notificationId}/ack`, {
            ack_by: approvedBy
          });

          message.success('FTP Approved and Notification Acknowledged.');
          setFtpApproveModalOpen(false);
          fetchInspectionNotifications();
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

  const pdfEmbedSrcForReview = (url) => {
    if (!url) return '';
    const base = url.split('#')[0];
    return `${base}#toolbar=0&navpanes=0&pagemode=none`;
  };

  const { planRequests, ftpRequests } = useMemo(() => {
    let rows = inspectionNotifications;
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

    return {
      planRequests: rows.filter((r) => r.category !== 'ftp_request'),
      ftpRequests: rows.filter((r) => r.category === 'ftp_request'),
    };
  }, [inspectionNotifications, query]);

  const handlePokayokeAcknowledge = async (logId) => {
    try {
      // Add to acknowledging set to disable button
      setAcknowledgingIds(prev => new Set(prev).add(logId));

      // Get supervisor ID from localStorage
      const storedUser = localStorage.getItem('user');
      let supervisorId = null;
      if (storedUser) {
        try {
          const user = JSON.parse(storedUser);
          supervisorId = user.id;
        } catch (e) {
          console.error("Error parsing user from local storage", e);
        }
      }
      if (!supervisorId) supervisorId = localStorage.getItem('supervisor_id');

      // Call the PUT endpoint for Pokayoke acknowledgment with supervisor_id as query parameter
      const response = await fetch(`${config.API_BASE_URL}/pokayoke-completed-logs/${logId}/acknowledge?supervisor_id=${supervisorId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        message.success('Pokayoke notification acknowledged');
        // Refresh the Pokayoke notifications list to update the UI
        fetchPokayokeNotifications();
      } else {
        const errorData = await response.json();
        console.error('Pokayoke acknowledgment error:', errorData);
        let errorMessage = 'Unknown error';
        if (Array.isArray(errorData.detail)) {
          errorMessage = errorData.detail.map(err => err.msg || err.message || err).join(', ');
        } else if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        } else if (errorData.error) {
          errorMessage = errorData.error;
        }
        message.error(`Failed to acknowledge Pokayoke notification: ${errorMessage}`);
        // Remove from acknowledging set on error
        setAcknowledgingIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(logId);
          return newSet;
        });
      }
    } catch (error) {
      console.error('Error acknowledging Pokayoke notification:', error);
      message.error('Failed to acknowledge Pokayoke notification');
      // Remove from acknowledging set on error
      setAcknowledgingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(logId);
        return newSet;
      });
    }
  };

  const getStatusColor = (status) => {
    const s = (status || '').toLowerCase();
    if (s === 'approved') return 'success';
    if (s === 'pending') return 'processing';
    if (s === 'rework') return 'warning';
    if (s === 'rejected') return 'error';
    if (s === 'in_progress') return 'blue';
    if (s === 'completed') return 'green';
    if (s === 'submitted') return 'cyan';
    return 'default';
  };

  const formatDateTime = (date, time) => {
    if (!date || !time) return 'N/A';
    try {
      const dateStr = date;
      const timeStr = time.replace('.000Z', '');
      const dateTimeStr = `${dateStr} ${timeStr}`;
      const dateTime = new Date(dateTimeStr);
      if (isNaN(dateTime.getTime())) return 'N/A';

      return dateTime.toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    } catch (error) {
      return 'N/A';
    }
  };

  const columns = [
    {
      title: 'Sl\nNo',
      key: 'slNo',
      align: 'center',
      width: 50,
      render: (text, record, index) => index + 1,
    },
    {
      title: 'Project\nDetails',
      key: 'projectDetails',
      align: 'center',
      width: 100,
      sorter: (a, b) => {
        const orderA = a.operation?.order?.sale_order_number || '';
        const orderB = b.operation?.order?.sale_order_number || '';
        return orderA.localeCompare(orderB);
      },
      render: (text, record) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{record.operation?.order?.sale_order_number || 'N/A'}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>{record.operation?.product?.product_name || 'N/A'}</div>
        </div>
      ),
    },
    {
      title: 'Part\nDetails',
      key: 'partDetails',
      align: 'center',
      width: 80,
      sorter: (a, b) => {
        const partA = a.operation?.part?.part_name || '';
        const partB = b.operation?.part?.part_name || '';
        return partA.localeCompare(partB);
      },
      render: (text, record) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{record.operation?.part?.part_name || 'N/A'}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>{record.operation?.part?.part_number || 'N/A'}</div>
        </div>
      ),
    },
    {
      title: 'Operation\nDetails',
      key: 'operationDetails',
      align: 'center',
      width: 120,
      sorter: (a, b) => {
        const opA = a.operation?.operation_name || '';
        const opB = b.operation?.operation_name || '';
        return opA.localeCompare(opB);
      },
      render: (text, record) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{record.operation?.operation_name || 'N/A'}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>{record.operation?.operation_number ? `#${record.operation.operation_number}` : 'N/A'}</div>
        </div>
      ),
    },
    {
      title: 'Operator',
      key: 'operatorName',
      align: 'center',
      width: 90,
      render: (text, record) => record.operator?.user_name || 'N/A',
    },
    {
      title: 'Machine',
      key: 'machine',
      align: 'center',
      width: 100,
      render: (text, record) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{record.machine?.make || 'N/A'}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>{record.machine?.model || 'N/A'}</div>
        </div>
      ),
    },
    {
      title: 'From Date\n& Time',
      key: 'fromDateTime',
      align: 'center',
      width: 100,
      sorter: (a, b) => {
        const dateA = new Date(`${a.from_date} ${a.from_time}`);
        const dateB = new Date(`${b.from_date} ${b.from_time}`);
        return dateA - dateB;
      },
      render: (text, record) => formatDateTime(record.from_date, record.from_time),
    },
    {
      title: 'To Date\n& Time',
      key: 'toDateTime',
      align: 'center',
      width: 100,
      sorter: (a, b) => {
        const dateA = new Date(`${a.to_date} ${a.to_time}`);
        const dateB = new Date(`${b.to_date} ${b.to_time}`);
        return dateA - dateB;
      },
      render: (text, record) => formatDateTime(record.to_date, record.to_time),
    },
    {
      title: 'Part\nQty',
      key: 'partQuantity',
      align: 'center',
      width: 60,
      render: (text, record) => (
        <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{record.operation?.part?.quantity || 0}</span>
      ),
    },
    {
      title: 'Produced\nQty',
      dataIndex: 'produced_quantity',
      key: 'producedQuantity',
      align: 'center',
      width: 80,
      render: (text) => (
        <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{text || 0}</span>
      ),
    },
    {
      title: 'Approved\nQty',
      dataIndex: 'approved_quantity',
      key: 'approvedQuantity',
      align: 'center',
      width: 80,
      render: (text) => (
        <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{text || 0}</span>
      ),
    },
    {
      title: 'Rework\nQty',
      dataIndex: 'rework_quantity',
      key: 'reworkQuantity',
      align: 'center',
      width: 80,
      render: (text) => (
        <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{text || 0}</span>
      ),
    },
    {
      title: 'Rejected\nQty',
      dataIndex: 'rejected_quantity',
      key: 'rejectedQuantity',
      align: 'center',
      width: 80,
      render: (text) => (
        <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{text || 0}</span>
      ),
    },
    {
      title: 'Notes',
      dataIndex: 'notes',
      key: 'notes',
      align: 'center',
      width: 120,
      render: (text) => text || '-',
    },
    {
      title: 'Acknowledged At',
      dataIndex: 'supervisor_acknowledged_at',
      key: 'acknowledgedAt',
      align: 'center',
      width: 120,
      sorter: (a, b) => {
        const dateA = new Date(a.supervisor_acknowledged_at);
        const dateB = new Date(b.supervisor_acknowledged_at);
        return dateA - dateB;
      },
      render: (text) => {
        if (!text) return 'N/A';
        try {
          const date = new Date(text);
          return date.toLocaleString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          });
        } catch (error) {
          return 'N/A';
        }
      },
    },
    {
      title: 'Action',
      key: 'action',
      align: 'center',
      width: 50,
      fixed: 'right',
      render: (text, record) => (
        <Button
          type="primary"
          icon={<CheckOutlined />}
          size="small"
          onClick={() => handleAcknowledge(record.id)}
          disabled={record.supervisor_acknowledged_at || record.acknowledged || acknowledgingIds.has(record.id)}
        >
          Acknowledge
        </Button>
      ),
    },
  ];

  const inspectionCommonColumns = [
    {
      title: 'Sl No',
      key: 'sl_no',
      width: 60,
      render: (_, __, index) => (inspectionPagination.current - 1) * inspectionPagination.pageSize + index + 1,
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
    ...inspectionCommonColumns,
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
      width: 180,
      render: (_, record) =>
        record.is_ack ? (
          <Button icon={<EyeOutlined />} onClick={() => openPlanViewModal(record)}>
            Review
          </Button>
        ) : (
          <Button icon={<AppstoreOutlined />} onClick={() => handleOpenQmsSoftware(record)}>
            Open QMS Software
          </Button>
        ),
    },
  ];

  const ftpColumns = [
    ...inspectionCommonColumns,
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

  const pokayokeColumns = [
    {
      title: 'Sl\nNo',
      key: 'slNo',
      align: 'center',
      width: 50,
      render: (text, record, index) => index + 1,
    },
    {
      title: 'Checklist\nName',
      dataIndex: 'checklist_name',
      key: 'checklistName',
      align: 'center',
      width: 120,
      sorter: (a, b) => (a.checklist_name || '').localeCompare(b.checklist_name || ''),
    },
    {
      title: 'Machine\nName',
      dataIndex: 'machine_name',
      key: 'machineName',
      align: 'center',
      width: 100,
    },
    {
      title: 'Operator\nName',
      dataIndex: 'operator_name',
      key: 'operatorName',
      align: 'center',
      width: 100,
    },
    {
      title: 'Completed\nAt',
      dataIndex: 'completed_at',
      key: 'completedAt',
      align: 'center',
      width: 120,
      sorter: (a, b) => {
        const dateA = a.completed_at ? new Date(a.completed_at).getTime() : 0;
        const dateB = b.completed_at ? new Date(b.completed_at).getTime() : 0;
        return dateA - dateB;
      },
      render: (text) => {
        if (!text) return 'N/A';
        try {
          const date = new Date(text);
          return date.toLocaleString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          });
        } catch (error) {
          return 'N/A';
        }
      },
    },
    {
      title: 'Overall\nStatus',
      dataIndex: 'overall_status',
      key: 'overallStatus',
      align: 'center',
      width: 80,
      filters: [
        { text: 'Pending', value: 'pending' },
        { text: 'Approved', value: 'approved' },
        { text: 'Rejected', value: 'rejected' },
      ],
      onFilter: (value, record) => record.overall_status?.toLowerCase() === value,
      render: (text) => (
        <Tag color={getStatusColor(text)}>
          {(text || 'N/A').toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Acknowledged\nAt',
      key: 'acknowledgedAt',
      align: 'center',
      width: 120,
      sorter: (a, b) => {
        const dateA = a.supervisor_acknowledged_at ? new Date(a.supervisor_acknowledged_at).getTime() : 0;
        const dateB = b.supervisor_acknowledged_at ? new Date(b.supervisor_acknowledged_at).getTime() : 0;
        return dateA - dateB;
      },
      render: (_, record) => {
        if (!record.supervisor_acknowledged_at) return 'N/A';
        try {
          const date = new Date(record.supervisor_acknowledged_at);
          return date.toLocaleString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          });
        } catch (error) {
          return 'N/A';
        }
      },
    },
    {
      title: 'Action',
      key: 'action',
      align: 'center',
      width: 50,
      fixed: 'right',
      render: (text, record) => (
        <Button
          type="primary"
          icon={<CheckOutlined />}
          size="small"
          onClick={() => handlePokayokeAcknowledge(record.log_id)}
          disabled={record.supervisor_acknowledged || acknowledgingIds.has(record.log_id)}
        >
          Acknowledge
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px' }}>
      {/* Header Card */}
      <Card
        style={{ borderRadius: 8, marginBottom: '16px' }}
        styles={{ body: { padding: '16px' } }}
      >
        <Row justify="space-between" align="middle">
          <Col>
            <div>
              <Title level={3} style={{ margin: 0, marginBottom: '8px' }}>
                <BellOutlined /> Notifications
              </Title>
              <Text type="secondary">
                View and acknowledge notifications from operators
              </Text>
            </div>
          </Col>
          <Col>
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              size="large"
              onClick={() => {
                fetchNotifications();
                fetchPokayokeNotifications();
                fetchInspectionNotifications();
              }}
            >
              Refresh
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Tabs Section */}
      <Card
        style={{ borderRadius: 8 }}
        styles={{ body: { padding: '0 16px' } }}
      >
        <Tabs
          activeKey={activeTab}
          onChange={(key) => {
            setActiveTab(key);
            if (key === 'approval') void fetchInspectionNotifications();
          }}
          items={[
            {
              key: 'production',
              label: 'Production Logs',
              children: (
                <Spin spinning={loading}>
                  <Table
                    columns={columns}
                    dataSource={notifications}
                    rowKey="id"
                    pagination={{
                      current: pagination.current,
                      pageSize: pagination.pageSize,
                      pageSizeOptions: [10, 20, 50, 100],
                      showSizeChanger: true,
                      showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
                      onChange: (page, pageSize) => {
                        setPagination({ current: page, pageSize });
                      },
                      onShowSizeChange: (current, size) => {
                        setPagination({ current: 1, pageSize: size });
                      },
                    }}
                    variant="outlined"
                    scroll={{ x: 'max-content', y: 'calc(100vh - 400px)' }}
                    style={{
                      textAlign: 'center',
                    }}
                    components={{
                      header: {
                        cell: (props) => (
                          <th {...props} style={{ ...props.style, background: 'linear-gradient(to bottom, #f0f5ff, #e6f0ff)', fontWeight: 'bold', borderBottom: '2px solid #1890ff' }}>
                            {props.children}
                          </th>
                        ),
                      },
                    }}
                  />
                </Spin>
              ),
            },
            {
              key: 'approval',
              label: `Approval Notifications (${planRequests.length})`,
              children: (
                <div>
                  <div style={{ marginBottom: 12, maxWidth: 360 }}>
                    <Input.Search
                      allowClear
                      placeholder="Search order, part, operator…"
                      onSearch={setQuery}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  <Spin spinning={inspectionLoading}>
                    <Table
                      rowKey="id"
                      dataSource={planRequests}
                      columns={planColumns}
                      pagination={{
                        current: inspectionPagination.current,
                        pageSize: inspectionPagination.pageSize,
                        onChange: (p, ps) => { setInspectionPagination({ current: p, pageSize: ps }); },
                        showSizeChanger: true,
                      }}
                      locale={{ emptyText: <Empty description="No inspection plan requests" /> }}
                    />
                  </Spin>
                </div>
              ),
            },
            {
              key: 'ftp',
              label: `FTP Notifications (${ftpRequests.length})`,
              children: (
                <div>
                  <div style={{ marginBottom: 12, maxWidth: 360 }}>
                    <Input.Search
                      allowClear
                      placeholder="Search order, part, operator…"
                      onSearch={setQuery}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  <Spin spinning={inspectionLoading}>
                    <Table
                      rowKey="id"
                      dataSource={ftpRequests}
                      columns={ftpColumns}
                      pagination={{ pageSize: 10, showSizeChanger: true }}
                      locale={{ emptyText: <Empty description="No FTP approval requests" /> }}
                    />
                  </Spin>
                </div>
              ),
            },
            {
              key: 'pokayoke',
              label: (
                <Badge count={pokayokeNotifications.filter(log => !log.supervisor_acknowledged).length} showZero={false}>
                  Preventive Maintenance Checklists
                </Badge>
              ),
              children: (
                <Spin spinning={pokayokeLoading}>
                  <Table
                    columns={pokayokeColumns}
                    dataSource={pokayokeNotifications}
                    rowKey="log_id"
                    pagination={{
                      current: pokayokePagination.current,
                      pageSize: pokayokePagination.pageSize,
                      pageSizeOptions: [10, 20, 50, 100],
                      showSizeChanger: true,
                      showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
                      onChange: (page, pageSize) => {
                        setPokayokePagination({ current: page, pageSize });
                      },
                      onShowSizeChange: (current, size) => {
                        setPokayokePagination({ current: 1, pageSize: size });
                      },
                    }}
                    variant="outlined"
                    scroll={{ x: 'max-content', y: 'calc(100vh - 400px)' }}
                    style={{
                      textAlign: 'center',
                    }}
                    components={{
                      header: {
                        cell: (props) => (
                          <th {...props} style={{ ...props.style, background: 'linear-gradient(to bottom, #f0f5ff, #e6f0ff)', fontWeight: 'bold', borderBottom: '2px solid #1890ff' }}>
                            {props.children}
                          </th>
                        ),
                      },
                    }}
                  />
                </Spin>
              ),
            },
            {
              key: 'pokayoke-checklist',
              label: (
                <Badge count={pokayokeChecklistUnacknowledgedCount} showZero={false}>
                  PokaYoke Checklist
                </Badge>
              ),
              children: <PokayokeOperationNotification onUnacknowledgedCountChange={setPokayokeChecklistUnacknowledgedCount} />,
            },
          ]}
        />
      </Card>

      {/* Confirmed inspection plan view (Approval Notifications → Review) */}
      <Modal
        title={`Operation ${planViewMeta?.opNo || '—'}: ${planViewMeta?.opName || 'Inspection Plan'}`}
        centered
        footer={null}
        width="95%"
        onCancel={() => setPlanViewOpen(false)}
        open={planViewOpen}
        styles={{ body: { padding: 12, height: '80vh', background: '#f7f8fa' } }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1.45fr 1fr', gap: 14, height: '100%', fontFamily: MONO_FONT }}>
          <div style={{ border: '1px solid #dfe4ea', borderRadius: 10, overflow: 'hidden', background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '0 2px 10px rgba(15,23,42,0.04)' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #eef0f3', background: '#fafbfc' }}>
              <Text strong style={{ color: '#111827', fontSize: 22, lineHeight: 1.2, fontFamily: MONO_FONT }}>Inspection Details</Text>
              <div style={{ marginTop: 10, fontSize: 16, color: '#374151' }}>
                <Text style={{ fontSize: 16, fontFamily: MONO_FONT }}><b>Order:</b> {planViewMeta?.orderNo || '—'}</Text>
                <Text style={{ fontSize: 16, marginLeft: 18, fontFamily: MONO_FONT }}><b>Part:</b> {planViewMeta?.partNo || '—'}</Text>
                <Text style={{ fontSize: 16, marginLeft: 18, fontFamily: MONO_FONT }}><b>Operation:</b> {planViewMeta?.opNo || '—'}</Text>
              </div>
            </div>
            <div style={{ padding: '0 10px 10px', flex: 1, minHeight: 0 }}>
              <Table
                size="small"
                loading={planViewLoading}
                dataSource={planViewTableRows}
                rowKey="id"
                pagination={{ pageSize: 14, showSizeChanger: false }}
                scroll={{ x: 'max-content', y: 520 }}
                columns={[
                  { title: 'S.No', key: 'sno', width: 82, render: (_, __, idx) => <Text style={{ fontFamily: MONO_FONT, fontSize: 13 }}>{idx + 1}</Text> },
                  { title: 'Zone', dataIndex: 'zone', key: 'zone', width: 90, render: (z) => <Tag color="geekblue" style={{ margin: 0, borderRadius: 10, fontFamily: MONO_FONT }}>{z || '—'}</Tag> },
                  { title: 'Description', dataIndex: 'dimension_type', key: 'dimension_type', width: 240, render: (val) => <Tag color={planDimensionTypeTagColor(val)} style={{ margin: 0, borderRadius: 10, fontFamily: MONO_FONT }}>{val || '—'}</Tag> },
                  { title: 'Nominal', dataIndex: 'nominal', key: 'nominal', width: 130, render: (v) => <Text style={{ fontFamily: MONO_FONT, color: '#1f2937', fontSize: 13 }}>{v ?? '—'}</Text> },
                  { title: 'Upper Tol', dataIndex: 'uppertol', key: 'uppertol', width: 130, render: (v) => <Text style={{ fontFamily: MONO_FONT, color: Number(v) > 0 ? '#15803d' : '#6b7280', fontSize: 13 }}>{fmtPlanTol(v)}</Text> },
                  { title: 'Lower Tol', dataIndex: 'lowertol', key: 'lowertol', width: 130, render: (v) => <Text style={{ fontFamily: MONO_FONT, color: Number(v) < 0 ? '#b91c1c' : '#6b7280', fontSize: 13 }}>{fmtPlanTol(v)}</Text> },
                  {
                    title: 'Instrument',
                    dataIndex: 'measured_instrument',
                    key: 'measured_instrument',
                    width: 160,
                    render: (v) => {
                      const label = (v || '').trim() || 'default';
                      return (
                        <Text
                          style={{
                            fontFamily: MONO_FONT,
                            fontSize: 13,
                            color: label === 'default' ? '#94a3b8' : '#334155',
                          }}
                          ellipsis={{ tooltip: label }}
                        >
                          {label}
                        </Text>
                      );
                    },
                  },
                ]}
              />
            </div>
          </div>
          <div style={{ border: '1px solid #dfe4ea', borderRadius: 10, overflow: 'hidden', background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '0 2px 10px rgba(15,23,42,0.04)' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #eef0f3', background: '#fafbfc', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text strong style={{ color: '#111827', fontFamily: MONO_FONT }}>Drawing View</Text>
              <Button size="small" icon={<CloudDownloadOutlined />} onClick={handleDownloadPlanViewDrawing} disabled={!planViewDrawingUrl}>
                Download Drawing
              </Button>
            </div>
            <div style={{ flex: 1, minHeight: 0, padding: 10, display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
              {planViewLoading ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin /></div>
              ) : planViewDrawingUrl && planViewBalloonDocumentId ? (
                <InteractiveDrawing
                  pdfId={planViewBalloonDocumentId}
                  directImageSrc={!planViewDrawingIsPdf ? planViewDrawingUrl : null}
                  pageNumber={1}
                  balloons={planViewInteractiveBalloons}
                  activeBalloonId={planViewActiveBalloonId}
                  onBalloonClick={(b) => setPlanViewActiveBalloonId(b.id)}
                  balloonColor="blue"
                />
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Empty description="No drawing found for this operation" />
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* FTP Approval Modal */}
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

export default Notifications;
