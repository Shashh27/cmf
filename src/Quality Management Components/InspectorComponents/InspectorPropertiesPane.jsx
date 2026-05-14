import React from 'react';
import { Space, Typography, Tag, Row, Col, Divider, Card } from 'antd';
import { InfoCircleOutlined, ControlOutlined, DatabaseOutlined, HistoryOutlined, DashboardOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

const InspectorPropertiesPane = ({ selectedItem }) => {
  if (!selectedItem) {
    return (
      <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', color: '#8c8c8c' }}>
        <Space direction="vertical" align="center">
          <InfoCircleOutlined style={{ fontSize: '24px' }} />
          <Text type="secondary">Select a characteristic to view properties</Text>
        </Space>
      </div>
    );
  }

  const { id = 11, zone = 'E2', nominal = '4.50', tolPlus = '+0.10', tolMinus = '-0.00', dimType = 'DIM', instrument = 'Depth Micrometer' } = selectedItem;

  return (
    <div style={{ height: '300px', padding: '16px', background: '#fff', borderTop: '1px solid #f0f0f0', overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <Space>
           <ControlOutlined style={{ color: '#1890ff' }} />
           <Text strong style={{ fontSize: '12px', textTransform: 'uppercase' }}>Properties</Text>
        </Space>
        <Text type="secondary" style={{ fontSize: '10px' }}>ID: {id} | {zone}</Text>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '20px' }}>
        <div style={{ background: '#111827', color: '#fff', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', fontWeight: 'bold' }}>{id}</div>
        <div style={{ background: '#f5f5f5', padding: '4px 12px', borderRadius: '4px', fontWeight: 'bold', minWidth: '40px', textAlign: 'center' }}>{zone}</div>
        <Title level={4} style={{ margin: 0, color: '#ff4d4f', textTransform: 'uppercase', fontSize: '18px', letterSpacing: '1px' }}>Keyway Depth</Title>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#1890ff' }}></div>
          <Text strong style={{ fontSize: '12px', color: '#1890ff' }}>{dimType}</Text>
        </div>
      </div>

      <Row gutter={[24, 16]}>
        <Col span={10}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px' }}>
            <span style={{ fontSize: '64px', fontWeight: 900, lineHeight: 1 }}>{nominal}</span>
            <Text type="secondary" style={{ fontSize: '14px', marginBottom: '12px', fontWeight: 600 }}>MM</Text>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '8px' }}>
              <Text strong style={{ fontSize: '24px', color: '#52c41a', lineHeight: 1 }}>{tolPlus}</Text>
              <Text strong style={{ fontSize: '24px', color: '#ff4d4f', lineHeight: 1 }}>{tolMinus}</Text>
            </div>
          </div>
        </Col>

        <Col span={14}>
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <div style={{ marginBottom: '12px' }}>
                 <Text type="secondary" style={{ fontSize: '10px', textTransform: 'uppercase', display: 'block' }}>Instrument</Text>
                 <Title level={5} style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>{instrument}</Title>
              </div>
              <div>
                 <Text type="secondary" style={{ fontSize: '10px', textTransform: 'uppercase', display: 'block' }}>Method</Text>
                 <Text strong style={{ fontSize: '13px' }}>Direct</Text>
              </div>
            </Col>
            
            <Col span={12} style={{ borderLeft: '1px solid #f0f0f0', paddingLeft: '24px' }}>
               <div style={{ marginBottom: '12px' }}>
                 <Text type="secondary" style={{ fontSize: '10px', textTransform: 'uppercase', display: 'block' }}>Sample</Text>
                 <Text strong style={{ fontSize: '14px', color: '#111827' }}>5 / Lot</Text>
               </div>
               <div>
                  <Text type="secondary" style={{ fontSize: '10px', textTransform: 'uppercase', display: 'block' }}>FREQ</Text>
                  <Text strong style={{ fontSize: '14px', color: '#111827' }}>100%</Text>
               </div>
            </Col>
          </Row>
        </Col>
      </Row>
    </div>
  );
};

export default InspectorPropertiesPane;
