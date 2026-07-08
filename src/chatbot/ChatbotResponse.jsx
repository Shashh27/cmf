import { useState } from 'react';
import { ChevronDown, ChevronUp, Database, Lightbulb, Copy, Check } from 'lucide-react';

const THEME = {
  headerFrom: '#1e293b',
  headerTo: '#134e4a',
  accent: '#f59e0b',
  userFrom: '#0f766e',
  userTo: '#0d9488',
  border: '#e5e7eb',
  textDark: '#1f2937',
  textMuted: '#6b7280',
  sqlBg: '#1e293b',
  sqlText: '#fbbf24',
  bgHover: '#f9fafb',
};

// ── SQL Block (collapsible, ChatGPT style) ───────────────────────────────────
export const SqlBlock = ({ sql }) => {
  const [open, setOpen] = useState(false);
  if (!sql) return null;

  return (
    <div style={{ marginTop: 12, marginBottom: 8 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 12px', background: '#f3f4f6',
          border: '1px solid #e5e7eb', borderRadius: 8,
          cursor: 'pointer', fontSize: 12, fontWeight: 500,
          color: THEME.textMuted, transition: 'all 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = '#e5e7eb'}
        onMouseLeave={e => e.currentTarget.style.background = '#f3f4f6'}
      >
        <Database size={14} />
        <span>View SQL Query</span>
        <span style={{ marginLeft: 'auto' }}>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>
      {open && (
        <div style={{
          marginTop: 8, padding: '12px 14px',
          background: THEME.sqlBg, borderRadius: 8,
          overflowX: 'auto', fontSize: 11.5,
        }}>
          <pre style={{ margin: 0, color: THEME.sqlText, whiteSpace: 'pre-wrap', fontFamily: 'Monaco, Consolas, monospace' }}>
            {sql}
          </pre>
        </div>
      )}
    </div>
  );
};

// ── Data Table (ChatGPT style - clean, minimal) ───────────────────────────────
export const DataTable = ({ data }) => {
  const [copied, setCopied] = useState(false);
  if (!data?.length) return null;

  const cols = Object.keys(data[0]);
  const handleCopy = async () => {
    const text = cols.join('\t') + '\n' + data.map(row => cols.map(c => row[c] ?? '').join('\t')).join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ marginTop: 12, marginBottom: 8 }}>
      {/* Table */}
      <div style={{
        border: '1px solid #e5e7eb', borderRadius: 8,
        overflow: 'hidden', background: '#fff',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px', background: '#f9fafb',
          borderBottom: '1px solid #e5e7eb',
        }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: THEME.textMuted }}>
            {data.length} {data.length === 1 ? 'result' : 'results'}
          </span>
          <button
            onClick={handleCopy}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 8px', border: '1px solid #e5e7eb',
              borderRadius: 6, background: '#fff', cursor: 'pointer',
              fontSize: 11, color: THEME.textMuted, transition: 'all 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
            onMouseLeave={e => e.currentTarget.style.background = '#fff'}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                {cols.map(c => (
                  <th key={c} style={{
                    padding: '10px 12px', textAlign: 'left',
                    color: THEME.textDark, fontWeight: 600, fontSize: 11,
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    borderBottom: '1px solid #e5e7eb',
                  }}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} style={{
                  borderBottom: i < data.length - 1 ? '1px solid #f3f4f6' : 'none',
                  background: i % 2 ? '#fafafa' : '#fff',
                }}>
                  {cols.map(c => (
                    <td key={c} style={{
                      padding: '10px 12px', color: '#374151',
                      whiteSpace: 'nowrap', maxWidth: 300,
                      overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {row[c] != null && row[c] !== '' ? String(row[c]) : <span style={{ color: '#9ca3af' }}>—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ── Follow-up Suggestions (ChatGPT style) ───────────────────────────────────
export const FollowUpSuggestions = ({ suggestions, onSelect }) => {
  if (!suggestions?.length) return null;

  return (
    <div style={{ marginTop: 12, marginBottom: 8 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 12, fontWeight: 500, color: THEME.textMuted,
        marginBottom: 8,
      }}>
        <Lightbulb size={14} />
        <span>Suggested follow-up questions</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => onSelect(s)}
            style={{
              textAlign: 'left', padding: '10px 14px',
              background: '#f9fafb', border: '1px solid #e5e7eb',
              borderRadius: 8, cursor: 'pointer',
              fontSize: 12, color: THEME.textDark,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#f3f4f6';
              e.currentTarget.style.borderColor = '#d1d5db';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = '#f9fafb';
              e.currentTarget.style.borderColor = '#e5e7eb';
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
};
