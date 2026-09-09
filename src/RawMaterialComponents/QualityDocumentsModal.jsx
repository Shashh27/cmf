import React, { useState, useEffect } from "react";
import { Spin, Empty, Modal, App, Popconfirm, Upload, Button, Table, Tag, Space, Image, Input } from "antd";
import { UploadOutlined, FileOutlined, DeleteOutlined, DownloadOutlined, EyeOutlined, FilePdfOutlined, FileImageOutlined, FileTextOutlined, InboxOutlined } from "@ant-design/icons";
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';

const { Dragger } = Upload;

const getFileIcon = (fileName) => {
  const ext = fileName.split('.').pop().toLowerCase();
  if (ext === 'pdf') return <FilePdfOutlined style={{ fontSize: 32, color: '#ff4d4f' }} />;
  if (['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext)) return <FileImageOutlined style={{ fontSize: 32, color: '#52c41a' }} />;
  if (['doc', 'docx', 'txt'].includes(ext)) return <FileTextOutlined style={{ fontSize: 32, color: '#1890ff' }} />;
  return <FileOutlined style={{ fontSize: 32, color: '#8c8c8c' }} />;
};

const getApiErrorMessage = (error, fallback) => {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    return detail
      .map((item) => (typeof item === 'string' ? item : item?.msg))
      .filter(Boolean)
      .join(', ');
  }
  const messageText = error?.response?.data?.message;
  if (typeof messageText === 'string' && messageText.trim()) return messageText;
  return fallback;
};

/**
 * Quality documents modal.
 * - stock only (unit omitted) → stock-level docs (unit_id NULL)
 * - stock + unit → unit-level docs for that unit
 */
const QualityDocumentsModal = ({ open, onClose, stock, unit = null, materialName, dimensions, onDocumentsChanged }) => {
  const { message } = App.useApp();
  const { isAuthenticated, bootstrapping, user } = useAuth();
  const [qualityDocs, setQualityDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [previewModal, setPreviewModal] = useState({ open: false, url: null, type: null, doc: null });
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [fileRemarks, setFileRemarks] = useState({});

  const unitId = unit?.id ?? null;
  const isUnitLevel = unitId != null;

  const fetchQualityDocs = async (stockId, forUnitId = null) => {
    setDocsLoading(true);
    try {
      const params = forUnitId != null
        ? { unit_id: forUnitId }
        : { stock_level_only: true };
      const response = await api.get(`/stock-quality-documents/stock/${stockId}`, { params });
      setQualityDocs(response.data || []);
    } catch (err) {
      message.error("Failed to fetch quality documents");
    } finally {
      setDocsLoading(false);
    }
  };

  useEffect(() => {
    if (open && stock && isAuthenticated && !bootstrapping) {
      fetchQualityDocs(stock.id, unitId);
    } else if (!open) {
      setQualityDocs([]);
      setSelectedFiles([]);
      setFileRemarks({});
    }
  }, [open, stock, unitId, isAuthenticated, bootstrapping]);

  const notifyChanged = () => {
    onDocumentsChanged?.(stock.id, unitId);
  };

  const handleFileListChange = (info) => {
    const nextList = info.fileList || [];
    setSelectedFiles(nextList);
    setFileRemarks((prev) => {
      const next = {};
      nextList.forEach((file) => {
        next[file.uid] = prev[file.uid] ?? "";
      });
      return next;
    });
  };

  const handleRemoveFile = (file) => {
    setSelectedFiles((prev) => prev.filter((f) => f.uid !== file.uid));
    setFileRemarks((prev) => {
      const next = { ...prev };
      delete next[file.uid];
      return next;
    });
  };

  const handleUploadMultipleQualityDocs = async (info) => {
    const { fileList } = info;

    if (fileList.length === 0) return;

    const formData = new FormData();
    formData.append('stock_id', stock.id);
    if (isUnitLevel) {
      formData.append('unit_id', String(unitId));
    }
    if (user?.id) {
      formData.append('user_id', String(user.id));
    }

    fileList.forEach((file) => {
      formData.append('files', file.originFileObj || file);
    });
    // One remarks string per file, same order as files (JSON avoids Form list quirks)
    formData.append(
      'remarks_json',
      JSON.stringify(fileList.map((file) => (fileRemarks[file.uid] || '').trim()))
    );

    try {
      const response = await api.post(`/stock-quality-documents/upload-bulk`, formData);

      const uploadedCount = response.data?.length || 0;
      message.success(`${uploadedCount} document(s) uploaded successfully`);

      await fetchQualityDocs(stock.id, unitId);
      setSelectedFiles([]);
      setFileRemarks({});
      notifyChanged();
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
        fetchQualityDocs(stock.id, unitId);
        setSelectedFiles([]);
        setFileRemarks({});
        notifyChanged();
      } else {
        message.error(getApiErrorMessage(err, "Failed to upload documents"));
      }
    }
  };

  const handleDeleteQualityDoc = async (docId) => {
    try {
      await api.delete(`/stock-quality-documents/${docId}`);
      message.success("Document deleted successfully");
      await fetchQualityDocs(stock.id, unitId);
      notifyChanged();
    } catch (err) {
      if (err.response?.status === 400) {
        message.error(getApiErrorMessage(err, "Cannot delete document with newer versions"));
      } else {
        message.error("Failed to delete document");
      }
    }
  };

  const handleDownloadQualityDoc = async (doc) => {
    try {
      const response = await api.get(doc.document_url, {
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
      setPreviewModal({ open: true, url: doc.document_url, type: 'image', doc });
    } else if (fileExt === 'pdf') {
      setPreviewModal({ open: true, url: doc.document_url, type: 'pdf', doc });
    } else {
      setPreviewModal({ open: true, url: null, type: 'other', doc });
    }
  };

  const closePreviewModal = () => {
    setPreviewModal({ open: false, url: null, type: null, doc: null });
  };

  const scopeLabel = isUnitLevel
    ? `Unit ${unitId}`
    : 'Stock';

  return (
    <>
      <Modal
        open={open}
        onCancel={onClose}
        width="95%"
        style={{ maxWidth: 900 }}
        title={
          <span className="font-bold text-gray-800 text-sm">
            Quality Documents ({scopeLabel}) — {materialName} {dimensions && `(${dimensions})`}
          </span>
        }
        footer={null}
        destroyOnHidden
      >
        <div style={{ padding: "8px 0" }}>
          <Space orientation="vertical" style={{ width: "100%" }} size="small">
            <div style={{ background: "#f5f5ff", padding: "8px", borderRadius: 4 }}>
              <Dragger
                multiple
                beforeUpload={() => false}
                onChange={handleFileListChange}
                showUploadList={false}
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
                  {isUnitLevel ? ' — saved for this unit' : ' — saved for this stock'}
                </p>
              </Dragger>

              {selectedFiles.length > 0 && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  {selectedFiles.map((file) => (
                    <div
                      key={file.uid}
                      style={{
                        background: "#fff",
                        border: "1px solid #e5e7eb",
                        borderRadius: 6,
                        padding: "8px 10px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                        <Space size="small">
                          {getFileIcon(file.name || "")}
                          <span style={{ fontSize: 12, fontWeight: 500 }}>{file.name}</span>
                        </Space>
                        <Button
                          type="text"
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          onClick={() => handleRemoveFile(file)}
                        />
                      </div>
                      <Input.TextArea
                        value={fileRemarks[file.uid] || ""}
                        onChange={(e) =>
                          setFileRemarks((prev) => ({ ...prev, [file.uid]: e.target.value }))
                        }
                        placeholder={`Remarks for ${file.name} (optional)`}
                        maxLength={1000}
                        showCount
                        rows={2}
                        style={{ fontSize: 12 }}
                      />
                    </div>
                  ))}
                </div>
              )}

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
                scroll={{ x: 760 }}
                columns={[
                  {
                    title: 'Document Name',
                    dataIndex: 'document_name',
                    key: 'document_name',
                    ellipsis: true,
                    render: (text) => (
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
                    title: 'Remarks',
                    dataIndex: 'remarks',
                    key: 'remarks',
                    ellipsis: true,
                    render: (text) => (
                      <span style={{ fontSize: 11, color: text ? "#333" : "#999" }}>
                        {text || "-"}
                      </span>
                    )
                  },
                  {
                    title: 'Uploaded By',
                    dataIndex: 'user_name',
                    key: 'user_name',
                    width: 140,
                    ellipsis: true,
                    render: (name) => (
                      <span style={{ fontSize: 11, color: name ? "#333" : "#999" }}>
                        {name || "Unknown"}
                      </span>
                    )
                  },
                  {
                    title: 'Uploaded',
                    dataIndex: 'created_at',
                    key: 'created_at',
                    width: 130,
                    render: (date) => (
                      <span style={{ fontSize: 11 }}>
                        {date ? new Date(date).toLocaleDateString() : "-"}
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

      <Modal
        open={previewModal.open}
        onCancel={closePreviewModal}
        width="95%"
        style={{ maxWidth: 800 }}
        title={previewModal.doc?.document_name || "Document Preview"}
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
        ) : previewModal.type === 'other' ? (
          <div style={{ textAlign: "center", padding: "40px" }}>
            <FileTextOutlined style={{ fontSize: 48, color: "#8c8c8c" }} />
            <p style={{ marginTop: 16, fontWeight: 500, color: "#333" }}>
              Preview is not available for this file type.
            </p>
            <p style={{ color: "#8c8c8c", marginBottom: 16 }}>
              Please download the file to view it.
            </p>
            {previewModal.doc && (
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                onClick={() => handleDownloadQualityDoc(previewModal.doc)}
              >
                Download
              </Button>
            )}
          </div>
        ) : null}
      </Modal>
    </>
  );
};

export default QualityDocumentsModal;
