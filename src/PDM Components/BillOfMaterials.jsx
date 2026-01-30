import React, { useState, useEffect } from "react";
import { Search, ChevronDown, ChevronRight, Plus, Layers, Wrench, Settings, FileText, ClipboardList } from "lucide-react";
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
  const [assemblies, setAssemblies] = useState([]);
  const [parts, setParts] = useState([]);
  const [expandedItems, setExpandedItems] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [hierarchicalData, setHierarchicalData] = useState({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createType, setCreateType] = useState(''); // 'product', 'assembly', or 'part'
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [parentAssembly, setParentAssembly] = useState(null);
  const [selectedPart, setSelectedPart] = useState(null);
  const [showPartActionModal, setShowPartActionModal] = useState(false);
  const [partActionType, setPartActionType] = useState(''); // 'operation', 'document', 'process_plan'

  useEffect(() => {
    fetchProducts();
    fetchAssemblies();
    fetchParts();
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/products/`);
      if (response.ok) {
        const data = await response.json();
        setProducts(data);
      } else {
        console.error('Failed to fetch products:', response.statusText);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAssemblies = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/assemblies/`);
      if (response.ok) {
        const data = await response.json();
        setAssemblies(data);
      } else {
        console.error('Failed to fetch assemblies:', response.statusText);
      }
    } catch (error) {
      console.error('Error fetching assemblies:', error);
    }
  };

  const fetchParts = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/parts/`);
      if (response.ok) {
        const data = await response.json();
        setParts(data);
      } else {
        console.error('Failed to fetch parts:', response.statusText);
      }
    } catch (error) {
      console.error('Error fetching parts:', error);
    }
  };

  const fetchProductHierarchy = async (productId) => {
    if (hierarchicalData[productId]) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/products/${productId}/hierarchical`);
      if (response.ok) {
        const data = await response.json();
        setHierarchicalData(prev => ({
          ...prev,
          [productId]: data
        }));
      }
    } catch (error) {
      console.error("Error fetching product hierarchy:", error);
    }
  };

  const toggleExpand = async (itemId, type) => {
    setExpandedItems(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));

    // If expanding a product, fetch its hierarchical data
    if (type === 'product' && !expandedItems[itemId]) {
      await fetchProductHierarchy(itemId);
    }
  };

  const handleCreateProduct = () => {
    // Directly create product without type selector
    setCreateType('product');
    setSelectedProduct(null);
    setParentAssembly(null);
    setShowCreateModal(true);
  };

  const handleCreateAssembly = (product) => {
    setSelectedProduct(product);
    setParentAssembly(null);
    setCreateType('assembly');
    setShowCreateModal(true);
  };

  const handleCreatePart = (product, assembly = null) => {
    setSelectedProduct(product);
    setParentAssembly(assembly);
    setCreateType('part');
    setShowCreateModal(true);
  };

  const handleCreateSubAssembly = (assembly) => {
    // Create a mock product object with the product_id from the parent assembly
    setSelectedProduct({ id: assembly.product_id });
    setParentAssembly(assembly);
    setCreateType('assembly');
    setShowCreateModal(true);
  };

  const handleCreateOperation = (part) => {
    setSelectedPart(part);
    setPartActionType('operation');
    setShowPartActionModal(true);
  };

  const handleCreateDocument = (part) => {
    setSelectedPart(part);
    setPartActionType('document');
    setShowPartActionModal(true);
  };

  const handleCreateProcessPlan = (part) => {
    setSelectedPart(part);
    setPartActionType('process_plan');
    setShowPartActionModal(true);
  };

  const handleActionCreated = (newItem, type) => {
    // Refresh the relevant data based on what was created
    if (type === 'operation') {
      addToast(`Operation "${newItem.operation_name}" created successfully!`);
    } else if (type === 'document') {
      addToast(`Document "${newItem.document_name}" created successfully!`);
    } else if (type === 'process_plan') {
      addToast('Process Plan created successfully!');
    }
  };

  const handleProductCreated = (newItem, type) => {
    // Refresh the relevant data based on what was created
    if (type === 'product') {
      fetchProducts();
      addToast(`Product "${newItem.product_name}" created successfully!`);
    } else if (type === 'assembly') {
      fetchAssemblies();
      addToast(`Assembly "${newItem.assembly_name}" created successfully!`);
    } else if (type === 'part') {
      fetchParts();
      addToast(`Part "${newItem.part_name}" created successfully!`);
    }
  };

  const handleItemClick = (item, type) => {
    onItemSelected({ ...item, itemType: type });
    if (type === 'product') {
      setSelectedProduct(item);
    }
  };

  const getChildAssemblies = (productId) => {
    return assemblies.filter(assembly => assembly.product_id === productId && !assembly.parent_id);
  };

  const getNestedAssemblies = (parentId) => {
    return assemblies.filter(assembly => assembly.parent_id === parentId);
  };

  const getPartsForAssembly = (assemblyId) => {
    return parts.filter(part => part.assembly_id === assemblyId);
  };

  const getDirectParts = (productId) => {
    return parts.filter(part => part.product_id === productId && !part.assembly_id);
  };

  const renderPartInTree = (part, level = 0) => {
    return (
      <div key={part.id} className="mb-1">
        <div 
          className={cn(
            "flex items-center justify-between p-2 rounded-lg cursor-pointer border-l-2 transition-colors",
            "hover:bg-muted/50 border-transparent hover:border-border"
          )}
          style={{ marginLeft: `${level * 20 + 12}px` }}
          onClick={() => handleItemClick(part, 'part')}
        >
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-muted rounded-full"></div>
            <span className="font-medium text-foreground text-sm">{part.part_number}</span>
            <span className="text-muted-foreground text-sm">{part.part_name}</span>
          </div>
          <div className="flex items-center space-x-1">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={(e) => {
                e.stopPropagation();
                handleCreateOperation(part);
              }}
              title="Create Operation"
            >
              <Settings className="h-3 w-3" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={(e) => {
                e.stopPropagation();
                handleCreateDocument(part);
              }}
              title="Create Document"
            >
              <FileText className="h-3 w-3" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={(e) => {
                e.stopPropagation();
                handleCreateProcessPlan(part);
              }}
              title="Create Process Plan"
            >
              <ClipboardList className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderAssemblyTree = (assembly, level = 0) => {
    const childAssemblies = getNestedAssemblies(assembly.id);
    const assemblyParts = getPartsForAssembly(assembly.id);
    const isExpanded = expandedItems[assembly.id];

    return (
      <div key={assembly.id} className="mb-1">
        <div 
          className={cn(
            "flex items-center justify-between p-3 rounded-lg cursor-pointer border-l-2 transition-colors",
            "hover:bg-blue-50/50 border-transparent hover:border-blue-300 bg-blue-50/30"
          )}
          style={{ marginLeft: `${level * 20 + 12}px` }}
          onClick={() => {
            toggleExpand(assembly.id, 'assembly');
            handleItemClick(assembly, 'assembly');
          }}
        >
          <div className="flex items-center space-x-2">
            {(childAssemblies.length > 0 || assemblyParts.length > 0) && (
              <span className="text-muted-foreground">
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </span>
            )}
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <span className="font-medium text-blue-900">{assembly.assembly_number}</span>
            <span className="text-blue-700">{assembly.assembly_name}</span>
          </div>
          <div className="flex items-center space-x-1">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={(e) => {
                e.stopPropagation();
                handleCreateSubAssembly(assembly);
              }}
              title="Create Sub-Assembly"
            >
              <Layers className="h-3 w-3" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={(e) => {
                e.stopPropagation();
                handleCreatePart(selectedProduct, assembly);
              }}
              title="Create Part"
            >
              <Wrench className="h-3 w-3" />
            </Button>
          </div>
        </div>
        
        {isExpanded && (
          <div className="ml-6 mt-1">
            {/* Render parts in this assembly */}
            {assemblyParts.map(part => renderPartInTree(part, level + 1))}
            
            {/* Render sub-assemblies */}
            {childAssemblies.map(child => renderAssemblyTree(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const renderProductTree = (product) => {
    const childAssemblies = getChildAssemblies(product.id);
    const directParts = getDirectParts(product.id);
    const productHierarchy = hierarchicalData[product.id];
    const isExpanded = expandedItems[product.id];

    return (
      <div key={product.id} className="mb-3">
        <div 
          className={cn(
            "flex items-center justify-between p-3 rounded-lg cursor-pointer border-l-2 transition-colors",
            "hover:bg-muted/50 border-transparent hover:border-border bg-muted/30"
          )}
          onClick={() => {
            toggleExpand(product.id, 'product');
            handleItemClick(product, 'product');
          }}
        >
          <div className="flex items-center space-x-2">
            {(childAssemblies.length > 0 || directParts.length > 0) && (
              <span className="text-muted-foreground">
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </span>
            )}
            <div className="w-3 h-3 bg-muted-foreground rounded-full"></div>
            <span className="font-bold text-foreground">{product.product_number}</span>
            <span className="text-muted-foreground font-medium">{product.product_name}</span>
          </div>
          <div className="flex items-center space-x-1">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={(e) => {
                e.stopPropagation();
                handleCreateAssembly(product);
              }}
              title="Create Assembly"
            >
              <Layers className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={(e) => {
                e.stopPropagation();
                handleCreatePart(product);
              }}
              title="Create Part"
            >
              <Wrench className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {isExpanded && (
          <div className="ml-2 mt-1 pl-4 border-l-2 border-border">
            {/* Show direct parts */}
            {directParts.length > 0 && (
              <div className="mb-2">
                {directParts.map(part => renderPartInTree(part))}
              </div>
            )}
            
            {/* Show assemblies */}
            {childAssemblies.map(assembly => renderAssemblyTree(assembly))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="w-1/3 border-r bg-background">
        <Card className="border-0 rounded-none shadow-none">
          <CardHeader className="pb-4">
            <div className="animate-pulse">
              <div className="h-6 bg-muted rounded mb-4"></div>
              <div className="h-10 bg-muted rounded mb-4"></div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="animate-pulse space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-12 bg-muted rounded"></div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="w-1/3 border-r bg-background">
        <Card className="border-0 rounded-none shadow-none">
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="text-xl">Bill of Materials</CardTitle>
              <Button onClick={handleCreateProduct} className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Create Product
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">Browse and select items to preview details.</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                type="text"
                placeholder="Search in BOM..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardHeader>
          
          <CardContent className="pt-0">
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
              {products.filter(product =>
                product.product_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                product.product_name.toLowerCase().includes(searchTerm.toLowerCase())
              ).map(product => (
                <div key={product.id}>
                  {renderProductTree(product)}
                </div>
              ))}
              
              {products.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No products found
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        
        <CreateProductModal
          show={showCreateModal}
          onHide={() => {
            setShowCreateModal(false);
            setParentAssembly(null);
          }}
          createType={createType}
          selectedProduct={selectedProduct}
          parentAssembly={parentAssembly}
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
