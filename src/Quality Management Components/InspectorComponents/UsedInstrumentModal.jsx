import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Table, Spin, Typography, Input, Empty } from 'antd';
import { TOOLS_API_BASE_URL } from '../../Config/qualityconfig';

const { Text } = Typography;

function normalizeSub(value) {
  return (value || '').trim().toLowerCase();
}

function parseToolsPayload(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function filterToolsBySubCategory(items, subCategory) {
  const want = normalizeSub(subCategory);
  if (!want) return [];
  return (items || []).filter((item) => normalizeSub(item?.sub_category) === want);
}

function formatToolLabel(tool) {
  const code = (tool?.identification_code || '').trim();
  const desc = (tool?.item_description || '').trim();
  if (code && desc) return `${desc} · ${code}`;
  return code || desc || `Tool #${tool?.id ?? '?'}`;
}

async function fetchToolsForSubCategory(subCategory) {
  const sub = (subCategory || '').trim();
  if (!sub || sub === 'default') return [];

  const subUrl = `${TOOLS_API_BASE_URL}/tools-list/category/${encodeURIComponent('Instruments')}/sub/${encodeURIComponent(sub)}`;

  try {
    const res = await fetch(subUrl);
    if (res.ok) {
      const items = parseToolsPayload(await res.json());
      return filterToolsBySubCategory(items, sub);
    }
  } catch (err) {
    console.warn('Sub-category tools fetch failed, falling back to category filter', err);
  }

  const catUrl = `${TOOLS_API_BASE_URL}/tools-list/?category=${encodeURIComponent('Instruments')}`;
  const res = await fetch(catUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const items = parseToolsPayload(await res.json());
  return filterToolsBySubCategory(items, sub);
}

const UsedInstrumentModal = ({
  open,
  record,
  subCategory,
  onCancel,
  onOk,
  confirmLoading = false,
}) => {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState(null);

  useEffect(() => {
    if (!open) {
      setTools([]);
      setSearch('');
      setSelectedKey(null);
      return;
    }

    const sub = (subCategory || '').trim();
    if (!sub || sub === 'default') {
      setTools([]);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setTools([]);
      setSelectedKey(null);
      try {
        const rows = await fetchToolsForSubCategory(sub);
        const sorted = [...rows].sort((a, b) => formatToolLabel(a).localeCompare(formatToolLabel(b)));
        if (!cancelled) setTools(sorted);
      } catch (err) {
        console.warn('Failed to load instruments for sub-category', err);
        if (!cancelled) setTools([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, subCategory]);

  useEffect(() => {
    if (!open || !record) {
      setSelectedKey(null);
      return;
    }
    const current = (record.usedInstrument || '').trim();
    if (!current) {
      setSelectedKey(null);
      return;
    }
    const match = tools.find(
      (t) => formatToolLabel(t) === current || (t.identification_code || '').trim() === current,
    );
    setSelectedKey(match?.id ?? null);
  }, [open, record, tools]);

  const filteredTools = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter((t) =>
      Object.values(t).some((v) => v != null && String(v).toLowerCase().includes(q)),
    );
  }, [tools, search]);

  const columns = [
    {
      title: 'Description',
      dataIndex: 'item_description',
      key: 'item_description',
      ellipsis: true,
      render: (v) => v || '—',
    },
    {
      title: 'ID Code',
      dataIndex: 'identification_code',
      key: 'identification_code',
      width: 130,
      render: (v) => <Text code style={{ fontSize: 11 }}>{v || '—'}</Text>,
    },
    {
      title: 'Make',
      dataIndex: 'make',
      key: 'make',
      width: 100,
      render: (v) => v || '—',
    },
    {
      title: 'Range',
      dataIndex: 'range',
      key: 'range',
      width: 100,
      render: (v) => v || '—',
    },
  ];

  const handleOk = async () => {
    const tool = tools.find((t) => t.id === selectedKey);
    if (!tool) return;
    await onOk?.(formatToolLabel(tool));
  };

  const sub = (subCategory || '').trim();

  return (
    <Modal
      title={sub ? `Select instrument — ${sub}` : 'Select instrument'}
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      okText="Apply"
      okButtonProps={{ disabled: selectedKey == null }}
      confirmLoading={confirmLoading}
      destroyOnClose
      width={760}
    >
      {record ? (
        <div>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 10 }}>
            Characteristic #{record.balloonNo} · {record.dimType} · {record.nominal} · Zone {record.zone}
          </Text>
          {!sub || sub === 'default' ? (
            <Empty description="Supervisor has not assigned an instrument sub-category for this row." />
          ) : (
            <>
              <Input.Search
                allowClear
                placeholder="Search instruments in this sub-category…"
                style={{ marginBottom: 10 }}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Spin spinning={loading}>
                <Table
                  size="small"
                  rowKey="id"
                  columns={columns}
                  dataSource={filteredTools}
                  pagination={{ pageSize: 8, showSizeChanger: false, total: filteredTools.length }}
                  locale={{ emptyText: loading ? 'Loading…' : `No instruments found for ${sub}` }}
                  rowSelection={{
                    type: 'radio',
                    selectedRowKeys: selectedKey != null ? [selectedKey] : [],
                    onChange: (keys) => setSelectedKey(keys[0] ?? null),
                  }}
                  onRow={(row) => ({
                    onClick: () => setSelectedKey(row.id),
                    style: { cursor: 'pointer' },
                  })}
                  scroll={{ y: 320 }}
                />
              </Spin>
            </>
          )}
        </div>
      ) : null}
    </Modal>
  );
};

export default UsedInstrumentModal;
