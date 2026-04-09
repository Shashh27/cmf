import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { API_BASE_URL } from "../../Config/auth";
import { Modal, Form, Input, Select, Button, message, Badge } from "antd";

const CreateProductModal = ({ 
  open, // changed from show to open for antd
  onCancel, // changed from onHide to onCancel for antd
  createType, 
  selectedProduct,
  parentAssembly,
  onProductCreated,
  mode = 'create', // 'create' or 'edit'
  editingItem = null
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [partTypes, setPartTypes] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const hasFetchedPartTypes = useRef(false);
  const hasFetchedRawMaterials = useRef(false);

  // Initial form values
  const storedUser = (() => {
    try {
      const s = localStorage.getItem('user');
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  })();
  const [formData, setFormData] = useState({
    product_number: '',
    product_name: '',
    product_version: '1.0',
    user_name_display: storedUser?.user_name || '',
    user_id: storedUser?.id ?? null,
    assembly_number: '',
    assembly_name: '',
    part_number: '',
    part_name: '',
    type_id: 1,
    raw_material_id: null,
    size: '',
    qty: 1,
    assembly_id: null,
    product_id: ''
  });

  // Update form data when selectedProduct, parentAssembly, mode, or editingItem changes
  useEffect(() => {
    let newValues = {};

    if (mode === 'edit' && editingItem) {
      // Pre-fill form based on what we're editing
      if (createType === 'product') {
        newValues = {
          product_number: editingItem.product_number || '',
          product_name: editingItem.product_name || '',
          product_version: editingItem.product_version || '1.0',
        };
      } else if (createType === 'assembly') {
        newValues = {
          assembly_number: editingItem.assembly_number || '',
          assembly_name: editingItem.assembly_name || '',
        };
      } else if (createType === 'part') {
        newValues = {
          part_number: editingItem.part_number || '',
          part_name: editingItem.part_name || '',
          type_id: editingItem.type_id || 1,
          raw_material_id: editingItem.raw_material_id,
          size: editingItem.size || '',
          qty: editingItem.qty || 1,
        };
      }
    } else {
      // Default behavior for create mode
      if (createType === 'product') {
        newValues = {
          product_version: '1.0',
        };
      } else if (createType === 'part') {
        newValues = {
          type_id: 1,
          size: '',
          qty: 1,
        };
      }
    }
    
    // Update internal state
    setFormData(prev => ({ ...prev, ...newValues }));
  }, [selectedProduct, parentAssembly, mode, editingItem, createType]);

  // Update form values separately to avoid connection warning
  useEffect(() => {
    let newValues = {};

    if (mode === 'edit' && editingItem) {
      // Pre-fill form based on what we're editing
      if (createType === 'product') {
        newValues = {
          product_number: editingItem.product_number || '',
          product_name: editingItem.product_name || '',
          product_version: editingItem.product_version || '1.0',
        };
      } else if (createType === 'assembly') {
        newValues = {
          assembly_number: editingItem.assembly_number || '',
          assembly_name: editingItem.assembly_name || '',
        };
      } else if (createType === 'part') {
        newValues = {
          part_number: editingItem.part_number || '',
          part_name: editingItem.part_name || '',
          type_id: editingItem.type_id || 1,
          raw_material_id: editingItem.raw_material_id,
          size: editingItem.size || '',
          qty: editingItem.qty || 1,
        };
      }
    } else {
      // Default behavior for create mode
      if (createType === 'product') {
        newValues = {
          product_version: '1.0',
        };
      } else if (createType === 'part') {
        newValues = {
          type_id: 1,
          size: '',
          qty: 1,
        };
      }
    }
    
    // Update form instance
    if (form && open) {
      form.setFieldsValue(newValues);
    }
  }, [selectedProduct, parentAssembly, mode, editingItem, createType, form, open]);

  // Pre-fill user info for product creation
  useEffect(() => {
    if (open && createType === 'product') {
      try {
        const stored = localStorage.getItem('user');
        if (stored) {
          const u = JSON.parse(stored);
          const userName = u?.user_name || '';
          const userId = u?.id ?? null;
          form.setFieldsValue({
            user_name_display: userName,
            user_id: userId != null ? String(userId) : null
          });
        }
      } catch (e) {
        console.error('Failed to parse user from localStorage', e);
      }
    }
  }, [open, createType, form]);

  // Fetch part types when createType becomes 'part'
  useEffect(() => {
    if (createType === 'part' && !hasFetchedPartTypes.current) {
      const fetchPartTypesData = async () => {
        hasFetchedPartTypes.current = true;
        try {
          await fetchPartTypes();
        } catch (error) {
          console.error('Error fetching part types:', error);
        }
      };
      fetchPartTypesData();
    }
  }, [createType]);

  // Fetch raw materials when component mounts or when createType becomes 'part'
  useEffect(() => {
    if (createType === 'part' && !hasFetchedRawMaterials.current) {
      const fetchRawMaterialsData = async () => {
        hasFetchedRawMaterials.current = true;
        try {
          await fetchRawMaterials();
        } catch (error) {
          console.error('Error fetching raw materials:', error);
        }
      };
      fetchRawMaterialsData();
    }
  }, [createType]);

  const fetchPartTypes = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/part-types/`);
      setPartTypes(response.data);
    } catch (error) {
      console.error("Error fetching part types:", error);
    }
  };

  const fetchRawMaterials = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/rawmaterials/`);
      setRawMaterials(response.data);
    } catch (error) {
      console.error("Error fetching raw materials:", error);
    }
  };

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

  const handleFinish = async (values) => {
    setLoading(true);

    try {
      let url, method, payload;

      if (createType === 'product') {
        url = `${API_BASE_URL}/products${mode === 'edit' && editingItem ? `/${editingItem.id}` : '/'}`;
        method = mode === 'edit' && editingItem ? 'PUT' : 'POST';
        const uid = getCurrentUserId();
        payload = {
          product_number: values.product_number,
          product_name: values.product_name,
          product_version: (mode === 'edit' && editingItem)
            ? (editingItem?.product_version ?? values.product_version ?? '1.0')
            : '1.0',
          user_id: uid
        };
      } else if (createType === 'assembly') {
        url = `${API_BASE_URL}/assemblies${mode === 'edit' && editingItem ? `/${editingItem.id}` : '/'}`;
        method = mode === 'edit' && editingItem ? 'PUT' : 'POST';
        payload = {
          assembly_number: values.assembly_number,
          assembly_name: values.assembly_name,
          product_id: editingItem?.product_id || selectedProduct?.id,
          parent_id: parentAssembly?.id || editingItem?.parent_id || null,
          user_id: getCurrentUserId(),
        };
      } else if (createType === 'part') {
        url = `${API_BASE_URL}/parts${mode === 'edit' && editingItem ? `/${editingItem.id}` : '/'}`;
        method = mode === 'edit' && editingItem ? 'PUT' : 'POST';
        payload = {
          part_number: values.part_number,
          part_name: values.part_name,
          type_id: values.type_id,
          raw_material_id: values.raw_material_id,
          size: values.size || null,
          qty: values.qty || 1,
          assembly_id: parentAssembly?.id || editingItem?.assembly_id || null,
          product_id: editingItem?.product_id || selectedProduct?.id,
          user_id: getCurrentUserId(),
        };
      }

      const response = await axios({
        url,
        method: method.toLowerCase(),
        headers: {
          "Content-Type": "application/json",
        },
        data: payload,
      });

      const result = response.data;
      onProductCreated(result, createType, mode === 'edit' ? 'edit' : 'create');
      onCancel();
      form.resetFields();
    } catch (error) {
      console.error('Error:', error);
      const detail =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        'An error occurred';
      message.error(detail);
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    return `${mode === 'edit' ? 'Edit' : 'Create New'} ${createType === 'product' ? 'Product' : createType === 'assembly' ? 'Assembly' : 'Part'}`;
  };

  return (
    <Modal
      title={getTitle()}
      open={open}
      onCancel={onCancel}
      maskClosable={false}
      keyboard={false}
      footer={null}
      destroyOnHidden
      width="95%"
      style={{ maxWidth: 600 }}
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
          @media (max-width: 768px) {
            .ant-modal-body {
              padding: 16px;
            }
          }
        `}
      </style>
      {(createType === 'assembly' || createType === 'part') && (
        <div style={{ marginBottom: 16 }}>
          <Badge 
            count={`Creating under: ${selectedProduct?.product_name || 'Selected Product'}`} 
            style={{ backgroundColor: '#f0f0f0', color: '#000', padding: '0 8px', fontSize: 'clamp(10px, 2.5vw, 12px)' }} 
          />
        </div>
      )}

      <Form
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        initialValues={formData}
      >
        {createType === 'product' && (
          <>
            <Form.Item
              name="user_name_display"
              label={<span className="text-xs sm:text-sm">User</span>}
            >
              <Input 
                placeholder="-" 
                autoComplete="off" 
                readOnly 
                disabled
                size="large"
                style={{ 
                  backgroundColor: '#f5f5f5', 
                  color: '#6b7280', 
                  borderColor: '#e5e7eb' 
                }} 
              />
            </Form.Item>
            <Form.Item
              name="product_number"
              label={<span className="text-xs sm:text-sm">Product Number</span>}
              rules={[{ required: true, message: 'Please input product number!' }]}
              getValueFromEvent={(e) => e.target.value.replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 30)}
            >
              <Input placeholder="e.g., PRD-001" autoComplete="off" size="large" maxLength={30} />
            </Form.Item>
            <Form.Item
              name="product_name"
              label={<span className="text-xs sm:text-sm">Product Name</span>}
              rules={[{ required: true, message: 'Please input product name!' }]}
              getValueFromEvent={(e) => e.target.value.replace(/[^a-zA-Z0-9-_ ]/g, '').slice(0, 30)}
            >
              <Input placeholder="e.g., Main Product" autoComplete="off" size="large" maxLength={30} />
            </Form.Item>
            <Form.Item
              name="product_version"
              label={<span className="text-xs sm:text-sm">Product Version</span>}
              rules={[{ required: true, message: 'Please input product version!' }]}
            >
              <Input
                placeholder="1.0"
                autoComplete="off"
                size="large"
                readOnly
                disabled
                style={{
                  backgroundColor: '#f5f5f5',
                  color: '#6b7280',
                  borderColor: '#e5e7eb'
                }}
              />
            </Form.Item>
          </>
        )}

        {createType === 'assembly' && (
          <>
            <Form.Item
              name="assembly_number"
              label={<span className="text-xs sm:text-sm">Assembly Number</span>}
              rules={[{ required: true, message: 'Please input assembly number!' }]}
              getValueFromEvent={(e) => e.target.value.replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 30)}
            >
              <Input placeholder="e.g., ASM-001" autoComplete="off" size="large" maxLength={30} />
            </Form.Item>
            <Form.Item
              name="assembly_name"
              label={<span className="text-xs sm:text-sm">Assembly Name</span>}
              rules={[{ required: true, message: 'Please input assembly name!' }]}
              getValueFromEvent={(e) => e.target.value.replace(/[^a-zA-Z0-9-_ ]/g, '').slice(0, 30)}
            >
              <Input placeholder="e.g., Main Assembly" autoComplete="off" size="large" maxLength={30} />
            </Form.Item>
          </>
        )}

        {createType === 'part' && (
          <>
            <Form.Item
              name="part_number"
              label={<span className="text-xs sm:text-sm">Part Number</span>}
              rules={[{ required: true, message: 'Please input part number!' }]}
              getValueFromEvent={(e) => e.target.value.replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 30)}
            >
              <Input placeholder="e.g., PRT-001" autoComplete="off" size="large" maxLength={30} />
            </Form.Item>
            <Form.Item
              name="part_name"
              label={<span className="text-xs sm:text-sm">Part Name</span>}
              rules={[{ required: true, message: 'Please input part name!' }]}
              getValueFromEvent={(e) => e.target.value.replace(/[^a-zA-Z0-9-_ ]/g, '').slice(0, 30)}
            >
              <Input placeholder="e.g., Component Part" autoComplete="off" size="large" maxLength={30} />
            </Form.Item>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Form.Item
                name="size"
                label={<span className="text-xs sm:text-sm">Size</span>}
                rules={[{ required: false }]}
              >
                <Input placeholder="e.g., 25x25x160" autoComplete="off" size="large" />
              </Form.Item>
              <Form.Item
                name="qty"
                label={<span className="text-xs sm:text-sm">Quantity</span>}
                rules={[{ required: false }]}
              >
                <Input type="number" min={1} placeholder="1" autoComplete="off" size="large" />
              </Form.Item>
            </div>

            <Form.Item
              name="type_id"
              label={<span className="text-xs sm:text-sm">Part Type</span>}
              rules={[{ required: true, message: 'Please select part type!' }]}
            >
              <Select placeholder="Select a part type" size="large">
                {partTypes.map(type => (
                  <Select.Option key={type.id} value={type.id}>
                    {type.type_name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              name="raw_material_id"
              label={<span className="text-xs sm:text-sm">Raw Material</span>}
              rules={[{ required: false, message: 'Please select raw material!' }]}
            >
              <Select placeholder="Select raw material" allowClear showSearch optionFilterProp="children" size="large">
                {rawMaterials.map(material => (
                  <Select.Option key={material.id} value={material.id}>
                    {material.material_name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </>
        )}

        <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 mt-6">
          <Button onClick={onCancel} size="large" className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button type="primary" htmlType="submit" loading={loading} className="no-hover-btn w-full sm:w-auto" size="large">
            {mode === 'edit' ? 'Save Changes' : 'Create'}
          </Button>
        </div>
      </Form>
    </Modal>
  );
};

export default CreateProductModal;
