import React, { useState, useEffect } from "react";
import { PlusOutlined, DeleteOutlined, UploadOutlined } from "@ant-design/icons";
import { API_BASE_URL } from "../Config/auth";
import { Modal, Form, Input, Select, Button, message, Upload, Card, Badge, TimePicker, Row, Col, } from "antd";

const { TextArea } = Input;

const PartActionModal = ({ 
  open, 
  onCancel, 
  actionType, 
  selectedPart,
  onActionCreated 
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [workCenters, setWorkCenters] = useState([]);
  const [allMachines, setAllMachines] = useState([]);
  const [toolsList, setToolsList] = useState([]);

  // Fetch work centers and machines
  useEffect(() => {
    if (open) {
      form.resetFields();
      if (actionType === 'operation') {
        fetchWorkCenters();
        fetchMachines();
        fetchTools();
      }
    }
  }, [open, actionType, form]);

  const fetchMachines = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/machines/?limit=1000`);
      if (response.ok) {
        const data = await response.json();
        setAllMachines(data);
      }
    } catch (error) {
      console.error("Error fetching machines:", error);
    }
  };

  const fetchTools = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/tools-list/`);
      if (response.ok) {
        const data = await response.json();
        setToolsList(data);
      }
    } catch (error) {
      console.error("Error fetching tools:", error);
    }
  };

  const fetchWorkCenters = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/workcenters/`);
      if (response.ok) {
        const data = await response.json();
        setWorkCenters(data);
      }
    } catch (error) {
      console.error("Error fetching work centers:", error);
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
            setup_time: item.setup_time ? item.setup_time.format('HH:mm:ss') : null,
            cycle_time: item.cycle_time ? item.cycle_time.format('HH:mm:ss') : null,
            workcenter_id: item.workcenter_id ? parseInt(item.workcenter_id) : null,
            machine_id: item.machine_id ? parseInt(item.machine_id) : null,
            part_id: selectedPart.id,
            work_instructions: item.work_instructions,
            notes: item.notes
          };
          
          const response = await fetch(`${API_BASE_URL}/operations/`, {
            method: 'POST',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          
          if (response.ok) {
            const newOperation = await response.json();
            results.push(newOperation);

            // Handle Tool Assignments
            if (item.tool_ids && item.tool_ids.length > 0) {
              for (const toolId of item.tool_ids) {
                try {
                  await fetch(`${API_BASE_URL}/tools/`, {
                    method: 'POST',
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      tool_id: toolId,
                      part_id: selectedPart.id,
                      operation_id: newOperation.id
                    }),
                  });
                } catch (toolError) {
                  console.error(`Error assigning tool ${toolId}:`, toolError);
                }
              }
            }

            // Handle file uploads if any
            if (item.files && item.files.length > 0) {
              const formData = new FormData();
              formData.append('operation_id', newOperation.id);
              formData.append('document_version', item.document_version || '1.0');
              formData.append('document_type', item.document_type || 'Balloon');
              
              item.files.forEach(fileItem => {
                if (fileItem.originFileObj) {
                  formData.append('files', fileItem.originFileObj);
                }
              });

              try {
                const uploadResponse = await fetch(`${API_BASE_URL}/operation-documents/upload/`, {
                  method: 'POST',
                  body: formData,
                });
                
                if (!uploadResponse.ok) {
                  console.error('Failed to upload documents');
                  message.warning(`Operation created but documents failed to upload for ${item.operation_name}`);
                }
              } catch (uploadError) {
                console.error('Error uploading documents:', uploadError);
                message.warning(`Operation created but documents failed to upload for ${item.operation_name}`);
              }
            }
          }
        } else if (actionType === 'document') {
          const file = item.file?.[0]?.originFileObj || item.file?.file;
          if (!file) continue;
          
          const formDataObj = new FormData();
          formDataObj.append('file', file);
          formDataObj.append('document_name', item.document_name);
          formDataObj.append('document_type', item.document_type);
          formDataObj.append('document_version', item.document_version || '1.0');
          formDataObj.append('part_id', selectedPart.id.toString());
          if (item.parent_id) {
            formDataObj.append('parent_id', item.parent_id.toString());
          }
          
          const response = await fetch(`${API_BASE_URL}/documents/`, {
            method: 'POST',
            body: formDataObj,
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
    return `Create ${actionType ? actionType.charAt(0).toUpperCase() + actionType.slice(1) + 's' : 'Items'}`;
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
      width={1000}
      destroyOnHidden
      centered
    >
      <style>
        {`
          .no-hover-btn, .no-hover-btn:hover, .no-hover-btn:focus, .no-hover-btn:active {
            background-color: #2563eb !important;
            color: white !important;
            opacity: 1 !important;
            border: none !important;
            box-shadow: none !important;
          }
        `}
      </style>
      <div style={{ marginBottom: 16 }}>
        <Badge 
          count={`For Part: ${selectedPart?.part_name}`} 
          style={{ backgroundColor: '#e6f7ff', color: '#1890ff', padding: '0 12px', borderRadius: '4px', border: '1px solid #91d5ff' }} 
        />
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleFinish}
      >
        <Form.List 
          name="items" 
          initialValue={[{ document_version: '1.0', document_type: 'Balloon' }]}
        >
          {(fields, { add, remove }) => (
            <>
              <div style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: 4 }}>
                {fields.map(({ key, name, ...restField }, index) => (
                  <Card 
                    key={key} 
                    size="small" 
                    title={`${actionType === 'operation' ? 'Operation' : 'Document'} ${index + 1}`}
                    extra={fields.length > 1 ? (
                      <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} />
                    ) : null}
                    style={{ marginBottom: 16, borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
                    styles={{
                      header: { 
                        backgroundColor: '#fafafa', 
                        borderBottom: '1px solid #f0f0f0',
                        borderRadius: '8px 8px 0 0'
                      }
                    }}
                  >
                    {actionType === 'operation' && (
                      <>
                        <Row gutter={16}>
                          <Col span={4}>
                            <Form.Item
                              {...restField}
                              name={[name, 'operation_number']}
                              label="Op Number"
                              rules={[{ required: true, message: 'Req' }]}
                            >
                              <Input placeholder="OP-001" autoComplete="off" />
                            </Form.Item>
                          </Col>
                          <Col span={8}>
                            <Form.Item
                              {...restField}
                              name={[name, 'operation_name']}
                              label="Operation Name"
                              rules={[{ required: true, message: 'Req' }]}
                            >
                              <Input placeholder="Cutting" autoComplete="off" />
                            </Form.Item>
                          </Col>
                          <Col span={6}>
                            <Form.Item
                              {...restField}
                              name={[name, 'setup_time']}
                              label="Setup Time"
                            >
                              <TimePicker style={{ width: '100%' }} format="HH:mm:ss" />
                            </Form.Item>
                          </Col>
                          <Col span={6}>
                            <Form.Item
                              {...restField}
                              name={[name, 'cycle_time']}
                              label="Cycle Time"
                            >
                              <TimePicker style={{ width: '100%' }} format="HH:mm:ss" />
                            </Form.Item>
                          </Col>
                        </Row>

                        <Row gutter={16}>
                          <Col span={6}>
                            <Form.Item
                              {...restField}
                              name={[name, 'workcenter_id']}
                              label="Workcenter"
                            >
                              <Select 
                                placeholder="Select WC"
                                onChange={() => {
                                  // Clear machine selection when workcenter changes
                                  const currentItems = form.getFieldValue('items');
                                  if (currentItems && currentItems[index]) {
                                    currentItems[index].machine_id = undefined;
                                    form.setFieldsValue({ items: currentItems });
                                  }
                                }}
                              >
                                {workCenters.map(wc => (
                                  <Select.Option key={wc.id} value={wc.id}>
                                    {wc.work_center_name}
                                  </Select.Option>
                                ))}
                              </Select>
                            </Form.Item>
                          </Col>
                          <Col span={6}>
                            <Form.Item
                              noStyle
                              shouldUpdate={(prevValues, currentValues) => {
                                const prevWC = prevValues.items?.[index]?.workcenter_id;
                                const currWC = currentValues.items?.[index]?.workcenter_id;
                                return prevWC !== currWC;
                              }}
                            >
                              {({ getFieldValue }) => {
                                const workcenterId = getFieldValue(['items', index, 'workcenter_id']);
                                const filteredMachines = allMachines.filter(m => m.work_center_id === workcenterId);
                                
                                return (
                                  <Form.Item
                                    {...restField}
                                    name={[name, 'machine_id']}
                                    label="Machine"
                                  >
                                    <Select 
                                      placeholder={workcenterId ? "Select Machine" : "Select WC First"}
                                      disabled={!workcenterId}
                                    >
                                      {filteredMachines.map(m => (
                                        <Select.Option key={m.id} value={m.id}>
                                          {[m.make, m.model].filter(Boolean).join(' - ')} ({m.type})
                                        </Select.Option>
                                      ))}
                                    </Select>
                                  </Form.Item>
                                );
                              }}
                            </Form.Item>
                          </Col>
                          <Col span={12}>
                            <Form.Item
                              {...restField}
                              name={[name, 'tool_ids']}
                              label="Tools"
                            >
                              <Select
                                mode="multiple"
                                placeholder="Select Tools"
                                optionFilterProp="children"
                                maxTagCount="responsive"
                                filterOption={(input, option) =>
                                  (option?.children ?? '').toLowerCase().includes(input.toLowerCase())
                                }
                              >
                                {toolsList.map(tool => (
                                  <Select.Option key={tool.id} value={tool.id}>
                                    {tool.item_description} ({tool.identification_code}) {tool.range ? `- ${tool.range}` : ''}
                                  </Select.Option>
                                ))}
                              </Select>
                            </Form.Item>
                          </Col>
                        </Row>

                        <Row gutter={16}>
                          <Col span={12}>
                            <Form.Item
                              {...restField}
                              name={[name, 'work_instructions']}
                              label="Work Instructions"
                            >
                              <TextArea rows={2} placeholder="Enter instructions..." />
                            </Form.Item>
                          </Col>
                          <Col span={12}>
                            <Form.Item
                              {...restField}
                              name={[name, 'notes']}
                              label="Notes"
                            >
                              <TextArea rows={2} placeholder="Enter notes..." />
                            </Form.Item>
                          </Col>
                        </Row>

                        <Row gutter={16}>
                          <Col span={12}>
                            <Form.Item
                              {...restField}
                              name={[name, 'files']}
                              label="Operation Documents"
                              valuePropName="fileList"
                              getValueFromEvent={normFile}
                              extra="Upload images or documents"
                            >
                              <Upload 
                                multiple 
                                beforeUpload={() => false}
                                listType="text"
                              >
                                <Button icon={<UploadOutlined />}>Select Files</Button>
                              </Upload>
                            </Form.Item>
                          </Col>
                          <Col span={6}>
                            <Form.Item
                              {...restField}
                              name={[name, 'document_type']}
                              label="Doc Type"
                            >
                              <Select placeholder="Select Type">
                                <Select.Option value="Balloon">Balloon</Select.Option>
                                <Select.Option value="Image">Image</Select.Option>
                                <Select.Option value="CNC">CNC</Select.Option>
                                <Select.Option value="Other">Other</Select.Option>
                              </Select>
                            </Form.Item>
                          </Col>
                          <Col span={6}>
                            <Form.Item
                              {...restField}
                              name={[name, 'document_version']}
                              label="Doc Version"
                            >
                              <Input placeholder="1.0" disabled />
                            </Form.Item>
                          </Col>
                        </Row>
                      </>
                    )}

                    {actionType === 'document' && (
                      <Row gutter={16} align="middle">
                        <Col span={8}>
                          <Form.Item
                            {...restField}
                            name={[name, 'document_name']}
                            label="Document Name"
                            rules={[{ required: true, message: 'Req' }]}
                            style={{ marginBottom: 0 }}
                          >
                            <Input placeholder="Tech Drawing" />
                          </Form.Item>
                        </Col>
                        <Col span={6}>
                          <Form.Item
                            {...restField}
                            name={[name, 'document_type']}
                            label="Document Type"
                            rules={[{ required: true, message: 'Req' }]}
                            style={{ marginBottom: 0 }}
                          >
                            <Select placeholder="Select Type">
                              <Select.Option value="2D">2D</Select.Option>
                              <Select.Option value="3D">3D</Select.Option>
                              <Select.Option value="MPP">MPP</Select.Option>
                              <Select.Option value="Other">Other</Select.Option>
                            </Select>
                          </Form.Item>
                        </Col>
                        <Col span={4}>
                          <Form.Item
                            {...restField}
                            name={[name, 'document_version']}
                            label="Version"
                            rules={[{ required: true, message: 'Req' }]}
                            style={{ marginBottom: 0 }}
                          >
                            <Input placeholder="1.0" disabled />
                          </Form.Item>
                        </Col>
                        <Col span={6}>
                          <Form.Item
                            {...restField}
                            name={[name, 'file']}
                            label="Upload File"
                            valuePropName="fileList"
                            getValueFromEvent={normFile}
                            rules={[{ required: true, message: 'Req' }]}
                            style={{ marginBottom: 0 }}
                          >
                            <Upload maxCount={1} beforeUpload={() => false}>
                              <Button icon={<UploadOutlined />}>Select File</Button>
                            </Upload>
                          </Form.Item>
                        </Col>
                      </Row>
                    )}
                  </Card>
                ))}
              </div>
              
              <Form.Item style={{ marginTop: 16 }}>
                <Button type="dashed" onClick={() => add({ document_version: '1.0', document_type: 'Balloon' })} block icon={<PlusOutlined />}>
                  Add Another {actionType === 'operation' ? 'Operation' : 'Document'}
                </Button>
              </Form.Item>
            </>
          )}
        </Form.List>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Button onClick={onCancel}>
            Cancel
          </Button>
          <Button type="primary" htmlType="submit" loading={loading} className="no-hover-btn">
            {loading ? 'Creating...' : `Create ${actionType ? actionType.charAt(0).toUpperCase() + actionType.slice(1) + 's' : 'Items'}`}
          </Button>
        </div>
      </Form>
    </Modal>
  );
};

export default PartActionModal;
