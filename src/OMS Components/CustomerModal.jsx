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

const CustomerModal = ({ isOpen, onClose, onCustomerCreated, editingCustomer }) => {
  const [formData, setFormData] = useState({
    company_name: "",
    address: "",
    branch: "",
    email: "",
    contact_number: "",
    contact_person: "",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (editingCustomer) {
      setFormData(editingCustomer);
    }
  }, [editingCustomer]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const url = editingCustomer 
        ? `${API_BASE_URL}/customers/${editingCustomer.id}/`
        : `${API_BASE_URL}/customers/`;
      
      const method = editingCustomer ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const result = await response.json();
        onCustomerCreated(result);
        handleClose();
      } else {
        console.error("Failed to save customer:", response.statusText);
      }
    } catch (error) {
      console.error("Error saving customer:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      company_name: "",
      address: "",
      branch: "",
      email: "",
      contact_number: "",
      contact_person: "",
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader className="border-b pb-4">
          <DialogTitle className="text-xl font-semibold text-gray-900">
            {editingCustomer ? "Edit Customer" : "Create New Customer"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-6 py-6">
            <div className="space-y-2">
              <label htmlFor="company_name" className="text-sm font-medium text-gray-700">
                Company Name *
              </label>
              <Input
                id="company_name"
                value={formData.company_name}
                onChange={(e) =>
                  setFormData({ ...formData, company_name: e.target.value })
                }
                placeholder="Enter company name"
                className="w-full"
                required
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="address" className="text-sm font-medium text-gray-700">
                Address *
              </label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) =>
                  setFormData({ ...formData, address: e.target.value })
                }
                placeholder="Enter complete address"
                className="w-full"
                required
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="branch" className="text-sm font-medium text-gray-700">
                Branch
              </label>
              <Input
                id="branch"
                value={formData.branch}
                onChange={(e) =>
                  setFormData({ ...formData, branch: e.target.value })
                }
                placeholder="Enter branch name"
                className="w-full"
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-gray-700">
                Email *
              </label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                placeholder="company@example.com"
                className="w-full"
                required
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="contact_number" className="text-sm font-medium text-gray-700">
                Contact Number *
              </label>
              <Input
                id="contact_number"
                value={formData.contact_number}
                onChange={(e) =>
                  setFormData({ ...formData, contact_number: e.target.value })
                }
                placeholder="+1 (555) 123-4567"
                className="w-full"
                required
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="contact_person" className="text-sm font-medium text-gray-700">
                Contact Person *
              </label>
              <Input
                id="contact_person"
                value={formData.contact_person}
                onChange={(e) =>
                  setFormData({ ...formData, contact_person: e.target.value })
                }
                placeholder="Full name of contact person"
                className="w-full"
                required
              />
            </div>
          </div>
          <DialogFooter className="border-t pt-4">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : editingCustomer ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CustomerModal;
