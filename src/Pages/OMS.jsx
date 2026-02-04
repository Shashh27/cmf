import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_BASE_URL } from "../Config/auth";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import OrderModal from "../OMS Components/OrderModal";
import DocumentModal from "../OMS Components/DocumentModal";
import CompanyDetails from "../OMS Components/CompanyDetails";
import ProductBOMView from "../OMS Components/ProductBOMView";
import { useToast } from "../components/ui/toast";

const OMS = () => {
  const navigate = useNavigate();
  const { productId } = useParams();
  const { addToast, ToastContainer } = useToast();
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
    const variants = {
      Pending: "warning",
      Shipped: "info", 
      Delivered: "success",
      Cancelled: "destructive",
    };

    return (
      <Badge variant={variants[status] || "secondary"}>
        {status}
      </Badge>
    );
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
      addToast(`Order "${order.sale_order_number}" created successfully!`);
    }
  };

  const handleDeleteOrder = async (order) => {
    if (!window.confirm(`Are you sure you want to delete order "${order.sale_order_number}"?`)) return;
    try {
      const response = await fetch(`${API_BASE_URL}/orders/${order.id}/`, { method: "DELETE" });
      if (response.ok) {
        fetchOrders();
        addToast(`Order "${order.sale_order_number}" deleted successfully!`);
      } else {
        addToast("Failed to delete order", "error");
      }
    } catch (error) {
      console.error("Error deleting order:", error);
      addToast("Failed to delete order", "error");
    }
  };

  const handleDocumentUploaded = (document) => {
    setDocumentModalOpen(false);
    if (document) {
      addToast(`Document "${document.document_name}" uploaded successfully!`);
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
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading orders...</div>
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Order Management System</h1>
        <div className="flex space-x-2">
          <Button onClick={handleCreateOrder}>
            New Order
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow border border-gray-200">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 border-b-2 border-gray-200">
              <TableHead className="font-semibold text-gray-900 border-r border-gray-200">SL NO</TableHead>
              <TableHead className="font-semibold text-gray-900 border-r border-gray-200">SALE ORDER</TableHead>
              <TableHead className="font-semibold text-gray-900 border-r border-gray-200">CUSTOMER</TableHead>
              <TableHead className="font-semibold text-gray-900 border-r border-gray-200">PRODUCT</TableHead>
              <TableHead className="font-semibold text-gray-900 border-r border-gray-200">QUANTITY</TableHead>
              <TableHead className="font-semibold text-gray-900 border-r border-gray-200">DUE DATE</TableHead>
              <TableHead className="font-semibold text-gray-900 border-r border-gray-200">PRIORITY</TableHead>
              <TableHead className="font-semibold text-gray-900 border-r border-gray-200">STATUS</TableHead>
              <TableHead className="font-semibold text-gray-900">ACTIONS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order, index) => (
              <TableRow 
                key={order.id} 
                className="border-b border-gray-200 hover:bg-blue-50 transition-colors"
              >
                <TableCell className="border-r border-gray-200 font-medium">{index + 1}</TableCell>
                <TableCell className="border-r border-gray-200">{order.sale_order_number}</TableCell>
                <TableCell className="border-r border-gray-200">{getCustomerName(order.customer_id)}</TableCell>
                <TableCell className="border-r border-gray-200">
                  <button 
                    onClick={() => handleViewBOM(order.product_id)}
                    className="text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    {getProductName(order.product_id)}
                  </button>
                </TableCell>
                <TableCell className="border-r border-gray-200">{order.quantity}</TableCell>
                <TableCell className="border-r border-gray-200">{formatDate(order.due_date)}</TableCell>
                <TableCell className="border-r border-gray-200">{order.priority ?? "-"}</TableCell>
                <TableCell className="border-r border-gray-200">{getStatusBadge(order.status)}</TableCell>
                <TableCell>
                  <div className="flex space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEditOrder(order)}
                    >
                      Edit
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="text-blue-600 hover:text-blue-800"
                      onClick={() => {
                        setSelectedOrderId(order.id);
                        setDocumentModalOpen(true);
                      }}
                    >
                      Documents
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDeleteOrder(order)}
                    >
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      

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
      
      <ToastContainer />
    </div>
  );
};

export default OMS;