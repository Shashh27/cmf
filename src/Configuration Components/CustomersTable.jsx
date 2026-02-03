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
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Customers</h2>
        <Button
          onClick={handleCreateCustomer}
          className="bg-gray-900 hover:bg-gray-800"
        >
          New Customer
        </Button>
      </div>

      <div className="bg-white rounded-lg shadow border border-gray-200">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 border-b-2 border-gray-200">
              <TableHead className="font-semibold text-gray-900 border-r border-gray-200">SL NO</TableHead>
              <TableHead className="font-semibold text-gray-900 border-r border-gray-200">COMPANY NAME</TableHead>
              <TableHead className="font-semibold text-gray-900 border-r border-gray-200">ADDRESS</TableHead>
              <TableHead className="font-semibold text-gray-900 border-r border-gray-200">BRANCH</TableHead>
              <TableHead className="font-semibold text-gray-900 border-r border-gray-200">EMAIL</TableHead>
              <TableHead className="font-semibold text-gray-900 border-r border-gray-200">CONTACT NUMBER</TableHead>
              <TableHead className="font-semibold text-gray-900 border-r border-gray-200">CONTACT PERSON</TableHead>
              <TableHead className="font-semibold text-gray-900">ACTIONS</TableHead>
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
                  className="border-b border-gray-200 hover:bg-blue-50 transition-colors"
                >
                  <TableCell className="border-r border-gray-200">{index + 1}</TableCell>
                  <TableCell className="border-r border-gray-200 font-medium">{customer.company_name}</TableCell>
                  <TableCell className="border-r border-gray-200">{customer.address}</TableCell>
                  <TableCell className="border-r border-gray-200">{customer.branch || "-"}</TableCell>
                  <TableCell className="border-r border-gray-200">{customer.email}</TableCell>
                  <TableCell className="border-r border-gray-200">{customer.contact_number}</TableCell>
                  <TableCell className="border-r border-gray-200">{customer.contact_person}</TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditCustomer(customer)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteCustomer(customer.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
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
