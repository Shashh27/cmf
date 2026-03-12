import React from 'react';
import { Layout, Card, Row, Col, Statistic, Table, Tag } from 'antd';

const { Content } = Layout;

const columns = [
  { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
  { title: 'Task', dataIndex: 'task', key: 'task' },
  { title: 'Machine', dataIndex: 'machine', key: 'machine' },
  {
    title: 'Status',
    dataIndex: 'status',
    key: 'status',
    render: (s) => {
      const color = s === 'Completed' ? 'green' : s === 'In Progress' ? 'geekblue' : 'volcano';
      return <Tag color={color}>{s}</Tag>;
    },
  },
];

const data = [
  { id: 1, task: 'Inspect Operation 101', machine: 'DMU-60T', status: 'In Progress' },
  { id: 2, task: 'Approve PO ISP20222025-2', machine: 'Makino', status: 'Pending' },
  { id: 3, task: 'Verify Setup Sheet', machine: 'VCP800W Duro', status: 'Completed' },
];

const Dashboard = () => {
  return (
    <Layout style={{ padding: 16 }}>
      <Content>
        <Row gutter={16}>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic title="Open Tasks" value={8} />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic title="Machines Active" value={5} />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic title="Orders Pending" value={12} />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic title="Alerts" value={2} />
            </Card>
          </Col>
        </Row>
        <Card style={{ marginTop: 16 }} title="Supervisor Dashboard">
          <Table columns={columns} dataSource={data} pagination={false} rowKey="id" />
        </Card>
      </Content>
    </Layout>
  );
};

export default Dashboard;
