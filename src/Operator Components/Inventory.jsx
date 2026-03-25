import React, { useState, useEffect, useRef } from 'react';
import { Table, Button, Space, message, Input, Select, Modal, Form, InputNumber, notification, Tag, Breadcrumb, Spin, Tooltip, Card, Row, Col } from 'antd';
import {
  SearchOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, PlusSquareOutlined, MinusSquareOutlined,
  BlockOutlined, FileTextOutlined, AppstoreOutlined, ExpandOutlined, CompressOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import { API_BASE_URL } from '../Config/auth';

const { Option } = Select;
const { TextArea } = Input;
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
   HOOK — dynamic table scroll height
═══════════════════════════════════════════════════════════ */
function useTableScrollY(topBarRef, titleRowRef, paginationHeight = 56, extraPadding = 24) {
  const [scrollY, setScrollY] = useState(300);

  useEffect(() => {
    const calculate = () => {
      const topBarH  = topBarRef.current?.offsetHeight  || 0;
      const titleH   = titleRowRef.current?.offsetHeight || 0;
      const available = window.innerHeight - topBarH - titleH - paginationHeight - extraPadding;
      // Clamp between a minimum of 200px and full available space
      setScrollY(Math.max(200, available));
    };

    calculate();
    window.addEventListener('resize', calculate);
    return () => window.removeEventListener('resize', calculate);
  }, [topBarRef, titleRowRef, paginationHeight, extraPadding]);

  return scrollY;
}

const Inventory = () => {
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
  const [activeFilter, setActiveFilter] = useState('all');

  // Refs for dynamic scroll height calculation
  const topBarRef   = useRef(null);
  const titleRowRef = useRef(null);

  // Request Modal State
  const [isRequestModalVisible, setIsRequestModalVisible] = useState(false);
  const [requestForm] = Form.useForm();
  const [orders, setOrders] = useState([]);
  const [parts, setParts] = useState([]);
  const [requestLoading, setRequestLoading] = useState(false);
  const [selectedToolId, setSelectedToolId] = useState(null);

  const fetchingTree  = useRef(false);
  const fetchingTable = useRef(false);

  // Dynamic scroll Y — accounts for topbar + title row + pagination + gaps
  const tableScrollY = useTableScrollY(topBarRef, titleRowRef, 56, 32);

  useEffect(() => {
    fetchTree();
    fetchOrders();
  }, []);

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

  const fetchOrders = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/orders/`);
      if (response.ok) {
        const data = await response.json();
        setOrders(data);
      }
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    }
  };

  const fetchParts = async (saleOrderNumber) => {
    try {
      const response = await fetch(`${API_BASE_URL}/orders/sale-order/${saleOrderNumber}/parts`);
      if (response.ok) {
        const data = await response.json();
        const partsList = Array.isArray(data) ? data : (data.parts || []);
        setParts(partsList);
      }
    } catch (error) {
      console.error('Failed to fetch parts:', error);
      message.error('Failed to fetch parts');
    }
  };

  useEffect(() => {
    if (selected?.sub_category && selected?.category) {
      fetchBySubCategory(selected.category, selected.sub_category);
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

  const handleRequestSubmit = async (values) => {
    let operatorId = 0;
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        operatorId = user.id || 0;
      }
    } catch (e) {
      console.error('Error parsing user from local storage', e);
    }

    setRequestLoading(true);
    try {
      const payload = {
        tool_id: selectedToolId || 0,
        operator_id: operatorId,
        project_id: values.project_id,
        part_id: values.part_id,
        quantity: values.quantity,
        purpose_of_use: values.purpose_of_use || ""
      };

      const response = await fetch(`${API_BASE_URL}/inventory-requests/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        message.success('Request submitted successfully');
        setIsRequestModalVisible(false);
        requestForm.resetFields();
        if (selected?.sub_category) fetchBySubCategory(selected.category, selected.sub_category);
      } else {
        const errorData = await response.json().catch(() => ({}));
        notification.error({
          message: 'Request Failed',
          description: errorData.detail || 'The quantity requested is more than available.',
          duration: 0,
          placement: 'topRight',
        });
      }
    } catch (error) {
      console.error('Error submitting request:', error);
      notification.error({
        message: 'Request Error',
        description: error.message || 'An unexpected error occurred while submitting the request.',
        duration: 0,
        placement: 'topRight',
      });
    } finally {
      setRequestLoading(false);
    }
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
      title: 'Item Description', dataIndex: 'item_description', key: 'item_description', width: 200, fixed: 'left', align: 'center', ellipsis: true,
      render: (text) => <span style={{ fontSize: 12, fontWeight: 600 }}>{text}</span>,
    },
    { title: 'Range / Size', dataIndex: 'range', key: 'range', width: 120, align: 'center', ellipsis: true, render: v => v || <span style={{ color: '#bbb' }}>—</span> },
    { title: 'ID Code', dataIndex: 'identification_code', key: 'identification_code', width: 150, align: 'center', ellipsis: true, render: v => v || <span style={{ color: '#bbb' }}>—</span> },
    { title: 'Make', dataIndex: 'make', key: 'make', width: 110, align: 'center', ellipsis: true, render: v => v || <span style={{ color: '#bbb' }}>—</span> },
    {
      title: 'Available', dataIndex: 'quantity', key: 'quantity', width: 90, align: 'center',
      render: (v) => {
        const n = v ?? 0;
        return <span style={{ fontSize: 13, color: '#333' }}>{n}</span>;
      },
    },
    { title: 'Type', dataIndex: 'type', key: 'type', width: 130, align: 'center', render: v => v ? <span style={{ fontSize: 12, color: '#333' }}>{v}</span> : <span style={{ color: '#bbb' }}>—</span> },
    {
      title: 'Actions', key: 'actions', width: 100, fixed: 'right', align: 'center',
      render: (_, record) => (
        <Button
          type="primary"
          size="small"
          disabled={record.quantity <= 0}
          onClick={() => {
            setSelectedToolId(record.id);
            setIsRequestModalVisible(true);
            if (orders.length === 0) fetchOrders();
          }}
        >
          Request
        </Button>
      ),
    },
  ];

  const breadcrumbItems = [
    { title: 'Inventory' },
    selected?.category     ? { title: selected.category }     : null,
    selected?.sub_category ? { title: selected.sub_category } : null,
  ].filter(Boolean);

  const displayTree = (tree.length > 0 ? tree : [
    { category: 'Tools', sub_categories: [], total_count: 0 },
    { category: 'Instruments', sub_categories: [], total_count: 0 },
  ]).filter(cat => cat.category !== 'Misc');

  return (
    /*
     * The parent layout (tabs/header above) controls the available height.
     */
    <div style={{
      display: 'flex',
      height: '100%',          /* ← fills parent; no magic number */
      minHeight: 0,            /* ← critical for flex children to shrink */
      background: '#f5f6fa',
      overflow: 'hidden',
      gap: 12,
      padding: '12px',
      boxSizing: 'border-box',
    }}>

      {/* ══════════════════════════════════
          LEFT CARD — Categories sidebar
      ══════════════════════════════════ */}
      {!collapsed && (
        <div style={{
          width: 280,
          minWidth: 280,
          flexShrink: 0,
          background: '#fff',
          borderRadius: 10,
          border: '1px solid #e8eaed',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minHeight: 0,        /* ← allows flex child to shrink */
        }}>
          {/* Card header */}
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid #f0f0f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#1a1a2e' }}>Categories</span>
            <Space size={4}>
              <Tooltip title="Expand All">
                <Button type="text" size="small" icon={<ExpandOutlined />} onClick={expandAll} style={{ color: '#555' }} />
              </Tooltip>
              <Tooltip title="Collapse All">
                <Button type="text" size="small" icon={<CompressOutlined />} onClick={collapseAll} style={{ color: '#555' }} />
              </Tooltip>
              <Tooltip title="Collapse Sidebar">
                <Button type="text" size="small" icon={<MenuFoldOutlined />} style={{ color: '#8c8c8c' }} onClick={() => setCollapsed(true)} />
              </Tooltip>
            </Space>
          </div>

          {/* Scrollable tree */}
          <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
            <SidebarTree
              tree={displayTree}
              selected={selected}
              onSelect={(node) => { setSelected(node); setSearchText(''); }}
              loading={treeLoading}
              expandedCats={expandedCats}
              toggleCat={toggleCat}
            />
          </div>
        </div>
      )}

      {/* ══════════════════════════════════
          RIGHT CARD — Content area
      ══════════════════════════════════ */}
      <div style={{
        flex: 1,
        background: '#fff',
        borderRadius: 10,
        border: '1px solid #e8eaed',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minWidth: 0,
        minHeight: 0,          /* ← allows flex child to shrink */
      }}>

        {!selected ? (
          /* ── Empty state ── */
          <div style={{
            flex: 1,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 16, color: '#8c8c8c',
            padding: '60px 20px', textAlign: 'center',
          }}>
            {collapsed && (
              <Button
                type="text"
                icon={<MenuUnfoldOutlined />}
                style={{ position: 'absolute', top: 20, left: 20, color: '#666' }}
                onClick={() => setCollapsed(false)}
              />
            )}
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: '#f5f6fa',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 8,
            }}>
              <AppstoreOutlined style={{ fontSize: 40, color: '#bfbfbf' }} />
            </div>
            <div>
              <h3 style={{ fontSize: 20, fontWeight: 600, color: '#595959', margin: '0 0 8px 0' }}>
                Please select a category from the left sidebar
              </h3>
              <p style={{ fontSize: 14, color: '#8c8c8c', maxWidth: 400, margin: 0 }}>
                Select a category or sub-category from the tree menu to view and request items.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* ── Top bar: breadcrumb + search ── */}
            <div
              ref={topBarRef}
              style={{
                padding: '10px 20px',
                borderBottom: '1px solid #f0f0f0',
                display: 'flex', alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap', gap: 12, flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '1 1 auto', minWidth: 200 }}>
                {collapsed && (
                  <Button
                    type="text"
                    icon={<MenuUnfoldOutlined />}
                    style={{ color: '#666' }}
                    onClick={() => setCollapsed(false)}
                  />
                )}
                <Breadcrumb items={breadcrumbItems} separator="/" style={{ fontSize: 14 }} />
              </div>
              <Search
                placeholder="Search items..."
                allowClear
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                style={{ width: 220 }}
                size="small"
                maxLength={20}
              />
            </div>

            {/* ── Title row ── */}
            <div
              ref={titleRowRef}
              style={{
                padding: '12px 20px 8px',
                display: 'flex', flexWrap: 'wrap',
                alignItems: 'center', justifyContent: 'space-between',
                gap: 12, flexShrink: 0,
              }}
            >
              <div style={{ flex: '1 1 auto', minWidth: 250 }}>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', margin: 0, lineHeight: 1.2 }}>
                  {selected?.sub_category || selected?.category || 'Inventory Data'}
                </h2>
                <p style={{ fontSize: 13, color: '#8c8c8c', marginTop: 4, marginBottom: 0 }}>
                  {selected.category}{selected.sub_category && ` › ${selected.sub_category}`}
                </p>
              </div>
              <Space wrap style={{ flex: '0 0 auto' }}>
                <Button
                  icon={<ReloadOutlined />}
                  style={{ borderRadius: 7 }}
                  onClick={() => selected?.sub_category && fetchBySubCategory(selected.category, selected.sub_category)}
                />
              </Space>
            </div>

            {/* ── Table — flex: 1 + minHeight: 0 lets it fill remaining space ── */}
            <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
              <Table
                columns={columns}
                dataSource={filteredData}
                rowKey="id"
                loading={tableLoading}
                size="small"
                scroll={{ x: 'max-content', y: tableScrollY }}
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
          </>
        )}
      </div>

      {/* ══════════════════════════════════
          Request Modal
      ══════════════════════════════════ */}
      <Modal
        title="Request Inventory"
        open={isRequestModalVisible}
        onCancel={() => {
          setIsRequestModalVisible(false);
          requestForm.resetFields();
        }}
        footer={null}
        maskClosable={false}
      >
        <Form form={requestForm} layout="vertical" onFinish={handleRequestSubmit}>
          <Form.Item
            name="project_id"
            label="Project"
            rules={[{ required: true, message: 'Please select a project' }]}
          >
            <Select
              placeholder="Select a project"
              onChange={(value) => {
                const selectedOrder = orders.find(o => o.id === value);
                if (selectedOrder) fetchParts(selectedOrder.sale_order_number);
                requestForm.setFieldsValue({ part_id: undefined });
              }}
            >
              {orders.map(o => (
                <Option key={o.id} value={o.id}>{o.sale_order_number || `Order ${o.id}`}</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="part_id"
            label="Part"
            rules={[{ required: true, message: 'Please select a part' }]}
          >
            <Select placeholder="Select a part" disabled={!parts.length}>
              {parts.map(p => (
                <Option key={p.id} value={p.id}>{p.part_name || p.part_number}</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="quantity"
            label="Quantity"
            rules={[
              { required: true, message: 'Please enter quantity' },
              {
                validator(_, value) {
                  const selectedTool = tools.find(t => t.id === selectedToolId);
                  const available = selectedTool?.quantity ?? 0;
                  if (value && value > available) {
                    return Promise.reject(
                      new Error(`Available quantity: ${available}. You cannot request more than this.`)
                    );
                  }
                  return Promise.resolve();
                },
              },
            ]}
            extra={
              <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                Available quantity: {tools.find(t => t.id === selectedToolId)?.quantity ?? 0}. You cannot request more than this.
              </span>
            }
          >
            <InputNumber
              min={1}
              style={{ width: '100%' }}
              precision={0}
              parser={value => value.replace(/[^\d]/g, '')}
              formatter={value => value ? String(value).replace(/[^\d]/g, '') : ''}
              onKeyDown={e => {
                if (!/^\d$/.test(e.key) && !['Backspace','Delete','ArrowLeft','ArrowRight','Tab'].includes(e.key)) {
                  e.preventDefault();
                }
              }}
            />
          </Form.Item>

          <Form.Item name="purpose_of_use" label="Purpose of Use">
            <TextArea rows={4} />
          </Form.Item>

          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => { setIsRequestModalVisible(false); requestForm.resetFields(); }}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit" loading={requestLoading}>
                Submit Request
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <style>{`
        .ant-table-row:hover td { background: #f5f5f5 !important; }
        .ant-table-thead > tr > th::before { display: none !important; }
        .ant-table-thead > tr > th { text-align: center !important; }
        .ant-table-cell { padding: 12px 10px !important; }
      `}</style>
    </div>
  );
};

export default Inventory;