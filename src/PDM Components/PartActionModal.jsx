import React, { useState, useEffect } from "react";
import { PlusOutlined, DeleteOutlined, UploadOutlined } from "@ant-design/icons";
import { API_BASE_URL } from "../Config/auth";
import { Modal, Form, Input, Select, Button, message, Upload, Card, Badge } from "antd";

const { TextArea } = Input;

const PartActionModal = ({ 
  open, // changed from show
  onCancel, // changed from onHide
  actionType, 
  selectedPart,
  onActionCreated 
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [operations, setOperations] = useState([]);

  // Fetch operations for process plan dropdown
  useEffect(() => {
    if (open && actionType === 'process_plan' && selectedPart) {
      fetchOperationsForPart();
    }
  }, [open, actionType, selectedPart]);

  const fetchOperationsForPart = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/operations/part/${selectedPart.id}/`);
      if (response.ok) {
        const data = await response.json();
        setOperations(data);
      }
    } catch (error) {
      console.error("Error fetching operations:", error);
    }
  };

  const handleFinish = async (values) => {
    setLoading(true);
    const items = values.items || [];
    const results = [];
    
    // Process items sequentially
    for (const item of items) {
      try {
        if (actionType === 'operation') {
          const payload = {
            operation_number: item.operation_number,
            operation_name: item.operation_name,
            setup_time: item.setup_time || null,
            cycle_time: item.cycle_time || null,
            workcenter_id: item.workcenter_id ? parseInt(item.workcenter_id) : null,
            part_id: selectedPart.id
          };
          
          const response = await fetch(`${API_BASE_URL}/operations/`, {
            method: 'POST',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          
          if (response.ok) {
            results.push(await response.json());
          }
        } else if (actionType === 'document') {
          const file = item.file?.[0]?.originFileObj || item.file?.file;
          if (!file) continue;
          
          const formDataObj = new FormData();
          formDataObj.append('file', file);
          formDataObj.append('document_name', item.document_name);
          formDataObj.append('document_type', item.document_type);
          formDataObj.append('document_version', item.document_version);
          formDataObj.append('part_id', selectedPart.id.toString());
          
          const response = await fetch(`${API_BASE_URL}/documents/`, {
            method: 'POST',
            body: formDataObj,
          });
          
          if (response.ok) {
            results.push(await response.json());
          }
        } else if (actionType === 'process_plan') {
          const payload = {
            operation_id: parseInt(item.operation_id),
            work_instructions: item.work_instructions,
            notes: item.notes
          };
          
          const response = await fetch(`${API_BASE_URL}/process-plans/`, {
            method: 'POST',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          
          if (response.ok) {
            results.push(await response.json());
          }
        }
      } catch (error) {
        console.error(`Error creating item:`, error);
        message.error(`Failed to create item`);
      }
    }
    
    setLoading(false);
    
    if (results.length > 0) {
      onActionCreated(results[0], actionType);
      onCancel();
      form.resetFields();
    }
  };

  const getActionTitle = () => {
    switch (actionType) {
      case 'operation': return 'Create Operations';
      case 'document': return 'Create Documents';
      case 'process_plan': return 'Create Process Plans';
      default: return 'Create Items';
    }
  };

  const normFile = (e) => {
    if (Array.isArray(e)) {
      return e;
    }
    return e?.fileList;
  };

  return (
    <Modal
      title={getActionTitle()}
      open={open}
      onCancel={onCancel}
      footer={null}
      width={600}
      destroyOnClose
    >
      <div style={{ marginBottom: 16 }}>
        <Badge 
          count={`For Part: ${selectedPart?.part_number} - ${selectedPart?.part_name}`} 
          style={{ backgroundColor: '#f0f0f0', color: '#000', padding: '0 8px' }} 
        />
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        initialValues={{ items: [{ document_version: '1.0' }] }}
      >
        <Form.List name="items">
          {(fields, { add, remove }) => (
            <>
              <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 4 }}>
                {fields.map(({ key, name, ...restField }, index) => (
                  <Card 
                    key={key} 
                    size="small" 
                    title={`${actionType === 'operation' ? 'Operation' : actionType === 'document' ? 'Document' : 'Process Plan'} ${index + 1}`}
                    extra={fields.length > 1 ? (
                      <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} />
                    ) : null}
                    style={{ marginBottom: 16 }}
                  >
                    {actionType === 'operation' && (
                      <>
                        <div style={{ display: 'flex', gap: 16 }}>
                          <Form.Item
                            {...restField}
                            name={[name, 'operation_number']}
                            label="Operation Number"
                            rules={[{ required: true, message: 'Required' }]}
                            style={{ flex: 1 }}
                          >
                            <Input placeholder="e.g., OP-001" />
                          </Form.Item>
                          <Form.Item
                            {...restField}
                            name={[name, 'operation_name']}
                            label="Operation Name"
                            rules={[{ required: true, message: 'Required' }]}
                            style={{ flex: 1 }}
                          >
                            <Input placeholder="e.g., Cutting" />
                          </Form.Item>
                        </div>
                        <div style={{ display: 'flex', gap: 16 }}>
                          <Form.Item
                            {...restField}
                            name={[name, 'setup_time']}
                            label="Setup Time"
                            style={{ flex: 1 }}
                          >
                            <Input placeholder="00:30:00" />
                          </Form.Item>
                          <Form.Item
                            {...restField}
                            name={[name, 'cycle_time']}
                            label="Cycle Time"
                            style={{ flex: 1 }}
                          >
                            <Input placeholder="00:05:00" />
                          </Form.Item>
                          <Form.Item
                            {...restField}
                            name={[name, 'workcenter_id']}
                            label="Workcenter ID"
                            style={{ flex: 1 }}
                          >
                            <Input type="number" placeholder="1" />
                          </Form.Item>
                        </div>
                      </>
                    )}

                    {actionType === 'document' && (
                      <>
                        <Form.Item
                          {...restField}
                          name={[name, 'document_name']}
                          label="Document Name"
                          rules={[{ required: true, message: 'Required' }]}
                        >
                          <Input placeholder="e.g., Technical Drawing" />
                        </Form.Item>
                        <div style={{ display: 'flex', gap: 16 }}>
                          <Form.Item
                            {...restField}
                            name={[name, 'document_type']}
                            label="Document Type"
                            rules={[{ required: true, message: 'Required' }]}
                            style={{ flex: 1 }}
                          >
                            <Input placeholder="e.g., 2D Drawing" />
                          </Form.Item>
                          <Form.Item
                            {...restField}
                            name={[name, 'document_version']}
                            label="Version"
                            rules={[{ required: true, message: 'Required' }]}
                            style={{ flex: 1 }}
                          >
                            <Input placeholder="1.0" />
                          </Form.Item>
                        </div>
                        <Form.Item
                          {...restField}
                          name={[name, 'file']}
                          label="Upload File"
                          valuePropName="fileList"
                          getValueFromEvent={normFile}
                          rules={[{ required: true, message: 'Please upload a file' }]}
                        >
                          <Upload maxCount={1} beforeUpload={() => false}>
                            <Button icon={<UploadOutlined />}>Select File</Button>
                          </Upload>
                        </Form.Item>
                      </>
                    )}

                    {actionType === 'process_plan' && (
                      <>
                        <Form.Item
                          {...restField}
                          name={[name, 'operation_id']}
                          label="Operation"
                          rules={[{ required: true, message: 'Select an operation' }]}
                        >
                          <Select placeholder="Select an operation">
                            {operations.map(op => (
                              <Select.Option key={op.id} value={op.id}>
                                {op.operation_number} - {op.operation_name}
                              </Select.Option>
                            ))}
                          </Select>
                        </Form.Item>
                        <Form.Item
                          {...restField}
                          name={[name, 'work_instructions']}
                          label="Work Instructions"
                        >
                          <TextArea rows={3} placeholder="Enter instructions..." />
                        </Form.Item>
                        <Form.Item
                          {...restField}
                          name={[name, 'notes']}
                          label="Notes"
                        >
                          <TextArea rows={2} placeholder="Enter notes..." />
                        </Form.Item>
                      </>
                    )}
                  </Card>
                ))}
              </div>
              
              <Form.Item>
                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                  Add Another {actionType === 'operation' ? 'Operation' : actionType === 'document' ? 'Document' : 'Process Plan'}
                </Button>
              </Form.Item>
            </>
          )}
        </Form.List>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Button onClick={onCancel}>
            Cancel
          </Button>
          <Button type="primary" htmlType="submit" loading={loading}>
            {loading ? 'Creating...' : `Create ${actionType === 'process_plan' ? 'Process Plans' : actionType ? actionType.charAt(0).toUpperCase() + actionType.slice(1) + 's' : 'Items'}`}
          </Button>
        </div>
      </Form>
    </Modal>
  );
};

export default PartActionModal;
