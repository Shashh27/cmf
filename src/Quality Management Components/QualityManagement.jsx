import React, { useState, useEffect, useMemo } from 'react';
import { Layout, Button, Modal, Table, Spin, Drawer, message, Select, Alert, Tooltip, Tabs, Input, Card, Tag, Typography, Empty, Space } from 'antd';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { MenuOutlined, AppstoreOutlined, ShoppingCartOutlined, ClusterOutlined, ToolOutlined, InfoCircleOutlined, EyeOutlined, BuildOutlined, CheckCircleOutlined, CloudDownloadOutlined, EditOutlined, FilePdfOutlined, LeftOutlined, RightOutlined } from "@ant-design/icons";
import QualityManagementBOM from './QualityManagementBOM';
import axios from 'axios';
import { QUALITY_API_BASE_URL } from '../Config/qualityconfig';
import ExcelJS from 'exceljs';
import InteractiveDrawing from './InspectorComponents/InteractiveDrawing';
import { parseMasterBocBboxToPdfRect } from './InspectorComponents/bocMappers';


const { Sider, Content } = Layout;
const { Text, Title } = Typography;

/** Matches new "Balloon document" uploads and legacy BALOON / typo baloon. */
function isBalloonOperationDocument(d) {
  if (!d) return false;
  const t = String(d.document_type || '').trim().toLowerCase();
  return t === 'baloon' || t === 'balloon' || t.includes('balloon');
}

/** PDF iframes in preview/review: hide toolbar and left thumbnail/outline pane (Adobe-style open params). */
function pdfEmbedSrcForReview(url) {
  if (!url) return '';
  const base = url.split('#')[0];
  return `${base}#toolbar=0&navpanes=0&pagemode=none`;
}

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
  const [measureModalOpen, setMeasureModalOpen] = useState(false);
  const [measureModalLoading, setMeasureModalLoading] = useState(false);
  const [measureRows, setMeasureRows] = useState([]);
  const [measureQtyOptions, setMeasureQtyOptions] = useState([{ value: 1, label: 'Qty 1' }]);
  const [measureQty, setMeasureQty] = useState(1);
  const [measureQtyInput, setMeasureQtyInput] = useState('');

  useEffect(() => {
    setMeasureQtyInput(measureQty === 'consolidated' ? 'ALL' : String(measureQty));
  }, [measureQty]);

  const handleMeasureQtySubmit = () => {
    const val = (measureQtyInput || '').trim().toUpperCase();
    if (!val) {
      setMeasureQtyInput(measureQty === 'consolidated' ? 'ALL' : String(measureQty));
      return;
    }
    if (val === 'ALL' || val === 'CONSOLIDATED') {
      setMeasureQty('consolidated');
      return;
    }
    const n = parseInt(val, 10);
    const max = measureQtyOptions.filter(o => typeof o.value === 'number').length;
    if (Number.isNaN(n) || n < 1 || n > max) {
      message.warning(`Quantity ${val} does not exist (Max: ${max})`);
      setMeasureQtyInput(measureQty === 'consolidated' ? 'ALL' : String(measureQty));
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

  const [reportPrintData, setReportPrintData] = useState(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportQty, setReportQty] = useState('consolidated');
  const [reportQtyOptions, setReportQtyOptions] = useState([]);
  const [reportContext, setReportContext] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
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

  const handleGenerateReport = async (record, isPartReport = false) => {
    const opNo = parseOpNo(record);
    if (isSupervisorView && inspectionPlanByOp[opNo] !== 'confirmed') {
        message.warning('Please confirm the inspection plan before generating a report.');
        return;
    }

    const partPk = selectedItem.id;
    const oid = Number(effectiveOrderId);
    
    setReportModalOpen(true);
    setReportLoading(true);
    
    try {
        let qtyMax = 1;
        try {
            const p = await axios.get(`${QUALITY_API_BASE_URL}/parts/${partPk}`);
            const q = Number(p.data?.qty);
            if (Number.isFinite(q) && q >= 1) qtyMax = Math.min(999, Math.floor(q));
        } catch {
            qtyMax = 1;
        }

        const qOpts = Array.from({ length: qtyMax }, (_, i) => ({ value: i + 1, label: `Qty ${i + 1}` }));
        qOpts.push({ value: 'consolidated', label: 'Consolidated' });
        setReportQtyOptions(qOpts);
        setReportQty(1);

        setReportContext({
            opNo,
            partPk,
            oid,
            record,
            qtyMax,
            isPartReport,
            partNumber: selectedItem.part_number
        });
    } catch (error) {
        console.error(error);
        message.error("Failed to initialize report.");
        setReportModalOpen(false);
    }
  };
  useEffect(() => {
    if (!reportModalOpen || !reportContext) return;
    let cancelled = false;

    const fetchReportData = async () => {
      setReportLoading(true);
      try {
        const { opNo, partPk, oid, record, partNumber, qtyMax } = reportContext;

        const masterRes = await axios.get(`${QUALITY_API_BASE_URL}/quality/master-boc`, {
          params: { part_id: partNumber, sales_order_id: oid, op_no: opNo }
        });
        const chars = masterRes.data || [];

        let outcomes = [];

        if (reportQty === 'consolidated') {
          const allQtys = Array.from({ length: qtyMax }, (_, i) => i + 1);
          outcomes = await Promise.all(allQtys.map(async (q) => {
            try {
              const res = await axios.get(`${QUALITY_API_BASE_URL}/quality/stage-inspection`, {
                params: { part_id: partPk, sale_order_id: oid, op_no: opNo, quantity_no: q }
              });
              return { qty: q, data: res.data || [] };
            } catch {
              return { qty: q, data: [] };
            }
          }));
        } else {
          try {
            const res = await axios.get(`${QUALITY_API_BASE_URL}/quality/stage-inspection`, {
              params: { part_id: partPk, sale_order_id: oid, op_no: opNo, quantity_no: reportQty }
            });
            outcomes = [{ qty: reportQty, data: res.data || [] }];
          } catch {
            outcomes = [{ qty: reportQty, data: [] }];
          }
        }

        if (cancelled) return;

        let reportRows = [];
        if (reportQty === 'consolidated') {
          let sno = 1;
          outcomes.forEach(o => {
            const qtyNum = o.qty;
            const qtyList = o.data;
            chars.forEach(ch => {
              const m = qtyList.find(row => {
                try {
                  const bboxObj = JSON.parse(row.bbox || '{}');
                  return bboxObj.master_boc_id === ch.id;
                } catch(e) { return false; }
              });
              
              const rowNominal = m ? (m.nominal_value ?? ch.nominal) : ch.nominal;
              const rowUpper = m ? (m.uppertol ?? ch.uppertol) : ch.uppertol;
              const rowLower = m ? (m.lowertol ?? ch.lowertol) : ch.lowertol;

              reportRows.push({
                sno: sno++,
                qty: qtyNum,
                specified: `${ch.dimension_type || 'Dim'}: ${rowNominal} (${fmtTol(rowUpper)}/${fmtTol(rowLower)})`,
                zone: ch.zone || '',
                measurements: m?.measurements || [],
                instrument: m?.measured_instrument || ch.measured_instrument || 'default',
                remarks: m?.remarks || ''
              });
            });
          });
        } else {
          const qtyData = outcomes[0];
          const qtyList = qtyData?.data || [];
          reportRows = chars.map((ch, idx) => {
            const m = qtyList.find(row => {
              try {
                const bboxObj = JSON.parse(row.bbox || '{}');
                return bboxObj.master_boc_id === ch.id;
              } catch(e) { return false; }
            });
            
            const rowNominal = m ? (m.nominal_value ?? ch.nominal) : ch.nominal;
            const rowUpper = m ? (m.uppertol ?? ch.uppertol) : ch.uppertol;
            const rowLower = m ? (m.lowertol ?? ch.lowertol) : ch.lowertol;

            return {
              sno: idx + 1,
              specified: `${ch.dimension_type || 'Dim'}: ${rowNominal} (${fmtTol(rowUpper)}/${fmtTol(rowLower)})`,
              zone: ch.zone || '',
              measurements: m?.measurements || [],
              instrument: m?.measured_instrument || ch.measured_instrument || 'default',
              remarks: m?.remarks || ''
            };
          });
        }

        const hierarchy = productHierarchies[selectedItem.productId];
        const projectName = hierarchy?.product?.product_name || '';
        const assembly = selectedItem.assembly_name || 'Main';

        const maxSamples = Math.max(3, ...reportRows.map(r => (r.measurements || []).length));
        const totalCols = (reportQty === 'consolidated' ? 1 : 0) + 10 + maxSamples;
        
        setReportPrintData({
          reportNo: `RPT-${oid}-${opNo}`,
          componentTitle: selectedItem.part_name,
          date: new Date().toLocaleDateString(),
          projectNo: oid,
          drgNo: selectedItem.part_number,
          sheet: '1 of 1',
          projectName: projectName,
          totalQuantity: reportQty === 'consolidated' ? 'Consolidated' : String(reportQty),
          assembly: assembly,
          rows: reportRows,
          maxSamples: maxSamples,
          totalCols: totalCols,
          approvedBy: inspectionPlanConfirmedByOp[opNo] || '—'
        });

      } catch (error) {
        console.error(error);
        if (!cancelled) message.error("Failed to generate report data.");
      } finally {
        if (!cancelled) setReportLoading(false);
      }
    };

    fetchReportData();
    return () => { cancelled = true; };
  }, [reportModalOpen, reportContext, reportQty, selectedItem, inspectionPlanConfirmedByOp, productHierarchies]);

  const handleExportExcel = async () => {
    if (!reportPrintData) return;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Inspection Report');

    const maxS = reportPrintData.maxSamples || 3;
    const isConsolidated = reportPrintData.totalQuantity === 'Consolidated';
    const totalCols = reportPrintData.totalCols || (isConsolidated ? 14 : 13);

    // Column Index Mapping
    const COL_SL = 1;
    const COL_SPEC_START = 2;
    const COL_SPEC_END = 3;
    const COL_QTY = isConsolidated ? 4 : null;
    const COL_ZONE = isConsolidated ? 5 : 4;
    const COL_MEASURED_START = isConsolidated ? 6 : 5;
    const COL_MEASURED_END = COL_MEASURED_START + maxS - 1;
    const COL_INSTR_START = COL_MEASURED_END + 1;
    const COL_INSTR_END = COL_INSTR_START + 1;
    const COL_REMARKS_START = COL_INSTR_END + 1;
    const COL_REMARKS_END = totalCols - 1; // Last but one
    const COL_TRAILING = totalCols;

    const getColLetter = (n) => {
      let s = "";
      while (n > 0) {
        let r = (n - 1) % 26;
        s = String.fromCharCode(65 + r) + s;
        n = Math.floor((n - 1) / 26);
      }
      return s;
    };

    const cols = [];
    for (let i = 1; i <= totalCols; i++) {
      if (i === COL_SL) cols.push({ width: 20 });
      else if (i >= COL_SPEC_START && i <= COL_SPEC_END) cols.push({ width: 14 });
      else if (i === COL_ZONE || i === COL_QTY) cols.push({ width: 10 });
      else if (i >= COL_MEASURED_START && i <= COL_MEASURED_END) cols.push({ width: 14 });
      else if (i >= COL_INSTR_START && i <= COL_INSTR_END) cols.push({ width: 14 });
      else if (i >= COL_REMARKS_START && i <= COL_REMARKS_END) cols.push({ width: 18 });
      else if (i === COL_TRAILING) cols.push({ width: 5 });
      else cols.push({ width: 14 });
    }
    worksheet.columns = cols;

    const thin = { style: 'thin' };
    const bs = { top: thin, left: thin, bottom: thin, right: thin };

    const applyBorder = (cell) => { cell.border = bs; };
    const applyBorderRange = (startCol, endCol, row) => {
      for (let i = startCol; i <= endCol; i++) {
        applyBorder(worksheet.getCell(`${getColLetter(i)}${row}`));
      }
    };

    const styleHeader = (cell, fontSize = 11) => {
      cell.font = { bold: true, size: fontSize };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
      applyBorder(cell);
    };

    // ── Row 1: Logo and Title ──
    const cmtiCell = worksheet.getCell('A1');
    applyBorder(cmtiCell);
    try {
      // const logoRes = await fetch(cmtiLogo);
      if (logoRes.ok) {
        const buf = await logoRes.arrayBuffer();
        const imageId = workbook.addImage({ buffer: buf, extension: 'png' });
        worksheet.addImage(imageId, {
          tl: { col: 0, row: 0 },
          ext: { width: 88, height: 28 },
        });
      }
    } catch {}

    worksheet.mergeCells(`${getColLetter(COL_SPEC_START)}1:${getColLetter(COL_TRAILING)}1`);
    const titleCell = worksheet.getCell('B1');
    titleCell.value = 'INSPECTION REPORT';
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    applyBorderRange(1, totalCols, 1);
    worksheet.getRow(1).height = 30;

    // ── Rows 2-4: Meta fields ──
    const metaRows = [
      { row: 2, l1: 'Report No :',   v1: reportPrintData.reportNo,       l2: 'Component Title:', v2: reportPrintData.componentTitle, l3: 'Date:',     v3: reportPrintData.date               },
      { row: 3, l1: 'Project No.:', v1: reportPrintData.projectNo,       l2: 'Drg No:',          v2: reportPrintData.drgNo,          l3: 'Sheet',      v3: reportPrintData.sheet || '1 of 1' },
      { row: 4, l1: 'Project Name:', v1: reportPrintData.projectName,    l2: 'Quantity:',        v2: reportPrintData.totalQuantity,  l3: 'Assembly',   v3: reportPrintData.assembly           },
    ];

    metaRows.forEach(({ row, l1, v1, l2, v2, l3, v3 }) => {
      const label1 = worksheet.getCell(`A${row}`);
      label1.value = l1; label1.font = { bold: true, size: 10 }; 
      label1.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 }; 
      applyBorder(label1);

      const split1 = Math.floor((COL_ZONE - COL_SPEC_START + 1) / 2) + COL_SPEC_START;
      worksheet.mergeCells(`${getColLetter(COL_SPEC_START)}${row}:${getColLetter(COL_ZONE)}${row}`);
      const val1 = worksheet.getCell(`${getColLetter(COL_SPEC_START)}${row}`);
      val1.value = v1; val1.alignment = { horizontal: 'center', vertical: 'middle' }; 
      applyBorderRange(COL_SPEC_START, COL_ZONE, row);

      const label2 = worksheet.getCell(`${getColLetter(COL_MEASURED_START)}${row}`);
      label2.value = l2; label2.font = { bold: true, size: 10 }; 
      label2.alignment = { horizontal: 'right', vertical: 'middle' }; 
      applyBorder(label2);

      worksheet.mergeCells(`${getColLetter(COL_MEASURED_START + 1)}${row}:${getColLetter(COL_MEASURED_END)}${row}`);
      const val2 = worksheet.getCell(`${getColLetter(COL_MEASURED_START + 1)}${row}`);
      val2.value = v2; val2.alignment = { horizontal: 'center', vertical: 'middle' }; 
      applyBorderRange(COL_MEASURED_START, COL_MEASURED_END, row);

      const label3 = worksheet.getCell(`${getColLetter(COL_INSTR_START)}${row}`);
      label3.value = l3; label3.font = { bold: true, size: 10 }; 
      label3.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 }; 
      applyBorder(label3);

      worksheet.mergeCells(`${getColLetter(COL_INSTR_START + 1)}${row}:${getColLetter(COL_TRAILING)}${row}`);
      const val3 = worksheet.getCell(`${getColLetter(COL_INSTR_START + 1)}${row}`);
      val3.value = v3; val3.alignment = { horizontal: 'center', vertical: 'middle' }; 
      applyBorderRange(COL_INSTR_START, COL_TRAILING, row);
      worksheet.getRow(row).height = 22;
    });

    // ── Rows 5-6: Table Header ──
    worksheet.mergeCells('A5:A6');
    styleHeader(worksheet.getCell('A5')); worksheet.getCell('A5').value = 'Sl No';

    worksheet.mergeCells(`${getColLetter(COL_SPEC_START)}5:${getColLetter(COL_SPEC_END)}6`);
    styleHeader(worksheet.getCell(`${getColLetter(COL_SPEC_START)}5`)); 
    worksheet.getCell(`${getColLetter(COL_SPEC_START)}5`).value = 'Specified Values';
    applyBorderRange(COL_SPEC_START, COL_SPEC_END, 5); applyBorderRange(COL_SPEC_START, COL_SPEC_END, 6);

    if (isConsolidated) {
      worksheet.mergeCells(`${getColLetter(COL_QTY)}5:${getColLetter(COL_QTY)}6`);
      styleHeader(worksheet.getCell(`${getColLetter(COL_QTY)}5`)); worksheet.getCell(`${getColLetter(COL_QTY)}5`).value = 'Qty';
    }

    worksheet.mergeCells(`${getColLetter(COL_ZONE)}5:${getColLetter(COL_ZONE)}6`);
    styleHeader(worksheet.getCell(`${getColLetter(COL_ZONE)}5`)); worksheet.getCell(`${getColLetter(COL_ZONE)}5`).value = 'Zone';

    worksheet.mergeCells(`${getColLetter(COL_MEASURED_START)}5:${getColLetter(COL_MEASURED_END)}5`);
    styleHeader(worksheet.getCell(`${getColLetter(COL_MEASURED_START)}5`)); worksheet.getCell(`${getColLetter(COL_MEASURED_START)}5`).value = 'Measured Values';
    applyBorderRange(COL_MEASURED_START, COL_MEASURED_END, 5);
    for (let i = 0; i < maxS; i++) {
      const c = worksheet.getCell(`${getColLetter(COL_MEASURED_START + i)}6`);
      c.value = i + 1; styleHeader(c);
    }

    worksheet.mergeCells(`${getColLetter(COL_INSTR_START)}5:${getColLetter(COL_INSTR_END)}6`);
    styleHeader(worksheet.getCell(`${getColLetter(COL_INSTR_START)}5`)); worksheet.getCell(`${getColLetter(COL_INSTR_START)}5`).value = 'Instrument';
    applyBorderRange(COL_INSTR_START, COL_INSTR_END, 5); applyBorderRange(COL_INSTR_START, COL_INSTR_END, 6);

    worksheet.mergeCells(`${getColLetter(COL_REMARKS_START)}5:${getColLetter(COL_TRAILING)}6`);
    styleHeader(worksheet.getCell(`${getColLetter(COL_REMARKS_START)}5`)); worksheet.getCell(`${getColLetter(COL_REMARKS_START)}5`).value = 'Remarks';
    applyBorderRange(COL_REMARKS_START, COL_TRAILING, 5); applyBorderRange(COL_REMARKS_START, COL_TRAILING, 6);

    let cur = 7;
    reportPrintData.rows.forEach(r => {
      worksheet.getCell(`A${cur}`).value = r.sno;
      worksheet.mergeCells(`${getColLetter(COL_SPEC_START)}${cur}:${getColLetter(COL_SPEC_END)}${cur}`);
      worksheet.getCell(`${getColLetter(COL_SPEC_START)}${cur}`).value = r.specified;
      worksheet.getCell(`${getColLetter(COL_SPEC_START)}${cur}`).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      
      if (isConsolidated) {
        worksheet.getCell(`${getColLetter(COL_QTY)}${cur}`).value = r.qty;
      }
      worksheet.getCell(`${getColLetter(COL_ZONE)}${cur}`).value = r.zone;
      for (let i = 0; i < maxS; i++) {
        worksheet.getCell(`${getColLetter(COL_MEASURED_START + i)}${cur}`).value = r.measurements[i] || '';
      }
      worksheet.mergeCells(`${getColLetter(COL_INSTR_START)}${cur}:${getColLetter(COL_INSTR_END)}${cur}`);
      worksheet.getCell(`${getColLetter(COL_INSTR_START)}${cur}`).value = r.instrument || 'default';
      worksheet.mergeCells(`${getColLetter(COL_REMARKS_START)}${cur}:${getColLetter(COL_TRAILING)}${cur}`);
      worksheet.getCell(`${getColLetter(COL_REMARKS_START)}${cur}`).value = r.remarks || '';
      worksheet.getCell(`${getColLetter(COL_REMARKS_START)}${cur}`).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

      for (let i = 1; i <= totalCols; i++) {
        const c = worksheet.getCell(`${getColLetter(i)}${cur}`);
        c.border = bs;
        if (i === COL_SL || i === COL_ZONE || i === COL_QTY || (i >= COL_MEASURED_START && i <= COL_MEASURED_END) || (i >= COL_INSTR_START && i <= COL_INSTR_END)) {
           c.alignment = { horizontal: 'center', vertical: 'middle' };
        }
      }
      worksheet.getRow(cur).height = 20;
      cur++;
    });

    const testTitleRow = cur;
    const testSectionColor = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
    const chunk = Math.floor(totalCols / 3);
    
    worksheet.mergeCells(`A${testTitleRow}:${getColLetter(chunk)}${testTitleRow}`);
    const chemTitle = worksheet.getCell(`A${testTitleRow}`);
    chemTitle.value = 'Chemical Test';
    chemTitle.font = { bold: true }; chemTitle.alignment = { horizontal: 'center', vertical: 'middle' };
    chemTitle.fill = testSectionColor;
    applyBorderRange(1, chunk, testTitleRow);

    worksheet.mergeCells(`${getColLetter(chunk + 1)}${testTitleRow}:${getColLetter(chunk * 2)}${testTitleRow}`);
    const ultTitle = worksheet.getCell(`${getColLetter(chunk + 1)}${testTitleRow}`);
    ultTitle.value = 'Ultrasonic Test';
    ultTitle.font = { bold: true }; ultTitle.alignment = { horizontal: 'center', vertical: 'middle' };
    ultTitle.fill = testSectionColor;
    applyBorderRange(chunk + 1, chunk * 2, testTitleRow);

    worksheet.mergeCells(`${getColLetter(chunk * 2 + 1)}${testTitleRow}:${getColLetter(totalCols)}${testTitleRow}`);
    const hardTitle = worksheet.getCell(`${getColLetter(chunk * 2 + 1)}${testTitleRow}`);
    hardTitle.value = 'Hardness Test';
    hardTitle.font = { bold: true }; hardTitle.alignment = { horizontal: 'center', vertical: 'middle' };
    hardTitle.fill = testSectionColor;
    applyBorderRange(chunk * 2 + 1, totalCols, testTitleRow);

    worksheet.getRow(testTitleRow).height = 18;
    cur++;

    const writeTestRow = (row, chemL, ultL, hardL) => {
      const setTestCell = (colIdx, val, isLabel = false) => {
        const c = worksheet.getCell(`${getColLetter(colIdx)}${row}`);
        c.value = val;
        if (isLabel) {
           c.font = { bold: true };
           c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
           c.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
        } else {
           c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        }
        applyBorder(c);
      };
      setTestCell(1, chemL, true);
      applyBorderRange(2, chunk, row);
      setTestCell(chunk + 1, ultL, true);
      applyBorderRange(chunk + 2, chunk * 2, row);
      setTestCell(chunk * 2 + 1, hardL, true);
      applyBorderRange(chunk * 2 + 2, totalCols, row);
      worksheet.getRow(row).height = 18;
    };

    writeTestRow(cur, 'Date', 'Date', 'Date'); cur++;
    writeTestRow(cur, 'Report No', 'Report No', 'W.O.NO'); cur++;
    writeTestRow(cur, 'Authoriser', 'Authoriser', 'Hardness Value'); cur++;
    writeTestRow(cur, 'Status', 'Status', 'Status'); cur++;

    const footerRow = cur;
    const footChunk = Math.floor(totalCols / 3);
    worksheet.mergeCells(`A${footerRow}:${getColLetter(footChunk)}${footerRow + 2}`);
    const inspCell = worksheet.getCell(`A${footerRow}`);
    inspCell.value = { richText: [{ font: { bold: true }, text: 'Inspected by:' }] };
    inspCell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 };
    applyBorderRange(1, footChunk, footerRow); applyBorderRange(1, footChunk, footerRow+1); applyBorderRange(1, footChunk, footerRow+2);

    worksheet.mergeCells(`${getColLetter(footChunk + 1)}${footerRow}:${getColLetter(footChunk * 2)}${footerRow + 2}`);
    const checkCell = worksheet.getCell(`${getColLetter(footChunk + 1)}${footerRow}`);
    checkCell.value = { richText: [{ font: { bold: true }, text: 'Checked by:' }] };
    checkCell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 };
    applyBorderRange(footChunk + 1, footChunk * 2, footerRow); applyBorderRange(footChunk + 1, footChunk * 2, footerRow+1); applyBorderRange(footChunk + 1, footChunk * 2, footerRow+2);

    worksheet.mergeCells(`${getColLetter(footChunk * 2 + 1)}${footerRow}:${getColLetter(totalCols)}${footerRow + 2}`);
    applyBorderRange(footChunk * 2 + 1, totalCols, footerRow); applyBorderRange(footChunk * 2 + 1, totalCols, footerRow+1); applyBorderRange(footChunk * 2 + 1, totalCols, footerRow+2);

    worksheet.getRow(footerRow).height = 20;
    worksheet.getRow(footerRow + 1).height = 20;
    worksheet.getRow(footerRow + 2).height = 20;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Inspection_Report_${reportPrintData.reportNo}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
    message.success('Excel report downloaded successfully!');
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
      setOperations(ops);
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

  const getDrawingInfo = (op) => {
    const isDrawing = (d) => {
      if (!d) return false;
      if (isBalloonOperationDocument(d)) return false;
      const type = (d.document_type || "").toLowerCase();
      const name = (d.document_name || "").toLowerCase();
      const url = (d.document_url || "").toLowerCase();
      const isPdfFile = url.endsWith('.pdf') || type.includes('pdf');
      return type.includes('2d') || type.includes('drawing') || name.includes('drawing') || isPdfFile || url.endsWith('.png') || url.endsWith('.jpg') || url.endsWith('.jpeg');
    };

    const nonBalloonOpDocs = (op.operation_documents || []).filter((d) => !isBalloonOperationDocument(d));
    const nonBalloonPartDocs = partDocuments.filter((d) => !isBalloonOperationDocument(d));
    const partDrawing = nonBalloonPartDocs.find(isDrawing);
    const opDrawing = nonBalloonOpDocs.find(isDrawing);
    const previewDrawing =
      opDrawing || partDrawing ||
      nonBalloonOpDocs[0] || nonBalloonPartDocs[0] ||
      (op.operation_documents || [])[0] || partDocuments[0];

    if (!previewDrawing) return { url: null, isPdf: false, name: '', apiDocumentId: null };

    const isPdf =
      (previewDrawing.document_url || "").toLowerCase().endsWith('.pdf') ||
      (previewDrawing.document_type || "").toLowerCase().includes('pdf');

    const endpoint = previewDrawing.operation_id != null ? 'operation-documents' : 'documents';

    return {
      url: `${QUALITY_API_BASE_URL}/${endpoint}/${previewDrawing.id}/preview`,
      isPdf,
      name: previewDrawing.document_name,
      apiDocumentId: previewDrawing.id,
    };
  };

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

  const fmt2 = (value) => {
    const n = parseNum(value);
    return n == null ? '—' : n.toFixed(2);
  };

  const measureDecoratedRows = useMemo(() => {
    // 1. If we have master rows, use them as the structural base (standard single-qty view)
    if (measureMasterRows && measureMasterRows.length > 0 && !measurePartMode && measureQty !== 'consolidated') {
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
        
        const nominal = parseNum(row.nominal_value);
        const upper = parseNum(row.uppertol);
        const lower = parseNum(row.lowertol);
        const mean = computeMeanFromMeasurements(row);
        const upperLimit = nominal != null && upper != null ? nominal + upper : null;
        const lowerLimit = nominal != null && lower != null ? nominal + lower : null;
        const hasTolerance = Math.abs(upper || 0) > 1e-12 || Math.abs(lower || 0) > 1e-12;
        const withinTolerance =
          hasTolerance &&
          mean != null &&
          upperLimit != null &&
          lowerLimit != null &&
          mean <= upperLimit &&
          mean >= lowerLimit;
        const outOfTolerance = hasTolerance && mean != null && !withinTolerance;
        const status = !hasTolerance ? 'no_tolerance' : withinTolerance ? 'within' : outOfTolerance ? 'out' : 'pending';
        return { ...row, _upperLimit: upperLimit, _lowerLimit: lowerLimit, _computedMean: mean, _status: status };
      });
    }

    // 2. Fallback to mapping measureRows directly (Consolidated or Part Overview)
    return (measureRows || []).map((r) => {
      const nominal = parseNum(r.nominal_value);
      const upper = parseNum(r.uppertol);
      const lower = parseNum(r.lowertol);
      const mean = computeMeanFromMeasurements(r);
      const upperLimit = nominal != null && upper != null ? nominal + upper : null;
      const lowerLimit = nominal != null && lower != null ? nominal + lower : null;
      const hasTolerance = Math.abs(upper || 0) > 1e-12 || Math.abs(lower || 0) > 1e-12;
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
  }, [measureRows, measureMasterRows, measurePartMode, measureQty]);

  /** Every BOC row for the selected quantity has #1–#3 empty — no real measurements yet. */
  const measureAllReadingsEmpty = useMemo(() => {
    if (!measureRows?.length) return false;
    return measureRows.every((r) => !rowHasMeasured123(r));
  }, [measureRows]);

  const measureSummary = useMemo(() => {
    const total = measureDecoratedRows.length;
    const within = measureDecoratedRows.filter((r) => r._status === 'within').length;
    const out = measureDecoratedRows.filter((r) => r._status === 'out').length;
    const noTol = measureDecoratedRows.filter((r) => r._status === 'no_tolerance').length;
    const passRate = total ? ((within / total) * 100).toFixed(1) : '0.0';
    return { total, within, out, noTol, passRate };
  }, [measureDecoratedRows]);

  const ftpApproveDecoratedRows = useMemo(() => {
    return (ftpApproveRows || []).map((r) => {
      const nominal = parseNum(r.nominal_value);
      const upper = parseNum(r.uppertol);
      const lower = parseNum(r.lowertol);
      const mean = computeMeanFromMeasurements(r);
      const upperLimit = nominal != null && upper != null ? nominal + upper : null;
      const lowerLimit = nominal != null && lower != null ? nominal + lower : null;
      const hasTolerance = Math.abs(upper || 0) > 1e-12 || Math.abs(lower || 0) > 1e-12;
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
      const vals = (r.measurements || []).map(m => parseNum(m)).filter(v => v != null);
      return vals.length >= 3;
      // Relaxed from >= 3 to >= 1 to allow FTP approval even if fewer samples are entered
      return vals.length >= 1;
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
        if (canNavigateToOthers) {
          qOpts.push({ value: 'consolidated', label: 'Consolidated' });
        }
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
        
        // 2. Determine which quantities to fetch (Specific Qty or All for Consolidated)
        const qtysToFetch = measureQty === 'consolidated' 
          ? measureQtyOptions.filter(o => typeof o.value === 'number').map(o => o.value)
          : [measureQty];

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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <Title level={3} style={{ margin: 0 }}>
                  {selectedItem.itemType === 'product' ? selectedItem.product_name : 
                   selectedItem.itemType === 'assembly' ? selectedItem.assembly_name : 
                   selectedItem.part_name}
                  {selectedItem.itemType === 'part' && (
                    <Space size={0}>
                      <Button 
                        type="link" 
                        icon={<EyeOutlined />} 
                        onClick={handlePreviewPart}
                        style={{ marginLeft: '12px' }}
                      >
                        View Part Drawing
                      </Button>
                      <Button 
                        type="link" 
                        icon={<CheckCircleOutlined />} 
                        onClick={() => handleOpenPartInspection()}
                      >
                        Part Inspection
                      </Button>
                      <Button 
                        type="link" 
                        icon={<AppstoreOutlined />} 
                        onClick={() => handleOpenPartMeasurement()}
                      >
                        Part Measurement
                      </Button>
                      <Button 
                        type="link" 
                        icon={<CloudDownloadOutlined />} 
                        onClick={() => handleOpenPartReport()}
                      >
                        Part Report
                      </Button>
                    </Space>
                  )}
                </Title>
                <Space>
                  <Tag color="blue">{selectedItem.itemType.toUpperCase()}</Tag>
                </Space>
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
                          <Table 
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
                                title: 'Req qty',
                                dataIndex: 'required_quantity',
                                key: 'required_quantity',
                                align: 'center'
                              },
                              {
                                title: 'Comp qty',
                                dataIndex: 'completed_quantity',
                                key: 'completed_quantity',
                                align: 'center'
                              },
                              {
                                title: 'Acpt qty',
                                dataIndex: 'accepted_quantity',
                                key: 'accepted_quantity',
                                align: 'center'
                              },
                              {
                                title: 'Rej qty',
                                dataIndex: 'rejected_quantity',
                                key: 'rejected_quantity',
                                align: 'center'
                              },
                              {
                                title: 'Yield %',
                                dataIndex: 'yield_percentage',
                                key: 'yield_percentage',
                                align: 'center',
                                render: val => (
                                  <Text style={{ color: val >= 95 ? '#52c41a' : val < 80 ? '#f5222d' : '#faad14', fontWeight: 'bold' }}>
                                    {val ? `${val}%` : '0%'}
                                  </Text>
                                )
                              },
                              {
                                title: 'Actions',
                                key: 'actions',
                                fixed: 'right',
                                render: (_, record) => {
                                  const opNo = parseOpNo(record);
                                  const st = inspectionPlanByOp[opNo];
                                  const ftpStatus = ftpStatusByOp[opNo] || null;
                                  const planLabel = st === 'confirmed' ? 'View Plan' : st === 'draft' ? 'Continue Plan' : 'Create Plan';
                                  const PlanIcon = st === 'confirmed' ? EyeOutlined : BuildOutlined;
                                  return (
                                  <Space size="middle">
                                    <Button 
                                      size="small" 
                                      type="primary" 
                                      ghost 
                                      icon={<PlanIcon />}
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
                                    <Button 
                                      size="small" 
                                      icon={<CheckCircleOutlined />} 
                                      style={{ color: '#52c41a', borderColor: '#52c41a' }}
                                      onClick={() => openMeasurementsModal(record)}
                                    >
                                      Measurements
                                    </Button>

                                    <Button 
                                      size="small" 
                                      type="primary" 
                                      ghost 
                                      icon={<FilePdfOutlined />} 
                                      onClick={() => handleGenerateReport(record)}
                                    >
                                      Generate Report
                                    </Button>

                                    <Button 
                                      size="small" 
                                      icon={<EyeOutlined />} 
                                      onClick={() => handlePreviewOperation(record)}
                                      title="View Drawing"
                                    >
                                      View Drawing
                                    </Button>
                                  </Space>
                                  );
                                },
                              },
                            ]}
                          />
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
                <div style={{ display: 'grid', gridTemplateColumns: '1.45fr 1fr', gap: 14, height: '100%', fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace' }}>
                  <div style={{ border: '1px solid #dfe4ea', borderRadius: 10, overflow: 'hidden', background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '0 2px 10px rgba(15,23,42,0.04)' }}>
                    <div style={{ padding: '14px 16px', borderBottom: '1px solid #eef0f3', background: '#fafbfc', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                      <Text strong style={{ color: '#111827', fontSize: 22, lineHeight: 1.2, fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace' }}>Inspection Details</Text>
                      <div style={{ marginTop: 10, fontSize: 16, color: '#374151' }}>
                        <Text style={{ fontSize: 16, fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace' }}><b>Order:</b> {planViewMeta?.orderNo || '—'}</Text>
                        <Text style={{ fontSize: 16, marginLeft: 18, fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace' }}><b>Part:</b> {planViewMeta?.partNo || '—'}</Text>
                        <Text style={{ fontSize: 16, marginLeft: 18, fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace' }}><b>Operation:</b> {planViewMeta?.opNo || '—'}</Text>
                      </div>
                      </div>
                      {planViewCanEditBoc && !planViewLoading && (
                        <Button type="primary" icon={<EditOutlined />} onClick={handleEditPlanFromViewModal} style={{ flexShrink: 0 }}>
                          Edit plan (BOC)
                        </Button>
                      )}
                    </div>
                    <div style={{ padding: '0 10px 10px', flex: 1, minHeight: 0 }}>
                      <Table
                        size="small"
                        loading={planViewLoading}
                        dataSource={planTableRows}
                        rowKey="id"
                        pagination={{ pageSize: 14, showSizeChanger: false }}
                        scroll={{ x: 'max-content', y: 520 }}
                        rowClassName={(_, idx) => (idx % 2 === 0 ? 'plan-row-even' : 'plan-row-odd')}
                        onRow={(record) => ({
                          onClick: () => setActiveBalloonId(String(record.id)),
                          style: { cursor: 'pointer' }
                        })}
                        columns={[
                          { title: 'S.No', key: 'sno', width: 82, render: (_, __, idx) => <Text style={{ fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace', fontSize: 13 }}>{idx + 1}</Text> },
                          { title: 'Zone', dataIndex: 'zone', key: 'zone', width: 90, render: (z) => <Tag color="geekblue" style={{ margin: 0, borderRadius: 10, fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace' }}>{z || '—'}</Tag> },
                          {
                            title: 'Description',
                            dataIndex: 'dimension_type',
                            key: 'dimension_type',
                            width: 280,
                            render: (val) => (
                              <Tag
                                color={dimensionTypeTagColor(val)}
                                style={{ margin: 0, borderRadius: 10, fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace' }}
                              >
                                {val || '—'}
                              </Tag>
                            ),
                          },
                          { title: 'Nominal', dataIndex: 'nominal', key: 'nominal', width: 130, render: (v) => <Text style={{ fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace', color: '#1f2937', fontSize: 13 }}>{v ?? '—'}</Text> },
                          { title: 'Upper Tol', dataIndex: 'uppertol', key: 'uppertol', width: 130, render: (v) => <Text style={{ fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace', color: Number(v) > 0 ? '#15803d' : '#6b7280', fontSize: 13 }}>{fmtTol(v)}</Text> },
                          { title: 'Lower Tol', dataIndex: 'lowertol', key: 'lowertol', width: 130, render: (v) => <Text style={{ fontFamily: '"JetBrains Mono", "Consolas", "Courier New", monospace', color: Number(v) < 0 ? '#b91c1c' : '#6b7280', fontSize: 13 }}>{fmtTol(v)}</Text> },
                        ]}
                      />
                    </div>
                  </div>
                  <div style={{ border: '1px solid #dfe4ea', borderRadius: 10, overflow: 'hidden', background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '0 2px 10px rgba(15,23,42,0.04)' }}>
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
                              width: measureQtyInput === 'ALL' ? 32 : 24,
                              textAlign: measureQtyInput === 'ALL' ? 'center' : 'right',
                              fontSize: '11px',
                              fontWeight: 700,
                              color: '#334155',
                              padding: 0,
                              height: '22px',
                              fontFamily: '"JetBrains Mono", monospace',
                            }}
                          />
                          {measureQty !== 'consolidated' && (
                            <Text style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, userSelect: 'none' }}>
                              / {measureQtyOptions.filter(o => typeof o.value === 'number').length}
                            </Text>
                          )}
                        </div>
                        <Button
                          size="small"
                          type="text"
                          icon={<RightOutlined style={{ fontSize: 10 }} />}
                          disabled={measureQty === 'consolidated' || (measureQty === measureQtyOptions.filter(o => typeof o.value === 'number').length && !measureQtyOptions.some(o => o.value === 'consolidated'))}
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
                    ) : (
                      <>
                        <div style={{ padding: '8px 12px', borderBottom: '1px solid #eef0f3', background: '#fafbfc', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <Tag color="default" style={{ margin: 0, borderRadius: 12 }}>Total: {measureSummary.total}</Tag>
                          <Tag color="success" style={{ margin: 0, borderRadius: 12 }}>Within Tol: {measureSummary.within}</Tag>
                          <Tag color="error" style={{ margin: 0, borderRadius: 12 }}>Out Tol: {measureSummary.out}</Tag>
                          <Tag color="processing" style={{ margin: 0, borderRadius: 12 }}>No Tol: {measureSummary.noTol}</Tag>
                          <Tag color="blue" style={{ margin: 0, borderRadius: 12 }}>Pass Rate: {measureSummary.passRate}%</Tag>
                        </div>
                        <Table
                          size="small"
                          loading={measureModalLoading}
                          dataSource={measureDecoratedRows}
                          rowKey="id"
                          pagination={{ pageSize: 10, showSizeChanger: false, hideOnSinglePage: true }}
                          scroll={{ x: 'max-content', y: Math.min(480, Math.max(160, measureDecoratedRows.length * 44 + 70)) }}
                          columns={[
                            { title: 'S.No', key: 'sno', width: 60, fixed: 'left', render: (_, __, idx) => idx + 1 },
                            ...(measurePartMode ? [{
                              title: 'Operation',
                              dataIndex: '_op_no',
                              key: '_op_no',
                              width: 150,
                              render: (v, r) => <Text style={{ fontSize: 11 }}><b>OP {v}</b> ({r._op_name})</Text>
                            }] : []),
                            ...(measureQty === 'consolidated' ? [{
                              title: 'Qty',
                              dataIndex: '_qty_no',
                              key: '_qty_no',
                              width: 80,
                              render: (v) => <Tag color="cyan">Qty {v}</Tag>
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
                                    render: (v) => <Text style={{ fontSize: 11 }}>{v || '—'}</Text>
                                  }))
                                },
                                {
                                  title: 'Mean',
                                  key: 'mean_computed',
                                  width: 100,
                                  render: (_, r) => {
                                    const m = r._computedMean;
                                    const display = m == null ? '—' : fmt2(m);
                                    if (r._status === 'within') return <Text strong style={{ color: '#15803d' }}>{display}</Text>;
                                    if (r._status === 'out') return <Text strong style={{ color: '#dc2626' }}>{display}</Text>;
                                    return <Text style={{ color: '#4b5563' }}>{display}</Text>;
                                  },
                                },
                                {
                                  title: 'Status',
                                  key: 'status',
                                  width: 120,
                                  render: (_, r) => {
                                    if (r._status === 'within') return <Tag color="success" style={{ margin: 0, borderRadius: 10 }}>Within Tol</Tag>;
                                    if (r._status === 'out') return <Tag color="error" style={{ margin: 0, borderRadius: 10 }}>Out Tol</Tag>;
                                    if (r._status === 'no_tolerance') return <Tag color="processing" style={{ margin: 0, borderRadius: 10 }}>No Tol</Tag>;
                                    return <Tag style={{ margin: 0, borderRadius: 10 }}>Pending</Tag>;
                                  },
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
                            <div style={{ padding: 40 }}>
                              <Empty description="No measurements found or incomplete data" />
                            </div>
                          ) : (
                            <>
                              <div style={{ padding: '8px 12px', borderBottom: '1px solid #eef0f3', background: '#fafbfc', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                <Tag color="default" style={{ margin: 0, borderRadius: 12 }}>Total: {ftpApproveSummary.total}</Tag>
                                <Tag color="success" style={{ margin: 0, borderRadius: 12 }}>Within Tol: {ftpApproveSummary.within}</Tag>
                                <Tag color="error" style={{ margin: 0, borderRadius: 12 }}>Out Tol: {ftpApproveSummary.out}</Tag>
                                <Tag color="processing" style={{ margin: 0, borderRadius: 12 }}>No Tol: {ftpApproveSummary.noTol}</Tag>
                                <Tag color="blue" style={{ margin: 0, borderRadius: 12 }}>Pass Rate: {ftpApproveSummary.passRate}%</Tag>
                              </div>
                              <Table
                                size="small"
                                loading={ftpApproveLoading}
                                dataSource={ftpApproveDecoratedRows}
                                rowKey="id"
                                pagination={false}
                                scroll={{ x: 'max-content', y: 460 }}
                                onRow={(record) => ({
                                  onClick: () => setActiveBalloonId(String(record.id)),
                                  style: { cursor: 'pointer' }
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
                                    render: (v) => <Text style={{ fontSize: 11 }}>{v || '—'}</Text>
                                  }))
                                },
                                      {
                                        title: 'Mean',
                                        key: 'mean_c',
                                        width: 96,
                                        render: (_, r) => {
                                          const m = r._computedMean;
                                          const display = m == null ? '—' : fmt2(m);
                                          if (r._status === 'within') return <Text strong style={{ color: '#15803d' }}>{display}</Text>;
                                          if (r._status === 'out') return <Text strong style={{ color: '#dc2626' }}>{display}</Text>;
                                          return <Text style={{ color: '#4b5563' }}>{display}</Text>;
                                        },
                                      },
                                      {
                                        title: 'Status',
                                        key: 'st',
                                        width: 118,
                                        render: (_, r) => {
                                          if (r._status === 'within') return <Tag color="success" style={{ margin: 0, borderRadius: 10 }}>Within</Tag>;
                                          if (r._status === 'out') return <Tag color="error" style={{ margin: 0, borderRadius: 10 }}>Out Tol</Tag>;
                                          if (r._status === 'no_tolerance') return <Tag color="processing" style={{ margin: 0, borderRadius: 10 }}>No Tol</Tag>;
                                          return <Tag style={{ margin: 0, borderRadius: 10 }}>Pending</Tag>;
                                        },
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

              {/* CMTI Inspection Report Preview/Print Modal */}
              <Modal
                title={
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: 24 }}>
                    <Text strong style={{ fontSize: 16 }}>Inspection Report Preview</Text>
                    <Space>
                      <Text strong>Report Data:</Text>
                      <Select
                        size="small"
                        style={{ width: 150 }}
                        value={reportQty}
                        options={reportQtyOptions}
                        onChange={setReportQty}
                      />
                    </Space>
                  </div>
                }
                open={reportModalOpen}
                onCancel={() => setReportModalOpen(false)}
                width={1200}
                centered
                footer={[
                  <Button key="close" onClick={() => setReportModalOpen(false)}>Close</Button>,
                  <Button key="excel" type="primary" icon={<CloudDownloadOutlined />} onClick={handleExportExcel} disabled={reportLoading}>Download Excel</Button>
                ]}
              >
                <Spin spinning={reportLoading}>
                  <div id="printable-report" style={{
                    fontFamily: '"Times New Roman", Times, serif',
                    color: '#000',
                    padding: '10px 12px',
                    background: '#fff',
                    border: '2px solid #000',
                    maxWidth: '100%',
                    boxSizing: 'border-box',
                  }}>
                  {/* 13 columns (A–M) — same grid as Excel export in handleExportExcel */}
                  <style>
                    {`
                      @media print {
                        body * { visibility: hidden; }
                        #printable-report, #printable-report * { visibility: visible; }
                        #printable-report {
                          position: absolute;
                          left: 0;
                          top: 0;
                          width: 100%;
                          margin: 0;
                          padding: 10px;
                          border: 2px solid #000;
                        }
                        @page { size: landscape; margin: 1cm; }
                      }
                      #printable-report .report-table {
                        width: 100%;
                        border-collapse: collapse;
                        table-layout: fixed;
                      }
                      #printable-report .report-table th,
                      #printable-report .report-table td {
                        border: 1px solid #000;
                        padding: 4px 4px;
                        font-size: 11px;
                        text-align: center;
                        vertical-align: middle;
                        word-wrap: break-word;
                        overflow-wrap: anywhere;
                      }
                      #printable-report .report-table tr.report-header-row td {
                        padding: 2px 4px;
                        line-height: 1.15;
                      }
                      #printable-report .report-table td.report-tl,
                      #printable-report .report-table td.report-val {
                        text-align: left;
                      }
                      #printable-report .report-header-title {
                        font-weight: bold;
                        font-size: 14px;
                        letter-spacing: 0.04em;
                        vertical-align: middle;
                      }
                      #printable-report .report-cmti {
                        vertical-align: middle;
                        background: #fff;
                        padding: 2px 4px;
                      }
                      #printable-report .report-cmti-logo {
                        display: block;
                        max-height: 28px;
                        max-width: 100%;
                        width: auto;
                        height: auto;
                        margin: 0 auto;
                        object-fit: contain;
                      }
                      #printable-report .report-meta-tight td {
                        padding: 3px 4px;
                        font-size: 10.5px;
                      }
                      #printable-report .report-meta-label {
                        text-align: right;
                        font-weight: bold;
                        background: #f3f4f6;
                      }
                      #printable-report .report-section-head {
                        font-weight: bold;
                        background: #e8e8e8;
                      }
                      #printable-report .report-boc-head {
                        font-weight: bold;
                        background: #f0f0f0;
                      }
                    `}
                  </style>

                  <table className="report-table">
                    <colgroup>
                      {[5.5, 9, 9, 9, 7.5, 7.5, 7.5, 10.5, 7.5, 7.5, 7.5, 7.5, 5].map((w, i) => (
                        <col key={i} style={{ width: `${w}%` }} />
                      ))}
                    </colgroup>
                    <tbody>
                      <tr className="report-header-row">
                        <td className="report-cmti">
                        </td>
                        <td colSpan={(reportPrintData?.totalCols || 13) - 1} className="report-header-title">INSPECTION REPORT</td>
                      </tr>

                      <tr className="report-meta-tight">
                        <td className="report-meta-label">Report No :</td>
                        <td colSpan={3} className="report-val">{reportPrintData?.reportNo}</td>
                        <td className="report-meta-label">Component Title:</td>
                        <td colSpan={4} className="report-val">{reportPrintData?.componentTitle}</td>
                        <td className="report-meta-label">Date:</td>
                        <td colSpan={3} className="report-val">{reportPrintData?.date}</td>
                      </tr>
                      <tr className="report-meta-tight">
                        <td className="report-meta-label">Project No.:</td>
                        <td colSpan={3} className="report-val">{reportPrintData?.projectNo}</td>
                        <td className="report-meta-label">Drg No:</td>
                        <td colSpan={4} className="report-val">{reportPrintData?.drgNo}</td>
                        <td className="report-meta-label">Sheet</td>
                        <td colSpan={3} className="report-val">{reportPrintData?.sheet || '1 of 1'}</td>
                      </tr>
                      <tr className="report-meta-tight">
                        <td className="report-meta-label">Project Name:</td>
                        <td colSpan={3} className="report-val">{reportPrintData?.projectName}</td>
                        <td className="report-meta-label">Quantity:</td>
                        <td colSpan={4} className="report-val">{reportPrintData?.totalQuantity}</td>
                        <td className="report-meta-label">Assembly</td>
                        <td colSpan={3} className="report-val">{reportPrintData?.assembly}</td>
                      </tr>

                      <tr className="report-boc-head">
                        <td rowSpan={2}>Sl No</td>
                        <td rowSpan={2} colSpan={2}>Specified Values</td>
                        {reportPrintData?.totalQuantity === 'Consolidated' && <td rowSpan={2}>Quantity</td>}
                        <td rowSpan={2}>Zone</td>
                        <td colSpan={reportPrintData?.maxSamples || 3}>Measured Values</td>
                        <td rowSpan={2} colSpan={2}>Instrument</td>
                        <td rowSpan={2} colSpan={4}>Remarks</td>
                      </tr>
                      <tr className="report-boc-head">
                        {Array.from({ length: reportPrintData?.maxSamples || 3 }).map((_, i) => (
                          <td key={i}>{i + 1}</td>
                        ))}
                      </tr>

                      {reportPrintData?.rows?.map((row, i) => (
                        <tr key={i}>
                          <td>{row.sno}</td>
                          <td colSpan={2} className="report-tl">{row.specified}</td>
                          {reportPrintData?.totalQuantity === 'Consolidated' && <td>{row.qty}</td>}
                          <td>{row.zone}</td>
                          {Array.from({ length: reportPrintData?.maxSamples || 3 }).map((_, mi) => {
                            const m = row.measurements[mi];
                            return <td key={mi}>{m !== '' && m != null ? m : ''}</td>;
                          })}
                          <td colSpan={2}>{row.instrument || 'default'}</td>
                          <td colSpan={4} className="report-tl">{row.remarks || ''}</td>
                        </tr>
                      ))}



                      <tr className="report-section-head">
                        <td colSpan={Math.floor((reportPrintData?.totalCols || 13) / 3)}>Chemical Test</td>
                        <td colSpan={Math.floor((reportPrintData?.totalCols || 13) / 3)}>Ultrasonic Test</td>
                        <td colSpan={(reportPrintData?.totalCols || 13) - 2 * Math.floor((reportPrintData?.totalCols || 13) / 3)}>Hardness Test</td>
                      </tr>
                      <tr>
                        <td className="report-meta-label">Date</td>
                        <td />
                        <td colSpan={2} />
                        <td className="report-meta-label">Date</td>
                        <td />
                        <td colSpan={2} />
                        <td className="report-meta-label">Date</td>
                        <td />
                        <td colSpan={2} />
                        <td />
                      </tr>
                      <tr>
                        <td className="report-meta-label">Report No</td>
                        <td />
                        <td colSpan={2} />
                        <td className="report-meta-label">Report No</td>
                        <td />
                        <td colSpan={2} />
                        <td className="report-meta-label">W.O.NO</td>
                        <td />
                        <td colSpan={2} />
                        <td />
                      </tr>
                      <tr>
                        <td className="report-meta-label">Authoriser</td>
                        <td />
                        <td colSpan={2} />
                        <td className="report-meta-label">Authoriser</td>
                        <td />
                        <td colSpan={2} />
                        <td className="report-meta-label">Hardness Value</td>
                        <td />
                        <td colSpan={2} />
                        <td />
                      </tr>
                      <tr>
                        <td className="report-meta-label">Status</td>
                        <td />
                        <td colSpan={2} />
                        <td className="report-meta-label">Status</td>
                        <td />
                        <td colSpan={2} />
                        <td className="report-meta-label">Status</td>
                        <td />
                        <td colSpan={2} />
                        <td />
                      </tr>

                      <tr style={{ minHeight: 56 }}>
                        <td colSpan={3} className="report-tl" style={{ verticalAlign: 'top' }}>
                          <b>Inspected by:</b>
                        </td>
                        <td colSpan={7} className="report-tl" style={{ verticalAlign: 'top' }}>
                          <b>Checked by:</b>
                        </td>
                        <td colSpan={3} />
                      </tr>
                    </tbody>
                  </table>
                </div>
                </Spin>
              </Modal>
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
