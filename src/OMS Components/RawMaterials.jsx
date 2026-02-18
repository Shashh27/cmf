import React, { useState, useEffect, useRef } from "react";
import { API_BASE_URL } from "../Config/auth";
import { Table, Button, Tabs, Badge, Modal, Form, Input, InputNumber,Select, Typography, Space, Spin, Empty, 
  message, Checkbox, Row, Col, Tooltip, Card, Tag } from "antd";
import { CaretDownOutlined,CaretRightOutlined,AppstoreOutlined,CodeSandboxOutlined,EditOutlined,DeleteOutlined,PlusOutlined,
  BlockOutlined,FileTextOutlined,InfoCircleOutlined,ExperimentOutlined,LinkOutlined,SafetyCertificateOutlined } from "@ant-design/icons";

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
  const [linkedMaterials, setLinkedMaterials] = useState([]);
  const [linkedMaterialsLoading, setLinkedMaterialsLoading] = useState(false);

  // Lazy loading states
  const [activeTab, setActiveTab] = useState("raw-materials");
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [hasFetchedOrders, setHasFetchedOrders] = useState(false);
  const [hasFetchedRawMaterials, setHasFetchedRawMaterials] = useState(false);
  const [hasFetchedLinkedMaterials, setHasFetchedLinkedMaterials] = useState(false);

  // Refs to track ongoing fetches
  const fetchingRawMaterials = useRef(false);
  const fetchingOrders = useRef(false);
  const fetchingLinkedMaterials = useRef(false);

  const [rawMaterialsPagination, setRawMaterialsPagination] = useState({ current: 1, pageSize: 15 });
  const [linkedMaterialsPagination, setLinkedMaterialsPagination] = useState({ current: 1, pageSize: 15 });

  useEffect(() => {
    const loadData = async () => {
      if (activeTab === "raw-materials") {
        if (!hasFetchedRawMaterials) {
          await fetchRawMaterials();
          setHasFetchedRawMaterials(true);
        }
      } else if (activeTab === "linking") {
        if (!hasFetchedOrders) {
          await fetchOrders();
          setHasFetchedOrders(true);
        }
        if (!hasFetchedRawMaterials) {
          await fetchRawMaterials();
          setHasFetchedRawMaterials(true);
        }
      } else if (activeTab === "order-status") {
        if (!hasFetchedLinkedMaterials) {
          await fetchLinkedMaterials();
          setHasFetchedLinkedMaterials(true);
        }
      }
    };
    loadData();
  }, [activeTab]);

  const fetchOrders = async () => {
    if (fetchingOrders.current) return;
    fetchingOrders.current = true;
    setOrdersLoading(true);
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
    } finally {
      setOrdersLoading(false);
      fetchingOrders.current = false;
    }
  };

  const fetchRawMaterials = async () => {
    if (fetchingRawMaterials.current) return;
    fetchingRawMaterials.current = true;
    setLoading(true);
    
    try {
      try {
        const response = await fetch(`${API_BASE_URL}/rawmaterials/?skip=0&limit=100`);
        
        if (response.ok) {
          const data = await response.json();
          
          if (Array.isArray(data)) {
            setRawMaterials(data);
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
            return;
          }
        } catch (error) {
          console.error(`Error fetching raw materials from ${endpoint}:`, error);
        }
      }
      
      setRawMaterials([]);
    } finally {
      setLoading(false);
      fetchingRawMaterials.current = false;
    }
  };

  const fetchLinkedMaterials = async () => {
    if (fetchingLinkedMaterials.current) return;
    fetchingLinkedMaterials.current = true;
    setLinkedMaterialsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/order-parts-raw-material-linked/`);
      if (response.ok) {
        const data = await response.json();
        setLinkedMaterials(data);
      }
    } catch (error) {
      console.error("Error fetching linked materials:", error);
    } finally {
      setLinkedMaterialsLoading(false);
      fetchingLinkedMaterials.current = false;
    }
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
        className={`
          flex items-center gap-2 px-3 py-2.5 rounded-lg transition-all duration-200
          ${isSelected 
            ? 'bg-gradient-to-r from-blue-50 to-blue-100 border-l-4 border-blue-500 shadow-sm' 
            : 'hover:bg-gray-50 border-l-4 border-transparent'
          }
        `}
        style={{ marginLeft: `${level * 20}px` }}
      >
        <Checkbox
          checked={!!isSelected}
          onChange={() => togglePartSelection(orderId, part.id)}
          className="mr-2"
        />
        <CodeSandboxOutlined className="text-green-500" />
        <div className="flex flex-col">
            <Text className="font-medium text-gray-800 leading-tight">{part.part_number}</Text>
            <Text className="text-gray-500 text-xs">{part.part_name}</Text>
        </div>
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
      <div key={assembly.id} className="mb-1">
        <div
          className={`
            flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200
            ${hasChildren && isExpanded 
                ? 'bg-gradient-to-r from-gray-50 to-gray-100 border-l-4 border-gray-400' 
                : 'hover:bg-gray-50 border-l-4 border-transparent'
            }
          `}
          style={{ marginLeft: `${level * 20}px` }}
          onClick={() => hasChildren && toggleAssemblyExpand(assembly.id)}
        >
          <div className="flex-shrink-0 w-6">
            {hasChildren && (
              <Button 
                type="text" 
                size="small" 
                icon={isExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
                className="text-blue-500 hover:bg-blue-100 rounded-md"
              />
            )}
          </div>
          <BlockOutlined className="text-blue-500" />
          <div className="flex flex-col">
            <Text className="font-medium text-gray-800 leading-tight">{assembly.assembly_number}</Text>
            <Text className="text-gray-500 text-xs">{assembly.assembly_name}</Text>
          </div>
        </div>
        {isExpanded && (
          <div className="mt-1">
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
        <div className="p-4 ml-6 text-gray-500 flex items-center gap-2">
          <Spin size="small" /> Loading BOM...
        </div>
      );
    }
    if (!bomData) {
      return (
        <div className="p-4 ml-6 text-gray-400 italic">
          No BOM data available
        </div>
      );
    }

    const product = bomData.product;
    const assemblies = bomData.assemblies || [];
    const directParts = bomData.direct_parts || [];

    return (
      <div className="pl-4 border-l-2 border-gray-200 ml-4 mt-2 mb-2 space-y-1">
        {product && (
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 mb-2">
            <AppstoreOutlined className="text-indigo-600" />
            <Text className="font-bold text-gray-800">{product.product_number}</Text>
            <Text className="text-gray-500 text-sm">{product.product_name}</Text>
          </div>
        )}
        {assemblies.map((a) => renderAssembly(a, 0, order.id))}
        {directParts.map((p) => renderPart(p, 0, order.id))}
      </div>
    );
  };

  const renderOrderTree = () => {
    return (
      <div className="p-2 space-y-1">
        {orders.map((order) => {
          const isExpanded = expandedOrders[order.id];
          const hasProduct = !!order.product_id;

          return (
            <div key={order.id} className="mb-1">
              <div
                className={`
                  flex items-center gap-2 px-4 py-3 rounded-lg cursor-pointer transition-all duration-200
                  ${isExpanded 
                    ? 'bg-gradient-to-r from-indigo-50 to-indigo-100 border-l-4 border-indigo-500 shadow-sm' 
                    : 'hover:bg-gray-50 border-l-4 border-transparent'
                  }
                `}
                onClick={() => toggleOrderExpand(order)}
              >
                <div className="w-6 flex-shrink-0">
                  {hasProduct && (
                    <Button
                      type="text"
                      size="small"
                      icon={isExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
                      className="text-indigo-500 hover:bg-indigo-100 rounded-md"
                    />
                  )}
                </div>
                <div className={`w-2 h-2 rounded-full mr-2 ${isExpanded ? 'bg-indigo-500' : 'bg-gray-400'}`} />
                <Text className={`font-medium ${isExpanded ? 'text-indigo-800' : 'text-gray-800'}`}>
                    {order.sale_order_number}
                </Text>
              </div>
              {isExpanded && renderOrderBom(order)}
            </div>
          );
        })}
        {orders.length === 0 && !ordersLoading && (
          <Empty description="No orders found" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
        {ordersLoading && (
          <div className="py-12 flex justify-center">
            <Spin size="large" />
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

  const renderLinkedMaterialsTable = () => {
    const columns = [
      {
        title: <span className="font-semibold text-gray-700">SL NO</span>,
        dataIndex: 'index',
        key: 'index',
        width: 80,
        render: (_, __, index) => <span className="text-gray-500 font-mono">{index + 1}</span>,
      },
      {
        title: <span className="font-semibold text-gray-700">Material Name</span>,
        dataIndex: 'material_name',
        key: 'material_name',
        ellipsis: true,
        render: (text) => <span className="font-medium text-gray-800">{text}</span>
      },
      {
        title: <span className="font-semibold text-gray-700">Part Name</span>,
        dataIndex: 'part_name',
        key: 'part_name',
        ellipsis: true,
        render: (text) => text ? <Tag color="blue">{text}</Tag> : <span className="text-gray-400">-</span>,
      },
      {
        title: <span className="font-semibold text-gray-700">Sale Order</span>,
        dataIndex: 'sale_order_number',
        key: 'sale_order_number',
        render: (text) => <span className="font-mono text-gray-700">{text}</span>
      },
      {
        title: <span className="font-semibold text-gray-700">Project Name</span>,
        dataIndex: 'project_name',
        key: 'project_name',
        ellipsis: true,
        render: (text) => text || <span className="text-gray-400">-</span>,
      },
      {
        title: <span className="font-semibold text-gray-700">Status</span>,
        dataIndex: 'material_status',
        key: 'material_status',
        render: (status) => {
            let color = 'default';
            if (status === 'Completed') color = 'success';
            if (status === 'In Progress') color = 'processing';
            return <Tag color={color}>{status || "-"}</Tag>
        },
      },
      
    ];

    return (
       <Card 
        className="shadow-sm rounded-xl border border-gray-100" 
        bodyStyle={{ padding: 0 }}
        title={
            <div className="flex items-center gap-2">
                <SafetyCertificateOutlined className="text-blue-500" />
                <span className="font-bold text-gray-800">Parts with Raw Materials Status</span>
            </div>
        }
       >
        <Table
            columns={columns}
            dataSource={linkedMaterials}
            rowKey="id"
            size="small"
            bordered
            pagination={{
              current: linkedMaterialsPagination.current,
              pageSize: linkedMaterialsPagination.pageSize,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
              pageSizeOptions: ['10', '20', '50', '100'],
              position: ['bottomCenter'],
            }}
            onChange={(paginationConfig) => {
              setLinkedMaterialsPagination({
                current: paginationConfig.current,
                pageSize: paginationConfig.pageSize,
              });
            }}
            locale={{ emptyText: <Empty description="No linked materials found" /> }}
            className="modern-table"
        />
      </Card>
    );
  };

  const renderMaterialsTable = ({ showSelection = false, showActions = false } = {}) => {
    const columns = [
      {
        title: <span className="font-semibold text-gray-700">#</span>,
        dataIndex: 'index',
        key: 'index',
        width: 60,
        render: (_, __, index) => <span className="text-gray-500 font-mono">{index + 1}</span>,
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
        title: <span className="font-semibold text-gray-700">Mass</span>,
        dataIndex: 'mass',
        key: 'mass',
        render: (text) => text || "-",
      },
      {
        title: <span className="font-semibold text-gray-700">Density</span>,
        dataIndex: 'density',
        key: 'density',
        render: (text) => text || "-",
      },
      {
        title: <span className="font-semibold text-gray-700">Volume</span>,
        dataIndex: 'volume',
        key: 'volume',
        render: (text) => text || "-",
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
        render: (text) => text || "-",
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
        render: (status) => {
            let color = 'default';
            if (status === 'available') color = 'success';
            if (status === 'purchase order') color = 'processing';
            if (status === 'purchase request') color = 'warning';
            return <Tag color={color}>{status ? status.toUpperCase() : "-"}</Tag>
        },
      },
    ];

    if (showActions) {
      columns.push({
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
      });
    }

    const rowSelection = showSelection ? {
      selectedRowKeys: Object.keys(selectedRawMaterialIds).filter(id => selectedRawMaterialIds[id]).map(k => Number(k)),
      onChange: (selectedRowKeys) => {
        const next = {};
        selectedRowKeys.forEach(id => { next[id] = true; });
        setSelectedRawMaterialIds(next);
      },
    } : null;

    return (
      <Card 
        className="shadow-sm rounded-xl border border-gray-100" 
        bodyStyle={{ padding: 0 }}
        title={
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <ExperimentOutlined className="text-purple-600" />
                    <span className="font-bold text-gray-800">Raw Materials Inventory</span>
                </div>
                {showActions && (
                    <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={openCreateRawMaterial}
                    size="large"
                    style={{ backgroundColor: '#2563eb' }}
                    className="border-none shadow-md no-hover-btn"
                    >
                    Add Raw Material
                    </Button>
                )}
            </div>
        }
      >
        <Table
            columns={columns}
            dataSource={rawMaterials}
            rowKey="id"
            size="small"
            bordered
            rowSelection={rowSelection || undefined}
            scroll={{ x: 'max-content' }}
            pagination={{
              current: rawMaterialsPagination.current,
              pageSize: rawMaterialsPagination.pageSize,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
              pageSizeOptions: ['10', '20', '50', '100'],
              position: ['bottomCenter'],
            }}
          onChange={(paginationConfig) => {
            setRawMaterialsPagination({
              current: paginationConfig.current,
              pageSize: paginationConfig.pageSize,
            });
          }}
            locale={{ emptyText: <Empty description="No raw materials found" /> }}
            className="modern-table"
        />
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="flex flex-col items-center">
            <Spin size="large" />
            <p className="mt-4 text-gray-500 font-medium">Loading raw materials...</p>
        </div>
      </div>
    );
  }

  const tabItems = [
    {
      key: 'raw-materials',
      label: (
        <span className="flex items-center gap-2 px-2">
            <ExperimentOutlined /> Raw Materials
        </span>
      ),
      children: renderMaterialsTable({ showSelection: false, showActions: true })
    },
    {
      key: 'linking',
      label: (
        <span className="flex items-center gap-2 px-2">
            <LinkOutlined /> Link Materials
        </span>
      ),
      children: (
        <div className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left side - Orders tree */}
            <div className="lg:col-span-1">
                <Card 
                    title={
                        <div className="flex items-center gap-2">
                            <BlockOutlined className="text-blue-600" />
                            <span className="font-bold text-gray-800">Order Structure</span>
                        </div>
                    }
                    className="shadow-sm rounded-xl border border-gray-100 h-full"
                    bodyStyle={{ padding: '12px', maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}
                >
                    {renderOrderTree()}
                </Card>
            </div>

            {/* Right side - Raw Materials table */}
            <div className="lg:col-span-2 space-y-4">
                {renderMaterialsTable({ showSelection: true, showActions: false })}
                <div className="flex justify-end pt-2">
                    <Button
                        type="primary"
                        icon={<LinkOutlined />}
                        onClick={handleSubmitLinks}
                        loading={linking}
                        size="large"
                        style={{ backgroundColor: '#2563eb' }}
                        className="border-none shadow-md no-hover-btn px-8"
                    >
                        Submit Selections
                    </Button>
                </div>
            </div>
          </div>
        </div>
      )
    },
    {
      key: 'order-status',
      label: (
        <span className="flex items-center gap-2 px-2">
            <SafetyCertificateOutlined /> Parts with Raw Materials Status
        </span>
      ),
      children: <div className="mt-4">{renderLinkedMaterialsTable()}</div>
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      <style>{`
        .no-hover-btn, .no-hover-btn:hover, .no-hover-btn:focus, .no-hover-btn:active {
          background-color: #2563eb !important;
          color: white !important;
          opacity: 1 !important;
          border: none !important;
          box-shadow: none !important;
        }
      `}</style>
      <style>{`
        .modern-table .ant-table-thead > tr > th {
          background: linear-gradient(to bottom, #f0f5ff, #e6f0ff);
          font-weight: 600;
          border-bottom: 2px solid #1890ff;
        }
        .modern-table .ant-table-tbody > tr:hover > td {
          background: #f0f8ff !important;
        }
        .modern-table .ant-table-tbody > tr > td {
          border-bottom: 1px solid #f0f0f0;
        }
        .ant-tabs-nav {
            margin-bottom: 0 !important;
        }
        .ant-card-head {
            border-bottom: 1px solid #f0f0f0;
            min-height: 56px;
        }
      `}</style>

      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="flex items-center justify-between">
            <div>
                <Title level={2} style={{ margin: 0, fontSize: '24px' }} className="flex items-center gap-3 text-gray-800">
                    <ExperimentOutlined className="text-blue-600" />
                    Raw Materials Management
                </Title>
                <Text className="text-gray-500 mt-1 block">Manage raw materials, inventory, and order linking</Text>
            </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-2">
        <Tabs 
            activeKey={activeTab} 
            onChange={setActiveTab} 
            items={tabItems}
            type="card"
            className="custom-tabs"
            tabBarStyle={{ margin: 0, padding: '8px 8px 0 8px' }}
        />
      </div>

      {/* Raw Material Modal */}
      <Modal
        open={rawMaterialModalOpen}
        onCancel={closeRawMaterialModal}
        width={800}
        title={
            <div className="flex items-center gap-2">
                {editingRawMaterial ? <EditOutlined className="text-blue-500" /> : <PlusOutlined className="text-blue-500" />}
                <span className="font-bold text-gray-800">{editingRawMaterial ? "Edit Raw Material" : "Add New Raw Material"}</span>
            </div>
        }
        footer={null}
        destroyOnHidden
        className="rounded-xl overflow-hidden"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSaveRawMaterial}
          className="pt-4"
        >
          <Row gutter={24}>
            <Col span={12}>
              <Form.Item
                name="material_name"
                label={<span className="font-semibold text-gray-700">Material Name</span>}
                rules={[{ required: true, message: 'Please enter material name' }]}
              >
                <Input placeholder="Enter material name" size="large" className="rounded-md" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="material_specification"
                label={<span className="font-semibold text-gray-700">Specification</span>}
              >
                <Input placeholder="Enter specification" size="large" className="rounded-md" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="mass"
                label={<span className="font-semibold text-gray-700">Mass</span>}
              >
                <InputNumber style={{ width: '100%' }} step="any" placeholder="0.00" size="large" className="rounded-md" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="density"
                label={<span className="font-semibold text-gray-700">Density</span>}
              >
                <InputNumber style={{ width: '100%' }} step="any" placeholder="0.00" size="large" className="rounded-md" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="volume"
                label={<span className="font-semibold text-gray-700">Volume</span>}
              >
                <InputNumber style={{ width: '100%' }} step="any" placeholder="0.00" size="large" className="rounded-md" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="stock_type"
                label={<span className="font-semibold text-gray-700">Stock Type</span>}
              >
                <Input placeholder="e.g. Sheet, Bar, Rod" size="large" className="rounded-md" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="quantity"
                label={<span className="font-semibold text-gray-700">Quantity</span>}
              >
                <InputNumber style={{ width: '100%' }} step="any" placeholder="0" size="large" className="rounded-md" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="stock_dimensions"
                label={<span className="font-semibold text-gray-700">Dimensions</span>}
              >
                <Input placeholder="L x W x H" size="large" className="rounded-md" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="status"
                label={<span className="font-semibold text-gray-700">Status</span>}
              >
                <Select placeholder="Select status" size="large" className="rounded-md">
                  <Option value="purchase request">Purchase Request</Option>
                  <Option value="purchase order">Purchase Order</Option>
                  <Option value="available">Available</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          
          <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-100">
            <Button onClick={closeRawMaterialModal} size="large" className="rounded-md">
              Cancel
            </Button>
            <Button 
              type="primary" 
              htmlType="submit" 
              loading={savingRawMaterial} 
              size="large" 
              style={{ backgroundColor: '#2563eb' }}
              className="rounded-md border-none shadow-md no-hover-btn"
            >
              {savingRawMaterial ? "Saving..." : (editingRawMaterial ? "Update Material" : "Create Material")}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default RawMaterials;
