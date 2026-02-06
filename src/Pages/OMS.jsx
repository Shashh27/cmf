import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_BASE_URL } from "../Config/auth";
import { Table, Badge, Button, message, Spin, Typography, Space } from "antd";
import OrderModal from "../OMS Components/OrderModal";
import DocumentModal from "../OMS Components/DocumentModal";
import ProductBOMView from "../OMS Components/ProductBOMView";

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
  const [selectedProduct, setSelectedProduct] = useState(null);
  const hasFetchedData = useRef(false);

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
      const response = await fetch(`${API_BASE_URL}/products/`);
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
      const response = await fetch(`${API_BASE_URL}/orders/`);
      if (response.ok) {
        const data = await response.json();
        setOrders(data);
      } else {
        console.error("Failed to fetch orders:", response.statusText);
        setOrders([]);
      }
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
      Pending: { color: "orange", text: "Pending" },
      Shipped: { color: "blue", text: "Shipped" },
      Delivered: { color: "green", text: "Delivered" },
      Cancelled: { color: "red", text: "Cancelled" },
    };

    const config = statusConfig[status] || { color: "default", text: status };
    return <Badge color={config.color} text={config.text} />;
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

  const handleDeleteOrder = async (order) => {
    if (!window.confirm(`Are you sure you want to delete order "${order.sale_order_number}"?`)) return;
    try {
      const response = await fetch(`${API_BASE_URL}/orders/${order.id}/`, { method: "DELETE" });
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
  };

  const handleDocumentUploaded = (document) => {
    setDocumentModalOpen(false);
    if (document) {
      messageApi.success(`Document "${document.document_name}" uploaded successfully!`);
    }
  };

  const handleOpenDocuments = (orderId) => {
    setSelectedOrderId(orderId);
    setDocumentModalOpen(true);
  };

  const handleViewBOM = (productId) => {
    navigate(`/oms/product/${productId}`);
  };

  const handleBackToOrders = () => {
    navigate('/oms');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
        <Spin size="large" tip="Loading orders..." />
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
      title: "SL NO",
      dataIndex: "serial",
      key: "serial",
      width: 80,
      render: (_, __, index) => index + 1,
    },
    {
      title: "SALE ORDER",
      dataIndex: "sale_order_number",
      key: "sale_order_number",
    },
    {
      title: "CUSTOMER",
      dataIndex: "customer_id",
      key: "customer_id",
      render: (customerId) => getCustomerName(customerId),
    },
    {
      title: "PRODUCT",
      dataIndex: "product_id",
      key: "product_id",
      render: (productId, record) => (
        <Button 
          type="link" 
          onClick={() => handleViewBOM(productId)}
          style={{ padding: 0 }}
        >
          {getProductName(productId)}
        </Button>
      ),
    },
    {
      title: "QUANTITY",
      dataIndex: "quantity",
      key: "quantity",
    },
    {
      title: "DUE DATE",
      dataIndex: "due_date",
      key: "due_date",
      render: (date) => formatDate(date),
    },
    {
      title: "PRIORITY",
      dataIndex: "priority",
      key: "priority",
      render: (priority) => priority ?? "-",
    },
    {
      title: "STATUS",
      dataIndex: "status",
      key: "status",
      render: (status) => getStatusBadge(status),
    },
    {
      title: "ACTIONS",
      key: "actions",
      render: (_, record) => (
        <Space size="small">
          <Button
            size="small"
            onClick={() => handleEditOrder(record)}
          >
            Edit
          </Button>
          <Button 
            size="small" 
            type="default"
            onClick={() => {
              setSelectedOrderId(record.id);
              setDocumentModalOpen(true);
            }}
          >
            Docs
          </Button>
          <Button
            size="small"
            danger
            onClick={() => handleDeleteOrder(record)}
          >
            Delete
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      {contextHolder}
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography.Title level={2} style={{ margin: 0 }}>Order Management System</Typography.Title>
        <Button type="primary" onClick={handleCreateOrder}>
          New Order
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={orders}
        rowKey="id"
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
        }}
        bordered
        size="middle"
      />

      
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