import React, { useEffect } from 'react';
import { Form, Input, InputNumber, Button, Modal, message, Row, Col, Select } from 'antd';
import config from '../../Config/config';

const { Option } = Select;
const { TextArea } = Input;

const ToolForm = ({ visible, onCancel, onSubmit, editingTool }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = React.useState(false);

  useEffect(() => {
    if (visible) {
      if (editingTool) {
        form.setFieldsValue(editingTool);
      } else {
        form.resetFields();
      }
    }
  }, [visible, editingTool, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      
      if (editingTool) {
        // Update existing tool
        const response = await fetch(`${config.API_BASE_URL}/tools-list/${editingTool.id}`, {
          method: 'PUT',
          headers: { 
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(values)
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Failed to update tool');
        }
        
        message.success('Tool updated successfully');
      } else {
        // Create new tool
        const response = await fetch(`${config.API_BASE_URL}/tools-list/`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(values)
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Failed to create tool');
        }
        
        message.success('Tool created successfully');
      }
      
      onSubmit(values);
      form.resetFields();
    } catch (error) {
      if (error.errorFields) {
        // Validation error
        return;
      }
      console.error('Failed to save tool:', error);
      message.error('Failed to save tool: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={editingTool ? 'Edit Tool' : 'Create New Tool'}
      open={visible}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          Cancel
        </Button>,
        <Button key="submit" type="primary" loading={loading} onClick={handleSubmit}>
          {editingTool ? 'Update' : 'Create'}
        </Button>,
      ]}
      width={800}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        name="toolForm"
      >
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="item_description"
              label="Item Description"
              rules={[{ required: true, message: 'Please enter item description' }]}
            >
              <Input placeholder="Enter item description" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="range"
              label="Range"
            >
              <Input placeholder="Enter range (e.g., 0-150mm)" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="identification_code"
              label="Identification Code"
            >
              <Input placeholder="Enter identification code" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="make"
              label="Make"
            >
              <Input placeholder="Enter make/manufacturer" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              name="quantity"
              label="Quantity"
              rules={[{ type: 'number', min: 0, message: 'Quantity must be a positive number' }]}
            >
              <InputNumber
                placeholder="Enter quantity"
                style={{ width: '100%' }}
                min={0}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="amount"
              label="Amount ($)"
              rules={[{ type: 'number', min: 0, message: 'Amount must be a positive number' }]}
            >
              <InputNumber
                placeholder="Enter amount"
                style={{ width: '100%' }}
                min={0}
                step={0.01}
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="type"
              label="Type"
            >
              <Select placeholder="Select type" allowClear>
                <Option value="CONSUMABLES">CONSUMABLES</Option>
                <Option value="NON-CONSUMABLES">NON-CONSUMABLES</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="location"
              label="Location"
            >
              <Input placeholder="Enter location" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="gauge"
              label="Gauge"
            >
              <Input placeholder="Enter gauge specification" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="ref_ledger"
              label="Reference Ledger"
            >
              <Input placeholder="Enter reference ledger" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          name="remarks"
          label="Remarks"
        >
          <TextArea
            rows={3}
            placeholder="Enter any additional remarks"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default ToolForm;
