import React, { useState, useEffect } from "react";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth.js";
import { Table, Tabs, Button, Tag, message, Popconfirm, Tooltip, Space, Card, Input } from "antd";
import { EditOutlined, DeleteOutlined, PlusOutlined, EyeOutlined } from "@ant-design/icons";
import WorkCenterModal from "../Configuration Components/WorkCenterModal";
import Machines from "../Configuration Components/Machines";
import CustomersTable from "../Configuration Components/CustomersTable";
import VendorsTable from "../Configuration Components/VendorsTable";
import MachineMHRs from "../Configuration Components/MachineMHRs";

const Configuration = () => {
  const [workcenters, setworkcenters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workcenterModalOpen, setworkcenterModalOpen] = useState(false);
  const [editingworkcenter, setEditingworkcenter] = useState(null);
  const [selectedworkcenter, setSelectedworkcenter] = useState(null);
  const [showMachines, setShowMachines] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [workcenterMachines, setworkcenterMachines] = useState({});
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

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
    fetchworkcenters();
  }, []);

  const fetchworkcenters = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/workcenters/`);
      setworkcenters(response.data);
    } catch (error) {
      console.error("Error fetching work centers:", error);
      setworkcenters([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchMachinesForAllworkcenters = async () => {
    try {
      const machinePromises = workcenters.map(async (workcenter) => {
        try {
          const response = await axios.get(`${API_BASE_URL}/machines/workcenter/${workcenter.id}`);
          return { workcenterId: workcenter.id, machines: response.data };
        } catch (error) {
          console.error(`Error fetching machines for work center ${workcenter.id}:`, error);
          return { workcenterId: workcenter.id, machines: [] };
        }
      });

      const results = await Promise.all(machinePromises);
      const machinesMap = {};
      results.forEach(({ workcenterId, machines }) => {
        machinesMap[workcenterId] = machines;
      });
      setworkcenterMachines(machinesMap);
    } catch (error) {
      console.error("Error fetching machines for work centers:", error);
    }
  };

  useEffect(() => {
    if (searchText && workcenters.length > 0 && Object.keys(workcenterMachines).length === 0) {
      fetchMachinesForAllworkcenters();
    }
  }, [searchText, workcenters.length]);

  const handleEdit = (workcenter) => {
    setEditingworkcenter(workcenter);
    setworkcenterModalOpen(true);
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API_BASE_URL}/workcenters/${id}`);
      message.success("Work center deleted successfully");
      fetchworkcenters();
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

  const handleViewMachines = (workcenter) => {
    setSelectedworkcenter(workcenter);
    setShowMachines(true);
  };

  const handleBackToworkcenters = () => {
    setShowMachines(false);
    setSelectedworkcenter(null);
  };

  const filteredworkcenters = workcenters.filter(workcenter => {
    const searchLower = searchText.toLowerCase();
    const machines = workcenterMachines[workcenter.id] || [];
    
    return (
      workcenter.code?.toLowerCase().includes(searchLower) ||
      workcenter.work_center_name?.toLowerCase().includes(searchLower) ||
      workcenter.description?.toLowerCase().includes(searchLower) ||
      machines.some(machine => 
        machine.type?.toLowerCase().includes(searchLower) ||
        machine.make?.toLowerCase().includes(searchLower) ||
        machine.model?.toLowerCase().includes(searchLower) ||
        machine.cnc_controller?.toLowerCase().includes(searchLower) ||
        machine.remarks?.toLowerCase().includes(searchLower) ||
        machine.password?.toLowerCase().includes(searchLower)
      )
    );
  });

  const getRowClassName = (record) => {
    if (!searchText) return '';
    
    const searchLower = searchText.toLowerCase();
    const machines = workcenterMachines[record.id] || [];
    
    const workcenterMatches = 
      record.code?.toLowerCase().includes(searchLower) ||
      record.work_center_name?.toLowerCase().includes(searchLower) ||
      record.description?.toLowerCase().includes(searchLower);
    
    const machineMatches = machines.some(machine => 
      machine.type?.toLowerCase().includes(searchLower) ||
      machine.make?.toLowerCase().includes(searchLower) ||
      machine.model?.toLowerCase().includes(searchLower) ||
      machine.cnc_controller?.toLowerCase().includes(searchLower) ||
      machine.remarks?.toLowerCase().includes(searchLower) ||
      machine.password?.toLowerCase().includes(searchLower)
    );
    
    return machineMatches && !workcenterMatches ? 'highlighted-row' : '';
  };

  const columns = [
    {
      title: 'SL NO',
      key: 'index',
      render: (text, record, index) => (currentPage - 1) * pageSize + index + 1,
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
          workcenter={selectedworkcenter}
          userId={userId}
          onBack={handleBackToworkcenters}
          searchText={searchText}
        />
      </div>
    );
  }

  const items = [
    {
      key: 'workcenter',
      label: 'Work Center',
      children: (
        <Card 
          extra={
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <Input.Search
                placeholder="Search work centers & machines..."
                value={searchText}
                onChange={(e) => {
                  setSearchText(e.target.value);
                  setCurrentPage(1);
                }}
                style={{ width: 250 }}
                allowClear
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditingworkcenter(null);
                  setworkcenterModalOpen(true);
                }}
              >
                Add Work Center
              </Button>
            </div>
          }
          variant="borderless"
          className="shadow-sm"
        >
          <Table
            columns={columns}
            dataSource={filteredworkcenters}
            rowKey="id"
            rowClassName={getRowClassName}
            loading={loading}
            pagination={{
              pageSize: pageSize,
              current: currentPage,
              size: "small",
              responsive: true,
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
              showSizeChanger: true,
              showQuickJumper: true,
              onChange: (page, size) => {
                setCurrentPage(page);
                setPageSize(size);
              },
              onShowSizeChange: (current, size) => {
                setCurrentPage(1);
                setPageSize(size);
              },
              pageSizeOptions: ['10', '20', '50', '100'],
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
    {
      key: 'vendors',
      label: 'Vendors',
      children: <VendorsTable userId={userId} />,
    },
    {
      key: 'machine_mhrs',
      label: 'Machine MHRs',
      children: <MachineMHRs userId={userId} />,
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
        .modern-table .ant-table-tbody > tr.highlighted-row > td {
          background-color: #fff7e6 !important;
          border-left: 3px solid #ffe7ba !important;
        }
        .modern-table .ant-table-tbody > tr.highlighted-row:hover > td {
          background-color: #ffe7ba !important;
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
     
      <Tabs 
        defaultActiveKey="workcenter" 
        items={items} 
        className="responsive-tabs"
      />

      <WorkCenterModal
        workcenter={editingworkcenter}
        isOpen={workcenterModalOpen}
        userId={userId}
        onClose={() => setworkcenterModalOpen(false)}
        onSave={() => {
          setworkcenterModalOpen(false);
          fetchworkcenters();
          message.success(
            editingworkcenter 
              ? "Work center updated successfully" 
              : "Work center created successfully"
          );
        }}
      />
    </div>
  );
};

export default Configuration;