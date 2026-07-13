import { useMemo, useState } from 'react';
import { Table, Tag } from 'antd';
import { Copy, Check, ChevronDown } from 'lucide-react';

const HIDDEN_COLS = new Set(['id', 'created_at', 'updated_at', 'user_id', 'material_id', 'stock_id']);

const COLUMN_LABELS = {
  material_name: 'Material',
  form_type: 'Form',
  process_type: 'Process',
  diameter: 'Diameter (mm)',
  length: 'Length (mm)',
  breadth: 'Breadth (mm)',
  height: 'Height (mm)',
  inner_diameter: 'Inner Ø (mm)',
  outer_diameter: 'Outer Ø (mm)',
  quantity: 'Qty',
  available_quantity: 'Available Qty',
  allocated_quantity: 'Allocated Qty',
  unit_mass_kg: 'Unit Mass (kg)',
  unit_volume_m3: 'Unit Volume (m³)',
  unit_weight_n: 'Unit Weight (N)',
  stock_status: 'Stock Status',
  order_status: 'Order Status',
  bar_total_length_mm: 'Bar Total (mm)',
  bar_remaining_length_mm: 'Bar Remaining (mm)',
  bar_mass_kg: 'Bar Mass (kg)',
  bar_status: 'Bar Status',
  sale_order_number: 'Order No.',
  part_name: 'Part',
  part_number: 'Part No.',
  product_name: 'Product',
  company_name: 'Customer',
  operation_name: 'Operation',
  notification_type: 'Type',
  reference: 'Reference',
  source_type: 'Type',
  title: 'Name',
  subtitle: 'Details',
  tool_stock_status: 'Tool Stock',
  material_stock_status: 'Material Stock',
  material_available_qty: 'Material Available',
  overall_status: 'Status',
  required_tool: 'Required Tool',
  order_no: 'Order No.',
  item_description: 'Tool',
  identification_code: 'ID Code',
  user_name: 'Operator',
  work_center_name: 'Work Center',
};

const MATERIAL_COL_ORDER = [
  'material_name', 'form_type', 'process_type', 'diameter', 'length', 'breadth', 'height',
  'inner_diameter', 'outer_diameter', 'quantity', 'available_quantity', 'allocated_quantity',
  'bar_total_length_mm', 'bar_remaining_length_mm', 'bar_mass_kg', 'unit_mass_kg',
  'stock_status', 'bar_status', 'order_status',
];

function formatLabel(key) {
  if (COLUMN_LABELS[key]) return COLUMN_LABELS[key];
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
  if (!visible.length) return keys.slice(0, 10);

  if (visible.includes('material_name')) {
    const ordered = MATERIAL_COL_ORDER.filter((k) => visible.includes(k));
    const rest = visible.filter((k) => !ordered.includes(k));
    return [...ordered, ...rest].slice(0, 14);
  }

  return visible.slice(0, 10);
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
