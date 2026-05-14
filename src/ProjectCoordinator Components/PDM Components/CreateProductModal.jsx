import React, { useState, useEffect, useRef } from "react";

import axios from "axios";

import { API_BASE_URL } from "../../Config/auth";

import { Modal, Form, Input, Select, Button, App, Badge } from "antd";



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

  const { message } = App.useApp();

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
          vendor_id: editingItem.vendor_id || null,

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
          vendor_id: editingItem.vendor_id || null,

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

  // Update form values again after vendors are loaded to ensure vendor selection works
  useEffect(() => {
    if (mode === 'edit' && editingItem && createType === 'part' && vendors.length > 0 && form && open) {
      form.setFieldsValue({
        vendor_id: editingItem.vendor_id ? Number(editingItem.vendor_id) : null,
      });
    }
  }, [vendors, mode, editingItem, createType, form, open]);



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

      // Validation for parts with raw materials
      if (createType === 'part') {
        if (values.raw_material_id) {
          // Raw material is selected - validate stock if provided (optional)
          if (values.raw_material_stock_id) {
            // Check if selected stock exists and is available
            const selectedStock = rawMaterialStock.find(stock => stock.id === values.raw_material_stock_id);
            if (!selectedStock) {
              message.error('Selected raw material stock not found');
              setLoading(false);
              return;
            }
            
            // Check stock status - only validate if creating new part or increasing quantity
            const isChangingQuantity = mode === 'create' || 
              (mode === 'edit' && values.raw_material_required_quantity !== editingItem?.raw_material_required_quantity);
            const isIncreasingQuantity = mode === 'edit' && 
              values.raw_material_required_quantity > (editingItem?.raw_material_required_quantity || 0);
            
            if (selectedStock.status !== 'available' && isChangingQuantity && isIncreasingQuantity) {
              message.error('Selected raw material stock is not available for increasing quantity. Status: ' + selectedStock.status);
              setLoading(false);
              return;
            }
            
            // Check if required quantity is provided and valid (if stock is selected, quantity should be valid)
            if (values.raw_material_required_quantity && values.raw_material_required_quantity <= 0) {
              message.error('Please enter a valid required quantity');
              setLoading(false);
              return;
            }
            
            // Check if enough quantity is available - only validate if changing quantity
            if (isChangingQuantity && values.raw_material_required_quantity) {
              // For edit mode, account for currently assigned quantity
              let availableQuantity = selectedStock.available_quantity;
              if (mode === 'edit' && editingItem && editingItem.raw_material_stock_id === values.raw_material_stock_id) {
                // Add back the currently assigned quantity when editing
                availableQuantity += (editingItem.raw_material_required_quantity || 0);
              }
              
              if (values.raw_material_required_quantity > availableQuantity) {
                message.error(`Insufficient material. Available: ${availableQuantity}, Required: ${values.raw_material_required_quantity}`);
                setLoading(false);
                return;
              }
            }
          }
        } else {
          // No raw material selected - handle based on part type
          const formValues = form.getFieldsValue();
          const typeId = formValues.type_id;
          const partDetail = formValues.part_detail;
          const isOutSource = partTypes.find(t => t.id === typeId)?.type_name?.toLowerCase().includes('out');
          const isWithoutRawMaterial = isOutSource && partDetail === 'WITHOUT_RAW_MATERIAL';
          
          if (isWithoutRawMaterial) {
            // Scenario 3: Outsource + WITHOUT_RAW_MATERIAL - clear all raw material related values
            if (values.raw_material_stock_id || values.raw_material_required_quantity) {
              // Clear the values instead of showing error
              values.raw_material_stock_id = null;
              values.raw_material_id = null;
              values.raw_material_required_quantity = null;
            }
            // Keep qty for the part itself - DON'T clear it!
          } else {
            // Scenario 1 & 2: In-house parts OR Outsource + WITH_RAW_MATERIAL
            // Only clear actual raw material specific fields if no stock selected
            if (values.raw_material_stock_id) {
              // Stock is selected, keep all values
            } else {
              // No stock selected, clear raw material specific values
              values.raw_material_stock_id = null;
              values.raw_material_id = null;
              values.raw_material_required_quantity = null;
            }
            // Always keep qty for the part
          }
        }
      }

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

        // Only include raw material fields if raw material is selected
        const payloadBase = {
          part_number: values.part_number,
          part_name: values.part_name,
          type_id: values.type_id,
          part_detail: partDetail,
          assembly_id: parentAssembly?.id || editingItem?.assembly_id || null,
          product_id: editingItem?.product_id || selectedProduct?.id,
          user_id: getCurrentUserId(),
        };

        // Add raw material fields based on what is selected
        // Always include raw_material_id if stock is selected (get from stock data)
        if (values.raw_material_stock_id) {
          // Get material_id from the selected stock
          const selectedStock = rawMaterialStock.find(stock => stock.id === values.raw_material_stock_id);
          if (selectedStock) {
            payloadBase.raw_material_id = selectedStock.material_id;
          }
          payloadBase.raw_material_stock_id = values.raw_material_stock_id;
        } else {
          payloadBase.raw_material_id = null;
          payloadBase.raw_material_stock_id = null;
        }
        
        // Always include size and qty for in-house parts, and for outsource parts that have them
        payloadBase.size = values.size || null;
        payloadBase.qty = values.qty || 1;
        
        // Include required quantity only if stock is selected
        payloadBase.raw_material_required_quantity = values.raw_material_required_quantity || null;

        // Add vendor_id for outsource and standard parts
        const isOutSource = partTypes.find(t => t.id === values.type_id)?.type_name?.toLowerCase().includes('out');
        const isStandard = partTypes.find(t => t.id === values.type_id)?.type_name?.toLowerCase().includes('standard');

        if (isOutSource || isStandard) {
          payloadBase.vendor_id = values.vendor_id || null;
        }

        payload = payloadBase;

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

      width="85%"

      style={{ maxWidth: 1000, top: 30 }}

      styles={{ body: { padding: '16px 24px', maxHeight: '70vh', overflowY: 'auto' } }}

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

          .ant-modal-body {

            padding: 16px 24px !important;

          }

          .ant-form-item {

            margin-bottom: 12px !important;

          }

          .ant-form-item-label > label {

            font-size: 12px !important;

            height: auto !important;

          }

          .ant-input, .ant-select-selector {

            font-size: 13px !important;

          }

          @media (max-width: 768px) {

            .ant-modal-body {

              padding: 12px !important;

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

            {/* Part Basic Info - 2 columns */}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

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

            </div>

            {/* Size, Quantity, and Part Type - 3 columns */}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

              <Form.Item

                name="size"

                label={<span className="text-xs sm:text-sm">Size</span>}

                rules={[{ required: false, message: 'Please enter size!' }]}

              >

                <Input 

                  placeholder="Enter size" 

                  size="large"

                  autoComplete="off"

                />

              </Form.Item>

              <Form.Item

                name="qty"

                label={<span className="text-xs sm:text-sm">Quantity</span>}

                rules={[{ required: true, message: 'Please enter quantity!' }]}

              >

                <Input 
                  type="number" 
                  placeholder="Enter quantity" 
                  size="large"
                  autoComplete="off"
                  min={1}
                  step={1}
                  onKeyPress={(e) => {
                    const char = String.fromCharCode(e.which);
                    const currentValue = e.target.value || '';
                    if (!/[0-9]/.test(char) && 
                        e.which !== 8 && e.which !== 46 && e.which !== 9 && 
                        e.which !== 13 && e.which !== 37 && e.which !== 39 && 
                        e.which !== 36 && e.which !== 35) {
                      e.preventDefault();
                      return false;
                    }
                    if (char === '0' && currentValue === '') {
                      e.preventDefault();
                      return false;
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === '.' || e.key === ',' || e.key === '-' || e.key === '+') {
                      e.preventDefault();
                      return false;
                    }
                  }}
                />

              </Form.Item>

              <Form.Item

                name="type_id"

                label={<span className="text-xs sm:text-sm">Part Type</span>}

                rules={[{ required: true, message: 'Please select part type!' }]}

              >

                <Select placeholder="Select part type" size="large">

                  {partTypes.map(type => (

                    <Select.Option key={type.id} value={type.id}>

                      {type.type_name}

                    </Select.Option>

                  ))}

                </Select>

              </Form.Item>

            </div>

            <Form.Item noStyle shouldUpdate={(prev, curr) => prev.type_id !== curr.type_id}>

              {({ getFieldValue }) => {

                const typeId = getFieldValue('type_id');

                const isOutSource = partTypes.find(t => t.id === typeId)?.type_name?.toLowerCase().includes('out');

                const isStandard = partTypes.find(t => t.id === typeId)?.type_name?.toLowerCase().includes('standard');

                // Only show part details for out-source parts (not for standard parts)
                if (!isOutSource || isStandard) return null;

                return (
                  <>
                    {/* Part Details for Outsource Parts (not for Standard parts) */}
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
                  </>
                );
              }}
            </Form.Item>



            <Form.Item noStyle shouldUpdate={(prev, curr) => prev.type_id !== curr.type_id || prev.part_detail !== curr.part_detail}>

              {({ getFieldValue }) => {

                const typeId = getFieldValue('type_id');

                const partDetail = getFieldValue('part_detail');

                const isOutSource = partTypes.find(t => t.id === typeId)?.type_name?.toLowerCase().includes('out');

                const isStandard = partTypes.find(t => t.id === typeId)?.type_name?.toLowerCase().includes('standard');

                const isRequiredRawMaterial = false;

                const isInHouse = !isOutSource;

                const shouldShowRawMaterialFields = (isInHouse || (isOutSource && partDetail === 'WITH_RAW_MATERIAL')) && !isStandard;

                if (shouldShowRawMaterialFields) {
                  return (
                    <>
                      {/* All Raw Material Fields - Display all at once */}
                      
                    </>
                  );
                }

                // For outsource parts WITHOUT raw material, no additional fields needed
                // qty is already shown in the basic section above
                if (isOutSource && partDetail === 'WITHOUT_RAW_MATERIAL') {
                  return null;
                }

                return null;

              }}

            </Form.Item>

            {/* Vendor Selection for Out-Source and Standard Parts */}
            <Form.Item noStyle shouldUpdate={(prev, curr) => prev.type_id !== curr.type_id}>
              {({ getFieldValue }) => {
                const typeId = getFieldValue('type_id');
                const isOutSource = partTypes.find(t => t.id === typeId)?.type_name?.toLowerCase().includes('out');
                const isStandard = partTypes.find(t => t.id === typeId)?.type_name?.toLowerCase().includes('standard');
                
                // Show vendor selection for both out-source and standard parts
                if (!isOutSource && !isStandard) return null;
                
                return (
                  <Form.Item
                    name="vendor_id"
                    label={<span className="text-xs sm:text-sm">Vendor</span>}
                    rules={[{ required: true, message: 'Please select a vendor!' }]}
                  >
                    <Select 
                      placeholder="Select vendor" 
                      allowClear 
                      showSearch 
                      optionFilterProp="children" 
                      size="large"
                    >
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
