import React, { useState, useEffect, useRef } from "react";
import { 
  SearchOutlined, 
  DownOutlined, 
  RightOutlined, 
  PlusOutlined, 
  PartitionOutlined, 
  ToolOutlined, 
  SettingOutlined, 
  FileTextOutlined, 
  ProfileOutlined, 
  EditOutlined, 
  DeleteOutlined, 
  CodeSandboxOutlined, 
  SafetyCertificateOutlined,
  DashboardOutlined,
  InboxOutlined,
  ControlOutlined
} from "@ant-design/icons";
import { API_BASE_URL } from "../Config/auth";
import { Input, Button, Card, message, Modal, Tooltip, Empty, Spin } from "antd";
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
  const hasFetchedData = useRef(false);

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
      document: `Document "${newItem.document_name}" created successfully!`,
      process_plan: 'Process Plan created successfully!'
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

  const handleItemClick = async (item, type) => {
    onItemSelected({ ...item, itemType: type });
    if (type === 'product') {
      setSelectedProduct(item);
      if (!hierarchicalData[item.id]) await fetchProductHierarchy(item.id);
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
        { icon: SettingOutlined, onClick: () => openPartActionModal(item, 'operation'), title: "Operations" },
        { icon: FileTextOutlined, onClick: () => openPartActionModal(item, 'document'), title: "Documents" },
        { icon: ProfileOutlined, onClick: () => openPartActionModal(item, 'process_plan'), title: "Process Plan" },
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

  const renderPartInTree = (part, level = 0) => (
    <div 
      key={part.id} 
      className="flex items-center justify-between py-2 px-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100" 
      style={{ paddingLeft: `${level * 16 + 12}px` }} 
      onClick={() => handleItemClick(part, 'part')}
    > 
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <SettingOutlined className="h-4 w-4 text-amber-600 shrink-0" />
        <span className="text-sm font-medium truncate flex-1">{part.part_name}</span>
        {part.type_name && (
          <span className={`text-xs px-2 py-0.5 rounded font-semibold ${part.type_name.toLowerCase() === 'make' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}> 
            {part.type_name.toUpperCase()}
          </span>
        )}
      </div>
      <ActionButtons item={part} type="part" />
    </div>
  );

  const renderAssemblyTree = (assembly, level = 0) => {
    const childAssemblies = getNestedAssemblies(assembly.id);
    const assemblyParts = getPartsForAssembly(assembly.id);
    const isExpanded = expandedItems[assembly.id];
    const hasChildren = childAssemblies.length > 0 || assemblyParts.length > 0;
    const isSubAssembly = !!assembly.parent_id;

    return (
      <div key={assembly.id}>
        <div 
          className="flex items-center justify-between py-2 px-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100" 
          style={{ paddingLeft: `${level * 16 + 12}px` }} 
          onClick={() => { toggleExpand(assembly.id); handleItemClick(assembly, 'assembly'); }}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {hasChildren && (
                isExpanded ? 
                  <DownOutlined className="h-4 w-4 text-gray-400 shrink-0" /> : 
                  <RightOutlined className="h-4 w-4 text-gray-400 shrink-0" />
              )}
              {isSubAssembly ? (
                <PartitionOutlined className="h-4 w-4 text-green-600 shrink-0" />
              ) : (
                <CodeSandboxOutlined className="h-4 w-4 text-blue-600 shrink-0" />
              )}
            </div>
            <span className="text-sm font-medium truncate flex-1">{assembly.assembly_name}</span>
          </div>
          <ActionButtons item={assembly} type="assembly" />
        </div>
        {isExpanded && hasChildren && (
          <div>
            {assemblyParts.map(part => renderPartInTree(part, level + 1))}
            {childAssemblies.map(child => renderAssemblyTree(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const renderProductTree = (product) => {
    const productHierarchy = hierarchicalData[product.id];
    const childAssemblies = productHierarchy?.assemblies || [];
    const directParts = productHierarchy?.parts || [];
    const isExpanded = expandedItems[product.id];
    const hasChildren = childAssemblies.length > 0 || directParts.length > 0;

    return (
      <div key={product.id} className="mb-2">
        <div 
          className="flex items-center justify-between py-2 px-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 bg-gray-50" 
          onClick={() => { toggleExpand(product.id); handleItemClick(product, 'product'); }}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {hasChildren && (
                isExpanded ? 
                  <DownOutlined className="h-4 w-4 text-gray-400 shrink-0" /> : 
                  <RightOutlined className="h-4 w-4 text-gray-400 shrink-0" />
              )}
              <CodeSandboxOutlined className="h-4 w-4 text-purple-600 shrink-0" />
            </div>
            <span className="text-sm font-semibold truncate flex-1">{product.product_name}</span>
          </div>
          <ActionButtons item={product} type="product" />
        </div>
        {isExpanded && hasChildren && (
          <div>
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
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ padding: 16, borderBottom: '1px solid #f0f0f0', background: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>Bill of Materials</h2>
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleCreateProduct}>
            Product
          </Button>
        </div>
        <p style={{ fontSize: 14, color: '#888', marginBottom: 12 }}>Browse and select items to preview details</p>
        <Input 
          prefix={<SearchOutlined style={{ color: '#ccc' }} />} 
          placeholder="Search in BOM..." 
          value={searchTerm} 
          onChange={(e) => setSearchTerm(e.target.value)} 
        />
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredProducts.length > 0 ? filteredProducts.map(product => renderProductTree(product)) : (
            <Empty description={searchTerm ? 'No products match your search' : 'No products found'} style={{ marginTop: 40 }} />
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
