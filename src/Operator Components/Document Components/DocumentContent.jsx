import React, { useEffect, useState, useMemo } from 'react';
import { Table, Empty, Typography, Button, Tag, Space, message, Modal, Select } from 'antd';
import { 
  FolderOutlined, 
  FileOutlined, 
  EyeOutlined,
  DownloadOutlined
} from '@ant-design/icons';
import { API_BASE_URL } from "../../Config/auth";

const { Title, Text } = Typography;
const { Option } = Select;

const OperatorDocumentContent = ({ selectedNode }) => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [previewingDocument, setPreviewingDocument] = useState(null);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [selectedVersions, setSelectedVersions] = useState({});

  useEffect(() => {
    if (!selectedNode) {
      setDocuments([]);
      return;
    }
    fetchDocuments();
  }, [selectedNode]);

  const fetchDocuments = async () => {
    if (!selectedNode) return;

    setLoading(true);
    try {
      let url = '';
      if (selectedNode.type === 'common-folder') {
        url = `http://${API_BASE_URL.replace('http://', '').replace('api/v1', '')}common-documents/folders/${selectedNode.folderId}/documents`;
      } else if (selectedNode.type === 'common-root') {
        url = `http://${API_BASE_URL.replace('http://', '').replace('api/v1', '')}common-documents/all/documents`;
      } else if (selectedNode.type === 'machine-folder') {
        url = `http://${API_BASE_URL.replace('http://', '').replace('api/v1', '')}machine-documents/folders/${selectedNode.folderId}/documents`;
      } else if (selectedNode.type === 'machine') {
        url = `http://${API_BASE_URL.replace('http://', '').replace('api/v1', '')}machine-documents/machines/${selectedNode.machineId}/documents`;
      }

      if (!url) {
        setDocuments([]);
        setLoading(false);
        return;
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }
      const data = await response.json();

      const normalizedData = data.map(doc => ({
        ...doc,
        file_name: doc.file_name || doc.document_name,
        version: doc.version,
        url: doc.document_url || doc.url,
        doc_source_type: selectedNode.type,
        general_folder_id: doc.general_folder_id || selectedNode.folderId,
        machine_folder_id: doc.machine_folder_id || selectedNode.folderId,
        versions: doc.versions || []
      }));

      setSelectedVersions({});
      setDocuments(normalizedData);
    } catch (error) {
      message.error('Failed to fetch documents: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const groupedDocuments = useMemo(() => {
    const groups = {};

    documents.forEach(doc => {
      const hasVersionsArray = Array.isArray(doc.versions) && doc.versions.length > 0;

      if (hasVersionsArray) {
        const familyId = doc.parent_id || doc.id;
        const familyKey = `${doc.doc_source_type}-${familyId}`;

        if (!groups[familyKey]) {
          groups[familyKey] = doc.versions.map(version => ({
            ...version,
            file_name: version.file_name || version.document_name,
            version: version.version,
            url: version.document_url || version.url,
            doc_source_type: doc.doc_source_type,
            general_folder_id: doc.general_folder_id,
            machine_folder_id: doc.machine_folder_id
          }));
        }
      } else {
        const familyId = doc.parent_id || doc.id;
        const familyKey = `${doc.doc_source_type}-${familyId}`;

        if (!groups[familyKey]) {
          groups[familyKey] = [];
        }
        groups[familyKey].push(doc);
      }
    });

    return Object.values(groups).map(group => {
      const sortedGroup = [...group].sort((a, b) => {
        const vA = parseFloat(a.version) || 0;
        const vB = parseFloat(b.version) || 0;
        return vB - vA;
      });

      const familyId = sortedGroup[0].parent_id || sortedGroup[0].id;
      const selectedId = selectedVersions[familyId];
      const activeDoc = selectedId ? sortedGroup.find(d => d.id === selectedId) : sortedGroup[0];

      return {
        ...activeDoc,
        allVersions: sortedGroup,
        familyId
      };
    });
  }, [documents, selectedVersions]);

  const handleViewDocument = (document) => {
    setPreviewingDocument(document);
    setPreviewModalVisible(true);
  };

  const handleDownloadDocument = (document) => {
    let downloadUrl = '';
    if (document.doc_source_type === 'common-folder' || document.doc_source_type === 'common-root') {
      downloadUrl = document.url;
    } else if (document.doc_source_type === 'machine-folder' || document.doc_source_type === 'machine') {
      downloadUrl = document.url;
    }

    if (downloadUrl) {
      window.open(downloadUrl, '_blank');
      message.success('Download started');
    } else {
      message.error('Download URL not found');
    }
  };

  const getFileExtension = (path) => {
    if (!path) return '';
    const cleanPath = path.split('?')[0];
    return cleanPath.toLowerCase().split('.').pop();
  };

  const isPreviewable = (document) => {
    const ext = getFileExtension(document.url);
    const previewableTypes = ['pdf', 'jpg', 'jpeg', 'png', 'gif'];
    return previewableTypes.includes(ext);
  };

  const getPreviewContent = (document) => {
    const ext = getFileExtension(document.url);

    if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(ext)) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#f5f5f5' }}>
          <img 
            src={document.url} 
            alt={document.file_name} 
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} 
          />
        </div>
      );
    } else if (ext === 'pdf') {
      return (
        <iframe
          src={`${document.url}#toolbar=0`}
          title={document.file_name}
          width="100%"
          height="100%"
          style={{ border: 'none' }}
        />
      );
    } else {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <Empty description="Preview not available for this file type" />
          <Button 
            type="primary" 
            icon={<DownloadOutlined />} 
            onClick={() => handleDownloadDocument(document)}
          >
            Download to View
          </Button>
        </div>
      );
    }
  };

  if (!selectedNode) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty
          description="Select a folder from the tree to view documents"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </div>
    );
  }

  const isSupportedNodeType = 
    selectedNode.type === 'common-folder' ||
    selectedNode.type === 'common-root' ||
    selectedNode.type === 'machine-folder' ||
    selectedNode.type === 'machine';

  if (!isSupportedNodeType) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty
          description="Select a valid folder to view documents"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </div>
    );
  }

  const getHeaderIcon = () => {
    if (selectedNode.type === 'common-folder' || selectedNode.type === 'common-root') {
      return <FolderOutlined style={{ color: '#eb2f96', fontSize: 20 }} />;
    }
    return <FolderOutlined style={{ color: '#52c41a', fontSize: 20 }} />;
  };

  const getHeaderTitle = () => {
    if (selectedNode.type === 'machine-folder') return `${selectedNode.machineName} - ${selectedNode.folderName}`;
    if (selectedNode.type === 'machine') return `${selectedNode.machineName}`;
    if (selectedNode.type === 'common-folder') return selectedNode.folderName;
    if (selectedNode.type === 'common-root') return 'Common Folders';
    return '';
  };

  const columns = [
    {
      title: 'Sl No',
      key: 'slNo',
      render: (_, record, index) => index + 1,
      width: 60,
    },
    {
      title: 'Document Name',
      dataIndex: 'file_name',
      key: 'file_name',
      render: (text, record) => (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ 
            width: 32, 
            height: 32, 
            backgroundColor: '#e6f7ff', 
            borderRadius: 4, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            marginTop: 2
          }}>
            <FileOutlined style={{ color: '#1890ff', fontSize: 18 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <Text strong style={{ fontSize: 14, color: '#262626' }}>{text}</Text>
            {record.document_type && (
              <Tag
                style={{ 
                  fontSize: 10,
                  margin: 0,
                  width: 'fit-content',
                  padding: '0 4px',
                  backgroundColor: '#f5f5f5',
                  color: '#8c8c8c',
                  border: 'none',
                  lineHeight: '16px',
                  marginTop: 2
                }}
              >
                {record.document_type.toUpperCase()}
              </Tag>
            )}
          </div>
        </div>
      ),
    },
    {
      title: 'Version',
      key: 'version',
      width: 220,
      render: (_, record) => (
        <Select
          size="middle"
          value={record.id}
          onChange={(value) => {
            setSelectedVersions(prev => ({
              ...prev,
              [record.familyId]: value
            }));
          }}
          popupMatchSelectWidth={false}
          bordered
          style={{ 
            width: 180, 
            borderRadius: 6,
            border: '1px solid #d9d9d9'
          }}
        >
          {record.allVersions.map(v => (
            <Option key={v.id} value={v.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <div
                  style={{ 
                    width: 8, 
                    height: 8, 
                    borderRadius: '50%', 
                    backgroundColor: v.id === record.allVersions[0].id ? '#52c41a' : '#d9d9d9' 
                  }}
                />
                <Text strong style={{ color: v.id === record.id ? '#1890ff' : '#595959' }}>
                  v{v.version}
                </Text>
                {v.created_at && (
                  <Text type="secondary" style={{ fontSize: 12, marginLeft: 'auto' }}>
                    {new Date(v.created_at).toLocaleDateString('en-GB')}
                  </Text>
                )}
              </div>
            </Option>
          ))}
        </Select>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 160,
      render: (_, record) => (
        <Space size="small">
          <Button
            type="text"
            size="small"
            icon={<EyeOutlined style={{ color: '#1890ff' }} />}
            onClick={() => {
              if (!isPreviewable(record)) {
                handleDownloadDocument(record);
              } else {
                handleViewDocument(record);
              }
            }}
          />
          <Button
            type="text"
            size="small"
            icon={<DownloadOutlined style={{ color: '#52c41a' }} />}
            onClick={() => handleDownloadDocument(record)}
          />
        </Space>
      ),
    },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 16, borderBottom: '1px solid #f0f0f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {getHeaderIcon()}
            <Title level={4} style={{ margin: 0 }}>
              {getHeaderTitle()}
            </Title>
          </div>
        </div>
        <Text type="secondary">
          {documents.length} document{documents.length !== 1 ? 's' : ''} in this folder
        </Text>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <Table
          columns={columns}
          dataSource={groupedDocuments}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} documents`,
          }}
          size="small"
          locale={{
            emptyText: documents.length === 0 && !loading ? (
              <Empty
                description="No documents in this folder"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            ) : 'No data'
          }}
        />
      </div>

      <Modal
        title={previewingDocument?.file_name}
        open={previewModalVisible}
        onCancel={() => {
          setPreviewModalVisible(false);
          setPreviewingDocument(null);
        }}
        footer={[
          <Button key="download" icon={<DownloadOutlined />} onClick={() => {
            if (previewingDocument) {
              handleDownloadDocument(previewingDocument);
            }
          }}>
            Download
          </Button>,
          <Button key="close" type="primary" onClick={() => {
            setPreviewModalVisible(false);
            setPreviewingDocument(null);
          }}>
            Close
          </Button>
        ]}
        width={1000}
        style={{ top: 20 }}
        bodyStyle={{ height: '80vh', padding: 0 }}
      >
        {previewingDocument ? (
          getPreviewContent(previewingDocument)
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Empty description="No document selected" />
          </div>
        )}
      </Modal>
    </div>
  );
};

export default OperatorDocumentContent;

