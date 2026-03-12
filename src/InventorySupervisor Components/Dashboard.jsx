import React from 'react';
import { Layout, Card, Row, Col, Statistic, Table, Tag } from 'antd';

const { Content } = Layout;

const columns = [
  { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
  { title: 'Item', dataIndex: 'item', key: 'item' },
  { title: 'Stock', dataIndex: 'stock', key: 'stock' },
  {
    title: 'Status',
    dataIndex: 'status',
    key: 'status',
    render: (s) => {
      const color = s === 'Low' ? 'volcano' : s === 'Adequate' ? 'green' : 'geekblue';
      return <Tag color={color}>{s}</Tag>;
    },
  },
];

const data = [
  { id: 101, item: 'Tool Insert A', stock: 120, status: 'Adequate' },
  { id: 102, item: 'Coolant B', stock: 12, status: 'Low' },
  { id: 103, item: 'Fixture C', stock: 35, status: 'Reorder' },
];

const Dashboard = () => {
  return (
    <Layout style={{ padding: 16 }}>
      <Content>
        <Row gutter={16}>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic title="SKUs" value={156} />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic title="Low Stock" value={7} />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic title="Reorders" value={4} />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card>
              <Statistic title="Transfers Today" value={3} />
            </Card>
          </Col>
        </Row>
        <Card style={{ marginTop: 16 }} title="Inventory Supervisor Dashboard">
          <Table columns={columns} dataSource={data} pagination={false} rowKey="id" />
        </Card>
      </Content>
    </Layout>
  );
};

export default Dashboard;
