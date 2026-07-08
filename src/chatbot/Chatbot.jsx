import { useEffect, useRef, useState, useCallback } from 'react';
import { Button, Input, Tag, Spin, Tooltip } from 'antd';
import ReactMarkdown from 'react-markdown';
import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import {
  Bot, Send, Trash2, X, Maximize2, Minimize2, Sparkles,
} from 'lucide-react';
import { CHATBOT_CONFIG } from '../Config/chatbot';
import { SqlBlock, DataTable, FollowUpSuggestions } from './ChatbotResponse';

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

  addUser: (content, question) =>
    set((s) => ({ messages: [...s.messages, { role: 'user', content, question }] })),

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

  finalise: (answer, sql, data, question, suggestions) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last?.streaming) msgs[msgs.length - 1] = { role: 'bot', content: answer, sql, data, question, suggestions, streaming: false };
      return { messages: msgs, loading: false };
    }),

  setError: (msg, question) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last?.streaming) msgs[msgs.length - 1] = { role: 'bot', content: msg, sql: '', data: [], question, streaming: false };
      return { messages: msgs, loading: false };
    }),

  setLoading: (v) => set({ loading: v }),
  clear: () => set({ messages: [], sessionId: uuidv4(), loading: false }),
}));

// ── Chips ────────────────────────────────────────────────────────────────────
const CHIPS = [
  'Show all orders',
  'Show overdue orders',
  'List all products',
  'Show all customers',
  'Show work centers',
  'List all machines',
  'Pending operations',
  'In-progress operations',
  'Machine breakdowns',
  'Tool issues',
  'List operators',
  'Operator leaves',
  'Raw materials',
  'Vendors',
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

// ── Markdown rendering — ChatGPT style ────────────────────────────────────────
const markdownComponents = {
  p:     ({ children }) => <p style={{ margin: '0 0 10px', lineHeight: 1.7, fontSize: 13.5 }}>{children}</p>,
  h1:    ({ children }) => <h1 style={{ fontSize: 18, fontWeight: 700, margin: '8px 0 12px', color: THEME.textDark }}>{children}</h1>,
  h2:    ({ children }) => <h2 style={{ fontSize: 16, fontWeight: 600, margin: '6px 0 10px', color: THEME.textDark }}>{children}</h2>,
  h3:    ({ children }) => <h3 style={{ fontSize: 14, fontWeight: 600, margin: '4px 0 8px', color: THEME.textDark }}>{children}</h3>,
  ul:    ({ children }) => <ul style={{ margin: '4px 0 12px', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</ul>,
  ol:    ({ children }) => <ol style={{ margin: '4px 0 12px', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</ol>,
  li:    ({ children }) => <li style={{ lineHeight: 1.7 }}>{children}</li>,
  strong: ({ children }) => <strong style={{ color: THEME.textDark, fontWeight: 600 }}>{children}</strong>,
  a:     ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" style={{ color: THEME.userFrom, textDecoration: 'underline' }}>{children}</a>,
  code:  ({ inline, children }) =>
    inline
      ? <code style={{ background: '#f3f4f6', color: '#ef4444', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>{children}</code>
      : <code style={{ display: 'block', background: THEME.sqlBg, color: THEME.sqlText, padding: '12px 14px', borderRadius: 8, fontSize: 12, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>{children}</code>,
  pre:   ({ children }) => <pre style={{ margin: '8px 0 12px', overflowX: 'auto' }}>{children}</pre>,
  hr:    () => <hr style={{ border: 'none', borderTop: `1px solid ${THEME.border}`, margin: '12px 0' }} />,
  table: ({ children }) => (
    <div style={{ overflowX: 'auto', margin: '8px 0 12px', borderRadius: 8, border: `1px solid ${THEME.border}` }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead style={{ background: '#f9fafb' }}>{children}</thead>,
  th:    ({ children }) => <th style={{ padding: '10px 12px', textAlign: 'left', color: THEME.textDark, fontWeight: 600, fontSize: 12, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{children}</th>,
  td:    ({ children }) => <td style={{ padding: '10px 12px', borderTop: '1px solid #f3f4f6', color: '#374151' }}>{children}</td>,
};

// ── Message bubble (ChatGPT style) ───────────────────────────────────────────
const Bubble = ({ msg, expanded, onSuggestionClick }) => {
  const isUser = msg.role === 'user';
  const suggestions = msg.suggestions || [];
  
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 20, gap: 12, alignItems: 'flex-start' }}>
      {!isUser && (
        <div style={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0, marginTop: 2,
          background: THEME.userFrom, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Bot size={16} color="#fff" />
        </div>
      )}
      <div style={{
        maxWidth: expanded ? '72%' : '85%',
        padding: '14px 16px',
        borderRadius: isUser ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
        background: isUser ? `linear-gradient(135deg, ${THEME.userFrom}, ${THEME.userTo})` : '#ffffff',
        color: isUser ? '#fff' : THEME.textDark,
        border: isUser ? 'none' : `1px solid ${THEME.border}`,
        boxShadow: isUser ? '0 2px 12px rgba(15,118,110,0.25)' : '0 1px 8px rgba(0,0,0,0.06)',
        fontSize: 14, lineHeight: 1.7,
      }}>
        {msg.streaming && !msg.content
          ? <div style={{ display: 'flex', gap: 4, padding: '4px 0' }}>
              {[0,1,2].map(i => (
                <span key={i} style={{
                  width: 8, height: 8, borderRadius: '50%', background: THEME.accent, display: 'inline-block',
                  animation: `dotBounce 1.2s ${i * 0.2}s ease-in-out infinite`,
                }} />
              ))}
              <style>{`@keyframes dotBounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}`}</style>
            </div>
          : <><ReactMarkdown components={markdownComponents}>{msg.content}</ReactMarkdown></>
        }
        {!msg.streaming && (
          <>
            <SqlBlock sql={msg.sql} />
            <DataTable data={msg.data} />
            <FollowUpSuggestions suggestions={suggestions} onSelect={onSuggestionClick} />
          </>
        )}
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
  
  // Drag state for FAB
  const [position, setPosition] = useState({ x: window.innerWidth - 88, y: window.innerHeight - 88 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [hasDragged, setHasDragged] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Handle window resize for responsive behavior
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      
      // Reset position on resize if it's out of bounds
      setPosition(prev => {
        const maxX = window.innerWidth - 60;
        const maxY = window.innerHeight - 60;
        return {
          x: Math.max(0, Math.min(prev.x, maxX)),
          y: Math.max(0, Math.min(prev.y, maxY)),
        };
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => () => abortRef.current?.abort(), []);

  // Drag handlers
  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
    setHasDragged(false);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      
      // Check if user has dragged significantly (more than 5 pixels)
      const dragDistance = Math.sqrt(
        Math.pow(e.clientX - dragStartPos.current.x, 2) +
        Math.pow(e.clientY - dragStartPos.current.y, 2)
      );
      if (dragDistance > 5) {
        setHasDragged(true);
      }
      
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;
      
      // Keep within viewport bounds
      const maxX = window.innerWidth - 60;
      const maxY = window.innerHeight - 60;
      
      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY)),
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const send = useCallback(async (q, isSuggestion = false) => {
    if (!q?.trim() || loading) return;
    setInput('');
    store.addUser(q, q);
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
      let finalAnswer = '';
      let finalSql = '';
      let finalData = [];
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
            if (p.type === 'token') {
              store.appendToken(p.content);
              finalAnswer += p.content;
            }
            else if (p.type === 'final') {
              finalSql = p.sql;
              finalData = p.data;
              store.finalise(p.answer, p.sql, p.data, q, p.suggestions);
            }
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
    <div style={{ position: 'fixed', left: position.x, top: position.y, zIndex: 9999 }}>
      {/* Online status dot */}
      <span style={{
        position: 'absolute', top: 2, right: 2, zIndex: 1,
        width: 12, height: 12, borderRadius: '50%',
        background: '#22c55e', border: '2px solid #fff',
      }} />
      <Tooltip title="CMF AI Assistant (drag to move)" placement="left">
        <button
          onMouseDown={handleMouseDown}
          onClick={() => !hasDragged && setOpen(true)}
          style={{
            width: 60, height: 60, borderRadius: '50%',
            background: `linear-gradient(135deg, ${THEME.headerFrom}, ${THEME.headerTo})`,
            border: `3px solid ${THEME.accent}`,
            boxShadow: isDragging ? '0 10px 30px rgba(15,118,110,0.6)' : '0 6px 24px rgba(15,118,110,0.45)',
            color: '#fff', cursor: isDragging ? 'grabbing' : 'grab',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: isDragging ? 'none' : 'transform 0.2s, box-shadow 0.2s',
            transform: isDragging ? 'scale(1.08)' : 'scale(1)',
          }}
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
    : isMobile
    ? {
        position: 'fixed', bottom: 0, right: 0, left: 0, top: 0,
        width: '100%', height: '100%',
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
      borderRadius: isMobile ? 0 : 20,
      overflow: 'hidden',
      boxShadow: isMobile ? 'none' : '0 20px 60px rgba(0,0,0,0.22), 0 4px 20px rgba(15,118,110,0.18)',
      border: isMobile ? 'none' : `1.5px solid ${THEME.border}`,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      background: '#fff',
      transition: 'all 0.2s ease',
    }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: isMobile ? '10px 12px' : '12px 14px',
        background: `linear-gradient(135deg, ${THEME.headerFrom}, ${THEME.headerTo})`, flexShrink: 0,
      }}>
        <div style={{ position: 'relative' }}>
          <div style={{
            width: isMobile ? 32 : 36, height: isMobile ? 32 : 36, borderRadius: '50%',
            background: 'rgba(255,255,255,0.14)', border: `2px solid ${THEME.accent}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Bot size={isMobile ? 18 : 20} color="#fff" />
          </div>
          <span style={{
            position: 'absolute', bottom: 0, right: 0,
            width: 10, height: 10, borderRadius: '50%',
            background: loading ? THEME.accent : '#22c55e',
            border: `2px solid ${THEME.headerFrom}`,
          }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: isMobile ? 13 : 14, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
            CMF AI Assistant
            <Sparkles size={isMobile ? 12 : 13} color={THEME.accent} />
          </div>
          <div style={{ fontSize: isMobile ? 10 : 11, color: 'rgba(255,255,255,0.65)' }}>
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
      <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '12px 10px' : '14px 12px', background: THEME.panelBg }}>
        {messages.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', gap: 10 }}>
            <div style={{
              width: isMobile ? 56 : 68, height: isMobile ? 56 : 68, borderRadius: '50%',
              background: '#e3f0ed', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Bot size={isMobile ? 28 : 32} color={THEME.userFrom} />
            </div>
            <div style={{ fontSize: isMobile ? 14 : 15, fontWeight: 600, color: THEME.textDark }}>How can I help you?</div>
            <div style={{ fontSize: isMobile ? 11 : 12, color: THEME.textMuted, maxWidth: isMobile ? 280 : 300, lineHeight: 1.6 }}>
              Ask about orders (by sale order number or ID), parts, operations,
              machines, work centers, inventory, quality, or operators.
              Try a chip below to get started!
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: expanded ? 900 : '100%', margin: '0 auto' }}>
            {messages.map((msg, i) => <Bubble key={i} msg={msg} expanded={expanded} onSuggestionClick={send} />)}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestion chips */}
      <div style={{ padding: isMobile ? '6px 10px 4px' : '8px 12px 4px', background: '#fff', borderTop: `1px solid ${THEME.border}`, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {CHIPS.map(c => (
          <Tag
            key={c}
            style={{
              cursor: loading ? 'not-allowed' : 'pointer', fontSize: isMobile ? 10 : 11, borderRadius: 20,
              padding: isMobile ? '2px 8px' : '2px 10px', opacity: loading ? 0.5 : 1, marginBottom: 3,
              color: THEME.userFrom, background: '#eef6f4', border: `1px solid ${THEME.border}`,
            }}
            onClick={() => !loading && send(c)}
          >
            {c}
          </Tag>
        ))}
      </div>

      {/* Input row */}
      <div style={{ padding: isMobile ? '8px 10px 12px' : '8px 12px 12px', background: '#fff', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <TextArea
          autoSize={{ minRows: 1, maxRows: 4 }}
          value={input}
          onChange={e => setInput(e.target.value)}
          onPressEnter={e => { if (!e.shiftKey) { e.preventDefault(); send(input); } }}
          placeholder="Ask about your manufacturing data…"
          disabled={loading}
          style={{ borderRadius: isMobile ? 10 : 12, fontSize: isMobile ? 12 : 13, flex: 1 }}
        />
        <Button
          type="primary" shape="circle"
          icon={loading ? <Spin size="small" /> : <Send size={isMobile ? 14 : 16} />}
          disabled={loading || !input.trim()}
          onClick={() => send(input)}
          style={{
            width: isMobile ? 36 : 38, height: isMobile ? 36 : 38, border: 'none', flexShrink: 0,
            background: `linear-gradient(135deg, ${THEME.userFrom}, ${THEME.userTo})`,
          }}
        />
      </div>
    </div>
  );
}