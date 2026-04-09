import React, { useState, useEffect, useRef } from "react";
import { SearchOutlined, PlusOutlined, PartitionOutlined, ToolOutlined, FileTextOutlined, EditOutlined, DeleteOutlined, DeploymentUnitOutlined, ClusterOutlined, CaretDownOutlined, CaretRightOutlined, CodepenOutlined, BlockOutlined, CodeSandboxOutlined, EyeOutlined, AppstoreOutlined } from "@ant-design/icons";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth";
import { Input, Button, App, Tooltip, Empty, Spin, Tag, Typography } from "antd";

const { Text } = Typography;
import CreateProductModal from "./CreateProductModal";
import PartActionModal from "./PartActionModal";
import ProductBOMPdfDownload from "../DownloadReports/ProductBOMPdfDownload";
import ProductToolsViewer from "./ProductToolsViewer";

const BillOfMaterials = ({ onItemSelected, onHierarchyLoaded, disableProductCreate = false, initialProductId = null }) => {
  const { message, modal } = App.useApp();
  const [products, setProducts] = useState([]);
  const [expandedItems, setExpandedItems] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [hierarchicalData, setHierarchicalData] = useState({});
  const [originalHierarchicalData, setOriginalHierarchicalData] = useState({});
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

  // If opened with an initial product id (e.g., from OMS), auto-select it (do not auto-expand).
  useEffect(() => {
    const pid = initialProductId != null ? Number(initialProductId) : null;
    if (!pid || loading) return;
    const product = hierarchicalData[pid]?.product || products.find(p => Number(p.id) === pid);
    if (!product) return;
    setActiveItemId(pid);
    if (onItemSelected) {
      onItemSelected({ ...product, itemType: 'product', productId: pid });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProductId, loading, products, hierarchicalData]);

  const flattenBOMForExport = (data) => {
    const assemblies = [];
    const parts = [];
    const operations = [];
    const documents = [];

    const addPartNode = (wrapper, parentAssembly = null) => {
      if (!wrapper) return;
      const part = wrapper.part || wrapper;
      if (!part) return;

      parts.push({
        id: part.id,
        part_number: part.part_number,
        part_name: part.part_name,
        type_name: part.type_name,
        parent_assembly_id: parentAssembly?.id || null,
        parent_assembly_number: parentAssembly?.assembly_number || null,
        parent_assembly_name: parentAssembly?.assembly_name || null,
      });

      (wrapper.operations || []).forEach((op, index) => {
        operations.push({
          id: op.id || `${part.id}-op-${index}`,
          part_id: part.id,
          part_number: part.part_number,
          part_name: part.part_name,
          operation_number: op.operation_number,
          operation_name: op.operation_name,
          setup_time: op.setup_time,
          cycle_time: op.cycle_time,
          work_center_name: op.work_center_name || op.workcenter_name || "",
          workcenter_id: op.workcenter_id || null,
          machine_name: op.machine_name || "",
          machine_id: op.machine_id || null,
          part_type_name: op.part_type_name || "IN-House",
          work_instructions: op.work_instructions || "",
          notes: op.notes || "",
        });
      });

      (wrapper.documents || []).forEach((doc, index) => {
        documents.push({
          id: doc.id || `${part.id}-doc-${index}`,
          part_id: part.id,
          part_number: part.part_number,
          part_name: part.part_name,
          document_type: doc.document_type,
          document_name: doc.document_name,
          document_version: doc.document_version,
        });
      });
    };

    const processAssemblyWrapper = (wrapper, parentAssembly = null) => {
      if (!wrapper) return;
      const assembly = wrapper.assembly || wrapper;

      if (assembly) {
        assemblies.push({
          id: assembly.id,
          assembly_number: assembly.assembly_number,
          assembly_name: assembly.assembly_name,
          parent_assembly_id: parentAssembly?.id || null,
          parent_assembly_number: parentAssembly?.assembly_number || null,
          parent_assembly_name: parentAssembly?.assembly_name || null,
        });
      }

      (wrapper.parts || []).forEach((p) => addPartNode(p, assembly));
      (wrapper.subassemblies || []).forEach((sub) =>
        processAssemblyWrapper(sub, assembly)
      );
    };

    (data.assemblies || []).forEach((asm) => processAssemblyWrapper(asm, null));
    (data.direct_parts || []).forEach((p) => addPartNode(p, null));

    return {
      assemblies,
      parts,
      operations,
      documents,
    };
  };

  const fetchProductHierarchy = async (productId, forceRefresh = false) => {
    if (!forceRefresh && hierarchicalData[productId]) return hierarchicalData[productId];
    
    try {
      const response = await axios.get(`${API_BASE_URL}/products/${productId}/hierarchical`);
      if (response.status >= 200 && response.status < 300) {
        const data = response.data;
        const bomExport = flattenBOMForExport(data);

        // Store original data for tools viewer
        setOriginalHierarchicalData(prev => ({ ...prev, [productId]: data }));

        // Transformed view for this component (used to render tree quickly)
        const transformedData = {
          ...data,
          parts: (data.direct_parts || [])
            .map(item => ({
              ...item.part,
              extracted_data: item.extracted_data || [],
              documents: item.documents || []
            })),
          assemblies: (data.assemblies || [])
            .map(assembly => ({
              ...assembly.assembly,
              parts: (assembly.parts || [])
                .map(part => ({
                  ...part.part,
                  extracted_data: part.extracted_data || [],
                  documents: part.documents || []
                })),
              child_assemblies: transformSubassemblies(assembly.subassemblies || [])
            })),
          bomExport,
        };

        setHierarchicalData(prev => ({ ...prev, [productId]: transformedData }));

        // For external consumers (like ProductSummary) that need full PartDetails
        // including operations, pass the original hierarchy 'data'.
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

  const transformSubassemblies = (subassemblies) => {
    return (subassemblies || [])
      .map(sub => ({
        ...sub.assembly,
        parts: (sub.parts || [])
          .map(part => ({
            ...part.part,
            extracted_data: part.extracted_data || [],
            documents: part.documents || []
          })),
        child_assemblies: transformSubassemblies(sub.subassemblies || [])
      }));
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
    const endpoints = { product: `/products/${item.id}`, assembly: `/assemblies/${item.id}`, part: `/parts/${item.id}` };
    const names = { product: item.product_name, assembly: item.assembly_name, part: item.part_name };
    
    modal.confirm({
      title: `Delete ${type}`,
      content: `Are you sure you want to delete ${type} "${names[type]}"? This cannot be undone.`,
      okText: 'Yes',
      okType: 'danger',
      cancelText: 'No',
      onOk: async () => {
        try {
          await axios.delete(`${API_BASE_URL}${endpoints[type]}`);
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

  const ActionButtons = ({ item, type, tagName, tagColor }) => {
    const productHierarchy = type === 'product' ? hierarchicalData[item.id] : null;
    const bomExport = productHierarchy?.bomExport;
    const buttons = {
      part: [
        { icon: EditOutlined, onClick: () => handleEditPart(item), title: "Edit" },
        { icon: DeleteOutlined, onClick: () => handleDelete(item, 'part'), danger: true, title: "Delete" }
      ],
      assembly: [
        { icon: PartitionOutlined, onClick: () => handleCreateSubAssembly(item), title: "Add Sub-Assembly" },
        { icon: ToolOutlined, onClick: () => {
            const product = products.find(p => p.id === item.product_id);
            if (product) {
              handleCreatePart(product, item);
            }
          }, title: "Add Part" },
        { icon: EditOutlined, onClick: () => handleEditAssembly(item), title: "Edit" },
        { icon: DeleteOutlined, onClick: () => handleDelete(item, 'assembly'), danger: true, title: "Delete" }
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
          {type === 'part' ? (
            <>
              {buttons.part.map(({ icon: Icon, onClick, danger, title, color }, idx) => (
                <Tooltip key={idx} title={title}>
                  <Button 
                    type="text" 
                    size="small" 
                    danger={danger}
                    onClick={(e) => { e.stopPropagation(); onClick(); }} 
                    icon={<Icon style={{ fontSize: '14px', color: color || undefined }} />}
                    style={{ padding: 4, minWidth: 24, height: 24 }}
                  />
                </Tooltip>
              ))}
              {getRawMaterialStatusTag(item.raw_material_status)}
            </>
          ) : (
          buttons[type].map(({ icon: Icon, onClick, danger, title, color }, idx) => (
            <Tooltip key={idx} title={title}>
              <Button 
                type="text" 
                size="small" 
                danger={danger}
                onClick={(e) => { e.stopPropagation(); onClick(); }} 
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

  const getRawMaterialStatusTag = (status) => {
    const s = (status || "N/A").toString().toLowerCase();
    if (s === "available") return <Tag className="m-0 text-[10px] shrink-0" color="success">Available</Tag>;
    if (s === "not available") return <Tag className="m-0 text-[10px] shrink-0" color="error">Not Available</Tag>;
    return <Tag className="m-0 text-[10px] shrink-0">N/A</Tag>;
  };

  const renderPartInTree = (part, level = 0, productId = null) => {
    const isSelected = activeItemId === part.id && activeItemType === 'part';
    return (
      <div
        key={`part-${part.id}`}
        className={`flex items-center justify-between px-2 py-1 rounded-md cursor-pointer transition-colors mb-0.5 border-l-2 ${isSelected ? 'bg-indigo-50 border-indigo-500 text-indigo-800' : 'hover:bg-slate-100 border-transparent'}`}
        style={{ marginLeft: `${level * 14}px` }}
        onClick={() => handleItemClick(part, 'part', productId || findProductIdForItem(part.id))}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="w-5 flex justify-center text-sm">{getTypeIcon(part.type_name || 'part')}</span>
          <Text className={`text-sm font-medium truncate ${isSelected ? 'text-indigo-800' : 'text-slate-700'}`}>{part.part_name}</Text>
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
            <Text className={`text-sm font-medium truncate ${isSelected ? 'text-indigo-800' : 'text-slate-700'}`}>{assembly.assembly_name}</Text>
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
    const combinedChildren = [
      ...directParts.map(p => ({ ...p, __childType: 'part' })),
      ...childAssemblies.map(a => ({ ...a, __childType: 'assembly' }))
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

  const filteredProductsBase = products.filter(product =>
    (product.product_name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

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
              {filteredProducts.length === 1 && (
                <Button
                  type="default"
                  size="small"
                  icon={<ToolOutlined />}
                  onClick={() => handleViewAllTools(filteredProducts[0])}
                  className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 hover:text-blue-800 hover:border-blue-300 text-xs font-medium px-3 py-1 rounded-md shadow-sm"
                >
                  View Tools
                </Button>
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
          {!initialPid && (
            <Input 
              prefix={<SearchOutlined className="text-slate-400" />} 
              placeholder="Search products..." 
              value={searchTerm}
              onChange={(e) => {
                const filteredValue = (e.target.value || '').replace(/[^a-zA-Z0-9-_ ]/g, '').slice(0, 30);
                setSearchTerm(filteredValue);
              }} 
              maxLength={30}
              className="rounded-md text-sm border-slate-200" 
              allowClear 
            />
          )}
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 bom-scroll min-h-0">
          {filteredProducts.length > 0 ? filteredProducts.map(product => renderProductTree(product)) : (
            <div className="flex flex-col items-center justify-center min-h-[200px] text-slate-400">
              <Empty description={searchTerm ? 'No matches' : 'No products'} image={Empty.PRESENTED_IMAGE_SIMPLE} />
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
        hierarchicalData={selectedProductForTools ? originalHierarchicalData[selectedProductForTools.id] : null}
      />
    </>
  );
};

export default BillOfMaterials;
