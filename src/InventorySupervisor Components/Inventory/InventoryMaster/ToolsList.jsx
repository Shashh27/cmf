import React, { useState, useEffect, useRef } from 'react';
import {
  Table, Button, Space, message, Input, Upload, Tag, Breadcrumb, Spin, Badge, Popconfirm, Tooltip
} from 'antd';
import {
  EditOutlined, DeleteOutlined, SearchOutlined, UploadOutlined,
  PlusOutlined, DownloadOutlined, ReloadOutlined,
  RightOutlined, FolderOutlined, FileTextOutlined,
  AppstoreOutlined, ToolOutlined, ExperimentOutlined, InboxOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, PlusSquareOutlined, MinusSquareOutlined,
  BlockOutlined, ExpandOutlined, CompressOutlined,
  CaretRightOutlined, CaretDownOutlined
} from '@ant-design/icons';
import { API_BASE_URL } from '../../../Config/auth';
import ToolsHistory from './ToolsHistory';
import * as XLSX from 'xlsx';

const { Search } = Input;

/* ─── constants ─────────────────────────────────────────── */
const CATEGORY_COLORS = {
  Tools:       { bg: '#e6f4ff', text: '#1677ff', border: '#91caff', dot: '#1677ff' },
  Instruments: { bg: '#f6ffed', text: '#389e0d', border: '#b7eb8f', dot: '#52c41a' },
  Misc:        { bg: '#fff7e6', text: '#d46b08', border: '#ffd591', dot: '#fa8c16' },
};

/* ═══════════════════════════════════════════════════════════
   SIDEBAR — 2-level tree
═══════════════════════════════════════════════════════════ */
function SidebarTree({ tree, selected, onSelect, loading, expandedCats, toggleCat, searchText }) {
  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center' }}><Spin size="small" /></div>;
  }

  const sidebarFontStack = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

  // Define colors for "Tools" and "Instruments"
  const CATEGORY_STYLES = {
    'Tools': { icon: <ToolOutlined />, color: '#1677ff', bg: '#e6f4ff' },
    'Instruments': { icon: <ExperimentOutlined />, color: '#52c41a', bg: '#f6ffed' }
  };

  const highlightSubText = (text, query) => {
    if (!query) return text;
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);
    if (index === -1) return text;

    return (
      <>
        {text.substring(0, index)}
        <span style={{ backgroundColor: '#fff566', color: '#000', padding: '0 1px', borderRadius: 2 }}>{text.substring(index, index + query.length)}</span>
        {text.substring(index + query.length)}
      </>
    );
  };

  return (
    <div style={{ padding: '4px 8px 16px 8px', fontFamily: sidebarFontStack }}>
      {tree.map(catNode => {
        const catExpanded = !!expandedCats[catNode.category];
        const isCatSelected = selected?.category === catNode.category && !selected?.sub_category;
        const style = CATEGORY_STYLES[catNode.category] || { icon: <AppstoreOutlined />, color: '#595959', bg: '#f0f0f0' };

        return (
          <div key={catNode.category} style={{ marginBottom: 4 }}>
            {/* ── LEVEL 1: Category ── */}
            <div
              onClick={() => {
                toggleCat(catNode.category);
                onSelect({ category: catNode.category, sub_category: null });
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px',
                borderRadius: 8,
                cursor: 'pointer', userSelect: 'none',
                background: isCatSelected ? '#f0f7ff' : 'transparent',
                color: isCatSelected ? '#1677ff' : '#434343',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
              onMouseEnter={e => { if (!isCatSelected) e.currentTarget.style.background = '#f5f5f5'; }}
              onMouseLeave={e => { if (!isCatSelected) e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ fontSize: 10, color: '#8c8c8c', width: 14, display: 'flex', alignItems: 'center', transition: 'transform 0.2s' }}>
                {catExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
              </div>

              <div style={{
                width: 24, height: 24, flexShrink: 0,
                background: 'transparent',
                borderRadius: 6,
                color: isCatSelected ? '#1677ff' : style.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20,
                transition: 'all 0.2s'
              }}>
                {style.icon}
              </div>

              <span style={{ flex: 1, fontSize: 14, fontWeight: 700, letterSpacing: '-0.2px' }}>
                {catNode.category}
              </span>

              <Badge
                count={catNode.sub_categories.length}
                style={{
                  backgroundColor: isCatSelected ? '#1677ff' : style.color,
                  fontSize: 10,
                  height: 18,
                  minWidth: 18,
                  lineHeight: '18px',
                  borderRadius: 9,
                  boxShadow: 'none',
                  opacity: 0.8
                }}
              />
            </div>

            {/* ── LEVEL 2: Sub-categories ── */}
            {catExpanded && (
              <div style={{ marginLeft: 30, borderLeft: '1.5px solid #f0f0f0', marginTop: 2, paddingLeft: 4 }}>
                {catNode.sub_categories.map((subNode) => {
                  const subActive = selected?.category === catNode.category && selected?.sub_category === subNode.sub_category;
                  return (
                    <div
                      key={subNode.sub_category}
                      onClick={() => onSelect({ category: catNode.category, sub_category: subNode.sub_category })}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 12px',
                        marginTop: 2,
                        borderRadius: 6,
                        cursor: 'pointer', userSelect: 'none',
                        background: subActive ? '#f0f7ff' : (subNode.hasItemMatch ? '#fffbe6' : 'transparent'),
                        color: subActive ? '#1677ff' : '#595959',
                        transition: 'all 0.15s',
                        border: subNode.hasItemMatch && !subActive ? '1px dashed #ffe58f' : '1px solid transparent'
                      }}
                      onMouseEnter={e => { if (!subActive) e.currentTarget.style.background = subNode.hasItemMatch ? '#fff1b8' : '#f5f5f5'; }}
                      onMouseLeave={e => { if (!subActive) e.currentTarget.style.background = subNode.hasItemMatch ? '#fffbe6' : 'transparent'; }}
                    >
                      <ToolOutlined style={{ fontSize: 14, opacity: subActive ? 1 : 0.6, color: subActive ? '#1677ff' : style.color }} />
                      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <span style={{
                          fontSize: 13,
                          fontWeight: (subActive || subNode.hasItemMatch) ? 700 : 500,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                        }}>
                          {highlightSubText(subNode.sub_category, searchText)}
                        </span>
                        {subNode.hasItemMatch && (
                          <span style={{ fontSize: 10, color: '#d48806', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            Matches: {subNode.itemMatches[0].item_description}
                          </span>
                        )}
                      </div>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '1px 8px',
                        borderRadius: 10, 
                        background: subActive ? '#e6f4ff' : 'transparent',
                        color: subActive ? '#1677ff' : style.color,
                        border: subActive ? '1px solid #91caff' : `1px solid ${style.color}40`,
                        flexShrink: 0
                      }}>
                        {subNode.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════ */
const ToolsList = ({ onEdit, onDelete, onCreateNew }) => {
  const [tree,         setTree]         = useState([]);
  const [treeLoading,  setTreeLoading]  = useState(false);
  const [expandedCats, setExpandedCats] = useState({});
  const [selected,     setSelected]     = useState(null);
  const [tools,        setTools]        = useState([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [searchText,   setSearchText]   = useState('');
  const [treeSearchText, setTreeSearchText] = useState('');
  const [filteredData, setFilteredData] = useState([]);
  const [pagination,   setPagination]   = useState({ current: 1, pageSize: 10 });
  const [collapsed,    setCollapsed]    = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [historyTool,    setHistoryTool]    = useState(null);

  const fetchingTree  = useRef(false);
  const fetchingTable = useRef(false);

  useEffect(() => { fetchTree(); }, []);

  const DEFAULT_CATEGORIES = [
    { category: 'Tools', sub_categories: [], total_count: 0 },
    { category: 'Instruments', sub_categories: [], total_count: 0 },
  ];

  const displayTree = (tree.length > 0 ? tree : DEFAULT_CATEGORIES).filter(cat => cat.category !== 'Misc');

  // Filter tree based on sidebar search
  const filteredTree = React.useMemo(() => {
    if (!treeSearchText.trim()) return displayTree;
    const lowerSearch = treeSearchText.toLowerCase();

    return displayTree.map(catNode => {
      // Search within sub-categories OR search within the items (leaf nodes) inside those sub-categories
      const filteredSubCats = catNode.sub_categories.map(sub => {
        const subMatches = sub.sub_category.toLowerCase().includes(lowerSearch);
        const matchingItems = sub.items?.filter(item =>
          item.item_description.toLowerCase().includes(lowerSearch)
        ) || [];

        if (subMatches || matchingItems.length > 0) {
          return {
            ...sub,
            hasItemMatch: matchingItems.length > 0,
            itemMatches: matchingItems
          };
        }
        return null;
      }).filter(Boolean);

      if (filteredSubCats.length > 0) {
        return {
          ...catNode,
          sub_categories: filteredSubCats,
          hasSubMatch: true
        };
      }
      return null;
    }).filter(Boolean);
  }, [displayTree, treeSearchText]);

  // Auto-expand categories that have matching sub-categories
  useEffect(() => {
    if (treeSearchText.trim()) {
      const newExpanded = { ...expandedCats };
      filteredTree.forEach(catNode => {
        if (catNode.hasSubMatch) {
          newExpanded[catNode.category] = true;
        }
      });
      setExpandedCats(newExpanded);
    }
  }, [treeSearchText]);

  useEffect(() => {
    if (selected?.sub_category && selected?.category) {
      fetchBySubCategory(selected.category, selected.sub_category);
    } else if (selected?.category) {
      fetchByCategory(selected.category);
    } else {
      setTools([]);
      setFilteredData([]);
    }
  }, [selected]);

  useEffect(() => {
    if (!searchText.trim()) { setFilteredData(tools); return; }
    const lower = searchText.toLowerCase();
    setFilteredData(
      tools.filter(t =>
        Object.values(t).some(v =>
          v != null && String(v).toLowerCase().includes(lower)
        )
      )
    );
    setPagination(p => ({ ...p, current: 1 }));
  }, [searchText, tools]);

  const fetchTree = async () => {
    if (fetchingTree.current) return;
    fetchingTree.current = true;
    setTreeLoading(true);
    try {
      const res  = await fetch(`${API_BASE_URL}/tools-list/categories/tree`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTree(data);
    } catch (e) {
      message.error('Failed to load categories: ' + e.message);
    } finally {
      setTreeLoading(false);
      fetchingTree.current = false;
    }
  };

  const fetchByCategory = async (category) => {
    if (fetchingTable.current) return;
    fetchingTable.current = true;
    setTableLoading(true);
    setTools([]);
    setFilteredData([]);
    try {
      const url = `${API_BASE_URL}/tools-list/?category=${encodeURIComponent(category)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const sorted = Array.isArray(data)
        ? [...data].sort((a, b) => (a.id || 0) - (b.id || 0))
        : [];
      setTools(sorted);
      setFilteredData(sorted);
      setPagination(p => ({ ...p, current: 1 }));
    } catch (e) {
      message.error('Failed to load category tools: ' + e.message);
    } finally {
      setTableLoading(false);
      fetchingTable.current = false;
    }
  };

  const fetchBySubCategory = async (category, sub_category) => {
    if (fetchingTable.current) return;
    fetchingTable.current = true;
    setTableLoading(true);
    setTools([]);
    setFilteredData([]);
    try {
      const url = `${API_BASE_URL}/tools-list/category/${encodeURIComponent(category)}/sub/${encodeURIComponent(sub_category)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const sorted = Array.isArray(data)
        ? [...data].sort((a, b) => (a.id || 0) - (b.id || 0))
        : [];
      setTools(sorted);
      setFilteredData(sorted);
      setPagination(p => ({ ...p, current: 1 }));
    } catch (e) {
      message.error('Failed to load sub-category tools: ' + e.message);
    } finally {
      setTableLoading(false);
      fetchingTable.current = false;
    }
  };

  const handleBulkUpload = async (file) => {
    setTableLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${API_BASE_URL}/tools-list/upload-excel`, {
        method: 'POST', body: formData,
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || 'Upload failed'); }
      const result = await res.json();
      message.success(`Uploaded ${result.length} tools successfully`);
      fetchTree();
    } catch (e) {
      message.error('Upload failed: ' + e.message);
    } finally {
      setTableLoading(false);
    }
  };

  const handleExportExcel = () => {
    if (!tools || tools.length === 0) {
      message.warning('No data to export');
      return;
    }
    const exportData = tools.map((t, index) => ({
      'SL No': index + 1,
      'Item Description': t.item_description || '',
      'Range / Size': t.range || '',
      'ID Code': t.identification_code || '',
      'Make': t.make || '',
      'Total Qty': t.total_quantity ?? t.quantity ?? 0,
      'Available': t.quantity ?? 0,
      'Issued': t.issues_qty ?? 0,
      'Location': t.location || '',
      'Gauge': t.gauge || '',
      'Remarks': t.remarks || '',
      'Amount': t.amount != null ? `₹${Number(t.amount).toFixed(2)}` : '',
      'Type': t.type || '',
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tools List');
    XLSX.writeFile(wb, 'Inventory_Master_Data.xlsx');
    message.success('Exported successfully');
  };

  const toggleCat = (cat) => setExpandedCats(p => ({ ...p, [cat]: !p[cat] }));
  const expandAll = () => {
    const newCats = {};
    tree.forEach(catNode => { newCats[catNode.category] = true; });
    setExpandedCats(newCats);
  };
  const collapseAll = () => setExpandedCats({});

  const columns = [
    {
      title: 'SL No', key: 'sl_no', width: 90, fixed: 'left', align: 'center',
      render: (_, __, i) => <span style={{ color: '#8c8c8c', fontSize: 11, fontWeight: 500 }}>{(pagination.current - 1) * pagination.pageSize + i + 1}</span>,
    },
    {
      title: 'Item Description', dataIndex: 'item_description', key: 'item_description', width: 220, fixed: 'left', ellipsis: true, align: 'center',
      render: (text, record) => (
        <Button
          type="link"
          style={{ padding: 0, fontSize: 13, fontWeight: 600, color: '#1677ff', height: 'auto', textAlign: 'center', width: '100%' }}
          onClick={() => { setHistoryTool(record); setHistoryVisible(true); }}
        >
          {text}
        </Button>
      ),
    },
    { title: 'Range / Size', dataIndex: 'range', key: 'range', width: 120, ellipsis: true, align: 'center', render: v => <span style={{ fontSize: 12 }}>{v || <span style={{ color: '#bfbfbf' }}>—</span>}</span> },
    { title: 'ID Code', dataIndex: 'identification_code', key: 'identification_code', width: 150, ellipsis: true, align: 'center', render: v => <code style={{ fontSize: 12, background: '#f5f5f5', padding: '2px 4px', borderRadius: 4, color: '#595959' }}>{v || '—'}</code> },
    { title: 'Make', dataIndex: 'make', key: 'make', width: 110, ellipsis: true, align: 'center', render: v => <span style={{ fontSize: 12 }}>{v || <span style={{ color: '#bfbfbf' }}>—</span>}</span> },
    { title: 'Total Qty', dataIndex: 'total_quantity', key: 'total_quantity', width: 120, align: 'center', render: (v, r) => <span style={{ fontWeight: 600, fontSize: 13 }}>{v ?? r.quantity ?? 0}</span> },
    {
      title: 'Available', dataIndex: 'quantity', key: 'quantity', width: 110, align: 'center',
      render: (v) => <span style={{ fontSize: 13, fontWeight: 600, color: '#595959' }}>{v ?? 0}</span>,
    },
    { title: 'Issues', dataIndex: 'issues_qty', key: 'issues_qty', width: 100, align: 'center', render: v => <span style={{ color: '#8c8c8c', fontSize: 12 }}>{v ?? 0}</span> },
    {
      title: 'Location', dataIndex: 'location', key: 'location', width: 130, ellipsis: true, align: 'center',
      render: v => v ? <Tag color="blue" style={{ borderRadius: 4, fontSize: 11, margin: 0 }}>{v}</Tag> : <span style={{ color: '#bfbfbf' }}>—</span>
    },
    { title: 'Gauge', dataIndex: 'gauge', key: 'gauge', width: 110, ellipsis: true, align: 'center', render: v => <span style={{ fontSize: 12 }}>{v || <span style={{ color: '#bfbfbf' }}>—</span>}</span> },
    { title: 'Remarks', dataIndex: 'remarks', key: 'remarks', width: 180, ellipsis: true, align: 'center', render: v => <span style={{ fontSize: 12, color: '#8c8c8c' }}>{v || <span style={{ color: '#d9d9d9' }}>—</span>}</span> },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 120, align: 'center', render: v => v != null ? <span style={{ fontWeight: 600, color: '#389e0d', fontSize: 13 }}>₹{Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span> : <span style={{ color: '#bfbfbf' }}>—</span> },
    {
      title: 'Type', dataIndex: 'type', key: 'type', width: 150, align: 'center',
      render: v => {
        if (!v) return null;
        const isConsumable = v.toUpperCase() === 'CONSUMABLES';
        return (
          <Tag
            icon={isConsumable ? <ExperimentOutlined /> : <ToolOutlined />}
            color={isConsumable ? 'cyan' : 'geekblue'}
            style={{ borderRadius: 12, padding: '0 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}
          >
            {v}
          </Tag>
        );
      }
    },
    {
      title: 'Actions', key: 'actions', width: 120, fixed: 'right', align: 'center',
      render: (_, record) => (
        <Space size={8}>
          <Tooltip title="Edit Record">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              style={{ color: '#1677ff', background: '#e6f4ff', borderRadius: 6 }}
              onClick={() => onEdit(record)}
            />
          </Tooltip>
          <Popconfirm
            title="Delete this record?"
            description="Are you sure you want to delete this tool?"
            onConfirm={() => onDelete(record)}
            okText="Delete"
            cancelText="Cancel"
            okButtonProps={{ danger: true, size: 'small' }}
            cancelButtonProps={{ size: 'small' }}
          >
            <Tooltip title="Delete Record">
              <Button
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                style={{ color: '#ff4d4f', background: '#fff1f0', borderRadius: 6 }}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const breadcrumbItems = [
    { title: 'Inventory' },
    selected?.category     ? { title: selected.category }     : null,
    selected?.sub_category ? { title: selected.sub_category } : null,
  ].filter(Boolean);

  const mainFontStack = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', fontFamily: mainFontStack }}>
      {/* ── SIDEBAR ── */}
      <div style={{
        width: collapsed ? 0 : 320,
        minWidth: collapsed ? 0 : 320,
        background: '#fff',
        borderRadius: '12px',
        marginRight: collapsed ? 0 : '16px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        zIndex: 10,
        boxShadow: collapsed ? 'none' : '0 1px 4px rgba(0,0,0,0.05)',
        border: '1px solid #e8eaed'
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', letterSpacing: '-0.2px' }}>Categories</span>
          <Space size={4}>
            <Tooltip title="Expand All"><Button type="text" size="small" icon={<ExpandOutlined />} onClick={expandAll} style={{ color: '#595959' }} /></Tooltip>
            <Tooltip title="Collapse All"><Button type="text" size="small" icon={<CompressOutlined />} onClick={collapseAll} style={{ color: '#595959' }} /></Tooltip>
            <Button type="text" size="small" icon={<MenuFoldOutlined />} style={{ color: '#8c8c8c' }} onClick={() => setCollapsed(true)} />
          </Space>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0' }}>
          <SidebarTree tree={filteredTree} selected={selected} onSelect={(node) => { setSelected(node); setSearchText(''); }} loading={treeLoading} expandedCats={expandedCats} toggleCat={toggleCat} searchText={treeSearchText} />
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column', 
        overflow: 'hidden', 
        position: 'relative',
        background: '#fff',
        borderRadius: '12px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        border: '1px solid #e8eaed'
      }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px' }}>
            <div style={{
              width: 100, height: 100, borderRadius: '30%',
              background: 'linear-gradient(135deg, #f0f7ff 0%, #e6f4ff 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 24,
              boxShadow: '0 8px 16px rgba(22,119,255,0.1)'
            }}>
              <InboxOutlined style={{ fontSize: 48, color: '#1677ff' }} />
            </div>
            <p style={{ fontSize: 15, color: '#8c8c8c', maxWidth: 400, textAlign: 'center', lineHeight: 1.6 }}>
              Select a category or sub-category from the tree to view inventory records.
            </p>
          </div>
        ) : (
          <>
            {/* Header Bar */}
            <div style={{
              background: '#fff',
              padding: '12px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid #f0f0f0',
              zIndex: 5
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {collapsed && (
                  <Button
                    type="primary"
                    shape="circle"
                    size="small"
                    icon={<MenuUnfoldOutlined />}
                    onClick={() => setCollapsed(false)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  />
                )}
                <Breadcrumb
                  items={breadcrumbItems}
                  separator={<RightOutlined style={{ fontSize: 10, color: '#bfbfbf' }} />}
                  style={{ fontSize: 13, fontWeight: 500 }}
                />
              </div>
              <Search
                placeholder="Search tools, IDs, locations..."
                allowClear
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                style={{ width: 280 }}
                size="middle"
              />
            </div>

            {/* Main Content Area */}
            <div style={{ flex: 1, padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
              {/* Title & Actions Row */}
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
                <div>
                  <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1a1a2e', margin: 0, letterSpacing: '-0.5px' }}>
                    {selected?.sub_category || selected?.category}
                  </h1>
                  <p style={{ fontSize: 13, color: '#8c8c8c', margin: '4px 0 0 0', fontWeight: 500 }}>
                    {selected.category} {selected.sub_category && <span style={{ opacity: 0.5 }}> / </span>} {selected.sub_category}
                  </p>
                </div>
                <Space size={12}>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    size="large"
                    onClick={() => onCreateNew(selected)}
                    style={{ borderRadius: 10, fontWeight: 600, height: 44, padding: '0 20px', boxShadow: '0 4px 12px rgba(22,119,255,0.2)' }}
                  >
                    Add Row
                  </Button>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Upload beforeUpload={file => { handleBulkUpload(file); return false; }} showUploadList={false} accept=".xlsx,.xls">
                      <Button icon={<UploadOutlined />} size="large" style={{ borderRadius: 10, fontWeight: 500, height: 44 }}>Import</Button>
                    </Upload>
                    <Button icon={<DownloadOutlined />} size="large" onClick={handleExportExcel} style={{ borderRadius: 10, fontWeight: 500, height: 44 }}>Export</Button>
                    <Button
                      icon={<ReloadOutlined />}
                      size="large"
                      onClick={() => (selected?.sub_category ? fetchBySubCategory(selected.category, selected.sub_category) : fetchByCategory(selected.category))}
                      style={{ borderRadius: 10, height: 44, width: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    />
                  </div>
                </Space>
              </div>

              {/* Table Container */}
              <div style={{
                background: '#fff',
                borderRadius: '12px',
                border: '1px solid #f0f0f0',
                overflow: 'hidden',
                flex: 1,
                display: 'flex',
                flexDirection: 'column'
              }}>
                <Table
                  columns={columns}
                  dataSource={filteredData}
                  rowKey="id"
                  loading={tableLoading}
                  size="middle"
                  scroll={{ x: 'max-content', y: 'calc(100vh - 450px)' }}
                  pagination={{
                    current: pagination.current,
                    pageSize: pagination.pageSize,
                    showSizeChanger: true,
                    pageSizeOptions: ['10', '20', '50', '100'],
                    showTotal: (total, range) => (
                      <span style={{ fontSize: 13, color: '#8c8c8c' }}>
                        Showing <b>{range[0]}-{range[1]}</b> of <b>{total}</b> items
                      </span>
                    ),
                    style: { padding: '16px 24px', margin: 0, borderTop: '1px solid #f0f0f0' },
                    onChange: (page, size) => setPagination({ current: page, pageSize: size }),
                  }}
                  rowClassName={(_, i) => i % 2 === 0 ? '' : 'row-alt'}
                />
              </div>
            </div>
          </>
        )}
      </div>
      <ToolsHistory tool={historyTool} visible={historyVisible} onClose={() => { setHistoryVisible(false); setHistoryTool(null); }} />
      <style>{`
        .row-alt td { background: #fafafa !important; }
        .ant-table-row:hover td { background: #f0f7ff !important; }
        .ant-table-thead > tr > th { 
          background: #f8f9fb !important; 
          color: #595959 !important; 
          font-weight: 700 !important;
          font-size: 12px !important;
          text-transform: uppercase !important;
          letter-spacing: 0.5px !important;
          padding: 16px 12px !important;
        }
        .ant-table-cell { padding: 12px !important; }
        .ant-table-thead > tr > th::before { display: none !important; }
        .ant-table-placeholder .ant-empty-normal { margin: 60px 0 !important; }
        
        /* Custom scrollbar */
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #d9d9d9; borderRadius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #bfbfbf; }
      `}</style>
    </div>
  );
};

export default ToolsList;
