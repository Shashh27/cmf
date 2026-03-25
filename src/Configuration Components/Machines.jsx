import React, { useState, useEffect } from "react";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth.js";
import { Table, Button, message, Popconfirm, Space, Card, Tooltip } from "antd";
import { ArrowLeftOutlined, PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined, EyeInvisibleOutlined } from "@ant-design/icons";
import MachineModal from "../Configuration Components/MachineModal";

const Machines = ({ workCenter, onBack, userId }) => {
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [machineModalOpen, setMachineModalOpen] = useState(false);
  const [editingMachine, setEditingMachine] = useState(null);
  const [visiblePasswords, setVisiblePasswords] = useState({});

  useEffect(() => {
    if (workCenter) {
      fetchMachines();
    }
  }, [workCenter]);

  const fetchMachines = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/machines/work-center/${workCenter.id}`, {
        params: userId != null ? { user_id: userId } : undefined,
      });
      setMachines(response.data);
    } catch (error) {
      console.error("Error fetching machines:", error);
      setMachines([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  const handleAddMachine = () => {
    setEditingMachine(null);
    setMachineModalOpen(true);
  };

  const handleEditMachine = (machine) => {
    setEditingMachine(machine);
    setMachineModalOpen(true);
  };

  const togglePasswordVisibility = (id) => {
    setVisiblePasswords((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleDeleteMachine = async (id) => {
    try {
      await axios.delete(`${API_BASE_URL}/machines/${id}`, {
        params: userId != null ? { user_id: userId } : undefined,
      });
      message.success("Machine deleted successfully");
      fetchMachines();
    } catch (error) {
      console.error("Error deleting machine:", error);
      let detail =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        error?.message ||
        "Error deleting machine";
      message.error(detail);
    }
  };

  const handleMachineSaved = () => {
    setMachineModalOpen(false);
    fetchMachines();
    message.success(
      editingMachine 
        ? "Machine updated successfully" 
        : "Machine created successfully"
    );
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
      title: 'TYPE',
      dataIndex: 'type',
      key: 'type',
      align: 'center',
      render: (text) => text || "-",
    },
    {
      title: 'MAKE',
      dataIndex: 'make',
      key: 'make',
      align: 'center',
      render: (text) => text || "-",
    },
    {
      title: 'MODEL',
      dataIndex: 'model',
      key: 'model',
      align: 'center',
      render: (text) => text || "-",
    },
    {
      title: 'YEAR',
      dataIndex: 'year_of_installation',
      key: 'year_of_installation',
      align: 'center',
      render: (text) => text || "-",
    },
    {
      title: 'CNC CONTROLLER',
      dataIndex: 'cnc_controller',
      key: 'cnc_controller',
      align: 'center',
      render: (text) => text || "-",
    },
    {
      title: 'SERVICE',
      dataIndex: 'cnc_controller_service',
      key: 'cnc_controller_service',
      align: 'center',
      render: (text) => text || "-",
    },
    {
      title: 'REMARKS',
      dataIndex: 'remarks',
      key: 'remarks',
      align: 'center',
      render: (text) => text || "-",
    },
    {
      title: 'CALIBRATION DATE',
      dataIndex: 'calibration_date',
      key: 'calibration_date',
      align: 'center',
      render: (text) => formatDate(text),
    },
    {
      title: 'DUE DATE',
      dataIndex: 'calibration_due_date',
      key: 'calibration_due_date',
      align: 'center',
      render: (text) => formatDate(text),
    },
    {
      title: 'PASSWORD',
      dataIndex: 'password',
      key: 'password',
      align: 'center',
      render: (text, record) => (
        <Space>
          <span>
            {text
              ? visiblePasswords[record.id]
                ? text
                : "•".repeat(text.length)
              : "-"}
          </span>
          {text && (
            <Button
              type="text"
              size="small"
              icon={visiblePasswords[record.id] ? <EyeInvisibleOutlined /> : <EyeOutlined />}
              onClick={() => togglePasswordVisibility(record.id)}
            />
          )}
        </Space>
      ),
    },
    {
      title: 'ACTIONS',
      key: 'actions',
      align: 'center',
      fixed: 'right',
      render: (_, record) => (
        <Space>
          <Tooltip title="Edit">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => handleEditMachine(record)}
            />
          </Tooltip>
          <Tooltip title="Delete">
            <Popconfirm
              title="Delete Machine"
              description="Are you sure you want to delete this machine?"
              onConfirm={() => handleDeleteMachine(record.id)}
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
      title={
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <Button 
            icon={<ArrowLeftOutlined />} 
            onClick={onBack}
            type="text"
            className="w-fit"
          />
          <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3">
            <span className="text-lg font-bold">Machines</span>
            <span className="text-xs sm:text-sm text-gray-500 font-normal">
              Work Center: <strong>{workCenter?.work_center_name}</strong>
            </span>
          </div>
        </div>
      }
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleAddMachine}
          className="whitespace-nowrap"
        >
          <span className="hidden sm:inline">Add Machine</span>
          <span className="sm:hidden">Add</span>
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
        .ant-table-thead > tr > th {
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
        dataSource={machines}
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
        className="machine-table"
      />

      {machineModalOpen && (
        <MachineModal
          machine={editingMachine}
          workCenterId={workCenter?.id}
          userId={userId}
          isOpen={machineModalOpen}
          onClose={() => setMachineModalOpen(false)}
          onSave={handleMachineSaved}
        />
      )}
    </Card>
  );
};

export default Machines;
