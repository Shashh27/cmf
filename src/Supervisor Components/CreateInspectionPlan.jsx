import React, { useState, useEffect } from 'react';
import { Table, Card, Typography, Button, Space, Input, Tag, message } from 'antd';
import { SearchOutlined, BuildOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { QUALITY_API_BASE_URL } from '../Config/qualityconfig';

const { Title, Text } = Typography;

const CreateInspectionPlan = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchActiveProjects();
  }, []);

  const fetchActiveProjects = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${QUALITY_API_BASE_URL}/scheduling/orders-parts-status`);
      const allEntries = response.data.orders || [];
      const activeEntries = allEntries.filter((entry) => entry.status === 'active');

      const projectsMap = {};
      activeEntries.forEach((entry) => {
        if (!projectsMap[entry.sale_order_id]) {
          projectsMap[entry.sale_order_id] = {
            key: entry.sale_order_id,
            projectNumber: entry.sale_order_number,
            projectName: entry.product_name,
            productId: entry.product_id,
            saleOrderId: entry.sale_order_id,
            mfgCoordinator: entry.mc || '-',
            qty: '-',
            customer: '-',
            projectCoordinator: '-',
            orderDate: '-',
            dueDate: '-',
          };
        }
      });

      try {
        const ordersRes = await axios.get(`${QUALITY_API_BASE_URL}/orders/`);
        const allOrders = ordersRes.data || [];
        allOrders.forEach((order) => {
          if (projectsMap[order.id]) {
            projectsMap[order.id].qty = order.quantity;
            projectsMap[order.id].customer = order.company_name;
            projectsMap[order.id].projectCoordinator = order.project_coordinator_name;
            projectsMap[order.id].orderDate = order.order_date;
            projectsMap[order.id].dueDate = order.due_date;
          }
        });
      } catch (enrichError) {
        console.error('Failed to enrich projects with full order details:', enrichError);
      }

      setData(Object.values(projectsMap));
    } catch (error) {
      console.error('Error fetching active projects:', error);
      message.error('Failed to load active projects');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePlan = (record) => {
    navigate(
      `/supervisor/quality-management?productId=${record.productId}&orderId=${record.saleOrderId}`,
    );
  };

  const columns = [
    {
      title: 'SL NO',
      key: 'sl_no',
      render: (_, __, index) => index + 1,
      width: 70,
    },
    {
      title: 'Project Number',
      dataIndex: 'projectNumber',
      key: 'projectNumber',
      render: (text) => <Text strong>{text}</Text>,
    },
    {
      title: 'Project Name',
      dataIndex: 'projectName',
      key: 'projectName',
      render: (text, record) => (
        <Button
          type="link"
          onClick={() => handleCreatePlan(record)}
          style={{ padding: 0, height: 'auto', textAlign: 'left' }}
        >
          {text}
        </Button>
      ),
    },
    {
      title: 'Qty',
      dataIndex: 'qty',
      key: 'qty',
      align: 'center',
    },
    {
      title: 'Customer',
      dataIndex: 'customer',
      key: 'customer',
    },
    {
      title: 'Order Date',
      dataIndex: 'orderDate',
      key: 'orderDate',
      render: (date) => (date && date !== '-' ? new Date(date).toLocaleDateString() : '-'),
    },
    {
      title: 'Due Date',
      dataIndex: 'dueDate',
      key: 'dueDate',
      render: (date) => (date && date !== '-' ? new Date(date).toLocaleDateString() : '-'),
    },
    {
      title: 'Project Coordinator',
      dataIndex: 'projectCoordinator',
      key: 'projectCoordinator',
    },
    {
      title: 'Mfg Coordinator',
      dataIndex: 'mfgCoordinator',
      key: 'mfgCoordinator',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Button
          type="primary"
          size="small"
          icon={<BuildOutlined />}
          onClick={() => handleCreatePlan(record)}
          style={{ borderRadius: '4px' }}
        >
          Create Plan
        </Button>
      ),
    },
  ];

  const filteredData = data.filter((item) => {
    const q = searchTerm.toLowerCase();
    return (
      (item.projectNumber || '').toLowerCase().includes(q) ||
      (item.projectName || '').toLowerCase().includes(q) ||
      (item.customer || '').toLowerCase().includes(q)
    );
  });

  return (
    <div style={{ padding: '24px', background: '#f0f2f5', minHeight: 'calc(100vh - 120px)' }}>
      <Card
        title={
          <Space>
            <BuildOutlined style={{ color: '#1890ff' }} />
            <Title level={4} style={{ margin: 0 }}>
              Create Inspection Plan
            </Title>
          </Space>
        }
        extra={
          <Input
            placeholder="Search projects by number, name or customer..."
            prefix={<SearchOutlined />}
            style={{ width: 350 }}
            allowClear
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        }
        style={{ borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          Active projects (scheduled status <Tag color="processing">active</Tag>). Open a project to build the
          inspection plan in the bill of materials view.
        </Text>
        <Table
          dataSource={filteredData}
          columns={columns}
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `Total ${total} projects`,
          }}
          rowClassName="project-row"
          style={{ cursor: 'default' }}
        />
      </Card>
    </div>
  );
};

export default CreateInspectionPlan;
