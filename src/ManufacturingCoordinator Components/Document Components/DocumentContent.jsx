import React, { useState, useEffect, useMemo } from 'react';
import { Card, Typography, Empty, Button, Table, Space, message, Modal, Input, Upload, Tooltip, Select, Tag } from 'antd';
import { 
  FileOutlined, 
  FolderOutlined, 
  DeleteOutlined, 
  EyeOutlined, 
  EditOutlined, 
  DownloadOutlined,
  LoadingOutlined,
  UploadOutlined,
  CloudUploadOutlined,
  HistoryOutlined
} from '@ant-design/icons';
import config from '../Config/config';

const { Title, Text } = Typography;
const { Option } = Select;

const DocumentContent = ({ selectedNode, onDocumentsChange, documentTreeRef, documentsRefreshKey = 0 }) => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingDocument, setEditingDocument] = useState(null);
  const [newDocumentName, setNewDocumentName] = useState('');
  
  // Helper function to notify parent of document changes
  const notifyDocumentsChange = () => {
    // For machine folders or machine nodes, refresh only the specific machine tree to preserve expansion
    if (
      selectedNode &&
      (selectedNode.type === 'machine-folder' || selectedNode.type === 'machine') &&
      documentTreeRef &&
      documentTreeRef.current &&
      typeof documentTreeRef.current.refreshMachineFolders === 'function'
    ) {
      documentTreeRef.current.refreshMachineFolders(selectedNode.machineId);
      return;
    }

    // For all other types, use the generic callback (updates general tree, etc.)
    if (onDocumentsChange && typeof onDocumentsChange === 'function') {
      onDocumentsChange();
    }
  };
  
  // Version selection state - tracks selected version ID for each document family
  const [selectedVersions, setSelectedVersions] = useState({});
  
  // Version upload state
  const [versionModalVisible, setVersionModalVisible] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState(null);
  const [nextVersion, setNextVersion] = useState('');
  const [versionFileList, setVersionFileList] = useState([]);
  const [versionUploading, setVersionUploading] = useState(false);
  
  // Preview state
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [previewingDocument, setPreviewingDocument] = useState(null);

  // // Add Document state
  // const [addModalVisible, setAddModalVisible] = useState(false);
  // const [addFileList, setAddFileList] = useState([]);
  // const [addUploading, setAddUploading] = useState(false);
  // const [addDocType, setAddDocType] = useState('CNC');

  // Add Document state
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addFileList, setAddFileList] = useState([]);
  const [addUploading, setAddUploading] = useState(false);
  const [addDocType, setAddDocType] = useState('CNC');

  useEffect(() => {
    if (selectedNode) {
      if (selectedNode.type === 'general-folder' || 
          selectedNode.type === 'common-folder' ||
          selectedNode.type === 'common-root' ||
          selectedNode.type === 'part-category' || 
          selectedNode.type === 'operation-folder' ||
          selectedNode.type === 'machine-folder' ||
          selectedNode.type === 'machine' ||
          (selectedNode.type === 'folder' && selectedNode.category === 'Reports')) {
        fetchDocuments();
      } else {
        setDocuments([]);
      }
    } else {
      setDocuments([]);
    }
  }, [selectedNode, documentsRefreshKey]);

  const fetchDocuments = async () => {
    if (!selectedNode) return;

    setLoading(true);
    try {
      let url = '';
      if (selectedNode.type === 'general-folder') {
        url = `http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}general-documents/folders/${selectedNode.folderId}/documents`;
      } else if (selectedNode.type === 'common-folder') {
        url = `http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}common-documents/folders/${selectedNode.folderId}/documents`;
      } else if (selectedNode.type === 'common-root') {
        url = `http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}common-documents/all/documents`;
      } else if (selectedNode.type === 'part-category') {
        url = `${config.API_BASE_URL}/documents/part/${selectedNode.partId}`;
      } else if (selectedNode.type === 'operation-folder') {
        url = `${config.API_BASE_URL}/operation-documents/operation/${selectedNode.operationId}`;
      } else if (selectedNode.type === 'folder' && selectedNode.category === 'Reports') {
        url = `${config.API_BASE_URL}/order-documents/order/${selectedNode.orderId}`;
      } else if (selectedNode.type === 'machine-folder') {
        url = `http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}machine-documents/folders/${selectedNode.folderId}/documents`;
      } else if (selectedNode.type === 'machine') {
        url = `http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}machine-documents/machines/${selectedNode.machineId}/documents`;
      }

      if (!url) {
        setDocuments([]);
        setLoading(false);
        return;
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }
      let data = await response.json();

      // Normalize data and filter if needed
      if (selectedNode.type === 'part-category') {
        const category = selectedNode.category;
        data = data.filter(doc => {
          const docType = (doc.document_type || '').toLowerCase();
          if (category === 'MPP') return docType === 'mpp';
          if (category === 'ENGINEERING_DRAWING') return docType === '2d' || docType === '3d';
          if (category === 'IPID') return docType === 'ipid';
          if (category === 'Balloon') return docType === 'balloon';
          return false;
        });
      }

      // Map field names to a consistent format
      const normalizedData = data.map(doc => ({
        ...doc,
        file_name: doc.file_name || doc.document_name,
        version: doc.version || doc.document_version,
        url: doc.document_url || doc.url, // Ensure we have a URL for preview
        doc_source_type: selectedNode.type, // Keep track of where it came from
        general_folder_id: doc.general_folder_id || selectedNode.folderId,
        machine_folder_id: doc.machine_folder_id || selectedNode.folderId,
        // For machine documents and common documents, use the versions array from backend
        versions: (
          selectedNode.type === 'machine-folder' || 
          selectedNode.type === 'machine' || 
          selectedNode.type === 'common-folder' ||
          selectedNode.type === 'common-root'
        ) && doc.versions ? doc.versions : undefined
      }));

      // Reset selected versions when new documents are fetched
      setSelectedVersions({});
      setDocuments(normalizedData);
    } catch (error) {
      message.error('Failed to fetch documents: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Group documents by their unique identity (family) to handle versioning
  const groupedDocuments = useMemo(() => {
    const groups = {};
    
    documents.forEach(doc => {
      // For machine and common documents, each document already represents a family with versions array
      if (
        (doc.doc_source_type === 'machine-folder' || 
         doc.doc_source_type === 'machine' ||
         doc.doc_source_type === 'common-folder' ||
         doc.doc_source_type === 'common-root') 
        && doc.versions
      ) {
        // Use the document's family ID (parent_id or id) as the key
        const familyId = doc.parent_id || doc.id;
        const familyKey = `${doc.doc_source_type}-${familyId}`;
        
        if (!groups[familyKey]) {
          groups[familyKey] = doc.versions.map(version => ({
            ...version,
            file_name: version.file_name || version.document_name,
            version: version.version,
            url: version.document_url || version.url,
            doc_source_type: doc.doc_source_type,
            general_folder_id: doc.general_folder_id,
            machine_folder_id: doc.machine_folder_id
          }));
        }
      } else {
        // For other document types, group by parent_id/id as before
        const familyId = doc.parent_id || doc.id;
        const familyKey = `${doc.doc_source_type}-${familyId}`;

        if (!groups[familyKey]) {
          groups[familyKey] = [];
        }
        groups[familyKey].push(doc);
      }
    });

    // For each group, sort by version descending
    return Object.values(groups).map(group => {
      const sortedGroup = [...group].sort((a, b) => {
        const vA = parseFloat(a.version) || 0;
        const vB = parseFloat(b.version) || 0;
        return vB - vA;
      });
      
      // The family ID is the root document ID (parent_id of versions, or id of the root itself)
      const familyId = sortedGroup[0].parent_id || sortedGroup[0].id;
      
      const selectedId = selectedVersions[familyId];
      // If no version is selected, default to the latest version (sortedGroup[0])
      const activeDoc = selectedId ? sortedGroup.find(d => d.id === selectedId) : sortedGroup[0];

      return {
        ...activeDoc,
        allVersions: sortedGroup,
        familyId: familyId
      };
    });
  }, [documents, selectedVersions]);

  const columns = [
    {
      title: 'Sl No',
      key: 'slNo',
      render: (_, record, index) => index + 1,
      width: 60,
    },
    {
      title: 'Document Name',
      dataIndex: 'file_name',
      key: 'file_name',
      render: (text, record) => (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <div style={{ 
            width: '32px', 
            height: '32px', 
            backgroundColor: '#e6f7ff', 
            borderRadius: '4px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            marginTop: '2px'
          }}>
            <FileOutlined style={{ color: '#1890ff', fontSize: '18px' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <Text strong style={{ fontSize: '14px', color: '#262626' }}>{text}</Text>
            {record.document_type && (
              <Tag size="small" style={{ 
                fontSize: '10px', 
                margin: 0, 
                width: 'fit-content', 
                padding: '0 4px',
                backgroundColor: '#f5f5f5',
                color: '#8c8c8c',
                border: 'none',
                lineHeight: '16px',
                marginTop: '2px'
              }}>
                {record.document_type.toUpperCase()}
              </Tag>
            )}
          </div>
        </div>
      ),
    },
    {
      title: 'Version',
      key: 'version',
      width: 220,
      render: (_, record) => {
        // Hide version options for maintenance documents
        if (record.document_type === 'maintenance') {
          return (
            <Text strong style={{ color: '#595959' }}>
              {record.version}
            </Text>
          );
        }
        
        return (
          <Select
            size="middle"
            value={record.id}
            onChange={(value) => {
              setSelectedVersions(prev => ({
                ...prev,
                [record.familyId]: value
              }));
            }}
            className="version-select-custom"
            popupMatchSelectWidth={false}
            bordered={true}
            style={{ 
              width: '180px', 
              borderRadius: '6px',
              border: '1px solid #d9d9d9'
            }}
          >
            {record.allVersions.map(v => (
              <Option key={v.id} value={v.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
                  <div style={{ 
                    width: '8px', 
                    height: '8px', 
                    borderRadius: '50%', 
                    backgroundColor: v.id === record.allVersions[0].id ? '#52c41a' : '#d9d9d9' 
                  }} />
                  <Text strong style={{ color: v.id === record.id ? '#1890ff' : '#595959' }}>
                    {v.version}
                  </Text>
                  {v.created_at && (
                    <Text type="secondary" style={{ fontSize: '12px', marginLeft: 'auto' }}>
                      {new Date(v.created_at).toLocaleDateString('en-GB')}
                    </Text>
                  )}
                </div>
              </Option>
            ))}
          </Select>
        );
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 250,
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="Preview Document">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined className="text-blue-500" />}
              onClick={() => handleViewDocument(record)}
            />
          </Tooltip>
          <Tooltip title="Edit Document Name">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined className="text-orange-500" />}
              onClick={() => handleEditDocument(record)}
            />
          </Tooltip>
          <Tooltip title="Download Document">
            <Button
              type="text"
              size="small"
              icon={<DownloadOutlined className="text-green-600" />}
              onClick={() => handleDownloadDocument(record)}
            />
          </Tooltip>
          {/* Hide Upload New Version for maintenance documents */}
          {record.document_type !== 'maintenance' && (
            <Tooltip title="Upload New Version">
              <Button
                type="text"
                size="small"
                icon={<CloudUploadOutlined className="text-green-500" />}
                onClick={() => handleUploadVersion(record)}
              />
            </Tooltip>
          )}
          <Tooltip title="Delete Document">
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDeleteDocument(record)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  const handleViewDocument = (document) => {
    setPreviewingDocument(document);
    setPreviewModalVisible(true);
  };

  const getFileExtension = (path) => {
    if (!path) return '';
    // Remove query parameters if present (important for MinIO signed URLs)
    const cleanPath = path.split('?')[0];
    return cleanPath.toLowerCase().split('.').pop();
  };

  const isPreviewable = (document) => {
    const ext = getFileExtension(document.url);
    const previewableTypes = ['pdf', 'jpg', 'jpeg', 'png', 'gif'];
    return previewableTypes.includes(ext);
  };

  const getPreviewContent = (document) => {
    const ext = getFileExtension(document.url);
    
    if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(ext)) {
      return (
        <div className="flex items-center justify-center h-full bg-gray-100 overflow-auto">
          <img 
            src={document.url} 
            alt={document.file_name} 
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} 
          />
        </div>
      );
    } else if (ext === 'pdf') {
      return (
        <iframe
          src={`${document.url}#toolbar=0`}
          title={document.file_name}
          width="100%"
          height="100%"
          style={{ border: 'none' }}
        />
      );
    } else {
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <Empty description="Preview not available for this file type" />
          <Button 
            type="primary" 
            icon={<DownloadOutlined />} 
            onClick={() => handleDownloadDocument(document)}
          >
            Download to View
          </Button>
        </div>
      );
    }
  };

  const handleEditDocument = (document) => {
    setEditingDocument(document);
    setNewDocumentName(document.file_name);
    setEditModalVisible(true);
  };

  const handleUpdateDocumentName = async () => {
    if (!editingDocument || !newDocumentName.trim()) {
      message.error('Please enter a document name');
      return;
    }

    try {
      let url = '';
      let body = {};

      if (editingDocument.doc_source_type === 'general-folder') {
        url = `http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}general-documents/documents/${editingDocument.id}`;
        body = { file_name: newDocumentName.trim() };
      } else if (editingDocument.doc_source_type === 'part-category') {
        url = `${config.API_BASE_URL}/documents/${editingDocument.id}`;
        body = { document_name: newDocumentName.trim() };
      } else if (editingDocument.doc_source_type === 'operation-folder') {
        url = `${config.API_BASE_URL}/operation-documents/${editingDocument.id}`;
        body = { document_name: newDocumentName.trim() };
      } else if (editingDocument.doc_source_type === 'machine-folder') {
        url = `http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}machine-documents/documents/${editingDocument.id}`;
        body = { document_name: newDocumentName.trim() };
      } else if (editingDocument.doc_source_type === 'machine') {
        url = `http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}machine-documents/documents/${editingDocument.id}`;
        body = { document_name: newDocumentName.trim() };
      } else if (editingDocument.doc_source_type === 'common-folder' || editingDocument.doc_source_type === 'common-root') {
        url = `http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}common-documents/documents/${editingDocument.id}`;
        body = { document_name: newDocumentName.trim() };
      } else if (editingDocument.doc_source_type === 'folder') {
        url = `${config.API_BASE_URL}/order-documents/${editingDocument.id}`;
        body = { document_name: newDocumentName.trim() };
      }

      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error('Failed to update document name');
      }

      message.success('Document name updated successfully');
      setEditModalVisible(false);
      setEditingDocument(null);
      setNewDocumentName('');
      
      // Notify parent of document change
      notifyDocumentsChange();
      
      // Refresh documents
      fetchDocuments();
    } catch (error) {
      message.error('Failed to update document name: ' + error.message);
    }
  };

  const handleDownloadDocument = (document) => {
    let downloadUrl = '';
    if (document.doc_source_type === 'general-folder') {
      downloadUrl = `http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}general-documents/documents/${document.id}/download`;
    } else if (document.doc_source_type === 'part-category') {
      downloadUrl = `${config.API_BASE_URL}/documents/${document.id}/download`;
    } else if (document.doc_source_type === 'operation-folder') {
      downloadUrl = `${config.API_BASE_URL}/operation-documents/${document.id}/download`;
    } else if (document.doc_source_type === 'folder') {
      downloadUrl = `${config.API_BASE_URL}/order-documents/download/${document.id}`;
    } else if (document.doc_source_type === 'machine-folder') {
      downloadUrl = document.url;
    } else if (document.doc_source_type === 'machine') {
      downloadUrl = document.url;
    }

    if (downloadUrl) {
      // Force download by fetching the file and creating a blob
      fetch(downloadUrl)
        .then(response => response.blob())
        .then(blob => {
          const url = window.URL.createObjectURL(blob);
          const link = window.document.createElement('a');
          link.href = url;
          
          // Get proper filename with extension
          const fileName = document.file_name || document.document_name || 'document';
          const fileExtension = downloadUrl.split('.').pop()?.split('?')[0] || '';
          const fullFileName = fileExtension ? `${fileName}.${fileExtension}` : fileName;
          
          link.download = fullFileName;
          link.style.display = 'none';
          window.document.body.appendChild(link);
          link.click();
          window.document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
          message.success('Download started');
        })
        .catch(error => {
          console.error('Download error:', error);
          // Fallback to opening in new tab if blob download fails
          window.open(downloadUrl, '_blank');
          message.warning('Download started in new tab');
        });
    } else {
      message.error('Download URL not found');
    }
  };

  const fetchNextVersion = async (document) => {
    try {
      // For general folders, we need to fetch all versions from the backend
      if (document.doc_source_type === 'general-folder') {
        const response = await fetch(`http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}general-documents/folders/${document.general_folder_id}/documents`);
        if (response.ok) {
          const allDocs = await response.json();
          const familyDocs = allDocs.filter(doc => 
            doc.id === document.parent_id || doc.parent_id === document.parent_id || doc.id === document.id
          );
          
          if (familyDocs.length > 0) {
            const versions = familyDocs.map(v => parseFloat(v.version) || 0);
            const latestVersion = Math.max(...versions, 0);
            setNextVersion((latestVersion + 1.0).toFixed(1));
            return;
          }
        }
      }
      
      // For other document types, use the existing logic
      const family = groupedDocuments.find(g => g.familyId === document.familyId);
      const allVersions = family ? family.allVersions : [document];
      
      // Calculate the highest version among all existing versions
      const versions = allVersions.map(v => parseFloat(v.version) || 0);
      const latestVersion = Math.max(...versions, 0);
      
      // Set the next version (increment by 1.0)
      setNextVersion((latestVersion + 1.0).toFixed(1));
    } catch (error) {
      console.error('Failed to calculate next version:', error);
      setNextVersion('1.0'); // Fallback
    }
  };

  const handleUploadVersion = (document) => {
    setUploadingDocument(document);
    setVersionFileList([]);
    setNextVersion(''); // Reset while fetching
    setVersionModalVisible(true);
    fetchNextVersion(document); // Fetch and set the next version
  };

  const handleUploadNewVersion = async () => {
    if (!versionFileList.length) {
      message.error('Please select a file to upload');
      return;
    }

    const fileObj = versionFileList[0];
    const file = fileObj.originFileObj || fileObj;

    if (!(file instanceof File) && !(file instanceof Blob)) {
      message.error('Invalid file object');
      return;
    }

    const formData = new FormData();
    formData.append('file', file, file.name);

    try {
      setVersionUploading(true);
      let url = '';
      
      if (uploadingDocument.doc_source_type === 'general-folder') {
        url = `http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}general-documents/upload`;
        formData.append('folder_id', uploadingDocument.general_folder_id.toString());
        // Use the actual uploaded file name instead of parent document name
        formData.append('file_name', file.name);
        formData.append('parent_id', (uploadingDocument.parent_id || uploadingDocument.id).toString());
      } else if (uploadingDocument.doc_source_type === 'machine-folder') {
        url = `http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}machine-documents/upload`;
        formData.append('folder_id', (uploadingDocument.machine_folder_id || selectedNode.folderId).toString());
        formData.append('parent_id', (uploadingDocument.parent_id || uploadingDocument.id).toString());
      } else if (uploadingDocument.doc_source_type === 'machine') {
        url = `http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}machine-documents/upload`;
        formData.append('machine_id', selectedNode.machineId.toString());
        formData.append('parent_id', (uploadingDocument.parent_id || uploadingDocument.id).toString());
      } else if (uploadingDocument.doc_source_type === 'common-folder' || uploadingDocument.doc_source_type === 'common-root') {
        url = `http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}common-documents/upload`;
        if (uploadingDocument.folder_id !== null && uploadingDocument.folder_id !== undefined) {
          formData.append('folder_id', uploadingDocument.folder_id.toString());
        }
        formData.append('parent_id', (uploadingDocument.parent_id || uploadingDocument.id).toString());
      } else if (uploadingDocument.doc_source_type === 'part-category') {
        url = `${config.API_BASE_URL}/documents/`;
        formData.append('document_name', file.name); // Use the name of the new file
        formData.append('document_type', uploadingDocument.document_type);
        formData.append('document_version', nextVersion);
        formData.append('part_id', selectedNode.partId);
        formData.append('parent_id', (uploadingDocument.parent_id || uploadingDocument.id).toString());
      } else if (uploadingDocument.doc_source_type === 'operation-folder') {
        url = `${config.API_BASE_URL}/operation-documents/upload/`;
        formData.append('operation_id', selectedNode.operationId);
        formData.append('document_type', uploadingDocument.document_type || 'CNC');
        formData.append('document_version', nextVersion);
        formData.append('parent_id', (uploadingDocument.parent_id || uploadingDocument.id).toString());
        // Operation documents endpoint expects 'files' (plural) as it supports multi-upload
        formData.delete('file');
        formData.append('files', file, file.name);
      } else if (uploadingDocument.doc_source_type === 'folder' && selectedNode.category === 'Reports') {
        url = `${config.API_BASE_URL}/order-documents/upload/${selectedNode.orderId}`;
        formData.append('document_type', uploadingDocument.document_type || 'Other');
        formData.append('document_version', nextVersion);
        formData.append('parent_id', (uploadingDocument.parent_id || uploadingDocument.id).toString());
        formData.append('user_id', userId.toString());
      }

      if (!url) {
        throw new Error('Upload URL not determined');
      }

      const response = await fetch(url, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { detail: errorText };
        }
        throw new Error(errorData.detail || `Failed to upload version: ${response.status}`);
      }

      message.success('New version uploaded successfully');
      setVersionModalVisible(false);
      setVersionFileList([]);
      setUploadingDocument(null);
      
      // Refresh documents to get the updated version list
      await fetchDocuments();
      
      // Notify parent of document change
      notifyDocumentsChange();
    } catch (error) {
      console.error('Version upload error:', error);
      message.error('Failed to upload new version: ' + error.message);
    } finally {
      setVersionUploading(false);
    }
  };

  const handleAddDocument = async () => {
    if (!addFileList.length) {
      message.error('Please select files to upload');
      return;
    }

    const formData = new FormData();
    
    // Add all files to FormData with 'files' key for multiple upload
    addFileList.forEach((fileObj) => {
      const file = fileObj.originFileObj || fileObj;
      formData.append('files', file, file.name);
    });

    try {
      const userId = getUserId();
      if (!userId) {
        message.error('User not found. Please login.');
        return;
      }
      setAddUploading(true);
      let url = '';
      
      if (selectedNode.type === 'general-folder') {
        url = `http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}general-documents/upload`;
        formData.append('folder_id', selectedNode.folderId.toString());
        formData.append('file_name', addFileList[0].originFileObj.name);
        formData.append('user_id', userId.toString());
      } else if (selectedNode.type === 'common-folder') {
        url = `http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}common-documents/upload`;
        formData.append('folder_id', selectedNode.folderId.toString());
        formData.append('user_id', userId.toString());
        console.log('Uploading common documents:', {
          url,
          folderId: selectedNode.folderId,
          fileCount: addFileList.length
        });
      } else if (selectedNode.type === 'common-root') {
        url = `http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}common-documents/upload`;
        formData.append('user_id', userId.toString());
        console.log('Uploading common documents to root:', {
          url,
          folderId: null,
          fileCount: addFileList.length
        });
      } else if (selectedNode.type === 'machine-folder') {
        url = `http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}machine-documents/upload`;
        formData.append('folder_id', selectedNode.folderId.toString());
        formData.append('user_id', userId.toString());
        console.log('Uploading machine documents:', {
          url,
          folderId: selectedNode.folderId,
          fileCount: addFileList.length
        });
      } else if (selectedNode.type === 'machine') {
        url = `http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}machine-documents/upload`;
        formData.append('machine_id', selectedNode.machineId.toString());
        formData.append('user_id', userId.toString());
        console.log('Uploading machine documents directly to machine:', {
          url,
          machineId: selectedNode.machineId,
          fileCount: addFileList.length
        });
      } else if (selectedNode.type === 'part-category') {
        url = `${config.API_BASE_URL}/documents/`;
        // For part-category, still use single file upload as it expects 'document_name'
        const file = addFileList[0].originFileObj || addFileList[0];
        formData.delete('files');
        formData.append('file', file, file.name);
        formData.append('document_name', file.name);
        formData.append('document_type', selectedNode.category === 'MPP' ? 'mpp' : 
                        selectedNode.category === 'ENGINEERING_DRAWING' ? '2d' : 
                        selectedNode.category === 'IPID' ? 'ipid' : 
                        selectedNode.category === 'Balloon' ? 'balloon' : 'other');
        formData.append('document_version', '1.0');
        formData.append('part_id', selectedNode.partId);
      } else if (selectedNode.type === 'operation-folder') {
        url = `${config.API_BASE_URL}/operation-documents/upload/`;
        formData.append('operation_id', selectedNode.operationId);
        formData.append('document_type', addDocType);
        formData.append('document_version', '1.0');
        // Operation documents endpoint expects 'files' (plural) as it supports multi-upload
        // Remove the existing 'files' and add them with proper naming
        const files = formData.getAll('files');
        formData.delete('files');
        files.forEach((file) => {
          formData.append('files', file, file.name);
        });
      } else if (selectedNode.type === 'folder' && selectedNode.category === 'Reports') {
        url = `${config.API_BASE_URL}/order-documents/upload/${selectedNode.orderId}`;
        // For order documents, still use single file upload
        const file = addFileList[0].originFileObj || addFileList[0];
        formData.delete('files');
        formData.append('file', file, file.name);
        formData.append('document_type', 'Report');
        formData.append('document_version', '1.0');
        formData.append('user_id', userId.toString());
      }

      const response = await fetch(url, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Upload failed response:', {
          status: response.status,
          statusText: response.statusText,
          errorText,
          url
        });
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { detail: errorText };
        }
        throw new Error(errorData.detail || `Failed to add document: ${response.status} ${response.statusText}`);
      }

      const responseData = await response.json();
      console.log('Upload successful:', responseData);

      message.success('Document added successfully');
      setAddModalVisible(false);
      setAddFileList([]);
      fetchDocuments();
      
      // Notify parent of document change
      notifyDocumentsChange();
    } catch (error) {
      message.error('Failed to add document: ' + error.message);
    } finally {
      setAddUploading(false);
    }
  };

  const handleDeleteDocument = (document) => {
    Modal.confirm({
      title: 'Delete Document',
      content: `Are you sure you want to delete "${document.file_name}"? This action cannot be undone.`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          let url = '';
          if (document.doc_source_type === 'general-folder') {
            url = `http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}general-documents/documents/${document.id}`;
          } else if (document.doc_source_type === 'part-category') {
            url = `${config.API_BASE_URL}/documents/${document.id}`;
          } else if (document.doc_source_type === 'operation-folder') {
            url = `${config.API_BASE_URL}/operation-documents/${document.id}`;
          } else if (document.doc_source_type === 'machine-folder') {
            url = `http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}machine-documents/documents/${document.id}`;
          } else if (document.doc_source_type === 'machine') {
            url = `http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}machine-documents/documents/${document.id}`;
          } else if (document.doc_source_type === 'common-folder' || document.doc_source_type === 'common-root') {
            url = `http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}common-documents/documents/${document.id}`;
          } else if (document.doc_source_type === 'folder') {
            url = `${config.API_BASE_URL}/order-documents/${document.id}`;
          }

          const response = await fetch(url, {
            method: 'DELETE'
          });

          if (!response.ok) {
            throw new Error('Failed to delete document');
          }

          message.success('Document deleted successfully');
          
          // Refresh documents
          fetchDocuments();
          
          // Notify parent of document change
          notifyDocumentsChange();
        } catch (error) {
          message.error('Failed to delete document: ' + error.message);
        }
      }
    });
  };

  if (!selectedNode) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty
          description="Select a folder from the tree to view documents"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </div>
    );
  }

  const isSupportedNodeType = 
    selectedNode.type === 'general-folder' || 
    selectedNode.type === 'common-folder' ||
    selectedNode.type === 'common-root' ||
    selectedNode.type === 'part-category' || 
    selectedNode.type === 'operation-folder' ||
    selectedNode.type === 'machine-folder' ||
    selectedNode.type === 'machine' ||
    (selectedNode.type === 'folder' && selectedNode.category === 'Reports');

  if (!isSupportedNodeType) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty
          description="Select a valid folder to view documents"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </div>
    );
  }

  const getHeaderIcon = () => {
    if (selectedNode.type === 'general-folder') return <FolderOutlined style={{ color: '#722ed1', fontSize: '20px' }} />;
    if (selectedNode.type === 'common-folder') return <FolderOutlined style={{ color: '#eb2f96', fontSize: '20px' }} />;
    if (selectedNode.type === 'machine-folder' || selectedNode.type === 'machine') return <FolderOutlined style={{ color: '#52c41a', fontSize: '20px' }} />;
    if (selectedNode.type === 'part-category') return <FileOutlined style={{ color: '#1890ff', fontSize: '20px' }} />;
    if (selectedNode.type === 'operation-folder') return <FileOutlined style={{ color: '#faad14', fontSize: '20px' }} />;
    if (selectedNode.category === 'Reports') return <FileOutlined style={{ color: '#52c41a', fontSize: '20px' }} />;
    return <FolderOutlined style={{ color: '#722ed1', fontSize: '20px' }} />;
  };

  const getHeaderTitle = () => {
    if (selectedNode.type === 'part-category') return `${selectedNode.partName} - ${selectedNode.category}`;
    if (selectedNode.type === 'operation-folder') return `Operation: ${selectedNode.operationName}`;
    if (selectedNode.category === 'Reports') return `Reports - Order: ${selectedNode.orderId}`;
    if (selectedNode.type === 'machine-folder') return `${selectedNode.machineName} - ${selectedNode.folderName}`;
    if (selectedNode.type === 'machine') return `${selectedNode.machineName}`;
    if (selectedNode.type === 'general-folder') return selectedNode.folderName;
    if (selectedNode.type === 'common-folder') return selectedNode.folderName;
    if (selectedNode.type === 'common-root') return 'Common Documents';
    return selectedNode.folderName;
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '16px', borderBottom: '1px solid #f0f0f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {getHeaderIcon()}
            <Title level={4} style={{ margin: 0 }}>
              {getHeaderTitle()}
            </Title>
          </div>
          {isSupportedNodeType && (
            <Button 
              type="primary" 
              icon={<UploadOutlined />} 
              onClick={() => {
                setAddFileList([]);
                setAddModalVisible(true);
              }}
            >
              Add Document
            </Button>
          )}
        </div>
        <Text type="secondary">
          {documents.length} document{documents.length !== 1 ? 's' : ''} in this folder
        </Text>
      </div>

      {/* Documents Table */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        <Table
          columns={columns}
          dataSource={groupedDocuments}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} documents`,
          }}
          size="small"
          locale={{
            emptyText: documents.length === 0 && !loading ? (
              <Empty
                description="No documents in this folder"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            ) : 'No data'
          }}
        />
      </div>

      {/* Edit Document Modal */}
      <Modal
        title="Edit Document Name"
        open={editModalVisible}
        onOk={handleUpdateDocumentName}
        onCancel={() => {
          setEditModalVisible(false);
          setEditingDocument(null);
          setNewDocumentName('');
        }}
        okText="Update"
        cancelText="Cancel"
      >
        <Input
          placeholder="Enter document name"
          value={newDocumentName}
          onChange={(e) => setNewDocumentName(e.target.value)}
          onPressEnter={handleUpdateDocumentName}
        />
      </Modal>

      {/* Preview Document Modal */}
      <Modal
        title={previewingDocument?.file_name}
        open={previewModalVisible}
        onCancel={() => {
          setPreviewModalVisible(false);
          setPreviewingDocument(null);
        }}
        footer={[
          <Button key="download" icon={<DownloadOutlined />} onClick={() => {
            if (previewingDocument) {
              handleDownloadDocument(previewingDocument);
            }
          }}>
            Download
          </Button>,
          <Button key="close" type="primary" onClick={() => {
            setPreviewModalVisible(false);
            setPreviewingDocument(null);
          }}>
            Close
          </Button>
        ]}
        width={1000}
        style={{ top: 20 }}
        bodyStyle={{ height: '80vh', padding: 0 }}
      >
        {previewingDocument ? (
          getPreviewContent(previewingDocument)
        ) : (
          <div className="flex items-center justify-center h-full">
            <LoadingOutlined style={{ fontSize: '24px', color: '#1890ff' }} />
          </div>
        )}
      </Modal>

      {/* Upload New Version Modal */}
      <Modal
        title={`Upload New Version - ${uploadingDocument?.file_name}`}
        open={versionModalVisible}
        onOk={handleUploadNewVersion}
        onCancel={() => {
          setVersionModalVisible(false);
          setUploadingDocument(null);
          setVersionFileList([]);
        }}
        okText="Upload Version"
        cancelText="Cancel"
        confirmLoading={versionUploading}
        width={600}
      >
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Version Number:
          </label>
          <Input
            placeholder="Loading next version..."
            value={nextVersion}
            readOnly
            style={{ backgroundColor: '#f5f5f5', cursor: 'not-allowed' }}
          />
          <Text style={{ fontSize: '12px', color: '#666', marginTop: '4px', display: 'block' }}>
            Next version number is automatically calculated
          </Text>
        </div>
        
        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Select File:
          </label>
          <Upload
            beforeUpload={() => false}
            fileList={versionFileList}
            onChange={({ fileList }) => setVersionFileList(fileList)}
            onRemove={() => setVersionFileList([])}
            maxCount={1}
            accept=".pdf,.docx,.doc,.txt,.jpg,.jpeg,.png,.xlsx,.xls,.csv"
            customRequest={({ onSuccess, onError, file }) => {
              setTimeout(() => {
                onSuccess('ok');
              }, 0);
            }}
          >
            <Button icon={<UploadOutlined />}>Select File</Button>
          </Upload>
          <p style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
            Drag and drop a file here or click to select
          </p>
        </div>
      </Modal>

      {/* Add Document Modal */}
      <Modal
        title={`Add New Document to ${getHeaderTitle()}`}
        open={addModalVisible}
        onOk={handleAddDocument}
        onCancel={() => {
          setAddModalVisible(false);
          setAddFileList([]);
        }}
        okText="Upload"
        cancelText="Cancel"
        confirmLoading={addUploading}
        width={600}
      >
        {selectedNode?.type === 'operation-folder' && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Document Type:
            </label>
            <Select
              style={{ width: '100%' }}
              value={addDocType}
              onChange={setAddDocType}
            >
              <Option value="CNC">CNC</Option>
            </Select>
          </div>
        )}
        
        <div>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            Select Files:
          </label>
          <Upload
            beforeUpload={() => false}
            fileList={addFileList}
            onChange={({ fileList }) => setAddFileList(fileList)}
            onRemove={(file) => {
              const newFileList = addFileList.filter(item => item.uid !== file.uid);
              setAddFileList(newFileList);
            }}
            multiple
            showUploadList={true}
            accept=".pdf,.docx,.doc,.txt,.jpg,.jpeg,.png,.xlsx,.xls,.csv"
            customRequest={({ onSuccess }) => onSuccess('ok')}
          >
            <Button icon={<UploadOutlined />}>Select Files</Button>
          </Upload>
          <p style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
            {selectedNode?.type === 'machine-folder' || selectedNode?.type === 'machine' 
              ? 'Multiple files will be uploaded as separate documents (version 1.0 each)'
              : 'This will be stored as version 1.0'}
          </p>
        </div>
      </Modal>
    </div>
  );
};

export default DocumentContent;
