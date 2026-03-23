import React, { useState, useEffect } from "react";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth.js";
import { Table, Tabs, Button, Tag, message, Popconfirm, Tooltip, Space, Card } from "antd";
import { EditOutlined, DeleteOutlined, PlusOutlined, EyeOutlined } from "@ant-design/icons";
import WorkCenterModal from "../Configuration Components/WorkCenterModal";
import Machines from "../Configuration Components/Machines";
import CustomersTable from "../Configuration Components/CustomersTable";

const Configuration = () => {
  const [workCenters, setWorkCenters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workCenterModalOpen, setWorkCenterModalOpen] = useState(false);
  const [editingWorkCenter, setEditingWorkCenter] = useState(null);
  const [selectedWorkCenter, setSelectedWorkCenter] = useState(null);
  const [showMachines, setShowMachines] = useState(false);

  const getCurrentUserId = () => {
    try {
      const stored = localStorage.getItem("user");
      if (!stored) return null;
      const u = JSON.parse(stored);
      if (u?.id == null) return null;
      return u.id;
    } catch {
      return null;
    }
  };

  const userId = getCurrentUserId();

  useEffect(() => {
    fetchWorkCenters();
  }, []);

  const fetchWorkCenters = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/workcenters/`, {
        params: userId != null ? { user_id: userId } : undefined,
      });
      setWorkCenters(response.data);
    } catch (error) {
      console.error("Error fetching work centers:", error);
      setWorkCenters([]);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (workCenter) => {
    setEditingWorkCenter(workCenter);
    setWorkCenterModalOpen(true);
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API_BASE_URL}/workcenters/${id}`, {
        params: userId != null ? { user_id: userId } : undefined,
      });
      message.success("Work center deleted successfully");
      fetchWorkCenters();
    } catch (error) {
      console.error("Error deleting work center:", error);
      let detail =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        error?.message ||
        "Error deleting work center";
      message.error(detail);
    }
  };

  const handleViewMachines = (workCenter) => {
    setSelectedWorkCenter(workCenter);
    setShowMachines(true);
  };

  const handleBackToWorkCenters = () => {
    setShowMachines(false);
    setSelectedWorkCenter(null);
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
      title: 'CODE',
      dataIndex: 'code',
      key: 'code',
      align: 'center',
      render: (text) => <span style={{ fontWeight: 500 }}>{text}</span>,
    },
    {
      title: 'WORK CENTER NAME',
      dataIndex: 'work_center_name',
      key: 'work_center_name',
      align: 'center',
    },
    {
      title: 'DESCRIPTION',
      dataIndex: 'description',
      key: 'description',
      align: 'center',
      render: (text) => text || "-",
    },
    {
      title: 'IS SCHEDULABLE',
      dataIndex: 'is_schedulable',
      key: 'is_schedulable',
      align: 'center',
      render: (schedulable) => (
        <Tag color={schedulable ? "blue" : "default"}>
          {schedulable ? "Yes" : "No"}
        </Tag>
      ),
    },
    {
      title: 'ACTIONS',
      key: 'actions',
      align: 'center',
      render: (_, record) => (
        <Space>
          <Tooltip title="View Machines">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => handleViewMachines(record)}
            />
          </Tooltip>
          <Tooltip title="Edit">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Tooltip title="Delete">
            <Popconfirm
              title="Delete Work Center"
              description="Are you sure you want to delete this work center?"
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

  if (showMachines) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Machines 
          workCenter={selectedWorkCenter}
          userId={userId}
          onBack={handleBackToWorkCenters}
        />
      </div>
    );
  }

  const items = [
    {
      key: 'work-center',
      label: 'Work Center',
      children: (
        <Card 
          title="Work Center" 
          extra={
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditingWorkCenter(null);
                setWorkCenterModalOpen(true);
              }}
            >
              Add Work Center
            </Button>
          }
          variant="borderless"
          className="shadow-sm"
        >
          <Table
            columns={columns}
            dataSource={workCenters}
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
            scroll={{ x: 1000 }}
            className="modern-table"
          />
        </Card>
      ),
    },
    {
      key: 'customers',
      label: 'Customers',
      children: <CustomersTable userId={userId} />,
    },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
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
        @media (max-width: 640px) {
          .ant-tabs-nav-list {
            width: 100%;
            display: flex;
          }
          .ant-tabs-tab {
            flex: 1;
            text-align: center;
            margin: 0 !important;
          }
          .ant-card-head-title {
            font-size: 16px;
          }
          .ant-card-extra {
            padding: 8px 0;
          }
        }
      `}</style>
      <h1 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4">Configuration</h1>
      <Tabs 
        defaultActiveKey="work-center" 
        items={items} 
        className="responsive-tabs"
      />

      <WorkCenterModal
        workCenter={editingWorkCenter}
        isOpen={workCenterModalOpen}
        userId={userId}
        onClose={() => setWorkCenterModalOpen(false)}
        onSave={() => {
          setWorkCenterModalOpen(false);
          fetchWorkCenters();
          message.success(
            editingWorkCenter 
              ? "Work center updated successfully" 
              : "Work center created successfully"
          );
        }}
      />
    </div>
  );
};

export default Configuration;
