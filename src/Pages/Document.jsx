import React, { useState, useEffect, useRef } from 'react';
import { Layout, Typography, Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import DocumentTree from '../Document Components/DocumentTree';
import DocumentContent from '../Document Components/DocumentContent';

const { Sider, Content } = Layout;
const { Title } = Typography;

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
        padding: isMobile ? '12px 16px' : '16px 24px'
      }}>
        <Title level={isMobile ? 4 : 3} style={{ margin: 0, color: '#000' }}>
          Document Management
        </Title>
      </div>

      {/* Main Content - No background, just padding */}
      <div style={{ 
        flex: 1, 
        display: 'flex', 
        gap: isMobile ? '8px' : '16px',
        padding: isMobile ? '8px' : '16px',
        flexDirection: isMobile ? 'column' : 'row'
      }}>
        {/* Left Panel - Document Tree */}
        <div 
          style={{ 
            width: isMobile ? '100%' : '350px',
            minWidth: isMobile ? 'unset' : '280px',
            maxWidth: isMobile ? '100%' : '400px',
            height: isMobile ? '250px' : 'auto',
            background: '#fff', 
            overflow: 'hidden',
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Tree Header with New Folder Button */}
          <div style={{ 
            padding: '12px 16px', 
            borderBottom: '1px solid #f0f0f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#fafafa'
          }}>
            <span style={{ 
              fontWeight: 600, 
              fontSize: '14px', 
              color: '#262626' 
            }}>
              Folders & Documents
            </span>
            <Button 
              type="primary" 
              size="small"
              icon={<PlusOutlined />}
              onClick={() => {
                if (documentTreeRef.current) {
                  documentTreeRef.current.openNewFolderModal();
                }
              }}
              style={{ 
                fontSize: '12px',
                height: '28px'
              }}
            >
              New Folder
            </Button>
          </div>
          
          {/* Tree Content */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
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