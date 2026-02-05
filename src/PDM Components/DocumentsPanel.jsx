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
    if (selectedItem) fetchDocuments();
    else {
      setDocuments([]);
      setOperations([]);
      setProcessPlans({});
    }
  }, [selectedItem]);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      if (!selectedItem || selectedItem.itemType !== 'part') {
        setDocuments([]);
        setOperations([]);
        setProcessPlans({});
        return;
      }

      if (selectedItem.product_id) {
        const response = await fetch(`${API_BASE_URL}/products/${selectedItem.product_id}/hierarchical`);
        if (response.ok) {
          const hierarchicalData = await response.json();
          let foundDocuments = [];
          let foundOperations = [];
          let foundProcessPlans = {};
          
          const extractData = (partData) => {
            if (partData) {
              foundDocuments = partData.documents || [];
              foundOperations = partData.operations || [];
              if (partData.process_plans) {
                partData.process_plans.forEach(plan => {
                  if (plan.operation_id) foundProcessPlans[plan.operation_id] = plan;
                });
              }
            }
          };

          if (hierarchicalData.direct_parts) {
            const directPart = hierarchicalData.direct_parts.find(p => p.part?.id === selectedItem.id);
            if (directPart) extractData(directPart);
          }
          
          if (foundOperations.length === 0 && hierarchicalData.assemblies) {
            const searchInAssemblies = (assemblies) => {
              for (const assembly of assemblies) {
                if (assembly.parts) {
                  const part = assembly.parts.find(p => p.part?.id === selectedItem.id);
                  if (part) {
                    extractData(part);
                    return true;
                  }
                }
                if (assembly.subassemblies?.length > 0 && searchInAssemblies(assembly.subassemblies)) {
                  return true;
                }
              }
              return false;
            };
            searchInAssemblies(hierarchicalData.assemblies);
          }
          
          setDocuments(foundDocuments);
          setOperations(foundOperations);
          setProcessPlans(foundProcessPlans);
        }
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      setDocuments([]);
      setOperations([]);
      setProcessPlans({});
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (documentId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/documents/${documentId}/download/`);
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `document_${documentId}`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("Error downloading document:", error);
    }
  };

  const handlePreview = (document) => {
    setPreviewDocument(document);
    setIsPreviewModalOpen(true);
  };

  const fetchProcessPlan = async (operationId) => {
    if (!operationId || processPlans[operationId]) return;
    try {
      const response = await fetch(`${API_BASE_URL}/process-plans/operation/${operationId}`);
      const data = response.ok ? await response.json() : {
        operation_id: operationId,
        work_instructions: 'No work instructions available',
        notes: 'No notes available'
      };
      setProcessPlans(prev => ({ ...prev, [operationId]: data }));
    } catch (error) {
      console.error('Error fetching process plan:', error);
      setProcessPlans(prev => ({ ...prev, [operationId]: { operation_id: operationId, work_instructions: 'Error loading', notes: 'Error loading' } }));
    }
  };

  const handleOperationClick = (operationId) => {
    const newSelectedId = selectedOperationId === operationId ? null : operationId;
    setSelectedOperationId(newSelectedId);
    if (newSelectedId && !processPlans[operationId]) fetchProcessPlan(operationId);
  };

  const handleReplaceFile = (doc) => {
    setReplaceFileDocument(doc);
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (file && replaceFileDocument) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const response = await fetch(`${API_BASE_URL}/documents/${replaceFileDocument.id}/replace-file`, {
          method: 'PUT',
          body: formData,
        });
        if (response.ok) await fetchDocuments();
      } catch (error) {
        console.error('Error replacing file:', error);
      }
      event.target.value = '';
    }
  };

  const getDocumentsByType = (type) => documents.filter(doc => doc.document_type === type);
  const documentTypes = [...new Set(documents.map(doc => doc.document_type))];

  if (!selectedItem || selectedItem.itemType !== 'part') {
    return <div className="flex-1 bg-background" />;
  }

  return (
    <div className="flex-1 bg-background overflow-hidden flex flex-col">
      <Card className="border-0 rounded-none shadow-none flex-1 flex flex-col">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <CardTitle className="text-lg font-medium">Documents</CardTitle>
            <Badge variant="secondary" className="text-xs h-5 px-2">{documents.length} attached</Badge>
          </div>
        </CardHeader>
        
        <CardContent className="pt-0 overflow-hidden flex flex-col flex-1">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="flex w-full mb-2 h-8 p-0 bg-transparent">
              <TabsTrigger 
                value="ebom" 
                className="text-sm flex-1 h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none"
              >
                eBOM
              </TabsTrigger>
              <TabsTrigger 
                value="mbom" 
                className="text-sm flex-1 h-full rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none"
              >
                mBOM
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="animate-pulse space-y-1">
                  {[1, 2, 3].map(i => <div key={i} className="h-10 bg-muted rounded"></div>)}
                </div>
              ) : (
                <>
                  <TabsContent value="ebom" className="mt-0">
                    {documentTypes.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow className="text-sm">
                            <TableHead className="h-8 text-sm">Type</TableHead>
                            <TableHead className="h-8 text-sm">Document</TableHead>
                            <TableHead className="h-8 text-sm">Actions</TableHead>
                            <TableHead className="h-8 text-sm">Version</TableHead>
                            <TableHead className="h-8 text-sm">New</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {documentTypes.map((docType, index) => {
                            const typeDocuments = getDocumentsByType(docType);
                            return (
                              <TableRow key={index} className="text-sm">
                                <TableCell className="py-2">
                                  <div className="flex items-center gap-1.5">
                                    {docType}
                                    {typeDocuments.length > 0 && <Badge variant="secondary" className="text-xs h-4 px-1">{typeDocuments.length}</Badge>}
                                  </div>
                                </TableCell>
                                <TableCell className="py-2">
                                  {typeDocuments.length > 0 ? (
                                    <div className="space-y-0.5">
                                      {typeDocuments.map(doc => (
                                        <div key={doc.id} className="text-sm text-muted-foreground truncate max-w-[150px]">{doc.document_name}</div>
                                      ))}
                                    </div>
                                  ) : <span className="text-muted-foreground">—</span>}
                                </TableCell>
                                <TableCell className="py-2">
                                  <div className="flex gap-2">
                                    {typeDocuments.length > 0 ? (
                                      typeDocuments.map(doc => (
                                        <div key={doc.id} className="flex gap-2">
                                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handlePreview(doc)}>
                                            <Eye className="h-3 w-3" />
                                          </Button>
                                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleDownload(doc.id)}>
                                            <Download className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      ))
                                    ) : <span className="text-muted-foreground">—</span>}
                                  </div>
                                </TableCell>
                                <TableCell className="py-2">
                                  {typeDocuments.length > 0 ? (
                                    <select className="border rounded px-1.5 py-0.5 text-sm h-6 w-14">
                                      {typeDocuments.map(doc => (
                                        <option key={doc.id} value={doc.document_version}>{doc.document_version}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <select className="border rounded px-1.5 py-0.5 text-sm bg-muted/50 h-6 w-14" disabled><option>v1</option></select>
                                  )}
                                </TableCell>
                                <TableCell className="py-2">
                                  {typeDocuments.length > 0 ? (
                                    <Button size="sm" variant="outline" className="text-xs h-6 px-2" onClick={() => handleReplaceFile(typeDocuments[0])}>
                                      <RefreshCw className="h-2.5 w-2.5 mr-1" />Replace
                                    </Button>
                                  ) : (
                                    <Button size="sm" className="text-xs h-6 px-2" disabled><Plus className="h-2.5 w-2.5 mr-1" />New</Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="flex items-center justify-center h-48">
                        <div className="text-center">
                          <FileText className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
                          <p className="text-base font-medium mb-1">No documents found</p>
                          <p className="text-sm text-muted-foreground">No documents attached to this part</p>
                        </div>
                      </div>
                    )}
                  </TabsContent>
                  
                  <TabsContent value="mbom" className="mt-0">
                    <div className="space-y-2">
                      <div>
                        <h3 className="text-base font-medium mb-1">Operations</h3>
                        <p className="text-sm text-muted-foreground">Click on an operation to view process plan details</p>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow className="text-sm">
                            <TableHead className="h-8 text-sm">Op #</TableHead>
                            <TableHead className="h-8 text-sm">Name</TableHead>
                            <TableHead className="h-8 text-sm">Setup</TableHead>
                            <TableHead className="h-8 text-sm">Cycle</TableHead>
                            <TableHead className="h-8 text-sm">Workcenter</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {operations.length > 0 ? (
                            operations.flatMap((operation, index) => {
                              const isSelected = selectedOperationId === operation.id;
                              const processPlan = processPlans[operation.id];
                              return [
                                <TableRow key={index} className={cn("cursor-pointer text-sm", isSelected && "bg-muted/50")} onClick={() => handleOperationClick(operation.id)}>
                                  <TableCell className="py-2">
                                    <div className="flex items-center gap-1">
                                      <span className="text-sm">{isSelected ? '▼' : '▶'}</span>
                                      <span className="font-medium">{operation.operation_number || 'N/A'}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="py-2 capitalize">{operation.operation_name || 'N/A'}</TableCell>
                                  <TableCell className="py-2 font-mono text-sm">{operation.setup_time || '00:00:00'}</TableCell>
                                  <TableCell className="py-2 font-mono text-sm">{operation.cycle_time || '00:00:00'}</TableCell>
                                  <TableCell className="py-2">{operation.workcenter_id || 'N/A'}</TableCell>
                                </TableRow>,
                                isSelected && (
                                  <TableRow key={`${index}-details`} className="bg-muted/20">
                                    <TableCell colSpan={5} className="p-0">
                                      <div className="p-3 space-y-2">
                                        {processPlan ? (
                                          <>
                                            <div>
                                              <h4 className="text-sm font-medium mb-1">Work Instructions</h4>
                                              <div className="bg-background p-2 rounded text-sm whitespace-pre-wrap">{processPlan.work_instructions}</div>
                                            </div>
                                            <div>
                                              <h4 className="text-sm font-medium mb-1">Notes</h4>
                                              <div className="bg-background p-2 rounded text-sm whitespace-pre-wrap">{processPlan.notes}</div>
                                            </div>
                                          </>
                                        ) : (
                                          <div className="text-center py-2 text-sm text-muted-foreground">Loading...</div>
                                        )}
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                )
                              ];
                            })
                          ) : (
                            <TableRow>
                              <TableCell colSpan="5" className="text-center py-4 text-sm text-muted-foreground">No operations found</TableCell>
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
      
      <DocumentPreviewModal isOpen={isPreviewModalOpen} onClose={() => { setIsPreviewModalOpen(false); setPreviewDocument(null); }} document={previewDocument} API_BASE_URL={API_BASE_URL} />
      <input ref={fileInputRef} type="file" accept=".pdf,.docx,.csv,.xlsx,.doc,.xls,.txt" style={{ display: 'none' }} onChange={handleFileSelect} />
    </div>
  );
};

export default DocumentsPanel;