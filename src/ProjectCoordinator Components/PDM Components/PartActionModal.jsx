import React, { useState, useEffect } from 'react';
import { PlusOutlined, DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import axios from "axios";
import { API_BASE_URL } from '../../Config/auth';
import { Modal, Form, Input, Select, Button, message, Upload, Card, Badge, TimePicker, Row, Col, DatePicker } from 'antd';
import dayjs from 'dayjs';
import { fetchInto, timePickerRules } from './operationUtils.js';

const { TextArea } = Input;

// Reusable From/To date pair — identical logic to EditOperationModal's OutSourceDates
const OutSourceDates = ({ form, index, itemsWatch }) => {
  const fromName = ['items', index, 'from_date'];
  const toName   = ['items', index, 'to_date'];
  return (
    <Row gutter={[12, 12]}>
      <Col xs={24} sm={12}>
        <Form.Item name={fromName} label="From Date" rules={[{ required: true, message: 'Required for Out-Source' }]}>
          <DatePicker format="DD-MM-YYYY" style={{ width: '100%' }} inputReadOnly />
        </Form.Item>
      </Col>
      <Col xs={24} sm={12}>
        <Form.Item name={toName} label="To Date" rules={[
          { required: true, message: 'Required for Out-Source' },
          { validator: (_, value) => {
            const fd = form.getFieldValue(fromName);
            if (!value) return Promise.resolve();
            if (!fd) return Promise.reject(new Error('Select From Date first'));
            return dayjs(value).isAfter(dayjs(fd), 'day') ? Promise.resolve() : Promise.reject(new Error('To Date must be after From Date'));
          }}
        ]}>
          <DatePicker format="DD-MM-YYYY" style={{ width: '100%' }} inputReadOnly
            disabled={!itemsWatch?.[index]?.from_date}
            disabledDate={(c) => { const fd = form.getFieldValue(fromName); return !fd || (c && !c.isAfter(dayjs(fd), 'day')); }} />
        </Form.Item>
      </Col>
    </Row>
  );
};

// ── DocTypeCards ─────────────────────────────────────────────────────────────
// Visual 2D / 3D / Other drag-and-drop cards for document type selection
const CARD_TYPES = [
  { key: '2D',    label: '2D',    sub: '2D Drawing',     color: '#2563eb', bg: '#eff6ff', dragBg: '#dbeafe' },
  { key: '3D',    label: '3D',    sub: '3D Model',       color: '#7c3aed', bg: '#f5f3ff', dragBg: '#ede9fe' },
  { key: 'Other', label: '···',   sub: 'Custom Type',    color: '#d97706', bg: '#fffbeb', dragBg: '#fef3c7' },
];

const DocTypeCards = ({ name, form, itemsWatch }) => {
  const [dragOver, setDragOver] = useState(null);
  const docType = itemsWatch?.[name]?.document_type || '2D';
  const files = itemsWatch?.[name]?.files || {};
  const isOther = docType === 'Other';

  const applyFile = (type, file) => {
    const syntheticFile = { uid: `-${Date.now()}`, name: file.name, originFileObj: file, status: 'done' };
    form.setFieldValue(['items', name, 'files', type], [syntheticFile]);
    form.setFieldValue(['items', name, 'document_type'], type);
    
    const currentName = form.getFieldValue(['items', name, 'document_name']);
    if (!currentName) {
      form.setFieldValue(['items', name, 'document_name'], file.name?.replace(/\.[^/.]+$/, '') || '');
    }
  };

  const selectType = (type) => {
    form.setFieldValue(['items', name, 'document_type'], type);
  };

  const removeFile = (e, type) => {
    e.stopPropagation();
    form.setFieldValue(['items', name, 'files', type], []);
  };

  return (
    <div>
      {/* 2D / 3D / Other Cards — 3-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
        {CARD_TYPES.map(({ key, label, sub, color, bg, dragBg }) => {
          const isSelected = docType === key;
          const fileList = files[key] || [];
          const fileForThisType = fileList[0]?.originFileObj || fileList[0];
          const hasFile = !!fileForThisType;
          const isDragTarget = dragOver === key;

          return (
            <div
              key={key}
              onDragOver={e => { e.preventDefault(); setDragOver(key); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={e => {
                e.preventDefault();
                setDragOver(null);
                const file = e.dataTransfer.files?.[0];
                if (file) applyFile(key, file);
              }}
              onClick={() => selectType(key)}
              style={{
                position: 'relative',
                border: `2px dashed ${isDragTarget ? color : isSelected ? color : '#d9d9d9'}`,
                borderRadius: 10,
                padding: '18px 8px',
                textAlign: 'center',
                cursor: 'pointer',
                background: isDragTarget ? dragBg : isSelected ? bg : '#fafafa',
                transition: 'all 0.18s',
                minHeight: 90,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
              }}
            >
              {hasFile && (
                <div 
                  onClick={(e) => removeFile(e, key)}
                  style={{
                    position: 'absolute',
                    top: 5,
                    right: 5,
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: '#ef4444',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    zIndex: 10,
                  }}
                >
                  ×
                </div>
              )}
              {hasFile ? (
                <>
                  <span style={{ fontSize: 22 }}>📄</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color, wordBreak: 'break-all', maxWidth: '100%', padding: '0 2px' }}>{fileForThisType.name}</span>
                  <span style={{ fontSize: 9, color: '#9ca3af' }}>{key} Document</span>
                </>
              ) : (
                <>
                  <span style={{ fontSize: key === 'Other' ? 22 : 26, fontWeight: 800, color: isSelected ? color : '#9ca3af', lineHeight: 1 }}>{label}</span>
                  <span style={{ fontSize: 10, color: isSelected ? color : '#9ca3af', fontWeight: isSelected ? 600 : 400 }}>{sub}</span>
                  {key !== 'Other' && <span style={{ fontSize: 9, color: '#d1d5db' }}>drop file here</span>}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Custom type input — only shown when Other is selected */}
      {isOther && (
        <Form.Item
          name={[name, 'document_type_other']}
          rules={[{ required: true, message: 'Please enter custom document type' }]}
          style={{ marginBottom: 12 }}
        >
          <Input placeholder="Enter custom document type (e.g. IPID, CNC Program...)" autoComplete="off" />
        </Form.Item>
      )}

      {/* Hidden document_type field — driven by card clicks */}
      <Form.Item name={[name, 'document_type']} hidden initialValue="2D"><Input /></Form.Item>

      {/* File pickers — one for each type, but only current one is visible */}
      {CARD_TYPES.map(({ key }) => (
        <Form.Item
          key={key}
          name={[name, 'files', key]}
          valuePropName="fileList"
          getValueFromEvent={e => Array.isArray(e) ? e : e?.fileList}
          rules={[
            {
              validator: (_, value) => {
                const currentFiles = form.getFieldValue(['items', name, 'files']) || {};
                const hasAnyFile = Object.values(currentFiles).some(list => Array.isArray(list) && list.length > 0);
                if (hasAnyFile) return Promise.resolve();
                return Promise.reject(new Error('Please select or drop at least one file'));
              }
            }
          ]}
          style={{ marginBottom: 12, display: docType === key ? 'block' : 'none' }}
        >
          <Upload
            maxCount={1}
            beforeUpload={() => false}
            onChange={({ fileList }) => {
              const f = fileList?.[0]?.originFileObj;
              if (f) {
                const currentName = form.getFieldValue(['items', name, 'document_name']);
                if (!currentName) {
                  form.setFieldValue(['items', name, 'document_name'], f.name?.replace(/\.[^/.]+$/, '') || '');
                }
              }
            }}
          >
            <Button icon={<UploadOutlined />} style={{ width: '100%', textAlign: 'left' }}>
              Select File {key === 'Other' ? '(Custom)' : `(uploads as ${key})`}
            </Button>
          </Upload>
        </Form.Item>
      ))}

      {/* Document Name + Revision */}
      <Row gutter={[12, 12]}>
        <Col xs={24} sm={14}>
          <Form.Item
            name={[name, 'document_name']}
            label={<span style={{ fontSize: 12, fontWeight: 500, color: '#6b7280' }}>Document Name</span>}
            rules={[{ required: true, message: 'Required' }]}
            style={{ marginBottom: 0 }}
          >
            <Input placeholder={docType === '2D' ? 'Tech Drawing' : '3D Model Name'} autoComplete="off" />
          </Form.Item>
        </Col>
        <Col xs={24} sm={10}>
          <Form.Item
            name={[name, 'document_version']}
            label={<span style={{ fontSize: 12, fontWeight: 500, color: '#6b7280' }}>Revision</span>}
            rules={[{ required: true, message: 'Required' }]}
            style={{ marginBottom: 0 }}
          >
           <Input placeholder="eg, 00" autoComplete="off" />
          </Form.Item>
        </Col>
      </Row>
    </div>
  );
};

const PartActionModal = ({ open, onCancel, actionType, selectedPart, onActionCreated, initialOperations = [], existingOperations = [] }) => {
  const [form] = Form.useForm();
  const [loading, setLoading]           = useState(false);
  const [workCenters, setWorkCenters]   = useState([]);
  const [allMachines, setAllMachines]   = useState([]);
  const [partTypes, setPartTypes]       = useState([]);
  const [partTypesLoading, setPartTypesLoading]     = useState(false);
  const [workCentersLoading, setWorkCentersLoading] = useState(false);
  const [machinesLoading, setMachinesLoading]       = useState(false);
  const [vendorsLoading, setVendorsLoading]         = useState(false);
  const [vendors, setVendors]                       = useState([]);

  const itemsWatch = Form.useWatch('items', form);
  
  const calculateNextOpNumber = (index) => {
    if (actionType === 'operation' && existingOperations?.length > 0) {
      const existingNumbers = existingOperations
        .map(op => { const num = parseInt(String(op.operation_number).trim()); return isNaN(num) ? 0 : num; })
        .filter(num => num > 0);
      const maxNumber = Math.max(...existingNumbers, 0);
      return maxNumber + (index + 1) * 10;
    }
    return (index + 1) * 10;
  };

  const fetchWorkCenters = () => fetchInto(`${API_BASE_URL}/workcenters/`, setWorkCenters, setWorkCentersLoading, workCenters.length > 0);
  const fetchPartTypes   = () => fetchInto(`${API_BASE_URL}/part-types/`,  setPartTypes,   setPartTypesLoading,   partTypes.length > 0);
  const fetchMachines    = () => fetchInto(`${API_BASE_URL}/machines/`,     setAllMachines, setMachinesLoading,    allMachines.length > 0);
  const fetchVendors     = () => fetchInto(`${API_BASE_URL}/rawmaterials/vendors`, setVendors, setVendorsLoading, vendors.length > 0);

  const getCurrentUserId = () => {
    try {
      const stored = localStorage.getItem('user');
      if (!stored) return null;
      const u = JSON.parse(stored);
      if (u?.id == null) return null;
      return u.id;
    } catch { return null; }
  };

  const partTypeOptions = partTypes.length
    ? partTypes.map(pt => ({ label: pt.type_name, value: pt.id }))
    : [{ label: 'IN-House', value: 1 }, { label: 'Out-Source', value: 2 }];

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (actionType === 'operation') {
      const items = initialOperations?.length > 0
        ? initialOperations.map(op => ({
            operation_name:    op.operation_name,
            part_type_id:      op.part_type_id ?? 1,
            from_date: op.from_date ? dayjs(op.from_date) : null, 
            to_date: op.to_date ? dayjs(op.to_date) : null,
            setup_time:        op.setup_time ? dayjs(op.setup_time, 'HH:mm:ss') : null,
            cycle_time:        op.cycle_time ? dayjs(op.cycle_time, 'HH:mm:ss') : null,
            workcenter_id:     op.workcenter_id || null,
            machine_id:        op.machine_id || null,
            work_instructions: op.work_instructions || '',
            notes:             op.notes || '',
            documents: [],
          }))
        : [{ part_type_id: 1, documents: [] }];
      form.setFieldsValue({ items });
    } else {
      form.setFieldsValue({ items: [{ document_version: '', document_type: '2D' }] });
    }
  }, [open, actionType, initialOperations]);

  useEffect(() => {
    if (!itemsWatch) return;
    const current = form.getFieldValue('items');
    if (!current) return;
    let changed = false;
    const next = current.map(item => {
      const { from_date: fd, to_date: td } = item;
      if ((!fd && td) || (fd && td && !dayjs(td).isAfter(dayjs(fd), 'day'))) { changed = true; return { ...item, to_date: null }; }
      return item;
    });
    if (changed) form.setFieldsValue({ items: next });
  }, [itemsWatch]);

  const handleFinish = async (values) => {
    setLoading(true);
    const items = values.items || [];

    const hasBlankCustom = (check) => items.some(check);
    if (actionType === 'operation' && hasBlankCustom(item => item.documents?.some(d => d.document_type === 'Other' && !d.document_type_other?.trim()))) {
      message.error("Please enter custom document type for all 'Other' documents"); setLoading(false); return;
    }

    const results = [];
    const now = dayjs();
    const ts  = (d) => d ? dayjs(d).hour(now.hour()).minute(now.minute()).second(now.second()).toISOString() : null;
    const resolveType = (type, other) => (type === 'Other' && other?.trim()) ? other.trim() : type;
    let bulkDocFormData = null;

    if (actionType === 'operation') {
      const uid = getCurrentUserId();
      const opPayloads = items.map((item) => {
        const out = item.part_type_id === 2;
        return {
          operation_name: item.operation_name,
          part_type_id: item.part_type_id ?? 1,
          vendor_id: item.vendor_id || null,
          from_date: ts(item.from_date),
          to_date: ts(item.to_date),
          setup_time: out ? null : (item.setup_time?.format('HH:mm:ss') ?? null),
          cycle_time: out ? null : (item.cycle_time?.format('HH:mm:ss') ?? null),
          workcenter_id: out ? null : (item.workcenter_id ? parseInt(item.workcenter_id) : null),
          machine_id: out ? null : (item.machine_id ? parseInt(item.machine_id) : null),
          work_instructions: out ? null : (item.work_instructions || null),
          notes: out ? null : (item.notes || null),
          part_id: selectedPart.id,
          user_id: uid,
        };
      });

      try {
        const opRes = await axios.post(`${API_BASE_URL}/operations/bulk`, opPayloads, { headers: { 'Content-Type': 'application/json' } });
        const createdOps = Array.isArray(opRes.data) ? opRes.data : [];
        createdOps.forEach((o) => results.push(o));

        try {
          const fd = new FormData();
          if (uid != null) fd.append('user_id', String(uid));
          for (let i = 0; i < createdOps.length; i++) {
            const newOp = createdOps[i];
            const item = items[i];
            const docs = item?.documents || [];
            for (const doc of docs) {
              if (!doc.files?.length) continue;
              const fileObj = doc.files?.[0]?.originFileObj;
              if (!fileObj) continue;
              fd.append('operation_id', String(newOp.id));
              fd.append('files', fileObj);
              fd.append('document_name', fileObj.name || 'Document');
              fd.append('document_type', resolveType(doc.document_type, doc.document_type_other) || 'IPID');
              fd.append('document_version', (doc.document_version || 'v1.0').replace(/^v/i, ''));
              fd.append('parent_id', '');
            }
          }
          if (fd.getAll('files')?.length) {
            await axios.post(`${API_BASE_URL}/operation-documents/upload-bulk-multi/`, fd);
          }
        } catch (e) { console.error(e); }
      } catch (e) {
        console.error(e);
        const detail =
          e?.response?.data?.detail ||
          e?.response?.data?.message ||
          'Failed to create operations';
        message.error(detail);
      }
    } else {
      for (const item of items) {
        try {
          if (actionType === 'document') {
            const filesMap = item.files || {};
            const types = Object.keys(filesMap);

            if (types.length === 0) continue;

            for (const type of types) {
              const fileList = filesMap[type];
              const file = fileList?.[0]?.originFileObj;
              if (!file) continue;

              if (!bulkDocFormData) {
                const fd = new FormData();
                fd.append('part_id', selectedPart.id.toString());
                const uid = getCurrentUserId();
                if (uid != null) fd.append('user_id', String(uid));
                bulkDocFormData = fd;
              }

              bulkDocFormData.append('files', file);
              bulkDocFormData.append('document_name', item.document_name || file.name?.replace(/\.[^/.]+$/, '') || 'Document');
              bulkDocFormData.append('document_type', resolveType(type, item.document_type_other) || type);
              bulkDocFormData.append('document_version', item.document_version || 'v1.0');
              if (item.parent_id) bulkDocFormData.append('parent_id', String(item.parent_id));
            }
          }
        } catch (e) { console.error(e); message.error('Failed to create item'); }
      }
    }

    if (actionType === 'document' && bulkDocFormData) {
      try {
        const resp = await axios.post(`${API_BASE_URL}/documents/bulk`, bulkDocFormData);
        const created = Array.isArray(resp.data) ? resp.data : [];
        created.forEach(d => results.push(d));
      } catch (e) {
        console.error(e);
        const detail =
          e?.response?.data?.detail ||
          e?.response?.data?.message ||
          'Failed to upload documents';
        message.error(detail);
      }
    }

    setLoading(false);
    if (results.length > 0) { onActionCreated(results[0], actionType); onCancel(); form.resetFields(); }
  };

  const actionLabel = actionType ? actionType.charAt(0).toUpperCase() + actionType.slice(1) + 's' : 'Items';

  return (
    <Modal title={`Create ${actionLabel}`} open={open} onCancel={onCancel} footer={null} width="95%" style={{ maxWidth: 1000 }} destroyOnHidden centered>
      <style>{`.no-hover-btn,.no-hover-btn:hover,.no-hover-btn:focus,.no-hover-btn:active{background-color:#2563eb!important;color:#fff!important;border:none!important;box-shadow:none!important;}`}</style>

      <div style={{ marginBottom: 16 }}>
        <Badge count={`For Part: ${selectedPart?.part_name}`} style={{ backgroundColor: '#e6f7ff', color: '#1890ff', padding: '0 12px', borderRadius: 4, border: '1px solid #91d5ff' }} />
      </div>

      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.List name="items">
          {(fields, { add, remove }) => (
            <>
              <div style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: 4 }}>
                {fields.map(({ key, name, ...restField }, index) => (
                  <Card key={key} size="small"
                    title={`${actionType === 'operation' ? 'Operation' : 'Document'} ${index + 1}`}
                    extra={fields.length > 1 ? <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} /> : null}
                    style={{ marginBottom: 16, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
                    styles={{ header: { backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0', borderRadius: '8px 8px 0 0' } }}
                  >
                    {actionType === 'operation' && (
                      <>
                        <Form.Item noStyle shouldUpdate={(prev, curr) => prev.items?.[index]?.part_type_id !== curr.items?.[index]?.part_type_id || prev.items?.[index]?.from_date !== curr.items?.[index]?.from_date}>
                          {({ getFieldValue }) => {
                            const isOutSource = getFieldValue(['items', index, 'part_type_id']) === 2;
                            return (
                              <>
                                <Row gutter={[12, 12]}>
                                  <Col xs={24} sm={6} md={3}>
                                    <Form.Item label="Op Number" required>
                                      <Input value={calculateNextOpNumber(index)} disabled />
                                    </Form.Item>
                                  </Col>
                                  <Col xs={24} sm={8} md={5}>
                                    <Form.Item noStyle shouldUpdate={(p, c) => p.items?.[index]?.operation_name !== c.items?.[index]?.operation_name}>
                                      {({ getFieldValue }) => {
                                        const opName = getFieldValue(['items', index, 'operation_name']);
                                        const isNew = opName === 'New';
                                        return (
                                          <>
                                            <Form.Item {...restField} name={[name, 'operation_name']} label="Operation Name" rules={[{ required: true, message: 'Operation Name is required' }]}>
                                              <Select placeholder="Select Operation" allowClear>
                                                <Select.Option value="Heat Treatment">Heat Treatment</Select.Option>
                                                <Select.Option value="Cutting">Cutting</Select.Option>
                                                <Select.Option value="Drilling">Drilling</Select.Option>
                                                <Select.Option value="Milling">Milling</Select.Option>
                                                <Select.Option value="Turning">Turning</Select.Option>
                                                <Select.Option value="Gear Hobbing">Gear Hobbing</Select.Option>
                                                <Select.Option value="Gear Cutting">Gear Cutting</Select.Option>
                                                <Select.Option value="Gear grinding">Gear grinding</Select.Option>
                                                <Select.Option value="Surface Grinding">Surface Grinding</Select.Option>
                                                <Select.Option value="Grooving">Grooving</Select.Option>
                                                <Select.Option value="Threading">Threading</Select.Option>
                                                <Select.Option value="Inspection">Inspection</Select.Option>
                                                <Select.Option value="Die Siking">Die Siking</Select.Option>
                                                <Select.Option value="EDM">EDM</Select.Option>
                                                <Select.Option value="Laser cutting">Laser cutting</Select.Option>
                                                <Select.Option value="New">New (Custom)</Select.Option>
                                              </Select>
                                            </Form.Item>
                                            {isNew && (
                                              <Form.Item {...restField} name={[name, 'custom_operation_name']} label="Custom Operation Name" rules={[{ required: true, message: 'Custom operation name is required' }]} className="mt-2" getValueFromEvent={e => e.target.value.replace(/[^a-zA-Z0-9-_ ]/g, '').slice(0, 30)}>
                                                <Input placeholder="Enter custom name" autoComplete="off" maxLength={30} />
                                              </Form.Item>
                                            )}
                                          </>
                                        );
                                      }}
                                    </Form.Item>
                                  </Col>
                                  <Col xs={24} sm={8} md={4}>
                                    <Form.Item {...restField} name={[name, 'part_type_id']} label="Operation Type" initialValue={1} rules={[{ required: true }]}>
                                      <Select placeholder="Type" loading={partTypesLoading} onOpenChange={o => { if (o) fetchPartTypes(); }} options={partTypeOptions} />
                                    </Form.Item>
                                  </Col>
                                  {!isOutSource && (
                                    <>
                                      <Col xs={12} sm={12} md={5}>
                                        <Form.Item {...restField} name={[name, 'setup_time']} label="Setup Time" required rules={timePickerRules('Setup Time')}>
                                          <TimePicker style={{ width: '100%' }} format="HH:mm:ss" inputReadOnly showNow={false} />
                                        </Form.Item>
                                      </Col>
                                      <Col xs={12} sm={12} md={6}>
                                        <Form.Item {...restField} name={[name, 'cycle_time']} label="Cycle Time" required rules={timePickerRules('Cycle Time')}>
                                          <TimePicker style={{ width: '100%' }} format="HH:mm:ss" inputReadOnly showNow={false} />
                                        </Form.Item>
                                      </Col>
                                    </>
                                  )}
                                </Row>
                                
                                {isOutSource && (
                                  <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
                                    <Col xs={24} sm={12} md={12}>
                                      <Form.Item {...restField} name={[name, 'from_date']} label="From Date" rules={[{ required: true, message: 'Required for Out-Source' }]}>
                                        <DatePicker format="DD-MM-YYYY" style={{ width: '100%' }} inputReadOnly />
                                      </Form.Item>
                                    </Col>
                                    <Col xs={24} sm={12} md={12}>
                                      <Form.Item {...restField} name={[name, 'to_date']} label="To Date" rules={[
                                        { required: true, message: 'Required for Out-Source' },
                                        { validator: (_, value) => {
                                          const fd = getFieldValue(['items', index, 'from_date']);
                                          if (!value) return Promise.resolve();
                                          if (!fd) return Promise.reject(new Error('Select From Date first'));
                                          return dayjs(value).isAfter(dayjs(fd), 'day') ? Promise.resolve() : Promise.reject(new Error('To Date must be after From Date'));
                                        }}
                                      ]}>
                                        <DatePicker format="DD-MM-YYYY" style={{ width: '100%' }} inputReadOnly
                                          disabled={!getFieldValue(['items', index, 'from_date'])}
                                          disabledDate={(current) => { const fd = getFieldValue(['items', index, 'from_date']); if (!fd) return true; return current && !current.isAfter(dayjs(fd), 'day'); }} />
                                      </Form.Item>
                                    </Col>
                                  </Row>
                                )}
                                
                                {isOutSource && (
                                  <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
                                    <Col xs={24}>
                                      <Form.Item {...restField} name={[name, 'vendor_id']} label="Vendor" rules={[{ required: true, message: 'Please select a vendor for outsourced operations!' }]}>
                                        <Select placeholder="Select vendor" allowClear showSearch optionFilterProp="children" loading={vendorsLoading} onOpenChange={o => { if (o) fetchVendors(); }}>
                                          {vendors.map(vendor => <Select.Option key={vendor.id} value={vendor.id}>{vendor.company_name}</Select.Option>)}
                                        </Select>
                                      </Form.Item>
                                    </Col>
                                  </Row>
                                )}
                              </>
                            );
                          }}
                        </Form.Item>

                        <Form.Item noStyle shouldUpdate={(p, c) => p.items?.[index]?.part_type_id !== c.items?.[index]?.part_type_id}>
                          {({ getFieldValue }) => {
                            if ((getFieldValue(['items', index, 'part_type_id']) ?? 1) !== 1) return null;
                            return (
                              <>
                                <Row gutter={[12, 12]}>
                                  <Col xs={24} sm={12} md={8} lg={6}>
                                    <Form.Item {...restField} name={[name, 'workcenter_id']} label="Workcenter">
                                      <Select placeholder="Select WC" loading={workCentersLoading} onOpenChange={o => { if (o) fetchWorkCenters(); }}
                                        onChange={() => { const items = form.getFieldValue('items'); if (items?.[index]) { items[index].machine_id = undefined; form.setFieldsValue({ items }); } }}>
                                        {workCenters.map(wc => <Select.Option key={wc.id} value={wc.id}>{wc.work_center_name}</Select.Option>)}
                                      </Select>
                                    </Form.Item>
                                  </Col>
                                  <Col xs={24} sm={12} md={8} lg={6}>
                                    <Form.Item noStyle shouldUpdate={(p, c) => p.items?.[index]?.workcenter_id !== c.items?.[index]?.workcenter_id}>
                                      {({ getFieldValue }) => {
                                        const wcId = getFieldValue(['items', index, 'workcenter_id']);
                                        return (
                                          <Form.Item {...restField} name={[name, 'machine_id']} label="Machine">
                                            <Select placeholder={wcId ? 'Select Machine' : 'Select WC First'} disabled={!wcId} loading={machinesLoading} onOpenChange={o => { if (o) fetchMachines(); }}>
                                              {allMachines.filter(m => m.work_center_id === wcId).map(m => (
                                                <Select.Option key={m.id} value={m.id}>{[m.make, m.model].filter(Boolean).join(' - ')} ({m.type})</Select.Option>
                                              ))}
                                            </Select>
                                          </Form.Item>
                                        );
                                      }}
                                    </Form.Item>
                                  </Col>
                                  <Col xs={24} sm={24} md={8} lg={12}>
                                    <Form.Item {...restField} name={[name, 'work_instructions']} label="Work Instructions">
                                      <TextArea rows={2} placeholder="Enter instructions..." />
                                    </Form.Item>
                                  </Col>
                                </Row>
                                <Row gutter={[12, 12]}>
                                  <Col xs={24} sm={12}>
                                    <Form.Item {...restField} name={[name, 'notes']} label="Notes">
                                      <TextArea rows={2} placeholder="Enter notes..." />
                                    </Form.Item>
                                  </Col>
                                </Row>
                              </>
                            );
                          }}
                        </Form.Item>

                        {/* Documents sub-list */}
                        <Form.List name={[name, 'documents']} initialValue={[]}>
                          {(docFields, { add: addDoc, remove: removeDoc }) => (
                            <div className="mt-4 border-t pt-4">
                              <div className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2"><UploadOutlined className="text-blue-500" />Operation Documents</div>
                              {docFields.map(({ key: dk, name: dn, ...dr }) => (
                                <Card key={dk} size="small" className="mb-3 bg-gray-50/50 border-gray-200" styles={{ body: { padding: 12 } }}>
                                  <Row gutter={[12, 12]} align="bottom">
                                    <Col xs={24} sm={10} lg={10}>
                                      <Form.Item {...dr} name={[dn, 'files']} label={<span className="text-xs font-medium text-gray-600">File</span>} valuePropName="fileList" getValueFromEvent={e => Array.isArray(e) ? e : e?.fileList} className="mb-0" rules={[{ required: true, message: 'Required' }]}>
                                        <Upload maxCount={1} beforeUpload={() => false} className="w-full">
                                          <Button icon={<UploadOutlined />} size="small" className="w-full text-left">Select File</Button>
                                        </Upload>
                                      </Form.Item>
                                    </Col>
                                    <Col xs={24} sm={10} lg={10}>
                                      <Form.Item noStyle shouldUpdate={(p, c) => p.items?.[index]?.documents?.[dn]?.document_type !== c.items?.[index]?.documents?.[dn]?.document_type}>
                                        {({ getFieldValue }) => {
                                          const type = getFieldValue(['items', index, 'documents', dn, 'document_type']);
                                          return (
                                            <div className="flex flex-col gap-2">
                                              <Form.Item {...dr} name={[dn, 'document_type']} label={<span className="text-xs font-medium text-gray-600">Doc Type</span>} className="mb-0" initialValue="IPID">
                                                <Select placeholder="Select Type" size="small" className="w-full">
                                                  {['IPID','Image','CNC','Other'].map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
                                                </Select>
                                              </Form.Item>
                                              {type === 'Other' && (
                                                <Form.Item {...dr} name={[dn, 'document_type_other']} className="mb-0" rules={[{ required: true, message: 'Type Required' }]}>
                                                  <Input placeholder="Custom type..." size="small" autoComplete="off" />
                                                </Form.Item>
                                              )}
                                            </div>
                                          );
                                        }}
                                      </Form.Item>
                                    </Col>
                                    <Col xs={18} sm={2} lg={2}>
                                      <Form.Item {...dr} name={[dn, 'document_version']} label={<span className="text-xs font-medium text-gray-600">Ver</span>} className="mb-0" initialValue="v1.0">
                                        <Input placeholder="v1.0" disabled size="small" className="bg-gray-50 text-center" />
                                      </Form.Item>
                                    </Col>
                                    <Col xs={6} sm={2} lg={2} className="flex justify-center">
                                      <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeDoc(dn)} />
                                    </Col>
                                  </Row>
                                </Card>
                              ))}
                              <Form.Item>
                                <Button type="dashed" onClick={() => addDoc({ document_type: 'IPID', document_version: 'v1.0' })} block icon={<PlusOutlined />} className="text-blue-500 border-blue-200">
                                  Add Document to Operation
                                </Button>
                              </Form.Item>
                            </div>
                          )}
                        </Form.List>
                      </>
                    )}

                    {/* ── Document Cards (2D / 3D drag-drop) ── */}
                    {actionType === 'document' && (
                      <DocTypeCards name={name} form={form} itemsWatch={itemsWatch} />
                    )}
                  </Card>
                ))}
              </div>

              <Form.Item style={{ marginTop: 16 }}>
                <Button type="dashed" onClick={() => add(actionType === 'operation' ? { part_type_id: 1, documents: [{ document_type: 'IPID', document_version: 'v1.0' }] } : { document_version: '', document_type: '2D' })} block icon={<PlusOutlined />}>
                  Add Another {actionType === 'operation' ? 'Operation' : 'Document'}
                </Button>
              </Form.Item>
            </>
          )}
        </Form.List>

        <div className="flex flex-col sm:flex-row justify-end gap-2 mt-4">
          <Button onClick={onCancel} className="w-full sm:w-auto">Cancel</Button>
          <Button type="primary" htmlType="submit" loading={loading} className="no-hover-btn w-full sm:w-auto">
            {loading ? 'Creating...' : `Create ${actionLabel}`}
          </Button>
        </div>
      </Form>
    </Modal>
  );
};

export default PartActionModal;