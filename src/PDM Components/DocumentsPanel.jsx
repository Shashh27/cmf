import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { PlusOutlined, DownloadOutlined, FileTextOutlined, EyeOutlined, SyncOutlined, ToolOutlined, ClockCircleOutlined, EnvironmentOutlined, DeleteOutlined, InboxOutlined, FilePdfOutlined, UploadOutlined, EditOutlined } from "@ant-design/icons";
import { API_BASE_URL } from "../Config/auth";
import { Tabs, Button, Badge, Table, Select, Empty, Spin, message, Tooltip, Tag, Modal, Popconfirm, Typography, Upload, Input, Form } from "antd";

const { Text } = Typography;
const { Dragger } = Upload;
import PartActionModal from "./PartActionModal";
import EditOperationModal from "./EditOperationModal";
import OperationImportModal from "./OperationImportModal";

const OperationDocumentsList = ({ operationId, onPreview }) => {
    const [docs, setDocs] = useState([]);
    const [loading, setLoading] = useState(false);
    
    useEffect(() => {
        let isMounted = true;
        const controller = new AbortController();
        
        // Debounce the fetch to prevent double-calls in StrictMode
        const timer = setTimeout(() => {
            if (operationId) {
                fetchDocs(controller.signal, isMounted);
            }
        }, 100);

        return () => {
            isMounted = false;
            clearTimeout(timer);
            controller.abort();
        };
    }, [operationId]);

    const fetchDocs = async (signal, isMounted) => {
        if (!isMounted) return;
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/operation-documents/operation/${operationId}`, { signal });
            if (response.ok) {
                const data = await response.json();
                if (isMounted) setDocs(data);
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error("Error fetching operation documents:", error);
            }
        } finally {
            if (isMounted && !signal?.aborted) {
                setLoading(false);
            }
        }
    };

    const columns = [
        {
            title: 'Type',
            dataIndex: 'document_type',
            key: 'document_type',
            width: 120,
            render: (text) => (
                <Tag color="blue" variant="filled" className="mr-0">
                    {text || 'DOC'}
                </Tag>
            )
        },
        {
            title: 'Document Name',
            dataIndex: 'document_name',
            key: 'document_name',
            ellipsis: true,
            render: (text) => <span className="font-medium text-gray-800">{text}</span>
        },
        {
            title: 'Version',
            dataIndex: 'document_version',
            key: 'document_version',
            width: 100,
            render: (text) => <span className="text-blue-600 font-bold text-xs">v{text || '1.0'}</span>
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 80,
            align: 'center',
            render: (_, doc) => (
                <div className="flex gap-1 justify-center">
                    <Button 
                        size="small" 
                        type="text" 
                        className="text-blue-500 hover:bg-blue-50"
                        icon={<EyeOutlined />} 
                        onClick={() => onPreview(doc)} 
                    />
                    <Button 
                        size="small" 
                        type="text" 
                        className="text-green-500 hover:bg-green-50"
                        icon={<DownloadOutlined />} 
                        onClick={() => {
                            const downloadUrl = `${API_BASE_URL}/operation-documents/${doc.id}/download`;
                            const link = document.createElement('a');
                            link.href = downloadUrl;
                            link.setAttribute('download', doc.document_name);
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                        }} 
                    />
                </div>
            )
        }
    ];

    if (loading) return (
        <div className="p-4 flex justify-center">
            <Spin size="small">
                <span className="text-xs text-gray-600">Loading documents...</span>
            </Spin>
        </div>
    );
    
    if (!docs || docs.length === 0) return (
        <div className="p-6 text-center border border-dashed border-gray-300 rounded-lg bg-gray-50">
            <FileTextOutlined className="text-2xl text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">No documents attached to this operation</p>
        </div>
    );

    // Group documents by root parent for display
    const groupedDocs = docs.reduce((acc, doc) => {
        const rootId = doc.parent_id || doc.id;
        if (!acc[rootId]) acc[rootId] = [];
        acc[rootId].push(doc);
        return acc;
    }, {});

    // Get only the latest version for each root
    const latestDocs = Object.values(groupedDocs).map(group => {
        return [...group].sort((a, b) => parseFloat(b.document_version) - parseFloat(a.document_version))[0];
    });

    return (
        <Table 
            dataSource={latestDocs} 
            columns={columns} 
            rowKey="id" 
            pagination={false} 
            size="small" 
            bordered
            className="bg-white"
            scroll={{ x: 'max-content' }}
            expandable={{
                expandedRowRender: (record) => {
                    const group = groupedDocs[record.parent_id || record.id] || [];
                    const versions = [...group].sort((a, b) => parseFloat(b.document_version) - parseFloat(a.document_version));
                    
                    return (
                        <div className="bg-gray-50 p-3 rounded">
                            <p className="text-xs font-medium text-gray-600 mb-2">Version History:</p>
                            <div className="flex flex-col gap-2">
                                {versions.map(ver => (
                                    <div
                                        key={ver.id}
                                        className="flex justify-between items-center bg-white px-3 py-2 rounded border border-gray-200 shadow-sm"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <Tag color="blue" variant="filled" className="text-[10px] m-0 px-2">
                                                v{ver.document_version}
                                            </Tag>
                                            <span className="text-xs text-gray-700 truncate">
                                                {ver.document_name}
                                            </span>
                                        </div>
                                        <div className="flex gap-2">
                                            <Tooltip title="Preview">
                                                <Button 
                                                    size="small" 
                                                    type="text" 
                                                    icon={<EyeOutlined />} 
                                                    onClick={() => onPreview(ver)}
                                                    className="text-blue-500 hover:bg-blue-50"
                                                />
                                            </Tooltip>
                                            <Tooltip title="Download">
                                                <Button 
                                                    size="small" 
                                                    type="text" 
                                                    icon={<DownloadOutlined />}
                                                    onClick={() => {
                                                        const downloadUrl = `${API_BASE_URL}/operation-documents/${ver.id}/download`;
                                                        window.open(downloadUrl, '_blank');
                                                    }}
                                                    className="text-green-500 hover:bg-green-50"
                                                />
                                            </Tooltip>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                },
                rowExpandable: (record) => {
                    const group = groupedDocs[record.parent_id || record.id] || [];
                    return group.length > 1;
                },
            }}
        />
    );
};

const FitTable = ({ columns, dataSource, ...props }) => {
    const containerRef = useRef(null);
    const [scrollY, setScrollY] = useState('calc(100vh - 450px)');

    useEffect(() => {
        const updateHeight = () => {
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                const viewportHeight = window.innerHeight;
                const availableHeight = viewportHeight - rect.top - 80; // 80px for bottom margin
                setScrollY(`${Math.max(availableHeight, 400)}px`); // Minimum 400px
            }
        };
        const ro = new ResizeObserver(updateHeight);
        if (containerRef.current) ro.observe(containerRef.current);
        updateHeight();
        window.addEventListener('resize', updateHeight);
        return () => { ro.disconnect(); window.removeEventListener('resize', updateHeight); };
    }, []);

    return (
        <div className="flex-1 min-h-0 overflow-hidden" ref={containerRef} style={{ height: '100%' }}>
            <Table 
                columns={columns} 
                dataSource={dataSource} 
                pagination={false} 
                scroll={{ y: scrollY, x: 'max-content' }} 
                {...props} 
            />
        </div>
    );
};

const DocumentsPanel = ({ selectedItem, onDocumentsLoaded }) => {
  const [documents, setDocuments] = useState([]);
  const [operations, setOperations] = useState([]);
  const [activeTab, setActiveTab] = useState('mbom');
  const [loading, setLoading] = useState(false);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [replaceFileDocument, setReplaceFileDocument] = useState(null);
  const [showPartActionModal, setShowPartActionModal] = useState(false);
  const [partActionType, setPartActionType] = useState('');
  const [selectedOperation, setSelectedOperation] = useState(null);
  const [isOperationModalOpen, setIsOperationModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState('details');
  const [showAddToolForm, setShowAddToolForm] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importOperations, setImportOperations] = useState([]);
  
  // New: Selected versions for table display
  const [selectedVersions, setSelectedVersions] = useState({}); // { rootId: documentObject }
  const [isEditDocModalOpen, setIsEditDocModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null);

  // Group documents by root parent
  const groupedPartDocs = useMemo(() => {
    return documents.reduce((acc, doc) => {
      const rootId = doc.parent_id || doc.id;
      if (!acc[rootId]) acc[rootId] = [];
      acc[rootId].push(doc);
      return acc;
    }, {});
  }, [documents]);

  // Get latest documents for each root
  const latestPartDocs = useMemo(() => {
    return Object.values(groupedPartDocs).map(group => {
      return [...group].sort((a, b) => parseFloat(b.document_version) - parseFloat(a.document_version))[0];
    });
  }, [groupedPartDocs]);

  // Update selectedVersions when latestPartDocs changes
   useEffect(() => {
     const updatedSelected = { ...selectedVersions };
     let changed = false;
     
     latestPartDocs.forEach(doc => {
       const rootId = doc.parent_id || doc.id;
       if (!updatedSelected[rootId] || !groupedPartDocs[rootId]?.find(d => d.id === updatedSelected[rootId].id)) {
         updatedSelected[rootId] = doc;
         changed = true;
       }
     });
 
     if (changed) {
       setSelectedVersions(updatedSelected);
     }
   }, [latestPartDocs, groupedPartDocs]);

   const [uploading, setUploading] = useState(false);
   const [selectedFileList, setSelectedFileList] = useState([]);
   const [uploadDocType, setUploadDocType] = useState('2D');
  const [uploadDocTypeOther, setUploadDocTypeOther] = useState('');
   const [uploadParentId, setUploadParentId] = useState(null);
   const [uploadVersion, setUploadVersion] = useState('1.0');
  const fileInputRef = useRef(null);

   useEffect(() => {
     if (selectedItem) fetchDocuments();
     else {
       setDocuments([]);
       setOperations([]);
     }
   }, [selectedItem]);

   const fetchDocuments = async () => {
     setLoading(true);
     try {
       if (!selectedItem || selectedItem.itemType !== 'part') {
         setDocuments([]);
         setOperations([]);
        if (onDocumentsLoaded) {
          onDocumentsLoaded([]);
        }
         return;
       }

       const [docsResponse, opsResponse] = await Promise.all([
         fetch(`${API_BASE_URL}/documents/part/${selectedItem.id}`),
         fetch(`${API_BASE_URL}/operations/part/${selectedItem.id}`)
       ]);

       if (docsResponse.ok && opsResponse.ok) {
         const foundDocuments = await docsResponse.json();
         const foundOperations = await opsResponse.json();
         setDocuments(foundDocuments);
         setOperations(foundOperations);
        if (onDocumentsLoaded) {
          onDocumentsLoaded(foundDocuments);
        }
       }
     } catch (error) {
       console.error("Error fetching data:", error);
     } finally {
       setLoading(false);
     }
   };

  const handleDownload = (documentId) => {
    // Simply open the download URL in a new tab or trigger direct download
    // The backend now provides the correct Content-Disposition with filename and extension
    const downloadUrl = `${API_BASE_URL}/documents/${documentId}/download`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePreview = useCallback((document) => {
    if (!document.document_url) {
      message.error("Document URL not found");
      return;
    }
    setPreviewDocument(document);
    setIsPreviewModalOpen(true);
  }, []);



  const handleReplaceFile = (doc) => {
    setReplaceFileDocument(doc);
    fileInputRef.current?.click();
  };

  const handleUseImportedOperations = (ops) => {
    setImportOperations(ops);
    setShowImportModal(false);
    openPartActionModal('operation');
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

  const openPartActionModal = (type) => {
    if (!selectedItem || selectedItem.itemType !== 'part') {
      message.warning("Please select a part to add operations/documents");
      return;
    }
    setPartActionType(type);
    setShowPartActionModal(true);
  };

  const handleActionCreated = async (newItem, type) => {
    const messages = {
      operation: `Operation "${newItem.operation_name}" created successfully!`,
      document: `Document "${newItem.document_name}" created successfully!`
    };
    message.success(messages[type]);
    await fetchDocuments();
    setImportOperations([]);
  };

  const handleUpload = async () => {
    if (selectedFileList.length === 0) {
      message.warning('Please select a file first');
      return;
    }

    const file = selectedFileList[0];
    let effectiveDocType = uploadDocType;
    if (uploadDocType === 'Other') {
      if (!uploadDocTypeOther.trim()) {
        message.warning('Please enter document type');
        return;
      }
      effectiveDocType = uploadDocTypeOther.trim();
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('document_name', file.name.split('.')[0]);
    formData.append('document_type', effectiveDocType);
    formData.append('document_version', uploadVersion);
    formData.append('part_id', selectedItem.id.toString());
    
    if (uploadParentId) {
      formData.append('parent_id', uploadParentId.toString());
    }

    try {
      const response = await fetch(`${API_BASE_URL}/documents/`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        message.success('Document uploaded successfully');
        setSelectedFileList([]);
        setUploadParentId(null);
        setUploadVersion('1.0');
        setUploadDocType('2D');
        setUploadDocTypeOther('');
        setIsUploadModalOpen(false);
        await fetchDocuments();
      } else {
        const errorData = await response.json();
        message.error(errorData.detail || 'Failed to upload document');
      }
    } catch (error) {
      console.error('Error uploading document:', error);
      message.error('Error uploading document');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDocument = async (docId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/documents/${docId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        message.success('Document deleted successfully');
        await fetchDocuments();
      } else {
        const error = await response.json();
        message.error(error.detail || 'Failed to delete document');
      }
    } catch (error) {
      console.error('Error deleting document:', error);
      message.error('Error deleting document');
    }
  };

  const handleEditDocument = async (values) => {
    try {
      const response = await fetch(`${API_BASE_URL}/documents/${editingDoc.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (response.ok) {
        message.success('Document updated successfully');
        setIsEditDocModalOpen(false);
        setEditingDoc(null);
        await fetchDocuments();
      } else {
        const error = await response.json();
        message.error(error.detail || 'Failed to update document');
      }
    } catch (error) {
      console.error('Error updating document:', error);
      message.error('Error updating document');
    }
  };

  const initiateNewVersion = (doc, latestVer) => {
    const nextVer = (parseFloat(latestVer) + 1.0).toFixed(1);
    setUploadParentId(doc.parent_id || doc.id);
    setUploadVersion(nextVer);
    setUploadDocType(doc.document_type || '2D');
    setIsUploadModalOpen(true);
  };

  const handleDeleteOperation = async (operationId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/operations/${operationId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        message.success("Operation deleted successfully");
        fetchDocuments(); // Refresh the list
      } else {
        message.error("Failed to delete operation");
      }
    } catch (error) {
      console.error("Error deleting operation:", error);
      message.error("Error deleting operation");
    }
  };

  const documentsColumns = [
    {
      title: <span className="font-semibold text-gray-700">Type</span>,
      dataIndex: 'document_type',
      key: 'document_type',
      width: 140,
      render: (type) => (
        <div className="flex items-center gap-2">
          <FileTextOutlined className="text-blue-500" />
          <Tag color="blue" className="text-xs">{type || 'Document'}</Tag>
        </div>
      ),
    },
    {
      title: <span className="font-semibold text-gray-700">Document Name</span>,
      dataIndex: 'document_name',
      key: 'document_name',
      render: (name) => (
        <span className="text-sm font-medium text-gray-800">
          {name || 'Untitled Document'}
        </span>
      ),
    },
    {
      title: <span className="font-semibold text-gray-700">Version</span>,
      dataIndex: 'document_version',
      key: 'document_version',
      width: 100,
      render: (version) => (
        <Tag color="green">{version || 'v1'}</Tag>
      ),
    },
    {
      title: <span className="font-semibold text-gray-700">Actions</span>,
      key: 'actions',
      width: 150,
      render: (_, record) => (
        <div className="flex gap-2">
          <Tooltip title="Preview">
            <Button 
              size="small" 
              icon={<EyeOutlined />} 
              onClick={(e) => { e.stopPropagation(); handlePreview(record); }} 
              className="hover:text-blue-500"
            />
          </Tooltip>
          <Tooltip title="Download">
            <Button 
              size="small" 
              icon={<DownloadOutlined />} 
              onClick={(e) => { e.stopPropagation(); handleDownload(record.id); }} 
              className="hover:text-green-500"
            />
          </Tooltip>
          <Tooltip title="Replace File">
             <Button 
               size="small" 
               icon={<SyncOutlined />} 
               onClick={(e) => { e.stopPropagation(); handleReplaceFile(record); }} 
               className="hover:text-orange-500"
             />
          </Tooltip>
        </div>
      ),
    },
  ];

  const operationsColumns = [
    { title: 'Op #', dataIndex: 'operation_number', key: 'operation_number', width: 70,
      render: (t, _, i) => (
        <Tag color="cyan" className="font-mono text-sm font-medium m-0 px-1.5 py-0.5">
          {String(t || i + 1).padStart(2, '0')}
        </Tag>
      ) },
    { title: <span className="font-semibold text-slate-700">Operation Name</span>, dataIndex: 'operation_name', key: 'operation_name', ellipsis: { showTitle: true }, minWidth: 150,
      render: (n) => <span className="text-sm font-medium text-slate-900">{n || '—'}</span> },
    { title: <span><ClockCircleOutlined className="mr-0.5" /> Setup</span>, dataIndex: 'setup_time', key: 'setup_time', width: 100,
      render: (t) => <Tag color="orange" className="text-sm font-medium m-0 px-1.5 py-0.5">{t || '00:00:00'}</Tag> },
    { title: <span><ClockCircleOutlined className="mr-0.5" /> Cycle</span>, dataIndex: 'cycle_time', key: 'cycle_time', width: 100,
      render: (t) => <Tag color="green" className="text-sm font-medium m-0 px-1.5 py-0.5">{t || '00:00:00'}</Tag> },
    { title: <span><EnvironmentOutlined className="mr-0.5" /> Workcenter</span>, dataIndex: 'workcenter_id', key: 'workcenter_id',
      render: (id, r) => (
        <Tag color="purple" className="text-sm font-medium m-0 px-1.5 py-0.5 whitespace-normal">
          {r.work_center_name || id || 'N/A'}
        </Tag>
      ) },
    { title: <span className="font-semibold text-slate-700">Machine</span>, dataIndex: 'machine_id', key: 'machine_id',
      render: (id, r) => (
        <Tag color="geekblue" className="text-sm font-medium m-0 px-1.5 py-0.5 whitespace-normal">
          {r.machine_name || id || 'N/A'}
        </Tag>
      ) },
    { title: <span className="font-semibold text-slate-700">Operation Type</span>, dataIndex: 'part_type_id', key: 'part_type',
      render: (_, r) => (
        <Tag color={r.part_type_name === 'Out-Source' ? 'orange' : 'blue'} className="m-0 px-1.5 py-0.5 text-xs">
          {r.part_type_name || 'IN-House'}
        </Tag>
      ) },
    { title: <span className="font-semibold text-slate-700">From Date</span>, dataIndex: 'from_date', key: 'from_date',
      render: (val) => {
        if (!val) return <span className="text-slate-500">—</span>;
        const d = typeof val === 'string' ? new Date(val) : val;
        return <span className="text-sm text-slate-700">{isNaN(d.getTime()) ? '—' : d.toLocaleDateString()}</span>;
      } },
    { title: <span className="font-semibold text-slate-700">To Date</span>, dataIndex: 'to_date', key: 'to_date',
      render: (val) => {
        if (!val) return <span className="text-slate-500">—</span>;
        const d = typeof val === 'string' ? new Date(val) : val;
        return <span className="text-sm text-slate-700">{isNaN(d.getTime()) ? '—' : d.toLocaleDateString()}</span>;
      } },
    { title: <span className="font-semibold text-slate-700 text-center block">Actions</span>, key: 'actions', align: 'center', width: 120, fixed: 'right',
      render: (_, record) => {
        const isOutSource = record.part_type_name === 'Out-Source' || record.part_type_id === 2;
        return (
        <div className="flex gap-0.5 justify-center" onClick={e => e.stopPropagation()}>
          <Tooltip title="Edit"><Button size="small" icon={<EditOutlined />} onClick={() => { setSelectedOperation(record); setModalTab('details'); setShowAddToolForm(false); setIsOperationModalOpen(true); }} className="text-blue-500 hover:bg-blue-50" /></Tooltip>
          {!isOutSource && (
            <Tooltip title="Add Tool"><Button size="small" icon={<ToolOutlined />} onClick={() => { setSelectedOperation(record); setModalTab('tools'); setShowAddToolForm(true); setIsOperationModalOpen(true); }} className="text-orange-500 hover:bg-orange-50" /></Tooltip>
          )}
          <Popconfirm title="Delete operation?" onConfirm={() => handleDeleteOperation(record.id)} okText="Yes" cancelText="No">
            <Button size="small" danger icon={<DeleteOutlined />} className="hover:bg-red-50" />
          </Popconfirm>
        </div>
        );
      } },
  ];

  if (!selectedItem || selectedItem.itemType !== 'part') {
    return <div className="flex-1 bg-gray-50" />;
  }

  const tabItems = [
    {
      key: 'mbom',
      label: <span className="font-medium">mBOM</span>,
      children: (
        <div className="h-full flex flex-col min-h-0">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-1.5 shrink-0 gap-2">
            <span className="text-xs text-slate-500">Click row to view or edit</span>
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <Button
                size="small"
                icon={<UploadOutlined />}
                onClick={() => setShowImportModal(true)}
                disabled={!selectedItem || selectedItem.itemType !== 'part'}
                className="primary-btn-sm flex-1 sm:flex-initial"
              >
                <span className="hidden sm:inline">Upload MPP</span>
                <span className="sm:hidden">MPP</span>
              </Button>
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                onClick={() => {
                  setImportOperations([]);
                  openPartActionModal('operation');
                }}
                disabled={!selectedItem || selectedItem.itemType !== 'part'}
                className="primary-btn-sm flex-1 sm:flex-initial"
              >
                <span className="hidden sm:inline">Add Operation</span>
                <span className="sm:hidden">Add Op</span>
              </Button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <FitTable dataSource={operations} columns={operationsColumns} rowKey="id" size="small"
              className="docs-ops-table cursor-pointer"
              onRow={(record) => ({
              onClick: () => {
                setSelectedOperation(record);
                setModalTab('details');
                setShowAddToolForm(false);
                setIsOperationModalOpen(true);
              },
            })}
              locale={{ emptyText: <Empty description="No operations" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
            />
          </div>
        </div>
      ),
    },
    {
      key: 'ebom',
      label: <span className="font-medium">eBOM</span>,
      children: (
        <div className="h-full flex flex-col min-h-0 overflow-hidden">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2 shrink-0 gap-2">
            <span className="text-xs text-slate-500">Documents & versions</span>
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => openPartActionModal('document')} className="primary-btn-sm w-full sm:w-auto">
              Add Document
            </Button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <Table
                    dataSource={latestPartDocs}
                    rowKey="id"
                    size="small"
                    pagination={false}
                    className="docs-ebom-table border border-slate-100 rounded-lg overflow-hidden"
                    scroll={{ y: 'calc(100vh - 450px)', x: 600 }}
                    columns={[
                        {
                            title: <span className="text-xs font-semibold">DOCUMENT NAME</span>,
                            key: 'document_name',
                            render: (_, record) => {
                                const rootId = record.parent_id || record.id;
                                const currentDoc = selectedVersions[rootId] || record;
                                const isLatest = currentDoc.id === record.id;
                                return (
                                    <div className="flex items-center gap-3 py-1">
                                        <div className="p-2 bg-blue-50 rounded">
                                            <FilePdfOutlined className="text-blue-500" />
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <Text strong className="text-sm truncate max-w-[300px]">{currentDoc.document_name}</Text>
                                            {!isLatest && (
                                                <div className="flex items-center gap-2">
                                                   
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            }
                        },
                        {
                            title: <span className="text-xs font-semibold">DOCUMENT TYPE</span>,
                            key: 'document_type',
                            width: 120,
                            render: (_, record) => {
                                const rootId = record.parent_id || record.id;
                                const currentDoc = selectedVersions[rootId] || record;
                                return (
                                    <Tag color="blue" className="m-0 text-xs px-1 leading-4 uppercase border-none bg-blue-100 text-blue-700">
                                        {currentDoc.document_type || '2D'}
                                    </Tag>
                                );
                            }
                        },
                        {
                            title: <span className="text-xs font-semibold">VERSION</span>,
                            key: 'version',
                            width: 150,
                            render: (_, record) => {
                                const rootId = record.parent_id || record.id;
                                const group = groupedPartDocs[rootId] || [];
                                const currentDoc = selectedVersions[rootId] || record;
                                const latestDoc = record;
                                
                                return (
                                    <Select
                                        size="small"
                                        value={currentDoc.id}
                                        variant="filled"
                                        className="w-full version-select"
                                        onChange={(val) => {
                                            const selected = group.find(d => d.id === val);
                                            setSelectedVersions(prev => ({ ...prev, [rootId]: selected }));
                                        }}
                                        styles={{ 
                                          popup: { 
                                            root: { minWidth: '180px', padding: '4px' } 
                                          } 
                                        }}
                                        labelRender={({ label, value }) => {
                                            const ver = group.find(d => d.id === value);
                                            return (
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-blue-600">v{ver?.document_version}</span>
                                                    <span className="text-[10px] text-gray-400">
                                                        {new Date(ver?.created_at || Date.now()).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            );
                                        }}
                                    >
                                        {group.sort((a,b) => parseFloat(b.document_version) - parseFloat(a.document_version)).map(ver => (
                                            <Select.Option key={ver.id} value={ver.id}>
                                                <div className="flex justify-between items-center w-full py-1">
                                                    <div className="flex items-center gap-2">
                                                        <Badge status={ver.id === latestDoc.id ? "success" : "default"} />
                                                        <span className={`font-bold ${ver.id === currentDoc.id ? 'text-blue-600' : 'text-gray-600'}`}>
                                                            v{ver.document_version}
                                                        </span>
                                                    </div>
                                                    <span className="text-[10px] text-gray-400 bg-gray-50 px-1 rounded">
                                                        {new Date(ver.created_at || Date.now()).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            </Select.Option>
                                        ))}
                                    </Select>
                                );
                            }
                        },
                        {
                            title: <span className="text-xs font-semibold text-center block">ACTIONS</span>,
                            key: 'actions',
                            width: 200,
                            align: 'center',
                            render: (_, record) => {
                                const rootId = record.parent_id || record.id;
                                const currentDoc = selectedVersions[rootId] || record;
                                const latestDoc = record; // record is always the latest because it comes from latestPartDocs

                                return (
                                    <div className="flex gap-1 justify-center">
                                        <Tooltip title="Preview">
                                            <Button 
                                                size="small" 
                                                type="text" 
                                                icon={<EyeOutlined />} 
                                                onClick={() => handlePreview(currentDoc)} 
                                                className="hover:text-blue-500 hover:bg-blue-50"
                                            />
                                        </Tooltip>
                                        <Tooltip title="Update Version">
                                            <Button 
                                                size="small" 
                                                type="text" 
                                                className="text-orange-500 hover:bg-orange-50"
                                                icon={<SyncOutlined />} 
                                                onClick={() => initiateNewVersion(latestDoc, latestDoc.document_version)}
                                            />
                                        </Tooltip>
                                        <Tooltip title="Edit Details">
                                            <Button 
                                                size="small" 
                                                type="text" 
                                                className="text-blue-500 hover:bg-blue-50"
                                                icon={<EditOutlined />} 
                                                onClick={() => {
                                                    setEditingDoc(currentDoc);
                                                    setIsEditDocModalOpen(true);
                                                }}
                                            />
                                        </Tooltip>
                                        <Tooltip title="Download">
                                            <Button 
                                                size="small" 
                                                type="text" 
                                                className="text-green-500 hover:bg-green-50"
                                                icon={<DownloadOutlined />} 
                                                onClick={() => handleDownload(currentDoc.id)}
                                            />
                                        </Tooltip>
                                        <Popconfirm
                                            title="Delete Document"
                                            description="Delete this version? This cannot be undone."
                                            onConfirm={() => handleDeleteDocument(currentDoc.id)}
                                            okText="Yes"
                                            cancelText="No"
                                        >
                                            <Button 
                                                size="small" 
                                                type="text" 
                                                danger
                                                icon={<DeleteOutlined />} 
                                                className="hover:bg-red-50"
                                            />
                                        </Popconfirm>
                                    </div>
                                );
                            }
                        }
                    ]}
                />
            </div>

            {/* Upload Modal */}
            <Modal
                title={
                    <div className="flex items-center gap-2">
                        <PlusOutlined className="text-blue-500" />
                        <span>{uploadParentId ? 'Upload New Version' : 'Add New Document'}</span>
                    </div>
                }
                open={isUploadModalOpen}
                onCancel={() => {
                    setIsUploadModalOpen(false);
                    setUploadParentId(null);
                    setUploadVersion('1.0');
                    setUploadDocType('2D');
                    setUploadDocTypeOther('');
                    setSelectedFileList([]);
                }}
                footer={null}
                destroyOnHidden
                width="95%"
                style={{ maxWidth: 450 }}
            >
                <div className="space-y-4 mt-4">
                    <div>
                        <Text type="secondary" className="text-xs block mb-1">Document Type</Text>
                        <Select 
                            className="w-full" 
                            value={uploadDocType}
                            onChange={setUploadDocType}
                        >
                            <Select.Option value="2D">2D Drawing</Select.Option>
                            <Select.Option value="3D">3D Model (STL/STEP)</Select.Option>
                          
                            <Select.Option value="Other">Other</Select.Option>
                        </Select>
                        {uploadDocType === 'Other' && (
                            <Input
                                className="mt-2"
                                placeholder="Enter custom document type"
                                value={uploadDocTypeOther}
                                onChange={(e) => setUploadDocTypeOther(e.target.value)}
                            />
                        )}
                    </div>

                    <div>
                        <Text type="secondary" className="text-xs block mb-1">Version</Text>
                        <Input 
                            value={uploadVersion} 
                            readOnly 
                            prefix={<Tag color="blue" className="m-0 mr-1">v</Tag>}
                            className="bg-gray-50"
                        />
                        {uploadParentId && (
                            <div className="mt-1">
                                <Text type="warning" className="text-[10px]">
                                    Creating a new version for an existing document.
                                </Text>
                            </div>
                        )}
                    </div>

                    <Dragger
                        multiple={false}
                        fileList={selectedFileList}
                        beforeUpload={(file) => {
                            setSelectedFileList([file]);
                            return false;
                        }}
                        onRemove={() => setSelectedFileList([])}
                        className="bg-gray-50 border-dashed border-2 py-8"
                    >
                        <p className="ant-upload-drag-icon">
                            <InboxOutlined className="text-3xl text-blue-400" />
                        </p>
                        <p className="ant-upload-text">Click or drag file here</p>
                        <p className="ant-upload-hint text-xs text-gray-400">
                            Supports PDF, STL, STEP, Images...
                        </p>
                    </Dragger>

                    <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
                        <Button onClick={() => setIsUploadModalOpen(false)} className="w-full sm:w-auto">Cancel</Button>
                        <Button 
                            type="primary" 
                            icon={<UploadOutlined />}
                            loading={uploading}
                            disabled={selectedFileList.length === 0}
                            onClick={handleUpload}
                            className="no-hover-btn w-full sm:w-auto"
                        >
                            {uploadParentId ? 'Upload New Version' : 'Upload Document'}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Edit Document Modal */}
            <Modal
                title={<div className="flex items-center gap-2"><EditOutlined className="text-blue-500" /> <span>Edit Document Details</span></div>}
                open={isEditDocModalOpen}
                onCancel={() => {
                    setIsEditDocModalOpen(false);
                    setEditingDoc(null);
                }}
                footer={null}
                destroyOnHidden
                width="95%"
                style={{ maxWidth: 450 }}
            >
                <Form
                    layout="vertical"
                    initialValues={editingDoc}
                    onFinish={handleEditDocument}
                    className="mt-4"
                >
                    <Form.Item
                        label="Document Name"
                        name="document_name"
                        rules={[{ required: true, message: 'Please enter document name' }]}
                    >
                        <Input placeholder="Enter document name" />
                    </Form.Item>
                    <Form.Item
                        label="Document Type"
                        name="document_type"
                        rules={[{ required: true, message: 'Please select document type' }]}
                    >
                        <Select placeholder="Select type">
                            <Select.Option value="2D">2D Drawing</Select.Option>
                            <Select.Option value="3D">3D Model (STL/STEP)</Select.Option>
                           
                            <Select.Option value="Other">Other</Select.Option>
                        </Select>
                    </Form.Item>
                    <div className="flex flex-col sm:flex-row justify-end gap-2 mt-6">
                        <Button onClick={() => setIsEditDocModalOpen(false)} className="w-full sm:w-auto">Cancel</Button>
                        <Button type="primary" htmlType="submit" className="no-hover-btn w-full sm:w-auto">Save Changes</Button>
                    </div>
                </Form>
            </Modal>
        </div>
      ),
    },
  ];

  return (
    <div className="flex-1 bg-white overflow-hidden flex flex-col h-full" style={{ height: '100%' }}>
      <style>
        {`
          .primary-btn-sm, .no-hover-btn, .primary-btn-sm:hover, .no-hover-btn:hover { background-color: #2563eb !important; color: #fff !important; border: none !important; }
          .docs-ops-table .ant-table-tbody > tr > td { padding: 8px 10px !important; }
          .docs-ops-table .ant-table-thead > tr > th { font-weight: 600; color: #334155 !important; padding: 8px 10px !important; }
          @media (max-width: 640px) {
            .docs-ops-table .ant-table-tbody > tr > td { padding: 5px 6px !important; font-size: 11px !important; }
            .docs-ops-table .ant-table-thead > tr > th { padding: 5px 6px !important; font-size: 11px !important; }
            .docs-ebom-table .ant-table-tbody > tr > td { padding: 5px 6px !important; font-size: 11px !important; }
            .docs-ebom-table .ant-table-thead > tr > th { padding: 5px 6px !important; font-size: 11px !important; }
          }
          .pdm-tabs-full.ant-tabs { display: flex; flex-direction: column; height: 100%; }
          .pdm-tabs-full .ant-tabs-content { flex: 1; min-height: 0; overflow: hidden; }
          .pdm-tabs-full .ant-tabs-tabpane { height: 100%; overflow: hidden; }
          .pdm-tabs-full .ant-tabs-content-holder { overflow: hidden; }
          .pdm-tabs-full .ant-tabs-body { height: 100%; overflow: hidden; }
        `}
      </style>
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden px-3 pt-2 pb-3" style={{ height: '100%' }}>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} className="flex-1 flex flex-col min-h-0 overflow-hidden pdm-tabs-full" style={{ height: '100%' }} />
      </div>
      
      <Modal
        title={previewDocument?.document_name || "Document Preview"}
        open={isPreviewModalOpen}
        onCancel={() => {
          setIsPreviewModalOpen(false);
          setPreviewDocument(null);
        }}
        width="95%"
        style={{ maxWidth: 1000, top: 20 }}
        footer={null}
        destroyOnHidden
        styles={{ body: { height: '75vh', padding: 0, overflow: 'hidden' } }}
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

     <OperationImportModal
       open={showImportModal}
       onCancel={() => setShowImportModal(false)}
       onUseOperations={handleUseImportedOperations}
     />

     <PartActionModal
       open={showPartActionModal}
       onCancel={() => setShowPartActionModal(false)}
       actionType={partActionType}
       selectedPart={selectedItem}
       onActionCreated={handleActionCreated}
       initialOperations={importOperations}
     />

     <EditOperationModal
        open={isOperationModalOpen}
        onCancel={() => {
            setIsOperationModalOpen(false);
            setSelectedOperation(null);
        }}
        operation={selectedOperation}
         defaultTab={modalTab}
         showAddToolForm={showAddToolForm}
         onUpdate={async () => {
             await fetchDocuments();
         }}
       />
   </div>
 );
};

export default DocumentsPanel;
