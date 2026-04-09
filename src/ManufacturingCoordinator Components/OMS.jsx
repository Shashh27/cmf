import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth";
import { Table, Badge, Button, message, Spin, Typography, Space, Modal, Card, Tag, Tooltip, Empty, Input, DatePicker } from "antd";
import { ShoppingOutlined, PlusOutlined, EditOutlined, DeleteOutlined, FileTextOutlined, AppstoreOutlined,UserOutlined,CalendarOutlined,
  SearchOutlined,ClockCircleOutlined,CheckCircleOutlined, FilterOutlined } from "@ant-design/icons";
import OrderModal from "./OMS Components/OrderModal";
import DocumentModal from "./OMS Components/DocumentModal";
import OMSOrdersPdfDownload from "../DownloadReports/OMSOrdersPdfDownload";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";

dayjs.extend(isBetween);

const { RangePicker } = DatePicker;

const OMS = () => {
  const navigate = useNavigate();
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
  const [dateRange, setDateRange] = useState(null);
  const hasFetchedData = useRef(false);
  const [ordersPagination, setOrdersPagination] = useState({ current: 1, pageSize: 10 });

  const getCurrentUserId = () => {
    try {
      const stored = localStorage.getItem("user");
      if (!stored) return null;
      const user = JSON.parse(stored);
      if (user?.id == null) return null;
      return user.id;
    } catch {
      return null;
    }
  };

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
      const response = await axios.get(`${API_BASE_URL}/customers/`);
      setCustomers(response.data);
    } catch (error) {
      console.error("Error fetching customers:", error);
    }
  };

  const fetchProducts = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/products/`);
      setProducts(response.data);
    } catch (error) {
      console.error("Error fetching products:", error);
    }
  };

  const fetchOrders = async () => {
    try {
      const uid = getCurrentUserId();
      // For manufacturing coordinator view, filter by manufacturing_coordinator_id instead of admin_id
      const response = await axios.get(`${API_BASE_URL}/orders/`, {
        params: uid != null ? { manufacturing_coordinator_id: uid } : undefined,
      });
      const data = response.data;
      setOrders(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching orders:", error);
      setOrders([]);
    }
  };

  const getCustomerName = (customerId, record) => {
    const customer = customers.find((c) => c.id === customerId);
    if (customer) {
      if (customer.branch) {
        return `${customer.company_name} (${customer.branch})`;
      }
      return customer.company_name;
    }
    const baseName = record?.company_name ?? record?.customer_name ?? customerId;
    const branch = record?.branch;
    return branch ? `${baseName} (${branch})` : baseName;
  };

  const getProductName = (productId, record) => {
    const product = products.find((p) => p.id === productId);
    if (product) return product.product_name || `Project ${productId}`;
    return record?.product_name ?? `Project ${productId}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    return dayjs(dateStr).format("DD/MM/YYYY");
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
    const isUpdate = !!editingOrder;
    fetchOrders();
    setOrderModalOpen(false);
    setEditingOrder(null);
    if (order) {
      messageApi.success(`Order "${order.sale_order_number}" ${isUpdate ? 'updated' : 'created'} successfully!`);
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
          const response = await axios.delete(`${API_BASE_URL}/orders/${order.id}`);
          const result = response.data || {};
          fetchOrders();
          if (result.product_also_deleted) {
            messageApi.success(`Order "${order.sale_order_number}" and its associated product deleted successfully!`);
          } else {
            messageApi.success(`Order "${order.sale_order_number}" deleted successfully!`);
          }
        } catch (error) {
          console.error("Error deleting order:", error);
          const detail =
            error?.response?.data?.detail ||
            error?.response?.data?.message ||
            "Failed to delete order";
          messageApi.error(detail);
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

  const handleSearch = (value) => {
    const filteredValue = (value || '').replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 20);
    setSearchText(filteredValue);
  };

  const handleDateRangeChange = (dates) => {
    setDateRange(dates);
  };

  const orderDatesSet = useMemo(() => {
    const dates = new Set();
    orders.forEach(order => {
      if (order.order_date) dates.add(dayjs(order.order_date).format('YYYY-MM-DD'));
      if (order.due_date) dates.add(dayjs(order.due_date).format('YYYY-MM-DD'));
    });
    return dates;
  }, [orders]);

  const disabledDate = (current) => {
    if (!current) return false;
    // Check if the current date is in our set of order dates
    return !orderDatesSet.has(current.format('YYYY-MM-DD'));
  };

  const filteredOrders = orders.filter((order, index) => {
    // 0. Product ID Filter (from URL)
    if (productId && order.product_id?.toString() !== productId) return false;

    // 1. Date Range Filter
    if (dateRange && dateRange[0] && dateRange[1]) {
      const start = dateRange[0].startOf('day');
      const end = dateRange[1].endOf('day');
      const orderDate = order.order_date ? dayjs(order.order_date) : null;
      const dueDate = order.due_date ? dayjs(order.due_date) : null;

      // If a date exists, check if it falls within the range [start, end]
      const isOrderDateInRange = orderDate && (orderDate.isAfter(start) || orderDate.isSame(start)) && (orderDate.isBefore(end) || orderDate.isSame(end));
      const isDueDateInRange = dueDate && (dueDate.isAfter(start) || dueDate.isSame(start)) && (dueDate.isBefore(end) || dueDate.isSame(end));

      // Show the order if EITHER date falls within the range
      if (!isOrderDateInRange && !isDueDateInRange) return false;
    }

    // 2. Global Search Filter (Table Headers)
    if (!searchText) return true;
    
    const searchLower = searchText.toLowerCase();
    
    // SL NO (index + 1)
    const slNo = String(index + 1);
    
    // Project Number
    const saleOrderNumber = String(order.sale_order_number || "").toLowerCase();
    
    // Customer
    const customerName = String(getCustomerName(order.customer_id, order) || "").toLowerCase();
    
    // Project Name (from product)
    const productName = String(getProductName(order.product_id, order) || "").toLowerCase();
    
    // Qty
    const quantity = String(order.quantity || "");
    
    // Dates (formatted)
    const formattedOrderDate = formatDate(order.order_date).toLowerCase();
    const formattedDueDate = formatDate(order.due_date).toLowerCase();
    
    // Status
    const status = String(order.status || "").toLowerCase();
    
    // Project Coordinator
    const userName = String(order.user_name || order.user_id || "").toLowerCase();
    
    return (
      slNo.includes(searchLower) ||
      saleOrderNumber.includes(searchLower) ||
      customerName.includes(searchLower) ||
      productName.includes(searchLower) ||
      quantity.includes(searchLower) ||
      formattedOrderDate.includes(searchLower) ||
      formattedDueDate.includes(searchLower) ||
      status.includes(searchLower) ||
      userName.includes(searchLower)
    );
  });

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
      render: (_, __, index) => {
        const { current, pageSize } = ordersPagination;
        return <span className="text-gray-500 font-mono">{(current - 1) * pageSize + index + 1}</span>;
      },
    },
    {
      title: <span className="font-semibold text-gray-700">Project Number</span>,
      dataIndex: "sale_order_number",
      key: "sale_order_number",
      render: (text) => <span className="font-medium text-gray-800">{text}</span>,
    },
    {
      title: <span className="font-semibold text-gray-700">Project Name</span>,
      dataIndex: "product_id",
      key: "product_id",
      render: (productId, record) => (
        <Button
          type="link"
          className="p-0 h-auto"
          onClick={() => {
            if (!productId) return;
            navigate(`/manufacturing_coordinator/pdm/${productId}?from=oms&orderId=${record.id}`);
          }}
        >
          <Space className="text-gray-700">
            <AppstoreOutlined className="text-blue-500" />
            <span className="underline">{getProductName(productId, record)}</span>
          </Space>
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
      title: <span className="font-semibold text-gray-700">Admin</span>,
      dataIndex: "admin_name",
      key: "admin_name",
      render: (text, record) => (
        <Space>
          <UserOutlined className="text-gray-400" />
          <span className="text-gray-700">{text || record.admin_id || "-"}</span>
        </Space>
      ),
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
      title: <span className="font-semibold text-gray-700">Status</span>,
      dataIndex: "status",
      key: "status",
      render: (status) => getStatusBadge(status),
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
                // 
                disabled
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
                // onClick={() => handleDeleteOrder(record)}
                disabled
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  // KPI stats
  const totalOrders = filteredOrders.length;
  const inProgressCount = filteredOrders.filter(o => o.status === 'Pending').length;
  const scheduledCount = filteredOrders.filter(o => o.status === 'Scheduled').length;
  const completedCount = filteredOrders.filter(o => o.status === 'Completed').length;

  const ordersForPdf = filteredOrders.map(order => ({
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

      {/* KPI Cards */}
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
              <RangePicker
                onChange={handleDateRangeChange}
                disabledDate={disabledDate}
                className="w-full sm:w-64"
                format="DD/MM/YYYY"
                placeholder={["Start Date", "End Date"]}
                inputReadOnly
              />
              <Input.Search
                placeholder="Search by any field..."
                allowClear
                onSearch={handleSearch}
                onChange={(e) => handleSearch(e.target.value)}
                value={searchText}
                maxLength={20}
                className="w-full sm:w-64 lg:w-80"
                size="middle"
              />
              <div className="flex gap-2">
                <OMSOrdersPdfDownload
                  orders={ordersForPdf}
                  formatDate={formatDate}
                />


                
                {/* <Button 
                    type="primary" 
                    icon={<PlusOutlined />}
                    onClick={handleCreateOrder}
                    size="middle"
                    style={{ backgroundColor: '#2563eb' }}
                    className="border-none shadow-md no-hover-btn flex-1 sm:flex-initial"
                >
                    <span className="hidden sm:inline">New Order</span>
                    <span className="sm:hidden">New</span>
                </Button> */}




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
