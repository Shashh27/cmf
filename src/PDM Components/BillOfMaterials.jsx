import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from "react";
import { PlusOutlined, PartitionOutlined, ToolOutlined, EditOutlined, DeleteOutlined, DeleteRowOutlined, CaretDownOutlined, CaretRightOutlined, SearchOutlined, DownloadOutlined, AppstoreOutlined, MoreOutlined, UndoOutlined } from "@ant-design/icons";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth";
import { Input, Button, App, Tooltip, Empty, Spin, Tag, Typography, Dropdown } from "antd";
import "./pdm-theme.css";

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
  const [isDeleting, setIsDeleting] = useState(false);
  const hasFetchedData = useRef(false);

  const getExpandKey = (type, id) => `${type}-${id}`;

  const getTypeIcon = (type, level = 0) => {
    const normalized = (type || "").toString().toLowerCase();
    
    // CAD-like 3D icons
    if (normalized === "product") {
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="pdm-cad-icon pdm-cad-icon-product">
          <path d="M12 2L2 7V17L12 22L22 17V7L12 2Z" fill="currentColor" opacity="0.3"/>
          <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="currentColor"/>
          <path d="M2 7L12 12V22L2 17V7Z" fill="currentColor" opacity="0.7"/>
          <path d="M22 7L12 12V22L22 17V7Z" fill="currentColor" opacity="0.5"/>
        </svg>
      );
    }
    
    if (normalized === "assembly" && level <= 1) {
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="pdm-cad-icon pdm-cad-icon-assembly">
          <path d="M8 4L2 7V17L8 20L14 17V7L8 4Z" fill="currentColor" opacity="0.3"/>
          <path d="M8 4L2 7L8 10L14 7L8 4Z" fill="currentColor"/>
          <path d="M2 7L8 10V20L2 17V7Z" fill="currentColor" opacity="0.7"/>
          <path d="M14 7L8 10V20L14 17V7Z" fill="currentColor" opacity="0.5"/>
          <path d="M16 8L22 11V21L16 24L10 21V11L16 8Z" fill="currentColor" opacity="0.3"/>
          <path d="M16 8L22 11L16 14L10 11L16 8Z" fill="currentColor"/>
          <path d="M10 11L16 14V24L10 21V11Z" fill="currentColor" opacity="0.7"/>
          <path d="M22 11L16 14V24L22 21V11Z" fill="currentColor" opacity="0.5"/>
        </svg>
      );
    }
    
    if (normalized === "assembly" && level > 1) {
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="pdm-cad-icon pdm-cad-icon-subassembly">
          <path d="M6 3L1 6V14L6 17L11 14V6L6 3Z" fill="currentColor" opacity="0.3"/>
          <path d="M6 3L1 6L6 9L11 6L6 3Z" fill="currentColor"/>
          <path d="M1 6L6 9V17L1 14V6Z" fill="currentColor" opacity="0.7"/>
          <path d="M11 6L6 9V17L11 14V6Z" fill="currentColor" opacity="0.5"/>
          <path d="M13 7L18 10V18L13 21L8 18V10L13 7Z" fill="currentColor" opacity="0.3"/>
          <path d="M13 7L18 10L13 13L8 10L13 7Z" fill="currentColor"/>
          <path d="M8 10L13 13V21L8 18V10Z" fill="currentColor" opacity="0.7"/>
          <path d="M18 10L13 13V21L18 18V10Z" fill="currentColor" opacity="0.5"/>
        </svg>
      );
    }
    
    const inHouseTypes = ["make", "in-house", "in house", "inhouse"];
    const outSourceTypes = ["buy", "out-source", "out source", "outsourced", "outsourcing"];
    
    if (inHouseTypes.includes(normalized)) {
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="pdm-cad-icon pdm-cad-icon-inhouse">
          <path d="M12 3L4 7V17L12 21L20 17V7L12 3Z" fill="currentColor" opacity="0.3"/>
          <path d="M12 3L4 7L12 11L20 7L12 3Z" fill="currentColor"/>
          <path d="M4 7L12 11V21L4 17V7Z" fill="currentColor" opacity="0.7"/>
          <path d="M20 7L12 11V21L20 17V7Z" fill="currentColor" opacity="0.5"/>
        </svg>
      );
    }
    
    if (outSourceTypes.includes(normalized)) {
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="pdm-cad-icon pdm-cad-icon-outsource">
          <path d="M12 3L4 7V17L12 21L20 17V7L12 3Z" fill="currentColor" opacity="0.3"/>
          <path d="M12 3L4 7L12 11L20 7L12 3Z" fill="currentColor"/>
          <path d="M4 7L12 11V21L4 17V7Z" fill="currentColor" opacity="0.7"/>
          <path d="M20 7L12 11V21L20 17V7Z" fill="currentColor" opacity="0.5"/>
          <path d="M10 8L14 10V16L10 18L6 16V10L10 8Z" fill="currentColor" opacity="0.8"/>
        </svg>
      );
    }
    
    if (normalized === "standard") {
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="pdm-cad-icon pdm-cad-icon-standard">
          <path d="M12 3L4 7V17L12 21L20 17V7L12 3Z" fill="currentColor" opacity="0.3"/>
          <path d="M12 3L4 7L12 11L20 7L12 3Z" fill="currentColor"/>
          <path d="M4 7L12 11V21L4 17V7Z" fill="currentColor" opacity="0.7"/>
          <path d="M20 7L12 11V21L20 17V7Z" fill="currentColor" opacity="0.5"/>
          <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.9"/>
        </svg>
      );
    }
    
    if (normalized === "part") {
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="pdm-cad-icon pdm-cad-icon-standard">
          <path d="M12 3L4 7V17L12 21L20 17V7L12 3Z" fill="currentColor" opacity="0.3"/>
          <path d="M12 3L4 7L12 11L20 7L12 3Z" fill="currentColor"/>
          <path d="M4 7L12 11V21L4 17V7Z" fill="currentColor" opacity="0.7"/>
          <path d="M20 7L12 11V21L20 17V7Z" fill="currentColor" opacity="0.5"/>
        </svg>
      );
    }
    
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="pdm-cad-icon pdm-cad-icon-standard">
        <path d="M12 3L4 7V17L12 21L20 17V7L12 3Z" fill="currentColor" opacity="0.3"/>
        <path d="M12 3L4 7L12 11L20 7L12 3Z" fill="currentColor"/>
        <path d="M4 7L12 11V21L4 17V7Z" fill="currentColor" opacity="0.7"/>
        <path d="M20 7L12 11V21L20 17V7Z" fill="currentColor" opacity="0.5"/>
      </svg>
    );
  };

  const getTypeColor = (type) => {
    const normalized = (type || "").toString().toLowerCase();
    const inHouseTypes = ["make", "in-house", "in house", "inhouse", "part"];
    const outSourceTypes = ["buy", "out-source", "out source", "outsourced", "outsourcing"];

    if (normalized === "product") return '#9333EA';
    if (normalized === "assembly") return '#2563EB';
    if (inHouseTypes.includes(normalized)) return '#16A34A';
    if (outSourceTypes.includes(normalized)) return '#F59E0B';
    if (normalized === "standard") return '#6B7280';
    return '#6B7280';
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
    if (isDeleting) return;
    const endpoints = { product: `/products/${item.id}`, assembly: `/assemblies/${item.id}/soft-delete`, part: `/parts/${item.id}/soft-delete` };
    const names = { product: item.product_name, assembly: item.assembly_name, part: item.part_name };
    
    modal.confirm({
      title: `Delete ${type}`,
      content: `Are you sure you want to delete ${type} "${names[type]}"? This cannot be undone.`,
      okText: 'Yes',
      okType: 'danger',
      cancelText: 'No',
      okButtonProps: { id: `delete-ok-${type}-${item.id}` },
      onOk: async () => {
        setIsDeleting(true);
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
        } finally {
          setIsDeleting(false);
        }
      }
    });
  };

  const handleDeleteAllParts = async (product) => {
    modal.confirm({
      title: "Delete All Parts",
      content: `Move all parts for product "${product.product_name}" to the recycle bin?`,
      okText: 'Yes, Move to Recycle Bin',
      okType: 'danger',
      cancelText: 'No',
      okButtonProps: { id: `delete-all-parts-${product.id}` },
      onOk: async () => {
        try {
          const response = await axios.post(`${API_BASE_URL}/recycle-bin/products/${product.id}/soft-delete-parts`);
          
          if (response.data?.deleted_count) {
            message.success(`${response.data.deleted_count} part(s) moved to recycle bin for product "${product.product_name}".`);
          } else {
            message.info(`No parts found to move to recycle bin for product "${product.product_name}".`);
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

    // Define dropdown menu items based on type
    const getMenuItems = () => {
      if (type === 'part') {
        return [
          { key: 'edit', label: 'Edit', icon: <EditOutlined />, onClick: () => handleEditPart(item), disabled: isInRecycleBin },
          { key: 'delete', label: 'Delete', icon: <DeleteOutlined />, onClick: () => handleDelete(item, 'part'), disabled: isInRecycleBin, danger: true }
        ];
      }
      
      if (type === 'assembly') {
        const isSubAssembly = item.parent_id !== null;
        if (isSubAssembly) {
          // Sub-Assembly: Add Part, Edit, Delete
          return [
            { key: 'add-part', label: 'Add Part', icon: <ToolOutlined />, onClick: () => {
              const product = products.find(p => p.id === item.product_id);
              if (product) handleCreatePart(product, item);
            }, disabled: isInRecycleBin },
            { key: 'edit', label: 'Edit', icon: <EditOutlined />, onClick: () => handleEditAssembly(item), disabled: isInRecycleBin },
            { key: 'delete', label: 'Delete', icon: <DeleteOutlined />, onClick: () => handleDelete(item, 'assembly'), disabled: isInRecycleBin, danger: true }
          ];
        } else {
          // Assembly: Add Sub-Assembly, Add Part, Edit, Delete
          return [
            { key: 'add-sub-assembly', label: 'Add Sub-Assembly', icon: <PartitionOutlined />, onClick: () => handleCreateSubAssembly(item), disabled: isInRecycleBin },
            { key: 'add-part', label: 'Add Part', icon: <ToolOutlined />, onClick: () => {
              const product = products.find(p => p.id === item.product_id);
              if (product) handleCreatePart(product, item);
            }, disabled: isInRecycleBin },
            { key: 'edit', label: 'Edit', icon: <EditOutlined />, onClick: () => handleEditAssembly(item), disabled: isInRecycleBin },
            { key: 'delete', label: 'Delete', icon: <DeleteOutlined />, onClick: () => handleDelete(item, 'assembly'), disabled: isInRecycleBin, danger: true }
          ];
        }
      }
      
      if (type === 'product') {
        return [
          { key: 'add-assembly', label: 'Add Assembly', icon: <PartitionOutlined />, onClick: () => handleCreateAssembly(item) },
          { key: 'add-part', label: 'Add Part', icon: <ToolOutlined />, onClick: () => handleCreatePart(item) },
          { key: 'edit', label: 'Edit Product', icon: <EditOutlined />, onClick: () => handleEditProduct(item) },
          { key: 'delete', label: hasParts ? 'Delete All Parts' : 'Delete', icon: <DeleteOutlined />, onClick: hasParts ? () => handleDeleteAllParts(item) : () => handleDelete(item, 'product'), danger: true }
        ];
      }
      
      return [];
    };

    const menuItems = getMenuItems();

    return (
      <div className="pdm-action-buttons flex items-center gap-0" style={{ width: 180, minWidth: 180, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
        {/* Col 1: type tag — fixed 80px, truncates if needed */}
        <div style={{ width: 80, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          {isInRecycleBin ? (
            <Tooltip title="RECYCLE BIN">
              <UndoOutlined style={{ color: '#dc2626', fontSize: 14 }} />
            </Tooltip>
          ) : tagName ? (
            <Tooltip title={tagName.toUpperCase()}>
              <Tag color={tagColor} style={{ fontSize: 9, padding: '0 3px', margin: 0, lineHeight: '14px', whiteSpace: 'nowrap', maxWidth: 78, overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}>
                {tagName.toUpperCase()}
              </Tag>
            </Tooltip>
          ) : null}
        </div>
        {/* Col 2: download for product (centered), raw material status for part, empty for assembly — fixed 76px */}
        <div style={{ width: 76, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {type === 'product' && <ProductBOMPdfDownload product={item} bomExport={bomExport} />}
          {type === 'part' && getRawMaterialStatusTag(item.raw_material_status, null, item.raw_material_stock_details, item.part_detail, item.raw_material_id)}
        </div>
        {menuItems.length > 0 && (
          <Dropdown
            key={`dropdown-${type}-${item.id}`}
            menu={{ items: menuItems }}
            trigger={['click']}
            disabled={isInRecycleBin}
          >
            <Button
              type="text"
              size="small"
              icon={<MoreOutlined />}
              onClick={(e) => e.stopPropagation()}
              style={{ padding: 4, minWidth: 24, height: 24 }}
            />
          </Dropdown>
        )}
      </div>
    );
  };

  const getRawMaterialStatusTag = (status, stockStatus, stockDetails, partDetail, rawMaterialId) => {
    // If part is WITHOUT_RAW_MATERIAL, don't show raw material status
    if (partDetail === 'WITHOUT_RAW_MATERIAL' || !rawMaterialId) {
      return <Tooltip title="No Raw Material"><Tag className="m-0 text-[10px] shrink-0" color="default" style={{ cursor: 'pointer' }}>N/A</Tag></Tooltip>;
    }
    
    // Show stock status if available, otherwise fall back to material status
    const statusToShow = stockStatus || status || "N/A";
    const s = statusToShow.toString().toLowerCase();
    
    if (s === "available") return <Tooltip title="Raw Material Available"><Tag className="m-0 text-[10px] shrink-0" color="success" style={{ cursor: 'pointer' }}>Available</Tag></Tooltip>;
    if (s === "not available") return <Tooltip title="Raw Material Not Available"><Tag className="m-0 text-[10px] shrink-0" color="error" style={{ cursor: 'pointer' }}>Not Available</Tag></Tooltip>;
    
    // If we have stock details, show stock-specific status
    if (stockDetails) {
      if (stockDetails.status === 'available') {
        return <Tooltip title="Stock Available"><Tag className="m-0 text-[10px] shrink-0" color="success" style={{ cursor: 'pointer' }}>In Stock</Tag></Tooltip>;
      } else if (stockDetails.status === 'reserved') {
        return <Tooltip title="Stock Reserved"><Tag className="m-0 text-[10px] shrink-0" color="warning" style={{ cursor: 'pointer' }}>Reserved</Tag></Tooltip>;
      } else if (stockDetails.status === 'used') {
        return <Tooltip title="Stock Used"><Tag className="m-0 text-[10px] shrink-0" color="default" style={{ cursor: 'pointer' }}>Used</Tag></Tooltip>;
      }
    }
    
    return <Tooltip title={statusToShow}><Tag className="m-0 text-[10px] shrink-0" style={{ cursor: 'pointer' }}>{statusToShow}</Tag></Tooltip>;
  };

  const renderPartInTree = (part, level = 0, productId = null) => {
    if (!matchesFilter(part, activeFilter)) return null;
    const isSelected = activeItemId === part.id && activeItemType === 'part';
    const isInRecycleBin = part.recycle_bin === true;
    const hasUnacknowledgedDocs = part.has_unacknowledged_documents === true;

    return (
      <div
        key={`part-${part.id}`}
        className={`pdm-bom-item pdm-bom-item-${(part.type_name || 'part').toLowerCase().replace(/[^a-z]/g, '')} ${
          isInRecycleBin
            ? 'opacity-60'
            : hasUnacknowledgedDocs
            ? 'bg-amber-50'
            : isSelected
            ? 'pdm-bom-item-selected'
            : ''
        }`}
        style={{ marginLeft: `${level * 12}px` }}
        onClick={() => !isInRecycleBin && handleItemClick(part, 'part', productId || findProductIdForItem(part.id))}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="w-5 flex justify-center items-center text-sm flex-shrink-0">{getTypeIcon(part.type_name || 'part')}</span>
          <div className="flex flex-col min-w-0 flex-1">
            <Tooltip title={`${part.part_name}${part.raw_material_name ? ' · ' + part.raw_material_name : ''}`} placement="topLeft">
              <Text className={`text-sm font-semibold truncate ${
                isInRecycleBin
                  ? 'text-gray-400'
                  : hasUnacknowledgedDocs
                  ? 'text-amber-900'
                  : isSelected
                  ? 'text-[#2E8B57]'
                  : 'text-[#2F2F2F]'
              }`} style={{ fontSize: 13 }}>
                {part.part_name}
              </Text>
            </Tooltip>
            <Tooltip title={`${part.part_number}${part.raw_material_name ? ' (' + part.raw_material_name + ')' : ''}`} placement="bottomLeft">
              <Text className={`text-xs truncate ${
                isInRecycleBin
                  ? 'text-gray-400'
                  : hasUnacknowledgedDocs
                  ? 'text-amber-700'
                  : 'text-[#5D4037]'
              }`} style={{ fontSize: 11 }}>
                {part.part_number}
                {part.raw_material_name && (
                  <span className="ml-1 text-[10px] text-[#2E8B57]" style={{ fontSize: 10 }}>({part.raw_material_name})</span>
                )}
              </Text>
            </Tooltip>
          </div>
          <ActionButtons 
            item={part} 
            type="part" 
            tagName={part.type_name || 'part'} 
            tagColor={getTypeColor(part.type_name || 'part')} 
          />
        </div>
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
          className={`pdm-bom-item pdm-bom-item-${level > 1 ? 'subassembly' : 'assembly'} ${
            isSelected ? 'pdm-bom-item-selected' : ''
          }`}
          style={{ marginLeft: `${level * 12}px` }}
          onClick={() => handleItemClick(assembly, 'assembly', productId || findProductIdForItem(assembly.id))}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex-shrink-0 w-5 flex justify-center items-center">
              {hasChildren ? (
                <Button type="text" size="small" icon={isExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
                  onClick={(e) => { e.stopPropagation(); toggleExpand(getExpandKey('assembly', assembly.id)); }}
                  className="w-5 h-5 flex items-center justify-center p-0 text-[#5D4037] hover:bg-[#F5F5DC]" />
              ) : <div className="w-5" />}
            </div>
            <span className="w-5 flex justify-center items-center text-sm flex-shrink-0">{getTypeIcon('assembly', level)}</span>
            <div className="flex flex-col min-w-0 flex-1">
              <Tooltip title={assembly.assembly_name} placement="topLeft">
                <Text className={`text-sm font-semibold truncate ${
                  isSelected ? 'text-[#2E8B57]' : 'text-[#2F2F2F]'
                }`} style={{ fontSize: 13 }}>
                  {assembly.assembly_name}
                </Text>
              </Tooltip>
              <Tooltip title={assembly.assembly_number} placement="bottomLeft">
                <Text className="text-xs text-[#5D4037] truncate" style={{ fontSize: 11 }}>
                  {assembly.assembly_number}
                </Text>
              </Tooltip>
            </div>
            <ActionButtons 
              item={assembly} 
              type="assembly" 
              tagName={level > 1 ? 'SUB-ASSEMBLY' : 'ASSEMBLY'}
              tagColor={getTypeColor('assembly')}
            />
          </div>
        </div>
        {isExpanded && hasChildren && (
          <div>
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
      <div key={product.id} className="select-none">
        <div
          className={`pdm-bom-item pdm-bom-item-product ${
            isSelected ? 'pdm-bom-item-selected' : ''
          }`}
          onClick={() => handleItemClick(product, 'product')}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex-shrink-0 w-5 flex justify-center items-center">
              {showArrow ? (
                <Button type="text" size="small" icon={isExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
                  onClick={(e) => { e.stopPropagation(); handleExpandProduct(product); }}
                  className="w-5 h-5 flex items-center justify-center p-0 text-[#5D4037] hover:bg-[#F5F5DC]" />
              ) : <div className="w-5" />}
            </div>
            <span className="w-5 flex justify-center items-center text-sm flex-shrink-0">{getTypeIcon('product')}</span>
            <div className="flex flex-col min-w-0 flex-1">
              <Tooltip title={product.product_name} placement="topLeft">
                <Text className={`text-sm font-semibold truncate ${
                  isSelected ? 'text-[#2E8B57]' : 'text-[#2F2F2F]'
                }`} style={{ fontSize: 13 }}>{product.product_name}</Text>
              </Tooltip>
              {product.product_number && (
                <Tooltip title={product.product_number} placement="bottomLeft">
                  <Text className="text-xs text-[#5D4037] truncate" style={{ fontSize: 11 }}>
                    {product.product_number}
                  </Text>
                </Tooltip>
              )}
            </div>
            <ActionButtons 
              item={product} 
              type="product" 
              tagName="product"
              tagColor={getTypeColor('product')}
            />
          </div>
        </div>
        {isExpanded && hasChildren && (
          <div className="ml-2 border-l border-[#D6D3C4] pl-1">
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
            <div className="flex items-center gap-3 flex-1 min-w-0">
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
      <div className="pdm-container flex flex-col h-full bg-[#F5F5DC]">
        <div className="pdm-section-header flex-wrap gap-2" style={{ margin: 0, padding: '4px 8px' }}>
          <div className="pdm-section-header-title">
            <AppstoreOutlined style={{ color: '#2E8B57', fontSize: 16 }} />
            <span className="text-sm font-semibold" style={{ fontSize: 14 }}>Bill of Materials</span>
          </div>
            <div className="flex items-center gap-1 sm:gap-2 shrink-0 flex-wrap">
              <Tooltip title="Download Parts Template">
                <Button
                  type="default"
                  size="small"
                  icon={<DownloadOutlined />}
                  onClick={() => downloadTemplate('parts')}
                  className="pdm-action-button"
                >
                  <span className="hidden lg:inline">Parts Template</span>
                </Button>
              </Tooltip>
              {filteredProducts.length === 1 && (
                <>
                  <AssemblyPartsUploadPanel
                    selectedItem={{ ...filteredProducts[0], itemType: 'product' }}
                    onPartsCreated={() => {
                      fetchProductHierarchy(filteredProducts[0].id, true);
                    }}
                  />
                  <Button
                    type="default"
                    size="small"
                    icon={<ToolOutlined />}
                    onClick={() => handleViewAllTools(filteredProducts[0])}
                    className="pdm-action-button"
                  >
                    <span className="hidden md:inline">View Tools</span>
                  </Button>
                </>
              )}
              {!disableProductCreate && (
                <Button
                  type="primary"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={handleCreateProduct}
                  className="pdm-action-button"
                  style={{ backgroundColor: '#2E8B57', borderColor: '#2E8B57', color: '#FFFFFF' }}
                >
                  <span className="hidden sm:inline">New Product</span>
                  <span className="sm:hidden">New</span>
                </Button>
              )}
            </div>
          </div>
        
        {/* Search Bar & Filters */}
        <div className="px-3 pb-3 pt-2 flex items-center gap-2 w-full flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="pdm-search-bar">
              <SearchOutlined style={{ color: '#5D4037' }} />
              <input
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="w-32 sm:w-40 md:w-44 lg:w-52 shrink-0">
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
        
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 min-h-0">
          {searchTerm.trim() ? (
            renderSearchResults()
          ) : filteredProducts.length > 0 ? (
            filteredProducts.map(product => renderProductTree(product))
          ) : (
            <div className="pdm-empty-state">
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
