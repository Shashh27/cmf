import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Spin, Empty, Alert, Select, Modal, Button, Image, Input, message } from 'antd';
import { EyeOutlined, FileTextOutlined, PlusOutlined, SaveOutlined, CheckOutlined } from '@ant-design/icons';
import PlannedRMActions from './PlannedRMActions';
import PlanProcureRMDownload from '../DownloadReports/PlanProcureRMDownload';
import { getMaterialMatchInfo, formatMaterialMatchLabel, stripMaterialMatchLabel } from './materialMatchUtils';
import { api } from '../api/client.js';
const { Option } = Select;

const NO_2D_DOCUMENT_LABEL = 'No 2D Document';
const NO_2D_GROUP_PREFIX = '__no_2d_';
const EXTRACTION_PENDING_LABEL = 'Material Not Extracted';
const EXTRACTION_PENDING_PREFIX = '__extraction_pending_';

/** Flow 3 only: OCR extracted both material name and dimensions (stock_size). */
const hasExtractedMaterialFrom2D = (latest) =>
  !!(latest?.material && latest?.stock_size);

const is2DDocumentType = (documentType) => {
  const t = (documentType || '').toLowerCase().trim();
  return t === '2d' || t === '2d drawing' || t === 'drawing';
};

// ── Column filter dropdown ───────────────────────────────────────────────────
const FilterHeader = ({ label, options, value, onChange, style = {} }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const active = value && value.length > 0;
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 3, cursor: 'pointer', userSelect: 'none', ...style }}
      onClick={() => setOpen(o => !o)}>
      <span>{label}</span>
      <span style={{ fontSize: 9, color: active ? '#2563eb' : '#aaa' }}>▼</span>
      {active && <span style={{ background: '#2563eb', color: '#fff', borderRadius: 8, fontSize: 9, padding: '0 4px', lineHeight: '14px' }}>{value.length}</span>}
      {open && (
        <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, background: '#fff', border: '1px solid #d9d9d9', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,.15)', zIndex: 9999, minWidth: 200, maxHeight: 260, overflowY: 'auto', padding: '6px 0' }}>
          <div style={{ padding: '2px 10px', fontSize: 10, color: '#999', borderBottom: '1px solid #f0f0f0', marginBottom: 3 }}>Filter</div>
          {options.map(opt => (
            <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={value.includes(opt)} onChange={() => onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt])} />
              {opt}
            </label>
          ))}
          {value.length > 0 && (
            <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 3, padding: '3px 10px' }}>
              <span onClick={() => onChange([])} style={{ fontSize: 10, color: '#2563eb', cursor: 'pointer' }}>Clear</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const CompactDimensionInputs = ({ formType, dimensions, onChange, isMobile, disabled = false }) => {
  const handleInputKeyDown = (e) => {
    if (disabled) {
      e.preventDefault();
      return;
    }
    // Block up/down — number inputs increment/decrement on arrow keys
    if (e.keyCode === 38 || e.keyCode === 40) {
      e.preventDefault();
      return;
    }
    if ([8, 9, 27, 13, 37, 39].includes(e.keyCode)) return;
    if (e.ctrlKey && [65, 67, 86, 88].includes(e.keyCode)) return;
    if (e.key === '.') return;
    if (e.key && !/^\d$/.test(e.key)) e.preventDefault();
  };

  const parseDimensionValue = (raw) => {
    if (raw === '' || raw == null) return 0;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
  };

  const inputStyle = {
    width: isMobile ? 45 : 55,
    fontSize: isMobile ? 9 : 10,
    padding: isMobile ? '2px 3px' : '3px 5px',
    border: '1px solid #d9d9d9',
    borderRadius: '2px',
    textAlign: 'center',
    MozAppearance: 'textfield',
    ...(disabled ? { backgroundColor: '#f5f5f5', color: '#999', cursor: 'not-allowed' } : {}),
  };
  const labelStyle = { fontSize: isMobile ? 9 : 10, color: '#333', fontWeight: 500, marginRight: 3 };
  const rowStyle = { display: 'flex', alignItems: 'center', gap: isMobile ? 5 : 8 };

  const dimInput = (field, value) => (
    <input
      type="text"
      inputMode="decimal"
      style={inputStyle}
      value={value ?? ''}
      onChange={(e) => {
        const val = e.target.value;
        if (val === '' || /^\d*\.?\d*$/.test(val)) {
          onChange(field, val === '' ? 0 : parseDimensionValue(val));
        }
      }}
      onKeyDown={handleInputKeyDown}
      placeholder="0"
      disabled={disabled}
    />
  );

  if (formType === 'Round') {
    return (
      <div style={rowStyle}>
        <span style={labelStyle}>Dia</span>
        {dimInput('diameter', dimensions?.diameter)}
        <span style={labelStyle}>Len</span>
        {dimInput('length', dimensions?.length)}
      </div>
    );
  }

  if (formType === 'Square') {
    return (
      <div style={rowStyle}>
        <span style={labelStyle}>Len</span>
        {dimInput('length', dimensions?.length)}
        <span style={labelStyle}>Br</span>
        {dimInput('breadth', dimensions?.breadth)}
        <span style={labelStyle}>Ht</span>
        {dimInput('height', dimensions?.height)}
      </div>
    );
  }

  if (formType === 'Pipe') {
    return (
      <div style={rowStyle}>
        <span style={labelStyle}>OD</span>
        {dimInput('outer_diameter', dimensions?.outer_diameter)}
        <span style={labelStyle}>ID</span>
        {dimInput('inner_diameter', dimensions?.inner_diameter)}
        <span style={labelStyle}>Len</span>
        {dimInput('length', dimensions?.length)}
      </div>
    );
  }

  return null;
};

const isPositiveDimension = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
};

const arePlannedDimensionsValid = (formType, dimensions = {}) => {
  if (formType === 'Round') {
    return isPositiveDimension(dimensions.diameter) && isPositiveDimension(dimensions.length);
  }
  if (formType === 'Square') {
    return isPositiveDimension(dimensions.length)
      && isPositiveDimension(dimensions.breadth)
      && isPositiveDimension(dimensions.height);
  }
  if (formType === 'Pipe') {
    return isPositiveDimension(dimensions.outer_diameter)
      && isPositiveDimension(dimensions.inner_diameter)
      && isPositiveDimension(dimensions.length);
  }
  return false;
};

const collectPartDetailsFromHierarchy = (hierarchy) => {
  const parts = [];
  const walkAssembly = (assembly) => {
    assembly.parts?.forEach((partDetail) => parts.push(partDetail));
    assembly.subassemblies?.forEach(walkAssembly);
  };
  hierarchy?.direct_parts?.forEach((partDetail) => parts.push(partDetail));
  hierarchy?.assemblies?.forEach(walkAssembly);
  return parts;
};

const collectLinkedStockFromOrders = (ordersWithHierarchy) => {
  const linkedStockInfo = {};
  const procuredInfo = {};

  const processPart = (partDetail) => {
    const part = partDetail?.part;
    if (!part?.id) return;

    if (part.raw_material_unit_id) {
      linkedStockInfo[part.id] = {
        stockId: part.raw_material_stock_id,
        unitId: part.raw_material_unit_id,
        sourceType: part.raw_material_unit_details?.source_type || part.raw_material_stock_details?.source_type,
        orderStatus: part.raw_material_stock_details?.order_status,
      };
    }

    if (
      part.raw_material_unit_details?.source_type === 'order'
      || part.raw_material_stock_details?.source_type === 'order'
    ) {
      procuredInfo[part.id] = true;
    }
  };

  ordersWithHierarchy.forEach((order) => {
    if (!order.hierarchy) return;
    collectPartDetailsFromHierarchy(order.hierarchy).forEach(processPart);
  });

  return { linkedStockInfo, procuredInfo };
};

const OrderRMHierarchyTable = ({ rawMaterials, refreshTrigger }) => {
  const [loading, setLoading] = useState(false);
  const [ordersData, setOrdersData] = useState([]);
  const [error, setError] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState([]);
  const [selectedRM, setSelectedRM] = useState([]);
  const [selectedPartName, setSelectedPartName] = useState([]);
  const [selectedPartNumber, setSelectedPartNumber] = useState([]);
  const [selectedStockSource, setSelectedStockSource] = useState([]);
  const [selectedDocStatus, setSelectedDocStatus] = useState('all'); // 'all' | 'no_2d'
  const [previewModal, setPreviewModal] = useState({ visible: false, document: null });
  const [planningData, setPlanningData] = useState({});
  const [stockRecommendations, setStockRecommendations] = useState({});
  const [plannedBasedRecommendations, setPlannedBasedRecommendations] = useState({});
  const [savedRows, setSavedRows] = useState({});
  const [loadingSave, setLoadingSave] = useState({});
  const [selectedMaterialIds, setSelectedMaterialIds] = useState({});
  const rawMaterialsList = rawMaterials || [];
  const [linkedStockMap, setLinkedStockMap] = useState({});
  const [procuredMap, setProcuredMap] = useState({});
  const [partLinkDisplayOverrides, setPartLinkDisplayOverrides] = useState({});
  // ── Column header filters ──────────────────────────────────────────────────
  const [colOrder, setColOrder] = useState([]);
  const [colRM, setColRM] = useState([]);
  const [colPartName, setColPartName] = useState([]);
  const [colPartNumber, setColPartNumber] = useState([]);
  const [colFormType, setColFormType] = useState([]);
  const [colSource, setColSource] = useState([]);
  const [colHasRecommendations, setColHasRecommendations] = useState(false);
  const plannedRmFetchKeyRef = useRef('');

  useEffect(() => { fetchAllOrdersHierarchy(); }, []);

  // Refresh when parent signals this tab became active after a mutation
  useEffect(() => {
    if (refreshTrigger > 0) fetchAllOrdersHierarchy({ silent: true });
  }, [refreshTrigger]);

  // Refresh when stock is unlinked/deleted from any tab (procurement, etc.)
  useEffect(() => {
    const handleRMChanged = (event) => {
      const orderId = event?.detail?.orderId;
      if (orderId) refreshSingleOrderHierarchy(orderId);
      else fetchAllOrdersHierarchy({ silent: true });
    };
    window.addEventListener('rawMaterialChanged', handleRMChanged);
    return () => window.removeEventListener('rawMaterialChanged', handleRMChanged);
  }, []);

  const updateLinkedStockStatus = (partId, linkedStock, displayOverride = null) => {
    if (linkedStock) {
      setLinkedStockMap(prev => ({ ...prev, [partId]: linkedStock }));
      if (displayOverride) {
        setPartLinkDisplayOverrides(prev => ({ ...prev, [partId]: displayOverride }));
      }
    } else {
      setLinkedStockMap(prev => {
        const { [partId]: _, ...rest } = prev;
        return rest;
      });
      setProcuredMap(prev => {
        const { [partId]: _, ...rest } = prev;
        return rest;
      });
      setPartLinkDisplayOverrides(prev => ({
        ...prev,
        [partId]: {
          linkedMaterial: 'Not Assigned',
          linkedStock: 'N/A',
          stockSource: 'N/A',
        },
      }));
    }
  };

  const refreshSingleOrderHierarchy = async (orderId) => {
    if (!orderId) return;
    try {
      const response = await api.get(`/rawmaterials/order-raw-material-hierarchy/${orderId}`);
      const orderData = response.data;
      const hierarchy = orderData.product_hierarchy ?? null;

      setOrdersData(prev => prev.map((order) => (
        order.id === orderId
          ? { ...order, ...orderData, hierarchy }
          : order
      )));

      const { linkedStockInfo, procuredInfo } = collectLinkedStockFromOrders([{ hierarchy }]);
      setLinkedStockMap(prev => ({ ...prev, ...linkedStockInfo }));
      setProcuredMap(prev => ({ ...prev, ...procuredInfo }));

      const syncedPartIds = collectPartDetailsFromHierarchy(hierarchy)
        .map((partDetail) => partDetail.part?.id)
        .filter(Boolean);
      setPartLinkDisplayOverrides(prev => {
        const next = { ...prev };
        syncedPartIds.forEach((partId) => { delete next[partId]; });
        return next;
      });
    } catch {
      // Keep instant overrides if background sync fails.
    }
  };

  const fetchAllOrdersHierarchy = async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const response = await api.get(`/rawmaterials/order-raw-material-hierarchies`);
      const ordersWithHierarchy = (response.data || []).map((order) => ({
        ...order,
        hierarchy: order.product_hierarchy ?? null,
      }));
      setOrdersData(ordersWithHierarchy);

      const { linkedStockInfo, procuredInfo } = collectLinkedStockFromOrders(ordersWithHierarchy);
      setLinkedStockMap(linkedStockInfo);
      setProcuredMap(procuredInfo);
      setPartLinkDisplayOverrides({});
    } catch { setError('Failed to fetch orders'); } finally { if (!silent) setLoading(false); }
  };

  const refreshOrdersHierarchy = () => fetchAllOrdersHierarchy({ silent: true });
  const refreshOrderHierarchy = (orderId) => refreshSingleOrderHierarchy(orderId);

  const getLatestExtractedData = (arr) => {
    if (!arr?.length) return null;
    return [...arr].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  };

  /** Skip STANDARD parts and parts marked WITHOUT_RAW_MATERIAL — not relevant to RM planning. */
  const isRmRelevantPart = (partNode) => {
    const part = partNode?.part;
    if (!part) return false;
    const typeName = String(part.type_name || '').trim().toUpperCase();
    const partDetail = String(part.part_detail || '').trim().toUpperCase();
    if (typeName === 'STANDARD') return false;
    if (partDetail === 'WITHOUT_RAW_MATERIAL') return false;
    return true;
  };

  const getAllParts = (hierarchy) => {
    const parts = [];
    const processAssembly = (assembly, path = []) => {
      const currentPath = [...path, assembly.assembly.assembly_name];
      assembly.parts?.forEach(p => {
        if (isRmRelevantPart(p)) parts.push({ ...p, path: currentPath.join(' > ') });
      });
      assembly.subassemblies?.forEach(sub => processAssembly(sub, currentPath));
    };
    hierarchy?.direct_parts?.forEach(p => {
      if (isRmRelevantPart(p)) parts.push({ ...p, path: 'Direct Parts' });
    });
    hierarchy?.assemblies?.forEach(a => processAssembly(a));
    return parts;
  };

  const getLatest2DDocument = (documents) => {
    if (!documents || !Array.isArray(documents) || documents.length === 0) return null;
    const docs2D = documents.filter(doc => is2DDocumentType(doc.document_type));
    if (docs2D.length === 0) return null;
    return [...docs2D].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  };

  const detectFormTypeFromDimensions = (dimensionStr) => {
    if (!dimensionStr) return 'Round';
    const cleaned = dimensionStr.replace(/\s+/g, '').toLowerCase();
    // Strip leading non-numeric words (e.g. 'cylinder', 'bar') before the first digit
    const strippedLeading = cleaned.replace(/^[^\d(]*/g, '');
    const cleanedNoParens = strippedLeading.replace(/\([^)]*\)/g, ''); // Remove parentheses

    // Check for l b h pattern (length, breadth, height) -> Square
    if (cleaned.includes('l') && cleaned.includes('b') && cleaned.includes('h')) {
      return 'Square';
    }

    // Check for Square patterns with labels: LxWxH, LxBxH, LengthxBreadthxHeight, etc.
    if (/(?:l|len|length|w|wid|width|b|br|breadth|h|ht|height).*x.*(?:l|len|length|w|wid|width|b|br|breadth|h|ht|height).*x.*(?:l|len|length|w|wid|width|b|br|breadth|h|ht|height)/.test(cleaned)) {
      return 'Square';
    }

    // Check for Pipe patterns: ODxIDxLen, OuterDiameterxInnerDiameterxLength, etc.
    if (/(?:od|outer|outerdia|outerdiameter).*x.*(?:id|inner|innerdia|innerdiameter)/.test(cleaned)) {
      return 'Pipe';
    }

    // Parenthesized dia pattern -> Round
    if (/\(dia\)/i.test(cleaned)) return 'Round';

    // Ø symbol or other diameter indicators -> Round
    if (/(?:ø|phi|Φ|dia|d)/.test(cleaned)) return 'Round';

    if (cleanedNoParens.includes('/')) return 'Pipe';
    const parts = cleanedNoParens.split('x').filter(p => p.trim() !== '');
    if (parts.length === 3) return 'Square';
    return 'Round';
  };

  const parseDimensions = (dimensionStr, formType) => {
    const dimensions = {};
    if (!dimensionStr) return dimensions;
    try {
      const cleaned = dimensionStr.replace(/\s+/g, '').toLowerCase();
      const cleanedNoParens = cleaned.replace(/\([^)]*\)/g, ''); // Remove parentheses

      // Check for pattern like 20(l)x20(b)x20(h) with parentheses
      const lMatch = cleaned.match(/(\d+)\(l\)/i);
      const bMatch = cleaned.match(/(\d+)\(b\)/i);
      const hMatch = cleaned.match(/(\d+)\(h\)/i);

      if (lMatch && bMatch && hMatch) {
        dimensions.length = parseFloat(lMatch[1]);
        dimensions.breadth = parseFloat(bMatch[1]);
        dimensions.height = parseFloat(hMatch[1]);
        return dimensions;
      }

      // Check for Square patterns with various labels: LxWxH, LxBxH, LengthxBreadthxHeight, etc.
      // Handle formats: 20Lx20Bx20H, 20lengthx20breadthx20height, 20Lx20Wx20H
      const squarePatternMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*(?:l|len|length|w|wid|width|b|br|breadth|h|ht|height)\s*x\s*(\d+(?:\.\d+)?)\s*(?:l|len|length|w|wid|width|b|br|breadth|h|ht|height)\s*x\s*(\d+(?:\.\d+)?)\s*(?:l|len|length|w|wid|width|b|br|breadth|h|ht|height)/i);
      if (squarePatternMatch) {
        const vals = [parseFloat(squarePatternMatch[1]), parseFloat(squarePatternMatch[2]), parseFloat(squarePatternMatch[3])];
        const labels = cleaned.match(/(?:l|len|length|w|wid|width|b|br|breadth|h|ht|height)/gi) || [];
        // Try to assign based on labels
        if (labels.length >= 3) {
          const labelLower = labels.map(l => l.toLowerCase());
          const lIdx = labelLower.findIndex(l => ['l', 'len', 'length'].includes(l));
          const bIdx = labelLower.findIndex(l => ['b', 'br', 'breadth', 'w', 'wid', 'width'].includes(l));
          const hIdx = labelLower.findIndex(l => ['h', 'ht', 'height'].includes(l));
          if (lIdx >= 0) dimensions.length = vals[lIdx];
          if (bIdx >= 0) dimensions.breadth = vals[bIdx];
          if (hIdx >= 0) dimensions.height = vals[hIdx];
        } else {
          // Default: assume order is length x breadth x height
          dimensions.length = vals[0];
          dimensions.breadth = vals[1];
          dimensions.height = vals[2];
        }
        if (dimensions.length && dimensions.breadth && dimensions.height) {
          return dimensions;
        }
      }

      // Check for Pipe patterns: ODxIDxLen, OuterDiameterxInnerDiameterxLength, etc.
      // Handle formats: 50ODx30IDx1000, 50odx30idx1000, 50outerx30innerx1000
      const pipePatternMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*(?:od|outer|outerdia|outerdiameter)\s*x\s*(\d+(?:\.\d+)?)\s*(?:id|inner|innerdia|innerdiameter)\s*x\s*(\d+(?:\.\d+)?)\s*(?:l|len|length)?/i);
      if (pipePatternMatch) {
        dimensions.outer_diameter = parseFloat(pipePatternMatch[1]);
        dimensions.inner_diameter = parseFloat(pipePatternMatch[2]);
        dimensions.length = parseFloat(pipePatternMatch[3]);
        return dimensions;
      }

      // Check for pattern like 260(dia)x50(length) or 110(dia)x25(thick) with parentheses
      const diaMatch = cleaned.match(/(\d+(?:\.\d+)?)\(dia(?:meter)?\)/i);
      // Accept length / len / thick / thickness / t as the second dimension label
      const lenMatch = cleaned.match(/(\d+(?:\.\d+)?)\((?:length|len|thick(?:ness)?|t)\)/i);

      if (diaMatch && lenMatch) {
        dimensions.diameter = parseFloat(diaMatch[1]);
        dimensions.length = parseFloat(lenMatch[1]);
        return dimensions;
      }

      // Pattern: dia only given, second bare number is length e.g. "CYLINDER 110(DIA) X 25"
      if (diaMatch && !lenMatch) {
        const bareNumbers = cleaned.match(/[\d.]+/g) || [];
        const diaVal = parseFloat(diaMatch[1]);
        const otherNums = bareNumbers.map(parseFloat).filter(n => n !== diaVal);
        if (otherNums.length > 0) {
          dimensions.diameter = diaVal;
          dimensions.length = otherNums[0];
          return dimensions;
        }
      }

      // Handle Ø symbol and other diameter indicators: Ø70x155, phi70x155, Φ70x155, dia70x155
      // Also handle formats like "70 dia x 155", "70d x 155", "70Ø x 155", "70x155Ø"
      // Match both: symbol before number (Ø70) and number before symbol (70Ø)
      const diameterSymbolMatch = cleaned.match(/(?:ø|phi|Φ|dia|d)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:ø|phi|Φ|dia|d)/i);
      if (diameterSymbolMatch) {
        const diaVal = parseFloat(diameterSymbolMatch[1] || diameterSymbolMatch[2]);
        // Find the length - look for other numbers in the string
        const allNumbers = cleaned.match(/[\d.]+/g) || [];
        const otherNums = allNumbers.map(parseFloat).filter(n => n !== diaVal && !Number.isNaN(n));
        if (otherNums.length > 0) {
          dimensions.diameter = diaVal;
          dimensions.length = otherNums[0];
          return dimensions;
        } else {
          dimensions.diameter = diaVal;
          return dimensions;
        }
      }

      if (formType === 'Pipe' && cleanedNoParens.includes('/')) {
        const parts = cleanedNoParens.replace('x', '/').split('/');
        if (parts.length >= 3) {
          dimensions.outer_diameter = parseFloat(parts[0]);
          dimensions.inner_diameter = parseFloat(parts[1]);
          dimensions.length = parseFloat(parts[2]);
        }
      } else if (cleanedNoParens.includes('x')) {
        const parts = cleanedNoParens.split('x');
        if (formType === 'Square' && parts.length === 3) {
          dimensions.breadth = parseFloat(parts[0]);
          dimensions.height = parseFloat(parts[1]);
          dimensions.length = parseFloat(parts[2]);
        } else if (parts.length >= 2) {
          dimensions.diameter = parseFloat(parts[0]);
          dimensions.length = parseFloat(parts[1]);
        }
      }
    } catch (e) {
      console.error('Error parsing dimensions:', e);
    }
    return dimensions;
  };

  const resolveRowMaterialMatch = (materialName, rowKey, plannedRawMaterialId = null, isSaved = false) => {
    const selectedId = selectedMaterialIds[rowKey] ?? (isSaved ? plannedRawMaterialId : null) ?? null;
    return getMaterialMatchInfo(materialName, rawMaterialsList, selectedId);
  };

  const handleMaterialSelection = (rowKey, materialId) => {
    setSelectedMaterialIds(prev => ({ ...prev, [rowKey]: materialId }));
  };

  const getDefaultMaterialId = (row) => {
    const exact = row.materialRecommendations?.find((m) => m.match_type === 'exact');
    return exact?.id ?? row.materialRecommendations?.[0]?.id ?? row.resolvedMaterialId ?? null;
  };

  const getSelectedMaterialId = (row) => {
    if (selectedMaterialIds[row.key] != null) return Number(selectedMaterialIds[row.key]);
    if (savedRows[row.key] && row.plannedRawMaterialId != null) return Number(row.plannedRawMaterialId);
    const defaultId = getDefaultMaterialId(row);
    return defaultId != null ? Number(defaultId) : undefined;
  };

  const getMaterialSelectOptions = (row) => {
    const selectedId = getSelectedMaterialId(row);
    const isSaved = !!savedRows[row.key];

    if (row.needsManualPlanning) {
      return [...rawMaterialsList]
        .sort((a, b) => (a.material_name || '').localeCompare(b.material_name || ''))
        .map((rm) => {
          const rmId = Number(rm.id);
          return {
            value: rmId,
            label: isSaved && selectedId != null && rmId === Number(selectedId)
              ? `${rm.material_name} (planned)`
              : rm.material_name,
          };
        });
    }

    const optionMap = new Map();
    (row.materialRecommendations || []).forEach((rec) => {
      const recId = Number(rec.id);
      const isPlanned = isSaved && selectedId != null && recId === Number(selectedId);
      optionMap.set(recId, {
        value: recId,
        label: isPlanned
          ? `${rec.material_name} (planned)`
          : formatMaterialMatchLabel(rec.material_name, rec.match_type),
      });
    });

    if (selectedId && !optionMap.has(selectedId)) {
      const material = rawMaterialsList.find((rm) => Number(rm.id) === selectedId);
      if (material) {
        const rec = row.materialRecommendations?.find((m) => Number(m.id) === selectedId);
        optionMap.set(selectedId, {
          value: selectedId,
          label: isSaved
            ? `${material.material_name} (planned)`
            : formatMaterialMatchLabel(material.material_name, rec?.match_type),
        });
      }
    }

    return Array.from(optionMap.values());
  };

  const getSelectedMaterialLabel = (row, stripSuggested = false) => {
    const selectedId = getSelectedMaterialId(row);
    if (!selectedId) return null;
    const option = getMaterialSelectOptions(row).find((opt) => opt.value === selectedId);
    let label = option?.label;
    if (!label) {
      const material = rawMaterialsList.find((rm) => Number(rm.id) === selectedId);
      label = material?.material_name || null;
    }
    if (label && stripSuggested) {
      label = stripMaterialMatchLabel(label);
    }
    return label;
  };

  const getPlannedDimensionsSummary = (row) => {
    const planning = planningData[row.key];
    if (!planning?.formType || !planning?.dimensions) return null;
    const dims = planning.dimensions;
    if (planning.formType === 'Round' && dims.diameter && dims.length) {
      return `${dims.diameter} DIA x ${dims.length} LENGTH`;
    }
    if (planning.formType === 'Square' && dims.breadth && dims.height && dims.length) {
      return `${dims.length} x ${dims.breadth} x ${dims.height}`;
    }
    if (planning.formType === 'Pipe' && dims.outer_diameter && dims.inner_diameter && dims.length) {
      return `${dims.outer_diameter} OD x ${dims.inner_diameter} ID x ${dims.length} LENGTH`;
    }
    return null;
  };

  const getPlannedSummaryLine = (row) => {
    const materialName = getSelectedMaterialLabel(row, true);
    const formType = planningData[row.key]?.formType;
    const dimensions = getPlannedDimensionsSummary(row);
    const parts = [];
    if (materialName) parts.push(materialName);
    if (formType) parts.push(formType);
    if (dimensions) parts.push(dimensions);
    return parts.length > 0 ? parts.join(' · ') : null;
  };

  const getEffectiveRowMaterial = (row) => {
    const materialId = getSelectedMaterialId(row);
    return {
      ...row,
      resolvedMaterialId: materialId,
      resolvedMaterialName: getSelectedMaterialLabel(row, true) ?? row.resolvedMaterialName,
    };
  };

  const isPartStockLocked = (partId) => !!(linkedStockMap[partId] || procuredMap[partId]);

  const hasDimensionValues = (dimensions = {}) =>
    Object.values(dimensions).some((v) => v != null && v !== '' && !Number.isNaN(v));

  const stashDimensionsForFormType = (planning, formType) => {
    const dimensionsByFormType = { ...(planning?.dimensionsByFormType || {}) };
    if (formType && planning?.dimensions) {
      dimensionsByFormType[formType] = { ...planning.dimensions };
    }
    return dimensionsByFormType;
  };

  const handleFormTypeChange = (row, newFormType) => {
    if (isPartStockLocked(row.partId)) return;

    setPlanningData((prev) => {
      const current = prev[row.key] || {};
      const dimensionsByFormType = stashDimensionsForFormType(current, current.formType);

      let dimensions = dimensionsByFormType[newFormType]
        ? { ...dimensionsByFormType[newFormType] }
        : {};

      if (!hasDimensionValues(dimensions) && row.dimension) {
        dimensions = parseDimensions(row.dimension, newFormType);
      }

      dimensionsByFormType[newFormType] = { ...dimensions };

      return {
        ...prev,
        [row.key]: {
          ...current,
          formType: newFormType,
          dimensions,
          dimensionsByFormType,
        },
      };
    });
  };

  const handleDimensionsChange = (key, formType, field, value) => {
    setPlanningData((prev) => {
      const current = prev[key] || {};
      const dimensions = { ...(current.dimensions || {}), [field]: value };
      return {
        ...prev,
        [key]: {
          ...current,
          dimensions,
          dimensionsByFormType: {
            ...(current.dimensionsByFormType || {}),
            ...(formType ? { [formType]: dimensions } : {}),
          },
        },
      };
    });
  };

  const fetchStockRecommendations = async (materialName, dimensionsStr, key, materialId = null) => {
    try {
      const response = await api.post(`/rawmaterials/recommend-stocks`, {
        material_name: materialName,
        dimensions_str: dimensionsStr,
        min_score: 0.3,
        max_recommendations: 5,
        required_length: planningData[key]?.dimensions?.length || null,
        material_id: materialId,
      });
      setStockRecommendations(prev => ({
        ...prev,
        [key]: response.data.recommendations
      }));
    } catch (err) {
      console.error('Failed to fetch stock recommendations:', err);
    }
  };

  const fetchBatchStockRecommendations = async (rows) => {
    try {
      const requests = rows
        .filter(row => row.rmName && row.dimension)
        .map(row => ({
          material_name: row.rmName,
          dimensions_str: row.dimension,
          min_score: 0.3,
          max_recommendations: 5,
          required_length: planningData[row.key]?.dimensions?.length || null,
          material_id: row.resolvedMaterialId || null,
        }));

      if (requests.length === 0) return;

      const response = await api.post(`/rawmaterials/recommend-stocks/batch`, {
        requests
      });

      const recommendationsMap = {};
      let idx = 0;
      rows.forEach(row => {
        if (row.rmName && row.dimension) {
          recommendationsMap[row.key] = response.data.results[idx]?.recommendations || [];
          idx++;
        }
      });

      setStockRecommendations(recommendationsMap);
    } catch (err) {
      console.error('Failed to fetch batch stock recommendations:', err);
    }
  };

  const buildPlannedRMPayload = (row, planning, resolvedMaterialId) => {
    const dimensions = planning.dimensions || {};
    const payload = {
      extracted_data_id: row.extractedDataId,
      planned_form_type: planning.formType,
      planned_raw_material_id: resolvedMaterialId,
      planned_diameter: null,
      planned_length: null,
      planned_breadth: null,
      planned_height: null,
      planned_inner_diameter: null,
      planned_outer_diameter: null,
    };

    if (planning.formType === 'Round') {
      payload.planned_diameter = dimensions.diameter ?? null;
      payload.planned_length = dimensions.length ?? null;
    } else if (planning.formType === 'Square') {
      payload.planned_breadth = dimensions.breadth ?? null;
      payload.planned_height = dimensions.height ?? null;
      payload.planned_length = dimensions.length ?? null;
    } else if (planning.formType === 'Pipe') {
      payload.planned_inner_diameter = dimensions.inner_diameter ?? null;
      payload.planned_outer_diameter = dimensions.outer_diameter ?? null;
      payload.planned_length = dimensions.length ?? null;
    }

    return payload;
  };

  const buildManualPlannedRMPayload = (row, planning, resolvedMaterialId) => {
    const payload = buildPlannedRMPayload(row, planning, resolvedMaterialId);
    delete payload.extracted_data_id;
    return {
      part_id: row.partId,
      ...payload,
    };
  };

  const savePlannedRM = async (row) => {
    try {
      setLoadingSave(prev => ({ ...prev, [row.key]: true }));

      if (isPartStockLocked(row.partId)) {
        message.error('Cannot change planned raw material — unlink general stock or delete procured material first.');
        return;
      }

      const resolvedMaterialId = getSelectedMaterialId(row);
      if (!resolvedMaterialId) {
        message.error(
          row.needsManualPlanning
            ? 'Please select a raw material from the master list.'
            : 'Please select a raw material from the suggestions.'
        );
        return;
      }

      if (!row.needsManualPlanning) {
        const matchInfo = resolveRowMaterialMatch(
          row.rmName,
          row.key,
          row.plannedRawMaterialId,
          !!savedRows[row.key]
        );
        if (!matchInfo.materialExists) {
          message.error('No matching raw material found in master list. Please create it first.');
          return;
        }
      }
      
      const planning = planningData[row.key] || {};
      if (!arePlannedDimensionsValid(planning.formType, planning.dimensions)) {
        message.error('Enter all dimensions greater than 0 before saving.');
        return;
      }
      const updateData = buildPlannedRMPayload(row, planning, resolvedMaterialId);
      const isManualFirstSave = !row.extractedDataId;
      const isUpdate = !!savedRows[row.key] && !!row.extractedDataId;

      const saveRequest = isManualFirstSave
        ? api.post('/planned-raw-materials/create-manual', buildManualPlannedRMPayload(row, planning, resolvedMaterialId))
        : isUpdate
          ? api.put(`/planned-raw-materials/update/${row.extractedDataId}`, updateData)
          : api.post('/planned-raw-materials/create', updateData);

      await saveRequest;

      setSelectedMaterialIds(prev => ({ ...prev, [row.key]: resolvedMaterialId }));
      setSavedRows(prev => ({ ...prev, [row.key]: true }));
      message.success(isUpdate ? 'Planned raw material updated successfully' : 'Planned raw material saved successfully');

      if (isManualFirstSave) {
        await refreshOrdersHierarchy();
      }

      const selectedMaterialName = getSelectedMaterialLabel(row, true);
      await fetchPlannedBasedRecommendations(
        {
          ...row,
          resolvedMaterialId,
          rmName: selectedMaterialName || row.rmName,
          resolvedMaterialName: selectedMaterialName,
        },
        planning
      );
    } catch (err) {
      console.error('Failed to save planned RM:', err);
      message.error('Failed to save planned raw material');
    } finally {
      setLoadingSave(prev => ({ ...prev, [row.key]: false }));
    }
  };

  const fetchPlannedBasedRecommendations = async (row, planning) => {
    try {
      const dimensions = planning.dimensions || {};
      
      // Build dimension string from planned dimensions
      let dimensionStr = '';
      if (planning.formType === 'Round') {
        dimensionStr = `${dimensions.diameter}x${dimensions.length}`;
      } else if (planning.formType === 'Square') {
        dimensionStr = `${dimensions.breadth}x${dimensions.height}x${dimensions.length}`;
      } else if (planning.formType === 'Pipe') {
        dimensionStr = `${dimensions.outer_diameter}x${dimensions.inner_diameter}x${dimensions.length}`;
      }
      
      if (!dimensionStr) {
        return;
      }

      const materialName = row.resolvedMaterialName || row.rmName;
      const materialId = row.resolvedMaterialId || row.rmId || null;
      if (!materialName || materialName === NO_2D_DOCUMENT_LABEL) {
        return;
      }
      
      const response = await api.post(`/rawmaterials/recommend-stocks/batch`, {
        requests: [{
          material_name: materialName,
          dimensions_str: dimensionStr,
          min_score: 0.3,
          max_recommendations: 5,
          required_length: dimensions.length || null,
          material_id: materialId,
        }]
      });
      
      setPlannedBasedRecommendations(prev => ({
        ...prev,
        [row.key]: response.data.results[0]?.recommendations || []
      }));
    } catch (err) {
      console.error('Failed to fetch planned-based recommendations:', err);
    }
  };

  const fetchExistingPlannedRM = async (rows, extractedDataIds) => {
    try {
      if (extractedDataIds.length === 0) return;

      const response = await api.post(`/planned-raw-materials/batch-get`, {
        extracted_data_ids: extractedDataIds
      });
      
      const plannedDataMap = {};
      const savedRowsMap = {};
      const recommendationsMap = {};
      const selectedMaterialMap = {};
      
      response.data.forEach(item => {
        if (item.planned_form_type) {
          const row = rows.find(r => r.extractedDataId === item.id);
          if (row) {
            const dimensions = {
              diameter: item.planned_diameter,
              length: item.planned_length,
              breadth: item.planned_breadth,
              height: item.planned_height,
              inner_diameter: item.planned_inner_diameter,
              outer_diameter: item.planned_outer_diameter
            };
            plannedDataMap[row.key] = {
              formType: item.planned_form_type,
              dimensions,
              dimensionsByFormType: {
                [item.planned_form_type]: { ...dimensions },
              },
            };
            savedRowsMap[row.key] = true;
            recommendationsMap[row.key] = item.recommendations || [];
            if (item.planned_raw_material_id) {
              selectedMaterialMap[row.key] = item.planned_raw_material_id;
            }
          }
        }
      });
      
      if (Object.keys(plannedDataMap).length > 0) {
        setPlanningData(prev => ({ ...prev, ...plannedDataMap }));
      }
      if (Object.keys(savedRowsMap).length > 0) {
        setSavedRows(prev => ({ ...prev, ...savedRowsMap }));
      }
      if (Object.keys(recommendationsMap).length > 0) {
        setPlannedBasedRecommendations(prev => ({ ...prev, ...recommendationsMap }));
      }
      if (Object.keys(selectedMaterialMap).length > 0) {
        setSelectedMaterialIds(prev => ({ ...prev, ...selectedMaterialMap }));
      }
    } catch (err) {
      console.error('Failed to fetch existing planned RM:', err);
    }
  };

  const refreshRowRecommendations = async (row) => {
    const planning = planningData[row.key];
    if (planning) {
      await fetchPlannedBasedRecommendations(row, planning);
    }
  };

  const refreshMaterialRecommendations = async (row) => {
    const relatedRows = tableData.filter((entry) => entry.rmName === row.rmName && savedRows[entry.key]);
    for (const relatedRow of relatedRows) {
      await refreshRowRecommendations(relatedRow);
    }
  };

  const groupPartsByMaterial = (parts) => {
    const groups = {};
    parts.forEach(part => {
      const latest = getLatestExtractedData(part.extracted_data);
      const doc2D = getLatest2DDocument(part.documents);
      let name;
      // Flow 3: group by extracted material. Flows 1–2: keep manual labels (never show planned name as extracted).
      if (hasExtractedMaterialFrom2D(latest)) {
        name = latest.material;
      } else if (!doc2D) {
        name = `${NO_2D_GROUP_PREFIX}${part.part.id}`;
      } else {
        name = `${EXTRACTION_PENDING_PREFIX}${part.part.id}`;
      }
      if (!groups[name]) groups[name] = { materialName: name, parts: [] };
      groups[name].parts.push(part);
    });
    return Object.values(groups);
  };

  const toDisplayMaterialName = (groupKey) => {
    if (groupKey.startsWith(NO_2D_GROUP_PREFIX)) return NO_2D_DOCUMENT_LABEL;
    if (groupKey.startsWith(EXTRACTION_PENDING_PREFIX)) return EXTRACTION_PENDING_LABEL;
    return groupKey;
  };

  const tableData = useMemo(() => {
    const rows = [];
    ordersData.forEach(order => {
      if (!order.hierarchy) return;
      const materialGroups = groupPartsByMaterial(getAllParts(order.hierarchy));
      const totalParts = materialGroups.reduce((s, g) => s + g.parts.length, 0);
      let partIndex = 0;
      materialGroups.forEach(group => {
        group.parts.forEach((part, i) => {
          const latest = getLatestExtractedData(part.extracted_data);
          const doc2D = getLatest2DDocument(part.documents);
          const hasNo2DDocument = !doc2D;
          const extractedFrom2D = hasExtractedMaterialFrom2D(latest);
          // Flows 1–2: manual planning (full master list). Flow 3: extracted material + fuzzy match.
          const needsManualPlanning = hasNo2DDocument || !extractedFrom2D;
          const showExtractedMaterialUI = extractedFrom2D;
          const groupKey = group.materialName;
          const displayRmName = toDisplayMaterialName(groupKey);
          const key = `${order.id}-${groupKey}-${part.part.id}`;
          const plannedRm = latest?.planned_raw_material_id
            ? rawMaterialsList.find((rm) => Number(rm.id) === Number(latest.planned_raw_material_id))
            : null;
          const matchInfo = needsManualPlanning
            ? {
                materialExists: true,
                recommendations: [],
                exactMatch: false,
                resolvedMaterialId: latest?.planned_raw_material_id || null,
                resolvedMaterialName: plannedRm?.material_name || null,
              }
            : getMaterialMatchInfo(displayRmName, rawMaterialsList);
          rows.push({
            key,
            orderId: order.id,
            orderName: order.sale_order_number,
            rmName: displayRmName,
            rmGroupKey: groupKey,
            hasNo2DDocument,
            needsManualPlanning,
            showExtractedMaterialUI,
            hasExtractionPending: !!doc2D && !extractedFrom2D,
            rmId: matchInfo.resolvedMaterialId || part.part.raw_material_id,
            materialExists: needsManualPlanning ? true : matchInfo.materialExists,
            resolvedMaterialId: matchInfo.resolvedMaterialId,
            resolvedMaterialName: matchInfo.resolvedMaterialName,
            materialRecommendations: matchInfo.recommendations,
            isPartialMatch: !matchInfo.exactMatch && matchInfo.materialExists,
            plannedRawMaterialId: latest?.planned_raw_material_id,
            orderRowSpan: partIndex === 0 ? totalParts : 0,
            rmRowSpan: i === 0 ? group.parts.length : 0,
            partId: part.part.id,
            partNumber: part.part.part_number,
            partName: part.part.part_name,
            qty: part.part.qty,
            document: doc2D,
            dimension: latest?.stock_size || 'N/A',
            extractedDataId: latest?.id,
            plannedFormType: latest?.planned_form_type,
            plannedDimensions: {
              diameter: latest?.planned_diameter,
              length: latest?.planned_length,
              breadth: latest?.planned_breadth,
              height: latest?.planned_height,
              inner_diameter: latest?.planned_inner_diameter,
              outer_diameter: latest?.planned_outer_diameter
            },
            linkedMaterial: partLinkDisplayOverrides[part.part.id]?.linkedMaterial
              ?? part.part.raw_material_name
              ?? 'Not Assigned',
            linkedStock: partLinkDisplayOverrides[part.part.id]?.linkedStock
              ?? part.part.raw_material_stock_dimensions
              ?? 'N/A',
            stockSource: partLinkDisplayOverrides[part.part.id]?.stockSource
              ?? part.part.raw_material_unit_details?.source_type
              ?? 'N/A',
          });
          partIndex++;
        });
      });
    });
    return rows;
  }, [ordersData, rawMaterials, partLinkDisplayOverrides]);

  const extractedDataIdsKey = useMemo(() => {
    const ids = tableData
      .map((row) => row.extractedDataId)
      .filter(Boolean)
      .sort((a, b) => a - b);
    return ids.join(',');
  }, [tableData]);

  const orderOptions = useMemo(() => [...new Set(tableData.map(r => r.orderName))], [tableData]);
  const rmOptions = useMemo(() => {
    const base = selectedOrder.length > 0 ? tableData.filter(r => selectedOrder.includes(r.orderName)) : tableData;
    return [...new Set(base.map(r => r.rmName))];
  }, [tableData, selectedOrder]);

  useEffect(() => {
    setSelectedPartNumber([]);
  }, [selectedOrder]);

  useEffect(() => {
    if (!tableData.length) return;

    const planningUpdates = {};
    tableData.forEach((row) => {
      if (!row.rmName || !row.dimension || row.plannedFormType || row.needsManualPlanning) return;
      const formType = detectFormTypeFromDimensions(row.dimension);
      const dimensions = parseDimensions(row.dimension, formType);
      planningUpdates[row.key] = {
        formType,
        dimensions,
        dimensionsByFormType: {
          [formType]: { ...dimensions },
        },
      };
    });

    if (Object.keys(planningUpdates).length > 0) {
      setPlanningData((prev) => {
        const next = { ...prev };
        Object.entries(planningUpdates).forEach(([key, val]) => {
          if (!next[key]?.formType) {
            next[key] = { ...next[key], ...val };
          }
        });
        return next;
      });
    }
  }, [tableData]);

  useEffect(() => {
    if (!extractedDataIdsKey) return;

    const fetchKey = `${refreshTrigger}:${extractedDataIdsKey}`;
    if (plannedRmFetchKeyRef.current === fetchKey) return;
    plannedRmFetchKeyRef.current = fetchKey;

    const extractedDataIds = extractedDataIdsKey.split(',').map(Number);
    fetchExistingPlannedRM(tableData, extractedDataIds);
  }, [extractedDataIdsKey, refreshTrigger, tableData]);

  const partNameOptions = useMemo(() => {
    const base = selectedOrder.length > 0 ? tableData.filter(r => selectedOrder.includes(r.orderName)) : tableData;
    return [...new Set(base.map(r => r.partName).filter(Boolean))].sort();
  }, [tableData, selectedOrder]);

  const partNumberOptions = useMemo(() => {
    const base = selectedOrder.length > 0 ? tableData.filter(r => selectedOrder.includes(r.orderName)) : tableData;
    return [...new Set(base.map(r => r.partNumber).filter(Boolean))];
  }, [tableData, selectedOrder]);

  // Derived column filter options
  const colFilterOptions = useMemo(() => ({
    orders: [...new Set(tableData.map(r => r.orderName).filter(Boolean))].sort(),
    rms: [...new Set(tableData.map(r => r.rmName).filter(Boolean))].sort(),
    partNames: [...new Set(tableData.map(r => r.partName).filter(Boolean))].sort(),
    partNumbers: [...new Set(tableData.map(r => r.partNumber).filter(Boolean))].sort(),
    formTypes: [...new Set(tableData.map(r => planningData[r.key]?.formType).filter(Boolean))].sort(),
    sources: ['General Stock', 'Procured', 'Not Assigned'],
  }), [tableData, planningData]);

  const filteredRows = useMemo(() => {
    const rows = tableData.filter(r => {
      if (selectedOrder.length > 0 && !selectedOrder.includes(r.orderName)) return false;
      if (selectedRM.length > 0 && !selectedRM.includes(r.rmName)) return false;
      if (selectedPartName.length > 0 && !selectedPartName.includes(r.partName)) return false;
      if (selectedPartNumber.length > 0 && !selectedPartNumber.includes(r.partNumber)) return false;
      if (selectedStockSource.length > 0) {
        const src = linkedStockMap[r.partId]?.sourceType;
        if (selectedStockSource.includes('general') && src !== 'general') return false;
        if (selectedStockSource.includes('order') && src !== 'order') return false;
        if (selectedStockSource.includes('not_assigned') && linkedStockMap[r.partId]) return false;
      }
      if (selectedDocStatus === 'no_2d' && !r.hasNo2DDocument) return false;
      // Column header filters
      if (colOrder.length > 0 && !colOrder.includes(r.orderName)) return false;
      if (colRM.length > 0 && !colRM.includes(r.rmName)) return false;
      if (colPartName.length > 0 && !colPartName.includes(r.partName)) return false;
      if (colPartNumber.length > 0 && !colPartNumber.includes(r.partNumber)) return false;
      if (colFormType.length > 0 && !colFormType.includes(planningData[r.key]?.formType)) return false;
      if (colSource.length > 0) {
        const src = linkedStockMap[r.partId]?.sourceType;
        const label = src === 'order' ? 'Procured' : src === 'general' ? 'General Stock' : 'Not Assigned';
        if (!colSource.includes(label)) return false;
      }
      // Filter for rows with stock recommendations
      if (colHasRecommendations === true) {
        // Yes: show only rows with recommendations and not assigned
        const recommendations = plannedBasedRecommendations[r.key] || [];
        const hasStockAssigned = !!linkedStockMap[r.partId];
        if (!recommendations || recommendations.length === 0 || hasStockAssigned) return false;
      } else if (colHasRecommendations === false) {
        // No: show rows without recommendations OR already assigned
        const recommendations = plannedBasedRecommendations[r.key] || [];
        const hasStockAssigned = !!linkedStockMap[r.partId];
        if (recommendations && recommendations.length > 0 && !hasStockAssigned) return false;
      }
      return true;
    });
    const orderCount = {};
    const rmCount = {};
    rows.forEach(r => {
      orderCount[r.orderName] = (orderCount[r.orderName] || 0) + 1;
      const k = `${r.orderName}__${r.rmGroupKey || r.rmName}`;
      rmCount[k] = (rmCount[k] || 0) + 1;
    });
    const orderSeen = {};
    const rmSeen = {};
    return rows.map(r => {
      const k = `${r.orderName}__${r.rmGroupKey || r.rmName}`;
      const oSpan = orderSeen[r.orderName] ? 0 : orderCount[r.orderName];
      const rSpan = rmSeen[k] ? 0 : rmCount[k];
      orderSeen[r.orderName] = true;
      rmSeen[k] = true;
      return { ...r, orderRowSpan: oSpan, rmRowSpan: rSpan };
    });
  }, [tableData, selectedOrder, selectedRM, selectedPartName, selectedPartNumber, selectedStockSource, selectedDocStatus, linkedStockMap, colOrder, colRM, colPartName, colPartNumber, colFormType, colSource, planningData, plannedBasedRecommendations, colHasRecommendations]); // eslint-disable-line

  const border = '1px solid #000';
  const isMobile = window.innerWidth <= 768;
  const thStyle = { border, padding: '2px 4px', textAlign: 'center', fontWeight: 600, fontSize: isMobile ? 10 : 12, background: '#f0f0f0' };
  const tdStyle = { border, padding: '2px 4px', fontSize: isMobile ? 9 : 11, verticalAlign: 'middle', textAlign: 'center', color: '#000' };

  if (loading && ordersData.length === 0) return <div style={{ padding: 40, textAlign: 'center' }}><Spin size="large" /><div style={{ marginTop: 12 }}>Loading...</div></div>;
  if (error) return <Alert message="Error" description={error} type="error" showIcon style={{ margin: 16 }} />;

  return (
    <div style={{ padding: isMobile ? 8 : 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: isMobile ? 10 : 14, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, fontSize: isMobile ? 14 : 16, whiteSpace: 'nowrap' }}>Plan & Procure Raw Materials</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end' }}>
          <Select mode="multiple" value={selectedOrder} placeholder="Order" allowClear showSearch maxTagCount={1} maxTagPlaceholder={(omitted) => `+${omitted.length} more`} style={{ minWidth: isMobile ? 110 : 160 }} onChange={val => { setSelectedOrder(val || []); setSelectedRM([]); setSelectedPartName([]); setSelectedPartNumber([]); }}>
            {orderOptions.map(o => <Option key={o} value={o}>{o}</Option>)}
          </Select>
          <Select mode="multiple" value={selectedPartName} placeholder="Part Name" allowClear showSearch maxTagCount={1} maxTagPlaceholder={(omitted) => `+${omitted.length} more`} style={{ minWidth: isMobile ? 110 : 160 }} onChange={val => setSelectedPartName(val || [])}>
            {partNameOptions.map(p => <Option key={p} value={p}>{p}</Option>)}
          </Select>
          <Select mode="multiple" value={selectedPartNumber} placeholder="Part Number" allowClear showSearch maxTagCount={1} maxTagPlaceholder={(omitted) => `+${omitted.length} more`} style={{ minWidth: isMobile ? 110 : 160 }} onChange={val => setSelectedPartNumber(val || [])}>
            {partNumberOptions.map(p => <Option key={p} value={p}>{p}</Option>)}
          </Select>
          <Select mode="multiple" value={selectedRM} placeholder="Raw Material" allowClear showSearch maxTagCount={1} maxTagPlaceholder={(omitted) => `+${omitted.length} more`} style={{ minWidth: isMobile ? 110 : 160 }} onChange={val => setSelectedRM(val || [])}>
            {rmOptions.map(r => <Option key={r} value={r}>{r}</Option>)}
          </Select>
          <Select mode="multiple" value={selectedStockSource} placeholder="Stock Source" allowClear maxTagCount={1} maxTagPlaceholder={(omitted) => `+${omitted.length} more`} style={{ minWidth: isMobile ? 110 : 140 }} onChange={val => setSelectedStockSource(val || [])}>
            <Option value="general">General Stock</Option>
            <Option value="order">Procured</Option>
            <Option value="not_assigned">Not Assigned</Option>
          </Select>
          <Select
            value={selectedDocStatus === 'all' ? undefined : selectedDocStatus}
            placeholder="Document"
            allowClear
            style={{ minWidth: isMobile ? 130 : 160 }}
            onChange={(val) => setSelectedDocStatus(val || 'all')}
          >
            <Option value="all">All</Option>
            <Option value="no_2d">No 2D Document</Option>
          </Select>
          <Select
            value={colHasRecommendations === true ? 'yes' : colHasRecommendations === false ? 'no' : undefined}
            placeholder="Recommending Stock"
            allowClear
            style={{ minWidth: isMobile ? 130 : 160 }}
            onChange={(val) => setColHasRecommendations(val === 'yes' ? true : val === 'no' ? false : undefined)}
          >
            <Option value="yes">Yes</Option>
            <Option value="no">No</Option>
          </Select>
          <PlanProcureRMDownload tableData={filteredRows} planningData={planningData} savedRows={savedRows} />
        </div>
      </div>
      {filteredRows.length === 0 ? <Empty description="No records found" /> : (
        <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: isMobile ? '1200px' : '100%', border }}>
            <thead>
              <tr>
                <th rowSpan={2} style={thStyle}><FilterHeader label="Order" options={colFilterOptions.orders} value={colOrder} onChange={setColOrder} /></th>
                <th rowSpan={2} style={thStyle}><FilterHeader label="Extracted Raw Material" options={colFilterOptions.rms} value={colRM} onChange={setColRM} /></th>
                <th colSpan={4} style={thStyle}>Part</th>
                <th rowSpan={2} style={thStyle}>Extracted Dimension</th>
                <th rowSpan={2} style={thStyle}><FilterHeader label="Form Type" options={colFilterOptions.formTypes} value={colFormType} onChange={setColFormType} /></th>
                <th rowSpan={2} style={thStyle}>Planned Raw Material</th>
                <th rowSpan={2} style={thStyle}>Actions</th>
                <th colSpan={2} style={thStyle}>Assigned Material</th>
                <th rowSpan={2} style={thStyle}><FilterHeader label="Source" options={colFilterOptions.sources} value={colSource} onChange={setColSource} /></th>
              </tr>
              <tr>
                <th style={thStyle}><FilterHeader label="Part Number" options={colFilterOptions.partNumbers} value={colPartNumber} onChange={setColPartNumber} /></th>
                <th style={thStyle}><FilterHeader label="Part Name" options={colFilterOptions.partNames} value={colPartName} onChange={setColPartName} /></th>
                <th style={thStyle}>Qty</th>
                <th style={thStyle}>Preview Document</th>
                <th style={thStyle}>Material Name</th>
                <th style={thStyle}>Stock Dimensions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(row => (
                <tr key={row.key}>
                  {row.orderRowSpan > 0 && <td rowSpan={row.orderRowSpan} style={{ ...tdStyle, fontWeight: 600 }}>{row.orderName}</td>}
                  {row.rmRowSpan > 0 && <td rowSpan={row.rmRowSpan} style={tdStyle}>{row.rmName}</td>}
                  <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 500 }}>{row.partNumber}</td>
                  <td style={{ ...tdStyle, textAlign: 'left' }}>{row.partName}</td>
                  <td style={tdStyle}>{row.qty}</td>
                  <td style={tdStyle}>
                    {row.document ? (
                      <Button
                        size="small"
                        icon={<EyeOutlined />}
                        onClick={() => setPreviewModal({ visible: true, document: row.document })}
                        style={{ fontSize: isMobile ? 9 : 11, padding: isMobile ? '1px 4px' : '2px 8px' }}
                      >
                        Preview
                      </Button>
                    ) : (
                      <span style={{ color: '#999', fontSize: isMobile ? 9 : 11 }}>No 2D Doc</span>
                    )}
                  </td>
                  <td style={tdStyle}>{row.dimension}</td>
                  <td style={tdStyle}>
                    {row.needsManualPlanning ? (
                      <span style={{ color: '#999', fontSize: isMobile ? 9 : 10 }}>—</span>
                    ) : (
                    <Select
                      size="small"
                      value={planningData[row.key]?.formType || undefined}
                      placeholder="Select"
                      style={{ width: isMobile ? 80 : 100, fontSize: isMobile ? 9 : 11 }}
                      onChange={(val) => handleFormTypeChange(row, val)}
                      disabled={isPartStockLocked(row.partId)}
                    >
                      <Option value="Round">Round</Option>
                      <Option value="Square">Square</Option>
                      <Option value="Pipe">Pipe</Option>
                    </Select>
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'left', minWidth: isMobile ? '150px' : '220px', verticalAlign: 'top' }}>
                    {row.needsManualPlanning ? (
                      <>
                        <div style={{
                          marginBottom: 8,
                          padding: '4px 8px',
                          backgroundColor: '#fffbe6',
                          border: '1px solid #ffe58f',
                          borderRadius: '2px',
                          fontSize: isMobile ? 9 : 10,
                          fontWeight: 600,
                          color: '#ad8b00',
                        }}>
                          {row.hasNo2DDocument
                            ? 'No 2D document — select material, form type, and dimensions'
                            : '2D document uploaded — material not extracted. Select material, form type, and dimensions manually.'}
                        </div>
                        <div style={{ marginBottom: 8 }}>
                          <Select
                            size="small"
                            placeholder="Select raw material from master list"
                            style={{ width: '100%', fontSize: isMobile ? 9 : 10 }}
                            value={getSelectedMaterialId(row)}
                            onChange={(val) => handleMaterialSelection(row.key, Number(val))}
                            options={getMaterialSelectOptions(row)}
                            optionFilterProp="label"
                            showSearch
                            disabled={isPartStockLocked(row.partId)}
                          />
                        </div>
                        <div style={{ marginBottom: 8 }}>
                          <Select
                            size="small"
                            value={planningData[row.key]?.formType || undefined}
                            placeholder="Select form type"
                            style={{ width: '100%', fontSize: isMobile ? 9 : 10 }}
                            onChange={(val) => handleFormTypeChange(row, val)}
                            disabled={isPartStockLocked(row.partId)}
                          >
                            <Option value="Round">Round</Option>
                            <Option value="Square">Square</Option>
                            <Option value="Pipe">Pipe</Option>
                          </Select>
                        </div>
                        {isPartStockLocked(row.partId) && (
                          <div style={{ fontSize: isMobile ? 8 : 9, color: '#999', marginBottom: 8 }}>
                            Planning locked — unlink stock or delete procure to change material, form type, or dimensions
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                    {/* Material Availability Status */}
                    {row.showExtractedMaterialUI && (
                      <>
                        <div style={{ 
                          marginBottom: 8, 
                          padding: '4px 8px', 
                          backgroundColor: row.materialExists ? '#f6ffed' : '#fff2f0',
                          border: `1px solid ${row.materialExists ? '#b7eb8f' : '#ffccc7'}`,
                          borderRadius: '2px',
                          fontSize: isMobile ? 9 : 10,
                          fontWeight: 600,
                          color: row.materialExists ? '#52c41a' : '#ff4d4f',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}>
                          <span style={{ fontSize: isMobile ? 10 : 12 }}>
                            {row.materialExists ? '✓' : '✗'}
                          </span>
                          {row.materialExists
                            ? (savedRows[row.key] ? 'Material planned' : 'Material Available')
                            : 'Material Not Available - Create First'}
                        </div>
                        {row.materialExists && row.materialRecommendations?.length > 0 && (
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: isMobile ? 8 : 9, color: '#666', marginBottom: 4 }}>
                              Extracted: <strong>{row.rmName}</strong>
                              {savedRows[row.key] && getSelectedMaterialLabel(row, true) && (
                                <span>
                                  {' → Planned: '}
                                  <strong>{getSelectedMaterialLabel(row, true)}</strong>
                                </span>
                              )}
                            </div>
                            <Select
                              size="small"
                              placeholder="Select raw material"
                              style={{ width: '100%', fontSize: isMobile ? 9 : 10 }}
                              value={getSelectedMaterialId(row)}
                              onChange={(val) => handleMaterialSelection(row.key, Number(val))}
                              options={getMaterialSelectOptions(row)}
                              optionFilterProp="label"
                              disabled={isPartStockLocked(row.partId)}
                            />
                            {isPartStockLocked(row.partId) ? (
                              <div style={{ fontSize: isMobile ? 8 : 9, color: '#999', marginTop: 4 }}>
                                Planning locked — unlink stock or delete procure to change material, form type, or dimensions
                              </div>
                            ) : savedRows[row.key] && (
                              <div style={{ fontSize: isMobile ? 8 : 9, color: '#52c41a', marginTop: 4 }}>
                                You can change material before assign/procure
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                      </>
                    )}
                    
                    {savedRows[row.key] && planningData[row.key]?.formType && getPlannedSummaryLine(row) && (
                      <div style={{ marginBottom: 8, padding: '4px 8px', backgroundColor: '#f0f8ff', borderRadius: '2px', border: '1px solid #b3d9ff' }}>
                        <div style={{ fontSize: isMobile ? 8 : 9, fontWeight: 600, color: '#1890ff', lineHeight: 1.4 }}>
                          Planned: {getPlannedSummaryLine(row)}
                        </div>
                      </div>
                    )}
                    {planningData[row.key]?.formType && (
                      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                        <div style={{ flex: 1 }}>
                          <CompactDimensionInputs
                            formType={planningData[row.key].formType}
                            dimensions={planningData[row.key].dimensions || {}}
                            onChange={(field, value) => {
                              if (isPartStockLocked(row.partId)) return;
                              handleDimensionsChange(
                                row.key,
                                planningData[row.key].formType,
                                field,
                                value
                              );
                            }}
                            isMobile={isMobile}
                            disabled={isPartStockLocked(row.partId)}
                          />
                        </div>
                        <Button
                          size="small"
                          type={savedRows[row.key] ? "default" : "primary"}
                          loading={loadingSave[row.key]}
                          onClick={() => savePlannedRM(row)}
                          disabled={
                            isPartStockLocked(row.partId) ||
                            (!row.needsManualPlanning && !row.materialExists) ||
                            (row.needsManualPlanning && !getSelectedMaterialId(row)) ||
                            !arePlannedDimensionsValid(planningData[row.key]?.formType, planningData[row.key]?.dimensions)
                          }
                          icon={savedRows[row.key] ? <CheckOutlined /> : <SaveOutlined />}
                          style={{ 
                            fontSize: isMobile ? 9 : 10, 
                            padding: isMobile ? '1px 4px' : '2px 8px',
                            borderRadius: '2px',
                            fontWeight: 500,
                            height: isMobile ? '20px' : '24px',
                            minWidth: isMobile ? '50px' : '70px',
                            marginTop: isMobile ? 0 : 2
                          }}
                        >
                          {savedRows[row.key] ? 'Update' : 'Save'}
                        </Button>
                      </div>
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'left', minWidth: isMobile ? '120px' : '150px', verticalAlign: 'top' }}>
                    <PlannedRMActions 
                      row={getEffectiveRowMaterial(row)} 
                      recommendations={plannedBasedRecommendations[row.key] || []}
                      isMobile={isMobile}
                      planningData={planningData}
                      isSaved={savedRows[row.key]}
                      materialExists={row.needsManualPlanning ? true : row.materialExists}
                      linkedStock={linkedStockMap[row.partId] || null}
                      isProcured={procuredMap[row.partId] || false}
                      updateLinkedStock={updateLinkedStockStatus}
                      onRefresh={refreshOrderHierarchy}
                      onRefreshRecommendations={() => refreshMaterialRecommendations(row)}
                    />
                  </td>
                  <td style={tdStyle}>{row.linkedMaterial || '-'}</td>
                  <td style={tdStyle}>{row.linkedStock || '-'}</td>
                  <td style={tdStyle}>{row.stockSource}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal
        title={<span><FileTextOutlined /> Document Preview: {previewModal.document?.document_name}</span>}
        open={previewModal.visible}
        onCancel={() => setPreviewModal({ visible: false, document: null })}
        width={isMobile ? '95%' : '90%'}
        style={{ top: 10 }}
        footer={[<Button key="close" onClick={() => setPreviewModal({ visible: false, document: null })}>Close</Button>]}
      >
        {previewModal.document && (
          <div>
            <div style={{ marginBottom: 16, fontSize: isMobile ? 12 : 14 }}>
              <span style={{ fontWeight: 600 }}>Type: </span>
              <span style={{ marginLeft: 8 }}>{previewModal.document?.document_type}</span>
              <span style={{ fontWeight: 600, marginLeft: 16 }}>Version: </span>
              <span style={{ marginLeft: 8 }}>{previewModal.document?.document_version}</span>
            </div>
            {previewModal.document.document_name?.match(/\.(jpg|jpeg|png|gif|bmp)$/i) ? (
              <div style={{ textAlign: 'center' }}>
                <Image src={previewModal.document.document_url} alt={previewModal.document.document_name} style={{ maxWidth: '100%', maxHeight: isMobile ? '50vh' : '65vh' }} />
              </div>
            ) : previewModal.document.document_name?.match(/\.pdf$/i) ? (
              <div style={{ height: isMobile ? '60vh' : '75vh' }}>
                <iframe src={previewModal.document.document_url} style={{ width: '100%', height: '100%', border: 'none' }} title={previewModal.document.document_name} />
              </div>
            ) : (
              <div style={{ height: isMobile ? '60vh' : '75vh' }}>
                <iframe src={previewModal.document.document_url} style={{ width: '100%', height: '100%', border: 'none' }} title={previewModal.document.document_name} />
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );                                                                                                              
};
export default OrderRMHierarchyTable;
