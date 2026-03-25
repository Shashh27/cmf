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
  BlockOutlined, ExpandOutlined, CompressOutlined
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
function SidebarTree({ tree, selected, onSelect, loading, expandedCats, toggleCat }) {
  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center' }}><Spin size="small" /></div>;
  }

  return (
    <div style={{ paddingBottom: 16 }}>
      {tree.filter(cat => cat.category !== 'Misc').map(catNode => {
        const catExpanded = !!expandedCats[catNode.category];
        const cc = CATEGORY_COLORS[catNode.category] || { bg: '#fff', text: '#555' };

        return (
          <div key={catNode.category} style={{ position: 'relative' }}>
            {/* ── LEVEL 1: Category ── */}
            <div
              onClick={() => {
                toggleCat(catNode.category);
                onSelect({ category: catNode.category, sub_category: null });
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 12px',
                cursor: 'pointer', userSelect: 'none',
                background: (selected?.category === catNode.category && !selected?.sub_category) ? '#e6f4ff' : 'transparent',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { if (selected?.category !== catNode.category || selected?.sub_category) e.currentTarget.style.background = '#f5f8ff'; }}
              onMouseLeave={e => { if (selected?.category !== catNode.category || selected?.sub_category) e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ fontSize: 13, color: '#555', width: 16, display: 'flex', alignItems: 'center' }}>
                {catExpanded ? <MinusSquareOutlined /> : <PlusSquareOutlined />}
              </div>

              <div style={{
                width: 22, height: 22, flexShrink: 0,
                color: cc.text,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14,
              }}>
                <BlockOutlined />
              </div>

              <span style={{ flex: 1, fontSize: 16, fontWeight: 600, color: '#1a1a2e' }}>
                {catNode.category}
              </span>

              <span style={{
                fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                background: '#e6f4ff', color: '#1677ff', border: '1px solid #91caff',
              }}>
                {catNode.sub_categories.length}
              </span>
            </div>

            {/* ── LEVEL 2: Sub-categories ── */}
            {catExpanded && (
              <div style={{ position: 'relative', marginLeft: 20, borderLeft: '1px solid #e0e0e0' }}>
                {catNode.sub_categories.map((subNode) => {
                  const subActive = selected?.category === catNode.category && selected?.sub_category === subNode.sub_category;
                  return (
                    <div key={subNode.sub_category} style={{ position: 'relative' }}>
                      <div style={{ position: 'absolute', left: 0, top: 18, width: 14, height: 1, background: '#e0e0e0' }} />
                      <div
                        onClick={() => onSelect({ category: catNode.category, sub_category: subNode.sub_category })}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '6px 12px 6px 16px',
                          cursor: 'pointer', userSelect: 'none',
                          background: subActive ? '#e6f4ff' : 'transparent',
                          transition: 'background 0.12s',
                        }}
                        onMouseEnter={e => { if (!subActive) e.currentTarget.style.background = '#f5f8ff'; }}
                        onMouseLeave={e => { if (!subActive) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <FileTextOutlined style={{ fontSize: 13, color: '#555', flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: '#2d2d3a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {subNode.sub_category}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 500, padding: '1px 6px', borderRadius: 4, background: '#f6ffed', color: '#389e0d', border: '1px solid #b7eb8f', flexShrink: 0 }}>
                          {subNode.count}
                        </span>
                      </div>
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

  useEffect(() => {
    if (selected?.sub_category && selected?.category) {
      fetchBySubCategory(selected.category, selected.sub_category);
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
      title: 'SL No', key: 'sl_no', width: 60, fixed: 'left', align: 'center',
      render: (_, __, i) => <span style={{ color: '#8c8c8c', fontSize: 12 }}>{(pagination.current - 1) * pagination.pageSize + i + 1}</span>,
    },
    {
      title: 'Item Description', dataIndex: 'item_description', key: 'item_description', width: 200, fixed: 'left', ellipsis: true,
      render: (text, record) => <Button type="link" style={{ padding: 0, fontSize: 12, fontWeight: 600 }} onClick={() => { setHistoryTool(record); setHistoryVisible(true); }}>{text}</Button>,
    },
    { title: 'Range / Size', dataIndex: 'range', key: 'range', width: 120, ellipsis: true, render: v => v || <span style={{ color: '#bbb' }}>—</span> },
    { title: 'ID Code', dataIndex: 'identification_code', key: 'identification_code', width: 150, ellipsis: true, render: v => v || <span style={{ color: '#bbb' }}>—</span> },
    { title: 'Make', dataIndex: 'make', key: 'make', width: 110, ellipsis: true, render: v => v || <span style={{ color: '#bbb' }}>—</span> },
    { title: 'Total Qty', dataIndex: 'total_quantity', key: 'total_quantity', width: 85, align: 'center', render: (v, r) => <span style={{ fontWeight: 600 }}>{v ?? r.quantity ?? 0}</span> },
    {
      title: 'Available', dataIndex: 'quantity', key: 'quantity', width: 90, align: 'center',
      render: (v) => {
        const n = v ?? 0;
        return <Tag color={n === 0 ? 'red' : n <= 5 ? 'orange' : 'green'} style={{ borderRadius: 6, fontWeight: 600, minWidth: 32, textAlign: 'center' }}>{n}</Tag>;
      },
    },
    { title: 'Issues', dataIndex: 'issues_qty', key: 'issues_qty', width: 75, align: 'center', render: v => <span style={{ color: '#8c8c8c' }}>{v ?? 0}</span> },
    { title: 'Location', dataIndex: 'location', key: 'location', width: 100, ellipsis: true, render: v => v ? <Tag style={{ borderRadius: 5, fontSize: 11 }}>{v}</Tag> : <span style={{ color: '#bbb' }}>—</span> },
    { title: 'Gauge', dataIndex: 'gauge', key: 'gauge', width: 90, ellipsis: true, render: v => v || <span style={{ color: '#bbb' }}>—</span> },
    { title: 'Remarks', dataIndex: 'remarks', key: 'remarks', width: 160, ellipsis: true, render: v => v || <span style={{ color: '#bbb' }}>—</span> },
    { title: 'Amount', dataIndex: 'amount', key: 'amount', width: 90, align: 'right', render: v => v != null ? <span style={{ fontWeight: 500 }}>₹{Number(v).toFixed(2)}</span> : <span style={{ color: '#bbb' }}>—</span> },
    { title: 'Type', dataIndex: 'type', key: 'type', width: 130, render: v => v ? <Tag color={v === 'CONSUMABLES' ? 'green' : 'blue'} style={{ borderRadius: 5, fontSize: 10, fontWeight: 600 }}>{v}</Tag> : null },
    {
      title: 'Actions', key: 'actions', width: 90, fixed: 'right', align: 'center',
      render: (_, record) => (
        <Space size={0}>
          <Tooltip title="Edit Record"><Button type="text" size="small" icon={<EditOutlined />} style={{ color: '#1677ff' }} onClick={() => onEdit(record)} /></Tooltip>
          <Popconfirm title="Delete this tool record?" description="This action cannot be undone." onConfirm={() => onDelete(record)} okText="Yes, Delete" cancelText="Cancel" okButtonProps={{ danger: true }}>
            <Tooltip title="Delete Record"><Button type="text" size="small" icon={<DeleteOutlined />} danger /></Tooltip>
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

  return (
    <div style={{ display: 'flex', height: '100%', background: '#f5f6fa', overflow: 'hidden' }}>
      <div style={{ width: collapsed ? 0 : 320, minWidth: collapsed ? 0 : 320, background: '#fff', borderRight: '1px solid #e8eaed', display: 'flex', flexDirection: 'column', overflow: 'hidden', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', zIndex: 10 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1a1a2e' }}>Categories</span>
          <Space size={4}>
            <Tooltip title="Expand All"><Button type="text" size="small" icon={<ExpandOutlined />} onClick={expandAll} style={{ color: '#555' }} /></Tooltip>
            <Tooltip title="Collapse All"><Button type="text" size="small" icon={<CompressOutlined />} onClick={collapseAll} style={{ color: '#555' }} /></Tooltip>
            <Button type="text" size="small" icon={<MenuFoldOutlined />} style={{ color: '#8c8c8c', marginLeft: 4 }} onClick={() => setCollapsed(true)} />
          </Space>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <SidebarTree tree={displayTree} selected={selected} onSelect={(node) => { setSelected(node); setSearchText(''); }} loading={treeLoading} expandedCats={expandedCats} toggleCat={toggleCat} />
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f5f6fa' }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: '#8c8c8c', padding: '60px 20px', textAlign: 'center' }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: 8 }}>
              <AppstoreOutlined style={{ fontSize: 40, color: '#bfbfbf' }} />
            </div>
            <div>
              <h3 style={{ fontSize: 20, fontWeight: 600, color: '#595959', margin: '0 0 8px 0' }}>Please select a category from the left sidebar</h3>
              <p style={{ fontSize: 14, color: '#8c8c8c', maxWidth: 400, margin: 0 }}>Select a category or sub-category from the tree menu to view and manage its inventory records.</p>
            </div>
          </div>
        ) : (
          <>
            <div style={{ background: '#fff', borderBottom: '1px solid #e8eaed', padding: '8px 20px', minHeight: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '1 1 auto', minWidth: 200 }}>
                {collapsed && <Button type="text" icon={<MenuUnfoldOutlined />} style={{ color: '#666' }} onClick={() => setCollapsed(false)} />}
                <Breadcrumb items={breadcrumbItems} separator="/" style={{ fontSize: 14 }} />
              </div>
              <div style={{ flex: '0 0 auto' }}>
                <Search placeholder="Search items..." allowClear value={searchText} onChange={e => setSearchText(e.target.value)} style={{ width: 220 }} size="small" maxLength={20} />
              </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '12px 16px', gap: 10, minHeight: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexShrink: 0 }}>
                <div style={{ flex: '1 1 auto', minWidth: 250 }}>
                  <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', margin: 0, lineHeight: 1.2 }}>{selected?.sub_category || selected?.category || 'Inventory Master Data'}</h2>
                  <p style={{ fontSize: 14, color: '#8c8c8c', marginTop: 4, margin: 0 }}>{selected.category} {selected.sub_category && `› ${selected.sub_category}`}</p>
                </div>
                <Space wrap style={{ flex: '0 0 auto' }}>
                  <Button icon={<PlusOutlined />} type="primary" style={{ borderRadius: 7, fontWeight: 600 }} onClick={() => onCreateNew(selected)}>Add Row</Button>
                  <Upload beforeUpload={file => { handleBulkUpload(file); return false; }} showUploadList={false} accept=".xlsx,.xls"><Button icon={<UploadOutlined />} style={{ borderRadius: 7 }}>Import</Button></Upload>
                  <Button icon={<DownloadOutlined />} style={{ borderRadius: 7 }} onClick={handleExportExcel}>Export</Button>
                  <Button icon={<ReloadOutlined />} style={{ borderRadius: 7 }} onClick={() => selected?.sub_category && fetchBySubCategory(selected.category, selected.sub_category)} />
                </Space>
              </div>

              <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8eaed', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <Table
                  columns={columns}
                  dataSource={filteredData}
                  rowKey="id"
                  loading={tableLoading}
                  size="small"
                  scroll={{ x: 'max-content', y: 'calc(100vh - 340px)' }}
                  pagination={{
                    current: pagination.current,
                    pageSize: pagination.pageSize,
                    showSizeChanger: true,
                    pageSizeOptions: ['10', '20', '50'],
                    showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
                    size: 'small',
                    style: { padding: '8px 12px', margin: 0, borderTop: '1px solid #f0f0f0' },
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
        .row-alt td { background: #fafbff !important; }
        .ant-table-row:hover td { background: #f0f5ff !important; }
        .ant-table-thead > tr > th::before { display: none !important; }
        .ant-table-cell { padding: 12px 10px !important; }
      `}</style>
    </div>
  );
};

export default ToolsList;
