import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "../Config/auth";
import { Modal, Form, Input, Select, Button, Typography, Space, Row, Col, Empty, message, Upload, Tag, Divider, Popconfirm, Card, Badge, Tooltip } from "antd";
import { FileTextOutlined, DownloadOutlined, DeleteOutlined, UploadOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;
const { Option } = Select;

const DocumentModal = ({ isOpen, onClose, onDocumentUploaded, orderId, orders }) => {
  const [form] = Form.useForm();
  const [selectedOrderId, setSelectedOrderId] = useState(orderId || "");
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerDoc, setViewerDoc] = useState(null);
  const [parentId, setParentId] = useState(null);
  const [updatingDocName, setUpdatingDocName] = useState("");

  useEffect(() => {
    if (isOpen && orderId) {
      setSelectedOrderId(orderId.toString());
      fetchDocuments(orderId);
    } else if (isOpen && selectedOrderId) {
      fetchDocuments(selectedOrderId);
    }
  }, [isOpen, orderId]);


  const fetchDocuments = async (orderId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/order-documents/order/${orderId}`);
      if (response.ok) {
        const data = await response.json();
        setDocuments(data);
      }
    } catch (error) {
      console.error("Error fetching documents:", error);
    }
  };


  const handleUpload = async (values) => {
    const file = values.file?.[0]?.originFileObj;
    if (!file || !selectedOrderId) {
      message.error("Please select a file and order");
      return;
    }

    if (
      values.document_type === "Other" &&
      !(values.document_type_other && values.document_type_other.trim())
    ) {
      message.error("Please enter document type name for 'Other' document type");
      return;
    }

    setLoading(true);
    const uploadFormData = new FormData();
    uploadFormData.append("file", file);
    uploadFormData.append("document_name", file.name);
    let docType = values.document_type || "";
    if (docType === "Other" && values.document_type_other && values.document_type_other.trim()) {
      docType = values.document_type_other.trim();
    }
    uploadFormData.append("document_type", docType);
    uploadFormData.append("document_version", parentId ? (values.document_version || "1.0") : "1.0"); // Enforce 1.0 for new uploads
    if (parentId) {
      uploadFormData.append("parent_id", parentId);
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/order-documents/upload/${selectedOrderId}`,
        {
          method: "POST",
          body: uploadFormData,
        }
      );

      if (response.ok) {
        const result = await response.json();
        onDocumentUploaded(result);
        form.resetFields();
        form.setFieldsValue({ document_version: "1.0" });
        setParentId(null);
        setUpdatingDocName("");
        if (selectedOrderId) {
          fetchDocuments(selectedOrderId);
        }
      } else {
        message.error("Failed to upload document");
      }
    } catch (error) {
      console.error("Error uploading document:", error);
      message.error("Error uploading document");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (documentId, documentName) => {
    try {
      const doc = documents.find(d => d.id === documentId);
      if (!doc?.document_url) {
        message.error("No document URL available");
        return;
      }
      const response = await fetch(doc.document_url);
      if (!response.ok) {
        message.error("Failed to fetch document for download");
        return;
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = documentName || 'document';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading document:", error);
      message.error("Error downloading document");
    }
  };

  const handleView = (documentId) => {
    const doc = documents.find(d => d.id === documentId);
    if (!doc?.document_url) {
      message.error("No document URL available");
      return;
    }
    setViewerDoc(doc);
    setViewerOpen(true);
  };

  const handleDelete = async (documentId) => {
    if (!window.confirm("Are you sure you want to delete this document?")) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/order-documents/${documentId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        if (selectedOrderId) {
          fetchDocuments(selectedOrderId);
        }
      } else {
        message.error("Failed to delete document");
      }
    } catch (error) {
      console.error("Error deleting document:", error);
      message.error("Error deleting document");
    }
  };

  const handleUpdateVersion = (doc) => {
    // Determine the root parent ID. If this doc is already a version, use its parent_id.
    // Otherwise, use its own id as the root for all future versions.
    const rootId = doc.parent_id || doc.id;
    setParentId(rootId);
    setUpdatingDocName(doc.document_name);
    
    // Find all documents belonging to this version group to find the latest version
    const versionGroup = documents.filter(d => d.id === rootId || d.parent_id === rootId);
    
    let maxVersion = 1.0;
    versionGroup.forEach(d => {
      const v = parseFloat(d.document_version);
      if (!isNaN(v) && v > maxVersion) {
        maxVersion = v;
      }
    });

    const nextVersion = (maxVersion + 1.0).toFixed(1);

    form.setFieldsValue({
      document_type: doc.document_type,
      document_version: nextVersion
    });
    
    message.info(`Creating version ${nextVersion} for: ${doc.document_name}`);
  };

  const groupDocuments = () => {
    const roots = documents.filter(d => !d.parent_id);
    const versions = documents.filter(d => d.parent_id);
    
    return roots.map(root => ({
      ...root,
      versions: versions.filter(v => v.parent_id === root.id).sort((a, b) => parseFloat(b.document_version) - parseFloat(a.document_version))
    }));
  };

  const renderDocumentItem = (doc, isVersion = false) => (
    <div 
      key={doc.id} 
      style={{ 
        padding: '12px', 
        backgroundColor: isVersion ? '#fdfeff' : '#fff', 
        border: '1px solid #f0f0f0', 
        borderRadius: 8,
        marginBottom: isVersion ? 8 : 12,
        marginLeft: isVersion ? 24 : 0,
        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
        borderLeft: isVersion ? '3px solid #ffa940' : '3px solid #1890ff'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <FileTextOutlined style={{ color: isVersion ? '#ffa940' : '#1890ff', fontSize: 16 }} />
            <Text strong style={{ fontSize: 14 }}>{doc.document_name}</Text>
            {isVersion && <Tag color="orange" style={{ fontSize: '12px', fontWeight: 'bold' }}>VERSION</Tag>}
            <Tag color="blue" style={{ fontSize: '13px', fontWeight: 'bold', border: '1px solid #91d5ff' }}>v{doc.document_version}</Tag>
          </div>
          <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Tag color="blue" variant="filled" style={{ fontSize: '11px' }}>{doc.document_type}</Tag>
            {isVersion && <Text type="secondary" style={{ fontSize: '11px' }}>Root ID: {doc.parent_id}</Text>}
          </div>
        </div>
        <Space size={4} style={{ flexShrink: 0 }}>
          <Tooltip title="Upload New Version">
            <Button
              type="text"
              size="small"
              onClick={() => handleUpdateVersion(doc)}
              icon={<UploadOutlined style={{ color: '#fa8c16' }} />}
            />
          </Tooltip>
          <Tooltip title="View Document">
            <Button
              type="text"
              size="small"
              onClick={() => handleView(doc.id)}
              icon={<FileTextOutlined style={{ color: '#1890ff' }} />}
            />
          </Tooltip>
          <Tooltip title="Download">
            <Button
              type="text"
              size="small"
              icon={<DownloadOutlined style={{ color: '#52c41a' }} />}
              onClick={() => handleDownload(doc.id, doc.document_name)}
            />
          </Tooltip>
          <Popconfirm
            title="Delete this document?"
            onConfirm={() => handleDelete(doc.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      </div>
    </div>
  );

  const handleClose = () => {
    form.resetFields();
    form.setFieldsValue({ document_version: "1.0" });
    setDocuments([]);
    setParentId(null);
    setUpdatingDocName("");
    onClose();
  };

  return (
    <Modal
      open={isOpen}
      onCancel={handleClose}
      footer={null}
      width="95%"
      style={{ maxWidth: 1000 }}
      centered
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: 24, flexWrap: 'wrap', gap: '8px' }}>
          <Space>
            <div style={{ backgroundColor: '#e6f7ff', padding: '8px', borderRadius: '50%', display: 'flex' }}>
              <FileTextOutlined style={{ color: '#1890ff', fontSize: 20 }} />
            </div>
            <div>
              <Title level={4} style={{ margin: 0, fontSize: 'clamp(14px, 3vw, 18px)' }}>Document Management</Title>
              <Text type="secondary" style={{ fontSize: 'clamp(10px, 2vw, 12px)' }}>Manage and version project documents</Text>
            </div>
          </Space>
          <Badge count={documents.length} overflowCount={99} style={{ backgroundColor: '#1890ff' }}>
            <Tag color="blue" style={{ margin: 0, padding: '4px 12px', borderRadius: 16, fontSize: 'clamp(10px, 2vw, 12px)' }}>
              Total Documents
            </Tag>
          </Badge>
        </div>
      }
    >
      <style>{`
        @media (max-width: 768px) {
          .ant-modal-body {
            padding: 12px;
          }
        }
      `}</style>
      <Form
        form={form}
        layout="vertical"
        onFinish={handleUpload}
        initialValues={{ document_version: '1.0' }}
      >
        <Row gutter={[12, 12]}>
          <Col xs={24} lg={14}>
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <Title level={5} style={{ margin: 0, fontSize: 'clamp(14px, 3vw, 16px)' }}>Document History</Title>
              {orderId ? (
                <Tag color="cyan" style={{ fontSize: 'clamp(10px, 2vw, 12px)' }}>Order: {orders.find(order => order.id.toString() === orderId.toString())?.sale_order_number || `Order ${orderId}`}</Tag>
              ) : (
                <Select
                  value={selectedOrderId}
                  onChange={(value) => {
                    setSelectedOrderId(value);
                    fetchDocuments(value);
                  }}
                  placeholder="Select order"
                  style={{ width: '100%', maxWidth: 200 }}
                  size="small"
                >
                  {orders.map((order) => (
                    <Option key={order.id} value={order.id.toString()}>
                      {order.sale_order_number}
                    </Option>
                  ))}
                </Select>
              )}
            </div>
            
            <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 8 }}>
              {selectedOrderId ? (
                documents.length === 0 ? (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="No documents found for this order"
                    style={{ padding: '40px 0', backgroundColor: '#fafafa', borderRadius: 8 }}
                  />
                ) : (
                  groupDocuments().map(root => (
                    <div key={root.id} style={{ marginBottom: 16 }}>
                      {renderDocumentItem(root)}
                      {root.versions.map(v => renderDocumentItem(v, true))}
                    </div>
                  ))
                )
              ) : (
                <Empty description="Select an order to view documents" />
              )}
            </div>
          </Col>

          <Col xs={24} lg={10}>
            <div 
              style={{ 
                backgroundColor: '#f9fafb', 
                padding: '16px', 
                borderRadius: 12, 
                border: '1px solid #f0f0f0',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: '8px' }}>
                <Title level={5} style={{ margin: 0, fontSize: 'clamp(14px, 3vw, 16px)' }}>
                  {parentId ? (
                    <Space><UploadOutlined /> Update Version</Space>
                  ) : (
                    <Space><UploadOutlined /> New Upload</Space>
                  )}
                </Title>
                {parentId && (
                  <Button 
                    type="link" 
                    danger 
                    size="small" 
                    onClick={() => {
                      setParentId(null);
                      setUpdatingDocName("");
                      form.resetFields();
                      form.setFieldsValue({ document_version: "1.0" });
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>

              {parentId && (
                <div style={{ marginBottom: 16, padding: '10px', backgroundColor: '#e6f7ff', border: '1px solid #91d5ff', borderRadius: 6 }}>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>UPDATING FILE:</Text>
                  <Text strong style={{ fontSize: 13 }}>{updatingDocName}</Text>
                </div>
              )}

              <Form.Item 
                name="file" 
                valuePropName="fileList"
                getValueFromEvent={(e) => {
                  if (Array.isArray(e)) return e;
                  return e?.fileList;
                }}
                rules={[{ required: true, message: 'Please select a file' }]} 
                style={{ marginBottom: 16 }}
              >
                <Upload.Dragger
                  multiple={false}
                  beforeUpload={() => false}
                  maxCount={1}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                  style={{ backgroundColor: '#fff' }}
                >
                  <p className="ant-upload-drag-icon">
                    <UploadOutlined style={{ color: '#1890ff' }} />
                  </p>
                  <p className="ant-upload-text" style={{ fontSize: 'clamp(12px, 3vw, 14px)' }}>Click or drag file</p>
                  <p className="ant-upload-hint" style={{ fontSize: 'clamp(10px, 2vw, 11px)' }}>PDF, DOC, XLS, CSV, TXT</p>
                </Upload.Dragger>
              </Form.Item>

              <Row gutter={[12, 12]}>
                <Col xs={24} sm={14}>
                  <Form.Item
                    shouldUpdate={(prev, current) => prev.document_type !== current.document_type}
                    label="Document Type"
                    style={{ marginBottom: 16 }}
                  >
                    {({ getFieldValue }) => {
                      const type = getFieldValue("document_type");
                      return (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
                          <Form.Item
                            name="document_type"
                            style={{ marginBottom: 0 }}
                            rules={[{ required: true, message: "Please select document type" }]}
                          >
                            <Select placeholder="Select type">
                              <Option value="Other">Other</Option>
                            </Select>
                          </Form.Item>
                          {type === "Other" && (
                            <Form.Item
                              name="document_type_other"
                              style={{ marginBottom: 0 }}
                            >
                              <Input placeholder="Enter document type name" />
                            </Form.Item>
                          )}
                        </div>
                      );
                    }}
                  </Form.Item>
                </Col>
                <Col xs={24} sm={10}>
                  <Form.Item name="document_version" label="Version" rules={[{ required: true }]} style={{ marginBottom: 16 }}>
                    <Input 
                      placeholder="1.0" 
                      disabled={!parentId} 
                      style={{ backgroundColor: !parentId ? '#f5f5f5' : '#fff', fontWeight: 'bold' }} 
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Button 
                type="primary" 
                htmlType="submit" 
                loading={loading} 
                disabled={!selectedOrderId}
                icon={<UploadOutlined />}
                block
                size="large"
                style={{ height: 45, borderRadius: 8, marginTop: 8 }}
              >
                {parentId ? "Upload New Version" : "Upload Document"}
              </Button>
            </div>
          </Col>
        </Row>
      </Form>

      <Divider style={{ margin: '16px 0' }} />
      <div style={{ textAlign: 'right' }}>
        <Button onClick={handleClose}>Close</Button>
      </div>

      <Modal
        open={viewerOpen}
        onCancel={() => { setViewerOpen(false); setViewerDoc(null); }}
        footer={null}
        width="95%"
        style={{ maxWidth: 1000 }}
        title={viewerDoc?.document_name || 'Preview'}
      >
        {viewerDoc ? (
          <>
            {(viewerDoc.document_type?.includes('pdf') || viewerDoc.document_url?.toLowerCase().endsWith('.pdf')) ? (
              <iframe
                src={viewerDoc.document_url}
                title="Document Preview"
                style={{ width: '100%', height: '75vh', border: 'none' }}
              />
            ) : (viewerDoc.document_type?.startsWith('image/') ? (
              <img
                src={viewerDoc.document_url}
                alt={viewerDoc.document_name}
                style={{ maxWidth: '100%', maxHeight: '75vh' }}
              />
            ) : (
              <div style={{ padding: 16 }}>
                <Empty description="Preview not available for this file type. Use Download." />
              </div>
            ))}
          </>
        ) : null}
      </Modal>
    </Modal>
  );
};

export default DocumentModal;
