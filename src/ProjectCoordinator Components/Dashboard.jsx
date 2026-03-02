import React from 'react';
import { Card, Row, Col, Statistic, Typography } from 'antd';
import { ProjectOutlined, ScheduleOutlined, TeamOutlined } from '@ant-design/icons';

const { Title } = Typography;

const Dashboard = () => {
  return (
    <div style={{ padding: '24px' }}>
      <Title level={2}>Project Coordinator Dashboard</Title>
      <Row gutter={16} style={{ marginTop: '24px' }}>
        <Col span={8}>
          <Card>
            <Statistic
              title="Active Projects"
              value={12}
              prefix={<ProjectOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Pending Tasks"
              value={5}
              prefix={<ScheduleOutlined />}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Team Members"
              value={8}
              prefix={<TeamOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
      </Row>
      <div style={{ marginTop: '24px', background: '#fff', padding: '24px', borderRadius: '8px' }}>
        <Title level={4}>Project Overview</Title>
        <p>Welcome to the Project Coordinator Dashboard. Here you can manage projects and tasks.</p>
      </div>
    </div>
  );
};

export default Dashboard;
