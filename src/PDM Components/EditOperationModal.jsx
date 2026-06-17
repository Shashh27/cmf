import React, { useState, useEffect } from 'react';
import {
  Modal, Form, Input, Button, Tabs, Upload, Popconfirm,
  Spin, Empty, Tag, Row, Col, TimePicker, Select, Tooltip, Flex,
  Badge, DatePicker, App
} from 'antd';
import {
  UploadOutlined, DeleteOutlined, FileTextOutlined, SaveOutlined,
  ExclamationCircleOutlined, ToolOutlined, PlusOutlined, SyncOutlined,
  DownloadOutlined, EyeOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from "axios";
import { API_BASE_URL } from '../Config/auth';
import { normalizeVersion, fetchInto, timePickerRules } from './operationUtils.js';
import OperationToolsSelector from './OperationToolsSelector';

const { TextArea } = Input;
const { Dragger } = Upload;

// Reusable From/To date pair for Out-Source operations
const OutSourceDates = ({ form, fromDateWatch, namePrefix }) => {
  const n = (f) => namePrefix ? [namePrefix, f] : f;
  return (
    <Row gutter={[12, 0]}>
      <Col xs={24} sm={12}>
        <Form.Item name={n('from_date')} label="From Date" rules={[{ required: true, message: 'Required for Out-Source' }]}>
          <DatePicker format="DD-MM-YYYY" style={{ width: '100%' }} inputReadOnly />
        </Form.Item>
      </Col>
      <Col xs={24} sm={12}>
        <Form.Item name={n('to_date')} label="To Date" rules={[
          { required: true, message: 'Required for Out-Source' },
          { validator: (_, value) => {
            const fd = form.getFieldValue(n('from_date'));
            if (!value) return Promise.resolve();
            if (!fd) return Promise.reject(new Error('Select From Date first'));
            return dayjs(value).isAfter(dayjs(fd), 'day') ? Promise.resolve() : Promise.reject(new Error('To Date must be after From Date'));
          }}
        ]}>
          <DatePicker format="DD-MM-YYYY" style={{ width: '100%' }} inputReadOnly disabled={!fromDateWatch}
            disabledDate={(c) => { const fd = form.getFieldValue(n('from_date')); return !fd || (c && !c.isAfter(dayjs(fd), 'day')); }} />
        </Form.Item>
      </Col>
    </Row>
  );
};

const EditOperationModal = ({
  open, onCancel, operation,
  partId = null, partName = null,
  onUpdate, defaultTab = 'details', showAddToolForm = true
}) => {
  const isCreateMode = !operation && partId;
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading]                   = useState(false);
  const [documents, setDocuments]               = useState([]);
  const [loadingDocs, setLoadingDocs]           = useState(false);
  const [activeTab, setActiveTab]               = useState(defaultTab);
  const [parentId, setParentId]                 = useState(null);
  const [parentDocName, setParentDocName]       = useState('');
  const [uploadVersion, setUploadVersion]       = useState('');
  const [uploadType, setUploadType]             = useState('Image');
  const [uploadTypeOther, setUploadTypeOther]   = useState('');
  const [selectedFileList, setSelectedFileList] = useState([]);
  const [workCenters, setWorkCenters]           = useState([]);
  const [allMachines, setAllMachines]           = useState([]);
  const [existingTools, setExistingTools]       = useState([]);
  const [loadingTools, setLoadingTools]         = useState(false);
  const [allTools, setAllTools]                 = useState([]);
  const [preview, setPreview]                   = useState(null); // { url, title, type }
  const [viewingDoc, setViewingDoc]             = useState(null); // { url, title, type, id, name }
  const [partTypes, setPartTypes]               = useState([]);
  const [vendors, setVendors]                 = useState([]);
  const [partTypesLoading, setPartTypesLoading]     = useState(false);
  const [workCentersLoading, setWorkCentersLoading] = useState(false);
  const [machinesLoading, setMachinesLoading]       = useState(false);
  const [vendorsLoading, setVendorsLoading]         = useState(false);
  const [toolsSelectorVisible, setToolsSelectorVisible] = useState(false);

  const fromDateWatch = Form.useWatch('from_date', form);
  const partTypeWatch = Form.useWatch('part_type_id', form);

  // Helper to find In-House and Out-Source IDs
  const getPartTypeIds = () => {
    const inHouse = partTypes.find(pt => {
      const name = pt.type_name.toLowerCase().replace(/[^a-z]/g, '');
      return name === 'inhouse';
    });
    const outsource = partTypes.find(pt => {
      const name = pt.type_name.toLowerCase().replace(/[^a-z]/g, '');
      return name === 'outsource';
    });
    return {
      inHouseId: inHouse?.id || 1,
      outsourceId: outsource?.id || 2
    };
  };

  const { inHouseId, outsourceId } = getPartTypeIds();

  // ── fetch helpers ──────────────────────────────────────────────────────────
  const fetchWorkCenters = () => fetchInto(`${API_BASE_URL}/workcenters/`, setWorkCenters, setWorkCentersLoading, workCenters.length > 0);
  const fetchPartTypes   = () => fetchInto(`${API_BASE_URL}/part-types/`,  setPartTypes,   setPartTypesLoading,   partTypes.length > 0);
  const fetchMachines    = () => fetchInto(`${API_BASE_URL}/machines/`,    setAllMachines, setMachinesLoading,    allMachines.length > 0);
  const fetchVendors     = () => fetchInto(`${API_BASE_URL}/rawmaterials/vendors`,     setVendors,     setVendorsLoading,     vendors.length > 0);

  const getCurrentUserId = () => {
    try {
      const stored = localStorage.getItem('user');
      if (!stored) return null;
      const u = JSON.parse(stored);
      if (u?.id == null) return null;
      return u.id;
    } catch {
      return null;
    }
  };

  const fetchDocuments = async () => {
    if (!operation) return;
    setLoadingDocs(true);
    try {
      // Do not filter by user_id: admin, project coordinator, and manufacturing coordinator all see the same operation documents
      const r = await axios.get(`${API_BASE_URL}/operation-documents/operation/${operation.id}`);
      setDocuments(r.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDocs(false);
    }
  };

  const fetchExistingTools = async () => {
    if (!operation) return;
    setLoadingTools(true);
    try {
      const r = await axios.get(`${API_BASE_URL}/tools/operation/${operation.id}`);
      setExistingTools(r.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingTools(false);
    }
  };

  // ── effects ────────────────────────────────────────────────────────────────
  useEffect(() => { if (open) setActiveTab(defaultTab); }, [open, defaultTab]);
  useEffect(() => {
    if (open && !showAddToolForm) {
      fetchWorkCenters();
      fetchMachines();
      fetchPartTypes();
    }
  }, [open, showAddToolForm]);
  useEffect(() => { if (open && isCreateMode) { form.resetFields(); form.setFieldsValue({ part_type_id: inHouseId }); } }, [open, isCreateMode, inHouseId]);

  useEffect(() => {
    if (!fromDateWatch) { if (form.getFieldValue('to_date')) form.setFieldsValue({ to_date: null }); return; }
    const to = form.getFieldValue('to_date');
    if (to && !dayjs(to).isAfter(dayjs(fromDateWatch), 'day')) form.setFieldsValue({ to_date: null });
  }, [fromDateWatch]);

  useEffect(() => {
    if (!open) return;
    if (partTypeWatch === outsourceId) form.setFieldsValue({ setup_time: null, cycle_time: null, workcenter_id: null, machine_id: null, work_instructions: null, notes: null });
  }, [partTypeWatch, open, outsourceId]);

  useEffect(() => {
    if (!open || !operation) return;
    form.setFieldsValue({
      operation_number:  operation.operation_number,
      operation_name:    operation.operation_name,
      part_type_id:      operation.part_type_id ?? inHouseId,
      from_date:         operation.from_date  ? dayjs(operation.from_date) : null,
      to_date:           operation.to_date    ? dayjs(operation.to_date) : null,
      setup_time:        operation.setup_time ? dayjs(operation.setup_time, 'HH:mm:ss') : null,
      cycle_time:        operation.cycle_time ? dayjs(operation.cycle_time, 'HH:mm:ss') : null,
      workcenter_id:     operation.workcenter_id,
      machine_id:        operation.machine_id,
      work_instructions: operation.work_instructions,
      notes:             operation.notes,
      vendor_id:         operation.vendor_id,
    });
    if (!showAddToolForm) fetchDocuments(); 
    else {
      if (operation.tools) {
        setExistingTools(operation.tools);
        // Extract unique tools from existing tools for display
        const uniqueTools = operation.tools.map(t => t.tool_details || {}).filter(Boolean);
        setAllTools(uniqueTools);
      }
      else fetchExistingTools();
    }
  }, [open, operation?.id, showAddToolForm]);

  // ── handlers ───────────────────────────────────────────────────────────────
  const resetUpload = () => { setParentId(null); setParentDocName(''); setUploadVersion(''); setUploadType('Image'); setUploadTypeOther(''); setSelectedFileList([]); setViewingDoc(null); };

  const handleUpload = async () => {
    if (!selectedFileList.length) { message.warning('Please select a file first'); return; }
    if (uploadType === 'Other' && !uploadTypeOther.trim()) { message.warning('Please enter document type'); return; }
    const fd = new FormData();
    fd.append('operation_id', operation.id);
    fd.append('files', selectedFileList[0]);
    fd.append('document_type', uploadType === 'Other' ? uploadTypeOther.trim() : uploadType);
    fd.append('document_version', uploadVersion);
    if (parentId) fd.append('parent_id', parentId);
    const uid = getCurrentUserId();
    if (uid != null) fd.append('user_id', String(uid));
    setLoadingDocs(true);
    try {
      await axios.post(`${API_BASE_URL}/operation-documents/upload/`, fd);
      message.success(`${selectedFileList[0].name} uploaded successfully`);
      resetUpload();
      fetchDocuments();
    } catch (e) {
      console.error(e);
      const detail = e?.response?.data?.detail || e?.response?.data?.message || 'Upload error';
      message.error(detail);
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleDeleteDocument = async (docId) => {
    try {
      await axios.delete(`${API_BASE_URL}/operation-documents/${docId}`);
      message.success('Document deleted successfully');
      fetchDocuments();
    } catch (e) {
      console.error(e);
      const detail =
        e?.response?.data?.detail ||
        e?.response?.data?.message ||
        'Failed to delete';
      message.error(detail);
    }
  };

  const handlePreview = (doc) => {
    const ext = doc.document_name.split('.').pop().toLowerCase();
    const url = `${API_BASE_URL}/operation-documents/${doc.id}/preview`;
    let type = 'other';
    if (['jpg','jpeg','png','gif','svg'].includes(ext)) type = 'image';
    else if (ext === 'pdf') type = 'pdf';
    else if (['cnc','gcode','nc','m','tap','mpf','iso','fan','h','txt','csv'].includes(ext)) type = 'text';
    else if (['mp4','m4v','mov','avi','mkv','webm','flv','wmv','mpeg','mpg','3gp','3g2','ts','mts','m2ts','ogv'].includes(ext)) type = 'video';
    
    // Open preview modal instead of showing in right panel
    setPreview({ url, title: doc.document_name, type, id: doc.id, name: doc.document_name });
    setParentId(null); // Switch off "Update Version" mode if it was on
  };

  const handleDownloadFile = (doc) => {
    const url = `${API_BASE_URL}/operation-documents/${doc.id}/download`;
    const a = document.createElement('a');
    a.href = url;
    a.style.display = 'none';
    a.setAttribute('download', doc.document_name);
    document.body.appendChild(a);
    a.click();
    a.remove();
    message.success(`Downloading ${doc.document_name}`);
  };

  const handleAddTools = async ({ tool_ids }) => {
    setLoadingTools(true);
    let count = 0;
    const uid = getCurrentUserId();
    for (const toolId of tool_ids) {
      if (existingTools.some(t => t.tool_id === toolId)) continue;
      try {
        await axios.post(
          `${API_BASE_URL}/tools/`,
          {
            tool_id: toolId,
            part_id: operation.part_id,
            operation_id: operation.id,
            user_id: uid,
          },
          {
            headers: { 'Content-Type': 'application/json' },
          }
        );
        count++;
      } catch (e) {
        console.error(e);
      }
    }
    setLoadingTools(false);
    if (count > 0) { message.success(`Successfully added ${count} tools`); form.setFieldValue('tool_ids', []); fetchExistingTools(); if (onUpdate) onUpdate(); }
    else message.info('No new tools added');
  };

  const handleRemoveTool = async (id) => {
    try {
      await axios.delete(`${API_BASE_URL}/tools/${id}`);
      message.success('Tool removed');
      fetchExistingTools();
      if (onUpdate) onUpdate();
    } catch (e) {
      console.error(e);
      const detail =
        e?.response?.data?.detail ||
        e?.response?.data?.message ||
        'Failed to remove tool';
      message.error(detail);
    }
  };

  const handleUpdateDetails = async (values) => {
    setLoading(true);
    try {
      const now = dayjs();
      const { operation_number, setup_time, cycle_time, from_date, to_date, workcenter_id, machine_id, ...rest } = values;
      const out = rest.part_type_id === outsourceId;
      const ts  = (d) => d ? dayjs(d).hour(now.hour()).minute(now.minute()).second(now.second()).toISOString() : null;
      const payload = {
        ...rest,
        setup_time:        out ? null : (setup_time?.format('HH:mm:ss') ?? null),
        cycle_time:        out ? null : (cycle_time?.format('HH:mm:ss') ?? null),
        from_date:         ts(from_date),
        to_date:           ts(to_date),
        workcenter_id:     out ? null : (workcenter_id ?? null),
        machine_id:        out ? null : (machine_id ?? null),
        work_instructions: out ? null : (rest.work_instructions ?? null),
        notes:             out ? null : (rest.notes ?? null),
        vendor_id:         rest.vendor_id ?? null,
      };
      const url    = isCreateMode ? `${API_BASE_URL}/operations/` : `${API_BASE_URL}/operations/${operation.id}`;
      const body   = isCreateMode ? { ...payload, part_id: partId } : payload;
      const method = isCreateMode ? 'post' : 'put';
      const r = await axios({
        url,
        method,
        headers: { 'Content-Type': 'application/json' },
        data: body,
      });
      message.success(isCreateMode ? 'Operation created' : 'Operation updated');
      if (onUpdate) onUpdate(r.data);
      onCancel();
    } catch (e) {
      console.error(e);
      const detail =
        e?.response?.data?.detail ||
        e?.response?.data?.message ||
        'Error saving operation';
      message.error(detail);
    }
    finally { setLoading(false); }
  };

  // ── derived ────────────────────────────────────────────────────────────────
  const availableTools  = allTools.filter(t => !existingTools.some(et => et.tool_id === t.id));
  const partTypeOptions = partTypes.length
    ? partTypes
        .filter(pt => {
          const name = pt.type_name.toLowerCase().replace(/[^a-z]/g, '');
          return name === 'inhouse' || name === 'outsource';
        })
        .map(pt => ({ label: pt.type_name, value: pt.id }))
    : [{ label: 'IN-House', value: inHouseId }, { label: 'Out-Source', value: outsourceId }];
  const parseV          = (v) => parseFloat(String(v).replace(/[^0-9.]/g, ''));

  // ── documents tab ──────────────────────────────────────────────────────────
  const DocActions = ({ doc, rootId, latestV, hasChildren }) => (
    <div className="flex gap-1 shrink-0">
      <Tooltip title="View"><Button type="text" size="small" icon={<EyeOutlined className="text-blue-500" />} onClick={() => handlePreview(doc)} /></Tooltip>
      <Tooltip title="Upload New Revision">
        <Button type="text" size="small" icon={<SyncOutlined className="text-orange-500" />}
          onClick={() => { setViewingDoc(null); setParentId(rootId); setParentDocName(doc.document_name); setUploadVersion(''); setUploadType(doc.document_type); }} />
      </Tooltip>
      <Tooltip title="Download">
        <Button type="text" size="small" icon={<DownloadOutlined className="text-green-600" />} onClick={() => handleDownloadFile(doc)} />
      </Tooltip>
      <Tooltip title={hasChildren ? 'Delete child revisions first before deleting parent' : 'Delete'}>
        <Popconfirm title="Delete?" onConfirm={() => handleDeleteDocument(doc.id)} okText="Yes" cancelText="No" icon={<ExclamationCircleOutlined className="text-red-500" />} disabled={hasChildren}>
          <Button type="text" danger size="small" icon={<DeleteOutlined />} disabled={hasChildren} />
        </Popconfirm>
      </Tooltip>
    </div>
  );

  const documentsTab = (() => {
    const rootDocs = documents.filter(d => !d.parent_id);
    return (
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-sm font-semibold text-gray-800 m-0">Revision History</h4>
            <Badge count={documents.length} overflowCount={99} style={{ backgroundColor: '#1890ff' }}>
              <Tag color="blue" className="m-0 px-3 py-0.5 rounded-full border-0">Total Documents</Tag>
            </Badge>
          </div>
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            {loadingDocs ? <div className="flex justify-center p-8"><Spin /></div>
              : rootDocs.length > 0 ? (
                <Flex vertical gap="middle">
                  {rootDocs.map(item => {
                    const group    = documents.filter(d => d.parent_id === item.id || d.id === item.id);
                    const latestV  = Math.max(...group.map(d => parseV(d.document_version)));
                    const versions = group.filter(d => d.id !== item.id).sort((a, b) => parseV(b.document_version) - parseV(a.document_version));
                    return (
                      <div key={item.id} className="flex flex-col gap-2">
                        <div className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm hover:shadow transition-shadow flex items-start justify-between gap-4 border-l-4 border-l-blue-500">
                          <div className="flex gap-3 flex-1 min-w-0">
                            <div className="bg-blue-50 p-2 rounded text-blue-500 h-fit mt-1"><FileTextOutlined /></div>
                            <div className="flex-1 overflow-hidden">
                              <span className="text-gray-800 font-semibold truncate block mb-1">{item.document_name}</span>
                              <div className="flex gap-2 items-center">
                                <Tag color="blue" variant="filled" className="m-0 text-[10px] font-bold">{item.document_type}</Tag>
                                <Tag color="blue" className="m-0 text-[10px] font-bold">{item.document_version}</Tag>
                              </div>
                            </div>
                          </div>
                          <DocActions doc={item} rootId={item.id} latestV={latestV} hasChildren={versions.length > 0} />
                        </div>
                        {versions.map(ver => (
                          <div key={ver.id} className="bg-gray-50 p-2 ml-6 rounded-lg border border-gray-100 flex items-start justify-between gap-4 border-l-4 border-l-orange-400">
                            <div className="flex gap-2 flex-1 min-w-0 items-center">
                              <FileTextOutlined className="text-orange-400 text-xs shrink-0" />
                              <span className="text-gray-700 text-sm truncate font-medium">{ver.document_name}</span>
                              <Tag color="orange" className="m-0 text-[10px] font-bold shrink-0">{ver.document_version}</Tag>
                            </div>
                            <DocActions doc={ver} rootId={item.id} latestV={latestV} />
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </Flex>
              ) : <Empty description="No documents found" style={{ padding: '40px 0', backgroundColor: '#f9fafb', borderRadius: 12 }} />
            }
          </div>
        </Col>
        <Col xs={24} lg={10}>
          <div className="bg-gray-50 p-3 sm:p-5 rounded-xl border border-gray-200 h-full flex flex-col min-h-[400px]">
            {viewingDoc ? (
              <div className="flex flex-col h-full">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-sm font-semibold text-gray-800 m-0 flex items-center gap-2">
                    <EyeOutlined className="text-blue-500" />
                    Preview: {viewingDoc.name}
                  </h4>
                  <Button type="link" size="small" className="p-0 h-auto" onClick={() => setViewingDoc(null)}>Back to Upload</Button>
                </div>
                <div className="flex-1 bg-white rounded-lg border border-gray-200 overflow-hidden relative min-h-[300px]">
                  {viewingDoc.type === 'image' ? (
                    <div className="flex items-center justify-center h-full p-4 overflow-auto">
                      <img src={viewingDoc.url} alt={viewingDoc.title} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    </div>
                  ) : viewingDoc.type === 'pdf' ? (
                    <iframe src={`${viewingDoc.url}#toolbar=0`} title={viewingDoc.title} width="100%" height="100%" style={{ border: 'none' }} />
                  ) : viewingDoc.type === 'video' ? (
                    <div className="flex items-center justify-center h-full bg-black">
                      <video controls style={{ maxWidth: '100%', maxHeight: '100%' }} src={viewingDoc.url}>
                        Your browser does not support the video tag.
                      </video>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                      <FileTextOutlined className="text-5xl text-gray-300 mb-4" />
                      <p className="text-gray-500 mb-4">Preview not available for this file type</p>
                      <Button icon={<DownloadOutlined />} onClick={() => handleDownloadFile(viewingDoc)}>Download to View</Button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-sm font-semibold text-gray-800 m-0 flex items-center gap-2"><UploadOutlined />{parentId ? 'Update Revision' : 'New Upload'}</h4>
                  {parentId && <Button type="link" danger size="small" className="p-0 h-auto" onClick={resetUpload}>Cancel</Button>}
                </div>

                {/* Selected File Display - Moved to top for clarity */}
                {selectedFileList.length > 0 && (
                  <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="bg-blue-500 p-1.5 rounded shadow-sm"><FileTextOutlined className="text-white text-xs" /></div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[9px] text-blue-500 font-bold uppercase leading-none mb-0.5">Selected File</span>
                        <span className="text-[11px] text-gray-800 truncate font-bold">{selectedFileList[0].name}</span>
                      </div>
                    </div>
                    <Tooltip title="Remove File">
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => setSelectedFileList([])} className="hover:bg-red-50 flex items-center justify-center" />
                    </Tooltip>
                  </div>
                )}

                {parentId && !selectedFileList.length && (
                  <div className="mb-3 p-2.5 bg-orange-50 border border-orange-100 rounded-lg flex items-center gap-2">
                    <SyncOutlined className="text-orange-500" />
                    <div className="min-w-0">
                      <div className="text-[9px] text-orange-500 font-bold uppercase leading-none mb-0.5">Updating:</div>
                      <div className="text-[11px] font-bold text-gray-800 truncate">{parentDocName}</div>
                    </div>
                  </div>
                )}

                <div className="mb-3">
                  <Dragger 
                    showUploadList={false}
                    fileList={selectedFileList} 
                    beforeUpload={(f) => { setSelectedFileList([f]); return false; }} 
                    multiple={false} 
                    className="bg-white border-dashed border-2 hover:border-blue-400 transition-all rounded-xl overflow-hidden"
                  >
                    <div className="py-3">
                      <p className="ant-upload-drag-icon mb-1"><UploadOutlined className="text-blue-500 text-xl" /></p>
                      <p className="ant-upload-text text-[11px] font-bold text-gray-600">
                        {selectedFileList.length ? 'Drag another to replace' : 'Click or drag file here'}
                      </p>
                      {!selectedFileList.length && <p className="ant-upload-hint text-[9px] text-gray-400">PDF, DOC, XLS, STEP, STL, MP4, MKV...</p>}
                    </div>
                  </Dragger>
                </div>

                <Row gutter={[8, 8]} className="mb-4">
                  <Col xs={14}>
                    <div className="text-[10px] font-bold text-gray-500 mb-1 uppercase tracking-wider">Type</div>
                    <Select value={uploadType} onChange={setUploadType} className="w-full custom-select-sm">
                      {['Image','CNC','Video','Other'].map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
                    </Select>
                    {uploadType === 'Other' && <Input className="mt-2 text-xs" placeholder="Custom type" value={uploadTypeOther} onChange={e => setUploadTypeOther(e.target.value)} autoComplete="off" />}
                  </Col>
                  <Col xs={10}>
                    <div className="text-[10px] font-bold text-gray-500 mb-1 uppercase tracking-wider">Revision <span className="text-red-500">*</span></div>
                    <Input value={uploadVersion} onChange={e => setUploadVersion(normalizeVersion(e.target.value))} placeholder="00" className="font-bold text-center bg-white text-xs h-[32px]" />
                  </Col>
                </Row>

                <Button type="primary" block size="large" icon={<UploadOutlined />} className="h-10 rounded-lg font-bold shadow-md no-hover-btn mt-auto" onClick={handleUpload} loading={loadingDocs} disabled={!selectedFileList.length || !uploadVersion.trim()}>
                  {parentId ? 'Upload New Revision' : 'Upload Document'}
                </Button>
              </>
            )}
          </div>
        </Col>
      </Row>
    );
  })();

  // ── tools tab ──────────────────────────────────────────────────────────────
  const toolsTab = (
    <div className="flex flex-col h-full">
      <h4 className="text-sm font-medium mb-2 flex items-center gap-2"><ToolOutlined className="text-blue-500" />Assigned Tools ({existingTools.length}):</h4>
      {loadingTools ? <div className="flex justify-center p-4"><Spin /></div>
        : existingTools.length > 0 ? (
          <Flex vertical className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-4">
            {[...existingTools].sort((a, b) => a.id - b.id).map((item, i) => {
              // Tool details are in the tool property based on API response
              const td = item.tool || item.tool_details || item || {};
              return (
                <div key={item.id} className={`flex items-center justify-between p-3 ${i < existingTools.length - 1 ? 'border-b border-gray-100' : ''} hover:bg-gray-50`}>
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <div className="text-sm font-bold text-gray-900">
                      {td?.item_description || `Tool ID: ${item.tool_id}`}
                    </div>
                    {td?.identification_code && (
                      <span className="bg-gray-100 px-2 py-1 rounded text-gray-700 font-medium text-xs">
                        {td.identification_code}
                      </span>
                    )}
                    {td?.make && (
                      <span className="text-xs text-gray-600 ml-2">
                        {td.make}
                      </span>
                    )}
                    {td?.model && (
                      <span className="text-xs text-gray-600 ml-2">
                        {td.model}
                      </span>
                    )}
                  </div>
                  {showAddToolForm && (
                    <Popconfirm title="Remove Tool" description="Are you sure?" onConfirm={() => handleRemoveTool(item.id)} okText="Yes" cancelText="No">
                      <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                    </Popconfirm>
                  )}
                </div>
              );
            })}
          </Flex>
        ) : <Empty description="No tools assigned" image={Empty.PRESENTED_IMAGE_SIMPLE} className="mb-4" />
      }
      {showAddToolForm && (
        <div className="pt-4 border-t">
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            onClick={() => setToolsSelectorVisible(true)}
            className="no-hover-btn"
          >
            Add Tools
          </Button>
        </div>
      )}
    </div>
  );

  // ── details tab ────────────────────────────────────────────────────────────
  const detailsTab = (
    <Form form={form} layout="vertical" onFinish={handleUpdateDetails} className="mt-2" autoComplete="off">
      <Row gutter={[12, 0]}>
        {!isCreateMode && (
          <Col xs={24} sm={8} md={4}>
            <Form.Item name="operation_number" label="Op Number" rules={[{ required: true }]}>
              <Input disabled autoComplete="off" />
            </Form.Item>
          </Col>
        )}
        <Col xs={24} sm={16} md={12}>
          <Form.Item name="operation_name" label="Operation Name" rules={[{ required: true, message: 'Please enter operation name' }]}>
            <Input 
              placeholder="Enter operation name" 
              prefix={<FileTextOutlined className="text-gray-400" />} 
              autoComplete="off" 
              maxLength={30}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={24} md={8}>
          <Form.Item name="part_type_id" label="Operation Type" rules={[{ required: true }]}>
            <Select placeholder="Select type" loading={partTypesLoading} onOpenChange={o => { if (o) fetchPartTypes(); }} options={partTypeOptions} />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item noStyle shouldUpdate={(p, c) => p.part_type_id !== c.part_type_id}>
        {({ getFieldValue }) => getFieldValue('part_type_id') === outsourceId
          ? (
            <>
              <OutSourceDates form={form} fromDateWatch={fromDateWatch} />
              {/* Vendor Selection for Out-Source Operations */}
              <Row gutter={[12, 0]} style={{ marginTop: 12 }}>
                <Col xs={24}>
                  <Form.Item name="vendor_id" label="Vendor" rules={[{ required: true, message: 'Please select a vendor for outsourced operations!' }]}>
                    <Select 
                      placeholder="Select vendor" 
                      allowClear 
                      showSearch 
                      optionFilterProp="children"
                      loading={vendorsLoading}
                      onOpenChange={o => { if (o) fetchVendors(); }}
                    >
                      {vendors.map(vendor => (
                        <Select.Option key={vendor.id} value={vendor.id}>
                          {vendor.company_name}
                        </Select.Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
              </Row>
            </>
          )
          : (
            <>
              <Row gutter={[12, 0]}>
                <Col xs={24} sm={12} lg={6}>
                  <Form.Item name="setup_time" label="Setup Time" required rules={timePickerRules('Setup Time')}>
                    <TimePicker style={{ width: '100%' }} format="HH:mm:ss" inputReadOnly showNow={false} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                  <Form.Item name="cycle_time" label="Cycle Time" required rules={timePickerRules('Cycle Time')}>
                    <TimePicker style={{ width: '100%' }} format="HH:mm:ss" inputReadOnly showNow={false} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                  <Form.Item name="workcenter_id" label="Workcenter">
                    <Select placeholder="Select WC" allowClear loading={workCentersLoading} onOpenChange={o => { if (o) fetchWorkCenters(); }} onChange={() => form.setFieldValue('machine_id', undefined)}>
                      {workCenters.map(wc => <Select.Option key={wc.id} value={wc.id}>{wc.work_center_name}</Select.Option>)}
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                  <Form.Item noStyle shouldUpdate={(p, c) => p.workcenter_id !== c.workcenter_id}>
                    {({ getFieldValue }) => (
                      <Form.Item name="machine_id" label="Machine" rules={[
                        ({ getFieldValue }) => ({
                          validator(_, value) {
                            const workcenterId = getFieldValue('workcenter_id');
                            if (workcenterId && !value) {
                              return Promise.reject(new Error('Please select a machine when work center is selected'));
                            }
                            return Promise.resolve();
                          },
                        }),
                      ]}>
                        <Select placeholder={getFieldValue('workcenter_id') ? 'Select Machine' : 'Select WC First'} disabled={!getFieldValue('workcenter_id')} allowClear loading={machinesLoading} onOpenChange={o => { if (o) fetchMachines(); }}>
                          {allMachines.filter(m => m.work_center_id === getFieldValue('workcenter_id')).map(m => (
                            <Select.Option key={m.id} value={m.id}>{[m.make, m.model].filter(Boolean).join(' - ')} ({m.type})</Select.Option>
                          ))}
                        </Select>
                      </Form.Item>
                    )}
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="work_instructions" label="Work Instructions" className="mb-2">
                <TextArea rows={3} placeholder="Enter detailed work instructions..." />
              </Form.Item>
              <Form.Item name="notes" label="Notes" className="mb-2">
                <TextArea rows={2} placeholder="Additional notes..." />
              </Form.Item>
            </>
          )
        }
      </Form.Item>
    </Form>
  );

  const allTabs = [
    { key: 'details',   label: 'Details',                         children: detailsTab },
    { key: 'documents', label: `Documents (${documents.length})`,  children: documentsTab },
    { key: 'tools',     label: `Tools (${existingTools.length})`,  children: toolsTab },
  ];
  const filteredTabs = isCreateMode ? allTabs.filter(t => t.key === 'details')
    : showAddToolForm ? allTabs.filter(t => t.key === 'tools') : allTabs.filter(t => t.key !== 'tools');

  return (
    <Modal
      title={
        <div className="flex items-center gap-2">
          <ToolOutlined className="text-blue-600" />
          <span>{isCreateMode ? 'Add Operation' : showAddToolForm ? 'Assign Tools' : 'Edit Operation'}</span>
          {isCreateMode && partName && <span className="text-xs font-normal text-gray-500">(for {partName})</span>}
        </div>
      }
      open={open} onCancel={onCancel}
      footer={activeTab === 'details' ? [
        <Button key="cancel" onClick={onCancel}>Cancel</Button>,
        <Button key="submit" type="primary" loading={loading} icon={<SaveOutlined />} className="no-hover-btn" onClick={() => form.submit()}>
          {isCreateMode ? 'Create Operation' : 'Save Changes'}
        </Button>
      ] : null}
      width="95%" style={{ maxWidth: activeTab === 'details' ? 850 : 1000, top: 10 }}
      styles={{ body: { maxHeight: 'calc(100vh - 120px)', overflowY: 'auto', overflowX: 'hidden', padding: '8px 16px' } }}
      centered maskClosable={false} destroyOnHidden
    >
      <style>{`.no-hover-btn,.no-hover-btn:hover,.no-hover-btn:focus,.no-hover-btn:active{background-color:#2563eb!important;color:#fff!important;border:none!important;box-shadow:none!important;}`}</style>
      <div className="mt-2">
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={filteredTabs} />
      </div>
      {preview && (
        <Modal title={preview.title} open onCancel={() => setPreview(null)}
          footer={[
            <Button key="dl" icon={<DownloadOutlined />} onClick={() => handleDownloadFile({ id: preview.id, document_name: preview.name })}>Download</Button>,
            <Button key="cl" type="primary" onClick={() => setPreview(null)}>Close</Button>
          ]}
          width="95%" style={{ maxWidth: 1000, top: 20 }} styles={{ body: { height: '75vh', padding: 0 } }}
        >
          {preview.type === 'image' ? (
            <div className="flex items-center justify-center h-full bg-gray-100 overflow-auto">
              <img src={preview.url} alt={preview.title} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            </div>
          ) : preview.type === 'pdf' ? (
            <iframe src={`${preview.url}#toolbar=0`} title={preview.title} width="100%" height="100%" style={{ border: 'none' }} />
          ) : preview.type === 'text' ? (
            <div className="h-full bg-gray-50 p-4 overflow-auto">
              <iframe 
                src={preview.url} 
                title={preview.title} 
                width="100%" 
                height="100%" 
                style={{ 
                  border: 'none', 
                  backgroundColor: 'white',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  whiteSpace: 'pre'
                }} 
              />
            </div>
          ) : preview.type === 'video' ? (
            <div className="flex items-center justify-center h-full bg-black">
              <video
                controls
                autoPlay
                style={{ maxWidth: '100%', maxHeight: '100%' }}
                src={preview.url}
              >
                Your browser does not support the video tag.
              </video>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-gray-50">
              <FileTextOutlined className="text-5xl text-gray-400 mb-4" />
              <p className="text-gray-700 font-medium mb-2">Preview is not available for this file type.</p>
              <p className="text-gray-500">Please download the file to view it.</p>
            </div>
          )}
        </Modal>
      )}
      {toolsSelectorVisible && (
        <OperationToolsSelector
          visible={toolsSelectorVisible}
          onCancel={() => setToolsSelectorVisible(false)}
          onConfirm={async (newLinks) => {
            // OperationToolsSelector already made the API call and showed success message
            // This callback just handles UI updates after success
            if (!newLinks || newLinks.length === 0) {
              message.info('No new tools were added');
              return;
            }

            fetchExistingTools();
            if (onUpdate) onUpdate();
            setToolsSelectorVisible(false);
          }}
          existingTools={existingTools}
          operationId={operation?.id}
          partId={operation?.part_id}
        />
      )}
    </Modal>
  );
};

export default EditOperationModal;