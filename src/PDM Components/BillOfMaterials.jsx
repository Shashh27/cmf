import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from "react";
import { PlusOutlined, PartitionOutlined, ToolOutlined, FileTextOutlined, EditOutlined, DeleteOutlined, DeploymentUnitOutlined, ClusterOutlined, CaretDownOutlined, CaretRightOutlined, CodepenOutlined, BlockOutlined, CodeSandboxOutlined, EyeOutlined, AppstoreOutlined, SearchOutlined, DownloadOutlined } from "@ant-design/icons";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth";
import { Input, Button, App, Tooltip, Empty, Spin, Tag, Typography } from "antd";

const { Text } = Typography;
import CreateProductModal from "./CreateProductModal";
import PartActionModal from "./PartActionModal";
import ProductBOMPdfDownload from "../DownloadReports/ProductBOMPdfDownload";
import ProductToolsViewer from "./ProductToolsViewer";
import AssemblyPartsUploadPanel from "./AssemblyPartsUploadPanel";
import BOMFilters from "./BOMFilters";

const BillOfMaterials = ({ onItemSelected, onHierarchyLoaded, disableProductCreate = false, initialProductId = null, bomRefreshTrigger = 0 }) => {
  const { message, modal } = App.useApp();
  const [products, setProducts] = useState([]);
  const [expandedItems, setExpandedItems] = useState({});
  const [loading, setLoading] = useState(true);
  const [hierarchicalData, setHierarchicalData] = useState({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createType, setCreateType] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [parentAssembly, setParentAssembly] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [selectedPart, setSelectedPart] = useState(null);
  const [showPartActionModal, setShowPartActionModal] = useState(false);
  const [partActionType, setPartActionType] = useState('');
  const [activeItemId, setActiveItemId] = useState(null);
  const [activeItemType, setActiveItemType] = useState(null);
  const [showToolsModal, setShowToolsModal] = useState(false);
  const [selectedProductForTools, setSelectedProductForTools] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const hasFetchedData = useRef(false);

  const getExpandKey = (type, id) => `${type}-${id}`;

  const getTypeIcon = (type, level = 0) => {
    const normalized = (type || "").toString().toLowerCase();
    // Product: purple (deployment/root)
    if (normalized === "product") {
      return <DeploymentUnitOutlined className="text-purple-600" />;
    }
    // Top-level assembly (direct under product): blue – cluster of units
    if (normalized === "assembly" && level <= 1) {
      return <ClusterOutlined className="text-blue-500" />;
    }
    // Subassembly (nested): indigo – single block to show it's one level down
    if (normalized === "assembly" && level > 1) {
      return <BlockOutlined className="text-indigo-600" />;
    }
    const inHouseTypes = ["make", "in-house", "in house", "inhouse"];
    const outSourceTypes = ["buy", "out-source", "out source", "outsourced", "outsourcing"];
    // In-house part: emerald – component/box (made here)
    if (inHouseTypes.includes(normalized)) {
      return <CodeSandboxOutlined className="text-emerald-600" />;
    }
    // Outsource part: amber – external/supplied
    if (outSourceTypes.includes(normalized)) {
      return <CodepenOutlined className="text-amber-600" />;
    }
    // Standard part: gray – same icon as outsource but gray
    if (normalized === "standard") {
      return <CodepenOutlined className="text-gray-500" />;
    }
    if (normalized === "part") {
      return <FileTextOutlined className="text-gray-500" />;
    }
    return <FileTextOutlined className="text-gray-500" />;
  };

  const getTypeColor = (type) => {
    const normalized = (type || "").toString().toLowerCase();
    const inHouseTypes = ["make", "in-house", "in house", "inhouse", "part"];
    const outSourceTypes = ["buy", "out-source", "out source", "outsourced", "outsourcing"];

    if (normalized === "product") return 'purple';
    if (normalized === "assembly") return 'blue';
    if (inHouseTypes.includes(normalized)) return 'green';
    if (outSourceTypes.includes(normalized)) return 'orange';
    if (normalized === "standard") return 'gray';
    return 'default';
  };

  const getCurrentUserId = () => {
    try {
      const stored = localStorage.getItem("user");
      if (!stored) return null;
      const user = JSON.parse(stored);
      if (user?.id == null) return null;
      return user.id;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (!hasFetchedData.current) {
      hasFetchedData.current = true;
      const pid = initialProductId != null ? Number(initialProductId) : null;
      if (pid) {
        // Opened from OMS: load only the selected product via hierarchy (no /products list call)
        (async () => {
          try {
            const data = await fetchProductHierarchy(pid);
            if (data?.product) setProducts([data.product]);
          } finally {
            setLoading(false);
          }
        })();
      } else {
        // Standalone PDM access is no longer supported for Admin/MC roles.
        // We set loading to false but don't fetch anything.
        setLoading(false);
      }
    }
  }, []);

  // If opened with an initial product id (e.g., from OMS), auto-select it AND auto-expand complete BOM tree
  useEffect(() => {
    const pid = initialProductId != null ? Number(initialProductId) : null;
    if (!pid || loading) return;
    const product = hierarchicalData[pid]?.product || products.find(p => Number(p.id) === pid);
    if (!product) return;
    setActiveItemId(pid);
    if (onItemSelected) {
      onItemSelected({ ...product, itemType: 'product', productId: pid });
    }
    
    // Auto-expand only the product itself when opened from OMS (keep sub-items collapsed)
    if (hierarchicalData[pid]) {
      setExpandedItems(prev => ({ 
        ...prev, 
        [getExpandKey('product', pid)]: true 
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProductId, loading, products, hierarchicalData]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Refresh product hierarchy when bomRefreshTrigger changes (after parts upload)
  useEffect(() => {
    if (bomRefreshTrigger > 0) {
      // Refresh all loaded product hierarchies
      Object.keys(hierarchicalData).forEach(productId => {
        fetchProductHierarchy(Number(productId), true);
      });
    }
  }, [bomRefreshTrigger]);

  const fetchProductHierarchy = async (productId, forceRefresh = false) => {
    if (!forceRefresh && hierarchicalData[productId]) return hierarchicalData[productId];

    try {
      // Use lightweight endpoint - no operations/documents/tools (much faster)
      const response = await axios.get(`${API_BASE_URL}/products/${productId}/hierarchical-lightweight`);
      if (response.status >= 200 && response.status < 300) {
        const data = response.data;
        const bomExport = flattenBOMForExportLightweight(data);

        // Lightweight data is already in the right format, no transformation needed
        const transformedData = {
          product: data.product,
          parts: data.parts || [],
          assemblies: data.assemblies || [],
          bomExport,
        };

        setHierarchicalData(prev => ({ ...prev, [productId]: transformedData }));

        // For external consumers (like ProductSummary) that need full PartDetails
        // including operations, they should use the full hierarchical endpoint separately
        if (onHierarchyLoaded) {
          onHierarchyLoaded(productId, data);
        }

        return transformedData;
      }
    } catch (error) {
      console.error("Error fetching product hierarchy:", error);
      message.error("Error fetching product hierarchy");
    }
  };

  // Flatten BOM for export using lightweight data structure
  const flattenBOMForExportLightweight = (data) => {
    const assemblies = [];
    const parts = [];

    const processAssembly = (assembly, parentPath = []) => {
      const currentPath = [...parentPath, assembly.assembly_name];
      assemblies.push({
        id: assembly.id,
        assembly_name: assembly.assembly_name,
        assembly_number: assembly.assembly_number,
        path: currentPath.join(' > '),
      });

      // Process parts in this assembly
      (assembly.parts || []).forEach(part => {
        parts.push({
          ...part,
          assembly_path: currentPath.join(' > '),
          assembly_name: assembly.assembly_name,
        });
      });

      // Process child assemblies
      (assembly.child_assemblies || []).forEach(child => {
        processAssembly(child, currentPath);
      });
    };

    // Process root assemblies
    (data.assemblies || []).forEach(assembly => {
      processAssembly(assembly);
    });

    // Process direct parts (no assembly)
    (data.parts || []).forEach(part => {
      parts.push({
        ...part,
        assembly_path: '',
        assembly_name: 'Direct Part',
      });
    });

    return { assemblies, parts };
  };

  const toggleExpand = (key) => {
    setExpandedItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleExpandProduct = async (product) => {
    if (!hierarchicalData[product.id]) {
      await fetchProductHierarchy(product.id);
    }
    toggleExpand(getExpandKey('product', product.id));
  };

  const openModal = (type, product = null, assembly = null, edit = false, item = null) => {
    setCreateType(type);
    setSelectedProduct(product);
    setParentAssembly(assembly);
    setEditMode(edit);
    setEditingItem(item);
    setShowCreateModal(true);
  };

  const handleCreateProduct = () => {
    if (disableProductCreate) return;
    openModal('product');
  };

  const downloadTemplate = async (templateType) => {
    try {
      const endpoint = templateType === 'parts'
        ? `${API_BASE_URL}/parts/template/download`
        : `${API_BASE_URL}/operations/template/download`;

      const response = await axios.get(endpoint, {
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        templateType === 'parts' ? 'PartsTemplate.docx' : 'Operations_Template.docx'
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      message.success(`${templateType === 'parts' ? 'Parts' : 'Operations'} template downloaded successfully`);
    } catch (error) {
      console.error('Template download error:', error);
      message.error(
        `Failed to download ${templateType} template. Please ensure the template has been uploaded to the server.`
      );
    }
  };
  const handleCreateAssembly = (product) => openModal('assembly', product);
  const handleCreatePart = (product, assembly = null) => {
    if (!product) return;
    openModal('part', product, assembly);
    if (!hierarchicalData[product.id]) {
      fetchProductHierarchy(product.id);
    }
  };
  const handleCreateSubAssembly = (assembly) => openModal('assembly', { id: assembly.product_id }, assembly);
  const handleEditProduct = (product) => openModal('product', product, null, true, product);
  const handleEditAssembly = (assembly) => {
    const product = products.find(p => p.id === assembly.product_id);
    openModal('assembly', product, null, true, assembly);
  };
  const handleEditPart = (part) => {
    const product = products.find(p => p.id === part.product_id);
    let assembly = null;
    if (part.assembly_id && hierarchicalData[part.product_id]) {
      const findAssembly = (assemblies) => {
        for (const asm of assemblies) {
          if (asm.id === part.assembly_id) return asm;
          if (asm.child_assemblies) {
            const found = findAssembly(asm.child_assemblies);
            if (found) return found;
          }
        }
        return null;
      };
      assembly = findAssembly(hierarchicalData[part.product_id].assemblies || []);
    }
    openModal('part', product, assembly, true, part);
  };

  const openPartActionModal = (part, type) => {
    setSelectedPart(part);
    setPartActionType(type);
    setShowPartActionModal(true);
  };

  const handleActionCreated = (newItem, type) => {
    const messages = {
      operation: `Operation "${newItem.operation_name}" created successfully!`,
      document: `Document "${newItem.document_name}" created successfully!`
    };
    message.success(messages[type]);
  };

  const handleViewAllTools = (product) => {
    setSelectedProductForTools(product);
    setShowToolsModal(true);
  };

  const handleProductCreated = async (newItem, type, action = 'create') => {
    if (type === 'product') {
      if (action === 'edit') {
        setProducts(prev => prev.map(p => p.id === newItem.id ? { ...p, ...newItem } : p));
      } else {
        setProducts(prev => [...prev, newItem]);
      }
    }
    const actionText = action === 'edit' ? 'updated' : 'created';
    const messages = {
      product: `Product "${newItem.product_name}" ${actionText} successfully!`,
      assembly: `Assembly "${newItem.assembly_name}" ${actionText} successfully!`,
      part: `Part "${newItem.part_name}" ${actionText} successfully!`
    };
    if (type !== 'product' && newItem.product_id) {
      await fetchProductHierarchy(newItem.product_id, true);
      setExpandedItems(prev => ({
        ...prev,
        [getExpandKey('product', newItem.product_id)]: true,
        ...(newItem.assembly_id && { [getExpandKey('assembly', newItem.assembly_id)]: true })
      }));
    }
    message.success(messages[type]);
  };

  const handleDelete = async (item, type) => {
    const endpoints = { product: `/products/${item.id}`, assembly: `/assemblies/${item.id}/soft-delete`, part: `/parts/${item.id}/soft-delete` };
    const names = { product: item.product_name, assembly: item.assembly_name, part: item.part_name };
    
    modal.confirm({
      title: `Delete ${type}`,
      content: `Are you sure you want to delete ${type} "${names[type]}"? This cannot be undone.`,
      okText: 'Yes',
      okType: 'danger',
      cancelText: 'No',
      onOk: async () => {
        try {
          if (type === 'part') {
            // Use soft delete for parts (move to recycle bin)
            await axios.post(`${API_BASE_URL}/recycle-bin/parts/${item.id}/soft-delete`);
          } else if (type === 'assembly') {
            // Use soft delete for assemblies (move to recycle bin)
            await axios.post(`${API_BASE_URL}/recycle-bin/assemblies/${item.id}/soft-delete`);
          } else {
            // Use permanent delete for products
            await axios.delete(`${API_BASE_URL}${endpoints[type]}`);
          }
          message.success(`${type.charAt(0).toUpperCase() + type.slice(1)} "${names[type]}" deleted successfully.`);
          if (type === 'product') {
            setProducts(prev => prev.filter(p => p.id !== item.id));
            setHierarchicalData(prev => {
              const newData = { ...prev };
              delete newData[item.id];
              return newData;
            });
          } else if (item.product_id) {
            await fetchProductHierarchy(item.product_id, true);
            setExpandedItems(prev => ({
              ...prev,
              [getExpandKey('product', item.product_id)]: true,
              ...(item.assembly_id && type === 'part' && { [getExpandKey('assembly', item.assembly_id)]: true })
            }));
          }
        } catch (error) {
          console.error(`Error deleting ${type}:`, error);
          const detail =
            error?.response?.data?.detail ||
            error?.response?.data?.message ||
            error?.message ||
            `Error deleting ${type} "${names[type]}".`;
          message.error(detail);
        }
      }
    });
  };

  const handleDeleteAllParts = async (product) => {
    modal.confirm({
      title: "Delete All Parts",
      content: `Delete all parts for product "${product.product_name}"? This cannot be undone.`,
      okText: 'Yes, Delete',
      okType: 'danger',
      cancelText: 'No',
      onOk: async () => {
        try {
          const response = await axios.delete(`${API_BASE_URL}/parts/bulk-by-product/${product.id}`);
          
          if (response.data?.deleted_count) {
            message.success(`Successfully deleted ${response.data.deleted_count} parts from product "${product.product_name}".`);
          } else {
            message.success(`All parts deleted successfully from product "${product.product_name}".`);
          }
          
          // Refresh the product hierarchy
          await fetchProductHierarchy(product.id, true);
          setExpandedItems(prev => ({
            ...prev,
            [getExpandKey('product', product.id)]: true
          }));
        } catch (error) {
          console.error("Error deleting parts", error);
          const errorMsg = error?.response?.data?.detail || error?.message || "Failed to delete parts";
          message.error(errorMsg);
        }
      }
    });
  };

  const handleItemClick = async (item, type, productId = null) => {
    // Clear previous selection and set new one
    setActiveItemId(item.id);
    setActiveItemType(type);

    if (type === 'product') {
      if (!hierarchicalData[item.id]) {
        await fetchProductHierarchy(item.id);
      }
    }

    toggleExpand(getExpandKey(type, item.id));

    const itemWithMeta = { ...item, itemType: type, productId: productId || (type === 'product' ? item.id : null) };
    if (onItemSelected) {
      onItemSelected(itemWithMeta);
    }
  };

  // Helper function to find productId for a part or assembly
  const findProductIdForItem = (itemId) => {
    for (const productId in hierarchicalData) {
      const product = hierarchicalData[productId];
      
      // Check if it's a direct part
      if (product.parts?.some(p => p.id === itemId)) {
        return productId;
      }
      
      // Check in assemblies recursively
      const checkAssemblies = (assemblies) => {
        for (const assembly of assemblies) {
          if (assembly.id === itemId) {
            return productId;
          }
          if (assembly.parts?.some(p => p.id === itemId)) {
            return productId;
          }
          if (assembly.child_assemblies) {
            const found = checkAssemblies(assembly.child_assemblies);
            if (found) return found;
          }
        }
        return null;
      };
      
      const found = checkAssemblies(product.assemblies || []);
      if (found) return found;
    }
    return null;
  };

  const getNestedAssemblies = (assemblyId) => {
    for (const productId in hierarchicalData) {
      const findNested = (assemblies) => {
        for (const assembly of assemblies) {
          if (assembly.id === assemblyId) return assembly.child_assemblies || [];
          if (assembly.child_assemblies) {
            const result = findNested(assembly.child_assemblies);
            if (result.length > 0) return result;
          }
        }
        return [];
      };
      const result = findNested(hierarchicalData[productId].assemblies || []);
      if (result.length > 0) return result;
    }
    return [];
  };

  const getPartsForAssembly = (assemblyId) => {
    for (const productId in hierarchicalData) {
      const product = hierarchicalData[productId];
      const findInNested = (assemblies) => {
        for (const assembly of assemblies) {
          if (assembly.id === assemblyId) return assembly.parts || [];
          if (assembly.child_assemblies) {
            const result = findInNested(assembly.child_assemblies);
            if (result.length > 0) return result;
          }
        }
        return [];
      };
      const parts = findInNested(product.assemblies || []);
      if (parts.length > 0) return parts;
    }
    return [];
  };

  const getBOMStats = () => {
    const targetProducts = initialProductId 
      ? products.filter(p => Number(p.id) === Number(initialProductId))
      : products;
      
    const stats = { total: 0, inhouse: 0, outsource: 0, standard: 0, linked: 0, unlinked: 0 };
    
    targetProducts.forEach(product => {
      const data = hierarchicalData[product.id];
      if (!data || !data.bomExport) return;
      
      const parts = data.bomExport.parts || [];
      stats.total += parts.length;
      
      parts.forEach(p => {
        const type = (p.type_name || p.type || '').toLowerCase().trim();
        const isInhouse = type.includes('in') && type.includes('house') || type === 'inhouse' || type === 'in-house' || type === 'make';
        const isOutsource = type.includes('out') || type === 'buy' || type === 'outsource' || type === 'out-source' || type === 'outsourced';
        const isStandard = type.includes('standard') || type.includes('std') || type.includes('catalogue');
        
        if (isInhouse) stats.inhouse++;
        else if (isOutsource) stats.outsource++;
        else if (isStandard) stats.standard++;
        
        const isLinked = p.raw_material_id != null && p.part_detail !== 'WITHOUT_RAW_MATERIAL';
        if (isLinked) stats.linked++;
        else stats.unlinked++;
      });
    });
    
    return stats;
  };

  const matchesFilter = (part, filter) => {
    if (!part || filter === 'all') return true;
    const typeName = (part.type_name || part.type || '').toLowerCase().trim();
    
    const inHouseTypes = ["make", "in-house", "in house", "inhouse", "part"];
    const outSourceTypes = ["buy", "out-source", "out source", "outsourced", "outsourcing"];
    const standardTypes = ["standard", "std", "catalogue"];

    const isInhouse = inHouseTypes.includes(typeName) || (typeName.includes('in') && typeName.includes('house'));
    const isOutsource = outSourceTypes.includes(typeName) || typeName.includes('out');
    const isStandard = standardTypes.some(t => typeName.includes(t));
    const isLinked = part.raw_material_id != null && part.part_detail !== 'WITHOUT_RAW_MATERIAL';

    switch (filter) {
      case 'inhouse': return isInhouse;
      case 'outsource': return isOutsource;
      case 'standard': return isStandard;
      case 'linked': return isLinked;
      case 'unlinked': return !isLinked;
      default: return true;
    }
  };

  const hasMatchingItems = (item, type, filter, productId) => {
    if (filter === 'all') return true;
    
    if (type === 'part') return matchesFilter(item, filter);
    
    if (type === 'assembly') {
      // Check parts of this assembly
      const parts = getPartsForAssembly(item.id);
      if (parts.some(p => matchesFilter(p, filter))) return true;
      
      // Check child assemblies
      const children = getNestedAssemblies(item.id);
      if (children.some(child => hasMatchingItems(child, 'assembly', filter, productId))) return true;
      
      return false;
    }
    
    if (type === 'product') {
      const data = hierarchicalData[item.id];
      if (!data) return true; // Show product if data not yet loaded (it will load on expand)
      
      const directParts = data.parts || [];
      if (directParts.some(p => matchesFilter(p, filter))) return true;
      
      const assemblies = data.assemblies || [];
      if (assemblies.some(asm => hasMatchingItems(asm, 'assembly', filter, item.id))) return true;
      
      return false;
    }
    
    return true;
  };

  const ActionButtons = ({ item, type, tagName, tagColor }) => {
    const productHierarchy = type === 'product' ? hierarchicalData[item.id] : null;
    const bomExport = productHierarchy?.bomExport;
    const hasParts = type === 'product' && productHierarchy && (
      (productHierarchy.parts && productHierarchy.parts.length > 0) ||
      (productHierarchy.assemblies && productHierarchy.assemblies.length > 0)
    );
    const isInRecycleBin = (type === 'part' || type === 'assembly') && item.recycle_bin === true;
    const buttons = {
      part: [
        { icon: EditOutlined, onClick: () => handleEditPart(item), title: "Edit", disabled: isInRecycleBin },
        { icon: DeleteOutlined, onClick: () => handleDelete(item, 'part'), danger: true, title: "Delete", disabled: isInRecycleBin }
      ],
      assembly: [
        { icon: PartitionOutlined, onClick: () => handleCreateSubAssembly(item), title: "Add Sub-Assembly", disabled: isInRecycleBin },
        { icon: ToolOutlined, onClick: () => {
            const product = products.find(p => p.id === item.product_id);
            if (product) {
              handleCreatePart(product, item);
            }
          }, title: "Add Part", disabled: isInRecycleBin },
        { icon: EditOutlined, onClick: () => handleEditAssembly(item), title: "Edit", disabled: isInRecycleBin },
        { icon: DeleteOutlined, onClick: () => handleDelete(item, 'assembly'), danger: true, title: "Delete", disabled: isInRecycleBin }
      ],
      product: [
        { icon: PartitionOutlined, onClick: () => handleCreateAssembly(item), title: "Add Assembly" },
        { icon: ToolOutlined, onClick: () => handleCreatePart(item), title: "Add Part" },
        { icon: EditOutlined, onClick: () => handleEditProduct(item), title: "Edit" },
        { 
          icon: DeleteOutlined, 
          onClick: hasParts ? () => handleDeleteAllParts(item) : () => handleDelete(item, 'product'), 
          danger: true, 
          title: hasParts ? "Delete All Parts" : "Delete" 
        }
      ]
    };
    return (
      <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
        <div className="flex-shrink-0 flex gap-1 justify-start lg:w-[180px]">
          {tagName && (
            <span className="hidden lg:inline-block">
              <Tag color={tagColor} className="text-[10px] leading-[14px] px-1 h-auto m-0 shrink-0">
                {tagName.toUpperCase()}
              </Tag>
            </span>
          )}
          {isInRecycleBin && type === 'part' && (
            <span className="hidden lg:inline-block">
              <Tag color="red" className="text-[10px] leading-[14px] px-1 h-auto m-0 shrink-0">
                RECYCLE BIN
              </Tag>
            </span>
          )}
          {type === 'part' ? (
            <>
              {buttons.part.map(({ icon: Icon, onClick, danger, title, color, disabled }, idx) => (
                <Tooltip key={idx} title={disabled ? "Item in recycle bin" : title}>
                  <Button 
                    type="text" 
                    size="small" 
                    danger={danger}
                    disabled={disabled}
                    onClick={(e) => { e.stopPropagation(); if (!disabled) onClick(); }} 
                    icon={<Icon style={{ fontSize: '14px', color: color || undefined }} />}
                    style={{ padding: 4, minWidth: 24, height: 24 }}
                  />
                </Tooltip>
              ))}
              {getRawMaterialStatusTag(item.raw_material_status, null, item.raw_material_stock_details, item.part_detail, item.raw_material_id)}
            </>
          ) : (
          buttons[type].map(({ icon: Icon, onClick, danger, title, color, disabled }, idx) => (
            <Tooltip key={idx} title={disabled ? "Item in recycle bin" : title}>
              <Button 
                type="text" 
                size="small" 
                danger={danger}
                disabled={disabled}
                onClick={(e) => { e.stopPropagation(); if (!disabled) onClick(); }} 
                icon={<Icon style={{ fontSize: '14px', color: color || undefined }} />}
                style={{ padding: 4, minWidth: 24, height: 24 }}
              />
            </Tooltip>
          ))
          )}
          {type === 'product' && (
            <ProductBOMPdfDownload product={item} bomExport={bomExport} />
          )}
        </div>
      </div>
    );
  };

  const getRawMaterialStatusTag = (status, stockStatus, stockDetails, partDetail, rawMaterialId) => {
    // If part is WITHOUT_RAW_MATERIAL, don't show raw material status
    if (partDetail === 'WITHOUT_RAW_MATERIAL' || !rawMaterialId) {
      return <Tag className="m-0 text-[10px] shrink-0" color="default">N/A</Tag>;
    }
    
    // Show stock status if available, otherwise fall back to material status
    const statusToShow = stockStatus || status || "N/A";
    const s = statusToShow.toString().toLowerCase();
    
    if (s === "available") return <Tag className="m-0 text-[10px] shrink-0" color="success">Available</Tag>;
    if (s === "not available") return <Tag className="m-0 text-[10px] shrink-0" color="error">Not Available</Tag>;
    
    // If we have stock details, show stock-specific status
    if (stockDetails) {
      if (stockDetails.status === 'available') {
        return <Tag className="m-0 text-[10px] shrink-0" color="success">In Stock</Tag>;
      } else if (stockDetails.status === 'reserved') {
        return <Tag className="m-0 text-[10px] shrink-0" color="warning">Reserved</Tag>;
      } else if (stockDetails.status === 'used') {
        return <Tag className="m-0 text-[10px] shrink-0" color="default">Used</Tag>;
      }
    }
    
    return <Tag className="m-0 text-[10px] shrink-0">{statusToShow}</Tag>;
  };

  const renderPartInTree = (part, level = 0, productId = null) => {
    if (!matchesFilter(part, activeFilter)) return null;
    const isSelected = activeItemId === part.id && activeItemType === 'part';
    const isInRecycleBin = part.recycle_bin === true;
    const hasUnacknowledgedDocs = part.has_unacknowledged_documents === true;

    return (
      <div
        key={`part-${part.id}`}
        className={`flex items-center justify-between px-2 py-1 rounded-md cursor-pointer transition-colors mb-0.5 border-l-2 ${
          isInRecycleBin
            ? 'bg-gray-100 border-gray-300 text-gray-400 opacity-60'
            : hasUnacknowledgedDocs
            ? 'bg-amber-50 border-amber-500 text-amber-900'
            : isSelected
            ? 'bg-indigo-50 border-indigo-500 text-indigo-800'
            : 'hover:bg-slate-100 border-transparent'
        }`}
        style={{ marginLeft: `${level * 14}px` }}
        onClick={() => !isInRecycleBin && handleItemClick(part, 'part', productId || findProductIdForItem(part.id))}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="w-5 flex justify-center text-sm">{getTypeIcon(part.type_name || 'part')}</span>
          <div className="flex flex-col min-w-0">
            <Text className={`text-sm font-medium truncate ${
              isInRecycleBin
                ? 'text-gray-400'
                : hasUnacknowledgedDocs
                ? 'text-amber-900'
                : isSelected
                ? 'text-indigo-800'
                : 'text-slate-700'
            }`}>
              {part.part_name}
            </Text>
            <Text className={`text-[10px] truncate ${
              isInRecycleBin
                ? 'text-gray-400'
                : hasUnacknowledgedDocs
                ? 'text-amber-700'
                : 'text-slate-400'
            }`}>
              {part.part_number}
              {part.raw_material_name && (
                <span className="ml-1 text-[9px] text-indigo-500">({part.raw_material_name})</span>
              )}
            </Text>
          </div>
        </div>
        <ActionButtons 
          item={part} 
          type="part" 
          tagName={part.type_name || 'part'} 
          tagColor={getTypeColor(part.type_name || 'part')} 
        />
      </div>
    );
  };

  const renderAssemblyTree = (assembly, level = 0, productId = null) => {
    if (!hasMatchingItems(assembly, 'assembly', activeFilter, productId)) return null;
    
    const childAssemblies = getNestedAssemblies(assembly.id);
    const assemblyParts = getPartsForAssembly(assembly.id);
    const combinedChildren = [
      ...assemblyParts.map(p => ({ ...p, __childType: 'part' })),
      ...childAssemblies.map(a => ({ ...a, __childType: 'assembly' }))
    ].sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeA - timeB || (a.id || 0) - (b.id || 0);
    });

    const isExpanded = expandedItems[getExpandKey('assembly', assembly.id)];
    const hasChildren = combinedChildren.length > 0;
    const isSelected = activeItemId === assembly.id && activeItemType === 'assembly';

    return (
      <div key={`assembly-${assembly.id}`} className="select-none">
        <div
          className={`flex items-center justify-between px-2 py-1 rounded-md cursor-pointer transition-colors mb-0.5 border-l-2 ${isSelected ? 'bg-indigo-50 border-indigo-500 text-indigo-800' : 'hover:bg-slate-100 border-transparent'}`}
          style={{ marginLeft: `${level * 14}px` }}
          onClick={() => handleItemClick(assembly, 'assembly', productId || findProductIdForItem(assembly.id))}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex-shrink-0 w-5 flex justify-center">
              {hasChildren ? (
                <Button type="text" size="small" icon={isExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
                  onClick={(e) => { e.stopPropagation(); toggleExpand(getExpandKey('assembly', assembly.id)); }}
                  className="w-5 h-5 flex items-center justify-center p-0 text-slate-500 hover:bg-slate-200 rounded" />
              ) : <div className="w-5" />}
            </div>
            <span className="flex-shrink-0 text-sm">{getTypeIcon('assembly', level)}</span>
            <div className="flex flex-col min-w-0">
              <Text className={`text-sm font-medium truncate ${isSelected ? 'text-indigo-800' : 'text-slate-700'}`}>
                {assembly.assembly_name}
              </Text>
              <Text className="text-[10px] text-slate-400 truncate">
                {assembly.assembly_number}
              </Text>
            </div>
          </div>
          <ActionButtons 
            item={assembly} 
            type="assembly" 
            tagName={level > 1 ? 'SUB-ASSEMBLY' : 'ASSEMBLY'}
            tagColor={getTypeColor('assembly')}
          />
        </div>
        {isExpanded && hasChildren && (
          <div className="mt-0.5">
            {combinedChildren.map(child =>
              child.__childType === 'part'
                ? renderPartInTree(child, level + 1, productId)
                : renderAssemblyTree(child, level + 1, productId)
            )}
          </div>
        )}
      </div>
    );
  };

  const renderProductTree = (product) => {
    const productHierarchy = hierarchicalData[product.id];
    const hasData = !!productHierarchy;
    const childAssemblies = productHierarchy?.assemblies || [];
    const directParts = productHierarchy?.parts || [];
    
    // Filter children based on active filter
    const filteredDirectParts = directParts.filter(p => matchesFilter(p, activeFilter));
    const filteredChildAssemblies = childAssemblies.filter(asm => hasMatchingItems(asm, 'assembly', activeFilter, product.id));
    
    const combinedChildren = [
      ...filteredDirectParts.map(p => ({ ...p, __childType: 'part' })),
      ...filteredChildAssemblies.map(a => ({ ...a, __childType: 'assembly' }))
    ].sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeA - timeB || (a.id || 0) - (b.id || 0);
    });
    const isExpanded = expandedItems[getExpandKey('product', product.id)];
    const hasChildren = combinedChildren.length > 0;
    const showArrow = !hasData || hasChildren;
    const isSelected = activeItemId === product.id && activeItemType === 'product';

    return (
      <div key={product.id} className="select-none mb-1">
        <div
          className={`flex items-center justify-between px-2 py-1 rounded-md cursor-pointer transition-colors mb-0.5 border-l-2 ${isSelected ? 'bg-indigo-50 border-indigo-500 text-indigo-800' : 'hover:bg-slate-100 border-transparent'}`}
          onClick={() => handleItemClick(product, 'product')}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex-shrink-0 w-5 flex justify-center">
              {showArrow ? (
                <Button type="text" size="small" icon={isExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
                  onClick={(e) => { e.stopPropagation(); handleExpandProduct(product); }}
                  className="w-5 h-5 flex items-center justify-center p-0 text-slate-500 hover:bg-slate-200 rounded" />
              ) : <div className="w-5" />}
            </div>
            <span className="flex-shrink-0 text-sm">{getTypeIcon('product')}</span>
            <Text className={`text-sm font-semibold truncate ${isSelected ? 'text-indigo-800' : 'text-slate-800'}`}>{product.product_name}</Text>
          </div>
          <ActionButtons 
            item={product} 
            type="product" 
            tagName="product"
            tagColor={getTypeColor('product')}
          />
        </div>
        {isExpanded && hasChildren && (
          <div className="mt-0.5 ml-2 border-l border-slate-200 pl-1">
            {combinedChildren.map(child =>
              child.__childType === 'part'
                ? renderPartInTree(child, 1, product.id)
                : renderAssemblyTree(child, 1, product.id)
            )}
          </div>
        )}
      </div>
    );
  };

  // Function to highlight search term in text
  const highlightText = (text, searchTerm) => {
    if (!text || !searchTerm) return text;
    
    const searchLower = searchTerm.toLowerCase().replace(/\s+/g, ' ').trim();
    const textLower = text.toLowerCase().replace(/\s+/g, ' ').trim();
    
    if (!textLower.includes(searchLower)) return text;
    
    // Find all occurrences and create highlighted version
    const parts = [];
    let lastIndex = 0;
    let index = textLower.indexOf(searchLower);
    
    while (index !== -1) {
      // Add text before match
      parts.push(text.substring(lastIndex, index));
      // Add highlighted match
      parts.push(
        <span key={index} className="bg-yellow-200 text-yellow-900 font-medium px-0.5 rounded">
          {text.substring(index, index + searchLower.length)}
        </span>
      );
      lastIndex = index + searchLower.length;
      index = textLower.indexOf(searchLower, lastIndex);
    }
    
    // Add remaining text
    parts.push(text.substring(lastIndex));
    
    return <>{parts}</>;
  };

  // Search filtering functions
  const searchInHierarchicalData = (productId, searchTerm) => {
    const data = hierarchicalData[productId];
    if (!data || !searchTerm) return { filteredAssemblies: [], filteredParts: [], foundItems: [] };
    
    const searchLower = searchTerm.toLowerCase().replace(/\s+/g, ' ').trim();
    const filteredAssemblies = [];
    const filteredParts = [];
    const foundItems = [];
    const matchedAssemblyIds = new Set();
    
    // Function to recursively search in assemblies
    const searchInAssemblies = (assemblies, parentPath = []) => {
      assemblies.forEach(assembly => {
        const assemblyName = (assembly.assembly_name || '').toLowerCase().replace(/\s+/g, ' ').trim();
        const assemblyNumber = (assembly.assembly_number || '').toLowerCase().replace(/\s+/g, ' ').trim();
        const currentPath = [...parentPath, assembly];
        
        const matchesSearch = assemblyName.includes(searchLower) || assemblyNumber.includes(searchLower);
        
        if (matchesSearch) {
          filteredAssemblies.push({
            ...assembly,
            __searchMatch: true,
            __searchPath: currentPath
          });
          foundItems.push({
            type: 'assembly',
            item: assembly,
            path: currentPath,
            productId
          });
          matchedAssemblyIds.add(assembly.id);
          
          // Include all parts of this assembly when it matches
          if (assembly.parts) {
            assembly.parts.forEach(part => {
              filteredParts.push({
                ...part,
                __searchMatch: false, // Don't highlight parts, they're included because assembly matched
                __searchPath: currentPath,
                __parentAssembly: assembly,
                __includedViaAssembly: true
              });
              foundItems.push({
                type: 'part',
                item: part,
                path: currentPath,
                parentAssembly: assembly,
                productId,
                includedViaAssembly: true
              });
            });
          }
        }
        
        // Search in parts (even if assembly doesn't match)
        if (assembly.parts) {
          assembly.parts.forEach(part => {
            const partName = (part.part_name || '').toLowerCase().replace(/\s+/g, ' ').trim();
            const partNumber = (part.part_number || '').toLowerCase().replace(/\s+/g, ' ').trim();
            
            if (partName.includes(searchLower) || partNumber.includes(searchLower)) {
              filteredParts.push({
                ...part,
                __searchMatch: true,
                __searchPath: currentPath,
                __parentAssembly: assembly
              });
              foundItems.push({
                type: 'part',
                item: part,
                path: currentPath,
                parentAssembly: assembly,
                productId
              });
            }
          });
        }
        
        // Recursively search in child assemblies
        if (assembly.child_assemblies) {
          searchInAssemblies(assembly.child_assemblies, currentPath);
        }
      });
    };
    
    // Search in direct parts
    if (data.parts) {
      data.parts.forEach(part => {
        const partName = (part.part_name || '').toLowerCase().replace(/\s+/g, ' ').trim();
        const partNumber = (part.part_number || '').toLowerCase().replace(/\s+/g, ' ').trim();
        
        if (partName.includes(searchLower) || partNumber.includes(searchLower)) {
          filteredParts.push({
            ...part,
            __searchMatch: true,
            __searchPath: []
          });
          foundItems.push({
            type: 'part',
            item: part,
            path: [],
            productId
          });
        }
      });
    }
    
    // Search in assemblies
    if (data.assemblies) {
      searchInAssemblies(data.assemblies);
    }
    
    return { filteredAssemblies, filteredParts, foundItems };
  };

  // Function to render search results
  const renderSearchResults = () => {
    if (!searchTerm.trim()) return null;
    
    // Group results by assembly to show related parts together
    const groupedResults = {};
    const directResults = []; // Parts that directly match search
    
    filteredProducts.forEach(product => {
      const { foundItems } = searchInHierarchicalData(product.id, debouncedSearchTerm);
      foundItems.forEach(item => {
        const resultWithProduct = { ...item, productName: product.product_name };
        
        if (item.type === 'assembly') {
          // Initialize group for this assembly
          const groupKey = `assembly-${item.item.id}-${product.id}`;
          groupedResults[groupKey] = {
            assembly: resultWithProduct,
            parts: []
          };
        } else if (item.type === 'part') {
          if (item.includedViaAssembly && item.parentAssembly) {
            // Part is included via assembly match
            const groupKey = `assembly-${item.parentAssembly.id}-${product.id}`;
            if (!groupedResults[groupKey]) {
              // Create assembly group if it doesn't exist
              groupedResults[groupKey] = {
                assembly: {
                  type: 'assembly',
                  item: item.parentAssembly,
                  path: item.path,
                  productId: product.id,
                  productName: product.product_name,
                  __searchMatch: true
                },
                parts: []
              };
            }
            groupedResults[groupKey].parts.push(resultWithProduct);
          } else {
            // Direct part match
            directResults.push(resultWithProduct);
          }
        }
      });
    });
    
    const allResults = [...Object.values(groupedResults), ...directResults];
    
    if (allResults.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[200px] text-slate-400">
          <Empty description={`No results found for "${searchTerm}"`} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </div>
      );
    }
    
    const renderSearchPath = (path) => {
      return null; // Path display removed as requested
    };
    
    const handleItemClick = (result) => {
      // Select the item and expand its parent path
      setActiveItemId(result.item.id);
      setActiveItemType(result.type);
      
      // Expand all parent assemblies in the path
      const expandKeys = {};
      result.path.forEach(assembly => {
        expandKeys[getExpandKey('assembly', assembly.id)] = true;
      });
      expandKeys[getExpandKey('product', result.productId)] = true;
      
      setExpandedItems(prev => ({ ...prev, ...expandKeys }));
      
      if (onItemSelected) {
        const itemWithMeta = { 
          ...result.item, 
          itemType: result.type, 
          productId: result.productId,
          parentAssembly: result.parentAssembly
        };
        onItemSelected(itemWithMeta);
      }
    };
    
    const renderResultItem = (result, isIndented = false) => {
      const isIncludedViaAssembly = result.includedViaAssembly;
      const isSelected = activeItemId === result.item.id && activeItemType === result.type;
      
      return (
        <div 
          key={`${result.type}-${result.item.id}-${result.productId}`}
          className={`py-2 px-3 hover:bg-slate-100 transition-colors cursor-pointer ${isIndented ? 'ml-6 border-l-2 border-l-blue-200' : ''} ${isSelected ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : ''}`}
          onClick={() => handleItemClick(result)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="w-5 flex justify-center text-sm">
                {getTypeIcon(result.type === 'part' ? (result.item.type_name || 'part') : 'assembly', result.path.length)}
              </span>
              <div className="flex flex-col min-w-0">
                <Text className={`text-sm font-medium truncate ${isSelected ? 'text-indigo-800' : 'text-slate-700'}`}>
                  {result.type === 'part' 
                    ? highlightText(result.item.part_name, searchTerm)
                    : highlightText(result.item.assembly_name, searchTerm)
                  }
                </Text>
                <Text className="text-[10px] text-slate-400 truncate">
                  {result.type === 'part' 
                    ? highlightText(result.item.part_number, searchTerm)
                    : highlightText(result.item.assembly_number, searchTerm)
                  }
                </Text>
                <div className="flex items-center gap-2 mt-1">
                  <Tag size="small" color={getTypeColor(result.type)}>
                    {result.type.toUpperCase()}
                  </Tag>
                </div>
              </div>
            </div>
            <div onClick={(e) => e.stopPropagation()}>
              <ActionButtons
                item={result.item}
                type={result.type}
                tagName={result.type === 'part' ? (result.item.type_name || 'part') : (result.path.length > 0 ? 'SUB-ASSEMBLY' : 'ASSEMBLY')}
                tagColor={getTypeColor(result.type === 'part' ? (result.item.type_name || 'part') : 'assembly')}
              />
            </div>
          </div>
        </div>
      );
    };
    
    return (
      <div className="py-2">
        <div className="text-xs font-medium text-slate-600 px-3 py-2 mb-2 bg-slate-50 border-b border-slate-200">
          Found {allResults.reduce((acc, group) => 
            acc + (group.parts ? group.parts.length + 1 : 1), 0
          )} result{allResults.reduce((acc, group) => 
            acc + (group.parts ? group.parts.length + 1 : 1), 0
          ) !== 1 ? 's' : ''} for "{highlightText(searchTerm, searchTerm)}"
        </div>
        
        <div className="divide-y divide-slate-100">
          {allResults.map((group, index) => {
            if (group.parts) {
              // Render assembly with its related parts
              return (
                <div key={`group-${index}`}>
                  {renderResultItem(group.assembly)}
                  {group.parts.map(part => renderResultItem(part, true))}
                </div>
              );
            } else {
              // Render direct part result
              return renderResultItem(group);
            }
          })}
        </div>
      </div>
    );
  };

  const filteredProductsBase = products;

  const initialPid = initialProductId != null ? Number(initialProductId) : null;
  const filteredProducts = initialPid
    ? filteredProductsBase.filter(p => Number(p.id) === initialPid)
    : filteredProductsBase;

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <>
      <style>
        {`
          .bom-primary-btn, .bom-primary-btn:hover { background: #2563eb !important; color: #fff !important; border: none !important; }
          .bom-scroll::-webkit-scrollbar { width: 5px; }
          .bom-scroll::-webkit-scrollbar-track { background: #f1f5f9; }
          .bom-scroll::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 4px; }
        `}
      </style>
      <div className="flex flex-col h-full bg-slate-50/50">
        <div className="p-2 sm:p-3 border-b border-slate-200 bg-white shrink-0">
          <div className="flex justify-between items-center gap-2 mb-2 sm:mb-3">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <div className="p-1 sm:p-1.5 bg-indigo-100 rounded-lg shrink-0">
                <AppstoreOutlined className="text-indigo-600 text-sm sm:text-base" />
              </div>
              <h2 className="text-xs sm:text-sm font-semibold text-slate-800 m-0 truncate">
                Bill of Materials
              </h2>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Tooltip title="Download Parts Template">
                <Button
                  type="default"
                  size="small"
                  icon={<DownloadOutlined />}
                  onClick={() => downloadTemplate('parts')}
                  className="bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:text-slate-800 hover:border-slate-300 text-xs font-medium px-2 py-1 rounded-md shadow-sm"
                >
                  <span className="hidden sm:inline">Parts Template</span>
                </Button>
              </Tooltip>
              {filteredProducts.length === 1 && (
                <>
                  <AssemblyPartsUploadPanel
                    selectedItem={{ ...filteredProducts[0], itemType: 'product' }}
                    onPartsCreated={() => {
                      // Refresh the product hierarchy after parts are uploaded
                      fetchProductHierarchy(filteredProducts[0].id, true);
                    }}
                  />
                  <Button
                    type="default"
                    size="small"
                    icon={<ToolOutlined />}
                    onClick={() => handleViewAllTools(filteredProducts[0])}
                    className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 hover:text-blue-800 hover:border-blue-300 text-xs font-medium px-3 py-1 rounded-md shadow-sm"
                  >
                    View Tools
                  </Button>
                </>
              )}
              {!disableProductCreate && (
                <Button
                  type="primary"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={handleCreateProduct}
                  className="bom-primary-btn shrink-0"
                >
                  <span className="hidden sm:inline">New Product</span>
                  <span className="sm:hidden">New</span>
                </Button>
              )}
            </div>
          </div>
        
        {/* Search Bar & Filters */}
        <div className="px-2 pb-2 flex items-center gap-2 w-full max-w-3xl">
          <div className="flex-1 min-w-0">
            <Input
              placeholder="Search by assembly name/number or part name/number..."
              prefix={<SearchOutlined className="text-slate-400" />}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              allowClear
              className="w-full"
              size="small"
            />
          </div>
          <div className="w-44 sm:w-52 shrink-0">
            <BOMFilters 
              stats={getBOMStats()} 
              activeFilter={activeFilter} 
              onFilterChange={(filter) => {
                setActiveFilter(filter);
                setActiveItemId(null);
                setActiveItemType(null);
              }} 
            />
          </div>
        </div>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 bom-scroll min-h-0">
          {searchTerm.trim() ? (
            renderSearchResults()
          ) : filteredProducts.length > 0 ? (
            filteredProducts.map(product => renderProductTree(product))
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[200px] text-slate-400">
              <Empty description="No products" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </div>
          )}
        </div>
      </div>
      
      <CreateProductModal
        open={showCreateModal}
        onCancel={() => { setShowCreateModal(false); setParentAssembly(null); setEditingItem(null); setEditMode(false); }}
        createType={createType}
        selectedProduct={selectedProduct}
        parentAssembly={parentAssembly}
        mode={editMode ? 'edit' : 'create'}
        editingItem={editingItem}
        onProductCreated={handleProductCreated}
      />
      
      <PartActionModal
        open={showPartActionModal}
        onCancel={() => setShowPartActionModal(false)}
        actionType={partActionType}
        selectedPart={selectedPart}
        onActionCreated={handleActionCreated}
      />
      
      <ProductToolsViewer
        visible={showToolsModal}
        onClose={() => {
          setShowToolsModal(false);
          setSelectedProductForTools(null);
        }}
        product={selectedProductForTools}
      />
    </>
  );
};

export default BillOfMaterials;
