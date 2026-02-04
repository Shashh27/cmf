import React, { useState, useEffect, useRef } from "react";
import { Plus, Download, FileText, Eye, RefreshCw } from "lucide-react";
import { API_BASE_URL } from "../Config/auth";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { cn } from "../lib/utils";
import DocumentPreviewModal from "../components/DocumentPreviewModal";

const DocumentsPanel = ({ selectedItem }) => {
  const [documents, setDocuments] = useState([]);
  const [operations, setOperations] = useState([]);
  const [activeTab, setActiveTab] = useState('ebom');
  const [loading, setLoading] = useState(false);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [replaceFileDocument, setReplaceFileDocument] = useState(null);
  const [selectedOperationId, setSelectedOperationId] = useState(null);
  const [processPlans, setProcessPlans] = useState({});
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (selectedItem) {
      fetchDocuments();
    } else {
      setDocuments([]);
    }
  }, [selectedItem]);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      // Only fetch documents if the selected item is a 'part'
      if (!selectedItem || selectedItem.itemType !== 'part') {
        setDocuments([]);
        setOperations([]);
        setProcessPlans({});
        setLoading(false);
        return;
      }

      // Fetch documents
      const documentsResponse = await fetch(`${API_BASE_URL}/documents/part/${selectedItem.id}`);
      if (documentsResponse.ok) {
        const documentsData = await documentsResponse.json();
        setDocuments(documentsData);
      } else {
        setDocuments([]);
      }

      // For operations and process plans, we need to get them from the hierarchical data
      // First, try to find which product this part belongs to
      const partsResponse = await fetch(`${API_BASE_URL}/parts/`);
      if (partsResponse.ok) {
        const allParts = await partsResponse.json();
        const currentPart = allParts.find(p => p.id === selectedItem.id);
        
        if (currentPart && currentPart.product_id) {
          // Get hierarchical data for the product
          const hierarchicalResponse = await fetch(`${API_BASE_URL}/products/${currentPart.product_id}/hierarchical`);
          if (hierarchicalResponse.ok) {
            const hierarchicalData = await hierarchicalResponse.json();
            
            // Find this part in the hierarchical data
            let foundOperations = [];
            let foundProcessPlans = {};
            
            // Search in direct parts
            if (hierarchicalData.direct_parts) {
              const directPart = hierarchicalData.direct_parts.find(p => p.part && p.part.id === selectedItem.id);
              if (directPart) {
                foundOperations = directPart.operations || [];
                // Convert process plans array to object with operation_id as key
                if (directPart.process_plans) {
                  directPart.process_plans.forEach(plan => {
                    if (plan.operation_id) {
                      foundProcessPlans[plan.operation_id] = plan;
                    }
                  });
                }
              }
            }
            
            // Search in assemblies if not found in direct parts
            if (foundOperations.length === 0 && hierarchicalData.assemblies) {
              const searchInAssemblies = (assemblies) => {
                for (const assembly of assemblies) {
                  // Check parts in current assembly
                  if (assembly.parts) {
                    const part = assembly.parts.find(p => p.part && p.part.id === selectedItem.id);
                    if (part) {
                      foundOperations = part.operations || [];
                      if (part.process_plans) {
                        part.process_plans.forEach(plan => {
                          if (plan.operation_id) {
                            foundProcessPlans[plan.operation_id] = plan;
                          }
                        });
                      }
                      return true;
                    }
                  }
                  
                  // Recursively search in subassemblies
                  if (assembly.subassemblies && assembly.subassemblies.length > 0) {
                    if (searchInAssemblies(assembly.subassemblies)) {
                      return true;
                    }
                  }
                }
                return false;
              };
              
              searchInAssemblies(hierarchicalData.assemblies);
            }
            
            console.log("Found operations:", foundOperations);
            console.log("Found process plans:", foundProcessPlans);
            
            setOperations(foundOperations);
            setProcessPlans(foundProcessPlans);
          } else {
            // Fallback to separate endpoints
            const operationsResponse = await fetch(`${API_BASE_URL}/operations/`);
            if (operationsResponse.ok) {
              const allOperations = await operationsResponse.json();
              const partOperations = allOperations.filter(op => op.part_id === selectedItem.id);
              setOperations(partOperations);
            }
            
            // Initialize empty process plans object
            setProcessPlans({});
          }
        }
      }

    } catch (error) {
      console.error("Error fetching data:", error);
      setDocuments([]);
      setOperations([]);
      setProcessPlans([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (documentId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/documents/${documentId}/download/`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `document_${documentId}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error("Error downloading document:", error);
    }
  };

  const handlePreview = (document) => {
    setPreviewDocument(document);
    setIsPreviewModalOpen(true);
  };

  const handleClosePreview = () => {
    setIsPreviewModalOpen(false);
    setPreviewDocument(null);
  };

  const fetchProcessPlan = async (operationId) => {
    if (!operationId) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/process-plans/operation/${operationId}`);
      if (response.ok) {
        const data = await response.json();
        setProcessPlans(prev => ({
          ...prev,
          [operationId]: data
        }));
      } else {
        // If no process plan exists, set default values
        setProcessPlans(prev => ({
          ...prev,
          [operationId]: {
            operation_id: operationId,
            work_instructions: 'No work instructions available',
            notes: 'No notes available'
          }
        }));
      }
    } catch (error) {
      console.error('Error fetching process plan:', error);
      setProcessPlans(prev => ({
        ...prev,
        [operationId]: {
          operation_id: operationId,
          work_instructions: 'Error loading work instructions',
          notes: 'Error loading notes'
        }
      }));
    }
  };

  const handleOperationClick = (operationId) => {
    setSelectedOperationId(selectedOperationId === operationId ? null : operationId);
    
    // If the process plan is not already loaded, fetch it
    if (!processPlans[operationId]) {
      fetchProcessPlan(operationId);
    }
  };

  const handleReplaceFile = (doc) => {
    setReplaceFileDocument(doc);
    // Trigger the hidden file input
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (file && replaceFileDocument) {
      await replaceDocumentFile(replaceFileDocument.id, file);
      // Reset the input
      event.target.value = '';
    }
  };

  const replaceDocumentFile = async (documentId, file) => {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE_URL}/documents/${documentId}/replace-file`, {
        method: 'PUT',
        body: formData,
      });

      if (response.ok) {
        // Refresh documents after successful replacement
        await fetchDocuments();
        console.log('File replaced successfully');
      } else {
        const errorData = await response.json();
        console.error('Failed to replace file:', errorData.detail);
      }
    } catch (error) {
      console.error('Error replacing file:', error);
    }
  };

  // Group documents by type
  const getDocumentsByType = (type) => {
    return documents.filter(doc => doc.document_type === type);
  };

  // Get unique document types from actual data
  const getDocumentTypes = () => {
    const types = [...new Set(documents.map(doc => doc.document_type))];
    return types.length > 0 ? types : [];
  };

  if (!selectedItem || selectedItem.itemType !== 'part') {
    return (
      <div className="flex-1 bg-background">
        
      </div>
    );
  }

  const documentTypes = getDocumentTypes();

  return (
    <div className="flex-1 bg-background overflow-hidden flex flex-col">
      <Card className="border-0 rounded-none shadow-none">
        <CardHeader className="pb-4">
          <div className="flex justify-between items-center">
            <CardTitle className="text-lg">Documents</CardTitle>
            <Badge variant="secondary" className="text-xs">
              {documents.length} attached
            </Badge>
          </div>
        </CardHeader>
        
        <CardContent className="pt-0 overflow-hidden flex flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="ebom">eBOM</TabsTrigger>
              <TabsTrigger value="mbom">mBOM</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="animate-pulse">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="flex items-center justify-between p-4 border-b">
                      <div className="flex items-center space-x-4">
                        <div className="h-4 w-4 bg-muted rounded"></div>
                        <div className="h-4 bg-muted rounded w-32"></div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="h-8 bg-muted rounded w-16"></div>
                        <div className="h-8 bg-muted rounded w-16"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                <TabsContent value="ebom" className="mt-0">
                  {documentTypes.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Document Type</TableHead>
                          <TableHead>Document Name</TableHead>
                          <TableHead>Actions</TableHead>
                          <TableHead>Version</TableHead>
                          <TableHead>New</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {documentTypes.map((docType, index) => {
                          const typeDocuments = getDocumentsByType(docType);
                          
                          return (
                            <TableRow key={index}>
                              <TableCell>
                                <div className="flex items-center">
                                  <FileText className="h-4 w-4 text-muted-foreground mr-2" />
                                  {docType}
                                  {typeDocuments.length > 0 && (
                                    <Badge variant="secondary" className="ml-2 text-xs">
                                      {typeDocuments.length}
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                {typeDocuments.length > 0 ? (
                                  <div className="space-y-1">
                                    {typeDocuments.map(doc => (
                                      <div key={doc.id} className="text-xs text-muted-foreground">
                                        {doc.document_name}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">No documents</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center space-x-2">
                                  {typeDocuments.length > 0 ? (
                                    typeDocuments.map(doc => (
                                      <div key={doc.id} className="flex items-center space-x-1">
                                        <Button 
                                          variant="ghost" 
                                          size="sm" 
                                          title="View"
                                          onClick={() => handlePreview(doc)}
                                        >
                                          <Eye className="h-4 w-4" />
                                        </Button>
                                        <Button 
                                          variant="ghost" 
                                          size="sm" 
                                          onClick={() => handleDownload(doc.id)}
                                          title="Download"
                                        >
                                          <Download className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    ))
                                  ) : (
                                    <>
                                      <Button variant="ghost" size="sm" disabled>
                                        <Eye className="h-4 w-4 text-muted-foreground/50" />
                                      </Button>
                                      <Button variant="ghost" size="sm" disabled>
                                        <Download className="h-4 w-4 text-muted-foreground/50" />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                {typeDocuments.length > 0 ? (
                                  <select className="border border-border rounded px-2 py-1 text-xs bg-background">
                                    {typeDocuments.map(doc => (
                                      <option key={doc.id} value={doc.document_version}>
                                        {doc.document_version}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <select className="border border-border rounded px-2 py-1 text-xs bg-muted/50" disabled>
                                    <option>v1</option>
                                  </select>
                                )}
                              </TableCell>
                              <TableCell>
                                {typeDocuments.length > 0 ? (
                                  <div className="flex flex-col space-y-1">
                                    {typeDocuments.map(doc => (
                                      <Button 
                                        key={doc.id}
                                        size="sm" 
                                        variant="outline"
                                        className="text-xs"
                                        onClick={() => handleReplaceFile(doc)}
                                      >
                                        <RefreshCw className="h-3 w-3 mr-1" />
                                        Replace File
                                      </Button>
                                    ))}
                                  </div>
                                ) : (
                                  <Button size="sm" className="text-xs" disabled>
                                    <Plus className="h-3 w-3 mr-1" />
                                    New
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <Card className="border-0 shadow-none">
                        <CardContent className="pt-6">
                          <div className="text-center">
                            <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                            <CardTitle className="text-lg mb-2">No documents found</CardTitle>
                            <p className="text-muted-foreground mb-4">There are no documents attached to this part.</p>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </TabsContent>
                
                <TabsContent value="mbom" className="mt-0 space-y-4">
                  <div>
                    <h3 className="text-lg font-medium mb-4">Operations</h3>
                    <div className="text-sm text-muted-foreground mb-4">
                      Click on an operation to view process plan details
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Operation #</TableHead>
                          <TableHead>Operation Name</TableHead>
                          <TableHead>Setup Time</TableHead>
                          <TableHead>Cycle Time</TableHead>
                          <TableHead>Workcenter</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {operations.length > 0 ? (
                          operations.flatMap((operation, index) => {
                            const isSelected = selectedOperationId === operation.id;
                            const processPlan = processPlans[operation.id];
                            
                            return [
                              <TableRow 
                                key={index} 
                                className={cn("cursor-pointer hover:bg-muted/50", isSelected && "bg-muted/30")}
                                onClick={() => handleOperationClick(operation.id)}
                              >
                                <TableCell>
                                  <div className="flex items-center">
                                    <span className={cn("mr-2", isSelected ? "text-primary" : "text-muted-foreground")}>
                                      {isSelected ? '▼' : '▶'}
                                    </span>
                                    {operation.operation_number || 'N/A'}
                                  </div>
                                </TableCell>
                                <TableCell className="capitalize">{operation.operation_name || 'N/A'}</TableCell>
                                <TableCell>{operation.setup_time || '00:00:00'}</TableCell>
                                <TableCell>{operation.cycle_time || '00:00:00'}</TableCell>
                                <TableCell>{operation.workcenter_id || 'N/A'}</TableCell>
                              </TableRow>,
                              isSelected && (
                                <TableRow key={`${index}-details`} className="bg-muted/10">
                                  <TableCell colSpan={5} className="p-0">
                                    <div className="p-4 pl-12 space-y-4">
                                      {processPlan ? (
                                        <>
                                          <div>
                                            <h4 className="font-medium mb-1">Work Instructions</h4>
                                            <div className="bg-muted/30 p-3 rounded text-sm whitespace-pre-wrap">
                                              {processPlan.work_instructions}
                                            </div>
                                          </div>
                                          <div>
                                            <h4 className="font-medium mb-1">Notes</h4>
                                            <div className="bg-muted/30 p-3 rounded text-sm whitespace-pre-wrap">
                                              {processPlan.notes}
                                            </div>
                                          </div>
                                        </>
                                      ) : (
                                        <div className="text-center py-4 text-muted-foreground">
                                          Loading process plan...
                                        </div>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )
                            ].filter(Boolean);
                          })
                        ) : (
                          <TableRow>
                            <TableCell colSpan="5" className="text-center py-4 text-muted-foreground">
                              No operations found
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              </>
            )}
          </div>
        </Tabs>
      </CardContent>
    </Card>
      
      <DocumentPreviewModal
        isOpen={isPreviewModalOpen}
        onClose={handleClosePreview}
        document={previewDocument}
        API_BASE_URL={API_BASE_URL}
      />
      
      
      {/* Hidden file input for replace file functionality */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.csv,.xlsx,.doc,.xls,.txt"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />
    </div>
  );
};

export default DocumentsPanel;
