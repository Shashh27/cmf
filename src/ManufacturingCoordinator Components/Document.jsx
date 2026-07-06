import React, { useState, useEffect, useRef } from 'react';
import DocumentTree from './Document Components/DocumentTree';
import DocumentContent from './Document Components/DocumentContent';

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
          {/* Tree Content */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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
