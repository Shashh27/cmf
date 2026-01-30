import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "../Config/auth";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Building2, Phone, Mail, MapPin, Users, FileText } from "lucide-react";

const CompanyDetails = ({ selectedOrderId }) => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchAllCustomers();
  }, []);

  const fetchAllCustomers = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE_URL}/customers/`);
      if (response.ok) {
        const data = await response.json();
        setCustomers(data);
      } else {
        setError("Failed to fetch customers");
      }
    } catch (error) {
      console.error("Error fetching customers:", error);
      setError("Error loading customers");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="mt-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Customers
        </h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/6">Customer ID</TableHead>
              <TableHead>Company Name</TableHead>
              <TableHead>Contact Person</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                Loading customers...
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Customers
        </h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/6">Customer ID</TableHead>
              <TableHead>Company Name</TableHead>
              <TableHead>Contact Person</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={5} className="text-center text-red-500 py-8">
                {error}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="mt-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Customers
        </h3>
        
        <div className="bg-white rounded-lg shadow border border-gray-200">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50 border-b-2 border-gray-200">
                <TableHead className="font-semibold text-gray-900 border-r border-gray-200 w-1/6">Customer ID</TableHead>
                <TableHead className="font-semibold text-gray-900 border-r border-gray-200">Company Name</TableHead>
                <TableHead className="font-semibold text-gray-900 border-r border-gray-200">Contact Person</TableHead>
                <TableHead className="font-semibold text-gray-900 border-r border-gray-200">Email</TableHead>
                <TableHead className="font-semibold text-gray-900">Phone</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8 border-b border-gray-200">
                    No customers found
                  </TableCell>
                </TableRow>
              ) : (
                customers.map((customer) => (
                  <TableRow 
                    key={customer.id}
                    className={`border-b border-gray-200 hover:bg-blue-50 transition-colors ${
                      selectedOrderId && customer.id === selectedOrderId ? 'bg-blue-100' : ''
                    }`}
                  >
                    <TableCell className="border-r border-gray-200 font-medium">{customer.id}</TableCell>
                    <TableCell className="border-r border-gray-200 font-medium">{customer.company_name}</TableCell>
                    <TableCell className="border-r border-gray-200">{customer.contact_person || '-'}</TableCell>
                    <TableCell className="border-r border-gray-200">
                      {customer.email ? (
                        <a 
                          href={`mailto:${customer.email}`}
                          className="text-blue-600 hover:underline"
                        >
                          {customer.email}
                        </a>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      {customer.contact_number ? (
                        <a 
                          href={`tel:${customer.contact_number}`}
                          className="text-blue-600 hover:underline"
                        >
                          {customer.contact_number}
                        </a>
                      ) : '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};

export default CompanyDetails;
