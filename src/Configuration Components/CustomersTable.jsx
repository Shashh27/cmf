import React, { useState, useEffect } from "react";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth.js";
import { Table, Button, message, Popconfirm, Space, Card, Tooltip } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import CustomerModal from "./CustomerModal";

const CustomersTable = ({ userId }) => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/customers/`, {
        params: userId != null ? { user_id: userId } : undefined,
      });
      setCustomers(response.data);
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
      await axios.delete(`${API_BASE_URL}/customers/${id}/`, {
        params: userId != null ? { user_id: userId } : undefined,
      });
      message.success("Customer deleted successfully");
      fetchCustomers();
    } catch (error) {
      console.error("Error deleting customer:", error);
      let detail =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        error?.message ||
        "Error deleting customer";
      message.error(detail);
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
      title={<span className="text-lg font-bold">Customers</span>}
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleCreateCustomer}
        >
          <span className="hidden sm:inline">New Customer</span>
          <span className="sm:hidden">New</span>
        </Button>
      }
      variant="borderless"
      className="shadow-sm overflow-hidden"
      styles={{
        header: { padding: '12px 16px' },
        body: { padding: '0 12px 12px' }
      }}
    >
      <style>{`
        .modern-table .ant-table-thead > tr > th {
          background: linear-gradient(to bottom, #f0f5ff, #e6f0ff) !important;
          font-weight: 600;
          border-bottom: 2px solid #1890ff !important;
          white-space: nowrap;
        }
        @media (max-width: 640px) {
          .ant-card-extra {
            padding: 12px 0;
          }
        }
      `}</style>
      <Table
        columns={columns}
        dataSource={customers}
        rowKey="id"
        loading={loading}
        pagination={{ 
          pageSize: 10,
          size: "small",
          responsive: true,
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
          showSizeChanger: true,
          showQuickJumper: true,
        }}
        bordered
        size="middle"
        scroll={{ x: 1200 }}
        className="modern-table"
      />

      {customerModalOpen && (
        <CustomerModal
          isOpen={customerModalOpen}
          onClose={() => setCustomerModalOpen(false)}
          userId={userId}
          onCustomerCreated={editingCustomer ? handleCustomerUpdated : handleCustomerCreated}
          editingCustomer={editingCustomer}
        />
      )}
    </Card>
  );
};

export default CustomersTable;
