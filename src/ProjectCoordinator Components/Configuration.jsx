import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Table,
  Button,
  message,
  Popconfirm,
  Space,
  Card,
  Tooltip,
  Input,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import CustomerModal from '../Configuration Components/CustomerModal';
import { api } from '../api/client.js';

const getCurrentUserId = () => {
  try {
    const stored = localStorage.getItem('user');
    if (!stored) return null;
    const u = JSON.parse(stored);
    return u?.id ?? null;
  } catch {
    return null;
  }
};

const compareText = (a, b) =>
  String(a ?? '').localeCompare(String(b ?? ''), undefined, { sensitivity: 'base' });

const buildColumnFilters = (rows, field) => {
  const unique = [...new Set(rows.map((row) => row[field]).filter(Boolean))].sort(compareText);
  return unique.map((value) => ({ text: value, value }));
};

const sortCustomersNewestFirst = (rows) =>
  [...rows].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : Number(a.id) || 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : Number(b.id) || 0;
    return bTime - aTime;
  });

const Configuration = () => {
  const userId = getCurrentUserId();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchCustomers = useCallback(async ({ showTableLoading = true } = {}) => {
    if (showTableLoading) setLoading(true);
    else setRefreshing(true);

    try {
      const response = await api.get('/customers/');
      const rows = Array.isArray(response.data) ? response.data : [];
      setCustomers(sortCustomersNewestFirst(rows));
    } catch (error) {
      console.error('Error fetching customers:', error);
      setCustomers([]);
      message.error('Failed to load customers');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

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
      await api.delete(`/customers/${id}`);
      message.success('Customer deleted successfully');
      fetchCustomers({ showTableLoading: false });
    } catch (error) {
      console.error('Error deleting customer:', error);
      const detail =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        error?.message ||
        'Error deleting customer';
      message.error(detail);
    }
  };

  const handleCustomerSaved = (customer) => {
    setCustomerModalOpen(false);
    if (customer) {
      message.success(
        editingCustomer
          ? `Customer "${customer.company_name}" updated successfully!`
          : `Customer "${customer.company_name}" created successfully!`,
      );
      fetchCustomers({ showTableLoading: false });
    }
  };

  const filteredCustomers = useMemo(() => {
    const searchLower = searchText.trim().toLowerCase();
    if (!searchLower) return customers;

    return customers.filter((customer) =>
      customer.company_name?.toLowerCase().includes(searchLower) ||
      customer.address?.toLowerCase().includes(searchLower) ||
      customer.branch?.toLowerCase().includes(searchLower) ||
      customer.email?.toLowerCase().includes(searchLower) ||
      customer.contact_number?.toLowerCase().includes(searchLower) ||
      customer.contact_person?.toLowerCase().includes(searchLower) ||
      customer.user_name?.toLowerCase().includes(searchLower),
    );
  }, [customers, searchText]);

  const columns = useMemo(() => [
    {
      title: 'SL NO',
      key: 'index',
      render: (_, __, index) => (currentPage - 1) * pageSize + index + 1,
      width: 80,
      align: 'center',
    },
    {
      title: 'COMPANY NAME',
      dataIndex: 'company_name',
      key: 'company_name',
      align: 'center',
      sorter: (a, b) => compareText(a.company_name, b.company_name),
      filters: buildColumnFilters(customers, 'company_name'),
      filterSearch: true,
      onFilter: (value, record) => record.company_name === value,
      render: (text) => <span style={{ fontWeight: 500 }}>{text}</span>,
    },
    {
      title: 'ADDRESS',
      dataIndex: 'address',
      key: 'address',
      align: 'center',
      sorter: (a, b) => compareText(a.address, b.address),
      render: (text) => <span style={{ fontWeight: 500 }}>{text}</span>,
    },
    {
      title: 'BRANCH',
      dataIndex: 'branch',
      key: 'branch',
      align: 'center',
      sorter: (a, b) => compareText(a.branch, b.branch),
      filters: buildColumnFilters(customers, 'branch'),
      filterSearch: true,
      onFilter: (value, record) => (record.branch || '-') === value,
      render: (text) => text || '-',
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
      sorter: (a, b) => compareText(a.contact_person, b.contact_person),
    },
    {
      title: 'CREATED BY',
      dataIndex: 'user_name',
      key: 'user_name',
      align: 'center',
      sorter: (a, b) => compareText(a.user_name, b.user_name),
      filters: buildColumnFilters(customers, 'user_name'),
      filterSearch: true,
      onFilter: (value, record) => (record.user_name || '-') === value,
      render: (text) => text || '-',
    },
    {
      title: 'ACTIONS',
      key: 'actions',
      align: 'center',
      fixed: 'right',
      width: 120,
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
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ], [customers, currentPage, pageSize]);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <Card
        title={
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 w-full">
          <span className="text-lg font-bold">Customers</span>
         <div className="flex flex-wrap items-center gap-3">
            <Input.Search
              placeholder="Search customers..."
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                setCurrentPage(1);
              }}
              style={{ width: 250 }}
              allowClear
            />
            <Button
              icon={<ReloadOutlined />}
              onClick={() => fetchCustomers({ showTableLoading: false })}
              loading={refreshing}
            >
            Refresh
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateCustomer}>
              <span className="hidden sm:inline">New Customer</span>
              <span className="sm:hidden">New</span>
            </Button>
          </div>
        </div>
        }
        variant="borderless"
        className="shadow-sm overflow-hidden"
        styles={{
          header: { padding: '12px 16px' },
          body: { padding: '0 12px 12px' },
        }}
      >
        <style>{`
          .pc-customers-table .ant-table-thead > tr > th {
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
          dataSource={filteredCustomers}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize,
            current: currentPage,
            size: 'small',
            responsive: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
            showSizeChanger: true,
            showQuickJumper: true,
            onChange: (page, size) => {
              setCurrentPage(page);
              setPageSize(size);
            },
            onShowSizeChange: (_, size) => {
              setCurrentPage(1);
              setPageSize(size);
            },
            pageSizeOptions: ['10', '20', '50', '100'],
          }}
          bordered
          size="middle"
          scroll={{ x: 1200 }}
          className="pc-customers-table"
        />

        {customerModalOpen && (
          <CustomerModal
            isOpen={customerModalOpen}
            onClose={() => setCustomerModalOpen(false)}
            userId={userId}
            onCustomerCreated={handleCustomerSaved}
            editingCustomer={editingCustomer}
          />
        )}
      </Card>
    </div>
  );
};

export default Configuration;
