import React, { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { ChevronDown, ChevronRight, ArrowLeft, Package, Layers, Box } from "lucide-react";
import { API_BASE_URL } from "../Config/auth";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { cn } from "../lib/utils";

const ScrollArea = ({ className, children }) => (
  <div className={cn("overflow-auto", className)}>{children}</div>
);

const ProductBOMView = ({ onBackToOrders }) => {
  const { productId } = useParams();
  const [product, setProduct] = useState(null);
  const [bomData, setBomData] = useState(null);
  const [expandedItems, setExpandedItems] = useState({});
  const [selectedItem, setSelectedItem] = useState(null);
  const [loading, setLoading] = useState(false);
  const [bomView, setBomView] = useState('mbom');
  const [expandedOperations, setExpandedOperations] = useState({});
  const hasFetchedData = useRef(false);

  useEffect(() => {
    if (hasFetchedData.current || !productId) return;
    
    const fetchData = async () => {
      hasFetchedData.current = true;
      try {
        await Promise.all([
          fetchProductDetails(),
          fetchBOMData()
        ]);
      } catch (error) {
        console.error('Error fetching BOM data:', error);
      }
    };

    fetchData();
  }, [productId]);

  const fetchProductDetails = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/products/${productId}`);
      if (response.ok) {
        const data = await response.json();
        setProduct(data);
      }
    } catch (error) {
      console.error("Error fetching product details:", error);
    }
  };

  const processSubassemblies = (subassemblies) => {
    if (!subassemblies || !Array.isArray(subassemblies)) return [];
    
    return subassemblies.flatMap(subassembly => {
      const subassemblyData = {
        id: subassembly.assembly?.id,
        name: subassembly.assembly?.assembly_name,
        part_number: subassembly.assembly?.assembly_number,
        type: 'assembly',
        components: [
          ...(subassembly.parts?.map(part => ({
            id: part.part.id,
            name: part.part.part_name,
            part_number: part.part.part_number,
            type: part.part.type_name || 'part',
            operations: part.operations,
            process_plans: part.process_plans,
            documents: part.documents,
            tools: part.tools
          })) || []),
          ...processSubassemblies(subassembly.subassemblies || [])
        ]
      };
      return [subassemblyData];
    });
  };

  const fetchBOMData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/products/${productId}/hierarchical`);
      
      if (response.ok) {
        const data = await response.json();
        
        const processedAssemblies = data.assemblies?.flatMap(assembly => {
          const assemblyData = {
            id: assembly.assembly?.id,
            name: assembly.assembly?.assembly_name,
            part_number: assembly.assembly?.assembly_number,
            type: 'assembly',
            components: [
              ...(assembly.parts?.map(part => ({
                id: part.part.id,
                name: part.part.part_name,
                part_number: part.part.part_number,
                type: part.part.type_name || 'part',
                operations: part.operations,
                process_plans: part.process_plans,
                documents: part.documents,
                tools: part.tools
              })) || []),
              ...processSubassemblies(assembly.subassemblies || [])
            ]
          };
          return assemblyData;
        }) || [];

        const transformedData = {
          id: data.product.id,
          name: data.product.product_name,
          part_number: data.product.product_number,
          type: 'product',
          components: [
            ...(data.direct_parts?.map(part => ({
              id: part.part.id,
              name: part.part.part_name,
              part_number: part.part.part_number,
              type: part.part.type_name || 'part',
              operations: part.operations,
              process_plans: part.process_plans,
              documents: part.documents,
              tools: part.tools
            })) || []),
            ...processedAssemblies
          ]
        };

        setBomData(transformedData);
        setExpandedItems({ [transformedData.id]: true });
        setSelectedItem(transformedData);
      } else {
        setBomData(null);
      }
    } catch (error) {
      console.error("Error fetching hierarchical BOM data:", error);
      setBomData(null);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (itemId) => {
    setExpandedItems(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const toggleOperationExpand = (operationId) => {
    setExpandedOperations(prev => ({ ...prev, [operationId]: !prev[operationId] }));
  };

  const handleItemClick = (item) => {
    console.log("Selected Item:", item); // Debug log
    setSelectedItem(item);
  };

  const getTypeIcon = (type) => {
    switch(type?.toLowerCase()) {
      case 'product':
        return <Package className="h-4 w-4 text-purple-600" />;
      case 'assembly':
        return <Layers className="h-4 w-4 text-blue-600" />;
      case 'part':
      case 'make':
        return <Box className="h-4 w-4 text-green-600" />;
      default:
        return <Box className="h-4 w-4 text-gray-600" />;
    }
  };

  const handleViewDocument = (url, name) => {
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    else alert('Document URL is not available');
  };

  const handleDownloadDocument = async (url, name) => {
    if (!url) {
      alert('Document URL is not available');
      return;
    }
    
    try {
      // Create a temporary anchor element
      const link = document.createElement('a');
      
      // If the URL is a data URL or a blob URL, we can use it directly
      if (url.startsWith('data:') || url.startsWith('blob:')) {
        link.href = url;
      } else {
        // For regular URLs, we'll need to fetch the file first
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/octet-stream',
          },
          credentials: 'include' // Include cookies if needed
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        link.href = blobUrl;
      }
      
      // Set the download attribute with a proper filename
      const fileName = name || 'document';
      link.download = fileName.includes('.') ? fileName : `${fileName}.pdf`; // Default to .pdf if no extension
      
      // Append to body, trigger click, and remove
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      setTimeout(() => {
        document.body.removeChild(link);
        if (link.href.startsWith('blob:')) {
          window.URL.revokeObjectURL(link.href);
        }
      }, 100);
      
    } catch (error) {
      console.error('Download error:', error);
      // Fallback to opening in a new tab if download fails
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const renderBOMItem = (item, level = 0) => {
    if (!item) return null;
    
    const hasChildren = item.components && item.components.length > 0;
    const isExpanded = expandedItems[item.id];
    const isSelected = selectedItem?.id === item.id;
    
    return (
      <div key={item.id}>
        <div 
          className={cn(
            "flex items-center gap-2 py-2.5 px-3 rounded-md transition-all cursor-pointer group",
            "hover:bg-blue-50 border-l-2",
            isSelected 
              ? "bg-blue-50 border-l-blue-500 shadow-sm" 
              : "border-l-transparent hover:border-l-blue-300"
          )}
          style={{ marginLeft: `${level * 24}px` }}
          onClick={() => handleItemClick(item)}
        >
          {/* Expand/Collapse Icon */}
          <div className="flex-shrink-0">
            {hasChildren ? (
              <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  toggleExpand(item.id); 
                }}
                className="p-0.5 hover:bg-gray-200 rounded transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-gray-600" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-600" />
                )}
              </button>
            ) : (
              <div className="w-5" />
            )}
          </div>

          {/* Type Icon */}
          <div className="flex-shrink-0">
            {getTypeIcon(item.type)}
          </div>

          {/* Item Name */}
          <div className="flex-1 min-w-0">
            <span className={cn(
              "text-sm font-medium truncate block",
              isSelected ? "text-blue-900" : "text-gray-900"
            )}>
              {item.name}
            </span>
          </div>

          {/* Component Count (if has children) */}
          {hasChildren && (
            <div className="flex-shrink-0">
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                {item.components.length}
              </span>
            </div>
          )}
        </div>
        
        {/* Children */}
        {hasChildren && isExpanded && (
          <div className="mt-1">
            {item.components.map(child => renderBOMItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const renderDetailsPanel = () => {
    if (!selectedItem) {
      return (
        <div className="text-center py-12">
          <p className="text-gray-500">Select a part to view details</p>
        </div>
      );
    }

    // Check if it's a part (including type_name variations)
    const isPart = selectedItem.type?.toLowerCase() === 'part' || 
                    selectedItem.type?.toLowerCase() === 'make' ||
                    selectedItem.type?.toLowerCase() === 'buy';

    if (!isPart) {
      // Don't show any details for products, assemblies, or sub-assemblies
      return (
        <div className="text-center py-12">
          <p className="text-gray-400">Select a part to view {bomView === 'ebom' ? 'documents' : 'operations'}</p>
        </div>
      );
    }

    // eBOM View for Parts
    if (bomView === 'ebom') {
      return (
        <div className="space-y-4">

          {/* Documents Section */}
          <div>
            <h3 className="text-lg font-semibold mb-3">
              Documents ({selectedItem.documents?.length || 0})
            </h3>
            
            {selectedItem.documents?.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-100 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Document Type</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Document Name</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Actions</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Version</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedItem.documents.map((doc, idx) => (
                      <tr key={doc.id || idx} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span>{doc.document_type || 'Document'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium">{doc.document_name || 'Untitled'}</td>
                        <td className="px-4 py-3">
                          <div className="flex space-x-2">
                            <button 
                              onClick={() => handleViewDocument(doc.document_url, doc.document_name)}
                              className="p-1.5 rounded-full hover:bg-gray-200 text-gray-600 hover:text-gray-800"
                              title="View"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </button>
                            <button 
                              onClick={() => handleDownloadDocument(doc.document_url, doc.document_name)}
                              className="p-1.5 rounded-full hover:bg-gray-200 text-gray-600 hover:text-gray-800"
                              title="Download"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <select 
                            className="w-full bg-white border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                            value={doc.version || '1.0'}
                            onChange={(e) => {}}
                            style={{
                              WebkitAppearance: 'none',
                              MozAppearance: 'none',
                              textIndent: '1px',
                              textOverflow: ''
                            }}
                          >
                            <option value="1.0">1.0</option>
                            {doc.versions?.map((v, i) => (
                              <option key={i} value={v}>{v}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed">
                <p className="text-sm text-gray-500">No documents available for this part</p>
              </div>
            )}
          </div>
        </div>
      );
    }

    // mBOM View for Parts
    return (
      <div className="space-y-4">

        {/* Operations Section */}
        <div>
          <h3 className="text-lg font-semibold mb-2">
            Operations ({selectedItem.operations?.length || 0})
          </h3>
          <p className="text-sm text-gray-500 mb-4">Click on an operation to view process plan details</p>

          {selectedItem.operations?.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-100 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Operation #</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Operation Name</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Setup Time</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Cycle Time</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Workcenter</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedItem.operations.map((op, idx) => {
                    const plan = selectedItem.process_plans?.find(pp => pp.operation_id === op.id);
                    const isExpanded = expandedOperations[op.id];
                    
                    return (
                      <React.Fragment key={op.id}>
                        <tr 
                          className="border-b hover:bg-gray-50 cursor-pointer"
                          onClick={() => toggleOperationExpand(op.id)}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center">
                              {plan ? (
                                isExpanded ? <ChevronDown size={16} className="mr-2" /> : <ChevronRight size={16} className="mr-2" />
                              ) : (
                                <span className="w-4 mr-2"></span>
                              )}
                              <span className="font-medium">{op.operation_number || idx + 1}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">{op.operation_name}</td>
                          <td className="px-4 py-3">{plan?.setup_time || '00:00:00'}</td>
                          <td className="px-4 py-3">{plan?.cycle_time || '00:00:00'}</td>
                          <td className="px-4 py-3">{plan?.workcenter || 'N/A'}</td>
                        </tr>
                        
                        {isExpanded && plan && (
                          <tr className="bg-gray-50">
                            <td colSpan="5" className="px-4 py-4">
                              <div className="pl-8 space-y-3">
                                <div>
                                  <h4 className="font-semibold text-sm mb-2">Work Instructions</h4>
                                  <p className="text-sm text-gray-700 whitespace-pre-line">
                                    {plan.work_instructions || 'No work instructions provided.'}
                                  </p>
                                </div>
                                
                                {plan.notes && (
                                  <div>
                                    <h4 className="font-semibold text-sm mb-2">Notes</h4>
                                    <p className="text-sm text-gray-700 whitespace-pre-line">
                                      {plan.notes}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed">
              <p className="text-sm text-gray-500">No operations defined for this part</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="container mx-auto p-4">
        <div className="flex items-center mb-4">
          <Button variant="outline" size="sm" onClick={onBackToOrders} disabled>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Orders
          </Button>
          <h1 className="text-2xl font-semibold ml-2">Loading...</h1>
        </div>
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-r-transparent"></div>
        </div>
      </div>
    );
  }

  if (!bomData) {
    return (
      <div className="container mx-auto p-4">
        <div className="flex items-center mb-4">
          <Button variant="outline" size="sm" onClick={onBackToOrders}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Orders
          </Button>
          <h1 className="text-2xl font-semibold ml-2">{product?.product_name || 'Product'} BOM</h1>
        </div>
        <div className="bg-red-50 border-l-4 border-red-500 p-4">
          <p className="text-red-700">Failed to load BOM data. Please try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center">
          <Button variant="outline" size="sm" onClick={onBackToOrders}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Orders
          </Button>
        </div>
        
        <h1 className="text-2xl font-bold">Product Bill of Materials</h1>
        
        <div className="flex items-center space-x-2">
          <Button
            variant={bomView === 'mbom' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setBomView('mbom')}
          >
            mBOM
          </Button>
          <Button
            variant={bomView === 'ebom' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setBomView('ebom')}
          >
            eBOM
          </Button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        <div className="w-full lg:w-1/3">
          <Card>
            <CardHeader>
              <CardTitle>BOM Structure</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[calc(100vh-280px)]">
                {bomData && renderBOMItem(bomData)}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        <div className="flex-1">
          <Card>
            <CardHeader className="bg-gray-50">
              <CardTitle>{selectedItem?.name || 'Select an item'}</CardTitle>
              {selectedItem && (
                <p className="text-sm text-gray-600 uppercase">
                  {selectedItem.type}
                </p>
              )}
            </CardHeader>
            <CardContent className="pt-4">
              <ScrollArea className="h-[calc(100vh-280px)]">
                {renderDetailsPanel()}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ProductBOMView;