import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth";
import { Table, Badge, Button, message, Spin, Typography, Space, Modal, Card, Tag, Tooltip, Empty, Input, DatePicker, Select } from "antd";
import { ShoppingOutlined, PlusOutlined, EditOutlined, DeleteOutlined, FileTextOutlined, AppstoreOutlined,UserOutlined,CalendarOutlined,
  SearchOutlined,ClockCircleOutlined,CheckCircleOutlined, FilterOutlined, SyncOutlined } from "@ant-design/icons";
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

  const [loading, setLoading] = useState(true);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [documentModalOpen, setDocumentModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [dateRange, setDateRange] = useState(null);
  const [filterCustomers, setFilterCustomers] = useState([]);
  const [filterProjects, setFilterProjects] = useState([]);
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
        await fetchOrders();
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);




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
    const baseName = record?.company_name ?? record?.customer_name ?? customerId;
    const branch = record?.branch;
    return branch ? `${baseName} (${branch})` : baseName;
  };


  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    return dayjs(dateStr).format("DD/MM/YYYY");
  };


  const getStatusBadge = (status) => {
    const statusConfig = {
      'Pending': { color: "orange", text: "Pending" },
      'Scheduled': { color: "purple", text: "Scheduled" },
      'In Progress': { color: "blue", text: "In Progress" },
      'Completed': { color: "green", text: "Completed" },
    };

    const config = statusConfig[status] || { color: "default", text: status };
    return <Tag color={config.color}>{config.text?.toUpperCase()}</Tag>;
  };

  const getApprovalStatusBadge = (approvalStatus) => {
    const statusConfig = {
      'Pending Approval': { color: "orange", text: "Pending Approval" },
      'Approved': { color: "green", text: "Approved" },
      'Rejected': { color: "red", text: "Rejected" },
    };

    const config = statusConfig[approvalStatus] || { color: "default", text: approvalStatus };
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

  const uniqueCustomerOptions = useMemo(() => {
    const seen = new Set();
    return orders
      .map(o => ({ id: o.customer_id, label: getCustomerName(o.customer_id, o) }))
      .filter(({ id, label }) => { if (!id || seen.has(id)) return false; seen.add(id); return true; })
      .sort((a, b) => String(a.label).localeCompare(String(b.label)))
      .map(({ id, label }) => ({ value: id, label }));
  }, [orders]);

  const uniqueProjectOptions = useMemo(() => {
    const seen = new Set();
    return orders
      .map(o => ({ id: o.product_id, label: o.product_name || `Project ${o.product_id}` }))
      .filter(({ id, label }) => { if (!id || seen.has(id)) return false; seen.add(id); return true; })
      .sort((a, b) => a.label.localeCompare(b.label))
      .map(({ id, label }) => ({ value: id, label }));
  }, [orders]);

  const filteredOrders = orders.filter((order, index) => {
    // 0. Product ID Filter (from URL)
    if (productId && order.product_id?.toString() !== productId) return false;

    // Customer multi-select filter
    if (filterCustomers.length > 0 && !filterCustomers.includes(order.customer_id)) return false;

    // Project multi-select filter
    if (filterProjects.length > 0 && !filterProjects.includes(order.product_id)) return false;

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
    const productName = String(order.product_name || "").toLowerCase();
    
    // Qty
    const quantity = String(order.quantity || "");
    
    // Dates (formatted)
    const formattedOrderDate = formatDate(order.order_date).toLowerCase();
    const formattedDueDate = formatDate(order.due_date).toLowerCase();
    
    // Status
    const status = String(order.status || "").toLowerCase();
    
    // Project Coordinator
    const userName = String(
      order.project_coordinator_name || 
      order.project_coordinator_id || 
      order.admin_name || 
      order.admin_id || ""
    ).toLowerCase();
    
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
        record.approval_status === "Rejected" ? (
          <Tooltip title="Order rejected - cannot access project">
            <Space className="text-gray-400">
              <AppstoreOutlined />
              <span className="font-medium">{record.product_name || `Project ${productId}`}</span>
            </Space>
          </Tooltip>
        ) : (
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
              <span className="underline">{record.product_name || `Project ${productId}`}</span>
            </Space>
          </Button>
        )
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
      sorter: (a, b) => dayjs(a.order_date || 0).unix() - dayjs(b.order_date || 0).unix(),
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
      sorter: (a, b) => dayjs(a.due_date || 0).unix() - dayjs(b.due_date || 0).unix(),
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
      dataIndex: "project_coordinator_name",
      key: "project_coordinator_name",
      filters: Array.from(new Set(orders.map(o => o.project_coordinator_name || o.project_coordinator_id || o.admin_name || o.admin_id).filter(Boolean))).sort().map(v => ({ text: v, value: v })),
      onFilter: (value, record) => (record.project_coordinator_name || record.project_coordinator_id || record.admin_name || record.admin_id) === value,
      render: (text, record) => (
        <Space>
          <UserOutlined className="text-gray-400" />
          <span className="text-gray-700">
            {text || record.project_coordinator_id || record.admin_name || record.admin_id || "-"}
          </span>
        </Space>
      ),
    },
    {
      title: <span className="font-semibold text-gray-700">Status</span>,
      dataIndex: "status",
      key: "status",
      filters: ['Pending', 'Scheduled', 'In Progress', 'Completed'].map(s => ({ text: s, value: s })),
      onFilter: (value, record) => record.status === value,
      render: (status) => getStatusBadge(status),
    },
    {
      title: <span className="font-semibold text-gray-700">Approval Status</span>,
      dataIndex: "approval_status",
      key: "approval_status",
      filters: ['Pending Approval', 'Approved', 'Rejected'].map(s => ({ text: s, value: s })),
      onFilter: (value, record) => record.approval_status === value,
      render: (approvalStatus) => getApprovalStatusBadge(approvalStatus),
    },
    {
      title: <span className="font-semibold text-gray-700">Approval Remarks</span>,
      dataIndex: "approval_remarks",
      key: "approval_remarks",
      render: (remarks) => (
        <span className="text-gray-600 text-sm">
          {remarks || "-"}
        </span>
      ),
    },
    {
      title: <span className="font-semibold text-gray-700">Approved At</span>,
      dataIndex: "approved_at",
      key: "approved_at",
      render: (date) => (
        <span className="text-gray-600 text-sm">
          {date ? formatDate(date) : "-"}
        </span>
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
  const pendingCount = filteredOrders.filter(o => o.status === 'Pending').length;
  const scheduledCount = filteredOrders.filter(o => o.status === 'Scheduled').length;
  const inProgressCount = filteredOrders.filter(o => o.status === 'In Progress').length;
  const completedCount = filteredOrders.filter(o => o.status === 'Completed').length;

  const ordersForPdf = filteredOrders.map(order => ({
    ...order,
    customer_name: getCustomerName(order.customer_id, order),
    product_name: order.product_name || `Project ${order.product_id}`,
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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 mb-4 lg:mb-6">
          <div className="rounded-lg p-2 sm:p-3 bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between gap-1">
              <div>
                <div className="text-[10px] sm:text-xs text-gray-600 uppercase tracking-wider font-medium">Total Orders</div>
                <div className="text-lg sm:text-xl font-bold text-blue-700 leading-tight">{totalOrders}</div>
              </div>
              <ShoppingOutlined className="text-blue-600 text-lg sm:text-xl" />
            </div>
          </div>
          <div className="rounded-lg p-2 sm:p-3 bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between gap-1">
              <div>
                <div className="text-[10px] sm:text-xs text-gray-600 uppercase tracking-wider font-medium">Pending</div>
                <div className="text-lg sm:text-xl font-bold text-orange-600 leading-tight">{pendingCount}</div>
              </div>
              <AppstoreOutlined className="text-orange-500 text-lg sm:text-xl" />
            </div>
          </div>
          <div className="rounded-lg p-2 sm:p-3 bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between gap-1">
              <div>
                <div className="text-[10px] sm:text-xs text-gray-600 uppercase tracking-wider font-medium">In Progress</div>
                <div className="text-lg sm:text-xl font-bold text-blue-600 leading-tight">{inProgressCount}</div>
              </div>
              <SyncOutlined className="text-blue-600 text-lg sm:text-xl" />
            </div>
          </div>
          <div className="rounded-lg p-2 sm:p-3 bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between gap-1">
              <div>
                <div className="text-[10px] sm:text-xs text-gray-600 uppercase tracking-wider font-medium">Scheduled</div>
                <div className="text-lg sm:text-xl font-bold text-purple-600 leading-tight">{scheduledCount}</div>
              </div>
              <ClockCircleOutlined className="text-purple-500 text-lg sm:text-xl" />
            </div>
          </div>
          <div className="rounded-lg p-2 sm:p-3 bg-gradient-to-br from-green-50 to-green-100 border border-green-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between gap-1">
              <div>
                <div className="text-[10px] sm:text-xs text-gray-600 uppercase tracking-wider font-medium">Completed</div>
                <div className="text-lg sm:text-xl font-bold text-green-600 leading-tight">{completedCount}</div>
              </div>
              <CheckCircleOutlined className="text-green-500 text-lg sm:text-xl" />
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
              <Select
                mode="multiple"
                allowClear
                placeholder="Filter by Project"
                value={filterProjects}
                onChange={setFilterProjects}
                options={uniqueProjectOptions}
                maxTagCount="responsive"
                style={{ minWidth: 180 }}
                size="middle"
              />
              <Select
                mode="multiple"
                allowClear
                placeholder="Filter by Customer"
                value={filterCustomers}
                onChange={setFilterCustomers}
                options={uniqueCustomerOptions}
                maxTagCount="responsive"
                style={{ minWidth: 180 }}
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
