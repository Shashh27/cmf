import React, { useState, useEffect } from "react";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth.js";
import { Table, Tabs, Button, Tag, message, Popconfirm, Tooltip, Space, Card, Input } from "antd";
import { EditOutlined, DeleteOutlined, PlusOutlined, EyeOutlined } from "@ant-design/icons";
import WorkCenterModal from "../Configuration Components/WorkCenterModal";
import Machines from "../Configuration Components/Machines";
import CustomersTable from "../Configuration Components/CustomersTable";
import VendorsTable from "../Configuration Components/VendorsTable";

const Configuration = () => {
  const [workCenters, setWorkCenters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workCenterModalOpen, setWorkCenterModalOpen] = useState(false);
  const [editingWorkCenter, setEditingWorkCenter] = useState(null);
  const [selectedWorkCenter, setSelectedWorkCenter] = useState(null);
  const [showMachines, setShowMachines] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [workCenterMachines, setWorkCenterMachines] = useState({});
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

  const fetchMachinesForAllWorkCenters = async () => {
    try {
      const machinePromises = workCenters.map(async (workCenter) => {
        try {
          const response = await axios.get(`${API_BASE_URL}/machines/work-center/${workCenter.id}`, {
            params: userId != null ? { user_id: userId } : undefined,
          });
          return { workCenterId: workCenter.id, machines: response.data };
        } catch (error) {
          console.error(`Error fetching machines for work center ${workCenter.id}:`, error);
          return { workCenterId: workCenter.id, machines: [] };
        }
      });

      const results = await Promise.all(machinePromises);
      const machinesMap = {};
      results.forEach(({ workCenterId, machines }) => {
        machinesMap[workCenterId] = machines;
      });
      setWorkCenterMachines(machinesMap);
    } catch (error) {
      console.error("Error fetching machines for work centers:", error);
    }
  };

  useEffect(() => {
    if (searchText && workCenters.length > 0 && Object.keys(workCenterMachines).length === 0) {
      fetchMachinesForAllWorkCenters();
    }
  }, [searchText, workCenters.length]);

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

  const filteredWorkCenters = workCenters.filter(workCenter => {
    const searchLower = searchText.toLowerCase();
    const machines = workCenterMachines[workCenter.id] || [];
    
    return (
      workCenter.code?.toLowerCase().includes(searchLower) ||
      workCenter.work_center_name?.toLowerCase().includes(searchLower) ||
      workCenter.description?.toLowerCase().includes(searchLower) ||
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
    const machines = workCenterMachines[record.id] || [];
    
    const workCenterMatches = 
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
    
    return machineMatches && !workCenterMatches ? 'highlighted-row' : '';
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
          workCenter={selectedWorkCenter}
          userId={userId}
          onBack={handleBackToWorkCenters}
          searchText={searchText}
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
                  setEditingWorkCenter(null);
                  setWorkCenterModalOpen(true);
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
            dataSource={filteredWorkCenters}
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