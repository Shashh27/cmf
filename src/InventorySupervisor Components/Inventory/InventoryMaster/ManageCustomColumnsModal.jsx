import React, { useEffect, useState } from 'react';
import { Modal, Table, Button, message, Popconfirm, Tag, Space } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { API_BASE_URL } from '../../../Config/auth';

const ManageCustomColumnsModal = ({ visible, onClose, mode, target }) => {
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchColumns = async () => {
     setLoading(true);
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
        setColumns([]);
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

      setColumns(filteredColumns);
    } catch (error) {
      console.error('Failed to fetch columns:', error);
      setColumns([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      fetchColumns();
    }
  }, [visible, mode, target]);

  const handleDelete = async (columnId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/tools-list/custom-columns/${columnId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        message.success('Custom column deleted successfully');
        fetchColumns();
      } else {
        message.error('Failed to delete custom column');
      }
    } catch (error) {
      console.error('Failed to delete column:', error);
      message.error('Failed to delete custom column');
    }
  };

  const tableColumns = [
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
      title={`Manage Custom Columns - ${mode === 'category' ? 'Category' : 'Sub-category'}`}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={600}
    >
      <Table
        columns={tableColumns}
        dataSource={columns}
        rowKey="id"
        loading={loading}
        pagination={false}
        size="small"
      />
    </Modal>
  );
};

export default ManageCustomColumnsModal;
