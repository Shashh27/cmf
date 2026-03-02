import React, { useState, useEffect } from 'react';
import { Layout, Typography, Card } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import OperatorDocumentTree from './Document Components/DocumentTree';
import OperatorDocumentContent from './Document Components/DocumentContent';

const { Sider, Content } = Layout;
const { Title, Text } = Typography;

const Documents = () => {
  const [selectedNode, setSelectedNode] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleNodeSelect = (nodeData) => {
    setSelectedNode(nodeData);
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ 
        padding: isMobile ? '8px 16px' : '16px 16px 0 16px'
      }}>
        <Card 
          bordered={false} 
          style={{ 
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
            marginBottom: '16px'
          }}
          bodyStyle={{ padding: '16px 24px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <FileTextOutlined style={{ fontSize: '28px', color: '#1890ff' }} />
            <div>
              <Title level={3} style={{ margin: 0, fontSize: '22px', fontWeight: 600, color: '#1a1a1a' }}>
                Documents
              </Title>
              <Text type="secondary" style={{ fontSize: '14px', marginTop: '2px', display: 'block' }}>
                View and download machine and common documents for your operations
              </Text>
            </div>
          </div>
        </Card>
      </div>

      <div style={{ 
        height: isMobile ? 'auto' : 'calc(100vh - 180px)', 
        display: 'flex', 
        gap: isMobile ? '8px' : '16px',
        padding: isMobile ? '8px' : '0 16px 16px 16px',
        flexDirection: isMobile ? 'column' : 'row'
      }}>
        <div 
          style={{ 
            flex: isMobile ? '0 0 100%' : '0 0 32%',
            minWidth: isMobile ? 'unset' : 280,
            maxWidth: isMobile ? '100%' : 480,
            height: isMobile ? 'calc(100vh - 200px)' : '100%', 
            background: '#fff', 
            overflow: 'visible',
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <div style={{ 
            padding: '12px 16px', 
            borderBottom: '1px solid #f0f0f0',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            backgroundColor: '#fafafa'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Title level={5} style={{ margin: 0, color: '#262626' }}>Folders and Documents</Title>
            </div>
          </div>

          <div style={{ flex: 1, overflow: 'auto' }}>
            <OperatorDocumentTree onNodeSelect={handleNodeSelect} />
          </div>
        </div>

        <div style={{ 
          flex: 1, 
          overflow: 'hidden',
          background: '#fff',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          minWidth: 0
        }}>
          <OperatorDocumentContent selectedNode={selectedNode} />
        </div>
      </div>
    </div>
  );
};

export default Documents;
