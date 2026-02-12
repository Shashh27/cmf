import React, { useState, useEffect } from 'react';
import { Card, Typography, Empty, Button, Table, Space, message, Modal, Input, Upload } from 'antd';
import { 
  FileOutlined, 
  FolderOutlined, 
  DeleteOutlined, 
  EyeOutlined, 
  EditOutlined, 
  DownloadOutlined,
  LoadingOutlined,
  UploadOutlined,
  CloudUploadOutlined
} from '@ant-design/icons';

const { Title, Text } = Typography;

const DocumentContent = ({ selectedNode }) => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingDocument, setEditingDocument] = useState(null);
  const [newDocumentName, setNewDocumentName] = useState('');
  
  // Version upload state
  const [versionModalVisible, setVersionModalVisible] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState(null);
  const [newVersion, setNewVersion] = useState('');
  const [versionFileList, setVersionFileList] = useState([]);
  const [versionUploading, setVersionUploading] = useState(false);
  
  // Preview state
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [previewingDocument, setPreviewingDocument] = useState(null);

  // Fetch documents when a folder is selected
  useEffect(() => {
    if (selectedNode && selectedNode.type === 'general-folder') {
      fetchDocuments();
    } else {
      setDocuments([]);
    }
  }, [selectedNode]);

  const fetchDocuments = async () => {
    if (!selectedNode || !selectedNode.folderId) return;

    setLoading(true);
    try {
      const response = await fetch(`http://172.18.100.76:8000/general-documents/folders/${selectedNode.folderId}/documents`);
      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }
      const data = await response.json();
      setDocuments(data);
    } catch (error) {
      message.error('Failed to fetch documents: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

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
      render: (text) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileOutlined style={{ color: '#1890ff' }} />
          {text}
        </span>
      ),
    },
    {
      title: 'Version',
      dataIndex: 'version',
      key: 'version',
      width: 80,
      render: (version) => (
        <span style={{ 
          background: '#f0f0f0', 
          padding: '2px 8px', 
          borderRadius: '4px',
          fontSize: '12px'
        }}>
          v{version}
        </span>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 250,
      render: (_, record) => (
        <Space size="small">
          <Button
            type="text"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewDocument(record)}
            title="Preview"
          />
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEditDocument(record)}
            title="Edit Name"
          />
          <Button
            type="text"
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => handleDownloadDocument(record)}
            title="Download"
          />
          <Button
            type="text"
            size="small"
            icon={<CloudUploadOutlined />}
            onClick={() => handleUploadVersion(record)}
            title="Upload New Version"
            style={{ color: '#52c41a' }}
          />
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDeleteDocument(record)}
            title="Delete"
          />
        </Space>
      ),
    },
  ];

  const handleViewDocument = (document) => {
    setPreviewingDocument(document);
    setPreviewModalVisible(true);
  };

  const getFileExtension = (filename) => {
    return filename.toLowerCase().split('.').pop();
  };

  const isPreviewable = (document) => {
    const ext = getFileExtension(document.file_name);
    const previewableTypes = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'txt', 'html', 'htm', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];
    return previewableTypes.includes(ext);
  };

  const getPreviewContent = (document) => {
    const ext = getFileExtension(document.file_name);
    
    if (ext === 'pdf') {
      return (
        <iframe
          src={document.url}
          style={{
            width: '100%',
            height: '100%',
            border: '1px solid #d9d9d9',
            borderRadius: '6px'
          }}
          title={document.file_name}
        />
      );
    } else if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) {
      return (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '100%',
          backgroundColor: '#f5f5f5'
        }}>
          <img
            src={document.url}
            alt={document.file_name}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain'
            }}
            onError={(e) => {
              e.target.onerror = null;
              e.target.style.display = 'none';
              e.target.parentElement.innerHTML = `
                <div style="text-align: center; padding: 20px;">
                  <div style="font-size: 48px; color: #d9d9d9; margin-bottom: 16px;">🖼️</div>
                  <div style="color: #666;">Failed to load image</div>
                </div>
              `;
            }}
          />
        </div>
      );
    } else if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) {
      // Use Microsoft Office Online Viewer for Office documents
      const officeViewerUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(document.url)}`;
      return (
        <iframe
          src={officeViewerUrl}
          style={{
            width: '100%',
            height: '100%',
            border: '1px solid #d9d9d9',
            borderRadius: '6px'
          }}
          title={document.file_name}
          onError={(e) => {
            e.target.onerror = null;
            e.target.style.display = 'none';
            e.target.parentElement.innerHTML = `
              <div style="display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100%; background-color: #f5f5f5; text-align: center; padding: 20px;">
                <div style="font-size: 48px; color: #d9d9d9; margin-bottom: 16px;">📄</div>
                <div style="color: #666; margin-bottom: 8px;">Failed to load Office document</div>
                <div style="color: #999; font-size: 12px;">Please download the file to view its contents</div>
              </div>
            `;
          }}
        />
      );
    } else if (['txt', 'html', 'htm'].includes(ext)) {
      return (
        <iframe
          src={document.url}
          style={{
            width: '100%',
            height: '100%',
            border: '1px solid #d9d9d9',
            borderRadius: '6px'
          }}
          title={document.file_name}
          onError={(e) => {
            e.target.onerror = null;
            e.target.style.display = 'none';
            e.target.parentElement.innerHTML = `
              <div style="display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100%; background-color: #f5f5f5; text-align: center; padding: 20px;">
                <div style="font-size: 48px; color: #d9d9d9; margin-bottom: 16px;">📄</div>
                <div style="color: #666; margin-bottom: 8px;">Failed to load content</div>
                <div style="color: #999; font-size: 12px;">Please download the file to view its contents</div>
              </div>
            `;
          }}
        />
      );
    } else {
      return (
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '100%',
          backgroundColor: '#f5f5f5',
          textAlign: 'center',
          padding: '20px'
        }}>
          <FileOutlined style={{ fontSize: '48px', color: '#d9d9d9', marginBottom: '16px' }} />
          <Title level={4} type="secondary">Preview Not Available</Title>
          <Text type="secondary">
            This file type (.{ext}) cannot be previewed directly.
          </Text>
          <br />
          <Text type="secondary">
            Supported preview formats: PDF, Office Documents, Images, Text, HTML
          </Text>
          <Button 
            type="primary" 
            icon={<DownloadOutlined />}
            onClick={() => handleDownloadDocument(document)}
            style={{ marginTop: '16px' }}
          >
            Download File
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
      const response = await fetch(`http://172.18.100.76:8000/general-documents/documents/${editingDocument.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_name: newDocumentName.trim()
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update document name');
      }

      message.success('Document name updated successfully');
      setEditModalVisible(false);
      setEditingDocument(null);
      setNewDocumentName('');
      
      // Refresh documents
      fetchDocuments();
    } catch (error) {
      message.error('Failed to update document name: ' + error.message);
    }
  };

  const handleDownloadDocument = async (document) => {
    try {
      console.log('Downloading document:', document.file_name, 'ID:', document.id);
      
      // Show loading message
      const loadingMessage = message.loading('Downloading document...', 0);
      
      // Fetch the document through the backend
      const response = await fetch(`http://172.18.100.76:8000/general-documents/documents/${document.id}/download`, {
        method: 'GET',
        credentials: 'include', // Include cookies if needed
        headers: {
          'Accept': 'application/octet-stream, application/pdf, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.openxmlformats-officedocument.wordprocessingml.document, */*'
        }
      });
      
      loadingMessage();
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Download response error:', response.status, errorText);
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }
      
      // Get the content type from response headers
      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      console.log('Content type:', contentType);
      
      // Get the blob
      const blob = await response.blob();
      console.log('Blob size:', blob.size, 'type:', blob.type);
      
      if (blob.size === 0) {
        throw new Error('Downloaded file is empty');
      }
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = document.file_name;
      link.style.display = 'none';
      
      // Add to DOM, click, and remove
      document.body.appendChild(link);
      link.click();
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 100);
      
      message.success('Document downloaded successfully');
    } catch (error) {
      console.error('Download error:', error);
      message.error('Failed to download document: ' + error.message);
    }
  };

  const handleUploadVersion = (document) => {
    setUploadingDocument(document);
    setNewVersion('');
    setVersionFileList([]);
    setVersionModalVisible(true);
  };

  const handleUploadNewVersion = async () => {
    if (!versionFileList.length) {
      message.error('Please select a file to upload');
      return;
    }

    if (!newVersion.trim()) {
      message.error('Please enter a version number');
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
    formData.append('folder_id', uploadingDocument.general_folder_id.toString());
    formData.append('file_name', uploadingDocument.file_name);
    formData.append('parent_id', uploadingDocument.id.toString()); // This creates a new version

    try {
      setVersionUploading(true);
      console.log('Uploading new version:', file.name, 'version:', newVersion, 'parent:', uploadingDocument.id);
      
      const response = await fetch('http://172.18.100.76:8000/general-documents/upload', {
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

      const result = await response.json();
      console.log('Version upload success:', result);
      message.success('New version uploaded successfully');
      setVersionModalVisible(false);
      setVersionFileList([]);
      setNewVersion('');
      setUploadingDocument(null);
      
      // Refresh documents
      fetchDocuments();
    } catch (error) {
      console.error('Version upload error:', error);
      message.error('Failed to upload new version: ' + error.message);
    } finally {
      setVersionUploading(false);
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
          const response = await fetch(`http://172.18.100.76:8000/general-documents/documents/${document.id}`, {
            method: 'DELETE'
          });

          if (!response.ok) {
            throw new Error('Failed to delete document');
          }

          message.success('Document deleted successfully');
          
          // Refresh documents
          fetchDocuments();
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

  if (selectedNode.type !== 'general-folder') {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty
          description="Select a general documents folder to view documents"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '16px', borderBottom: '1px solid #f0f0f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <FolderOutlined style={{ color: '#722ed1', fontSize: '20px' }} />
          <Title level={4} style={{ margin: 0 }}>
            {selectedNode.folderName}
          </Title>
        </div>
        <Text type="secondary">
          {documents.length} document{documents.length !== 1 ? 's' : ''} in this folder
        </Text>
      </div>

      {/* Documents Table */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        <Table
          columns={columns}
          dataSource={documents}
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
        title="Document Preview"
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
          <Button key="close" onClick={() => {
            setPreviewModalVisible(false);
            setPreviewingDocument(null);
          }}>
            Close
          </Button>
        ]}
        width={900}
        style={{ top: 20 }}
      >
        <Card
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileOutlined style={{ color: '#1890ff' }} />
              <span>{previewingDocument?.file_name}</span>
              <span style={{ 
                background: '#f0f0f0', 
                padding: '2px 8px', 
                borderRadius: '4px',
                fontSize: '12px'
              }}>
                v{previewingDocument?.version}
              </span>
            </div>
          }
          style={{ backgroundColor: '#ffffff' }}
        >
          <div style={{ height: '60vh', overflow: 'hidden' }}>
            {previewingDocument ? (
              <div key={previewingDocument.id}>
                {getPreviewContent(previewingDocument)}
              </div>
            ) : (
              <div style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                height: '100%',
                backgroundColor: '#f5f5f5'
              }}>
                <LoadingOutlined style={{ fontSize: '24px', color: '#1890ff' }} />
              </div>
            )}
          </div>
        </Card>
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
          setNewVersion('');
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
            placeholder="Enter version number (e.g., 2.0, 1.1, etc.)"
            value={newVersion}
            onChange={(e) => setNewVersion(e.target.value)}
          />
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
    </div>
  );
};

export default DocumentContent;
