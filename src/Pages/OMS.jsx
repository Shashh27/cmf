import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { API_BASE_URL } from "../Config/auth";
import { Table, Badge, Button, message, Spin, Typography, Space, Modal, Card, Tag, Tooltip, Empty, Input } from "antd";
import { ShoppingOutlined, PlusOutlined, EditOutlined, DeleteOutlined, FileTextOutlined, AppstoreOutlined,UserOutlined,CalendarOutlined,
  SearchOutlined,ClockCircleOutlined,CheckCircleOutlined } from "@ant-design/icons";
import OrderModal from "../OMS Components/OrderModal";
import DocumentModal from "../OMS Components/DocumentModal";
import ProductBOMView from "../OMS Components/ProductBOMView";
import OMSOrdersPdfDownload from "../DownloadReports/OMSOrdersPdfDownload";

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
  const [searchText, setSearchText] = useState("");
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
    if (hasFetchedData.current || productId) return;
    
    const fetchData = async () => {
      hasFetchedData.current = true;
      setLoading(true);
      try {
        await fetchOrders();
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [productId]);

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
      let url = `${API_BASE_URL}/orders/`;
      if (prefix === '/project_coordinator') {
        try {
          const stored = localStorage.getItem('user');
          const u = stored ? JSON.parse(stored) : null;
          if (u?.id) {
            url = `${API_BASE_URL}/orders/?user_id=${u.id}`;
          }
        } catch (e) {
          console.error('Failed to parse user from localStorage', e);
        }
      }
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setOrders(Array.isArray(data) ? data : []);
      } else {
        setOrders([]);
      }
    } catch (error) {
      console.error("Error fetching orders:", error);
      setOrders([]);
    }
  };

  const getCustomerName = (customerId, record) => {
    const customer = customers.find((c) => c.id === customerId);
    if (customer) return customer.company_name;
    return record?.customer_name ?? customerId;
  };

  const getProductName = (productId, record) => {
    const product = products.find((p) => p.id === productId);
    if (product) return (product.product_name || product.product_number);
    return record?.product_name ?? productId;
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
            const result = await response.json();
            fetchOrders();
            if (result.product_also_deleted) {
              messageApi.success(`Order "${order.sale_order_number}" and its associated product deleted successfully!`);
            } else {
              messageApi.success(`Order "${order.sale_order_number}" deleted successfully!`);
            }
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

  const handleSearch = (value) => {
    setSearchText(value);
  };

  const filteredOrders = orders.filter(order => {
    if (!searchText) return true;
    
    const searchLower = searchText.toLowerCase();
    const customerName = String(getCustomerName(order.customer_id, order) || "").toLowerCase();
    const productName = String(getProductName(order.product_id, order) || "").toLowerCase();
    const projectName = String(order.project_name || "").toLowerCase();
    const saleOrderNumber = String(order.sale_order_number || "").toLowerCase();
    const userName = String(order.user_name || "").toLowerCase();
    
    return (
      projectName.includes(searchLower) ||
      saleOrderNumber.includes(searchLower) ||
      customerName.includes(searchLower) ||
      productName.includes(searchLower) ||
      userName.includes(searchLower)
    );
  });

  if (productId) {
    return (
      <ProductBOMView 
        productId={productId}
        onBackToOrders={handleBackToOrders}
      />
    );
  }

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
      render: (customerId, record) => (
        <Space>
            <UserOutlined className="text-gray-400" />
            <span className="text-gray-700">{getCustomerName(customerId, record)}</span>
        </Space>
      ),
    },
    {
      title: <span className="font-semibold text-gray-700">Product</span>,
      dataIndex: "product_id",
      key: "product_id",
      render: (productId, record) => (
        <Button 
          type="link" 
          onClick={() => handleViewBOM(productId)}
          style={{ padding: 0 }}
          icon={<AppstoreOutlined />}
          className="flex items-center gap-1"
        >
          {getProductName(productId, record)}
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

  const ordersForPdf = orders.map(order => ({
    ...order,
    customer_name: getCustomerName(order.customer_id, order),
    product_name: getProductName(order.product_id, order),
  }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-2 sm:p-4 lg:p-6">
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
        .ant-input-search:hover .ant-input {
          border-color: #4096ff !important;
        }
        .ant-input-search:hover .ant-input-group-addon {
          background-color: #4096ff !important;
          border-color: #4096ff !important;
        }
        .ant-input-search:hover .ant-input-group-addon .anticon {
          color: white !important;
        }
        @media (max-width: 768px) {
          .ant-table {
            font-size: 12px;
          }
          .ant-table-thead > tr > th {
            padding: 8px 4px;
          }
          .ant-table-tbody > tr > td {
            padding: 8px 4px;
          }
        }
      `}</style>

      {contextHolder}

      {/* KPI Cards - only for Project Coordinator */}
      {prefix === '/project_coordinator' && (
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4 mb-4 lg:mb-6">
          <div className="rounded-lg lg:rounded-xl p-3 sm:p-4 bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs sm:text-sm text-gray-600">Total Orders</div>
                <div className="text-xl sm:text-2xl font-bold text-blue-700">{totalOrders}</div>
              </div>
              <ShoppingOutlined className="text-blue-600 text-xl sm:text-2xl" />
            </div>
          </div>
          <div className="rounded-lg lg:rounded-xl p-3 sm:p-4 bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs sm:text-sm text-gray-600">Pending</div>
                <div className="text-xl sm:text-2xl font-bold text-orange-600">{inProgressCount}</div>
              </div>
              <AppstoreOutlined className="text-orange-500 text-xl sm:text-2xl" />
            </div>
          </div>
          <div className="rounded-lg lg:rounded-xl p-3 sm:p-4 bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs sm:text-sm text-gray-600">Scheduled</div>
                <div className="text-xl sm:text-2xl font-bold text-purple-600">{scheduledCount}</div>
              </div>
              <ClockCircleOutlined className="text-purple-500 text-xl sm:text-2xl" />
            </div>
          </div>
          <div className="rounded-lg lg:rounded-xl p-3 sm:p-4 bg-gradient-to-br from-green-50 to-green-100 border border-green-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs sm:text-sm text-gray-600">Completed</div>
                <div className="text-xl sm:text-2xl font-bold text-green-600">{completedCount}</div>
              </div>
              <CheckCircleOutlined className="text-green-500 text-xl sm:text-2xl" />
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-lg lg:rounded-xl shadow-sm border border-gray-100 p-3 sm:p-4 mb-4 lg:mb-6">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 lg:gap-4">
            <div className="w-full lg:w-auto">
                <Typography.Title 
                  level={2} 
                  style={{ margin: 0, fontSize: 'clamp(18px, 4vw, 24px)' }} 
                  className="flex items-center gap-2 sm:gap-3 text-gray-800"
                >
                    <ShoppingOutlined className="text-blue-600" />
                    <span className="hidden sm:inline">Order Management</span>
                    <span className="sm:hidden">Orders</span>
                </Typography.Title>
                <Typography.Text className="text-gray-500 mt-1 block text-xs sm:text-sm">
                    Manage sales orders, track status, and handle documents
                </Typography.Text>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
              <Input.Search
                placeholder="Search orders..."
                allowClear
                onSearch={handleSearch}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full sm:w-64 lg:w-80"
                size="middle"
              />
              <div className="flex gap-2">
                <OMSOrdersPdfDownload
                  orders={ordersForPdf}
                  formatDate={formatDate}
                />
                <Button 
                    type="primary" 
                    icon={<PlusOutlined />}
                    onClick={handleCreateOrder}
                    size="middle"
                    style={{ backgroundColor: '#2563eb' }}
                    className="border-none shadow-md no-hover-btn flex-1 sm:flex-initial"
                >
                    <span className="hidden sm:inline">New Order</span>
                    <span className="sm:hidden">New</span>
                </Button>
              </div>
            </div>
        </div>
      </div>
      <Card 
        className="shadow-sm rounded-lg lg:rounded-xl border border-gray-100" 
        styles={{ body: { padding: 0 } }}
      >
        <Table
            columns={columns}
            dataSource={filteredOrders}
            rowKey="id"
            pagination={{
                current: ordersPagination.current,
                pageSize: ordersPagination.pageSize,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
                pageSizeOptions: ['10', '20', '50', '100'],
                placement: 'bottom',
                responsive: true,
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
            locale={{ emptyText: <Empty description={searchText ? "No orders found matching your search" : "No orders found"} /> }}
            scroll={{ x: 1200 }}
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
        fetchCustomers={fetchCustomers}
        fetchProducts={fetchProducts}
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
