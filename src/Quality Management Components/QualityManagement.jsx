import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Layout, Button, Modal, Table, Spin, Drawer, message, Select, Alert, Tooltip, Tabs, Input, Card, Tag, Typography, Empty, Space } from 'antd';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { MenuOutlined, AppstoreOutlined, ShoppingCartOutlined, ClusterOutlined, ToolOutlined, InfoCircleOutlined, EyeOutlined, BuildOutlined, CheckCircleOutlined, CloudDownloadOutlined, EditOutlined, FilePdfOutlined, LeftOutlined, RightOutlined } from "@ant-design/icons";
import QualityManagementBOM from './QualityManagementBOM';
import axios from 'axios';
import { QUALITY_API_BASE_URL } from '../Config/qualityconfig';
import InteractiveDrawing from './InspectorComponents/InteractiveDrawing';
import { parseMasterBocBboxToPdfRect } from './InspectorComponents/bocMappers';
import { resolveBaseDrawingDocument } from './InspectorComponents/drawingDocumentUtils';
import InspectionReportModal from './InspectionReport/InspectionReportModal';
import { downloadInspectionReportWord } from './InspectionReport/downloadInspectionReportWord';


const { Sider, Content } = Layout;
const { Text, Title } = Typography;

/** PDF iframes in preview/review: hide toolbar and left thumbnail/outline pane (Adobe-style open params). */
function pdfEmbedSrcForReview(url) {
  if (!url) return '';
  const base = url.split('#')[0];
  return `${base}#toolbar=0&navpanes=0&pagemode=none`;
}

const NOMINAL_MATCH_EPS = 0.005;

/** within = GO, out = NO GO, pending = awaiting readings */
function computeInspectionStatus(nominal, upper, lower, mean) {
  if (mean == null || nominal == null) return 'pending';
  const hasTolerance = Math.abs(upper || 0) > 1e-12 || Math.abs(lower || 0) > 1e-12;
  if (hasTolerance) {
    const hi = nominal + (upper || 0);
    const lo = nominal + (lower || 0);
    return mean <= hi && mean >= lo ? 'within' : 'out';
  }
  return Math.abs(mean - nominal) < NOMINAL_MATCH_EPS ? 'within' : 'out';
}

function inspectionMeasureRowClass(status) {
  if (status === 'within') return 'qm-measure-row-go';
  if (status === 'out') return 'qm-measure-row-nogo';
  return '';
}

function renderInspectionGoNoGoTag(status) {
  if (status === 'within') {
    return (
      <Tag style={{
        margin: 0,
        borderRadius: 6,
        fontWeight: 700,
        fontSize: 11,
        letterSpacing: '0.06em',
        border: '1px solid #86efac',
        background: '#ecfdf5',
        color: '#047857',
        minWidth: 58,
        textAlign: 'center',
      }}
      >
        GO
      </Tag>
    );
  }
  if (status === 'out') {
    return (
      <Tag style={{
        margin: 0,
        borderRadius: 6,
        fontWeight: 700,
        fontSize: 11,
        letterSpacing: '0.06em',
        border: '1px solid #fca5a5',
        background: '#fef2f2',
        color: '#b91c1c',
        minWidth: 58,
        textAlign: 'center',
      }}
      >
        NO GO
      </Tag>
    );
  }
  return (
    <Tag style={{
      margin: 0,
      borderRadius: 6,
      fontWeight: 600,
      fontSize: 11,
      border: '1px solid #e2e8f0',
      background: '#f8fafc',
      color: '#64748b',
      minWidth: 58,
      textAlign: 'center',
    }}
    >
      Pending
    </Tag>
  );
}

function renderInspectionActualCell(record, display) {
  const mono = { fontFamily: '"JetBrains Mono", "Consolas", monospace', fontSize: 12 };
  if (record._status === 'within') return <Text strong style={{ ...mono, color: '#047857' }}>{display}</Text>;
  if (record._status === 'out') return <Text strong style={{ ...mono, color: '#b91c1c' }}>{display}</Text>;
  return <Text style={{ ...mono, color: '#64748b' }}>{display}</Text>;
}

function renderInspectionSummaryBar(summary) {
  return (
    <div style={{
      padding: '10px 14px',
      borderBottom: '1px solid #e2e8f0',
      background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      flexWrap: 'wrap',
    }}
    >
      <Tag style={{ margin: 0, borderRadius: 8, fontWeight: 600, background: '#fff', border: '1px solid #cbd5e1', color: '#334155' }}>
        Total: {summary.total}
      </Tag>
      <Tag style={{ margin: 0, borderRadius: 8, fontWeight: 700, background: '#ecfdf5', border: '1px solid #86efac', color: '#047857' }}>
        GO: {summary.go}
      </Tag>
      <Tag style={{ margin: 0, borderRadius: 8, fontWeight: 700, background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c' }}>
        NO GO: {summary.nogo}
      </Tag>
      <Tag style={{ margin: 0, borderRadius: 8, fontWeight: 600, background: '#fff', border: '1px solid #cbd5e1', color: '#64748b' }}>
        Pending: {summary.pending}
      </Tag>
      <Tag style={{ margin: 0, borderRadius: 8, fontWeight: 700, background: '#eff6ff', border: '1px solid #93c5fd', color: '#1d4ed8' }}>
        Pass Rate: {summary.passRate}%
      </Tag>
    </div>
  );
}

const QM_MEASURE_TABLE_ROW_STYLES = `
  .qm-measure-data-table .qm-measure-row-go > td {
    background-color: #f0fdf4 !important;
  }
  .qm-measure-data-table .qm-measure-row-nogo > td {
    background-color: #fef2f2 !important;
  }
  .qm-measure-data-table .ant-table-thead > tr > th {
    background: #f1f5f9 !important;
    font-weight: 700 !important;
    font-size: 11px !important;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: #475569 !important;
  }
  .qm-measure-data-table .ant-table-tbody > tr > td {
    font-size: 12px;
  }
`;

const QM_PLAN_VIEW_TABLE_STYLES = `
  .qm-plan-view-table .ant-table-thead > tr > th {
    padding: 7px 10px !important;
    font-size: 13px !important;
    font-weight: 600 !important;
    background: #f8fafc !important;
    color: #475569 !important;
  }
  .qm-plan-view-table .ant-table-tbody > tr > td {
    padding: 6px 10px !important;
    font-size: 14px !important;
  }
  .qm-plan-view-table .ant-table {
    font-size: 14px;
  }
  .qm-plan-view-table .ant-tag {
    font-size: 13px;
    line-height: 22px;
    padding: 0 8px;
    margin: 0;
  }
  .qm-plan-view-table .plan-row-even > td {
    background: #fff !important;
  }
  .qm-plan-view-table .plan-row-odd > td {
    background: #fafbfc !important;
  }
  .qm-plan-view-boc-body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    padding: 0 6px 6px;
    display: flex;
    flex-direction: column;
  }
  .qm-plan-view-boc-body .ant-spin-nested-loading,
  .qm-plan-view-boc-body .ant-spin-container {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .qm-plan-view-boc-body .qm-plan-view-table {
    flex: 1;
    min-height: 0;
  }
`;

const QualityManagement = ({ initialProductId, initialOrderId, fromOms }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const orderIdFromQuery = searchParams.get('orderId');
  const productIdFromQuery = searchParams.get('productId');
  const qmsInspectorBase = location.pathname.startsWith('/supervisor')
    ? '/supervisor/qms-inspector'
    : '/admin/qms-inspector';
  const isSupervisorView = location.pathname.startsWith('/supervisor');
  const effectiveOrderId =
    initialOrderId && String(initialOrderId) !== 'null' && String(initialOrderId) !== ''
      ? initialOrderId
      : orderIdFromQuery || undefined;
  const effectiveProductId =
    initialProductId != null &&
    String(initialProductId) !== '' &&
    String(initialProductId) !== 'null'
      ? initialProductId
      : productIdFromQuery && String(productIdFromQuery) !== 'null'
        ? Number(productIdFromQuery)
        : null;
  const [selectedItem, setSelectedItem] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [productHierarchies, setProductHierarchies] = useState({});
  const [operations, setOperations] = useState([]);
  const [partDocuments, setPartDocuments] = useState([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
   const [previewUrl, setPreviewUrl] = useState(null);
  const [previewIsPdf, setPreviewIsPdf] = useState(false);
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [orderStatus, setOrderStatus] = useState(() => (effectiveOrderId ? 'checking' : 'active'));
  const [isCheckingStatus, setIsCheckingStatus] = useState(() => !!effectiveOrderId);
  /** op_no (int) -> 'draft' | 'confirmed' from quality.inspection_plan_status */
  const [inspectionPlanByOp, setInspectionPlanByOp] = useState({});
  /** op_no -> username who confirmed (when status is confirmed) */
  const [inspectionPlanConfirmedByOp, setInspectionPlanConfirmedByOp] = useState({});
  /** op_no -> ftp_status row status (pending/approved/rejected/null) */
  const [ftpStatusByOp, setFtpStatusByOp] = useState({});
  const [planViewOpen, setPlanViewOpen] = useState(false);
  const [planViewLoading, setPlanViewLoading] = useState(false);
  const [planDrawingUrl, setPlanDrawingUrl] = useState(null);
  const [planDrawingIsPdf, setPlanDrawingIsPdf] = useState(true);
  const [planDrawingFileName, setPlanDrawingFileName] = useState(null);
  const [planTableRows, setPlanTableRows] = useState([]);
  const [planViewTitle, setPlanViewTitle] = useState('');
  const [planViewMeta, setPlanViewMeta] = useState(null);
  /** Confirmed plan with no stage measurements yet — show Edit to open QMS Inspector for BOC changes. */
  const [planViewCanEditBoc, setPlanViewCanEditBoc] = useState(false);
  const [planViewOperationRecord, setPlanViewOperationRecord] = useState(null);
  const [planBalloonDocumentId, setPlanBalloonDocumentId] = useState(null);
  const [activeBalloonId, setActiveBalloonId] = useState(null);
  const planBocBodyRef = useRef(null);
  const [planBocTableScrollY, setPlanBocTableScrollY] = useState(undefined);
  const [measureModalOpen, setMeasureModalOpen] = useState(false);
  const [measureModalLoading, setMeasureModalLoading] = useState(false);
  const [measureRows, setMeasureRows] = useState([]);
  const [measureQtyOptions, setMeasureQtyOptions] = useState([{ value: 1, label: 'Qty 1' }]);
  const [measureQty, setMeasureQty] = useState(1);
  const [measureQtyInput, setMeasureQtyInput] = useState('');

  useEffect(() => {
    setMeasureQtyInput(String(measureQty));
  }, [measureQty]);

  useEffect(() => {
    if (!planViewOpen) {
      setPlanBocTableScrollY(undefined);
      return undefined;
    }
    const el = planBocBodyRef.current;
    if (!el) return undefined;
    const update = () => {
      const next = Math.max(0, Math.floor(el.clientHeight) - 40);
      setPlanBocTableScrollY((prev) => (prev === next ? prev : next));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [planViewOpen, planViewLoading, planTableRows.length]);

  const handleMeasureQtySubmit = () => {
    const val = (measureQtyInput || '').trim();
    if (!val) {
      setMeasureQtyInput(String(measureQty));
      return;
    }
    const n = parseInt(val, 10);
    const max = measureQtyOptions.length;
    if (Number.isNaN(n) || n < 1 || n > max) {
      message.warning(`Quantity ${val} does not exist (Max: ${max})`);
      setMeasureQtyInput(String(measureQty));
      return;
    }
    setMeasureQty(n);
  };
  const [measureContext, setMeasureContext] = useState(null);
  const [measureMasterRows, setMeasureMasterRows] = useState([]);
  /** FTP status for the operation shown in Measurements modal (quality.ftp_status) */
  const [measureFtpStatus, setMeasureFtpStatus] = useState(null);
  /** Bump to reload ensure + rows after supervisor approves FTP while modal is open */
  const [measureLoadNonce, setMeasureLoadNonce] = useState(0);
  const [measureQty1Complete, setMeasureQty1Complete] = useState(false);
  const [measureMaxQty, setMeasureMaxQty] = useState(1);
  /** Supervisor: preview Qty 1 measurements before confirming FTP approval */
  const [ftpApproveModalOpen, setFtpApproveModalOpen] = useState(false);
  const [ftpApproveLoading, setFtpApproveLoading] = useState(false);
  const [ftpApproveRows, setFtpApproveRows] = useState([]);
  const [ftpApproveContext, setFtpApproveContext] = useState(null);
  
  const [partInspectionModalOpen, setPartInspectionModalOpen] = useState(false);
  const [partInspectionLoading, setPartInspectionLoading] = useState(false);
  const [partInspectionSummaryByOp, setPartInspectionSummaryByOp] = useState({});

  const [reportTarget, setReportTarget] = useState(null);
  const [reportWordDownloading, setReportWordDownloading] = useState(false);
  const [reportWordDownloadingOp, setReportWordDownloadingOp] = useState(null);
  const [measurePartMode, setMeasurePartMode] = useState(false);
  const [measurePartOps, setMeasurePartOps] = useState([]);

  const handleOpenPartInspection = () => {
    if (!selectedItem || !effectiveOrderId || String(effectiveOrderId) === 'null') {
      message.warning('Please select a part and ensure an order is active.');
      return;
    }
    
    const partId = String(selectedItem.id);
    const orderId = String(effectiveOrderId);
    const partNumber = selectedItem.part_number || '';
    const partName = selectedItem.part_name || '';
    const hierarchy = productHierarchies[selectedItem.productId];
    const projectName = hierarchy?.product?.product_name || '';

    // Replicate handlePreviewPart logic to find the best part drawing
    const isDrawingPart = (d) => {
      const type = (d.document_type || "").toLowerCase();
      const name = (d.document_name || "").toLowerCase();
      const url = (d.document_url || "").toLowerCase();
      return type.includes('2d') || type.includes('drawing') || name.includes('drawing') || url.endsWith('.pdf') || url.endsWith('.png') || url.endsWith('.jpg') || url.endsWith('.jpeg');
    };

    let drawing = partDocuments.find(isDrawingPart);
    if (!drawing && partDocuments.length > 0) {
      drawing = partDocuments[0];
    }
    
    const drawingPreviewUrl = drawing?.id
      ? `${QUALITY_API_BASE_URL}/documents/${drawing.id}/preview`
      : '';
    const qs = new URLSearchParams({
      partId,
      partNumber,
      orderId,
      projectName,
      partName,
      operationName: 'Final Part Overview',
      operationNumber: '0',
      drawingUrl: drawingPreviewUrl,
      isPdf: String((drawing?.document_url || '').toLowerCase().endsWith('.pdf') || false),
      fileName: drawing?.document_name || 'Part Drawing',
      mode: 'PLAN'
    });

    if (drawing?.id) {
      qs.set('documentId', String(drawing.id));
    }
    
    navigate(`${qmsInspectorBase}?${qs.toString()}`);
  };

  const handleOpenPartReport = () => {
    const oid = effectiveOrderId && String(effectiveOrderId) !== 'null' ? Number(effectiveOrderId) : null;
    if (!oid || !selectedItem) {
      message.warning('Please select a part and ensure an order is active.');
      return;
    }
    const op0 = (operations || []).find(o => {
      const n = parseOpNo(o);
      return n === 0 || (typeof o.operation_name === 'string' && o.operation_name.toLowerCase().includes('final part'));
    }) || { id: 0, operation_number: '0', operation_name: 'Final Part Overview' };

    handleGenerateReport(op0, true);
  };

  const handleOpenPartMeasurement = async () => {
    const oid = effectiveOrderId && String(effectiveOrderId) !== 'null' ? Number(effectiveOrderId) : null;
    if (!oid || !selectedItem) {
      message.warning('Please select a part and ensure an order is active.');
      return;
    }
    // Search for Final Part Overview (usually op_no 0)
    // Search for Final Part Overview (usually op_no 0) or fallback to mock
    const op0 = (operations || []).find(o => {
      const n = parseOpNo(o);
      return n === 0 || (typeof o.operation_name === 'string' && o.operation_name.toLowerCase().includes('final part'));
    }) || { id: 0, operation_number: '0', operation_name: 'Final Part Overview' };

    const opNo = parseOpNo(op0);
    if (isSupervisorView && inspectionPlanByOp[opNo] !== 'confirmed') {
      message.warning('Please confirm the inspection plan for this operation before viewing measurements.');
      return;
    }

    setMeasurePartMode(false); // Show as a single operation view, not consolidated
    setMeasureContext({
      opId: op0.id,
      opNo: parseOpNo(op0),
      opName: op0.operation_name || 'Final Part Overview',
      partId: selectedItem.id,
      partNo: selectedItem.part_number,
      orderId: oid,
    });
    setMeasureQty(1);
    setMeasureModalOpen(true);
    setMeasureRows([]);
    setMeasureModalLoading(true);
  };

  const handleGenerateReport = (record) => {
    const opNo = parseOpNo(record);
    if (isSupervisorView && inspectionPlanByOp[opNo] !== 'confirmed') {
      message.warning('Please confirm the inspection plan before generating a report.');
      return;
    }
    const oid = Number(effectiveOrderId);
    if (!selectedItem?.id || !oid || !selectedItem.part_number) {
      message.warning('Part and order are required to open the report.');
      return;
    }
    setReportTarget({
      partPk: selectedItem.id,
      partNumber: selectedItem.part_number,
      partName: selectedItem.part_name || '',
      orderId: oid,
      opNo,
    });
  };

  const handleDownloadReport = async (record) => {
    const opNo = parseOpNo(record);
    if (isSupervisorView && inspectionPlanByOp[opNo] !== 'confirmed') {
      message.warning('Please confirm the inspection plan before downloading the report.');
      return;
    }
    const oid = Number(effectiveOrderId);
    if (!selectedItem?.id || !oid || !selectedItem.part_number) {
      message.warning('Part and order are required to download the report.');
      return;
    }
    try {
      setReportWordDownloading(true);
      setReportWordDownloadingOp(opNo);
      await downloadInspectionReportWord({
        partNumber: selectedItem.part_number,
        orderId: oid,
        opNo,
      });
      message.success('Word report downloaded successfully.');
    } catch (err) {
      console.error(err);
      message.error(err.message || 'Word download failed.');
    } finally {
      setReportWordDownloading(false);
      setReportWordDownloadingOp(null);
    }
  };

  useEffect(() => {
    const oid = effectiveOrderId;
    if (oid && String(oid) !== 'null') {
      const checkOrderStatus = async () => {
        setIsCheckingStatus(true);
        try {
          const res = await axios.get(`${QUALITY_API_BASE_URL}/scheduling/order-status/${oid}`);
          setOrderStatus(res.data.order_status);
        } catch (error) {
          console.error("Error checking order status:", error);
          setOrderStatus('error');
        } finally {
          setIsCheckingStatus(false);
        }
      };
      checkOrderStatus();
    } else {
      setOrderStatus('active'); // No order ID means general access or handled by PDM
      setIsCheckingStatus(false);
    }
  }, [effectiveOrderId]);

  useEffect(() => {
    if (selectedItem && selectedItem.itemType === 'part') {
      fetchDetails(selectedItem);
    } else {
      setOperations([]);
      setPartDocuments([]);
      setInspectionPlanByOp({});
      setInspectionPlanConfirmedByOp({});
      setFtpStatusByOp({});
      setPreviewUrl(null);
      setPreviewModalVisible(false);
    }
  }, [selectedItem, effectiveOrderId]);

  const parseOpNo = (record) => {
    const n = Number(String(record?.operation_number ?? '').trim());
    return Number.isFinite(n) ? n : 10;
  };

  const buildFtpIpid = (partNo, opNo) => {
    const pn = (partNo || 'PART').toString().trim().replace(/[^A-Za-z0-9_-]+/g, '_');
    const op = Number.isFinite(Number(opNo)) ? Number(opNo) : 'NA';
    return `FTP_${pn}_OP_${op}`;
  };

  const fetchDetails = async (item) => {
    const partId = item.id;
    setLoadingDetails(true);
    try {
      const [opsRes, docsRes] = await Promise.all([
        axios.get(`${QUALITY_API_BASE_URL}/operations/part/${partId}`),
        axios.get(`${QUALITY_API_BASE_URL}/documents/part/${partId}`)
      ]);
      const ops = opsRes.data || [];
      const docs = docsRes.data || [];

      let productionSummaryByOpId = {};
      try {
        const summaryRes = await axios.get(
          `${QUALITY_API_BASE_URL}/quality/operation-production-summary`,
          { params: { part_id: partId } },
        );
        productionSummaryByOpId = Object.fromEntries(
          (Array.isArray(summaryRes.data) ? summaryRes.data : []).map((row) => [
            row.operation_id,
            row,
          ]),
        );
      } catch (summaryErr) {
        console.warn('Operation production summary unavailable:', summaryErr);
      }

      const enrichedOps = ops.map((op) => {
        const summary = productionSummaryByOpId[op.id];
        if (!summary) {
          const partQty = Number(item.qty);
          if (Number.isFinite(partQty) && partQty > 0) {
            return { ...op, required_quantity: partQty };
          }
          return op;
        }
        return {
          ...op,
          required_quantity: summary.required_quantity,
          completed_quantity: summary.completed_quantity,
          accepted_quantity: summary.accepted_quantity,
          rejected_quantity: summary.rejected_quantity,
          yield_percentage: summary.yield_percentage,
        };
      });

      setOperations(enrichedOps);
      setPartDocuments(docs);

      const oid = effectiveOrderId && String(effectiveOrderId) !== 'null' ? Number(effectiveOrderId) : null;
      const pn = item.part_number;
      if (oid && !Number.isNaN(oid) && pn) {
        try {
          const ps = await axios.get(`${QUALITY_API_BASE_URL}/quality/inspection-plan-status`, {
            params: { part_number: pn, sales_order_id: oid },
          });
          const map = {};
          const byMap = {};
          (Array.isArray(ps.data) ? ps.data : []).forEach((r) => {
            if (r && r.op_no != null) {
              map[r.op_no] = r.status;
              byMap[r.op_no] = r.confirmed_by_username || null;
            }
          });
          setInspectionPlanByOp(map);
          setInspectionPlanConfirmedByOp(byMap);
        } catch {
          setInspectionPlanByOp({});
          setInspectionPlanConfirmedByOp({});
        }
        try {
          const ftpPairs = await Promise.all(
            ops.map(async (op) => {
              const opNo = parseOpNo(op);
              const ipid = buildFtpIpid(pn, opNo);
              try {
                const r = await axios.get(`${QUALITY_API_BASE_URL}/quality/ftp-status`, {
                  params: { order_id: oid, ipid, op_no: opNo },
                });
                return [opNo, r.data?.status || null];
              } catch {
                return [opNo, null];
              }
            }),
          );
          setFtpStatusByOp(Object.fromEntries(ftpPairs));
        } catch {
          setFtpStatusByOp({});
        }
      } else {
        setInspectionPlanByOp({});
        setInspectionPlanConfirmedByOp({});
        setFtpStatusByOp({});
      }
      
      // Auto-set the first part 2D drawing as default preview
      const partDrawing = docs.find(d => d.document_type?.toLowerCase().includes('2d'));
      if (partDrawing?.id) {
        setPreviewUrl(`${QUALITY_API_BASE_URL}/documents/${partDrawing.id}/preview`);
        setPreviewIsPdf((partDrawing.document_url || '').toLowerCase().endsWith('.pdf'));
      }
    } catch (error) {
      console.error("Error fetching details:", error);
    } finally {
      setLoadingDetails(false);
    }
  };

  const getDrawingInfo = (op) =>
    resolveBaseDrawingDocument(op.operation_documents || [], partDocuments);

  const handlePreviewOperation = (op) => {
    setPreviewTitle(`Operation ${op.operation_number}: ${op.operation_name}`);
    const { url, isPdf } = getDrawingInfo(op);
    setPreviewUrl(url);
    setPreviewIsPdf(isPdf);
    setPreviewModalVisible(true);
  };

  const closePlanViewModal = () => {
    setPlanViewOpen(false);
    setPlanViewCanEditBoc(false);
    setPlanViewOperationRecord(null);
    setPlanBalloonDocumentId(null);
  };

  const openConfirmedPlanModal = async (record, opNo) => {
    const oid = effectiveOrderId && String(effectiveOrderId) !== 'null' ? Number(effectiveOrderId) : null;
    const partNo = selectedItem?.part_number;
    const partPk = selectedItem?.id;
    if (!oid || !partNo) {
      message.error('Order and part are required to view the confirmed plan.');
      return;
    }
    setPlanViewTitle(`Operation ${record.operation_number}: ${record.operation_name}`);
    setPlanViewMeta({
      opNo: record.operation_number,
      opName: record.operation_name,
      partNo: selectedItem?.part_number || '',
      orderNo: effectiveOrderId ? String(effectiveOrderId) : '',
      operationId: record.id,
    });
    setPlanViewOperationRecord(record);
    setPlanViewCanEditBoc(false);
    setPlanBalloonDocumentId(null);
    setPlanViewOpen(true);
    setPlanViewLoading(true);
    setPlanDrawingFileName(null);
    setPlanDrawingIsPdf(true);
    try {
      const [docsRes, bocRes] = await Promise.all([
        axios.get(`${QUALITY_API_BASE_URL}/operation-documents/operation/${record.id}`),
        axios.get(`${QUALITY_API_BASE_URL}/quality/master-boc`, {
          params: { part_id: partNo, sales_order_id: oid, op_no: opNo },
        }),
      ]);
      const docs = Array.isArray(docsRes.data) ? docsRes.data : [];
      const { url, isPdf, name, apiDocumentId } = getDrawingInfo({ ...record, operation_documents: docs });

      setPlanDrawingIsPdf(isPdf);
      setPlanDrawingFileName(name || null);
      setPlanDrawingUrl(url);
      setPlanBalloonDocumentId(apiDocumentId);
      setPlanTableRows(Array.isArray(bocRes.data) ? bocRes.data : []);

      let canEditBoc = false;
      if (partPk) {
        try {
          const sumRes = await axios.get(`${QUALITY_API_BASE_URL}/quality/stage-inspection/measurement-summary`, {
            params: { part_id: partPk, sale_order_id: oid, op_no: opNo },
          });
          canEditBoc = !sumRes.data?.any_recorded;
        } catch {
          canEditBoc = false;
        }
      }
      setPlanViewCanEditBoc(canEditBoc);
    } catch (err) {
      console.error(err);
      const detail = err.response?.data?.detail;
      message.error(typeof detail === 'string' ? detail : err.message || 'Failed to load confirmed plan');
      setPlanDrawingUrl(null);
      setPlanDrawingFileName(null);
      setPlanDrawingIsPdf(true);
      setPlanTableRows([]);
      setPlanViewCanEditBoc(false);
      setPlanBalloonDocumentId(null);
    } finally {
      setPlanViewLoading(false);
    }
  };

  const handleEditPlanFromViewModal = async () => {
    const record = planViewOperationRecord;
    if (!record || !selectedItem || !effectiveOrderId || String(effectiveOrderId) === 'null') {
      message.error('Missing context to open the inspector.');
      return;
    }
    const opNo = parseOpNo(record);
    const oid = Number(effectiveOrderId);
    try {
      await axios.put(`${QUALITY_API_BASE_URL}/quality/inspection-plan-status`, {
        part_number: selectedItem.part_number,
        sales_order_id: oid,
        op_no: opNo,
        status: 'draft',
      });
      setInspectionPlanByOp((prev) => ({ ...prev, [opNo]: 'draft' }));
      setInspectionPlanConfirmedByOp((prev) => ({ ...prev, [opNo]: null }));
    } catch (err) {
      console.error(err);
      const detail = err.response?.data?.detail;
      message.error(typeof detail === 'string' ? detail : err.message || 'Could not reopen the plan for editing');
      return;
    }

    const hierarchy = productHierarchies[selectedItem.productId];
    const projectName = hierarchy?.product?.product_name || '';
    const partName = selectedItem.part_name || '';
    const opParts = [];
    if (record.operation_number != null && record.operation_number !== '') opParts.push(String(record.operation_number));
    if (record.operation_name) opParts.push(record.operation_name);
    const opLabel = opParts.join(': ');
    const fallback = getDrawingInfo(record);
    const finalUrl = planDrawingUrl || fallback.url || '';
    const finalIsPdf = planDrawingUrl ? planDrawingIsPdf : fallback.isPdf;
    const finalName = planDrawingFileName || fallback.name || '';
    const finalDocId = planBalloonDocumentId != null ? planBalloonDocumentId : fallback.apiDocumentId;

    const qs = new URLSearchParams({
      drawingUrl: finalUrl || '',
      isPdf: String(!!finalIsPdf),
      fileName: finalName || '',
      projectName,
      partName,
      operationName: opLabel,
      partId: String(selectedItem.id),
      partNumber: selectedItem.part_number || '',
      operationNumber: String(record.operation_number ?? ''),
      operationId: String(record.id),
      orderId: String(effectiveOrderId),
    });
    if (finalDocId != null) qs.set('documentId', String(finalDocId));
    closePlanViewModal();
    navigate(`${qmsInspectorBase}?${qs.toString()}`);
  };

  const handleDownloadPlanDrawing = () => {
    if (!planDrawingUrl) return;
    const id = planDrawingUrl.match(/operation-documents\/(\d+)\//)?.[1];
    if (!id) return;
    const a = document.createElement('a');
    a.href = `${QUALITY_API_BASE_URL}/operation-documents/${id}/download`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.download = planDrawingFileName || `operation_${planViewMeta?.opNo || 'plan'}_balloon.pdf`;
    a.click();
  };

  /** Empty string must not become 0 — `Number('') === 0` in JavaScript. */
  const parseNum = (value) => {
    if (value == null) return null;
    const s = String(value).replace(',', '.').trim();
    if (s === '' || s === '—' || s === '-') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  /** At least one of #1–#3 has a numeric reading (empty strings do not count). */
  const rowHasMeasured123 = (r) => {
    return (r.measurements || []).some(m => parseNum(m) != null);
  };

  /** Prefer mean from #1–#3 only; if all empty, no mean (avoids bogus 0 from stored measured_mean). */
  const computeMeanFromMeasurements = (r) => {
    const vals = (r.measurements || []).map(m => parseNum(m)).filter(v => v != null);
    if (!vals.length) return null;
    const m = vals.reduce((x, y) => x + y, 0) / vals.length;
    return Number.isFinite(m) ? m : null;
  };

  const decorateInspectionRow = (row) => {
    const nominal = parseNum(row.nominal_value);
    const upper = parseNum(row.uppertol);
    const lower = parseNum(row.lowertol);
    const mean = computeMeanFromMeasurements(row);
    const upperLimit = nominal != null && upper != null ? nominal + upper : null;
    const lowerLimit = nominal != null && lower != null ? nominal + lower : null;
    const status = computeInspectionStatus(nominal, upper, lower, mean);
    return { ...row, _upperLimit: upperLimit, _lowerLimit: lowerLimit, _computedMean: mean, _status: status };
  };

  const fmt2 = (value) => {
    const n = parseNum(value);
    return n == null ? '—' : n.toFixed(2);
  };

  const measureDecoratedRows = useMemo(() => {
    // 1. If we have master rows, use them as the structural base (standard single-qty view)
    if (measureMasterRows && measureMasterRows.length > 0 && !measurePartMode) {
      return measureMasterRows.map(m => {
        // Find matching measurement row by checking the bbox master_boc_id
        const r = (measureRows || []).find(sr => {
          try {
             const bbox = typeof sr.bbox === 'string' ? JSON.parse(sr.bbox) : sr.bbox;
             return bbox?.master_boc_id === m.id;
          } catch(e) { return false; }
        });
        
        // Use measurement row if found, else build a shell from master characteristic
        const row = r ? { ...r } : { 
          ...m, 
          nominal_value: m.nominal, 
          uppertol: m.uppertol, 
          lowertol: m.lowertol,
          measurements: [],
          zone: m.zone,
          dimension_type: m.dimension_type,
          id: `missing-${m.id}` // Temporary ID for Table rowKey
        };

        return decorateInspectionRow(row);
      });
    }

    // 2. Fallback to mapping measureRows directly (Consolidated or Part Overview)
    return (measureRows || []).map((r) => decorateInspectionRow(r));
  }, [measureRows, measureMasterRows, measurePartMode, measureQty]);

  /** Every displayed row has no #1–#3 readings — show a single empty state instead of the table. */
  const measureAllReadingsEmpty = useMemo(() => {
    if (!measureDecoratedRows?.length) return false;
    return measureDecoratedRows.every((r) => !rowHasMeasured123(r));
  }, [measureDecoratedRows]);

  const measureSummary = useMemo(() => {
    const total = measureDecoratedRows.length;
    const go = measureDecoratedRows.filter((r) => r._status === 'within').length;
    const nogo = measureDecoratedRows.filter((r) => r._status === 'out').length;
    const pending = measureDecoratedRows.filter((r) => r._status === 'pending').length;
    const passRate = total ? ((go / total) * 100).toFixed(1) : '0.0';
    return { total, go, nogo, pending, passRate };
  }, [measureDecoratedRows]);

  const ftpApproveDecoratedRows = useMemo(() => {
    return (ftpApproveRows || []).map((r) => decorateInspectionRow(r));
  }, [ftpApproveRows]);

  const ftpApproveAllReadingsEmpty = useMemo(() => {
    if (!ftpApproveRows?.length) return false;
    return ftpApproveRows.every((r) => !rowHasMeasured123(r));
  }, [ftpApproveRows]);

  const ftpApproveMeasurementsDone = useMemo(() => {
    if (!ftpApproveRows?.length) return false;
    return ftpApproveRows.every((r) => {
      const vals = (r.measurements || []).map(m => parseNum(m)).filter(v => v != null);
      return vals.length >= 3;
      // Relaxed from >= 3 to >= 1 to allow FTP approval even if fewer samples are entered
      return vals.length >= 1;
    });
  }, [ftpApproveRows]);

  const ftpApproveSummary = useMemo(() => {
    const total = ftpApproveDecoratedRows.length;
    const go = ftpApproveDecoratedRows.filter((r) => r._status === 'within').length;
    const nogo = ftpApproveDecoratedRows.filter((r) => r._status === 'out').length;
    const pending = ftpApproveDecoratedRows.filter((r) => r._status === 'pending').length;
    const passRate = total ? ((go / total) * 100).toFixed(1) : '0.0';
    return { total, go, nogo, pending, passRate };
  }, [ftpApproveDecoratedRows]);

  const interactiveBalloons = useMemo(() => {
    return (ftpApproveRows || []).map((r, idx) => {
      const rect = parseMasterBocBboxToPdfRect(r.bbox);
      return {
        id: String(r.id),
        label: String(idx + 1),
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        page: rect.page || 1,
      };
    });
  }, [ftpApproveRows]);

  const planInteractiveBalloons = useMemo(() => {
    return (planTableRows || []).map((r, idx) => {
      const rect = parseMasterBocBboxToPdfRect(r.bbox);
      return {
        id: String(r.id),
        label: String(idx + 1),
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        page: rect.page || 1,
      };
    });
  }, [planTableRows]);

  const fmtLimit = (val) => {
    const n = parseNum(val);
    return n == null ? '—' : n.toFixed(2);
  };

  const openFtpApproveModal = async (record) => {
    const oid = effectiveOrderId && String(effectiveOrderId) !== 'null' ? Number(effectiveOrderId) : null;
    if (!oid || !selectedItem?.part_number || !selectedItem?.id) {
      message.error('Order and part are required to review FTP.');
      return;
    }
    const opNo = parseOpNo(record);
    setFtpApproveContext({
      opNo,
      opId: record.id,
      opName: record?.operation_name || '',
      partNo: selectedItem.part_number,
      partId: selectedItem.id,
      orderId: oid,
    });
    setFtpApproveModalOpen(true);
    setFtpApproveRows([]);
    setFtpApproveLoading(true);

    // Prepare for drawing view
    setPlanDrawingUrl(null);
    setPlanDrawingFileName(null);
    setPlanDrawingIsPdf(true);

    const ipid = buildFtpIpid(selectedItem.part_number, opNo);
    try {
      // Ensure records exist
      try {
        await axios.post(`${QUALITY_API_BASE_URL}/quality/stage-inspection/ensure`, null, {
          params: {
            part_id: selectedItem.id,
            part_number: selectedItem.part_number,
            sale_order_id: oid,
            op_no: opNo,
            quantity_no: 1,
            ipid,
            user_id: 1,
          },
        });
      } catch (ensureErr) {
        console.warn('stage-inspection/ensure', ensureErr);
      }

      // Fetch measurements and balloon documents in parallel
      const [res, docsRes] = await Promise.all([
        axios.get(`${QUALITY_API_BASE_URL}/quality/stage-inspection`, {
          params: {
            part_id: selectedItem.id,
            sale_order_id: oid,
            op_no: opNo,
            quantity_no: 1,
          },
        }),
        axios.get(`${QUALITY_API_BASE_URL}/operation-documents/operation/${record.id}`),
      ]);

      setFtpApproveRows(Array.isArray(res.data) ? res.data : []);

      // Handle original drawing for interactive balloons
      const docs = Array.isArray(docsRes.data) ? docsRes.data : [];
      const { url, isPdf, name, apiDocumentId } = getDrawingInfo({ ...record, operation_documents: docs });

      if (url) {
        setPlanDrawingIsPdf(isPdf);
        setPlanDrawingFileName(name || null);
        setPlanDrawingUrl(url);
        setPlanBalloonDocumentId(apiDocumentId);
      } else {
        setPlanBalloonDocumentId(null);
      }
    } catch (err) {
      console.error(err);
      const detail = err.response?.data?.detail;
      message.error(typeof detail === 'string' ? detail : err.message || 'Failed to load quantity 1 measurements/drawing');
      setFtpApproveRows([]);
    } finally {
      setFtpApproveLoading(false);
    }
  };

  const runFtpApprovalApi = async (opNo, opId) => {
    const oid = effectiveOrderId && String(effectiveOrderId) !== 'null' ? Number(effectiveOrderId) : null;
    const partNo = selectedItem?.part_number;
    if (!oid || !partNo) {
      message.error('Missing order/part for FTP approval.');
      return;
    }

    let reqUsername = '';
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      reqUsername = (u.user_name || u.username || '').trim();
    } catch {
      reqUsername = 'supervisor';
    }

    await axios.put(`${QUALITY_API_BASE_URL}/quality/ftp-status`, {
      order_id: oid,
      ipid: buildFtpIpid(partNo, opNo),
      status: 'approved',
      is_completed: true,
      part_number: partNo,
      op_no: opNo,
      operation_id: opId,
      approved_by_username: reqUsername || undefined,
    });
    setFtpStatusByOp((prev) => ({ ...prev, [opNo]: 'approved' }));
    message.success(`FTP approved for operation ${opNo}.`);
    if (measureModalOpen && measureContext?.opNo === opNo) {
      setMeasureFtpStatus('approved');
      setMeasureLoadNonce((n) => n + 1);
    }
  };

  const confirmAndApproveFtp = () => {
    const opNo = ftpApproveContext?.opNo;
    if (opNo == null) return;
    Modal.confirm({
      title: 'Confirm FTP approval',
      content:
        'You are approving first-time pass (FTP) for this operation based on quantity 1 measurements. Operators will be allowed to record quantity 2 and above. This action should match your shop-floor sign-off.',
      okText: 'Yes, approve FTP',
      cancelText: 'Back',
      okButtonProps: { type: 'primary' },
      onOk: async () => {
        try {
          await runFtpApprovalApi(opNo, ftpApproveContext?.opId);
          setFtpApproveModalOpen(false);
          setFtpApproveContext(null);
          setFtpApproveRows([]);
          setPlanDrawingUrl(null);
          setPlanDrawingFileName(null);
        } catch (err) {
          console.error(err);
          const detail = err.response?.data?.detail;
          message.error(typeof detail === 'string' ? detail : err.message || 'Failed to approve FTP');
          throw err;
        }
      },
    });
  };

  const openMeasurementsModal = async (record) => {
    const oid = effectiveOrderId && String(effectiveOrderId) !== 'null' ? Number(effectiveOrderId) : null;
    if (!oid) {
      message.error('Order is required to view measurements.');
      return;
    }
    const opNo = parseOpNo(record);
    if (isSupervisorView && inspectionPlanByOp[opNo] !== 'confirmed') {
      message.warning('Please confirm the inspection plan for this operation before viewing measurements.');
      return;
    }

    setMeasureContext({
      opNo,
      opName: record?.operation_name || '',
      opId: record?.id,
      partId: selectedItem?.id,
      partNo: selectedItem?.part_number || '',
      orderId: oid,
    });
    setMeasureFtpStatus(ftpStatusByOp[opNo] || null);
    setMeasureModalOpen(true);
    setMeasureRows([]);
    setMeasureQty(1);
    setMeasureModalLoading(true);
    try {
      let currentQtyMax = 1;
      try {
        const p = await axios.get(`${QUALITY_API_BASE_URL}/parts/${selectedItem.id}`);
        const q = Number(p.data?.qty);
        if (Number.isFinite(q) && q >= 1) currentQtyMax = Math.min(999, Math.floor(q));
      } catch {
        currentQtyMax = 1;
      }
      setMeasureMaxQty(currentQtyMax);

      const ipid = buildFtpIpid(selectedItem.part_number, opNo);
      
      let qOpts = [];
      try {
        const [ftpRes, summaryRes] = await Promise.all([
          axios.get(`${QUALITY_API_BASE_URL}/quality/ftp-status`, { params: { order_id: oid, ipid, op_no: opNo } }),
          axios.get(`${QUALITY_API_BASE_URL}/quality/stage-inspection/measurement-summary`, { params: { part_id: selectedItem.id, sale_order_id: oid, op_no: opNo } })
        ]);
        
        const status = ftpRes.data?.status || null;
        const isQty1Complete = Boolean(summaryRes.data?.qty1_complete);
        const backendQtyMax = Number(summaryRes.data?.qty_max) || 1;
        
        setMeasureFtpStatus(status);
        setMeasureQty1Complete(isQty1Complete);
        
        const ftpApproved = status === 'approved';
        const q1Done = isQty1Complete;
        
        // Use the qty_max from the summary backend if possible, else fallback to what we already have
        const finalQtyMax = Math.max(currentQtyMax, backendQtyMax);
        
        // If FTP is approved, we should generally allow navigation as it implies Qty 1 was acceptable
        const canNavigateToOthers = ftpApproved || q1Done || isSupervisorView;
        const limit = canNavigateToOthers ? finalQtyMax : 1;
        
        qOpts = Array.from({ length: limit }, (_, i) => ({ value: i + 1, label: `Qty ${i + 1}` }));
      } catch (err) {
        console.warn('Failed to fetch FTP/Summary', err);
        setMeasureFtpStatus(null);
        setMeasureQty1Complete(false);
        qOpts = [{ value: 1, label: 'Qty 1' }];
      }
      
      setMeasureQtyOptions(qOpts);
      setMeasureQty(1);

      try {
        await axios.post(`${QUALITY_API_BASE_URL}/quality/stage-inspection/ensure`, null, {
          params: {
            part_id: selectedItem.id,
            part_number: selectedItem.part_number,
            sale_order_id: oid,
            op_no: opNo,
            quantity_no: 1,
            ipid,
            user_id: 1,
          },
        });
      } catch (ensureErr) {
        console.warn('stage-inspection/ensure', ensureErr);
      }
      const res = await axios.get(`${QUALITY_API_BASE_URL}/quality/stage-inspection`, {
        params: { part_id: selectedItem.id, sale_order_id: oid, op_no: opNo, quantity_no: 1 },
      });
      setMeasureRows(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      const detail = err.response?.data?.detail;
      message.error(typeof detail === 'string' ? detail : err.message || 'Failed to load measurements');
      setMeasureRows([]);
    } finally {
      setMeasureModalLoading(false);
    }
  };

  useEffect(() => {
    if (!measureModalOpen || !measureContext) return;
    let cancelled = false;
    (async () => {
      setMeasureModalLoading(true);
      try {
        const oid = measureContext.orderId;
        const partPk = measureContext.partId;
        const partNo = measureContext.partNo;
        const ipidPrefix = buildFtpIpid(partNo, '');

        let allRows = [];
        
        // 1. Determine which operations to fetch
        const opsToFetch = measurePartMode ? measurePartOps : [{ id: measureContext.opId, operation_number: measureContext.opNo, operation_name: measureContext.opName }];
        
        const qtysToFetch = [measureQty];

        for (const op of opsToFetch) {
          const opNo = parseOpNo(op);
          const ipid = buildFtpIpid(partNo, opNo);
          
          if (!measurePartMode && measureQty === 1) {
            try {
              await axios.post(`${QUALITY_API_BASE_URL}/quality/stage-inspection/ensure`, null, {
                params: { part_id: partPk, part_number: partNo, sale_order_id: oid, op_no: opNo, quantity_no: 1, ipid, user_id: 1 },
              });
            } catch (e) { console.warn('ensure failed', e); }
          }

          const opQtyPromises = qtysToFetch.map(q => 
            axios.get(`${QUALITY_API_BASE_URL}/quality/stage-inspection`, {
              params: { part_id: partPk, sale_order_id: oid, op_no: opNo, quantity_no: q },
            }).then(res => (Array.isArray(res.data) ? res.data : []).map(row => ({ 
              ...row, 
              _qty_no: q, 
              _op_no: opNo, 
              _op_name: op.operation_name || '' 
            })))
          );

          const opResults = await Promise.all(opQtyPromises);
          allRows.push(...opResults.flat());
        }

        const masterRes = await axios.get(`${QUALITY_API_BASE_URL}/quality/master-boc`, {
          params: { part_id: partNo, sales_order_id: oid, op_no: measurePartMode ? undefined : measureContext.opNo }
        });
        const masterRows = masterRes.data || [];
        if (!cancelled) {
          setMeasureMasterRows(masterRows);
          setMeasureRows(allRows);
        }

        if (!measurePartMode) {
          try {
            const opNo = measureContext.opNo;
            const ipid = buildFtpIpid(partNo, opNo);
            
            // Always try to ensure rows for the selected quantity
            if (typeof measureQty === 'number') {
              try {
                await axios.post(`${QUALITY_API_BASE_URL}/quality/stage-inspection/ensure`, null, {
                  params: { part_id: partPk, part_number: partNo, sale_order_id: oid, op_no: opNo, quantity_no: measureQty, ipid, user_id: 1 },
                });
              } catch (e) { console.warn('ensure failed', e); }
            }

            const fr = await axios.get(`${QUALITY_API_BASE_URL}/quality/ftp-status`, {
              params: { order_id: oid, ipid, op_no: opNo },
            });
            if (!cancelled) setMeasureFtpStatus(fr.data?.status || null);
          } catch {
            if (!cancelled) setMeasureFtpStatus(null);
          }
        }
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        message.error(err.response?.data?.detail || err.message || 'Failed to load measurements');
        setMeasureRows([]);
      } finally {
        if (!cancelled) setMeasureModalLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [measureModalOpen, measureContext, measureQty, measureLoadNonce, measurePartMode, measurePartOps, measureQtyOptions]);

  /** Ant Design Tag `color` for dimension_type — Length (blue) vs Diameter (orange) vs GDT (purple). */
  const dimensionTypeTagColor = (value) => {
    const s = String(value || '').trim();
    if (!s) return 'default';
    const u = s.toUpperCase();
    if (u.startsWith('GDT') || u.includes('GD&T')) return 'purple';
    if (u.includes('DIAMETER') || u.includes('∅') || u.includes('⌀') || /\bDIA\b/i.test(s)) return 'orange';
    if (u.includes('LENGTH') || /^length$/i.test(s)) return 'blue';
    return 'cyan';
  };
  const fmtTol = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    if (Math.abs(n) < 1e-9) return '0';
    return String(n);
  };

  const handlePreviewPart = () => {
    setPreviewTitle(`Part Drawing: ${selectedItem.part_name}`);
    
    const isDrawing = (d) => {
      const type = (d.document_type || "").toLowerCase();
      const name = (d.document_name || "").toLowerCase();
      return type.includes('2d') || type.includes('drawing') || name.includes('drawing') || name.includes('.pdf') || name.includes('.png') || name.includes('.jpg') || name.includes('.jpeg');
    };

    let drawing = partDocuments.find(isDrawing);

    // Final fallback for part drawing
    if (!drawing && partDocuments.length > 0) {
      drawing = partDocuments[0];
    }

    const previewEndpoint = drawing?.id
      ? `${QUALITY_API_BASE_URL}/documents/${drawing.id}/preview`
      : null;
    setPreviewUrl(previewEndpoint);
    setPreviewIsPdf((drawing?.document_url || '').toLowerCase().endsWith('.pdf') || false);
    setPreviewModalVisible(true);
  };

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setMobileDrawerOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleItemSelected = (item) => {
    setSelectedItem(item);
    if (isMobile) setMobileDrawerOpen(false);

    // Sync to URL so Back button restores the same selection
    const params = new URLSearchParams(window.location.search);
    if (item?.id) {
      params.set('partId', String(item.id));
      params.set('type', item.itemType || 'part');
    } else {
      params.delete('partId');
      params.delete('type');
    }
    navigate(`?${params.toString()}`, { replace: true });
  };
  const handleHierarchyLoaded = (productId, hierarchy) => {
    setProductHierarchies(prev => ({ ...prev, [productId]: hierarchy }));
  };

  // Restore selection from URL (for back button/refresh)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pidString = params.get('partId');
    const typeFromUrl = params.get('type');
    
    if (pidString && typeFromUrl && productHierarchies[effectiveProductId] && !selectedItem) {
       const pid = Number(pidString);
       const h = productHierarchies[effectiveProductId];
       let found = null;
       
       if (typeFromUrl === 'product' && h.product?.id === pid) {
         found = { ...h.product, itemType: 'product' };
       } else {
         const search = (nodes) => {
            if (!nodes || !Array.isArray(nodes)) return null;
            for (const n of nodes) {
               // Check if this node is what we want
               const nodeObj = n.part || n.assembly || n;
               const nodeType = n.part ? 'part' : n.assembly ? 'assembly' : null;
               
               if (nodeObj.id === pid && (!nodeType || nodeType === typeFromUrl)) {
                  return { ...nodeObj, itemType: typeFromUrl };
               }
               
               // Recurse
               const sub = n.subassemblies || n.child_assemblies || n.assemblies || [];
               const pnodes = n.parts || n.direct_parts || [];
               
               const f = search(sub) || search(pnodes);
               if (f) return f;
            }
            return null;
         };
         found = search(h.assemblies) || search(h.direct_parts || h.parts);
       }
       
       if (found) {
         setSelectedItem({ ...found, productId: effectiveProductId });
       }
    }
  }, [productHierarchies, effectiveProductId, selectedItem]);

  const calculateStats = (productId) => {
    const hierarchy = productHierarchies[productId];
    if (!hierarchy) return { total: 0, inhouse: 0, outsource: 0 };

    const parts = [];
    const directParts = hierarchy.direct_parts || hierarchy.parts || [];
    parts.push(...directParts);
    
    const walkAssemblies = (assemblies) => {
      (assemblies || []).forEach((asm) => {
        if (asm?.parts) parts.push(...asm.parts);
        if (asm?.subassemblies) walkAssemblies(asm.subassemblies);
      });
    };
    walkAssemblies(hierarchy.assemblies || []);

    const inhouse = parts.filter(p => !String(p.part?.type_name || p.type_name || "").toLowerCase().includes("out")).length;
    const outsource = parts.length - inhouse;

    return { total: parts.length, inhouse, outsource };
  };

  const StatCard = ({ icon, label, value, color }) => (
    <Card size="small" style={{ border: '1px solid #f0f0f0', borderRadius: '8px' }}>
      <Space align="center">
        <div style={{ fontSize: '20px', color: color, display: 'flex' }}>{icon}</div>
        <div>
          <div style={{ fontSize: '12px', color: '#8c8c8c' }}>{label}</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{value}</div>
        </div>
      </Space>
    </Card>
  );

  const partOperationKpis = useMemo(() => {
    const total = operations?.length ?? 0;
    if (!total) {
      return { total: 0, confirmed: 0, pending: 0, completionPct: 0 };
    }
    let confirmed = 0;
    for (const op of operations) {
      const opNo = parseOpNo(op);
      if (inspectionPlanByOp[opNo] === 'confirmed') confirmed += 1;
    }
    const pending = total - confirmed;
    const completionPct = Math.round((confirmed / total) * 100);
    return { total, confirmed, pending, completionPct };
  }, [operations, inspectionPlanByOp]);

  if (isCheckingStatus) {
    return (
      <div style={{ height: 'calc(100vh - 180px)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
        <Space direction="vertical" align="center">
          <Spin size="large" />
          <Text type="secondary">Checking order status...</Text>
        </Space>
      </div>
    );
  }

  if (orderStatus !== 'active' && effectiveOrderId && String(effectiveOrderId) !== 'null') {
    return (
      <div style={{ height: 'calc(100vh - 180px)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', borderRadius: '12px', border: '1px solid #f0f0f0', margin: '20px' }}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <div style={{ textAlign: 'center' }}>
              <Title level={4} style={{ color: '#ff4d4f' }}>Order Inactive</Title>
              <Text type="secondary">
                This order is currently inactive and not available for Quality Management.<br />
                Please ensure the order is scheduled and activated in the PPS module.
              </Text>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div style={{ height: 'calc(100vh - 180px)', overflow: 'hidden' }}>
      <Layout style={{ height: "100%", background: "transparent" }}>
        {/* Mobile Toggle */}
        {isMobile && (
          <Button
            type="text"
            icon={<MenuOutlined />}
            onClick={() => setMobileDrawerOpen(true)}
            style={{ position: 'fixed', top: 120, left: 16, zIndex: 1001, background: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
          />
        )}

        {/* Sidebar/BOM */}
        {!isMobile && (
          <Sider
            width="33%"
            theme="light"
            style={{
              borderRight: "1px solid #f0f0f0",
              overflow: 'auto',
              minWidth: 300,
              maxWidth: 500,
              height: '100%',
              borderRadius: '8px 0 0 8px'
            }}
          >
            <QualityManagementBOM
              onItemSelected={handleItemSelected}
              onHierarchyLoaded={handleHierarchyLoaded}
              initialProductId={effectiveProductId}
              selectedItemId={selectedItem?.id}
              selectedItemType={selectedItem?.itemType}
            />
          </Sider>
        )}

        {/* Mobile Drawer for BOM */}
        {isMobile && (
          <Drawer
            placement="left"
            onClose={() => setMobileDrawerOpen(false)}
            open={mobileDrawerOpen}
            width="85%"
            styles={{ body: { padding: 0 } }}
          >
            <QualityManagementBOM
              onItemSelected={handleItemSelected}
              onHierarchyLoaded={handleHierarchyLoaded}
              initialProductId={effectiveProductId}
              selectedItemId={selectedItem?.id}
              selectedItemType={selectedItem?.itemType}
            />
          </Drawer>
        )}

        {/* Main Content Area */}
        <Content style={{ 
          background: '#f8fafc', 
          padding: '24px', 
          overflow: 'auto',
          borderRadius: isMobile ? '8px' : '0 8px 8px 0'
        }}>
          {selectedItem ? (
            <div>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <Title level={3} style={{ margin: 0 }}>
                      {selectedItem.itemType === 'product' ? selectedItem.product_name :
                       selectedItem.itemType === 'assembly' ? selectedItem.assembly_name :
                       selectedItem.part_name}
                    </Title>

                    {selectedItem.itemType === 'part' && (
                      <Space size={8} wrap>
                        <Button size="small" type="default" icon={<EyeOutlined />} onClick={handlePreviewPart}>
                          View Part Drawing
                        </Button>
                        <Button
                          size="small"
                          type="default"
                          icon={<CheckCircleOutlined />}
                          onClick={() => handleOpenPartInspection()}
                          style={{ backgroundColor: '#f6ffed', borderColor: '#b7eb8f', color: '#389e0d', fontWeight: 600 }}
                        >
                          Final Inspection
                        </Button>
                        <Button
                          size="small"
                          type="default"
                          icon={<AppstoreOutlined />}
                          onClick={() => handleOpenPartMeasurement()}
                          style={{ backgroundColor: '#ecfeff', borderColor: '#7dd3fc', color: '#08979c', fontWeight: 600 }}
                        >
                          Final Measurements
                        </Button>
                        <Button size="small" type="default" icon={<FilePdfOutlined />} onClick={() => handleOpenPartReport()}>
                          Part Report
                        </Button>
                      </Space>
                    )}
                  </div>
                  <Tag color="blue">{selectedItem.itemType.toUpperCase()}</Tag>
                </div>

                {selectedItem.itemType === 'part' && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                      gap: 12,
                      marginTop: 14,
                      marginBottom: 4,
                    }}
                  >
                    <StatCard icon={<ToolOutlined />} label="Total Operations" value={partOperationKpis.total} color="#1890ff" />
                    <StatCard icon={<CheckCircleOutlined />} label="Plan Confirmed" value={partOperationKpis.confirmed} color="#52c41a" />
                    <StatCard icon={<BuildOutlined />} label="Pending" value={partOperationKpis.pending} color="#faad14" />
                    <StatCard icon={<InfoCircleOutlined />} label="Completion" value={`${partOperationKpis.completionPct}%`} color="#722ed1" />
                  </div>
                )}
              </div>

              {selectedItem.itemType === 'product' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                  {(() => {
                    const stats = calculateStats(selectedItem.id);
                    return (
                      <>
                        <StatCard icon={<ClusterOutlined />} label="Total Parts" value={stats.total} color="#1890ff" />
                        <StatCard icon={<ToolOutlined />} label="In-house Parts" value={stats.inhouse} color="#52c41a" />
                        <StatCard icon={<ShoppingCartOutlined />} label="Outsource Parts" value={stats.outsource} color="#faad14" />
                      </>
                    );
                  })()}
                </div>
              )}

              {selectedItem.itemType === 'part' && (
                <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #f0f0f0', boxShadow: '0 2px 12px rgba(0,0,0,0.03)' }}>
                  <Tabs
                    defaultActiveKey="1"
                    items={[
                      {
                        key: '1',
                        label: 'Inspection Details',
                        children: (
                          <>
                            <style>{`
                              .qms-inspection-details-table .ant-table-thead > tr > th {
                                background:rgb(247, 250, 253) !important;
                              }
                              .qms-inspection-details-table .ant-table-thead > tr > th {
                                padding: 8px 10px !important;
                                font-size: 12px !important;
                                font-weight: 700 !important;
                                color: #334155 !important;
                                line-height: 1.1 !important;
                              }
                              /* Reduce extra height for grouped header rows (e.g. Actions -> 3 columns) */
                              .qms-inspection-details-table .ant-table-thead > tr.ant-table-row-level-0 > th {
                                padding-top: 6px !important;
                                padding-bottom: 6px !important;
                                font-size: 11px !important;
                                text-transform: uppercase;
                                letter-spacing: 0.04em;
                              }
                              .qms-inspection-details-table .ant-table-thead > tr.ant-table-row-level-1 > th {
                                padding-top: 6px !important;
                                padding-bottom: 6px !important;
                                font-size: 12px !important;
                                font-weight: 700 !important;
                              }
                              .qms-inspection-details-table .ant-table-tbody > tr > td {
                                padding: 10px 10px !important;
                              }
                            `}</style>
                            <Table
                              className="qms-inspection-details-table"
                            loading={loadingDetails}
                            dataSource={operations}
                            rowKey="id"
                            pagination={false}
                            scroll={{ x: 'max-content' }}
                            columns={[
                              {
                                title: 'Op #',
                                dataIndex: 'operation_number',
                                key: 'operation_number',
                                width: 80,
                                render: val => <Text strong style={{ color: '#1890ff' }}>{val}</Text>
                              },
                              {
                                title: 'Operation Name',
                                dataIndex: 'operation_name',
                                key: 'operation_name',
                                render: val => <Text style={{ fontWeight: 500 }}>{val}</Text>
                              },
                              {
                                title: 'Plan status',
                                key: 'inspection_plan_status',
                                width: 120,
                                render: (_, record) => {
                                  const opNo = parseOpNo(record);
                                  const st = inspectionPlanByOp[opNo];
                                  if (st === 'confirmed') {
                                    return <Tag color="success" style={{ borderRadius: '12px' }}>Confirmed</Tag>;
                                  }
                                  if (st === 'draft') {
                                    return <Tag color="processing" style={{ borderRadius: '12px' }}>Draft</Tag>;
                                  }
                                  return <Tag style={{ borderRadius: '12px' }}>—</Tag>;
                                },
                              },
                              {
                                title: 'Confirmed by',
                                key: 'inspection_plan_confirmed_by',
                                width: 140,
                                render: (_, record) => {
                                  const opNo = parseOpNo(record);
                                  const st = inspectionPlanByOp[opNo];
                                  const who = inspectionPlanConfirmedByOp[opNo];
                                  if (st !== 'confirmed' || !who) {
                                    return <Text type="secondary">—</Text>;
                                  }
                                  return (
                                    <Text style={{ fontSize: 13 }} ellipsis={{ tooltip: who }}>
                                      {who}
                                    </Text>
                                  );
                                },
                              },
                              {
                                title: 'Actions',
                                key: 'actions_group',
                                fixed: 'right',
                                align: 'center',
                                children: [
                                  {
                                    title: 'Inspection Plan',
                                    key: 'action_plan',
                                    width: 132,
                                    align: 'center',
                                    render: (_, record) => {
                                      const opNo = parseOpNo(record);
                                      const st = inspectionPlanByOp[opNo];
                                      const planLabel = st === 'confirmed' ? 'View Plan' : st === 'draft' ? 'Continue Plan' : 'Create Plan';
                                      const PlanIcon = st === 'confirmed' ? EyeOutlined : BuildOutlined;
                                      return (
                                        <Button
                                          size="small"
                                          type={st === 'confirmed' ? 'default' : 'primary'}
                                          ghost={st !== 'confirmed'}
                                          icon={<PlanIcon />}
                                          style={st === 'confirmed' ? {
                                            backgroundColor: '#e6f4ff',
                                            borderColor: '#91caff',
                                            color: '#0958d9',
                                            fontWeight: 600,
                                          } : { fontWeight: 600 }}
                                          onClick={async () => {
                                            if (st === 'confirmed') {
                                              await openConfirmedPlanModal(record, opNo);
                                              return;
                                            }
                                            const { url, isPdf, name, apiDocumentId } = getDrawingInfo(record);
                                            const hierarchy = productHierarchies[selectedItem.productId];
                                            const projectName = hierarchy?.product?.product_name || '';
                                            const partName = selectedItem.part_name || '';
                                            const opParts = [];
                                            if (record.operation_number != null && record.operation_number !== '') opParts.push(String(record.operation_number));
                                            if (record.operation_name) opParts.push(record.operation_name);
                                            const opLabel = opParts.join(': ');
                                            if (effectiveOrderId && String(effectiveOrderId) !== 'null' && selectedItem.part_number) {
                                              if (st !== 'confirmed') {
                                                try {
                                                  await axios.put(`${QUALITY_API_BASE_URL}/quality/inspection-plan-status`, {
                                                    part_number: selectedItem.part_number,
                                                    sales_order_id: Number(effectiveOrderId),
                                                    op_no: opNo,
                                                    status: 'draft',
                                                  });
                                                  setInspectionPlanByOp((prev) => ({ ...prev, [opNo]: 'draft' }));
                                                  setInspectionPlanConfirmedByOp((prev) => ({ ...prev, [opNo]: null }));
                                                } catch (err) {
                                                  console.error(err);
                                                  const detail = err.response?.data?.detail;
                                                  message.error(typeof detail === 'string' ? detail : err.message || 'Could not start inspection plan');
                                                  return;
                                                }
                                              }
                                            }
                                            const qs = new URLSearchParams({
                                              drawingUrl: url || '',
                                              isPdf: String(!!isPdf),
                                              fileName: name || '',
                                              projectName,
                                              partName,
                                              operationName: opLabel,
                                              partId: String(selectedItem.id),
                                              partNumber: selectedItem.part_number || '',
                                              operationNumber: String(record.operation_number ?? ''),
                                              operationId: String(record.id),
                                            });
                                            if (apiDocumentId != null) qs.set('documentId', String(apiDocumentId));
                                            if (effectiveOrderId && String(effectiveOrderId) !== 'null') {
                                              qs.set('orderId', String(effectiveOrderId));
                                            }
                                            navigate(`${qmsInspectorBase}?${qs.toString()}`);
                                          }}
                                        >
                                          {planLabel}
                                        </Button>
                                      );
                                    },
                                  },
                                  {
                                    title: 'Measurements',
                                    key: 'action_measurements',
                                    width: 120,
                                    align: 'center',
                                    render: (_, record) => (
                                      <Button
                                        size="small"
                                        type="default"
                                        icon={<CheckCircleOutlined />}
                                        style={{ borderColor: '#86efac', color: '#047857', fontWeight: 600 }}
                                        onClick={() => openMeasurementsModal(record)}
                                      >
                                        View Data
                                      </Button>
                                    ),
                                  },
                                  {
                                    title: 'Drawing',
                                    key: 'action_drawing',
                                    width: 120,
                                    align: 'center',
                                    render: (_, record) => (
                                      <Button
                                        size="small"
                                        icon={<EyeOutlined />}
                                        onClick={() => handlePreviewOperation(record)}
                                        title="View Drawing"
                                      >
                                        View Drawing
                                      </Button>
                                    ),
                                  },
                                ],
                              },
                            ]}
                            />
                          </>
                        ),
                      },
                      {
                        key: '2',
                        label: 'Inspection Reports',
                        children: (
                          <div style={{ marginTop: 6 }}>
                            <style>{`
                              .qms-inspection-reports-table .ant-table-thead > tr > th {
                                background: rgb(247, 250, 253) !important;
                                padding: 6px 8px !important;
                                font-size: 12px !important;
                                font-weight: 700 !important;
                                color: #334155 !important;
                                line-height: 1.1 !important;
                              }
                              .qms-inspection-reports-table .ant-table-tbody > tr > td {
                                padding: 8px 8px !important;
                                font-size: 13px !important;
                              }
                              .qms-inspection-reports-table .ant-table-cell {
                                white-space: nowrap;
                              }
                            `}</style>
                            <Table
                              className="qms-inspection-reports-table"
                              size="small"
                              loading={loadingDetails}
                              dataSource={operations}
                              rowKey="id"
                              pagination={false}
                              tableLayout="fixed"
                              columns={[
                                {
                                  title: 'Op #',
                                  dataIndex: 'operation_number',
                                  key: 'operation_number',
                                  width: 56,
                                  align: 'center',
                                  render: val => <Text strong style={{ color: '#1890ff' }}>{val}</Text>,
                                },
                                {
                                  title: 'Operation Name',
                                  dataIndex: 'operation_name',
                                  key: 'operation_name',
                                  width: 140,
                                  ellipsis: true,
                                  render: val => <Text style={{ fontWeight: 500 }} ellipsis={{ tooltip: val }}>{val}</Text>,
                                },
                                {
                                  title: 'Plan status',
                                  key: 'inspection_plan_status',
                                  width: 96,
                                  align: 'center',
                                  render: (_, record) => {
                                    const opNo = parseOpNo(record);
                                    const st = inspectionPlanByOp[opNo];
                                    if (st === 'confirmed') {
                                      return <Tag color="success" style={{ borderRadius: '12px', margin: 0 }}>Confirmed</Tag>;
                                    }
                                    if (st === 'draft') {
                                      return <Tag color="processing" style={{ borderRadius: '12px', margin: 0 }}>Draft</Tag>;
                                    }
                                    return <Tag style={{ borderRadius: '12px', margin: 0 }}>—</Tag>;
                                  },
                                },
                                {
                                  title: 'Confirmed by',
                                  key: 'inspection_plan_confirmed_by',
                                  width: 100,
                                  ellipsis: true,
                                  render: (_, record) => {
                                    const opNo = parseOpNo(record);
                                    const st = inspectionPlanByOp[opNo];
                                    const who = inspectionPlanConfirmedByOp[opNo];
                                    if (st !== 'confirmed' || !who) return <Text type="secondary">—</Text>;
                                    return <Text style={{ fontSize: 13 }} ellipsis={{ tooltip: who }}>{who}</Text>;
                                  },
                                },
                                {
                                  title: 'Req qty',
                                  dataIndex: 'required_quantity',
                                  key: 'required_quantity',
                                  width: 68,
                                  align: 'center',
                                  render: (val) => (val != null && val !== '' ? val : '—'),
                                },
                                {
                                  title: 'Comp qty',
                                  dataIndex: 'completed_quantity',
                                  key: 'completed_quantity',
                                  width: 68,
                                  align: 'center',
                                  render: (val) => (val != null && val !== '' ? val : '—'),
                                },
                                {
                                  title: 'Acpt qty',
                                  dataIndex: 'accepted_quantity',
                                  key: 'accepted_quantity',
                                  width: 68,
                                  align: 'center',
                                  render: (val) => (val != null && val !== '' ? val : '—'),
                                },
                                {
                                  title: 'Rej qty',
                                  dataIndex: 'rejected_quantity',
                                  key: 'rejected_quantity',
                                  width: 68,
                                  align: 'center',
                                  render: (val) => (val != null && val !== '' ? val : '—'),
                                },
                                {
                                  title: 'Yield %',
                                  dataIndex: 'yield_percentage',
                                  key: 'yield_percentage',
                                  width: 64,
                                  align: 'center',
                                  render: (val) => {
                                    if (val == null || val === '') {
                                      return <Text type="secondary">—</Text>;
                                    }
                                    const n = Number(val);
                                    return (
                                      <Text style={{ color: n >= 95 ? '#52c41a' : n < 80 ? '#f5222d' : '#faad14', fontWeight: 'bold' }}>
                                        {`${n}%`}
                                      </Text>
                                    );
                                  },
                                },
                                {
                                  title: 'Actions',
                                  key: 'actions_reports',
                                  width: 168,
                                  align: 'center',
                                  render: (_, record) => (
                                    <Space size="small">
                                      <Button
                                        size="small"
                                        icon={<EyeOutlined />}
                                        onClick={() => handleGenerateReport(record)}
                                      >
                                        View
                                      </Button>
                                      <Button
                                        size="small"
                                        icon={<CloudDownloadOutlined />}
                                        loading={reportWordDownloading && reportWordDownloadingOp === parseOpNo(record)}
                                        disabled={reportWordDownloading}
                                        onClick={() => void handleDownloadReport(record)}
                                      >
                                        Download
                                      </Button>
                                    </Space>
                                  ),
                                },
                              ]}
                            />
                          </div>
                        ),
                      },
                    ]}
                  />
                </div>
              )}

              <Modal
                title={planViewTitle || 'Operation Details'}
                centered
                footer={null}
                width="95%"
                onCancel={closePlanViewModal}
                open={planViewOpen}
                styles={{ body: { padding: 12, height: '80vh', background: '#f7f8fa' } }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, 1.35fr)', gap: 12, height: '100%', alignItems: 'stretch', fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace' }}>
                  <div style={{ border: '1px solid #dfe4ea', borderRadius: 10, overflow: 'hidden', background: '#fff', display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', boxShadow: '0 2px 10px rgba(15,23,42,0.04)' }}>
                    <div style={{ padding: '10px 12px', borderBottom: '1px solid #eef0f3', background: '#fafbfc', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                      <Text strong style={{ color: '#111827', fontSize: 18, lineHeight: 1.2, fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace' }}>Inspection Details</Text>
                      <div style={{ marginTop: 8, fontSize: 14, color: '#374151', display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
                        <Text style={{ fontSize: 14, fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace' }}><b>Order:</b> {planViewMeta?.orderNo || '—'}</Text>
                        <Text style={{ fontSize: 14, fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace' }}><b>Part:</b> {planViewMeta?.partNo || '—'}</Text>
                        <Text style={{ fontSize: 14, fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace' }}><b>Operation:</b> {planViewMeta?.opNo || '—'}</Text>
                      </div>
                      </div>
                      {planViewCanEditBoc && !planViewLoading && (
                        <Button type="primary" size="small" icon={<EditOutlined />} onClick={handleEditPlanFromViewModal} style={{ flexShrink: 0 }}>
                          Edit plan (BOC)
                        </Button>
                      )}
                    </div>
                    <div ref={planBocBodyRef} className="qm-plan-view-boc-body">
                      <style>{QM_PLAN_VIEW_TABLE_STYLES}</style>
                      <Table
                        className="qm-plan-view-table"
                        size="small"
                        loading={planViewLoading}
                        dataSource={planTableRows}
                        rowKey="id"
                        pagination={false}
                        scroll={
                          planBocTableScrollY
                            ? { x: 'max-content', y: planBocTableScrollY }
                            : { x: 'max-content' }
                        }
                        tableLayout="fixed"
                        rowClassName={(_, idx) => (idx % 2 === 0 ? 'plan-row-even' : 'plan-row-odd')}
                        onRow={(record) => ({
                          onClick: () => setActiveBalloonId(String(record.id)),
                          style: { cursor: 'pointer' }
                        })}
                        columns={[
                          { title: 'S.No', key: 'sno', width: 54, align: 'center', render: (_, __, idx) => <Text style={{ fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace', fontSize: 14 }}>{idx + 1}</Text> },
                          { title: 'Zone', dataIndex: 'zone', key: 'zone', width: 66, align: 'center', render: (z) => <Tag color="geekblue" style={{ borderRadius: 8, fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace' }}>{z || '—'}</Tag> },
                          {
                            title: 'Description',
                            dataIndex: 'dimension_type',
                            key: 'dimension_type',
                            width: 118,
                            ellipsis: true,
                            render: (val) => (
                              <Tag
                                color={dimensionTypeTagColor(val)}
                                style={{ borderRadius: 8, fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace', maxWidth: '100%' }}
                              >
                                {val || '—'}
                              </Tag>
                            ),
                          },
                          { title: 'Nominal', dataIndex: 'nominal', key: 'nominal', width: 80, align: 'right', render: (v) => <Text style={{ fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace', color: '#1f2937', fontSize: 14 }}>{v ?? '—'}</Text> },
                          { title: 'Upper', dataIndex: 'uppertol', key: 'uppertol', width: 72, align: 'right', render: (v) => <Text style={{ fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace', color: Number(v) > 0 ? '#15803d' : '#6b7280', fontSize: 14 }}>{fmtTol(v)}</Text> },
                          { title: 'Lower', dataIndex: 'lowertol', key: 'lowertol', width: 72, align: 'right', render: (v) => <Text style={{ fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace', color: Number(v) < 0 ? '#b91c1c' : '#6b7280', fontSize: 14 }}>{fmtTol(v)}</Text> },
                          {
                            title: 'Instrument',
                            dataIndex: 'measured_instrument',
                            key: 'measured_instrument',
                            width: 132,
                            ellipsis: true,
                            render: (v) => {
                              const label = (v || '').trim() || 'default';
                              return (
                                <Text
                                  style={{
                                    fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace',
                                    fontSize: 14,
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
                  <div style={{ border: '1px solid #dfe4ea', borderRadius: 10, overflow: 'hidden', background: '#fff', display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', boxShadow: '0 2px 10px rgba(15,23,42,0.04)' }}>
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid #eef0f3', background: '#fafbfc', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text strong style={{ color: '#111827', fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace' }}>Drawing View</Text>
                      <Button size="small" icon={<CloudDownloadOutlined />} onClick={handleDownloadPlanDrawing} disabled={!planDrawingUrl}>
                        Download Drawing
                      </Button>
                    </div>
                    <div style={{ flex: 1, minHeight: 0, padding: 10, display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
                      {planViewLoading ? (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin /></div>
                      ) : planDrawingUrl ? (
                        <InteractiveDrawing
                          pdfId={planBalloonDocumentId}
                          directImageSrc={!planDrawingIsPdf ? planDrawingUrl : null}
                          pageNumber={1}
                          balloons={planInteractiveBalloons}
                          activeBalloonId={activeBalloonId}
                          onBalloonClick={(b) => setActiveBalloonId(b.id)}
                          balloonColor="blue"
                        />
                      ) : (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Empty description="No balloon document found for this operation" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Modal>

              {/* Modal for 2D Drawing Preview */}
              <Modal
                title={`${measurePartMode ? 'Whole Part Measured Data' : 'Measured Inspection Data'}${measureContext?.opNo != null ? ` - OP ${measureContext.opNo}` : ''}`}
                centered
                footer={null}
                width="96%"
                onCancel={() => {
                  setMeasureModalOpen(false);
                  setMeasurePartMode(false);
                }}
                open={measureModalOpen}
                styles={{ body: { padding: 12, maxHeight: '78vh', background: '#f7f8fa', fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace', overflow: 'auto' } }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                      <Text style={{ fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace' }}><b>Production Order:</b> {measureContext?.orderId || '—'}</Text>
                      <Text style={{ fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace' }}><b>Part Number:</b> {measureContext?.partNo || '—'}</Text>
                      <Text style={{ fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace' }}><b>Operation:</b> {measureContext?.opName ? `OP ${measureContext?.opNo} (${measureContext.opName})` : `OP ${measureContext?.opNo ?? '—'}`}</Text>
                      <Tooltip title="FTP (first-time pass) applies to this order and operation. Operators request approval after quantity 1; quantity 2+ stays locked until approved.">
                        <Tag
                          color={
                            measureFtpStatus === 'approved'
                              ? 'success'
                              : measureFtpStatus === 'pending'
                                ? 'processing'
                                : measureFtpStatus === 'rejected'
                                  ? 'error'
                                  : 'default'
                          }
                          style={{ margin: 0, fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace' }}
                        >
                          FTP: {(measureFtpStatus || 'not requested').toString().toUpperCase()}
                        </Tag>
                      </Tooltip>
                      {measureQty > 1 ? (
                        <Tag color={measureFtpStatus === 'approved' ? 'success' : 'warning'} style={{ margin: 0 }}>
                          Selected Qty {measureQty}: {measureFtpStatus === 'approved' ? 'FTP approved — plan + measurements can load' : 'FTP not approved — operators cannot record this quantity yet'}
                        </Tag>
                      ) : (
                        <Tag color="blue" style={{ margin: 0 }}>
                          Qty 1: complete measurements, then request FTP approval
                        </Tag>
                      )}
                    </div>
                    <Space align="center" size={12}>
                      <Text style={{ fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace' }}><b>Qty:</b></Text>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        padding: '1px 4px',
                        gap: 6
                      }}>
                        <Button
                          size="small"
                          type="text"
                          icon={<LeftOutlined style={{ fontSize: 10 }} />}
                          disabled={measureQty === 1 || measureQtyOptions.length <= 1}
                          onClick={() => {
                            const idx = measureQtyOptions.findIndex(o => o.value === measureQty);
                            if (idx > 0) setMeasureQty(measureQtyOptions[idx - 1].value);
                          }}
                          style={{ width: 22, height: 22, padding: 0 }}
                        />
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minWidth: 50,
                          gap: 2
                        }}>
                          <Input
                            size="small"
                            variant="borderless"
                            value={measureQtyInput}
                            onChange={(e) => setMeasureQtyInput(e.target.value)}
                            onPressEnter={handleMeasureQtySubmit}
                            onBlur={handleMeasureQtySubmit}
                            style={{
                              width: 24,
                              textAlign: 'right',
                              fontSize: '11px',
                              fontWeight: 700,
                              color: '#334155',
                              padding: 0,
                              height: '22px',
                              fontFamily: '"JetBrains Mono", monospace',
                            }}
                          />
                          <Text style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, userSelect: 'none' }}>
                            / {measureQtyOptions.length}
                          </Text>
                        </div>
                        <Button
                          size="small"
                          type="text"
                          icon={<RightOutlined style={{ fontSize: 10 }} />}
                          disabled={measureQty === measureQtyOptions.length || measureQtyOptions.length <= 1}
                          onClick={() => {
                            const idx = measureQtyOptions.findIndex(o => o.value === measureQty);
                            if (idx >= 0 && idx < measureQtyOptions.length - 1) {
                              setMeasureQty(measureQtyOptions[idx + 1].value);
                            }
                          }}
                          style={{ width: 22, height: 22, padding: 0 }}
                        />
                      </div>
                    </Space>
                  </div>


                  {measureQty > 1 && measureFtpStatus !== 'approved' ? (
                    <Alert
                      type="warning"
                      showIcon
                      message="Quantity 2 and above require FTP approval."
                      description="After you click Approve FTP in the operations list, stage rows are created and this table shows both the plan (nominal / limits) and actual readings for the selected quantity."
                    />
                  ) : null}
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
                    {measureModalLoading ? (
                      <div style={{ padding: 40, textAlign: 'center' }}><Spin /></div>
                    ) : measureAllReadingsEmpty ? (
                      <div style={{
                        padding: '72px 32px',
                        minHeight: 320,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#fafbfc',
                      }}>
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          imageStyle={{ height: 72 }}
                          description={
                            <Text type="secondary" style={{ fontSize: 18, fontWeight: 500 }}>
                              No measurements found
                            </Text>
                          }
                        />
                      </div>
                    ) : (
                      <>
                        {renderInspectionSummaryBar(measureSummary)}
                        <style>{QM_MEASURE_TABLE_ROW_STYLES}</style>
                        <Table
                          className="qm-measure-data-table"
                          size="small"
                          loading={measureModalLoading}
                          dataSource={measureDecoratedRows}
                          rowKey="id"
                          pagination={{ pageSize: 10, showSizeChanger: false, hideOnSinglePage: true }}
                          scroll={{ x: 'max-content', y: Math.min(480, Math.max(160, measureDecoratedRows.length * 44 + 70)) }}
                          rowClassName={(record) => inspectionMeasureRowClass(record._status)}
                          columns={[
                            { title: 'S.No', key: 'sno', width: 60, fixed: 'left', render: (_, __, idx) => idx + 1 },
                            ...(measurePartMode ? [{
                              title: 'Operation',
                              dataIndex: '_op_no',
                              key: '_op_no',
                              width: 150,
                              render: (v, r) => <Text style={{ fontSize: 11 }}><b>OP {v}</b> ({r._op_name})</Text>
                            }] : []),
                            { title: 'Zone', dataIndex: 'zone', key: 'zone', width: 90, render: (z) => <Tag color="geekblue" style={{ margin: 0, borderRadius: 10 }}>{z || '—'}</Tag> },
                            {
                              title: 'Type',
                              dataIndex: 'dimension_type',
                              key: 'dimension_type',
                              width: 140,
                              render: (v) => (
                                <Tag color={dimensionTypeTagColor(v)} style={{ margin: 0, borderRadius: 10 }}>
                                  {v || '—'}
                                </Tag>
                              ),
                            },
                            {
                              title: 'Plan (from inspection plan)',
                              key: 'plan_group',
                              children: [
                                { title: 'Nominal', dataIndex: 'nominal_value', key: 'nominal_value', width: 100, render: (v) => <Text strong>{v ?? '—'}</Text> },
                                { title: 'Upper', dataIndex: 'uppertol', key: 'uppertol', width: 80, render: (v) => <Text style={{ color: Number(v) > 0 ? '#15803d' : '#6b7280' }}>{fmtTol(v)}</Text> },
                                { title: 'Lower', dataIndex: 'lowertol', key: 'lowertol', width: 80, render: (v) => <Text style={{ color: Number(v) < 0 ? '#b91c1c' : '#6b7280' }}>{fmtTol(v)}</Text> },
                                {
                                  title: 'Upper Limit',
                                  key: 'upper_limit',
                                  width: 110,
                                  render: (_, r) => <Text style={{ color: '#166534' }}>{fmtLimit(r._upperLimit)}</Text>,
                                },
                                {
                                  title: 'Lower Limit',
                                  key: 'lower_limit',
                                  width: 110,
                                  render: (_, r) => <Text style={{ color: '#991b1b' }}>{fmtLimit(r._lowerLimit)}</Text>,
                                },
                              ],
                            },
                            {
                              title: 'Actual (measurements)',
                              key: 'actual_group',
                              children: [
                                {
                                  title: 'Samples',
                                  key: 'samples',
                                  children: Array.from({ length: Math.max(3, Math.max(...measureRows.map(r => r.measurements?.length || 0))) }).map((_, i) => ({
                                    title: `#${i + 1}`,
                                    dataIndex: ['measurements', i],
                                    key: `m${i}`,
                                    width: 80,
                                    render: (v) => (
                                      <Text style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11 }}>
                                        {parseNum(v) != null ? String(v).trim() : '—'}
                                      </Text>
                                    ),
                                  }))
                                },
                                {
                                  title: 'Actual',
                                  key: 'actual_computed',
                                  width: 100,
                                  render: (_, r) => {
                                    const m = r._computedMean;
                                    const display = m == null ? '—' : fmt2(m);
                                    return renderInspectionActualCell(r, display);
                                  },
                                },
                                {
                                  title: 'Status',
                                  key: 'status',
                                  width: 96,
                                  align: 'center',
                                  render: (_, r) => renderInspectionGoNoGoTag(r._status),
                                },
                              ],
                            },
                          ]}
                        />
                      </>
                    )}
                  </div>
                </div>
              </Modal>

              <Modal
                title={
                  ftpApproveContext
                    ? `Review FTP — Quantity 1 · OP ${ftpApproveContext.opNo}${ftpApproveContext.opName ? ` (${ftpApproveContext.opName})` : ''}`
                    : 'Review FTP'
                }
                centered
                width="98%"
                open={ftpApproveModalOpen}
                onCancel={() => {
                  setFtpApproveModalOpen(false);
                  setFtpApproveContext(null);
                  setFtpApproveRows([]);
                  setPlanDrawingUrl(null);
                  setPlanDrawingFileName(null);
                }}
                destroyOnClose
                footer={
                  <Space>
                    <Button
                      onClick={() => {
                        setFtpApproveModalOpen(false);
                        setFtpApproveContext(null);
                        setFtpApproveRows([]);
                        setPlanDrawingUrl(null);
                        setPlanDrawingFileName(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="primary"
                      disabled={
                        ftpApproveLoading ||
                        !ftpApproveContext ||
                        ftpApproveDecoratedRows.length === 0 ||
                        !ftpApproveMeasurementsDone ||
                        inspectionPlanByOp[ftpApproveContext?.opNo] !== 'confirmed'
                      }
                      onClick={() => confirmAndApproveFtp()}
                    >
                      Approve FTP…
                    </Button>
                  </Space>
                }
                styles={{ body: { padding: 12, height: '80vh', background: '#f7f8fa' } }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1.45fr 1fr', gap: 14, height: '100%', fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace' }}>
                  <div style={{ border: '1px solid #dfe4ea', borderRadius: 10, overflow: 'hidden', background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '0 2px 10px rgba(15,23,42,0.04)' }}>
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid #eef0f3', background: '#fafbfc' }}>
                      <Text strong style={{ color: '#111827', fontSize: 22, lineHeight: 1.2, fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace' }}>Inspection Details</Text>
                      {ftpApproveContext && (
                        <div style={{ marginTop: 10, fontSize: 16, color: '#374151' }}>
                          <Text style={{ fontSize: 16, fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace' }}><b>Order:</b> {ftpApproveContext.orderId}</Text>
                          <Text style={{ fontSize: 16, marginLeft: 18, fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace' }}><b>Part:</b> {ftpApproveContext.partNo}</Text>
                          <Text style={{ fontSize: 16, marginLeft: 18, fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace' }}><b>Operation:</b> {ftpApproveContext.opNo}</Text>
                        </div>
                      )}
                    </div>

                    <div style={{ padding: '10px 14px', flex: 1, minHeight: 0, overflow: 'auto' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {!ftpApproveLoading && ftpApproveDecoratedRows.length === 0 ? (
                          <Alert
                            type="warning"
                            showIcon
                            message="No quantity 1 measurement rows found."
                            description="Ensure the operator has completed quantity 1 in the inspector and requested FTP."
                          />
                        ) : null}
                        {ftpApproveDecoratedRows.some((r) => r._status === 'out') ? (
                          <Alert
                            type="warning"
                            showIcon
                            message="Some characteristics are out of tolerance on quantity 1."
                            description="You can still approve FTP if this is acceptable for your process; otherwise reject with the operator and re-measure."
                          />
                        ) : null}

                        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
                          {ftpApproveAllReadingsEmpty && !ftpApproveLoading ? (
                            <div style={{
                              padding: '72px 32px',
                              minHeight: 320,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: '#fafbfc',
                            }}>
                              <Empty
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                imageStyle={{ height: 72 }}
                                description={
                                  <Text type="secondary" style={{ fontSize: 18, fontWeight: 500 }}>
                                    No measurements found
                                  </Text>
                                }
                              />
                            </div>
                          ) : (
                            <>
                              {renderInspectionSummaryBar(ftpApproveSummary)}
                              <style>{QM_MEASURE_TABLE_ROW_STYLES}</style>
                              <Table
                                className="qm-measure-data-table"
                                size="small"
                                loading={ftpApproveLoading}
                                dataSource={ftpApproveDecoratedRows}
                                rowKey="id"
                                pagination={false}
                                scroll={{ x: 'max-content', y: 460 }}
                                rowClassName={(record) => inspectionMeasureRowClass(record._status)}
                                onRow={(record) => ({
                                  onClick: () => setActiveBalloonId(String(record.id)),
                                  style: { cursor: 'pointer' },
                                })}
                                columns={[
                                  { title: 'S.No', key: 'sno', width: 64, render: (_, __, idx) => idx + 1 },
                                  { title: 'Zone', dataIndex: 'zone', key: 'zone', width: 82, render: (z) => <Tag color="geekblue" style={{ margin: 0, borderRadius: 10 }}>{z || '—'}</Tag> },
                                  {
                                    title: 'Type',
                                    dataIndex: 'dimension_type',
                                    key: 'dimension_type',
                                    width: 160,
                                    render: (v) => (
                                      <Tag color={dimensionTypeTagColor(v)} style={{ margin: 0, borderRadius: 10 }}>
                                        {v || '—'}
                                      </Tag>
                                    ),
                                  },
                                  {
                                    title: 'Plan (from inspection plan)',
                                    key: 'plan_group_ftp',
                                    children: [
                                      { title: 'Nominal', dataIndex: 'nominal_value', key: 'nominal_value', width: 100, render: (v) => <Text strong>{v ?? '—'}</Text> },
                                      { title: 'Upper', dataIndex: 'uppertol', key: 'uppertol', width: 80, render: (v) => <Text style={{ color: Number(v) > 0 ? '#15803d' : '#6b7280' }}>{fmtTol(v)}</Text> },
                                      { title: 'Lower', dataIndex: 'lowertol', key: 'lowertol', width: 80, render: (v) => <Text style={{ color: Number(v) < 0 ? '#b91c1c' : '#6b7280' }}>{fmtTol(v)}</Text> },
                                    ],
                                  },
                                  {
                                    title: 'Actual (Qty 1)',
                                    key: 'actual_group_ftp',
                                    children: [
                                {
                                  title: 'Samples',
                                  key: 'samples_ftp',
                                  children: Array.from({ length: Math.max(3, Math.max(...ftpApproveRows.map(r => r.measurements?.length || 0))) }).map((_, i) => ({
                                    title: `#${i + 1}`,
                                    dataIndex: ['measurements', i],
                                    key: `mftp${i}`,
                                    width: 72,
                                    render: (v) => (
                                      <Text style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11 }}>
                                        {parseNum(v) != null ? String(v).trim() : '—'}
                                      </Text>
                                    ),
                                  }))
                                },
                                      {
                                        title: 'Actual',
                                        key: 'actual_c',
                                        width: 96,
                                        render: (_, r) => {
                                          const m = r._computedMean;
                                          const display = m == null ? '—' : fmt2(m);
                                          return renderInspectionActualCell(r, display);
                                        },
                                      },
                                      {
                                        title: 'Status',
                                        key: 'st',
                                        width: 96,
                                        align: 'center',
                                        render: (_, r) => renderInspectionGoNoGoTag(r._status),
                                      },
                                    ],
                                  },
                                ]}
                              />
                            </>
                          )}
                        </div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Approval unlocks quantity 2+ for operators.
                        </Text>
                      </div>
                    </div>
                  </div>

                  <div style={{ border: '1px solid #dfe4ea', borderRadius: 10, overflow: 'hidden', background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '0 2px 10px rgba(15,23,42,0.04)' }}>
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid #eef0f3', background: '#fafbfc', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text strong style={{ color: '#111827', fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace' }}>Drawing View</Text>
                      <Button size="small" icon={<CloudDownloadOutlined />} onClick={handleDownloadPlanDrawing} disabled={!planDrawingUrl}>
                        Download Drawing
                      </Button>
                    </div>
                    <div style={{ flex: 1, minHeight: 0, padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
                      {ftpApproveLoading ? (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin /></div>
                      ) : planDrawingUrl ? (
                        <div style={{ width: '100%', height: 'min(72vh, 900px)', border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff', boxShadow: '0 2px 10px rgba(15,23,42,0.08)', overflow: 'hidden' }}>
                          <InteractiveDrawing
                            pdfId={planBalloonDocumentId}
                            directImageSrc={!planDrawingIsPdf ? planDrawingUrl : null}
                            pageNumber={1}
                            balloons={interactiveBalloons}
                            activeBalloonId={activeBalloonId}
                            onBalloonClick={(b) => setActiveBalloonId(b.id)}
                            balloonColor="blue"
                          />
                        </div>
                      ) : (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Empty description="No balloon document found for this operation" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Modal>

              {/* Modal for 2D Drawing Preview */}
              <Modal
                title={previewTitle || "Drawing Preview"}
                centered
                footer={null}
                width="90%"
                onCancel={() => setPreviewModalVisible(false)}
                open={previewModalVisible}
                styles={{ body: { padding: 0, height: '80vh' } }}
              >
                <div style={{ width: '100%', height: '100%', background: '#fff' }}>
                  {previewUrl ? (
                    previewIsPdf ? (
                      <iframe 
                        src={pdfEmbedSrcForReview(previewUrl)} 
                        width="100%" 
                        height="100%" 
                        style={{ border: 'none' }}
                        title="Drawing PDF"
                      />
                    ) : (
                      <img 
                        src={previewUrl} 
                        alt="Drawing" 
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      />
                    )
                  ) : (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Empty description="No drawing available" />
                    </div>
                  )}
                </div>
              </Modal>

              {/* Part Inspection Overall Summary Modal */}
              <Modal
                title={`Part Inspection Overview: ${selectedItem?.part_name || 'Part'}`}
                centered
                open={partInspectionModalOpen}
                onCancel={() => setPartInspectionModalOpen(false)}
                footer={[
                  <Button key="close" onClick={() => setPartInspectionModalOpen(false)}>Close</Button>
                ]}
                width={1100}
                styles={{ body: { maxHeight: '75vh', overflow: 'auto' } }}
              >
                <Space direction="vertical" style={{ width: '100%' }} size="large">
                  <Alert 
                    message="Consolidated Inspection View" 
                    description="This view shows the quality status of every operation in the manufacturing plan for this part. You can review measurement summaries and drill down into specific recorded data."
                    type="info"
                    showIcon
                  />
                  <Table
                    size="small"
                    loading={partInspectionLoading}
                    dataSource={Object.values(partInspectionSummaryByOp).sort((a, b) => a.opNo - b.opNo)}
                    rowKey="opNo"
                    pagination={false}
                    columns={[
                      { 
                        title: 'Op #', 
                        dataIndex: 'opNo', 
                        width: 90,
                        render: (v) => <Text strong>{v}</Text>
                      },
                      { title: 'Operation Name', dataIndex: 'opName' },
                      { 
                        title: 'Measurement Status', 
                        key: 'progress',
                        render: (_, r) => (
                          <Space wrap>
                            <Tag color="blue">{r.total} Features</Tag>
                            {r.total > 0 && <Tag color="green">{r.within} Passed</Tag>}
                            {r.out > 0 && <Tag color="red">{r.out} Failed</Tag>}
                            {!r.any_recorded && <Tag color="warning">Pending Shopfloor</Tag>}
                          </Space>
                        )
                      },
                      {
                        title: 'Yield',
                        key: 'passRate',
                        width: 100,
                        align: 'center',
                        render: (_, r) => {
                          const rate = r.total ? (r.within / r.total * 100).toFixed(1) : '0.0';
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <Text strong style={{ color: Number(rate) === 100 ? '#52c41a' : Number(rate) > 0 ? '#1890ff' : '#999' }}>
                                {rate}%
                              </Text>
                            </div>
                          );
                        }
                      },
                      {
                        title: 'Actions',
                        key: 'action',
                        width: 180,
                        align: 'center',
                        render: (_, r) => (
                          <Button 
                            size="small" 
                            type="primary"
                            ghost
                            icon={<CheckCircleOutlined />} 
                            onClick={() => {
                              const opRecord = operations.find(o => parseOpNo(o) === r.opNo);
                              if (opRecord) openMeasurementsModal(opRecord);
                            }}
                            disabled={!r.any_recorded}
                          >
                            Inspection Data
                          </Button>
                        )
                      }
                    ]}
                  />
                </Space>
              </Modal>

              <InspectionReportModal
                open={!!reportTarget}
                target={reportTarget}
                projectName={reportTarget ? (productHierarchies[selectedItem?.productId]?.product?.product_name || '') : ''}
                assemblyName={selectedItem?.assembly_name || 'Main'}
                onClose={() => {
                  setReportTarget(null);
                }}
              />

              {reportWordDownloading ? (
                <div
                  role="status"
                  aria-live="polite"
                  aria-busy="true"
                  style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 2000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(15, 23, 42, 0.45)',
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 12,
                      minWidth: 280,
                      padding: '32px 40px',
                      borderRadius: 16,
                      background: '#fff',
                      boxShadow: '0 24px 48px rgba(15, 23, 42, 0.18)',
                    }}
                  >
                    <Spin size="large" />
                    <Title level={4} style={{ margin: 0 }}>Generating Word document</Title>
                    <Text type="secondary">Please wait, your report is being prepared…</Text>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', background: '#fff', borderRadius: '12px', border: '1px solid #f0f0f0' }}>
              <Empty description={
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                  <Text type="secondary">No item selected</Text>
                  <Text type="secondary" style={{ fontSize: '12px' }}>Choose a product or part from the sidebar to view quality details</Text>
                </div>
              } image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </div>
          )}
        </Content>
      </Layout>
    </div>
  );
};

export default QualityManagement;
