import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, Button, message, Tabs, Table, Popconfirm, Tag } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { API_BASE_URL } from '../../../Config/auth';

const { Option } = Select;
const { TabPane } = Tabs;

const CustomColumnModal = ({ visible, onCancel, onSuccess, mode, target }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [existingColumns, setExistingColumns] = useState([]);
  const [activeTab, setActiveTab] = useState('add');
  const [manageColumnsLoading, setManageColumnsLoading] = useState(false);
  const [subCategories, setSubCategories] = useState([]);

  // Reserved system column names
  const reservedColumns = [
    'id', 'item_description', 'range', 'identification_code', 'make',
    'quantity', 'total_quantity', 'location', 'gauge', 'remarks',
    'amount', 'ref_ledger', 'type', 'calibration_date', 'calibration_due_date',
    'calibration_frequency', 'issues_qty', 'category_id', 'sub_category_id',
    'custom_fields'
  ];

  useEffect(() => {
    if (visible) {
      form.resetFields();
      setActiveTab('add');
      fetchExistingColumns();

      // Fetch sub-categories if in category mode
      if (mode === 'category' && target?.category) {
        fetchSubCategories();
      } else {
        setSubCategories([]);
      }
    }
  }, [visible, form, mode, target]);

  const fetchSubCategories = async () => {
    try {
      const treeResponse = await fetch(`${API_BASE_URL}/tools-list/categories/tree`);
      if (treeResponse.ok) {
        const tree = await treeResponse.json();
        const catNode = tree.find(c => c.category === target?.category);
        if (catNode && catNode.sub_categories) {
          setSubCategories(catNode.sub_categories);
        }
      }
    } catch (error) {
      console.error('Failed to fetch sub-categories:', error);
      setSubCategories([]);
    }
  };

  const fetchExistingColumns = async () => {
    setManageColumnsLoading(true);
    try {
      // First, resolve category_id and sub_category_id from names
      let categoryId = null;
      let subCategoryId = null;

      if (target?.category || target?.sub_category) {
        const treeResponse = await fetch(`${API_BASE_URL}/tools-list/categories/tree`);
        if (treeResponse.ok) {
          const tree = await treeResponse.json();

          if (target.sub_category) {
            for (const cat of tree) {
              const subCat = cat.sub_categories.find(sc => sc.sub_category === target.sub_category);
              if (subCat) {
                categoryId = cat.id;
                subCategoryId = subCat.id;
                break;
              }
            }
          } else if (target.category) {
            const cat = tree.find(c => c.category === target.category);
            if (cat) {
              categoryId = cat.id;
            }
          }
        }
      }

      // Fetch all custom columns
      const response = await fetch(`${API_BASE_URL}/tools-list/custom-columns`);
      if (!response.ok) {
        setExistingColumns([]);
        return;
      }

      const responseData = await response.json();
      const allColumns = responseData.data || [];

      // Filter based on mode and resolved IDs
      const filteredColumns = allColumns.filter(col => {
        if (subCategoryId) {
          // For sub-category: show columns for this sub-category OR parent category
          return col.sub_category_id === subCategoryId || col.category_id === categoryId;
        } else if (categoryId) {
          // For category: show columns for this category (only category-level columns)
          return col.category_id === categoryId && col.sub_category_id === null;
        }
        return false;
      });

      setExistingColumns(filteredColumns);
    } catch (error) {
      console.error('Failed to fetch existing columns:', error);
      setExistingColumns([]);
    } finally {
      setManageColumnsLoading(false);
    }
  };

  const handleDelete = async (columnId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/tools-list/custom-columns/${columnId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        message.success('Custom column deleted successfully');
        fetchExistingColumns();
        onSuccess();
      } else {
        message.error('Failed to delete custom column');
      }
    } catch (error) {
      console.error('Failed to delete column:', error);
      message.error('Failed to delete custom column');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const payload = {
        column_name: values.column_name,
        data_type: values.data_type,
        is_required: values.is_required || false,
      };

      // Handle different modes
      if (mode === 'sub_category' && target?.sub_category_id) {
        // Add to specific sub-category
        payload.sub_category_id = target.sub_category_id;

        const response = await fetch(`${API_BASE_URL}/tools-list/custom-columns`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Failed to create custom column');
        }

        message.success('Custom column added successfully');
      } else if (mode === 'category') {
        // Add to category or selected sub-categories
        const selectedSubCategories = values.sub_categories || [];

        if (selectedSubCategories.length === 0) {
          // Add to category level (applies to all sub-categories)
          const catNode = await fetchCategoryId();
          if (catNode) {
            payload.category_id = catNode.id;

            const response = await fetch(`${API_BASE_URL}/tools-list/custom-columns`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });

            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.detail || 'Failed to create custom column');
            }

            message.success('Custom column added to category (all sub-categories)');
          }
        } else {
          // Add to specific sub-categories
          const catNode = await fetchCategoryId();
          if (catNode) {
            let successCount = 0;
            for (const subCat of selectedSubCategories) {
              const subNode = catNode.sub_categories.find(s => s.sub_category === subCat);
              if (subNode) {
                payload.sub_category_id = subNode.id;

                const response = await fetch(`${API_BASE_URL}/tools-list/custom-columns`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload),
                });

                if (response.ok) {
                  successCount++;
                }
              }
            }

            if (successCount > 0) {
              message.success(`Custom column added to ${successCount} sub-category(ies)`);
            } else {
              throw new Error('Failed to add custom column to any sub-category');
            }
          }
        }
      }

      onSuccess();
    } catch (error) {
      if (error.errorFields) {
        return; // Form validation error
      }
      console.error('Failed to create custom column:', error);
      message.error('Failed to create custom column: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategoryId = async () => {
    try {
      const treeResponse = await fetch(`${API_BASE_URL}/tools-list/categories/tree`);
      if (treeResponse.ok) {
        const tree = await treeResponse.json();
        return tree.find(c => c.category === target?.category);
      }
    } catch (error) {
      console.error('Failed to fetch category:', error);
    }
    return null;
  };

  const manageTableColumns = [
    {
      title: 'Column Name',
      dataIndex: 'column_name',
      key: 'column_name',
      render: (text) => <span style={{ fontWeight: 600 }}>{text}</span>,
    },
    {
      title: 'Data Type',
      dataIndex: 'data_type',
      key: 'data_type',
      render: (type) => <Tag color="blue">{type}</Tag>,
    },
    {
      title: 'Required',
      dataIndex: 'is_required',
      key: 'is_required',
      render: (required) => (
        <Tag color={required ? 'green' : 'default'}>
          {required ? 'Yes' : 'No'}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'center',
      render: (_, record) => (
        <Popconfirm
          title="Delete Custom Column"
          description={`Are you sure you want to delete "${record.column_name}"? This action cannot be undone.`}
          onConfirm={() => handleDelete(record.id)}
          okText="Yes"
          cancelText="No"
          okButtonProps={{ danger: true }}
        >
          <Button
            type="text"
            danger
            size="small"
            icon={<DeleteOutlined />}
          >
            Delete
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <Modal
      title={
        mode === 'category'
          ? `Custom Columns for Category "${target?.category}"`
          : `Custom Columns for Sub-Category "${target?.sub_category}"`
      }
      open={visible}
      onCancel={onCancel}
      footer={null}
      width={700}
      destroyOnClose
    >
      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <TabPane tab="Add Column" key="add">
          <Form form={form} layout="vertical">
            <Form.Item
              name="column_name"
              label="Column Name"
              rules={[
                { required: true, message: 'Please enter column name' },
                { max: 100, message: 'Column name cannot exceed 100 characters' },
                {
                  validator: (_, value) => {
                    if (!value || !value.trim()) {
                      return Promise.resolve();
                    }
                    const valueLower = value.toLowerCase().trim();

                    // Check against reserved system columns
                    if (reservedColumns.includes(valueLower)) {
                      return Promise.reject(
                        new Error(`'${value}' is a reserved system column name. Please use a different name.`)
                      );
                    }

                    // Check against existing custom columns
                    const exists = existingColumns.some(
                      col => col.column_name.toLowerCase() === valueLower
                    );
                    if (exists) {
                      return Promise.reject(
                        new Error(`A column with the name "${value}" already exists`)
                      );
                    }
                    return Promise.resolve();
                  }
                }
              ]}
            >
              <Input placeholder="e.g., Material Grade" />
            </Form.Item>

            <Form.Item
              name="data_type"
              label="Data Type"
              rules={[{ required: true, message: 'Please select data type' }]}
            >
              <Select placeholder="Select data type">
                <Option value="text">Text</Option>
                <Option value="number">Number</Option>
                <Option value="date">Date</Option>
                <Option value="boolean">Boolean (Yes/No)</Option>
              </Select>
            </Form.Item>

            <Form.Item
              name="is_required"
              label="Required Field"
              valuePropName="checked"
            >
              <Select placeholder="Is this field required?">
                <Option value={false}>No (Optional)</Option>
                <Option value={true}>Yes (Mandatory)</Option>
              </Select>
            </Form.Item>

            {mode === 'category' && subCategories.length > 0 && (
              <Form.Item
                name="sub_categories"
                label="Apply to Sub-Categories (Optional)"
                tooltip="Leave empty to apply to all sub-categories, or select specific sub-categories"
              >
                <Select
                  mode="multiple"
                  placeholder="Select sub-categories (leave empty for all)"
                  allowClear
                >
                  {subCategories.map(sub => (
                    <Option key={sub.sub_category} value={sub.sub_category}>
                      {sub.sub_category}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            )}

            <div style={{ textAlign: 'right', marginTop: 16 }}>
              <Button onClick={onCancel} style={{ marginRight: 8 }}>
                Cancel
              </Button>
              <Button type="primary" loading={loading} onClick={handleSubmit}>
                Add Column
              </Button>
            </div>
          </Form>
        </TabPane>

        <TabPane tab="Manage Columns" key="manage">
          <Table
            columns={manageTableColumns}
            dataSource={existingColumns}
            rowKey="id"
            loading={manageColumnsLoading}
            pagination={false}
            size="small"
          />
        </TabPane>
      </Tabs>
    </Modal>
  );
};

export default CustomColumnModal;
