import React, { useState, useEffect, useRef } from 'react';
import { Layout, Typography, Button, Card } from 'antd';
import { PlusOutlined, FileTextOutlined } from '@ant-design/icons';
import DocumentTree from '../Document Components/DocumentTree';
import DocumentContent from '../Document Components/DocumentContent';

const { Sider, Content } = Layout;
const { Title, Text } = Typography;

const Document = () => {
  const [selectedNode, setSelectedNode] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const documentTreeRef = useRef(null);

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
      {/* Header */}
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
                Document Management
              </Title>
              <Text type="secondary" style={{ fontSize: '14px', marginTop: '2px', display: 'block' }}>
                Organize, manage, and track all your technical documents and order files in one place
              </Text>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Content - No background, just padding */}
      <div style={{ 
        height: isMobile ? 'auto' : 'calc(100vh - 180px)', 
        display: 'flex', 
        gap: isMobile ? '8px' : '16px',
        padding: isMobile ? '8px' : '0 16px 16px 16px',
        flexDirection: isMobile ? 'column' : 'row'
      }}>
        {/* Left Panel - Document Tree */}
        <div 
          style={{ 
            width: isMobile ? '100%' : '350px',
            minWidth: isMobile ? 'unset' : '280px',
            maxWidth: isMobile ? '100%' : '400px',
            height: isMobile ? 'calc(100vh - 200px)' : '100%', 
            background: '#fff', 
            overflow: 'visible', // Allow content to flow and scroll
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Tree Header with Search Bar and New Folder Button */}
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
              <Button 
                type="primary" 
                size="middle"
                icon={<PlusOutlined />}
                onClick={() => {
                  if (documentTreeRef.current) {
                    documentTreeRef.current.openNewFolderModal();
                  }
                }}
                style={{ 
                  fontSize: '12px',
                  height: '32px'
                }}
              >
                New Folder
              </Button>
            </div>
          </div>
          
          {/* Tree Content */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            <DocumentTree 
              ref={documentTreeRef}
              onNodeSelect={handleNodeSelect} 
              isMobile={isMobile} 
            />
          </div>
        </div>

        {/* Right Panel - Document Content */}
        <div style={{ 
          flex: 1, 
          overflow: 'hidden',
          background: '#fff',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          minWidth: 0
        }}>
          <DocumentContent selectedNode={selectedNode} />
        </div>
      </div>
    </div>
  );
};

export default Document;