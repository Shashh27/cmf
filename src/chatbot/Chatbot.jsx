import { useEffect, useRef, useState, useCallback } from 'react';
import { Button, Input, Tag, Spin, Tooltip } from 'antd';
import ReactMarkdown from 'react-markdown';
import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import {
  Bot, Send, Trash2, X, Maximize2, Minimize2,
  Database, ChevronDown, ChevronUp, Sparkles, List, Table2,
} from 'lucide-react';
import { CHATBOT_CONFIG } from '../Config/chatbot';

const { TextArea } = Input;

// ── Theme tokens ─────────────────────────────────────────────────────────────
// Industrial slate + amber palette — distinct from the previous indigo/purple look.
const THEME = {
  headerFrom: '#1e293b',   // slate-800
  headerTo:   '#134e4a',   // teal-900
  accent:     '#f59e0b',   // amber-500
  accentSoft: '#fde68a',   // amber-200
  userFrom:   '#0f766e',   // teal-700
  userTo:     '#0d9488',   // teal-600
  panelBg:    '#f4f6f5',   // soft warm-grey
  botBubble:  '#ffffff',
  border:     '#dbe4e2',
  textDark:   '#1f2937',
  textMuted:  '#64748b',
  sqlBg:      '#0f172a',
  sqlText:    '#fbbf24',
};

// ── Store ────────────────────────────────────────────────────────────────────
const useChatStore = create((set) => ({
  messages: [],
  loading: false,
  sessionId: uuidv4(),

  addUser: (content) =>
    set((s) => ({ messages: [...s.messages, { role: 'user', content }] })),

  startBot: () =>
    set((s) => ({
      messages: [...s.messages, { role: 'bot', content: '', sql: '', data: [], streaming: true }],
    })),

  appendToken: (token) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last?.streaming) msgs[msgs.length - 1] = { ...last, content: last.content + token };
      return { messages: msgs };
    }),

  finalise: (answer, sql, data) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last?.streaming) msgs[msgs.length - 1] = { role: 'bot', content: answer, sql, data, streaming: false };
      return { messages: msgs, loading: false };
    }),

  setError: (msg) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last?.streaming) msgs[msgs.length - 1] = { role: 'bot', content: msg, sql: '', data: [], streaming: false };
      return { messages: msgs, loading: false };
    }),

  setLoading: (v) => set({ loading: v }),
  clear: () => set({ messages: [], sessionId: uuidv4(), loading: false }),
}));

// ── Chips ────────────────────────────────────────────────────────────────────
const CHIPS = [
  'What is in order 32?',
  'Components of order 32',
  'Operations for order 32',
  'Show all orders',
  'Show overdue orders',
  'Machine breakdowns this week',
  'Tools issued to operator 5',
];

// ── Custom FAB bot icon (distinct, friendly "scanning" robot face) ─────────────
const BotFaceIcon = () => (
  <svg width="30" height="30" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="6" y="14" width="36" height="26" rx="9" fill="#fff" fillOpacity="0.16" />
    <rect x="6" y="14" width="36" height="26" rx="9" stroke="#fff" strokeWidth="2" />
    <circle cx="17" cy="27" r="3.4" fill="#fff" />
    <circle cx="31" cy="27" r="3.4" fill={THEME.accent} />
    <path d="M18 35h12" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M24 14V7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
    <circle cx="24" cy="5" r="2.6" fill={THEME.accent} />
  </svg>
);

// ── Markdown rendering — clear, well-spaced formatting for bot answers ────────
const markdownComponents = {
  p:     ({ children }) => <p style={{ margin: '0 0 8px', lineHeight: 1.6 }}>{children}</p>,
  h1:    ({ children }) => <h1 style={{ fontSize: 16, fontWeight: 700, margin: '4px 0 8px', color: THEME.textDark }}>{children}</h1>,
  h2:    ({ children }) => <h2 style={{ fontSize: 14.5, fontWeight: 700, margin: '4px 0 8px', color: THEME.textDark }}>{children}</h2>,
  h3:    ({ children }) => <h3 style={{ fontSize: 13.5, fontWeight: 700, margin: '4px 0 6px', color: THEME.textDark }}>{children}</h3>,
  ul:    ({ children }) => <ul style={{ margin: '4px 0 10px', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>{children}</ul>,
  ol:    ({ children }) => <ol style={{ margin: '4px 0 10px', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>{children}</ol>,
  li:    ({ children }) => <li style={{ lineHeight: 1.6 }}>{children}</li>,
  strong: ({ children }) => <strong style={{ color: THEME.userFrom, fontWeight: 700 }}>{children}</strong>,
  a:     ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" style={{ color: THEME.userFrom, textDecoration: 'underline' }}>{children}</a>,
  code:  ({ inline, children }) =>
    inline
      ? <code style={{ background: '#eef6f4', color: THEME.userFrom, padding: '1px 5px', borderRadius: 4, fontSize: 12 }}>{children}</code>
      : <code style={{ display: 'block', background: THEME.sqlBg, color: THEME.sqlText, padding: '10px 12px', borderRadius: 8, fontSize: 12, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>{children}</code>,
  pre:   ({ children }) => <pre style={{ margin: '6px 0 10px', overflowX: 'auto' }}>{children}</pre>,
  hr:    () => <hr style={{ border: 'none', borderTop: `1px solid ${THEME.border}`, margin: '10px 0' }} />,
  table: ({ children }) => (
    <div style={{ overflowX: 'auto', margin: '6px 0 10px', borderRadius: 8, border: `1px solid ${THEME.border}` }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead style={{ background: '#eef6f4' }}>{children}</thead>,
  th:    ({ children }) => <th style={{ padding: '6px 10px', textAlign: 'left', color: THEME.userFrom, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{children}</th>,
  td:    ({ children }) => <td style={{ padding: '6px 10px', borderTop: '1px solid #eef2f1', color: '#334155' }}>{children}</td>,
};


const SqlBlock = ({ sql }) => {
  const [open, setOpen] = useState(false);
  if (!sql) return null;
  return (
    <div style={{ marginTop: 8, borderRadius: 8, border: `1px solid ${THEME.border}`, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 10px', background: '#eef6f4', border: 'none',
          cursor: 'pointer', fontFamily: 'inherit', color: THEME.userFrom, fontSize: 11,
        }}
      >
        <Database size={13} />
        <span style={{ fontWeight: 600, letterSpacing: '0.04em' }}>GENERATED SQL</span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>
      {open && (
        <pre style={{
          margin: 0, padding: '10px 12px',
          background: THEME.sqlBg, color: THEME.sqlText,
          fontSize: 11, overflowX: 'auto', whiteSpace: 'pre-wrap',
        }}>
          {sql}
        </pre>
      )}
    </div>
  );
};

// ── Data display (cards by default — no horizontal scroll; table is optional) ─
const DataTable = ({ data, expanded }) => {
  const [view, setView] = useState('cards'); // 'cards' | 'table'
  if (!data?.length) return null;
  const cols = Object.keys(data[0]);
  const rowLimit = expanded ? 100 : 20;
  const rows = data.slice(0, rowLimit);

  return (
    <div style={{ marginTop: 8, borderRadius: 8, border: `1px solid ${THEME.border}`, overflow: 'hidden' }}>
      {/* Header bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 10px', background: '#eef6f4',
      }}>
        <Database size={13} color={THEME.userFrom} />
        <span style={{ fontWeight: 600, fontSize: 11, letterSpacing: '0.04em', color: THEME.userFrom, textTransform: 'uppercase' }}>
          Result · {data.length} {data.length === 1 ? 'record' : 'records'}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button
            onClick={() => setView('cards')}
            style={{
              border: 'none', cursor: 'pointer', borderRadius: 6, padding: '3px 8px', fontSize: 11,
              display: 'flex', alignItems: 'center', gap: 4,
              background: view === 'cards' ? THEME.userFrom : 'transparent',
              color: view === 'cards' ? '#fff' : THEME.userFrom,
            }}
          >
            <List size={12} /> Cards
          </button>
          <button
            onClick={() => setView('table')}
            style={{
              border: 'none', cursor: 'pointer', borderRadius: 6, padding: '3px 8px', fontSize: 11,
              display: 'flex', alignItems: 'center', gap: 4,
              background: view === 'table' ? THEME.userFrom : 'transparent',
              color: view === 'table' ? '#fff' : THEME.userFrom,
            }}
          >
            <Table2 size={12} /> Table
          </button>
        </div>
      </div>

      {/* Card view — each record shown as label/value pairs, wraps naturally, never needs horizontal scroll */}
      {view === 'cards' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, background: '#fff' }}>
          {rows.map((row, i) => (
            <div key={i} style={{
              borderRadius: 8, border: `1px solid ${THEME.border}`,
              background: i % 2 ? '#f9fbfa' : '#fff', padding: '8px 10px',
              display: 'flex', flexDirection: 'column', gap: 4,
            }}>
              {cols.map(c => (
                <div key={c} style={{ display: 'flex', gap: 8, fontSize: 12, lineHeight: 1.5 }}>
                  <span style={{
                    color: THEME.textMuted, fontWeight: 600, fontSize: 10.5,
                    textTransform: 'uppercase', letterSpacing: '0.03em',
                    flex: '0 0 40%', wordBreak: 'break-word',
                  }}>
                    {c}
                  </span>
                  <span style={{ color: THEME.textDark, flex: 1, wordBreak: 'break-word' }}>
                    {row[c] != null && row[c] !== '' ? String(row[c]) : <i style={{ color: '#ccc' }}>—</i>}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Table view — opt-in, scrolls horizontally only when this view is chosen */}
      {view === 'table' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#eef6f4' }}>
                {cols.map(c => (
                  <th key={c} style={{ padding: '6px 10px', textAlign: 'left', color: THEME.userFrom, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} style={{ borderTop: '1px solid #eef2f1', background: i % 2 ? '#f9fbfa' : '#fff' }}>
                  {cols.map(c => (
                    <td key={c} style={{ padding: '6px 10px', color: '#334155', whiteSpace: 'nowrap', maxWidth: expanded ? 320 : 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {row[c] != null ? String(row[c]) : <i style={{ color: '#ccc' }}>null</i>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.length > rowLimit && (
        <div style={{ padding: '5px 10px', background: '#eef6f4', fontSize: 11, color: THEME.userFrom, borderTop: `1px solid ${THEME.border}` }}>
          Showing {rowLimit} of {data.length} rows{!expanded && ' — expand chat to see more'}
        </div>
      )}
    </div>
  );
};

// ── Message bubble ───────────────────────────────────────────────────────────
const Bubble = ({ msg, expanded }) => {
  const isUser = msg.role === 'user';
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 12, gap: 8, alignItems: 'flex-start' }}>
      {!isUser && (
        <div style={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0, marginTop: 2,
          background: THEME.userFrom, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Bot size={16} color="#fff" />
        </div>
      )}
      <div style={{
        maxWidth: expanded ? '70%' : '80%',
        padding: '10px 14px',
        borderRadius: isUser ? '16px 16px 4px 16px' : '4px 16px 16px 16px',
        background: isUser ? `linear-gradient(135deg, ${THEME.userFrom}, ${THEME.userTo})` : THEME.botBubble,
        color: isUser ? '#fff' : THEME.textDark,
        border: isUser ? 'none' : `1.5px solid ${THEME.border}`,
        boxShadow: isUser ? '0 2px 10px rgba(15,118,110,0.28)' : '0 1px 6px rgba(0,0,0,0.05)',
        fontSize: 13, lineHeight: 1.65,
      }}>
        {msg.streaming && !msg.content
          ? <div style={{ display: 'flex', gap: 4, padding: '2px 0' }}>
              {[0,1,2].map(i => (
                <span key={i} style={{
                  width: 7, height: 7, borderRadius: '50%', background: THEME.accent, display: 'inline-block',
                  animation: `dotBounce 1.2s ${i * 0.2}s ease-in-out infinite`,
                }} />
              ))}
              <style>{`@keyframes dotBounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}`}</style>
            </div>
          : <div style={{ fontSize: 13 }}><ReactMarkdown components={markdownComponents}>{msg.content}</ReactMarkdown></div>
        }
        {!msg.streaming && <><SqlBlock sql={msg.sql} /><DataTable data={msg.data} expanded={expanded} /></>}
      </div>
    </div>
  );
};

// ── ChatPanel ────────────────────────────────────────────────────────────────
export default function ChatPanel() {
  const store = useChatStore();
  const { messages, loading, sessionId } = store;
  const [open, setOpen]       = useState(false);  // panel open/closed
  const [expanded, setExpanded] = useState(false); // big / fullscreen-ish view
  const [input, setInput]     = useState('');
  const bottomRef = useRef(null);
  const abortRef  = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(async (q) => {
    if (!q?.trim() || loading) return;
    setInput('');
    store.addUser(q);
    store.setLoading(true);
    store.startBot();
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch(`${CHATBOT_CONFIG.API_BASE_URL}${CHATBOT_CONFIG.STREAM_ENDPOINT}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, session_id: sessionId }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(res.status);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') break;
          try {
            const p = JSON.parse(raw);
            if (p.type === 'token') store.appendToken(p.content);
            else if (p.type === 'final') store.finalise(p.answer, p.sql, p.data);
            else if (p.type === 'error') store.setError(`⚠️ ${p.message}`);
          } catch { /* ignore partial */ }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') store.setError('Something went wrong. Please try again.');
    } finally {
      store.setLoading(false);
    }
  }, [loading, sessionId, store]);

  const handleClear = useCallback(async () => {
    abortRef.current?.abort();
    try { await fetch(`${CHATBOT_CONFIG.API_BASE_URL}${CHATBOT_CONFIG.HISTORY_ENDPOINT}/${sessionId}`, { method: 'DELETE' }); } catch { }
    store.clear();
  }, [sessionId, store]);

  // ── 1. FAB (closed state) ─────────────────────────────────────────────────
  if (!open) return (
    <div style={{ position: 'fixed', bottom: 28, right: 28, zIndex: 9999 }}>
      {/* Online status dot */}
      <span style={{
        position: 'absolute', top: 2, right: 2, zIndex: 1,
        width: 12, height: 12, borderRadius: '50%',
        background: '#22c55e', border: '2px solid #fff',
      }} />
      <Tooltip title="CMF AI Assistant" placement="left">
        <button
          onClick={() => setOpen(true)}
          style={{
            width: 60, height: 60, borderRadius: '50%',
            background: `linear-gradient(135deg, ${THEME.headerFrom}, ${THEME.headerTo})`,
            border: `3px solid ${THEME.accent}`,
            boxShadow: '0 6px 24px rgba(15,118,110,0.45)',
            color: '#fff', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'transform 0.2s, box-shadow 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(15,118,110,0.6)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)';   e.currentTarget.style.boxShadow = '0 6px 24px rgba(15,118,110,0.45)'; }}
        >
          <BotFaceIcon />
        </button>
      </Tooltip>
    </div>
  );

  // ── 2. Full panel ─────────────────────────────────────────────────────────
  const panelStyle = expanded
    ? {
        position: 'fixed', bottom: 16, right: 16, top: 16, left: 16,
        width: 'auto', height: 'auto',
      }
    : {
        position: 'fixed', bottom: 24, right: 24,
        width: 480, height: 'min(760px, calc(100vh - 48px))',
      };

  return (
    <div style={{
      ...panelStyle,
      zIndex: 9999,
      display: 'flex', flexDirection: 'column',
      borderRadius: 20, overflow: 'hidden',
      boxShadow: '0 20px 60px rgba(0,0,0,0.22), 0 4px 20px rgba(15,118,110,0.18)',
      border: `1.5px solid ${THEME.border}`,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      background: '#fff',
      transition: 'all 0.2s ease',
    }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
        background: `linear-gradient(135deg, ${THEME.headerFrom}, ${THEME.headerTo})`, flexShrink: 0,
      }}>
        <div style={{ position: 'relative' }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'rgba(255,255,255,0.14)', border: `2px solid ${THEME.accent}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Bot size={20} color="#fff" />
          </div>
          <span style={{
            position: 'absolute', bottom: 0, right: 0,
            width: 10, height: 10, borderRadius: '50%',
            background: loading ? THEME.accent : '#22c55e',
            border: `2px solid ${THEME.headerFrom}`,
          }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
            CMF AI Assistant
            <Sparkles size={13} color={THEME.accent} />
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>
            {loading ? 'Thinking…' : 'Ask about your manufacturing data'}
          </div>
        </div>
        <Tooltip title="Clear chat">
          <Button type="text" icon={<Trash2 size={16} />} onClick={handleClear}
            style={{ color: 'rgba(255,255,255,0.85)' }} />
        </Tooltip>
        <Tooltip title={expanded ? 'Restore size' : 'Expand view'}>
          <Button type="text" icon={expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            onClick={() => setExpanded(e => !e)}
            style={{ color: 'rgba(255,255,255,0.85)' }} />
        </Tooltip>
        <Tooltip title="Close">
          <Button type="text" icon={<X size={16} />}
            onClick={() => { abortRef.current?.abort(); setOpen(false); setExpanded(false); }}
            style={{ color: 'rgba(255,255,255,0.85)' }} />
        </Tooltip>
      </div>

      {/* Messages area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 12px', background: THEME.panelBg }}>
        {messages.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', gap: 10 }}>
            <div style={{
              width: 68, height: 68, borderRadius: '50%',
              background: '#e3f0ed', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Bot size={32} color={THEME.userFrom} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: THEME.textDark }}>How can I help you?</div>
            <div style={{ fontSize: 12, color: THEME.textMuted, maxWidth: 260, lineHeight: 1.6 }}>
              Ask about orders, parts, operations, machines or inventory.
              Try a chip below to get started!
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: expanded ? 900 : '100%', margin: '0 auto' }}>
            {messages.map((msg, i) => <Bubble key={i} msg={msg} expanded={expanded} />)}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestion chips */}
      <div style={{ padding: '8px 12px 4px', background: '#fff', borderTop: `1px solid ${THEME.border}`, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {CHIPS.map(c => (
          <Tag
            key={c}
            style={{
              cursor: loading ? 'not-allowed' : 'pointer', fontSize: 11, borderRadius: 20,
              padding: '2px 10px', opacity: loading ? 0.5 : 1, marginBottom: 3,
              color: THEME.userFrom, background: '#eef6f4', border: `1px solid ${THEME.border}`,
            }}
            onClick={() => !loading && send(c)}
          >
            {c}
          </Tag>
        ))}
      </div>

      {/* Input row */}
      <div style={{ padding: '8px 12px 12px', background: '#fff', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <TextArea
          autoSize={{ minRows: 1, maxRows: 4 }}
          value={input}
          onChange={e => setInput(e.target.value)}
          onPressEnter={e => { if (!e.shiftKey) { e.preventDefault(); send(input); } }}
          placeholder="Ask about your manufacturing data…"
          disabled={loading}
          style={{ borderRadius: 12, fontSize: 13, flex: 1 }}
        />
        <Button
          type="primary" shape="circle"
          icon={loading ? <Spin size="small" /> : <Send size={16} />}
          disabled={loading || !input.trim()}
          onClick={() => send(input)}
          style={{
            width: 38, height: 38, border: 'none', flexShrink: 0,
            background: `linear-gradient(135deg, ${THEME.userFrom}, ${THEME.userTo})`,
          }}
        />
      </div>
    </div>
  );
}