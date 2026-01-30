import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "../Config/auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { FileText, Upload, X } from "lucide-react";

const OrderModal = ({ isOpen, onClose, onOrderCreated, editingOrder }) => {
  const [formData, setFormData] = useState({
    sale_order_number: "",
    customer_id: "",
    product_id: "",
    quantity: "",
    due_date: "",
    priority: "Medium",
    supervisor_id: "",
    status: "Pending",
  });
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState([]);

  useEffect(() => {
    fetchCustomers();
    if (editingOrder) {
      setFormData(editingOrder);
    }
  }, [editingOrder]);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const url = editingOrder 
        ? `${API_BASE_URL}/orders/${editingOrder.id}/`
        : `${API_BASE_URL}/orders/`;
      
      const method = editingOrder ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formData,
          quantity: parseInt(formData.quantity),
          customer_id: parseInt(formData.customer_id),
        }),
      });

      if (response.ok) {
        const result = await response.json();
        
        // Upload documents if this is a new order and documents are provided
        if (!editingOrder && documents.length > 0) {
          await uploadDocumentsForOrder(result.id);
        }
        
        onOrderCreated(result);
        handleClose();
      } else {
        console.error("Failed to save order:", response.statusText);
      }
    } catch (error) {
      console.error("Error saving order:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      sale_order_number: "",
      customer_id: "",
      product_id: "",
      quantity: "",
      due_date: "",
      priority: "Medium",
      supervisor_id: "",
      status: "Pending",
    });
    setDocuments([]);
    onClose();
  };

  const handleDocumentAdd = () => {
    setDocuments([...documents, { file: null, document_name: "", document_type: "", document_version: "1.0" }]);
  };

  const handleDocumentRemove = (index) => {
    const newDocuments = documents.filter((_, i) => i !== index);
    setDocuments(newDocuments);
  };

  const handleDocumentChange = (index, field, value) => {
    const newDocuments = [...documents];
    newDocuments[index][field] = value;
    setDocuments(newDocuments);
  };

  const uploadDocumentsForOrder = async (orderId) => {
    for (const doc of documents) {
      if (doc.file) {
        const uploadFormData = new FormData();
        uploadFormData.append("file", doc.file);
        uploadFormData.append("document_name", doc.document_name || doc.file?.name || "Document");
        uploadFormData.append("document_type", doc.document_type || "Document");
        uploadFormData.append("document_version", doc.document_version || "1.0");

        try {
          await fetch(`${API_BASE_URL}/customer-documents/upload/${orderId}`, {
            method: "POST",
            body: uploadFormData,
          });
        } catch (error) {
          console.error("Error uploading document:", error);
        }
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto">
        <DialogHeader className="border-b pb-4">
          <DialogTitle className="text-xl font-semibold text-gray-900">
            {editingOrder ? "Edit Order" : "Create New Order"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-6 py-6">
            <div className="space-y-2">
              <label htmlFor="sale_order_number" className="text-sm font-medium text-gray-700">
                Sale Order Number *
              </label>
              <Input
                id="sale_order_number"
                value={formData.sale_order_number}
                onChange={(e) =>
                  setFormData({ ...formData, sale_order_number: e.target.value })
                }
                placeholder="Enter sale order number"
                className="w-full"
                required
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="customer_id" className="text-sm font-medium text-gray-700">
                Customer *
              </label>
              <Select
                value={formData.customer_id}
                onValueChange={(value) =>
                  setFormData({ ...formData, customer_id: value })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id.toString()}>
                      {customer.company_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label htmlFor="product_id" className="text-sm font-medium text-gray-700">
                Product ID *
              </label>
              <Input
                id="product_id"
                value={formData.product_id}
                onChange={(e) =>
                  setFormData({ ...formData, product_id: e.target.value })
                }
                placeholder="Enter product ID"
                className="w-full"
                required
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="quantity" className="text-sm font-medium text-gray-700">
                Quantity *
              </label>
              <Input
                id="quantity"
                type="number"
                value={formData.quantity}
                onChange={(e) =>
                  setFormData({ ...formData, quantity: e.target.value })
                }
                placeholder="Enter quantity"
                className="w-full"
                required
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="due_date" className="text-sm font-medium text-gray-700">
                Due Date
              </label>
              <Input
                id="due_date"
                type="date"
                value={formData.due_date}
                onChange={(e) =>
                  setFormData({ ...formData, due_date: e.target.value })
                }
                className="w-full"
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="priority" className="text-sm font-medium text-gray-700">
                Priority
              </label>
              <Select
                value={formData.priority}
                onValueChange={(value) =>
                  setFormData({ ...formData, priority: value })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Low">Low</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label htmlFor="supervisor_id" className="text-sm font-medium text-gray-700">
                Supervisor ID
              </label>
              <Input
                id="supervisor_id"
                value={formData.supervisor_id}
                onChange={(e) =>
                  setFormData({ ...formData, supervisor_id: e.target.value })
                }
                placeholder="Enter supervisor ID"
                className="w-full"
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="status" className="text-sm font-medium text-gray-700">
                Status
              </label>
              <Select
                value={formData.status}
                onValueChange={(value) =>
                  setFormData({ ...formData, status: value })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Shipped">Shipped</SelectItem>
                  <SelectItem value="Delivered">Delivered</SelectItem>
                  <SelectItem value="Cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Document Upload Section - Only for new orders */}
            {!editingOrder && (
              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
                  <FileText className="h-5 w-5" />
                  Documents (Optional)
                </h3>

                <div className="space-y-4">
                  {documents.length === 0 ? (
                    <div className="text-center py-6 border-2 border-dashed border-gray-300 rounded-lg">
                      <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                      <p className="text-sm text-gray-600 mb-3">No documents added yet</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleDocumentAdd}
                      >
                        Add First Document
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {documents.map((doc, index) => (
                        <div key={index} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                          <div className="flex items-start justify-between mb-3">
                            <h4 className="font-medium text-gray-900">Document {index + 1}</h4>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDocumentRemove(index)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-gray-700">
                                File *
                              </label>
                              <Input
                                type="file"
                                onChange={(e) => handleDocumentChange(index, 'file', e.target.files[0])}
                                className="w-full"
                              />
                            </div>
                            
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-gray-700">
                                Document Name *
                              </label>
                              <Input
                                value={doc.document_name}
                                onChange={(e) => handleDocumentChange(index, 'document_name', e.target.value)}
                                placeholder="Enter document name"
                                className="w-full"
                              />
                            </div>
                            
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-gray-700">
                                Document Type *
                              </label>
                              <Input
                                value={doc.document_type}
                                onChange={(e) => handleDocumentChange(index, 'document_type', e.target.value)}
                                placeholder="e.g., Invoice, Purchase Order"
                                className="w-full"
                              />
                            </div>
                            
                            <div className="space-y-2">
                              <label className="text-sm font-medium text-gray-700">
                                Version *
                              </label>
                              <Input
                                value={doc.document_version}
                                onChange={(e) => handleDocumentChange(index, 'document_version', e.target.value)}
                                placeholder="1.0"
                                className="w-full"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleDocumentAdd}
                        className="w-full"
                      >
                        Add Another Document
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="border-t pt-4">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : editingOrder ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default OrderModal;
