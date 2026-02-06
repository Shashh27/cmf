import React, { useState, useEffect } from "react";
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

  useEffect(() => {
    fetchWorkCenters();
  }, []);

  const fetchWorkCenters = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/workcenters/`);
      if (response.ok) {
        const data = await response.json();
        setWorkCenters(data);
      } else {
        console.error("Failed to fetch work centers:", response.statusText);
        setWorkCenters([]);
      }
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
      const response = await fetch(`${API_BASE_URL}/workcenters/${id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        message.success("Work center deleted successfully");
        fetchWorkCenters();
      } else {
        message.error("Failed to delete work center");
      }
    } catch (error) {
      console.error("Error deleting work center:", error);
      message.error("Error deleting work center");
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
      <Machines 
        workCenter={selectedWorkCenter}
        onBack={handleBackToWorkCenters}
      />
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
          bordered={false}
          className="shadow-sm"
        >
          <Table
            columns={columns}
            dataSource={workCenters}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 10 }}
            bordered
            size="middle"
          />
        </Card>
      ),
    },
    {
      key: 'customers',
      label: 'Customers',
      children: <CustomersTable />,
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px' }}>Configuration</h1>
      <Tabs defaultActiveKey="work-center" items={items} />

      <WorkCenterModal
        workCenter={editingWorkCenter}
        isOpen={workCenterModalOpen}
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
