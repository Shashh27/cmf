import React, { useEffect, useState, useMemo, useRef } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../Config/auth';
import { Spin, Empty, Alert, Select, Modal, Button, Image, Input, message } from 'antd';
import { EyeOutlined, FileTextOutlined, PlusOutlined, SaveOutlined, CheckOutlined } from '@ant-design/icons';
import PlannedRMActions from './PlannedRMActions';
import PlanProcureRMDownload from '../DownloadReports/PlanProcureRMDownload';
const { Option } = Select;

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

const CompactDimensionInputs = ({ formType, dimensions, onChange, isMobile }) => {
  const handleInputKeyDown = (e) => {
    if ([8, 9, 27, 13, 37, 38, 39, 40].includes(e.keyCode)) return;
    if (e.ctrlKey && [65, 67, 86, 88].includes(e.keyCode)) return;
    if (e.key && !/^\d$/.test(e.key)) e.preventDefault();
  };

  const inputStyle = {
    width: isMobile ? 45 : 55,
    fontSize: isMobile ? 9 : 10,
    padding: isMobile ? '2px 3px' : '3px 5px',
    border: '1px solid #d9d9d9',
    borderRadius: '2px',
    textAlign: 'center',
    MozAppearance: 'textfield',
    WebkitAppearance: 'none'
  };
  const labelStyle = { fontSize: isMobile ? 9 : 10, color: '#333', fontWeight: 500, marginRight: 3 };
  const rowStyle = { display: 'flex', alignItems: 'center', gap: isMobile ? 5 : 8 };

  if (formType === 'Round') {
    return (
      <>
        <style>{`
          input[type=number]::-webkit-outer-spin-button,
          input[type=number]::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
          }
        `}</style>
        <div style={rowStyle}>
          <span style={labelStyle}>Dia</span>
          <input
            type="number"
            style={inputStyle}
            value={dimensions?.diameter || ''}
            onChange={(e) => onChange('diameter', parseFloat(e.target.value) || 0)}
            onKeyDown={handleInputKeyDown}
            placeholder="0"
          />
          <span style={labelStyle}>Len</span>
          <input
            type="number"
            style={inputStyle}
            value={dimensions?.length || ''}
            onChange={(e) => onChange('length', parseFloat(e.target.value) || 0)}
            onKeyDown={handleInputKeyDown}
            placeholder="0"
          />
        </div>
      </>
    );
  }

  if (formType === 'Square') {
    return (
      <>
        <style>{`
          input[type=number]::-webkit-outer-spin-button,
          input[type=number]::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
          }
        `}</style>
        <div style={rowStyle}>
          <span style={labelStyle}>Br</span>
          <input
            type="number"
            style={inputStyle}
            value={dimensions?.breadth || ''}
            onChange={(e) => onChange('breadth', parseFloat(e.target.value) || 0)}
            onKeyDown={handleInputKeyDown}
            placeholder="0"
          />
          <span style={labelStyle}>Ht</span>
          <input
            type="number"
            style={inputStyle}
            value={dimensions?.height || ''}
            onChange={(e) => onChange('height', parseFloat(e.target.value) || 0)}
            onKeyDown={handleInputKeyDown}
            placeholder="0"
          />
          <span style={labelStyle}>Len</span>
          <input
            type="number"
            style={inputStyle}
            value={dimensions?.length || ''}
            onChange={(e) => onChange('length', parseFloat(e.target.value) || 0)}
            onKeyDown={handleInputKeyDown}
            placeholder="0"
          />
        </div>
      </>
    );
  }

  if (formType === 'Pipe') {
    return (
      <>
        <style>{`
          input[type=number]::-webkit-outer-spin-button,
          input[type=number]::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
          }
        `}</style>
        <div style={rowStyle}>
          <span style={labelStyle}>ID</span>
          <input
            type="number"
            style={inputStyle}
            value={dimensions?.inner_diameter || ''}
            onChange={(e) => onChange('inner_diameter', parseFloat(e.target.value) || 0)}
            onKeyDown={handleInputKeyDown}
            placeholder="0"
          />
          <span style={labelStyle}>OD</span>
          <input
            type="number"
            style={inputStyle}
            value={dimensions?.outer_diameter || ''}
            onChange={(e) => onChange('outer_diameter', parseFloat(e.target.value) || 0)}
            onKeyDown={handleInputKeyDown}
            placeholder="0"
          />
          <span style={labelStyle}>Len</span>
          <input
            type="number"
            style={inputStyle}
            value={dimensions?.length || ''}
            onChange={(e) => onChange('length', parseFloat(e.target.value) || 0)}
            onKeyDown={handleInputKeyDown}
            placeholder="0"
          />
        </div>
      </>
    );
  }

  return null;
};

const OrderRMHierarchyTable = ({ rawMaterials, refreshTrigger }) => {
  const [loading, setLoading] = useState(false);
  const [ordersData, setOrdersData] = useState([]);
  const [error, setError] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState([]);
  const [selectedRM, setSelectedRM] = useState([]);
  const [selectedPartNumber, setSelectedPartNumber] = useState([]);
  const [selectedStockSource, setSelectedStockSource] = useState([]);
  const [previewModal, setPreviewModal] = useState({ visible: false, document: null });
  const [planningData, setPlanningData] = useState({});
  const [stockRecommendations, setStockRecommendations] = useState({});
  const [plannedBasedRecommendations, setPlannedBasedRecommendations] = useState({});
  const [savedRows, setSavedRows] = useState({});
  const [loadingSave, setLoadingSave] = useState({});
  const rawMaterialsList = rawMaterials || [];
  const [linkedStockMap, setLinkedStockMap] = useState({});
  const [procuredMap, setProcuredMap] = useState({});
  // ── Column header filters ──────────────────────────────────────────────────
  const [colOrder, setColOrder] = useState([]);
  const [colRM, setColRM] = useState([]);
  const [colPartNumber, setColPartNumber] = useState([]);
  const [colFormType, setColFormType] = useState([]);
  const [colSource, setColSource] = useState([]);
  const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
  const userId = storedUser?.id;

  useEffect(() => { fetchAllOrdersHierarchy(); }, []);

  // Refresh when parent signals this tab became active after a mutation
  useEffect(() => {
    if (refreshTrigger > 0) fetchAllOrdersHierarchy();
  }, [refreshTrigger]);

  const updateLinkedStockStatus = (partId, linkedStock) => {
    if (linkedStock) {
      setLinkedStockMap(prev => ({ ...prev, [partId]: linkedStock }));
    } else {
      setLinkedStockMap(prev => {
        const { [partId]: _, ...rest } = prev;
        return rest;
      });
    }
  };

  const fetchAllOrdersHierarchy = async () => {
    try {
      setLoading(true);
      setError(null);
      const ordersResponse = await axios.get(`${API_BASE_URL}/orders/`, { params: { admin_id: userId } });
      const orders = ordersResponse.data || [];
      const ordersWithHierarchy = await Promise.all(orders.map(async (order) => {
        try {
          const hierarchyResponse = await axios.get(`${API_BASE_URL}/rawmaterials/order-raw-material-hierarchy/${order.id}`);
          return { ...order, hierarchy: hierarchyResponse.data.product_hierarchy };
        } catch { return { ...order, hierarchy: null }; }
      }));
      setOrdersData(ordersWithHierarchy);
      
      // Extract linked stock information from hierarchy
      const linkedStockInfo = {};
      const procuredInfo = {};
      ordersWithHierarchy.forEach(order => {
        if (order.hierarchy) {
          // Check direct_parts
          if (order.hierarchy.direct_parts) {
            order.hierarchy.direct_parts.forEach(directPart => {
              if (directPart.part?.id) {
                if (directPart.part.raw_material_unit_id) {
                  linkedStockInfo[directPart.part.id] = {
                    stockId: directPart.part.raw_material_stock_id,
                    unitId: directPart.part.raw_material_unit_id,
                    sourceType: directPart.part.raw_material_unit_details?.source_type || directPart.part.raw_material_stock_details?.source_type,
                    orderStatus: directPart.part.raw_material_stock_details?.order_status
                  };
                }
                // Check if material is procured (source_type is 'order')
                if (directPart.part.raw_material_unit_details?.source_type === 'order' || 
                    directPart.part.raw_material_stock_details?.source_type === 'order') {
                  procuredInfo[directPart.part.id] = true;
                }
              }
            });
          }
          
          // Check parts in assemblies
          if (order.hierarchy.assemblies) {
            order.hierarchy.assemblies.forEach(assembly => {
              if (assembly.parts) {
                assembly.parts.forEach(partDetail => {
                  if (partDetail.part?.id) {
                    if (partDetail.part.raw_material_unit_id) {
                      linkedStockInfo[partDetail.part.id] = {
                        stockId: partDetail.part.raw_material_stock_id,
                        unitId: partDetail.part.raw_material_unit_id,
                        sourceType: partDetail.part.raw_material_unit_details?.source_type || partDetail.part.raw_material_stock_details?.source_type,
                        orderStatus: partDetail.part.raw_material_stock_details?.order_status
                      };
                    }
                    // Check if material is procured (source_type is 'order')
                    if (partDetail.part.raw_material_unit_details?.source_type === 'order' || 
                        partDetail.part.raw_material_stock_details?.source_type === 'order') {
                      procuredInfo[partDetail.part.id] = true;
                    }
                  }
                });
              }
              // Check subassemblies
              if (assembly.subassemblies) {
                assembly.subassemblies.forEach(subassembly => {
                  if (subassembly.parts) {
                    subassembly.parts.forEach(partDetail => {
                      if (partDetail.part?.id) {
                        if (partDetail.part.raw_material_unit_id) {
                          linkedStockInfo[partDetail.part.id] = {
                            stockId: partDetail.part.raw_material_stock_id,
                            unitId: partDetail.part.raw_material_unit_id,
                            sourceType: partDetail.part.raw_material_unit_details?.source_type || partDetail.part.raw_material_stock_details?.source_type,
                            orderStatus: partDetail.part.raw_material_stock_details?.order_status
                          };
                        }
                        // Check if material is procured (source_type is 'order')
                        if (partDetail.part.raw_material_unit_details?.source_type === 'order' || 
                            partDetail.part.raw_material_stock_details?.source_type === 'order') {
                          procuredInfo[partDetail.part.id] = true;
                        }
                      }
                    });
                  }
                });
              }
            });
          }
        }
      });
      setLinkedStockMap(linkedStockInfo);
      setProcuredMap(procuredInfo);
    } catch { setError('Failed to fetch orders'); } finally { setLoading(false); }
  };

  const getLatestExtractedData = (arr) => {
    if (!arr?.length) return null;
    return [...arr].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  };

  const getAllParts = (hierarchy) => {
    const parts = [];
    const processAssembly = (assembly, path = []) => {
      const currentPath = [...path, assembly.assembly.assembly_name];
      assembly.parts?.forEach(p => parts.push({ ...p, path: currentPath.join(' > ') }));
      assembly.subassemblies?.forEach(sub => processAssembly(sub, currentPath));
    };
    hierarchy?.direct_parts?.forEach(p => parts.push({ ...p, path: 'Direct Parts' }));
    hierarchy?.assemblies?.forEach(a => processAssembly(a));
    return parts;
  };

  const getLatest2DDocument = (documents) => {
    if (!documents || !Array.isArray(documents) || documents.length === 0) return null;
    const docs2D = documents.filter(doc => doc.document_type?.toLowerCase() === '2d');
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

    // Parenthesized dia pattern -> Round
    if (/\(dia\)/i.test(cleaned)) return 'Round';

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

  const checkMaterialExists = (materialName) => {
    if (!materialName || !rawMaterialsList || rawMaterialsList.length === 0) return false;
    const normalizedExtracted = materialName.toLowerCase().replace(/\s+/g, '');
    return rawMaterialsList.some(rm => rm.material_name?.toLowerCase().replace(/\s+/g, '') === normalizedExtracted);
  };

  const handlePlanningChange = (key, field, value) => {
    setPlanningData(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value
      }
    }));
  };

  const fetchStockRecommendations = async (materialName, dimensionsStr, key) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/rawmaterials/recommend-stocks`, {
        material_name: materialName,
        dimensions_str: dimensionsStr,
        min_score: 0.3,
        max_recommendations: 5
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
          max_recommendations: 5
        }));

      if (requests.length === 0) return;

      const response = await axios.post(`${API_BASE_URL}/rawmaterials/recommend-stocks/batch`, {
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

  const savePlannedRM = async (row) => {
    try {
      setLoadingSave(prev => ({ ...prev, [row.key]: true }));
      
      const planning = planningData[row.key] || {};
      const dimensions = planning.dimensions || {};
      
      // Map dimensions based on form type
      const updateData = {
        extracted_data_id: row.extractedDataId,
        planned_form_type: planning.formType,
        planned_diameter: dimensions.diameter,
        planned_length: dimensions.length,
        planned_breadth: dimensions.breadth,
        planned_height: dimensions.height,
        planned_inner_diameter: dimensions.inner_diameter,
        planned_outer_diameter: dimensions.outer_diameter,
        user_id: userId
      };

      await axios.post(`${API_BASE_URL}/planned-raw-materials/create`, updateData);
      
      setSavedRows(prev => ({ ...prev, [row.key]: true }));
      message.success('Planned raw material saved successfully');
      
      // Fetch stock recommendations based on planned dimensions
      await fetchPlannedBasedRecommendations(row, planning);
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
      
      if (!dimensionStr || !row.rmName) {
        return;
      }
      
      const response = await axios.post(`${API_BASE_URL}/rawmaterials/recommend-stocks/batch`, {
        requests: [{
          material_name: row.rmName,
          dimensions_str: dimensionStr,
          min_score: 0.3,
          max_recommendations: 5
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

  const fetchExistingPlannedRM = async (rows) => {
    try {
      const extractedDataIds = rows.filter(r => r.extractedDataId).map(r => r.extractedDataId);
      if (extractedDataIds.length === 0) return;
      
      const response = await axios.post(`${API_BASE_URL}/planned-raw-materials/batch-get`, {
        extracted_data_ids: extractedDataIds
      });
      
      const plannedDataMap = {};
      const savedRowsMap = {};
      const recommendationsMap = {};
      
      response.data.forEach(item => {
        if (item.planned_form_type) {
          // Use the extracted data ID to find the corresponding row key
          const row = rows.find(r => r.extractedDataId === item.id);
          if (row) {
            plannedDataMap[row.key] = {
              formType: item.planned_form_type,
              dimensions: {
                diameter: item.planned_diameter,
                length: item.planned_length,
                breadth: item.planned_breadth,
                height: item.planned_height,
                inner_diameter: item.planned_inner_diameter,
                outer_diameter: item.planned_outer_diameter
              }
            };
            savedRowsMap[row.key] = true;
            recommendationsMap[row.key] = item.recommendations || [];
          }
        }
      });
      
      setPlanningData(prev => ({ ...prev, ...plannedDataMap }));
      setSavedRows(prev => ({ ...prev, ...savedRowsMap }));
      setPlannedBasedRecommendations(prev => ({ ...prev, ...recommendationsMap }));
    } catch (err) {
      console.error('Failed to fetch existing planned RM:', err);
    }
  };

  const groupPartsByMaterial = (parts) => {
    const groups = {};
    parts.forEach(part => {
      const latest = getLatestExtractedData(part.extracted_data);
      const name = latest?.material || '2D Document Not Uploaded';
      if (!groups[name]) groups[name] = { materialName: name, parts: [] };
      groups[name].parts.push(part);
    });
    return Object.values(groups);
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
          const materialExists = checkMaterialExists(group.materialName);
          const key = `${order.id}-${group.materialName}-${part.part.id}`;
          rows.push({
            key,
            orderId: order.id,
            orderName: order.sale_order_number,
            rmName: group.materialName,
            rmId: part.part.raw_material_id,
            materialExists,
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
            linkedMaterial: part.part.raw_material_name || 'Not Assigned',
            linkedStock: part.part.raw_material_stock_dimensions || 'N/A',
            stockSource: part.part.raw_material_unit_details?.source_type || 'N/A',
          });
          partIndex++;
        });
      });
    });
    return rows;
  }, [ordersData, rawMaterials]);

  const orderOptions = useMemo(() => [...new Set(tableData.map(r => r.orderName))], [tableData]);
  const rmOptions = useMemo(() => {
    const base = selectedOrder.length > 0 ? tableData.filter(r => selectedOrder.includes(r.orderName)) : tableData;
    return [...new Set(base.map(r => r.rmName))];
  }, [tableData, selectedOrder]);

  useEffect(() => {
    setSelectedPartNumber([]);
  }, [selectedOrder]);

  useEffect(() => {
    // Auto-detect form type and pre-fill dimensions for all rows
    tableData.forEach(row => {
      if (row.rmName && row.dimension) {
        // Auto-detect form type and pre-fill dimensions
        const formType = detectFormTypeFromDimensions(row.dimension);
        const parsedDims = parseDimensions(row.dimension, formType);

        // Check if there's saved planned RM data
        if (row.plannedFormType) {
          setSavedRows(prev => ({ ...prev, [row.key]: true }));
          setPlanningData(prev => ({
            ...prev,
            [row.key]: {
              ...prev[row.key],
              formType: row.plannedFormType,
              dimensions: row.plannedDimensions || {}
            }
          }));
        } else {
          // Use auto-detected values if no saved data
          setPlanningData(prev => ({
            ...prev,
            [row.key]: {
              ...prev[row.key],
              formType,
              dimensions: parsedDims
            }
          }));
        }
      }
    });
    
    // Fetch existing planned RM data and load recommendations
    fetchExistingPlannedRM(tableData);
  }, [tableData]);

  const partNumberOptions = useMemo(() => {
    const base = selectedOrder.length > 0 ? tableData.filter(r => selectedOrder.includes(r.orderName)) : tableData;
    return [...new Set(base.map(r => r.partNumber))];
  }, [tableData, selectedOrder]);

  // Derived column filter options
  const colFilterOptions = useMemo(() => ({
    orders: [...new Set(tableData.map(r => r.orderName).filter(Boolean))].sort(),
    rms: [...new Set(tableData.map(r => r.rmName).filter(Boolean))].sort(),
    partNumbers: [...new Set(tableData.map(r => r.partNumber).filter(Boolean))].sort(),
    formTypes: [...new Set(tableData.map(r => planningData[r.key]?.formType).filter(Boolean))].sort(),
    sources: ['General Stock', 'Procured', 'Not Assigned'],
  }), [tableData, planningData]);

  const filteredRows = useMemo(() => {
    const rows = tableData.filter(r => {
      if (selectedOrder.length > 0 && !selectedOrder.includes(r.orderName)) return false;
      if (selectedRM.length > 0 && !selectedRM.includes(r.rmName)) return false;
      if (selectedPartNumber.length > 0 && !selectedPartNumber.includes(r.partNumber)) return false;
      if (selectedStockSource.length > 0) {
        const src = linkedStockMap[r.partId]?.sourceType;
        if (selectedStockSource.includes('general') && src !== 'general') return false;
        if (selectedStockSource.includes('order') && src !== 'order') return false;
        if (selectedStockSource.includes('not_assigned') && linkedStockMap[r.partId]) return false;
      }
      // Column header filters
      if (colOrder.length > 0 && !colOrder.includes(r.orderName)) return false;
      if (colRM.length > 0 && !colRM.includes(r.rmName)) return false;
      if (colPartNumber.length > 0 && !colPartNumber.includes(r.partNumber)) return false;
      if (colFormType.length > 0 && !colFormType.includes(planningData[r.key]?.formType)) return false;
      if (colSource.length > 0) {
        const src = linkedStockMap[r.partId]?.sourceType;
        const label = src === 'order' ? 'Procured' : src === 'general' ? 'General Stock' : 'Not Assigned';
        if (!colSource.includes(label)) return false;
      }
      return true;
    });
    const orderCount = {};
    const rmCount = {};
    rows.forEach(r => {
      orderCount[r.orderName] = (orderCount[r.orderName] || 0) + 1;
      const k = `${r.orderName}__${r.rmName}`;
      rmCount[k] = (rmCount[k] || 0) + 1;
    });
    const orderSeen = {};
    const rmSeen = {};
    return rows.map(r => {
      const k = `${r.orderName}__${r.rmName}`;
      const oSpan = orderSeen[r.orderName] ? 0 : orderCount[r.orderName];
      const rSpan = rmSeen[k] ? 0 : rmCount[k];
      orderSeen[r.orderName] = true;
      rmSeen[k] = true;
      return { ...r, orderRowSpan: oSpan, rmRowSpan: rSpan };
    });
  }, [tableData, selectedOrder, selectedRM, selectedPartNumber, selectedStockSource, linkedStockMap, colOrder, colRM, colPartNumber, colFormType, colSource, planningData]); // eslint-disable-line

  const border = '1px solid #000';
  const isMobile = window.innerWidth <= 768;
  const thStyle = { border, padding: '2px 4px', textAlign: 'center', fontWeight: 600, fontSize: isMobile ? 10 : 12, background: '#f0f0f0' };
  const tdStyle = { border, padding: '2px 4px', fontSize: isMobile ? 9 : 11, verticalAlign: 'middle', textAlign: 'center', color: '#000' };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spin size="large" /><div style={{ marginTop: 12 }}>Loading...</div></div>;
  if (error) return <Alert message="Error" description={error} type="error" showIcon style={{ margin: 16 }} />;

  return (
    <div style={{ padding: isMobile ? 8 : 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: isMobile ? 10 : 14, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, fontSize: isMobile ? 14 : 16, whiteSpace: 'nowrap' }}>Plan & Procure Raw Materials</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end' }}>
          <Select mode="multiple" value={selectedOrder} placeholder="Order" allowClear showSearch maxTagCount="responsive" style={{ minWidth: isMobile ? 110 : 160 }} onChange={val => { setSelectedOrder(val || []); setSelectedRM([]); setSelectedPartNumber([]); }}>
            {orderOptions.map(o => <Option key={o} value={o}>{o}</Option>)}
          </Select>
          <Select mode="multiple" value={selectedPartNumber} placeholder="Part Number" allowClear showSearch maxTagCount="responsive" style={{ minWidth: isMobile ? 110 : 160 }} onChange={val => setSelectedPartNumber(val || [])}>
            {partNumberOptions.map(p => <Option key={p} value={p}>{p}</Option>)}
          </Select>
          <Select mode="multiple" value={selectedRM} placeholder="Raw Material" allowClear showSearch maxTagCount="responsive" style={{ minWidth: isMobile ? 110 : 160 }} onChange={val => setSelectedRM(val || [])}>
            {rmOptions.map(r => <Option key={r} value={r}>{r}</Option>)}
          </Select>
          <Select mode="multiple" value={selectedStockSource} placeholder="Stock Source" allowClear maxTagCount="responsive" style={{ minWidth: isMobile ? 110 : 140 }} onChange={val => setSelectedStockSource(val || [])}>
            <Option value="general">General Stock</Option>
            <Option value="order">Procured</Option>
            <Option value="not_assigned">Not Assigned</Option>
          </Select>
          {(selectedOrder.length > 0 || selectedRM.length > 0 || selectedPartNumber.length > 0 || selectedStockSource.length > 0) && (
            <Button size="small" danger onClick={() => { setSelectedOrder([]); setSelectedPartNumber([]); setSelectedRM([]); setSelectedStockSource([]); }}>
              Clear
            </Button>
          )}
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
                <th style={thStyle}>Part Name</th>
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
                    <Select
                      size="small"
                      value={planningData[row.key]?.formType || undefined}
                      placeholder="Select"
                      style={{ width: isMobile ? 80 : 100, fontSize: isMobile ? 9 : 11 }}
                      onChange={(val) => {
                        handlePlanningChange(row.key, 'formType', val);
                        // Clear dimensions when form type changes
                        handlePlanningChange(row.key, 'dimensions', {});
                      }}
                    >
                      <Option value="Round">Round</Option>
                      <Option value="Square">Square</Option>
                      <Option value="Pipe">Pipe</Option>
                    </Select>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'left', minWidth: isMobile ? '150px' : '220px', verticalAlign: 'top' }}>
                    {savedRows[row.key] && planningData[row.key]?.formType && (
                      <div style={{ marginBottom: 8, padding: '4px 8px', backgroundColor: '#f0f8ff', borderRadius: '4px', border: '1px solid #b3d9ff' }}>
                        <div style={{ fontSize: isMobile ? 9 : 10, fontWeight: 600, color: '#1890ff', marginBottom: 2 }}>
                          Planned: {planningData[row.key].formType}
                        </div>
                        {planningData[row.key].formType === 'Round' && planningData[row.key].dimensions?.diameter && planningData[row.key].dimensions?.length && (
                          <div style={{ fontSize: isMobile ? 8 : 9, color: '#666' }}>
                            {planningData[row.key].dimensions.diameter} DIA x {planningData[row.key].dimensions.length} LENGTH
                          </div>
                        )}
                        {planningData[row.key].formType === 'Square' && planningData[row.key].dimensions?.breadth && planningData[row.key].dimensions?.height && planningData[row.key].dimensions?.length && (
                          <div style={{ fontSize: isMobile ? 8 : 9, color: '#666' }}>
                            {planningData[row.key].dimensions.breadth} x {planningData[row.key].dimensions.height} x {planningData[row.key].dimensions.length}
                          </div>
                        )}
                        {planningData[row.key].formType === 'Pipe' && planningData[row.key].dimensions?.outer_diameter && planningData[row.key].dimensions?.inner_diameter && planningData[row.key].dimensions?.length && (
                          <div style={{ fontSize: isMobile ? 8 : 9, color: '#666' }}>
                            {planningData[row.key].dimensions.outer_diameter} OD x {planningData[row.key].dimensions.inner_diameter} ID x {planningData[row.key].dimensions.length} LENGTH
                          </div>
                        )}
                      </div>
                    )}
                    {planningData[row.key]?.formType && (
                      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                        <div style={{ flex: 1 }}>
                          <CompactDimensionInputs
                            formType={planningData[row.key].formType}
                            dimensions={planningData[row.key].dimensions || {}}
                            onChange={(field, value) => handlePlanningChange(row.key, 'dimensions', { ...planningData[row.key].dimensions, [field]: value })}
                            isMobile={isMobile}
                          />
                        </div>
                        <Button
                          size="small"
                          type={savedRows[row.key] ? "default" : "primary"}
                          loading={loadingSave[row.key]}
                          onClick={() => savePlannedRM(row)}
                          disabled={!row.materialExists || linkedStockMap[row.partId]}
                          icon={savedRows[row.key] ? <CheckOutlined /> : <SaveOutlined />}
                          style={{ 
                            fontSize: isMobile ? 9 : 10, 
                            padding: isMobile ? '1px 4px' : '2px 8px',
                            borderRadius: '3px',
                            fontWeight: 500,
                            height: isMobile ? '20px' : '24px',
                            minWidth: isMobile ? '50px' : '70px',
                            marginTop: isMobile ? 0 : 2
                          }}
                        >
                          {savedRows[row.key] ? 'Update' : 'Save'}
                        </Button>
                        {!row.materialExists && row.rmName !== '2D Document Not Uploaded' && (
                          <div style={{ marginTop: 4, fontSize: 9, color: '#ff4d4f', maxWidth: 150 }}>
                            Raw material not available. Please create it first.
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'left', minWidth: isMobile ? '120px' : '150px', verticalAlign: 'top' }}>
                    <PlannedRMActions 
                      row={row} 
                      recommendations={plannedBasedRecommendations[row.key] || []}
                      isMobile={isMobile}
                      planningData={planningData}
                      isSaved={savedRows[row.key]}
                      materialExists={row.materialExists}
                      linkedStock={linkedStockMap[row.partId] || null}
                      isProcured={procuredMap[row.partId] || false}
                      updateLinkedStock={updateLinkedStockStatus}
                      onRefresh={fetchAllOrdersHierarchy}
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