import React, { useState, useEffect, useRef } from "react";
import { Search, ChevronDown, ChevronRight, Plus, Layers, Wrench, Settings, FileText, ClipboardList, Pencil, Trash2, Package, Box, Gauge, HardHat, Cog } from "lucide-react";
import { API_BASE_URL } from "../Config/auth";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { cn } from "../lib/utils";
import CreateProductModal from "./CreateProductModal";
import PartActionModal from "./PartActionModal";
import { useToast } from "../components/ui/toast";

const BillOfMaterials = ({ onItemSelected }) => {
  const { addToast, ToastContainer } = useToast();
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
    addToast(messages[type]);
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
    addToast(messages[type]);
  };

  const handleDelete = async (item, type) => {
    const endpoints = { product: `/products/${item.id}`, assembly: `/assemblies/${item.id}`, part: `/parts/${item.id}` };
    const names = { product: item.product_name, assembly: item.assembly_name, part: item.part_name };
    if (!window.confirm(`Delete ${type} "${names[type]}"? This cannot be undone.`)) return;
    try {
      const response = await fetch(`${API_BASE_URL}${endpoints[type]}`, { method: 'DELETE' });
      if (response.ok) {
        addToast(`${type.charAt(0).toUpperCase() + type.slice(1)} "${names[type]}" deleted successfully.`);
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
        addToast(`Failed to delete ${type} "${names[type]}".`);
      }
    } catch (error) {
      console.error(`Error deleting ${type}:`, error);
      addToast(`Error deleting ${type} "${names[type]}".`);
    }
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
        { icon: Settings, onClick: () => openPartActionModal(item, 'operation') },
        { icon: FileText, onClick: () => openPartActionModal(item, 'document') },
        { icon: ClipboardList, onClick: () => openPartActionModal(item, 'process_plan') },
        { icon: Pencil, onClick: () => handleEditPart(item) },
        { icon: Trash2, onClick: () => handleDelete(item, 'part'), className: "text-red-500" }
      ],
      assembly: [
        { icon: Layers, onClick: () => handleCreateSubAssembly(item) },
        { icon: Wrench, onClick: () => handleCreatePart(selectedProduct, item) },
        { icon: Pencil, onClick: () => handleEditAssembly(item) },
        { icon: Trash2, onClick: () => handleDelete(item, 'assembly'), className: "text-red-500" }
      ],
      product: [
        { icon: Layers, onClick: () => handleCreateAssembly(item) },
        { icon: Wrench, onClick: () => handleCreatePart(item) },
        { icon: Pencil, onClick: () => handleEditProduct(item) },
        { icon: Trash2, onClick: () => handleDelete(item, 'product'), className: "text-red-500" }
      ]
    };
    return (
      <div className="flex gap-1">
        {buttons[type].map(({ icon: Icon, onClick, className }, idx) => (
          <Button key={idx} variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onClick(); }} className="h-6 w-6 p-0">
            <Icon className={cn("h-3.5 w-3.5", className)} />
          </Button>
        ))}
      </div>
    );
  };

  const renderPartInTree = (part, level = 0) => (
    <div 
      key={part.id} 
      className="flex items-center justify-between py-2 px-2 hover:bg-muted cursor-pointer border-b" 
      style={{ paddingLeft: `${level * 16 + 12}px` }} 
      onClick={() => handleItemClick(part, 'part')}
    > 
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Cog className="h-4 w-4 text-amber-600 shrink-0" />
        <span className="text-sm font-medium truncate flex-1">{part.part_name}</span>
        {part.type_name && (
          <span className={cn('text-xs px-2 py-0.5 rounded font-semibold', part.type_name.toLowerCase() === 'make' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700')}> 
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
          className="flex items-center justify-between py-2 px-2 hover:bg-muted cursor-pointer border-b" 
          style={{ paddingLeft: `${level * 16 + 12}px` }} 
          onClick={() => { toggleExpand(assembly.id); handleItemClick(assembly, 'assembly'); }}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {hasChildren && (
                isExpanded ? 
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : 
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              {isSubAssembly ? (
                <Layers className="h-4 w-4 text-green-600 shrink-0" />
              ) : (
                <Package className="h-4 w-4 text-blue-600 shrink-0" />
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
          className="flex items-center justify-between py-2 px-2 hover:bg-muted cursor-pointer border-b bg-slate-50" 
          onClick={() => { toggleExpand(product.id); handleItemClick(product, 'product'); }}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {hasChildren && (
                isExpanded ? 
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : 
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <Package className="h-4 w-4 text-purple-600 shrink-0" />
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
      <div className="w-1/3 border-r">
        <Card className="border-0 rounded-none shadow-none">
          <CardHeader className="pb-2">
            <div className="animate-pulse space-y-2">
              <div className="h-4 bg-muted rounded w-3/4"></div>
              <div className="h-8 bg-muted rounded"></div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="animate-pulse space-y-1">
              {[1, 2, 3].map(i => <div key={i} className="h-8 bg-muted rounded"></div>)}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="w-1/3 border-r">
        <Card className="border-0 rounded-none shadow-none">
          <CardHeader className="pb-2">
            <div className="flex justify-between items-center mb-2">
              <CardTitle className="text-lg font-medium">Bill of Materials</CardTitle>
              <Button onClick={handleCreateProduct} size="sm" className="h-7 text-xs">
                <Plus className="h-3 w-3 mr-1" />
                Product
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mb-2">Browse and select items to preview details</p>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground h-3.5 w-3.5" />
              <Input type="text" placeholder="Search in BOM..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-7 h-8 text-base" />
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
              {filteredProducts.length > 0 ? filteredProducts.map(product => renderProductTree(product)) : (
                <div className="text-center py-8 text-base text-muted-foreground">
                  {searchTerm ? 'No products match your search' : 'No products found'}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        
        <CreateProductModal
          show={showCreateModal}
          onHide={() => { setShowCreateModal(false); setParentAssembly(null); setEditingItem(null); setEditMode(false); }}
          createType={createType}
          selectedProduct={selectedProduct}
          parentAssembly={parentAssembly}
          mode={editMode ? 'edit' : 'create'}
          editingItem={editingItem}
          onProductCreated={handleProductCreated}
        />
        
        <PartActionModal
          show={showPartActionModal}
          onHide={() => setShowPartActionModal(false)}
          actionType={partActionType}
          selectedPart={selectedPart}
          onActionCreated={handleActionCreated}
        />
      </div>
      <ToastContainer />
    </>
  );
};

export default BillOfMaterials;