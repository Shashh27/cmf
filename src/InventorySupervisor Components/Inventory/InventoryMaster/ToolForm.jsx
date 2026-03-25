import React, { useEffect } from 'react';
import { Form, Input, InputNumber, Button, Modal, message, Row, Col, Select } from 'antd';
import { API_BASE_URL } from '../../../Config/auth.js';

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
      
      // When creating a new tool, set total_quantity = quantity
      // When editing, if total_quantity is not provided, keep it as is
      const submissionData = {
        ...values,
        total_quantity: editingTool ? 
          (values.total_quantity !== undefined ? values.total_quantity : editingTool.total_quantity) : 
          values.quantity
      };
      
      if (editingTool) {
        // Update existing tool
        const response = await fetch(`${API_BASE_URL}/tools-list/${editingTool.id}`, {
          method: 'PUT',
          headers: { 
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(submissionData)
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Failed to update tool');
        }
        
        message.success('Tool updated successfully');
      } else {
        // Create new tool
        const response = await fetch(`${API_BASE_URL}/tools-list/`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(submissionData)
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
              rules={[
                { required: true, message: 'Please enter item description' },
                { max: 30, message: 'Item description cannot exceed 30 characters' }
              ]}
            >
              <Input placeholder="Enter item description" maxLength={30} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="range"
              label="Range"
              rules={[{ max: 10, message: 'Range cannot exceed 10 characters' }]}
            >
              <Input placeholder="Enter range (e.g., 0-150mm)" maxLength={10} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="identification_code"
              label="Identification Code"
              rules={[{ max: 10, message: 'Identification code cannot exceed 10 characters' }]}
            >
              <Input placeholder="Enter identification code" maxLength={10} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="make"
              label="Make"
              rules={[{ max: 20, message: 'Make cannot exceed 20 characters' }]}
            >
              <Input placeholder="Enter make/manufacturer" maxLength={20} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={6}>
            <Form.Item
              name="quantity"
              label="Available Qty"
              rules={[
                { required: true, message: 'Required' },
                {
                  validator: (_, value) => {
                    const totalQty = form.getFieldValue('total_quantity');
                    if (value != null && totalQty != null && value > totalQty) {
                      return Promise.reject(new Error('Cannot exceed Total Qty'));
                    }
                    return Promise.resolve();
                  }
                }
              ]}
            >
              <InputNumber
                placeholder="Qty"
                style={{ width: '100%' }}
                min={0}
                max={9999999}
                precision={0}
                maxLength={7}
                onKeyPress={(event) => {
                  if (!/[0-9]/.test(event.key)) {
                    event.preventDefault();
                  }
                }}
              />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item
              name="total_quantity"
              label="Total Qty"
              rules={[
                { required: true, message: 'Required' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    const qty = getFieldValue('quantity');
                    if (value != null && qty != null && value < qty) {
                      form.validateFields(['quantity']);
                    }
                    return Promise.resolve();
                  },
                }),
              ]}
            >
              <InputNumber
                placeholder="Total"
                style={{ width: '100%' }}
                min={0}
                max={9999999}
                precision={0}
                maxLength={7}
                onKeyPress={(event) => {
                  if (!/[0-9]/.test(event.key)) {
                    event.preventDefault();
                  }
                }}
              />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item
              name="amount"
              label="Amount (₹)"
            >
              <InputNumber
                placeholder="Amount"
                style={{ width: '100%' }}
                min={0}
                max={9999999.99}
                step={0.01}
                precision={2}
                maxLength={10}
                onKeyPress={(event) => {
                  // Allow digits and one dot
                  const isDigit = /[0-9]/.test(event.key);
                  const isDot = event.key === '.';
                  const hasDot = (event.target.value || '').includes('.');
                  if (!isDigit && (!isDot || hasDot)) {
                    event.preventDefault();
                  }
                }}
              />
            </Form.Item>
          </Col>
          <Col span={6}>
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
              rules={[{ max: 30, message: 'Location cannot exceed 30 characters' }]}
            >
              <Input placeholder="Enter location" maxLength={30} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="gauge"
              label="Gauge"
              rules={[{ max: 30, message: 'Gauge cannot exceed 30 characters' }]}
            >
              <Input placeholder="Enter gauge specification" maxLength={30} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="ref_ledger"
              label="Reference Ledger"
              rules={[{ max: 30, message: 'Ref Ledger cannot exceed 30 characters' }]}
            >
              <Input placeholder="Enter reference ledger" maxLength={30} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          name="remarks"
          label="Remarks"
          rules={[{ max: 30, message: 'Remarks cannot exceed 30 characters' }]}
        >
          <TextArea
            rows={3}
            placeholder="Enter any additional remarks"
            maxLength={30}
            showCount
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default ToolForm;
