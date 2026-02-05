import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "../Config/auth.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Button } from "../components/ui/button";
import { Pencil, Trash2, Plus } from "lucide-react";
import CustomerModal from "../OMS Components/CustomerModal";
import { useToast } from "../components/ui/toast";

const CustomersTable = () => {
  const { addToast, ToastContainer } = useToast();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/customers/`);
      if (response.ok) {
        const data = await response.json();
        setCustomers(data);
      } else {
        console.error("Failed to fetch customers:", response.statusText);
        setCustomers([]);
      }
    } catch (error) {
      console.error("Error fetching customers:", error);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCustomer = () => {
    setEditingCustomer(null);
    setCustomerModalOpen(true);
  };

  const handleEditCustomer = (customer) => {
    setEditingCustomer(customer);
    setCustomerModalOpen(true);
  };

  const handleDeleteCustomer = async (id) => {
    if (window.confirm("Are you sure you want to delete this customer?")) {
      try {
        const response = await fetch(`${API_BASE_URL}/customers/${id}/`, {
          method: "DELETE",
        });
        if (response.ok) {
          addToast("Customer deleted successfully", "success");
          fetchCustomers();
        } else {
          addToast("Failed to delete customer", "error");
        }
      } catch (error) {
        console.error("Error deleting customer:", error);
        addToast("Error deleting customer", "error");
      }
    }
  };

  const handleCustomerCreated = (customer) => {
    setCustomerModalOpen(false);
    if (customer) {
      addToast(`Customer "${customer.company_name}" created successfully!`, "success");
      fetchCustomers();
    }
  };

  const handleCustomerUpdated = (customer) => {
    setCustomerModalOpen(false);
    if (customer) {
      addToast(`Customer "${customer.company_name}" updated successfully!`, "success");
      fetchCustomers();
    }
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="mt-2 text-gray-600">Loading customers...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Customers</h2>
          <Button
            onClick={handleCreateCustomer}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            New Customer
          </Button>
        </div>

        <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 280px)" }}>
          <Table>
            <TableHeader>
              <TableRow className="border-b border-gray-300">
                <TableHead className="font-semibold text-gray-900 bg-gray-50 border-r border-gray-300 text-center whitespace-nowrap px-4 py-3">SL NO</TableHead>
                <TableHead className="font-semibold text-gray-900 bg-gray-50 border-r border-gray-300 text-center whitespace-nowrap px-4 py-3">COMPANY NAME</TableHead>
                <TableHead className="font-semibold text-gray-900 bg-gray-50 border-r border-gray-300 text-center whitespace-nowrap px-4 py-3">ADDRESS</TableHead>
                <TableHead className="font-semibold text-gray-900 bg-gray-50 border-r border-gray-300 text-center whitespace-nowrap px-4 py-3">BRANCH</TableHead>
                <TableHead className="font-semibold text-gray-900 bg-gray-50 border-r border-gray-300 text-center whitespace-nowrap px-4 py-3">EMAIL</TableHead>
                <TableHead className="font-semibold text-gray-900 bg-gray-50 border-r border-gray-300 text-center whitespace-nowrap px-4 py-3">CONTACT NUMBER</TableHead>
                <TableHead className="font-semibold text-gray-900 bg-gray-50 border-r border-gray-300 text-center whitespace-nowrap px-4 py-3">CONTACT PERSON</TableHead>
                <TableHead className="font-semibold text-gray-900 bg-gray-50 text-center whitespace-nowrap px-4 py-3">ACTIONS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                    No customers found
                  </TableCell>
                </TableRow>
              ) : (
                customers.map((customer, index) => (
                  <TableRow 
                    key={customer.id}
                    className="border-b border-gray-300 hover:bg-gray-50 transition-colors"
                  >
                    <TableCell className="border-r border-gray-300 text-center px-4 py-3">{index + 1}</TableCell>
                    <TableCell className="border-r border-gray-300 text-center font-medium px-4 py-3">{customer.company_name}</TableCell>
                    <TableCell className="border-r border-gray-300 text-center px-4 py-3">{customer.address}</TableCell>
                    <TableCell className="border-r border-gray-300 text-center px-4 py-3">{customer.branch || "-"}</TableCell>
                    <TableCell className="border-r border-gray-300 text-center px-4 py-3">{customer.email}</TableCell>
                    <TableCell className="border-r border-gray-300 text-center px-4 py-3">{customer.contact_number}</TableCell>
                    <TableCell className="border-r border-gray-300 text-center px-4 py-3">{customer.contact_person}</TableCell>
                    <TableCell className="text-center px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditCustomer(customer)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteCustomer(customer.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {customerModalOpen && (
        <CustomerModal
          isOpen={customerModalOpen}
          onClose={() => setCustomerModalOpen(false)}
          onCustomerCreated={editingCustomer ? handleCustomerUpdated : handleCustomerCreated}
          editingCustomer={editingCustomer}
        />
      )}

      <ToastContainer />
    </div>
  );
};

export default CustomersTable;
