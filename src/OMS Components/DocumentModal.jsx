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
import { FileText } from "lucide-react";

const DocumentModal = ({ isOpen, onClose, onDocumentUploaded, orderId, orders }) => {
  const [formData, setFormData] = useState({
    file: null,
    document_type: "",
    document_version: "1.0",
  });
  const [selectedOrderId, setSelectedOrderId] = useState(orderId || "");
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState([]);

  useEffect(() => {
    if (orderId) {
      setSelectedOrderId(orderId);
      fetchDocuments(orderId);
    }
  }, [orderId]);


  const fetchDocuments = async (orderId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/customer-documents/order/${orderId}`);
      if (response.ok) {
        const data = await response.json();
        setDocuments(data);
      }
    } catch (error) {
      console.error("Error fetching documents:", error);
    }
  };

  const handleFileChange = (e) => {
    setFormData({ ...formData, file: e.target.files[0] });
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!formData.file || !selectedOrderId) {
      alert("Please select a file and order");
      return;
    }

    setLoading(true);
    const uploadFormData = new FormData();
    uploadFormData.append("file", formData.file);
    uploadFormData.append("document_type", formData.document_type);
    uploadFormData.append("document_version", formData.document_version);

    try {
      const response = await fetch(
        `${API_BASE_URL}/customer-documents/upload/${selectedOrderId}`,
        {
          method: "POST",
          body: uploadFormData,
        }
      );

      if (response.ok) {
        const result = await response.json();
        onDocumentUploaded(result);
        setFormData({ file: null, document_type: "", document_version: "1.0" });
        if (selectedOrderId) {
          fetchDocuments(selectedOrderId);
        }
      } else {
        console.error("Failed to upload document:", response.statusText);
        alert("Failed to upload document");
      }
    } catch (error) {
      console.error("Error uploading document:", error);
      alert("Error uploading document");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (documentId, documentName) => {
    try {
      const response = await fetch(`${API_BASE_URL}/customer-documents/download/${documentId}`);
      if (response.ok) {
        const data = await response.json();
        console.log('Download response:', data); // Debug log
        
        if (data.download_url) {
          // Open the download URL in a new tab to handle CORS properly
          const newWindow = window.open(data.download_url, '_blank');
          if (!newWindow) {
            // If popup is blocked, try creating a download link
            const link = document.createElement('a');
            link.href = data.download_url;
            link.download = documentName;
            link.target = '_blank';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }
        } else {
          console.error("No download URL in response");
          alert("No download URL available");
        }
      } else {
        console.error("Failed to download document:", response.statusText, response.status);
        alert(`Failed to download document: ${response.statusText}`);
      }
    } catch (error) {
      console.error("Error downloading document:", error);
      alert("Error downloading document");
    }
  };

  const handleDelete = async (documentId) => {
    if (!window.confirm("Are you sure you want to delete this document?")) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/customer-documents/${documentId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        if (selectedOrderId) {
          fetchDocuments(selectedOrderId);
        }
      } else {
        console.error("Failed to delete document:", response.statusText);
        alert("Failed to delete document");
      }
    } catch (error) {
      console.error("Error deleting document:", error);
      alert("Error deleting document");
    }
  };

  const handleClose = () => {
    setFormData({ file: null, document_type: "", document_version: "1.0" });
    setDocuments([]);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent 
        className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="border-b pb-4">
          <DialogTitle className="text-xl font-semibold text-gray-900">
            Document Management
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Upload Form */}
          <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
            <h3 className="text-lg font-semibold mb-4 text-gray-900">Upload Document</h3>
            <form onSubmit={handleUpload} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="order" className="text-sm font-medium text-gray-700">
                  Order *
                </label>
                {orderId ? (
                  <Input
                    value={orders.find(order => order.id.toString() === orderId)?.sale_order_number || `Order ${orderId}`}
                    disabled
                    className="w-full bg-gray-100"
                  />
                ) : (
                  <Select
                    value={selectedOrderId}
                    onValueChange={(value) => {
                      setSelectedOrderId(value);
                      fetchDocuments(value);
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select order" />
                    </SelectTrigger>
                    <SelectContent>
                      {orders.map((order) => (
                        <SelectItem key={order.id} value={order.id.toString()}>
                          {order.sale_order_number}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              
              <div className="space-y-2">
                <label htmlFor="file" className="text-sm font-medium text-gray-700">
                  File *
                </label>
                <Input
                  id="file"
                  type="file"
                  onChange={handleFileChange}
                  className="w-full"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <label htmlFor="document_type" className="text-sm font-medium text-gray-700">
                  Document Type
                </label>
                <Input
                  id="document_type"
                  value={formData.document_type}
                  onChange={(e) =>
                    setFormData({ ...formData, document_type: e.target.value })
                  }
                  className="w-full"
                  placeholder="e.g., Invoice, Purchase Order, etc."
                />
              </div>
              
              <div className="space-y-2">
                <label htmlFor="document_version" className="text-sm font-medium text-gray-700">
                  Version
                </label>
                <Input
                  id="document_version"
                  value={formData.document_version}
                  onChange={(e) =>
                    setFormData({ ...formData, document_version: e.target.value })
                  }
                  className="w-full"
                />
              </div>
              
              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={loading}>
                  {loading ? "Uploading..." : "Upload Document"}
                </Button>
              </div>
            </form>
          </div>

          {/* Documents List */}
          {selectedOrderId && (
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <h3 className="text-lg font-semibold mb-3 text-gray-900">
                Documents for Order {selectedOrderId}
              </h3>
              {documents.length === 0 ? (
                <div className="text-center py-6 text-gray-500">
                  <FileText className="mx-auto h-10 w-10 text-gray-400 mb-2" />
                  <p>No documents found for this order.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="bg-white p-3 rounded border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">{doc.document_name}</p>
                          <div className="text-sm text-gray-600 flex items-center gap-3 mt-1">
                            <span>Type: <span className="font-medium">{doc.document_type}</span></span>
                            <span>Version: <span className="font-medium">{doc.document_version}</span></span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(doc.uploaded_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex space-x-2 ml-3 flex-shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownload(doc.id, doc.document_name)}
                          >
                            Download
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(doc.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-4">
          <Button type="button" variant="outline" onClick={handleClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DocumentModal;
