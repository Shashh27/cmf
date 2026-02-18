import React, { useState, useEffect, useRef } from "react";
import { SearchOutlined, PlusOutlined, PartitionOutlined, ToolOutlined, FileTextOutlined, EditOutlined, DeleteOutlined, DeploymentUnitOutlined, ClusterOutlined, AppstoreOutlined, CaretDownOutlined, CaretRightOutlined } from "@ant-design/icons";
import { API_BASE_URL } from "../Config/auth";
import { Input, Button, message, Modal, Tooltip, Empty, Spin, Tag, Typography } from "antd";

const { Text } = Typography;
import CreateProductModal from "./CreateProductModal";
import PartActionModal from "./PartActionModal";

const BillOfMaterials = ({ onItemSelected }) => {
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
  const hasFetchedData = useRef(false);

  const getTypeIcon = (type) => {
    const icons = {
      product: <DeploymentUnitOutlined className="text-purple-600" />,
      assembly: <ClusterOutlined className="text-blue-500" />,
      part: <FileTextOutlined className="text-green-500" />,
      make: <ToolOutlined className="text-orange-500" />
    };
    return icons[type?.toLowerCase()] || <FileTextOutlined className="text-gray-500" />;
  };

  const getTypeColor = (type) => {
    const colors = {
      product: 'purple',
      assembly: 'blue',
      part: 'green',
      make: 'green'
    };
    return colors[type?.toLowerCase()] || 'default';
  };

  useEffect(() => {
    if (!hasFetchedData.current) {
      hasFetchedData.current = true;
      fetchProducts().finally(() => setLoading(false));
    }
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/products/`);
      if (response.ok) setProducts(await response.json());
    } catch (error) {
      console.error('Error fetching products:', error);
      message.error('Failed to fetch products');
    }
  };

  const fetchProductHierarchy = async (productId, forceRefresh = false) => {
    if (!forceRefresh && hierarchicalData[productId]) return hierarchicalData[productId];
    
    try {
      const response = await fetch(`${API_BASE_URL}/products/${productId}/hierarchical`);
      if (response.ok) {
        const data = await response.json();
        const transformedData = {
          ...data,
          parts: data.direct_parts?.map(item => item.part) || [],
          assemblies: data.assemblies?.map(assembly => ({
            ...assembly.assembly,
            parts: assembly.parts?.map(part => part.part) || [],
            child_assemblies: transformSubassemblies(assembly.subassemblies || [])
          })) || []
        };
        setHierarchicalData(prev => ({ ...prev, [productId]: transformedData }));
        return transformedData;
      }
    } catch (error) {
      console.error("Error fetching product hierarchy:", error);
      message.error("Error fetching product hierarchy");
    }
  };

  const transformSubassemblies = (subassemblies) => {
    return subassemblies.map(sub => ({
      ...sub.assembly,
      parts: sub.parts?.map(part => part.part) || [],
      child_assemblies: transformSubassemblies(sub.subassemblies || [])
    }));
  };

  const toggleExpand = (itemId) => {
    setExpandedItems(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const handleExpandProduct = async (product) => {
    if (!hierarchicalData[product.id]) {
      await fetchProductHierarchy(product.id);
    }
    toggleExpand(product.id);
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
  const handleCreateAssembly = (product) => openModal('assembly', product);
  const handleCreatePart = async (product, assembly = null) => {
    if (!hierarchicalData[product.id]) await fetchProductHierarchy(product.id);
    openModal('part', product, assembly);
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
    await fetchProducts();
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
        [newItem.product_id]: true,
        ...(newItem.assembly_id && { [newItem.assembly_id]: true })
      }));
    }
    message.success(messages[type]);
  };

  const handleDelete = async (item, type) => {
    const endpoints = { product: `/products/${item.id}`, assembly: `/assemblies/${item.id}`, part: `/parts/${item.id}` };
    const names = { product: item.product_name, assembly: item.assembly_name, part: item.part_name };
    
    Modal.confirm({
      title: `Delete ${type}`,
      content: `Are you sure you want to delete ${type} "${names[type]}"? This cannot be undone.`,
      okText: 'Yes',
      okType: 'danger',
      cancelText: 'No',
      onOk: async () => {
        try {
          const response = await fetch(`${API_BASE_URL}${endpoints[type]}`, { method: 'DELETE' });
          if (response.ok) {
            message.success(`${type.charAt(0).toUpperCase() + type.slice(1)} "${names[type]}" deleted successfully.`);
            if (type === 'product') {
              await fetchProducts();
              setHierarchicalData(prev => {
                const newData = { ...prev };
                delete newData[item.id];
                return newData;
              });
            } else if (item.product_id) {
              await fetchProductHierarchy(item.product_id, true);
              setExpandedItems(prev => ({
                ...prev,
                [item.product_id]: true,
                ...(item.assembly_id && type === 'part' && { [item.assembly_id]: true })
              }));
            }
          } else {
            message.error(`Failed to delete ${type} "${names[type]}".`);
          }
        } catch (error) {
          console.error(`Error deleting ${type}:`, error);
          message.error(`Error deleting ${type} "${names[type]}".`);
        }
      }
    });
  };

  const handleItemClick = async (item, type, productId) => {
    setActiveItemId(item.id);
    
    // For products, ensure hierarchy is fetched before expanding
    if (type === 'product') {
        if (!hierarchicalData[item.id]) {
            await fetchProductHierarchy(item.id);
        }
    }
    
    toggleExpand(item.id); // Expand the tree node
    
    // Ensure item has type property for downstream consumers
    const itemWithMeta = { ...item, itemType: type, productId };
    if (onItemSelected) {
      onItemSelected(itemWithMeta);
    }
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

  const ActionButtons = ({ item, type }) => {
    const buttons = {
      part: [
        { icon: EditOutlined, onClick: () => handleEditPart(item), title: "Edit" },
        { icon: DeleteOutlined, onClick: () => handleDelete(item, 'part'), danger: true, title: "Delete" }
      ],
      assembly: [
        { icon: PartitionOutlined, onClick: () => handleCreateSubAssembly(item), title: "Add Sub-Assembly" },
        { icon: ToolOutlined, onClick: () => handleCreatePart(selectedProduct, item), title: "Add Part" },
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
      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
        {buttons[type].map(({ icon: Icon, onClick, danger, title }, idx) => (
          <Tooltip key={idx} title={title}>
            <Button 
              type="text" 
              size="small" 
              danger={danger}
              onClick={(e) => { e.stopPropagation(); onClick(); }} 
              icon={<Icon style={{ fontSize: '14px' }} />}
              style={{ padding: 4, minWidth: 24, height: 24 }}
            />
          </Tooltip>
        ))}
      </div>
    );
  };

  const renderPartInTree = (part, level = 0) => {
    const isSelected = activeItemId === part.id;
    return (
      <div
        key={part.id}
        className={`flex items-center justify-between px-2 py-1 rounded-md cursor-pointer transition-colors mb-0.5 border-l-2 ${isSelected ? 'bg-indigo-50 border-indigo-500 text-indigo-800' : 'hover:bg-slate-100 border-transparent'}`}
        style={{ marginLeft: `${level * 14}px` }}
        onClick={() => handleItemClick(part, 'part')}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="w-5 flex justify-center text-sm">{getTypeIcon(part.type_name || 'part')}</span>
          <Text className={`text-xs font-medium truncate ${isSelected ? 'text-indigo-800' : 'text-slate-700'}`}>{part.part_name}</Text>
        </div>
        <ActionButtons item={part} type="part" />
      </div>
    );
  };

  const renderAssemblyTree = (assembly, level = 0) => {
    const childAssemblies = getNestedAssemblies(assembly.id);
    const assemblyParts = getPartsForAssembly(assembly.id);
    const isExpanded = expandedItems[assembly.id];
    const hasChildren = childAssemblies.length > 0 || assemblyParts.length > 0;
    const isSelected = activeItemId === assembly.id;

    return (
      <div key={assembly.id} className="select-none">
        <div
          className={`flex items-center justify-between px-2 py-1 rounded-md cursor-pointer transition-colors mb-0.5 border-l-2 ${isSelected ? 'bg-indigo-50 border-indigo-500 text-indigo-800' : 'hover:bg-slate-100 border-transparent'}`}
          style={{ marginLeft: `${level * 14}px` }}
          onClick={() => handleItemClick(assembly, 'assembly')}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex-shrink-0 w-5 flex justify-center">
              {hasChildren ? (
                <Button type="text" size="small" icon={isExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
                  onClick={(e) => { e.stopPropagation(); toggleExpand(assembly.id); }}
                  className="w-5 h-5 flex items-center justify-center p-0 text-slate-500 hover:bg-slate-200 rounded" />
              ) : <div className="w-5" />}
            </div>
            <span className="flex-shrink-0 text-sm">{getTypeIcon('assembly')}</span>
            <Text className={`text-xs font-medium truncate flex-1 min-w-0 ${isSelected ? 'text-indigo-800' : 'text-slate-700'}`}>{assembly.assembly_name}</Text>
          </div>
          <ActionButtons item={assembly} type="assembly" />
        </div>
        {isExpanded && hasChildren && (
          <div className="mt-0.5">{assemblyParts.map(part => renderPartInTree(part, level + 1))}{childAssemblies.map(child => renderAssemblyTree(child, level + 1))}</div>
        )}
      </div>
    );
  };

  const renderProductTree = (product) => {
    const productHierarchy = hierarchicalData[product.id];
    const hasData = !!productHierarchy;
    const childAssemblies = productHierarchy?.assemblies || [];
    const directParts = productHierarchy?.parts || [];
    const isExpanded = expandedItems[product.id];
    const hasChildren = childAssemblies.length > 0 || directParts.length > 0;
    const showArrow = !hasData || hasChildren;
    const isSelected = activeItemId === product.id;

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
            <Text className={`text-xs font-semibold truncate flex-1 min-w-0 ${isSelected ? 'text-indigo-800' : 'text-slate-800'}`}>{product.product_name}</Text>
          </div>
          <ActionButtons item={product} type="product" />
        </div>
        {isExpanded && hasChildren && (
          <div className="mt-0.5 ml-2 border-l border-slate-200 pl-1">
            {directParts.map(part => renderPartInTree(part, 1))}
            {childAssemblies.map(assembly => renderAssemblyTree(assembly, 1))}
          </div>
        )}
      </div>
    );
  };

  const filteredProducts = products.filter(product =>
    product.product_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.product_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
        <div className="p-3 border-b border-slate-200 bg-white shrink-0">
          <div className="flex justify-between items-center gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-indigo-100 rounded-lg">
                <AppstoreOutlined className="text-indigo-600 text-base" />
              </div>
              <h2 className="text-sm font-semibold text-slate-800 m-0">Bill of Materials</h2>
            </div>
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleCreateProduct} className="bom-primary-btn">
              New Product
            </Button>
          </div>
          <Input prefix={<SearchOutlined className="text-slate-400" />} placeholder="Search products..." value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)} className="rounded-md text-sm border-slate-200" allowClear />
        </div>
        <div className="flex-1 overflow-y-auto p-2 bom-scroll min-h-0">
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
    </>
  );
};

export default BillOfMaterials;
