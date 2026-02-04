import React, { useState, useEffect, useRef } from "react";
import { Search, ChevronDown, ChevronRight, Plus, Layers, Wrench, Settings, FileText, ClipboardList, Pencil, Trash2, Package, Box } from "lucide-react";
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
  const [createType, setCreateType] = useState(''); // 'product', 'assembly', or 'part'
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [parentAssembly, setParentAssembly] = useState(null);
  const [editMode, setEditMode] = useState(false); // false = create, true = edit
  const [editingItem, setEditingItem] = useState(null); // currently edited product/assembly/part
  const [selectedPart, setSelectedPart] = useState(null);
  const [showPartActionModal, setShowPartActionModal] = useState(false);
  const [partActionType, setPartActionType] = useState(''); // 'operation', 'document', 'process_plan'
  const hasFetchedData = useRef(false);

  useEffect(() => {
    if (hasFetchedData.current) return;
    
    const fetchData = async () => {
      hasFetchedData.current = true;
      setLoading(true);
      try {
        await fetchProducts();
      } catch (error) {
        console.error('Error fetching BOM data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
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
    }
  };

  const fetchProductHierarchy = async (productId, forceRefresh = false) => {
    // Only use cached data if not forcing refresh
    if (!forceRefresh && hierarchicalData[productId]) {
      return hierarchicalData[productId];
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/products/${productId}/hierarchical`);
      if (response.ok) {
        const data = await response.json();
        
        // Transform the data to match our component's expected structure
        const transformedData = {
          ...data,
          parts: data.direct_parts?.map(item => item.part) || [],
          assemblies: data.assemblies?.map(assembly => ({
            ...assembly.assembly,
            parts: assembly.parts?.map(part => part.part) || [],
            child_assemblies: transformSubassemblies(assembly.subassemblies || [])
          })) || []
        };
        
        setHierarchicalData(prev => ({
          ...prev,
          [productId]: transformedData
        }));
        
        return transformedData;
      }
    } catch (error) {
      console.error("Error fetching product hierarchy:", error);
    }
  };

  const toggleExpand = (itemId, type) => {
    setExpandedItems(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  const handleCreateProduct = () => {
    // Directly create product without type selector
    setCreateType('product');
    setSelectedProduct(null);
    setParentAssembly(null);
    setEditMode(false);
    setEditingItem(null);
    setShowCreateModal(true);
  };

  const handleCreateAssembly = (product) => {
    setSelectedProduct(product);
    setParentAssembly(null);
    setCreateType('assembly');
    setEditMode(false);
    setEditingItem(null);
    setShowCreateModal(true);
  };

  const handleCreatePart = async (product, assembly = null) => {
    setSelectedProduct(product);
    setParentAssembly(assembly);
    setCreateType('part');
    setEditMode(false);
    setEditingItem(null);
    
    // Make sure we have the hierarchical data before showing the modal
    if (!hierarchicalData[product.id]) {
      await fetchProductHierarchy(product.id);
    }
    
    setShowCreateModal(true);
  };

  const handleCreateSubAssembly = (assembly) => {
    // Create a mock product object with the product_id from the parent assembly
    setSelectedProduct({ id: assembly.product_id });
    setParentAssembly(assembly);
    setCreateType('assembly');
    setEditMode(false);
    setEditingItem(null);
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

  const handleProductCreated = async (newItem, type, action = 'create') => {
    // Refresh the products list to get the latest data
    await fetchProducts();
    
    // Show appropriate success message
    if (type === 'product') {
      addToast(
        `Product "${newItem.product_name}" ${action === 'edit' ? 'updated' : 'created'} successfully!`
      );
    } else if (type === 'assembly') {
      // Force refresh the hierarchical data for the parent product
      if (newItem.product_id) {
        // Fetch fresh data with force refresh
        await fetchProductHierarchy(newItem.product_id, true);
        
        // Keep the product expanded after creating assembly
        setExpandedItems(prev => ({
          ...prev,
          [newItem.product_id]: true
        }));
      }
      addToast(
        `Assembly "${newItem.assembly_name}" ${action === 'edit' ? 'updated' : 'created'} successfully!`
      );
    } else if (type === 'part') {
      // Force refresh the hierarchical data for the parent product
      if (newItem.product_id) {
        // Fetch fresh data with force refresh
        await fetchProductHierarchy(newItem.product_id, true);
        
        // Keep the product and assembly (if applicable) expanded after creating part
        setExpandedItems(prev => {
          const newExpanded = {
            ...prev,
            [newItem.product_id]: true
          };
          
          // If the part is under an assembly, keep that assembly expanded too
          if (newItem.assembly_id) {
            newExpanded[newItem.assembly_id] = true;
          }
          
          return newExpanded;
        });
      }
      addToast(
        `Part "${newItem.part_name}" ${action === 'edit' ? 'updated' : 'created'} successfully!`
      );
    }
  };

  // Edit handlers
  const handleEditProduct = (product) => {
    setCreateType('product');
    setSelectedProduct(product);
    setParentAssembly(null);
    setEditMode(true);
    setEditingItem(product);
    setShowCreateModal(true);
  };

  const handleEditAssembly = (assembly) => {
    const productForAssembly = products.find(p => p.id === assembly.product_id) || null;
    setCreateType('assembly');
    setSelectedProduct(productForAssembly);
    setParentAssembly(null);
    setEditMode(true);
    setEditingItem(assembly);
    setShowCreateModal(true);
  };

  const handleEditPart = (part) => {
    const productForPart = products.find(p => p.id === part.product_id) || null;
    
    // Find the assembly for the part if it exists
    let assemblyForPart = null;
    if (part.assembly_id && hierarchicalData[part.product_id]) {
      const findAssembly = (assemblies) => {
        for (const assembly of assemblies) {
          if (assembly.id === part.assembly_id) {
            return assembly;
          }
          if (assembly.child_assemblies) {
            const found = findAssembly(assembly.child_assemblies);
            if (found) return found;
          }
        }
        return null;
      };
      assemblyForPart = findAssembly(hierarchicalData[part.product_id].assemblies || []);
    }
    
    setCreateType('part');
    setSelectedProduct(productForPart);
    setParentAssembly(assemblyForPart);
    setEditMode(true);
    setEditingItem(part);
    setShowCreateModal(true);
  };

  // Delete handlers
  const handleDeleteProduct = async (product) => {
    if (!window.confirm(`Delete product "${product.product_name}"? This cannot be undone.`)) return;

    try {
      const response = await fetch(`${API_BASE_URL}/products/${product.id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        addToast(`Product "${product.product_name}" deleted successfully.`);
        await fetchProducts();
        
        // Remove from hierarchical data and expanded items
        setHierarchicalData(prev => {
          const newData = { ...prev };
          delete newData[product.id];
          return newData;
        });
        setExpandedItems(prev => {
          const newExpanded = { ...prev };
          delete newExpanded[product.id];
          return newExpanded;
        });
      } else {
        console.error('Failed to delete product');
        addToast(`Failed to delete product "${product.product_name}".`);
      }
    } catch (error) {
      console.error('Error deleting product:', error);
      addToast(`Error deleting product "${product.product_name}".`);
    }
  };

  const handleDeleteAssembly = async (assembly) => {
    if (!window.confirm(`Delete assembly "${assembly.assembly_name}"? This cannot be undone.`)) return;

    try {
      const response = await fetch(`${API_BASE_URL}/assemblies/${assembly.id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        addToast(`Assembly "${assembly.assembly_name}" deleted successfully.`);
        
        // Refresh the hierarchical data for the product with force refresh
        if (assembly.product_id) {
          await fetchProductHierarchy(assembly.product_id, true);
          
          // Keep the product expanded
          setExpandedItems(prev => ({
            ...prev,
            [assembly.product_id]: true
          }));
        }
        
        // Remove the assembly from expanded items
        setExpandedItems(prev => {
          const newExpanded = { ...prev };
          delete newExpanded[assembly.id];
          return newExpanded;
        });
      } else {
        console.error('Failed to delete assembly');
        addToast(`Failed to delete assembly "${assembly.assembly_name}".`);
      }
    } catch (error) {
      console.error('Error deleting assembly:', error);
      addToast(`Error deleting assembly "${assembly.assembly_name}".`);
    }
  };

  const handleDeletePart = async (part) => {
    if (!window.confirm(`Delete part "${part.part_name}"? This cannot be undone.`)) return;

    try {
      const response = await fetch(`${API_BASE_URL}/parts/${part.id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        addToast(`Part "${part.part_name}" deleted successfully.`);
        
        // Refresh the hierarchical data for the product with force refresh
        if (part.product_id) {
          await fetchProductHierarchy(part.product_id, true);
          
          // Keep the product and assembly (if applicable) expanded
          setExpandedItems(prev => {
            const newExpanded = {
              ...prev,
              [part.product_id]: true
            };
            
            if (part.assembly_id) {
              newExpanded[part.assembly_id] = true;
            }
            
            return newExpanded;
          });
        }
      } else {
        console.error('Failed to delete part');
        addToast(`Failed to delete part "${part.part_name}".`);
      }
    } catch (error) {
      console.error('Error deleting part:', error);
      addToast(`Error deleting part "${part.part_name}".`);
    }
  };

  const handleItemClick = async (item, type) => {
    onItemSelected({ ...item, itemType: type });
    if (type === 'product') {
      setSelectedProduct(item);
      // Only fetch hierarchical data when a product is clicked
      if (!hierarchicalData[item.id]) {
        await fetchProductHierarchy(item.id);
      }
    }
  };

  // Helper to transform subassemblies recursively
  const transformSubassemblies = (subassemblies) => {
    return subassemblies.map(sub => ({
      ...sub.assembly,
      parts: sub.parts?.map(part => part.part) || [],
      child_assemblies: transformSubassemblies(sub.subassemblies || [])
    }));
  };

  const getChildAssemblies = (productId) => {
    const productHierarchy = hierarchicalData[productId];
    if (!productHierarchy) return [];
    return productHierarchy.assemblies || [];
  };

  const getNestedAssemblies = (assemblyId) => {
    // Search through all products' hierarchical data to find the assembly's children
    for (const productId in hierarchicalData) {
      const product = hierarchicalData[productId];
      if (product.assemblies) {
        for (const assembly of product.assemblies) {
          if (assembly.id === assemblyId) {
            return assembly.child_assemblies || [];
          }
          // Check nested assemblies recursively
          const findNested = (parent) => {
            if (parent.child_assemblies) {
              for (const child of parent.child_assemblies) {
                if (child.id === assemblyId) {
                  return child.child_assemblies || [];
                }
                const result = findNested(child);
                if (result) return result;
              }
            }
            return null;
          };
          const nestedResult = findNested(assembly);
          if (nestedResult) return nestedResult;
        }
      }
    }
    return [];
  };

  const getPartsForAssembly = (assemblyId) => {
    // Search through all products' hierarchical data to find the assembly's parts
    for (const productId in hierarchicalData) {
      const product = hierarchicalData[productId];
      
      // Check direct parts first
      if (product.parts) {
        const directPart = product.parts.find(part => part.id === assemblyId);
        if (directPart) return [directPart];
      }
      
      // Then check assemblies
      if (product.assemblies) {
        for (const assembly of product.assemblies) {
          if (assembly.id === assemblyId) {
            return assembly.parts || [];
          }
          // Check nested assemblies recursively
          const findInNested = (parent) => {
            if (parent.child_assemblies) {
              for (const child of parent.child_assemblies) {
                if (child.id === assemblyId) {
                  return child.parts || [];
                }
                const result = findInNested(child);
                if (result.length > 0) return result;
              }
            }
            return [];
          };
          const parts = findInNested(assembly);
          if (parts.length > 0) return parts;
        }
      }
    }
    return [];
  };

  const getDirectParts = (productId) => {
    const productHierarchy = hierarchicalData[productId];
    if (!productHierarchy) return [];
    return productHierarchy.parts || [];
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
            <span className="font-medium text-sm">{part.part_name}</span>
            <div className="flex items-center space-x-1 ml-2">
              <Box className="h-3.5 w-3.5 text-gray-500" />
              <span className="text-xs font-medium text-gray-600">Part</span>
            </div>
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
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={(e) => {
                e.stopPropagation();
                handleEditPart(part);
              }}
              title="Edit Part"
            >
              <Pencil className="h-3 w-3 text-muted-foreground" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={(e) => {
                e.stopPropagation();
                handleDeletePart(part);
              }}
              title="Delete Part"
            >
              <Trash2 className="h-3 w-3 text-red-500" />
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
            <span className="font-medium">{assembly.assembly_name}</span>
            <div className="flex items-center space-x-1 ml-2">
              {assembly.parent_id ? (
                <Layers className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Package className="h-3.5 w-3.5 text-blue-500" />
              )}
              <span className={`text-xs font-medium ${assembly.parent_id ? 'text-green-600' : 'text-blue-600'}`}>
                {assembly.parent_id ? 'Sub-Assembly' : 'Assembly'}
              </span>
            </div>
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
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={(e) => {
                e.stopPropagation();
                handleEditAssembly(assembly);
              }}
              title="Edit Assembly"
            >
              <Pencil className="h-3 w-3 text-blue-900" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteAssembly(assembly);
              }}
              title="Delete Assembly"
            >
              <Trash2 className="h-3 w-3 text-red-500" />
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
    const productHierarchy = hierarchicalData[product.id];
    const childAssemblies = productHierarchy?.assemblies || [];
    const directParts = productHierarchy?.parts || [];
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
            <span className="font-bold">{product.product_name}</span>
            <div className="flex items-center space-x-1 ml-2">
              <Package className="h-4 w-4 text-purple-500" />
              <span className="text-xs font-medium text-purple-600">Product</span>
            </div>
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
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={(e) => {
                e.stopPropagation();
                handleEditProduct(product);
              }}
              title="Edit Product"
            >
              <Pencil className="h-4 w-4 text-muted-foreground" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteProduct(product);
              }}
              title="Delete Product"
            >
              <Trash2 className="h-4 w-4 text-red-500" />
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
            setEditingItem(null);
            setEditMode(false);
          }}
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