import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth";
import { Table, Button, Empty, Card, Input, Space, Tooltip, Tag, Dropdown, Modal, InputNumber, Select, Typography, App } from "antd";
import { 
  SafetyCertificateOutlined, 
  EditOutlined, 
  DeleteOutlined,
  CheckCircleOutlined
} from "@ant-design/icons";
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
  const [statusEditPartsToRemove, setStatusEditPartsToRemove] = useState([]);
  const [statusEditPartsToAdd, setStatusEditPartsToAdd] = useState([]);
  const [statusEditPartQuantities, setStatusEditPartQuantities] = useState({});
  const [statusEditAvailableParts, setStatusEditAvailableParts] = useState([]);
  const [orderHierarchyMap, setOrderHierarchyMap] = useState({});
  const [statusEditPartMetaById, setStatusEditPartMetaById] = useState({});
  const [decimalWarnings, setDecimalWarnings] = useState({});
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
      
      // Process data - use part_required_quantities from backend
      const processedData = response.data.map(item => {
        // Use the part_required_quantities that comes from backend
        const partRequiredQuantities = item.part_required_quantities || [];
        
        return {
          ...item,
          // Keep the backend part_required_quantities as is
          part_required_quantities: partRequiredQuantities
        };
      });
      
      setLinkedMaterials(processedData);
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

  const limitDecimals = (value, fieldName, precision = 3) => {
    if (value === null || value === undefined || value === '') return value;
    const cleaned = String(value).replace(/[^0-9.]/g, '');
    let str = cleaned;
    
    if (precision === 0) {
      str = str.replace(/\./g, '');
      if (str.length > 5) {
        showDecimalWarning(fieldName, 0, 'Max 5 digits allowed');
        return str.slice(0, 5);
      }
      return str;
    }

    if (str.includes('.')) {
      const [int, dec] = str.split('.');
      let finalInt = int;
      if (int.length > 6) {
        showDecimalWarning(fieldName, precision, 'Max 6 digits allowed before decimal');
        finalInt = int.slice(0, 6);
      }
      
      if (dec.length > precision) {
        showDecimalWarning(fieldName, precision);
        return `${finalInt}.${dec.slice(0, precision)}`;
      }
      return `${finalInt}.${dec}`;
    } else {
      if (str.length > 6) {
        showDecimalWarning(fieldName, precision, 'Max 6 digits allowed before decimal');
        return str.slice(0, 6);
      }
    }
    return str;
  };

  const showDecimalWarning = (fieldName, precision, customMsg) => {
    if (!fieldName) return;
    const msg = customMsg ?? (precision === 0 ? "Only whole numbers allowed" : `Max ${precision} decimal places allowed`);
    setDecimalWarnings(prev => ({ ...prev, [fieldName]: msg }));
    setTimeout(() => {
      setDecimalWarnings(prev => ({ ...prev, [fieldName]: null }));
    }, 3000);
  };

  const blockExtraDecimals = (e, fieldName, precision = 3) => {
    const { value } = e.target;
    const controlKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Escape', 'Control'];
    if (controlKeys.includes(e.key) || e.ctrlKey || e.metaKey) return;
    if (!/[0-9.]/.test(e.key)) { e.preventDefault(); return; }
    if (precision === 0 && e.key === '.') { showDecimalWarning(fieldName, 0); e.preventDefault(); return; }

    if (/[0-9]/.test(e.key)) {
      const hasSelection = e.target.selectionStart !== e.target.selectionEnd;
      if (precision === 0) {
        const digitsOnly = String(value).replace(/\D/g, '');
        if (digitsOnly.length >= 5 && !hasSelection) {
          showDecimalWarning(fieldName, 0, 'Max 5 digits allowed');
          e.preventDefault();
          return;
        }
      } else {
        const parts = value.split('.');
        const selectionStart = e.target.selectionStart;
        const dotIndex = value.indexOf('.');
        if ((dotIndex === -1 || selectionStart <= dotIndex) && !hasSelection) {
          const integerPart = dotIndex === -1 ? value : parts[0];
          if (integerPart.length >= 6) {
            showDecimalWarning(fieldName, precision, 'Max 6 digits allowed before decimal');
            e.preventDefault();
            return;
          }
        }
      }
    }
    if (e.key === '.' && value.includes('.')) { e.preventDefault(); return; }
    if (value.includes('.')) {
      const parts = value.split('.');
      const selectionStart = e.target.selectionStart;
      const dotIndex = value.indexOf('.');
      if (selectionStart > dotIndex && parts[1].length >= precision) {
        if (e.target.selectionStart === e.target.selectionEnd) {
          showDecimalWarning(fieldName, precision);
          e.preventDefault();
        }
      }
    }
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
      const groupId = record.linkage_group_id || null;

      if (groupId) {
        const updateData = {
          order_status: record.order_status || record.material_status || "enquiry"
        };
        
        // Include received_vendor_id if vendor is selected
        if (quickStatusReceivedVendorId) {
          updateData.received_vendor_id = quickStatusReceivedVendorId;
        }
        
        await axios.put(
          `${API_BASE_URL}/rawmaterials/order-parts-raw-material-linked/status/group/${groupId}`,
          updateData,
          { headers: { "Content-Type": "application/json" } }
        );
      }

      await fetchLinkedMaterials();
      if (typeof onDataChanged === "function") {
        onDataChanged();
      }
      message.success("Status updated successfully");
      setQuickStatusModalOpen(false);
      setQuickStatusRecord(null);
      setQuickStatusReceivedVendorId(null);
    } catch (error) {
      console.error("Error updating status:", error);
      const detail =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        "Error updating status";
      message.error(detail);
    }
  };

  const handleSaveStatusEdit = async () => {
    if (!statusEditRecord) return;
    try {
      const record = statusEditRecord;
      const ids = record.linkage_ids || [];
      const newQty = statusEditOrderQty != null ? Number(statusEditOrderQty) : record.quantity ?? 0;
      const groupId = record.linkage_group_id || null;

      const uid = getCurrentUserId();

      if (!groupId) {
        const updates = await Promise.all(
          ids.map((id) => {
            const linkage = (linkedMaterials || []).find((l) => l.id === id);
            if (!linkage) return null;
            const body = {
              raw_material_id: linkage.raw_material_id,
              part_id: linkage.part_id,
              order_id: linkage.order_id,
              order_quantity: newQty,
              form_type: record.form_type || "Round",
              // Include dimensions based on form type
              ...(record.form_type === 'Round' && {
                diameter: statusEditDimensions.diameter || 0,
                length: statusEditDimensions.length || 0
              }),
              ...(record.form_type === 'Square' && {
                length: statusEditDimensions.length || 0,
                breadth: statusEditDimensions.breadth || 0,
                height: statusEditDimensions.height || 0
              }),
              ...(record.form_type === 'Pipe' && {
                outer_diameter: statusEditDimensions.outer_diameter || 0,
                inner_diameter: statusEditDimensions.inner_diameter || 0,
                length: statusEditDimensions.length || 0
              }),
              material_status: linkage.material_status || "available",
              linkage_group_id: linkage.linkage_group_id || null,
              user_id: uid,
            };
            return axios.put(
              `${API_BASE_URL}/rawmaterials/order-parts-raw-material-linked/${id}`,
              body,
              { headers: { "Content-Type": "application/json" } }
            );
          })
        );
        await Promise.all(updates);
      }

      if (groupId) {
        const updateData = {
          order_status: record.order_status || record.material_status || "enquiry",
          order_quantity: newQty,
          form_type: record.form_type || "Round",
          // Include dimensions based on form type
          ...(record.form_type === 'Round' && {
            diameter: statusEditDimensions.diameter || 0,
            length: statusEditDimensions.length || 0
          }),
          ...(record.form_type === 'Square' && {
            length: statusEditDimensions.length || 0,
            breadth: statusEditDimensions.breadth || 0,
            height: statusEditDimensions.height || 0
          }),
          ...(record.form_type === 'Pipe' && {
            outer_diameter: statusEditDimensions.outer_diameter || 0,
            inner_diameter: statusEditDimensions.inner_diameter || 0,
            length: statusEditDimensions.length || 0
          })
        };
        
        // Include received_vendor_id if status is purchase_request, purchase_order, or received and vendor is selected
        if ((statusEditRecord.order_status === 'purchase_request' || statusEditRecord.order_status === 'purchase_order' || statusEditRecord.order_status === 'received') && 
            statusEditReceivedVendorId) {
          updateData.received_vendor_id = statusEditReceivedVendorId;
        }
        
        // Calculate and include part_ids and quantities
        const finalPartIds = statusEditCurrentLinkages
          .filter(l => !statusEditPartsToRemove.includes(l.id))
          .map(l => l.part_id);
        
        updateData.part_ids = finalPartIds.join(',');
        
        // Include part quantities
        const partQuantities = {};
        finalPartIds.forEach(partId => {
          partQuantities[partId] = statusEditPartQuantities[partId] || 1;
        });
        updateData.part_quantities = partQuantities;
        
        await axios.put(
          `${API_BASE_URL}/rawmaterials/order-parts-raw-material-linked/status/group/${groupId}`,
          updateData,
          { headers: { "Content-Type": "application/json" } }
        );
      }

      await fetchLinkedMaterials();
      if (typeof onDataChanged === "function") {
        onDataChanged();
      }
      message.success("Status updated successfully");
      setStatusEditModalOpen(false);
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
      setStatusEditPartsToRemove([]);
      setStatusEditPartsToAdd([]);
      setStatusEditPartQuantities({});
      setStatusEditReceivedVendorId(null);
    } catch (error) {
      console.error("Error updating status:", error);
      const detail =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        "Error updating status";
      message.error(detail);
    }
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
    setStatusEditOrderQty(record.quantity ?? 0);
    
    // Initialize dimensions from record
    setStatusEditDimensions({
      diameter: record.diameter || '',
      length: record.length || '',
      breadth: record.breadth || '',
      height: record.height || '',
      inner_diameter: record.inner_diameter || '',
      outer_diameter: record.outer_diameter || ''
    });
    
    // Initialize received vendor from record
    setStatusEditReceivedVendorId(record.received_vendor_id || null);
    
    // Fetch vendors for selection
    await fetchVendors();
    
    // Extract current linkages from the record
    let currentLinkages = [];
    if (record.part_ids) {
      try {
        const partIds = record.part_ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
        
        if (partIds.length > 0) {
          const partsResponse = await axios.get(`${API_BASE_URL}/parts/`, {
            params: { ids: partIds.join(',') }
          });
          
          const parts = partsResponse.data || [];
          
          // Create linkages with quantities
          currentLinkages = partIds.map((partId, index) => {
            const part = parts.find(p => p.id === partId);
            return {
              id: `${record.id}-${partId}`,
              part_id: partId,
              part_number: part?.part_number || `Part-${partId}`,
              part_name: part?.part_name || 'Unknown Part',
              raw_material_required_quantity: part?.raw_material_required_quantity || 1,
              raw_material_id: record.raw_material_id,
              order_id: record.order_id,
              linkage_group_id: record.linkage_group_id
            };
          });
        }
      } catch (error) {
        // Fallback to basic linkage creation
        const partIds = record.part_ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
        const partNumbers = record.part_numbers || [];
        const partNames = record.part_names || [];
        
        currentLinkages = partIds.map((partId, index) => ({
          id: `${record.id}-${partId}`,
          part_id: parseInt(partId),
          part_number: Array.isArray(partNumbers) ? partNumbers[index] : partNumbers?.split(',')[index]?.trim() || `Part-${partId}`,
          part_name: Array.isArray(partNames) ? partNames[index] : partNames?.split(',')[index]?.trim() || 'Unknown Part',
          raw_material_required_quantity: 1,
          raw_material_id: record.raw_material_id,
          order_id: record.order_id,
          linkage_group_id: record.linkage_group_id
        }));
      }
    }
    
    setStatusEditCurrentLinkages(currentLinkages);
    setStatusEditPartsToRemove([]);
    setStatusEditPartsToAdd([]);
    
    // Initialize part quantities from existing data
    const initialQuantities = {};
    currentLinkages.forEach(linkage => {
      // Use existing quantity if available, default to 1
      initialQuantities[linkage.part_id] = linkage.raw_material_required_quantity || 1;
    });
    setStatusEditPartQuantities(initialQuantities);
    
    try {
      const orderId = record.order_id;
      let hierarchy = orderHierarchyMap[orderId];
      if (!hierarchy) {
        const res = await axios.get(`${API_BASE_URL}/orders/${orderId}/hierarchical`);
        hierarchy = res.data;
        setOrderHierarchyMap(prev => ({ ...prev, [orderId]: hierarchy }));
      }
      if (hierarchy) {
        const { parts: allParts, meta } = flattenPartsFromOrderHierarchy(hierarchy) || { parts: [], meta: {} };
        const existingPartIds = new Set(currentLinkages.map(l => l.part_id));
        setStatusEditAvailableParts(allParts.filter(p => p && p.id && !existingPartIds.has(p.id)));
        setStatusEditPartMetaById(meta || {});
      }
    } catch (error) {
      console.error("Error fetching order hierarchy:", error);
      setStatusEditAvailableParts([]);
      setStatusEditPartMetaById({});
    }
    
    setStatusEditModalOpen(true);
  };

  // Update available parts whenever current linkages or parts to remove change
  const updateAvailableParts = useCallback(() => {
    if (!statusEditRecord || !orderHierarchyMap[statusEditRecord.order_id]) return;
    
    const hierarchy = orderHierarchyMap[statusEditRecord.order_id];
    const { parts: allParts } = flattenPartsFromOrderHierarchy(hierarchy) || { parts: [] };
    
    // Get all currently linked parts (excluding those marked for removal)
    const linkedPartIds = new Set(
      statusEditCurrentLinkages
        .filter(l => !statusEditPartsToRemove.includes(l.id))
        .map(l => l.part_id)
    );
    
    // Filter available parts (exclude linked parts)
    const availableParts = allParts.filter(p => p && p.id && !linkedPartIds.has(p.id));
    setStatusEditAvailableParts(availableParts);
  }, [statusEditRecord, statusEditCurrentLinkages, statusEditPartsToRemove, orderHierarchyMap]);

  // Update available parts when linkages change
  useEffect(() => {
    updateAvailableParts();
  }, [updateAvailableParts]);

  const handleDeleteLinkGroup = (record) => {
    modal.confirm({
      title: 'Confirm Delete',
      content: 'Are you sure you want to remove this material from the order and parts?',
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await Promise.all(
            record.linkage_ids.map((id) =>
              axios.delete(`${API_BASE_URL}/rawmaterials/order-parts-raw-material-linked/${id}`, {
                params: { user_id: getCurrentUserId() ?? undefined },
              })
            )
          );
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

  const handleLinkedMaterialsSearch = (value) => setSearchText((value || '').replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 20));

  const flattenPartsFromOrderHierarchy = (orderData) => {
    if (!orderData || !orderData.product_hierarchy) {
      return { parts: [], meta: {} };
    }

    const { product_hierarchy } = orderData;
    const parts = [];
    const meta = {};

    const processAssembly = (assembly, path = []) => {
      const currentPath = [...path, assembly.assembly?.assembly_name || 'Unknown Assembly'].filter(Boolean);
      
      // Process parts in this assembly
      if (assembly.parts && Array.isArray(assembly.parts)) {
        assembly.parts.forEach(partDetail => {
          if (partDetail.part && partDetail.part.id) {
            const part = partDetail.part;
            parts.push(part);
            meta[part.id] = {
              path: currentPath,
              isDirect: false,
              assemblyName: assembly.assembly?.assembly_name
            };
          }
        });
      }

      // Process subassemblies recursively
      if (assembly.subassemblies && Array.isArray(assembly.subassemblies)) {
        assembly.subassemblies.forEach(subassembly => {
          processAssembly(subassembly, currentPath);
        });
      }
    };

    // Process direct parts (not in any assembly)
    if (product_hierarchy.direct_parts && Array.isArray(product_hierarchy.direct_parts)) {
      product_hierarchy.direct_parts.forEach(partDetail => {
        if (partDetail.part && partDetail.part.id) {
          const part = partDetail.part;
          parts.push(part);
          meta[part.id] = {
            path: [],
            isDirect: true,
            assemblyName: null
          };
        }
      });
    }

    // Process assemblies
    if (product_hierarchy.assemblies && Array.isArray(product_hierarchy.assemblies)) {
      product_hierarchy.assemblies.forEach(assembly => {
        processAssembly(assembly);
      });
    }

    return { parts, meta };
  };

  const filtered = linkedMaterials.filter(item => 
    !searchText || Object.values(item).some(value => 
      value !== null && value !== undefined && 
      String(value).toLowerCase().includes(searchText.toLowerCase())
    )
  );

  const groupedMap = {};
  filtered.forEach((item) => {
    const key = `${item.raw_material_id}-${item.linkage_group_id || 'no-group'}-${item.order_id}`;
    if (!groupedMap[key]) {
      groupedMap[key] = { 
        ...item, 
        _items: [], // Store all items in this group to sort parts later
        linkage_ids: [], 
        min_id: item.id 
      };
    }
    groupedMap[key]._items.push(item);
    groupedMap[key].linkage_ids.push(item.id);
    if (item.id < groupedMap[key].min_id) {
      groupedMap[key].min_id = item.id;
    }
    groupedMap[key].quantity = item.order_quantity;
    groupedMap[key].mass = item.mass;
  });

  const groupedData = Object.values(groupedMap).map(group => {
    // Sort items within group by id
    const sortedItems = [...group._items].sort((a, b) => (a.id || 0) - (b.id || 0));
    
    // Extract part numbers and names from the first item (they should be the same for all items in the group)
    const firstItem = sortedItems[0];
    const part_numbers = firstItem.part_numbers || [];
    const part_names = firstItem.part_names || [];

    return {
      ...group,
      part_numbers,
      part_names
    };
  }).sort((a, b) => (a.min_id || 0) - (b.min_id || 0)); // Sort table by FIFO (min linkage id)

  const getMaterialRowSpan = (record, index) => {
    const prev = groupedData[index - 1];
    if (prev && prev.raw_material_id === record.raw_material_id && prev.linkage_group_id === record.linkage_group_id) return 0;
    let rowSpan = 1;
    for (let i = index + 1; i < groupedData.length; i++) {
      if (groupedData[i].raw_material_id === record.raw_material_id && groupedData[i].linkage_group_id === record.linkage_group_id) rowSpan++;
      else break;
    }
    return rowSpan;
  };

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
      onCell: (record, index) => ({ rowSpan: getMaterialRowSpan(record, index) }),
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
      onCell: (record, index) => ({ rowSpan: getMaterialRowSpan(record, index) }),
    },
    {
      title: <span className="font-semibold text-gray-700">Quantity</span>,
      dataIndex: 'quantity',
      key: 'quantity',
      render: (value) => value != null ? value : <span className="text-gray-400">-</span>,
      onCell: (record, index) => ({ rowSpan: getMaterialRowSpan(record, index) }),
    },
    {
      title: <span className="font-semibold text-gray-700">Allocated</span>,
      dataIndex: 'allocated_quantity',
      key: 'allocated_quantity',
      render: (value) => value != null ? <span className="text-blue-600 font-medium">{value}</span> : <span className="text-gray-400">-</span>,
      onCell: (record, index) => ({ rowSpan: getMaterialRowSpan(record, index) }),
    },
    {
      title: <span className="font-semibold text-gray-700">Available</span>,
      dataIndex: 'available_quantity',
      key: 'available_quantity',
      render: (value) => {
        if (value == null) return <span className="text-gray-400">-</span>;
        const color = value > 0 ? 'text-green-600' : 'text-red-600';
        return <span className={`font-medium ${color}`}>{value}</span>;
      },
      onCell: (record, index) => ({ rowSpan: getMaterialRowSpan(record, index) }),
    },
    {
      title: <span className="font-semibold text-gray-700">Part Required Qty</span>,
      dataIndex: 'part_required_quantities',
      key: 'part_required_quantities',
      render: (values) => {
        if (!values || values.length === 0 || values[0] === undefined) {
          return <span className="text-gray-400">-</span>;
        }
        
        return (
          <Space size="small" wrap>
            {values.map((val, idx) => (
              <Tag key={idx} color="purple">{val}</Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: <span className="font-semibold text-gray-700">Mass (kg)</span>,
      dataIndex: 'mass',
      key: 'mass',
      render: (value) => value != null ? value?.toFixed(3) : <span className="text-gray-400">-</span>,
      onCell: (record, index) => ({ rowSpan: getMaterialRowSpan(record, index) }),
    },
    {
      title: <span className="font-semibold text-gray-700">Weight (N)</span>,
      dataIndex: 'weight',
      key: 'weight',
      render: (value) => value != null ? value?.toFixed(3) : <span className="text-gray-400">-</span>,
      onCell: (record, index) => ({ rowSpan: getMaterialRowSpan(record, index) }),
    },
    {
      title: <span className="font-semibold text-gray-700">Cost (₹)</span>,
      dataIndex: 'cost',
      key: 'cost',
      render: (value) => value != null ? `₹${value?.toFixed(2)}` : <span className="text-gray-400">-</span>,
      onCell: (record, index) => ({ rowSpan: getMaterialRowSpan(record, index) }),
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
      onCell: (record, index) => ({ rowSpan: getMaterialRowSpan(record, index) }),
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
        if (status === 'not available') color = 'error';
        if (status === 'exhausted') color = 'warning';
        
        return <Tag color={color}>{status}</Tag>;
      },
      onCell: (record, index) => ({ rowSpan: getMaterialRowSpan(record, index) }),
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
        if (orderStatus === 'enquiry') color = 'blue';
        if (orderStatus === 'purchase_request') color = 'warning';
        if (orderStatus === 'purchase_order') color = 'processing';
        if (orderStatus === 'received') color = 'success';
        
        return <Tag color={color}>{orderStatus}</Tag>;
      },
      onCell: (record, index) => ({ rowSpan: getMaterialRowSpan(record, index) }),
    },
    {
      title: <span className="font-semibold text-gray-700">Actions</span>,
      key: 'status_actions',
      render: (_, record, index) => (
        <Space>
          {getMaterialRowSpan(record, index) > 0 && (
            <Tooltip title="Quick Status Change">
              <Button 
                type="text" 
                size="small" 
                icon={<CheckCircleOutlined />} 
                className="text-green-600 hover:bg-green-50" 
                onClick={() => handleQuickStatusChange(record, 'purchase_request')} 
              />
            </Tooltip>
          )}
          <Tooltip title="Edit Link"><Button type="text" size="small" icon={<EditOutlined />} className="text-blue-600 hover:bg-blue-50" onClick={() => openStatusEditModal(record)} /></Tooltip>
          <Tooltip title="Delete Link"><Button type="text" size="small" icon={<DeleteOutlined />} className="text-red-500 hover:bg-red-50" onClick={() => handleDeleteLinkGroup(record)} /></Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div className="mt-4">
      <Card className="shadow-sm rounded-lg lg:rounded-xl border border-gray-100" styles={{ body: { padding: 0 } }} title={<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3"><div className="flex items-center gap-2"><SafetyCertificateOutlined className="text-blue-500" /><span className="font-bold text-gray-800 text-sm sm:text-base">Parts with Raw Materials Status</span></div><Space className="w-full sm:w-auto flex-col sm:flex-row gap-2"><Input.Search placeholder="Search..." allowClear onSearch={handleLinkedMaterialsSearch} onChange={(e) => handleLinkedMaterialsSearch(e.target.value)} value={searchText} maxLength={20} className="w-full sm:w-64" size="middle" /><PartsWithRawMaterialsStatusPdfDownload linkedMaterials={linkedMaterials} /></Space></div>}>
        <Table columns={columns} dataSource={groupedData} rowKey="id" size="small" bordered pagination={{ current: pagination.current, pageSize: pagination.pageSize, showSizeChanger: true, showQuickJumper: true, showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`, pageSizeOptions: ['10', '20', '50', '100'], placement: 'bottom', responsive: true }} onChange={p => setPagination(p)} locale={{ emptyText: <Empty description="No linked materials found" /> }} className="modern-table" scroll={{ x: 1200 }} loading={loading} />
      </Card>

      {/* Quick Status Modal - for dropdown status changes */}
      <Modal open={quickStatusModalOpen} onCancel={() => setQuickStatusModalOpen(false)} title={<div className="flex items-center gap-2"><EditOutlined className="text-blue-500" /><span className="font-bold text-gray-800">Update Order Status & Vendor</span></div>} width={500} centered footer={[<Button key="cancel" onClick={() => setQuickStatusModalOpen(false)}>Cancel</Button>, <Button key="save" type="primary" style={{ backgroundColor: '#2563eb' }} onClick={handleSaveQuickStatus}>Update Status</Button>]}>
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
              size="large"
              className="rounded-md"
            >
              <Option value="purchase_request">Purchase Request</Option>
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
              size="large"
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
      <Modal open={statusEditModalOpen} onCancel={() => setStatusEditModalOpen(false)} title={<div className="flex items-center gap-2"><EditOutlined className="text-blue-500" /><span className="font-bold text-gray-800">Edit Linked Parts & Status</span></div>} width={600} centered footer={[<Button key="cancel" onClick={() => setStatusEditModalOpen(false)}>Cancel</Button>, <Button key="save" type="primary" style={{ backgroundColor: '#2563eb' }} onClick={handleSaveStatusEdit}>Save Changes</Button>]}>
        <div className="py-4 space-y-6">
          {/* Form Type */}
          <div className="space-y-1">
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Form Type</Text>
            <Select
              style={{ width: '100%' }}
              placeholder="Select Form Type"
              value={statusEditRecord?.form_type}
              onChange={(value) => {
                setStatusEditRecord(prev => ({ ...prev, form_type: value }));
              }}
              size="large"
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
            <InputNumber min={0} precision={0} step={1} max={99999} style={{ width: '100%' }} value={statusEditOrderQty} onChange={setStatusEditOrderQty} size="large" className="rounded-md" stringMode parser={(v) => limitDecimals(v, 'status-edit-qty', 0)} onKeyDown={(e) => blockExtraDecimals(e, 'status-edit-qty', 0)} />
            {decimalWarnings['status-edit-qty'] && <Text type="warning" className="text-[10px] block mt-1">{decimalWarnings['status-edit-qty']}</Text>}
          </div>

          {/* Dimensions based on form type */}
          {statusEditRecord?.form_type === 'Round' && (
            <div className="space-y-1">
              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Diameter (mm) *</Text>
              <InputNumber
                style={{ width: '100%' }}
                placeholder="Diameter"
                value={statusEditDimensions.diameter}
                onChange={(value) => setStatusEditDimensions(prev => ({ ...prev, diameter: value }))}
                min={0}
                step={0.01}
                size="large"
                className="rounded-md"
              />
            </div>
          )}

          {statusEditRecord?.form_type === 'Round' && (
            <div className="space-y-1">
              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Length (mm) *</Text>
              <InputNumber
                style={{ width: '100%' }}
                placeholder="Length"
                value={statusEditDimensions.length}
                onChange={(value) => setStatusEditDimensions(prev => ({ ...prev, length: value }))}
                min={0}
                step={0.01}
                size="large"
                className="rounded-md"
              />
            </div>
          )}

          {statusEditRecord?.form_type === 'Square' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Length (mm) *</Text>
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder="Length"
                  value={statusEditDimensions.length}
                  onChange={(value) => setStatusEditDimensions(prev => ({ ...prev, length: value }))}
                  min={0}
                  step={0.01}
                  size="large"
                  className="rounded-md"
                />
              </div>
              <div className="space-y-1">
                <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Breadth (mm) *</Text>
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder="Breadth"
                  value={statusEditDimensions.breadth}
                  onChange={(value) => setStatusEditDimensions(prev => ({ ...prev, breadth: value }))}
                  min={0}
                  step={0.01}
                  size="large"
                  className="rounded-md"
                />
              </div>
            </div>
          )}

          {statusEditRecord?.form_type === 'Square' && (
            <div className="space-y-1">
              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Height (mm) *</Text>
              <InputNumber
                style={{ width: '100%' }}
                placeholder="Height"
                value={statusEditDimensions.height}
                onChange={(value) => setStatusEditDimensions(prev => ({ ...prev, height: value }))}
                min={0}
                step={0.01}
                size="large"
                className="rounded-md"
              />
            </div>
          )}

          {statusEditRecord?.form_type === 'Pipe' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Outer Diameter (mm) *</Text>
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder="Outer Diameter"
                  value={statusEditDimensions.outer_diameter}
                  onChange={(value) => setStatusEditDimensions(prev => ({ ...prev, outer_diameter: value }))}
                  min={0}
                  step={0.01}
                  size="large"
                  className="rounded-md"
                />
              </div>
              <div className="space-y-1">
                <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Inner Diameter (mm) *</Text>
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder="Inner Diameter"
                  value={statusEditDimensions.inner_diameter}
                  onChange={(value) => setStatusEditDimensions(prev => ({ ...prev, inner_diameter: value }))}
                  min={0}
                  step={0.01}
                  size="large"
                  className="rounded-md"
                />
              </div>
            </div>
          )}

          {statusEditRecord?.form_type === 'Pipe' && (
            <div className="space-y-1">
              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Length (mm) *</Text>
              <InputNumber
                style={{ width: '100%' }}
                placeholder="Length"
                value={statusEditDimensions.length}
                onChange={(value) => setStatusEditDimensions(prev => ({ ...prev, length: value }))}
                min={0}
                step={0.01}
                size="large"
                className="rounded-md"
              />
            </div>
          )}
          
          {/* Received Vendor (when status is purchase_request, purchase_order, or received) */}
          {(statusEditRecord?.order_status === 'purchase_request' || 
            statusEditRecord?.order_status === 'purchase_order' || 
            statusEditRecord?.order_status === 'received' || 
            statusEditRecord?.material_status === 'purchase_request' || 
            statusEditRecord?.material_status === 'purchase_order' || 
            statusEditRecord?.material_status === 'received') && (
            <div className="space-y-1">
              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Selected Vendor *</Text>
              <Select
                style={{ width: '100%' }}
                placeholder="Select the vendor for this order"
                value={statusEditReceivedVendorId}
                onChange={(value) => setStatusEditReceivedVendorId(value)}
                size="large"
                className="rounded-md"
                showSearch
                optionFilterProp="children"
              >
                {getEnquiryVendors(statusEditRecord).map(vendor => (
                  <Option key={vendor.id} value={vendor.id}>
                    {vendor.company_name}
                  </Option>
                ))}
              </Select>
              <Text type="secondary" className="text-xs">Select from vendors contacted during enquiry</Text>
            </div>
          )}
          
          {/* Parts Management */}
          <div className="space-y-3">
            <div className="flex items-center justify-between"><Text className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Linked Parts</Text><Text className="text-xs text-gray-400">{statusEditCurrentLinkages.filter(l => !statusEditPartsToRemove.includes(l.id)).length} Parts Linked</Text></div>
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 min-h-[60px] space-y-2">
              {statusEditCurrentLinkages
                .filter(l => !statusEditPartsToRemove.includes(l.id))
                .map(l => {
                  const meta = statusEditPartMetaById[l.part_id];
                  const pathLabel = meta?.path?.length
                    ? `Assembly: ${meta.path.join(" / ")}`
                    : meta?.isDirect
                      ? "Direct Part"
                      : "";
                  const quantity = statusEditPartQuantities[l.part_id] || 1;
                  
                  return (
                    <div key={l.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors">
                      <div className="flex items-center flex-1 min-w-0">
                        <Tag
                          color="geekblue"
                          closable
                          onClose={() => setStatusEditPartsToRemove(prev => [...prev, l.id])}
                          className="flex-shrink-0"
                        >
                          <span className="font-semibold">{l.part_number}</span>
                          <span className="mx-1 opacity-60">|</span>
                          <span className="text-xs opacity-80">{l.part_name}</span>
                          {pathLabel && (
                            <>
                              <span className="mx-1 opacity-40">|</span>
                              <span className="text-[10px] opacity-70">{pathLabel}</span>
                            </>
                          )}
                        </Tag>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs font-medium text-gray-600">Qty:</span>
                        <InputNumber
                          size="small"
                          min={0.1}
                          step={0.1}
                          value={quantity}
                          onChange={(newQuantity) => {
                            setStatusEditPartQuantities(prev => ({
                              ...prev,
                              [l.part_id]: newQuantity || 1
                            }));
                          }}
                          style={{ width: '80px' }}
                          className="text-xs"
                          placeholder="1.0"
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
          <div className="space-y-2">
            <Text className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Add More Parts</Text>
            <Select 
              mode="multiple" 
              style={{ width: '100%' }} 
              placeholder="Select parts to add" 
              value={statusEditPartsToAdd} 
              onChange={(selectedValues) => {
                // Add selected parts to current linkages immediately
                const newLinkages = selectedValues.map(partId => {
                  const part = statusEditAvailableParts.find(p => p.id === partId);
                  return {
                    id: `${statusEditRecord.id}-${partId}`, // Unique key
                    part_id: partId,
                    part_number: part.part_number,
                    part_name: part.part_name,
                    raw_material_id: statusEditRecord.raw_material_id,
                    order_id: statusEditRecord.order_id,
                    linkage_group_id: statusEditRecord.linkage_group_id
                  };
                });
                
                // Add to current linkages
                setStatusEditCurrentLinkages(prev => [...prev, ...newLinkages]);
                
                // Initialize quantities for new parts (default to 1)
                const newQuantities = {};
                selectedValues.forEach(partId => {
                  if (!statusEditPartQuantities[partId]) {
                    newQuantities[partId] = 1;
                  }
                });
                if (Object.keys(newQuantities).length > 0) {
                  setStatusEditPartQuantities(prev => ({ ...prev, ...newQuantities }));
                }
                
                // Clear the selection
                setStatusEditPartsToAdd([]);
              }} 
              size="large" 
              className="rounded-md" 
              optionFilterProp="children" 
              allowClear
            >
              {statusEditAvailableParts.map(p => {
                const meta = statusEditPartMetaById[p.id];
                const pathLabel = meta?.path?.length
                  ? `Assembly: ${meta.path.join(" / ")}`
                  : meta?.isDirect
                    ? "Direct Part"
                    : "";
                return (
                  <Option key={p.id} value={p.id}>
                    <div className="flex flex-col py-1">
                      <span className="font-semibold text-gray-800">{p.part_number}</span>
                      <span className="text-xs text-gray-500">{p.part_name}</span>
                      {pathLabel && (
                        <span className="text-[10px] text-gray-400 mt-0.5">{pathLabel}</span>
                      )}
                    </div>
                  </Option>
                );
              })}
            </Select>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PartsWithRawMaterialStatusTab;
