import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "../Config/auth.js";
import { Table, Button, message, Popconfirm, Space, Card, Tooltip } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import CustomerModal from "../OMS Components/CustomerModal";

const CustomersTable = () => {
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
    try {
      const response = await fetch(`${API_BASE_URL}/customers/${id}/`, {
        method: "DELETE",
      });
      if (response.ok) {
        message.success("Customer deleted successfully");
        fetchCustomers();
      } else {
        message.error("Failed to delete customer");
      }
    } catch (error) {
      console.error("Error deleting customer:", error);
      message.error("Error deleting customer");
    }
  };

  const handleCustomerCreated = (customer) => {
    setCustomerModalOpen(false);
    if (customer) {
      message.success(`Customer "${customer.company_name}" created successfully!`);
      fetchCustomers();
    }
  };

  const handleCustomerUpdated = (customer) => {
    setCustomerModalOpen(false);
    if (customer) {
      message.success(`Customer "${customer.company_name}" updated successfully!`);
      fetchCustomers();
    }
  };

  const columns = [
    {
      title: 'SL NO',
      key: 'index',
      render: (text, record, index) => index + 1,
      width: 80,
      align: 'center',
    },
    {
      title: 'COMPANY NAME',
      dataIndex: 'company_name',
      key: 'company_name',
      align: 'center',
      render: (text) => <span style={{ fontWeight: 500 }}>{text}</span>,
    },
    {
      title: 'ADDRESS',
      dataIndex: 'address',
      key: 'address',
      align: 'center',
    },
    {
      title: 'BRANCH',
      dataIndex: 'branch',
      key: 'branch',
      align: 'center',
      render: (text) => text || "-",
    },
    {
      title: 'EMAIL',
      dataIndex: 'email',
      key: 'email',
      align: 'center',
    },
    {
      title: 'CONTACT NUMBER',
      dataIndex: 'contact_number',
      key: 'contact_number',
      align: 'center',
    },
    {
      title: 'CONTACT PERSON',
      dataIndex: 'contact_person',
      key: 'contact_person',
      align: 'center',
    },
    {
      title: 'ACTIONS',
      key: 'actions',
      align: 'center',
      render: (_, record) => (
        <Space>
          <Tooltip title="Edit">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => handleEditCustomer(record)}
            />
          </Tooltip>
          <Tooltip title="Delete">
            <Popconfirm
              title="Delete Customer"
              description="Are you sure you want to delete this customer?"
              onConfirm={() => handleDeleteCustomer(record.id)}
              okText="Yes"
              cancelText="No"
              okButtonProps={{ danger: true }}
            >
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
              />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="Customers"
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleCreateCustomer}
        >
          New Customer
        </Button>
      }
      bordered={false}
      className="shadow-sm"
    >
      <Table
        columns={columns}
        dataSource={customers}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        bordered
        size="middle"
      />

      {customerModalOpen && (
        <CustomerModal
          isOpen={customerModalOpen}
          onClose={() => setCustomerModalOpen(false)}
          onCustomerCreated={editingCustomer ? handleCustomerUpdated : handleCustomerCreated}
          editingCustomer={editingCustomer}
        />
      )}
    </Card>
  );
};

export default CustomersTable;
