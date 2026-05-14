import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth";
import { 
  Card, Table, Button, Select, message, Spin, Tree, 
  Modal, InputNumber, Tag, Typography, Space, Collapse,
  Empty, Row, Col, Alert, App, Input, Tooltip
} from "antd";
import { 
  ShoppingCartOutlined, 
  LinkOutlined, 
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  DeleteOutlined,
  SafetyCertificateOutlined,
  EditOutlined
} from "@ant-design/icons";
import DimensionInputs from "./DimensionInputs";
import { PartsWithRawMaterialsStatusPdfDownload } from "../DownloadReports/RawMaterialsPdfDownload";

const { Text } = Typography;
const { Option } = Select;

const PartsWithRawMaterialStatusTab = ({ onDataChanged }) => {
  const [linkedMaterials, setLinkedMaterials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [pagination, setPagination] = useState({ current: 1, pageSize: 15 });
  const [statusEditModalOpen, setStatusEditModalOpen] = useState(false);
  const [statusEditRecord, setStatusEditRecord] = useState(null);
  const [statusEditOrderQty, setStatusEditOrderQty] = useState(null);
  const [statusEditDimensions, setStatusEditDimensions] = useState({
    diameter: '',
    length: '',
    breadth: '',
    height: '',
    inner_diameter: '',
    outer_diameter: ''
  });
  const [statusEditCurrentLinkages, setStatusEditCurrentLinkages] = useState([]);
  const [statusEditPartQuantities, setStatusEditPartQuantities] = useState({});
  const [statusEditPartRequiredLengths, setStatusEditPartRequiredLengths] = useState({});
  const [statusEditPartRawMaterialUnits, setStatusEditPartRawMaterialUnits] = useState({});
  const [availableUnits, setAvailableUnits] = useState([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [orderHierarchyMap, setOrderHierarchyMap] = useState({});
  const [vendors, setVendors] = useState([]);
  const [statusEditReceivedVendorId, setStatusEditReceivedVendorId] = useState(null);
  
  // Quick status modal states
  const [quickStatusModalOpen, setQuickStatusModalOpen] = useState(false);
  const [quickStatusRecord, setQuickStatusRecord] = useState(null);
  const [quickStatusReceivedVendorId, setQuickStatusReceivedVendorId] = useState(null);

  const fetching = useRef(false);
  const initializedRef = useRef(false);

  const { modal, message } = App.useApp();

  const getCurrentUserId = () => {
    try {
      const stored = localStorage.getItem("user");
      if (!stored) return null;
      const u = JSON.parse(stored);
      if (u?.id == null) return null;
      return u.id;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    fetchLinkedMaterials();
    fetchVendors(); // Fetch vendors on component load
  }, []);

  const fetchLinkedMaterials = async () => {
    if (fetching.current) return;
    fetching.current = true;
    setLoading(true);
    try {
      const uid = getCurrentUserId();
      // Admin dashboard - use combined filtering to see all materials from orders where admin is involved
      const response = await axios.get(`${API_BASE_URL}/rawmaterials/order-parts-raw-material-linked/`, {
        params: uid != null ? { admin_id: uid } : undefined,
      });
      
      setLinkedMaterials(response.data);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
      fetching.current = false;
    }
  };

  const fetchVendors = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/rawmaterials/vendors`);
      setVendors(response.data || []);
    } catch (error) {
      console.error("Error fetching vendors:", error);
    }
  };

  // Function to get vendors from the comma-separated vendor_id string
  const getEnquiryVendors = (record) => {
    if (!record?.vendor_id) return [];
    
    const vendorIds = record.vendor_id.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
    return vendors.filter(vendor => vendorIds.includes(vendor.id));
  };

  const getStatusColor = (status) => {
    const colors = {
      enquiry: 'cyan',
      purchase_request: 'orange',
      purchase_order: 'warning',
      received: 'success',
      available: 'success',
      exhausted: 'error'
    };
    return colors[status] || 'default';
  };

  const handleQuickStatusChange = (record) => {
    // Open the quick status modal with current record data
    setQuickStatusRecord({ 
      ...record, 
      order_status: record.order_status || record.material_status || 'enquiry',
      material_status: record.material_status || record.order_status || 'enquiry'
    });
    setQuickStatusReceivedVendorId(record.received_vendor_id || null);
    setQuickStatusModalOpen(true);
  };

  const handleSaveQuickStatus = async () => {
    if (!quickStatusRecord) return;
    try {
      const record = quickStatusRecord;
      const stockId = record.id;
      const newStatus = record.order_status || record.material_status;
      const newVendor = quickStatusReceivedVendorId;

      // Validate vendor selection when status is purchase_request, purchase_order, or received
      if (newStatus === 'purchase_request' || newStatus === 'purchase_order' || newStatus === 'received') {
        if (!quickStatusReceivedVendorId) {
          message.error('Vendor selection is required when status is purchase_request, purchase_order, or received');
          return;
        }
      }

      // Always call PUT endpoint to update status and vendor
      const updateData = {
        order_status: newStatus
      };
      
      if (newVendor) {
        updateData.received_vendor_id = newVendor;
      }
      
      await axios.put(
        `${API_BASE_URL}/rawmaterials/order-parts-raw-material-linked/${stockId}`,
        updateData,
        { headers: { "Content-Type": "application/json" } }
      );

      // Force refresh the table data
      await new Promise(resolve => setTimeout(resolve, 500));
      await fetchLinkedMaterials();
      if (typeof onDataChanged === "function") {
        onDataChanged();
      }
      message.success("Status updated successfully");
      setQuickStatusModalOpen(false);
      setQuickStatusRecord(null);
      setQuickStatusReceivedVendorId(null);
    } catch (error) {
      message.error(error?.response?.data?.detail || error?.response?.data?.message || "Error updating status");
    }
  };

  const handleSaveStatusEdit = async () => {
    if (!statusEditRecord) return;
    try {
      const record = statusEditRecord;
      const stockId = record.id;

      // Validate that if unit is selected, required length must be entered
      for (const linkage of statusEditCurrentLinkages) {
        const partId = linkage.part_id;
        const unitId = statusEditPartRawMaterialUnits[partId];
        const requiredLength = statusEditPartRequiredLengths[partId];
        
        if (unitId && !requiredLength) {
          message.error('Please enter required length for all linked parts');
          return;
        }
      }

      // Always call PUT endpoint to update stock details
      const updateData = {
        quantity: statusEditOrderQty || record.quantity,
        form_type: record.form_type || "Round",
        part_ids: statusEditCurrentLinkages.map(l => l.part_id).join(','),
        part_quantities: statusEditCurrentLinkages.reduce((acc, l) => {
          acc[l.part_id] = statusEditPartQuantities[l.part_id] || 1;
          return acc;
        }, {}),
        required_lengths: statusEditCurrentLinkages.reduce((acc, l) => {
          acc[l.part_id] = statusEditPartRequiredLengths[l.part_id] || '';
          return acc;
        }, {})
      };
      
      // Add dimensions based on form type
      if (record.form_type === 'Round') {
        updateData.diameter = statusEditDimensions.diameter;
        updateData.length = statusEditDimensions.length;
      } else if (record.form_type === 'Square') {
        updateData.length = statusEditDimensions.length;
        updateData.breadth = statusEditDimensions.breadth;
        updateData.height = statusEditDimensions.height;
      } else if (record.form_type === 'Pipe') {
        updateData.outer_diameter = statusEditDimensions.outer_diameter;
        updateData.inner_diameter = statusEditDimensions.inner_diameter;
        updateData.length = statusEditDimensions.length;
      }
      
      await axios.put(
        `${API_BASE_URL}/rawmaterials/order-parts-raw-material-linked/${stockId}`,
        updateData,
        { headers: { "Content-Type": "application/json" } }
      );
      
      // Assign units to parts using the assign-material endpoint
      for (const linkage of statusEditCurrentLinkages) {
        const partId = linkage.part_id;
        const requiredLength = statusEditPartRequiredLengths[partId];
        const unitId = statusEditPartRawMaterialUnits[partId];
        
        // Only assign if both unit and length are provided
        if (unitId && requiredLength) {
          await axios.post(`${API_BASE_URL}/rawmaterials/assign-material/`, null, {
            params: {
              unit_id: unitId,
              part_id: partId,
              required_length: parseFloat(requiredLength),
              user_id: getCurrentUserId()
            }
          });
        }
      }

      await fetchLinkedMaterials();
      if (typeof onDataChanged === "function") {
        onDataChanged();
      }
      message.success("Status updated successfully");
      setStatusEditModalOpen(false);
      resetModalStates();
    } catch (error) {
      message.error(error?.response?.data?.detail || "Error updating status");
    }
  };

  const resetModalStates = () => {
    setStatusEditRecord(null);
    setStatusEditOrderQty(0);
    setStatusEditDimensions({
      diameter: '',
      length: '',
      breadth: '',
      height: '',
      inner_diameter: '',
      outer_diameter: ''
    });
    setStatusEditCurrentLinkages([]);
    setStatusEditPartQuantities({});
    setStatusEditPartRequiredLengths({});
    setStatusEditPartRawMaterialUnits({});
    setAvailableUnits([]);
    setStatusEditReceivedVendorId(null);
  };

  const getOrderHierarchy = async (orderId) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/orders/${orderId}/hierarchy`);
      return response.data;
    } catch (error) {
      console.error("Error fetching order hierarchy:", error);
      return { parts: [], meta: {} };
    }
  };

  const getAvailablePartsForOrder = (orderHierarchy) => {
    if (!orderHierarchy || !orderHierarchy.product_hierarchy) return { parts: [], meta: {} };
    const { assemblies = [], direct_parts = [] } = orderHierarchy.product_hierarchy || {};
    const parts = [];
    const meta = {};
    const visitAssemblies = (assemblyDetailsList, parentPath = []) => {
      (assemblyDetailsList || []).forEach((ad) => {
        const a = ad.assembly || ad;
        const currentPath = a && a.assembly_name ? [...parentPath, a.assembly_name] : parentPath;
        (ad.parts || []).forEach((pd) => {
          const p = pd.part || pd;
          if (p && p.id && (!p.type_name || p.type_name === "IN-House")) {
            parts.push(p);
            meta[p.id] = {
              path: currentPath,
              isDirect: false,
            };
          }
        });
        const subs = ad.subassemblies || [];
        if (subs.length) visitAssemblies(subs, currentPath);
      });
    };
    visitAssemblies(assemblies, []);
    (direct_parts || []).forEach((pd) => {
      const p = pd.part || pd;
      if (p && p.id && (!p.type_name || p.type_name === "IN-House")) {
        parts.push(p);
        if (!meta[p.id]) {
          meta[p.id] = {
            path: [],
            isDirect: true,
          };
        }
      }
    });
    return { parts, meta };
  };

  const openStatusEditModal = async (record) => {
    setStatusEditRecord(record);
    setStatusEditModalOpen(true);
    
    // Initialize dimensions from record
    setStatusEditDimensions({
      diameter: record.diameter || '',
      length: record.length || '',
      breadth: record.breadth || '',
      height: record.height || '',
      inner_diameter: record.inner_diameter || '',
      outer_diameter: record.outer_diameter || ''
    });
    
    // Use quantity field
    const qty = record.quantity ?? record.available_quantity ?? record.allocated_quantity ?? 0;
    setStatusEditOrderQty(qty);
    setStatusEditReceivedVendorId(record.received_vendor_id || null);
    
    // Extract linked parts from record
    let currentLinkages = [];
    if (record.part_ids) {
      let partIds = record.part_ids;
      if (typeof partIds === 'string') {
        partIds = partIds.split(',').map(id => id.trim()).filter(id => id);
      }
      
      currentLinkages = partIds.map((partId, index) => ({
        id: `${record.id}-${partId}`,
        part_id: parseInt(partId),
        part_number: record.part_numbers?.[index] || `Part-${partId}`,
        part_name: record.part_names?.[index] || 'Unknown Part',
        raw_material_id: record.raw_material_id,
        order_id: record.source_order_id || record.order_id,
        linkage_group_id: record.linkage_group_id
      }));
    }
    
    setStatusEditCurrentLinkages(currentLinkages);
    
    // Initialize part quantities
    const initialQuantities = {};
    const initialRequiredLengths = {};
    const initialRawMaterialUnits = {};
    currentLinkages.forEach(linkage => {
      initialQuantities[linkage.part_id] = linkage.raw_material_required_quantity || 1;
      initialRequiredLengths[linkage.part_id] = linkage.required_length || '';
      // Only set unit ID if it exists in the linkage, otherwise leave empty for user to select
      if (linkage.raw_material_unit_id) {
        initialRawMaterialUnits[linkage.part_id] = linkage.raw_material_unit_id;
      }
    });
    setStatusEditPartQuantities(initialQuantities);
    setStatusEditPartRequiredLengths(initialRequiredLengths);
    setStatusEditPartRawMaterialUnits(initialRawMaterialUnits);
    
    // Fetch available units for this stock
    if (record.id) {
      await fetchAvailableUnits(record.id);
    }
    
    // Fetch order hierarchy
    try {
      const orderId = record.source_order_id || record.order_id;
      
      if (orderId) {
        let hierarchy = orderHierarchyMap[orderId];
        if (!hierarchy) {
          const res = await axios.get(`${API_BASE_URL}/orders/${orderId}/hierarchical`);
          hierarchy = res.data;
          setOrderHierarchyMap(prev => ({ ...prev, [orderId]: hierarchy }));
        }
      }
    } catch (error) {
      console.error("Error fetching order hierarchy:", error);
    }
  };

  const handleDeleteLinkGroup = (record) => {
    modal.confirm({
      title: 'Confirm Delete',
      content: 'Are you sure you want to remove this material from the order and parts?',
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await axios.delete(`${API_BASE_URL}/rawmaterials/order-parts-raw-material-linked/${record.id}`, {
            params: { user_id: getCurrentUserId() ?? undefined },
          });
      await fetchLinkedMaterials();
      if (typeof onDataChanged === "function") {
        onDataChanged();
      }
          message.success("Linked material removed successfully");
        } catch (error) {
          console.error("Error deleting linked material:", error);
          const detail =
            error?.response?.data?.detail ||
            error?.response?.data?.message ||
            "Error deleting linked material";
          message.error(detail);
        }
      },
    });
  };

  const handleLinkedMaterialsSearch = (value) => {
    // Remove special characters but keep alphanumeric, spaces, and decimal points for number search
    const cleanedValue = (value || '').replace(/[^a-zA-Z0-9 .]/g, '');
    setSearchText(cleanedValue.toLowerCase().slice(0, 50));
  };

  const fetchAvailableUnits = async (stockId) => {
    try {
      setLoadingUnits(true);
      const response = await axios.get(`${API_BASE_URL}/rawmaterials/stock/${stockId}/units`);
      setAvailableUnits(response.data || []);
    } catch (error) {
      console.error('Error fetching available units:', error);
      setAvailableUnits([]);
    } finally {
      setLoadingUnits(false);
    }
  };

  const buildTreeData = (hierarchy) => {
    if (!hierarchy || !hierarchy.product_hierarchy) return [];
    
    const { assemblies = [], direct_parts = [] } = hierarchy.product_hierarchy;
    const treeData = [];
    
    // Process assemblies
    assemblies.forEach(assembly => {
      const assemblyNode = {
        title: assembly.assembly?.assembly_name || 'Unknown Assembly',
        key: `assembly-${assembly.assembly?.id}`,
        type: 'assembly',
        children: []
      };
      
      // Process parts in this assembly
      if (assembly.parts && Array.isArray(assembly.parts)) {
        assembly.parts.forEach(partDetail => {
          if (partDetail.part && partDetail.part.id) {
            const part = partDetail.part;
            const sourceType = part.raw_material_source_type || part.raw_material_unit_details?.source_type;
            const isAlreadyLinked = part.raw_material_unit_id !== null && part.raw_material_unit_id !== undefined;
            const isLinkedToGeneralStock = sourceType === 'general' && isAlreadyLinked;
            const isLinkedToOrderStock = sourceType === 'order' && isAlreadyLinked;
            
            // Skip STANDARD and Out-Source WITHOUT_RAW_MATERIAL
            if (part.type_name === "STANDARD" || 
                (part.type_name === "Out-Source" && part.part_detail === "WITHOUT_RAW_MATERIAL")) {
              return;
            }
            
            assemblyNode.children.push({
              title: `${part.part_number} - ${part.part_name}`,
              key: `part-${part.id}`,
              type: 'part',
              part: part,
              isAlreadyLinked: isAlreadyLinked,
              isLinkedToGeneralStock: isLinkedToGeneralStock,
              isLinkedToOrderStock: isLinkedToOrderStock,
              sourceType: sourceType
            });
          }
        });
      }
      
      // Process subassemblies
      if (assembly.subassemblies && Array.isArray(assembly.subassemblies)) {
        assembly.subassemblies.forEach(subassembly => {
          const subNode = {
            title: subassembly.assembly?.assembly_name || 'Unknown Subassembly',
            key: `subassembly-${subassembly.assembly?.id}`,
            type: 'assembly',
            children: []
          };
          
          if (subassembly.parts && Array.isArray(subassembly.parts)) {
            subassembly.parts.forEach(partDetail => {
              if (partDetail.part && partDetail.part.id) {
                const part = partDetail.part;
                const sourceType = part.raw_material_source_type || part.raw_material_unit_details?.source_type;
                const isAlreadyLinked = part.raw_material_unit_id !== null && part.raw_material_unit_id !== undefined;
                const isLinkedToGeneralStock = sourceType === 'general' && isAlreadyLinked;
                const isLinkedToOrderStock = sourceType === 'order' && isAlreadyLinked;
                
                if (part.type_name === "STANDARD" || 
                    (part.type_name === "Out-Source" && part.part_detail === "WITHOUT_RAW_MATERIAL")) {
                  return;
                }
                
                subNode.children.push({
                  title: `${part.part_number} - ${part.part_name}`,
                  key: `part-${part.id}`,
                  type: 'part',
                  part: part,
                  isAlreadyLinked: isAlreadyLinked,
                  isLinkedToGeneralStock: isLinkedToGeneralStock,
                  isLinkedToOrderStock: isLinkedToOrderStock,
                  sourceType: sourceType
                });
              }
            });
          }
          
          assemblyNode.children.push(subNode);
        });
      }
      
      treeData.push(assemblyNode);
    });
    
    // Process direct parts
    if (direct_parts && Array.isArray(direct_parts)) {
      const directNode = {
        title: 'Direct Parts',
        key: 'direct-parts',
        type: 'assembly',
        children: []
      };
      
      direct_parts.forEach(partDetail => {
        if (partDetail.part && partDetail.part.id) {
          const part = partDetail.part;
          const sourceType = part.raw_material_source_type || part.raw_material_unit_details?.source_type;
          const isAlreadyLinked = part.raw_material_unit_id !== null && part.raw_material_unit_id !== undefined;
          const isLinkedToGeneralStock = sourceType === 'general' && isAlreadyLinked;
          const isLinkedToOrderStock = sourceType === 'order' && isAlreadyLinked;
          
          if (part.type_name === "STANDARD" || 
              (part.type_name === "Out-Source" && part.part_detail === "WITHOUT_RAW_MATERIAL")) {
            return;
          }
          
          directNode.children.push({
            title: `${part.part_number} - ${part.part_name}`,
            key: `part-${part.id}`,
            type: 'part',
            part: part,
            isAlreadyLinked: isAlreadyLinked,
            isLinkedToGeneralStock: isLinkedToGeneralStock,
            isLinkedToOrderStock: isLinkedToOrderStock,
            sourceType: sourceType
          });
        }
      });
      
      if (directNode.children.length > 0) {
        treeData.push(directNode);
      }
    }
    
    return treeData;
  };

  const renderTreeNode = (nodeData) => {
    if (nodeData.type === 'part') {
      const { part, isAlreadyLinked, isLinkedToGeneralStock, isLinkedToOrderStock, sourceType } = nodeData;
      const isLinkedToCurrentStock = statusEditCurrentLinkages.some(l => l.part_id === part.id);
      
      return (
        <div className="flex items-center justify-between w-full pr-4 py-1">
          <div className="flex items-center gap-3 flex-1">
            <div className="flex flex-col">
              <span className="font-semibold text-sm text-gray-800">{part.part_number}</span>
              <span className="text-xs text-gray-500">{part.part_name}</span>
            </div>
            <div className="flex gap-1">
              {isLinkedToGeneralStock ? (
                <Tag color="green" className="text-[10px] border-green-200">✓ Linked to General Stock</Tag>
              ) : isLinkedToOrderStock ? (
                <Tag color="blue" className="text-[10px] border-blue-200">✓ Linked to Order Stock</Tag>
              ) : (
                <>
                  {sourceType === 'general' && (
                    <Tag color="orange" className="text-[10px] border-orange-200">General Stock Type</Tag>
                  )}
                  {sourceType === 'order' && (
                    <Tag color="purple" className="text-[10px] border-purple-200">Order Stock Type</Tag>
                  )}
                </>
              )}
            </div>
          </div>
          {(isLinkedToGeneralStock || isLinkedToOrderStock) && (
            <div className="flex items-center gap-2">
              <div className="bg-blue-50 border border-blue-200 rounded px-2 py-1 text-xs">
                <span className="font-semibold text-blue-800">Unit #{part.raw_material_unit_id || 'N/A'}</span>
                <span className="text-blue-600 ml-1">| Length: {part.required_length || 0}mm</span>
              </div>
              {!isLinkedToGeneralStock && (
                <Button 
                  size="small" 
                  danger 
                  onClick={(e) => {
                    e.stopPropagation();
                    Modal.confirm({
                      title: 'Unlink Part',
                      content: `Are you sure you want to unlink part ${part.part_number} from the raw material unit? This will restore the unit's remaining length.`,
                      okText: 'Yes, Unlink',
                      okType: 'danger',
                      cancelText: 'Cancel',
                      onOk: () => handleUnlinkPart(part.id)
                    });
                  }}
                >
                  Unlink
                </Button>
              )}
            </div>
          )}
          {!isLinkedToGeneralStock && !isLinkedToOrderStock && (
            <div className="flex items-center gap-2">
              <Select
                size="small"
                placeholder="Unit"
                value={statusEditPartRawMaterialUnits[part.id] || null}
                onChange={(value) => {
                  const currentLength = statusEditPartRequiredLengths[part.id];
                  
                  // Validate current length against new unit's available length
                  if (currentLength && value) {
                    const selectedUnit = availableUnits.find(u => u.id === value);
                    if (selectedUnit && parseFloat(currentLength) > selectedUnit.remaining_length) {
                      message.error(`Required length (${currentLength}mm) exceeds available length of selected unit (${selectedUnit.remaining_length}mm)`);
                      return;
                    }
                  }
                  
                  setStatusEditPartRawMaterialUnits(prev => ({ ...prev, [part.id]: value }));
                  // Auto-link if not already linked
                  if (!isLinkedToCurrentStock) {
                    handleLinkPart(part);
                  }
                }}
                style={{ width: '200px' }}
                onClick={(e) => e.stopPropagation()}
              >
                {availableUnits.map(unit => (
                  <Option key={unit.id} value={unit.id} disabled={unit.status === 'exhausted'}>
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold">Unit #{unit.id}</span>
                      <span className="text-[10px] text-gray-600">Total: {unit.total_length}mm | Remaining: {unit.remaining_length}mm</span>
                      {unit.status === 'exhausted' && (
                        <span className="text-[10px] text-red-500">Exhausted</span>
                      )}
                    </div>
                  </Option>
                ))}
              </Select>
              <Input
                size="small"
                placeholder="Length"
                value={statusEditPartRequiredLengths[part.id] || ''}
                onChange={(e) => {
                  const value = e.target.value;
                  const selectedUnitId = statusEditPartRawMaterialUnits[part.id];
                  
                  // Validate length against available unit length
                  if (value && selectedUnitId) {
                    const selectedUnit = availableUnits.find(u => u.id === selectedUnitId);
                    if (selectedUnit && parseFloat(value) > selectedUnit.remaining_length) {
                      message.error(`Required length cannot exceed available length (${selectedUnit.remaining_length}mm)`);
                      return;
                    }
                  }
                  
                  setStatusEditPartRequiredLengths(prev => ({ ...prev, [part.id]: value }));
                  // Auto-link if not already linked
                  if (!isLinkedToCurrentStock) {
                    handleLinkPart(part);
                  }
                }}
                style={{ width: '80px' }}
                onClick={(e) => e.stopPropagation()}
              />
              {isLinkedToCurrentStock && (
                <Button 
                  size="small" 
                  danger 
                  icon={<DeleteOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUnlinkPart(part.id);
                  }}
                >
                  Unlink
                </Button>
              )}
            </div>
          )}
        </div>
      );
    }
    
    // Assembly node
    return (
      <span className="font-semibold text-gray-700 flex items-center gap-2">
        <span className="text-blue-600">📁</span>
        {nodeData.title}
      </span>
    );
  };

  const handleLinkPart = (part) => {
    const newLinkage = {
      id: `${statusEditRecord.id}-${part.id}`,
      part_id: part.id,
      part_number: part.part_number,
      part_name: part.part_name,
      raw_material_id: statusEditRecord.raw_material_id || statusEditRecord.material_id,
      order_id: statusEditRecord.source_order_id || statusEditRecord.order_id,
      linkage_group_id: statusEditRecord.linkage_group_id
    };
    
    setStatusEditCurrentLinkages(prev => [...prev, newLinkage]);
    setStatusEditPartQuantities(prev => ({ ...prev, [part.id]: 1 }));
    setStatusEditPartRequiredLengths(prev => ({ ...prev, [part.id]: '' }));
    // Don't set unit ID here - let the user select it from dropdown
  };

  const handleUnlinkPart = async (partId) => {
    try {
      // Call the backend unlink endpoint to properly recalculate
      await axios.delete(`${API_BASE_URL}/rawmaterials/parts/${partId}/unlink-material`);
      
      // Remove from local state
      setStatusEditCurrentLinkages(prev => prev.filter(l => l.part_id !== partId));
      setStatusEditPartQuantities(prev => {
        const newState = { ...prev };
        delete newState[partId];
        return newState;
      });
      setStatusEditPartRequiredLengths(prev => {
        const newState = { ...prev };
        delete newState[partId];
        return newState;
      });
      setStatusEditPartRawMaterialUnits(prev => {
        const newState = { ...prev };
        delete newState[partId];
        return newState;
      });
      
      message.success('Part unlinked successfully');
    } catch (error) {
      console.error('Error unlinking part:', error);
      message.error(error?.response?.data?.detail || 'Error unlinking part');
    }
  };

  const flattenPartsFromOrderHierarchy = (hierarchy) => {
    // This function is no longer needed with tree approach
    return { parts: [], meta: {} };
  };

  const filtered = linkedMaterials.filter(item => {
    if (!searchText) return true;
    const searchLower = searchText.toLowerCase();
    return (
      (item.source_order_number?.toLowerCase() || '').includes(searchLower) ||
      (item.material_name?.toLowerCase() || '').includes(searchLower) ||
      (item.vendor_name?.toLowerCase() || '').includes(searchLower) ||
      (item.order_status?.toLowerCase() || '').includes(searchLower) ||
      (item.part_numbers?.join(' ').toLowerCase() || '').includes(searchLower)
    );
  });


  const columns = [
    {
      title: <span className="font-semibold text-gray-700">SL NO</span>,
      key: 'index',
      width: 80,
      render: (_, __, index) => {
        const { current, pageSize } = pagination;
        return <span className="text-gray-500 font-mono">{(current - 1) * pageSize + index + 1}</span>;
      },
    },
    {
      title: <span className="font-semibold text-gray-700">Project Number</span>,
      dataIndex: 'source_order_number',
      key: 'source_order_number',
      render: (text) => <span className="font-mono text-gray-700">{text || '-'}</span>
    },
    {
      title: <span className="font-semibold text-gray-700">Part Number</span>,
      dataIndex: 'part_numbers',
      key: 'part_number',
      ellipsis: true,
      render: (values) => {
        // Handle undefined or empty values
        if (!values || values.length === 0 || values[0] === undefined) {
          return <span className="text-gray-400">-</span>;
        }
        
        return (
          <Space size="small" wrap>
            {values.map((val, idx) => (
              <Tag key={idx} color="geekblue">{val}</Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: <span className="font-semibold text-gray-700">Material Name</span>,
      dataIndex: 'material_name',
      key: 'material_name',
      ellipsis: true,
      render: (text) => <span className="font-medium text-gray-800">{text}</span>,
    },
    {
      title: <span className="font-semibold text-gray-700">Form Type</span>,
      dataIndex: 'form_type',
      key: 'form_type',
      render: (formType) => {
        let color = 'default';
        if (formType === 'Round') color = 'blue';
        if (formType === 'Square') color = 'green';
        if (formType === 'Pipe') color = 'orange';
        
        return <Tag color={color}>{formType || '-'}</Tag>;
      },
    },
    {
      title: <span className="font-semibold text-gray-700">Quantity</span>,
      dataIndex: 'quantity',
      key: 'quantity',
      width: 80,
      render: (value) => value != null ? value : <span className="text-gray-400">-</span>,
    },
    
    {
      title: <span className="font-semibold text-gray-700">Volume (m³)</span>,
      dataIndex: 'volume',
      key: 'volume',
      render: (value) => {
        if (value == null) return <span className="text-gray-400">-</span>;
        const color = value > 0 ? 'text-green-600' : 'text-red-600';
        return <span className={`font-medium ${color}`}>{value}</span>;
      },
    },
    
    {
      title: <span className="font-semibold text-gray-700">Mass (kg)</span>,
      dataIndex: 'mass',
      key: 'mass',
      render: (value) => value != null ? value?.toFixed(3) : <span className="text-gray-400">-</span>,
    },
    {
      title: <span className="font-semibold text-gray-700">Weight (N)</span>,
      dataIndex: 'weight',
      key: 'weight',
      render: (value) => value != null ? value?.toFixed(3) : <span className="text-gray-400">-</span>,
    },
    {
      title: <span className="font-semibold text-gray-700">Cost (₹)</span>,
      dataIndex: 'cost',
      key: 'cost',
      render: (value) => value != null ? `₹${value?.toFixed(2)}` : <span className="text-gray-400">-</span>,
    },
    {
      title: <span className="font-semibold text-gray-700">Vendor</span>,
      dataIndex: 'vendor_name',
      key: 'vendor_name',
      ellipsis: false, // Remove ellipsis to show all vendor names
      render: (vendorName, record) => {
        // Show received vendor if available, otherwise show enquiry vendors
        if (record.received_vendor_name) {
          return (
            <div>
              <span className="font-medium text-green-700">{record.received_vendor_name}</span>
              <br />
             
            </div>
          );
        } else if (vendorName) {
          // Show vendor names separated by commas
          return (
            <div className="text-gray-700">
              {vendorName}
            </div>
          );
        }
        return <span className="text-gray-400">-</span>;
      },
    },
    {
      title: <span className="font-semibold text-gray-700">Status</span>,
      dataIndex: 'status',
      key: 'status',
      render: (status, record) => {
        // Use the status from backend response directly
        if (!status) {
          return <span className="text-gray-400">-</span>;
        }
        
        let color = 'default';
        if (status === 'available') color = 'success';
        if (status === 'not_available') color = 'error';
        if (status === 'exhausted') color = 'warning';
        
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: <span className="font-semibold text-gray-700">Order Status</span>,
      dataIndex: 'order_status',
      key: 'order_status',
      ellipsis: true,
      render: (orderStatus, record) => {
        // Use the order_status from backend response directly
        if (record.source_type === 'general') {
          return <span className="text-gray-400">-</span>; // No order status for general stock
        }
        
        if (!orderStatus) {
          return <span className="text-gray-400">-</span>;
        }
        
        let color = 'default';
        let displayStatus = orderStatus;

        if (orderStatus === 'enquiry') {
          color = 'cyan';
          displayStatus = 'Purchase Request';
        } else if (orderStatus === 'purchase_request') {
          color = 'orange';
          displayStatus = 'Purchase Request'; // or maybe something else? User only specified enquiry -> Purchase Request
        } else if (orderStatus === 'purchase_order') {
          color = 'warning';
        } else if (orderStatus === 'received') {
          color = 'success';
        }
        
        return <Tag color={color}>{displayStatus}</Tag>;
      },
    },
    {
      title: <span className="font-semibold text-gray-700">Actions</span>,
      key: 'status_actions',
      render: (_, record, index) => (
        <Space>
          <Tooltip title="Quick Status Change">
            <Button 
              type="text" 
              size="small" 
              icon={<CheckCircleOutlined />} 
              className="text-green-600 hover:bg-green-50" 
              onClick={() => handleQuickStatusChange(record, 'purchase_request')} 
            />
          </Tooltip>
          <Tooltip title="Edit Link"><Button type="text" size="small" icon={<EditOutlined />} className="text-blue-600 hover:bg-blue-50" onClick={() => openStatusEditModal(record)} /></Tooltip>
          <Tooltip title="Delete Link"><Button type="text" size="small" icon={<DeleteOutlined />} className="text-red-500 hover:bg-red-50" onClick={() => handleDeleteLinkGroup(record)} /></Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div className="mt-4">
      <Card className="shadow-sm rounded-lg lg:rounded-xl border border-gray-100" styles={{ body: { padding: 0 } }} title={<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3"><div className="flex items-center gap-2"><SafetyCertificateOutlined className="text-blue-500" /><span className="font-bold text-gray-800 text-sm sm:text-base">Procurement Status</span></div><Space className="w-full sm:w-auto flex-col sm:flex-row gap-2"><Input.Search placeholder="Search all columns..." allowClear onSearch={handleLinkedMaterialsSearch} onChange={(e) => handleLinkedMaterialsSearch(e.target.value)} value={searchText} maxLength={50} className="w-full sm:w-64" size="middle" /><PartsWithRawMaterialsStatusPdfDownload linkedMaterials={linkedMaterials} /></Space></div>}>
        <Table columns={columns} dataSource={filtered} rowKey="id" size="small" bordered pagination={{ current: pagination.current, pageSize: pagination.pageSize, showSizeChanger: true, showQuickJumper: true, showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`, pageSizeOptions: ['10', '20', '50', '100'], placement: 'bottom', responsive: true }} onChange={p => setPagination(p)} locale={{ emptyText: <Empty description="No linked materials found" /> }} className="modern-table responsive-table" scroll={{ x: 'max-content' }} loading={loading} />
      </Card>

      {/* Quick Status Modal - for dropdown status changes */}
      <Modal open={quickStatusModalOpen} onCancel={() => setQuickStatusModalOpen(false)} title={<div className="flex items-center gap-2"><EditOutlined className="text-blue-500" /><span className="font-bold text-gray-800">Update Order Status & Vendor</span></div>} width={{ xs: '90%', sm: '80%', md: 500, lg: 500 }} centered footer={[<Button key="cancel" onClick={() => setQuickStatusModalOpen(false)}>Cancel</Button>, <Button key="save" type="primary" style={{ backgroundColor: '#2563eb' }} onClick={handleSaveQuickStatus}>Update Status</Button>]}>
        <div className="py-4 space-y-4">
          {/* Order Status */}
          <div className="space-y-1">
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Order Status</Text>
            <Select
              style={{ width: '100%' }}
              placeholder="Select Order Status"
              value={quickStatusRecord?.order_status && quickStatusRecord.order_status !== 'enquiry' ? quickStatusRecord.order_status : undefined}
              onChange={(value) => {
                setQuickStatusRecord(prev => ({ ...prev, order_status: value, material_status: value }));
              }}
              size="middle"
              className="rounded-md"
            >
       
              <Option value="purchase_order">Purchase Order</Option>
              <Option value="received">Received</Option>
            </Select>
          </div>
          
          {/* Vendor Selection - Always visible */}
          <div className="space-y-1">
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Selected Vendor *</Text>
            <Select
              style={{ width: '100%' }}
              placeholder="Select the vendor for this order"
              value={quickStatusReceivedVendorId}
              onChange={(value) => setQuickStatusReceivedVendorId(value)}
              size="middle"
              className="rounded-md"
              showSearch
              optionFilterProp="children"
            >
              {getEnquiryVendors(quickStatusRecord).map(vendor => (
                <Option key={vendor.id} value={vendor.id}>
                  {vendor.company_name}
                </Option>
              ))}
            </Select>
            <Text type="secondary" className="text-xs">Select from vendors contacted during enquiry</Text>
          </div>
        </div>
      </Modal>

      {/* Full Edit Modal - for edit icon */}
      <Modal open={statusEditModalOpen} onCancel={() => setStatusEditModalOpen(false)} title={<div className="flex items-center gap-2"><EditOutlined className="text-blue-500" /><span className="font-bold text-gray-800">Edit Linked Parts & Status</span></div>} width={{ xs: '95%', sm: '90%', md: 800, lg: 800 }} centered footer={[<Button key="cancel" onClick={() => setStatusEditModalOpen(false)}>Cancel</Button>, <Button key="save" type="primary" style={{ backgroundColor: '#2563eb' }} onClick={handleSaveStatusEdit}>Save Changes</Button>]}>
        <div className="py-2 space-y-3" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {/* Form Type */}
          <div className="space-y-1">
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Form Type</Text>
            <Select
              style={{ width: '100%' }}
              placeholder="Select Form Type"
              value={statusEditRecord?.form_type}
              disabled
              size="middle"
              className="rounded-md"
            >
              <Option value="Round">Round</Option>
              <Option value="Square">Square</Option>
              <Option value="Pipe">Pipe</Option>
            </Select>
          </div>

          {/* Quantity */}
          <div className="space-y-1">
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Quantity</Text>
            <InputNumber 
              min={1} 
              style={{ width: '100%' }} 
              value={statusEditOrderQty} 
              onChange={setStatusEditOrderQty}
              size="middle" 
              className="rounded-md" 
            />
          </div>

          {/* Dimensions based on form type */}
          {statusEditRecord?.form_type === 'Round' && (
            <>
              <div className="space-y-1">
                <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Diameter (mm)</Text>
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder="Diameter"
                  value={statusEditDimensions.diameter}
                  onChange={(value) => setStatusEditDimensions(prev => ({ ...prev, diameter: value }))}
                  min={0}
                  size="middle"
                  className="rounded-md"
                />
              </div>
              <div className="space-y-1">
                <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Length (mm)</Text>
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder="Length"
                  value={statusEditDimensions.length}
                  onChange={(value) => setStatusEditDimensions(prev => ({ ...prev, length: value }))}
                  min={0}
                  size="middle"
                  className="rounded-md"
                />
              </div>
            </>
          )}

          {statusEditRecord?.form_type === 'Square' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Length (mm)</Text>
                  <InputNumber
                    style={{ width: '100%' }}
                    placeholder="Length"
                    value={statusEditDimensions.length}
                    onChange={(value) => setStatusEditDimensions(prev => ({ ...prev, length: value }))}
                    min={0}
                    size="middle"
                    className="rounded-md"
                  />
                </div>
                <div className="space-y-1">
                  <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Breadth (mm)</Text>
                  <InputNumber
                    style={{ width: '100%' }}
                    placeholder="Breadth"
                    value={statusEditDimensions.breadth}
                    onChange={(value) => setStatusEditDimensions(prev => ({ ...prev, breadth: value }))}
                    min={0}
                    size="middle"
                    className="rounded-md"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Height (mm)</Text>
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder="Height"
                  value={statusEditDimensions.height}
                  onChange={(value) => setStatusEditDimensions(prev => ({ ...prev, height: value }))}
                  min={0}
                  size="middle"
                  className="rounded-md"
                />
              </div>
            </>
          )}

          {statusEditRecord?.form_type === 'Pipe' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Outer Diameter (mm)</Text>
                  <InputNumber
                    style={{ width: '100%' }}
                    placeholder="Outer Diameter"
                    value={statusEditDimensions.outer_diameter}
                    onChange={(value) => setStatusEditDimensions(prev => ({ ...prev, outer_diameter: value }))}
                    min={0}
                    size="middle"
                    className="rounded-md"
                  />
                </div>
                <div className="space-y-1">
                  <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Inner Diameter (mm)</Text>
                  <InputNumber
                    style={{ width: '100%' }}
                    placeholder="Inner Diameter"
                    value={statusEditDimensions.inner_diameter}
                    onChange={(value) => setStatusEditDimensions(prev => ({ ...prev, inner_diameter: value }))}
                    min={0}
                    size="middle"
                    className="rounded-md"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Length (mm)</Text>
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder="Length"
                  value={statusEditDimensions.length}
                  onChange={(value) => setStatusEditDimensions(prev => ({ ...prev, length: value }))}
                  min={0}
                  size="middle"
                  className="rounded-md"
                />
              </div>
            </>
          )}
          
          {/* Parts Management - Tree View */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Text className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Parts Hierarchy</Text>
             
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-200" style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {loading ? (
                <div className="flex justify-center py-12">
                  <Spin size="large" tip="Loading parts..." />
                </div>
              ) : orderHierarchyMap[statusEditRecord?.source_order_id || statusEditRecord?.order_id] ? (
                <Tree
                  showLine={{ showLeafIcon: false }}
                  defaultExpandAll
                  treeData={buildTreeData(orderHierarchyMap[statusEditRecord?.source_order_id || statusEditRecord?.order_id])}
                  titleRender={(nodeData) => renderTreeNode(nodeData)}
                  className="custom-tree"
                />
              ) : (
                <Empty description="No hierarchy available" />
              )}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PartsWithRawMaterialStatusTab;
