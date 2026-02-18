import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "../Config/auth";
import { Modal, Form, Input, Select, Button, Typography, Space, Row, Col, Collapse } from "antd";
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
          order_date: editingOrder.order_date ? editingOrder.order_date.split("T")[0] : "",
          user_id: editingOrder.user_id?.toString() ?? "",
        });
      } else {
        form.resetFields();
        form.setFieldsValue({
          status: "Pending",
        });
        setDocuments([]);

        try {
          const stored = localStorage.getItem("user");
          if (stored) {
            const userObj = JSON.parse(stored);
            if (userObj?.id != null) {
              form.setFieldsValue({ user_id: String(userObj.id) });
            }
            if (userObj?.user_name) {
              form.setFieldsValue({ user_name_display: userObj.user_name });
            }
          }
        } catch {}
      }
    }
  }, [isOpen, editingOrder, form]);


  const handleSubmit = async (values) => {
    setLoading(true);

    try {
      const url = editingOrder 
        ? `${API_BASE_URL}/orders/${editingOrder.id}`
        : `${API_BASE_URL}/orders/`;
      
      const method = editingOrder ? 'PUT' : 'POST';
      
      const payload = {
        ...values,
        quantity: parseInt(values.quantity),
        customer_id: parseInt(values.customer_id),
        product_id: parseInt(values.product_id),
        user_id: values.user_id ? parseInt(values.user_id) : undefined,
      };

      if (values.due_date) {
        try {
          payload.due_date = new Date(values.due_date).toISOString();
        } catch {
          delete payload.due_date;
        }
      } else {
        delete payload.due_date;
      }

      if (values.order_date) {
        try {
          payload.order_date = new Date(values.order_date).toISOString();
        } catch {
          delete payload.order_date;
        }
      } else {
        delete payload.order_date;
      }

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
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
        uploadFormData.append("document_version", "1.0"); // Hardcoded to 1.0 for new order creation

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
      width={1100}
      centered
      maskClosable={false}
      keyboard={false}
      title={
        <div className="flex items-center gap-2">
          <FileTextOutlined className="text-blue-500" />
          <span className="font-bold text-gray-800">
            {editingOrder ? "Edit Order" : "Create New Order"}
          </span>
        </div>
      }
    >
      <style>{`
        .hide-optional .ant-form-item-optional { display: none !important; }
      `}</style>
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        className="mt-2"
        requiredMark="optional"
      >
        <Row gutter={24}>
          <Col span={6}>
            <Form.Item
              name="user_name_display"
              label={<span className="text-xs font-bold text-gray-600 uppercase tracking-wider">User</span>}
              className="mb-4 hide-optional"
            >
              <Input placeholder="Name" className="rounded-md border-gray-300 h-10" disabled readOnly />
            </Form.Item>
          </Col>
          <Form.Item name="user_id" hidden rules={[{ required: true, message: 'Required' }]}>
            <input type="hidden" />
          </Form.Item>
        </Row>
        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6 shadow-sm">
          <Row gutter={24}>
            <Col span={6}>
              <Form.Item
                name="sale_order_number"
                label={<span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Project Number</span>}
                rules={[{ required: true, message: 'Required' }]}
                className="mb-4"
              >
                <Input placeholder="Enter #" className="rounded-md border-gray-300 h-10" autoComplete="off" />
              </Form.Item>
            </Col>
            <Col span={9}>
              <Form.Item
                name="project_name"
                label={<span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Project Name</span>}
                className="mb-4"
              >
                <Input placeholder="Enter project name" className="rounded-md border-gray-300 h-10" autoComplete="off" />
              </Form.Item>
            </Col>
            <Col span={9}>
              <Form.Item
                name="customer_id"
                label={<span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Customer</span>}
                rules={[{ required: true, message: 'Required' }]}
                className="mb-4"
              >
                <Select placeholder="Select customer" className="h-10 custom-select-v2">
                  {customers.map((customer) => (
                    <Option key={customer.id} value={customer.id.toString()}>
                      {customer.company_name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={24}>
            <Col span={6}>
              <Form.Item
                name="product_id"
                label={<span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Product</span>}
                rules={[{ required: true, message: 'Required' }]}
                className="mb-0"
              >
                <Select placeholder="Select product" className="h-10">
                  {products.map((product) => (
                    <Option key={product.id} value={product.id.toString()}>
                      {product.product_name || product.product_number || `Product ${product.id}`}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item
                name="quantity"
                label={<span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Quantity</span>}
                rules={[{ required: true, message: 'Required' }]}
                className="mb-0"
              >
                <Input type="number" placeholder="Qty" className="h-10 rounded-md border-gray-300" />
              </Form.Item>
            </Col>
            <Col span={5}>
              <Form.Item
                name="order_date"
                label={<span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Order Date</span>}
                className="mb-0"
              >
                <Input type="date" className="h-10 rounded-md border-gray-300" />
              </Form.Item>
            </Col>
            <Col span={5}>
              <Form.Item
                name="due_date"
                label={<span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Due Date</span>}
                rules={[{ required: true, message: 'Required' }]}
                className="mb-0"
              >
                <Input type="date" className="h-10 rounded-md border-gray-300" />
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item
                name="status"
                label={<span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Status</span>}
                className="mb-0"
              >
                <Select className="h-10">
                  <Option value="Pending">Pending</Option>
                  <Option value="Ongoing">Ongoing</Option>
                  <Option value="Completed">Completed</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
        </div>
        
        {/* Document Upload Section - Only for new orders */}
        {!editingOrder && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-4 px-1">
              <h4 className="text-base font-bold text-gray-800 flex items-center gap-2 m-0">
                <FileTextOutlined className="text-blue-500" />
                Order Documents (Optional)
              </h4>
              <Button
                type="dashed"
                icon={<UploadOutlined />}
                onClick={handleDocumentAdd}
                className="flex items-center gap-1"
              >
                Add Document
              </Button>
            </div>

            {documents.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50">
                <UploadOutlined className="text-3xl text-gray-300 mb-2" />
                <p className="text-gray-500 m-0">No documents added yet</p>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-[10px] uppercase font-bold text-gray-500 w-[5%] text-center">#</th>
                      <th className="px-4 py-3 text-[10px] uppercase font-bold text-gray-500 w-[30%]">File Selection</th>
                      <th className="px-4 py-3 text-[10px] uppercase font-bold text-gray-500 w-[30%]">Document Name</th>
                      <th className="px-4 py-3 text-[10px] uppercase font-bold text-gray-500 w-[20%]">Document Type</th>
                      <th className="px-4 py-3 text-[10px] uppercase font-bold text-gray-500 w-[10%] text-center">Ver</th>
                      <th className="px-4 py-3 text-[10px] uppercase font-bold text-gray-500 w-[5%] text-center">Del</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc, index) => (
                      <tr key={index} className="border-b border-gray-100 last:border-0 hover:bg-blue-50/20 transition-all align-middle">
                        <td className="px-4 py-6 text-center align-middle">
                          <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md border border-blue-100">
                            {index + 1}
                          </span>
                        </td>
                        <td className="px-4 py-6 align-middle">
                          <div className="relative h-10"> {/* Fixed height matching other inputs */}
                            <input
                              type="file"
                              id={`file-upload-${index}`}
                              style={{ display: 'none' }}
                              onChange={(e) => {
                                const file = e.target.files[0];
                                handleDocumentChange(index, 'file', file);
                                if (file && !doc.document_name) {
                                  handleDocumentChange(index, 'document_name', file.name.split('.')[0]);
                                }
                              }}
                            />
                            <Button
                              icon={<UploadOutlined />}
                              onClick={() => document.getElementById(`file-upload-${index}`).click()}
                              className={`h-10 rounded-md border-dashed flex items-center justify-center transition-all ${
                                doc.file 
                                  ? "bg-blue-50 border-blue-400 text-blue-600 font-bold" 
                                  : "bg-gray-50 border-gray-300 text-gray-500 hover:border-blue-500 hover:text-blue-500"
                              }`}
                              block
                            >
                              {doc.file ? "Change File" : "Choose File"}
                            </Button>
                            {doc.file && (
                              <div className="absolute left-0 -bottom-5 text-[10px] text-blue-600 font-medium truncate w-full px-1 italic leading-none">
                                Selected: {doc.file.name}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-6 align-middle">
                          <Input
                            value={doc.document_name}
                            onChange={(e) => handleDocumentChange(index, 'document_name', e.target.value)}
                            placeholder="Enter document name"
                            className={`text-sm h-10 rounded-md border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-all placeholder:text-gray-400 ${doc.document_name ? 'bg-blue-50/10 border-blue-200 font-medium text-blue-700' : ''}`}
                          />
                        </td>
                        <td className="px-4 py-6 align-middle">
                          <Select
                            value={doc.document_type}
                            onChange={(value) => handleDocumentChange(index, 'document_type', value)}
                            placeholder="Select Type"
                            className="text-sm w-full h-10 custom-select-v2"
                            size="middle"
                          >
                            <Option value="Other">Other</Option>
                      
                          </Select>
                        </td>
                        <td className="px-4 py-6 text-center align-middle">
                          <span className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1.5 rounded-md border border-gray-200">
                            1.0
                          </span>
                        </td>
                        <td className="px-4 py-6 text-center align-middle">
                          <Button
                            type="text"
                            danger
                            icon={<CloseOutlined className="text-lg" />}
                            onClick={() => handleDocumentRemove(index)}
                            className="hover:bg-red-50 rounded-full w-10 h-10 flex items-center justify-center transition-all hover:scale-110"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        
        <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-100">
          <Button onClick={handleClose} size="large" className="rounded-md px-8">
            Cancel
          </Button>
          <Button 
            type="primary" 
            htmlType="submit" 
            loading={loading} 
            size="large"
            className="no-hover-btn rounded-md px-10 font-semibold"
          >
            {editingOrder ? "Update Order" : "Create Order"}
          </Button>
        </div>
      </Form>
    </Modal>
  );
};

export default OrderModal;
