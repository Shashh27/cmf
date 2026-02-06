import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "../Config/auth";
import { 
  Table, 
  Button, 
  Tabs, 
  Badge, 
  Modal, 
  Form, 
  Input, 
  Select, 
  Typography, 
  Space, 
  Spin, 
  Empty, 
  message,
  Checkbox
} from "antd";
import { 
  CaretDownOutlined,
  CaretRightOutlined,
  AppstoreOutlined,
  InboxOutlined,
  ToolOutlined,
  EditOutlined,
  DeleteOutlined,
  PlusOutlined
} from "@ant-design/icons";

const { Title, Text } = Typography;
const { Option } = Select;

const RawMaterials = () => {
  const [form] = Form.useForm();
  const [orders, setOrders] = useState([]);
  const [orderBomMap, setOrderBomMap] = useState({});
  const [rawMaterials, setRawMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bomLoadingMap, setBomLoadingMap] = useState({});
  const [expandedOrders, setExpandedOrders] = useState({});
  const [expandedAssemblies, setExpandedAssemblies] = useState({});
  const [selectedPartsByOrder, setSelectedPartsByOrder] = useState({});
  const [selectedRawMaterialIds, setSelectedRawMaterialIds] = useState({});
  const [rawMaterialModalOpen, setRawMaterialModalOpen] = useState(false);
  const [editingRawMaterial, setEditingRawMaterial] = useState(null);
  const [savingRawMaterial, setSavingRawMaterial] = useState(false);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    fetchOrders();
    fetchRawMaterials();
  }, []);

  const fetchOrders = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/orders/`);
      if (response.ok) {
        const data = await response.json();
        setOrders(data);
      } else {
        setOrders([]);
      }
    } catch (error) {
      console.error("Error fetching orders:", error);
      setOrders([]);
    }
  };

  const fetchRawMaterials = async () => {
    setLoading(true);
    
    try {
      const response = await fetch(`${API_BASE_URL}/rawmaterials/?skip=0&limit=100`);
      
      if (response.ok) {
        const data = await response.json();
        
        if (Array.isArray(data)) {
          setRawMaterials(data);
          setLoading(false);
          return;
        }
      }
    } catch (error) {
      console.error('Error fetching raw materials:', error);
    }
    
    const endpoints = ["rawmaterials/", "raw-materials/", "raw_materials/"];
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${API_BASE_URL}/${endpoint}`);
        if (response.ok) {
          const data = await response.json();
          let materials = [];
          if (Array.isArray(data)) {
            materials = data;
          } else if (data?.results) {
            materials = data.results;
          } else if (data?.data) {
            materials = Array.isArray(data.data) ? data.data : [];
          } else if (data?.raw_materials) {
            materials = data.raw_materials;
          } else if (data?.id) {
            materials = [data];
          }
          setRawMaterials(materials);
          setLoading(false);
          return;
        }
      } catch (error) {
        console.error(`Error fetching raw materials from ${endpoint}:`, error);
      }
    }
    
    setRawMaterials([]);
    setLoading(false);
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
      material_specification: material.material_specification || "",
      mass: material.mass ?? "",
      density: material.density ?? "",
      volume: material.volume ?? "",
      stock_type: material.stock_type || "",
      quantity: material.quantity ?? "",
      stock_dimensions: material.stock_dimensions || "",
      status: material.status || "",
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
      const url = isEdit
        ? `${API_BASE_URL}/rawmaterials/${editingRawMaterial.id}`
        : `${API_BASE_URL}/rawmaterials/`;
      const method = isEdit ? "PUT" : "POST";

      const payload = {
        material_name: values.material_name,
        material_specification: values.material_specification,
        mass: values.mass === "" ? 0 : Number(values.mass) || 0,
        density: values.density === "" ? 0 : Number(values.density) || 0,
        volume: values.volume === "" ? 0 : Number(values.volume) || 0,
        stock_type: values.stock_type,
        quantity: values.quantity === "" ? 0 : Number(values.quantity) || 0,
        stock_dimensions: values.stock_dimensions,
        status: values.status,
      };

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        await fetchRawMaterials();
        message.success(
          isEdit ? "Raw material updated successfully" : "Raw material created successfully"
        );
        closeRawMaterialModal();
      } else {
        message.error("Failed to save raw material");
      }
    } catch (error) {
      console.error("Error saving raw material:", error);
      message.error("Error saving raw material");
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
          const response = await fetch(
            `${API_BASE_URL}/rawmaterials/${material.id}`,
            {
              method: "DELETE",
            }
          );
          if (response.ok) {
            await fetchRawMaterials();
            message.success("Raw material deleted successfully");
          } else {
            message.error("Failed to delete raw material");
          }
        } catch (error) {
          console.error("Error deleting raw material:", error);
          message.error("Error deleting raw material");
        }
      }
    });
  };

  const fetchOrderBom = async (orderId, productId) => {
    setBomLoadingMap((prev) => ({ ...prev, [orderId]: true }));
    try {
      const response = await fetch(`${API_BASE_URL}/products/${productId}/hierarchical`);
      if (response.ok) {
        const data = await response.json();
        setOrderBomMap((prev) => ({ ...prev, [orderId]: data }));
        setExpandedAssemblies((prev) => {
          const next = { ...prev };
          (data.assemblies || []).forEach((a) => {
            const assembly = a.assembly || a;
            if (assembly?.id) next[assembly.id] = true;
          });
          return next;
        });
      } else {
        setOrderBomMap((prev) => ({ ...prev, [orderId]: null }));
      }
    } catch (error) {
      console.error("Error fetching BOM:", error);
      setOrderBomMap((prev) => ({ ...prev, [orderId]: null }));
    } finally {
      setBomLoadingMap((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  const toggleOrderExpand = (order) => {
    const isExpanded = expandedOrders[order.id];
    setExpandedOrders((prev) => ({ ...prev, [order.id]: !prev[order.id] }));
    if (!isExpanded && order.product_id && !orderBomMap[order.id]) {
      fetchOrderBom(order.id, order.product_id);
    }
  };

  const toggleAssemblyExpand = (assemblyId) => {
    setExpandedAssemblies((prev) => ({ ...prev, [assemblyId]: !prev[assemblyId] }));
  };

  const togglePartSelection = (orderId, partId) => {
    setSelectedPartsByOrder((prev) => {
      const current = prev[orderId] || {};
      return {
        ...prev,
        [orderId]: {
          ...current,
          [partId]: !current[partId],
        },
      };
    });
  };

  const renderPart = (partDetails, level = 0, orderId) => {
    const part = partDetails.part || partDetails;
    if (!part || !part.id) return null;
    const isSelected = selectedPartsByOrder[orderId]?.[part.id];
    return (
      <div
        key={part.id}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '6px 8px',
          borderRadius: '4px',
          marginLeft: `${level * 20}px`
        }}
      >
        <Checkbox
          checked={!!isSelected}
          onChange={() => togglePartSelection(orderId, part.id)}
          style={{ marginRight: '8px' }}
        />
        <ToolOutlined style={{ color: '#6b7280', marginRight: '8px', fontSize: '14px' }} />
        <Text style={{ fontSize: '14px', fontWeight: 'medium' }}>{part.part_number}</Text>
        <Text style={{ color: '#6b7280', fontSize: '14px', marginLeft: '8px' }}>{part.part_name}</Text>
      </div>
    );
  };

  const renderAssembly = (assemblyDetails, level = 0, orderId) => {
    const assembly = assemblyDetails.assembly || assemblyDetails;
    if (!assembly || !assembly.id) return null;
    const parts = assemblyDetails.parts || [];
    const subassemblies = assemblyDetails.subassemblies || [];
    const hasChildren = parts.length > 0 || subassemblies.length > 0;
    const isExpanded = expandedAssemblies[assembly.id];

    return (
      <div key={assembly.id} style={{ marginBottom: '4px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '6px 8px',
            borderRadius: '4px',
            cursor: hasChildren ? 'pointer' : 'default',
            marginLeft: `${level * 20}px`,
            backgroundColor: hasChildren ? (isExpanded ? '#f3f4f6' : 'transparent') : 'transparent'
          }}
          onClick={() => hasChildren && toggleAssemblyExpand(assembly.id)}
        >
          {hasChildren ? (
            <span style={{ marginRight: '4px', color: '#1890ff' }}>
              {isExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
            </span>
          ) : (
            <span style={{ width: '16px', marginRight: '4px' }} />
          )}
          <span style={{ width: '16px', marginRight: '4px' }} />
          <InboxOutlined style={{ color: '#1890ff', marginRight: '8px', fontSize: '14px' }} />
          <Text style={{ fontSize: '14px', fontWeight: 'medium' }}>{assembly.assembly_number}</Text>
          <Text style={{ color: '#6b7280', fontSize: '14px', marginLeft: '8px' }}>{assembly.assembly_name}</Text>
        </div>
        {isExpanded && (
          <div style={{ marginTop: '2px' }}>
            {parts.map((p) => renderPart(p, level + 1, orderId))}
            {subassemblies.map((s) => renderAssembly(s, level + 1, orderId))}
          </div>
        )}
      </div>
    );
  };

  const renderOrderBom = (order) => {
    const bomData = orderBomMap[order.id];
    const isLoading = bomLoadingMap[order.id];

    if (isLoading) {
      return (
        <div style={{ padding: '16px', marginLeft: '20px' }}>
          <Text type="secondary">Loading BOM...</Text>
        </div>
      );
    }
    if (!bomData) {
      return (
        <div style={{ padding: '16px', marginLeft: '20px' }}>
          <Text type="secondary">No BOM data available</Text>
        </div>
      );
    }

    const product = bomData.product;
    const assemblies = bomData.assemblies || [];
    const directParts = bomData.direct_parts || [];

    return (
      <div style={{ 
        paddingLeft: '16px', 
        borderLeft: '2px solid #e5e7eb', 
        marginLeft: '16px', 
        marginTop: '4px', 
        marginBottom: '8px' 
      }}>
        {product && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            padding: '8px 0', 
            borderBottom: '1px solid #f3f4f6', 
            marginBottom: '8px' 
          }}>
            <AppstoreOutlined style={{ color: '#4f46e5', marginRight: '8px', fontSize: '14px' }} />
            <Text style={{ fontSize: '14px', fontWeight: 'bold' }}>{product.product_number}</Text>
            <Text style={{ color: '#6b7280', fontSize: '14px', marginLeft: '8px' }}>{product.product_name}</Text>
          </div>
        )}
        {assemblies.map((a) => renderAssembly(a, 0, order.id))}
        {directParts.map((p) => renderPart(p, 0, order.id))}
      </div>
    );
  };

  const renderOrderTree = () => {
    return (
      <div style={{ padding: '16px' }}>
        {orders.map((order) => {
          const isExpanded = expandedOrders[order.id];
          const hasProduct = !!order.product_id;

          return (
            <div key={order.id} style={{ marginBottom: '4px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  backgroundColor: isExpanded ? '#f3f4f6' : 'transparent'
                }}
                onClick={() => toggleOrderExpand(order)}
              >
                {hasProduct ? (
                  <span style={{ marginRight: '4px', color: '#6b7280' }}>
                    {isExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
                  </span>
                ) : (
                  <span style={{ width: '16px', marginRight: '4px' }} />
                )}
                <div style={{ 
                  width: '12px', 
                  height: '12px', 
                  backgroundColor: '#4b5563', 
                  borderRadius: '50%', 
                  marginRight: '8px' 
                }} />
                <Text style={{ fontWeight: 'medium', color: '#111827' }}>{order.sale_order_number}</Text>
              </div>
              {isExpanded && renderOrderBom(order)}
            </div>
          );
        })}
        {orders.length === 0 && !loading && (
          <Empty description="No orders found" />
        )}
        {loading && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <Spin tip="Loading orders..." />
          </div>
        )}
      </div>
    );
  };

  const handleSubmitLinks = async () => {
    const activeOrderIds = Object.keys(selectedPartsByOrder).filter((orderId) => {
      const map = selectedPartsByOrder[orderId];
      return map && Object.values(map).some(Boolean);
    });

    if (activeOrderIds.length === 0) {
      message.warning("Please select at least one part.");
      return;
    }

    if (activeOrderIds.length > 1) {
      message.warning("Please select parts from only one order at a time.");
      return;
    }

    const orderId = Number(activeOrderIds[0]);
    const partMap = selectedPartsByOrder[orderId] || {};
    const partIds = Object.keys(partMap)
      .filter((id) => partMap[id])
      .map((id) => Number(id));

    const rawMaterialIds = Object.keys(selectedRawMaterialIds)
      .filter((id) => selectedRawMaterialIds[id])
      .map((id) => Number(id));

    if (partIds.length === 0) {
      message.warning("Please select at least one part.");
      return;
    }

    if (rawMaterialIds.length === 0) {
      message.warning("Please select at least one raw material.");
      return;
    }

    const isManyParts = partIds.length > 1;
    const isManyMaterials = rawMaterialIds.length > 1;

    if (isManyParts && isManyMaterials) {
      message.error("Adding many parts to many raw materials is not allowed.");
      return;
    }

    setLinking(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/order-parts-raw-material-linked/bulk`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            raw_material_ids: rawMaterialIds,
            part_ids: partIds,
            order_id: orderId,
          }),
        }
      );

      if (response.ok) {
        message.success("Raw Materials added Successfully.");
      } else {
        message.error("Adding failed. Please check your selections and try again.");
      }
    } catch (error) {
      console.error("Error Adding parts and raw materials:", error);
      message.error("Error while Adding. Please try again.");
    } finally {
      setLinking(false);
    }
  };

  const renderMaterialsTable = ({ showSelection = false, showActions = false } = {}) => {
    const columns = [
      {
        title: 'SL NO',
        dataIndex: 'index',
        key: 'index',
        width: 80,
        render: (_, __, index) => index + 1,
      },
      {
        title: 'MATERIAL NAME',
        dataIndex: 'material_name',
        key: 'material_name',
        render: (text) => text || "-",
      },
      {
        title: 'SPECIFICATION',
        dataIndex: 'material_specification',
        key: 'material_specification',
        render: (text) => text || "-",
      },
      {
        title: 'MASS',
        dataIndex: 'mass',
        key: 'mass',
        render: (text) => text || "-",
      },
      {
        title: 'DENSITY',
        dataIndex: 'density',
        key: 'density',
        render: (text) => text || "-",
      },
      {
        title: 'VOLUME',
        dataIndex: 'volume',
        key: 'volume',
        render: (text) => text || "-",
      },
      {
        title: 'STOCK TYPE',
        dataIndex: 'stock_type',
        key: 'stock_type',
        render: (text) => text || "-",
      },
      {
        title: 'QUANTITY',
        dataIndex: 'quantity',
        key: 'quantity',
        render: (text) => text || "-",
      },
      {
        title: 'DIMENSIONS',
        dataIndex: 'stock_dimensions',
        key: 'stock_dimensions',
        render: (text) => text || "-",
      },
      {
        title: 'STATUS',
        dataIndex: 'status',
        key: 'status',
        render: (status) => (
          <Badge color={status ? 'blue' : 'default'}>
            {status || "-"}
          </Badge>
        ),
      },
    ];

    if (showSelection) {
      columns.unshift({
        title: (
          <Checkbox
            checked={rawMaterials.length > 0 && rawMaterials.every((m) => selectedRawMaterialIds[m.id])}
            onChange={(e) => {
              const checked = e.target.checked;
              const next = {};
              if (checked) {
                rawMaterials.forEach((m) => {
                  next[m.id] = true;
                });
              }
              setSelectedRawMaterialIds(next);
            }}
          />
        ),
        key: 'selection',
        width: 60,
        render: () => null,
      });
    }

    if (showActions) {
      columns.push({
        title: 'ACTIONS',
        key: 'actions',
        width: 120,
        render: (_, record) => (
          <Space>
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEditRawMaterial(record)}
            />
            <Button
              type="text"
              size="small"
              icon={<DeleteOutlined />}
              danger
              onClick={() => handleDeleteRawMaterial(record)}
            />
          </Space>
        ),
      });
    }

    return (
      <div style={{ backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px 0 rgba(0,0,0,0.1)', border: '1px solid #d9d9d9' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Title level={3} style={{ margin: 0 }}>Raw Materials</Title>
          {showActions && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={openCreateRawMaterial}
            >
              Add Raw Material
            </Button>
          )}
        </div>
        <div style={{ maxHeight: "calc(100vh - 280px)", overflow: 'auto' }}>
          <Table
            columns={columns}
            dataSource={rawMaterials}
            rowKey="id"
            size="small"
            pagination={false}
            scroll={{ y: 300 }}
            locale={{
              emptyText: 'No raw materials found'
            }}
          />
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <Spin size="large" tip="Loading raw materials..." />
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      <Title level={2} style={{ marginBottom: '24px' }}>Raw Materials</Title>

      <Tabs defaultActiveKey="raw-materials">
        <Tabs.TabPane tab="Raw Materials" key="raw-materials">
          {renderMaterialsTable({ showSelection: false, showActions: true })}
        </Tabs.TabPane>
        
        <Tabs.TabPane tab="Raw Materials Linking" key="linking">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '16px' }}>
            {/* Left side - Orders tree */}
            <div style={{ backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px 0 rgba(0,0,0,0.1)', border: '1px solid #d9d9d9' }}>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0' }}>
                <Title level={4} style={{ margin: 0 }}>Orders</Title>
              </div>
              <div style={{ overflowY: 'auto', maxHeight: "calc(100vh - 280px)" }}>
                {renderOrderTree()}
              </div>
            </div>

            {/* Right side - Raw Materials table */}
            {renderMaterialsTable({ showSelection: true, showActions: false })}
          </div>

          <div style={{ textAlign: 'right', marginTop: '16px' }}>
            <Button type="primary" onClick={handleSubmitLinks} loading={linking}>
              {linking ? "Submitting..." : "Submit"}
            </Button>
          </div>
        </Tabs.TabPane>
      </Tabs>

      {/* Raw Material Modal */}
      <Modal
        open={rawMaterialModalOpen}
        onCancel={closeRawMaterialModal}
        width={600}
        title={editingRawMaterial ? "Edit Raw Material" : "Add Raw Material"}
        footer={null}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSaveRawMaterial}
          style={{ padding: '24px' }}
        >
          <Form.Item
            name="material_name"
            label="Material Name"
            rules={[{ required: true, message: 'Please enter material name' }]}
          >
            <Input placeholder="Enter material name" />
          </Form.Item>
          
          <Form.Item
            name="material_specification"
            label="Specification"
          >
            <Input placeholder="Enter specification" />
          </Form.Item>
          
          <Form.Item
            name="mass"
            label="Mass"
          >
            <Input type="number" step="any" placeholder="Enter mass" />
          </Form.Item>
          
          <Form.Item
            name="density"
            label="Density"
          >
            <Input type="number" step="any" placeholder="Enter density" />
          </Form.Item>
          
          <Form.Item
            name="volume"
            label="Volume"
          >
            <Input type="number" step="any" placeholder="Enter volume" />
          </Form.Item>
          
          <Form.Item
            name="stock_type"
            label="Stock Type"
          >
            <Input placeholder="Enter stock type" />
          </Form.Item>
          
          <Form.Item
            name="quantity"
            label="Quantity"
          >
            <Input type="number" step="any" placeholder="Enter quantity" />
          </Form.Item>
          
          <Form.Item
            name="stock_dimensions"
            label="Dimensions"
          >
            <Input placeholder="Enter dimensions" />
          </Form.Item>
          
          <Form.Item
            name="status"
            label="Status"
          >
            <Select placeholder="Select status">
              <Option value="purchase request">Purchase Request</Option>
              <Option value="purchase order">Purchase Order</Option>
              <Option value="available">Available</Option>
            </Select>
          </Form.Item>
          
          <div style={{ textAlign: 'right', marginTop: '24px' }}>
            <Button onClick={closeRawMaterialModal} style={{ marginRight: '8px' }}>
              Cancel
            </Button>
            <Button type="primary" htmlType="submit" loading={savingRawMaterial}>
              {savingRawMaterial ? "Saving..." : (editingRawMaterial ? "Update" : "Create")}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default RawMaterials;
