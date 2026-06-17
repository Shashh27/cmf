import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth";
import { Table, Button, Empty, Tag, Space, Tooltip, Card, Input, Modal, Form, Row, Col, InputNumber, Select, Tabs, App, Segmented } from "antd";
import { 
  ExperimentOutlined, 
  PlusOutlined, 
  EditOutlined, 
  DeleteOutlined,
  DatabaseOutlined
} from "@ant-design/icons";
import { RawMaterialsInventoryPdfDownload } from "../DownloadReports/RawMaterialsPdfDownload";
import { StockDetailsPdfDownload } from "../DownloadReports/StockDetailsPdfDownload";
import RawMaterialInventoryView from "./RawMaterialInventoryView";

const { Option } = Select;

const RawMaterialsTab = ({ rawMaterials: propRawMaterials, onRawMaterialsChange }) => {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const [rawMaterials, setRawMaterials] = useState(propRawMaterials || []);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [rawMaterialsPagination, setRawMaterialsPagination] = useState({ current: 1, pageSize: 15 });
  const [rawMaterialModalOpen, setRawMaterialModalOpen] = useState(false);
  const [editingRawMaterial, setEditingRawMaterial] = useState(null);
  const [savingRawMaterial, setSavingRawMaterial] = useState(false);
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [selectedMaterialStock, setSelectedMaterialStock] = useState(null);
  const [stockLoading, setStockLoading] = useState(false);
  const [selectedMaterialForStock, setSelectedMaterialForStock] = useState(null);
  const [stockPagination, setStockPagination] = useState({ current: 1, pageSize: 5 });
  const [stockFilters, setStockFilters] = useState({
    sourceType: null,
    formType: null,
    processType: null,
    orderNumber: null,
    partNumber: null,
  });
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('rmViewMode') || 'list');
  const [invSearch, setInvSearch] = useState("");
  const [invFilters, setInvFilters] = useState({ fMaterial: [], fSource: [], fOrder: [], fPart: [], fStockStatus: [], fUnitStatus: [] });
  const [invFilterOptions, setInvFilterOptions] = useState({ materials: [], orders: [], partsByOrder: {} });

  const [invRows, setInvRows] = useState([]);
  const setF = (key, val) => setInvFilters(prev => ({ ...prev, [key]: val || [] }));
  const handleFilterOptionsReady = useCallback((opts) => setInvFilterOptions(opts), []);
  const handleRowsReady = useCallback((r) => setInvRows(r), []);

  const handleViewModeChange = (val) => {
    localStorage.setItem('rmViewMode', val);
    setViewMode(val);
  };

  const fetchingRawMaterials = useRef(false);

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
      const uid = getCurrentUserId();
      const response = await axios.get(`${API_BASE_URL}/rawmaterials/`, {
        params: uid != null ? { admin_id: uid } : undefined,
      });
      const materials = response.data || [];

      // Backend already returns materials with stock status
      // No need for individual stock calls
      setRawMaterials(materials);
      if (onRawMaterialsChange) {
        onRawMaterialsChange(materials);
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

  const fetchStockForMaterial = async (materialId) => {
    setStockLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/rawmaterials/stock/`, {
        params: { material_id: materialId }
      });
      setSelectedMaterialStock(response.data || []);
    } catch (error) {
      console.error("Error fetching stock:", error);
      setSelectedMaterialStock([]);
    } finally {
      setStockLoading(false);
    }
  };

  const openStockModal = (material) => {
    setSelectedMaterialForStock(material);
    setSelectedMaterialStock(null);
    setStockPagination({ current: 1, pageSize: 5 });
    setStockFilters({
      sourceType: null,
      formType: null,
      processType: null,
      orderNumber: null,
      partNumber: null,
    });
    setStockModalOpen(true);
    fetchStockForMaterial(material.id);
  };

  const handleDeleteStock = async (stockId) => {
    modal.confirm({
      title: 'Delete Stock',
      content: 'This will delete the stock, all its units, usage records, and clear part references. Are you sure?',
      okText: 'Yes, Delete',
      okType: 'danger',
      cancelText: 'No, Cancel',
      onOk: async () => {
        try {
          await axios.delete(`${API_BASE_URL}/rawmaterials/stock/${stockId}`);
          message.success('Stock deleted successfully!');
          fetchStockForMaterial(selectedMaterialForStock?.id);
        } catch (error) {
          console.error('Error deleting stock:', error);
          message.error(error.response?.data?.detail || 'Failed to delete stock');
        }
      }
    });
  };

  const openCreateRawMaterial = () => {
    setEditingRawMaterial(null);
    form.resetFields();
    setRawMaterialModalOpen(true);
  };

  const openEditRawMaterial = (material) => {
    setEditingRawMaterial(material);
    form.setFieldsValue({
      material_name: material.material_name || "",
      density: material.density ?? "",
      cost: material.cost_per_kg ?? "",
    });
    setRawMaterialModalOpen(true);
  };

  const closeRawMaterialModal = () => {
    setRawMaterialModalOpen(false);
    setEditingRawMaterial(null);
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
        cost_per_kg: values.cost === "" ? null : Number(values.cost) || null,
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
    modal.confirm({
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

  const handleSearch = (value) => {
    // Remove special characters but keep alphanumeric, spaces, and decimal points for number search
    const cleanedValue = (value || '').replace(/[^a-zA-Z0-9 .]/g, '');
    setSearchText(cleanedValue.toLowerCase().slice(0, 50));
  };

  const getFilteredStockData = () => {
    if (!selectedMaterialStock) return [];
    
    return selectedMaterialStock.filter((stock) => {
      if (stockFilters.sourceType && stock.source_type !== stockFilters.sourceType) return false;
      if (stockFilters.formType && stock.form_type !== stockFilters.formType) return false;
      if (stockFilters.processType && stock.process_type !== stockFilters.processType) return false;
      if (stockFilters.orderNumber && !stock.source_order_number?.includes(stockFilters.orderNumber)) return false;
      if (stockFilters.partNumber && !stock.part_numbers?.includes(stockFilters.partNumber)) return false;
      return true;
    });
  };

  const filteredMaterials = (rawMaterials || []).filter((item) => {
    if (!searchText) return true;
    
    const searchLower = searchText.toLowerCase();
    
    // Create a searchable string from all relevant fields
    const searchableContent = [
      item.material_name || '',
      item.density?.toString() || '',
      item.cost_per_kg?.toString() || '',
      item.material_specification || '',
      item.stock_type || '',
      item.stock_dimensions || '',
      // Status search - handle both AVAILABLE and NOT AVAILABLE
      item.has_available_stock ? 'available' : 'not available',
      item.has_available_stock ? 'available' : 'notavailable',
      item.has_available_stock ? 'available' : 'not_available'
    ].join(' ').toLowerCase();
    
    // Create special numeric content that preserves decimal points for number search
    const numericContent = [
      item.density?.toString() || '',
      item.cost_per_kg?.toString() || ''
    ].join(' ').toLowerCase();
    
    // Clean content for special character search (remove everything except alphanumeric and spaces)
    const cleanedContent = searchableContent.replace(/[^a-z0-9 ]/g, '');
    
    // Check if search term exists in:
    // 1. Original content (with decimals)
    // 2. Cleaned content (without special characters)
    // 3. Numeric content (preserving decimals for number search)
    return searchableContent.includes(searchLower) || 
           cleanedContent.includes(searchLower) || 
           numericContent.includes(searchLower);
  }).sort((a, b) => (a.id || 0) - (b.id || 0));

  const listColumns = [
    {
      title: <span className="font-semibold text-gray-700">Sl No</span>,
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
      title: <span className="font-semibold text-gray-700">Density (kg/m³)</span>,
      dataIndex: 'density',
      key: 'density',
      render: (text) => text !== null && text !== undefined ? text : "-",
    },
    {
      title: <span className="font-semibold text-gray-700">Cost (₹/kg)</span>,
      dataIndex: 'cost_per_kg',
      key: 'cost_per_kg',
      render: (text) => text !== null && text !== undefined ? `₹${text.toFixed(2)}` : "-",
    },
    {
      title: <span className="font-semibold text-gray-700">Actions</span>,
      key: 'actions',
      width: 100,
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
    },
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
                    <span className="font-bold text-gray-800 text-sm sm:text-base">
                      {viewMode === 'inventory' ? 'Raw Materials Inventory' : 'Raw Material List'}
                    </span>
                </div>
                <Space wrap>
                  <Segmented
                    options={[
                      { label: 'List', value: 'list' },
                      { label: 'Inventory', value: 'inventory' },
                    ]}
                    value={viewMode}
                    onChange={handleViewModeChange}
                    size="middle"
                  />
                  {viewMode === 'inventory' && (
                    <>
                      <Input.Search
                        placeholder="Search material / stock..."
                        allowClear
                        value={invSearch}
                        onChange={(e) => setInvSearch(e.target.value)}
                        onSearch={setInvSearch}
                        style={{ width: 200 }}
                        size="middle"
                      />
                      <Select mode="multiple" placeholder="Material" allowClear showSearch optionFilterProp="children" value={invFilters.fMaterial} onChange={v => setF('fMaterial', v)} style={{ minWidth: 160, maxWidth: 260 }} size="middle" maxTagCount="responsive">
                        {invFilterOptions.materials.map(m => <Option key={m.id} value={m.id}>{m.name}</Option>)}
                      </Select>
                      <Select mode="multiple" placeholder="Source" allowClear value={invFilters.fSource} onChange={v => { setInvFilters(p => ({ ...p, fSource: v || [], fOrder: [], fPart: [] })); }} style={{ minWidth: 110, maxWidth: 200 }} size="middle" maxTagCount="responsive">
                        <Option value="general">General</Option>
                        <Option value="order">Order</Option>
                      </Select>
                      <Select mode="multiple" placeholder="Order No" allowClear showSearch optionFilterProp="children" value={invFilters.fOrder} onChange={v => { setInvFilters(p => ({ ...p, fOrder: v || [], fPart: [] })); }} style={{ minWidth: 140, maxWidth: 260 }} size="middle" maxTagCount="responsive" disabled={invFilters.fSource.length > 0 && !invFilters.fSource.includes('order')}>
                        {invFilterOptions.orders.map(o => <Option key={o} value={o}>{o}</Option>)}
                      </Select>
                      <Select mode="multiple" placeholder="Part No" allowClear showSearch optionFilterProp="children" value={invFilters.fPart} onChange={v => setF('fPart', v)} style={{ minWidth: 130, maxWidth: 260 }} size="middle" maxTagCount="responsive" disabled={invFilters.fOrder.length === 0}>
                        {Array.from(new Set(invFilters.fOrder.flatMap(o => invFilterOptions.partsByOrder[o] || []))).sort().map(p => <Option key={p} value={p}>{p}</Option>)}
                      </Select>
                      <Select mode="multiple" placeholder="Stock Status" allowClear value={invFilters.fStockStatus} onChange={v => setF('fStockStatus', v)} style={{ minWidth: 140, maxWidth: 240 }} size="middle" maxTagCount="responsive">
                        <Option value="available">Available</Option>
                        <Option value="not_available">Not Available</Option>
                        <Option value="exhausted">Exhausted</Option>
                      </Select>
                      <Select mode="multiple" placeholder="Unit Status" allowClear value={invFilters.fUnitStatus} onChange={v => setF('fUnitStatus', v)} style={{ minWidth: 140, maxWidth: 240 }} size="middle" maxTagCount="responsive">
                        <Option value="available">Available</Option>
                        <Option value="partially_used">Partially Used</Option>
                        <Option value="not_available">Not Available</Option>
                        <Option value="exhausted">Exhausted</Option>
                      </Select>
                      <StockDetailsPdfDownload rows={invRows} label={`Inventory — ${invRows.length} rows`} />
                    </>
                  )}
                  {viewMode === 'list' && (
                    <>
                      <Input.Search
                        placeholder="Search all columns..."
                        allowClear
                        onSearch={handleSearch}
                        onChange={(e) => handleSearch(e.target.value)}
                        value={searchText}
                        maxLength={50}
                        className="w-52"
                        size="middle"
                      />
                      <RawMaterialsInventoryPdfDownload rawMaterials={rawMaterials} />
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={openCreateRawMaterial}
                        size="middle"
                        style={{ backgroundColor: '#2563eb' }}
                        className="border-none shadow-md no-hover-btn"
                      >
                        <span className="hidden sm:inline">Add Raw Material</span>
                        <span className="sm:hidden">Add</span>
                      </Button>
                    </>
                  )}
                </Space>
            </div>
        }
      >
        {viewMode === 'list' ? (
          <Table
            columns={listColumns}
            dataSource={filteredMaterials}
            rowKey="id"
            size="small"
            bordered
            scroll={{ x: 800 }}
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
        ) : null}
      </Card>

      {viewMode === 'inventory' && (
        <RawMaterialInventoryView
          searchText={invSearch}
          fMaterial={invFilters.fMaterial}
          fSource={invFilters.fSource}
          fOrder={invFilters.fOrder}
          fPart={invFilters.fPart}
          fStockStatus={invFilters.fStockStatus}
          fUnitStatus={invFilters.fUnitStatus}
          onFilterOptionsReady={handleFilterOptionsReady}
          onRowsReady={handleRowsReady}
        />
      )}

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
          <Row gutter={[16, 16]}>
            <Col xs={24}>
              <Form.Item 
                name="material_name" 
                label={<span className="font-semibold text-gray-700">Material Name</span>} 
                rules={[{ required: true, message: 'Please enter material name' }]}
              >
                <Input placeholder="Enter material name (e.g., MS Plate, SS Rod)" size="large" className="rounded-md" />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item 
                name="density" 
                label={<span className="font-semibold text-gray-700">Density (kg/m³)</span>}
                rules={[{ required: true, message: 'Please enter density' }]}
              >
                <InputNumber 
                  style={{ width: '100%' }} 
                  min={0} 
                  precision={3} 
                  step={0.001} 
                  placeholder="e.g., 7850 for steel" 
                  size="large" 
                  className="rounded-md" 
                />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item 
                name="cost" 
                label={<span className="font-semibold text-gray-700">Cost (₹/kg)</span>}
              >
                <InputNumber 
                  style={{ width: '100%' }} 
                  min={0} 
                  precision={2} 
                  step={0.01} 
                  placeholder="Optional cost per kg" 
                  size="large" 
                  className="rounded-md" 
                />
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

      {/* Stock View Modal */}
      <Modal
        open={stockModalOpen}
        onCancel={() => setStockModalOpen(false)}
        width="95%"
        style={{ maxWidth: 1400 }}
        title={
          <div className="flex items-center gap-2">
            <DatabaseOutlined className="text-green-500" />
            <span className="font-bold text-gray-800 text-sm sm:text-base">Stock Details</span>
            <span className="text-xs text-gray-500 font-medium">
              {selectedMaterialForStock?.material_name}
            </span>
          </div>
        }
        footer={null}
        className="rounded-xl overflow-hidden"
      >
        <div className="pt-4">
          <Tabs 
            defaultActiveKey="1"
            items={[
              {
                key: "1",
                label: "View Stock",
                children: (
                  <div className="w-full">
                    {/* Filter Section */}
                    <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex flex-wrap gap-2 items-center mb-2">
                        <div className="min-w-[120px] flex-1">
                          <Select
                            placeholder="Source"
                            allowClear
                            value={stockFilters.sourceType}
                            onChange={(value) => setStockFilters(prev => ({ ...prev, sourceType: value, partNumber: null }))}
                            className="w-full"
                            size="small"
                          >
                            <Option value="order">Order</Option>
                            <Option value="general">General</Option>
                          </Select>
                        </div>
                        <div className="min-w-[120px] flex-1">
                          <Select
                            placeholder="Process"
                            allowClear
                            value={stockFilters.processType}
                            onChange={(value) => setStockFilters(prev => ({ ...prev, processType: value, orderNumber: null, partNumber: null }))}
                            className="w-full"
                            size="small"
                            showSearch
                            optionFilterProp="children"
                          >
                            {Array.from(new Set(
                              selectedMaterialStock?.filter(s => 
                                !stockFilters.sourceType || s.source_type === stockFilters.sourceType
                              ).map(s => s.process_type).filter(Boolean) || []
                            )).map(process => (
                              <Option key={process} value={process}>{process}</Option>
                            ))}
                          </Select>
                        </div>
                        <div className="min-w-[120px] flex-1">
                          <Select
                            placeholder="Form"
                            allowClear
                            value={stockFilters.formType}
                            onChange={(value) => setStockFilters(prev => ({ ...prev, formType: value, orderNumber: null, partNumber: null }))}
                            className="w-full"
                            size="small"
                          >
                            <Option value="Round">Round</Option>
                            <Option value="Square">Square</Option>
                            <Option value="Pipe">Pipe</Option>
                          </Select>
                        </div>
                        <Button
                          size="small"
                          onClick={() => setStockFilters({
                            sourceType: null,
                            formType: null,
                            processType: null,
                            orderNumber: null,
                            partNumber: null,
                          })}
                        >
                          Clear
                        </Button>
                        <StockDetailsPdfDownload
                          materialName={selectedMaterialForStock?.material_name}
                          materialDensity={selectedMaterialForStock?.density}
                          materialCost={selectedMaterialForStock?.cost_per_kg}
                          stockData={getFilteredStockData()}
                          fileName={`stock-details-${selectedMaterialForStock?.material_name?.replace(/\s+/g, '-')}.pdf`}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2 items-center">
                        <div className="min-w-[120px] flex-1">
                          <Select
                            placeholder="Order Number"
                            allowClear
                            value={stockFilters.orderNumber}
                            onChange={(value) => setStockFilters(prev => ({ ...prev, orderNumber: value, partNumber: null }))}
                            className="w-full"
                            size="small"
                          >
                            {Array.from(new Set(
                              selectedMaterialStock?.filter(s => 
                                (!stockFilters.sourceType || s.source_type === stockFilters.sourceType) &&
                                (!stockFilters.processType || s.process_type === stockFilters.processType) &&
                                (!stockFilters.formType || s.form_type === stockFilters.formType)
                              ).flatMap(s => 
                                s.source_order_number 
                                  ? s.source_order_number.split(',').map(o => o.trim()).filter(Boolean)
                                  : []
                              ) || []
                            )).map(order => (
                              <Option key={order} value={order}>{order}</Option>
                            ))}
                          </Select>
                        </div>
                        <div className="min-w-[120px] flex-1">
                          <Select
                            placeholder="Part Number"
                            allowClear
                            value={stockFilters.partNumber}
                            onChange={(value) => setStockFilters(prev => ({ ...prev, partNumber: value }))}
                            className="w-full"
                            size="small"
                            disabled={!stockFilters.orderNumber}
                          >
                            {stockFilters.orderNumber ? (
                              Array.from(new Set(
                                selectedMaterialStock?.filter(s => 
                                  s.source_order_number?.split(',').map(o => o.trim()).includes(stockFilters.orderNumber)
                                ).flatMap(s => {
                                  // Use order_parts_mapping if available, otherwise fall back to all part_numbers
                                  if (s.order_parts_mapping && s.order_parts_mapping[stockFilters.orderNumber]) {
                                    return s.order_parts_mapping[stockFilters.orderNumber];
                                  }
                                  return s.part_numbers || [];
                                }).filter(Boolean) || []
                              )).map(part => (
                                <Option key={part} value={part}>{part}</Option>
                              ))
                            ) : (
                              <Option disabled value="">Select order first</Option>
                            )}
                          </Select>
                        </div>
                      </div>
                    </div>

                    {stockLoading ? (
                      <div className="text-center py-8">Loading stock...</div>
                    ) : getFilteredStockData().length > 0 ? (
                      <Table
                        dataSource={getFilteredStockData()}
                        rowKey="id"
                        size="small"
                        bordered
                        scroll={{ x: 1400 }}
                        pagination={{
                          current: stockPagination.current,
                          pageSize: stockPagination.pageSize,
                          showSizeChanger: true,
                          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
                          pageSizeOptions: ['5', '10', '20', '50'],
                          onChange: (page, pageSize) => setStockPagination({ current: page, pageSize })
                        }}
                        columns={[
                          { title: 'Process Type', dataIndex: 'process_type', key: 'process_type' },
                          { title: 'Form Type', dataIndex: 'form_type', key: 'form_type' },
                          { title: 'Dimensions', key: 'dimensions', render: (_, record) => {
                            if (record.form_type === 'Round') return `⌀${record.diameter} × ${record.length}mm`;
                            if (record.form_type === 'Square') return `${record.breadth} × ${record.height} × ${record.length}mm`;
                            if (record.form_type === 'Pipe') return `⌀${record.outer_diameter}/${record.inner_diameter} × ${record.length}mm`;
                            return '-';
                          }},
                          { title: 'Quantity', dataIndex: 'quantity', key: 'quantity' },
                          { title: 'Volume (m³)', dataIndex: 'volume', key: 'volume', render: (v) => v?.toFixed(6) || '-' },
                          { title: 'Mass (kg)', dataIndex: 'mass', key: 'mass', render: (m) => m?.toFixed(3) },
                          { title: 'Weight (N)', dataIndex: 'weight', key: 'weight', render: (w) => w?.toFixed(3) },
                          { title: 'Cost (₹)', dataIndex: 'cost', key: 'cost', render: (c) => c ? `₹${c?.toFixed(2)}` : '-' },
                          { title: 'Source', dataIndex: 'source_type', key: 'source_type', render: (s) => 
                            s === 'order' ? 'Order' : 'General'
                          },
                          { title: 'Order', dataIndex: 'source_order_number', key: 'source_order_number', render: (order) => order || '-' },
                          { title: 'Parts', dataIndex: 'part_numbers', key: 'part_numbers', render: (parts) => 
                            parts?.length > 0 ? parts.join(', ') : '-'
                          },
                          { title: 'User Name', dataIndex: 'creator_name', key: 'creator_name', render: (name) => name || '-' },
                          { title: 'Status', dataIndex: 'status', key: 'status', render: (s) => <Tag color={s === 'available' ? 'green' : 'red'}>{s}</Tag> },
                          { title: 'Actions', key: 'actions', render: (_, record) => (
                            <Tooltip title="Delete">
                              <Button
                                type="text"
                                size="small"
                                icon={<DeleteOutlined />}
                                className="text-red-500 hover:bg-red-50"
                                onClick={() => handleDeleteStock(record.id)}
                              />
                            </Tooltip>
                          )},
                        ]}
                      />
                    ) : (
                      <Empty description={selectedMaterialStock && selectedMaterialStock.length > 0 ? "No stock matches your filters" : "No stock available for this material"} />
                    )}
                  </div>
                )
              },
              {
                key: "2",
                label: "Add Stock",
                children: (
                  <div className="w-full">
                    <StockForm 
                      materialId={selectedMaterialForStock?.id}
                      materialCost={selectedMaterialForStock?.cost_per_kg}
                      onSuccess={() => fetchStockForMaterial(selectedMaterialForStock?.id)}
                    />
                  </div>
                )
              }
            ]}
          />
        </div>
      </Modal>

    </div>
  );
};

export const StockForm = ({ materialId, materialCost, onSuccess }) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [formType, setFormType] = useState("Round");

  const getCurrentUserId = () => {
    try {
      const stored = localStorage.getItem("user");
      if (!stored) return null;
      const u = JSON.parse(stored);
      return u?.id ?? null;
    } catch {
      return null;
    }
  };

  const handleSubmit = async (values) => {
    if (!materialId) return;
    setSaving(true);
    try {
      const payload = {
        material_id: materialId,
        process_type: values.process_type,
        form_type: values.form_type,
        quantity: Number(values.quantity),
        source_type: "general",
        cost: materialCost || null,
        user_id: getCurrentUserId(),
        ...getDimensions(values)
      };
      
      await axios.post(`${API_BASE_URL}/rawmaterials/stock/`, payload);
      message.success("Stock added successfully!");
      form.resetFields();
      onSuccess?.();
    } catch (error) {
      console.error("Error adding stock:", error);
      message.error(error.response?.data?.detail || "Failed to add stock");
    } finally {
      setSaving(false);
    }
  };

  const getDimensions = (values) => {
    const type = values.form_type;
    const dims = {};
    
    if (type === "Round") {
      if (values.diameter) dims.diameter = Number(values.diameter);
      if (values.length) dims.length = Number(values.length);
    }
    if (type === "Square") {
      if (values.breadth) dims.breadth = Number(values.breadth);
      if (values.height) dims.height = Number(values.height);
      if (values.length) dims.length = Number(values.length);
    }
    if (type === "Pipe") {
      if (values.inner_diameter) dims.inner_diameter = Number(values.inner_diameter);
      if (values.outer_diameter) dims.outer_diameter = Number(values.outer_diameter);
      if (values.length) dims.length = Number(values.length);
    }
    return dims;
  };

  const renderDimensionFields = () => {
    if (formType === "Round") {
      return (
        <>
          <Col xs={12} sm={8}>
            <Form.Item name="diameter" label="Diameter (mm)" rules={[{ required: true }]}>
              <InputNumber 
                style={{ width: '100%' }} 
                min={0} 
                step={0.01}
                precision={2} 
                placeholder="mm"
                onBeforeInput={(e) => {
                  const char = e.data;
                  if (char && !/[0-9.]/.test(char)) {
                    e.preventDefault();
                    return false;
                  }
                }}
                onKeyPress={(e) => {
                  const char = String.fromCharCode(e.which);
                  if (!/[0-9.]/.test(char) && 
                      e.which !== 8 && e.which !== 46 && e.which !== 9 && 
                      e.which !== 13 && e.which !== 37 && e.which !== 39 && 
                      e.which !== 36 && e.which !== 35) {
                    e.preventDefault();
                    return false;
                  }
                }}
                onKeyDown={(e) => {
                  const value = e.target.value;
                  if (e.key === '.' && value && value.includes('.')) {
                    e.preventDefault();
                    return false;
                  }
                  if (e.key === ',' || e.key === '-' || e.key === '+') {
                    e.preventDefault();
                    return false;
                  }
                }}
              />
            </Form.Item>
          </Col>
          <Col xs={12} sm={8}>
            <Form.Item name="length" label="Length (mm)" rules={[{ required: true }]}>
              <InputNumber 
                style={{ width: '100%' }} 
                min={0} 
                step={0.01}
                precision={2} 
                placeholder="mm"
                onBeforeInput={(e) => {
                  const char = e.data;
                  if (char && !/[0-9.]/.test(char)) {
                    e.preventDefault();
                    return false;
                  }
                }}
                onKeyPress={(e) => {
                  const char = String.fromCharCode(e.which);
                  if (!/[0-9.]/.test(char) && 
                      e.which !== 8 && e.which !== 46 && e.which !== 9 && 
                      e.which !== 13 && e.which !== 37 && e.which !== 39 && 
                      e.which !== 36 && e.which !== 35) {
                    e.preventDefault();
                    return false;
                  }
                }}
                onKeyDown={(e) => {
                  const value = e.target.value;
                  if (e.key === '.' && value && value.includes('.')) {
                    e.preventDefault();
                    return false;
                  }
                  if (e.key === ',' || e.key === '-' || e.key === '+') {
                    e.preventDefault();
                    return false;
                  }
                }}
              />
            </Form.Item>
          </Col>
        </>
      );
    }
    if (formType === "Square") {
      return (
        <>
          <Col xs={12} sm={8}>
            <Form.Item name="breadth" label="Breadth (mm)" rules={[{ required: true }]}>
              <InputNumber 
                style={{ width: '100%' }} 
                min={0} 
                step={0.01}
                precision={2} 
                placeholder="mm"
                onBeforeInput={(e) => {
                  const char = e.data;
                  if (char && !/[0-9.]/.test(char)) {
                    e.preventDefault();
                    return false;
                  }
                }}
                onKeyPress={(e) => {
                  const char = String.fromCharCode(e.which);
                  if (!/[0-9.]/.test(char) && 
                      e.which !== 8 && e.which !== 46 && e.which !== 9 && 
                      e.which !== 13 && e.which !== 37 && e.which !== 39 && 
                      e.which !== 36 && e.which !== 35) {
                    e.preventDefault();
                    return false;
                  }
                }}
                onKeyDown={(e) => {
                  const value = e.target.value;
                  if (e.key === '.' && value && value.includes('.')) {
                    e.preventDefault();
                    return false;
                  }
                  if (e.key === ',' || e.key === '-' || e.key === '+') {
                    e.preventDefault();
                    return false;
                  }
                }}
              />
            </Form.Item>
          </Col>
          <Col xs={12} sm={8}>
            <Form.Item name="height" label="Height (mm)" rules={[{ required: true }]}>
              <InputNumber 
                style={{ width: '100%' }} 
                min={0} 
                step={0.01}
                precision={2} 
                placeholder="mm"
                onBeforeInput={(e) => {
                  const char = e.data;
                  if (char && !/[0-9.]/.test(char)) {
                    e.preventDefault();
                    return false;
                  }
                }}
                onKeyPress={(e) => {
                  const char = String.fromCharCode(e.which);
                  if (!/[0-9.]/.test(char) && 
                      e.which !== 8 && e.which !== 46 && e.which !== 9 && 
                      e.which !== 13 && e.which !== 37 && e.which !== 39 && 
                      e.which !== 36 && e.which !== 35) {
                    e.preventDefault();
                    return false;
                  }
                }}
                onKeyDown={(e) => {
                  const value = e.target.value;
                  if (e.key === '.' && value && value.includes('.')) {
                    e.preventDefault();
                    return false;
                  }
                  if (e.key === ',' || e.key === '-' || e.key === '+') {
                    e.preventDefault();
                    return false;
                  }
                }}
              />
            </Form.Item>
          </Col>
          <Col xs={12} sm={8}>
            <Form.Item name="length" label="Length (mm)" rules={[{ required: true }]}>
              <InputNumber 
                style={{ width: '100%' }} 
                min={0} 
                step={0.01}
                precision={2} 
                placeholder="mm"
                onBeforeInput={(e) => {
                  const char = e.data;
                  if (char && !/[0-9.]/.test(char)) {
                    e.preventDefault();
                    return false;
                  }
                }}
                onKeyPress={(e) => {
                  const char = String.fromCharCode(e.which);
                  if (!/[0-9.]/.test(char) && 
                      e.which !== 8 && e.which !== 46 && e.which !== 9 && 
                      e.which !== 13 && e.which !== 37 && e.which !== 39 && 
                      e.which !== 36 && e.which !== 35) {
                    e.preventDefault();
                    return false;
                  }
                }}
                onKeyDown={(e) => {
                  const value = e.target.value;
                  if (e.key === '.' && value && value.includes('.')) {
                    e.preventDefault();
                    return false;
                  }
                  if (e.key === ',' || e.key === '-' || e.key === '+') {
                    e.preventDefault();
                    return false;
                  }
                }}
              />
            </Form.Item>
          </Col>
        </>
      );
    }
    if (formType === "Pipe") {
      return (
        <>
          <Col xs={12} sm={8}>
            <Form.Item name="inner_diameter" label="Inner ⌀ (mm)" rules={[{ required: true, message: 'Required' }]}>
              <InputNumber 
                style={{ width: '100%' }} 
                min={0} 
                step={0.01}
                precision={2} 
                placeholder="mm"
                onBeforeInput={(e) => {
                  const char = e.data;
                  if (char && !/[0-9.]/.test(char)) {
                    e.preventDefault();
                    return false;
                  }
                }}
                onKeyPress={(e) => {
                  const char = String.fromCharCode(e.which);
                  if (!/[0-9.]/.test(char) && 
                      e.which !== 8 && e.which !== 46 && e.which !== 9 && 
                      e.which !== 13 && e.which !== 37 && e.which !== 39 && 
                      e.which !== 36 && e.which !== 35) {
                    e.preventDefault();
                    return false;
                  }
                }}
                onKeyDown={(e) => {
                  const value = e.target.value;
                  if (e.key === '.' && value && value.includes('.')) {
                    e.preventDefault();
                    return false;
                  }
                  if (e.key === ',' || e.key === '-' || e.key === '+') {
                    e.preventDefault();
                    return false;
                  }
                }}
              />
            </Form.Item>
          </Col>
          <Col xs={12} sm={8}>
            <Form.Item name="outer_diameter" label="Outer ⌀ (mm)" rules={[{ required: true, message: 'Required' }, ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('inner_diameter') < value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error('Outer diameter must be > inner diameter'));
              },
            })]}>
              <InputNumber 
                style={{ width: '100%' }} 
                min={0} 
                step={0.01}
                precision={2} 
                placeholder="mm"
                onBeforeInput={(e) => {
                  const char = e.data;
                  if (char && !/[0-9.]/.test(char)) {
                    e.preventDefault();
                    return false;
                  }
                }}
                onKeyPress={(e) => {
                  const char = String.fromCharCode(e.which);
                  if (!/[0-9.]/.test(char) && 
                      e.which !== 8 && e.which !== 46 && e.which !== 9 && 
                      e.which !== 13 && e.which !== 37 && e.which !== 39 && 
                      e.which !== 36 && e.which !== 35) {
                    e.preventDefault();
                    return false;
                  }
                }}
                onKeyDown={(e) => {
                  const value = e.target.value;
                  if (e.key === '.' && value && value.includes('.')) {
                    e.preventDefault();
                    return false;
                  }
                  if (e.key === ',' || e.key === '-' || e.key === '+') {
                    e.preventDefault();
                    return false;
                  }
                }}
              />
            </Form.Item>
          </Col>
          <Col xs={12} sm={8}>
            <Form.Item name="length" label="Length (mm)" rules={[{ required: true, message: 'Required' }]}>
              <InputNumber 
                style={{ width: '100%' }} 
                min={0} 
                step={0.01}
                precision={2} 
                placeholder="mm"
                onBeforeInput={(e) => {
                  const char = e.data;
                  if (char && !/[0-9.]/.test(char)) {
                    e.preventDefault();
                    return false;
                  }
                }}
                onKeyPress={(e) => {
                  const char = String.fromCharCode(e.which);
                  if (!/[0-9.]/.test(char) && 
                      e.which !== 8 && e.which !== 46 && e.which !== 9 && 
                      e.which !== 13 && e.which !== 37 && e.which !== 39 && 
                      e.which !== 36 && e.which !== 35) {
                    e.preventDefault();
                    return false;
                  }
                }}
                onKeyDown={(e) => {
                  const value = e.target.value;
                  if (e.key === '.' && value && value.includes('.')) {
                    e.preventDefault();
                    return false;
                  }
                  if (e.key === ',' || e.key === '-' || e.key === '+') {
                    e.preventDefault();
                    return false;
                  }
                }}
              />
            </Form.Item>
          </Col>
        </>
      );
    }
  };

  return (
    <Form form={form} layout="vertical" onFinish={handleSubmit}>
      <Row gutter={[16, 0]}>
        <Col xs={24} sm={8}>
          <Form.Item 
            name="process_type" 
            label="Process Type" 
            rules={[{ required: true, message: 'Please select process type' }]}
          >
            <Select placeholder="Select Process Type">
              <Option value="Forging">Forging</Option>
              <Option value="Barstocks">Barstocks</Option>
              <Option value="Casting">Casting</Option>
            </Select>
          </Form.Item>
        </Col>
        <Col xs={24} sm={8}>
          <Form.Item
            name="form_type"
            label="Form Type"
            initialValue="Round"
            rules={[{ required: true }]}
          >
            <Select onChange={setFormType}>
              <Option value="Round">Round Bar</Option>
              <Option value="Square">Square Bar</Option>
              <Option value="Pipe">Pipe/Tube</Option>
            </Select>
          </Form.Item>
        </Col>
        {renderDimensionFields()}
        <Col xs={24} sm={12}>
          <Form.Item name="quantity" label="Quantity" rules={[{ required: true }]}>
            <InputNumber
              style={{ width: '100%' }}
              min={1}
              step={1}
              precision={0}
              placeholder="Units"
              onBeforeInput={(e) => {
                const char = e.data;
                const currentValue = e.target.value || '';
                // Block non-digits
                if (char && !/[0-9]/.test(char)) {
                  e.preventDefault();
                  return false;
                }
                // Block 0 as first digit
                if (char === '0' && currentValue === '') {
                  e.preventDefault();
                  return false;
                }
              }}
              onKeyPress={(e) => {
                const char = String.fromCharCode(e.which);
                const currentValue = e.target.value || '';
                if (!/[0-9]/.test(char) &&
                    e.which !== 8 &&
                    e.which !== 46 &&
                    e.which !== 9 &&
                    e.which !== 13 &&
                    e.which !== 37 &&
                    e.which !== 39 &&
                    e.which !== 36 &&
                    e.which !== 35) {
                  e.preventDefault();
                  return false;
                }
                // Block 0 as first digit
                if (char === '0' && currentValue === '') {
                  e.preventDefault();
                  return false;
                }
              }}
              onKeyDown={(e) => {
                // Block decimal point and special characters
                if (e.key === '.' || e.key === ',' || e.key === '-' || e.key === '+') {
                  e.preventDefault();
                  return false;
                }
              }}
            />
          </Form.Item>
        </Col>
      </Row>
      <div className="flex justify-end gap-3 mt-4">
        <Button onClick={() => form.resetFields()}>Reset</Button>
        <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#2563eb' }}>
          Add Stock
        </Button>
      </div>
    </Form>
  );
};

export default RawMaterialsTab;
