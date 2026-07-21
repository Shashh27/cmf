import { useEffect, useRef, useState, useCallback } from 'react';
import {
  DataTable,
  FollowUpSuggestions,
} from './ChatbotResponse';
import { Button, Input, Tooltip } from 'antd';
import ReactMarkdown from 'react-markdown';
import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { Send, Trash2, X, Maximize2, Minimize2, Lightbulb, Square } from 'lucide-react';
import { CHATBOT_CONFIG } from '../Config/chatbot';
import { authFetch, getAccessToken } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { getAnswerSummary } from './chatbotUtils';
import './chatbot.css';

const { TextArea } = Input;
const CHATBOT_ICON = '/chatbot.png';

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

  finalise: (answer, sql, data, suggestions) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last?.streaming) {
        msgs[msgs.length - 1] = {
          role: 'bot',
          content: answer,
          sql,
          data,
          suggestions,
          streaming: false,
        };
      }
      return { messages: msgs, loading: false };
    }),

  setError: (msg) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last?.streaming) {
        msgs[msgs.length - 1] = {
          role: 'bot',
          content: msg,
          sql: '',
          data: [],
          streaming: false,
        };
      }
      return { messages: msgs, loading: false };
    }),

  setLoading: (v) => set({ loading: v }),

  cancelBot: () =>
    set((s) => {
      const msgs = [...s.messages];
      if (msgs[msgs.length - 1]?.streaming) {
        msgs.pop();
      }
      return { messages: msgs, loading: false };
    }),

  clear: () => set({ messages: [], sessionId: uuidv4(), loading: false }),
}));

function flattenPrompts(apiPrompts, categories, dbPrompts, rolePrompts) {
  if (apiPrompts?.length) {
    return apiPrompts.slice(0, 6);
  }
  const seen = new Set();
  const out = [];
  const add = (p) => {
    if (p && !seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  };
  for (const p of dbPrompts || []) add(p);
  for (const p of rolePrompts || []) add(p);
  for (const cat of categories || []) {
    for (const p of cat.prompts || []) add(p);
  }
  return out.slice(0, 6);
}

const mdComponents = {
  p: ({ children }) => <p>{children}</p>,
  strong: ({ children }) => <strong>{children}</strong>,
  ul: ({ children }) => <ul style={{ margin: '6px 0', paddingLeft: 18 }}>{children}</ul>,
  li: ({ children }) => <li style={{ marginBottom: 4 }}>{children}</li>,
};

function BotMessage({ msg, onSuggestionClick, showFollowUps }) {
  const hasData = msg.data?.length > 0;
  const summary = getAnswerSummary(msg.content, msg.data?.length || 0);

  if (msg.streaming && !msg.content) {
    return (
      <div className="cmf-msg-bot-text">
        <div className="cmf-typing">
          <span /><span /><span />
        </div>
      </div>
    );
  }

  return (
    <div className="cmf-msg-bot">
      {summary && (
        <div className="cmf-msg-bot-text">
          <ReactMarkdown components={mdComponents}>{summary}</ReactMarkdown>
        </div>
      )}
      {!msg.streaming && hasData && <DataTable data={msg.data} />}
      {!msg.streaming && showFollowUps && (
        <FollowUpSuggestions
          suggestions={msg.suggestions}
          onSelect={onSuggestionClick}
        />
      )}
    </div>
  );
}

const FAB_SIZE = 58;
const FAB_MARGIN = 20;

function useViewport() {
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    isMobile: window.innerWidth < 768,
    isTablet: window.innerWidth >= 768 && window.innerWidth < 1024,
  }));

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      setViewport({
        width: w,
        height: window.innerHeight,
        isMobile: w < 768,
        isTablet: w >= 768 && w < 1024,
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return viewport;
}

export default function ChatPanel() {
  const store = useChatStore();
  const { messages, loading, sessionId } = store;
  const { isMobile, isTablet } = useViewport();
  const { accessToken, isAuthenticated, bootstrapping } = useAuth();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);
  const abortRef = useRef(null);
  const userStoppedRef = useRef(false);

  const [fabOffset, setFabOffset] = useState({ x: 0, y: 0 });
  const fabOffsetRef = useRef(fabOffset);
  const [isDragging, setIsDragging] = useState(false);
  const [hasDragged, setHasDragged] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const dragStartOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    fabOffsetRef.current = fabOffset;
  }, [fabOffset]);
  const [promptCategories, setPromptCategories] = useState([]);
  const [dbPrompts, setDbPrompts] = useState([]);
  const [rolePrompts, setRolePrompts] = useState([]);
  const [apiPrompts, setApiPrompts] = useState([]);
  const [promptsLoading, setPromptsLoading] = useState(true);
  const [showIdeas, setShowIdeas] = useState(false);

  const quickPrompts = flattenPrompts(apiPrompts, promptCategories, dbPrompts, rolePrompts);
  const lastBotIndex = messages.reduce((idx, m, i) => (m.role === 'bot' ? i : idx), -1);

  // Reset FAB to bottom-right corner on resize, rotate, or refresh
  useEffect(() => {
    const resetFab = () => setFabOffset({ x: 0, y: 0 });
    resetFab();
    window.addEventListener('resize', resetFab);
    window.addEventListener('orientationchange', resetFab);
    return () => {
      window.removeEventListener('resize', resetFab);
      window.removeEventListener('orientationchange', resetFab);
    };
  }, []);

  const loadSuggestions = useCallback(async () => {
    // Wait for JWT — endpoint requires Bearer auth (no query-param identity).
    if (bootstrapping || !isAuthenticated || !(accessToken || getAccessToken())) {
      setPromptsLoading(false);
      return;
    }
    setPromptsLoading(true);
    try {
      const res = await authFetch(
        `${CHATBOT_CONFIG.API_BASE_URL}${CHATBOT_CONFIG.SUGGESTIONS_ENDPOINT}`,
      );
      if (!res.ok) return;
      const data = await res.json();
      setApiPrompts(data.prompts || []);
      setPromptCategories(data.categories || []);
      setDbPrompts(data.from_database || []);
      setRolePrompts(data.role_prompts || []);
    } catch { /* backend suggestions unavailable */ }
    finally {
      setPromptsLoading(false);
    }
  }, [accessToken, isAuthenticated, bootstrapping]);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const clampFabOffset = useCallback((x, y) => {
    const maxLeft = -(window.innerWidth - FAB_SIZE - FAB_MARGIN * 2);
    const maxUp = -(window.innerHeight - FAB_SIZE - FAB_MARGIN * 2);
    return {
      x: Math.max(maxLeft, Math.min(0, x)),
      y: Math.max(maxUp, Math.min(0, y)),
    };
  }, []);

  const startDrag = useCallback((clientX, clientY) => {
    setIsDragging(true);
    setHasDragged(false);
    dragStartPos.current = { x: clientX, y: clientY };
    dragStartOffset.current = { ...fabOffsetRef.current };
  }, []);

  const handlePointerDown = (e) => {
    e.preventDefault();
    startDrag(e.clientX, e.clientY);
  };

  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    if (!touch) return;
    startDrag(touch.clientX, touch.clientY);
  };

  useEffect(() => {
    const onMove = (clientX, clientY) => {
      if (!isDragging) return;
      const dist = Math.hypot(
        clientX - dragStartPos.current.x,
        clientY - dragStartPos.current.y,
      );
      if (dist > 5) setHasDragged(true);
      const dx = clientX - dragStartPos.current.x;
      const dy = clientY - dragStartPos.current.y;
      setFabOffset(clampFabOffset(
        dragStartOffset.current.x + dx,
        dragStartOffset.current.y + dy,
      ));
    };

    const onMouseMove = (e) => onMove(e.clientX, e.clientY);
    const onTouchMove = (e) => {
      const touch = e.touches[0];
      if (touch) onMove(touch.clientX, touch.clientY);
    };
    const onEnd = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onEnd);
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('touchend', onEnd);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [isDragging, clampFabOffset]);

  const stopRequest = useCallback(() => {
    userStoppedRef.current = true;
    abortRef.current?.abort();
    store.cancelBot();
  }, [store]);

  const send = useCallback(async (q) => {
    if (!q?.trim() || loading) return;
    userStoppedRef.current = false;
    setInput('');
    store.addUser(q);
    store.setLoading(true);
    store.startBot();
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const timer = setTimeout(() => ctrl.abort(), 12000);

    try {
      const res = await authFetch(
        `${CHATBOT_CONFIG.API_BASE_URL}${CHATBOT_CONFIG.CHAT_ENDPOINT}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: q,
            session_id: sessionId,
            
          }),
          signal: ctrl.signal,
        },
      );
      if (!res.ok) {
        let message = `Request failed (${res.status})`;
        try {
          const payload = await res.json();
          if (payload?.detail) message = payload.detail;
        } catch { /* ignore */ }
        throw new Error(message);
      }

      const p = await res.json();
      store.finalise(p.answer, p.sql, p.data, p.suggestions);
    } catch (e) {
      if (e.name === 'AbortError') {
        if (userStoppedRef.current) {
          store.cancelBot();
        } else {
          store.setError('Request timed out. Try again or use the stop button.');
        }
      } else {
        const msg = e.message === 'Failed to fetch'
          ? 'Backend server is not reachable. Check that uvicorn is running.'
          : (e.message || 'Something went wrong. Please try again.');
        store.setError(msg);
      }
    } finally {
      clearTimeout(timer);
      store.setLoading(false);
    }
  }, [loading, sessionId, store]);

  const handleClear = useCallback(async () => {
    abortRef.current?.abort();
    try {
      await authFetch(
        `${CHATBOT_CONFIG.API_BASE_URL}${CHATBOT_CONFIG.HISTORY_ENDPOINT}/${sessionId}`,
        { method: 'DELETE' },
      );
    } catch { /* ignore */ }
    store.clear();
  }, [sessionId, store]);

  if (!open) {
    return (
      <div
        className="cmf-chat-fab-wrap"
        style={{
          transform: `translate(${fabOffset.x}px, ${fabOffset.y}px)`,
        }}
      >
        <Tooltip title="CMF Assistant" placement="left">
          <button
            type="button"
            className={`cmf-chat-fab${isDragging ? ' is-dragging' : ''}`}
            onMouseDown={handlePointerDown}
            onTouchStart={handleTouchStart}
            onClick={() => !hasDragged && setOpen(true)}
          >
            <img src={CHATBOT_ICON} alt="CMF Assistant" className="cmf-chat-fab-img" />
          </button>
        </Tooltip>
      </div>
    );
  }

  const panelClass = [
    'cmf-chat-panel',
    isMobile ? 'mobile' : isTablet ? 'tablet' : expanded ? 'expanded' : 'default',
  ].join(' ');

  return (
    <div className={panelClass}>
      <header className="cmf-chat-header">
        <div className="cmf-chat-header-icon">
          <img src={CHATBOT_ICON} alt="" className="cmf-chat-header-img" />
        </div>
        <div className="cmf-chat-header-text">
          <div className="cmf-chat-header-title">CMF Assistant</div>
          <div className="cmf-chat-header-sub">
            {loading ? 'Fetching data…' : 'Orders · Parts · Machines · Inventory'}
          </div>
        </div>
        <Tooltip title="Clear chat">
          <Button type="text" size="small" icon={<Trash2 size={15} />} onClick={handleClear} />
        </Tooltip>
        {!isMobile && (
          <Tooltip title={expanded ? 'Restore' : 'Expand'}>
            <Button
              type="text"
              size="small"
              icon={expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              onClick={() => setExpanded((v) => !v)}
            />
          </Tooltip>
        )}
        <Tooltip title="Close">
          <Button
            type="text"
            size="small"
            icon={<X size={15} />}
            onClick={() => {
              abortRef.current?.abort();
              setOpen(false);
              setExpanded(false);
              setShowIdeas(false);
              setFabOffset({ x: 0, y: 0 });
            }}
          />
        </Tooltip>
      </header>

      <div className="cmf-chat-messages">
        {messages.length === 0 ? (
          <div className="cmf-chat-empty">
            <img src={CHATBOT_ICON} alt="" className="cmf-chat-empty-img" />
            <h3>Ask about your shop floor data</h3>
            <p>
              Search orders, parts, operations, machines, stock, and operators using plain language.
            </p>
            <div className="cmf-empty-prompts">
              {promptsLoading ? (
                <p className="cmf-empty-loading">Loading suggestions from your data…</p>
              ) : quickPrompts.length ? (
                quickPrompts.slice(0, 4).map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="cmf-empty-prompt"
                    disabled={loading}
                    onClick={() => send(c)}
                  >
                    {c}
                  </button>
                ))
              ) : (
                <p className="cmf-empty-loading">Type your question below.</p>
              )}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`cmf-msg-row ${msg.role}`}>
              {msg.role === 'user' ? (
                <div className="cmf-msg-user">{msg.content}</div>
              ) : (
                <BotMessage
                  msg={msg}
                  onSuggestionClick={send}
                  showFollowUps={i === lastBotIndex && !loading}
                />
              )}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {showIdeas && (
        <div className="cmf-ideas-panel">
          {quickPrompts.map((c) => (
            <button
              key={c}
              type="button"
              className="cmf-ideas-item"
              disabled={loading}
              onClick={() => {
                send(c);
                setShowIdeas(false);
              }}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="cmf-chat-input-row">
        <Tooltip title={showIdeas ? 'Hide examples' : 'Example questions'}>
          <Button
            type="text"
            size="small"
            className={`cmf-ideas-toggle${showIdeas ? ' active' : ''}`}
            icon={<Lightbulb size={16} />}
            onClick={() => setShowIdeas((v) => !v)}
          />
        </Tooltip>
        <TextArea
          autoSize={{ minRows: 1, maxRows: 4 }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPressEnter={(e) => {
            if (!e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="e.g. parts for SO-001, stock for EN8…"
          disabled={loading}
          style={{ flex: 1, borderRadius: 8 }}
        />
        <Button
          type={loading ? 'default' : 'primary'}
          shape="circle"
          danger={loading}
          icon={loading ? <Square size={14} fill="currentColor" /> : <Send size={15} />}
          disabled={!loading && !input.trim()}
          onClick={loading ? stopRequest : () => send(input)}
        />
      </div>
    </div>
  );
}
