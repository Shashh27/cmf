import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "../Config/auth";
import { Modal, Form, Input, Select, Button, Upload, Typography, Space, Row, Col } from "antd";
import { FileTextOutlined, UploadOutlined, CloseOutlined } from "@ant-design/icons";
import { message } from "antd";

const { Title } = Typography;
const { Option } = Select;

const OrderModal = ({ isOpen, onClose, onOrderCreated, editingOrder, customers, products }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState([]);


  useEffect(() => {
    if (isOpen) {
      if (editingOrder) {
        form.setFieldsValue({
          ...editingOrder,
          customer_id: editingOrder.customer_id?.toString() ?? "",
          product_id: editingOrder.product_id?.toString() ?? "",
          quantity: editingOrder.quantity?.toString() ?? "",
          due_date: editingOrder.due_date ? editingOrder.due_date.split("T")[0] : "",
          priority: editingOrder.priority?.toString() ?? "0",
          supervisor_id: editingOrder.supervisor_id?.toString() ?? "",
        });
      } else {
        form.resetFields();
        form.setFieldsValue({
          status: "Pending",
          priority: "0",
        });
        setDocuments([]);
      }
    }
  }, [isOpen, editingOrder, form]);


  const handleSubmit = async (values) => {
    setLoading(true);

    try {
      const url = editingOrder 
        ? `${API_BASE_URL}/orders/${editingOrder.id}/`
        : `${API_BASE_URL}/orders/`;
      
      const method = editingOrder ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...values,
          quantity: parseInt(values.quantity),
          customer_id: parseInt(values.customer_id),
          product_id: parseInt(values.product_id),
          priority: parseInt(values.priority) || 0,
          supervisor_id: parseInt(values.supervisor_id) || 0,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        
        // Upload documents if this is a new order and documents are provided
        if (!editingOrder && documents.length > 0) {
          await uploadDocumentsForOrder(result.id);
        }
        
        onOrderCreated(result);
        handleClose();
      } else {
        message.error("Failed to save order");
      }
    } catch (error) {
      console.error("Error saving order:", error);
      message.error("Error saving order");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    form.resetFields();
    setDocuments([]);
    onClose();
  };

  const handleDocumentAdd = () => {
    setDocuments([...documents, { file: null, document_name: "", document_type: "", document_version: "1.0" }]);
  };

  const handleDocumentRemove = (index) => {
    const newDocuments = documents.filter((_, i) => i !== index);
    setDocuments(newDocuments);
  };

  const handleDocumentChange = (index, field, value) => {
    const newDocuments = [...documents];
    newDocuments[index][field] = value;
    setDocuments(newDocuments);
  };

  const uploadDocumentsForOrder = async (orderId) => {
    for (const doc of documents) {
      if (doc.file) {
        const uploadFormData = new FormData();
        uploadFormData.append("file", doc.file);
        uploadFormData.append("document_name", doc.document_name || doc.file?.name || "Document");
        uploadFormData.append("document_type", doc.document_type || "Document");
        uploadFormData.append("document_version", doc.document_version || "1.0");

        try {
          await fetch(`${API_BASE_URL}/order-documents/upload/${orderId}`, {
            method: "POST",
            body: uploadFormData,
          });
        } catch (error) {
          console.error("Error uploading document:", error);
        }
      }
    }
  };

  return (
    <Modal
      open={isOpen}
      onCancel={handleClose}
      footer={null}
      width={600}
      title={
        <Title level={4} style={{ margin: 0 }}>
          {editingOrder ? "Edit Order" : "Create New Order"}
        </Title>
      }
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        style={{ maxHeight: '70vh', overflowY: 'auto' }}
      >
        <Form.Item
          name="sale_order_number"
          label="Sale Order Number"
          rules={[{ required: true, message: 'Please enter sale order number' }]}
        >
          <Input placeholder="Enter sale order number" />
        </Form.Item>
        
        <Form.Item
          name="customer_id"
          label="Customer"
          rules={[{ required: true, message: 'Please select a customer' }]}
        >
          <Select placeholder="Select customer">
            {customers.map((customer) => (
              <Option key={customer.id} value={customer.id.toString()}>
                {customer.company_name}
              </Option>
            ))}
          </Select>
        </Form.Item>
        
        <Form.Item
          name="product_id"
          label="Product"
          rules={[{ required: true, message: 'Please select a product' }]}
        >
          <Select placeholder="Select product">
            {products.map((product) => (
              <Option key={product.id} value={product.id.toString()}>
                {product.product_name || product.product_number || `Product ${product.id}`}
              </Option>
            ))}
          </Select>
        </Form.Item>
        
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="quantity"
              label="Quantity"
              rules={[{ required: true, message: 'Please enter quantity' }]}
            >
              <Input type="number" placeholder="Qty" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="priority"
              label="Priority"
            >
              <Input type="number" placeholder="Priority" />
            </Form.Item>
          </Col>
        </Row>
        
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="due_date"
              label="Due Date"
            >
              <Input type="date" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="status"
              label="Status"
            >
              <Select>
                <Option value="Pending">Pending</Option>
                <Option value="Shipped">Shipped</Option>
                <Option value="Delivered">Delivered</Option>
                <Option value="Cancelled">Cancelled</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>
        
        <Form.Item
          name="supervisor_id"
          label="Supervisor ID"
        >
          <Input placeholder="Enter supervisor ID" />
        </Form.Item>

        {/* Document Upload Section - Only for new orders */}
        {!editingOrder && (
          <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: '16px' }}>
            <Title level={5} style={{ marginBottom: '16px' }}>
              <FileTextOutlined /> Documents (Optional)
            </Title>

            {documents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', border: '2px dashed #d9d9d9', borderRadius: '6px' }}>
                <UploadOutlined style={{ fontSize: '24px', color: '#bfbfbf', marginBottom: '8px' }} />
                <p style={{ color: '#8c8c8c', marginBottom: '16px' }}>No documents added yet</p>
                <Button
                  icon={<UploadOutlined />}
                  onClick={handleDocumentAdd}
                >
                  Add Document
                </Button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {documents.map((doc, index) => (
                  <div key={index} style={{ padding: '16px', backgroundColor: '#fafafa', border: '1px solid #d9d9d9', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <Title level={5} style={{ margin: 0 }}>Document {index + 1}</Title>
                      <Button
                        type="text"
                        icon={<CloseOutlined />}
                        onClick={() => handleDocumentRemove(index)}
                        size="small"
                      />
                    </div>
                    
                    <Row gutter={8}>
                      <Col span={12}>
                        <Form.Item label="File" style={{ marginBottom: '8px' }}>
                          <Input
                            type="file"
                            onChange={(e) => handleDocumentChange(index, 'file', e.target.files[0])}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item label="Name" style={{ marginBottom: '8px' }}>
                          <Input
                            value={doc.document_name}
                            onChange={(e) => handleDocumentChange(index, 'document_name', e.target.value)}
                            placeholder="Document name"
                          />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item label="Type" style={{ marginBottom: '8px' }}>
                          <Input
                            value={doc.document_type}
                            onChange={(e) => handleDocumentChange(index, 'document_type', e.target.value)}
                            placeholder="e.g., Invoice"
                          />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item label="Version" style={{ marginBottom: '8px' }}>
                          <Input
                            value={doc.document_version}
                            onChange={(e) => handleDocumentChange(index, 'document_version', e.target.value)}
                            placeholder="1.0"
                          />
                        </Form.Item>
                      </Col>
                    </Row>
                  </div>
                ))}
                
                <Button
                  icon={<UploadOutlined />}
                  onClick={handleDocumentAdd}
                  style={{ width: '100%' }}
                >
                  Add Another Document
                </Button>
              </div>
            )}
          </div>
        )}
        
        <div style={{ textAlign: 'right', marginTop: '24px', borderTop: '1px solid #f0f0f0', paddingTop: '16px' }}>
          <Space>
            <Button onClick={handleClose}>
              Cancel
            </Button>
            <Button type="primary" htmlType="submit" loading={loading}>
              {editingOrder ? "Update" : "Create"}
            </Button>
          </Space>
        </div>
      </Form>
    </Modal>
  );
};

export default OrderModal;
