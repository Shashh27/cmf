import React, { useState, useEffect } from "react";
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
import CustomerModal from "../OMS Components/CustomerModal";
import DocumentModal from "../OMS Components/DocumentModal";
import CompanyDetails from "../OMS Components/CompanyDetails";
import { useToast } from "../components/ui/toast";

const OMS = () => {
  const { addToast, ToastContainer } = useToast();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [documentModalOpen, setDocumentModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [selectedOrderId, setSelectedOrderId] = useState(null);

  useEffect(() => {
    fetchOrders();
  }, []);

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
    } finally {
      setLoading(false);
    }
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
    if (order) {
      addToast(`Order "${order.sale_order_number}" created successfully!`);
    }
  };

  const handleCustomerCreated = (customer) => {
    setCustomerModalOpen(false);
    if (customer) {
      addToast(`Customer "${customer.company_name}" created successfully!`);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading orders...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Order Management System</h1>
        <div className="flex space-x-2">
          <Button onClick={() => setCustomerModalOpen(true)}>
            New Customer
          </Button>
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
              <TableHead className="font-semibold text-gray-900 border-r border-gray-200">CUSTOMER ID</TableHead>
              <TableHead className="font-semibold text-gray-900 border-r border-gray-200">PRODUCT ID</TableHead>
              <TableHead className="font-semibold text-gray-900 border-r border-gray-200">QUANTITY</TableHead>
              <TableHead className="font-semibold text-gray-900 border-r border-gray-200">STATUS</TableHead>
              <TableHead className="font-semibold text-gray-900">ACTIONS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order, index) => (
              <TableRow 
                key={order.id} 
                className="border-b border-gray-200 hover:bg-blue-50 transition-colors"
                onClick={() => handleEditOrder(order)}
              >
                <TableCell className="border-r border-gray-200 font-medium">{index + 1}</TableCell>
                <TableCell className="border-r border-gray-200">{order.sale_order_number}</TableCell>
                <TableCell className="border-r border-gray-200">{order.customer_id}</TableCell>
                <TableCell className="border-r border-gray-200">{order.product_id}</TableCell>
                <TableCell className="border-r border-gray-200">{order.quantity}</TableCell>
                <TableCell className="border-r border-gray-200">{getStatusBadge(order.status)}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
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
                      variant="outline"
                      onClick={() => handleOpenDocuments(order.id)}
                    >
                      Documents
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Company Details Section */}
      <CompanyDetails />

      {/* Modals */}
      <OrderModal
        isOpen={orderModalOpen}
        onClose={() => setOrderModalOpen(false)}
        onOrderCreated={handleOrderCreated}
        editingOrder={editingOrder}
      />
      
      <CustomerModal
        isOpen={customerModalOpen}
        onClose={() => setCustomerModalOpen(false)}
        onCustomerCreated={handleCustomerCreated}
      />
      
      <DocumentModal
        isOpen={documentModalOpen}
        onClose={() => setDocumentModalOpen(false)}
        onDocumentUploaded={handleDocumentUploaded}
        orderId={selectedOrderId}
      />
      
      <ToastContainer />
    </div>
  );
};

export default OMS;
