import React, { useState, useEffect } from 'react';
import {
  Modal, Table, Button, Space, App, Input, Tag, Spin, Badge, Tooltip,
  Tree, Typography
} from 'antd';
import {
  SearchOutlined, PlusOutlined, ToolOutlined, ReloadOutlined,
  BlockOutlined, FileTextOutlined, CheckOutlined, BuildOutlined,
  ExperimentOutlined, InboxOutlined
} from '@ant-design/icons';
import axios from 'axios';
import { API_BASE_URL } from '../Config/auth';

const { Search } = Input;
const { Title, Text } = Typography;

/* ─── constants ─────────────────────────────────────────── */
const CATEGORY_COLORS = {
  Tools: { bg: '#e6f4ff', text: '#1677ff', border: '#91caff', dot: '#1677ff' },
  Instruments: { bg: '#f6ffed', text: '#389e0d', border: '#b7eb8f', dot: '#52c41a' },
  Misc: { bg: '#fff7e6', text: '#d46b08', border: '#ffd591', dot: '#fa8c16' },
};

const OperationToolsSelector = ({
  visible,
  onCancel,
  onConfirm,
  existingTools = [],
  operationId,
  partId
}) => {
  const { message } = App.useApp();
  const [tree, setTree] = useState([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [tools, setTools] = useState([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [filteredData, setFilteredData] = useState([]);
  const [selectedToolIds, setSelectedToolIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tableHeight, setTableHeight] = useState(400);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [expandedKeys, setExpandedKeys] = useState([]);
  const [pageSize, setPageSize] = useState(window.innerWidth < 768 ? 10 : 20);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => { if (visible) fetchTree(); }, [visible]);

  const handleTreeSelect = (keys) => {
    setSelectedKeys(keys);
    
    if (keys.length > 0) {
      const key = keys[0];
      if (key.startsWith('category-')) {
        const category = key.replace('category-', '');
        setSelectedCategory({ category, sub_category: null });
        // Always fetch, even if it's the same category
        fetchByCategory(category);
      } else if (key.startsWith('sub-')) {
        const [category, sub_category] = key.replace('sub-', '').split('|');
        setSelectedCategory({ category, sub_category });
        // Always fetch, even if it's the same sub-category
        fetchBySubCategory(category, sub_category);
      }
    } else {
      // Clear data when nothing is selected
      setTools([]);
      setFilteredData([]);
      setSelectedCategory(null);
    }
  };

  useEffect(() => {
    // Calculate table height based on viewport
    const updateTableHeight = () => {
      const viewportHeight = window.innerHeight;
      const modalHeaderHeight = 60;
      const modalFooterHeight = 60;
      const contentPadding = 32;
      const headerHeight = 80;
      const paginationHeight = 50;
      const availableHeight = viewportHeight * 0.75 - modalHeaderHeight - modalFooterHeight - contentPadding - headerHeight - paginationHeight;
      setTableHeight(Math.max(300, availableHeight));
    };

    updateTableHeight();
    window.addEventListener('resize', updateTableHeight);
    return () => window.removeEventListener('resize', updateTableHeight);
  }, []);

  useEffect(() => {
    if (!searchText.trim()) { 
      setFilteredData(tools); 
      return; 
    }
    const lower = searchText.toLowerCase();
    setFilteredData(
      tools.filter(t =>
        Object.values(t).some(v =>
          v != null && String(v).toLowerCase().includes(lower)
        )
      )
    );
  }, [searchText, tools]);

  const fetchTree = async () => {
    setTreeLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/tools-list/categories/tree`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTree(data);
    } catch (e) {
      message.error('Failed to load categories: ' + e.message);
    } finally {
      setTreeLoading(false);
    }
  };

  const fetchByCategory = async (category) => {
    setTableLoading(true);
    setTools([]);
    setFilteredData([]);
    try {
      const res = await fetch(`${API_BASE_URL}/tools-list/?category=${encodeURIComponent(category)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const sorted = Array.isArray(data) ? [...data].sort((a, b) => (a.id || 0) - (b.id || 0)) : [];
      setTools(sorted);
      setFilteredData(sorted);
    } catch (e) {
      message.error('Failed to load category tools: ' + e.message);
    } finally {
      setTableLoading(false);
    }
  };

  const fetchBySubCategory = async (category, sub_category) => {
    setTableLoading(true);
    setTools([]);
    setFilteredData([]);
    try {
      const url = `${API_BASE_URL}/tools-list/category/${encodeURIComponent(category)}/sub/${encodeURIComponent(sub_category)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const sorted = Array.isArray(data) ? [...data].sort((a, b) => (a.id || 0) - (b.id || 0)) : [];
      setTools(sorted);
      setFilteredData(sorted);
    } catch (e) {
      message.error('Failed to load sub-category tools: ' + e.message);
    } finally {
      setTableLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (selectedToolIds.length === 0) {
      message.info('Please select at least one tool');
      return;
    }

    setLoading(true);
    try {
      const getCurrentUserId = () => {
        try {
          const stored = localStorage.getItem('user');
          if (!stored) return null;
          const u = JSON.parse(stored);
          if (u?.id == null) return null;
          return u.id;
        } catch {
          return null;
        }
      };

      const uid = getCurrentUserId();
      const newLinks = selectedToolIds
        .filter(toolId => !existingTools.some(t => t.tool_id === toolId))
        .map(toolId => ({
          tool_id: toolId,
          part_id: partId,
          operation_id: operationId,
          user_id: uid,
        }));

      if (newLinks.length === 0) {
        message.info('Selected tools are already assigned');
        return;
      }

      await axios.post(
        `${API_BASE_URL}/tools/bulk-links`,
        newLinks,
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );
      
      message.success(`Successfully added ${newLinks.length} tools`);
      onConfirm(newLinks);
      handleCancel();
    } catch (e) {
      const detail = e?.response?.data?.detail || e?.message || 'Failed to add tools';
      message.error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setSelectedToolIds([]);
    setSearchText('');
    setSelectedKeys([]);
    onCancel();
  };

  const isToolAlreadyAssigned = (toolId) => {
    return existingTools.some(t => t.tool_id === toolId);
  };

  const availableTools = filteredData.filter(tool => !isToolAlreadyAssigned(tool.id));

  const getCategoryIcon = (category) => {
    switch(category) {
      case 'Tools': return <BuildOutlined />;
      case 'Instruments': return <ExperimentOutlined />;
      default: return <InboxOutlined />;
    }
  };

  const treeData = tree.map(catNode => ({
    title: (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 8, 
        padding: '4px 0',
        width: '100%',
        cursor: 'pointer'
      }}>
        <div style={{
          width: 20, height: 20, flexShrink: 0,
          color: CATEGORY_COLORS[catNode.category]?.text || '#555',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14,
          borderRadius: 4,
          background: CATEGORY_COLORS[catNode.category]?.bg || '#f5f5f5',
          pointerEvents: 'none'
        }}>
          {getCategoryIcon(catNode.category)}
        </div>
        <span style={{ 
          fontWeight: 600, 
          fontSize: 14, 
          flex: 1,
          pointerEvents: 'none'
        }}>{catNode.category}</span>
        <Badge 
          count={catNode.total_count} 
          size="small" 
          overflowCount={999999}
          title=""
          style={{ 
            backgroundColor: CATEGORY_COLORS[catNode.category]?.text || '#555',
            fontSize: '10px',
            pointerEvents: 'none'
          }} 
        />
      </div>
    ),
    key: `category-${catNode.category}`,
    children: catNode.sub_categories.map(subNode => ({
      title: (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 8, 
          padding: '2px 0',
          width: '100%',
          cursor: 'pointer'
        }}>
        <div style={{
          width: 16, height: 16, flexShrink: 0,
          color: '#666',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12,
          pointerEvents: 'none'
        }}>
          <FileTextOutlined />
        </div>
        <span style={{ 
          fontSize: 13, 
          fontWeight: 500, 
          flex: 1,
          pointerEvents: 'none'
        }}>{subNode.sub_category}</span>
        <Badge 
          count={subNode.count} 
          size="small" 
          overflowCount={999999}
          title=""
          style={{ 
            backgroundColor: '#52c41a',
            fontSize: '9px',
            pointerEvents: 'none'
          }} 
        />
      </div>
      ),
      key: `sub-${catNode.category}|${subNode.sub_category}`,
    }))
  }));

  const columns = [
    {
      title: 'SL No',
      key: 'sl_no',
      width: 50,
      align: 'center',
      render: (_, __, i) => <span style={{ color: '#8c8c8c', fontSize: 11 }}>{(currentPage - 1) * pageSize + i + 1}</span>,
    },
    {
      title: 'Item Description',
      dataIndex: 'item_description',
      key: 'item_description',
      width: 150,
      ellipsis: true,
      render: (text) => <span style={{ fontWeight: 500, fontSize: 11 }}>{text}</span>,
    },
    {
      title: 'Range / Size',
      dataIndex: 'range',
      key: 'range',
      width: 80,
      ellipsis: true,
      render: v => v || <span style={{ color: '#bbb' }}>—</span>,
    },
    {
      title: 'ID Code',
      dataIndex: 'identification_code',
      key: 'identification_code',
      width: 100,
      ellipsis: true,
      render: v => v || <span style={{ color: '#bbb' }}>—</span>,
    },
    {
      title: 'Make',
      dataIndex: 'make',
      key: 'make',
      width: 70,
      ellipsis: true,
      render: v => v || <span style={{ color: '#bbb' }}>—</span>,
    },
    {
      title: 'Available',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 70,
      align: 'center',
      render: (v) => {
        const n = v ?? 0;
        return <Tag color={n === 0 ? 'red' : n <= 5 ? 'orange' : 'green'} style={{ borderRadius: 6, fontWeight: 600, minWidth: 30, textAlign: 'center', fontSize: 10 }}>{n}</Tag>;
      },
    },
    {
      title: 'Location',
      dataIndex: 'location',
      key: 'location',
      width: 70,
      ellipsis: true,
      render: v => v ? <Tag style={{ borderRadius: 5, fontSize: 9 }}>{v}</Tag> : <span style={{ color: '#bbb' }}>—</span>,
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 80,
      render: v => v ? <Tag color={v === 'CONSUMABLES' ? 'green' : 'blue'} style={{ borderRadius: 5, fontSize: 9, fontWeight: 600 }}>{v}</Tag> : null,
    },
    {
      title: 'Action',
      key: 'action',
      width: 70,
      align: 'center',
      fixed: 'right',
      render: (_, record) => {
        const isAssigned = isToolAlreadyAssigned(record.id);
        const isSelected = selectedToolIds.includes(record.id);
        
        if (isAssigned) {
          return <CheckOutlined style={{ color: '#52c41a', fontSize: 12 }} />;
        }
        
        return (
          <Button
            type={isSelected ? 'primary' : 'default'}
            size="small"
            icon={<PlusOutlined />}
            onClick={() => {
              if (isSelected) {
                setSelectedToolIds(prev => prev.filter(id => id !== record.id));
              } else {
                setSelectedToolIds(prev => [...prev, record.id]);
              }
            }}
            style={{ fontSize: 10 }}
          >
            Add
          </Button>
        );
      },
    },
  ];

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ToolOutlined style={{ color: '#1890ff' }} />
          <span>Select Tools for Operation</span>
        </div>
      }
      open={visible}
      onCancel={handleCancel}
      width="98%"
      style={{ maxWidth: 1400, top: 10 }}
      styles={{ 
        body: { padding: '16px', height: '75vh', maxHeight: '75vh', overflow: 'hidden' }
      }}
      footer={[
        <Button key="cancel" onClick={handleCancel}>
          Cancel
        </Button>,
        <Button
          key="confirm"
          type="primary"
          onClick={handleConfirm}
          loading={loading}
          disabled={selectedToolIds.length === 0}
        >
          Add Selected Tools ({selectedToolIds.length})
        </Button>
      ]}
      destroyOnHidden
    >
      <div style={{ display: 'flex', height: '100%', gap: 16, overflow: 'hidden' }}>
        {/* Left Sidebar - Category Tree */}
        <div style={{ 
          width: window.innerWidth < 768 ? '100%' : 320, 
          minWidth: window.innerWidth < 768 ? '100%' : 280, 
          background: '#fff', 
          border: '1px solid #d9d9d9', 
          borderRadius: 8, 
          overflow: 'hidden',
          display: window.innerWidth < 768 ? (selectedCategory ? 'none' : 'block') : 'block',
          height: '100%'
        }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', background: '#fafafa' }}>
            <Title level={5} style={{ margin: 0, fontSize: 14 }}>Categories</Title>
          </div>
          <div style={{ padding: '8px', height: 'calc(100% - 53px)', overflowY: 'auto' }}>
            {treeLoading ? (
              <div style={{ textAlign: 'center', padding: 20 }}>
                <Spin size="small" />
              </div>
            ) : (
              <Tree
                treeData={treeData}
                selectedKeys={selectedKeys}
                onSelect={handleTreeSelect}
                expandedKeys={expandedKeys}
                onExpand={setExpandedKeys}
                showLine={false}
                showIcon={false}
              />
            )}
          </div>
        </div>

        {/* Mobile Category Breadcrumb */}
        {window.innerWidth < 768 && selectedCategory && (
          <div style={{ 
            position: 'absolute', 
            top: 60, 
            left: 16, 
            right: 16, 
            background: '#fff', 
            padding: '8px 12px', 
            borderRadius: 6, 
            border: '1px solid #d9d9d9',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <Button 
              size="small" 
              icon={<ToolOutlined />} 
              onClick={() => {
                setSelectedKeys([]);
                setSelectedCategory(null);
              }}
            >
              Back to Categories
            </Button>
            <span style={{ fontSize: 12, color: '#666' }}>
              {selectedCategory.category} {selectedCategory.sub_category && `› ${selectedCategory.sub_category}`}
            </span>
          </div>
        )}

        {/* Right Content */}
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column',
          marginTop: window.innerWidth < 768 && selectedCategory ? 50 : 0,
          height: '100%',
          overflow: 'hidden'
        }}>
          {/* Header */}
          <div style={{ 
            marginBottom: 16, 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            flexDirection: window.innerWidth < 576 ? 'column' : 'row',
            gap: window.innerWidth < 576 ? 12 : 0,
            flexShrink: 0
          }}>
            <div style={{ textAlign: window.innerWidth < 576 ? 'center' : 'left' }}>
              <Title level={5} style={{ margin: 0, fontSize: window.innerWidth < 576 ? 16 : 18 }}>
                {selectedCategory ? 
                  `${selectedCategory.category}${selectedCategory.sub_category ? ' › ' + selectedCategory.sub_category : ''}` : 
                  'Select a category to view tools'
                }
              </Title>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {availableTools.length} available tools • {existingTools.length} already assigned
              </Text>
            </div>
            <Space orientation={window.innerWidth < 576 ? 'vertical' : 'horizontal'} style={{ width: window.innerWidth < 576 ? '100%' : 'auto' }}>
              <Search
                placeholder="Search tools..."
                allowClear
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                style={{ width: window.innerWidth < 576 ? '100%' : 200 }}
                size="small"
              />
              <Button
                icon={<ReloadOutlined />}
                size="small"
                onClick={() => {
                  if (selectedCategory?.sub_category) {
                    fetchBySubCategory(selectedCategory.category, selectedCategory.sub_category);
                  } else if (selectedCategory?.category) {
                    fetchByCategory(selectedCategory.category);
                  }
                }}
              />
            </Space>
          </div>

          {/* Table */}
          <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
            <Table
              columns={columns}
              dataSource={availableTools}
              rowKey="id"
              loading={tableLoading}
              size={window.innerWidth < 768 ? 'small' : 'middle'}
              scroll={{ 
                x: window.innerWidth < 768 ? 800 : 'max-content', 
                y: tableHeight 
              }}
              pagination={{
                current: currentPage,
                pageSize: pageSize,
                showSizeChanger: window.innerWidth >= 768,
                pageSizeOptions: window.innerWidth >= 768 ? ['10', '20', '50', '100', '200'] : ['10'],
                showTotal: (total, range) => {
                  if (window.innerWidth < 576) {
                    return `${range[0]}-${range[1]} of ${total}`;
                  }
                  return `${range[0]}-${range[1]} of ${total} items`;
                },
                size: 'small',
                style: { padding: '8px 12px', margin: 0, borderTop: '1px solid #f0f0f0' },
                placement: 'bottom',
                onShowSizeChange: (current, size) => {
                  setPageSize(size);
                  setCurrentPage(1);
                },
                onChange: (page, size) => {
                  setCurrentPage(page);
                  setPageSize(size);
                }
              }}
              rowClassName={(record) => {
                if (isToolAlreadyAssigned(record.id)) return 'disabled-row';
                if (selectedToolIds.includes(record.id)) return 'selected-row';
                return '';
              }}
            />
          </div>
        </div>
      </div>

      <style>{`
        .disabled-row {
          background-color: #f5f5f5 !important;
          opacity: 0.6;
        }
        .selected-row {
          background-color: #e6f7ff !important;
        }
        .ant-table-row:hover td {
          background: #f0f5ff !important;
        }
        .disabled-row:hover td {
          background: #f5f5f5 !important;
        }
        .selected-row:hover td {
          background: #e6f7ff !important;
        }
        @media (max-width: 768px) {
          .ant-table-cell {
            padding: 8px 6px !important;
            font-size: 12px !important;
          }
          .ant-table-thead > tr > th {
            padding: 8px 6px !important;
            font-size: 12px !important;
          }
        }
      `}</style>
    </Modal>
  );
};

export default OperationToolsSelector;
