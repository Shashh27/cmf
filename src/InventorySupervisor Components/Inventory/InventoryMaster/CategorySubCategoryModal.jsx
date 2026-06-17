import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, Button, message, TreeSelect, Space, Divider } from 'antd';
import { PlusOutlined, FolderOutlined, AppstoreOutlined } from '@ant-design/icons';
import { API_BASE_URL } from '../../../Config/auth.js';

const { Option } = Select;

const CategorySubCategoryModal = ({ visible, onCancel, onSuccess, mode = 'category', parentCategory = null }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      form.resetFields();
      if (mode === 'sub_category' && parentCategory) {
        form.setFieldsValue({ category: parentCategory });
      }
      fetchCategories();
    }
  }, [visible, mode, parentCategory, form]);

  const fetchCategories = async () => {
    setCategoriesLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/tools-list/categories/tree`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCategories(data);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
      message.error('Failed to load categories');
    } finally {
      setCategoriesLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      if (mode === 'category') {
        // Use dedicated category creation endpoint
        const response = await fetch(`${API_BASE_URL}/tools-list/categories`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: values.category }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Failed to create category');
        }

        message.success('Category created successfully');
      } else {
        // Use dedicated sub-category creation endpoint
        const response = await fetch(`${API_BASE_URL}/tools-list/sub-categories`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category: values.category,
            sub_category: values.sub_category,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Failed to create sub-category');
        }

        message.success('Sub-category created successfully');
      }

      onSuccess();
      form.resetFields();
      onCancel();
    } catch (error) {
      if (error.errorFields) {
        // Validation error
        return;
      }
      console.error('Failed to save:', error);
      message.error('Failed to save: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const treeData = categories.map(cat => ({
    title: cat.category,
    value: cat.category,
    key: cat.category,
    children: cat.sub_categories.map(sub => ({
      title: sub.sub_category,
      value: `${cat.category}|${sub.sub_category}`,
      key: `${cat.category}|${sub.sub_category}`,
    })),
  }));

  return (
    <Modal
      title={mode === 'category' ? 'Create New Category' : 'Create New Sub-Category'}
      open={visible}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          Cancel
        </Button>,
        <Button key="submit" type="primary" loading={loading} onClick={handleSubmit}>
          {mode === 'category' ? 'Create Category' : 'Create Sub-Category'}
        </Button>,
      ]}
      width={600}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        {mode === 'category' ? (
          <Form.Item
            name="category"
            label="Category Name"
            rules={[
              { required: true, message: 'Please enter category name' },
              { max: 50, message: 'Category name cannot exceed 50 characters' },
              {
                validator: (_, value) => {
                  if (!value) return Promise.resolve();
                  const exists = categories.some(cat => 
                    cat.category.toLowerCase() === value.toLowerCase()
                  );
                  return exists 
                    ? Promise.reject(new Error('Category already exists'))
                    : Promise.resolve();
                }
              }
            ]}
          >
            <Input 
              placeholder="e.g., Cutting Tools, Measuring Instruments"
              prefix={<AppstoreOutlined />}
              autoFocus
            />
          </Form.Item>
        ) : (
          <>
            <Form.Item
              name="category"
              label="Parent Category"
              rules={[{ required: true, message: 'Please select a category' }]}
            >
              <Select
                placeholder="Select parent category"
                loading={categoriesLoading}
                showSearch
                optionFilterProp="children"
                disabled={!!parentCategory}
              >
                {categories.map(cat => (
                  <Option key={cat.category} value={cat.category}>
                    {cat.category}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item
              name="sub_category"
              label="Sub-Category Name"
              rules={[
                { required: true, message: 'Please enter sub-category name' },
                { max: 50, message: 'Sub-category name cannot exceed 50 characters' },
              ]}
            >
              <Input 
                placeholder="e.g., Drills, Calipers, Wrenches"
                prefix={<FolderOutlined />}
              />
            </Form.Item>
          </>
        )}
      </Form>
      {mode === 'category' && (
        <>
          <Divider />
          <div style={{ background: '#f6ffed', padding: 12, borderRadius: 8, border: '1px solid #b7eb8f' }}>
            <p style={{ margin: 0, fontSize: 12, color: '#389e0d' }}>
              <strong>Note:</strong> Categories and sub-categories are automatically created when you add tools. 
              This modal allows you to create them explicitly before adding tools.
            </p>
          </div>
        </>
      )}
    </Modal>
  );
};

export default CategorySubCategoryModal;
