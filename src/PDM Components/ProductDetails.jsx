import React, { useState, useEffect } from "react";
import { Box, ChevronDown, ChevronRight, Settings, FileText, Wrench } from "lucide-react";
import { API_BASE_URL } from "../Config/auth";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { cn } from "../lib/utils";

const ProductDetails = ({ selectedItem }) => {
  const [hierarchicalData, setHierarchicalData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expandedAssemblies, setExpandedAssemblies] = useState({});
  const [expandedParts, setExpandedParts] = useState({});

  useEffect(() => {
    if (selectedItem && selectedItem.itemType === 'part') {
      fetchPartDetails(selectedItem.id);
    } else {
      setHierarchicalData(null);
    }
  }, [selectedItem]);

  const fetchHierarchicalData = async (productId) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/products/${productId}/hierarchical`);
      if (response.ok) {
        const data = await response.json();
        setHierarchicalData(data);
      }
    } catch (error) {
      console.error("Error fetching hierarchical data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAssemblyData = async (assemblyId) => {
    setLoading(true);
    try {
      // Get assembly details
      const assemblyResponse = await fetch(`${API_BASE_URL}/assemblies/${assemblyId}`);
      if (assemblyResponse.ok) {
        const assembly = await assemblyResponse.json();
        
        // Get parts for this assembly
        const partsResponse = await fetch(`${API_BASE_URL}/parts/`);
        if (partsResponse.ok) {
          const allParts = await partsResponse.json();
          const assemblyParts = allParts.filter(part => part.assembly_id === assemblyId);
          
          // Get child assemblies
          const childAssembliesResponse = await fetch(`${API_BASE_URL}/assemblies/parent/${assemblyId}`);
          let childAssemblies = [];
          if (childAssembliesResponse.ok) {
            childAssemblies = await childAssembliesResponse.json();
          }
          
          setHierarchicalData({
            assembly,
            parts: assemblyParts,
            subassemblies: childAssemblies
          });
        }
      }
    } catch (error) {
      console.error("Error fetching assembly data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPartDetails = async (partId) => {
    setLoading(true);
    try {
      // First, fetch the part details
      const response = await fetch(`${API_BASE_URL}/parts/${partId}`);
      if (response.ok) {
        const part = await response.json();
        console.log('Part data:', part); // Debug log
        
        // Fetch the part type
        const partTypeResponse = await fetch(`${API_BASE_URL}/part-types/`);
        if (partTypeResponse.ok) {
          const partTypes = await partTypeResponse.json();
          console.log('Available part types:', partTypes); // Debug log
          
          // Find the matching part type
          const partType = partTypes.find(type => type.id === part.type_id || type.id === part.part_type_id);
          console.log('Matched part type:', partType); // Debug log
          
          // Add type_name to the part object
          if (partType) {
            part.type_name = partType.type_name;
          }
        }
        
        // Get operations for this part
        const operationsResponse = await fetch(`${API_BASE_URL}/operations/`);
        let operations = [];
        if (operationsResponse.ok) {
          const allOperations = await operationsResponse.json();
          operations = allOperations.filter(op => op.part_id === partId);
        }
        
        // Get documents for this part
        const documentsResponse = await fetch(`${API_BASE_URL}/documents/part/${partId}`);
        let documents = [];
        if (documentsResponse.ok) {
          documents = await documentsResponse.json();
        }
        
        console.log('Final part data with type:', part); // Debug log
        setHierarchicalData({
          part,
          operations,
          documents,
          tools: [] // Tools would need another endpoint
        });
      }
    } catch (error) {
      console.error("Error fetching part details:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleAssembly = (assemblyId) => {
    setExpandedAssemblies(prev => ({
      ...prev,
      [assemblyId]: !prev[assemblyId]
    }));
  };

  const togglePart = (partId) => {
    setExpandedParts(prev => ({
      ...prev,
      [partId]: !prev[partId]
    }));
  };

  const renderPartDetails = (partDetails, level = 0) => {
    // Handle both hierarchical data and direct part data
    const part = partDetails.part || partDetails;
    if (!part || !part.id) return null;
    
    const operations = partDetails.operations || [];
    const process_plans = partDetails.process_plans || [];
    const documents = partDetails.documents || [];
    const tools = partDetails.tools || [];

    // Only show basic part info without expandable details
    return (
      <div key={part.id} className={cn(
        "border rounded-lg p-4 transition-colors",
        "border-border bg-card"
      )} style={{ marginLeft: `${level * 20}px` }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="font-medium text-foreground">{part.part_number}</span>
            <span className="text-muted-foreground">{part.part_name}</span>
          </div>
          <div className="flex items-center space-x-4 text-sm text-muted-foreground">
            <span className="flex items-center">
              <Settings className="h-4 w-4 mr-1" />
              {operations.length}
            </span>
            <span className="flex items-center">
              <FileText className="h-4 w-4 mr-1" />
              {documents.length}
            </span>
            <span className="flex items-center">
              <Wrench className="h-4 w-4 mr-1" />
              {tools.length}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const renderAssemblyHierarchy = (assemblyDetails, level = 0) => {
    // Handle both hierarchical data and direct assembly data
    const assembly = assemblyDetails.assembly || assemblyDetails;
    if (!assembly || !assembly.id) return null;
    
    const parts = assemblyDetails.parts || [];
    const subassemblies = assemblyDetails.subassemblies || [];
    const isExpanded = expandedAssemblies[assembly.id];

    return (
      <div key={assembly.id} className="mb-3">
        <div 
          className={cn(
            "flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors",
            "bg-blue-50/50 border border-blue-200/50 hover:bg-blue-100/50"
          )}
          style={{ marginLeft: `${level * 20}px` }}
          onClick={() => toggleAssembly(assembly.id)}
        >
          <div className="flex items-center space-x-2">
            {(subassemblies.length > 0 || parts.length > 0) && (
              <span className="text-blue-600">
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </span>
            )}
            <span className="font-medium text-blue-900">{assembly.assembly_number}</span>
            <span className="text-blue-700">{assembly.assembly_name}</span>
          </div>
          <div className="text-sm text-blue-600">
            {subassemblies.length} sub-assemblies, {parts.length} parts
          </div>
        </div>

        {isExpanded && (
          <div className="mt-2">
            {/* Render parts in this assembly */}
            {parts.filter(partDetails => partDetails).map(partDetails => renderPartDetails(partDetails, level + 1))}
            
            {/* Render sub-assemblies */}
            {subassemblies.filter(subassembly => subassembly).map(subassembly => renderAssemblyHierarchy(subassembly, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (!selectedItem || selectedItem.itemType !== 'part') {
    return (
      <div className="flex-1 flex flex-col bg-muted/30">
        <Card className="border-0 rounded-none shadow-none">
          <CardContent className="p-6">
            <div className="text-center text-muted-foreground">
              Select a part to view details
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex flex-col bg-muted/30">
        <Card className="border-0 rounded-none shadow-none">
          <CardContent className="p-6">
            <div className="animate-pulse">
              <div className="h-8 bg-muted rounded mb-4"></div>
              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5, 6].map(i => (
                    <div key={i} className="flex">
                      <div className="h-4 bg-muted rounded w-20 mr-4"></div>
                      <div className="h-4 bg-muted rounded flex-1"></div>
                    </div>
                  ))}
                </div>
                <div className="bg-muted/50 rounded-lg p-4 h-64"></div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const item = selectedItem.itemType === 'product' && hierarchicalData 
    ? hierarchicalData.product 
    : selectedItem.itemType === 'assembly' && hierarchicalData
    ? hierarchicalData.assembly
    : selectedItem.itemType === 'part' && hierarchicalData
    ? hierarchicalData.part
    : selectedItem;
    
  // Debug: Log the item object to check if type_name is present
  console.log('Item object:', item);
  console.log('Type name:', item?.type_name);
  const itemNumber = selectedItem.itemType === 'product' ? (item?.product_number || item?.id) : 
                    selectedItem.itemType === 'assembly' ? (item?.assembly_number || item?.id) : 
                    selectedItem.itemType === 'part' ? (item?.part_number || item?.id) : 
                    item?.id;
  const itemName = selectedItem.itemType === 'product' ? (item?.product_name || item?.name) : 
                   selectedItem.itemType === 'assembly' ? (item?.assembly_name || item?.name) : 
                   selectedItem.itemType === 'part' ? (item?.part_name || item?.name) : 
                   item?.name;

  return (
    <div className="flex-1 flex flex-col bg-muted/30">
      {/* Top Part - Item Details */}
      <Card className="border-0 rounded-none shadow-none">
        <CardContent className="p-6 pt-10">
          <div className="grid grid-cols-2 gap-8">
            {/* Left Column - Part Details */}
            <div className="space-y-4">
              <div>
                <CardTitle className="text-2xl mb-2">{itemName || 'Unknown Item'}</CardTitle>
                <div className="flex items-center space-x-4">
                  <span className="text-sm font-medium text-muted-foreground">{itemNumber || 'N/A'}</span>
                  {item?.product_version && (
                    <span className="text-sm text-muted-foreground">Rev {item.product_version}</span>
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-y-2 text-sm">
                <div className="font-medium text-muted-foreground">Type</div>
                <div className="flex items-center space-x-2">
                  <span className="text-foreground capitalize">
                    {selectedItem?.itemType || 'Unknown'}
                    {item?.type_name && (
                      <span 
                        className={cn(
                          'ml-2 text-xs px-2 py-0.5 rounded-full',
                          item.type_name.toLowerCase() === 'make' 
                            ? 'bg-green-100 text-green-800' 
                            : item.type_name.toLowerCase() === 'buy' 
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-800'
                        )}
                      >
                        {item.type_name}
                      </span>
                    )}
                  </span>
                </div>
                
                <div className="font-medium text-muted-foreground">ID</div>
                <div className="text-foreground">{item?.id || 'N/A'}</div>
              </div>
            </div>

            {/* 3D Model Placeholder */}
            <div className="bg-muted/50 rounded-lg p-4 flex flex-col items-center justify-center border-2 border-dashed border-border">
              <Box className="h-16 w-16 text-muted-foreground mb-3" />
              <p className="text-sm font-medium text-muted-foreground mb-1">3D Model Viewer</p>
              <p className="text-xs text-muted-foreground text-center">STEP file viewer will be displayed here</p>
              <p className="text-xs text-muted-foreground mt-2">{itemNumber || 'N/A'}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProductDetails;
