import React, { useState, useEffect, useRef, useMemo } from "react";
import { SearchOutlined, PlusOutlined, PartitionOutlined, ToolOutlined, FileTextOutlined, EditOutlined, DeleteOutlined, DeploymentUnitOutlined, ClusterOutlined, AppstoreOutlined, CaretDownOutlined, CaretRightOutlined, CodepenOutlined, BlockOutlined, CodeSandboxOutlined, DownloadOutlined, MoreOutlined, UndoOutlined } from "@ant-design/icons";
import { Input, Button, App, Tooltip, Empty, Spin, Tag, Typography, Dropdown } from "antd";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { api } from '../../api/client.js';

const { Text } = Typography;
import CreateProductModal from "./CreateProductModal";
import PartActionModal from "./PartActionModal";
import MovePartModal from "./MovePartModal";
import {
  DraggablePartRow,
  DroppableParentRow,
  parseDragId,
  productDropId,
  assemblyDropId,
  getLocationLabel,
  findAssemblyInTree,
  bomCollisionDetection,
  dragOverlayOffset,
} from "./bomMoveDnd";
import ProductBOMPdfDownload from "../../DownloadReports/ProductBOMPdfDownload";
import AssemblyPartsUploadPanel from "./AssemblyPartsUploadPanel";
import { getLatestRevision } from "./operationUtils";
import BOMFilters from "./BOMFilters";
import { Zap } from "lucide-react";

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
  initialPartId = null,
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
  const [showMovePartModal, setShowMovePartModal] = useState(false);
  const [partToMove, setPartToMove] = useState(null);
  const [moveCurrentLabel, setMoveCurrentLabel] = useState('');
  const [moveUpcomingLabel, setMoveUpcomingLabel] = useState('');
  const [moveTargetAssemblyId, setMoveTargetAssemblyId] = useState(null);
  const [activeDragPart, setActiveDragPart] = useState(null);
  const [activeDropLabel, setActiveDropLabel] = useState('');
  const [activeItemId, setActiveItemId] = useState(null);
  const [activeItemType, setActiveItemType] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const hasFetchedData = useRef(false);
  const singleProductFetched = useRef(false);
  const initialPartApplied = useRef(false);

  const dndSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

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

  const isPartActive = (part) => (part?.schedule_status || '').toLowerCase() === 'active';

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

  // Select + expand a part when navigated from Order Tracking (initialPartId)
  useEffect(() => {
    initialPartApplied.current = false;
  }, [initialPartId]);

  useEffect(() => {
    if (initialPartId == null || initialPartApplied.current) return;
    const productId = singleProductId ?? initialProductId;
    if (productId == null) return;
    const hierarchy = hierarchicalData[productId];
    if (!hierarchy) return;

    const findPartWithPath = (assemblies, pathIds = []) => {
      for (const assembly of assemblies || []) {
        const nextPath = [...pathIds, assembly.id];
        const part = (assembly.parts || []).find((p) => Number(p.id) === Number(initialPartId));
        if (part) return { part, pathIds: nextPath };
        const nested = findPartWithPath(assembly.child_assemblies || [], nextPath);
        if (nested) return nested;
      }
      return null;
    };

    const directPart = (hierarchy.parts || []).find((p) => Number(p.id) === Number(initialPartId));
    const found = directPart
      ? { part: directPart, pathIds: [] }
      : findPartWithPath(hierarchy.assemblies || []);

    if (!found?.part) return;

    initialPartApplied.current = true;
    const expandKeys = { [getExpandKey('product', productId)]: true };
    found.pathIds.forEach((id) => {
      expandKeys[getExpandKey('assembly', id)] = true;
    });
    setExpandedItems((prev) => ({ ...prev, ...expandKeys }));
    setActiveItemId(found.part.id);
    setActiveItemType('part');

    const itemWithMeta = {
      ...found.part,
      itemType: 'part',
      productId,
    };
    if (onItemSelected) onItemSelected(itemWithMeta);

    const scrollToPart = () => {
      const el = document.querySelector(`[data-bom-part-id="${found.part.id}"]`);
      if (el?.scrollIntoView) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    };
    // Wait for expand + paint so the part row exists in the DOM
    setTimeout(scrollToPart, 150);
  }, [initialPartId, singleProductId, initialProductId, hierarchicalData, onItemSelected]);

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

  const fetchProductHierarchyRef = useRef(null);
  const fetchProductHierarchy = async (productId, forceRefresh = false) => {
    if (!forceRefresh && hierarchicalData[productId]) return hierarchicalData[productId];
    try {
      const response = await api.get(`/products/${productId}/hierarchical-lightweight`);
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
  fetchProductHierarchyRef.current = fetchProductHierarchy;

  useEffect(() => {
    const onDocsChanged = (e) => {
      const pid = e.detail?.productId;
      if (pid && fetchProductHierarchyRef.current) {
        fetchProductHierarchyRef.current(pid, true);
      }
    };
    window.addEventListener('pc-bom-docs-changed', onDocsChanged);
    return () => window.removeEventListener('pc-bom-docs-changed', onDocsChanged);
  }, []);

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
        ? `/parts/template/download`
        : `/operations/template/download`;

      const response = await api.get(endpoint, {
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

  const openMoveConfirm = (part, targetAssemblyId, product, assemblies) => {
    const currentLabel = getLocationLabel({
      assemblyId: part.assembly_id || null,
      product,
      assemblies,
    });
    const upcomingLabel = getLocationLabel({
      assemblyId: targetAssemblyId,
      product,
      assemblies,
    });
    setPartToMove(part);
    setMoveCurrentLabel(currentLabel);
    setMoveUpcomingLabel(upcomingLabel);
    setMoveTargetAssemblyId(targetAssemblyId);
    setShowMovePartModal(true);
  };

  const clearMoveState = () => {
    setShowMovePartModal(false);
    setPartToMove(null);
    setMoveCurrentLabel('');
    setMoveUpcomingLabel('');
    setMoveTargetAssemblyId(null);
  };

  const findPartById = (partId) => {
    for (const productId of Object.keys(hierarchicalData)) {
      const data = hierarchicalData[productId];
      const direct = (data.parts || []).find(p => p.id === partId);
      if (direct) return direct;
      const walk = (assemblies) => {
        for (const asm of assemblies || []) {
          const found = (asm.parts || []).find(p => p.id === partId);
          if (found) return found;
          const nested = walk(asm.child_assemblies);
          if (nested) return nested;
        }
        return null;
      };
      const nested = walk(data.assemblies || []);
      if (nested) return nested;
    }
    return null;
  };

  const handleBomDragStart = (event) => {
    const parsed = parseDragId(String(event.active.id));
    if (parsed?.kind === 'part') {
      setActiveDragPart(findPartById(parsed.id));
    }
    setActiveDropLabel('');
  };

  const handleBomDragOver = (event) => {
    const label = event.over?.data?.current?.dropLabel;
    setActiveDropLabel(label || '');
  };

  const handleBomDragEnd = (event) => {
    setActiveDragPart(null);
    setActiveDropLabel('');
    const { active, over } = event;
    if (!over) return;

    const from = parseDragId(String(active.id));
    const to = parseDragId(String(over.id));
    if (!from || from.kind !== 'part' || !to) return;
    if (to.kind !== 'product' && to.kind !== 'assembly') return;

    const part = findPartById(from.id);
    if (!part || part.recycle_bin) return;

    const productId = part.product_id;
    const product =
      hierarchicalData[productId]?.product ||
      products.find(p => p.id === productId);
    const assemblies = hierarchicalData[productId]?.assemblies || [];

    let targetAssemblyId = null;
    if (to.kind === 'assembly') {
      const targetAsm = findAssemblyInTree(assemblies, to.id);
      if (!targetAsm || targetAsm.recycle_bin) {
        message.error('Cannot drop on a recycle-bin assembly.');
        return;
      }
      if (targetAsm.product_id && targetAsm.product_id !== productId) {
        message.error('Cannot move a part to a different product.');
        return;
      }
      targetAssemblyId = to.id;
    } else if (to.kind === 'product') {
      if (to.id !== productId) {
        message.error('Cannot move a part to a different product.');
        return;
      }
      targetAssemblyId = null;
    }

    const currentAssemblyId = part.assembly_id || null;
    if (currentAssemblyId === targetAssemblyId) {
      message.info('Part is already under that parent.');
      return;
    }

    openMoveConfirm(part, targetAssemblyId, product, assemblies);
  };

  const handleBomDragCancel = () => {
    setActiveDragPart(null);
    setActiveDropLabel('');
  };

  const handlePartMoved = async (movedPart) => {
    const productId = movedPart?.product_id || partToMove?.product_id;
    clearMoveState();
    if (!productId) return;
    const refreshed = await fetchProductHierarchy(productId, true);
    const expandKeys = { [getExpandKey('product', productId)]: true };

    if (movedPart?.assembly_id && refreshed?.assemblies) {
      const collectAncestors = (assemblies, targetId, path = []) => {
        for (const asm of assemblies || []) {
          const next = [...path, asm.id];
          if (asm.id === targetId) return next;
          const found = collectAncestors(asm.child_assemblies, targetId, next);
          if (found) return found;
        }
        return null;
      };
      const pathIds = collectAncestors(refreshed.assemblies, movedPart.assembly_id) || [movedPart.assembly_id];
      pathIds.forEach((id) => {
        expandKeys[getExpandKey('assembly', id)] = true;
      });
    }

    setExpandedItems(prev => ({ ...prev, ...expandKeys }));
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
            await api.post(`/recycle-bin/parts/${item.id}/soft-delete`);
          } else if (type === 'assembly') {
            // Use soft delete for assemblies (move to recycle bin)
            await api.post(`/recycle-bin/assemblies/${item.id}/soft-delete`);
          } else {
            // Use permanent delete for products
            await api.delete(`${endpoints[type]}`);
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
    const isInRecycleBin = (type === 'part' || type === 'assembly') && item.recycle_bin === true;

    const getAddMenuItems = () => {
      if (type === 'part' || isInRecycleBin) return [];

      if (type === 'assembly') {
        const isSubAssembly = item.parent_id !== null;
        if (isSubAssembly) {
          return [
            { key: 'add-part', label: 'Add Part', icon: <ToolOutlined />, onClick: () => {
              const product = products.find(p => p.id === item.product_id);
              if (product) handleCreatePart(product, item);
            }},
          ];
        }
        return [
          { key: 'add-sub-assembly', label: 'Add Sub-Assembly', icon: <PartitionOutlined />, onClick: () => handleCreateSubAssembly(item) },
          { key: 'add-part', label: 'Add Part', icon: <ToolOutlined />, onClick: () => {
            const product = products.find(p => p.id === item.product_id);
            if (product) handleCreatePart(product, item);
          }},
        ];
      }

      if (type === 'product') {
        return [
          { key: 'add-assembly', label: 'Add Assembly', icon: <PartitionOutlined />, onClick: () => handleCreateAssembly(item) },
          { key: 'add-part', label: 'Add Part', icon: <ToolOutlined />, onClick: () => handleCreatePart(item) },
        ];
      }

      return [];
    };

    const getActionMenuItems = () => {
      if (type === 'part') {
        return [
          { key: 'edit', label: 'Edit', icon: <EditOutlined />, onClick: () => handleEditPart(item), disabled: isInRecycleBin },
          { key: 'delete', label: 'Delete', icon: <DeleteOutlined />, onClick: () => handleDelete(item, 'part'), disabled: isInRecycleBin, danger: true },
        ];
      }

      if (type === 'assembly') {
        return [
          { key: 'edit', label: 'Edit', icon: <EditOutlined />, onClick: () => handleEditAssembly(item), disabled: isInRecycleBin },
          { key: 'delete', label: 'Delete', icon: <DeleteOutlined />, onClick: () => handleDelete(item, 'assembly'), disabled: isInRecycleBin, danger: true },
        ];
      }

      if (type === 'product') {
        return [
          { key: 'edit', label: 'Edit Product', icon: <EditOutlined />, onClick: () => handleEditProduct(item) },
          { key: 'delete', label: 'Delete', icon: <DeleteOutlined />, onClick: () => handleDelete(item, 'product'), danger: true },
        ];
      }

      return [];
    };

    const addMenuItems = getAddMenuItems();
    const actionMenuItems = getActionMenuItems();
    const showActive = type === 'part' && !isInRecycleBin && isPartActive(item);

    return (
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="flex items-center gap-1 shrink-0">
          {isInRecycleBin ? (
            <Tooltip title="RECYCLE BIN">
              <UndoOutlined style={{ color: '#dc2626', fontSize: 14 }} />
            </Tooltip>
          ) : tagName ? (
            <Tooltip title={tagName.toUpperCase()}>
              <Tag
                color={tagColor}
                style={{
                  fontSize: 9,
                  padding: '0 3px',
                  margin: 0,
                  lineHeight: '14px',
                  whiteSpace: 'nowrap',
                  maxWidth: 64,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {tagName.toUpperCase()}
              </Tag>
            </Tooltip>
          ) : null}
          {showActive && (
            <Tooltip title="Active">
              <Zap size={14} color="#16a34a" fill="#16a34a" strokeWidth={2} style={{ flexShrink: 0 }} />
            </Tooltip>
          )}
        </div>
        <div className="flex items-center shrink-0">
          {type === 'product' && <ProductBOMPdfDownload product={item} bomExport={bomExport} />}
          {(type === 'part' || type === 'assembly') && (() => {
            const raw =
              getLatestRevision(item.documents)
              || item.latest_document_version
              || item.document_version
              || null;
            const revision = raw
              ? (/^\d+$/.test(String(raw).replace(/^v/i, ''))
                  ? String(raw).replace(/^v/i, '').padStart(2, '0')
                  : String(raw).replace(/^v/i, ''))
              : null;
            return (
              <Tooltip title={revision ? `Latest document version: ${revision}` : 'No document version'}>
                <Tag
                  className="m-0 text-[10px] shrink-0"
                  color={revision ? 'blue' : 'default'}
                  style={{ cursor: 'default', maxWidth: 72, overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                  {revision || '—'}
                </Tag>
              </Tooltip>
            );
          })()}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {addMenuItems.length > 0 && (
            <Dropdown
              key={`add-dropdown-${type}-${item.id}`}
              menu={{ items: addMenuItems }}
              trigger={['click']}
              disabled={isInRecycleBin}
            >
              <Button
                type="text"
                size="small"
                icon={<PlusOutlined />}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                style={{ padding: 4, minWidth: 24, height: 24 }}
              />
            </Dropdown>
          )}
          {actionMenuItems.length > 0 && (
            <Dropdown
              key={`action-dropdown-${type}-${item.id}`}
              menu={{ items: actionMenuItems }}
              trigger={['click']}
              disabled={isInRecycleBin}
            >
              <Button
                type="text"
                size="small"
                icon={<MoreOutlined />}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                style={{ padding: 4, minWidth: 24, height: 24 }}
              />
            </Dropdown>
          )}
        </div>
      </div>
    );
  };

  const bomStats = useMemo(() => {
    const targetProducts = singleProductId 
      ? products.filter(p => Number(p.id) === Number(singleProductId))
      : products;
      
    const stats = { total: 0, inhouse: 0, outsource: 0, standard: 0, linked: 0, unlinked: 0, active: 0 };
    
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

        if (isPartActive(p)) stats.active++;
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
      case 'active': return isPartActive(part);
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
    const docRowStatus = part.document_row_status || 'none';

    return (
      <DraggablePartRow
        key={`part-${part.id}`}
        partId={part.id}
        disabled={isInRecycleBin}
        data-bom-part-id={part.id}
        className={`flex items-center justify-between px-2 py-1 rounded-md cursor-pointer transition-colors mb-0.5 border-l-2 ${
          isInRecycleBin
            ? 'bg-gray-100 border-gray-300 text-gray-400 opacity-60'
            : docRowStatus === 'rejected'
            ? 'bg-red-50 border-red-500 text-red-900'
            : docRowStatus === 'accepted'
            ? 'bg-green-50 border-green-500 text-green-900'
            : docRowStatus === 'released'
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
              {/* ── Highlighted part name ── */}
              <Text className={`text-sm font-medium truncate leading-tight ${
                isInRecycleBin
                  ? 'text-gray-400'
                  : docRowStatus === 'rejected'
                  ? 'text-red-900'
                  : docRowStatus === 'accepted'
                  ? 'text-green-900'
                  : docRowStatus === 'released'
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
                    : docRowStatus === 'rejected'
                    ? 'text-red-700'
                    : docRowStatus === 'accepted'
                    ? 'text-green-700'
                    : docRowStatus === 'released'
                    ? 'text-amber-700'
                    : isSelected
                    ? 'text-indigo-500'
                    : 'text-slate-400'
                }`}>
                  {searchTerm ? highlightText(part.part_number, searchTerm) : part.part_number}
                </Text>
              )}
            </div>
        </div>
        <ActionButtons
          item={part}
          type="part"
          tagName={part.type_name || 'part'}
          tagColor={getTypeColor(part.type_name || 'part')}
        />
      </DraggablePartRow>
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

    return (
      <div key={`assembly-${assembly.id}`} className="select-none">
        <DroppableParentRow
          dropId={assemblyDropId(assembly.id)}
          disabled={!!assembly.recycle_bin}
          dropLabel={assembly.assembly_name}
          isOverClassName="ring-2 ring-indigo-400 bg-indigo-50/80"
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
                  onPointerDown={(e) => e.stopPropagation()}
                  className="w-5 h-5 flex items-center justify-center p-0 text-slate-500 hover:bg-slate-200 rounded"
                  disabled={isInRecycleBin}
                />
              ) : <div className="w-5" />}
            </div>
            <span className="flex-shrink-0 text-sm">{getTypeIcon('assembly', level)}</span>
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
        </DroppableParentRow>
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
        <DroppableParentRow
          dropId={productDropId(product.id)}
          dropLabel={product.product_name}
          isOverClassName="ring-2 ring-indigo-400 bg-indigo-50/80"
          className={`flex items-center justify-between px-2 py-1 rounded-md cursor-pointer transition-colors mb-0.5 border-l-2 ${isSelected ? 'bg-indigo-50 border-indigo-500 text-indigo-800' : 'hover:bg-slate-100 border-transparent'}`}
          onClick={() => handleItemClick(product, 'product')}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex-shrink-0 w-5 flex justify-center">
              {showArrow ? (
                <Button type="text" size="small" icon={isExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
                  onClick={(e) => { e.stopPropagation(); handleExpandProduct(product); }}
                  onPointerDown={(e) => e.stopPropagation()}
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
        </DroppableParentRow>
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
      <div
        className="flex flex-col overflow-hidden bg-slate-50/50"
        style={{ height: "100%", minHeight: 0, minWidth: 0, width: "100%", position: "relative" }}
      >
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

        <div
          className="bom-scroll"
          style={{
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            overflowY: "auto",
            overflowX: "hidden",
            padding: 8,
            height: "calc(100vh - 240px)",
            maxHeight: "calc(100vh - 240px)",
          }}
        >
            {activeDragPart && (
              <div className="text-xs text-slate-600 bg-blue-50 border border-blue-200 rounded px-2 py-1 mb-2">
                {activeDropLabel ? (
                  <>Moving <strong>{activeDragPart.part_name}</strong> → drop under <strong>{activeDropLabel}</strong></>
                ) : (
                  <>Dragging <strong>{activeDragPart.part_name}</strong> — hover a Product / Assembly row to drop</>
                )}
              </div>
            )}
            <DndContext
              sensors={dndSensors}
              collisionDetection={bomCollisionDetection}
              onDragStart={handleBomDragStart}
              onDragOver={handleBomDragOver}
              onDragEnd={handleBomDragEnd}
              onDragCancel={handleBomDragCancel}
            >
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
              <DragOverlay dropAnimation={null} modifiers={[dragOverlayOffset]}>
                {activeDragPart ? (
                  <div className="px-2 py-1 max-w-[200px] truncate text-xs font-semibold text-indigo-800 bg-white border border-indigo-500 shadow-lg rounded">
                    {activeDragPart.part_name}
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
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

      <MovePartModal
        open={showMovePartModal}
        part={partToMove}
        currentLabel={moveCurrentLabel}
        upcomingLabel={moveUpcomingLabel}
        targetAssemblyId={moveTargetAssemblyId}
        onCancel={clearMoveState}
        onMoved={handlePartMoved}
      />
    </>
  );
};

export default BillOfMaterials;