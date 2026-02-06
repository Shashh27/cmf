import React, { useState, useEffect, useRef } from "react";
import { PlusOutlined, DownloadOutlined, FileTextOutlined, EyeOutlined, SyncOutlined } from "@ant-design/icons";
import { API_BASE_URL } from "../Config/auth";
import { Card, Tabs, Button, Badge, Table, Select, Empty, Spin, message, Tooltip, Tag, Modal } from "antd";

const { TabPane } = Tabs;

const DocumentsPanel = ({ selectedItem }) => {
  const [documents, setDocuments] = useState([]);
  const [operations, setOperations] = useState([]);
  const [activeTab, setActiveTab] = useState('ebom');
  const [loading, setLoading] = useState(false);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [replaceFileDocument, setReplaceFileDocument] = useState(null);
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
      message.error("Failed to download document");
    }
  };

  const handlePreview = (document) => {
    if (!document.document_url) {
      message.error("Document URL not found");
      return;
    }
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
        if (response.ok) {
            await fetchDocuments();
            message.success("File replaced successfully");
        } else {
            message.error("Failed to replace file");
        }
      } catch (error) {
        console.error('Error replacing file:', error);
        message.error("Error replacing file");
      }
      event.target.value = '';
    }
  };

  const documentsColumns = [
    {
      title: 'Type',
      dataIndex: 'document_type',
      key: 'document_type',
      width: 120,
      render: (text) => <Tag color="blue">{text}</Tag>
    },
    {
      title: 'Document',
      dataIndex: 'document_name',
      key: 'document_name',
      ellipsis: true,
    },
    {
      title: 'Version',
      dataIndex: 'document_version',
      key: 'document_version',
      width: 100,
      render: (text) => <Tag>{text || 'v1'}</Tag>
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      render: (_, record) => (
        <div className="flex gap-2">
          <Tooltip title="Preview">
            <Button size="small" icon={<EyeOutlined />} onClick={() => handlePreview(record)} />
          </Tooltip>
          <Tooltip title="Download">
            <Button size="small" icon={<DownloadOutlined />} onClick={() => handleDownload(record.id)} />
          </Tooltip>
          <Tooltip title="Replace File">
             <Button size="small" icon={<SyncOutlined />} onClick={() => handleReplaceFile(record)} />
          </Tooltip>
        </div>
      ),
    },
  ];

  const operationsColumns = [
    {
      title: 'Op #',
      dataIndex: 'operation_number',
      key: 'operation_number',
      width: 80,
    },
    {
      title: 'Name',
      dataIndex: 'operation_name',
      key: 'operation_name',
    },
    {
      title: 'Setup',
      dataIndex: 'setup_time',
      key: 'setup_time',
      width: 100,
      render: (text) => <span className="font-mono text-xs">{text || '00:00:00'}</span>
    },
    {
      title: 'Cycle',
      dataIndex: 'cycle_time',
      key: 'cycle_time',
      width: 100,
      render: (text) => <span className="font-mono text-xs">{text || '00:00:00'}</span>
    },
    {
      title: 'Workcenter',
      dataIndex: 'workcenter_id',
      key: 'workcenter_id',
      width: 100,
    },
  ];

  const expandable = {
    expandedRowRender: (record) => {
        const processPlan = processPlans[record.id];
        if (!processPlan) {
            fetchProcessPlan(record.id);
            return <Spin size="small" />;
        }
        return (
            <div className="p-4 bg-gray-50 rounded">
                <div className="mb-4">
                    <h4 className="text-sm font-medium mb-1">Work Instructions</h4>
                    <div className="bg-white p-3 rounded border text-sm whitespace-pre-wrap">
                        {processPlan.work_instructions || 'No work instructions available'}
                    </div>
                </div>
                <div>
                    <h4 className="text-sm font-medium mb-1">Notes</h4>
                    <div className="bg-white p-3 rounded border text-sm whitespace-pre-wrap">
                        {processPlan.notes || 'No notes available'}
                    </div>
                </div>
            </div>
        );
    },
    onExpand: (expanded, record) => {
        if (expanded && !processPlans[record.id]) {
            fetchProcessPlan(record.id);
        }
    }
  };

  if (!selectedItem || selectedItem.itemType !== 'part') {
    return <div className="flex-1 bg-gray-50" />;
  }

  const tabItems = [
    {
      key: 'ebom',
      label: 'eBOM',
      children: (
        <Table 
            dataSource={documents} 
            columns={documentsColumns} 
            rowKey="id" 
            pagination={false} 
            size="small"
            locale={{ emptyText: <Empty description="No documents attached" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        />
      ),
    },
    {
      key: 'mbom',
      label: 'mBOM',
      children: (
        <div className="space-y-2">
            <div className="px-1">
                <h3 className="text-base font-medium mb-1">Operations</h3>
                <p className="text-xs text-gray-500">Click + to view process plan details</p>
            </div>
            <Table 
                dataSource={operations} 
                columns={operationsColumns} 
                rowKey="id" 
                pagination={false} 
                size="small"
                expandable={expandable}
                locale={{ emptyText: <Empty description="No operations found" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
            />
        </div>
      ),
    },
  ];

  return (
    <div className="flex-1 bg-white overflow-hidden flex flex-col h-full">
      <Card 
        bordered={false} 
        className="flex-1 flex flex-col shadow-none rounded-none" 
        bodyStyle={{ padding: '0 16px 16px 16px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        title={
            <div className="flex justify-between items-center">
                <span>Documents</span>
                <Badge count={documents.length} showZero style={{ backgroundColor: '#52c41a' }} />
            </div>
        }
      >
        <Tabs 
            activeKey={activeTab} 
            onChange={setActiveTab} 
            items={tabItems} 
            className="flex-1 flex flex-col overflow-hidden"
            style={{ height: '100%' }}
        />
      </Card>
      
      <Modal
        title={previewDocument?.document_name || "Document Preview"}
        open={isPreviewModalOpen}
        onCancel={() => {
          setIsPreviewModalOpen(false);
          setPreviewDocument(null);
        }}
        width={1000}
        footer={null}
        destroyOnClose
        style={{ top: 20 }}
        bodyStyle={{ height: '80vh', padding: 0, overflow: 'hidden' }}
      >
        <div className="w-full h-full bg-gray-50 flex items-center justify-center">
            {previewDocument?.document_url ? (
              <iframe 
                src={previewDocument.document_url} 
                className="w-full h-full border-0" 
                title={previewDocument.document_name}
              />
            ) : (
              <Empty description="No preview available" />
            )}
        </div>
      </Modal>
      <input ref={fileInputRef} type="file" accept=".pdf,.docx,.csv,.xlsx,.doc,.xls,.txt" style={{ display: 'none' }} onChange={handleFileSelect} />
    </div>
  );
};

export default DocumentsPanel;