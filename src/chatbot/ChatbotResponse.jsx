import { useMemo, useState } from 'react';
import { Table, Tag } from 'antd';
import { Copy, Check, ChevronDown } from 'lucide-react';

const HIDDEN_COLS = new Set(['id', 'created_at', 'updated_at', 'user_id']);

const STATUS_COLORS = {
  completed: 'success',
  approved: 'success',
  active: 'success',
  available: 'success',
  acknowledged: 'success',
  inprogress: 'processing',
  'in progress': 'processing',
  pending: 'warning',
  scheduled: 'processing',
  not_scheduled: 'default',
  inactive: 'default',
  rejected: 'error',
  cancelled: 'error',
  exhausted: 'error',
};

function formatLabel(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function pickColumns(rows) {
  if (!rows?.length) return [];
  const keys = Object.keys(rows[0]);
  const visible = keys.filter((k) => {
    if (HIDDEN_COLS.has(k)) return false;
    if (k.endsWith('_id') && k !== 'id') {
      const base = k.replace(/_id$/, '');
      return !keys.some((x) => x.includes(base) && x !== k);
    }
    return true;
  });
  return (visible.length ? visible : keys).slice(0, 7);
}

function formatCell(value, key) {
  if (value == null || value === '') return '—';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    }
  }
  if (key.toLowerCase().includes('status') && typeof value === 'string') {
    const color = STATUS_COLORS[value.toLowerCase()] || 'default';
    return <Tag color={color} style={{ margin: 0, fontSize: 11 }}>{value}</Tag>;
  }
  return String(value);
}

export const DataTable = ({ data }) => {
  const [copied, setCopied] = useState(false);
  const cols = useMemo(() => pickColumns(data), [data]);

  if (!data?.length) return null;

  const columns = cols.map((key) => ({
    title: formatLabel(key),
    dataIndex: key,
    key,
    ellipsis: true,
    render: (val) => formatCell(val, key),
  }));

  const handleCopy = async () => {
    const text = cols.join('\t') + '\n' + data.map((row) => cols.map((c) => row[c] ?? '').join('\t')).join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="cmf-result-card">
      <div className="cmf-result-header">
        <span className="cmf-result-title">{data.length} {data.length === 1 ? 'row' : 'rows'}</span>
        <div className="cmf-result-actions">
          <button type="button" className="cmf-result-action-btn" onClick={handleCopy}>
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <div className="cmf-chat-table">
        <Table
          size="small"
          columns={columns}
          dataSource={data.map((row, i) => ({ ...row, key: row.id ?? i }))}
          pagination={data.length > 8 ? { pageSize: 8, size: 'small', showSizeChanger: false } : false}
          scroll={{ x: 'max-content' }}
        />
      </div>
    </div>
  );
};

export const FollowUpSuggestions = ({ suggestions, onSelect }) => {
  const [open, setOpen] = useState(false);
  if (!suggestions?.length) return null;

  return (
    <div className="cmf-followups-wrap">
      <button
        type="button"
        className="cmf-followups-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        Related questions
        <ChevronDown size={14} className={open ? 'open' : ''} />
      </button>
      {open && (
        <div className="cmf-followups">
          {suggestions.map((s) => (
            <button key={s} type="button" className="cmf-followup" onClick={() => onSelect(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
