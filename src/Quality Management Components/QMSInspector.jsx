import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { App, Alert, Button, Modal, Space, Spin, Tabs, Tag } from 'antd';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { QUALITY_API_BASE_URL } from '../Config/qualityconfig';
import InspectorHeader from './InspectorComponents/InspectorHeader';
import InspectorSidebar from './InspectorComponents/InspectorSidebar';
import PdfInspectionPlanCanvas, { ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from './InspectorComponents/PdfInspectionPlanCanvas';
import InteractiveDrawing from './InspectorComponents/InteractiveDrawing';
import InspectorBOCTable from './InspectorComponents/InspectorBOCTable';
import InspectorNotesTable from './InspectorComponents/InspectorNotesTable';
import StampCharacteristicModal from './InspectorComponents/StampCharacteristicModal';
import { parseNotesFromExtractedText } from './InspectorComponents/noteTextParser';

function toRectFromQuad(quad) {
  if (!Array.isArray(quad) || quad.length < 2) return null;
  try {
    const xs = quad.map((p) => Number(p?.[0])).filter(Number.isFinite);
    const ys = quad.map((p) => Number(p?.[1])).filter(Number.isFinite);
    if (!xs.length || !ys.length) return null;
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const width = Math.max(...xs) - x;
    const height = Math.max(...ys) - y;
    if (width <= 0 || height <= 0) return null;
    return { x, y, width, height };
  } catch {
    return null;
  }
}

function overlapRatio(a, b) {
  const ix = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const area = Math.max(1e-6, a.width * a.height);
  return inter / area;
}
import {
  buildBalloonOverlaysFromBocRows,
  mapDbMasterBocRowsToTable,
  parseMasterBocBboxToPdfRect,
  parseMasterBocIdFromStageBbox,
  pdfRectToQuad,
  withBalloonNumbers,
} from './InspectorComponents/bocMappers';
import { DEFAULT_MEASURED_INSTRUMENT } from './InspectorComponents/inspectorConstants';
import { exportBalloonedPdf } from './InspectorComponents/exportBalloonedPdf';
import {
  isBalloonDocumentName,
  resolveBaseDrawingDocument,
} from './InspectorComponents/drawingDocumentUtils';

const QMSInspector = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isOperatorView = location.pathname.startsWith('/operator/');

  const drawingUrl = searchParams.get('drawingUrl');
  const documentIdParam = searchParams.get('documentId');
  const partId = searchParams.get('partId');
  const partNumber = searchParams.get('partNumber');
  const orderId = searchParams.get('orderId');
  const opNumber = searchParams.get('operationNumber');
  const operationId = searchParams.get('operationId');
  const fileNameParam = searchParams.get('fileName') || 'Drawing.pdf';
  const projectName = searchParams.get('projectName') || '';
  const partName = searchParams.get('partName') || '';
  const operationName = searchParams.get('operationName') || '';
  const [resolvedDrawing, setResolvedDrawing] = useState(null);

  const queryParamsLookBallooned = useMemo(
    () => isBalloonDocumentName(fileNameParam),
    [fileNameParam],
  );

  const fileName = resolvedDrawing?.name
    || (queryParamsLookBallooned ? null : fileNameParam)
    || 'Drawing.pdf';

  const fileIsPdf = useMemo(() => {
    if (resolvedDrawing != null) return resolvedDrawing.isPdf;
    const p = searchParams.get('isPdf');
    if (p != null) return p !== 'false';
    if (!fileName) return true;
    return fileName.toLowerCase().endsWith('.pdf');
  }, [resolvedDrawing, searchParams, fileName]);

  const isOperationDocument = useMemo(() => {
    if (resolvedDrawing?.endpoint) return resolvedDrawing.endpoint === 'operation-documents';
    if (drawingUrl && !queryParamsLookBallooned) return drawingUrl.includes('/operation-documents/');
    return false;
  }, [resolvedDrawing, drawingUrl, queryParamsLookBallooned]);

  const fileUrl = useMemo(() => {
    if (resolvedDrawing?.url) return resolvedDrawing.url;
    if (drawingUrl && !queryParamsLookBallooned) return drawingUrl;
    if (documentIdParam && !queryParamsLookBallooned) {
      const endpoint = isOperationDocument ? 'operation-documents' : 'documents';
      return `${QUALITY_API_BASE_URL}/${endpoint}/${documentIdParam}/preview`;
    }
    return null;
  }, [resolvedDrawing, drawingUrl, queryParamsLookBallooned, documentIdParam, isOperationDocument]);

  const documentId = resolvedDrawing?.apiDocumentId
    || (queryParamsLookBallooned ? null : documentIdParam);

  const [quantityNo, setQuantityNo] = useState(() => {
    const q = searchParams.get('quantityNo');
    if (q != null && q !== '') {
      const n = Number(q);
      if (Number.isFinite(n) && n >= 1) return Math.floor(n);
    }
    return 1;
  });
  const [partQtyMax, setPartQtyMax] = useState(1);

  const [activeTool, setActiveTool] = useState('pan');
  const [pdfZoom, setPdfZoom] = useState(1);
  const [pdfRotation, setPdfRotation] = useState(0);
  const [bocRowsRaw, setBocRowsRaw] = useState([]);
  const [filterDimTypes, setFilterDimTypes] = useState([]);
  const [filterZones, setFilterZones] = useState([]);
  const [selectedRowIds, setSelectedRowIds] = useState([]);
  const [lastClickedRowId, setLastClickedRowId] = useState(null);
  const [selectedNoteId, setSelectedNoteId] = useState(null);
  const [stampModalOpen, setStampModalOpen] = useState(false);
  const [pendingStampRegion, setPendingStampRegion] = useState(null);
  const [stampSaving, setStampSaving] = useState(false);

  const viewerWrapRef = useRef(null);
  const drawingRef = useRef(null);
  const quantityClearSkipRef = useRef(true);
  const [viewerWidth, setViewerWidth] = useState(880);
  const [viewerHeight, setViewerHeight] = useState(600);

  const [salesOrderId, setSalesOrderId] = useState(orderId && !Number.isNaN(Number(orderId)) ? Number(orderId) : undefined);
  const [opNo, setOpNo] = useState(() => {
    if (opNumber == null || opNumber === '') return 10;
    const n = Number(opNumber);
    return Number.isNaN(n) ? 10 : n;
  });

  // Sync opNo if query param changes (standard navigation)
  useEffect(() => {
    if (opNumber != null && opNumber !== '') {
      const n = Number(opNumber);
      if (!Number.isNaN(n)) setOpNo(n);
    }
  }, [opNumber]);
  const ipid = useMemo(() => {
    const pn = (partNumber || 'PART').toString().trim().replace(/[^A-Za-z0-9_-]+/g, '_');
    const op = Number.isFinite(Number(opNo)) ? Number(opNo) : 'NA';
    return `FTP_${pn}_OP_${op}`;
  }, [partNumber, opNo]);
  const [saving, setSaving] = useState(false);
  /** null = unknown / no row; draft | confirmed from quality.inspection_plan_status */
  const [planStatus, setPlanStatus] = useState(null);
  const [confirmedByUsername, setConfirmedByUsername] = useState(null);
  /** Operator: set true after inspection-plan-status fetch completes (for gating measure view). */
  const [planStatusChecked, setPlanStatusChecked] = useState(false);
  const initialInspectorMode = (() => {
    if (isOperatorView) return 'MEASURE';
    const m = (searchParams.get('mode') || '').trim().toUpperCase();
    return m === 'MEASURE' ? 'MEASURE' : 'PLAN';
  })();
  const [inspectorMode, setInspectorMode] = useState(initialInspectorMode);
  useEffect(() => {
    if (isOperatorView && inspectorMode !== 'MEASURE') {
      setInspectorMode('MEASURE');
    }
  }, [isOperatorView, inspectorMode]);

  const [stageRows, setStageRows] = useState([]);
  const [ftpStatus, setFtpStatus] = useState(null);
  const [ftpApprovedByUsername, setFtpApprovedByUsername] = useState(null);
  const ftpApproved = ftpStatus === 'approved';
  const [activeTab, setActiveTab] = useState('characteristics');
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [qty1Complete, setQty1Complete] = useState(false);

  useLayoutEffect(() => {
    const el = viewerWrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth - 8;
      const h = el.clientHeight - 8;
      setViewerWidth(Math.max(320, w));
      setViewerHeight(Math.max(200, h));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fileUrl]);

  useEffect(() => {
    if (orderId && !Number.isNaN(Number(orderId))) setSalesOrderId(Number(orderId));
  }, [orderId]);

  useEffect(() => {
    const pid = partId ? Number(partId) : null;
    const oid = operationId ? Number(operationId) : null;
    if (!pid && !oid) return;

    let cancelled = false;
    (async () => {
      try {
        const [partRes, opRes] = await Promise.all([
          pid
            ? axios.get(`${QUALITY_API_BASE_URL}/documents/part/${pid}`).catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
          oid
            ? axios.get(`${QUALITY_API_BASE_URL}/operation-documents/operation/${oid}`).catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
        ]);
        if (cancelled) return;
        const partDocs = Array.isArray(partRes.data) ? partRes.data : [];
        const opDocs = Array.isArray(opRes.data) ? opRes.data : [];
        setResolvedDrawing(resolveBaseDrawingDocument(opDocs, partDocs));
      } catch (err) {
        console.warn('Resolve base drawing failed', err);
        if (!cancelled) setResolvedDrawing(null);
      }
    })();
    return () => { cancelled = true; };
  }, [partId, operationId]);

  useEffect(() => {
    const pid = partId ? Number(partId) : null;
    if (!pid) {
      setPartQtyMax(1);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${QUALITY_API_BASE_URL}/parts/${pid}`);
        const raw = res.data?.qty;
        const n = raw != null && Number(raw) >= 1 ? Math.min(999, Math.floor(Number(raw))) : 1;
        if (!cancelled) setPartQtyMax(n);
      } catch {
        if (!cancelled) setPartQtyMax(1);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [partId]);

  const canNavigateToOthers = ftpApproved || qty1Complete;

  useEffect(() => {
    setQuantityNo((q) => {
      const next = Math.min(Math.max(1, q), partQtyMax);
      if (next > 1 && !canNavigateToOthers) return 1;
      return next;
    });
  }, [partQtyMax, canNavigateToOthers]);

  const quantityOptions = useMemo(() => {
    const limit = canNavigateToOthers ? partQtyMax : 1;
    return Array.from({ length: limit }, (_, i) => ({
      value: i + 1,
      label: `Quantity ${i + 1}`,
    }));
  }, [partQtyMax, canNavigateToOthers]);

  const fetchMasterBoc = useCallback(async () => {
    const oid = Number(salesOrderId);
    if (!partNumber || !oid) {
      setBocRowsRaw([]);
      return;
    }
    if (isOperatorView) {
      if (!planStatusChecked) return;
      if (planStatus !== 'confirmed') {
        setBocRowsRaw([]);
        return;
      }
    }
    try {
      const params = { part_id: partNumber, sales_order_id: oid };
      if (opNo != null && !Number.isNaN(opNo)) params.op_no = opNo;
      const res = await axios.get(`${QUALITY_API_BASE_URL}/quality/master-boc`, { params });
      setBocRowsRaw(mapDbMasterBocRowsToTable(res.data));
    } catch (err) {
      console.error(err);
      const detail = err.response?.data?.detail;
      message.error(typeof detail === 'string' ? detail : err.message || 'Failed to load characteristics');
    }
  }, [partNumber, salesOrderId, opNo, message, isOperatorView, planStatusChecked, planStatus]);

  useEffect(() => {
    void fetchMasterBoc();
  }, [fetchMasterBoc]);

  useEffect(() => {
    const oid = Number(salesOrderId);
    if (!partNumber || !oid) {
      setPlanStatus(null);
      setConfirmedByUsername(null);
      setPlanStatusChecked(true);
      return;
    }
    let cancelled = false;
    setPlanStatusChecked(false);
    (async () => {
      try {
        const res = await axios.get(`${QUALITY_API_BASE_URL}/quality/inspection-plan-status`, {
          params: { part_number: partNumber, sales_order_id: oid, op_no: opNo },
        });
        const row = Array.isArray(res.data) && res.data[0];
        if (!cancelled) {
          setPlanStatus(row?.status || null);
          setConfirmedByUsername(row?.confirmed_by_username || null);
        }
      } catch {
        if (!cancelled) {
          setPlanStatus(null);
          setConfirmedByUsername(null);
        }
      } finally {
        if (!cancelled) setPlanStatusChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [partNumber, salesOrderId, opNo]);

  const [hasStageMeasurements, setHasStageMeasurements] = useState(false);
  const refreshMeasurementSummary = useCallback(async () => {
    const pid = partId ? Number(partId) : null;
    const oid = Number(salesOrderId);
    if (!pid || !oid || Number.isNaN(oid) || !partNumber) {
      setHasStageMeasurements(false);
      return;
    }
    try {
      const res = await axios.get(`${QUALITY_API_BASE_URL}/quality/stage-inspection/measurement-summary`, {
        params: { part_id: pid, sale_order_id: oid, op_no: opNo },
      });
      setHasStageMeasurements(Boolean(res.data?.any_recorded));
      setQty1Complete(Boolean(res.data?.qty1_complete));
      
      const bQty = Number(res.data?.qty_max);
      if (bQty > 0 && bQty !== maxQty) {
        setMaxQty(bQty);
      }
    } catch {
      setHasStageMeasurements(false);
      setQty1Complete(false);
    }
  }, [partId, salesOrderId, opNo, partNumber]);

  useEffect(() => {
    void refreshMeasurementSummary();
  }, [refreshMeasurementSummary]);

  const refreshFtpStatus = useCallback(async () => {
    const oid = Number(salesOrderId);
    if (!oid || Number.isNaN(oid) || !ipid) {
      setFtpStatus(null);
      return;
    }
    try {
      const res = await axios.get(`${QUALITY_API_BASE_URL}/quality/ftp-status`, {
        params: { order_id: oid, ipid, op_no: opNo },
      });
      setFtpStatus(res.data?.status || null);
      setFtpApprovedByUsername(res.data?.approved_by_username || null);
    } catch {
      setFtpStatus(null);
    }
  }, [salesOrderId, ipid, opNo]);

  useEffect(() => {
    void refreshFtpStatus();
  }, [refreshFtpStatus]);

  useEffect(() => {
    if (!ftpApproved && quantityNo > 1) {
      setQuantityNo(1);
    }
  }, [ftpApproved, quantityNo]);

  /** Block BOC edits only when the plan is confirmed and at least one measurement exists. */
  const bocEditLocked = planStatus === 'confirmed' && hasStageMeasurements;

  const noteScopeParams = useMemo(
    () => ({
      op_no: Number.isFinite(Number(opNo)) ? Number(opNo) : 0,
      is_operation_document: isOperationDocument,
    }),
    [opNo, isOperationDocument],
  );

  const loadNotes = useCallback(async () => {
    const pid = partId ? Number(partId) : null;
    const docId = documentId ? Number(documentId) : null;
    if (!pid || !docId) {
      setNotes([]);
      return;
    }
    try {
      setNotesLoading(true);
      const res = await axios.get(`${QUALITY_API_BASE_URL}/quality/notes/part/${pid}`, {
        params: {
          document_id: docId,
          ...noteScopeParams,
        },
      });
      setNotes(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.warn('Failed to load notes', err);
      setNotes([]);
    } finally {
      setNotesLoading(false);
    }
  }, [partId, documentId, noteScopeParams]);

  useEffect(() => {
    setSelectedNoteId(null);
    void loadNotes();
  }, [loadNotes]);

  /** Clear measurement rows when quantity changes (not on first mount) so values reset until ensure loads. */
  useEffect(() => {
    if (quantityClearSkipRef.current) {
      quantityClearSkipRef.current = false;
      return;
    }
    setStageRows([]);
    setSelectedRowIds([]);
    setLastClickedRowId(null);
  }, [quantityNo]);

  const fetchStageRows = useCallback(async () => {
    if (inspectorMode !== 'MEASURE') return;

    const pid = partId ? Number(partId) : null;
    const oid = Number(salesOrderId);
    if (!pid || !oid || !partNumber) return;

    if (quantityNo > 1 && !ftpApproved) return;

    try {
      const res = await axios.post(`${QUALITY_API_BASE_URL}/quality/stage-inspection/ensure`, null, {
        params: {
          part_id: pid,
          part_number: partNumber,
          sale_order_id: oid,
          op_no: opNo,
          quantity_no: quantityNo,
          ipid,
          user_id: 1,
        },
      });
      setStageRows(res.data);
    } catch (err) {
      console.error('[QMSInspector] Failed to ensure stage measurements:', err);
      const detail = err.response?.data?.detail;
      message.error(typeof detail === 'string' ? detail : err.message || 'Failed to load measure data');
    }
  }, [inspectorMode, partId, salesOrderId, opNo, partNumber, quantityNo, message, ftpApproved, ipid]);

  useEffect(() => {
    void fetchStageRows();
  }, [fetchStageRows, bocRowsRaw.length]);

  const handleMeasurePatch = useCallback(
    async (stageId, payload) => {
      if (!stageId) return;

      console.log(`[QMSInspector] Patching stage row ${stageId} with payload:`, payload);

      // Update local state immediately for instant UI feedback
      setStageRows((prev) => {
        const next = prev.map((r) => (r.id === stageId ? { ...r, ...payload } : r));
        console.log(`[QMSInspector] State updated for stage row ${stageId}. Mean is now:`, payload.measured_mean);
        return next;
      });

      try {
        await axios.patch(`${QUALITY_API_BASE_URL}/quality/stage-inspection/${stageId}`, payload);
        refreshMeasurementSummary();
      } catch (err) {
        console.error(err);
        const detail = err.response?.data?.detail;
        message.error(typeof detail === 'string' ? detail : err.message || 'Failed to save measurement');
      }
    },
    [message, refreshMeasurementSummary],
  );

  const handleSetInstrument = useCallback(
    async (record, instrument) => {
      if (isOperatorView) return;
      if (bocEditLocked && inspectorMode !== 'MEASURE') {
        message.warning('Plan is confirmed. Instrument cannot be changed.');
        return;
      }
      const val = (instrument || '').trim() || DEFAULT_MEASURED_INSTRUMENT;
      try {
        if (inspectorMode === 'MEASURE' && record.stageInspectionId) {
          await handleMeasurePatch(record.stageInspectionId, { measured_instrument: val });
        }
        if (record.id) {
          await axios.patch(`${QUALITY_API_BASE_URL}/quality/master-boc/${record.id}`, {
            measured_instrument: val,
          });
          setBocRowsRaw((prev) =>
            prev.map((r) => (r.id === record.id ? { ...r, instrument: val } : r)),
          );
        }
      } catch (err) {
        console.error(err);
        const detail = err.response?.data?.detail;
        message.error(typeof detail === 'string' ? detail : err.message || 'Failed to update instrument');
        throw err;
      }
    },
    [bocEditLocked, inspectorMode, handleMeasurePatch, message, isOperatorView],
  );

  const handleSetUsedInstrument = useCallback(
    async (record, usedInst) => {
      if (!record.stageInspectionId) {
        message.error('Save measurements context is not ready for this row.');
        return;
      }
      const val = (usedInst || '').trim();
      if (!val) {
        message.warning('Select an instrument from the list.');
        return;
      }
      await handleMeasurePatch(record.stageInspectionId, { used_inst: val });
    },
    [handleMeasurePatch, message],
  );

  const bocFiltered = useMemo(() => {
    return bocRowsRaw.filter((r) => {
      if (filterDimTypes.length && !filterDimTypes.includes(r.dimType)) return false;
      if (filterZones.length && !filterZones.includes(r.zone)) return false;
      return true;
    });
  }, [bocRowsRaw, filterDimTypes, filterZones]);

  const bocDisplay = useMemo(() => withBalloonNumbers(bocFiltered), [bocFiltered]);

  const stageByMasterId = useMemo(() => {
    const m = new Map();
    const wantQ = Number(quantityNo);
    for (const s of stageRows) {
      const rowQ = s.quantity_no != null ? Number(s.quantity_no) : 1;
      if (rowQ !== wantQ) continue;
      const mid = parseMasterBocIdFromStageBbox(s.bbox);
      if (mid != null) m.set(mid, s);
    }
    return m;
  }, [stageRows, quantityNo]);

  const bocTableData = useMemo(() => {
    return bocDisplay.map((r) => {
      let st = stageByMasterId.get(r.id);
      if (!st) {
        // Fallback: match by values if ID-based mapping fails
        const wantQ = Number(quantityNo);
        st = stageRows.find(
          (s) =>
            Number(s.quantity_no || 1) === wantQ &&
            String(s.nominal_value) === String(r.nominal) &&
            String(s.zone) === String(r.zone) &&
            String(s.dimension_type) === String(r.dimType),
        );
      }
      return {
        ...r,
        measurements: st?.measurements || [],
        actualValue: st?.measured_mean ?? '',
        meanValue: st?.measured_mean ?? '',
        instrument: st?.measured_instrument || r.instrument,
        usedInstrument: st?.used_inst ?? '',
        stageInspectionId: st?.id ?? null,
        measureLocked: Boolean(st?.is_done) || (quantityNo === 1 && ftpApproved),
      };
    });
  }, [bocDisplay, stageByMasterId, stageRows, quantityNo, ftpApproved]);

  const firstQtyAllDone = useMemo(() => {
    if (quantityNo !== 1 || !bocTableData.length) return false;
    // Relaxed: Allow submitting FTP if every characteristic has at least one measurement recorded
    return bocTableData.every((r) => {
      const measurements = r.measurements || [];
      return measurements.some(m => {
        const val = String(m ?? "").trim();
        return val !== "" && val !== "—" && val !== "-";
      });
    });
  }, [quantityNo, bocTableData]);

  const handleRequestFtpApproval = useCallback(async () => {
    const oid = Number(salesOrderId);
    if (!oid || Number.isNaN(oid)) {
      message.error('Order is required for FTP approval.');
      return;
    }
    if (!firstQtyAllDone) {
      message.warning('Complete quantity 1 measurements before requesting FTP approval.');
      return;
    }
    try {
      let reqUsername = '';
      try {
        const u = JSON.parse(localStorage.getItem('user') || '{}');
        reqUsername = (u.user_name || u.username || '').trim();
      } catch {
        reqUsername = '';
      }

      await axios.put(`${QUALITY_API_BASE_URL}/quality/ftp-status`, {
        order_id: oid,
        ipid,
        status: 'pending',
        is_completed: false,
        part_number: partNumber,
        op_no: opNo,
        operation_id: operationId ? Number(operationId) : 0,
        requested_by_username: reqUsername || undefined,
      });
      await refreshFtpStatus();
      message.success('FTP approval request sent to supervisor.');
    } catch (err) {
      console.error(err);
      const detail = err.response?.data?.detail;
      message.error(typeof detail === 'string' ? detail : err.message || 'Failed to request FTP approval');
    }
  }, [salesOrderId, firstQtyAllDone, ipid, refreshFtpStatus, message, partNumber, opNo, operationId]);

  const handleApproveFtpDirect = useCallback(async () => {
    const oid = Number(salesOrderId);
    if (!oid || Number.isNaN(oid)) {
      message.error('Order is required for FTP approval.');
      return;
    }
    try {
      let reqUsername = '';
      try {
        const u = JSON.parse(localStorage.getItem('user') || '{}');
        reqUsername = (u.user_name || u.username || '').trim();
      } catch {
        reqUsername = 'supervisor';
      }

      await axios.put(`${QUALITY_API_BASE_URL}/quality/ftp-status`, {
        order_id: oid,
        ipid,
        status: 'approved',
        is_completed: true,
        part_number: partNumber,
        op_no: opNo,
        operation_id: operationId ? Number(operationId) : 0,
        approved_by_username: reqUsername || undefined,
      });
      await refreshFtpStatus();
      message.success('FTP approved successfully.');
    } catch (err) {
      console.error(err);
      const detail = err.response?.data?.detail;
      message.error(typeof detail === 'string' ? detail : err.message || 'Failed to approve FTP');
    }
  }, [salesOrderId, firstQtyAllDone, ipid, refreshFtpStatus, message, partNumber, opNo, operationId]);

  /** Drop selection for rows that disappeared (filters / reload). */
  useEffect(() => {
    const valid = new Set(bocTableData.map((r) => r.id));
    setSelectedRowIds((ids) => {
      const next = ids.filter((id) => valid.has(id));
      return next.length === ids.length ? ids : next;
    });
    setLastClickedRowId((id) => (id != null && valid.has(id) ? id : null));
  }, [bocTableData]);

  const handleSelectedIdsChange = useCallback((ids, lastId) => {
    setSelectedRowIds(ids);
    setLastClickedRowId(lastId ?? null);
    if (lastId) {
      drawingRef.current?.zoomToSelection(String(lastId));
    } else if (ids.length > 0) {
      drawingRef.current?.zoomToSelection(null, ids.map(String));
    }
  }, []);

  const handleDeleteSelectedRows = useCallback(() => {
    if (bocEditLocked) {
      message.warning('Plan is confirmed. Characteristics cannot be deleted.');
      return;
    }
    if (!selectedRowIds.length) return;
    Modal.confirm({
      title: `Delete ${selectedRowIds.length} characteristic(s)?`,
      content: 'This removes the selected master BOC records (bbox) from the database.',
      okText: 'Delete',
      okType: 'danger',
      onOk: async () => {
        try {
          await Promise.all(
            selectedRowIds.map((id) => axios.delete(`${QUALITY_API_BASE_URL}/quality/master-boc/${id}`)),
          );
          message.success(`Removed ${selectedRowIds.length} characteristic(s).`);
          setSelectedRowIds([]);
          setLastClickedRowId(null);
          await fetchMasterBoc();
        } catch (err) {
          console.error(err);
          message.error(err.response?.data?.detail || err.message || 'Delete failed');
          throw err;
        }
      },
    });
  }, [selectedRowIds, fetchMasterBoc, message, bocEditLocked]);

  useEffect(() => {
    const onKey = (e) => {
      if (bocEditLocked) return;
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (!selectedRowIds.length) return;
      e.preventDefault();
      handleDeleteSelectedRows();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedRowIds, handleDeleteSelectedRows, bocEditLocked]);

  const balloonOverlays = useMemo(() => buildBalloonOverlaysFromBocRows(bocDisplay), [bocDisplay]);

  const interactiveBalloons = useMemo(() => {
    return balloonOverlays.map((b) => ({
      id: String(b.id),
      label: b.label,
      x: b.pdfRect.x,
      y: b.pdfRect.y,
      width: b.pdfRect.width,
      height: b.pdfRect.height,
      page: b.page,
    }));
  }, [balloonOverlays]);

  const buildMasterBocItems = useCallback(
    (dimensions) =>
      dimensions.map((d) => {
        const nom = d.nominal_value != null && d.nominal_value !== '' ? String(d.nominal_value) : d.text || '';
        let ut = parseFloat(String(d.upper_tolerance || '0').replace(',', '.')) || 0;
        let lt = parseFloat(String(d.lower_tolerance || '0').replace(',', '.')) || 0;
        if (Number.isNaN(ut)) ut = 0;
        if (Number.isNaN(lt)) lt = 0;
        return {
          part_id: partNumber,
          sales_order_id: Number(salesOrderId),
          nominal: nom,
          uppertol: ut,
          lowertol: lt,
          zone: (d.zone || 'A1').toString().trim().toUpperCase(),
          dimension_type: d.dimension_type || 'Length',
          measured_instrument: DEFAULT_MEASURED_INSTRUMENT,
          op_no: opNo,
          bbox: JSON.stringify({ bbox: d.bbox, text: d.text, gdt_class: d.gdt_class, page: d.page || 1 }),
          ipid,
        };
      }),
    [partNumber, salesOrderId, opNo, ipid],
  );

  const detectZonesForBoxes = useCallback(
    async (boxes) => {
      const pid = partId ? Number(partId) : null;
      if (!pid || !documentId || !Array.isArray(boxes) || !boxes.length) return [];
      try {
        const res = await axios.post(`${QUALITY_API_BASE_URL}/pdf-annotation/extract-zones-bulk`, {
          part_id: pid,
          pdf_id: String(documentId),
          bounding_boxes: boxes,
          scale_factor: 1.0,
        });
        return Array.isArray(res.data?.zones) ? res.data.zones : [];
      } catch (err) {
        console.error(err);
        return [];
      }
    },
    [partId, documentId],
  );

  const detectZoneForRegion = useCallback(
    async (region) => {
      const pid = partId ? Number(partId) : null;
      if (!pid || !documentId || !region) return 'A1';
      try {
        const res = await axios.post(`${QUALITY_API_BASE_URL}/pdf-annotation/extract-zone`, {
          part_id: pid,
          pdf_id: String(documentId),
          bounding_box: region,
          scale_factor: 1.0,
        });
        return (res.data?.zone || 'A1').toString().trim().toUpperCase();
      } catch (err) {
        console.error(err);
        return 'A1';
      }
    },
    [partId, documentId],
  );

  const persistMasterBocDimensions = useCallback(
    async (dimensions) => {
      const oid = Number(salesOrderId);
      if (!oid || !partNumber || !dimensions?.length) return;
      setSaving(true);
      try {
        const items = buildMasterBocItems(dimensions);
        await axios.post(`${QUALITY_API_BASE_URL}/quality/master-boc/bulk`, { items, user_id: 1 });
        message.success(`Saved ${items.length} row(s) to Master BOC.`);
      } catch (err) {
        console.error(err);
        const detail = err.response?.data?.detail;
        message.error(typeof detail === 'string' ? detail : err.message || 'Save failed');
      } finally {
        setSaving(false);
      }
    },
    [salesOrderId, partNumber, buildMasterBocItems, message],
  );

  const onDetectionComplete = useCallback(
    async (data) => {
      if (bocEditLocked) {
        message.warning('Plan is confirmed. Characteristics cannot be changed.');
        return;
      }
      const dims = Array.isArray(data?.dimensions) ? data.dimensions : [];
      const oid = Number(salesOrderId);
      if (dims.length) {
        const boxes = dims
          .map((d) => parseMasterBocBboxToPdfRect(JSON.stringify({ bbox: d.bbox, page: d.page || 1 })))
          .filter(Boolean);
        if (boxes.length === dims.length) {
          const zones = await detectZonesForBoxes(boxes);
          const byIdx = new Map(zones.map((z) => [z.index, (z.zone || 'A1').toString().trim().toUpperCase()]));
          for (let i = 0; i < dims.length; i += 1) {
            if (byIdx.has(i)) dims[i].zone = byIdx.get(i);
          }
        }
      }
      if (dims?.length && oid && partNumber) {
        await persistMasterBocDimensions(dims);
      }
      await fetchMasterBoc();
    },
    [bocEditLocked, salesOrderId, partNumber, persistMasterBocDimensions, fetchMasterBoc, detectZonesForBoxes, message],
  );

  const handleStampRegion = useCallback(
    (region) => {
      if (bocEditLocked) {
        message.warning('Plan is confirmed. Characteristics cannot be changed.');
        return;
      }
      setPendingStampRegion(region);
      setStampModalOpen(true);
    },
    [bocEditLocked, message],
  );

  const handleStampModalOk = useCallback(
    async (formValues) => {
      if (bocEditLocked) {
        message.warning('Plan is confirmed. Characteristics cannot be changed.');
        return;
      }
      const oid = Number(salesOrderId);
      if (!oid || !partNumber) {
        message.error('Order and part are required to save a stamped characteristic.');
        return;
      }
      const region = pendingStampRegion;
      if (!region) return;

      const quad = pdfRectToQuad(region.x, region.y, region.width, region.height);
      const nom = (formValues.nominal || '').toString().trim();
      let ut = parseFloat(String(formValues.uppertol ?? '0').replace(',', '.')) || 0;
      let lt = parseFloat(String(formValues.lowertol ?? '0').replace(',', '.')) || 0;
      if (Number.isNaN(ut)) ut = 0;
      if (Number.isNaN(lt)) lt = 0;
      const inst = (formValues.measured_instrument || DEFAULT_MEASURED_INSTRUMENT).toString().trim() || DEFAULT_MEASURED_INSTRUMENT;

      const item = {
        part_id: partNumber,
        sales_order_id: oid,
        nominal: nom,
        uppertol: ut,
        lowertol: lt,
        zone: await detectZoneForRegion(region),
        dimension_type: formValues.dimension_type || 'Length',
        measured_instrument: inst,
        op_no: opNo,
        bbox: JSON.stringify({ bbox: quad, text: nom, page: region.page }),
        ipid,
      };

      setStampSaving(true);
      try {
        await axios.post(`${QUALITY_API_BASE_URL}/quality/master-boc/bulk`, { items: [item], user_id: 1 });
        message.success('Stamped characteristic saved.');
        setStampModalOpen(false);
        setPendingStampRegion(null);
        await fetchMasterBoc();
      } catch (err) {
        console.error(err);
        const detail = err.response?.data?.detail;
        message.error(typeof detail === 'string' ? detail : err.message || 'Save failed');
      } finally {
        setStampSaving(false);
      }
    },
    [bocEditLocked, salesOrderId, partNumber, pendingStampRegion, opNo, ipid, message, fetchMasterBoc, detectZoneForRegion],
  );

  const handleConfirmPlan = useCallback(async () => {
    const oid = Number(salesOrderId);
    const opNoStr = searchParams.get('operationNumber');
    const opNoInt = opNoStr != null ? parseInt(opNoStr, 10) : 10;
    const isFinalPart = opNoInt === 0;
    let opIdInt = operationId ? parseInt(operationId, 10) : 0;

    if (!partNumber || !oid) {
      message.error('Order and part are required.');
      return;
    }

    if (!isFinalPart && (!opIdInt || opIdInt <= 0) && partId) {
      try {
        const opsRes = await axios.get(`${QUALITY_API_BASE_URL}/operations/part/${partId}`);
        const ops = Array.isArray(opsRes.data) ? opsRes.data : [];
        const match = ops.find((o) => Number(o.operation_number) === opNoInt);
        if (match?.id) opIdInt = Number(match.id);
      } catch (err) {
        console.warn('Could not resolve operation id from part', err);
      }
    }

    if (!isFinalPart && (!opIdInt || opIdInt <= 0)) {
      message.error('Operation is required to store ballooned drawing.');
      return;
    }
    if (!bocRowsRaw.length) {
      message.warning('Add at least one characteristic before confirming the plan.');
      return;
    }

    Modal.confirm({
      title: 'Confirm inspection plan?',
      content: 'After confirmation, the inspection plan is locked.',
      okText: 'Confirm',
      onOk: async () => {
        try {
          // Export ballooned PDF and upload to MinIO (operation-documents). Re-confirm uploads a new revision.
          if (!isFinalPart && opIdInt > 0) {
            if (!fileUrl) {
              throw new Error('Drawing is not loaded. Cannot store ballooned PDF.');
            }
            const blob = await exportBalloonedPdf({
              fileUrl,
              isPdf: fileIsPdf,
              balloonOverlays,
            });
            if (!blob) {
              throw new Error('Could not generate ballooned PDF from the drawing and characteristics.');
            }
            const fd = new FormData();
            const safePart = (partNumber || 'part').replace(/[^a-zA-Z0-9_-]+/g, '_');
            const fileName = `${safePart}_op${opNoInt}_balloon.pdf`;
            fd.append('operation_id', String(opIdInt));
            fd.append('document_type', 'IPID');
            fd.append('document_version', '1.0');
            fd.append('files', new File([blob], fileName, { type: 'application/pdf' }));
            await axios.post(`${QUALITY_API_BASE_URL}/operation-documents/upload/`, fd, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });
          }

          let confirmUser = '';
          try {
            const u = JSON.parse(localStorage.getItem('user') || '{}');
            confirmUser = (u.user_name || u.username || '').trim();
          } catch {
            confirmUser = '';
          }
          if (!confirmUser) {
            message.warning('Could not read your username. Confirming without a named user.');
          }

          await axios.put(`${QUALITY_API_BASE_URL}/quality/inspection-plan-status`, {
            part_number: partNumber,
            sales_order_id: oid,
            op_no: opNoInt,
            status: 'confirmed',
            confirmed_by_username: confirmUser,
          });

          message.success('Inspection plan confirmed and released to operators.');
          setPlanStatus('confirmed');
          setConfirmedByUsername(confirmUser);
          await fetchMasterBoc();
          await refreshMeasurementSummary();
        } catch (err) {
          console.error(err);
          const detail = err.response?.data?.detail;
          message.error(typeof detail === 'string' ? detail : err.message || 'Failed to confirm plan');
        }
      },
    });
  }, [
    salesOrderId,
    partNumber,
    partId,
    operationId,
    searchParams,
    bocRowsRaw.length,
    fileUrl,
    fileIsPdf,
    balloonOverlays,
    message,
    fetchMasterBoc,
    refreshMeasurementSummary,
  ]);

  useEffect(() => {
    if (!bocRowsRaw.length || !partId || !documentId || bocEditLocked) return;
    let cancelled = false;
    (async () => {
      const withRects = bocRowsRaw
        .map((row) => ({ row, rect: parseMasterBocBboxToPdfRect(row._bbox) }))
        .filter((x) => x.rect);
      if (!withRects.length) return;
      const zones = await detectZonesForBoxes(withRects.map((x) => x.rect));
      if (cancelled || !zones.length) return;
      const zoneByIndex = new Map(zones.map((z) => [z.index, (z.zone || '').toString().trim().toUpperCase()]));
      const updates = [];
      for (let i = 0; i < withRects.length; i += 1) {
        const row = withRects[i]?.row;
        const newZone = zoneByIndex.get(i) || '';
        const oldZone = (row?.zone || '').toString().trim().toUpperCase();
        if (row?.id && newZone && newZone !== oldZone) {
          updates.push({ id: row.id, zone: newZone });
        }
      }
      if (!updates.length) return;
      await Promise.all(
        updates.map((u) => axios.patch(`${QUALITY_API_BASE_URL}/quality/master-boc/${u.id}`, { zone: u.zone })),
      );
      if (!cancelled) {
        await fetchMasterBoc();
        message.success(`Updated zones for ${updates.length} characteristic(s).`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bocRowsRaw, partId, documentId, detectZonesForBoxes, fetchMasterBoc, message, bocEditLocked]);

  const handleToolChange = useCallback(
    (tool) => {
      if (bocEditLocked && (tool === 'select' || tool === 'stamp')) {
        message.warning('Plan is confirmed. Use MEASURE mode to record results.');
        return;
      }
      setActiveTool(tool);
      if (tool === 'notes') setActiveTab('notes');
    },
    [bocEditLocked, message],
  );

  useEffect(() => {
    if (bocEditLocked && (activeTool === 'select' || activeTool === 'stamp')) {
      setActiveTool('pan');
    }
  }, [bocEditLocked, activeTool]);

  const noteOverlays = useMemo(
    () =>
      notes
        .filter((n) => n?.x != null && n?.y != null && n?.width != null && n?.height != null)
        .map((n) => ({
          id: n.id,
          page: n.page || 1,
          pdfRect: { x: n.x, y: n.y, width: n.width, height: n.height },
        })),
    [notes],
  );

  const handleNoteRegion = useCallback(
    async (region) => {
      const pid = partId ? Number(partId) : null;
      if (!pid || !documentId) {
        message.error('Part or document is missing for notes.');
        return;
      }
      setSaving(true);
      try {
        const textRes = await axios.post(`${QUALITY_API_BASE_URL}/pdf-annotation/extract-text`, {
          part_id: pid,
          pdf_id: String(documentId),
          bounding_box: region,
          scale_factor: 1.0,
        });
        const regionRect = { x: region.x, y: region.y, width: region.width, height: region.height };
        const filteredDetections = (textRes.data?.detections || []).filter((t) => {
          const quad = t.box || t.bbox;
          const r = toRectFromQuad(quad);
          const content = (t.text || t.content || t.value || '').trim();
          if (!content) return false;
          // If detector didn't return geometry, keep as fallback.
          if (!r) return true;
          const cx = r.x + r.width / 2;
          const cy = r.y + r.height / 2;
          const centerInside =
            cx >= regionRect.x &&
            cx <= regionRect.x + regionRect.width &&
            cy >= regionRect.y &&
            cy <= regionRect.y + regionRect.height;
          // Also allow strong overlap (for partially clipped words).
          const ov = overlapRatio(r, regionRect);
          return centerInside || ov >= 0.55;
        });
        const extractedText = filteredDetections.map((t) => t.text || t.content || t.value || '').filter(Boolean).join('\n');
        const noteItems = parseNotesFromExtractedText(extractedText);
        if (!noteItems.length) {
          noteItems.push(''); // keep region record even if OCR text is empty
        }
        await Promise.all(
          noteItems.map((noteText) =>
            axios.post(`${QUALITY_API_BASE_URL}/quality/notes`, {
              part_id: pid,
              document_id: Number(documentId),
              ...noteScopeParams,
              x: region.x,
              y: region.y,
              width: region.width,
              height: region.height,
              page: region.page,
              note_text: (noteText || '').trim(),
            }),
          ),
        );
        message.success('Note saved.');
        setActiveTab('notes');
        await loadNotes();
      } catch (err) {
        console.error(err);
        const detail = err.response?.data?.detail;
        message.error(typeof detail === 'string' ? detail : err.message || 'Failed to create note');
      } finally {
        setSaving(false);
      }
    },
    [partId, documentId, noteScopeParams, loadNotes, message],
  );

  const handleZoomIn = useCallback(() => {
    drawingRef.current?.zoomIn();
  }, []);

  const handleZoomOut = useCallback(() => {
    drawingRef.current?.zoomOut();
  }, []);

  const handleRotate = useCallback(() => {
    setPdfRotation((r) => (r + 90) % 360);
  }, []);

  const handleResetView = useCallback(() => {
    drawingRef.current?.resetView();
    setPdfRotation(0);
  }, []);

  const handleAutoBalloon = useCallback(() => {
    message.info('Auto Balloon is not connected yet — balloon numbering from geometry will run here.');
  }, [message]);

  const handleClearAll = useCallback(() => {
    if (bocEditLocked) {
      message.warning('Plan is confirmed. Characteristics cannot be cleared.');
      return;
    }
    if (!bocRowsRaw.length) return;
    Modal.confirm({
      title: 'Clear all characteristics?',
      content: 'This removes every Master BOC row for this part, order, and operation from the database.',
      okText: 'Delete all',
      okType: 'danger',
      onOk: async () => {
        try {
          await Promise.all(
            bocRowsRaw.map((row) => axios.delete(`${QUALITY_API_BASE_URL}/quality/master-boc/${row.id}`)),
          );
          message.success('All characteristics removed.');
          setSelectedRowIds([]);
          setLastClickedRowId(null);
          await fetchMasterBoc();
        } catch (err) {
          console.error(err);
          message.error(err.response?.data?.detail || err.message || 'Delete failed');
        }
      },
    });
  }, [bocRowsRaw, fetchMasterBoc, message, bocEditLocked]);

  const handleRegionSelect = useCallback(
    async (box) => {
      if (activeTool === 'select') {
        if (!documentId || !partId) {
          message.warning('Missing document or part for detection.');
          return;
        }
        setSaving(true);
        try {
          const res = await axios.post(`${QUALITY_API_BASE_URL}/pdf-annotation/process-dimensions`, {
            part_id: Number(partId),
            pdf_id: String(documentId),
            bounding_box: box,
            scale_factor: 1.0,
            pdf_content_type: 'normal',
          });
          await onDetectionComplete(res.data);
          const n = res.data?.count ?? 0;
          if (n > 0) {
            message.success(`Detected ${n} characteristic(s)`);
          } else {
            message.info('No dimensions found — try selecting tighter around the dimension text.');
          }
        } catch (err) {
          console.error(err);
          const detail = err.response?.data?.detail;
          message.error(typeof detail === 'string' ? detail : err.message || 'Detection failed');
        } finally {
          setSaving(false);
        }
      } else if (activeTool === 'stamp') {
        handleStampRegion(box);
      } else if (activeTool === 'notes') {
        handleNoteRegion(box);
      }
    },
    [activeTool, documentId, partId, onDetectionComplete, handleStampRegion, handleNoteRegion, message],
  );

  const canDetect = Boolean(documentId && partId);

  const operatorOid = Number(salesOrderId);
  const operatorHasScope = Boolean(partNumber && operatorOid && !Number.isNaN(operatorOid));
  if (isOperatorView) {
    if (!operatorHasScope) {
      return (
        <div style={{ padding: 32, maxWidth: 560, margin: '0 auto', paddingTop: 48 }}>
          <Alert
            type="error"
            showIcon
            message="Missing context"
            description="Open Measure from the inspection queue with a valid order and part."
          />
          <Button type="primary" style={{ marginTop: 16 }} onClick={() => navigate('/operator/inspection-results')}>
            Back to inspection queue
          </Button>
        </div>
      );
    }
    if (!planStatusChecked) {
      return (
        <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
          <Spin size="large" tip="Checking inspection plan…" />
        </div>
      );
    }
    if (planStatus !== 'confirmed') {
      return (
        <div style={{ padding: 32, maxWidth: 640, margin: '0 auto', paddingTop: 48 }}>
          <Alert
            type="warning"
            showIcon
            message="Inspection plan not released yet"
            description="The supervisor must confirm the inspection plan (balloon PDF and sign-off) before operators can view the drawing or record measurements. If the plan is still in draft, ask your supervisor to confirm it in Quality Management."
          />
          <Button type="primary" style={{ marginTop: 16 }} onClick={() => navigate('/operator/inspection-results')}>
            Back to inspection queue
          </Button>
        </div>
      );
    }
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f8fafc' }}>
      <InspectorHeader
        fileName={fileName}
        projectName={projectName}
        partName={partName}
        operationName={operationName}
        mode={inspectorMode}
        onModeChange={(newMode) => {
          if (isOperatorView) return;
          if (newMode === 'MEASURE' && planStatus !== 'confirmed') {
            message.warning('Please confirm the inspection plan before proceeding to measurement.');
            return;
          }
          setInspectorMode(newMode);
        }}
        planStatus={planStatus}
        confirmedByUsername={confirmedByUsername}
        onConfirmPlan={isOperatorView ? undefined : handleConfirmPlan}
        confirmPlanDisabled={!bocRowsRaw.length || !salesOrderId || !partNumber}
        measureOnly={isOperatorView}
        hideTopActions={true}
        showApproveFtp={!isOperatorView && !ftpApproved && quantityNo === 1}
        onApproveFtp={handleApproveFtpDirect}
        approveFtpDisabled={
          !bocTableData.length ||
          !bocTableData.every((r) => {
            const measurements = r.measurements || [];
            return measurements.some(m => {
              const val = String(m ?? "").trim();
              return val !== "" && val !== "—" && val !== "-";
            });
          })
        }
      />

      {/* Plain divs — Ant Sider's internal wrapper breaks flex height chains */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'row', overflow: 'hidden' }}>
        {/* PDF viewer — full width; toolbar floats over canvas */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <InspectorSidebar
            activeTool={activeTool}
            onToolChange={handleToolChange}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onRotate={handleRotate}
            onResetView={handleResetView}
            onAutoBalloon={handleAutoBalloon}
            onClearAll={handleClearAll}
            clearAllDisabled={!bocRowsRaw.length}
            planEditLocked={bocEditLocked}
            operatorRestricted={isOperatorView}
          />
          {!fileUrl && (
            <Alert type="error" message="No drawing URL. Open this page from Quality Management → Create Plan." showIcon />
          )}
          {!canDetect && activeTool === 'select' && fileUrl && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message="Part-level PDF required for auto-detection"
              description="Use Stamp to add a characteristic manually, or link a part document for Select mode."
            />
          )}
          {fileUrl && (
            <div ref={viewerWrapRef} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <InteractiveDrawing
                ref={drawingRef}
                pdfId={canDetect ? Number(documentId) : null}
                directImageSrc={!fileIsPdf ? fileUrl : null}
                pageNumber={1} // TODO: Add page state if needed
                balloons={interactiveBalloons}
                activeBalloonId={lastClickedRowId ? String(lastClickedRowId) : null}
                selectedBalloonIds={selectedRowIds.map(String)}
                onBalloonClick={(b) => {
                  setLastClickedRowId(Number(b.id));
                  drawingRef.current?.zoomToSelection(b.id);
                }}
                onRegionSelect={handleRegionSelect}
                activeTool={activeTool}
                notes={notes}
                activeNoteId={selectedNoteId}
                isLoading={saving}
                processingTip={activeTool === 'notes' ? 'Extracting notes…' : 'Detecting…'}
                balloonColor="blue"
                sidebarOffset={0}
                rotation={pdfRotation}
              />
            </div>
          )}
        </div>

        {/* Right panel — characteristics table */}
        <div
          style={{
            width: '42%',
            minWidth: 320,
            minHeight: 0,
            background: '#fff',
            borderLeft: '1px solid #f0f0f0',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            padding: '12px 12px 0',
            fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace',
          }}
        >
          {inspectorMode === 'MEASURE' && (
            <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Space wrap>
                <Tag 
                  color={ftpApproved ? 'success' : ftpStatus === 'pending' ? 'processing' : 'default'}
                  style={{ minWidth: 100, textAlign: 'center' }}
                >
                  FTP: {ftpStatus ? ftpStatus.toUpperCase() : 'NOT REQUESTED'}
                  {ftpApproved ? ` (by ${ftpApprovedByUsername || confirmedByUsername || 'Supervisor'})` : ''}
                </Tag>
                {quantityNo > 1 && !ftpApproved ? (
                  <Tag color="warning">Quantity {quantityNo} locked until FTP approval</Tag>
                ) : null}
              </Space>
              {isOperatorView && (
                <Button
                  size="small"
                  type="primary"
                  disabled={quantityNo !== 1 || ftpApproved || !firstQtyAllDone}
                  onClick={() => void handleRequestFtpApproval()}
                >
                  Submit Request for FTP
                </Button>
              )}
            </div>
          )}
          <style>{`
            .qms-inspector-tabs {
              flex: 1;
              min-height: 0;
              display: flex;
              flex-direction: column;
            }
            .qms-inspector-tabs > .ant-tabs-nav {
              flex-shrink: 0;
            }
            .qms-inspector-tabs > .ant-tabs-content-holder {
              flex: 1;
              min-height: 0;
              display: flex;
              flex-direction: column;
            }
            .qms-inspector-tabs .ant-tabs-content {
              flex: 1;
              min-height: 0;
              height: 100%;
            }
            .qms-inspector-tabs .ant-tabs-tabpane-active {
              height: 100%;
              display: flex !important;
              flex-direction: column;
            }
          `}</style>
          <Tabs
            className="qms-inspector-tabs"
            activeKey={activeTab}
            onChange={(key) => {
              setActiveTab(key);
              if (key === 'notes') void loadNotes();
            }}
            destroyInactiveTabPane={false}
            style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
            items={[
              {
                key: 'characteristics',
                label: 'Characteristics',
                children: (
                  <InspectorBOCTable
                    selectedIds={selectedRowIds}
                    onSelectedIdsChange={handleSelectedIdsChange}
                    onDeleteSelected={handleDeleteSelectedRows}
                    dataSource={bocTableData}
                    totalCount={bocRowsRaw.length}
                    optionSource={bocRowsRaw}
                    filterDimTypes={filterDimTypes}
                    filterZones={filterZones}
                    onFilterDimTypesChange={setFilterDimTypes}
                    onFilterZonesChange={setFilterZones}
                    measureMode={inspectorMode === 'MEASURE'}
                    operatorMeasureMode={isOperatorView && inspectorMode === 'MEASURE'}
                    onMeasurePatch={handleMeasurePatch}
                    onSetInstrument={isOperatorView ? undefined : handleSetInstrument}
                    onSetUsedInstrument={isOperatorView ? handleSetUsedInstrument : undefined}
                    quantityOptions={quantityOptions}
                    quantityNo={quantityNo}
                    onQuantityChange={(newQty) => {
                      if (newQty > 1 && !canNavigateToOthers) {
                        message.warning('Please obtain FTP approval and complete quantity 1 measurements before proceeding to other quantities.');
                        return;
                      }
                      setQuantityNo(newQty);
                    }}
                    quantityLocked={!canNavigateToOthers}
                    planEditLocked={bocEditLocked}
                  />
                ),
              },
              {
                key: 'notes',
                label: 'Notes',
                children: (
                  <InspectorNotesTable
                    notes={notes}
                    loading={notesLoading}
                    readOnly={isOperatorView}
                    selectedNoteId={selectedNoteId}
                    onNoteSelect={(id) => {
                      setSelectedNoteId(id);
                      drawingRef.current?.zoomToSelection(id);
                    }}
                    onAddNote={async (noteText) => {
                      const pid = partId ? Number(partId) : null;
                      if (!pid || !documentId) return;
                      await axios.post(`${QUALITY_API_BASE_URL}/quality/notes`, {
                        part_id: pid,
                        document_id: Number(documentId),
                        ...noteScopeParams,
                        x: 0,
                        y: 0,
                        width: 1,
                        height: 1,
                        page: 1,
                        note_text: noteText,
                      });
                      await loadNotes();
                    }}
                    onUpdateNote={async (noteId, noteText) => {
                      await axios.put(`${QUALITY_API_BASE_URL}/quality/notes/${noteId}`, { note_text: noteText });
                      await loadNotes();
                    }}
                    onDeleteNote={isOperatorView ? undefined : async (noteId) => {
                      await axios.delete(`${QUALITY_API_BASE_URL}/quality/notes/${noteId}`);
                      await loadNotes();
                    }}
                    onDeleteAll={isOperatorView ? undefined : async () => {
                      const pid = partId ? Number(partId) : null;
                      const docId = documentId ? Number(documentId) : null;
                      if (!pid || !docId) return;
                      await axios.delete(`${QUALITY_API_BASE_URL}/quality/notes/part/${pid}`, {
                        params: {
                          document_id: docId,
                          ...noteScopeParams,
                        },
                      });
                      await loadNotes();
                    }}
                  />
                ),
              },
            ]}
          />
        </div>
      </div>

      <StampCharacteristicModal
        open={stampModalOpen}
        onCancel={() => {
          setStampModalOpen(false);
          setPendingStampRegion(null);
        }}
        onOk={handleStampModalOk}
        confirmLoading={stampSaving}
        defaultInstrument={DEFAULT_MEASURED_INSTRUMENT}
      />
    </div>
  );
};

export default QMSInspector;
