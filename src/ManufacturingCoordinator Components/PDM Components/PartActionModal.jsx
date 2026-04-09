import React, { useState, useEffect } from 'react';
import { PlusOutlined, DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import axios from "axios";
import { API_BASE_URL } from '../../Config/auth';
import { Modal, Form, Input, Select, Button, message, Upload, Card, Badge, TimePicker, Row, Col, DatePicker } from 'antd';
import dayjs from 'dayjs';
import { fetchInto, timePickerRules } from './operationUtils';

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

const PartActionModal = ({ open, onCancel, actionType, selectedPart, onActionCreated, initialOperations = [], existingOperations = [] }) => {
  const [form] = Form.useForm();
  const [loading, setLoading]           = useState(false);
  const [workCenters, setWorkCenters]   = useState([]);
  const [allMachines, setAllMachines]   = useState([]);
  const [toolsList, setToolsList]       = useState([]);
  const [partTypes, setPartTypes]       = useState([]);
  const [partTypesLoading, setPartTypesLoading]     = useState(false);
  const [workCentersLoading, setWorkCentersLoading] = useState(false);
  const [machinesLoading, setMachinesLoading]       = useState(false);
  const [toolsLoading, setToolsLoading]             = useState(false);

  const itemsWatch = Form.useWatch('items', form);
  
  // Calculate next operation number based on existing operations
  const calculateNextOpNumber = (index) => {
    if (actionType === 'operation' && existingOperations?.length > 0) {
      // Extract existing operation numbers and find the max
      const existingNumbers = existingOperations
        .map(op => {
          const num = parseInt(String(op.operation_number).trim());
          return isNaN(num) ? 0 : num;
        })
        .filter(num => num > 0);
      
      const maxNumber = Math.max(...existingNumbers, 0);
      return maxNumber + (index + 1) * 10;
    }
    // Default for new parts without existing operations
    return (index + 1) * 10;
  };

  // ── fetch helpers ──────────────────────────────────────────────────────────
  const fetchWorkCenters = () => fetchInto(`${API_BASE_URL}/workcenters/`, setWorkCenters, setWorkCentersLoading, workCenters.length > 0);
  const fetchPartTypes   = () => fetchInto(`${API_BASE_URL}/part-types/`,  setPartTypes,   setPartTypesLoading,   partTypes.length > 0);
  const fetchMachines    = () => fetchInto(`${API_BASE_URL}/machines/`,     setAllMachines, setMachinesLoading,    allMachines.length > 0);
  const fetchTools       = () => fetchInto(`${API_BASE_URL}/tools-list/`,   setToolsList,   setToolsLoading,       toolsList.length > 0);

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

  const partTypeOptions = partTypes.length
    ? partTypes.map(pt => ({ label: pt.type_name, value: pt.id }))
    : [{ label: 'IN-House', value: 1 }, { label: 'Out-Source', value: 2 }];

  // ── effects ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (actionType === 'operation') {
      // Use initialOperations for pre-filling (imported operations), but existingOperations for sequencing
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
      form.setFieldsValue({ items: [{ document_version: 'v1.0', document_type: '2D' }] });
    }
  }, [open, actionType, initialOperations]);

  // Auto-clear invalid to_date when from_date changes
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

  // ── submit ─────────────────────────────────────────────────────────────────
  const handleFinish = async (values) => {
    setLoading(true);
    const items = values.items || [];

    // Validate custom "Other" types
    const hasBlankCustom = (check) => items.some(check);
    if (actionType === 'operation' && hasBlankCustom(item => item.documents?.some(d => d.document_type === 'Other' && !d.document_type_other?.trim()))) {
      message.error("Please enter custom document type for all 'Other' documents"); setLoading(false); return;
    }
    if (actionType === 'document' && hasBlankCustom(item => item.document_type === 'Other' && !item.document_type_other?.trim())) {
      message.error("Please enter custom document type for all 'Other' documents"); setLoading(false); return;
    }

    const results = [];
    const now = dayjs();
    const ts  = (d) => d ? dayjs(d).hour(now.hour()).minute(now.minute()).second(now.second()).toISOString() : null;
    const resolveType = (type, other) => (type === 'Other' && other?.trim()) ? other.trim() : type;
    let bulkDocFormData = null;

    // Bulk create operations + reduce tool/doc upload calls
    if (actionType === 'operation') {
      const uid = getCurrentUserId();
      const opPayloads = items.map((item) => {
        const out = item.part_type_id === 2;
        return {
          operation_name: item.operation_name,
          part_type_id: item.part_type_id ?? 1,
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
        const opRes = await axios.post(
          `${API_BASE_URL}/operations/bulk`,
          opPayloads,
          { headers: { 'Content-Type': 'application/json' } }
        );
        const createdOps = Array.isArray(opRes.data) ? opRes.data : [];
        createdOps.forEach((o) => results.push(o));

        // Build ONE tools bulk request (across all operations)
        try {
          const links = [];
          for (let i = 0; i < createdOps.length; i++) {
            const newOp = createdOps[i];
            const item = items[i];
            const toolIds = item?.tool_ids || [];
            for (const tid of toolIds) {
              links.push({ tool_id: tid, part_id: selectedPart.id, operation_id: newOp.id, user_id: uid });
            }
          }
          if (links.length) {
            await axios.post(`${API_BASE_URL}/tools/bulk-links`, links, { headers: { 'Content-Type': 'application/json' } });
          }
        } catch (e) { console.error(e); }

        // Build ONE operation-documents bulk request (across all operations)
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
              fd.append('document_type', resolveType(doc.document_type, doc.document_type_other) || 'Balloon');
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
        message.error('Failed to create operations');
      }
    } else {
      for (const item of items) {
        try {
          if (actionType === 'document') {
          if (!bulkDocFormData) {
            const fd = new FormData();
            fd.append('part_id', selectedPart.id.toString());
            const uid = getCurrentUserId();
            if (uid != null) fd.append('user_id', String(uid));
            bulkDocFormData = fd;
          }

          const file = item.file?.[0]?.originFileObj;
          if (!file) continue;

          bulkDocFormData.append('files', file);
          bulkDocFormData.append('document_name', item.document_name || file.name?.replace(/\.[^/.]+$/, '') || 'Document');
          bulkDocFormData.append('document_type', resolveType(item.document_type, item.document_type_other));
          bulkDocFormData.append('document_version', item.document_version || 'v1.0');
          if (item.parent_id) bulkDocFormData.append('parent_id', String(item.parent_id));
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
        message.error('Failed to upload documents');
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
                        {/* Row 1: Name + Type + Setup/Cycle */}
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
                                    <Form.Item {...restField} name={[name, 'operation_name']} label="Operation Name" rules={[{ required: true, message: 'Operation Name is required' }]} getValueFromEvent={e => e.target.value.replace(/[^a-zA-Z0-9-_ ]/g, '').slice(0, 30)}>
                                      <Input placeholder="Cutting" autoComplete="off" maxLength={30} />
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
                                
                                {/* Out-Source Dates - only show when Out-Source is selected */}
                                {isOutSource && (
                                  <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
                                    <Col xs={24} sm={12} md={12}>
                                      <Form.Item
                                        {...restField}
                                        name={[name, 'from_date']}
                                        label="From Date"
                                        rules={[{ required: true, message: 'Required for Out-Source' }]}
                                      >
                                        <DatePicker format="DD-MM-YYYY" style={{ width: '100%' }} inputReadOnly />
                                      </Form.Item>
                                    </Col>
                                    <Col xs={24} sm={12} md={12}>
                                      <Form.Item
                                        {...restField}
                                        name={[name, 'to_date']}
                                        label="To Date"
                                        rules={[
                                          { required: true, message: 'Required for Out-Source' },
                                          {
                                            validator: (_, value) => {
                                              const fd = getFieldValue(['items', index, 'from_date']);
                                              if (!value) return Promise.resolve();
                                              if (!fd) return Promise.reject(new Error('Select From Date first'));
                                              return dayjs(value).isAfter(dayjs(fd), 'day')
                                                ? Promise.resolve()
                                                : Promise.reject(new Error('To Date must be after From Date'));
                                            }
                                          }
                                        ]}
                                      >
                                        <DatePicker 
                                          format="DD-MM-YYYY" 
                                          style={{ width: '100%' }} 
                                          inputReadOnly 
                                          disabled={!getFieldValue(['items', index, 'from_date'])}
                                          disabledDate={(current) => {
                                            const fd = getFieldValue(['items', index, 'from_date']);
                                            if (!fd) return true;
                                            return current && !current.isAfter(dayjs(fd), 'day');
                                          }}
                                        />
                                      </Form.Item>
                                    </Col>
                                  </Row>
                                )}
                              </>
                            );
                          }}
                        </Form.Item>

                        {/* IN-House: WC, Machine, Tools, Instructions, Notes */}
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
                                    <Form.Item {...restField} name={[name, 'tool_ids']} label="Tools">
                                      <Select mode="multiple" placeholder="Select Tools" loading={toolsLoading} onOpenChange={o => { if (o) fetchTools(); }} optionFilterProp="label" maxTagCount="responsive"
                                        filterOption={(input, option) => {
                                        const label = option?.label ?? option?.children;
                                        const str = (label != null && typeof label === 'string') ? label : String(label ?? '');
                                        const inp = (input != null && typeof input === 'string') ? input : String(input ?? '');
                                        return str.toLowerCase().includes(inp.toLowerCase());
                                      }}>
                                        {toolsList.map(t => {
                                          const searchLabel = `${t.item_description || ''} ${t.identification_code || ''} ${t.range || ''}`.trim();
                                          return <Select.Option key={t.id} value={t.id} label={searchLabel}>{t.item_description} ({t.identification_code}){t.range ? ` - ${t.range}` : ''}</Select.Option>;
                                        })}
                                      </Select>
                                    </Form.Item>
                                  </Col>
                                </Row>
                                <Row gutter={[12, 12]}>
                                  <Col xs={24} sm={12}>
                                    <Form.Item {...restField} name={[name, 'work_instructions']} label="Work Instructions">
                                      <TextArea rows={2} placeholder="Enter instructions..." />
                                    </Form.Item>
                                  </Col>
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
                                              <Form.Item {...dr} name={[dn, 'document_type']} label={<span className="text-xs font-medium text-gray-600">Doc Type</span>} className="mb-0" initialValue="Balloon">
                                                <Select placeholder="Select Type" size="small" className="w-full">
                                                  {['Balloon','Image','CNC','Other'].map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
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
                                <Button type="dashed" onClick={() => addDoc({ document_type: 'Balloon', document_version: 'v1.0' })} block icon={<PlusOutlined />} className="text-blue-500 border-blue-200">
                                  Add Document to Operation
                                </Button>
                              </Form.Item>
                            </div>
                          )}
                        </Form.List>
                      </>
                    )}

                    {actionType === 'document' && (
                      <Row gutter={[16, 12]} align="bottom">
                        <Col xs={24} sm={12} lg={6}>
                          <Form.Item {...restField} name={[name, 'file']} label={<span className="text-xs font-medium text-gray-600">Upload File</span>} valuePropName="fileList" getValueFromEvent={e => Array.isArray(e) ? e : e?.fileList} rules={[{ required: true, message: 'Required' }]} className="mb-0">
                            <Upload maxCount={1} beforeUpload={() => false} className="w-full"
                              onChange={({ fileList }) => {
                                const f = fileList?.[0]?.originFileObj;
                                if (f) { const items = form.getFieldValue('items') || []; const u = [...items]; if (u[name] && !u[name].document_name) { u[name].document_name = f.name?.replace(/\.[^/.]+$/, '') || ''; form.setFieldsValue({ items: u }); } }
                              }}>
                              <Button icon={<UploadOutlined />} className="w-full text-left flex items-center justify-start">Select File</Button>
                            </Upload>
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} lg={6}>
                          <Form.Item {...restField} name={[name, 'document_name']} label={<span className="text-xs font-medium text-gray-600">Document Name</span>} rules={[{ required: true, message: 'Required' }]} className="mb-0">
                            <Input placeholder="Tech Drawing" autoComplete="off" />
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} lg={6}>
                          <Form.Item noStyle shouldUpdate={(p, c) => p.items?.[name]?.document_type !== c.items?.[name]?.document_type}>
                            {({ getFieldValue }) => {
                              const type = getFieldValue(['items', name, 'document_type']);
                              return (
                                <div className="flex flex-col gap-2">
                                  <Form.Item {...restField} name={[name, 'document_type']} label={<span className="text-xs font-medium text-gray-600">Document Type</span>} className="mb-0" rules={[{ required: true, message: 'Required' }]}>
                                    <Select placeholder="Select Type">
                                      {['2D','3D','Other'].map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
                                    </Select>
                                  </Form.Item>
                                  {type === 'Other' && (
                                    <Form.Item {...restField} name={[name, 'document_type_other']} className="mb-0" rules={[{ required: true, message: 'Type Required' }]}>
                                      <Input placeholder="Custom type..." autoComplete="off" />
                                    </Form.Item>
                                  )}
                                </div>
                              );
                            }}
                          </Form.Item>
                        </Col>
                        <Col xs={24} sm={12} lg={6}>
                          <Form.Item {...restField} name={[name, 'document_version']} label={<span className="text-xs font-medium text-gray-600">Version</span>} rules={[{ required: true, message: 'Required' }]} className="mb-0">
                            <Input placeholder="v1.0" disabled className="bg-gray-50" />
                          </Form.Item>
                        </Col>
                      </Row>
                    )}
                  </Card>
                ))}
              </div>

              <Form.Item style={{ marginTop: 16 }}>
                <Button type="dashed" onClick={() => add(actionType === 'operation' ? { part_type_id: 1, documents: [{ document_type: 'Balloon', document_version: 'v1.0' }] } : { document_version: 'v1.0', document_type: '2D' })} block icon={<PlusOutlined />}>
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