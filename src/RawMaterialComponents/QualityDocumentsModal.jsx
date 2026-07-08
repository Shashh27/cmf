import React, { useState, useEffect } from "react";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth";
import { Spin, Empty, Modal, App, Popconfirm, Upload, Button, Table, Tag, Space, Image } from "antd";
import { UploadOutlined, FileOutlined, DeleteOutlined, DownloadOutlined, EyeOutlined, FilePdfOutlined, FileImageOutlined, FileTextOutlined, InboxOutlined } from "@ant-design/icons";

const { Dragger } = Upload;

const getFileIcon = (fileName) => {
  const ext = fileName.split('.').pop().toLowerCase();
  if (ext === 'pdf') return <FilePdfOutlined style={{ fontSize: 32, color: '#ff4d4f' }} />;
  if (['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext)) return <FileImageOutlined style={{ fontSize: 32, color: '#52c41a' }} />;
  if (['doc', 'docx', 'txt'].includes(ext)) return <FileTextOutlined style={{ fontSize: 32, color: '#1890ff' }} />;
  return <FileOutlined style={{ fontSize: 32, color: '#8c8c8c' }} />;
};

const QualityDocumentsModal = ({ open, onClose, stock, materialName, dimensions }) => {
  const { message } = App.useApp();
  const [qualityDocs, setQualityDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [previewModal, setPreviewModal] = useState({ open: false, url: null, type: null });
  const [selectedFiles, setSelectedFiles] = useState([]);

  useEffect(() => {
    if (open && stock) {
      fetchQualityDocs(stock.id);
    } else {
      setQualityDocs([]);
      setSelectedFiles([]);
    }
  }, [open, stock]);

  const fetchQualityDocs = async (stockId) => {
    setDocsLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/stock-quality-documents/stock/${stockId}`);
      setQualityDocs(response.data || []);
    } catch (err) {
      message.error("Failed to fetch quality documents");
    } finally {
      setDocsLoading(false);
    }
  };

  const handleUploadMultipleQualityDocs = async (info) => {
    const { fileList } = info;
    
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;
    const userId = user?.id || user?.user_id;

    if (fileList.length === 0) return;

    const formData = new FormData();
    formData.append('stock_id', stock.id);
    formData.append('user_id', userId);
    
    fileList.forEach((file) => {
      formData.append('files', file.originFileObj || file);
    });

    try {
      const response = await axios.post(`${API_BASE_URL}/stock-quality-documents/upload-bulk`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      const uploadedCount = response.data?.length || 0;
      message.success(`${uploadedCount} document(s) uploaded successfully`);
      
      await fetchQualityDocs(stock.id);
      setSelectedFiles([]);
    } catch (err) {
      if (err.response?.status === 207) {
        const data = err.response.data.detail;
        const { uploaded, failed, failed_files } = data;
        if (uploaded > 0) {
          message.success(`${uploaded} document(s) uploaded successfully`);
        }
        if (failed > 0) {
          message.error(`${failed} document(s) failed to upload`);
          console.error('Failed files:', failed_files);
        }
        fetchQualityDocs(stock.id);
        setSelectedFiles([]);
      } else {
        message.error(err.response?.data?.detail || "Failed to upload documents");
      }
    }
  };

  const handleDeleteQualityDoc = async (docId) => {
    try {
      await axios.delete(`${API_BASE_URL}/stock-quality-documents/${docId}`);
      message.success("Document deleted successfully");
      await fetchQualityDocs(stock.id);
    } catch (err) {
      if (err.response?.status === 400) {
        message.error(err.response?.data?.detail || "Cannot delete document with newer versions");
      } else {
        message.error("Failed to delete document");
      }
    }
  };

  const handleDownloadQualityDoc = async (doc) => {
    try {
      const response = await axios.get(doc.document_url, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', doc.document_name);
      document.body.appendChild(link);
      link.click();
      
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      message.error("Failed to download document");
    }
  };

  const handlePreviewQualityDoc = (doc) => {
    const fileExt = doc.document_name.split('.').pop().toLowerCase();
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg'];
    
    if (imageExts.includes(fileExt)) {
      setPreviewModal({ open: true, url: doc.document_url, type: 'image' });
    } else if (fileExt === 'pdf') {
      setPreviewModal({ open: true, url: doc.document_url, type: 'pdf' });
    } else {
      handleDownloadQualityDoc(doc);
    }
  };

  const closePreviewModal = () => {
    setPreviewModal({ open: false, url: null, type: null });
  };

  return (
    <>
      <Modal
        open={open}
        onCancel={onClose}
        width="95%"
        style={{ maxWidth: 900 }}
        title={
          <span className="font-bold text-gray-800 text-sm">
            Quality Documents — {materialName} {dimensions && `(${dimensions})`}
          </span>
        }
        footer={null}
        destroyOnHidden
      >
        <div style={{ padding: "8px 0" }}>
          <Space orientation="vertical" style={{ width: "100%" }} size="small">
            {/* Upload Section */}
            <div style={{ background: "#f5f5ff", padding: "8px", borderRadius: 4 }}>
              <Dragger
                multiple
                beforeUpload={() => false}
                onChange={(info) => setSelectedFiles(info.fileList)}
                showUploadList={true}
                onRemove={(file) => {
                  setSelectedFiles(prev => prev.filter(f => f.uid !== file.uid));
                }}
                fileList={selectedFiles}
                accept=".pdf,.docx,.csv,.xlsx,.doc,.xls,.txt,.png,.jpg,.jpeg,.gif,.svg"
                style={{ background: "#fff" }}
                height={120}
              >
                <p className="ant-upload-drag-icon" style={{ marginBottom: 8 }}>
                  <InboxOutlined style={{ fontSize: 40, color: "#1890ff" }} />
                </p>
                <p className="ant-upload-text" style={{ fontSize: 14, fontWeight: 500, margin: 0, color: "#333" }}>
                  Click or drag files to upload
                </p>
                <p className="ant-upload-hint" style={{ color: "#999", fontSize: 11, margin: '8px 0 0 0', lineHeight: 1.4 }}>
                  PDF, DOCX, XLSX, CSV, TXT, PNG, JPG, GIF, SVG
                </p>
              </Dragger>
              <div style={{ marginTop: 12, textAlign: "center" }}>
                <Button 
                  type="primary" 
                  onClick={() => handleUploadMultipleQualityDocs({ fileList: selectedFiles })}
                  disabled={selectedFiles.length === 0}
                  size="small"
                >
                  Upload {selectedFiles.length > 0 ? `(${selectedFiles.length})` : ''}
                </Button>
              </div>
            </div>

            {/* Documents List */}
            {docsLoading ? (
              <div style={{ textAlign: "center", padding: "24px" }}>
                <Spin />
              </div>
            ) : qualityDocs.length === 0 ? (
              <Empty description="No quality documents uploaded" style={{ padding: "24px" }} />
            ) : (
              <Table
                dataSource={qualityDocs}
                rowKey="id"
                size="small"
                pagination={false}
                scroll={{ x: 600 }}
                columns={[
                  {
                    title: 'Document Name',
                    dataIndex: 'document_name',
                    key: 'document_name',
                    ellipsis: true,
                    render: (text, record) => (
                      <Space size="small">
                        {getFileIcon(text)}
                        <span style={{ fontSize: 12 }}>{text}</span>
                      </Space>
                    )
                  },
                  {
                    title: 'Version',
                    dataIndex: 'version',
                    key: 'version',
                    width: 70,
                    render: (version) => <Tag color="blue" style={{ fontSize: 11 }}>v{version}</Tag>
                  },
                  {
                    title: 'Uploaded',
                    dataIndex: 'created_at',
                    key: 'created_at',
                    width: 130,
                    render: (date) => (
                      <span style={{ fontSize: 11 }}>
                        {new Date(date).toLocaleDateString()}
                      </span>
                    )
                  },
                  {
                    title: 'Actions',
                    key: 'actions',
                    width: 120,
                    fixed: 'right',
                    render: (_, record) => (
                      <Space size="small">
                        <Button
                          type="text"
                          size="small"
                          icon={<EyeOutlined />}
                          onClick={() => handlePreviewQualityDoc(record)}
                          style={{ fontSize: 14 }}
                        />
                        <Button
                          type="text"
                          size="small"
                          icon={<DownloadOutlined />}
                          onClick={() => handleDownloadQualityDoc(record)}
                          style={{ fontSize: 14 }}
                        />
                        <Popconfirm
                          title="Delete this document?"
                          onConfirm={() => handleDeleteQualityDoc(record.id)}
                          okText="Yes"
                          okType="danger"
                          cancelText="No"
                        >
                          <Button type="text" danger size="small" icon={<DeleteOutlined />} style={{ fontSize: 14 }} />
                        </Popconfirm>
                      </Space>
                    )
                  }
                ]}
              />
            )}
          </Space>
        </div>
      </Modal>

      {/* Preview Modal */}
      <Modal
        open={previewModal.open}
        onCancel={closePreviewModal}
        width="95%"
        style={{ maxWidth: 800 }}
        title="Document Preview"
        footer={null}
        destroyOnHidden
      >
        {previewModal.type === 'image' ? (
          <div style={{ textAlign: "center" }}>
            <Image
              src={previewModal.url}
              alt="Preview"
              style={{ maxWidth: "100%", maxHeight: "60vh" }}
            />
          </div>
        ) : previewModal.type === 'pdf' ? (
          <iframe
            src={previewModal.url}
            style={{ width: "100%", height: "60vh", border: "none" }}
            title="PDF Preview"
          />
        ) : null}
      </Modal>
    </>
  );
};

export default QualityDocumentsModal;
