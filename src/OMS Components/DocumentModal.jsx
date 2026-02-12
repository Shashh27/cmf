import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "../Config/auth";
import { Modal, Form, Input, Select, Button, Typography, Space, Row, Col, Empty, message } from "antd";
import { FileTextOutlined, DownloadOutlined, DeleteOutlined } from "@ant-design/icons";

const { Title, Text } = Typography;
const { Option } = Select;

const DocumentModal = ({ isOpen, onClose, onDocumentUploaded, orderId, orders }) => {
  const [form] = Form.useForm();
  const [selectedOrderId, setSelectedOrderId] = useState(orderId || "");
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState([]);

  useEffect(() => {
    if (orderId) {
      setSelectedOrderId(orderId);
      fetchDocuments(orderId);
    }
  }, [orderId]);


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

  const handleFileChange = (e) => {
    form.setFieldsValue({ file: e.target.files[0] });
  };

  const handleUpload = async (values) => {
    if (!values.file || !selectedOrderId) {
      message.error("Please select a file and order");
      return;
    }

    setLoading(true);
    const uploadFormData = new FormData();
    uploadFormData.append("file", values.file);
    uploadFormData.append("document_type", values.document_type);
    uploadFormData.append("document_version", values.document_version);

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
        if (selectedOrderId) {
          fetchDocuments(selectedOrderId);
        }
        message.success("Document uploaded successfully");
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
      const response = await fetch(`${API_BASE_URL}/order-documents/download/${documentId}`);
      if (response.ok) {
        const data = await response.json();
        console.log('Download response:', data); // Debug log
        
        if (data.download_url) {
          // Open the download URL in a new tab to handle CORS properly
          const newWindow = window.open(data.download_url, '_blank');
          if (!newWindow) {
            // If popup is blocked, try creating a download link
            const link = document.createElement('a');
            link.href = data.download_url;
            link.download = documentName;
            link.target = '_blank';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }
        } else {
          message.error("No download URL available");
        }
      } else {
        message.error(`Failed to download document: ${response.statusText}`);
      }
    } catch (error) {
      console.error("Error downloading document:", error);
      message.error("Error downloading document");
    }
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

  const handleClose = () => {
    form.resetFields();
    form.setFieldsValue({ document_version: "1.0" });
    setDocuments([]);
    onClose();
  };

  return (
    <Modal
      open={isOpen}
      onCancel={handleClose}
      footer={null}
      width={700}
      title={
        <Title level={4} style={{ margin: 0 }}>
          Document Management
        </Title>
      }
    >
      <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
        {/* Upload Form */}
        <div style={{ backgroundColor: '#fafafa', padding: '16px', borderRadius: '6px', border: '1px solid #d9d9d9', marginBottom: '16px' }}>
          <Title level={5} style={{ marginBottom: '16px' }}>Upload Document</Title>
          <Form
            form={form}
            layout="vertical"
            onFinish={handleUpload}
            initialValues={{ document_version: '1.0' }}
          >
            <Form.Item
              label="Order"
              name="order"
            >
              {orderId ? (
                <Input
                  value={orders.find(order => order.id.toString() === orderId)?.sale_order_number || `Order ${orderId}`}
                  disabled
                  style={{ backgroundColor: '#f5f5f5' }}
                />
              ) : (
                <Select
                  value={selectedOrderId}
                  onChange={(value) => {
                    setSelectedOrderId(value);
                    fetchDocuments(value);
                  }}
                  placeholder="Select order"
                >
                  {orders.map((order) => (
                    <Option key={order.id} value={order.id.toString()}>
                      {order.sale_order_number}
                    </Option>
                  ))}
                </Select>
              )}
            </Form.Item>
            
            <Form.Item
              label="File"
              name="file"
              rules={[{ required: true, message: 'Please select a file' }]}
            >
              <Input
                type="file"
                onChange={handleFileChange}
              />
            </Form.Item>
            
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  label="Document Type"
                  name="document_type"
                >
                  <Input placeholder="e.g., Invoice" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  label="Version"
                  name="document_version"
                >
                  <Input />
                </Form.Item>
              </Col>
            </Row>
            
            <div style={{ textAlign: 'right' }}>
              <Button type="primary" htmlType="submit" loading={loading}>
                Upload
              </Button>
            </div>
          </Form>
        </div>

        {/* Documents List */}
        {selectedOrderId && (
          <div style={{ backgroundColor: '#fafafa', padding: '16px', borderRadius: '6px', border: '1px solid #d9d9d9' }}>
            <Title level={5} style={{ marginBottom: '16px' }}>
              Documents for Order {selectedOrderId}
            </Title>
            {documents.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No documents found for this order"
                style={{ padding: '20px 0' }}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    style={{
                      backgroundColor: 'white',
                      padding: '12px',
                      borderRadius: '6px',
                      border: '1px solid #d9d9d9',
                      transition: 'box-shadow 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text strong style={{ fontSize: '14px', display: 'block' }}>
                          {doc.document_name}
                        </Text>
                        <div style={{ fontSize: '12px', color: '#666', marginTop: '4px', display: 'flex', gap: '16px' }}>
                          <span>Type: <Text strong>{doc.document_type}</Text></span>
                          <span>Ver: <Text strong>{doc.document_version}</Text></span>
                        </div>
                        <Text type="secondary" style={{ fontSize: '12px', marginTop: '4px', display: 'block' }}>
                          {new Date(doc.uploaded_at).toLocaleDateString()}
                        </Text>
                      </div>
                      <Space>
                        <Button
                          size="small"
                          icon={<DownloadOutlined />}
                          onClick={() => handleDownload(doc.id, doc.document_name)}
                        >
                          Download
                        </Button>
                        <Button
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => handleDelete(doc.id)}
                        >
                          Delete
                        </Button>
                      </Space>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ textAlign: 'right', marginTop: '16px', borderTop: '1px solid #f0f0f0', paddingTop: '16px' }}>
        <Button onClick={handleClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
};

export default DocumentModal;
