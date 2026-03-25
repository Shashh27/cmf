import React, { useState, useEffect, useRef } from 'react';
import { Layout, Typography, Button, Card } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import Lottie from 'lottie-react';
import documentIcon from '../assets/DocumentIcon.json';
import DocumentTree from '../Document Components/DocumentTree';
import DocumentContent from '../Document Components/DocumentContent';

const { Sider, Content } = Layout;
const { Title, Text } = Typography;

const Document = () => {
  const [selectedNode, setSelectedNode] = useState(null);
    const [documentsRefreshKey, setDocumentsRefreshKey] = useState(0);
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

  // Callback to refresh the document tree when documents change
  const handleDocumentsChange = () => {
    if (documentTreeRef.current && typeof documentTreeRef.current.refreshTree === 'function') {
      documentTreeRef.current.refreshTree();
    }
    setDocumentsRefreshKey(prev => prev + 1);
  };

  return (
    <div style={{ 
      height: isMobile ? 'auto' : 'calc(100vh - 100px)', 
      display: 'flex', 
      flexDirection: 'column', 
      overflow: 'hidden' 
    }}>
      {/* Main Content */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          gap: isMobile ? '8px' : '12px',
          padding: isMobile ? '8px' : '12px',
          flexDirection: isMobile ? 'column' : 'row',
          overflow: 'hidden',
          minHeight: 0 // Crucial for nested flex scrolling
        }}
      >
        {/* Left Panel - Document Tree */}
        <div
          style={{
            flex: isMobile ? '0 0 100%' : '0 0 32%',
            minWidth: isMobile ? 'unset' : 280,
            maxWidth: isMobile ? '100%' : 420,
            background: '#fff',
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
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
              onDocumentsChange={handleDocumentsChange}
            />
          </div>
        </div>

        {/* Right Panel - Document Content */}
        <div
          style={{
            flex: 1,
            overflow: 'hidden',
            background: '#fff',
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            minWidth: 0
          }}
        >
          <DocumentContent 
            selectedNode={selectedNode} 
            onDocumentsChange={handleDocumentsChange}
            documentTreeRef={documentTreeRef}
            documentsRefreshKey={documentsRefreshKey}
          />
        </div>
      </div>
    </div>
  );
};

export default Document;
