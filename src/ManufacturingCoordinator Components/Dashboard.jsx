import React from 'react';
import { Layout, Card, Row, Col, Statistic, Table, Tag } from 'antd';

const { Content } = Layout;

const columns = [
  { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
  { title: 'Operation', dataIndex: 'operation', key: 'operation' },
  { title: 'Work Center', dataIndex: 'work_center', key: 'work_center' },
  {
    title: 'Status',
    dataIndex: 'status',
    key: 'status',
    render: (s) => {
      const color = s === 'Scheduled' ? 'geekblue' : s === 'Released' ? 'green' : 'volcano';
      return <Tag color={color}>{s}</Tag>;
    },
  },
];

const data = [
  { id: 11, operation: 'Milling 10', work_center: 'MC', status: 'Scheduled' },
  { id: 12, operation: 'EDM Wire 20', work_center: 'EDM', status: 'Released' },
  { id: 13, operation: 'Turning 30', work_center: 'Lathe', status: 'Hold' },
];

const Dashboard = () => {
  return (
    <Layout style={{ padding: 16 }}>
      <Content>
        <Row gutter={16}>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic title="Active Orders" value={24} />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic title="Ops Scheduled" value={49} />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic title="Ops on Hold" value={3} />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic title="Work Centers" value={9} />
            </Card>
          </Col>
        </Row>
        <Card style={{ marginTop: 16 }} title="Manufacturing Coordinator Dashboard">
          <Table columns={columns} dataSource={data} pagination={false} rowKey="id" />
        </Card>
      </Content>
    </Layout>
  );
};

export default Dashboard;
