import React, { useState, useEffect } from "react";
import axios from "axios";
import { API_BASE_URL } from "../../Config/auth";
import { Modal, Form, Input, Select, Button, Typography, Space, Row, Col, Collapse, DatePicker, InputNumber } from "antd";
import { FileTextOutlined, UploadOutlined, CloseOutlined, PlusOutlined } from "@ant-design/icons";
import { message } from "antd";
import dayjs from "dayjs";

const { Title } = Typography;
const { Option } = Select;

const OrderModal = ({ isOpen, onClose, onOrderCreated, editingOrder, customers, products, fetchCustomers, fetchProducts }) => {
  const [form] = Form.useForm();
  const [createProductForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [createProductModalOpen, setCreateProductModalOpen] = useState(false);
  const [productSelectOpen, setProductSelectOpen] = useState(false);
  const [createProductLoading, setCreateProductLoading] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [users, setUsers] = useState([]);
  const [projectCoordinators, setProjectCoordinators] = useState([]);
  const [manufacturingCoordinators, setManufacturingCoordinators] = useState([]);
  const [decimalWarnings, setDecimalWarnings] = useState({});
  const orderDateWatch = Form.useWatch('order_date', form);

  const limitDecimals = (value, fieldName, precision = 3) => {
    if (value === null || value === undefined || value === '') return value;
    // Remove any character that is not a digit or a decimal point
    const cleaned = String(value).replace(/[^0-9.]/g, '');
    let str = cleaned;
    
    // For whole numbers (precision = 0), remove any decimal point
    if (precision === 0) {
      str = str.replace(/\./g, '');
      // Enforce max 5 digits for quantity-like fields
      if (str.length > 5) {
        showDecimalWarning(fieldName, 0, 'Max 5 digits allowed');
        return str.slice(0, 5);
      }
      return str;
    }

    if (str.includes('.')) {
      const [int, dec] = str.split('.');
      if (dec.length > precision) {
        showDecimalWarning(fieldName, precision);
        return `${int}.${dec.slice(0, precision)}`;
      }
      return str;
    }
    return str;
  };

  const showDecimalWarning = (fieldName, precision, customMsg) => {
    if (!fieldName) return;
    const msg = customMsg ?? (precision === 0 ? "Only whole numbers allowed" : `Max ${precision} decimal places allowed`);
    setDecimalWarnings(prev => ({ ...prev, [fieldName]: msg }));
    // Auto-clear warning after 3 seconds
    setTimeout(() => {
      setDecimalWarnings(prev => ({ ...prev, [fieldName]: null }));
    }, 3000);
  };

  const blockExtraDecimals = (e, fieldName, precision = 3) => {
    const { value } = e.target;
    
    // 1. Always allow control keys (Backspace, Delete, Arrows, etc.)
    const controlKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Escape', 'Control'];
    if (controlKeys.includes(e.key) || e.ctrlKey || e.metaKey) {
      return;
    }

    // 2. Strictly block negative sign and common symbols/letters
    const forbiddenKeys = ['-', '+', 'e', 'E', '@', '#', '$', '%', '&', '*', '(', ')', '_', '=', '<', '>', '/', '?', ';', ':', '"', "'", '[', ']', '{', '}', '|', '\\', '`', '~'];
    if (forbiddenKeys.includes(e.key)) {
      e.preventDefault();
      return;
    }

    // 3. Block decimal point if precision is 0 (whole numbers only)
    if (precision === 0 && e.key === '.') {
      showDecimalWarning(fieldName, 0);
      e.preventDefault();
      return;
    }

    // 4. If precision is 0, enforce max 5 digits in real-time
    if (precision === 0 && /[0-9]/.test(e.key)) {
      const digitsOnly = String(value).replace(/\D/g, '');
      const hasSelection = e.target.selectionStart !== e.target.selectionEnd;
      if (digitsOnly.length >= 5 && !hasSelection) {
        showDecimalWarning(fieldName, 0, 'Max 5 digits allowed');
        e.preventDefault();
        return;
      }
    }

    // 5. Block multiple dots
    if (e.key === '.' && value.includes('.')) {
      e.preventDefault();
      return;
    }

    // 6. Block typing beyond decimal precision
    if (value.includes('.')) {
      const parts = value.split('.');
      const selectionStart = e.target.selectionStart;
      const dotIndex = value.indexOf('.');
      
      // If typing after the dot and already at precision limit
      if (selectionStart > dotIndex && parts[1].length >= precision) {
        // Check if there is a text selection that would be replaced
        if (e.target.selectionStart === e.target.selectionEnd) {
          showDecimalWarning(fieldName, precision);
          e.preventDefault();
        }
      }
    }
  };

  // Fetch data on demand
  const handleCustomerDropdown = (open) => {
    if (open && customers.length === 0) {
      fetchCustomers?.();
    }
  };

  const handleProductDropdown = (open) => {
    setProductSelectOpen(open);
    if (open && products.length === 0) {
      fetchProducts?.();
    }
  };

  const openCreateProductModal = () => {
    setProductSelectOpen(false);
    createProductForm.resetFields();
    setCreateProductModalOpen(true);
  };

  const fetchUsersForRoles = async () => {
    if (users.length > 0) return;
    try {
      const response = await axios.get(`${API_BASE_URL}/access-users/`);
      const list = Array.isArray(response.data) ? response.data : [];
      setUsers(list);

      let currentRole = null;
      try {
        const stored = localStorage.getItem("user");
        if (stored) {
          const userObj = JSON.parse(stored);
          currentRole = (userObj?.role || "").toLowerCase().replace(/_/g, " ").trim();
        }
      } catch {
        currentRole = null;
      }

      const pcs = list.filter((u) => {
        const role = (u.role || "").toLowerCase().replace(/_/g, " ").trim();
        const isCurrentPc =
          currentRole &&
          (currentRole.includes("project coordinator") ||
           currentRole === "coordinator");

        // When the logged-in user is a Project Coordinator, show Admins in the dropdown.
        if (isCurrentPc) {
          return role === "admin";
        }

        // For other roles (e.g., admin viewing this screen), keep original behavior:
        // show users whose role is Project Coordinator / Coordinator.
        return role.includes("project coordinator") || role === "coordinator";
      });

      const mcs = list.filter((u) => {
        const r = (u.role || "").toLowerCase();
        return r === "manufacturing_coordinator" || r === "mc";
      });

      setProjectCoordinators(pcs);
      setManufacturingCoordinators(mcs);
    } catch (error) {
      console.error("Error fetching access users:", error);
    }
  };

  const handleCreateProductSubmit = async () => {
    try {
      await createProductForm.validateFields();
    } catch {
      return;
    }
    const values = createProductForm.getFieldsValue();
    let userId = form.getFieldValue("user_id");
    if (!userId) {
      try {
        const stored = localStorage.getItem("user");
        const userObj = stored ? JSON.parse(stored) : null;
        if (userObj?.id != null) userId = String(userObj.id);
      } catch {}
    }
    if (!userId) {
      message.error("User is required. Please ensure you are logged in.");
      return;
    }
    setCreateProductLoading(true);
    try {
      const response = await axios.post(
        `${API_BASE_URL}/products/`,
        {
          product_name: values.product_name?.trim() || "",
          product_number: values.product_number?.trim() || "",
          product_version: values.product_version?.trim() || "1.0",
          user_id: parseInt(userId, 10),
        },
        {
          headers: { "Content-Type": "application/json" },
        }
      );
      const newProduct = response.data;
      await fetchProducts?.();
      form.setFieldsValue({ product_id: newProduct.id.toString() });
      setCreateProductModalOpen(false);
      createProductForm.resetFields();
      message.success(`Product "${newProduct.product_name || newProduct.product_number}" created and selected.`);
    } catch (error) {
      console.error("Error creating product:", error);
      const detail =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        error?.message ||
        "Error creating product";
      message.error(detail);
    } finally {
      setCreateProductLoading(false);
    }
  };


  useEffect(() => {
    if (isOpen) {
      fetchUsersForRoles();
      if (editingOrder) {
        // Ensure customer and product names are available even if the arrays are empty
        const customerValue = editingOrder.customer_id?.toString() ?? "";
        const productValue = editingOrder.product_id?.toString() ?? "";

        form.setFieldsValue({
          ...editingOrder,
          customer_id: customerValue,
          product_id: productValue,
          quantity: editingOrder.quantity?.toString() ?? "",
          due_date: editingOrder.due_date ? dayjs(editingOrder.due_date) : null,
          order_date: editingOrder.order_date ? dayjs(editingOrder.order_date) : null,
          user_id: editingOrder.user_id?.toString() ?? "",
          admin_id: editingOrder.admin_id?.toString() ?? undefined,
          manufacturing_coordinator_id: editingOrder.manufacturing_coordinator_id?.toString() ?? undefined,
        });
      } else {
        form.resetFields();
        form.setFieldsValue({
          status: "Pending",
        });
        setDocuments([]);

        try {
          const stored = localStorage.getItem("user");
          if (stored) {
            const userObj = JSON.parse(stored);
            if (userObj?.id != null) {
              form.setFieldsValue({ user_id: String(userObj.id) });
            }
            if (userObj?.user_name) {
              form.setFieldsValue({ user_name_display: userObj.user_name });
            }
          }
        } catch {}
      }
    }
  }, [isOpen, editingOrder, form]);

  // Keep due_date consistent with order_date:
  // - Disable due_date when no order_date
  // - Clear due_date if it is same day or before order_date
  useEffect(() => {
    const od = orderDateWatch;
    if (!od) {
      if (form.getFieldValue('due_date')) {
        form.setFieldsValue({ due_date: null });
      }
      return;
    }
    const due = form.getFieldValue('due_date');
    if (due && (!dayjs(due).isAfter(dayjs(od), 'day'))) {
      form.setFieldsValue({ due_date: null });
    }
  }, [orderDateWatch, form]);


  const handleSubmit = async (values) => {
    setLoading(true);

    try {
      const url = editingOrder 
        ? `${API_BASE_URL}/orders/${editingOrder.id}`
        : `${API_BASE_URL}/orders/`;
      
      const method = editingOrder ? 'PUT' : 'POST';
      
      const payload = {
        sale_order_number: values.sale_order_number?.trim()?.toUpperCase(),
        quantity: parseInt(values.quantity),
        customer_id: parseInt(values.customer_id),
        product_id: parseInt(values.product_id),
        status: values.status,
        // user_id always represents whoever is logged in (project coordinator for this screen)
        user_id: values.user_id ? parseInt(values.user_id, 10) : undefined,
        // Admin selected in dropdown
        admin_id:
          values.admin_id === undefined || values.admin_id === ""
            ? null
            : parseInt(values.admin_id, 10),
        // For orders created from the Project Coordinator app, also stamp the
        // creator as project_coordinator_id so backend filters work.
        project_coordinator_id: values.user_id ? parseInt(values.user_id, 10) : null,
        manufacturing_coordinator_id:
          values.manufacturing_coordinator_id === undefined || values.manufacturing_coordinator_id === ""
            ? null
            : parseInt(values.manufacturing_coordinator_id),
      };

      // Dates: include null explicitly when cleared so updates can remove values
      if (values.order_date) {
        try { payload.order_date = dayjs(values.order_date).toISOString(); }
        catch { payload.order_date = null; }
      } else { payload.order_date = null; }
      
      if (values.due_date) {
        try { payload.due_date = dayjs(values.due_date).toISOString(); }
        catch { payload.due_date = null; }
      } else { payload.due_date = null; }

      if (!editingOrder && documents.some(doc =>
        doc.document_type === "Other" &&
        !(doc.document_type_other && doc.document_type_other.trim())
      )) {
        message.error("Please enter document type name for all 'Other' order documents");
        setLoading(false);
        return;
      }

      const response = await axios({
        url,
        method,
        headers: {
          "Content-Type": "application/json",
        },
        data: payload,
      });

      if (response.status >= 200 && response.status < 300) {
        const result = response.data;
        
        // Upload documents if this is a new order and documents are provided
        if (!editingOrder && documents.length > 0) {
          await uploadDocumentsForOrder(result.id);
        }
        
        onOrderCreated(result);
        handleClose();
      } else {
        const errorData = response.data || {};
        message.error(errorData.detail || "Failed to save order");
      }
    } catch (error) {
      console.error("Error saving order:", error);
      const detail =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        error?.message ||
        "Error saving order";
      message.error(detail);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    form.resetFields();
    setDocuments([]);
    onClose();
  };

  const handleDocumentAdd = () => {
    setDocuments([
      ...documents,
      {
        file: null,
        document_name: "",
        document_type: "Other",
        document_type_other: "",
        document_version: "v1.0",
        
      },
    ]);
  };

  const handleDocumentRemove = (index) => {
    const newDocuments = documents.filter((_, i) => i !== index);
    setDocuments(newDocuments);
  };

  const handleDocumentChange = (index, field, value) => {
    const newDocuments = [...documents];
    newDocuments[index][field] = value;
    setDocuments(newDocuments);
  };

  const uploadDocumentsForOrder = async (orderId) => {
    for (const doc of documents) {
      if (doc.file) {
        const uploadFormData = new FormData();
        uploadFormData.append("file", doc.file);
        uploadFormData.append("document_name", doc.document_name || doc.file?.name || "Document");
        let docType = doc.document_type || "Document";
        if (docType === "Other" && doc.document_type_other && doc.document_type_other.trim()) {
          docType = doc.document_type_other.trim();
        }
        uploadFormData.append("document_type", docType);
        uploadFormData.append("document_version", "v1.0"); // Hardcoded to v1.0 for new order creation

        try {
          await axios.post(
            `${API_BASE_URL}/order-documents/upload/${orderId}`,
            uploadFormData
          );
        } catch (error) {
          console.error("Error uploading document:", error);
        }
      }
    }
  };

  return (
    <>
    <Modal
      open={isOpen}
      onCancel={handleClose}
      footer={null}
      width="95%"
      style={{ maxWidth: 1100 }}
      centered
      maskClosable={false}
      keyboard={false}
      title={
        <div className="flex items-center gap-2">
          <FileTextOutlined className="text-blue-500" />
          <span className="font-bold text-gray-800 text-sm sm:text-base">
            {editingOrder ? "Edit Order" : "Create New Order"}
          </span>
        </div>
      }
    >
      <style>{`
        .hide-optional .ant-form-item-optional { display: none !important; }
        @media (max-width: 768px) {
          .ant-modal-body {
            padding: 12px;
          }
          .ant-form-item {
            margin-bottom: 12px;
          }
        }
      `}</style>
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        className="mt-2"
        initialValues={{
          sale_order_number: "",
          customer_id: "",
          product_id: "",
          quantity: "",
          status: "Pending",
          user_name_display: "",
          user_id: "",
        }}
      >
        <Row gutter={[12, 0]}>
          <Col xs={24} sm={12} md={6}>
            <Form.Item
              name="user_name_display"
              label={<span className="text-xs font-bold text-gray-600 uppercase tracking-wider">User</span>}
              className="mb-4 hide-optional"
            >
              <Input placeholder="Name" className="rounded-md border-gray-300 h-10" disabled readOnly />
            </Form.Item>
          </Col>
          <Form.Item name="user_id" hidden rules={[{ required: true, message: 'Required' }]}>
            <input type="hidden" />
          </Form.Item>
        </Row>
        <div className="bg-gray-50 p-3 sm:p-4 rounded-lg lg:rounded-xl border border-gray-200 mb-4 sm:mb-6 shadow-sm">
          <Row gutter={[12, 0]}>
            <Col xs={24} sm={12} md={6}>
              <Form.Item
                name="sale_order_number"
                label={<span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Project Number</span>}
                rules={[{ required: true, message: 'Required' }]}
                className="mb-4"
                getValueFromEvent={(e) => e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 30)}
              >
                <Input placeholder="Enter Project Number" className="rounded-md border-gray-300 h-10" autoComplete="off" maxLength={30} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={9}>
              <Form.Item
                name="product_id"
                label={<span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Project Name</span>}
                rules={[{ required: true, message: 'Required' }]}
                className="mb-4"
              >
                <Select 
                  placeholder="Select project" 
                  className="h-10"
                  open={productSelectOpen}
                  onOpenChange={handleProductDropdown}
                  popupRender={editingOrder ? undefined : (menu) => (
                    <>
                      {menu}
                      <div className="p-2 border-t border-gray-200 bg-gray-50">
                        <Button
                          type="dashed"
                          icon={<PlusOutlined />}
                          block
                          onClick={openCreateProductModal}
                          className="text-blue-600 border-blue-200 hover:border-blue-400 hover:text-blue-700"
                        >
                          Create new project
                        </Button>
                      </div>
                    </>
                  )}
                >
                  {products.map((product) => (
                    <Option key={product.id} value={product.id.toString()}>
                      {product.product_name || product.product_number || `Project ${product.id}`}
                    </Option>
                  ))}
                  {editingOrder && editingOrder.product_id && !products.find(p => p.id === editingOrder.product_id) && (
                    <Option key={editingOrder.product_id} value={editingOrder.product_id.toString()}>
                      {editingOrder.product_name || `Project ${editingOrder.product_id}`}
                    </Option>
                  )}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={24} md={9}>
              <Form.Item
                name="customer_id"
                label={<span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Customer</span>}
                rules={[{ required: true, message: 'Required' }]}
                className="mb-4"
              >
                <Select 
                  placeholder="Select customer" 
                  className="h-10 custom-select-v2"
                  onOpenChange={handleCustomerDropdown}
                  showSearch
                  optionFilterProp="children"
                >
                  {customers.map((customer) => {
                    const label = customer.branch
                      ? `${customer.company_name} (${customer.branch})`
                      : customer.company_name;
                    return (
                      <Option key={customer.id} value={customer.id.toString()}>
                        {label}
                      </Option>
                    );
                  })}
                  {editingOrder && editingOrder.customer_id && !customers.find(c => c.id === editingOrder.customer_id) && (
                    <Option key={editingOrder.customer_id} value={editingOrder.customer_id.toString()}>
                      {editingOrder.customer_branch
                        ? `${editingOrder.company_name || editingOrder.customer_name || `Customer ${editingOrder.customer_id}`} (${editingOrder.customer_branch})`
                        : (editingOrder.company_name || editingOrder.customer_name || `Customer ${editingOrder.customer_id}`)}
                    </Option>
                  )}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={[12, 0]}>
            <Col xs={24} sm={12} md={4}>
              <Form.Item
                name="admin_id"
                label={<span className="text-xs font-bold text-gray-600 uppercase tracking-wider whitespace-nowrap">Admin</span>}
                className="mb-0"
              >
                <Select
                  placeholder="Select"
                  className="h-10"
                  allowClear
                  showSearch
                  optionFilterProp="children"
                >
                  {projectCoordinators.map((u) => (
                    <Option key={u.id} value={u.id.toString()}>
                      {u.user_name || `User ${u.id}`}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={4}>
              <Form.Item
                name="manufacturing_coordinator_id"
                label={<span className="text-xs font-bold text-gray-600 uppercase tracking-wider whitespace-nowrap">Mfg Coordinator</span>}
                className="mb-0"
              >
                <Select
                  placeholder="Select"
                  className="h-10"
                  allowClear
                  showSearch
                  optionFilterProp="children"
                  disabled
                >
                  {manufacturingCoordinators.map((u) => (
                    <Option key={u.id} value={u.id.toString()}>
                      {u.user_name || `User ${u.id}`}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={12} sm={6} md={4}>
              <Form.Item
                name="quantity"
                label={<span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Quantity</span>}
                rules={[{ required: true, message: 'Required' }]}
                className="mb-0"
                validateStatus={decimalWarnings['quantity'] ? 'warning' : ''}
                help={decimalWarnings['quantity']}
              >
                <InputNumber 
                  placeholder="Qty" 
                  className="h-10 rounded-md border-gray-300 w-full" 
                  min={1} 
                  max={99999}
                  precision={0}
                  stringMode
                  parser={(val) => limitDecimals(val, 'quantity', 0)}
                  onKeyDown={(e) => blockExtraDecimals(e, 'quantity', 0)}
                />
              </Form.Item>
            </Col>
            <Col xs={12} sm={9} md={4}>
              <Form.Item
                name="order_date"
                label={<span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Order Date</span>}
                className="mb-0"
              >
                <DatePicker 
                  className="h-10 rounded-md border-gray-300 w-full" 
                  format="DD-MM-YYYY"
                  placeholder="DD-MM-YYYY"
                  inputReadOnly
                />
              </Form.Item>
            </Col>
            <Col xs={12} sm={9} md={4}>
              <Form.Item
                name="due_date"
                label={<span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Due Date</span>}
                rules={[
                  {
                    validator: (_, value) => {
                      const od = form.getFieldValue('order_date');
                      if (!value) return Promise.resolve();
                      if (!od) return Promise.reject(new Error('Select Order Date first'));
                      return dayjs(value).isAfter(dayjs(od), 'day')
                        ? Promise.resolve()
                        : Promise.reject(new Error('Due Date must be after Order Date'));
                    }
                  }
                ]}
                className="mb-0"
              >
                <DatePicker 
                  className="h-10 rounded-md border-gray-300 w-full" 
                  format="DD-MM-YYYY"
                  placeholder="DD-MM-YYYY"
                  inputReadOnly
                  onOpenChange={(open) => {
                    if (open && !form.getFieldValue('order_date')) {
                      // Prevent opening Due Date calendar without Order Date
                      return false;
                    }
                  }}
                  allowClear
                  disabled={!orderDateWatch}
                  disabledDate={(current) => {
                    const od = form.getFieldValue('order_date');
                    if (!od) return true;
                    // Disable same-day and earlier; allow only strictly after
                    return current && !current.isAfter(dayjs(od), 'day');
                  }}
                />
              </Form.Item>
            </Col>
            <Col xs={12} sm={6} md={4}>
              <Form.Item
                name="status"
                label={<span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Status</span>}
                className="mb-0"
              >
                <Input className="h-10 rounded-md border-gray-300 w-full" disabled />
              </Form.Item>
            </Col>
          </Row>
        </div>
        
        {/* Document Upload Section - Only for new orders */}
        {!editingOrder && (
          <div className="mt-4 sm:mt-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-3 sm:mb-4 px-1 gap-2">
              <h4 className="text-sm sm:text-base font-bold text-gray-800 flex items-center gap-2 m-0">
                <FileTextOutlined className="text-blue-500" />
                Order Documents (Optional)
              </h4>
              <Button
                type="dashed"
                icon={<UploadOutlined />}
                onClick={handleDocumentAdd}
                className="flex items-center gap-1 w-full sm:w-auto"
                size="middle"
              >
                Add Document
              </Button>
            </div>

            {documents.length === 0 ? (
              <div className="text-center py-6 sm:py-8 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50">
                <UploadOutlined className="text-2xl sm:text-3xl text-gray-300 mb-2" />
                <p className="text-gray-500 m-0 text-sm">No documents added yet</p>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-x-auto bg-white">
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-2 sm:px-4 py-3 text-[10px] uppercase font-bold text-gray-500 w-[5%] text-center">#</th>
                      <th className="px-2 sm:px-4 py-3 text-[10px] uppercase font-bold text-gray-500 w-[25%]">File Selection</th>
                      <th className="px-2 sm:px-4 py-3 text-[10px] uppercase font-bold text-gray-500 w-[25%]">Document Name</th>
                      <th className="px-2 sm:px-4 py-3 text-[10px] uppercase font-bold text-gray-500 w-[30%]">Document Type</th>
                      <th className="px-2 sm:px-4 py-3 text-[10px] uppercase font-bold text-gray-500 w-[10%] text-center">Ver</th>
                      <th className="px-2 sm:px-4 py-3 text-[10px] uppercase font-bold text-gray-500 w-[5%] text-center">Del</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc, index) => (
                      <tr key={index} className="border-b border-gray-100 last:border-0 hover:bg-blue-50/20 transition-all align-middle">
                        <td className="px-2 sm:px-4 py-4 sm:py-6 text-center align-middle">
                          <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md border border-blue-100">
                            {index + 1}
                          </span>
                        </td>
                        <td className="px-2 sm:px-4 py-4 sm:py-6 align-middle">
                          <div className="relative h-10">
                            <input
                              type="file"
                              id={`file-upload-${index}`}
                              style={{ display: 'none' }}
                              onChange={(e) => {
                                const file = e.target.files[0];
                                handleDocumentChange(index, 'file', file);
                                if (file && !doc.document_name) {
                                  handleDocumentChange(index, 'document_name', file.name.split('.')[0]);
                                }
                              }}
                            />
                            <Button
                              icon={<UploadOutlined />}
                              onClick={() => document.getElementById(`file-upload-${index}`).click()}
                              className={`h-10 rounded-md border-dashed flex items-center justify-center transition-all text-xs sm:text-sm ${
                                doc.file 
                                  ? "bg-blue-50 border-blue-400 text-blue-600 font-bold" 
                                  : "bg-gray-50 border-gray-300 text-gray-500 hover:border-blue-500 hover:text-blue-500"
                              }`}
                              block
                            >
                              {doc.file ? "Change File" : "Choose File"}
                            </Button>
                            {doc.file && (
                              <div className="absolute left-0 -bottom-5 text-[10px] text-blue-600 font-medium truncate w-full px-1 italic leading-none">
                                Selected: {doc.file.name}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-2 sm:px-4 py-4 sm:py-6 align-middle">
                          <Input
                            value={doc.document_name}
                            onChange={(e) => handleDocumentChange(index, 'document_name', e.target.value)}
                            placeholder="Enter document name"
                            className={`text-xs sm:text-sm h-10 rounded-md border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition-all placeholder:text-gray-400 ${doc.document_name ? 'bg-blue-50/10 border-blue-200 font-medium text-blue-700' : ''}`}
                          />
                        </td>
                        <td className="px-2 sm:px-4 py-4 sm:py-6 align-middle">
                          <div className="flex flex-col sm:flex-row gap-2 w-full">
                            <div className="w-full sm:w-[35%]">
                              <Select
                                value={doc.document_type}
                                onChange={(value) => handleDocumentChange(index, 'document_type', value)}
                                placeholder="Select Type"
                                className="text-xs sm:text-sm h-10 custom-select-v2 w-full"
                                size="middle"
                              >
                                <Option value="Other">Other</Option>
                              </Select>
                            </div>
                            {doc.document_type === "Other" && (
                              <div className="flex-1">
                                <Input
                                  value={doc.document_type_other}
                                  onChange={(e) =>
                                    handleDocumentChange(index, "document_type_other", e.target.value)
                                  }
                                  placeholder="Enter document type name"
                                  className="text-xs sm:text-sm h-10 rounded-md border-gray-300 w-full"
                                />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-2 sm:px-4 py-4 sm:py-6 text-center align-middle">
                          <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 sm:px-3 py-1.5 rounded-md border border-gray-200">
                            v1.0
                          </span>
                        </td>
                        <td className="px-2 sm:px-4 py-4 sm:py-6 text-center align-middle">
                          <Button
                            type="text"
                            danger
                            icon={<CloseOutlined className="text-base sm:text-lg" />}
                            onClick={() => handleDocumentRemove(index)}
                            className="hover:bg-red-50 rounded-full w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center transition-all hover:scale-110"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        
        <div className="flex flex-col sm:flex-row justify-end gap-3 mt-6 sm:mt-8 pt-4 border-t border-gray-100">
          <Button 
            onClick={handleClose} 
            size="large" 
            className="rounded-md px-8 w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button 
            type="primary" 
            htmlType="submit" 
            loading={loading} 
            size="large"
            className="no-hover-btn rounded-md px-10 font-semibold w-full sm:w-auto"
          >
            {editingOrder ? "Update Order" : "Create Order"}
          </Button>
        </div>
      </Form>
    </Modal>

    {/* Create new product (from order flow) */}
    <Modal
      title="Create new project"
      open={createProductModalOpen}
      onCancel={() => setCreateProductModalOpen(false)}
      footer={[
        <Button key="cancel" onClick={() => setCreateProductModalOpen(false)}>Cancel</Button>,
        <Button key="submit" type="primary" loading={createProductLoading} onClick={handleCreateProductSubmit}>
          Create & select
        </Button>,
      ]}
      destroyOnHidden
      width="90%"
      style={{ maxWidth: 400 }}
    >
      <Form form={createProductForm} layout="vertical" className="mt-2">
        <Form.Item
          name="product_name"
          label="Project name"
          rules={[{ required: true, message: "Required" }]}
        >
          <Input placeholder="e.g. Widget A" />
        </Form.Item>
        <Form.Item
          name="product_number"
          label="Project number"
          rules={[{ required: true, message: "Required" }]}
        >
          <Input placeholder="e.g. PRD-001" />
        </Form.Item>
        <Form.Item
          name="product_version"
          label={<span className="text-xs sm:text-sm font-bold text-gray-600 uppercase tracking-wider">Product Version</span>}
          initialValue="1.0"
          rules={[{ required: true, message: "Required" }]}
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
      </Form>
    </Modal>
    </>
  );
};

export default OrderModal;
