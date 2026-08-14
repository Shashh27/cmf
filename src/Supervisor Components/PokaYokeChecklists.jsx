import React, { useState, useEffect } from 'react';
import {
  Table, Button, Modal, Form, Input, message, Space, Popconfirm, Tag, Typography, Divider, Tooltip, Card, Select, InputNumber, Row, Col, DatePicker,
} from 'antd';
import {
  PlusOutlined, EyeOutlined, DeleteOutlined, EditOutlined, ReloadOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import {
  PM_T, btnSharp, nativeSelectStyle, pmFetch, fetchAllChecklistsWithItems, fetchChecklistDetails,
  getCurrentUserId, formatDateTime, emptyCheckpoint, buildCheckpointPayload, validateCheckpoint,
  itemTypeShort, FREQ_TAG_COLORS, PM_FIELD_LIMITS, checklistNameRules, descriptionRules,
  checkpointTextRules, expectedValueRules, remarksRules, clampInt, clampText, isDateInRange,
  disableFutureDates, normalizeDateRange,
} from './pmUtils';
import PmDownloadButton from './PmDownloadButton';
import { buildChecklistsReportConfig } from './pmReportDownload';

const { Title, Text } = Typography;

/* ── Inline checkpoint row for create modal (frequency set at assign) ── */
const CreateCheckpointRows = ({ items, onChange, onRemove }) => (
  <>
    <div style={{
      display: 'grid',
      gridTemplateColumns: '30px 1.6fr 80px 100px 1.2fr 30px',
      background: '#fafafa', padding: '8px 6px', borderBottom: '1px solid #d9d9d9',
      fontSize: 11, fontWeight: 600, gap: 6,
    }}>
      <div>#</div><div>Checkpoint</div><div>Type</div><div>Expected</div>
      <div>Remarks / Method</div><div />
    </div>
    {items.map((item, index) => (
      <div key={item.id} style={{
        display: 'grid',
        gridTemplateColumns: '30px 1.6fr 80px 100px 1.2fr 30px',
        padding: 6, gap: 6, alignItems: 'center',
        borderBottom: index < items.length - 1 ? '1px solid #f0f0f0' : 'none',
        background: index % 2 === 0 ? '#fff' : '#fafafa',
      }}>
        <div style={{ fontSize: 11, color: '#8c8c8c' }}>{index + 1}</div>
        <Input size="small" value={item.item_text} placeholder="Checkpoint" maxLength={PM_FIELD_LIMITS.checkpointText}
          onChange={(e) => onChange(item.id, { item_text: clampText(e.target.value, PM_FIELD_LIMITS.checkpointText) })} style={{ fontSize: 11, borderRadius: 0 }} />
        <select value={item.item_type} onChange={(e) => onChange(item.id, { item_type: e.target.value })} style={nativeSelectStyle}>
          <option value="Boolean">Yes/No</option>
          <option value="Numeric">Num</option>
          <option value="Text">Text</option>
        </select>
        <Input size="small" value={item.expected_value} placeholder="Expected" maxLength={PM_FIELD_LIMITS.expectedValue}
          onChange={(e) => onChange(item.id, { expected_value: clampText(e.target.value, PM_FIELD_LIMITS.expectedValue) })} style={{ fontSize: 11, borderRadius: 0 }} />
        <Input size="small" value={item.remarks || ''} placeholder="Remarks / method" maxLength={PM_FIELD_LIMITS.remarks}
          onChange={(e) => onChange(item.id, { remarks: clampText(e.target.value, PM_FIELD_LIMITS.remarks) })} style={{ fontSize: 10, borderRadius: 0 }} />
        <Button type="text" icon={<DeleteOutlined />} danger style={{ padding: 2 }}
          disabled={items.length <= 1}
          onClick={() => onRemove(item.id)} />
      </div>
    ))}
  </>
);

/* ── Expanded row grid (read-only) ── */
const ExpandedCheckpoints = ({ items, compact = false }) => {
  if (!items?.length) {
    return (
      <div style={{ textAlign: 'center', padding: compact ? 12 : 20, color: '#999', fontSize: compact ? 11 : 12 }}>
        No checkpoints added yet
      </div>
    );
  }

  const gridCols = compact
    ? '28px 1fr 58px 68px 1fr'
    : '50px 1fr 80px 100px 1fr';
  const cellFont = compact ? 11 : 12;
  const tagStyle = compact
    ? { fontSize: 10, margin: 0, lineHeight: '16px', padding: '0 4px' }
    : { fontSize: 11 };

  return (
    <div style={{ padding: compact ? 0 : 16, background: compact ? 'transparent' : '#fafafa' }}>
      <div style={{
        border: '1px solid #d9d9d9', borderRadius: 0, overflow: 'hidden', background: '#fff',
        marginTop: compact ? 0 : 8,
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: gridCols,
          background: '#fafafa',
          padding: compact ? '4px 8px' : '8px 12px',
          borderBottom: '1px solid #d9d9d9',
          fontSize: cellFont,
          fontWeight: 600,
          gap: compact ? 6 : 12,
        }}>
          <div>#</div><div>Checkpoint</div><div>Type</div><div>Expected</div><div>Remarks</div>
        </div>
        {items.map((item, index) => (
          <div key={item.id} style={{
            display: 'grid',
            gridTemplateColumns: gridCols,
            padding: compact ? '3px 8px' : '6px 12px',
            gap: compact ? 6 : 12,
            alignItems: 'center',
            minHeight: compact ? 28 : undefined,
            borderBottom: index < items.length - 1 ? '1px solid #f0f0f0' : 'none',
            background: index % 2 === 0 ? '#fff' : '#fafafa',
          }}>
            <div style={{ fontSize: cellFont, color: '#8c8c8c' }}>{index + 1}</div>
            <div style={{
              fontSize: cellFont,
              fontWeight: 600,
              lineHeight: compact ? '16px' : undefined,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {item.item_text}
            </div>
            <Tag color="blue" style={tagStyle}>{itemTypeShort(item.item_type)}</Tag>
            <div style={{ fontSize: cellFont }}>{item.expected_value || '-'}</div>
            <div style={{
              fontSize: cellFont,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {item.remarks || '-'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const PokaYokeChecklists = () => {
  const [checklists, setChecklists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [dateRange, setDateRange] = useState(null);
  const [expandedRowKeys, setExpandedRowKeys] = useState([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [addItemModalVisible, setAddItemModalVisible] = useState(false);

  const [selectedChecklist, setSelectedChecklist] = useState(null);
  const [editingChecklist, setEditingChecklist] = useState(null);
  const [initialItems, setInitialItems] = useState([emptyCheckpoint()]);
  const [editCheckpoints, setEditCheckpoints] = useState([]);
  const [editingCheckpointId, setEditingCheckpointId] = useState(null);

  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const [itemForm] = Form.useForm();

  useEffect(() => { fetchChecklists(); }, []);

  const fetchChecklists = async () => {
    setLoading(true);
    try {
      const data = await fetchAllChecklistsWithItems();
      setChecklists(data.map((c) => ({ ...c, itemsCount: c.items?.length || 0 })));
    } catch (e) {
      message.error('Failed to fetch checklists: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setExpandedRowKeys([]);
    setPagination((p) => ({ ...p, current: 1 }));
    await fetchChecklists();
    message.success('Checklists refreshed');
  };

  const patchCreateItem = (id, patch) => {
    setInitialItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  const patchEditItem = (id, patch) => {
    setEditCheckpoints((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  const handleCreateChecklist = async (values) => {
    const validItems = initialItems.filter((i) => i.item_text && i.item_type);
    if (!validItems.length) return message.error('At least one checkpoint is required');
    for (const cp of validItems) {
      const err = validateCheckpoint(cp);
      if (err) return message.error(err);
    }
    try {
      await pmFetch('/checklists', {
        method: 'POST',
        body: JSON.stringify({
          name: values.name,
          description: values.description || null,
          created_by: getCurrentUserId(),
          items: validItems.map(buildCheckpointPayload),
        }),
      });
      message.success('Checklist created successfully');
      setCreateModalVisible(false);
      form.resetFields();
      setInitialItems([emptyCheckpoint()]);
      fetchChecklists();
    } catch (e) {
      message.error('Failed to create checklist: ' + e.message);
    }
  };

  const handleUpdateChecklist = async (values) => {
    if (!editingChecklist) return;
    try {
      let checklistChanged = false;
      let updatedCount = 0;

      if (values.name !== editingChecklist.name || values.description !== editingChecklist.description) {
        checklistChanged = true;
        await pmFetch(`/checklists/${editingChecklist.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name: values.name, description: values.description }),
        });
      }

      const validCheckpoints = editCheckpoints.filter((i) => i.item_text && i.item_type);
      if (!validCheckpoints.length) return message.error('At least one checkpoint is required');

      for (const item of validCheckpoints) {
        if (String(item.id).startsWith('tmp-')) {
          const err = validateCheckpoint(item);
          if (err) return message.error(err);
          await pmFetch(`/checklists/${editingChecklist.id}/items`, {
            method: 'POST',
            body: JSON.stringify(buildCheckpointPayload(item, validCheckpoints.indexOf(item))),
          });
          updatedCount++;
          continue;
        }
        const original = item._original || {};
        const fieldsChanged =
          item.item_text !== original.item_text ||
          item.item_type !== original.item_type ||
          item.expected_value !== original.expected_value ||
          item.remarks !== original.remarks;

        if (!fieldsChanged) continue;
        const err = validateCheckpoint(item);
        if (err) return message.error(err);

        updatedCount++;
        const payload = {};
        if (item.item_text !== original.item_text) payload.item_text = item.item_text;
        if (item.item_type !== original.item_type) payload.item_type = item.item_type;
        if (item.expected_value !== original.expected_value) payload.expected_value = item.expected_value || null;
        if (item.remarks !== original.remarks) payload.remarks = item.remarks || null;

        await pmFetch(`/checklist-items/${item.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      }

      if (!checklistChanged && updatedCount === 0) {
        message.info('No changes detected');
        return;
      }
      if (checklistChanged && updatedCount > 0) {
        message.success(`Checklist and ${updatedCount} checkpoint(s) updated`);
      } else if (checklistChanged) {
        message.success('Checklist updated successfully');
      } else {
        message.success(`${updatedCount} checkpoint(s) updated successfully`);
      }

      setEditModalVisible(false);
      setEditingChecklist(null);
      editForm.resetFields();
      setEditCheckpoints([]);
      fetchChecklists();
    } catch (e) {
      message.error('Failed to update checklist: ' + e.message);
    }
  };

  const handleEditChecklist = async (record) => {
    try {
      const detail = await fetchChecklistDetails(record.id);
      setEditingChecklist(detail);
      editForm.setFieldsValue({ name: detail.name, description: detail.description });
      setEditCheckpoints(
        (detail.items || []).map((item) => ({ ...item, _original: { ...item } }))
      );
      setEditingCheckpointId(null);
      setEditModalVisible(true);
    } catch (e) {
      message.error(e.message);
    }
  };

  const handlePreview = async (record) => {
    try {
      const detail = await fetchChecklistDetails(record.id);
      setSelectedChecklist(detail);
      setPreviewModalVisible(true);
    } catch (e) {
      message.error(e.message);
    }
  };

  const handleDeleteChecklist = async (id) => {
    try {
      await pmFetch(`/checklists/${id}`, { method: 'DELETE' });
      message.success('Checklist deleted successfully');
      fetchChecklists();
    } catch (e) {
      message.error('Failed to delete checklist: ' + e.message);
    }
  };

  const handleDeleteCheckpoint = async (checklistId, itemId) => {
    try {
      await pmFetch(`/checklist-items/${itemId}`, { method: 'DELETE' });
      message.success('Checkpoint deleted successfully');
      const detail = await fetchChecklistDetails(checklistId);
      if (editingChecklist?.id === checklistId) {
        setEditCheckpoints((detail.items || []).map((item) => ({ ...item, _original: { ...item } })));
        setEditingChecklist(detail);
      }
      if (selectedChecklist?.id === checklistId) setSelectedChecklist(detail);
      fetchChecklists();
    } catch (e) {
      message.error('Failed to delete checkpoint: ' + e.message);
    }
  };

  const handleAddItem = async (values) => {
    if (!selectedChecklist) return;
    const cp = { ...emptyCheckpoint(), ...values };
    const err = validateCheckpoint(cp);
    if (err) return message.error(err);
    try {
      await pmFetch(`/checklists/${selectedChecklist.id}/items`, {
        method: 'POST',
        body: JSON.stringify(buildCheckpointPayload(cp, selectedChecklist.items?.length || 0)),
      });
      message.success('Checkpoint added successfully');
      setAddItemModalVisible(false);
      itemForm.resetFields();
      const detail = await fetchChecklistDetails(selectedChecklist.id);
      setSelectedChecklist(detail);
      fetchChecklists();
    } catch (e) {
      message.error('Failed to add checkpoint: ' + e.message);
    }
  };

  const filteredChecklists = checklists.filter((item) =>
    item.name.toLowerCase().includes(searchText.toLowerCase()) ||
    (item.description || '').toLowerCase().includes(searchText.toLowerCase())
  );

  const dateFilteredChecklists = filteredChecklists.filter((item) =>
    isDateInRange(item.created_at, normalizeDateRange(dateRange))
  );

  const columns = [
    { title: 'SL NO', key: 'sl', width: 55, align: 'center', className: 'table-header-styled',
      render: (_, __, i) => (pagination.current - 1) * pagination.pageSize + i + 1 },
    { title: 'CHECKLIST NAME', dataIndex: 'name', key: 'name', width: 220, className: 'table-header-styled',
      sorter: (a, b) => a.name.localeCompare(b.name),
      ellipsis: true,
      render: (t) => <Text strong style={{ fontSize: 12 }}>{t}</Text> },
    { title: 'Description', dataIndex: 'description', key: 'description', width: 160, className: 'table-header-styled',
      ellipsis: true,
      sorter: (a, b) => (a.description || '').localeCompare(b.description || ''),
      render: (t) => <Text type="secondary" style={{ fontSize: 12 }}>{t?.trim() ? t : '—'}</Text> },
    { title: 'Checkpoints', dataIndex: 'itemsCount', key: 'itemsCount', width: 90, align: 'center', className: 'table-header-styled',
      sorter: (a, b) => a.itemsCount - b.itemsCount,
      render: (c) => <Tag color="blue" style={{ fontSize: 11, borderRadius: 0, margin: 0 }}>{c}</Tag> },
    { title: 'Created At', dataIndex: 'created_at', key: 'created_at', width: 150, className: 'table-header-styled',
      sorter: (a, b) => new Date(a.created_at) - new Date(b.created_at),
      render: (d) => <Text type="secondary" style={{ fontSize: 11 }}>{formatDateTime(d)}</Text> },
    { title: 'Actions', key: 'actions', width: 140, align: 'center', className: 'table-header-styled',
      render: (_, record) => (
        <Space size="small" onClick={(e) => e.stopPropagation()}>
          <Tooltip title="Preview"><Button type="text" size="small" icon={<EyeOutlined />} onClick={() => handlePreview(record)} style={{ color: '#1890ff' }} /></Tooltip>
          <Tooltip title="Edit"><Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEditChecklist(record)} style={{ color: '#faad14' }} /></Tooltip>
          <Tooltip title="Add Checkpoint"><Button type="text" size="small" icon={<PlusOutlined />} onClick={() => { setSelectedChecklist(record); setAddItemModalVisible(true); }} style={{ color: '#52c41a' }} /></Tooltip>
          <Popconfirm title="Delete this checklist?" onConfirm={() => handleDeleteChecklist(record.id)} okText="Yes" cancelText="No">
            <Button type="text" size="small" icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </Space>
      ) },
  ];

  const renderEditCheckpointRow = (item, index) => {
    const isEditing = editingCheckpointId === item.id;
    const gridCols = '30px 1.6fr 70px 90px 1fr 100px';
    if (isEditing) {
      return (
        <div key={item.id} style={{ display: 'grid', gridTemplateColumns: gridCols, padding: 4, gap: 4, alignItems: 'center', borderBottom: '1px solid #f0f0f0', background: '#fff' }}>
          <div style={{ fontSize: 10, color: '#8c8c8c' }}>{index + 1}</div>
          <Input size="small" value={item.item_text} maxLength={PM_FIELD_LIMITS.checkpointText}
            onChange={(e) => patchEditItem(item.id, { item_text: clampText(e.target.value, PM_FIELD_LIMITS.checkpointText) })} style={{ borderRadius: 0 }} />
          <select value={item.item_type} onChange={(e) => patchEditItem(item.id, { item_type: e.target.value })} style={nativeSelectStyle}>
            <option value="Boolean">Yes/No</option><option value="Numeric">Num</option><option value="Text">Text</option>
          </select>
          <Input size="small" value={item.expected_value || ''} maxLength={PM_FIELD_LIMITS.expectedValue}
            onChange={(e) => patchEditItem(item.id, { expected_value: clampText(e.target.value, PM_FIELD_LIMITS.expectedValue) })} style={{ borderRadius: 0 }} />
          <Input size="small" value={item.remarks || ''} maxLength={PM_FIELD_LIMITS.remarks}
            onChange={(e) => patchEditItem(item.id, { remarks: clampText(e.target.value, PM_FIELD_LIMITS.remarks) })} style={{ borderRadius: 0 }} />
          <Space size={4}>
            <Button type="text" icon={<CheckCircleOutlined />} onClick={() => setEditingCheckpointId(null)} style={{ color: '#52c41a', padding: 2 }} />
            {!String(item.id).startsWith('tmp-') && (
              <Popconfirm title="Delete this checkpoint?" okText="Yes" cancelText="No"
                onConfirm={() => handleDeleteCheckpoint(editingChecklist.id, item.id)}>
                <Button type="text" icon={<DeleteOutlined />} danger style={{ padding: 2 }} />
              </Popconfirm>
            )}
          </Space>
        </div>
      );
    }
    return (
      <div key={item.id} style={{ display: 'grid', gridTemplateColumns: gridCols, padding: 4, gap: 4, alignItems: 'center', borderBottom: '1px solid #f0f0f0', background: index % 2 === 0 ? '#fff' : '#fafafa' }}>
        <div style={{ fontSize: 10, color: '#8c8c8c' }}>{index + 1}</div>
        <div style={{ fontSize: 10, fontWeight: 600 }}>{item.item_text}</div>
        <Tag style={{ fontSize: 9, borderRadius: 0 }}>{itemTypeShort(item.item_type)}</Tag>
        <div style={{ fontSize: 10 }}>{item.expected_value || '-'}</div>
        <div style={{ fontSize: 10 }}>{item.remarks || '-'}</div>
        <Space size={4}>
          <Button type="text" icon={<EditOutlined />} onClick={() => setEditingCheckpointId(item.id)} style={{ color: '#1890ff', padding: 2 }} />
          <Popconfirm
            title="Delete this checkpoint?"
            okText="Yes"
            cancelText="No"
            onConfirm={() => {
              if (editCheckpoints.length <= 1) message.warning('At least one checkpoint is required');
              else if (!String(item.id).startsWith('tmp-')) handleDeleteCheckpoint(editingChecklist.id, item.id);
              else setEditCheckpoints((p) => p.filter((x) => x.id !== item.id));
            }}
          >
            <Button type="text" icon={<DeleteOutlined />} danger style={{ padding: 2 }} />
          </Popconfirm>
        </Space>
      </div>
    );
  };

  return (
    <div style={{ padding: 0, background: PM_T.bg, width: '100%', overflowX: 'auto' }}>
      <Space wrap style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}>
        <Space wrap>
          <Input.Search placeholder="Search by name or description..." allowClear style={{ flex: '1 1 280px', maxWidth: 400, borderRadius: 0 }}
            onChange={(e) => setSearchText(e.target.value)} />
          <DatePicker.RangePicker
            allowClear
            placeholder={['Created from', 'Created to']}
            value={dateRange}
            disabledDate={disableFutureDates}
            onChange={(v) => setDateRange(normalizeDateRange(v))}
            style={{ width: 260, borderRadius: 0 }}
          />
        </Space>
        <Space>
          <PmDownloadButton
            getReportConfig={() => buildChecklistsReportConfig(dateFilteredChecklists, [
              ...(searchText.trim() ? [`Search: ${searchText.trim()}`] : []),
              ...(dateRange?.[0] && dateRange?.[1]
                ? [`Date range: ${dateRange[0].format('DD MMM YYYY')} – ${dateRange[1].format('DD MMM YYYY')}`]
                : []),
            ])}
            disabled={!dateFilteredChecklists.length}
          />
          <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={loading} style={btnSharp}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} style={{ ...btnSharp, background: PM_T.primary, borderColor: PM_T.primary, fontWeight: 600 }}
            onClick={() => { setInitialItems([emptyCheckpoint()]); setCreateModalVisible(true); }}>
            New Checklist
          </Button>
        </Space>
      </Space>

      <Table
        columns={columns}
        dataSource={dateFilteredChecklists}
        loading={loading}
        rowKey="id"
        size="small"
        scroll={{ x: 'max-content' }}
        bordered
        tableLayout="fixed"
        pagination={{
          current: pagination.current, pageSize: pagination.pageSize,
          showSizeChanger: true, showQuickJumper: true,
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
          pageSizeOptions: ['10', '20', '50', '100'],
          onChange: (page, pageSize) => setPagination({ current: page, pageSize }),
        }}
        onRow={(record) => ({
          onClick: () => {
            const key = record.id;
            setExpandedRowKeys((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
          },
          style: { cursor: 'pointer' },
        })}
        expandable={{
          showExpandColumn: false,
          expandedRowKeys,
          onExpand: (expanded, record) => {
            setExpandedRowKeys(expanded
              ? [...expandedRowKeys, record.id]
              : expandedRowKeys.filter((k) => k !== record.id));
          },
          expandedRowRender: (record) => <ExpandedCheckpoints items={record.items} />,
          rowExpandable: () => true,
        }}
        style={{ background: PM_T.surface }}
      />

      {/* Create Modal */}
      <Modal title={<><PlusOutlined style={{ color: '#1890ff' }} /> Create New Checklist</>} open={createModalVisible}
        onCancel={() => { setCreateModalVisible(false); form.resetFields(); setInitialItems([emptyCheckpoint()]); }}
        footer={null} width={1000}>
        <Form form={form} layout="vertical" onFinish={handleCreateChecklist} style={{ marginTop: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <Form.Item name="name" label="Checklist Name" rules={checklistNameRules} style={{ marginBottom: 0 }}>
              <Input placeholder="Enter checklist name" maxLength={PM_FIELD_LIMITS.checklistName} style={{ borderRadius: 0 }} />
            </Form.Item>
            <Form.Item name="description" label="Description" rules={descriptionRules} style={{ marginBottom: 0 }}>
              <Input placeholder="Enter description (optional)" maxLength={PM_FIELD_LIMITS.description} style={{ borderRadius: 0 }} />
            </Form.Item>
          </div>
          <Divider />
          <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
            <Title level={5} style={{ margin: 0 }}>Check Points <Text type="danger" style={{ fontSize: 12 }}>*</Text></Title>
            <Text type="secondary" style={{ fontSize: 12 }}>Total: {initialItems.length}</Text>
          </div>
          <div style={{ border: '1px solid #d9d9d9', marginBottom: 12 }}>
            <CreateCheckpointRows items={initialItems} onChange={patchCreateItem}
              onRemove={(id) => {
                if (initialItems.length > 1) setInitialItems((p) => p.filter((x) => x.id !== id));
                else message.warning('At least one checkpoint is required');
              }} />
          </div>
          <Button type="dashed" block icon={<PlusOutlined />} style={{ ...btnSharp, marginBottom: 16 }}
            onClick={() => setInitialItems((p) => [...p, emptyCheckpoint(p.length + 1)])}>Add Checkpoint</Button>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setCreateModalVisible(false)} style={btnSharp}>Cancel</Button>
              <Button type="primary" htmlType="submit" style={{ ...btnSharp, background: PM_T.primary, borderColor: PM_T.primary, fontWeight: 600 }}>Save Checklist</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Preview Modal */}
      <Modal title={<><EyeOutlined style={{ color: '#1890ff' }} /> Preview Checklist</>} open={previewModalVisible}
        onCancel={() => setPreviewModalVisible(false)} width={1200}
        footer={[
          <Button key="close" onClick={() => setPreviewModalVisible(false)} style={btnSharp}>Close</Button>,
         
        ]}>
        {selectedChecklist && (
          <div>
            <Card size="small" style={{ backgroundColor: '#f8f9fa', borderRadius: 0, marginBottom: 16 }}>
              <Row gutter={[24, 12]}>
                <Col xs={24} md={8}>
                  <Text strong style={{ fontSize: 12, display: 'block', color: '#6B7280' }}>Checklist Name</Text>
                  <Text style={{ fontSize: 13 }}>{selectedChecklist.name}</Text>
                </Col>
                <Col xs={24} md={10}>
                  <Text strong style={{ fontSize: 12, display: 'block', color: '#6B7280' }}>Description</Text>
                  <Text style={{ fontSize: 13 }}>{selectedChecklist.description || '-'}</Text>
                </Col>
                <Col xs={24} md={6}>
                  <Text strong style={{ fontSize: 12, display: 'block', color: '#6B7280' }}>Created</Text>
                  <Text style={{ fontSize: 13 }}>{formatDateTime(selectedChecklist.created_at)}</Text>
                </Col>
              </Row>
            </Card>
            <Text strong style={{ fontSize: 13 }}>Checkpoints ({selectedChecklist.items?.length || 0})</Text>
            <div style={{ marginTop: 8, maxHeight: 480, overflowY: 'auto' }}>
              <ExpandedCheckpoints items={selectedChecklist.items} compact />
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Modal — checklist + checkpoints */}
      <Modal title={<><EditOutlined style={{ color: '#faad14' }} /> Edit Checklist</>} open={editModalVisible}
        onCancel={() => { setEditModalVisible(false); setEditingChecklist(null); editForm.resetFields(); setEditCheckpoints([]); }}
        footer={null} width={1100}>
        <Form form={editForm} layout="vertical" onFinish={handleUpdateChecklist}>
          <Card size="small" style={{ backgroundColor: '#f8f9fa', borderRadius: 0, marginBottom: 16 }}>
            <Row gutter={[16, 0]}>
              <Col xs={24} md={10}>
                <Form.Item name="name" label="Checklist Name" rules={checklistNameRules} style={{ marginBottom: 0 }}>
                  <Input maxLength={PM_FIELD_LIMITS.checklistName} style={{ borderRadius: 0 }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={14}>
                <Form.Item name="description" label="Description" rules={descriptionRules} style={{ marginBottom: 0 }}>
                  <Input maxLength={PM_FIELD_LIMITS.description} style={{ borderRadius: 0 }} />
                </Form.Item>
              </Col>
            </Row>
          </Card>
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text strong style={{ fontSize: 13 }}>Checkpoints ({editCheckpoints.length})</Text>
          </div>
          <div style={{ border: '1px solid #d9d9d9', maxHeight: 420, overflowY: 'auto', marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '30px 1.6fr 70px 90px 1fr 100px', background: '#fafafa', padding: '6px 4px', borderBottom: '1px solid #d9d9d9', fontSize: 10, fontWeight: 600, gap: 4, position: 'sticky', top: 0, zIndex: 1 }}>
              <div>#</div><div>Checkpoint</div><div>Type</div><div>Expected</div><div>Remarks</div><div>Actions</div>
            </div>
            {editCheckpoints.map((item, i) => renderEditCheckpointRow(item, i))}
          </div>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setEditModalVisible(false)} style={btnSharp}>Cancel</Button>
              <Button type="primary" htmlType="submit" style={{ ...btnSharp, background: '#F59E0B', borderColor: '#F59E0B', fontWeight: 600 }}>Update Checklist</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Add Checkpoint Modal */}
      <Modal title={<><PlusOutlined style={{ color: '#1890ff' }} /> Add New Checkpoint</>} open={addItemModalVisible}
        onCancel={() => { setAddItemModalVisible(false); itemForm.resetFields(); }} footer={null} width={640}>
        {selectedChecklist && (
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
            Adding to: <Text style={{ fontSize: 12 }}>{selectedChecklist.name}</Text>
          </Text>
        )}
        <Form form={itemForm} layout="vertical" onFinish={handleAddItem}
          initialValues={{ item_type: 'Boolean' }}>
          <Form.Item name="item_text" label="Checkpoint" rules={checkpointTextRules}>
            <Input maxLength={PM_FIELD_LIMITS.checkpointText} style={{ borderRadius: 0 }} />
          </Form.Item>
          <Form.Item name="item_type" label="Type" rules={[{ required: true }]}>
            <Select style={{ borderRadius: 0 }} options={[
              { value: 'Boolean', label: 'Yes/No' },
              { value: 'Numeric', label: 'Numerical' },
              { value: 'Text', label: 'Text' },
            ]} />
          </Form.Item>
          <Form.Item name="expected_value" label="Expected Value" rules={expectedValueRules}>
            <Input maxLength={PM_FIELD_LIMITS.expectedValue} style={{ borderRadius: 0 }} />
          </Form.Item>
          <Form.Item name="remarks" label="Remarks / Method" rules={remarksRules}>
            <Input maxLength={PM_FIELD_LIMITS.remarks} style={{ borderRadius: 0 }} />
          </Form.Item>
          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 12 }}>
            Frequency is set when assigning this checkpoint to a machine.
          </Text>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setAddItemModalVisible(false)} style={btnSharp}>Cancel</Button>
              <Button type="primary" htmlType="submit" style={{ ...btnSharp, background: PM_T.primary, borderColor: PM_T.primary }}>Add Checkpoint</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default PokaYokeChecklists;
