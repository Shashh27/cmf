import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, message, Space, Popconfirm, Tag, Card, Typography, Divider, Tooltip, Select, DatePicker, Row, Col } from 'antd';
import { PlusOutlined, EyeOutlined, DeleteOutlined,EditOutlined,CheckCircleOutlined,ClockCircleOutlined, FilterOutlined, CalendarOutlined } from '@ant-design/icons';
import { API_BASE_URL } from '../Config/auth';

const { Title, Text } = Typography;
const { TextArea } = Input;

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
    try {
      const itemsToCreate = initialItems
        .filter((item) => item.item_text && item.item_type && item.expected_value)
        .map((item) => ({
          item_text: item.item_text,
          item_type: item.item_type,
          expected_value: item.expected_value,
          is_required: !!item.is_required,
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
    setEditModalVisible(true);
  };

  const handleUpdateChecklist = async (values) => {
    try {
      const response = await fetch(`${API_BASE_URL}/pokayoke-checklists/${editingChecklist.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) throw new Error('Failed to update checklist');
      
      message.success('Checklist updated successfully');
      setEditModalVisible(false);
      setEditingChecklist(null);
      editForm.resetFields();
      fetchChecklists();
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
      title: 'SL NO',
      key: 'sl_no',
      width: 80,
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
      render: (text) => <Text strong>{text}</Text>,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      width: 300,
      ellipsis: true,
      className: 'table-header-styled',
    },
    {
      title: 'Items',
      dataIndex: 'itemsCount',
      key: 'itemsCount',
      width: 100,
      align: 'center',
      className: 'table-header-styled',
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
              onClick={() => handlePreview(record)}
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
          <Tooltip title="Add Item">
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
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: '16px' }} justify="space-between" align="middle">
        <Col xs={24} lg={12}>
            <Title level={4} style={{ margin: 0 }}>Manage Checklists</Title>
            <Text type="secondary" style={{ fontSize: '14px' }}>
                Create and manage PokaYoke checklists for your machines
            </Text>
        </Col>
        <Col xs={24} lg={12}>
            <Row justify="end" gutter={[12, 12]} align="middle">
                <Col>
                  <Input.Search
                    placeholder="Search by name..."
                    allowClear
                    onChange={(e) => setSearchText(e.target.value)}
                    style={{ width: 250 }}
                  />
                </Col>
                <Col>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => {
                        setInitialItems([
                          {
                            id: Date.now(),
                            item_text: '',
                            item_type: '',
                            expected_value: '',
                            is_required: false,
                          },
                        ]);
                        setCreateModalVisible(true);
                      }}
                      style={{
                        background: '#1890ff',
                        borderColor: '#1890ff',
                        borderRadius: '6px',
                        height: '40px',
                        fontWeight: '500'
                      }}
                    >
                      Create New Checklist
                    </Button>
                </Col>
            </Row>
        </Col>
    </Row>

      <Table
        columns={columns}
        dataSource={filteredChecklists}
        loading={loading}
        rowKey="id"
        size="small"
        scroll={{ x: 1000 }}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
          pageSizeOptions: ['10', '20', '50', '100'],
          onChange: (page, pageSize) => {
            setPagination({ current: page, pageSize: pageSize });
            console.log('Page changed to:', page, 'Page size:', pageSize);
          },
          onShowSizeChange: (current, size) => {
            setPagination({ current: 1, pageSize: size });
            console.log('Page size changed to:', size);
          },
        }}
        style={{
          background: '#fff',
          borderRadius: '8px',
        }}
      />

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
        width={700}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreateChecklist}
          style={{ marginTop: '20px' }}
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
            rules={[{ required: true, message: 'Please enter description' }]}
          >
            <TextArea 
              placeholder="Enter checklist description" 
              rows={4}
              style={{ borderRadius: '6px' }}
            />
          </Form.Item>

          <Divider />

          <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Title level={5} style={{ margin: 0 }}>Initial Items (Optional)</Title>
          </div>
          <Text type="secondary" style={{ fontSize: '13px', marginBottom: '12px', display: 'block' }}>
            You can add items later or add some initial items now
          </Text>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
            {initialItems.map((item, index) => (
              <Card
                key={item.id}
                size="small"
                style={{ borderRadius: '8px', border: '1px solid #f0f0f0' }}
                bodyStyle={{ padding: '16px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <Text strong style={{ fontSize: '13px' }}>Item {index + 1}</Text>
                  {initialItems.length > 1 && (
                    <Button
                      type="text"
                      icon={<DeleteOutlined style={{ color: '#ff4d4f' }} />}
                      onClick={() => {
                        setInitialItems(prev => prev.filter(x => x.id !== item.id));
                      }}
                    />
                  )}
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <Text strong style={{ fontSize: '13px', display: 'block', marginBottom: '4px' }}>Item Text</Text>
                  <Input
                    placeholder="e.g., Check if safety guards are in place"
                    value={item.item_text}
                    onChange={(e) => {
                      const value = e.target.value;
                      setInitialItems(prev =>
                        prev.map(x => x.id === item.id ? { ...x, item_text: value } : x)
                      );
                    }}
                    style={{ borderRadius: '6px' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.6fr 1.2fr', gap: '12px' }}>
                  <div>
                    <Text strong style={{ fontSize: '13px', display: 'block', marginBottom: '4px' }}>Item Type</Text>
                    <select
                      value={item.item_type}
                      onChange={(e) => {
                        const value = e.target.value;
                        setInitialItems(prev =>
                          prev.map(x => x.id === item.id ? { ...x, item_type: value } : x)
                        );
                      }}
                      style={{
                        width: '100%',
                        height: '40px',
                        borderRadius: '6px',
                        border: '1px solid #d9d9d9',
                        padding: '0 12px'
                      }}
                    >
                      <option value="">Select item type</option>
                      <option value="boolean">Boolean</option>
                      <option value="numerical">Numerical</option>
                      <option value="text">Text</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <Text strong style={{ fontSize: '13px', marginBottom: '4px' }}>Required</Text>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        checked={item.is_required}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setInitialItems(prev =>
                            prev.map(x => x.id === item.id ? { ...x, is_required: checked } : x)
                          );
                        }}
                      />
                      <span>Required</span>
                    </label>
                  </div>
                  <div>
                    <Text strong style={{ fontSize: '13px', display: 'block', marginBottom: '4px' }}>Expected Value</Text>
                    <Input
                      placeholder={
                        item.item_type === 'boolean' ? 'e.g., true, false, yes, no, 1, 0' :
                        item.item_type === 'numerical' ? 'e.g., 50, 18-25, >=50, <=100, =75' :
                        'e.g., Enter text value'
                      }
                      value={item.expected_value}
                      onChange={(e) => {
                        const value = e.target.value;
                        setInitialItems(prev =>
                          prev.map(x => x.id === item.id ? { ...x, expected_value: value } : x)
                        );
                      }}
                      style={{ borderRadius: '6px' }}
                    />
                  </div>
                </div>
              </Card>
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
                },
              ]);
            }}
            style={{ marginBottom: '16px', borderRadius: '6px' }}
          >
            + Add Item
          </Button>
          
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
                style={{
                  background: '#1890ff',
                  borderColor: '#1890ff',
                  borderRadius: '6px'
                }}
              >
                Create Checklist
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Preview Modal */}
      <Modal
        title={selectedChecklist?.name}
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
              background: '#1890ff',
              borderColor: '#1890ff',
              borderRadius: '6px'
            }}
          >
            Add New Item
          </Button>
        ]}
        width={800}
      >
        {selectedChecklist && (
          <div>
            <Card size="small" style={{ marginBottom: '16px', backgroundColor: '#f8f9fa' }}>
              <p><Text strong>Description:</Text> {selectedChecklist.description}</p>
              <p><Text strong>Created:</Text> {formatDate(selectedChecklist.created_at)}</p>
            </Card>
            
            <Title level={5}>Checklist Items</Title>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {selectedChecklist.items?.length > 0 ? (
                <Table
                  dataSource={selectedChecklist.items}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  columns={[
                    {
                      title: 'SL NO',
                      key: 'sl_no',
                      width: 80,
                      align: 'center',
                      className: 'table-header-styled',
                      render: (_, __, index) => index + 1,
                    },
                    {
                      title: 'Item Text',
                      dataIndex: 'item_text',
                      key: 'item_text',
                      className: 'table-header-styled',
                    },
                    {
                      title: 'Type',
                      dataIndex: 'item_type',
                      key: 'item_type',
                      width: 120,
                      className: 'table-header-styled',
                      render: (type) => (
                        <Tag color="blue" style={{ fontSize: '11px' }}>
                          {type}
                        </Tag>
                      ),
                    },
                    {
                      title: 'Expected Value',
                      dataIndex: 'expected_value',
                      key: 'expected_value',
                      width: 150,
                      className: 'table-header-styled',
                      render: (value) => value || '-',
                    },
                    {
                      title: 'Required',
                      dataIndex: 'is_required',
                      key: 'is_required',
                      width: 100,
                      align: 'center',
                      className: 'table-header-styled',
                      render: (required) => (
                        <Tag color={required ? 'red' : 'green'} style={{ fontSize: '11px' }}>
                          {required ? 'Yes' : 'No'}
                        </Tag>
                      ),
                    },
                  ]}
                />
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                  No items added yet
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Add Item Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PlusOutlined style={{ color: '#1890ff' }} />
            Add New Item
          </div>
        }
        open={addItemModalVisible}
        onCancel={() => {
          setAddItemModalVisible(false);
          itemForm.resetFields();
        }}
        footer={null}
        width={500}
      >
        <Form
          form={itemForm}
          layout="vertical"
          onFinish={handleAddItem}
          style={{ marginTop: '20px' }}
        >
          <Form.Item
            name="item_text"
            label="Item Text"
            rules={[{ required: true, message: 'Please enter item text' }]}
          >
            <Input placeholder="Enter item text" style={{ borderRadius: '6px' }} />
          </Form.Item>
          
          <Form.Item
            name="item_type"
            label="Item Type"
            rules={[{ required: true, message: 'Please select item type' }]}
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
              <option value="">Select item type</option>
              <option value="boolean">Boolean</option>
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
                  background: '#1890ff',
                  borderColor: '#1890ff',
                  borderRadius: '6px'
                }}
              >
                Add Item
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
        }}
        footer={null}
        width={600}
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={handleUpdateChecklist}
          style={{ marginTop: '20px' }}
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
            rules={[{ required: true, message: 'Please enter description' }]}
          >
            <TextArea 
              placeholder="Enter checklist description" 
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
                }}
                style={{ borderRadius: '6px' }}
              >
                Cancel
              </Button>
              <Button 
                type="primary" 
                htmlType="submit"
                style={{
                  background: '#faad14',
                  borderColor: '#faad14',
                  borderRadius: '6px'
                }}
              >
                Update Checklist
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default PokaYokeChecklists;
