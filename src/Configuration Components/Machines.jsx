import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "../Config/auth.js";
import { Table, Button, message, Popconfirm, Space, Card, Tooltip } from "antd";
import { ArrowLeftOutlined, PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import MachineModal from "../Configuration Components/MachineModal";

const Machines = ({ workCenter, onBack }) => {
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [machineModalOpen, setMachineModalOpen] = useState(false);
  const [editingMachine, setEditingMachine] = useState(null);

  useEffect(() => {
    if (workCenter) {
      fetchMachines();
    }
  }, [workCenter]);

  const fetchMachines = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/machines/work-center/${workCenter.id}`);
      if (response.ok) {
        const data = await response.json();
        setMachines(data);
      } else {
        console.error("Failed to fetch machines:", response.statusText);
        setMachines([]);
      }
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

  const handleDeleteMachine = async (id) => {
    try {
      const response = await fetch(`${API_BASE_URL}/machines/${id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        message.success("Machine deleted successfully");
        fetchMachines();
      } else {
        message.error("Failed to delete machine");
      }
    } catch (error) {
      console.error("Error deleting machine:", error);
      message.error("Error deleting machine");
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Button 
            icon={<ArrowLeftOutlined />} 
            onClick={onBack}
            type="text"
          />
          <div>
            <span>Machines</span>
            <span style={{ marginLeft: '12px', fontSize: '14px', fontWeight: 'normal', color: '#666' }}>
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
        >
          Add Machine
        </Button>
      }
      bordered={false}
      className="shadow-sm"
    >
      <Table
        columns={columns}
        dataSource={machines}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        bordered
        size="middle"
        scroll={{ x: 1500 }}
      />

      {machineModalOpen && (
        <MachineModal
          machine={editingMachine}
          workCenterId={workCenter?.id}
          isOpen={machineModalOpen}
          onClose={() => setMachineModalOpen(false)}
          onSave={handleMachineSaved}
        />
      )}
    </Card>
  );
};

export default Machines;
