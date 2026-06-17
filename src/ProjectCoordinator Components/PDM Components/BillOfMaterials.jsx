import React, { useState, useEffect, useRef, useMemo } from "react";
import { SearchOutlined, PlusOutlined, PartitionOutlined, ToolOutlined, FileTextOutlined, EditOutlined, DeleteOutlined, DeploymentUnitOutlined, ClusterOutlined, AppstoreOutlined, CaretDownOutlined, CaretRightOutlined, CodepenOutlined, BlockOutlined, CodeSandboxOutlined, DownloadOutlined } from "@ant-design/icons";
import axios from "axios";
import { API_BASE_URL } from "../../Config/auth";
import { Input, Button, App, Tooltip, Empty, Spin, Tag, Typography } from "antd";

const { Text } = Typography;
import CreateProductModal from "./CreateProductModal";
import PartActionModal from "./PartActionModal";
import ProductBOMPdfDownload from "../../DownloadReports/ProductBOMPdfDownload";
import AssemblyPartsUploadPanel from "./AssemblyPartsUploadPanel";
import { getLatestRevision } from "./operationUtils";
import BOMFilters from "./BOMFilters";

// ── Highlight helper ──────────────────────────────────────────────────────────
// Wraps every case-insensitive match of `query` inside `text` with a light-blue
// <mark> span. Returns the original string unchanged when there is no match.
const highlightText = (text, query) => {
  if (!query || !text) return text ?? '';
  const str = String(text);
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = str.split(new RegExp(`(${escaped})`, 'gi'));
  if (parts.length === 1) return str;
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark
            key={i}
            style={{
              backgroundColor: '#bae0ff',
              color: 'inherit',
              padding: '0 1px',
              borderRadius: 2,
            }}
          >
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
};

const BillOfMaterials = ({ 
  onItemSelected, 
  onHierarchyLoaded, 
  disableProductCreate = false, 
  initialProductId = null, 
  singleProductId = null,
  projectName,
  projectNumber
}) => {
  const { message, modal } = App.useApp();
  const [products, setProducts] = useState([]);
  const [expandedItems, setExpandedItems] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
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
  const [activeFilter, setActiveFilter] = useState('all');
  const hasFetchedData = useRef(false);
  const singleProductFetched = useRef(false);

  const getExpandKey = (type, id) => `${type}-${id}`;

  const getTypeIcon = (type, level = 0) => {
    const normalized = (type || "").toString().toLowerCase();
    if (normalized === "product") return <DeploymentUnitOutlined className="text-purple-600" />;
    if (normalized === "assembly" && level <= 1) return <ClusterOutlined className="text-blue-500" />;
    if (normalized === "assembly" && level > 1) return <BlockOutlined className="text-indigo-600" />;
    const inHouseTypes = ["make", "in-house", "in house", "inhouse"];
    const outSourceTypes = ["buy", "out-source", "out source", "outsourced", "outsourcing"];
    if (inHouseTypes.includes(normalized)) return <CodeSandboxOutlined className="text-emerald-600" />;
    if (outSourceTypes.includes(normalized)) return <CodepenOutlined className="text-amber-600" />;
    if (normalized === "part") return <FileTextOutlined className="text-gray-500" />;
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
    if (singleProductId != null) {
      if (singleProductFetched.current) return;
      singleProductFetched.current = true;
      setLoading(true);
      const loadSingle = async () => {
        try {
          const transformedData = await fetchProductHierarchy(singleProductId);
          if (transformedData) {
            // Set product from hierarchical data (no need for separate product API call)
            const productData = transformedData.product || transformedData;
            setProducts([{ id: singleProductId, product_name: productData.product_name || productData.product_number || `Product ${singleProductId}` }]);
            setExpandedItems(prev => ({ ...prev, [getExpandKey('product', singleProductId)]: true }));
          }
        } catch (e) {
          console.error('Error loading single product:', e);
          message.error('Failed to load product');
        } finally {
          setLoading(false);
        }
      };
      loadSingle();
      return;
    }
    if (!hasFetchedData.current) {
      hasFetchedData.current = true;
      setLoading(false);
    }
  }, [singleProductId]);

  const flattenBOMForExport = (data) => {
    const parts = [];
    const assemblies = [];

    const processAssembly = (assembly, path = []) => {
      const currentPath = [...path, assembly.assembly_name];
      
      assemblies.push({
        id: assembly.id,
        assembly_number: assembly.assembly_number,
        assembly_name: assembly.assembly_name,
        parent_assembly_id: assembly.parent_id || null,
      });

      const assemblyParts = assembly.parts || [];
      assemblyParts.forEach(part => {
        parts.push({
          part: part,
          assembly_path: currentPath,
        });
      });

      const childAssemblies = assembly.child_assemblies || [];
      childAssemblies.forEach(child => processAssembly(child, currentPath));
    };

    (data.assemblies || []).forEach(asm => processAssembly(asm, []));
    
    (data.parts || []).forEach(part => {
      parts.push({
        part: part,
        assembly_path: [],
      });
    });

    return { parts, assemblies };
  };

  const fetchProductHierarchy = async (productId, forceRefresh = false) => {
    if (!forceRefresh && hierarchicalData[productId]) return hierarchicalData[productId];
    try {
      const response = await axios.get(`${API_BASE_URL}/products/${productId}/hierarchical-lightweight`);
      if (response.status >= 200 && response.status < 300) {
        const data = response.data;
        const bomExport = flattenBOMForExport(data);
        const transformedData = {
          ...data,
          bomExport,
        };
        setHierarchicalData(prev => ({ ...prev, [productId]: transformedData }));
        if (onHierarchyLoaded) onHierarchyLoaded(productId, data);
        return transformedData;
      }
    } catch (error) {
      console.error("Error fetching product hierarchy:", error);
      message.error("Error fetching product hierarchy");
    }
  };

  const toggleExpand = (key) => {
    setExpandedItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleExpandProduct = async (product) => {
    if (!hierarchicalData[product.id]) await fetchProductHierarchy(product.id);
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

  const handleCreateProduct = () => openModal('product');

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
    if (!hierarchicalData[product.id]) fetchProductHierarchy(product.id);
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
      content: type === 'part' || type === 'assembly'
        ? `Are you sure you want to delete ${type} "${names[type]}"? It will be moved to the recycle bin and can be restored later.`
        : `Are you sure you want to delete ${type} "${names[type]}"? This cannot be undone.`,
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

  const handleItemClick = async (item, type, productId = null) => {
    setActiveItemId(item.id);
    setActiveItemType(type);
    if (type === 'product') {
      if (!hierarchicalData[item.id]) await fetchProductHierarchy(item.id);
    }
    toggleExpand(getExpandKey(type, item.id));
    const itemWithMeta = { ...item, itemType: type, productId: productId || (type === 'product' ? item.id : null) };
    if (onItemSelected) onItemSelected(itemWithMeta);
  };

  const findProductIdForItem = (itemId) => {
    for (const productId in hierarchicalData) {
      const product = hierarchicalData[productId];
      if (product.parts?.some(p => p.id === itemId)) return productId;
      const checkAssemblies = (assemblies) => {
        for (const assembly of assemblies) {
          if (assembly.id === itemId) return productId;
          if (assembly.parts?.some(p => p.id === itemId)) return productId;
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

  const ActionButtons = ({ item, type, tagName, tagColor }) => {
    const productHierarchy = type === 'product' ? hierarchicalData[item.id] : null;
    const bomExport = productHierarchy?.bomExport;
    const isInRecycleBin = (type === 'part' && item.recycle_bin === true) || (type === 'assembly' && item.recycle_bin === true);

    const buttons = {
      part: [
        { icon: EditOutlined, onClick: () => handleEditPart(item), title: "Edit", disabled: isInRecycleBin },
        { icon: DeleteOutlined, onClick: () => handleDelete(item, 'part'), danger: true, title: "Delete", disabled: isInRecycleBin }
      ],
      assembly: [
        { icon: PartitionOutlined, onClick: () => handleCreateSubAssembly(item), title: "Add Sub-Assembly", disabled: isInRecycleBin },
        { icon: ToolOutlined, onClick: () => {
            const product = products.find(p => p.id === item.product_id);
            if (product) handleCreatePart(product, item);
          }, title: "Add Part", disabled: isInRecycleBin },
        { icon: EditOutlined, onClick: () => handleEditAssembly(item), title: "Edit", disabled: isInRecycleBin },
        { icon: DeleteOutlined, onClick: () => handleDelete(item, 'assembly'), danger: true, title: "Delete", disabled: isInRecycleBin }
      ],
      product: [
        { icon: PartitionOutlined, onClick: () => handleCreateAssembly(item), title: "Add Assembly" },
        { icon: ToolOutlined, onClick: () => handleCreatePart(item), title: "Add Part" },
        { icon: EditOutlined, onClick: () => handleEditProduct(item), title: "Edit" },
        { icon: DeleteOutlined, onClick: () => handleDelete(item, 'product'), danger: true, title: "Delete" }
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
          {isInRecycleBin && (
            <span className="hidden lg:inline-block">
              <Tag color="red" className="text-[10px] leading-[14px] px-1 h-auto m-0 shrink-0">
                RECYCLE BIN
              </Tag>
            </span>
          )}
          {type === 'part' ? (
            <>
              {buttons.part.map(({ icon: Icon, onClick, danger, title, disabled }, idx) => (
                <Tooltip key={idx} title={disabled ? "Item in recycle bin" : title}>
                  <Button
                    type="text"
                    size="small"
                    danger={danger}
                    disabled={disabled}
                    onClick={(e) => { e.stopPropagation(); if (!disabled) onClick(); }}
                    icon={<Icon style={{ fontSize: '14px' }} />}
                    style={{ padding: 4, minWidth: 24, height: 24 }}
                  />
                </Tooltip>
              ))}
              {getRawMaterialStatusTag(item.raw_material_status, null, item.raw_material_stock_details, item.part_detail, item.raw_material_id)}
            </>
          ) : (
            buttons[type].map(({ icon: Icon, onClick, danger, title, disabled }, idx) => (
              <Tooltip key={idx} title={disabled ? "Item in recycle bin" : title}>
                <Button
                  type="text"
                  size="small"
                  danger={danger}
                  disabled={disabled}
                  onClick={(e) => { e.stopPropagation(); if (!disabled) onClick(); }}
                  icon={<Icon style={{ fontSize: '14px' }} />}
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

  const bomStats = useMemo(() => {
    const targetProducts = singleProductId 
      ? products.filter(p => Number(p.id) === Number(singleProductId))
      : products;
      
    const stats = { total: 0, inhouse: 0, outsource: 0, standard: 0, linked: 0, unlinked: 0 };
    
    const countParts = (parts) => {
      if (!parts) return;
      parts.forEach(p => {
        stats.total++;
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
    };
    
    const processAssembly = (assembly) => {
      countParts(assembly.parts);
      (assembly.child_assemblies || []).forEach(processAssembly);
    };
    
    targetProducts.forEach(product => {
      const data = hierarchicalData[product.id];
      if (!data) return;
      
      // Count direct parts
      countParts(data.parts);
      
      // Count parts in assemblies
      (data.assemblies || []).forEach(processAssembly);
    });
    
    return stats;
  }, [products, hierarchicalData, singleProductId]);

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
    
    if (type === 'part') {
      return matchesFilter(item, filter);
    }
    
    if (type === 'assembly') {
      const parts = item.parts || [];
      const childAssemblies = item.child_assemblies || [];
      
      const hasMatchingParts = parts.some(p => matchesFilter(p, filter));
      const hasMatchingChildren = childAssemblies.some(child => hasMatchingItems(child, 'assembly', filter, productId));
      
      return hasMatchingParts || hasMatchingChildren;
    }
    
    if (type === 'product') {
      const data = hierarchicalData[productId];
      if (!data) return false;
      
      const directParts = data.parts || [];
      const assemblies = data.assemblies || [];
      
      const hasMatchingDirectParts = directParts.some(p => matchesFilter(p, filter));
      const hasMatchingAssemblies = assemblies.some(asm => hasMatchingItems(asm, 'assembly', filter, productId));
      
      return hasMatchingDirectParts || hasMatchingAssemblies;
    }
    
    return true;
  };

  // ── Part row ──────────────────────────────────────────────────────────────
  const renderPartInTree = (part, level = 0, productId = null) => {
    if (!matchesFilter(part, activeFilter)) return null;
    const isSelected = activeItemId === part.id && activeItemType === 'part';
    const isInRecycleBin = part.recycle_bin === true;
    const hasUnacknowledgedDocs = part.has_unacknowledged_documents === true;
    const revision = getLatestRevision(part.documents);
    const partNumDisplay = revision ? `${part.part_number} (${revision})` : part.part_number;

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
          <Tooltip title={`${part.part_name} (${partNumDisplay})${isInRecycleBin ? ' - In Recycle Bin' : ''}`}>
            <div className="flex flex-col min-w-0">
              {/* ── Highlighted part name ── */}
              <Text className={`text-sm font-medium truncate leading-tight ${
                isInRecycleBin
                  ? 'text-gray-400'
                  : hasUnacknowledgedDocs
                  ? 'text-amber-900'
                  : isSelected
                  ? 'text-indigo-800'
                  : 'text-slate-700'
              }`}>
                {searchTerm ? highlightText(part.part_name, searchTerm) : part.part_name}
              </Text>
              {part.part_number && (
                <Text className={`text-xs truncate ${
                  isInRecycleBin
                    ? 'text-gray-400'
                    : hasUnacknowledgedDocs
                    ? 'text-amber-700'
                    : isSelected
                    ? 'text-indigo-500'
                    : 'text-slate-400'
                }`}>
                  {searchTerm ? highlightText(partNumDisplay, searchTerm) : partNumDisplay}
                </Text>
              )}
            </div>
          </Tooltip>
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

  // ── Assembly row ──────────────────────────────────────────────────────────
  const renderAssemblyTree = (assembly, level = 0, productId = null) => {
    if (!hasMatchingItems(assembly, 'assembly', activeFilter, productId)) return null;
    
    const childAssemblies = getNestedAssemblies(assembly.id);
    const assemblyParts = getPartsForAssembly(assembly.id);
    const combinedChildren = [
      ...assemblyParts.map(p => ({ ...p, __childType: 'part' })),
      ...childAssemblies.map(a => ({ ...a, __childType: 'assembly' }))
    ].sort((a, b) => (a.id || 0) - (b.id || 0));
    const isExpanded = expandedItems[getExpandKey('assembly', assembly.id)];
    const hasChildren = combinedChildren.length > 0;
    const isSelected = activeItemId === assembly.id && activeItemType === 'assembly';
    const isInRecycleBin = assembly.recycle_bin === true;
    const revision = getLatestRevision(assembly.documents);
    const assemblyNumDisplay = revision ? `${assembly.assembly_number} (${revision})` : assembly.assembly_number;

    return (
      <div key={`assembly-${assembly.id}`} className="select-none">
        <div
          className={`flex items-center justify-between px-2 py-1 rounded-md cursor-pointer transition-colors mb-0.5 border-l-2 ${
            isInRecycleBin
              ? 'bg-gray-100 border-gray-300 text-gray-400 opacity-60'
              : isSelected
              ? 'bg-indigo-50 border-indigo-500 text-indigo-800'
              : 'hover:bg-slate-100 border-transparent'
          }`}
          style={{ marginLeft: `${level * 14}px` }}
          onClick={() => !isInRecycleBin && handleItemClick(assembly, 'assembly', productId || findProductIdForItem(assembly.id))}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex-shrink-0 w-5 flex justify-center">
              {hasChildren ? (
                <Button type="text" size="small" icon={isExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
                  onClick={(e) => { e.stopPropagation(); if (!isInRecycleBin) toggleExpand(getExpandKey('assembly', assembly.id)); }}
                  className="w-5 h-5 flex items-center justify-center p-0 text-slate-500 hover:bg-slate-200 rounded"
                  disabled={isInRecycleBin}
                />
              ) : <div className="w-5" />}
            </div>
            <span className="flex-shrink-0 text-sm">{getTypeIcon('assembly', level)}</span>
            <Tooltip title={`${assembly.assembly_name} (${assemblyNumDisplay})`}>
              <div className="flex flex-col min-w-0">
                <Text className={`text-sm font-medium truncate ${
                  isInRecycleBin
                    ? 'text-gray-400'
                    : isSelected
                    ? 'text-indigo-800'
                    : 'text-slate-700'
                }`}>
                  {assembly.assembly_name}
                </Text>
                <Text className={`text-[10px] truncate ${
                  isInRecycleBin
                    ? 'text-gray-400'
                    : 'text-slate-400'
                }`}>
                  {assemblyNumDisplay}
                </Text>
              </div>
            </Tooltip>
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

  // ── Product row ───────────────────────────────────────────────────────────
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
    ].sort((a, b) => (a.id || 0) - (b.id || 0));
    
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
            {/* ── Highlighted product name ── */}
            <Text className={`text-sm font-semibold truncate ${isSelected ? 'text-indigo-800' : 'text-slate-800'}`}>
              {searchTerm ? highlightText(product.product_name, searchTerm) : product.product_name}
            </Text>
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

  const flattenBOMItemsForSearch = () => {
    const allItems = [];
    // Track seen keys to prevent duplicates: "part-<id>" or "assembly-<id>"
    const seen = new Set();

    const pushUnique = (item) => {
      const key = `${item.itemType}-${item.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      allItems.push(item);
    };

    products.forEach(product => {
      const productHierarchy = hierarchicalData[product.id];
      if (!productHierarchy) return;

      // Direct parts (not under any assembly)
      (productHierarchy.parts || []).forEach(part => {
        const rev = getLatestRevision(part.documents);
        const partNumDisplay = rev ? `${part.part_number} (${rev})` : part.part_number;
        pushUnique({
          ...part,
          itemType: 'part',
          productId: product.id,
          productName: product.product_name,
          displayName: `${part.part_name} (${partNumDisplay})`
        });
      });

      // Walk assemblies using the already-embedded parts/child_assemblies
      // instead of calling getPartsForAssembly / getNestedAssemblies globally,
      // which caused the same items to be discovered via multiple paths.
      const processAssembly = (assembly, level = 0) => {
        const revAsm = getLatestRevision(assembly.documents);
        const asmNumDisplay = revAsm ? `${assembly.assembly_number} (${revAsm})` : assembly.assembly_number;
        pushUnique({
          ...assembly,
          itemType: 'assembly',
          level,
          productId: product.id,
          productName: product.product_name,
          displayName: `${assembly.assembly_name} (${asmNumDisplay})`
        });

        // Use parts already on the assembly object (set during transform)
        (assembly.parts || []).forEach(part => {
          const revPart = getLatestRevision(part.documents);
          const partNumDisplay = revPart ? `${part.part_number} (${revPart})` : part.part_number;
          pushUnique({
            ...part,
            itemType: 'part',
            parentAssembly: assembly,
            productId: product.id,
            productName: product.product_name,
            displayName: `${part.part_name} (${partNumDisplay})`
          });
        });

        // Recurse into child_assemblies already embedded on the object
        (assembly.child_assemblies || []).forEach(child => processAssembly(child, level + 1));
      };

      (productHierarchy.assemblies || []).forEach(assembly => processAssembly(assembly, 1));
    });

    return allItems;
  };

  const filteredProducts = products.filter(product =>
    product.product_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredBOMItems = searchTerm ? flattenBOMItemsForSearch().filter(item =>
    item.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.part_number && item.part_number.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (item.assembly_number && item.assembly_number.toLowerCase().includes(searchTerm.toLowerCase()))
  ) : [];

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
                <span className="hidden sm:inline">Bill of Materials</span>
                <span className="sm:hidden">BOM</span>
              </h2>
            </div>

            <div className="flex items-center gap-2 min-w-0">
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
              <AssemblyPartsUploadPanel
                selectedItem={(() => {
                  if (activeItemType === 'product' && activeItemId) {
                    const prod = products.find(p => p.id === activeItemId);
                    return { id: activeItemId, product_id: activeItemId, itemType: 'product', label: prod?.product_name || 'Product' };
                  }
                  if (activeItemType === 'assembly' && activeItemId) {
                    for (const [pid, hd] of Object.entries(hierarchicalData)) {
                      const found = hd.assemblies?.find(a => a.id === activeItemId);
                      if (found) return { id: activeItemId, product_id: Number(pid), itemType: 'assembly', label: found.assembly_name || 'Assembly' };
                    }
                  }
                  if (singleProductId) {
                    const prod = products.find(p => p.id === singleProductId);
                    return { id: singleProductId, product_id: singleProductId, itemType: 'product', label: prod?.product_name || 'Product' };
                  }
                  return null;
                })()}
                onPartsCreated={() => {
                  const pid = activeItemType === 'product' ? activeItemId : (activeItemType === 'assembly' ? null : singleProductId);
                  if (pid) fetchProductHierarchy(pid, true);
                  else if (singleProductId) fetchProductHierarchy(singleProductId, true);
                }}
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!singleProductId && (
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
              placeholder="Search by part/assembly..."
              prefix={<SearchOutlined className="text-slate-400" />}
              value={searchTerm}
              onChange={(e) => {
                const filteredValue = (e.target.value || '').replace(/[^a-zA-Z0-9-_ ]/g, '').slice(0, 30);
                setSearchTerm(filteredValue);
              }}
              maxLength={30}
              allowClear
              className="w-full"
              size="small"
            />
          </div>
          <div className="w-44 sm:w-52 shrink-0">
            <BOMFilters 
              stats={bomStats} 
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

        <div className="flex-1 overflow-y-auto p-2 bom-scroll min-h-0">
          {searchTerm ? (
            filteredBOMItems.length > 0 ? (
              <div>
                {filteredBOMItems.map(item => {
                  if (item.itemType === 'part') return renderPartInTree(item, item.level || 0, item.productId);
                  if (item.itemType === 'assembly') return renderAssemblyTree(item, item.level || 0, item.productId);
                  return null;
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[200px] text-slate-400">
                <Empty description="No matches found" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              </div>
            )
          ) : (
            filteredProducts.length > 0
              ? filteredProducts.map(product => renderProductTree(product))
              : (
                <div className="flex flex-col items-center justify-center min-h-[200px] text-slate-400">
                  <Empty description="No products" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                </div>
              )
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
    </>
  );
};

export default BillOfMaterials;