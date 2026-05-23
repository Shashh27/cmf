import React, { useState, useEffect } from "react";
import { Modal, Table, Spin, Tag, Typography, Button, Space, Tooltip, Empty } from "antd";
import { ToolOutlined, FilePdfOutlined, FileExcelOutlined, SearchOutlined } from "@ant-design/icons";
import axios from "axios";
import { API_BASE_URL } from "../../Config/auth";
import ToolsDownload from "../../DownloadReports/ToolsDownload";

const { Text, Title } = Typography;

const ProductToolsViewer = ({ visible, onClose, product }) => {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (visible && product) {
      fetchTools();
    }
  }, [visible, product]);

  const fetchTools = async () => {
    setLoading(true);
    try {
      // Use lightweight tools-data endpoint - only tools linked to operations
      const response = await axios.get(`${API_BASE_URL}/products/${product.id}/tools-data`);
      if (response.status >= 200 && response.status < 300) {
        setTools(response.data.tools || []);
      }
    } catch (error) {
      console.error("Error fetching product tools:", error);
      setTools([]);
    } finally {
      setLoading(false);
    }
  };

  const getFilteredTools = () => {
    if (!searchTerm) return tools;
    
    const searchLower = searchTerm.toLowerCase();
    return tools.filter(tool => 
      (tool.tool_name || '').toLowerCase().includes(searchLower) ||
      (tool.tool_number || '').toLowerCase().includes(searchLower) ||
      (tool.tool_type || '').toLowerCase().includes(searchLower) ||
      (tool.part_number || '').toLowerCase().includes(searchLower) ||
      (tool.part_name || '').toLowerCase().includes(searchLower) ||
      (tool.assembly_name || '').toLowerCase().includes(searchLower) ||
      (tool.operation_name || '').toLowerCase().includes(searchLower)
    );
  };

  const columns = [
    {
      title: <span className="font-semibold whitespace-nowrap">Item Description</span>,
      dataIndex: 'tool_name',
      key: 'tool_name',
      ellipsis: true,
      render: (text) => <Text className="text-sm whitespace-normal break-words">{text || 'N/A'}</Text>
    },
    {
      title: <span className="font-semibold whitespace-nowrap">Range / Size</span>,
      dataIndex: 'tool_range',
      key: 'tool_range',
      ellipsis: true,
      render: (text) => <Text className="text-sm text-gray-600 whitespace-normal break-words">{text || '-'}</Text>
    },
    {
      title: <span className="font-semibold whitespace-nowrap">ID Code</span>,
      dataIndex: 'tool_number',
      key: 'tool_number',
      ellipsis: true,
      render: (text) => <Text className="text-sm font-mono whitespace-normal break-words">{text || '-'}</Text>
    },
    {
      title: <span className="font-semibold whitespace-nowrap">Make</span>,
      dataIndex: 'tool_make',
      key: 'tool_make',
      ellipsis: true,
      render: (text) => <Text className="text-sm text-gray-700 whitespace-normal break-words">{text || '-'}</Text>
    },
    {
      title: <span className="font-semibold whitespace-nowrap">Part Number</span>,
      dataIndex: 'part_number',
      key: 'part_number',
      ellipsis: true,
      render: (text) => <Text code className="text-xs whitespace-normal break-all">{text || '-'}</Text>
    },
    {
      title: <span className="font-semibold whitespace-nowrap">Part Name</span>,
      dataIndex: 'part_name',
      key: 'part_name',
      ellipsis: true,
      render: (text) => <Text className="text-sm whitespace-normal break-words">{text || '-'}</Text>
    },
    {
      title: <span className="font-semibold whitespace-nowrap">Assembly</span>,
      dataIndex: 'assembly_name',
      key: 'assembly_name',
      ellipsis: true,
      render: (text) => text ? <Text className="text-sm text-blue-600 whitespace-normal break-words">{text}</Text> : <Text type="secondary" className="text-xs">-</Text>
    },
    {
      title: <span className="font-semibold whitespace-nowrap">Operation</span>,
      dataIndex: 'operation_name',
      key: 'operation_name',
      ellipsis: true,
      render: (text, record) => (
        <div className="text-sm whitespace-normal">
          {record.operation_number && <span className="font-mono text-xs bg-gray-100 px-1 rounded inline-block mb-0.5">{record.operation_number}</span>}
          {text && <div className="break-words">{text}</div>}
          {!text && <span className="text-gray-400 text-xs">-</span>}
        </div>
      )
    }
  ];

  const filteredTools = getFilteredTools();

  return (
    <Modal
      title={
        <div className="flex items-center gap-2">
          <ToolOutlined className="text-blue-600" />
          <span>All Tools for {product?.product_name}</span>
          <Tag color="blue" className="ml-2">{filteredTools.length} Tools</Tag>
        </div>
      }
      open={visible}
      onCancel={onClose}
      width="95%"
      style={{ maxWidth: 1600 }}
      styles={{ body: { padding: '16px', overflow: 'hidden' } }}
      footer={[
        <Button key="close" onClick={onClose}>
          Close
        </Button>
      ]}
    >
      <div className="mb-4">
        <div className="flex justify-between items-center mb-3">
          <div>
            <Text type="secondary">
              Showing all tools linked to parts and operations in this product's Bill of Materials
            </Text>
          </div>
          <Space>
            <ToolsDownload 
              tools={filteredTools} 
              product={product}
              disabled={filteredTools.length === 0}
            />
          </Space>
        </div>
        
        <div className="relative">
          <SearchOutlined className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search tools by name, number, part, assembly, or operation..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Spin size="large" />
        </div>
      ) : filteredTools.length > 0 ? (
        <div className="w-full overflow-x-auto">
          <Table
            columns={columns}
            dataSource={filteredTools}
            rowKey={(record) => `${record.tool?.id || record.id || Math.random()}-${record.part_id || ''}-${record.operation_id || ''}`}
            pagination={false}
            scroll={{ y: 450 }}
            size="small"
            className="tools-table w-full"
            tableLayout="auto"
          />
        </div>
      ) : (
        <Empty 
          description={searchTerm ? "No tools found matching your search" : "No tools found for this product"} 
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      )}

      {/* Custom styles for the table - using global CSS class */}
    </Modal>
  );
};

export default ProductToolsViewer;
