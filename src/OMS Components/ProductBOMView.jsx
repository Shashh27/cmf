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
  const [documentModal, setDocumentModal] = useState({ isOpen: false, url: null, name: null });
  const hasFetchedData = useRef(false);

  useEffect(() => {
    if (hasFetchedData.current || !productId) return;
    hasFetchedData.current = true;
    
    Promise.all([
      fetch(`${API_BASE_URL}/products/${productId}`).then(r => r.ok && r.json().then(setProduct)),
      fetchBOMData()
    ]).catch(console.error);
  }, [productId]);

  const processSubassemblies = (subassemblies) => 
    subassemblies?.flatMap(sub => [{
      id: sub.assembly?.id,
      name: sub.assembly?.assembly_name,
      part_number: sub.assembly?.assembly_number,
      type: 'assembly',
      components: [
        ...(sub.parts?.map(p => ({
          id: p.part.id,
          name: p.part.part_name,
          part_number: p.part.part_number,
          type: p.part.type_name || 'part',
          operations: p.operations,
          process_plans: p.process_plans,
          documents: p.documents,
          tools: p.tools
        })) || []),
        ...processSubassemblies(sub.subassemblies || [])
      ]
    }]) || [];

  const fetchBOMData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/products/${productId}/hierarchical`);
      if (!response.ok) return setBomData(null);
      
      const data = await response.json();
      const processedAssemblies = data.assemblies?.flatMap(asm => ({
        id: asm.assembly?.id,
        name: asm.assembly?.assembly_name,
        part_number: asm.assembly?.assembly_number,
        type: 'assembly',
        components: [
          ...(asm.parts?.map(p => ({
            id: p.part.id,
            name: p.part.part_name,
            part_number: p.part.part_number,
            type: p.part.type_name || 'part',
            operations: p.operations,
            process_plans: p.process_plans,
            documents: p.documents,
            tools: p.tools
          })) || []),
          ...processSubassemblies(asm.subassemblies || [])
        ]
      })) || [];

      const transformedData = {
        id: data.product.id,
        name: data.product.product_name,
        part_number: data.product.product_number,
        type: 'product',
        components: [
          ...(data.direct_parts?.map(p => ({
            id: p.part.id,
            name: p.part.part_name,
            part_number: p.part.part_number,
            type: p.part.type_name || 'part',
            operations: p.operations,
            process_plans: p.process_plans,
            documents: p.documents,
            tools: p.tools
          })) || []),
          ...processedAssemblies
        ]
      };

      setBomData(transformedData);
      setExpandedItems({ [transformedData.id]: true });
      setSelectedItem(transformedData);
    } catch (error) {
      console.error("Error fetching hierarchical BOM data:", error);
      setBomData(null);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (itemId) => setExpandedItems(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  const toggleOperationExpand = (opId) => setExpandedOperations(prev => ({ ...prev, [opId]: !prev[opId] }));

  const getTypeIcon = (type) => {
    const icons = {
      product: <Package className="h-4 w-4 text-purple-600" />,
      assembly: <Layers className="h-4 w-4 text-blue-600" />,
      part: <Box className="h-4 w-4 text-green-600" />,
      make: <Box className="h-4 w-4 text-green-600" />
    };
    return icons[type?.toLowerCase()] || <Box className="h-4 w-4 text-gray-600" />;
  };

  const handleDocumentAction = async (url, name, action = 'view') => {
    if (!url) return alert('Document URL is not available');
    
    if (action === 'view') {
      setDocumentModal({ isOpen: true, url, name });
      return;
    }

    try {
      const link = document.createElement('a');
      if (url.startsWith('data:') || url.startsWith('blob:')) {
        link.href = url;
      } else {
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/octet-stream' },
          credentials: 'include'
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        link.href = window.URL.createObjectURL(await response.blob());
      }
      link.download = name?.includes('.') ? name : `${name || 'document'}.pdf`;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        if (link.href.startsWith('blob:')) window.URL.revokeObjectURL(link.href);
      }, 100);
    } catch (error) {
      console.error('Download error:', error);
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const renderBOMItem = (item, level = 0) => {
    if (!item) return null;
    const hasChildren = item.components?.length > 0;
    const isExpanded = expandedItems[item.id];
    const isSelected = selectedItem?.id === item.id;
    
    return (
      <div key={item.id}>
        <div 
          className={cn(
            "flex items-center gap-1.5 py-2 px-2 rounded transition-all cursor-pointer group hover:bg-blue-50 border-l-2",
            isSelected ? "bg-blue-50 border-l-blue-500 shadow-sm" : "border-l-transparent hover:border-l-blue-300"
          )}
          style={{ marginLeft: `${level * 20}px` }}
          onClick={() => setSelectedItem(item)}
        >
          <div className="flex-shrink-0">
            {hasChildren ? (
              <button onClick={(e) => { e.stopPropagation(); toggleExpand(item.id); }} className="p-0.5 hover:bg-gray-200 rounded transition-colors">
                {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-gray-600" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-600" />}
              </button>
            ) : <div className="w-4" />}
          </div>
          <div className="flex-shrink-0">{getTypeIcon(item.type)}</div>
          <div className="flex-1 min-w-0">
            <span className={cn("text-xs font-medium truncate block", isSelected ? "text-blue-900" : "text-gray-900")}>
              {item.name}
            </span>
          </div>
        </div>
        {hasChildren && isExpanded && <div className="mt-0.5">{item.components.map(child => renderBOMItem(child, level + 1))}</div>}
      </div>
    );
  };

  const DocumentTable = ({ documents }) => (
    <div className="border rounded-md overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 border-b">
          <tr>{['Type', 'Name', 'Actions', 'Version'].map(h => <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-700">{h}</th>)}</tr>
        </thead>
        <tbody>
          {documents.map((doc, idx) => (
            <tr key={doc.id || idx} className="border-b hover:bg-gray-50">
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-xs">{doc.document_type || 'Document'}</span>
                </div>
              </td>
              <td className="px-3 py-2 text-xs font-medium">{doc.document_name || 'Untitled'}</td>
              <td className="px-3 py-2">
                <div className="flex space-x-1">
                  {[
                    { action: 'view', title: 'View', path: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z' },
                    { action: 'download', title: 'Download', path: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4' }
                  ].map((btn, i) => (
                    <button key={i} onClick={() => handleDocumentAction(doc.document_url, doc.document_name, btn.action)} className="p-1 rounded hover:bg-gray-200 text-gray-600 hover:text-gray-800" title={btn.title}>
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={btn.path} />
                      </svg>
                    </button>
                  ))}
                </div>
              </td>
              <td className="px-3 py-2">
                <select className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" value={doc.version || '1.0'}>
                  <option value="1.0">1.0</option>
                  {doc.versions?.map((v, i) => <option key={i} value={v}>{v}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const OperationsTable = ({ operations, processPlans }) => (
    <div className="border rounded-md overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 border-b">
          <tr>{['Op #', 'Name', 'Setup', 'Cycle', 'Workcenter'].map(h => <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-700">{h}</th>)}</tr>
        </thead>
        <tbody>
          {operations.map((op, idx) => {
            const plan = processPlans?.find(pp => pp.operation_id === op.id);
            const isExpanded = expandedOperations[op.id];
            return (
              <React.Fragment key={op.id}>
                <tr className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => toggleOperationExpand(op.id)}>
                  <td className="px-3 py-2">
                    <div className="flex items-center">
                      {plan ? (isExpanded ? <ChevronDown size={14} className="mr-1.5" /> : <ChevronRight size={14} className="mr-1.5" />) : <span className="w-3.5 mr-1.5" />}
                      <span className="text-xs font-medium">{op.operation_number || idx + 1}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs">{op.operation_name}</td>
                  <td className="px-3 py-2 text-xs">{plan?.setup_time || '00:00:00'}</td>
                  <td className="px-3 py-2 text-xs">{plan?.cycle_time || '00:00:00'}</td>
                  <td className="px-3 py-2 text-xs">{plan?.workcenter || 'N/A'}</td>
                </tr>
                {isExpanded && plan && (
                  <tr className="bg-gray-50">
                    <td colSpan="5" className="px-3 py-3">
                      <div className="pl-6 space-y-2">
                        <div>
                          <h4 className="font-semibold text-xs mb-1">Work Instructions</h4>
                          <p className="text-xs text-gray-700 whitespace-pre-line">{plan.work_instructions || 'No work instructions provided.'}</p>
                        </div>
                        {plan.notes && (
                          <div>
                            <h4 className="font-semibold text-xs mb-1">Notes</h4>
                            <p className="text-xs text-gray-700 whitespace-pre-line">{plan.notes}</p>
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
  );

  const EmptyState = ({ message }) => (
    <div className="text-center py-8 bg-gray-50 rounded-md border-2 border-dashed">
      <p className="text-xs text-gray-500">{message}</p>
    </div>
  );

  const renderDetailsPanel = () => {
    if (!selectedItem) return <EmptyState message="Select a part to view details" />;

    const isPart = ['part', 'make', 'buy'].includes(selectedItem.type?.toLowerCase());
    if (!isPart) return <div className="text-center py-8"><p className="text-xs text-gray-400">Select a part to view {bomView === 'ebom' ? 'documents' : 'operations'}</p></div>;

    if (bomView === 'ebom') {
      return (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold mb-2">Documents ({selectedItem.documents?.length || 0})</h3>
          {selectedItem.documents?.length > 0 ? (
            <DocumentTable documents={selectedItem.documents} />
          ) : (
            <EmptyState message="No documents available for this part" />
          )}
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold mb-2">Operations ({selectedItem.operations?.length || 0})</h3>
        <p className="text-xs text-gray-500 mb-2">Click on an operation to view process plan details</p>
        {selectedItem.operations?.length > 0 ? (
          <OperationsTable operations={selectedItem.operations} processPlans={selectedItem.process_plans} />
        ) : (
          <EmptyState message="No operations defined for this part" />
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="container mx-auto p-3">
        <div className="flex items-center mb-3">
          <Button variant="outline" size="sm" disabled className="h-7 text-xs"><ArrowLeft className="h-3 w-3 mr-1" />Back</Button>
          <h1 className="text-lg font-semibold ml-2">Loading...</h1>
        </div>
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-3 border-blue-600 border-r-transparent" />
        </div>
      </div>
    );
  }

  if (!bomData) {
    return (
      <div className="container mx-auto p-3">
        <div className="flex items-center mb-3">
          <Button variant="outline" size="sm" onClick={onBackToOrders} className="h-7 text-xs"><ArrowLeft className="h-3 w-3 mr-1" />Back</Button>
          <h1 className="text-lg font-semibold ml-2">{product?.product_name || 'Product'} BOM</h1>
        </div>
        <div className="bg-red-50 border-l-4 border-red-500 p-3">
          <p className="text-sm text-red-700">Failed to load BOM data. Please try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-3">
      <div className="flex justify-between items-center mb-3">
        <Button variant="outline" size="sm" onClick={onBackToOrders} className="h-7 text-xs"><ArrowLeft className="h-3 w-3 mr-1" />Back</Button>
        <h1 className="text-lg font-bold">Product Bill of Materials</h1>
        <div className="flex items-center space-x-1">
          {['mbom', 'ebom'].map(view => (
            <Button key={view} variant={bomView === view ? 'default' : 'outline'} size="sm" onClick={() => setBomView(view)} className="h-7 text-xs">{view.toUpperCase()}</Button>
          ))}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="w-full lg:w-1/3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">BOM Structure</CardTitle></CardHeader>
            <CardContent className="pt-0">
              <ScrollArea className="h-[calc(100vh-220px)]">{bomData && renderBOMItem(bomData)}</ScrollArea>
            </CardContent>
          </Card>
        </div>

        <div className="flex-1">
          <Card>
            <CardHeader className="bg-gray-50 pb-2">
              <CardTitle className="text-sm">{selectedItem?.name || 'Select an item'}</CardTitle>
              {selectedItem && <p className="text-xs text-gray-600 uppercase">{selectedItem.type}</p>}
            </CardHeader>
            <CardContent className="pt-2">
              <ScrollArea className="h-[calc(100vh-220px)]">{renderDetailsPanel()}</ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      {documentModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl max-h-[85vh] w-full mx-3">
            <div className="flex items-center justify-between p-3 border-b">
              <h3 className="text-sm font-semibold">{documentModal.name || 'Document'}</h3>
              <button onClick={() => setDocumentModal({ isOpen: false, url: null, name: null })} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4">
              <div className="h-[70vh]">
                {documentModal.url ? (
                  <iframe src={documentModal.url} className="w-full h-full border-0 rounded" title={documentModal.name || 'Document'} />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500">Document URL is not available</div>
                )}
              </div>
            </div>
            <div className="flex justify-end p-4 border-t">
              <button onClick={() => setDocumentModal({ isOpen: false, url: null, name: null })} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductBOMView;