import React, { useState, useEffect, useRef, useMemo } from "react";
import { useParams } from "react-router-dom";
import { Button, Typography, Table, Space, message, Tag, Card, Tooltip, Badge, Modal, Spin, Select } from "antd";
import { 
  CaretDownOutlined, 
  CaretRightOutlined, 
  ArrowLeftOutlined, 
  AppstoreOutlined, 
  BlockOutlined, 
  CodeSandboxOutlined,
  CodepenOutlined,
  EyeOutlined,
  DownloadOutlined,
  FileTextOutlined,
  ToolOutlined,
  ClockCircleOutlined,
  EnvironmentOutlined,
  InfoCircleOutlined,
  CloseOutlined
} from "@ant-design/icons";
import axios from "axios";
import { API_BASE_URL } from "../../Config/auth";

const { Title, Text } = Typography;

const OperationDocumentsList = ({ operationId, onPreview }) => {
    const [docs, setDocs] = useState([]);
    const [loading, setLoading] = useState(false);
    
    useEffect(() => {
        let isMounted = true;
        const controller = new AbortController();
        
        // Debounce the fetch to prevent double-calls in StrictMode
        const timer = setTimeout(() => {
            if (operationId) {
                fetchDocs(controller.signal, isMounted);
            }
        }, 100);

        return () => {
            isMounted = false;
            clearTimeout(timer);
            controller.abort();
        };
    }, [operationId]);

    const fetchDocs = async (signal, isMounted) => {
        if (!isMounted) return;
        setLoading(true);
        try {
            const response = await axios.get(
                `${API_BASE_URL}/operation-documents/operation/${operationId}`,
                { signal }
            );
            if (isMounted) setDocs(response.data);
        } catch (error) {
            if (error.name !== 'CanceledError' && error.name !== 'AbortError') {
                console.error("Error fetching operation documents:", error);
            }
        } finally {
            if (isMounted && !signal?.aborted) {
                setLoading(false);
            }
        }
    };

    const columns = [
        {
            title: 'Type',
            dataIndex: 'document_type',
            key: 'document_type',
            width: 120,
            render: (text) => (
                <Tag color="blue" className="mr-0">
                    {text || 'DOC'}
                </Tag>
            )
        },
        {
            title: 'Document Name',
            dataIndex: 'document_name',
            key: 'document_name',
            render: (text) => <span className="font-medium text-gray-800">{text}</span>
        },
        {
            title: 'Version',
            dataIndex: 'document_version',
            key: 'document_version',
            width: 100,
            render: (text) => <span className="text-gray-500 text-xs">{text?.startsWith('v') ? text : `v${text || '1.0'}`}</span>
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 100,
            align: 'center',
            render: (_, doc) => (
                <div className="flex gap-2 justify-center">
                    <Tooltip title="Preview">
                        <Button 
                            size="small" 
                            type="text" 
                            className="text-blue-500 hover:bg-blue-50"
                            icon={<EyeOutlined />} 
                            onClick={() => onPreview(doc)} 
                        />
                    </Tooltip>
                    <Tooltip title="Download">
                        <Button 
                            size="small" 
                            type="text" 
                            className="text-green-500 hover:bg-green-50"
                            icon={<DownloadOutlined />} 
                            onClick={() => {
                                const downloadUrl = `${API_BASE_URL}/operation-documents/${doc.id}/download`;
                                const link = document.createElement('a');
                                link.href = downloadUrl;
                                link.setAttribute('download', doc.document_name);
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                            }} 
                        />
                    </Tooltip>
                </div>
            )
        }
    ];

    if (loading) return <div className="p-4 flex justify-center"><Spin size="small" /></div>;
    
    if (!docs || docs.length === 0) return (
        <div className="p-6 text-center border border-dashed border-gray-300 rounded-lg bg-gray-50">
            <FileTextOutlined className="text-2xl text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">No documents attached to this operation</p>
        </div>
    );

    return (
        <Table 
            dataSource={docs} 
            columns={columns} 
            rowKey="id" 
            pagination={false} 
            size="small" 
            bordered
            className="bg-white"
        />
    );
};

const ProductBOMView = ({ onBackToOrders }) => {
  const { productId } = useParams();
  const [product, setProduct] = useState(null);
  const [bomData, setBomData] = useState(null);
  const [expandedItems, setExpandedItems] = useState({});
  const [selectedItem, setSelectedItem] = useState(null);
  const [loading, setLoading] = useState(false);
  const [bomView, setBomView] = useState('mbom');
  const [documentModal, setDocumentModal] = useState({ isOpen: false, url: null, name: null });
  const [isOperationModalOpen, setIsOperationModalOpen] = useState(false);
  const [currentOperation, setCurrentOperation] = useState(null);
  const hasFetchedData = useRef(false);
  const [selectedDocVersions, setSelectedDocVersions] = useState({}); // { rootId: document } for eBOM version dropdown

  // Group part documents by root (parent_id or id) for eBOM version dropdown
  const groupedPartDocs = useMemo(() => {
    const docs = selectedItem?.documents || [];
    return docs.reduce((acc, doc) => {
      const rootId = doc.parent_id || doc.id;
      if (!acc[rootId]) acc[rootId] = [];
      acc[rootId].push(doc);
      return acc;
    }, {});
  }, [selectedItem?.documents]);

  const latestPartDocs = useMemo(() => {
    return Object.values(groupedPartDocs).map(group =>
      [...group].sort((a, b) => parseFloat(b.document_version || '0') - parseFloat(a.document_version || '0'))[0]
    );
  }, [groupedPartDocs]);

  useEffect(() => {
    if (!selectedItem?.documents?.length) return;
    const updated = { ...selectedDocVersions };
    let changed = false;
    latestPartDocs.forEach(doc => {
      const rootId = doc.parent_id || doc.id;
      if (!updated[rootId] || !groupedPartDocs[rootId]?.find(d => d.id === updated[rootId].id)) {
        updated[rootId] = doc;
        changed = true;
      }
    });
    if (changed) setSelectedDocVersions(updated);
  }, [latestPartDocs, groupedPartDocs]);

  useEffect(() => {
    setSelectedDocVersions({});
  }, [selectedItem?.id]);

  useEffect(() => {
    if (hasFetchedData.current || !productId) return;
    hasFetchedData.current = true;
    
    fetchBOMData().catch(console.error);
  }, [productId]);

  const processSubassemblies = (subassemblies) =>
    subassemblies?.flatMap(sub => [{
      id: sub.assembly?.id,
      name: sub.assembly?.assembly_name,
      part_number: sub.assembly?.assembly_number,
      type: 'assembly',
      documents: sub.documents || [],
      components: [
        ...(sub.parts?.map(p => ({
          id: p.part.id,
          name: p.part.part_name,
          part_number: p.part.part_number,
          type: p.part.type_name || 'part',
          operations: p.operations,
          process_plans: p.process_plans,
          documents: p.documents,
          tools: p.tools,
          extracted_data: p.extracted_data || [],
        })) || []),
        ...processSubassemblies(sub.subassemblies || [])
      ].sort((a, b) => a.id - b.id)
    }]) || [];

  const fetchBOMData = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/products/${productId}/hierarchical`);
      const data = response.data;
      if (data.product) {
        setProduct(data.product);
      }
      const processedAssemblies = data.assemblies?.flatMap(asm => ({
        id: asm.assembly?.id,
        name: asm.assembly?.assembly_name,
        part_number: asm.assembly?.assembly_number,
        type: 'assembly',
        documents: asm.documents || [],
        components: [
          ...(asm.parts?.map(p => ({
            id: p.part.id,
            name: p.part.part_name,
            part_number: p.part.part_number,
            type: p.part.type_name || 'part',
            operations: p.operations,
            process_plans: p.process_plans,
            documents: p.documents,
            tools: p.tools,
            extracted_data: p.extracted_data || [],
          })) || []),
          ...processSubassemblies(asm.subassemblies || [])
        ].sort((a, b) => a.id - b.id)
      })) || [];

      const transformedData = {
        id: data.product.id,
        name: data.product.product_name,
        part_number: data.product.product_number,
        type: 'product',
        components: [
          ...(data.direct_parts?.map(p => ({
            id: p.part.id,
            name: p.part.part_name,
            part_number: p.part.part_number,
            type: p.part.type_name || 'part',
            operations: p.operations,
            process_plans: p.process_plans,
            documents: p.documents,
            tools: p.tools,
            extracted_data: p.extracted_data || [],
          })) || []),
          ...processedAssemblies
        ].sort((a, b) => a.id - b.id)
      };

      setBomData(transformedData);
      setExpandedItems({ [transformedData.id]: true });
      setSelectedItem(transformedData);
    } catch (error) {
      console.error("Error fetching hierarchical BOM data:", error);
      setBomData(null);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (itemId) => setExpandedItems(prev => ({ ...prev, [itemId]: !prev[itemId] }));

  const getTypeIcon = (type) => {
    const normalized = (type || "").toString().toLowerCase();
    const inHouseTypes = ["make", "in-house", "in house", "inhouse"];
    const outSourceTypes = ["buy", "out-source", "out source", "outsourced", "outsourcing"];

    if (normalized === "product") {
      return <AppstoreOutlined className="text-purple-600" />;
    }
    if (normalized === "assembly") {
      return <BlockOutlined className="text-blue-500" />;
    }
    if (inHouseTypes.includes(normalized)) {
      return <CodeSandboxOutlined className="text-emerald-600" />;
    }
    if (outSourceTypes.includes(normalized)) {
      return <CodepenOutlined className="text-amber-600" />;
    }
    return <CodeSandboxOutlined className="text-gray-500" />;
  };

  const getTypeColor = (type) => {
    const normalized = (type || "").toString().toLowerCase();
    const inHouseTypes = ["make", "in-house", "in house", "inhouse", "part"];
    const outSourceTypes = ["buy", "out-source", "out source", "outsourced", "outsourcing"];

    if (normalized === "product") return 'purple';
    if (normalized === "assembly") return 'blue';
    if (inHouseTypes.includes(normalized)) return 'green';
    if (outSourceTypes.includes(normalized)) return 'orange';
    return 'default';
  };

  const handleDocumentAction = async (url, name, action = 'view') => {
    if (!url) return message.error('Document URL is not available');
    
    if (action === 'view') {
      setDocumentModal({ isOpen: true, url, name });
      return;
    }

    try {
      const link = document.createElement('a');
      if (url.startsWith('data:') || url.startsWith('blob:')) {
        link.href = url;
      } else {
        const response = await axios.get(url, {
          responseType: 'blob',
          headers: { 'Content-Type': 'application/octet-stream' },
          withCredentials: true,
        });
        link.href = window.URL.createObjectURL(response.data);
      }
      link.download = name?.includes('.') ? name : `${name || 'document'}.pdf`;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        if (link.href.startsWith('blob:')) window.URL.revokeObjectURL(link.href);
      }, 100);
      message.success('Download started');
    } catch (error) {
      console.error('Download error:', error);
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handlePreviewForModal = (doc) => {
    handleDocumentAction(doc.document_url, doc.document_name, 'view');
  };

  const renderBOMItem = (item, level = 0) => {
    if (!item) return null;
    const hasChildren = item.components?.length > 0;
    const isExpanded = expandedItems[item.id];
    const isSelected = selectedItem?.id === item.id;
    
    return (
      <div key={item.id} className="select-none">
        <div 
          className={`
            flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200
            ${isSelected 
              ? 'bg-gradient-to-r from-blue-50 to-blue-100 border-l-4 border-blue-500 shadow-sm' 
              : 'hover:bg-gray-50 border-l-4 border-transparent'
            }
          `}
          style={{ marginLeft: `${level * 16}px` }}
          onClick={() => setSelectedItem(item)}
        >
          <div className="flex-shrink-0">
            {hasChildren ? (
              <Button 
                type="text" 
                size="small" 
                icon={isExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
                onClick={(e) => { e.stopPropagation(); toggleExpand(item.id); }}
                className="hover:bg-blue-100 rounded-md"
              />
            ) : <div className="w-8" />}
          </div>
          
          <div className="flex-shrink-0 text-lg">
            {getTypeIcon(item.type)}
          </div>
          
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <Tooltip title={item.name}>
              <Text 
                className={`text-sm font-medium truncate ${isSelected ? 'text-blue-700' : 'text-gray-800'}`}
              >
                {item.name}
              </Text>
            </Tooltip>
            <Tag color={getTypeColor(item.type)} className="text-xs">
              {item.type?.toUpperCase()}
            </Tag>
          </div>
        </div>
        
        {hasChildren && isExpanded && (
          <div className="mt-1">
            {item.components.map(child => renderBOMItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const DocumentTable = ({ documents }) => {
    const columns = [
      {
        title: <span className="font-semibold text-gray-700">Type</span>,
        dataIndex: 'document_type',
        key: 'document_type',
        width: 140,
        render: (type) => (
          <Space>
            <FileTextOutlined className="text-blue-500" />
            <Tag color="blue" className="text-xs">{type || 'Document'}</Tag>
          </Space>
        ),
      },
      {
        title: <span className="font-semibold text-gray-700">Document Name</span>,
        dataIndex: 'document_name',
        key: 'document_name',
        render: (name) => (
          <Text className="text-sm font-medium text-gray-800">
            {name || 'Untitled Document'}
          </Text>
        ),
      },
      {
        title: <span className="font-semibold text-gray-700">Version</span>,
        dataIndex: 'version',
        key: 'version',
        width: 100,
        render: (version, record) => {
          const v = version || record.document_version || '1.0';
          return <Tag color="green">{v.startsWith('v') ? v : `v${v}`}</Tag>;
        },
      },
      {
        title: <span className="font-semibold text-gray-700">Actions</span>,
        key: 'actions',
        width: 120,
        render: (_, record) => (
          <Space size="small">
            <Tooltip title="View Document">
              <Button 
                type="primary"
                ghost
                size="small" 
                icon={<EyeOutlined />}
                onClick={() => handleDocumentAction(record.document_url, record.document_name, 'view')}
                className="hover:scale-105 transition-transform"
              />
            </Tooltip>
            <Tooltip title="Download">
              <Button 
                type="default"
                size="small" 
                icon={<DownloadOutlined />}
                onClick={() => handleDocumentAction(record.document_url, record.document_name, 'download')}
                className="hover:scale-105 transition-transform"
              />
            </Tooltip>
          </Space>
        ),
      },
    ];

    return (
      <Table
        columns={columns}
        dataSource={documents}
        rowKey="id"
        size="small"
        pagination={false}
        scroll={{ y: 400 }}
        className="modern-table"
      />
    );
  };

  const OperationsTable = ({ operations, processPlans }) => {
    const formatDate = (val) => {
      if (!val) return '—';
      const d = typeof val === 'string' ? new Date(val) : val;
      return isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
    };

    const columns = [
      {
        title: <span className="font-semibold text-gray-700">Op #</span>,
        key: 'operation_number',
        render: (_, record, index) => (
          <Tag color="cyan" className="font-mono">
            {String(record.operation_number || index + 1).padStart(2, '0')}
          </Tag>
        ),
      },
      {
        title: <span className="font-semibold text-gray-700">Operation Name</span>,
        dataIndex: 'operation_name',
        key: 'operation_name',
        render: (name) => (
          <Text className="text-sm font-medium text-gray-800">{name}</Text>
        ),
      },
      {
        title: <span className="font-semibold text-gray-700"><ClockCircleOutlined /> Setup</span>,
        key: 'setup_time',
        render: (_, record) => (
          <Tag color="orange" icon={<ClockCircleOutlined />}>
            {record.setup_time || '00:00:00'}
          </Tag>
        ),
      },
      {
        title: <span className="font-semibold text-gray-700"><ClockCircleOutlined /> Cycle</span>,
        key: 'cycle_time',
        render: (_, record) => (
          <Tag color="green" icon={<ClockCircleOutlined />}>
            {record.cycle_time || '00:00:00'}
          </Tag>
        ),
      },
      {
        title: <span className="font-semibold text-gray-700"><EnvironmentOutlined /> Workcenter</span>,
        key: 'workcenter',
        render: (_, record) => (
          <Tag color="purple" icon={<EnvironmentOutlined />}>
            {record.work_center_name || record.workcenter_id || 'N/A'}
          </Tag>
        ),
      },
      {
        title: <span className="font-semibold text-gray-700"><EnvironmentOutlined /> Machine</span>,
        key: 'machine_name',
        render: (_, record) => (
          <Tag color="purple" icon={<EnvironmentOutlined />}>
            {record.machine_name || record.machine_id || 'N/A'}
          </Tag>
        ),
      },
      {
        title: <span className="font-semibold text-gray-700">Operation Type</span>,
        key: 'part_type_name',
        render: (_, record) => (
          <Tag color={record.part_type_name?.toLowerCase().includes('out') ? 'orange' : 'blue'}>
            {record.part_type_name || '—'}
          </Tag>
        ),
      },
      {
        title: <span className="font-semibold text-gray-700">From Date</span>,
        key: 'from_date',
        render: (_, record) => (
          <span className="text-sm text-gray-700">{formatDate(record.from_date)}</span>
        ),
      },
      {
        title: <span className="font-semibold text-gray-700">To Date</span>,
        key: 'to_date',
        render: (_, record) => (
          <span className="text-sm text-gray-700">{formatDate(record.to_date)}</span>
        ),
      },
    ];

    return (
      <Table
        columns={columns}
        dataSource={operations}
        rowKey="id"
        size="small"
        pagination={false}
        scroll={{ x: 'max-content', y: 400 }}
        onRow={(record) => ({
            onClick: () => {
                setCurrentOperation(record);
                setIsOperationModalOpen(true);
            },
            style: { cursor: 'pointer' }
        })}
        className="modern-table"
      />
    );
  };

  const EmptyState = ({ message: msg, icon }) => (
    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
      <div className="text-5xl mb-4 opacity-50">
        {icon || <BlockOutlined />}
      </div>
      <p className="text-sm font-medium">{msg}</p>
    </div>
  );

  const renderDetailsPanel = () => {
    if (!selectedItem) {
      return <EmptyState message="Select an item from the BOM structure to view details" icon={<InfoCircleOutlined />} />;
    }
    
    const isPart = selectedItem.type !== 'product' && selectedItem.type !== 'assembly';

    if (!isPart) {
      return (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6 max-w-md">
            <InfoCircleOutlined className="text-4xl text-blue-500 mb-3" />
            <p className="text-sm text-gray-600 text-center">
              Select a <span className="font-semibold text-blue-600">part</span> to view {bomView === 'ebom' ? 'documents' : 'operations and process plans'}
            </p>
          </div>
        </div>
      );
    }

    if (bomView === 'ebom') {
      const docs = selectedItem.documents || [];
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <FileTextOutlined className="text-blue-500" />
              Documents
              <Badge count={latestPartDocs.length} style={{ backgroundColor: '#1890ff' }} />
            </h3>
          </div>
          {docs.length > 0 ? (
            <Table
              dataSource={latestPartDocs}
              rowKey={(r) => r.parent_id || r.id}
              size="small"
              pagination={false}
              scroll={{ y: 400, x: 600 }}
              className="modern-table"
              columns={[
                {
                  title: <span className="font-semibold text-gray-700">Document Name</span>,
                  key: 'document_name',
                  render: (_, record) => {
                    const rootId = record.parent_id || record.id;
                    const currentDoc = selectedDocVersions[rootId] || record;
                    return (
                      <Text className="text-sm font-medium text-gray-800">
                        {currentDoc.document_name || 'Untitled Document'}
                      </Text>
                    );
                  },
                },
                {
                  title: <span className="font-semibold text-gray-700">Type</span>,
                  key: 'document_type',
                  width: 120,
                  render: (_, record) => {
                    const rootId = record.parent_id || record.id;
                    const currentDoc = selectedDocVersions[rootId] || record;
                    return (
                      <Space>
                        <FileTextOutlined className="text-blue-500" />
                        <Tag color="blue" className="text-xs">{currentDoc.document_type || 'Document'}</Tag>
                      </Space>
                    );
                  },
                },
                {
                  title: <span className="font-semibold text-gray-700">Version</span>,
                  key: 'version',
                  width: 180,
                  render: (_, record) => {
                    const rootId = record.parent_id || record.id;
                    const group = groupedPartDocs[rootId] || [];
                    const currentDoc = selectedDocVersions[rootId] || record;
                    const latestDoc = record;
                    const v = currentDoc.document_version || '1.0';
                    if (group.length <= 1) {
                      return <Tag color="green">{v.startsWith('v') ? v : `v${v}`}</Tag>;
                    }
                    return (
                      <Select
                        size="small"
                        value={currentDoc.id}
                        variant="filled"
                        className="w-full"
                        onChange={(val) => {
                          const selected = group.find(d => d.id === val);
                          setSelectedDocVersions(prev => ({ ...prev, [rootId]: selected }));
                        }}
                        style={{ minWidth: 140 }}
                        options={group
                          .sort((a, b) => parseFloat(b.document_version || '0') - parseFloat(a.document_version || '0'))
                          .map(ver => {
                            const verStr = ver.document_version || '1.0';
                            return {
                              value: ver.id,
                              label: verStr.startsWith('v') ? verStr : `v${verStr}`,
                            };
                          })}
                        optionRender={(option) => (
                          <span className="flex items-center gap-2">
                            <Badge status={option.value === latestDoc.id ? 'success' : 'default'} />
                            <span className={option.value === currentDoc.id ? 'font-semibold text-blue-600' : ''}>
                              {option.label}
                            </span>
                          </span>
                        )}
                      />
                    );
                  },
                },
                {
                  title: <span className="font-semibold text-gray-700">Actions</span>,
                  key: 'actions',
                  width: 120,
                  render: (_, record) => {
                    const rootId = record.parent_id || record.id;
                    const currentDoc = selectedDocVersions[rootId] || record;
                    return (
                      <Space size="small">
                        <Tooltip title="View Document">
                          <Button
                            type="primary"
                            ghost
                            size="small"
                            icon={<EyeOutlined />}
                            onClick={() => handleDocumentAction(currentDoc.document_url, currentDoc.document_name, 'view')}
                            className="hover:scale-105 transition-transform"
                          />
                        </Tooltip>
                        <Tooltip title="Download">
                          <Button
                            type="default"
                            size="small"
                            icon={<DownloadOutlined />}
                            onClick={() => handleDocumentAction(currentDoc.document_url, currentDoc.document_name, 'download')}
                            className="hover:scale-105 transition-transform"
                          />
                        </Tooltip>
                      </Space>
                    );
                  },
                },
              ]}
            />
          ) : (
            <EmptyState message="No documents available for this part" icon={<FileTextOutlined />} />
          )}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <ToolOutlined className="text-green-500" />
            Manufacturing Operations
            <Badge count={selectedItem.operations?.length || 0} style={{ backgroundColor: '#52c41a' }} />
          </h3>
        </div>
        <div className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded">
          <p className="text-xs text-blue-800 flex items-center gap-2">
            <InfoCircleOutlined />
            Click on an operation to view detailed process plan information
          </p>
        </div>
        {selectedItem.operations?.length > 0 ? (
          <OperationsTable operations={selectedItem.operations} processPlans={selectedItem.process_plans} />
        ) : (
          <EmptyState message="No manufacturing operations defined for this part" icon={<ToolOutlined />} />
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center mb-6">
            <Button type="default" size="large" disabled className="shadow-sm">
              <ArrowLeftOutlined />
              Back
            </Button>
            <h1 className="text-2xl font-bold ml-4 text-gray-800">Loading...</h1>
          </div>
          <div className="flex justify-center items-center py-24">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-500 border-t-transparent"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!bomData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center mb-6">
            <Button type="default" size="large" onClick={onBackToOrders} className="shadow-sm">
              <ArrowLeftOutlined />
              Back
            </Button>
            <h1 className="text-2xl font-bold ml-4 text-gray-800">{product?.product_name || 'Product'} BOM</h1>
          </div>
          <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded-lg shadow-sm">
            <p className="text-sm text-red-700 font-medium">⚠️ Failed to load BOM data. Please try again.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: 'white', padding: 'clamp(8px, 2vw, 12px)', borderRadius: 8, border: '1px solid #e8e8e8', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
      <style>{`
        .modern-table .ant-table-thead > tr > th {
          background: linear-gradient(to bottom, #f0f5ff, #e6f0ff);
          font-weight: 600;
          border-bottom: 2px solid #1890ff;
        }
        .modern-table .ant-table-tbody > tr:hover > td {
          background: #f0f8ff !important;
        }
        .modern-table .ant-table-tbody > tr > td {
          border-bottom: 1px solid #f0f0f0;
        }
        @media (max-width: 768px) {
          .ant-table {
            font-size: 12px;
          }
          .ant-table-thead > tr > th,
          .ant-table-tbody > tr > td {
            padding: 8px 4px;
          }
        }
      `}</style>
      
      <div>
        {/* Header */}
        <div className="rounded-lg lg:rounded-xl shadow-lg p-2 sm:p-3 mb-3 sm:mb-4" style={{ backgroundColor: 'white' }}>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button 
                type="default" 
                size="middle" 
                onClick={onBackToOrders}
                className="shadow-sm hover:shadow-md transition-shadow"
                icon={<ArrowLeftOutlined />}
              >
                <span className="hidden sm:inline">Back</span>
              </Button>
              <div className="flex-1 sm:flex-initial">
                <h1 className="text-base sm:text-lg lg:text-xl font-bold text-gray-800 flex items-center gap-2 m-0">
                  <AppstoreOutlined className="text-blue-600" />
                  <span className="hidden sm:inline">Bill of Materials</span>
                  <span className="sm:hidden">BOM</span>
                </h1>
                <p className="text-xs sm:text-sm text-gray-500 mt-1 truncate">{product?.product_name || 'Product View'}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs sm:text-sm font-medium text-gray-600 mr-2">View:</span>
              {['mbom', 'ebom'].map(view => (
                <Button 
                  key={view}
                  type={bomView === view ? 'primary' : 'default'}
                  size="middle"
                  onClick={() => setBomView(view)}
                  className={`font-semibold shadow-sm transition-all flex-1 sm:flex-initial ${
                    bomView === view ? 'shadow-md scale-105' : 'hover:shadow-md'
                  }`}
                >
                  {view.toUpperCase()}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
          {/* BOM Tree */}
          <div className="lg:col-span-1">
            <Card 
              title={
                <div className="flex items-center gap-2">
                  <BlockOutlined className="text-blue-600" />
                  <span className="font-bold text-gray-800 text-sm sm:text-base">BOM Structure</span>
                </div>
              }
              className="shadow-lg rounded-lg lg:rounded-xl overflow-hidden"
              styles={{ 
                body: { 
                  padding: 'clamp(8px, 2vw, 12px)', 
                  maxHeight: 'calc(100vh - 240px)', 
                  overflowY: 'auto' 
                },
                header: {
                  minHeight: 'auto',
                  padding: 'clamp(8px, 2vw, 16px)'
                }
              }}
            >
              {bomData && renderBOMItem(bomData)}
            </Card>
          </div>

          {/* Details Panel */}
          <div className="lg:col-span-2">
            <Card
              title={
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 sm:gap-3">
                      {selectedItem && getTypeIcon(selectedItem.type)}
                      <span className="font-bold text-gray-800 text-sm sm:text-base lg:text-lg truncate">
                        {selectedItem?.name || 'Item Details'}
                      </span>
                      {selectedItem && (
                        <Tag color={getTypeColor(selectedItem.type)} className="text-xs font-semibold">
                          {selectedItem.type?.toUpperCase()}
                        </Tag>
                      )}
                    </div>
                    {selectedItem?.part_number && (
                      <Text className="text-xs text-gray-500 ml-0 sm:ml-8 block sm:inline">P/N: {selectedItem.part_number}</Text>
                    )}
                  </div>
                </div>
              }
              className="shadow-lg rounded-lg lg:rounded-xl overflow-hidden"
              styles={{
                header: {
                  background: 'linear-gradient(to right, #f0f5ff, #e6f0ff)',
                  borderBottom: '2px solid #1890ff',
                  padding: 'clamp(12px, 2vw, 20px)',
                  minHeight: 'auto'
                },
                body: {
                  padding: 'clamp(12px, 2vw, 20px)',
                  maxHeight: 'calc(100vh - 240px)',
                  overflowY: 'auto',
                },
              }}
            >
              {renderDetailsPanel()}
            </Card>
          </div>
        </div>
      </div>

      {/* Document Modal using Ant Design Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2 sm:gap-3">
            <FileTextOutlined className="text-lg sm:text-xl text-blue-600" />
            <span className="font-bold text-gray-800 text-sm sm:text-base truncate">{documentModal.name || 'Document Viewer'}</span>
          </div>
        }
        open={documentModal.isOpen}
        onCancel={() => setDocumentModal({ isOpen: false, url: null, name: null })}
        width="95%"
        style={{ top: 20, maxWidth: '1400px' }}
        footer={[
          <Button 
            key="close" 
            size="large"
            onClick={() => setDocumentModal({ isOpen: false, url: null, name: null })}
            className="w-full sm:w-auto"
          >
            Close
          </Button>,
          <Button 
            key="download"
            type="primary"
            size="large"
            icon={<DownloadOutlined />}
            onClick={() => handleDocumentAction(documentModal.url, documentModal.name, 'download')}
            className="w-full sm:w-auto"
          >
            Download
          </Button>
        ]}
      >
        <div style={{ height: '70vh' }}>
          {documentModal.url ? (
            <iframe 
              src={documentModal.url} 
              className="w-full h-full border-2 border-gray-200 rounded-lg" 
              title={documentModal.name || 'Document'} 
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <FileTextOutlined className="text-6xl mb-4 opacity-50" />
                <p className="text-lg">Document URL is not available</p>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        title={
            <div className="flex items-center gap-2">
                <ToolOutlined className="text-blue-500"/> 
                <span className="text-sm sm:text-base truncate">Operation Details: {currentOperation?.operation_name}</span>
            </div>
        }
        open={isOperationModalOpen}
        onCancel={() => setIsOperationModalOpen(false)}
        width="95%"
        style={{ maxWidth: 800 }}
        footer={null}
        destroyOnHidden
      >
        {currentOperation && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-3 sm:p-4 rounded-lg border border-blue-200 space-y-3 sm:space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1">Work Instructions:</p>
                    <div className="bg-white p-2 sm:p-3 rounded border text-xs sm:text-sm whitespace-pre-wrap shadow-sm max-h-40 overflow-y-auto">
                        {currentOperation.work_instructions || 'No instructions available'}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-1">Notes:</p>
                    <div className="bg-white p-2 sm:p-3 rounded border text-xs sm:text-sm whitespace-pre-wrap shadow-sm max-h-40 overflow-y-auto">
                        {currentOperation.notes || 'None specified'}
                    </div>
                  </div>
                </div>

                {currentOperation.tools?.length > 0 && (
                    <div className="bg-white p-2 sm:p-3 rounded-lg border border-gray-200 shadow-sm overflow-x-auto">
                        <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
                            <ToolOutlined /> Tools Required:
                        </p>
                        <Table
                            dataSource={currentOperation.tools}
                            rowKey="id"
                            pagination={false}
                            size="small"
                            bordered
                            scroll={{ x: 600 }}
                            columns={[
                                { title: 'Tool Name', dataIndex: ['tool', 'item_description'], key: 'name', render: (text) => <span className="font-medium text-xs sm:text-sm">{text}</span> },
                                { title: 'Code', dataIndex: ['tool', 'identification_code'], key: 'code', render: (text) => <Tag className="text-xs">{text}</Tag> },
                                { title: 'Make', dataIndex: ['tool', 'make'], key: 'make', render: (text) => <span className="text-xs sm:text-sm">{text}</span> },
                                { title: 'Specification', dataIndex: ['tool', 'range'], key: 'range', render: (text) => <span className="text-xs sm:text-sm">{text}</span> },
                            ]}
                        />
                    </div>
                )}

                 <div className="bg-white p-2 sm:p-3 rounded-lg border border-gray-200 shadow-sm">
                    <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
                        <FileTextOutlined /> Operation Documents:
                    </p>
                    <OperationDocumentsList operationId={currentOperation.id} onPreview={handlePreviewForModal} />
                </div>
            </div>
        )}
      </Modal>
    </div>
  );
};

export default ProductBOMView;
