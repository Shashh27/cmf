import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Table, Spin, Typography, Input, Empty } from 'antd';
import { QUALITY_API_BASE_URL } from '../../Config/qualityconfig';
import { getToolSubCategoryName } from './inspectorConstants';

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
  return (items || []).filter((item) => normalizeSub(getToolSubCategoryName(item)) === want);
}

function formatToolLabel(tool) {
  const code = (tool?.identification_code || '').trim();
  const desc = (tool?.item_description || '').trim();
  const range = (tool?.range || '').trim();

  if (desc && code) return `${desc} · ${code}`;
  if (desc && range) return `${desc} · ${range}`;
  if (code && range) return `${code} · ${range}`;
  return code || desc || `Tool #${tool?.id ?? '?'}`;
}

function findToolByStoredLabel(tools, stored) {
  const label = (stored || '').trim();
  if (!label) return null;

  const exact = tools.filter((t) => formatToolLabel(t) === label);
  if (exact.length === 1) return exact[0];

  if (label.includes('·')) {
    const [descPart, suffixPart] = label.split('·').map((s) => s.trim());
    const matches = tools.filter((t) => {
      const desc = (t.item_description || '').trim();
      if (desc !== descPart) return false;
      const code = (t.identification_code || '').trim();
      const range = (t.range || '').trim();
      return suffixPart === code || suffixPart === range;
    });
    if (matches.length === 1) return matches[0];
  }

  const byCode = tools.filter((t) => (t.identification_code || '').trim() === label);
  if (byCode.length === 1) return byCode[0];

  const byDesc = tools.filter((t) => (t.item_description || '').trim() === label);
  if (byDesc.length === 1) return byDesc[0];

  return null;
}

function parseIsoDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const date = new Date(`${raw}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDueDate(value) {
  const date = parseIsoDate(value);
  if (!date) return '—';
  return date.toLocaleDateString('en-GB');
}

function getCalibrationDueStatus(value) {
  const date = parseIsoDate(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(date);
  due.setHours(0, 0, 0, 0);
  if (due < today) return 'expired';
  const weekFromToday = new Date(today);
  weekFromToday.setDate(weekFromToday.getDate() + 7);
  if (due <= weekFromToday) return 'due-soon';
  return null;
}

function dueDateStyle(status) {
  if (status === 'expired') return { color: '#cf1322', fontWeight: 600 };
  if (status === 'due-soon') return { color: '#d48806', fontWeight: 600 };
  return undefined;
}

function instrumentRowClassName(record) {
  const status = getCalibrationDueStatus(record?.calibration_due_date);
  if (status === 'expired') return 'used-instrument-row-expired';
  if (status === 'due-soon') return 'used-instrument-row-due-soon';
  return '';
}

async function fetchToolsForSubCategory(subCategory) {
  const sub = (subCategory || '').trim();
  if (!sub || sub === 'default') return [];

  const subUrl = `${QUALITY_API_BASE_URL}/quality/instruments/category/${encodeURIComponent('Instruments')}/sub/${encodeURIComponent(sub)}`;

  try {
    const res = await fetch(subUrl);
    if (res.ok) {
      const items = parseToolsPayload(await res.json());
      const filtered = filterToolsBySubCategory(items, sub);
      return filtered.length ? filtered : items;
    }
  } catch (err) {
    console.warn('Sub-category tools fetch failed, falling back to category filter', err);
  }

  const catUrl = `${QUALITY_API_BASE_URL}/quality/instruments?category=${encodeURIComponent('Instruments')}`;
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
    const match = findToolByStoredLabel(tools, current);
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
    {
      title: 'Cal Due Date',
      dataIndex: 'calibration_due_date',
      key: 'calibration_due_date',
      width: 130,
      render: (v) => {
        const status = getCalibrationDueStatus(v);
        return (
          <Text style={dueDateStyle(status)}>
            {formatDueDate(v)}
          </Text>
        );
      },
    },
  ];

  const applySelectedTool = async (tool) => {
    await onOk?.(formatToolLabel(tool));
  };

  const handleOk = async () => {
    const tool = tools.find((t) => t.id === selectedKey);
    if (!tool) return;

    if (getCalibrationDueStatus(tool.calibration_due_date) === 'expired') {
      Modal.confirm({
        title: 'Out of calibration',
        content: (
          <div>
            <Text>
              This device is past its calibration due date
              {tool.calibration_due_date ? ` (${formatDueDate(tool.calibration_due_date)})` : ''}.
            </Text>
            <br />
            <Text strong style={{ display: 'block', marginTop: 8 }}>
              {formatToolLabel(tool)}
            </Text>
            <Text style={{ display: 'block', marginTop: 8 }}>
              Do you still want to use this device?
            </Text>
          </div>
        ),
        okText: 'Yes, use anyway',
        cancelText: 'Cancel',
        okButtonProps: { danger: true },
        onOk: () => applySelectedTool(tool),
      });
      return;
    }

    await applySelectedTool(tool);
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
                <style>{`
                  .used-instrument-table-wrap .used-instrument-row-expired > td {
                    background-color: #fef2f2 !important;
                  }
                  .used-instrument-table-wrap .used-instrument-row-due-soon > td {
                    background-color: #fffbe6 !important;
                  }
                  .used-instrument-table-wrap .used-instrument-row-expired.ant-table-row-selected > td {
                    background-color: #fee2e2 !important;
                  }
                  .used-instrument-table-wrap .used-instrument-row-due-soon.ant-table-row-selected > td {
                    background-color: #fff1b8 !important;
                  }
                `}</style>
                <div className="used-instrument-table-wrap">
                <Table
                  size="small"
                  rowKey="id"
                  columns={columns}
                  dataSource={filteredTools}
                  pagination={{ pageSize: 8, showSizeChanger: false, total: filteredTools.length }}
                  locale={{ emptyText: loading ? 'Loading…' : `No instruments found for ${sub}` }}
                  rowClassName={instrumentRowClassName}
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
                </div>
              </Spin>
            </>
          )}
        </div>
      ) : null}
    </Modal>
  );
};

export default UsedInstrumentModal;
