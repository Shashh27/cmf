import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth";
import { Table, Button, Empty, Tag, Space, Tooltip, Card, Input, Modal, Form, Row, Col, InputNumber, Select, message } from "antd";
import { 
  ExperimentOutlined, 
  PlusOutlined, 
  EditOutlined, 
  DeleteOutlined 
} from "@ant-design/icons";
import { RawMaterialsInventoryPdfDownload } from "../DownloadReports/RawMaterialsPdfDownload";

const { Option } = Select;

const RawMaterialsTab = ({ rawMaterials: propRawMaterials, onRawMaterialsChange, onRefresh }) => {
  const [form] = Form.useForm();
  const [rawMaterials, setRawMaterials] = useState(propRawMaterials || []);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [rawMaterialsPagination, setRawMaterialsPagination] = useState({ current: 1, pageSize: 15 });
  const [rawMaterialModalOpen, setRawMaterialModalOpen] = useState(false);
  const [editingRawMaterial, setEditingRawMaterial] = useState(null);
  const [savingRawMaterial, setSavingRawMaterial] = useState(false);
  const [selectedStockType, setSelectedStockType] = useState("");
  const [isCustomStockType, setIsCustomStockType] = useState(false);
  const [decimalWarnings, setDecimalWarnings] = useState({});

  const fetchingRawMaterials = useRef(false);
  const initializedRef = useRef(false);

  const getCurrentUserId = () => {
    try {
      const stored = localStorage.getItem("user");
      if (!stored) return null;
      const u = JSON.parse(stored);
      if (u?.id == null) return null;
      return u.id;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    // Update local rawMaterials when props change
    if (propRawMaterials) {
      setRawMaterials(propRawMaterials);
    }
  }, [propRawMaterials]);

  const fetchRawMaterials = async () => {
    if (fetchingRawMaterials.current) return;
    fetchingRawMaterials.current = true;
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/rawmaterials/`);
      const data = response.data;
      const newData = Array.isArray(data) ? data : [];
      setRawMaterials(newData);
      if (onRawMaterialsChange) {
        onRawMaterialsChange(newData);
      }
    } catch (error) {
      console.error("Error fetching raw materials:", error);
      setRawMaterials([]);
      if (onRawMaterialsChange) {
        onRawMaterialsChange([]);
      }
    } finally {
      setLoading(false);
      fetchingRawMaterials.current = false;
    }
  };

  const openCreateRawMaterial = () => {
    setEditingRawMaterial(null);
    setSelectedStockType("");
    setIsCustomStockType(false);
    form.resetFields();
    setRawMaterialModalOpen(true);
  };

  const openEditRawMaterial = (material) => {
    setEditingRawMaterial(material);
    const stockType = material.stock_type || "";
    const isCustom = !["Sheet Metal", "Rod", "Solid Bar"].includes(stockType);
    setSelectedStockType(isCustom ? "Other" : stockType);
    setIsCustomStockType(isCustom);
    form.setFieldsValue({
      material_name: material.material_name || "",
      material_specification: material.material_specification || "",
      mass: material.mass ?? "",
      density: material.density ?? "",
      volume: material.volume ?? "",
      stock_type: stockType,
      quantity: material.quantity ?? "",
      stock_dimensions: material.stock_dimensions || "",
    });
    setRawMaterialModalOpen(true);
  };

  const closeRawMaterialModal = () => {
    setRawMaterialModalOpen(false);
    setEditingRawMaterial(null);
    setSelectedStockType("");
    setIsCustomStockType(false);
  };

  const limitDecimals = (value, fieldName, precision = 3) => {
    if (value === null || value === undefined || value === '') return value;
    const cleaned = String(value).replace(/[^0-9.]/g, '');
    let str = cleaned;
    
    if (precision === 0) {
      str = str.replace(/\./g, '');
      if (str.length > 5) {
        showDecimalWarning(fieldName, 0, 'Max 5 digits allowed');
        return str.slice(0, 5);
      }
      return str;
    }

    if (str.includes('.')) {
      const [int, dec] = str.split('.');
      let finalInt = int;
      if (int.length > 6) {
        showDecimalWarning(fieldName, precision, 'Max 6 digits allowed before decimal');
        finalInt = int.slice(0, 6);
      }
      
      if (dec.length > precision) {
        showDecimalWarning(fieldName, precision);
        return `${finalInt}.${dec.slice(0, precision)}`;
      }
      return `${finalInt}.${dec}`;
    } else {
      if (str.length > 6) {
        showDecimalWarning(fieldName, precision, 'Max 6 digits allowed before decimal');
        return str.slice(0, 6);
      }
    }
    return str;
  };

  const showDecimalWarning = (fieldName, precision, customMsg) => {
    if (!fieldName) return;
    const msg = customMsg ?? (precision === 0 ? "Only whole numbers allowed" : `Max ${precision} decimal places allowed`);
    setDecimalWarnings(prev => ({ ...prev, [fieldName]: msg }));
    setTimeout(() => {
      setDecimalWarnings(prev => ({ ...prev, [fieldName]: null }));
    }, 3000);
  };

  const blockExtraDecimals = (e, fieldName, precision = 3) => {
    const { value } = e.target;
    const controlKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Escape', 'Control'];
    if (controlKeys.includes(e.key) || e.ctrlKey || e.metaKey) return;
    if (!/[0-9.]/.test(e.key)) { e.preventDefault(); return; }
    if (precision === 0 && e.key === '.') { showDecimalWarning(fieldName, 0); e.preventDefault(); return; }

    if (/[0-9]/.test(e.key)) {
      const hasSelection = e.target.selectionStart !== e.target.selectionEnd;
      if (precision === 0) {
        const digitsOnly = String(value).replace(/\D/g, '');
        if (digitsOnly.length >= 5 && !hasSelection) {
          showDecimalWarning(fieldName, 0, 'Max 5 digits allowed');
          e.preventDefault();
          return;
        }
      } else {
        const parts = value.split('.');
        const selectionStart = e.target.selectionStart;
        const dotIndex = value.indexOf('.');
        if ((dotIndex === -1 || selectionStart <= dotIndex) && !hasSelection) {
          const integerPart = dotIndex === -1 ? value : parts[0];
          if (integerPart.length >= 6) {
            showDecimalWarning(fieldName, precision, 'Max 6 digits allowed before decimal');
            e.preventDefault();
            return;
          }
        }
      }
    }
    if (e.key === '.' && value.includes('.')) { e.preventDefault(); return; }
    if (value.includes('.')) {
      const parts = value.split('.');
      const selectionStart = e.target.selectionStart;
      const dotIndex = value.indexOf('.');
      if (selectionStart > dotIndex && parts[1].length >= precision) {
        if (e.target.selectionStart === e.target.selectionEnd) {
          showDecimalWarning(fieldName, precision);
          e.preventDefault();
        }
      }
    }
  };

  const handleSaveRawMaterial = async (values) => {
    setSavingRawMaterial(true);
    try {
      const isEdit = !!editingRawMaterial?.id;
      const url = isEdit ? `${API_BASE_URL}/rawmaterials/${editingRawMaterial.id}` : `${API_BASE_URL}/rawmaterials/`;
      const method = isEdit ? "put" : "post";

      const payload = {
        material_name: values.material_name,
        material_specification: values.material_specification,
        mass: values.mass === "" ? 0 : Number(values.mass) || 0,
        density: values.density === "" ? 0 : Number(values.density) || 0,
        volume: values.volume === "" ? 0 : Number(values.volume) || 0,
        stock_type: values.stock_type,
        quantity: values.quantity === "" ? 0 : Number(values.quantity) || 0,
        stock_dimensions: values.stock_dimensions,
        user_id: getCurrentUserId(),
      };

      await axios({
        url,
        method,
        headers: { "Content-Type": "application/json" },
        data: payload,
      });

      await fetchRawMaterials();
      message.success(isEdit ? "Raw material updated successfully" : "Raw material created successfully");
      closeRawMaterialModal();
    } catch (error) {
      console.error("Error saving raw material:", error);
      const detail =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        "Error saving raw material";
      message.error(detail);
    } finally {
      setSavingRawMaterial(false);
    }
  };

  const handleDeleteRawMaterial = async (material) => {
    Modal.confirm({
      title: 'Confirm Delete',
      content: `Are you sure you want to delete raw material "${material.material_name}"?`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await axios.delete(`${API_BASE_URL}/rawmaterials/${material.id}`, {
            params: { user_id: getCurrentUserId() ?? undefined },
          });
          await fetchRawMaterials();
          message.success("Raw material deleted successfully");
        } catch (error) {
          console.error("Error deleting raw material:", error);
          const detail =
            error?.response?.data?.detail ||
            error?.response?.data?.message ||
            "Failed to delete raw material";
          message.error(detail);
        }
      }
    });
  };

  const handleSearch = (value) => setSearchText((value || '').replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 20));

  const filteredMaterials = (rawMaterials || []).filter((item) => {
    if (!searchText) return true;
    const searchLower = searchText.toLowerCase();
    return Object.values(item).some(value => 
      value !== null && value !== undefined && 
      String(value).toLowerCase().includes(searchLower)
    );
  }).sort((a, b) => (a.id || 0) - (b.id || 0));

  const columns = [
    {
      title: <span className="font-semibold text-gray-700">#</span>,
      dataIndex: 'index',
      key: 'index',
      width: 60,
      render: (_, __, index) => {
        const { current, pageSize } = rawMaterialsPagination;
        return <span className="text-gray-500 font-mono">{(current - 1) * pageSize + index + 1}</span>;
      },
    },
    {
      title: <span className="font-semibold text-gray-700">Material Name</span>,
      dataIndex: 'material_name',
      key: 'material_name',
      ellipsis: true,
      render: (text) => (
        <Tooltip title={text}>
          <span className="font-medium text-gray-800">{text || "-"}</span>
        </Tooltip>
      ),
    },
    {
      title: <span className="font-semibold text-gray-700">Specification</span>,
      dataIndex: 'material_specification',
      key: 'material_specification',
      ellipsis: true,
      render: (text) => (
        <Tooltip title={text}>
          <span className="text-gray-600">{text || "-"}</span>
        </Tooltip>
      ),
    },
    {
      title: <span className="font-semibold text-gray-700">Mass (kg)</span>,
      dataIndex: 'mass',
      key: 'mass',
      render: (text) => text !== null && text !== undefined ? text : "-",
    },
    {
      title: <span className="font-semibold text-gray-700">Density (kg/m³)</span>,
      dataIndex: 'density',
      key: 'density',
      render: (text) => text !== null && text !== undefined ? text : "-",
    },
    {
      title: <span className="font-semibold text-gray-700">Volume (m³)</span>,
      dataIndex: 'volume',
      key: 'volume',
      render: (text) => text !== null && text !== undefined ? text : "-",
    },
    {
      title: <span className="font-semibold text-gray-700">Stock Type</span>,
      dataIndex: 'stock_type',
      key: 'stock_type',
      render: (text) => text ? <Tag>{text}</Tag> : "-",
    },
    {
      title: <span className="font-semibold text-gray-700">Qty</span>,
      dataIndex: 'quantity',
      key: 'quantity',
      render: (text) => text !== null && text !== undefined ? text : "-",
    },
    {
      title: <span className="font-semibold text-gray-700">Dimensions</span>,
      dataIndex: 'stock_dimensions',
      key: 'stock_dimensions',
      ellipsis: true,
      render: (text) => (
        <Tooltip title={text}>
          <span className="text-gray-600 font-mono text-xs">{text || "-"}</span>
        </Tooltip>
      ),
    },
    {
      title: <span className="font-semibold text-gray-700">Status</span>,
      dataIndex: 'status',
      key: 'status',
      render: (_, record) => {
        const qty = record.quantity ?? 0;
        const text = qty > 0 ? 'AVAILABLE' : 'NOT AVAILABLE';
        const color = qty > 0 ? 'success' : 'error';
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: <span className="font-semibold text-gray-700">Actions</span>,
      key: 'actions',
      width: 140,
      render: (_, record) => (
        <Space>
          <Tooltip title="Edit">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              className="text-blue-500 hover:bg-blue-50"
              onClick={() => openEditRawMaterial(record)}
            />
          </Tooltip>
          <Tooltip title="Delete">
            <Button
              type="text"
              size="small"
              icon={<DeleteOutlined />}
              className="text-red-500 hover:bg-red-50"
              onClick={() => handleDeleteRawMaterial(record)}
            />
          </Tooltip>
        </Space>
      ),
    }
  ];

  return (
    <div className="mt-4">
      <Card 
        className="shadow-sm rounded-lg lg:rounded-xl border border-gray-100" 
        styles={{ body: { padding: 0 } }}
        title={
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3">
                <div className="flex items-center gap-2">
                    <ExperimentOutlined className="text-purple-600" />
                    <span className="font-bold text-gray-800 text-sm sm:text-base">Raw Materials Inventory</span>
                </div>
                <Space className="w-full sm:w-auto flex-col sm:flex-row gap-2">
                  <Input.Search
                    placeholder="Search..."
                    allowClear
                    onSearch={handleSearch}
                    onChange={(e) => handleSearch(e.target.value)}
                    value={searchText}
                    maxLength={20}
                    className="w-full sm:w-64"
                    size="middle"
                  />
                  <div className="flex gap-2 w-full sm:w-auto">
                    <RawMaterialsInventoryPdfDownload rawMaterials={rawMaterials} />
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={openCreateRawMaterial}
                      size="middle"
                      style={{ backgroundColor: '#2563eb' }}
                      className="border-none shadow-md no-hover-btn flex-1 sm:flex-initial"
                    >
                      <span className="hidden sm:inline">Add Raw Material</span>
                      <span className="sm:hidden">Add</span>
                    </Button>
                  </div>
                </Space>
            </div>
        }
      >
        <Table
            columns={columns}
            dataSource={filteredMaterials}
            rowKey="id"
            size="small"
            bordered
            scroll={{ x: 1200 }}
            pagination={{
              current: rawMaterialsPagination.current,
              pageSize: rawMaterialsPagination.pageSize,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
              pageSizeOptions: ['10', '20', '50', '100'],
              placement: 'bottom',
              responsive: true,
            }}
            onChange={(p) => setRawMaterialsPagination({ current: p.current, pageSize: p.pageSize })}
            locale={{ emptyText: <Empty description={searchText ? "No raw materials found matching your search" : "No raw materials found"} /> }}
            className="modern-table"
            loading={loading}
        />
      </Card>

      <Modal
        open={rawMaterialModalOpen}
        onCancel={closeRawMaterialModal}
        width="95%"
        style={{ maxWidth: 800 }}
        title={
            <div className="flex items-center gap-2">
                {editingRawMaterial ? <EditOutlined className="text-blue-500" /> : <PlusOutlined className="text-blue-500" />}
                <span className="font-bold text-gray-800 text-sm sm:text-base">{editingRawMaterial ? "Edit Raw Material" : "Add New Raw Material"}</span>
            </div>
        }
        footer={null}
        className="rounded-xl overflow-hidden"
      >
        <Form form={form} layout="vertical" onFinish={handleSaveRawMaterial} className="pt-4">
          <Row gutter={[12, 0]}>
            <Col xs={24} sm={12}>
              <Form.Item name="material_name" label={<span className="font-semibold text-gray-700 text-xs sm:text-sm">Material Name</span>} rules={[{ required: true, message: 'Please enter material name' }, { pattern: /^[a-zA-Z0-9 ]*$/, message: 'Only letters, numbers, and spaces are allowed' }]} normalize={(v) => (v || '').replace(/[^a-zA-Z0-9 ]/g, '')}>
                <Input placeholder="Enter material name" size="large" className="rounded-md" autoComplete="off" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="material_specification" label={<span className="font-semibold text-gray-700 text-xs sm:text-sm">Specification</span>} rules={[{ pattern: /^[a-zA-Z0-9 ]*$/, message: 'Only letters, numbers, and spaces are allowed' }]} normalize={(v) => (v || '').replace(/[^a-zA-Z0-9 ]/g, '')}>
                <Input placeholder="Enter specification" size="large" className="rounded-md" autoComplete="off" />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8}>
              <Form.Item name="mass" label={<span className="font-semibold text-gray-700 text-xs sm:text-sm">Mass (kg)</span>} validateStatus={decimalWarnings['mass'] ? 'warning' : ''} help={decimalWarnings['mass']}>
                <InputNumber style={{ width: '100%' }} min={0} precision={3} step={0.001} placeholder="0.000 kg" size="large" className="rounded-md" stringMode parser={(v) => limitDecimals(v, 'mass', 3)} onKeyDown={(e) => blockExtraDecimals(e, 'mass', 3)} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8}>
              <Form.Item name="density" label={<span className="font-semibold text-gray-700 text-xs sm:text-sm">Density (kg/m³)</span>} validateStatus={decimalWarnings['density'] ? 'warning' : ''} help={decimalWarnings['density']}>
                <InputNumber style={{ width: '100%' }} min={0} precision={3} step={0.001} placeholder="0.000 kg/m³" size="large" className="rounded-md" stringMode parser={(v) => limitDecimals(v, 'density', 3)} onKeyDown={(e) => blockExtraDecimals(e, 'density', 3)} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8}>
              <Form.Item name="volume" label={<span className="font-semibold text-gray-700 text-xs sm:text-sm">Volume (m³)</span>} validateStatus={decimalWarnings['volume'] ? 'warning' : ''} help={decimalWarnings['volume']}>
                <InputNumber style={{ width: '100%' }} min={0} precision={3} step={0.001} placeholder="0.000 m³" size="large" className="rounded-md" stringMode parser={(v) => limitDecimals(v, 'volume', 3)} onKeyDown={(e) => blockExtraDecimals(e, 'volume', 3)} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={12}>
              <Form.Item name="stock_type" label={<span className="font-semibold text-gray-700 text-xs sm:text-sm">Stock Type</span>}>
                {isCustomStockType ? (
                  <div className="flex gap-2">
                    <Input placeholder="Enter custom stock type" size="large" className="rounded-md flex-1" autoComplete="off" onChange={(e) => form.setFieldValue('stock_type', e.target.value)} />
                    <Button type="default" size="large" onClick={() => { setIsCustomStockType(false); setSelectedStockType(""); form.setFieldValue('stock_type', ''); form.setFieldValue('stock_dimensions', ''); }} className="rounded-md">Back</Button>
                  </div>
                ) : (
                  <Select placeholder="Select stock type" size="large" className="rounded-md" value={selectedStockType} onChange={(v) => { if (v === "Other") { setSelectedStockType("Other"); setIsCustomStockType(true); form.setFieldValue('stock_type', ''); } else { setSelectedStockType(v); setIsCustomStockType(false); form.setFieldValue('stock_type', v); } form.setFieldValue('stock_dimensions', ''); }} allowClear>
                    <Option value="Sheet Metal">Sheet Metal</Option>
                    <Option value="Rod">Rod</Option>
                    <Option value="Solid Bar">Solid Bar</Option>
                    <Option value="Other">Other (Custom)</Option>
                  </Select>
                )}
              </Form.Item>
            </Col>
            <Col xs={12} sm={12}>
              <Form.Item name="quantity" label={<span className="font-semibold text-gray-700 text-xs sm:text-sm">Quantity</span>} validateStatus={decimalWarnings['modal-qty'] ? 'warning' : ''} help={decimalWarnings['modal-qty']}>
                <InputNumber style={{ width: '100%' }} min={0} precision={0} step={1} max={99999} placeholder="0" size="large" className="rounded-md" autoComplete="off" stringMode parser={(v) => limitDecimals(v, 'modal-qty', 0)} onKeyDown={(e) => blockExtraDecimals(e, 'modal-qty', 0)} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="stock_dimensions" label={<span className="font-semibold text-gray-700 text-xs sm:text-sm">Dimensions (mm)</span>}>
                <Input placeholder={selectedStockType === "Sheet Metal" ? "Length × Width × Thickness (mm)" : selectedStockType === "Rod" ? "Diameter × Length (mm)" : selectedStockType === "Solid Bar" ? "Length × Width × Height (mm)" : "Enter dimensions (mm)"} size="large" className="rounded-md" autoComplete="off" />
              </Form.Item>
            </Col>
          </Row>
          <div className="flex flex-col sm:flex-row justify-end gap-3 mt-6 sm:mt-8 pt-4 border-t border-gray-100">
            <Button onClick={closeRawMaterialModal} size="large" className="rounded-md w-full sm:w-auto">Cancel</Button>
            <Button type="primary" htmlType="submit" loading={savingRawMaterial} size="large" style={{ backgroundColor: '#2563eb' }} className="rounded-md border-none shadow-md no-hover-btn w-full sm:w-auto">
              {savingRawMaterial ? "Saving..." : (editingRawMaterial ? "Update Material" : "Create Material")}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default RawMaterialsTab;
