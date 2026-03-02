import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { API_BASE_URL } from "../Config/auth";
import { Table, Badge, Button, message, Spin, Typography, Space, Modal, Card, Tag, Tooltip, Empty } from "antd";
import { ShoppingOutlined, PlusOutlined, EditOutlined, DeleteOutlined, FileTextOutlined, AppstoreOutlined,UserOutlined,CalendarOutlined,
  SearchOutlined,ClockCircleOutlined,CheckCircleOutlined } from "@ant-design/icons";
import OrderModal from "../OMS Components/OrderModal";
import DocumentModal from "../OMS Components/DocumentModal";
import ProductBOMView from "../OMS Components/ProductBOMView";

const OMS = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { productId } = useParams();
  const [messageApi, contextHolder] = message.useMessage();
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [documentModalOpen, setDocumentModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const hasFetchedData = useRef(false);
  const [ordersPagination, setOrdersPagination] = useState({ current: 1, pageSize: 10 });

  const getRolePrefix = () => {
    const path = location.pathname;
    if (path.startsWith('/admin')) return '/admin';
    if (path.startsWith('/project_coordinator')) return '/project_coordinator';
    if (path.startsWith('/operator')) return '/operator';
    return ''; 
  };
  const prefix = getRolePrefix();

  useEffect(() => {
    if (hasFetchedData.current) return;
    
    const fetchData = async () => {
      hasFetchedData.current = true;
      setLoading(true);
      try {
        await Promise.all([
          fetchOrders(),
          fetchCustomers(), 
          fetchProducts()
        ]);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const fetchCustomers = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/customers/`);
      if (response.ok) {
        const data = await response.json();
        setCustomers(data);
      }
    } catch (error) {
      console.error("Error fetching customers:", error);
    }
  };

  const fetchProducts = async () => {
    try {
      let url = `${API_BASE_URL}/products/`;
      if (prefix === '/project_coordinator') {
        try {
          const stored = localStorage.getItem('user');
          const u = stored ? JSON.parse(stored) : null;
          if (u?.id) {
            url = `${API_BASE_URL}/products/?user_id=${u.id}`;
          }
        } catch (e) {
          console.error('Failed to parse user from localStorage', e);
        }
      }
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setProducts(data);
      }
    } catch (error) {
      console.error("Error fetching products:", error);
    }
  };

  const fetchOrders = async () => {
    try {
      let url = `${API_BASE_URL}/orders/?skip=0&limit=1000`;
      if (prefix === '/project_coordinator') {
        try {
          const stored = localStorage.getItem('user');
          const u = stored ? JSON.parse(stored) : null;
          if (u?.id) {
            url = `${API_BASE_URL}/orders/?user_id=${u.id}&skip=0&limit=1000`;
          }
        } catch (e) {
          console.error('Failed to parse user from localStorage', e);
        }
      }
      let data = [];
      let ok = false;
      try {
        const response = await fetch(url);
        ok = response.ok;
        if (ok) {
          data = await response.json();
        }
      } catch (_) {}
      if ((!ok || !Array.isArray(data) || data.length === 0) && prefix === '/admin') {
        const alt = await fetch(`${API_BASE_URL}/orders/with-customers?skip=0&limit=1000`);
        if (alt.ok) {
          const altData = await alt.json();
          setOrders(Array.isArray(altData) ? altData : []);
          return;
        }
      }
      setOrders(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching orders:", error);
      setOrders([]);
    }
  };

  const getCustomerName = (customerId) => {
    const customer = customers.find((c) => c.id === customerId);
    return customer?.company_name ?? customerId;
  };

  const getProductName = (productId) => {
    const product = products.find((p) => p.id === productId);
    return (product?.product_name || product?.product_number) ?? productId;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleDateString();
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      Pending: { color: "warning", text: "Pending" },
      Ongoing: { color: "processing", text: "Ongoing" },
      Completed: { color: "success", text: "Completed" },
    };

    const config = statusConfig[status] || { color: "default", text: status };
    return <Tag color={config.color}>{config.text?.toUpperCase()}</Tag>;
  };

  const handleCreateOrder = () => {
    setEditingOrder(null);
    setOrderModalOpen(true);
  };

  const handleEditOrder = (order) => {
    setEditingOrder(order);
    setOrderModalOpen(true);
  };

  const handleOrderCreated = (order) => {
    fetchOrders();
    setOrderModalOpen(false);
    setEditingOrder(null);
    if (order) {
      messageApi.success(`Order "${order.sale_order_number}" created successfully!`);
    }
  };

  const handleDeleteOrder = (order) => {
    Modal.confirm({
      title: "Delete Order",
      content: `Are you sure you want to delete order "${order.sale_order_number}"?`,
      okText: "Delete",
      okType: "danger",
      cancelText: "Cancel",
      centered: true,
      onOk: async () => {
        try {
          const response = await fetch(`${API_BASE_URL}/orders/${order.id}`, { method: "DELETE" });
          if (response.ok) {
            fetchOrders();
            messageApi.success(`Order "${order.sale_order_number}" deleted successfully!`);
          } else {
            const data = await response.json();
            messageApi.error(data.detail || "Failed to delete order");
          }
        } catch (error) {
          console.error("Error deleting order:", error);
          messageApi.error("Failed to delete order");
        }
      },
    });
  };

  const handleDocumentUploaded = (document) => {
    setDocumentModalOpen(false);
    if (document) {
      messageApi.success(`Document "${document.document_name}" uploaded successfully!`);
    }
  };

  const handleViewBOM = (productId) => {
    navigate(`${prefix}/oms/product/${productId}`);
  };

  const handleBackToOrders = () => {
    navigate(`${prefix}/oms`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="flex flex-col items-center">
            <Spin size="large" />
            <p className="mt-4 text-gray-500 font-medium">Loading orders...</p>
        </div>
      </div>
    );
  }

  if (productId) {
    return (
      <ProductBOMView 
        productId={productId}
        onBackToOrders={handleBackToOrders}
      />
    );
  }

  const columns = [
    {
      title: <span className="font-semibold text-gray-700">SL NO</span>,
      dataIndex: "serial",
      key: "serial",
      width: 80,
      render: (_, __, index) => <span className="text-gray-500 font-mono">{index + 1}</span>,
    },
    {
      title: <span className="font-semibold text-gray-700">Project Number</span>,
      dataIndex: "sale_order_number",
      key: "sale_order_number",
      render: (text) => <span className="font-medium text-gray-800">{text}</span>,
    },
    {
      title: <span className="font-semibold text-gray-700">Project Name</span>,
      dataIndex: "project_name",
      key: "project_name",
      render: (text) => <span className="text-gray-600">{text}</span>,
    },
    {
      title: <span className="font-semibold text-gray-700">Customer</span>,
      dataIndex: "customer_id",
      key: "customer_id",
      render: (customerId) => (
        <Space>
            <UserOutlined className="text-gray-400" />
            <span className="text-gray-700">{getCustomerName(customerId)}</span>
        </Space>
      ),
    },
    {
      title: <span className="font-semibold text-gray-700">Product</span>,
      dataIndex: "product_id",
      key: "product_id",
      render: (productId) => (
        <Button 
          type="link" 
          onClick={() => handleViewBOM(productId)}
          style={{ padding: 0 }}
          icon={<AppstoreOutlined />}
          className="flex items-center gap-1"
        >
          {getProductName(productId)}
        </Button>
      ),
    },
    {
      title: <span className="font-semibold text-gray-700">Qty</span>,
      dataIndex: "quantity",
      key: "quantity",
      width: 80,
      render: (text) => <span className="font-mono text-gray-700">{text}</span>,
    },
    {
      title: <span className="font-semibold text-gray-700">Order Date</span>,
      dataIndex: "order_date",
      key: "order_date",
      render: (date) => (
        <Space className="text-gray-500">
            <CalendarOutlined />
            {formatDate(date)}
        </Space>
      ),
    },
    {
      title: <span className="font-semibold text-gray-700">Due Date</span>,
      dataIndex: "due_date",
      key: "due_date",
      render: (date) => (
        <Space className="text-gray-500">
            <CalendarOutlined />
            {formatDate(date)}
        </Space>
      ),
    },
    {
      title: <span className="font-semibold text-gray-700">Status</span>,
      dataIndex: "status",
      key: "status",
      render: (status) => getStatusBadge(status),
    },
    {
      title: <span className="font-semibold text-gray-700">Project Coordinator</span>,
      dataIndex: "user_name",
      key: "user_name",
      render: (text, record) => (
        <Space>
          <UserOutlined className="text-gray-400" />
          <span className="text-gray-700">{text || record.user_id}</span>
        </Space>
      ),
    },
    {
      title: <span className="font-semibold text-gray-700">Actions</span>,
      key: "actions",
      width: 150,
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="Edit Order">
            <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                className="text-blue-500 hover:bg-blue-50"
                onClick={() => handleEditOrder(record)}
            />
          </Tooltip>
          <Tooltip title="Documents">
            <Button 
                type="text"
                size="small" 
                icon={<FileTextOutlined />}
                className="text-purple-500 hover:bg-purple-50"
                onClick={() => {
                setSelectedOrderId(record.id);
                setDocumentModalOpen(true);
                }}
            />
          </Tooltip>
          <Tooltip title="Delete Order">
            <Button
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                className="text-red-500 hover:bg-red-50"
                onClick={() => handleDeleteOrder(record)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  // KPI stats (Project Coordinator)
  const totalOrders = orders.length;
  const inProgressCount = orders.filter(o => o.status === 'Pending').length;
  const scheduledCount = orders.filter(o => o.status === 'Ongoing').length;
  const completedCount = orders.filter(o => o.status === 'Completed').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
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
        .ant-card-head {
            border-bottom: 1px solid #f0f0f0;
            min-height: 56px;
        }
        .no-hover-btn, .no-hover-btn:hover, .no-hover-btn:focus, .no-hover-btn:active {
          background-color: #2563eb !important;
          color: white !important;
          opacity: 1 !important;
          border: none !important;
          box-shadow: none !important;
        }
      `}</style>

      {contextHolder}

      {/* KPI Cards - only for Project Coordinator */}
      {prefix === '/project_coordinator' && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="rounded-xl p-4 bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-100 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600">Total Orders</div>
                <div className="text-2xl font-bold text-blue-700">{totalOrders}</div>
              </div>
              <ShoppingOutlined className="text-blue-600 text-2xl" />
            </div>
          </div>
          <div className="rounded-xl p-4 bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-100 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600">Pending</div>
                <div className="text-2xl font-bold text-orange-600">{inProgressCount}</div>
              </div>
              <AppstoreOutlined className="text-orange-500 text-2xl" />
            </div>
          </div>
          <div className="rounded-xl p-4 bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-100 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600">Scheduled</div>
                <div className="text-2xl font-bold text-purple-600">{scheduledCount}</div>
              </div>
              <ClockCircleOutlined className="text-purple-500 text-2xl" />
            </div>
          </div>
          <div className="rounded-xl p-4 bg-gradient-to-br from-green-50 to-green-100 border border-green-100 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600">Completed</div>
                <div className="text-2xl font-bold text-green-600">{completedCount}</div>
              </div>
              <CheckCircleOutlined className="text-green-500 text-2xl" />
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="flex items-center justify-between">
            <div>
                <Typography.Title level={2} style={{ margin: 0, fontSize: '24px' }} className="flex items-center gap-3 text-gray-800">
                    <ShoppingOutlined className="text-blue-600" />
                    Order Management
                </Typography.Title>
                <Typography.Text className="text-gray-500 mt-1 block">
                    Manage sales orders, track status, and handle documents
                </Typography.Text>
            </div>
            <Button 
                type="primary" 
                icon={<PlusOutlined />}
                onClick={handleCreateOrder}
                size="large"
                style={{ backgroundColor: '#2563eb' }}
                className="border-none shadow-md no-hover-btn"
            >
                New Order
            </Button>
        </div>
      </div>
      <Card 
        className="shadow-sm rounded-xl border border-gray-100" 
        styles={{ body: { padding: 0 } }}
      >
        <Table
            columns={columns}
            dataSource={orders}
            rowKey="id"
            pagination={{
                current: ordersPagination.current,
                pageSize: ordersPagination.pageSize,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
                pageSizeOptions: ['10', '20', '50', '100'],
                position: ['bottomCenter'],
            }}
            onChange={(paginationConfig) => {
                setOrdersPagination({
                    current: paginationConfig.current,
                    pageSize: paginationConfig.pageSize,
                });
            }}
            size="small"
            bordered
            className="modern-table"
            locale={{ emptyText: <Empty description="No orders found" /> }}
            scroll={{ x: 'max-content' }}
        />
      </Card>

      
      {/* Modals */}
      <OrderModal
        isOpen={orderModalOpen}
        onClose={() => setOrderModalOpen(false)}
        onOrderCreated={handleOrderCreated}
        editingOrder={editingOrder}
        customers={customers}
        products={products}
      />
      
      <DocumentModal
        isOpen={documentModalOpen}
        onClose={() => setDocumentModalOpen(false)}
        onDocumentUploaded={handleDocumentUploaded}
        orderId={selectedOrderId}
        orders={orders}
      />
    </div>
  );
};

export default OMS;
