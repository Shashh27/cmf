import { useMemo, useState } from 'react';
import { Table, Tag } from 'antd';
import { Copy, Check, ChevronDown } from 'lucide-react';

/** Soft hide for internal keys if they slip through; prefer response columns. */
const HIDDEN_COLS = new Set([
  'id', 'created_at', 'updated_at', 'user_id', 'material_id', 'stock_id',
]);

function humanizeKey(key) {
  return String(key || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatLabel(key, labels) {
  if (labels && labels[key]) return labels[key];
  return humanizeKey(key);
}

/**
 * Table columns come from the API (column agent per module).
 * Prefer displayColumns from response; else first-row key order.
 */
function columnsFromResponse(rows, displayColumns) {
  if (!rows?.length) return [];

  if (Array.isArray(displayColumns) && displayColumns.length) {
    const available = new Set(Object.keys(rows[0]));
    const ordered = displayColumns.filter((k) => available.has(k));
    if (ordered.length) return ordered;
  }

  return Object.keys(rows[0]).filter((k) => !HIDDEN_COLS.has(k));
}

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
  ok: 'success',
  'in stock': 'success',
  'out of stock': 'error',
  'tool shortage': 'error',
  'material shortage': 'error',
  'review bom': 'warning',
  'no tool assigned': 'warning',
  'no material linked': 'warning',
};

function formatCell(value, key) {
  if (value == null || value === '') return '—';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    }
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  if (key.toLowerCase().includes('status') && typeof value === 'string') {
    const color = STATUS_COLORS[value.toLowerCase()] || 'default';
    return <Tag color={color} style={{ margin: 0, fontSize: 11 }}>{value}</Tag>;
  }
  return String(value);
}

export const DataTable = ({ data, columns: displayColumns, labels }) => {
  const [copied, setCopied] = useState(false);
  const cols = useMemo(
    () => columnsFromResponse(data, displayColumns),
    [data, displayColumns],
  );

  if (!data?.length) return null;

  const columns = cols.map((key) => ({
    title: formatLabel(key, labels),
    dataIndex: key,
    key,
    ellipsis: true,
    render: (val) => formatCell(val, key),
  }));

  const handleCopy = async () => {
    const text = cols.join('\t') + '\n' + data.map((row) => cols.map((c) => {
      const val = row[c];
      return val == null ? '' : String(val);
    }).join('\t')).join('\n');

    const fallbackCopy = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    };

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else if (!fallbackCopy()) {
        throw new Error('copy failed');
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      if (fallbackCopy()) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
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
