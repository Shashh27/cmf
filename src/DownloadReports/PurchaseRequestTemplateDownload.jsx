import React, { useState, useEffect } from "react";
import { Modal, Button, Card, Space, Typography, message, Spin, Form, Input, InputNumber, Select, Row, Col } from "antd";
import { FileWordOutlined, DownloadOutlined, EditOutlined, CheckOutlined } from "@ant-design/icons";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth";
import DimensionInputs from "../RawMaterialComponents/DimensionInputs";

const { Text, Title } = Typography;
const { TextArea } = Input;

const PurchaseRequestTemplateDownload = ({ visible, onClose, stockRecord, linkedMaterials }) => {
  const [loading, setLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [form] = Form.useForm();
  const [dimensions, setDimensions] = useState({
    diameter: stockRecord?.diameter || null,
    length: stockRecord?.length || null,
    breadth: stockRecord?.breadth || null,
    height: stockRecord?.height || null,
    inner_diameter: null,
    outer_diameter: null
  });

  const handleDimensionChange = (field, value) => {
    setDimensions(prev => ({ ...prev, [field]: value }));
  };

  // Auto-select template based on cost when modal opens
  useEffect(() => {
    if (visible && stockRecord) {
      handleAutoSelect();
    }
  }, [visible]);

  const getDimensionsDisplay = (formType, dims) => {
    if (formType === 'Round') {
      const parts = [];
      if (dims.diameter) parts.push(`Ø${dims.diameter}mm`);
      if (dims.length) parts.push(`${dims.length}mm`);
      return parts.join(' × ');
    } else if (formType === 'Square') {
      const parts = [];
      if (dims.breadth) parts.push(`${dims.breadth}mm`);
      if (dims.height) parts.push(`${dims.height}mm`);
      if (dims.length) parts.push(`${dims.length}mm`);
      return parts.join(' × ');
    } else if (formType === 'Pipe') {
      const parts = [];
      if (dims.inner_diameter) parts.push(`ID: ${dims.inner_diameter}mm`);
      if (dims.outer_diameter) parts.push(`OD: ${dims.outer_diameter}mm`);
      if (dims.length) parts.push(`${dims.length}mm`);
      return parts.join(' × ');
    }
    return '';
  };

  const templates = [
    {
      key: "up_25000",
      title: "Up to ₹25,000",
      description: "For purchase requests with amount up to ₹25,000",
      icon: <FileWordOutlined style={{ fontSize: 32, color: "#1890ff" }} />,
      templateType: "up_25000"
    },
    {
      key: "25000_to_50000",
      title: "₹25,000 to ₹50,000",
      description: "For purchase requests with amount between ₹25,000 and ₹50,000",
      icon: <FileWordOutlined style={{ fontSize: 32, color: "#52c41a" }} />,
      templateType: "25000_to_50000"
    },
    {
      key: "more_than_50000",
      title: "More than ₹50,000",
      description: "For purchase requests with amount more than ₹50,000",
      icon: <FileWordOutlined style={{ fontSize: 32, color: "#fa8c16" }} />,
      templateType: "more_than_50000"
    }
  ];

  const handleSelectTemplate = (template) => {
    setSelectedTemplate(template);
    
    // Initialize dimensions based on form type from stock record
    const formType = stockRecord?.form_type || "Round";
    let initialDimensions = {
      diameter: null,
      length: null,
      breadth: null,
      height: null,
      inner_diameter: null,
      outer_diameter: null
    };
    
    if (formType === "Round") {
      initialDimensions.diameter = stockRecord?.diameter || null;
      initialDimensions.length = stockRecord?.length || null;
    } else if (formType === "Square") {
      initialDimensions.breadth = stockRecord?.breadth || null;
      initialDimensions.height = stockRecord?.height || null;
      initialDimensions.length = stockRecord?.length || null;
    } else if (formType === "Pipe") {
      initialDimensions.inner_diameter = stockRecord?.inner_diameter || null;
      initialDimensions.outer_diameter = stockRecord?.outer_diameter || null;
      initialDimensions.length = stockRecord?.length || null;
    }
    
    setDimensions(initialDimensions);
    
    // Pre-fill form with stock record data from API
    // For grouped orders, calculate total estimated cost from all items in the group
    let costValue;
    if (stockRecord?.merge_group_id) {
      // Find all items in the same group and sum their estimated costs
      const groupItems = linkedMaterials.filter(item => item.merge_group_id === stockRecord.merge_group_id);
      costValue = groupItems.reduce((sum, item) => sum + (item.estimated_cost || 0), 0);
    } else {
      costValue = stockRecord?.final_cost || stockRecord?.estimated_cost || 0;
    }
    
    // Get current user's name for indenting officer field
    const getCurrentUserName = () => {
      try {
        const stored = localStorage.getItem("user");
        if (!stored) return "";
        const u = JSON.parse(stored);
        return u?.user_name || u?.name || "";
      } catch {
        return "";
      }
    };
    
    form.setFieldsValue({
      indenting_officer: getCurrentUserName() || stockRecord?.creator_name || "",
      designation: "",
      centre_group: stockRecord?.merge_group_id || "",
      material_required: stockRecord?.material_name || "",
      form_type: formType,
      quantity: stockRecord?.quantity || "",
      project_number: stockRecord?.source_order_number || "",
      project_name: stockRecord?.product_name || stockRecord?.part_names?.[0] || "",
      budget_head: "",
      cost: costValue,
      source_of_supply: stockRecord?.received_vendor_name || stockRecord?.vendor_name || "",
      no_stock_certificate: "",
      processed_by: template.templateType === "up_25000" ? "purchase" : "purchase_dept_only",
      requirement_type: "fresh",
      is_imported: "no",
      delivery_period: "",
      proprietary_certificate: "not_applicable",
      cgc_approval: "not_applicable"
    });
    
    setShowPreview(true);
  };

  const handleBack = () => {
    setShowPreview(false);
    setSelectedTemplate(null);
  };

  const handleDownload = async () => {
    try {
      const values = await form.validateFields();
      
      if (!stockRecord) {
        message.error("No stock record selected");
        return;
      }

      // Merge dimensions into form values
      const dataWithDimensions = {
        ...values,
        ...dimensions
      };

      setLoading(true);
      try {
        const response = await axios.post(
          `${API_BASE_URL}/rawmaterials/order-materials/${stockRecord.id}/purchase-request`,
          {
            template_type: selectedTemplate.templateType,
            data: dataWithDimensions
          },
          {
            responseType: "blob"
          }
        );

        // Create download link
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute(
          "download",
          `PurchaseReq_${stockRecord.material_name}_${selectedTemplate.templateType}.docx`
        );
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);

        message.success("Purchase request downloaded successfully");
        onClose();
        setShowPreview(false);
        setSelectedTemplate(null);
      } catch (error) {
        console.error("Download error:", error);
        message.error(error?.response?.data?.detail || "Failed to download purchase request");
      } finally {
        setLoading(false);
      }
    } catch (error) {
      message.error("Please fill in all required fields");
    }
  };

  const handleAutoSelect = () => {
    const cost = stockRecord?.final_cost || stockRecord?.estimated_cost || 0;
    let template;
    if (cost <= 25000) {
      template = templates[0];
    } else if (cost <= 50000) {
      template = templates[1];
    } else {
      template = templates[2];
    }
    handleSelectTemplate(template);
  };

  if (showPreview && selectedTemplate) {
    return (
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", paddingRight: 60 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <EditOutlined />
              <span>Edit Purchase Request Details</span>
            </div>
            <Text type="secondary" style={{ fontSize: 11 }}>
              Template: {selectedTemplate.title}
            </Text>
          </div>
        }
        open={visible}
        onCancel={() => {
          setShowPreview(false);
          setSelectedTemplate(null);
          onClose();
        }}
        width="90vw"
        style={{ maxWidth: 1200, top: 20 }}
        styles={{ body: { maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', padding: '16px' } }}
        centered
        footer={[
          <Button key="back" onClick={handleBack}>
            Back to Templates
          </Button>,
          <Button key="cancel" onClick={() => {
            setShowPreview(false);
            setSelectedTemplate(null);
            onClose();
          }}>
            Cancel
          </Button>,
          <Button
            key="download"
            type="primary"
            icon={<DownloadOutlined />}
            loading={loading}
            onClick={handleDownload}
          >
            Download
          </Button>
        ]}
      >
        <Spin spinning={loading}>
          <Form form={form} layout="vertical">
            <Row gutter={[12, 12]}>
              <Col xs={24} sm={12} md={8} lg={6}>
                <Form.Item
                  label="Indenting Officer"
                  name="indenting_officer"
                  rules={[{ required: true, message: "Required" }]}
                  style={{ marginBottom: 8 }}
                >
                  <Input placeholder="Officer name" size="small" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8} lg={6}>
                <Form.Item
                  label="Designation"
                  name="designation"
                  style={{ marginBottom: 8 }}
                >
                  <Input placeholder="Designation" size="small" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8} lg={6}>
                <Form.Item
                  label="Centre/Group"
                  name="centre_group"
                  style={{ marginBottom: 8 }}
                >
                  <Input placeholder="Centre/Group" size="small" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8} lg={6}>
                <Form.Item
                  label="Quantity"
                  name="quantity"
                  rules={[{ required: true, message: "Required" }]}
                  style={{ marginBottom: 8 }}
                >
                  <InputNumber 
                    style={{ width: "100%" }} 
                    placeholder="Qty" 
                    size="small" 
                    disabled={!!stockRecord?.merge_group_id}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={[12, 12]}>
              <Col xs={24} sm={12} md={8}>
                <Form.Item
                  label="Project Number"
                  name="project_number"
                  rules={[{ required: true, message: "Required" }]}
                  style={{ marginBottom: 8 }}
                >
                  <Input 
                    placeholder="Project number" 
                    size="small" 
                    disabled={!!stockRecord?.merge_group_id}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item label="Project Name" name="project_name" style={{ marginBottom: 8 }}>
                  <Input 
                    placeholder="Project name" 
                    size="small" 
                    disabled={!!stockRecord?.merge_group_id}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item label="Budget Head" name="budget_head" style={{ marginBottom: 8 }}>
                  <Input placeholder="Budget head" size="small" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={[12, 12]}>
              <Col xs={24} sm={12} md={8}>
                <Form.Item
                  label="Cost (₹)"
                  name="cost"
                  rules={[{ required: true, message: "Required" }]}
                  style={{ marginBottom: 8 }}
                >
                  <InputNumber style={{ width: "100%" }} placeholder="Cost" size="small" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item label="Source of Supply" name="source_of_supply" style={{ marginBottom: 8 }}>
                  <Input placeholder="Vendor name" size="small" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item label="Form Type" style={{ marginBottom: 8 }}>
                  <Input value={form.getFieldValue('form_type') || stockRecord?.form_type || 'Round'} disabled size="small" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={[12, 12]}>
              <Col xs={24} sm={12} md={8}>
                <Form.Item label="Process Type" style={{ marginBottom: 8 }}>
                  <Input value={stockRecord?.process_type || ''} disabled size="small" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item label="Dimensions" style={{ marginBottom: 8 }}>
                  <Input 
                    value={getDimensionsDisplay(form.getFieldValue('form_type') || stockRecord?.form_type || 'Round', dimensions)} 
                    disabled 
                    size="small"
                  />
                </Form.Item>
              </Col>
            </Row>

            {stockRecord?.merge_group_id && linkedMaterials && (
              <Col span={24}>
                <div style={{ padding: 12, backgroundColor: '#f5f5f5', borderRadius: 4, marginBottom: 8 }}>
                  <Text strong style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>
                    Grouped Orders (Merge Group: {stockRecord.merge_group_id})
                  </Text>
                  <div style={{ marginTop: 8 }}>
                    {linkedMaterials
                      .filter(item => item.merge_group_id === stockRecord.merge_group_id)
                      .map((item, index) => (
                        <div key={item.id} style={{ 
                          padding: 8, 
                          backgroundColor: '#fff', 
                          borderRadius: 4, 
                          marginBottom: index < linkedMaterials.filter(i => i.merge_group_id === stockRecord.merge_group_id).length - 1 ? 4 : 0,
                          border: '1px solid #e8e8e8'
                        }}>
                          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>
                            Order #{item.source_order_number} - {item.material_name}
                          </div>
                          <div style={{ fontSize: 10, color: '#666' }}>
                            <div>Process: {item.process_type} | Form: {item.form_type}</div>
                            <div>Dimensions: {item.stock_dimensions}</div>
                            <div>Quantity: {item.quantity} | Est. Cost: ₹{item.estimated_cost?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0'}</div>
                          </div>
                        </div>
                      ))}
                  </div>
                  <Text type="secondary" style={{ fontSize: 11, marginTop: 8, display: 'block' }}>
                    Total Cost: ₹{linkedMaterials
                      .filter(item => item.merge_group_id === stockRecord.merge_group_id)
                      .reduce((sum, item) => sum + (item.estimated_cost || 0), 0)
                      .toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </Text>
                </div>
              </Col>
            )}

            <Row gutter={[12, 12]}>
              <Col span={24}>
                <Form.Item
                  label="Material/Service Required"
                  name="material_required"
                  rules={[{ required: true, message: "Required" }]}
                  style={{ marginBottom: 8 }}
                >
                  <TextArea 
                    rows={2} 
                    placeholder="Material details" 
                    size="small" 
                    disabled={!!stockRecord?.merge_group_id}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={[12, 12]}>
              <Col span={24}>
                <Form.Item label="No Stock Certificate" name="no_stock_certificate" style={{ marginBottom: 8 }}>
                  <TextArea rows={2} placeholder="Certificate details" size="small" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={[12, 12]}>
              {selectedTemplate.templateType === "up_25000" && (
                <Col xs={24} sm={12} md={8}>
                  <Form.Item
                    label="Processed By"
                    name="processed_by"
                    initialValue="purchase"
                    style={{ marginBottom: 8 }}
                  >
                    <Select size="small">
                      <Select.Option value="purchase">क्रय / Purchase</Select.Option>
                      <Select.Option value="indenter">इंडेंटर / Indenter</Select.Option>
                    </Select>
                  </Form.Item>
                </Col>
              )}

              {selectedTemplate.templateType === "25000_to_50000" && (
                <Col xs={24} sm={12} md={8}>
                  <Form.Item
                    label="Processed By"
                    name="processed_by"
                    initialValue="purchase_dept_only"
                    style={{ marginBottom: 8 }}
                  >
                    <Select size="small">
                      <Select.Option value="purchase_dept_only">Purchase Dept Only</Select.Option>
                    </Select>
                  </Form.Item>
                </Col>
              )}

              {selectedTemplate.templateType === "more_than_50000" && (
                <>
                  <Col xs={24} sm={12} md={6}>
                    <Form.Item
                      label="Requirement Type"
                      name="requirement_type"
                      initialValue="fresh"
                      style={{ marginBottom: 8 }}
                    >
                      <Select size="small">
                        <Select.Option value="fresh">Fresh</Select.Option>
                        <Select.Option value="additional">Additional</Select.Option>
                        <Select.Option value="replacement">Replacement</Select.Option>
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12} md={6}>
                    <Form.Item
                      label="Is Imported?"
                      name="is_imported"
                      initialValue="no"
                      style={{ marginBottom: 8 }}
                    >
                      <Select size="small">
                        <Select.Option value="yes">Yes</Select.Option>
                        <Select.Option value="no">No</Select.Option>
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12} md={6}>
                    <Form.Item label="Delivery Period" name="delivery_period" style={{ marginBottom: 8 }}>
                      <Input placeholder="Delivery period" size="small" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12} md={6}>
                    <Form.Item
                      label="Proprietary Cert"
                      name="proprietary_certificate"
                      initialValue="not_applicable"
                      style={{ marginBottom: 8 }}
                    >
                      <Select size="small">
                        <Select.Option value="yes">Yes</Select.Option>
                        <Select.Option value="no">No</Select.Option>
                        <Select.Option value="not_applicable">N/A</Select.Option>
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12} md={6}>
                    <Form.Item
                      label="CGC Approval"
                      name="cgc_approval"
                      initialValue="not_applicable"
                      style={{ marginBottom: 8 }}
                    >
                      <Select size="small">
                        <Select.Option value="yes">Yes</Select.Option>
                        <Select.Option value="no">No</Select.Option>
                        <Select.Option value="not_applicable">N/A</Select.Option>
                      </Select>
                    </Form.Item>
                  </Col>
                </>
              )}
            </Row>
          </Form>
        </Spin>
      </Modal>
    );
  }

  return (
    <Modal
      title="Select Purchase Request Template"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={800}
      styles={{ body: { padding: "24px" } }}
      centered
    >
      <Spin spinning={loading}>
        <Space orientation="vertical" size="large" style={{ width: "100%" }}>
          {templates.map((template) => (
            <Card
              key={template.key}
              hoverable
              onClick={() => handleSelectTemplate(template)}
              styles={{ body: { padding: "16px" } }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ fontSize: 32, color: template.icon.props.style.color }}>
                  {template.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                    {template.title}
                  </div>
                  <div style={{ fontSize: 12, color: "#8c8c8c" }}>
                    {template.description}
                  </div>
                </div>
                <Button type="primary" onClick={() => handleSelectTemplate(template)}>
                  Select
                </Button>
              </div>
            </Card>
          ))}
        </Space>
      </Spin>
    </Modal>
  );
};

export default PurchaseRequestTemplateDownload;
