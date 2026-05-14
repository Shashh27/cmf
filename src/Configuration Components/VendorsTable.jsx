import React, { useState, useEffect } from "react";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth.js";
import { Table, Button, Tag, message, Popconfirm, Tooltip, Space, Card, Modal, Form, Input } from "antd";
import { EditOutlined, DeleteOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";

const VendorsTable = ({ userId }) => {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [vendorModalOpen, setVendorModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [form] = Form.useForm();
  const [modalLoading, setModalLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
  });
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    fetchVendors();
  }, []);

  useEffect(() => {
    if (vendorModalOpen) {
      if (editingVendor) {
        form.setFieldsValue({
          company_name: editingVendor.company_name,
        });
      } else {
        form.resetFields();
      }
    }
  }, [editingVendor, vendorModalOpen, form]);

  const fetchVendors = async () => {
    try {
      // Remove user_id restriction - show all vendors for everyone
      const response = await axios.get(`${API_BASE_URL}/rawmaterials/vendors`);
      setVendors(response.data);
    } catch (error) {
      console.error("Error fetching vendors:", error);
      setVendors([]);
      message.error("Failed to fetch vendors");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (vendor) => {
    setEditingVendor(vendor);
    setVendorModalOpen(true);
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API_BASE_URL}/rawmaterials/vendors/${id}`);
      message.success("Vendor deleted successfully");
      fetchVendors();
    } catch (error) {
      console.error("Error deleting vendor:", error);
      console.error("Error response:", error?.response);
      
      let errorMessage = "Error deleting vendor";
      
      if (error?.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error?.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error?.response?.status === 400) {
        errorMessage = "Cannot delete vendor: It may be referenced by other records";
      } else if (error?.response?.status === 500) {
        errorMessage = "Server error: Please contact administrator";
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      message.error(errorMessage);
    }
  };

  const handleAddNew = () => {
    setEditingVendor(null);
    setVendorModalOpen(true);
  };

  const handleSearch = (value) => {
    setSearchText(value);
    setPagination({
      current: 1,
      pageSize: pagination.pageSize,
    });
  };

  const handleTableChange = (paginationConfig) => {
    setPagination({
      current: paginationConfig.current,
      pageSize: paginationConfig.pageSize,
    });
  };

  const handleModalSave = () => {
    setVendorModalOpen(false);
    setEditingVendor(null);
    fetchVendors();
    message.success(
      editingVendor 
        ? "Vendor updated successfully" 
        : "Vendor created successfully"
    );
  };

  const handleModalClose = () => {
    form.resetFields();
    setVendorModalOpen(false);
    setEditingVendor(null);
  };

  const handleModalSubmit = async () => {
    try {
      const values = await form.validateFields();
      setModalLoading(true);

      if (editingVendor) {
        // Update existing vendor
        await axios.put(`${API_BASE_URL}/rawmaterials/vendors/${editingVendor.id}`, values);
      } else {
        // Create new vendor
        await axios.post(`${API_BASE_URL}/rawmaterials/vendors`, values);
      }

      handleModalSave();
    } catch (error) {
      console.error("Error saving vendor:", error);
      console.error("Error response:", error?.response);
      
      let errorMessage = "Error saving vendor";
      
      if (error?.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error?.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error?.response?.status === 400) {
        errorMessage = "Validation error: Please check your input";
      } else if (error?.response?.status === 500) {
        errorMessage = "Server error: Please contact administrator";
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      message.error(errorMessage);
    } finally {
      setModalLoading(false);
    }
  };

  const columns = [
    {
      title: 'SL NO',
      key: 'slNo',
      width: 80,
      align: 'center',
      render: (text, record, index) => {
        const slNo = (pagination.current - 1) * pagination.pageSize + index + 1;
        return <span style={{ fontWeight: 600, color: '#1890ff' }}>{slNo}</span>;
      },
    },
    {
      title: 'COMPANY NAME',
      dataIndex: 'company_name',
      key: 'company_name',
      align: 'center',
      render: (text) => <span style={{ fontWeight: 500 }}>{text}</span>,
    },
    {
      title: 'CREATED AT',
      dataIndex: 'created_at',
      key: 'created_at',
      align: 'center',
      render: (text) => {
        if (!text) return "-";
        return new Date(text).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
      },
    },
    {
      title: 'UPDATED AT',
      dataIndex: 'updated_at',
      key: 'updated_at',
      align: 'center',
      render: (text) => {
        if (!text) return "-";
        return new Date(text).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
      },
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
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Tooltip title="Delete">
            <Popconfirm
              title="Delete Vendor"
              description="Are you sure you want to delete this vendor?"
              onConfirm={() => handleDelete(record.id)}
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

  // Filter vendors based on search text
  const filteredVendors = vendors.filter(vendor =>
    vendor.company_name.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <>
      <Card 
       
        extra={
          <Space>
            <Input.Search
              placeholder="Search by company name"
              allowClear
              style={{ width: 250 }}
              onSearch={handleSearch}
              onChange={(e) => !e.target.value && handleSearch('')}
              prefix={<SearchOutlined />}
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAddNew}
            >
              Add Vendor
            </Button>
          </Space>
        }
        variant="borderless"
        className="shadow-sm"
      >
        <Table
          columns={columns}
          dataSource={filteredVendors}
          rowKey="id"
          loading={loading}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            size: "small",
            responsive: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
            showSizeChanger: true,
            showQuickJumper: true,
            pageSizeOptions: ['10', '20', '50', '100'],
          }}
          bordered
          size="middle"
          scroll={{ x: 'max-content' }}
          className="modern-table responsive-table"
          onChange={handleTableChange}
        />
      </Card>

      <Modal
        title={editingVendor ? "Edit Vendor" : "Add New Vendor"}
        open={vendorModalOpen}
        onOk={handleModalSubmit}
        onCancel={handleModalClose}
        confirmLoading={modalLoading}
        okText={editingVendor ? "Update" : "Create"}
        cancelText="Cancel"
        width={500}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          name="vendorForm"
          preserve={false}
        >
          <Form.Item
            name="company_name"
            label="Company Name"
            rules={[
              { required: true, message: "Please enter company name!" },
              { whitespace: true, message: "Company name cannot be empty!" },
              { min: 2, message: "Company name must be at least 2 characters!" },
              { max: 100, message: "Company name cannot exceed 100 characters!" },
            ]}
          >
            <Input
              placeholder="Enter vendor company name"
              autoComplete="off"
            />
          </Form.Item>
        </Form>
      </Modal>

      <style>{`
        .modern-table .ant-table-thead > tr > th {
          background: linear-gradient(to bottom, #f0f5ff, #e6f0ff);
          font-weight: 600;
          border-bottom: 2px solid #1890ff;
          white-space: nowrap;
        }
        .modern-table .ant-table-tbody > tr:hover > td {
          background: #f0f8ff !important;
        }
        .modern-table .ant-table-tbody > tr > td {
          border-bottom: 1px solid #f0f0f0;
        }
        
        /* Responsive table styles */
        .responsive-table {
          width: 100%;
          overflow-x: auto;
        }
        
        .responsive-table .ant-table {
          min-width: 100%;
        }
        
        .responsive-table .ant-table-container {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        
        @media (max-width: 768px) {
          .responsive-table .ant-table-thead > tr > th,
          .responsive-table .ant-table-tbody > tr > td {
            padding: 8px 4px;
            font-size: 12px;
          }
          
          .responsive-table .ant-btn {
            padding: 4px 8px;
            font-size: 12px;
          }
        }
        
        @media (max-width: 576px) {
          .responsive-table .ant-table-thead > tr > th,
          .responsive-table .ant-table-tbody > tr > td {
            padding: 6px 2px;
            font-size: 11px;
          }
          
          .ant-card-head-title {
            font-size: 16px !important;
          }
          
          .ant-card-extra .ant-btn {
            padding: 4px 8px;
            font-size: 12px;
          }
        }
        
        /* Pagination responsive */
        .ant-pagination {
          flex-wrap: wrap;
          justify-content: center;
        }
        
        .ant-pagination-options {
          margin: 8px 0;
        }
      `}</style>
    </>
  );
};

export default VendorsTable;
