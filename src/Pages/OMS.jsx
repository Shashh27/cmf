import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth";
import { Table, Badge, Button, message, Spin, Typography, Space, Modal, Card, Tag, Tooltip, Empty, Input, DatePicker, Form, Input as TextArea, App, Select } from "antd";
import { ShoppingOutlined, PlusOutlined, EditOutlined, DeleteOutlined, FileTextOutlined, AppstoreOutlined,UserOutlined,CalendarOutlined,
  SearchOutlined,ClockCircleOutlined,CheckCircleOutlined, FilterOutlined, SyncOutlined, CheckOutlined, CloseOutlined } from "@ant-design/icons";
import OrderModal from "../OMS Components/OrderModal";
import DocumentModal from "../OMS Components/DocumentModal";
import OMSOrdersPdfDownload from "../DownloadReports/OMSOrdersPdfDownload";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";

dayjs.extend(isBetween);

const { RangePicker } = DatePicker;

const OMS = () => {
  const navigate = useNavigate();
  const { productId } = useParams();
  const { message: messageApi, modal } = App.useApp();
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [documentModalOpen, setDocumentModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [dateRange, setDateRange] = useState(null);
  const [selectedKpiFilter, setSelectedKpiFilter] = useState(null);
  const [filterCustomers, setFilterCustomers] = useState([]);
  const [filterProjects, setFilterProjects] = useState([]);
  const hasFetchedData = useRef(false);
  const [ordersPagination, setOrdersPagination] = useState({ current: 1, pageSize: 10 });
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [selectedOrderForApproval, setSelectedOrderForApproval] = useState(null);
  const [approvalAction, setApprovalAction] = useState(null);
  const [approvalForm] = Form.useForm();

  const getCurrentAdminId = () => {
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
          fetchCustomers()
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

  
  const fetchOrders = async () => {
    try {
      const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
      const uid = storedUser?.id;
      const response = await axios.get(`${API_BASE_URL}/orders/`, {
        params: uid != null ? { admin_id: uid } : undefined,
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
    return record?.product_name || record?.project_name || `Project ${productId}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    return dayjs(dateStr).format("DD/MM/YYYY");
  };


  const getStatusBadge = (status) => {
    const statusConfig = {
      'Pending': { color: "orange", text: "Pending" },
      'In Progress': { color: "blue", text: "In Progress" },
      'Completed': { color: "green", text: "Completed" },
    };

    const config = statusConfig[status] || { color: "default", text: status };
    return <Tag color={config.color}>{config.text?.toUpperCase()}</Tag>;
  };

  const getApprovalStatusBadge = (approvalStatus) => {
    const statusConfig = {
      'Pending Approval': { color: "orange" },
      'Approved': { color: "green" },
      'Rejected': { color: "red" },
      'Auto-Approved': { color: "blue" },
      'Created by Admin': { color: "blue" },
    };

    const config = statusConfig[approvalStatus] || { color: "default" };
    return <Tag color={config.color}>{approvalStatus?.toUpperCase() || "-"}</Tag>;
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
    modal.confirm({
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

  const handleApprovalAction = (order, action) => {
    setSelectedOrderForApproval(order);
    setApprovalAction(action);
    approvalForm.setFieldsValue({
      approval_status: action,
      approval_remarks: "",
    });
    setApprovalModalOpen(true);
  };

  const handleApprovalSubmit = async (values) => {
    try {
      await axios.put(`${API_BASE_URL}/orders/${selectedOrderForApproval.id}/approve`, {
        approval_status: values.approval_status,
        approval_remarks: values.approval_remarks,
      });
      messageApi.success(`Order ${values.approval_status.toLowerCase()} successfully!`);
      setApprovalModalOpen(false);
      approvalForm.resetFields();
      setSelectedOrderForApproval(null);
      fetchOrders();
    } catch (error) {
      console.error("Error approving/rejecting order:", error);
      messageApi.error(error?.response?.data?.detail || "Failed to process approval");
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
      .sort((a, b) => a.label.localeCompare(b.label))
      .map(({ id, label }) => ({ value: id, label }));
  }, [orders, customers]);

  const uniqueProjectOptions = useMemo(() => {
    const seen = new Set();
    return orders
      .map(o => ({ id: o.product_id, label: getProductName(o.product_id, o) }))
      .filter(({ id, label }) => { if (!id || seen.has(id)) return false; seen.add(id); return true; })
      .sort((a, b) => a.label.localeCompare(b.label))
      .map(({ id, label }) => ({ value: id, label }));
  }, [orders]);

  const filteredOrders = useMemo(() => orders.filter((order, index) => {
    // 0. KPI Filter
    if (selectedKpiFilter) {
      if (selectedKpiFilter === 'Pending' && order.status !== 'Pending') return false;
      if (selectedKpiFilter === 'In Progress' && order.status !== 'In Progress') return false;
      if (selectedKpiFilter === 'Completed' && order.status !== 'Completed') return false;
    }

    // 1. Product ID Filter (from URL)
    if (productId && order.product_id?.toString() !== productId) return false;

    // Customer multi-select filter
    if (filterCustomers.length > 0 && !filterCustomers.includes(order.customer_id)) return false;

    // Project multi-select filter (normalize id types — API may return number or string)
    if (
      filterProjects.length > 0 &&
      !filterProjects.some((id) => String(id) === String(order.product_id))
    ) {
      return false;
    }

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
    const userName = String(
      order.project_coordinator_name || 
      order.project_coordinator_id || 
      order.admin_name || 
      order.admin_id || ""
    ).toLowerCase();
    
    // Manufacturing Coordinator
    const mfgCoordinatorName = String(
      order.manufacturing_coordinator_name || 
      order.manufacturing_coordinator_id || ""
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
      userName.includes(searchLower) ||
      mfgCoordinatorName.includes(searchLower)
    );
  }), [orders, productId, selectedKpiFilter, filterCustomers, filterProjects, dateRange, searchText, customers]);

  const getOrdersForExport = useCallback(
    () =>
      filteredOrders.map((order) => ({
        ...order,
        customer_name: getCustomerName(order.customer_id, order),
        product_name: getProductName(order.product_id, order),
      })),
    [filteredOrders, customers]
  );

  const tableColumnFilters = useMemo(() => {
    const coordinatorFilters = Array.from(
      new Set(
        orders
          .map((o) => o.project_coordinator_name || o.project_coordinator_id || o.admin_name || o.admin_id)
          .filter(Boolean)
      )
    )
      .sort()
      .map((v) => ({ text: v, value: v }));

    const mfgCoordinatorFilters = Array.from(
      new Set(
        orders
          .map((o) => o.manufacturing_coordinator_name || o.manufacturing_coordinator_id)
          .filter(Boolean)
      )
    )
      .sort()
      .map((v) => ({ text: v, value: v }));

    const approvalStatusFilters = Array.from(
      new Set(
        orders
          .map((o) => o.approval_status)
          .filter(Boolean)
      )
    )
      .sort()
      .map((v) => ({ text: v, value: v }));

    const statusFilters = Array.from(
      new Set(
        orders
          .map((o) => o.status)
          .filter(Boolean)
      )
    )
      .sort()
      .map((v) => ({ text: v, value: v }));

    const createdByFilters = Array.from(
      new Set(
        orders
          .map((o) => o.user_name)
          .filter(Boolean)
      )
    )
      .sort()
      .map((v) => ({ text: v, value: v }));

    const customerFilters = Array.from(
      new Set(
        orders.map((o) => getCustomerName(o.customer_id, o))
          .filter(Boolean)
      )
    )
      .sort()
      .map((v) => ({ text: v, value: v }));

    return { coordinatorFilters, mfgCoordinatorFilters, approvalStatusFilters, statusFilters, createdByFilters, customerFilters };
  }, [orders, customers]);

  const kpiStats = useMemo(() => {
    let pending = 0;
    let inProgress = 0;
    let completed = 0;
    orders.forEach((o) => {
      if (o.status === "Pending") pending += 1;
      else if (o.status === "In Progress") inProgress += 1;
      else if (o.status === "Completed") completed += 1;
    });
    return {
      total: orders.length,
      pending,
      inProgress,
      completed,
    };
  }, [orders]);

  const columns = useMemo(
    () => [
    {
      title: <span className="font-semibold text-gray-700">SL NO</span>,
      dataIndex: "serial",
      key: "serial",
      width: 70,
      fixed: 'left',
      render: (_, __, index) => {
        const { current, pageSize } = ordersPagination;
        return <span className="text-gray-500 font-mono text-xs">{(current - 1) * pageSize + index + 1}</span>;
      },
    },
    {
      title: <span className="font-semibold text-gray-700">Project Number</span>,
      dataIndex: "sale_order_number",
      key: "sale_order_number",
      width: 130,
      ellipsis: true,
      render: (text) => <span className="font-medium text-gray-800 text-xs">{text}</span>,
    },
    {
      title: <span className="font-semibold text-gray-700">Project Name</span>,
      dataIndex: "product_id",
      key: "product_id",
      width: 150,
      ellipsis: true,
      render: (productId, record) => (
        record.approval_status === "Rejected" ? (
          <Tooltip title="Order rejected - cannot access project">
            <Space className="text-gray-400" size={2}>
              <AppstoreOutlined className="text-xs" />
              <span className="font-medium text-xs truncate">{getProductName(productId, record)}</span>
            </Space>
          </Tooltip>
        ) : (
          <Button
            type="link"
            className="p-0 h-auto"
            onClick={() => {
              if (!productId) return;
              navigate(`/admin/pdm/${productId}?from=oms&orderId=${record.id}`);
            }}
          >
            <Space className="text-gray-700" size={2}>
              <AppstoreOutlined className="text-blue-500 text-xs" />
              <span className="underline text-xs truncate">{getProductName(productId, record)}</span>
            </Space>
          </Button>
        )
      ),
    },
    {
      title: <span className="font-semibold text-gray-700">Qty</span>,
      dataIndex: "quantity",
      key: "quantity",
      width: 60,
      render: (text) => <span className="font-mono text-gray-700 text-xs">{text}</span>,
    },
    {
      title: <span className="font-semibold text-gray-700">Customer</span>,
      dataIndex: "customer_id",
      key: "customer_id",
      width: 150,
      ellipsis: true,
      filters: tableColumnFilters.customerFilters,
      onFilter: (value, record) => getCustomerName(record.customer_id, record) === value,
      render: (customerId, record) => (
        <Space size={2}>
            <UserOutlined className="text-gray-400 text-xs" />
            <span className="text-gray-700 text-xs truncate">{getCustomerName(customerId, record)}</span>
        </Space>
      ),
    },
    {
      title: <span className="font-semibold text-gray-700">Created By</span>,
      dataIndex: "user_name",
      key: "user_name",
      width: 120,
      ellipsis: true,
      filters: tableColumnFilters.createdByFilters,
      onFilter: (value, record) => record.user_name === value,
      render: (userName, record) => (
        <Space size={2}>
          <UserOutlined className="text-gray-400 text-xs" />
          <span className="text-gray-700 text-xs truncate">{userName || "-"}</span>
        </Space>
      ),
    },
    {
      title: <span className="font-semibold text-gray-700">Order Date</span>,
      dataIndex: "order_date",
      key: "order_date",
      width: 100,
      sorter: (a, b) => dayjs(a.order_date || 0).unix() - dayjs(b.order_date || 0).unix(),
      render: (date) => (
        <Space className="text-gray-500" size={2}>
            <CalendarOutlined className="text-xs" />
            <span className="text-xs">{formatDate(date)}</span>
        </Space>
      ),
    },
    {
      title: <span className="font-semibold text-gray-700">Due Date</span>,
      dataIndex: "due_date",
      key: "due_date",
      width: 100,
      sorter: (a, b) => dayjs(a.due_date || 0).unix() - dayjs(b.due_date || 0).unix(),
      render: (date) => (
        <Space className="text-gray-500" size={2}>
            <CalendarOutlined className="text-xs" />
            <span className="text-xs">{formatDate(date)}</span>
        </Space>
      ),
    },
    {
      title: <span className="font-semibold text-gray-700">Project Coordinator</span>,
      dataIndex: "project_coordinator_name",
      key: "project_coordinator_name",
      width: 140,
      ellipsis: true,
      filters: tableColumnFilters.coordinatorFilters,
      onFilter: (value, record) => (record.project_coordinator_name || record.project_coordinator_id || record.admin_name || record.admin_id) === value,
      render: (text, record) => (
        <Space size={2}>
          <UserOutlined className="text-gray-400 text-xs" />
          <span className="text-gray-700 text-xs truncate">
            {text || record.project_coordinator_id || record.admin_name || record.admin_id || "-"}
          </span>
        </Space>
      ),
    },
    {
      title: <span className="font-semibold text-gray-700">Mfg Coordinator</span>,
      dataIndex: "manufacturing_coordinator_name",
      key: "manufacturing_coordinator_name",
      width: 140,
      ellipsis: true,
      filters: tableColumnFilters.mfgCoordinatorFilters,
      onFilter: (value, record) => (record.manufacturing_coordinator_name || record.manufacturing_coordinator_id) === value,
      render: (text, record) => (
        <Space size={2}>
          <UserOutlined className="text-gray-400 text-xs" />
          <span className="text-gray-700 text-xs truncate">
            {text || record.manufacturing_coordinator_id || "-"}
          </span>
        </Space>
      ),
    },
    {
      title: <span className="font-semibold text-gray-700">Status</span>,
      dataIndex: "status",
      key: "status",
      width: 110,
      filters: tableColumnFilters.statusFilters,
      onFilter: (value, record) => record.status === value,
      render: (status) => getStatusBadge(status),
    },
    {
      title: <span className="font-semibold text-gray-700">Approval Status</span>,
      dataIndex: "approval_status",
      key: "approval_status",
      width: 140,
      filters: tableColumnFilters.approvalStatusFilters,
      onFilter: (value, record) => record.approval_status === value,
      render: (approvalStatus) => getApprovalStatusBadge(approvalStatus),
    },

     {
      title: <span className="font-semibold text-gray-700">Approval Remarks</span>,
      dataIndex: "approval_remarks",
      key: "approval_remarks",
      width: 150,
      ellipsis: true,
      render: (remarks) => (
        <span className="text-gray-600 text-xs truncate" title={remarks}>
          {remarks || "-"}
        </span>
      ),
    },
    {
      title: <span className="font-semibold text-gray-700">Approved At</span>,
      dataIndex: "approved_at",
      key: "approved_at",
      width: 110,
      render: (date) => (
        <span className="text-gray-600 text-xs">
          {date ? formatDate(date) : "-"}
        </span>
      ),
    },
    {
      title: <span className="font-semibold text-gray-700">Actions</span>,
      key: "actions",
      width: 140,
      fixed: 'right',
      render: (_, record) => (
        <Space size={4}>
          {record.approval_status === "Pending Approval" && record.user_role !== 'admin' && (
            <>
              <Tooltip title="Approve Order">
                <Button
                  type="text"
                  size="small"
                  icon={<CheckOutlined />}
                  className="text-green-500 hover:bg-green-50"
                  onClick={() => handleApprovalAction(record, "Approved")}
                />
              </Tooltip>
              <Tooltip title="Reject Order">
                <Button
                  type="text"
                  size="small"
                  icon={<CloseOutlined />}
                  className="text-red-500 hover:bg-red-50"
                  onClick={() => handleApprovalAction(record, "Rejected")}
                />
              </Tooltip>
            </>
          )}
          <Tooltip title="Edit Order">
            <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                className="text-blue-500 hover:bg-blue-50"
                onClick={() => handleEditOrder(record)}
            />
          </Tooltip>
          <Tooltip title={record.approval_status === "Rejected" ? "Cannot add documents to rejected order" : "Documents"}>
            <Button
                type="text"
                size="small"
                icon={<FileTextOutlined />}
                className="text-purple-500 hover:bg-purple-50"
                disabled={record.approval_status === "Rejected"}
                onClick={() => {
                setSelectedOrderId(record.id);
                setDocumentModalOpen(true);
                }}
            />
          </Tooltip>
          <Tooltip title={record.approval_status === "Rejected" ? "Cannot delete rejected order" : "Delete Order"}>
            <Button
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                className="text-red-500 hover:bg-red-50"
                disabled={record.approval_status === "Rejected"}
                onClick={() => handleDeleteOrder(record)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ],
  [ordersPagination, navigate, tableColumnFilters]
  );

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-2 sm:p-4 lg:p-6">
      <style>{`
        .modern-table .ant-table-thead > tr > th {
          background: linear-gradient(to bottom, #f0f5ff, #e6f0ff);
          font-weight: 600;
          border-bottom: 2px solid #1890ff;
          padding: 8px 12px;
          font-size: 12px;
        }
        .modern-table .ant-table-tbody > tr:hover > td {
          background: #f0f8ff !important;
        }
        .modern-table .ant-table-tbody > tr > td {
          border-bottom: 1px solid #f0f0f0;
          padding: 6px 12px;
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
        .modern-table .ant-table-cell {
          font-size: 12px;
        }
        .modern-table .ant-table-cell .ant-tag {
          font-size: 11px;
          padding: 0 6px;
          line-height: 18px;
        }
        /* Filter dropdown responsive styles */
        .ant-dropdown-menu {
          max-height: 300px;
          overflow-y: auto;
          max-width: 250px;
        }
        .ant-dropdown-menu-item {
          padding: 6px 12px;
          font-size: 12px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ant-table-filter-dropdown {
          max-width: 280px;
        }
        .ant-table-filter-dropdown-btns {
          padding: 8px 12px;
        }
        @media (max-width: 768px) {
          .modern-table .ant-table-thead > tr > th {
            padding: 6px 8px;
            font-size: 11px;
          }
          .modern-table .ant-table-tbody > tr > td {
            padding: 4px 8px;
          }
          .modern-table .ant-table-cell {
            font-size: 11px;
          }
          .ant-dropdown-menu {
            max-height: 200px;
            max-width: 200px;
          }
          .ant-table-filter-dropdown {
            max-width: 220px;
          }
        }
      `}</style>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-2 sm:gap-3 mb-4 lg:mb-6">
          <div 
            className={`rounded-lg p-2 sm:p-3 border shadow-sm hover:shadow-md transition-shadow cursor-pointer ${
              selectedKpiFilter === null 
                ? 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-100 ring-2 ring-blue-400' 
                : 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-100'
            }`}
            onClick={() => setSelectedKpiFilter(null)}
          >
            <div className="flex items-center justify-between gap-1">
              <div>
                <div className="text-[10px] sm:text-xs text-gray-600 uppercase tracking-wider font-medium">Total Orders</div>
                <div className="text-lg sm:text-xl font-bold text-blue-700 leading-tight">{kpiStats.total}</div>
              </div>
              <ShoppingOutlined className="text-blue-600 text-lg sm:text-xl" />
            </div>
          </div>
          <div 
            className={`rounded-lg p-2 sm:p-3 border shadow-sm hover:shadow-md transition-shadow cursor-pointer ${
              selectedKpiFilter === 'Pending' 
                ? 'bg-gradient-to-br from-orange-50 to-orange-100 border-orange-100 ring-2 ring-orange-400' 
                : 'bg-gradient-to-br from-orange-50 to-orange-100 border-orange-100'
            }`}
            onClick={() => setSelectedKpiFilter('Pending')}
          >
            <div className="flex items-center justify-between gap-1">
              <div>
                <div className="text-[10px] sm:text-xs text-gray-600 uppercase tracking-wider font-medium">Pending</div>
                <div className="text-lg sm:text-xl font-bold text-orange-600 leading-tight">{kpiStats.pending}</div>
              </div>
              <AppstoreOutlined className="text-orange-500 text-lg sm:text-xl" />
            </div>
          </div>
          <div 
            className={`rounded-lg p-2 sm:p-3 border shadow-sm hover:shadow-md transition-shadow cursor-pointer ${
              selectedKpiFilter === 'In Progress' 
                ? 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-100 ring-2 ring-blue-400' 
                : 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-100'
            }`}
            onClick={() => setSelectedKpiFilter('In Progress')}
          >
            <div className="flex items-center justify-between gap-1">
              <div>
                <div className="text-[10px] sm:text-xs text-gray-600 uppercase tracking-wider font-medium">In Progress</div>
                <div className="text-lg sm:text-xl font-bold text-blue-600 leading-tight">{kpiStats.inProgress}</div>
              </div>
              <SyncOutlined className="text-blue-500 text-lg sm:text-xl" />
            </div>
          </div>
          <div 
            className={`rounded-lg p-2 sm:p-3 border shadow-sm hover:shadow-md transition-shadow cursor-pointer ${
              selectedKpiFilter === 'Completed' 
                ? 'bg-gradient-to-br from-green-50 to-green-100 border-green-100 ring-2 ring-green-400' 
                : 'bg-gradient-to-br from-green-50 to-green-100 border-green-100'
            }`}
            onClick={() => setSelectedKpiFilter('Completed')}
          >
            <div className="flex items-center justify-between gap-1">
              <div>
                <div className="text-[10px] sm:text-xs text-gray-600 uppercase tracking-wider font-medium">Completed</div>
                <div className="text-lg sm:text-xl font-bold text-green-600 leading-tight">{kpiStats.completed}</div>
              </div>
              <CheckCircleOutlined className="text-green-500 text-lg sm:text-xl" />
            </div>
          </div>
        </div>

      {/* Header */}
      <div className="bg-white rounded-lg lg:rounded-xl shadow-sm border border-gray-100 p-3 sm:p-4 mb-4 lg:mb-6">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-end gap-3 lg:gap-4">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
              <RangePicker
                onChange={handleDateRangeChange}
                disabledDate={disabledDate}
                format="DD/MM/YYYY"
                placeholder={["Start Date", "End Date"]}
                inputReadOnly
                size="middle"
                style={{ minWidth: 150, flex: 1, fontWeight: 600 }}
              />
              <Input.Search
                placeholder="Search..."
                allowClear
                onSearch={handleSearch}
                onChange={(e) => handleSearch(e.target.value)}
                value={searchText}
                maxLength={20}
                size="middle"
                style={{ minWidth: 120, flex: 1, fontWeight: 600 }}
              />
              <Select
                mode="multiple"
                allowClear
                placeholder="Project"
                value={filterProjects}
                onChange={setFilterProjects}
                options={uniqueProjectOptions}
                maxTagCount={1}
                maxTagPlaceholder={(omitted) => `+${omitted.length} more`}
                size="middle"
                style={{ minWidth: 120, flex: 1, fontWeight: 600 }}
              />
              <Select
                mode="multiple"
                allowClear
                placeholder="Customer"
                value={filterCustomers}
                onChange={setFilterCustomers}
                options={uniqueCustomerOptions}
                maxTagCount={1}
                maxTagPlaceholder={(omitted) => `+${omitted.length} more`}
                size="middle"
                style={{ minWidth: 120, flex: 1, fontWeight: 600 }}
              />
              <div className="flex gap-2">
                <OMSOrdersPdfDownload
                  orderCount={filteredOrders.length}
                  getOrdersForExport={getOrdersForExport}
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
                simple: window.innerWidth < 768,
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
            scroll={{ x: 'max-content', y: 'calc(100vh - 400px)' }}
        />
      </Card>

      
      {/* Modals */}
      <OrderModal
        isOpen={orderModalOpen}
        onClose={() => setOrderModalOpen(false)}
        onOrderCreated={handleOrderCreated}
        editingOrder={editingOrder}
        customers={customers}
        fetchCustomers={fetchCustomers}
      />
      
      <DocumentModal
        isOpen={documentModalOpen}
        onClose={() => setDocumentModalOpen(false)}
        onDocumentUploaded={handleDocumentUploaded}
        orderId={selectedOrderId}
        orders={orders}
      />

      <Modal
        title={
          <div className="flex items-center gap-2">
            {approvalAction === "Approved" ? (
              <CheckOutlined className="text-green-500" />
            ) : (
              <CloseOutlined className="text-red-500" />
            )}
            <span className="font-bold text-gray-800">
              {approvalAction === "Approved" ? "Approve" : "Reject"} Order
            </span>
          </div>
        }
        open={approvalModalOpen}
        onCancel={() => {
          setApprovalModalOpen(false);
          approvalForm.resetFields();
          setSelectedOrderForApproval(null);
          setApprovalAction(null);
        }}
        footer={null}
        width={500}
        centered
      >
        <div className="mb-4">
          <p className="text-gray-600">
            Order: <span className="font-semibold text-gray-800">{selectedOrderForApproval?.sale_order_number}</span>
          </p>
          <p className="text-gray-600">
            Customer: <span className="font-semibold text-gray-800">{getCustomerName(selectedOrderForApproval?.customer_id, selectedOrderForApproval)}</span>
          </p>
        </div>
        <Form
          form={approvalForm}
          layout="vertical"
          onFinish={handleApprovalSubmit}
        >
          <Form.Item name="approval_status" hidden>
            <input type="hidden" />
          </Form.Item>
          <Form.Item
            name="approval_remarks"
            label={
              <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                Remarks {approvalAction === "Approved" ? "(Optional)" : "(Required)"}
              </span>
            }
            rules={[
              {
                required: approvalAction === "Rejected",
                message: "Please provide remarks for rejection",
              },
            ]}
          >
            <TextArea
              placeholder="Enter approval/rejection remarks..."
              rows={4}
              maxLength={500}
              showCount
            />
          </Form.Item>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              onClick={() => {
                setApprovalModalOpen(false);
                approvalForm.resetFields();
                setSelectedOrderForApproval(null);
                setApprovalAction(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              className={
                approvalAction === "Approved"
                  ? "bg-green-500 hover:bg-green-600 border-green-500"
                  : "bg-red-500 hover:bg-red-600 border-red-500"
              }
            >
              {approvalAction === "Approved" ? "Approve" : "Reject"}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default OMS;
