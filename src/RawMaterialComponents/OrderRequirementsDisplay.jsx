import React, { useEffect, useState } from 'react';
import { 
  Card, Table, Tag, Typography, Button, Space, Modal, Image
} from 'antd';
import { 
  DownloadOutlined,
  EyeOutlined,
  FileTextOutlined
} from '@ant-design/icons';

const { Title, Text } = Typography;

const OrderRequirementsDisplay = ({ selectedOrder, visible, orderHierarchy, selectedPart, onDocumentPreview, onExternalDocumentPreview, externalDocument }) => {
  const [previewModal, setPreviewModal] = useState({ visible: false, document: null });
  const [internalExternalDocument, setInternalExternalDocument] = useState(null);
  
  useEffect(() => {
    // Component will re-render when orderHierarchy changes
  }, [orderHierarchy]);

  useEffect(() => {
    // Update internal external document when prop changes
    if (externalDocument !== undefined) {
      setInternalExternalDocument(externalDocument);
    }
  }, [externalDocument]);

  const getAllParts = (hierarchy) => {
    const parts = [];
    
    if (!selectedPart) {
      return parts;
    }
    
    // Process direct parts (if any)
    if (hierarchy?.direct_parts) {
      hierarchy.direct_parts.forEach(partDetail => {
        if (partDetail.part.id === selectedPart.part.id) {
          // Filter only 2D documents
          const documents2D = (partDetail.documents || []).filter(doc => 
            doc.document_type?.toLowerCase() === '2d'
          );
          
          parts.push({
            ...partDetail.part,
            path: 'Direct Parts',
            documents: documents2D, // Only 2D documents
            extracted_data: partDetail.extracted_data || []
          });
        }
      });
    }
    
    // Process assembly parts
    if (hierarchy?.assemblies) {
      hierarchy.assemblies.forEach(assembly => {
        const processAssembly = (assy, path = []) => {
          const currentPath = [...path, assy.assembly.assembly_name];
          
          if (assy.parts && assy.parts.length > 0) {
            assy.parts.forEach(partDetail => {
              if (partDetail.part.id === selectedPart.part.id) {
                // Filter only 2D documents
                const documents2D = (partDetail.documents || []).filter(doc => 
                  doc.document_type?.toLowerCase() === '2d'
                );
                
                parts.push({
                  ...partDetail.part,
                  path: currentPath.join(' > '),
                  documents: documents2D, // Only 2D documents
                  extracted_data: partDetail.extracted_data || []
                });
              }
            });
          }
          
          if (assy.subassemblies && assy.subassemblies.length > 0) {
            assy.subassemblies.forEach(sub => processAssembly(sub, currentPath));
          }
        };
        
        processAssembly(assembly, assembly.assembly.assembly_name);
      });
    }
    
    return parts;
  };

  const handleDocumentPreview = (document) => {
    if (onDocumentPreview) {
      onDocumentPreview(document);
    } else {
      setPreviewModal({ visible: true, document });
    }
  };

  const handleExternalDocumentPreview = (document) => {
    if (onExternalDocumentPreview) {
      onExternalDocumentPreview(document);
    } else {
      setInternalExternalDocument(document);
    }
  };

  const closePreview = () => {
    setPreviewModal({ visible: false, document: null });
  };

  const closeExternalPreview = () => {
    setInternalExternalDocument(null);
    // Also clear parent's external document
    if (onExternalDocumentPreview) {
      onExternalDocumentPreview(null);
    }
  };

  // Helper function to get latest extracted data
  const getLatestExtractedData = (extractedDataArray) => {
    if (!extractedDataArray || !Array.isArray(extractedDataArray) || extractedDataArray.length === 0) {
      return null;
    }
    const sorted = [...extractedDataArray].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return sorted[0];
  };

  // Helper function to get latest document
  const getLatestDocument = (documents) => {
    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return null;
    }
    const sorted = [...documents].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return sorted[0];
  };

  const columns = [
    {
      title: 'Extracted Data',
      dataIndex: 'extracted_data',
      key: 'extracted_data',
      width: '40%',
      ellipsis: false,
      render: (extracted_data) => {
        const data = getLatestExtractedData(extracted_data);
        if (!data) {
          return <Text type="secondary" style={{ fontSize: '12px' }}>No extracted data</Text>;
        }
        return (
          <div style={{ fontSize: '12px', lineHeight: '1.5' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: data.note ? '6px' : '0' }}>
              {data.material && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Text strong style={{ color: '#1890ff', fontSize: '12px' }}>Material:</Text>
                  <Text style={{ fontSize: '12px' }}>{data.material}</Text>
                </div>
              )}
              {data.stock_size && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Text strong style={{ color: '#1890ff', fontSize: '12px' }}>Stock Size:</Text>
                  <Text style={{ fontSize: '12px' }}>{data.stock_size}</Text>
                </div>
              )}
            </div>
            {data.note && (
              <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-start' }}>
                <Text strong style={{ color: '#1890ff', fontSize: '12px', whiteSpace: 'nowrap' }}>Notes:</Text>
                <Text style={{ fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{data.note}</Text>
              </div>
            )}
          </div>
        );
      }
    },
    {
      title: 'Document Name',
      dataIndex: 'documents',
      key: 'documents',
      width: '30%',
      ellipsis: true,
      render: (documents) => {
        const latestDoc = getLatestDocument(documents);
        if (!latestDoc) {
          return <Text type="secondary" style={{ fontSize: '12px' }}>No documents</Text>;
        }
        return (
          <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
            <div style={{ marginBottom: '4px', padding: '2px 4px', backgroundColor: '#f0f0f0', borderRadius: '2px' }}>
              <Text ellipsis={{ tooltip: latestDoc.document_name }}>{latestDoc.document_name}</Text>
            </div>
          </div>
        );
      }
    },
    {
      title: 'Revision',
      dataIndex: 'documents',
      key: 'revision',
      width: '15%',
      render: (documents) => {
        const latestDoc = getLatestDocument(documents);
        if (!latestDoc) {
          return <Text type="secondary" style={{ fontSize: '12px' }}>N/A</Text>;
        }
        return (
          <Tag color="blue" style={{ fontSize: '11px' }}>
            {latestDoc.document_version || 'N/A'}
          </Tag>
        );
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      width: '15%',
      render: (_, record) => {
        const latestDoc = getLatestDocument(record.documents);
        if (!latestDoc) {
          return <Text type="secondary" style={{ fontSize: '11px' }}>No docs</Text>;
        }
        return (
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleDocumentPreview(latestDoc)}
            style={{ fontSize: '10px', height: '24px', padding: '0 6px' }}
            title={`Preview: ${latestDoc.document_name}`}
          >
            Preview
          </Button>
        );
      }
    }
  ];

  if (!visible || !orderHierarchy) {
    return null;
  }

  const parts = getAllParts(orderHierarchy);
  
  // Use external document from props if provided, otherwise use internal state
  const currentExternalDocument = externalDocument || internalExternalDocument;

  return (
    <div style={{ width: '100%' }}>
        <Table
          columns={columns}
          dataSource={parts}
          rowKey="id"
          pagination={false}
          size="small"
          scroll={undefined}
        />

      {/* Document Preview Modal */}
      <Modal
        title={
          <Space>
            <FileTextOutlined />
            <span>Document Preview: {previewModal.document?.document_name}</span>
          </Space>
        }
        open={previewModal.visible}
        onCancel={closePreview}
        width="90%"
        style={{ top: 10 }}
        footer={[
          <Button key="close" onClick={closePreview}>
            Close
          </Button>
        ]}
      >
        {previewModal.document && (
          <div>
            <div style={{ marginBottom: '16px' }}>
              <Text strong>Type: </Text>
              <Tag color="blue">{previewModal.document?.document_type}</Tag>
              <Text strong style={{ marginLeft: '16px' }}>Version: </Text>
              <Tag>{previewModal.document?.document_version}</Tag>
            </div>
            
            {/* Show document preview */}
            {previewModal.document.document_name?.match(/\.(jpg|jpeg|png|gif|bmp)$/i) ? (
              // Image files
              <div style={{ textAlign: 'center' }}>
                <Image
                  src={previewModal.document.document_url}
                  alt={previewModal.document.document_name}
                  style={{ maxWidth: '100%', maxHeight: '65vh' }}
                />
              </div>
            ) : previewModal.document.document_name?.match(/\.pdf$/i) ? (
              // PDF files - show iframe
              <div style={{ height: '75vh' }}>
                <iframe
                  src={previewModal.document.document_url}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  title={previewModal.document.document_name}
                />
              </div>
            ) : (
              // Other files - try to show in iframe or provide download
              <div style={{ height: '75vh' }}>
                <iframe
                  src={previewModal.document.document_url}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  title={previewModal.document.document_name}
                />
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* External Document Preview Modal */}
      <Modal
        title={
          <Space>
            <FileTextOutlined />
            <span>Document Preview: {currentExternalDocument?.document_name}</span>
          </Space>
        }
        open={!!currentExternalDocument}
        onCancel={closeExternalPreview}
        width="90%"
        style={{ top: 10 }}
        footer={[
          <Button key="close" onClick={closeExternalPreview}>
            Close
          </Button>
        ]}
      >
        {currentExternalDocument && (
          <div>
            <div style={{ marginBottom: '16px' }}>
              <Text strong>Type: </Text>
              <Tag color="blue">{currentExternalDocument?.document_type}</Tag>
              <Text strong style={{ marginLeft: '16px' }}>Version: </Text>
              <Tag>{currentExternalDocument?.document_version}</Tag>
            </div>
            
            {/* Show document preview */}
            {currentExternalDocument.document_name?.match(/\.(jpg|jpeg|png|gif|bmp)$/i) ? (
              // Image files
              <div style={{ textAlign: 'center' }}>
                <Image
                  src={currentExternalDocument.document_url}
                  alt={currentExternalDocument.document_name}
                  style={{ maxWidth: '100%', maxHeight: '65vh' }}
                />
              </div>
            ) : currentExternalDocument.document_name?.match(/\.pdf$/i) ? (
              // PDF files - show iframe
              <div style={{ height: '75vh' }}>
                <iframe
                  src={currentExternalDocument.document_url}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  title={currentExternalDocument.document_name}
                />
              </div>
            ) : (
              // Other files - try to show in iframe or provide download
              <div style={{ height: '75vh' }}>
                <iframe
                  src={currentExternalDocument.document_url}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  title={currentExternalDocument.document_name}
                />
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default OrderRequirementsDisplay;
