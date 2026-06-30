import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, message, Space, Popconfirm, Tag, Card, Typography, Divider, Tooltip, Select, DatePicker, Row, Col } from 'antd';
import { PlusOutlined, EyeOutlined, DeleteOutlined,EditOutlined,CheckCircleOutlined,ClockCircleOutlined, FilterOutlined, CalendarOutlined, ReloadOutlined } from '@ant-design/icons';
import { API_BASE_URL } from '../../Config/auth';

const { Title, Text } = Typography;
const { TextArea } = Input;

/* ─── Design tokens (matching Machine Assignments) ────────────────────────── */
const T = {
  bg:         '#FDFBF7',
  surface:    '#FFFFFF',
  sidebar:    '#F5F5F5',
  border:     '#D1D5DB',
  borderMid:  '#E5E5E5',
  primary:    '#4A6CF7',
  primaryBg:  '#EEF2FF',
  success:    '#22C55E',
  successBg:  '#DCFCE7',
  warning:    '#F59E0B',
  warningBg:  '#FEF3C7',
  weekend:    '#F9FAFB',
  text:       '#111827',
  textMid:    '#374151',
  textSub:    '#6B7280',
  textMuted:  '#9CA3AF',
  radius:     '12px',
  radiusSm:   '8px',
  shadow:     '0 1px 4px rgba(0,0,0,0.07), 0 4px 16px rgba(0,0,0,0.05)',
};

const PokaYokeChecklists = () => {
  const [checklists, setChecklists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [selectedChecklist, setSelectedChecklist] = useState(null);
  const [addItemModalVisible, setAddItemModalVisible] = useState(false);
  const [initialItems, setInitialItems] = useState([]);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingChecklist, setEditingChecklist] = useState(null);
  const [editCheckpoints, setEditCheckpoints] = useState([]);
  const [editingCheckpointId, setEditingCheckpointId] = useState(null);
  const [expandedRowKeys, setExpandedRowKeys] = useState([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [searchText, setSearchText] = useState('');
  const [form] = Form.useForm();
  const [itemForm] = Form.useForm();
  const [editForm] = Form.useForm();

  useEffect(() => {
    fetchChecklists();
  }, []);

  const fetchChecklists = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/pokayoke-checklists/all`);
      if (!response.ok) throw new Error('Failed to fetch checklists');
      const data = await response.json();
      
      // Data now includes nested items info
      const checklistsWithCounts = data.map((checklist) => ({
        ...checklist,
        itemsCount: checklist.items?.length || 0
      }));
      
      setChecklists(checklistsWithCounts);
    } catch (error) {
      message.error('Failed to fetch checklists: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateChecklist = async (values) => {
    // Validate that at least one item is provided
    const validItems = initialItems
      .filter((item) => item.item_text && item.item_type && item.expected_value);

    if (validItems.length === 0) {
      message.error('At least one check point is required to create a checklist');
      return;
    }

    try {
      const itemsToCreate = validItems.map((item) => ({
        item_text: item.item_text,
        item_type: item.item_type,
        expected_value: item.expected_value,
        is_required: !!item.is_required,
        frequency_type: item.frequency_type || null,
        interval_value: item.interval_value || null,
        interval_unit: item.interval_unit || null,
        trigger_hours: item.trigger_hours || null,
        inspection_interval: item.inspection_interval || null,
        remarks: item.remarks || null,
      }));

      const response = await fetch(`${API_BASE_URL}/pokayoke-checklists/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: values.name,
          description: values.description,
          items: itemsToCreate
        }),
      });

      if (!response.ok) throw new Error('Failed to create checklist');
      
      message.success('Checklist created successfully');
      setCreateModalVisible(false);
      form.resetFields();
      setInitialItems([]);
      fetchChecklists();
    } catch (error) {
      message.error('Failed to create checklist: ' + error.message);
    }
  };

  const handleDeleteChecklist = async (id) => {
    try {
      const response = await fetch(`${API_BASE_URL}/pokayoke-checklists/${id}/`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete checklist');
      
      message.success('Checklist deleted successfully');
      fetchChecklists();
    } catch (error) {
      message.error('Failed to delete checklist: ' + error.message);
    }
  };

  const handleDeleteCheckpoint = async (checklistId, itemId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/pokayoke-checklists/${checklistId}/items/${itemId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete checkpoint');
      
      message.success('Checkpoint deleted successfully');
      fetchChecklists();
    } catch (error) {
      message.error('Failed to delete checkpoint: ' + error.message);
    }
  };

  const handlePreview = (checklist) => {
    setSelectedChecklist(checklist);
    setPreviewModalVisible(true);
  };

  const handleAddItem = async (values) => {
    if (!selectedChecklist) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/pokayoke-checklists/${selectedChecklist.id}/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) throw new Error('Failed to add item');
      
      message.success('Item added successfully');
      setAddItemModalVisible(false);
      itemForm.resetFields();
      
      // Fetch updated checklist to refresh preview
      try {
        const checklistResponse = await fetch(`${API_BASE_URL}/pokayoke-checklists/${selectedChecklist.id}`);
        if (checklistResponse.ok) {
          const updatedChecklist = await checklistResponse.json();
          setSelectedChecklist(updatedChecklist);
        }
      } catch (e) {
        console.error('Failed to refresh preview:', e);
      }
      
      fetchChecklists();
    } catch (error) {
      message.error('Failed to add item: ' + error.message);
    }
  };

  const handleEditChecklist = (checklist) => {
    setEditingChecklist(checklist);
    editForm.setFieldsValue({
      name: checklist.name,
      description: checklist.description
    });
    // Load checkpoints with proper IDs and store original data for comparison
    const checkpointsWithOriginals = checklist.items?.map(item => ({
      ...item,
      id: item.id || Date.now() + Math.random(),
      _original: { ...item } // Store original data for change detection
    })) || [];
    setEditCheckpoints(checkpointsWithOriginals);
    setEditModalVisible(true);
  };

  const handleUpdateChecklist = async (values) => {
    try {
      let checklistChanged = false;
      let checkpointsChanged = false;
      let updatedCount = 0;

      // Check if checklist details changed
      if (values.name !== editingChecklist.name || values.description !== editingChecklist.description) {
        checklistChanged = true;
        const response = await fetch(`${API_BASE_URL}/pokayoke-checklists/${editingChecklist.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(values),
        });

        if (!response.ok) throw new Error('Failed to update checklist');
      }

      // Update checkpoints that have changed
      const validCheckpoints = editCheckpoints
        .filter((item) => item.item_text && item.item_type && item.expected_value);

      if (validCheckpoints.length === 0) {
        message.error('At least one checkpoint is required');
        return;
      }

      // Update each checkpoint individually, only if changed
      for (const item of validCheckpoints) {
        const original = item._original || {};
        
        // Check if any field changed
        const fieldsChanged = 
          item.item_text !== original.item_text ||
          item.item_type !== original.item_type ||
          item.expected_value !== original.expected_value ||
          item.is_required !== original.is_required ||
          item.frequency_type !== original.frequency_type ||
          item.interval_unit !== original.interval_unit ||
          item.interval_value !== original.interval_value ||
          item.trigger_hours !== original.trigger_hours ||
          item.remarks !== original.remarks;

        if (!fieldsChanged) continue; // Skip if nothing changed

        checkpointsChanged = true;
        updatedCount++;

        // Build checkpoint data with only changed fields
        const checkpointData = {};
        if (item.item_text !== original.item_text) checkpointData.item_text = item.item_text;
        if (item.item_type !== original.item_type) checkpointData.item_type = item.item_type;
        if (item.expected_value !== original.expected_value) checkpointData.expected_value = item.expected_value;
        if (item.is_required !== original.is_required) checkpointData.is_required = !!item.is_required;
        if (item.frequency_type !== original.frequency_type) checkpointData.frequency_type = item.frequency_type || null;
        if (item.interval_unit !== original.interval_unit) checkpointData.interval_unit = item.interval_unit || null;
        if (item.interval_value !== original.interval_value) checkpointData.interval_value = item.interval_value || null;
        if (item.trigger_hours !== original.trigger_hours) checkpointData.trigger_hours = item.trigger_hours || null;
        if (item.remarks !== original.remarks) checkpointData.remarks = item.remarks || null;

        const itemResponse = await fetch(`${API_BASE_URL}/pokayoke-checklists/items/${item.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(checkpointData),
        });

        if (!itemResponse.ok) {
          throw new Error(`Failed to update checkpoint: ${item.item_text}`);
        }
      }

      // Show appropriate message based on what changed
      if (!checklistChanged && !checkpointsChanged) {
        message.info('No changes detected - nothing to update');
        return;
      }

      if (checklistChanged && checkpointsChanged) {
        message.success(`Checklist and ${updatedCount} checkpoint(s) updated successfully`);
      } else if (checklistChanged) {
        message.success('Checklist updated successfully');
      } else if (checkpointsChanged) {
        message.success(`${updatedCount} checkpoint(s) updated successfully`);
      }

      setEditModalVisible(false);
      setEditingChecklist(null);
      editForm.resetFields();
      setEditCheckpoints([]);
      
      // Update the checklist in place to preserve order
      setChecklists(prevChecklists => 
        prevChecklists.map(checklist => 
          checklist.id === editingChecklist.id 
            ? { ...checklist, ...values, items: editCheckpoints.map(cp => ({ ...cp, _original: undefined })) }
            : checklist
        )
      );
      
      // If the updated checklist is currently in preview, refresh it too
      if (selectedChecklist && selectedChecklist.id === editingChecklist.id) {
        setSelectedChecklist(prev => ({
          ...prev,
          ...values,
          items: editCheckpoints.map(cp => ({ ...cp, _original: undefined }))
        }));
      }
    } catch (error) {
      message.error('Failed to update checklist: ' + error.message);
    }
  };

  const validateExpectedValue = (itemType, expectedValue) => {
    if (!expectedValue) return false;
    
    if (itemType === 'boolean') {
      const validValues = ['true', 'false', 'yes', 'no', '1', '0'];
      return validValues.includes(expectedValue.toLowerCase());
    } else if (itemType === 'numerical') {
      // Check if it's a single number
      if (/^\d+(\.\d+)?$/.test(expectedValue)) return true;
      // Check if it's a range (e.g., 18-25)
      if (/^\d+(\.\d+)?-\d+(\.\d+)?$/.test(expectedValue)) return true;
      // Check if it's a comparison (e.g., >=50, <=100, =75)
      if (/^[><=]+\d+(\.\d+)?$/.test(expectedValue)) return true;
      return false;
    } else if (itemType === 'text') {
      return expectedValue.trim().length > 0;
    }
    return false;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const columns = [
    {
      title: '#',
      key: 'sl_no',
      width: 50,
      align: 'center',
      className: 'table-header-styled',
      render: (_, __, index) => index + 1,
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      className: 'table-header-styled',
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (text) => <Text strong>{text}</Text>,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      width: 300,
      ellipsis: true,
      className: 'table-header-styled',
      sorter: (a, b) => a.description.localeCompare(b.description),
    },
    {
      title: 'Checkpoints',
      dataIndex: 'itemsCount',
      key: 'itemsCount',
      width: 100,
      align: 'center',
      className: 'table-header-styled',
      sorter: (a, b) => a.itemsCount - b.itemsCount,
      render: (count) => (
        <Tag color="blue" style={{ fontSize: '12px', padding: '2px 8px' }}>
          {count}
        </Tag>
      ),
    },
    {
      title: 'Created At',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      className: 'table-header-styled',
      sorter: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      render: (date) => <Text type="secondary">{formatDate(date)}</Text>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      align: 'center',
      className: 'table-header-styled',
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="Preview">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => {
                setSelectedChecklist(record);
                setPreviewModalVisible(true);
              }}
              style={{ color: '#1890ff' }}
            />
          </Tooltip>
          <Tooltip title="Edit">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEditChecklist(record)}
              style={{ color: '#faad14' }}
            />
          </Tooltip>
          <Tooltip title="Add Checkpoint">
            <Button
              type="text"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => {
                setSelectedChecklist(record);
                setAddItemModalVisible(true);
              }}
              style={{ color: '#52c41a' }}
            />
          </Tooltip>
          <Tooltip title="Delete">
            <Popconfirm
              title="Are you sure you want to delete this checklist?"
              onConfirm={() => handleDeleteChecklist(record.id)}
              okText="Yes"
              cancelText="No"
            >
              <Button
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                danger
              />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ];

  const filteredChecklists = checklists.filter(item => 
    item.name.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <div style={{ padding: 0, fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif", background: T.bg }}>
      {/* ── Top bar ── */}
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius,
        padding: '10px 14px', marginBottom: 10, boxShadow: T.shadow,
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <Text strong style={{ fontSize: 13, color: T.textMid, whiteSpace: 'nowrap' }}>Checklists:</Text>
        <div style={{ flex: '1 1 280px', minWidth: 220 }}>
          <Input.Search
            placeholder="Search by name..."
            allowClear
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Button
            icon={<ReloadOutlined />}
            onClick={fetchChecklists}
            loading={loading}
            style={{ borderRadius: 8 }}
          >Refresh</Button>
          <Button
            type="primary" icon={<PlusOutlined />}
            onClick={() => {
              setInitialItems([
                {
                  id: Date.now(),
                  item_text: '',
                  item_type: '',
                  expected_value: '',
                  is_required: false,
                  frequency_type: 'Time Based',
                  interval_value: null,
                  interval_unit: '',
                  trigger_hours: null,
                  inspection_interval: '',
                  remarks: ''
                },
              ]);
              setCreateModalVisible(true);
            }}
            style={{ background: T.primary, borderColor: T.primary, borderRadius: 8, fontWeight: 600 }}
          >New Checklist</Button>
        </div>
      </div>

      {/* ── Main content card ── */}
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: T.radius, boxShadow: T.shadow, overflow: 'hidden',
        minHeight: 'calc(100vh - 320px)',
      }}>
        <Table
        columns={columns}
        dataSource={filteredChecklists}
        loading={loading}
        rowKey="id"
        size="small"
        scroll={{ x: 1000 }}
        bordered
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
          pageSizeOptions: ['10', '20', '50', '100'],
          onChange: (page, pageSize) => {
            setPagination({ current: page, pageSize: pageSize });
          },
          onShowSizeChange: (current, size) => {
            setPagination({ current: 1, pageSize: size });
          },
        }}
        onRow={(record) => ({
          onClick: () => {
            const key = record.id;
            setExpandedRowKeys(prev => 
              prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
            );
          },
        })}
        expandable={{
          expandedRowKeys,
          onExpand: (expanded, record) => {
            const key = record.id;
            setExpandedRowKeys(expanded ? [...expandedRowKeys, key] : expandedRowKeys.filter(k => k !== key));
          },
          expandedRowRender: (record) => (
            <div style={{ padding: '16px', background: '#fafafa' }}>
              <div style={{ marginBottom: '12px' }}>
                <Text strong style={{ fontSize: '13px' }}>Checkpoints ({record.items?.length || 0})</Text>
              </div>
              {record.items?.length > 0 ? (
                <div style={{ 
                  border: '1px solid #d9d9d9', 
                  borderRadius: '6px', 
                  overflow: 'hidden',
                  background: '#fff'
                }}>
                  {/* Table Header */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '50px 350px 80px 60px 100px 100px 80px 80px 1fr',
                    background: '#fafafa',
                    padding: '8px 12px',
                    borderBottom: '1px solid #d9d9d9',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#262626',
                    gap: '12px'
                  }}>
                    <div>#</div>
                    <div>Checkpoint</div>
                    <div>Type</div>
                    <div>Required</div>
                    <div>Expected</div>
                    <div>Frequency</div>
                    <div>Unit</div>
                    <div>Value</div>
                    <div>Remarks</div>
                  </div>
                  {/* Table Rows */}
                  {record.items.map((item, index) => (
                    <div key={item.id} style={{
                      display: 'grid',
                      gridTemplateColumns: '50px 350px 80px 60px 100px 100px 80px 80px 1fr',
                      padding: '6px 12px',
                      borderBottom: index < record.items.length - 1 ? '1px solid #f0f0f0' : 'none',
                      gap: '12px',
                      alignItems: 'center',
                      background: index % 2 === 0 ? '#fff' : '#fafafa'
                    }}>
                      <div style={{ fontSize: '12px', fontWeight: 500, color: '#8c8c8c' }}>
                        {index + 1}
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 600 }}>{item.item_text}</div>
                      <Tag color="blue" style={{ fontSize: '11px', padding: '2px 8px' }}>
                        {item.item_type === 'boolean' ? 'Yes/No' : item.item_type === 'numerical' ? 'Num' : item.item_type}
                      </Tag>
                      <div style={{ textAlign: 'center' }}>
                        {item.is_required ? <Tag color="red" style={{ fontSize: '11px' }}>Yes</Tag> : <Tag color="green" style={{ fontSize: '11px' }}>No</Tag>}
                      </div>
                      <div style={{ fontSize: '12px' }}>{item.expected_value || '-'}</div>
                      <Tag color={item.frequency_type === 'Time Based' ? 'blue' : item.frequency_type === 'Usage Based' ? 'orange' : 'purple'} style={{ fontSize: '11px' }}>
                        {item.frequency_type || '-'}
                      </Tag>
                      <div style={{ fontSize: '12px' }}>{item.interval_unit || '-'}</div>
                      <div style={{ fontSize: '12px' }}>{item.interval_value || item.trigger_hours || '-'}</div>
                      <div style={{ fontSize: '12px' }}>{item.remarks || '-'}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
                  No checkpoints added yet
                </div>
              )}
            </div>
          ),
          rowExpandable: (record) => true,
        }}
        style={{
          background: T.surface,
        }}
      />
      </div>

      {/* Create Checklist Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PlusOutlined style={{ color: '#1890ff' }} />
            Create New Checklist
          </div>
        }
        open={createModalVisible}
        onCancel={() => {
          setCreateModalVisible(false);
          form.resetFields();
          setInitialItems([]);
        }}
        footer={null}
        width={1000}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreateChecklist}
          style={{ marginTop: '20px' }}
        >
          {/* Checklist Name and Description in same row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <Form.Item
              name="name"
              label="Checklist Name"
              rules={[{ required: true, message: 'Please enter checklist name' }]}
              style={{ marginBottom: 0 }}
            >
              <Input placeholder="Enter checklist name" style={{ borderRadius: '6px' }} />
            </Form.Item>
            
            <Form.Item
              name="description"
              label="Description"
              style={{ marginBottom: 0 }}
            >
              <Input 
                placeholder="Enter checklist description (optional)" 
                style={{ borderRadius: '6px' }}
              />
            </Form.Item>
          </div>

          <Divider />

          <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Title level={5} style={{ margin: 0 }}>Check Points <Text type="danger" style={{ fontSize: '12px' }}>*</Text></Title>
            <Text type="secondary" style={{ fontSize: '12px' }}>Total: {initialItems.length}</Text>
          </div>

          {/* Compact Table Layout */}
          <div style={{ 
            border: '1px solid #d9d9d9', 
            borderRadius: '6px', 
            overflow: 'hidden',
            marginBottom: '12px'
          }}>
            {/* Table Header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '30px 250px 70px 45px 75px 95px 80px 80px 1fr 30px',
              background: '#fafafa',
              padding: '8px 6px',
              borderBottom: '1px solid #d9d9d9',
              fontSize: '11px',
              fontWeight: 600,
              color: '#262626',
              gap: '6px'
            }}>
              <div>#</div>
              <div>Checkpoint</div>
              <div>Type</div>
              <div>Req</div>
              <div>Expected</div>
              <div>Frequency</div>
              <div>Unit</div>
              <div>Value</div>
              <div>Remarks</div>
              <div></div>
            </div>

            {/* Table Rows */}
            {initialItems.map((item, index) => (
              <div key={item.id} style={{
                display: 'grid',
                gridTemplateColumns: '30px 250px 70px 45px 75px 95px 80px 80px 1fr 30px',
                padding: '6px',
                borderBottom: index < initialItems.length - 1 ? '1px solid #f0f0f0' : 'none',
                gap: '6px',
                alignItems: 'center',
                background: index % 2 === 0 ? '#fff' : '#fafafa'
              }}>
                {/* Sequence Number */}
                <div style={{ fontSize: '11px', fontWeight: 500, color: '#8c8c8c' }}>
                  {index + 1}
                </div>

                {/* Checkpoint */}
                <Input
                  placeholder="Checkpoint"
                  value={item.item_text}
                  onChange={(e) => {
                    setInitialItems(prev =>
                      prev.map(x => x.id === item.id ? { ...x, item_text: e.target.value } : x)
                    );
                  }}
                  style={{ fontSize: '11px', height: '28px' }}
                />

                {/* Type */}
                <select
                  value={item.item_type}
                  onChange={(e) => {
                    setInitialItems(prev =>
                      prev.map(x => x.id === item.id ? { ...x, item_type: e.target.value } : x)
                    );
                  }}
                  style={{
                    width: '100%',
                    height: '28px',
                    borderRadius: '4px',
                    border: '1px solid #d9d9d9',
                    padding: '0 4px',
                    fontSize: '10px'
                  }}
                >
                  <option value="">Select</option>
                  <option value="boolean">Yes/No</option>
                  <option value="numerical">Num</option>
                  <option value="text">Text</option>
                </select>

                {/* Required */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <input
                    type="checkbox"
                    checked={item.is_required}
                    onChange={(e) => {
                      setInitialItems(prev =>
                        prev.map(x => x.id === item.id ? { ...x, is_required: e.target.checked } : x)
                      );
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                </div>

                {/* Expected Value */}
                <Input
                  placeholder="Expected"
                  value={item.expected_value}
                  onChange={(e) => {
                    setInitialItems(prev =>
                      prev.map(x => x.id === item.id ? { ...x, expected_value: e.target.value } : x)
                    );
                  }}
                  style={{ fontSize: '11px', height: '28px' }}
                />

                {/* Frequency Type */}
                <select
                  value={item.frequency_type || ''}
                  onChange={(e) => {
                    setInitialItems(prev =>
                      prev.map(x => x.id === item.id ? { ...x, frequency_type: e.target.value } : x)
                    );
                  }}
                  style={{
                    width: '100%',
                    height: '28px',
                    borderRadius: '4px',
                    border: '1px solid #d9d9d9',
                    padding: '0 4px',
                    fontSize: '10px'
                  }}
                >
                  <option value="">None</option>
                  <option value="Time Based">Time</option>
                  <option value="Usage Based">Usage</option>
                  <option value="Condition Based">Condition</option>
                </select>

                {/* Unit Column */}
                {(item.frequency_type === 'Time Based' || item.frequency_type === 'Condition Based') ? (
                  <select
                    value={item.interval_unit || ''}
                    onChange={(e) => {
                      setInitialItems(prev =>
                        prev.map(x => x.id === item.id ? { ...x, interval_unit: e.target.value } : x)
                      );
                    }}
                    style={{
                      width: '100%',
                      height: '28px',
                      borderRadius: '4px',
                      border: '1px solid #d9d9d9',
                      padding: '0 2px',
                      fontSize: '10px'
                    }}
                  >
                    <option value="">Unit</option>
                    <option value="Day">Day</option>
                    <option value="Week">Week</option>
                    <option value="Month">Month</option>
                    <option value="Year">Year</option>
                  </select>
                ) : (
                  <div></div>
                )}

                {/* Value Column */}
                {item.frequency_type === 'Time Based' ? (
                  <Input
                    type="number"
                    placeholder="Value"
                    value={item.interval_value || ''}
                    onChange={(e) => {
                      setInitialItems(prev =>
                        prev.map(x => x.id === item.id ? { ...x, interval_value: e.target.value ? parseInt(e.target.value) : null } : x)
                      );
                    }}
                    style={{ fontSize: '10px', height: '28px' }}
                  />
                ) : item.frequency_type === 'Usage Based' ? (
                  <Input
                    type="number"
                    placeholder="Hours"
                    value={item.trigger_hours || ''}
                    onChange={(e) => {
                      setInitialItems(prev =>
                        prev.map(x => x.id === item.id ? { ...x, trigger_hours: e.target.value ? parseInt(e.target.value) : null } : x)
                      );
                    }}
                    style={{ fontSize: '10px', height: '28px' }}
                  />
                ) : item.frequency_type === 'Condition Based' ? (
                  <Input
                    type="number"
                    placeholder="Value"
                    value={item.interval_value || ''}
                    onChange={(e) => {
                      setInitialItems(prev =>
                        prev.map(x => x.id === item.id ? { ...x, interval_value: e.target.value ? parseInt(e.target.value) : null } : x)
                      );
                    }}
                    style={{ fontSize: '10px', height: '28px' }}
                  />
                ) : (
                  <div></div>
                )}

                {/* Remarks Column */}
                <Input
                  placeholder="Remarks"
                  value={item.remarks || ''}
                  onChange={(e) => {
                    setInitialItems(prev =>
                      prev.map(x => x.id === item.id ? { ...x, remarks: e.target.value } : x)
                    );
                  }}
                  style={{ fontSize: '10px', height: '28px' }}
                />

                {/* Delete Button */}
                <Button
                  type="text"
                  icon={<DeleteOutlined />}
                  onClick={() => {
                    if (initialItems.length > 1) {
                      setInitialItems(prev => prev.filter(x => x.id !== item.id));
                    } else {
                      message.warning('At least one check point is required');
                    }
                  }}
                  style={{ color: '#ff4d4f', padding: '2px', fontSize: '12px' }}
                />
              </div>
            ))}
          </div>

          <Button
            type="dashed"
            block
            onClick={() => {
              setInitialItems(prev => [
                ...prev,
                {
                  id: Date.now() + Math.random(),
                  item_text: '',
                  item_type: '',
                  expected_value: '',
                  is_required: false,
                  frequency_type: 'Time Based',
                  interval_value: null,
                  interval_unit: '',
                  trigger_hours: null,
                  inspection_interval: '',
                  remarks: ''
                }
              ]);
            }}
            icon={<PlusOutlined />}
            style={{ marginBottom: '16px', borderRadius: '6px' }}
          >
            Add Checkpoint
          </Button>

          <Text type="secondary" style={{ fontSize: '11px', display: 'block', marginBottom: '16px' }}>
            Note: Select frequency type to configure scheduling details inline for each checkpoint.
          </Text>
          
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button 
                onClick={() => {
                  setCreateModalVisible(false);
                  form.resetFields();
                }}
                style={{ borderRadius: '6px' }}
              >
                Cancel
              </Button>
              <Button 
                type="primary" 
                htmlType="submit"
                style={{ background: T.primary, borderColor: T.primary, borderRadius: '6px', fontWeight: 600 }}
              >
                Save Checklist
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Preview Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <EyeOutlined style={{ color: '#1890ff' }} />
            Preview Checklist
          </div>
        }
        open={previewModalVisible}
        onCancel={() => setPreviewModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setPreviewModalVisible(false)}>
            Close
          </Button>,
          <Button
            key="addItem"
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setPreviewModalVisible(false);
              setAddItemModalVisible(true);
            }}
            style={{
              background: T.primary,
              borderColor: T.primary,
              borderRadius: '8px',
              fontWeight: 600
            }}
          >
            Add New Checkpoint
          </Button>
        ]}
        width={1200}
      >
        {selectedChecklist && (
          <div style={{ display: 'flex', gap: '20px' }}>
            {/* Left side - Checklist details */}
            <div style={{ flex: '0 0 300px' }}>
              <Card size="small" style={{ backgroundColor: '#f8f9fa' }}>
                <div style={{ marginBottom: '12px' }}>
                  <Text strong style={{ fontSize: '13px', display: 'block', marginBottom: '4px' }}>Checklist Name</Text>
                  <Text style={{ fontSize: '12px' }}>{selectedChecklist.name}</Text>
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <Text strong style={{ fontSize: '13px', display: 'block', marginBottom: '4px' }}>Description</Text>
                  <Text style={{ fontSize: '12px' }}>{selectedChecklist.description || '-'}</Text>
                </div>
                <div>
                  <Text strong style={{ fontSize: '13px', display: 'block', marginBottom: '4px' }}>Created</Text>
                  <Text style={{ fontSize: '12px' }}>{formatDate(selectedChecklist.created_at)}</Text>
                </div>
              </Card>
            </div>

            {/* Right side - Checkpoints */}
            <div style={{ flex: '1' }}>
              <div style={{ marginBottom: '12px' }}>
                <Text strong style={{ fontSize: '13px' }}>Checkpoints ({selectedChecklist.items?.length || 0})</Text>
              </div>
              <div style={{ 
                border: '1px solid #d9d9d9', 
                borderRadius: '6px', 
                overflow: 'hidden',
                background: '#fff',
                maxHeight: '500px',
                overflowY: 'auto'
              }}>
                {/* Table Header */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '30px 200px 60px 40px 70px 85px 70px 70px 1fr',
                  background: '#fafafa',
                  padding: '6px 4px',
                  borderBottom: '1px solid #d9d9d9',
                  fontSize: '10px',
                  fontWeight: 600,
                  color: '#262626',
                  gap: '4px',
                  position: 'sticky',
                  top: 0,
                  zIndex: 1
                }}>
                  <div>#</div>
                  <div>Checkpoint</div>
                  <div>Type</div>
                  <div>Req</div>
                  <div>Expected</div>
                  <div>Frequency</div>
                  <div>Unit</div>
                  <div>Value</div>
                  <div>Remarks</div>
                </div>
                {/* Table Rows */}
                {selectedChecklist.items?.length > 0 ? (
                  selectedChecklist.items.map((item, index) => (
                    <div key={item.id} style={{
                      display: 'grid',
                      gridTemplateColumns: '30px 200px 60px 40px 70px 85px 70px 70px 1fr',
                      padding: '4px',
                      borderBottom: index < selectedChecklist.items.length - 1 ? '1px solid #f0f0f0' : 'none',
                      gap: '4px',
                      alignItems: 'center',
                      background: index % 2 === 0 ? '#fff' : '#fafafa'
                    }}>
                      <div style={{ fontSize: '10px', fontWeight: 500, color: '#8c8c8c' }}>
                        {index + 1}
                      </div>
                      <div style={{ fontSize: '10px', fontWeight: 600 }}>{item.item_text}</div>
                      <Tag color="blue" style={{ fontSize: '9px', padding: '1px 4px' }}>
                        {item.item_type === 'boolean' ? 'Yes/No' : item.item_type === 'numerical' ? 'Num' : item.item_type}
                      </Tag>
                      <div style={{ textAlign: 'center' }}>
                        {item.is_required ? <Tag color="red" style={{ fontSize: '9px', padding: '1px 4px' }}>Yes</Tag> : <Tag color="green" style={{ fontSize: '9px', padding: '1px 4px' }}>No</Tag>}
                      </div>
                      <div style={{ fontSize: '10px' }}>{item.expected_value || '-'}</div>
                      <Tag color={item.frequency_type === 'Time Based' ? 'blue' : item.frequency_type === 'Usage Based' ? 'orange' : 'purple'} style={{ fontSize: '9px', padding: '1px 4px' }}>
                        {item.frequency_type || '-'}
                      </Tag>
                      <div style={{ fontSize: '10px' }}>{item.interval_unit || '-'}</div>
                      <div style={{ fontSize: '10px' }}>{item.interval_value || item.trigger_hours || '-'}</div>
                      <div style={{ fontSize: '10px' }}>{item.remarks || '-'}</div>
                    </div>
                  ))
                ) : (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                    No checkpoints added yet
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Checkpoint Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PlusOutlined style={{ color: '#1890ff' }} />
            Add New Checkpoint
          </div>
        }
        open={addItemModalVisible}
        onCancel={() => {
          setAddItemModalVisible(false);
          itemForm.resetFields();
        }}
        footer={null}
        width={600}
      >
        <Form
          form={itemForm}
          layout="vertical"
          onFinish={handleAddItem}
          style={{ marginTop: '20px' }}
        >
          <Form.Item
            name="item_text"
            label="Checkpoint"
            rules={[{ required: true, message: 'Please enter checkpoint' }]}
          >
            <Input placeholder="Enter checkpoint" style={{ borderRadius: '6px' }} />
          </Form.Item>
          
          <Form.Item
            name="item_type"
            label="Type"
            rules={[{ required: true, message: 'Please select type' }]}
          >
            <select 
              style={{ 
                width: '100%', 
                height: '40px', 
                borderRadius: '6px',
                border: '1px solid #d9d9d9',
                padding: '0 12px'
              }}
            >
              <option value="">Select type</option>
              <option value="boolean">Yes/No</option>
              <option value="numerical">Numerical</option>
              <option value="text">Text</option>
            </select>
          </Form.Item>
          
          <Form.Item
            name="expected_value"
            label="Expected Value"
            rules={[
              { required: true, message: 'Please enter expected value' },
              {
                validator: (_, value) => {
                  const itemType = itemForm.getFieldValue('item_type');
                  if (!itemType || !value) return Promise.resolve();
                  
                  if (validateExpectedValue(itemType, value)) {
                    return Promise.resolve();
                  }
                  
                  let errorMsg = '';
                  if (itemType === 'boolean') {
                    errorMsg = 'Expected value must be: true, false, yes, no, 1, or 0';
                  } else if (itemType === 'numerical') {
                    errorMsg = 'Expected value must be: a number, range (e.g., 18-25), or comparison (e.g., >=50, <=100, =75)';
                  } else if (itemType === 'text') {
                    errorMsg = 'Expected value must be a non-empty text';
                  }
                  
                  return Promise.reject(new Error(errorMsg));
                }
              }
            ]}
            dependencies={['item_type']}
          >
            <Input 
              placeholder={
                itemForm.getFieldValue('item_type') === 'boolean' ? 'e.g., true, false, yes, no, 1, 0' :
                itemForm.getFieldValue('item_type') === 'numerical' ? 'e.g., 50, 18-25, >=50, <=100, =75' :
                'e.g., Enter text value'
              } 
              style={{ borderRadius: '6px' }} 
            />
          </Form.Item>
          
          <Form.Item
            name="is_required"
            valuePropName="checked"
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="checkbox" />
              <span>Required</span>
            </label>
          </Form.Item>

          <Form.Item
            name="frequency_type"
            label="Frequency Type"
            initialValue="Time Based"
          >
            <select 
              style={{ 
                width: '100%', 
                height: '40px', 
                borderRadius: '6px',
                border: '1px solid #d9d9d9',
                padding: '0 12px'
              }}
            >
              <option value="">None</option>
              <option value="Time Based">Time Based</option>
              <option value="Usage Based">Usage Based</option>
              <option value="Condition Based">Condition Based</option>
            </select>
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.frequency_type !== curr.frequency_type}>
            {({ getFieldValue }) => {
              const frequencyType = getFieldValue('frequency_type');
              if (frequencyType === 'Time Based' || frequencyType === 'Condition Based') {
                return (
                  <>
                    <Form.Item
                      name="interval_unit"
                      label="Unit"
                    >
                      <select 
                        style={{ 
                          width: '100%', 
                          height: '40px', 
                          borderRadius: '6px',
                          border: '1px solid #d9d9d9',
                          padding: '0 12px'
                        }}
                      >
                        <option value="">Select unit</option>
                        <option value="Day">Day</option>
                        <option value="Week">Week</option>
                        <option value="Month">Month</option>
                        <option value="Year">Year</option>
                      </select>
                    </Form.Item>
                    <Form.Item
                      name="interval_value"
                      label="Value"
                    >
                      <Input type="number" placeholder="Enter value" style={{ borderRadius: '6px' }} />
                    </Form.Item>
                  </>
                );
              }
              if (frequencyType === 'Usage Based') {
                return (
                  <Form.Item
                    name="trigger_hours"
                    label="Trigger Hours"
                  >
                    <Input type="number" placeholder="Enter hours" style={{ borderRadius: '6px' }} />
                  </Form.Item>
                );
              }
              return null;
            }}
          </Form.Item>

          <Form.Item
            name="remarks"
            label="Remarks"
          >
            <Input placeholder="Enter remarks" style={{ borderRadius: '6px' }} />
          </Form.Item>
          
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button 
                onClick={() => {
                  setAddItemModalVisible(false);
                  itemForm.resetFields();
                }}
                style={{ borderRadius: '6px' }}
              >
                Cancel
              </Button>
              <Button 
                type="primary" 
                htmlType="submit"
                style={{
                  background: T.primary,
                  borderColor: T.primary,
                  borderRadius: '8px',
                  fontWeight: 600
                }}
              >
                Add Checkpoint
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit Checklist Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <EditOutlined style={{ color: '#faad14' }} />
            Edit Checklist
          </div>
        }
        open={editModalVisible}
        onCancel={() => {
          setEditModalVisible(false);
          setEditingChecklist(null);
          editForm.resetFields();
          setEditCheckpoints([]);
        }}
        footer={null}
        width={1200}
      >
        <div style={{ display: 'flex', gap: '20px' }}>
          {/* Left side - Checklist details */}
          <div style={{ flex: '0 0 300px' }}>
            <Form
              form={editForm}
              layout="vertical"
              onFinish={handleUpdateChecklist}
            >
              <Form.Item
                name="name"
                label="Checklist Name"
                rules={[{ required: true, message: 'Please enter checklist name' }]}
              >
                <Input placeholder="Enter checklist name" style={{ borderRadius: '6px' }} />
              </Form.Item>
              
              <Form.Item
                name="description"
                label="Description"
              >
                <TextArea 
                  placeholder="Enter checklist description (optional)" 
                  rows={4}
                  style={{ borderRadius: '6px' }}
                />
              </Form.Item>
              
              <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                <Space>
                  <Button 
                    onClick={() => {
                      setEditModalVisible(false);
                      setEditingChecklist(null);
                      editForm.resetFields();
                      setEditCheckpoints([]);
                    }}
                    style={{ borderRadius: '6px' }}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="primary" 
                    htmlType="submit"
                    style={{
                      background: '#F59E0B',
                      borderColor: '#F59E0B',
                      borderRadius: '8px',
                      fontWeight: 600
                    }}
                  >
                    Update Checklist
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </div>

          {/* Right side - Checkpoints */}
          <div style={{ flex: '1' }}>
            <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text strong style={{ fontSize: '13px' }}>Checkpoints ({editCheckpoints.length})</Text>
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditCheckpoints(prev => [
                    ...prev,
                    {
                      id: Date.now(),
                      item_text: '',
                      item_type: '',
                      expected_value: '',
                      is_required: false,
                      frequency_type: 'Time Based',
                      interval_value: null,
                      interval_unit: '',
                      trigger_hours: null,
                      inspection_interval: '',
                      remarks: ''
                    }
                  ]);
                }}
                style={{ borderRadius: '6px' }}
              >
                Add Checkpoint
              </Button>
            </div>

            <div style={{ 
              border: '1px solid #d9d9d9', 
              borderRadius: '6px', 
              overflow: 'hidden',
              background: '#fff',
              maxHeight: '500px',
              overflowY: 'auto'
            }}>
              {/* Table Header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '30px 200px 60px 40px 70px 85px 70px 70px 1fr 80px',
                background: '#fafafa',
                padding: '6px 4px',
                borderBottom: '1px solid #d9d9d9',
                fontSize: '10px',
                fontWeight: 600,
                color: '#262626',
                gap: '4px',
                position: 'sticky',
                top: 0,
                zIndex: 1
              }}>
                <div>#</div>
                <div>Checkpoint</div>
                <div>Type</div>
                <div>Req</div>
                <div>Expected</div>
                <div>Frequency</div>
                <div>Unit</div>
                <div>Value</div>
                <div>Remarks</div>
                <div>Actions</div>
              </div>
              {/* Table Rows */}
              {editCheckpoints.map((item, index) => (
                <div key={item.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '30px 200px 60px 40px 70px 85px 70px 70px 1fr 100px',
                  padding: '4px',
                  borderBottom: index < editCheckpoints.length - 1 ? '1px solid #f0f0f0' : 'none',
                  gap: '4px',
                  alignItems: 'center',
                  background: index % 2 === 0 ? '#fff' : '#fafafa'
                }}>
                  <div style={{ fontSize: '10px', fontWeight: 500, color: '#8c8c8c' }}>
                    {index + 1}
                  </div>
                  {editingCheckpointId === item.id ? (
                    <>
                      <Input
                        placeholder="Checkpoint"
                        value={item.item_text}
                        onChange={(e) => {
                          setEditCheckpoints(prev =>
                            prev.map(x => x.id === item.id ? { ...x, item_text: e.target.value } : x)
                          );
                        }}
                        style={{ fontSize: '10px', height: '24px' }}
                      />
                      <select
                        value={item.item_type}
                        onChange={(e) => {
                          setEditCheckpoints(prev =>
                            prev.map(x => x.id === item.id ? { ...x, item_type: e.target.value } : x)
                          );
                        }}
                        style={{
                          width: '100%',
                          height: '24px',
                          borderRadius: '4px',
                          border: '1px solid #d9d9d9',
                          padding: '0 2px',
                          fontSize: '9px'
                        }}
                      >
                        <option value="">Select</option>
                        <option value="boolean">Yes/No</option>
                        <option value="numerical">Num</option>
                        <option value="text">Text</option>
                      </select>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <input
                          type="checkbox"
                          checked={item.is_required}
                          onChange={(e) => {
                            setEditCheckpoints(prev =>
                              prev.map(x => x.id === item.id ? { ...x, is_required: e.target.checked } : x)
                            );
                          }}
                          style={{ cursor: 'pointer' }}
                        />
                      </div>
                      <Input
                        placeholder="Expected"
                        value={item.expected_value}
                        onChange={(e) => {
                          setEditCheckpoints(prev =>
                            prev.map(x => x.id === item.id ? { ...x, expected_value: e.target.value } : x)
                          );
                        }}
                        style={{ fontSize: '10px', height: '24px' }}
                      />
                      <select
                        value={item.frequency_type || ''}
                        onChange={(e) => {
                          setEditCheckpoints(prev =>
                            prev.map(x => x.id === item.id ? { ...x, frequency_type: e.target.value } : x)
                          );
                        }}
                        style={{
                          width: '100%',
                          height: '24px',
                          borderRadius: '4px',
                          border: '1px solid #d9d9d9',
                          padding: '0 2px',
                          fontSize: '9px'
                        }}
                      >
                        <option value="">None</option>
                        <option value="Time Based">Time</option>
                        <option value="Usage Based">Usage</option>
                        <option value="Condition Based">Condition</option>
                      </select>
                      {(item.frequency_type === 'Time Based' || item.frequency_type === 'Condition Based') ? (
                        <select
                          value={item.interval_unit || ''}
                          onChange={(e) => {
                            setEditCheckpoints(prev =>
                              prev.map(x => x.id === item.id ? { ...x, interval_unit: e.target.value } : x)
                            );
                          }}
                          style={{
                            width: '100%',
                            height: '24px',
                            borderRadius: '4px',
                            border: '1px solid #d9d9d9',
                            padding: '0 2px',
                            fontSize: '9px'
                          }}
                        >
                          <option value="">Unit</option>
                          <option value="Day">Day</option>
                          <option value="Week">Week</option>
                          <option value="Month">Month</option>
                          <option value="Year">Year</option>
                        </select>
                      ) : (
                        <div></div>
                      )}
                      {item.frequency_type === 'Time Based' || item.frequency_type === 'Condition Based' ? (
                        <Input
                          type="number"
                          placeholder="Value"
                          value={item.interval_value || ''}
                          onChange={(e) => {
                            setEditCheckpoints(prev =>
                              prev.map(x => x.id === item.id ? { ...x, interval_value: e.target.value ? parseInt(e.target.value) : null } : x)
                            );
                          }}
                          style={{ fontSize: '10px', height: '24px' }}
                        />
                      ) : item.frequency_type === 'Usage Based' ? (
                        <Input
                          type="number"
                          placeholder="Hours"
                          value={item.trigger_hours || ''}
                          onChange={(e) => {
                            setEditCheckpoints(prev =>
                              prev.map(x => x.id === item.id ? { ...x, trigger_hours: e.target.value ? parseInt(e.target.value) : null } : x)
                            );
                          }}
                          style={{ fontSize: '10px', height: '24px' }}
                        />
                      ) : (
                        <div></div>
                      )}
                      <Input
                        placeholder="Remarks"
                        value={item.remarks || ''}
                        onChange={(e) => {
                          setEditCheckpoints(prev =>
                            prev.map(x => x.id === item.id ? { ...x, remarks: e.target.value } : x)
                          );
                        }}
                        style={{ fontSize: '10px', height: '24px' }}
                      />
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <Button
                          type="text"
                          icon={<CheckCircleOutlined />}
                          onClick={() => setEditingCheckpointId(null)}
                          style={{ color: '#52c41a', padding: '2px', fontSize: '11px' }}
                        />
                        <Button
                          type="text"
                          icon={<DeleteOutlined />}
                          onClick={() => {
                            if (editCheckpoints.length > 1) {
                              setEditCheckpoints(prev => prev.filter(x => x.id !== item.id));
                            } else {
                              message.warning('At least one checkpoint is required');
                            }
                          }}
                          style={{ color: '#ff4d4f', padding: '2px', fontSize: '11px' }}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: '10px', fontWeight: 600 }}>{item.item_text}</div>
                      <Tag color="blue" style={{ fontSize: '9px', padding: '1px 4px' }}>{item.item_type}</Tag>
                      <div style={{ textAlign: 'center' }}>
                        {item.is_required ? <Tag color="red" style={{ fontSize: '9px' }}>Yes</Tag> : <Tag color="green" style={{ fontSize: '9px' }}>No</Tag>}
                      </div>
                      <div style={{ fontSize: '10px' }}>{item.expected_value || '-'}</div>
                      <Tag color={item.frequency_type === 'Time Based' ? 'blue' : item.frequency_type === 'Usage Based' ? 'orange' : 'purple'} style={{ fontSize: '9px' }}>
                        {item.frequency_type || '-'}
                      </Tag>
                      <div style={{ fontSize: '10px' }}>{item.interval_unit || '-'}</div>
                      <div style={{ fontSize: '10px' }}>{item.interval_value || item.trigger_hours || '-'}</div>
                      <div style={{ fontSize: '10px' }}>{item.remarks || '-'}</div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <Button
                          type="text"
                          icon={<EditOutlined />}
                          onClick={() => setEditingCheckpointId(item.id)}
                          style={{ color: '#1890ff', padding: '2px', fontSize: '11px' }}
                        />
                        <Button
                          type="text"
                          icon={<DeleteOutlined />}
                          onClick={() => {
                            if (editCheckpoints.length > 1) {
                              setEditCheckpoints(prev => prev.filter(x => x.id !== item.id));
                            } else {
                              message.warning('At least one checkpoint is required');
                            }
                          }}
                          style={{ color: '#ff4d4f', padding: '2px', fontSize: '11px' }}
                        />
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PokaYokeChecklists;
