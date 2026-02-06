import React, { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { Button, Typography, Table, Space, Spin, Empty, Modal, Select, message, Tag, Card } from "antd";
import { 
  CaretDownOutlined, 
  CaretRightOutlined, 
  ArrowLeftOutlined, 
  AppstoreOutlined, 
  BlockOutlined, 
  CodeSandboxOutlined,
  EyeOutlined,
  DownloadOutlined,
  FileTextOutlined
} from "@ant-design/icons";
import { API_BASE_URL } from "../Config/auth";

const { Title, Text } = Typography;
const { Option } = Select;

const ScrollArea = ({ className, children }) => (
  <div className={className}>{children}</div>
);

const ProductBOMView = ({ onBackToOrders }) => {
  const { productId } = useParams();
  const [product, setProduct] = useState(null);
  const [bomData, setBomData] = useState(null);
  const [expandedItems, setExpandedItems] = useState({});
  const [selectedItem, setSelectedItem] = useState(null);
  const [loading, setLoading] = useState(false);
  const [bomView, setBomView] = useState('mbom');
  const [expandedOperations, setExpandedOperations] = useState({});
  const [documentModal, setDocumentModal] = useState({ isOpen: false, url: null, name: null });
  const hasFetchedData = useRef(false);

  useEffect(() => {
    if (hasFetchedData.current || !productId) return;
    hasFetchedData.current = true;
    
    Promise.all([
      fetch(`${API_BASE_URL}/products/${productId}`).then(r => r.ok && r.json().then(setProduct)),
      fetchBOMData()
    ]).catch(console.error);
  }, [productId]);

  const processSubassemblies = (subassemblies) => 
    subassemblies?.flatMap(sub => [{
      id: sub.assembly?.id,
      name: sub.assembly?.assembly_name,
      part_number: sub.assembly?.assembly_number,
      type: 'assembly',
      components: [
        ...(sub.parts?.map(p => ({
          id: p.part.id,
          name: p.part.part_name,
          part_number: p.part.part_number,
          type: p.part.type_name || 'part',
          operations: p.operations,
          process_plans: p.process_plans,
          documents: p.documents,
          tools: p.tools
        })) || []),
        ...processSubassemblies(sub.subassemblies || [])
      ]
    }]) || [];

  const fetchBOMData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/products/${productId}/hierarchical`);
      if (!response.ok) return setBomData(null);
      
      const data = await response.json();
      const processedAssemblies = data.assemblies?.flatMap(asm => ({
        id: asm.assembly?.id,
        name: asm.assembly?.assembly_name,
        part_number: asm.assembly?.assembly_number,
        type: 'assembly',
        components: [
          ...(asm.parts?.map(p => ({
            id: p.part.id,
            name: p.part.part_name,
            part_number: p.part.part_number,
            type: p.part.type_name || 'part',
            operations: p.operations,
            process_plans: p.process_plans,
            documents: p.documents,
            tools: p.tools
          })) || []),
          ...processSubassemblies(asm.subassemblies || [])
        ]
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
            tools: p.tools
          })) || []),
          ...processedAssemblies
        ]
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
  const toggleOperationExpand = (opId) => setExpandedOperations(prev => ({ ...prev, [opId]: !prev[opId] }));

  const getTypeIcon = (type) => {
    const icons = {
      product: <AppstoreOutlined style={{ color: '#722ed1' }} />,
      assembly: <BlockOutlined style={{ color: '#1890ff' }} />,
      part: <CodeSandboxOutlined style={{ color: '#52c41a' }} />,
      make: <CodeSandboxOutlined style={{ color: '#52c41a' }} />
    };
    return icons[type?.toLowerCase()] || <CodeSandboxOutlined style={{ color: '#8c8c8c' }} />;
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
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/octet-stream' },
          credentials: 'include'
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        link.href = window.URL.createObjectURL(await response.blob());
      }
      link.download = name?.includes('.') ? name : `${name || 'document'}.pdf`;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        if (link.href.startsWith('blob:')) window.URL.revokeObjectURL(link.href);
      }, 100);
    } catch (error) {
      console.error('Download error:', error);
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const renderBOMItem = (item, level = 0) => {
    if (!item) return null;
    const hasChildren = item.components?.length > 0;
    const isExpanded = expandedItems[item.id];
    const isSelected = selectedItem?.id === item.id;
    
    return (
      <div key={item.id}>
        <div 
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px',
            borderRadius: '4px',
            cursor: 'pointer',
            marginLeft: `${level * 20}px`,
            borderLeft: `2px solid ${isSelected ? '#1890ff' : 'transparent'}`,
            backgroundColor: isSelected ? '#e6f7ff' : 'transparent',
          }}
          onClick={() => setSelectedItem(item)}
          onMouseEnter={(e) => {
            if (!isSelected) e.currentTarget.style.backgroundColor = '#f0f8ff';
          }}
          onMouseLeave={(e) => {
            if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <div style={{ flexShrink: 0 }}>
            {hasChildren ? (
              <Button 
                type="text" 
                size="small" 
                icon={isExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
                onClick={(e) => { e.stopPropagation(); toggleExpand(item.id); }}
                style={{ padding: '2px' }}
              />
            ) : <div style={{ width: '16px' }} />}
          </div>
        <div style={{ flexShrink: 0 }}>{getTypeIcon(item.type)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text 
              style={{ 
                fontSize: '12px', 
                fontWeight: 'medium',
                color: isSelected ? '#1890ff' : '#262626'
              }}
              ellipsis={{ tooltip: item.name }}
            >
              {item.name}
            </Text>
          </div>
        </div>
        {hasChildren && isExpanded && (
          <div style={{ marginTop: '2px' }}>
            {item.components.map(child => renderBOMItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const DocumentTable = ({ documents }) => {
    const columns = [
      {
        title: 'Type',
        dataIndex: 'document_type',
        key: 'document_type',
        width: 120,
        render: (type) => (
          <Space>
            <FileTextOutlined style={{ color: '#8c8c8c' }} />
            <Text style={{ fontSize: '12px' }}>{type || 'Document'}</Text>
          </Space>
        ),
      },
      {
        title: 'Name',
        dataIndex: 'document_name',
        key: 'document_name',
        render: (name) => (
          <Text style={{ fontSize: '12px', fontWeight: 'medium' }}>
            {name || 'Untitled'}
          </Text>
        ),
      },
      {
        title: 'Actions',
        key: 'actions',
        width: 120,
        render: (_, record) => (
          <Space size="small">
            <Button 
              type="text" 
              size="small" 
              icon={<EyeOutlined />}
              onClick={() => handleDocumentAction(record.document_url, record.document_name, 'view')}
              title="View"
            />
            <Button 
              type="text" 
              size="small" 
              icon={<DownloadOutlined />}
              onClick={() => handleDocumentAction(record.document_url, record.document_name, 'download')}
              title="Download"
            />
          </Space>
        ),
      },
      {
        title: 'Version',
        dataIndex: 'version',
        key: 'version',
        width: 100,
        render: (version, record) => (
          <Select 
            size="small" 
            value={version || '1.0'} 
            style={{ width: '100%' }}
          >
            <Option value="1.0">1.0</Option>
            {record.versions?.map((v, i) => (
              <Option key={i} value={v}>{v}</Option>
            ))}
          </Select>
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
        scroll={{ y: 300 }}
      />
    );
  };

  const OperationsTable = ({ operations, processPlans }) => {
    const columns = [
      {
        title: 'Op #',
        key: 'operation_number',
        width: 80,
        render: (_, record, index) => {
          const plan = processPlans?.find(pp => pp.operation_id === record.id);
          const isExpanded = expandedOperations[record.id];
          return (
            <Space>
              {plan && (
                <Button 
                  type="text" 
                  size="small" 
                  icon={isExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
                  onClick={() => toggleOperationExpand(record.id)}
                />
              )}
              <Text style={{ fontSize: '12px', fontWeight: 'medium' }}>
                {record.operation_number || index + 1}
              </Text>
            </Space>
          );
        },
      },
      {
        title: 'Name',
        dataIndex: 'operation_name',
        key: 'operation_name',
        render: (name) => <Text style={{ fontSize: '12px' }}>{name}</Text>,
      },
      {
        title: 'Setup',
        key: 'setup_time',
        width: 100,
        render: (_, record) => {
          const plan = processPlans?.find(pp => pp.operation_id === record.id);
          return <Text style={{ fontSize: '12px' }}>{plan?.setup_time || '00:00:00'}</Text>;
        },
      },
      {
        title: 'Cycle',
        key: 'cycle_time',
        width: 100,
        render: (_, record) => {
          const plan = processPlans?.find(pp => pp.operation_id === record.id);
          return <Text style={{ fontSize: '12px' }}>{plan?.cycle_time || '00:00:00'}</Text>;
        },
      },
      {
        title: 'Workcenter',
        key: 'workcenter',
        width: 120,
        render: (_, record) => {
          const plan = processPlans?.find(pp => pp.operation_id === record.id);
          return <Text style={{ fontSize: '12px' }}>{plan?.workcenter || 'N/A'}</Text>;
        },
      },
    ];

    const expandedRowRender = (record) => {
      const plan = processPlans?.find(pp => pp.operation_id === record.id);
      if (!plan) return null;
      return (
        <div className="p-3 bg-gray-50 rounded text-xs">
           <p><strong>Description:</strong> {plan.description || 'No description available'}</p>
           <p><strong>Resources:</strong> {plan.resources || 'None'}</p>
        </div>
      );
    };

    return (
      <Table
        columns={columns}
        dataSource={operations}
        rowKey="id"
        size="small"
        pagination={false}
        expandable={{
          expandedRowRender,
          expandedRowKeys: Object.keys(expandedOperations).filter(k => expandedOperations[k]).map(k => isNaN(Number(k)) ? k : Number(k)),
          expandIconColumnIndex: -1
        }}
      />
    );
  };

  const EmptyState = ({ message }) => (
    <div className="flex flex-col items-center justify-center py-8 text-gray-500">
      <BlockOutlined className="text-2xl mb-2" />
      <p className="text-sm">{message}</p>
    </div>
  );

  const renderDetailsPanel = () => {
    if (!selectedItem) return <EmptyState message="Select an item to view details" />;
    
    // Check if the selected item is a part (not a product or assembly)
    // We treat anything that isn't explicitly a product or assembly as a part/component
    // This covers 'part', 'make', 'buy', 'component', etc.
    const isPart = selectedItem.type !== 'product' && selectedItem.type !== 'assembly';

    if (!isPart) return <div className="text-center py-8"><p className="text-xs text-gray-400">Select a part to view {bomView === 'ebom' ? 'documents' : 'operations'}</p></div>;

    if (bomView === 'ebom') {
      return (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold mb-2">Documents ({selectedItem.documents?.length || 0})</h3>
          {selectedItem.documents?.length > 0 ? (
            <DocumentTable documents={selectedItem.documents} />
          ) : (
            <EmptyState message="No documents available for this part" />
          )}
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold mb-2">Operations ({selectedItem.operations?.length || 0})</h3>
        <p className="text-xs text-gray-500 mb-2">Click on an operation to view process plan details</p>
        {selectedItem.operations?.length > 0 ? (
          <OperationsTable operations={selectedItem.operations} processPlans={selectedItem.process_plans} />
        ) : (
          <EmptyState message="No operations defined for this part" />
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="container mx-auto p-3">
        <div className="flex items-center mb-3">
          <Button type="default" size="small" disabled className="h-7 text-xs"><ArrowLeftOutlined className="h-3 w-3 mr-1" />Back</Button>
          <h1 className="text-lg font-semibold ml-2">Loading...</h1>
        </div>
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-3 border-blue-600 border-r-transparent" />
        </div>
      </div>
    );
  }

  if (!bomData) {
    return (
      <div className="container mx-auto p-3">
        <div className="flex items-center mb-3">
          <Button type="default" size="small" onClick={onBackToOrders} className="h-7 text-xs"><ArrowLeftOutlined className="h-3 w-3 mr-1" />Back</Button>
          <h1 className="text-lg font-semibold ml-2">{product?.product_name || 'Product'} BOM</h1>
        </div>
        <div className="bg-red-50 border-l-4 border-red-500 p-3">
          <p className="text-sm text-red-700">Failed to load BOM data. Please try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-3">
      <div className="flex justify-between items-center mb-3">
        <Button type="default" size="small" onClick={onBackToOrders} className="h-7 text-xs"><ArrowLeftOutlined className="h-3 w-3 mr-1" />Back</Button>
        <h1 className="text-lg font-bold">Product Bill of Materials</h1>
        <div className="flex items-center space-x-1">
          {['mbom', 'ebom'].map(view => (
            <Button key={view} type={bomView === view ? 'primary' : 'default'} size="small" onClick={() => setBomView(view)} className="h-7 text-xs">{view.toUpperCase()}</Button>
          ))}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="w-full lg:w-1/3">
          <Card 
            title={<span className="text-sm font-semibold">BOM Structure</span>}
            size="small"
            bodyStyle={{ padding: 0 }}
          >
              <ScrollArea className="h-[calc(100vh-220px)]">{bomData && renderBOMItem(bomData)}</ScrollArea>
          </Card>
        </div>

        <div className="flex-1">
          <Card
            title={
              <div>
                <div className="text-sm font-semibold">{selectedItem?.name || 'Select an item'}</div>
                {selectedItem && <div className="text-xs text-gray-600 uppercase font-normal">{selectedItem.type}</div>}
              </div>
            }
            size="small"
            headStyle={{ backgroundColor: '#f9fafb' }}
            bodyStyle={{ paddingTop: '8px' }}
          >
              <ScrollArea className="h-[calc(100vh-220px)]">{renderDetailsPanel()}</ScrollArea>
          </Card>
        </div>
      </div>

      {documentModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl max-h-[85vh] w-full mx-3">
            <div className="flex items-center justify-between p-3 border-b">
              <h3 className="text-sm font-semibold">{documentModal.name || 'Document'}</h3>
              <button onClick={() => setDocumentModal({ isOpen: false, url: null, name: null })} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4">
              <div className="h-[70vh]">
                {documentModal.url ? (
                  <iframe src={documentModal.url} className="w-full h-full border-0 rounded" title={documentModal.name || 'Document'} />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500">Document URL is not available</div>
                )}
              </div>
            </div>
            <div className="flex justify-end p-4 border-t">
              <button onClick={() => setDocumentModal({ isOpen: false, url: null, name: null })} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductBOMView;