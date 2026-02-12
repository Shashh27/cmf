import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Button, Tabs, Upload, message, Popconfirm, Spin, Empty, Tag, Table, Row, Col, TimePicker, Select, Tooltip, Flex, Badge } from 'antd';
import { 
  UploadOutlined, 
  DeleteOutlined, 
  FileTextOutlined, 
  SaveOutlined, 
  InboxOutlined,
  ExclamationCircleOutlined,
  ToolOutlined,
  PlusOutlined,
  SyncOutlined,
  DownloadOutlined,
  EyeOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { API_BASE_URL } from '../Config/auth';

const { TextArea } = Input;
const { Dragger } = Upload;

const EditOperationModal = ({ 
  open, 
  onCancel, 
  operation, 
  onUpdate, 
  defaultTab = 'details',
  showAddToolForm = true 
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [parentId, setParentId] = useState(null);
  const [selectedDocForVersion, setSelectedDocForVersion] = useState(null);
  const [uploadVersion, setUploadVersion] = useState('1.0');
  const [uploadType, setUploadType] = useState('Balloon');
  const [selectedFileList, setSelectedFileList] = useState([]);
  const [workCenters, setWorkCenters] = useState([]);
  const [allMachines, setAllMachines] = useState([]);
  const [toolsList, setToolsList] = useState([]);
  const [existingTools, setExistingTools] = useState([]);
  const [loadingTools, setLoadingTools] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewType, setPreviewType] = useState('');

  useEffect(() => {
    if (open) {
      setActiveTab(defaultTab);
    }
  }, [open, defaultTab]);

  useEffect(() => {
    if (open) {
      // Only fetch workcenters and machines if we are NOT in "Add Tool" mode
      if (!showAddToolForm) {
        fetchWorkCenters();
        fetchMachines();
      } else {
        fetchTools();
      }
    }
  }, [open, showAddToolForm]);

  useEffect(() => {
    if (open && operation) {
      form.setFieldsValue({
        operation_number: operation.operation_number,
        operation_name: operation.operation_name,
        setup_time: operation.setup_time ? dayjs(operation.setup_time, 'HH:mm:ss') : null,
        cycle_time: operation.cycle_time ? dayjs(operation.cycle_time, 'HH:mm:ss') : null,
        workcenter_id: operation.workcenter_id,
        machine_id: operation.machine_id,
        work_instructions: operation.work_instructions,
        notes: operation.notes
      });
      
      // Only fetch documents if we are NOT in "Add Tool" mode
      if (!showAddToolForm) {
        fetchDocuments();
      } else {
        fetchExistingTools();
      }
    }
  }, [open, operation?.id, form, showAddToolForm]);

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

  const fetchExistingTools = async () => {
    if (!operation) return;
    setLoadingTools(true);
    try {
      const response = await fetch(`${API_BASE_URL}/tools/operation/${operation.id}`);
      if (response.ok) {
        const data = await response.json();
        setExistingTools(data);
      }
    } catch (error) {
      console.error("Error fetching existing tools:", error);
    } finally {
      setLoadingTools(false);
    }
  };

  const handleAddTools = async (values) => {
    setLoadingTools(true);
    const { tool_ids } = values;
    let successCount = 0;

    for (const toolId of tool_ids) {
      if (existingTools.some(t => t.tool_id === toolId)) continue;

      try {
        const response = await fetch(`${API_BASE_URL}/tools/`, {
          method: 'POST',
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tool_id: toolId,
            part_id: operation.part_id,
            operation_id: operation.id
          }),
        });
        if (response.ok) successCount++;
      } catch (error) {
        console.error(`Error assigning tool ${toolId}:`, error);
      }
    }

    setLoadingTools(false);
    if (successCount > 0) {
      message.success(`Successfully added ${successCount} tools`);
      form.setFieldValue('tool_ids', []); // Clear only the select field
      fetchExistingTools();
      if (onUpdate) onUpdate(); // Refresh parent to show updated tool count
    } else {
      message.info("No new tools added");
    }
  };

  const handleRemoveTool = async (toolWithPartId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/tools/${toolWithPartId}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        message.success("Tool removed");
        fetchExistingTools();
        if (onUpdate) onUpdate();
      } else {
        message.error("Failed to remove tool");
      }
    } catch (error) {
      console.error("Error removing tool:", error);
    }
  };

  const availableTools = toolsList.filter(
    tool => !existingTools.some(et => et.tool_id === tool.id)
  );

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

  const fetchDocuments = async () => {
    if (!operation) return;
    setLoadingDocs(true);
    try {
      const response = await fetch(`${API_BASE_URL}/operation-documents/operation/${operation.id}`);
      if (response.ok) {
        const data = await response.json();
        setDocuments(data);
      }
    } catch (error) {
      console.error("Error fetching documents:", error);
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleDeleteOperation = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/operations/${operation.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        message.success("Operation deleted successfully");
        if (onUpdate) onUpdate(); // Refresh parent
      } else {
        message.error("Failed to delete operation");
      }
    } catch (error) {
      console.error("Error deleting operation:", error);
      message.error("Error deleting operation");
    }
  };

  const handleUpdateDetails = async (values) => {
    setLoading(true);
    try {
      const payload = {
        ...values,
        setup_time: values.setup_time ? values.setup_time.format('HH:mm:ss') : null,
        cycle_time: values.cycle_time ? values.cycle_time.format('HH:mm:ss') : null,
      };

      const response = await fetch(`${API_BASE_URL}/operations/${operation.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const updatedOp = await response.json();
        message.success("Operation details updated successfully");
        if (onUpdate) onUpdate(updatedOp);
      } else {
        message.error("Failed to update operation");
      }
    } catch (error) {
      console.error("Error updating operation:", error);
      message.error("Error updating operation");
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (selectedFileList.length === 0) {
      message.warning("Please select a file first");
      return;
    }

    const file = selectedFileList[0];
    const formData = new FormData();
    formData.append('operation_id', operation.id);
    formData.append('files', file);
    formData.append('document_type', uploadType);
    formData.append('document_version', uploadVersion);
    
    if (parentId) {
      formData.append('parent_id', parentId);
    }

    setLoadingDocs(true);
    try {
      const response = await fetch(`${API_BASE_URL}/operation-documents/upload/`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        message.success(`${file.name} uploaded successfully`);
        // Reset versioning states
        setParentId(null);
        setSelectedDocForVersion(null);
        setUploadVersion('1.0');
        setSelectedFileList([]); // Clear file list
        fetchDocuments(); // Refresh list
      } else {
        message.error(`${file.name} upload failed`);
      }
    } catch (error) {
      console.error("Error uploading file:", error);
      message.error("Upload error");
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleDeleteDocument = async (docId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/operation-documents/${docId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        message.success("Document deleted successfully");
        fetchDocuments(); // Refresh list
      } else {
        message.error("Failed to delete document");
      }
    } catch (error) {
      console.error("Error deleting document:", error);
      message.error("Error deleting document");
    }
  };

  const handlePreview = (doc) => {
    const url = `${API_BASE_URL}/operation-documents/${doc.id}/preview`;
    setPreviewUrl(url);
    setPreviewTitle(doc.document_name);
    
    const extension = doc.document_name.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(extension)) {
      setPreviewType('image');
    } else if (extension === 'pdf') {
      setPreviewType('pdf');
    } else {
      setPreviewType('other');
      // For other types, we might just want to download it instead of previewing
      window.open(`${API_BASE_URL}/operation-documents/${doc.id}/download`, '_blank');
      return;
    }
    setPreviewVisible(true);
  };

  const documentsTab = (() => {
    // Group documents by root parent
    const groupedDocs = documents.reduce((acc, doc) => {
      const rootId = doc.parent_id || doc.id;
      if (!acc[rootId]) acc[rootId] = [];
      acc[rootId].push(doc);
      return acc;
    }, {});

    // Get only the root documents (where parent_id is null)
    const rootDocs = documents.filter(doc => !doc.parent_id);

    return (
      <div className="flex flex-col h-full">
        <Row gutter={24}>
          {/* Left Column: Document History */}
          <Col span={14}>
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-sm font-semibold text-gray-800 m-0">Document History</h4>
              <Badge 
                count={documents.length} 
                overflowCount={99} 
                style={{ backgroundColor: '#1890ff' }}
              >
                <Tag color="blue" className="m-0 px-3 py-0.5 rounded-full border-0">
                  Total Documents
                </Tag>
              </Badge>
            </div>
            
            <div className="max-h-[60vh] overflow-y-auto pr-2">
              {loadingDocs ? (
                <div className="flex justify-center p-8"><Spin /></div>
              ) : rootDocs.length > 0 ? (
                <Flex vertical gap="middle">
                    {rootDocs.map(item => {
                    const group = documents.filter(doc => doc.parent_id === item.id || doc.id === item.id);
                    const sortedGroup = [...group].sort((a, b) => parseFloat(b.document_version) - parseFloat(a.document_version));
                    const latestVersion = parseFloat(sortedGroup[0]?.document_version || '1.0');
                    
                    const versions = group.filter(doc => doc.id !== item.id).sort((a, b) => parseFloat(b.document_version) - parseFloat(a.document_version));
                    const hasVersions = versions.length > 0;

                    return (
                      <div key={item.id} className="flex flex-col gap-2">
                        {/* Root Document */}
                        <div 
                          className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm hover:shadow transition-shadow flex items-start justify-between gap-4 border-l-4 border-l-blue-500"
                        >
                          <div className="flex gap-3 flex-1 min-w-0">
                            <div className="bg-blue-50 p-2 rounded text-blue-500 h-fit mt-1">
                              <FileTextOutlined />
                            </div>
                            <div className="flex-1 overflow-hidden">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <a 
                                  href={`${API_BASE_URL}/operation-documents/${item.id}/download`} 
                                  className="text-gray-800 hover:text-blue-600 font-semibold truncate"
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                >
                                  {item.document_name}
                                </a>
                              </div>
                              <div className="flex gap-2 text-xs items-center">
                                <Tag color="blue" variant="filled" className="m-0 text-[10px] font-bold">
                                  {item.document_type}
                                </Tag>
                                <Tag color="blue" className="m-0 text-[10px] font-bold border-blue-200">
                                  v{item.document_version}
                                </Tag>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Tooltip title="Preview">
                              <Button 
                                type="text" 
                                icon={<EyeOutlined className="text-blue-500" />} 
                                size="small"
                                onClick={() => handlePreview(item)}
                              />
                            </Tooltip>
                            <Tooltip title="Upload New Version">
                              <Button 
                                type="text" 
                                icon={<SyncOutlined className="text-orange-500" />} 
                                size="small"
                                onClick={() => {
                                  const rootId = item.id; // item is the root
                                  setParentId(rootId);
                                  setSelectedDocForVersion(item);
                                  setUploadVersion((latestVersion + 1.0).toFixed(1));
                                  setUploadType(item.document_type);
                                }}
                              />
                            </Tooltip>
                            <Tooltip title="Download">
                              <Button 
                                type="text" 
                                icon={<DownloadOutlined className="text-green-600" />} 
                                size="small"
                                href={`${API_BASE_URL}/operation-documents/${item.id}/download`}
                                target="_blank"
                              />
                            </Tooltip>
                            <Popconfirm
                              title="Delete Document"
                              description="Are you sure you want to delete this file?"
                              onConfirm={() => handleDeleteDocument(item.id)}
                              okText="Yes"
                              cancelText="No"
                              icon={<ExclamationCircleOutlined className="text-red-500" />}
                            >
                              <Button 
                                type="text" 
                                danger 
                                icon={<DeleteOutlined />} 
                                size="small"
                              />
                            </Popconfirm>
                          </div>
                        </div>

                        {/* Version Sub-items */}
                        {hasVersions && versions.map(ver => (
                            <div 
                              key={ver.id}
                              className="bg-gray-50 p-2 ml-6 rounded-lg border border-gray-100 flex items-start justify-between gap-4 border-l-4 border-l-orange-400"
                            >
                              <div className="flex gap-2 flex-1 min-w-0 items-center">
                                <FileTextOutlined className="text-orange-400 text-xs" />
                                <a 
                                  href={`${API_BASE_URL}/operation-documents/${ver.id}/download`} 
                                  className="text-gray-700 hover:text-blue-600 text-sm truncate font-medium"
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                >
                                  {ver.document_name}
                                </a>
                                <Tag color="orange" className="m-0 text-[10px] font-bold border-orange-200">
                                  v{ver.document_version}
                                </Tag>
                              </div>
                              <div className="flex gap-1 shrink-0">
                                <Tooltip title="Preview">
                                  <Button 
                                    type="text" 
                                    icon={<EyeOutlined className="text-blue-500 text-xs" />} 
                                    size="small"
                                    onClick={() => handlePreview(ver)}
                                  />
                                </Tooltip>
                                <Tooltip title="Upload New Version">
                                  <Button 
                                    type="text" 
                                    icon={<SyncOutlined className="text-orange-500 text-xs" />} 
                                    size="small"
                                    onClick={() => {
                                      const rootId = item.id; // always use root ID as parent_id
                                      setParentId(rootId);
                                      setSelectedDocForVersion(ver);
                                      setUploadVersion((latestVersion + 1.0).toFixed(1));
                                      setUploadType(ver.document_type);
                                    }}
                                  />
                                </Tooltip>
                                <Tooltip title="Download">
                                  <Button 
                                    type="text" 
                                    icon={<DownloadOutlined className="text-green-600 text-xs" />} 
                                    size="small"
                                    href={`${API_BASE_URL}/operation-documents/${ver.id}/download`}
                                    target="_blank"
                                  />
                                </Tooltip>
                                <Popconfirm
                                  title="Delete Version"
                                  onConfirm={() => handleDeleteDocument(ver.id)}
                                >
                                  <Button type="text" danger icon={<DeleteOutlined className="text-xs" />} size="small" />
                                </Popconfirm>
                              </div>
                            </div>
                          ))
                        }
                      </div>
                    );
                  })}
                </Flex>
              ) : (
                <Empty 
                  description="No documents found" 
                  style={{ padding: '40px 0', backgroundColor: '#f9fafb', borderRadius: 12 }} 
                />
              )}
            </div>
          </Col>

          {/* Right Column: Upload Area */}
          <Col span={10}>
            <div className="bg-gray-50 p-5 rounded-xl border border-gray-200 sticky top-0">
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-sm font-semibold text-gray-800 m-0 flex items-center gap-2">
                  <UploadOutlined /> {parentId ? 'Update Version' : 'New Upload'}
                </h4>
                {parentId && (
                  <Button 
                    type="link" 
                    danger 
                    size="small" 
                    className="p-0 h-auto"
                    onClick={() => {
                      setParentId(null);
                      setSelectedDocForVersion(null);
                      setUploadVersion('1.0');
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>

              {parentId && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                  <div className="text-[10px] text-blue-500 font-bold uppercase mb-1">Updating File:</div>
                  <div className="text-sm font-semibold text-gray-800 truncate">
                    {selectedDocForVersion?.document_name}
                  </div>
                </div>
              )}

              <div className="mb-4">
                <Dragger
                  fileList={selectedFileList}
                  beforeUpload={(file) => {
                    setSelectedFileList([file]);
                    return false; // Prevent automatic upload
                  }}
                  onRemove={() => setSelectedFileList([])}
                  showUploadList={true}
                  multiple={false}
                  className="bg-white border-dashed border-2 hover:border-blue-400 transition-colors rounded-xl overflow-hidden"
                >
                  <p className="ant-upload-drag-icon mb-2">
                    <UploadOutlined className="text-blue-500 text-3xl" />
                  </p>
                  <p className="ant-upload-text text-sm font-medium">Click or drag file</p>
                  <p className="ant-upload-hint text-[11px] text-gray-400 px-4">
                    PDF, DOC, XLS, CSV, TXT
                  </p>
                </Dragger>
              </div>

              <Row gutter={12} className="mb-4">
                <Col span={14}>
                  <div className="text-[11px] font-semibold text-gray-500 mb-1 ml-1 uppercase">Document Type</div>
                  <Select 
                    value={uploadType} 
                    onChange={setUploadType} 
                    className="w-full"
                    placeholder="Type"
                  >
                    <Select.Option value="Balloon">Balloon</Select.Option>
                    <Select.Option value="Image">Image</Select.Option>
                    <Select.Option value="CNC">CNC</Select.Option>
                    <Select.Option value="Other">Other</Select.Option>
                  </Select>
                </Col>
                <Col span={10}>
                  <div className="text-[11px] font-semibold text-gray-500 mb-1 ml-1 uppercase">Version</div>
                  <Input 
                    value={uploadVersion} 
                    onChange={(e) => setUploadVersion(e.target.value)} 
                    placeholder="1.0"
                    disabled={!parentId}
                    className="font-bold text-center"
                    style={{ backgroundColor: !parentId ? '#f0f2f5' : '#fff' }}
                  />
                </Col>
              </Row>

              <Button 
                      type="primary" 
                      block 
                      size="large"
                      icon={<UploadOutlined />}
                      className="h-11 rounded-lg font-semibold shadow-md shadow-blue-100 no-hover-btn"
                      onClick={handleUpload}
                      loading={loadingDocs}
                      disabled={selectedFileList.length === 0}
                    >
                      {parentId ? "Upload New Version" : "Upload Document"}
                    </Button>
            </div>
          </Col>
        </Row>
      </div>
    );
  })();

  const toolsTab = (
    <div className="flex flex-col h-full">
      <div className="mb-4">
        <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
          <ToolOutlined className="text-blue-500" />
          Assigned Tools ({existingTools.length}):
        </h4>
        {loadingTools ? (
          <div className="flex justify-center p-4"><Spin /></div>
        ) : existingTools.length > 0 ? (
            <Flex vertical className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {existingTools.map((item, index) => {
               const toolDetails = toolsList.find(t => t.id === item.tool_id);
               return (
                 <div 
                   key={item.id}
                   className={`flex items-center justify-between p-3 ${index !== existingTools.length - 1 ? 'border-b border-gray-100' : ''} hover:bg-gray-50 transition-colors`}
                 >
                   <div className="flex-1">
                    <div className="font-medium text-sm text-gray-800">{toolDetails?.item_description || `Tool ID: ${item.tool_id}`}</div>
                    <div className="flex gap-2 text-xs mt-1">
                      <Tag className="m-0 text-[10px]">{toolDetails?.identification_code}</Tag>
                      {toolDetails?.range && <span className="text-gray-400">{toolDetails.range}</span>}
                    </div>
                   </div>
                   {showAddToolForm && (
                     <Popconfirm
                       title="Remove Tool"
                       description="Are you sure you want to remove this tool?"
                       onConfirm={() => handleRemoveTool(item.id)}
                       okText="Yes"
                       cancelText="No"
                     >
                       <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                     </Popconfirm>
                   )}
                 </div>
               );
            })}
          </Flex>
        ) : (
           <Empty description="No tools assigned" image={Empty.PRESENTED_IMAGE_SIMPLE} />
         )}
       </div>
 
       {showAddToolForm && (
         <div className="mt-4 pt-4 border-t">
           <Form
             form={form}
             layout="vertical"
             onFinish={handleAddTools}
           >
             <Form.Item
               name="tool_ids"
               label={<span className="text-sm font-medium">Add New Tools</span>}
               rules={[{ required: true, message: 'Please select tools' }]}
             >
               <Select
                 mode="multiple"
                 placeholder="Select Tools to Add"
                 optionFilterProp="children"
                 loading={toolsList.length === 0}
                 filterOption={(input, option) => {
                   const tool = toolsList.find(t => t.id === option.value);
                   return tool && `${tool.item_description} ${tool.identification_code} ${tool.range || ''}`.toLowerCase().includes(input.toLowerCase());
                 }}
               >
                 {availableTools.map(tool => (
                   <Select.Option key={tool.id} value={tool.id}>
                     {tool.item_description} ({tool.identification_code}) {tool.range ? `- ${tool.range}` : ''}
                   </Select.Option>
                 ))}
               </Select>
             </Form.Item>
   
             <div className="flex justify-end">
               <Button 
                 type="primary" 
                 htmlType="submit" 
                 loading={loadingTools}
                 icon={<PlusOutlined />}
                 className="no-hover-btn"
               >
                 Add Selected Tools
               </Button>
             </div>
           </Form>
         </div>
       )}
     </div>
   );

  const tabItems = [
    {
      key: 'details',
      label: 'Details',
      children: (
        <Form
          form={form}
          layout="vertical"
          onFinish={handleUpdateDetails}
          className="mt-2"
        >
          <Row gutter={16}>
              <Col span={6}>
                  <Form.Item
                  name="operation_number"
                  label="Op Number"
                  rules={[{ required: true, message: 'Req' }]}
                  >
                  <Input />
                  </Form.Item>
              </Col>
              <Col span={18}>
                  <Form.Item
                  name="operation_name"
                  label="Operation Name"
                  rules={[{ required: true, message: 'Please enter operation name' }]}
                  >
                  <Input prefix={<FileTextOutlined className="text-gray-400" />} />
                  </Form.Item>
              </Col>
          </Row>

          <Row gutter={16}>
              <Col span={12}>
                  <Form.Item
                  name="setup_time"
                  label="Setup Time"
                  >
                  <TimePicker style={{ width: '100%' }} format="HH:mm:ss" />
                  </Form.Item>
              </Col>
              <Col span={12}>
                  <Form.Item
                  name="cycle_time"
                  label="Cycle Time"
                  >
                  <TimePicker style={{ width: '100%' }} format="HH:mm:ss" />
                  </Form.Item>
              </Col>
          </Row>

          <Row gutter={16}>
              <Col span={12}>
                  <Form.Item
                  name="workcenter_id"
                  label="Workcenter"
                  >
                  <Select 
                      placeholder="Select WC"
                      onChange={() => {
                          // Clear machine selection when workcenter changes
                          form.setFieldValue('machine_id', undefined);
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
              <Col span={12}>
                  <Form.Item
                  noStyle
                  shouldUpdate={(prevValues, currentValues) => prevValues.workcenter_id !== currentValues.workcenter_id}
                  >
                  {({ getFieldValue }) => {
                      const workcenterId = getFieldValue('workcenter_id');
                      const filteredMachines = allMachines.filter(m => m.work_center_id === workcenterId);
                      
                      return (
                      <Form.Item
                          name="machine_id"
                          label="Machine"
                      >
                          <Select 
                          placeholder={workcenterId ? "Select Machine" : "Select WC First"}
                          disabled={!workcenterId}
                          allowClear
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
          </Row>

          <Form.Item
            name="work_instructions"
            label="Work Instructions"
          >
            <TextArea rows={6} placeholder="Enter detailed work instructions..." />
          </Form.Item>

          <Form.Item
            name="notes"
            label="Notes"
          >
            <TextArea rows={3} placeholder="Additional notes..." />
          </Form.Item>

          <div className="flex justify-between mt-4 pt-4 border-t">
            <Popconfirm
              title="Delete Operation"
              description="Are you sure you want to delete this operation?"
              onConfirm={handleDeleteOperation}
              okText="Yes"
              cancelText="No"
            >
              <Button danger icon={<DeleteOutlined />}>Delete Operation</Button>
            </Popconfirm>
            <div className="flex gap-2">
              <Button onClick={onCancel}>Cancel</Button>
              <Button 
                  type="primary" 
                  htmlType="submit" 
                  loading={loading}
                  icon={<SaveOutlined />}
                  className="no-hover-btn"
              >
                  Save Changes
              </Button>
            </div>
          </div>
        </Form>
      )
    },
    {
      key: 'documents',
      label: `Documents (${documents.length})`,
      children: documentsTab
    },
    {
      key: 'tools',
      label: `Tools (${existingTools.length})`,
      children: toolsTab
    }
  ];

  const filteredTabItems = showAddToolForm 
    ? tabItems.filter(item => item.key === 'tools') 
    : tabItems.filter(item => item.key !== 'tools');

  return (
    <Modal
      title={
        <div className="flex items-center gap-2">
          <ToolOutlined className="text-blue-600" />
          <span>{showAddToolForm ? 'Assign Tools' : 'Edit Operation'}</span>
        </div>
      }
      open={open}
      onCancel={onCancel}
      footer={null}
      width={activeTab === 'details' ? 800 : 1000}
      destroyOnClose
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
      <div className="mt-2">
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={filteredTabItems}
        />
      </div>

      {/* Document Preview Modal */}
      <Modal
        title={previewTitle}
        open={previewVisible}
        onCancel={() => {
          setPreviewVisible(false);
          setPreviewUrl('');
        }}
        footer={[
          <Button key="download" icon={<DownloadOutlined />} onClick={() => window.open(previewUrl, '_blank')}>
            Download
          </Button>,
          <Button key="close" type="primary" onClick={() => setPreviewVisible(false)}>
            Close
          </Button>
        ]}
        width={1000}
        style={{ top: 20 }}
        bodyStyle={{ height: '80vh', padding: 0 }}
      >
        {previewType === 'image' ? (
          <div className="flex items-center justify-center h-full bg-gray-100 overflow-auto">
            <img 
              src={previewUrl} 
              alt={previewTitle} 
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} 
            />
          </div>
        ) : previewType === 'pdf' ? (
          <iframe
            src={`${previewUrl}#toolbar=0`}
            title={previewTitle}
            width="100%"
            height="100%"
            style={{ border: 'none' }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full">
            <Empty description="Preview not available for this file type" />
            <Button type="primary" icon={<DownloadOutlined />} onClick={() => window.open(previewUrl, '_blank')}>
              Download to View
            </Button>
          </div>
        )}
      </Modal>
    </Modal>
  );
};

export default EditOperationModal;
