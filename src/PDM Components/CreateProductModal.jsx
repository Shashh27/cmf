import React, { useState, useEffect, useRef } from "react";

import axios from "axios";

import { API_BASE_URL } from "../Config/auth";

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

  const [rawMaterialStock, setRawMaterialStock] = useState([]);

  const [vendors, setVendors] = useState([]);

  const hasFetchedPartTypes = useRef(false);

  const hasFetchedRawMaterials = useRef(false);

  const hasFetchedRawMaterialStock = useRef(false);

  const hasFetchedVendors = useRef(false);



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

    raw_material_required_quantity: null,

    part_detail: null,

    size: '',

    qty: 1,

    vendor_id: null,

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

          product_name: editingItem.product_name || '',

          product_version: editingItem.product_version || '1.0',

        };

      } else if (createType === 'assembly') {

        newValues = {

          assembly_number: editingItem.assembly_number || '',

          assembly_name: editingItem.assembly_name || '',

        };

      } else if (createType === 'part') {

        // Find the stock if raw_material_stock_id exists
        const selectedStock = editingItem.raw_material_stock_id 
          ? rawMaterialStock.find(s => s.id === editingItem.raw_material_stock_id)
          : null;

        newValues = {

          part_number: editingItem.part_number || '',

          part_name: editingItem.part_name || '',

          type_id: editingItem.type_id || 1,

          raw_material_id: selectedStock ? selectedStock.material_id : editingItem.raw_material_id,

          raw_material_form_type: selectedStock ? selectedStock.form_type : null,

          raw_material_stock_id: editingItem.raw_material_stock_id,

          raw_material_required_quantity: editingItem.raw_material_required_quantity,

          part_detail: editingItem.part_detail ?? null,

          size: editingItem.size || '',

          qty: editingItem.qty || 1,

        };

      }

    } else {

      // Default behavior for create mode

      if (createType === 'product') {

        newValues = {

          product_name: '',

          product_version: '1.0',

        };

      } else if (createType === 'assembly') {

        newValues = {

          assembly_number: '',

          assembly_name: '',

        };

      } else if (createType === 'part') {

        newValues = {

          part_number: '',

          part_name: '',

          type_id: 1,

          raw_material_id: null,

          part_detail: null,

          size: '',

          qty: 1,

        };

      }

    }

    

    // Update internal state

    setFormData(prev => ({ ...prev, ...newValues }));

  }, [selectedProduct, parentAssembly, mode, editingItem, createType, rawMaterialStock]);



  // Update form values separately to avoid connection warning

  useEffect(() => {

    let newValues = {};

    if (mode === 'edit' && editingItem) {

      // Pre-fill form based on what we're editing

      if (createType === 'product') {

        newValues = {

          product_name: editingItem.product_name || '',

          product_version: editingItem.product_version || '1.0',

        };

      } else if (createType === 'assembly') {

        newValues = {

          assembly_number: editingItem.assembly_number || '',

          assembly_name: editingItem.assembly_name || '',

        };

      } else if (createType === 'part') {

        // Find the stock if raw_material_stock_id exists
        const selectedStock = editingItem.raw_material_stock_id 
          ? rawMaterialStock.find(s => s.id === editingItem.raw_material_stock_id)
          : null;

        newValues = {

          part_number: editingItem.part_number || '',

          part_name: editingItem.part_name || '',

          type_id: editingItem.type_id || 1,

          raw_material_id: selectedStock ? selectedStock.material_id : editingItem.raw_material_id,

          raw_material_form_type: selectedStock ? selectedStock.form_type : null,

          raw_material_stock_id: editingItem.raw_material_stock_id,

          raw_material_required_quantity: editingItem.raw_material_required_quantity,

          part_detail: editingItem.part_detail ?? null,

          size: editingItem.size || '',

          qty: editingItem.qty || 1,

        };

      }

    } else {

      // Default behavior for create mode

      if (createType === 'product') {

        newValues = {

          product_name: '',

          product_version: '1.0',

        };

      } else if (createType === 'assembly') {

        newValues = {

          assembly_number: '',

          assembly_name: '',

        };

      } else if (createType === 'part') {

        newValues = {

          part_number: '',

          part_name: '',

          type_id: 1,

          raw_material_id: null,

          part_detail: null,

          size: '',

          qty: 1,

        };

      }

    }

    

    // Update form instance

    if (form && open) {
      form.setFieldsValue(newValues);
    }

  }, [selectedProduct, parentAssembly, mode, editingItem, createType, form, open, rawMaterialStock]);



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

          await fetchRawMaterialStock();

          await fetchVendors();

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



  const fetchRawMaterialStock = async () => {

    try {

      const response = await axios.get(`${API_BASE_URL}/rawmaterials/stock/`);

      setRawMaterialStock(response.data);

    } catch (error) {

      console.error("Error fetching raw material stock:", error);

    }

  };



  const fetchVendors = async () => {

    try {

      const response = await axios.get(`${API_BASE_URL}/rawmaterials/vendors`);

      setVendors(response.data);

    } catch (error) {

      console.error("Error fetching vendors:", error);

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

        const partDetail = values.part_detail || null;

        payload = {

          part_number: values.part_number,

          part_name: values.part_name,

          type_id: values.type_id,

          raw_material_id: values.raw_material_id || null,

          raw_material_stock_id: values.raw_material_stock_id || null,

          part_detail: partDetail,

          size: values.size || null,

          qty: values.qty || 1,
          raw_material_required_quantity: values.raw_material_required_quantity || null,

          vendor_id: values.vendor_id || null,

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



  const handleCancel = () => {

    form.resetFields();

    onCancel();

  };



  return (

    <Modal

      title={getTitle()}

      open={open}

      onCancel={handleCancel}

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



            <Form.Item noStyle shouldUpdate={(prev, curr) => prev.type_id !== curr.type_id}>

              {({ getFieldValue }) => {

                const typeId = getFieldValue('type_id');

                const isOutSource = partTypes.find(t => t.id === typeId)?.type_name?.toLowerCase().includes('out');

                if (!isOutSource) return null;

                return (

                  <Form.Item

                    name="part_detail"

                    label={<span className="text-xs sm:text-sm">Part Details</span>}

                    rules={[{ required: true, message: 'Please select part details!' }]}

                  >

                    <Select placeholder="Select part details" size="large">

                      <Select.Option value="WITH_RAW_MATERIAL">With Raw Material</Select.Option>

                      <Select.Option value="WITHOUT_RAW_MATERIAL">Without Raw Material</Select.Option>

                    </Select>

                  </Form.Item>

                );

              }}

            </Form.Item>



            <Form.Item noStyle shouldUpdate={(prev, curr) => prev.type_id !== curr.type_id || prev.part_detail !== curr.part_detail}>

              {({ getFieldValue }) => {

                const typeId = getFieldValue('type_id');

                const partDetail = getFieldValue('part_detail');

                const isOutSource = partTypes.find(t => t.id === typeId)?.type_name?.toLowerCase().includes('out');

                const isRequiredRawMaterial = isOutSource && partDetail === 'WITH_RAW_MATERIAL';

                const isInHouse = !isOutSource;

                if (isInHouse) {
                  return (
                    <>
                      {/* Step 1: Select Material */}
                      <Form.Item
                        name="raw_material_id"
                        label={<span className="text-xs sm:text-sm">Raw Material</span>}
                        rules={[{ required: false }]}
                      >
                        <Select 
                          placeholder="Select material" 
                          allowClear 
                          showSearch 
                          optionFilterProp="children" 
                          size="large"
                          onChange={() => {
                            // Reset form type and stock when material changes
                            form.setFieldsValue({ 
                              raw_material_form_type: undefined, 
                              raw_material_stock_id: undefined 
                            });
                          }}
                        >
                          {rawMaterials.map(material => (
                            <Select.Option key={material.id} value={material.id}>
                              {material.material_name}
                            </Select.Option>
                          ))}
                        </Select>
                      </Form.Item>

                      {/* Step 2: Select Form Type (filtered by material) */}
                      <Form.Item noStyle shouldUpdate={(prev, curr) => prev.raw_material_id !== curr.raw_material_id}>
                        {({ getFieldValue }) => {
                          const materialId = getFieldValue('raw_material_id');
                          if (!materialId) return null;
                          
                          // Get available form types for selected material
                          const availableForms = rawMaterialStock
                            .filter(s => s.material_id === materialId)
                            .map(s => s.form_type)
                            .filter((v, i, a) => a.indexOf(v) === i); // unique
                          
                          if (availableForms.length === 0) return null;
                          
                          return (
                            <Form.Item
                              name="raw_material_form_type"
                              label={<span className="text-xs sm:text-sm">Form Type</span>}
                              rules={[{ required: false }]}
                            >
                              <Select 
                                placeholder="Select form type" 
                                allowClear 
                                size="large"
                                onChange={() => {
                                  // Reset stock when form type changes
                                  form.setFieldsValue({ raw_material_stock_id: undefined });
                                }}
                              >
                                {availableForms.map(formType => (
                                  <Select.Option key={formType} value={formType}>
                                    {formType}
                                  </Select.Option>
                                ))}
                              </Select>
                            </Form.Item>
                          );
                        }}
                      </Form.Item>

                      {/* Step 3: Select Dimensions (filtered by material + form) */}
                      <Form.Item noStyle shouldUpdate={(prev, curr) => prev.raw_material_id !== curr.raw_material_id || prev.raw_material_form_type !== curr.raw_material_form_type}>
                        {({ getFieldValue }) => {
                          const materialId = getFieldValue('raw_material_id');
                          const formType = getFieldValue('raw_material_form_type');
                          if (!materialId || !formType) return null;
                          
                          // Get available stock items for selected material and form
                          const availableStock = rawMaterialStock.filter(s => 
                            s.material_id === materialId && s.form_type === formType
                          );
                          
                          if (availableStock.length === 0) return null;
                          
                          const material = rawMaterials.find(m => m.id === materialId);
                          
                          return (
                            <Form.Item
                              name="raw_material_stock_id"
                              label={<span className="text-xs sm:text-sm">Dimensions</span>}
                              rules={[{ required: false }]}
                            >
                              <Select 
                                placeholder="Select dimensions" 
                                allowClear 
                                size="large"
                              >
                                {availableStock.map(stock => {
                                  const dimensions = stock.form_type === 'Round' 
                                    ? `⌀${stock.diameter} × ${stock.length}mm`
                                    : stock.form_type === 'Square'
                                    ? `${stock.breadth} × ${stock.height} × ${stock.length}mm`
                                    : stock.form_type === 'Pipe'
                                    ? `⌀${stock.outer_diameter}/${stock.inner_diameter} × ${stock.length}mm`
                                    : 'Custom';
                                  
                                  return (
                                    <Select.Option key={stock.id} value={stock.id}>
                                      <div>
                                        <div style={{ fontWeight: 'bold' }}>{dimensions}</div>
                                        <div style={{ fontSize: '12px', color: '#666' }}>
                                          Total: {stock.quantity} | Available: {stock.available_quantity} | Status: {stock.status}
                                        </div>
                                      </div>
                                    </Select.Option>
                                  );
                                })}
                              </Select>
                            </Form.Item>
                          );
                        }}
                      </Form.Item>

                      {/* Raw Material Required Quantity Field */}
                      <Form.Item noStyle shouldUpdate={(prev, curr) => prev.raw_material_id !== curr.raw_material_id || prev.raw_material_stock_id !== curr.raw_material_stock_id}>
                        {() => {
                          const materialId = getFieldValue('raw_material_id');
                          const stockId = getFieldValue('raw_material_stock_id');
                          
                          if (materialId && stockId) {
                            return (
                              <Form.Item
                                name="raw_material_required_quantity"
                                label={<span className="text-xs sm:text-sm">Required Quantity</span>}
                                rules={isRequiredRawMaterial ? [{ required: true, message: 'Please enter required quantity!' }] : [{ required: false }]}
                              >
                                <Input 
                                  type="number" 
                                  placeholder="Enter required quantity" 
                                  size="large"
                                  min={0}
                                  step={0.1}
                                />
                              </Form.Item>
                            );
                          }
                          return null;
                        }}
                      </Form.Item>
                    </>
                  );
                }

                return (
                  <Form.Item

                    name="raw_material_id"

                    label={<span className="text-xs sm:text-sm">Raw Material</span>}

                    rules={isRequiredRawMaterial ? [{ required: true, message: 'Please select raw material!' }] : [{ required: false }]}

                  >

                    <Select placeholder={isRequiredRawMaterial ? 'Select raw material' : 'Select raw material (optional)'} allowClear showSearch optionFilterProp="children" size="large">

                      {rawMaterials.map(material => (

                        <Select.Option key={material.id} value={material.id}>

                          {material.material_name}

                        </Select.Option>

                      ))}

                    </Select>

                  </Form.Item>

                );

              }}

            </Form.Item>

            {/* Vendor Selection for Out-Source Parts */}
            <Form.Item noStyle shouldUpdate={(prev, curr) => prev.type_id !== curr.type_id}>
              {({ getFieldValue }) => {
                const typeId = getFieldValue('type_id');
                const isOutSource = partTypes.find(t => t.id === typeId)?.type_name?.toLowerCase().includes('out');
                
                if (!isOutSource) return null;
                
                return (
                  <Form.Item
                    name="vendor_id"
                    label={<span className="text-xs sm:text-sm">Vendor</span>}
                    rules={[{ required: true, message: 'Please select a vendor for outsourced parts!' }]}
                  >
                    <Select placeholder="Select vendor" allowClear showSearch optionFilterProp="children" size="large">
                      {vendors.map(vendor => (
                        <Select.Option key={vendor.id} value={vendor.id}>
                          {vendor.company_name}
                        </Select.Option>
                      ))}
                    </Select>
                  </Form.Item>
                );
              }}
            </Form.Item>

          </>

        )}



        <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 mt-6">

          <Button onClick={handleCancel} size="large" className="w-full sm:w-auto">

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

