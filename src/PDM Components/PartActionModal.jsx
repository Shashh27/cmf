import React, { useState, useEffect } from "react";
import { PlusOutlined, DeleteOutlined, UploadOutlined } from "@ant-design/icons";
import { API_BASE_URL } from "../Config/auth";
import { Modal, Form, Input, Select, Button, message, Upload, Card, Badge, TimePicker, Row, Col, DatePicker } from "antd";
import dayjs from "dayjs";

const { TextArea } = Input;

const PartActionModal = ({ 
  open, 
  onCancel, 
  actionType, 
  selectedPart,
  onActionCreated,
  initialOperations = []
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [workCenters, setWorkCenters] = useState([]);
  const [allMachines, setAllMachines] = useState([]);
  const [toolsList, setToolsList] = useState([]);
  const [partTypes, setPartTypes] = useState([]);
  const [partTypesLoading, setPartTypesLoading] = useState(false);
  const [workCentersLoading, setWorkCentersLoading] = useState(false);
  const [machinesLoading, setMachinesLoading] = useState(false);
  const [toolsLoading, setToolsLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (actionType === "operation") {
      if (initialOperations && initialOperations.length > 0) {
        const items = initialOperations.map(op => ({
          operation_number: op.operation_number,
          operation_name: op.operation_name,
          part_type_id: 1,
          from_date: null,
          to_date: null,
          setup_time: op.setup_time ? dayjs(op.setup_time, "HH:mm:ss") : null,
          cycle_time: op.cycle_time ? dayjs(op.cycle_time, "HH:mm:ss") : null,
          workcenter_id: op.workcenter_id || null,
          machine_id: op.machine_id || null,
          work_instructions: op.work_instructions || "",
          notes: op.notes || "",
          documents: [{ document_type: "Balloon", document_version: "1.0" }]
        }));
        form.setFieldsValue({ items });
        return;
      }
    }
    const defaultType = actionType === "document" ? "2D" : "Balloon";
    form.setFieldsValue({
      items: actionType === "operation"
        ? [{ part_type_id: 1, document_version: "1.0", document_type: defaultType, documents: [{ document_type: "Balloon", document_version: "1.0" }] }]
        : [{ document_version: "1.0", document_type: defaultType }]
    });
  }, [open, actionType, form, initialOperations]);

  const fetchMachines = async () => {
    if (allMachines.length > 0) return;
    setMachinesLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/machines/`);
      if (response.ok) {
        const data = await response.json();
        setAllMachines(data);
      }
    } catch (error) {
      console.error("Error fetching machines:", error);
    } finally {
      setMachinesLoading(false);
    }
  };

  const fetchTools = async () => {
    if (toolsList.length > 0) return;
    setToolsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/tools-list/`);
      if (response.ok) {
        const data = await response.json();
        setToolsList(data);
      }
    } catch (error) {
      console.error("Error fetching tools:", error);
    } finally {
      setToolsLoading(false);
    }
  };

  const fetchWorkCenters = async () => {
    if (workCenters.length > 0) return;
    setWorkCentersLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/workcenters/`);
      if (response.ok) {
        const data = await response.json();
        setWorkCenters(data);
      }
    } catch (error) {
      console.error("Error fetching work centers:", error);
    } finally {
      setWorkCentersLoading(false);
    }
  };

  const fetchPartTypes = async () => {
    if (partTypes.length > 0) return;
    setPartTypesLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/part-types/`);
      if (response.ok) {
        const data = await response.json();
        setPartTypes(data);
      }
    } catch (error) {
      console.error("Error fetching part types:", error);
    } finally {
      setPartTypesLoading(false);
    }
  };


  const handleFinish = async (values) => {
    setLoading(true);
    const items = values.items || [];
    const results = [];
    
    if (actionType === 'operation') {
      const missingCustom = items.some(item =>
        item.documents &&
        item.documents.some(doc => doc.document_type === 'Other' && !(doc.document_type_other && doc.document_type_other.trim()))
      );
      if (missingCustom) {
        message.error("Please enter custom document type for all 'Other' documents");
        setLoading(false);
        return;
      }
    } else if (actionType === 'document') {
      const missingCustom = items.some(item =>
        item.document_type === 'Other' && !(item.document_type_other && item.document_type_other.trim())
      );
      if (missingCustom) {
        message.error("Please enter custom document type for all 'Other' documents");
        setLoading(false);
        return;
      }
    }
    
    // Process items sequentially
    for (const item of items) {
      try {
        if (actionType === 'operation') {
          const now = dayjs();
          const payload = {
            operation_number: item.operation_number,
            operation_name: item.operation_name,
            part_type_id: item.part_type_id ?? 1,
            from_date: item.from_date
              ? dayjs(item.from_date).hour(now.hour()).minute(now.minute()).second(now.second()).toISOString()
              : null,
            to_date: item.to_date
              ? dayjs(item.to_date).hour(now.hour()).minute(now.minute()).second(now.second()).toISOString()
              : null,
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

            if (item.documents && item.documents.length > 0) {
              for (const doc of item.documents) {
                if (doc.files && doc.files.length > 0) {
                  const formData = new FormData();
                  formData.append('operation_id', newOperation.id);
                  formData.append('document_version', doc.document_version || '1.0');
                  let docType = doc.document_type || 'Balloon';
                  if (docType === 'Other' && doc.document_type_other && doc.document_type_other.trim()) {
                    docType = doc.document_type_other.trim();
                  }
                  formData.append('document_type', docType);

                  doc.files.forEach(fileItem => {
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
            }
          }
        } else if (actionType === 'document') {
          const file = item.file?.[0]?.originFileObj || item.file?.file;
          if (!file) continue;
          
          const formDataObj = new FormData();
          formDataObj.append('file', file);
          formDataObj.append('document_name', item.document_name);
          let docType = item.document_type;
          if (docType === 'Other' && item.document_type_other && item.document_type_other.trim()) {
            docType = item.document_type_other.trim();
          }
          formDataObj.append('document_type', docType);
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
      width="95%"
      style={{ maxWidth: 1000 }}
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
                        <Form.Item noStyle shouldUpdate={(prev, curr) => prev.items?.[index]?.part_type_id !== curr.items?.[index]?.part_type_id}>
                          {({ getFieldValue }) => {
                            const isInHouse = getFieldValue(['items', index, 'part_type_id']) === 1 || !getFieldValue(['items', index, 'part_type_id']);
                            return (
                              <Row gutter={[12, 12]}>
                                <Col xs={24} sm={8} md={4} lg={4}>
                                  <Form.Item
                                    {...restField}
                                    name={[name, 'operation_number']}
                                    label="Op Number"
                                    rules={[{ required: true, message: 'Req' }]}
                                  >
                                    <Input placeholder="OP-001" autoComplete="off" />
                                  </Form.Item>
                                </Col>
                                <Col xs={24} sm={8} md={5} lg={5}>
                                  <Form.Item
                                    {...restField}
                                    name={[name, 'operation_name']}
                                    label="Operation Name"
                                    rules={[{ required: true, message: 'Req' }]}
                                  >
                                    <Input placeholder="Cutting" autoComplete="off" />
                                  </Form.Item>
                                </Col>
                                <Col xs={24} sm={8} md={4} lg={4}>
                                  <Form.Item
                                    {...restField}
                                    name={[name, 'part_type_id']}
                                    label="Part Type"
                                    initialValue={1}
                                    rules={[{ required: true }]}
                                  >
                                    <Select
                                      placeholder="Type"
                                      loading={partTypesLoading}
                                      onOpenChange={(open) => { if (open) fetchPartTypes(); }}
                                      options={partTypes.map(pt => ({ label: pt.type_name, value: pt.id }))}
                                    />
                                  </Form.Item>
                                </Col>
                                {isInHouse && (
                                  <>
                                    <Col xs={12} sm={12} md={5} lg={5}>
                                      <Form.Item
                                        {...restField}
                                        name={[name, 'setup_time']}
                                        label="Setup Time"
                                      >
                                        <TimePicker style={{ width: '100%' }} format="HH:mm:ss" />
                                      </Form.Item>
                                    </Col>
                                    <Col xs={12} sm={12} md={6} lg={6}>
                                      <Form.Item
                                        {...restField}
                                        name={[name, 'cycle_time']}
                                        label="Cycle Time"
                                      >
                                        <TimePicker style={{ width: '100%' }} format="HH:mm:ss" />
                                      </Form.Item>
                                    </Col>
                                  </>
                                )}
                              </Row>
                            );
                          }}
                        </Form.Item>

                        <Form.Item noStyle shouldUpdate={(prev, curr) => prev.items?.[index]?.part_type_id !== curr.items?.[index]?.part_type_id}>
                          {({ getFieldValue }) => {
                            const isOutSource = getFieldValue(['items', index, 'part_type_id']) === 2;
                            if (!isOutSource) return null;
                            return (
                              <Row gutter={[12, 12]}>
                                <Col xs={24} sm={12} md={12}>
                                  <Form.Item
                                    {...restField}
                                    name={[name, 'from_date']}
                                    label="From Date"
                                    rules={[{ required: true, message: 'Required for Out-Source' }]}
                                  >
                                    <DatePicker format="DD-MM-YYYY" style={{ width: '100%' }} />
                                  </Form.Item>
                                </Col>
                                <Col xs={24} sm={12} md={12}>
                                  <Form.Item
                                    {...restField}
                                    name={[name, 'to_date']}
                                    label="To Date"
                                    rules={[{ required: true, message: 'Required for Out-Source' }]}
                                  >
                                    <DatePicker format="DD-MM-YYYY" style={{ width: '100%' }} />
                                  </Form.Item>
                                </Col>
                              </Row>
                            );
                          }}
                        </Form.Item>

                        <Form.Item noStyle shouldUpdate={(prev, curr) => prev.items?.[index]?.part_type_id !== curr.items?.[index]?.part_type_id}>
                          {({ getFieldValue }) => {
                            const isInHouse = getFieldValue(['items', index, 'part_type_id']) === 1 || !getFieldValue(['items', index, 'part_type_id']);
                            if (!isInHouse) return null;
                            return (
                              <>
                        <Row gutter={[12, 12]}>
                          <Col xs={24} sm={12} md={8} lg={6}>
                            <Form.Item
                              {...restField}
                              name={[name, 'workcenter_id']}
                              label="Workcenter"
                            >
                              <Select
                                placeholder="Select WC"
                                loading={workCentersLoading}
                                onOpenChange={(open) => { if (open) fetchWorkCenters(); }}
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
                          <Col xs={24} sm={12} md={8} lg={6}>
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
                                      loading={machinesLoading}
                                      onOpenChange={(open) => { if (open) fetchMachines(); }}
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
                          <Col xs={24} sm={24} md={8} lg={12}>
                            <Form.Item
                              {...restField}
                              name={[name, 'tool_ids']}
                              label="Tools"
                            >
                              <Select
                                mode="multiple"
                                placeholder="Select Tools"
                                loading={toolsLoading}
                                onOpenChange={(open) => { if (open) fetchTools(); }}
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

                        <Row gutter={[12, 12]}>
                          <Col xs={24} sm={12} md={12}>
                            <Form.Item
                              {...restField}
                              name={[name, 'work_instructions']}
                              label="Work Instructions"
                            >
                              <TextArea rows={2} placeholder="Enter instructions..." />
                            </Form.Item>
                          </Col>
                          <Col xs={24} sm={12} md={12}>
                            <Form.Item
                              {...restField}
                              name={[name, 'notes']}
                              label="Notes"
                            >
                              <TextArea rows={2} placeholder="Enter notes..." />
                            </Form.Item>
                          </Col>
                        </Row>
                              </>
                            );
                          }}
                        </Form.Item>

                        <Form.List name={[name, 'documents']} initialValue={[{ document_type: 'Balloon', document_version: '1.0' }]}>
                          {(docFields, { add: addDoc, remove: removeDoc }) => (
                            <>
                              <div className="mt-4 border-t pt-4">
                                <div className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                                  <UploadOutlined className="text-blue-500" />
                                  Operation Documents
                                </div>
                                {docFields.map(({ key: docKey, name: docName, ...docRestField }, docIndex) => (
                                  <Card 
                                    key={docKey}
                                    size="small"
                                    className="mb-3 bg-gray-50/50 border-gray-200"
                                    styles={{ body: { padding: '12px' } }}
                                  >
                                    <Row gutter={[12, 12]} align="bottom">
                                      <Col xs={24} sm={10} lg={10}>
                                        <Form.Item
                                          {...docRestField}
                                          name={[docName, 'files']}
                                          label={<span className="text-xs font-medium text-gray-600">Files</span>}
                                          valuePropName="fileList"
                                          getValueFromEvent={normFile}
                                          className="mb-0"
                                        >
                                          <Upload
                                            multiple
                                            beforeUpload={() => false}
                                            className="w-full"
                                          >
                                            <Button icon={<UploadOutlined />} size="small" className="w-full text-left flex items-center">Select Files</Button>
                                          </Upload>
                                        </Form.Item>
                                      </Col>
                                      
                                      <Col xs={24} sm={10} lg={10}>
                                        <Form.Item
                                          noStyle
                                          shouldUpdate={(prev, current) => {
                                            const prevType = prev.items?.[index]?.documents?.[docName]?.document_type;
                                            const currentType = current.items?.[index]?.documents?.[docName]?.document_type;
                                            return prevType !== currentType;
                                          }}
                                        >
                                          {({ getFieldValue }) => {
                                            const type = getFieldValue(['items', index, 'documents', docName, 'document_type']);
                                            return (
                                              <div className="flex flex-col gap-2">
                                                <Form.Item
                                                  {...docRestField}
                                                  name={[docName, 'document_type']}
                                                  label={<span className="text-xs font-medium text-gray-600">Doc Type</span>}
                                                  className="mb-0"
                                                >
                                                  <Select placeholder="Select Type" size="small" className="w-full">
                                                    <Select.Option value="Balloon">Balloon</Select.Option>
                                                    <Select.Option value="Image">Image</Select.Option>
                                                    <Select.Option value="CNC">CNC</Select.Option>
                                                    <Select.Option value="Other">Other</Select.Option>
                                                  </Select>
                                                </Form.Item>
                                                {type === 'Other' && (
                                                  <Form.Item
                                                    {...docRestField}
                                                    name={[docName, 'document_type_other']}
                                                    className="mb-0"
                                                    rules={[{ required: true, message: 'Type Required' }]}
                                                  >
                                                    <Input placeholder="Custom type..." size="small" autoComplete="off" className="w-full" />
                                                  </Form.Item>
                                                )}
                                              </div>
                                            );
                                          }}
                                        </Form.Item>
                                      </Col>
                                      
                                      <Col xs={18} sm={2} lg={2}>
                                        <Form.Item
                                          {...docRestField}
                                          name={[docName, 'document_version']}
                                          label={<span className="text-xs font-medium text-gray-600">Ver</span>}
                                          className="mb-0"
                                        >
                                          <Input placeholder="1.0" disabled size="small" className="w-full bg-gray-50 text-center" />
                                        </Form.Item>
                                      </Col>
                                      
                                      <Col xs={6} sm={2} lg={2} className="flex justify-center">
                                        {docFields.length > 1 && (
                                          <Button
                                            type="text"
                                            danger
                                            icon={<DeleteOutlined />}
                                            onClick={() => removeDoc(docName)}
                                            className="hover:bg-red-50"
                                          />
                                        )}
                                      </Col>
                                    </Row>
                                  </Card>
                                ))}
                                <Form.Item>
                                  <Button 
                                    type="dashed" 
                                    onClick={() => addDoc({ document_type: 'Balloon', document_version: '1.0' })} 
                                    block 
                                    icon={<PlusOutlined />}
                                    className="text-blue-500 border-blue-200 hover:border-blue-400"
                                  >
                                    Add Document to Operation
                                  </Button>
                                </Form.Item>
                              </div>
                            </>
                          )}
                        </Form.List>
                      </>
                    )}

                    {actionType === 'document' && (
                      <div>
                        <Row gutter={[16, 12]} align="bottom">
                          <Col xs={24} sm={12} lg={6}>
                            <Form.Item
                              {...restField}
                              name={[name, 'file']}
                              label={<span className="text-xs font-medium text-gray-600">Upload File</span>}
                              valuePropName="fileList"
                              getValueFromEvent={normFile}
                              rules={[{ required: true, message: 'Required' }]}
                              className="mb-0"
                            >
                              <Upload
                                maxCount={1}
                                beforeUpload={() => false}
                                className="w-full"
                                onChange={({ fileList }) => {
                                  const fileObj = fileList?.[0]?.originFileObj || fileList?.[0]?.file;
                                  if (fileObj) {
                                    const items = form.getFieldValue('items') || [];
                                    const updated = [...items];
                                    if (updated[name] && !updated[name].document_name) {
                                      const baseName = fileObj.name ? fileObj.name.replace(/\.[^/.]+$/, '') : fileObj.name;
                                      updated[name].document_name = baseName;
                                      form.setFieldsValue({ items: updated });
                                    }
                                  }
                                }}
                              >
                                <Button icon={<UploadOutlined />} className="w-full text-left flex items-center justify-start">
                                  Select File
                                </Button>
                              </Upload>
                            </Form.Item>
                          </Col>
                          
                          <Col xs={24} sm={12} lg={6}>
                            <Form.Item
                              {...restField}
                              name={[name, 'document_name']}
                              label={<span className="text-xs font-medium text-gray-600">Document Name</span>}
                              rules={[{ required: true, message: 'Required' }]}
                              className="mb-0"
                            >
                              <Input placeholder="Tech Drawing" autoComplete="off" className="w-full"/>
                            </Form.Item>
                          </Col>
                          
                          <Col xs={24} sm={12} lg={6}>
                            <Form.Item
                              noStyle
                              shouldUpdate={(prev, current) => {
                                const prevType = prev.items?.[name]?.document_type;
                                const currentType = current.items?.[name]?.document_type;
                                return prevType !== currentType;
                              }}
                            >
                              {({ getFieldValue }) => {
                                const type = getFieldValue(['items', name, 'document_type']);
                                return (
                                  <div className="flex flex-col gap-2">
                                    <Form.Item
                                      {...restField}
                                      name={[name, 'document_type']}
                                      label={<span className="text-xs font-medium text-gray-600">Document Type</span>}
                                      className="mb-0"
                                      rules={[{ required: true, message: 'Required' }]}
                                    >
                                      <Select placeholder="Select Type" className="w-full">
                                        <Select.Option value="2D">2D</Select.Option>
                                        <Select.Option value="3D">3D</Select.Option>
                                        <Select.Option value="Other">Other</Select.Option>
                                      </Select>
                                    </Form.Item>
                                    {type === 'Other' && (
                                      <Form.Item
                                        {...restField}
                                        name={[name, 'document_type_other']}
                                        className="mb-0"
                                        rules={[{ required: true, message: 'Type Required' }]}
                                      >
                                        <Input placeholder="Custom type..." autoComplete="off" className="w-full" />
                                      </Form.Item>
                                    )}
                                  </div>
                                );
                              }}
                            </Form.Item>
                          </Col>
                          
                          <Col xs={24} sm={12} lg={6}>
                            <Form.Item
                              {...restField}
                              name={[name, 'document_version']}
                              label={<span className="text-xs font-medium text-gray-600">Version</span>}
                              rules={[{ required: true, message: 'Required' }]}
                              className="mb-0"
                            >
                              <Input placeholder="1.0" disabled className="w-full bg-gray-50"/>
                            </Form.Item>
                          </Col>
                        </Row>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
              
              <Form.Item style={{ marginTop: 16 }}>
                <Button
                  type="dashed"
                  onClick={() => add({ part_type_id: 1, document_version: '1.0', document_type: actionType === 'document' ? '2D' : 'Balloon' })}
                  block
                  icon={<PlusOutlined />}
                >
                  Add Another {actionType === 'operation' ? 'Operation' : 'Document'}
                </Button>
              </Form.Item>
            </>
          )}
        </Form.List>

        <div className="flex flex-col sm:flex-row justify-end gap-2 mt-4">
          <Button onClick={onCancel} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button type="primary" htmlType="submit" loading={loading} className="no-hover-btn w-full sm:w-auto">
            {loading ? 'Creating...' : `Create ${actionType ? actionType.charAt(0).toUpperCase() + actionType.slice(1) + 's' : 'Items'}`}
          </Button>
        </div>
      </Form>
    </Modal>
  );
};

export default PartActionModal;
