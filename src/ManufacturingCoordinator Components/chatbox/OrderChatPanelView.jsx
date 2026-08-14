import React, { useMemo, useState } from 'react';
import {
  Drawer,
  Button,
  Input,
  Space,
  Typography,
  Badge,
  Spin,
  Empty,
  Modal,
  Select,
  Tooltip,
  App,
  Popconfirm,
} from 'antd';
import {
  MessageOutlined,
  SendOutlined,
  PlusOutlined,
  ArrowLeftOutlined,
  CloseOutlined,
  TeamOutlined,
  UserOutlined,
  DeleteOutlined,
  EditOutlined,
  ClearOutlined,
  UndoOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import {
  conversationTitle,
  formatMsgTime,
  formatConvTime,
  avatarInitials,
  isMessageEdited,
} from './chatUtils';

const { Text, Title } = Typography;
const { TextArea } = Input;

function useDrawerWidth() {
  const [w, setW] = React.useState(
    typeof window !== 'undefined' ? window.innerWidth : 1200
  );
  React.useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  if (w < 576) return '100%';
  if (w < 768) return 'min(100%, 520px)';
  if (w < 992) return 'min(92vw, 720px)';
  return 'min(920px, 92vw)';
}

export default function OrderChatPanelView({
  open,
  onClose,
  orderId,
  orderLabel,
  currentUserId,
  chat,
}) {
  const { message: messageApi } = App.useApp();
  const drawerWidth = useDrawerWidth();

  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState('group');
  const [createName, setCreateName] = useState('');
  const [createParticipants, setCreateParticipants] = useState([]);
  const [creating, setCreating] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingPreview, setEditingPreview] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [convSearch, setConvSearch] = useState('');

  const {
    loading,
    conversations,
    totalUnread,
    stakeholders,
    activeConvId,
    messages,
    messagesLoading,
    draft,
    setDraft,
    sending,
    replyTo,
    setReplyTo,
    mobileView,
    wsConnected,
    messagesEndRef,
    handleSelectConv,
    handleBackToList,
    handleSend,
    handleDeleteMessage,
    handleEditMessage,
    handleDeleteConversation,
    handleClearAllMessages,
    handleCreateConversation,
  } = chat;

  const activeConv = useMemo(
    () => conversations.find((c) => c.id === activeConvId) || null,
    [conversations, activeConvId]
  );

  const activeTitle = useMemo(
    () => conversationTitle(activeConv, currentUserId),
    [activeConv, currentUserId]
  );

  const otherStakeholders = useMemo(
    () => (stakeholders || []).filter((s) => s.user_id !== currentUserId),
    [stakeholders, currentUserId]
  );

  const filteredConversations = useMemo(() => {
    const q = convSearch.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((conv) => {
      const title = conversationTitle(conv, currentUserId).toLowerCase();
      const preview = (conv.last_message_preview || '').toLowerCase();
      const participants = (conv.participants || [])
        .map((p) => p.user_name)
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return title.includes(q) || preview.includes(q) || participants.includes(q);
    });
  }, [conversations, convSearch, currentUserId]);

  const openCreateModal = (type) => {
    setCreateType(type);
    setCreateName(
      type === 'group'
        ? orderLabel
          ? `Order ${orderLabel} Discussion`
          : 'Order Discussion'
        : ''
    );
    setCreateParticipants([]);
    setCreateOpen(true);
  };

  const canDeleteConversation =
    activeConv && Number(activeConv.created_by) === Number(currentUserId);

  const cancelEditMessage = () => {
    setEditingMessageId(null);
    setEditingPreview('');
    setDraft('');
  };

  const startEditMessage = (message) => {
    setReplyTo(null);
    setEditingMessageId(message.id);
    setEditingPreview(message.message_text || '');
    setDraft(message.message_text || '');
  };

  const onComposerSubmit = async () => {
    const text = draft.trim();
    if (!text) return;

    if (editingMessageId) {
      setSavingEdit(true);
      const ok = await handleEditMessage(editingMessageId, text);
      setSavingEdit(false);
      if (ok) cancelEditMessage();
      return;
    }

    handleSend();
  };

  const onCreate = async () => {
    if (!createName.trim()) {
      messageApi.warning('Conversation name is required');
      return;
    }
    setCreating(true);
    await handleCreateConversation({
      createType,
      createName,
      createParticipants,
      stakeholders,
      orderLabel,
      onSuccess: () => setCreateOpen(false),
    });
    setCreating(false);
  };

  const hideSidebarOnMobile = activeConvId && mobileView === 'chat';
  const hideMainOnMobile = !activeConvId || mobileView === 'list';

  const title = (
    <Space wrap>
      <Badge count={totalUnread} size="small" overflowCount={99} offset={[6, 0]}>
        <MessageOutlined className="order-chatbox-drawer-title-icon" />
      </Badge>
      <span>
        Order Chat
        {orderLabel ? (
          <Text type="secondary" style={{ marginLeft: 8, fontWeight: 400, color: '#8696a0' }}>
            #{orderLabel}
          </Text>
        ) : null}
      </span>
      <span
        style={{
          fontSize: 11,
          color: wsConnected ? '#0da3d8' : '#5c6770',
          marginLeft: 4,
        }}
      >
        {wsConnected ? '● online' : '○ offline'}
      </span>
    </Space>
  );

  return (
    <>
      <Drawer
        title={title}
        placement="right"
        size={drawerWidth}
        open={open}
        onClose={onClose}
        destroyOnHidden={false}
        className="order-chatbox-drawer"
        styles={{ body: { padding: 0, height: '100%' } }}
        rootClassName="order-chatbox-drawer-root"
      >
        {!orderId ? (
          <div className="order-chatbox-empty">No order selected</div>
        ) : loading && conversations.length === 0 ? (
          <div className="order-chatbox-empty">
            <Spin />
          </div>
        ) : (
          <div className="order-chatbox-layout">
            <aside
              className={`order-chatbox-sidebar${
                hideSidebarOnMobile ? ' is-hidden-mobile' : ''
              }`}
            >
              <div className="order-chatbox-sidebar-header">
                <Text strong className="order-chatbox-label">
                  Chats
                </Text>
                <Space wrap size={8} className="order-chatbox-header-actions">
                  <Button
                    size="small"
                    type="primary"
                    icon={<TeamOutlined />}
                    onClick={() => openCreateModal('group')}
                  >
                    <span className="order-chatbox-btn-text">New group</span>
                  </Button>
                  <Button
                    size="small"
                    icon={<UserOutlined />}
                    onClick={() => openCreateModal('individual')}
                    disabled={otherStakeholders.length === 0}
                  >
                    <span className="order-chatbox-btn-text">New chat</span>
                  </Button>
                </Space>
              </div>
              <div className="order-chatbox-sidebar-search">
                <Input
                  allowClear
                  placeholder="Search chats"
                  prefix={<SearchOutlined className="order-chatbox-search-icon" />}
                  value={convSearch}
                  onChange={(e) => setConvSearch(e.target.value)}
                  className="order-chatbox-search-input"
                />
              </div>
              <div className="order-chatbox-conv-list">
                {conversations.length === 0 ? (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="No chats yet"
                    className="order-chatbox-empty-inline"
                  >
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={() => openCreateModal('group')}
                      style={{ background: '#0da3d8', borderColor: '#0da3d8' }}
                    >
                      Start chatting
                    </Button>
                  </Empty>
                ) : filteredConversations.length === 0 ? (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="No chats match your search"
                    className="order-chatbox-empty-inline"
                  />
                ) : (
                  filteredConversations.map((conv) => {
                    const isCreator =
                      Number(conv.created_by) === Number(currentUserId);
                    const titleText = conversationTitle(conv, currentUserId);
                    const unread = conv.unread_count || 0;
                    return (
                      <div
                        key={conv.id}
                        className={`order-chatbox-conv-item${
                          conv.id === activeConvId ? ' active' : ''
                        }`}
                        onClick={() => {
                          cancelEditMessage();
                          handleSelectConv(conv.id);
                        }}
                      >
                        <div
                          className={`order-chatbox-conv-avatar${
                            conv.conversation_type === 'group' ? ' group' : ''
                          }`}
                        >
                          {avatarInitials(titleText)}
                        </div>
                        <div className="order-chatbox-conv-body">
                          <div className="order-chatbox-conv-top">
                            <span className="order-chatbox-conv-name">{titleText}</span>
                            <span className="order-chatbox-conv-time">
                              {formatConvTime(conv.last_message_at || conv.updated_at)}
                            </span>
                          </div>
                          <div className="order-chatbox-conv-bottom">
                            <span
                              className={`order-chatbox-conv-preview${
                                unread > 0 ? ' unread' : ''
                              }`}
                            >
                              {conv.last_message_preview || 'No messages yet'}
                            </span>
                            <Space size={4} className="order-chatbox-conv-actions">
                              {unread > 0 && (
                                <Badge
                                  count={unread}
                                  overflowCount={99}
                                  className="order-chatbox-conv-unread-badge"
                                />
                              )}
                              {isCreator && (
                                <Popconfirm
                                  title="Delete this chat?"
                                  description="This removes the conversation for everyone."
                                  onConfirm={(e) => {
                                    e?.stopPropagation?.();
                                    handleDeleteConversation(conv.id);
                                  }}
                                  onCancel={(e) => e?.stopPropagation?.()}
                                  okText="Delete"
                                  cancelText="Cancel"
                                  okButtonProps={{ danger: true }}
                                >
                                  <Button
                                    type="text"
                                    size="small"
                                    className="order-chatbox-conv-delete-btn"
                                    icon={<DeleteOutlined />}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </Popconfirm>
                              )}
                            </Space>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </aside>

            <main
              className={`order-chatbox-main${
                hideMainOnMobile ? ' is-hidden-mobile' : ''
              }`}
            >
              {!activeConv ? (
                <div className="order-chatbox-empty">
                  <div>
                    <MessageOutlined style={{ fontSize: 48, color: '#8696a0', marginBottom: 12 }} />
                    <div>Order Chat</div>
                    <Text type="secondary">Select a chat or start a new conversation</Text>
                  </div>
                </div>
              ) : (
                <>
                  <div className="order-chatbox-main-header">
                    <Space align="center" className="order-chatbox-main-header-left">
                      <Button
                        type="text"
                        className="order-chatbox-back-btn"
                        icon={<ArrowLeftOutlined />}
                        onClick={() => {
                          cancelEditMessage();
                          handleBackToList();
                        }}
                      />
                      <div
                        className={`order-chatbox-header-avatar${
                          activeConv.conversation_type === 'individual' ? '' : ''
                        }`}
                      >
                        {avatarInitials(activeTitle)}
                      </div>
                      <div className="order-chatbox-header-text">
                        <Title level={5} className="order-chatbox-header-title">
                          {activeTitle}
                        </Title>
                        <Text className="order-chatbox-header-sub">
                          {(activeConv.participants || [])
                            .map((p) => p.user_name)
                            .filter(Boolean)
                            .join(', ')}
                        </Text>
                      </div>
                    </Space>
                    <div className="order-chatbox-main-header-actions">
                      {canDeleteConversation && (
                        <Popconfirm
                          title="Clear all messages?"
                          description="Messages will be deleted. The chat name stays."
                          okText="Clear"
                          okButtonProps={{ danger: true }}
                          onConfirm={() => handleClearAllMessages(activeConv.id)}
                        >
                          <Button
                            type="default"
                            size="small"
                            className="order-chatbox-header-clear-btn"
                            icon={<ClearOutlined />}
                            disabled={messages.length === 0}
                          >
                            Clear all
                          </Button>
                        </Popconfirm>
                      )}
                    </div>
                  </div>

                  <div className="order-chatbox-messages">
                    {messagesLoading ? (
                      <div className="order-chatbox-empty">
                        <Spin />
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="order-chatbox-empty">
                        No messages yet. Say hello 👋
                      </div>
                    ) : (
                      messages.map((m) => {
                        const mine = m.sender_id === currentUserId;
                        return (
                          <div
                            key={m.id}
                            className={`order-chatbox-bubble-row ${mine ? 'mine' : 'theirs'}`}
                          >
                            {!mine && activeConv.conversation_type === 'group' && (
                              <div className="order-chatbox-meta">{m.sender_name}</div>
                            )}
                            <div className="order-chatbox-bubble-wrap">
                              <div
                                className={`order-chatbox-bubble ${mine ? 'mine' : 'theirs'}`}
                              >
                                {m.reply_to_message && (
                                  <div className="order-chatbox-reply-quote">
                                    <div className="order-chatbox-reply-name">
                                      {m.reply_to_message.sender_name || 'Reply'}
                                    </div>
                                    {m.reply_to_message.message_text}
                                  </div>
                                )}
                                <div className="order-chatbox-bubble-text">
                                  {m.message_text}
                                </div>
                                <div className="order-chatbox-bubble-footer">
                                  {isMessageEdited(m) && (
                                    <span className="order-chatbox-edited">edited</span>
                                  )}
                                  <span className="order-chatbox-bubble-time">
                                    {formatMsgTime(m.created_at)}
                                  </span>
                                </div>
                              </div>
                              {!editingMessageId && (
                                <div className="order-chatbox-msg-actions">
                                  {mine ? (
                                    <>
                                      <Tooltip title="Edit">
                                        <Button
                                          type="text"
                                          size="small"
                                          className="order-chatbox-msg-action-btn"
                                          icon={<EditOutlined />}
                                          onClick={() => startEditMessage(m)}
                                        />
                                      </Tooltip>
                                      <Popconfirm
                                        title="Delete this message?"
                                        okText="Delete"
                                        okButtonProps={{ danger: true }}
                                        onConfirm={() => handleDeleteMessage(m.id)}
                                      >
                                        <Tooltip title="Delete">
                                          <Button
                                            type="text"
                                            size="small"
                                            className="order-chatbox-msg-action-btn"
                                            icon={<DeleteOutlined />}
                                            danger
                                            onClick={(e) => e.stopPropagation()}
                                          />
                                        </Tooltip>
                                      </Popconfirm>
                                    </>
                                  ) : (
                                    <Tooltip title="Reply">
                                      <Button
                                        type="text"
                                        size="small"
                                        className="order-chatbox-msg-action-btn"
                                        icon={<UndoOutlined />}
                                        onClick={() => {
                                          cancelEditMessage();
                                          setReplyTo(m);
                                        }}
                                      />
                                    </Tooltip>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  <div className="order-chatbox-composer">
                    {replyTo && !editingMessageId && (
                      <div className="order-chatbox-reply-bar">
                        <UndoOutlined className="order-chatbox-context-bar-icon" />
                        <div className="order-chatbox-context-bar-body">
                          <div className="order-chatbox-context-bar-title">
                            {replyTo.sender_name}
                          </div>
                          <div className="order-chatbox-context-bar-preview">
                            {replyTo.message_text}
                          </div>
                        </div>
                        <Button
                          type="text"
                          size="small"
                          className="order-chatbox-context-close"
                          icon={<CloseOutlined />}
                          onClick={() => setReplyTo(null)}
                        />
                      </div>
                    )}
                    {editingMessageId && (
                      <div className="order-chatbox-edit-bar">
                        <EditOutlined className="order-chatbox-context-bar-icon" />
                        <div className="order-chatbox-context-bar-body">
                          <div className="order-chatbox-context-bar-title">Edit message</div>
                          <div className="order-chatbox-context-bar-preview">
                            {editingPreview}
                          </div>
                        </div>
                        <Button
                          type="text"
                          size="small"
                          className="order-chatbox-context-close"
                          icon={<CloseOutlined />}
                          onClick={cancelEditMessage}
                        />
                      </div>
                    )}
                    <div className="order-chatbox-composer-row">
                      <TextArea
                        className="order-chatbox-composer-input"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder={
                          editingMessageId ? 'Edit your message' : 'Type a message'
                        }
                        autoSize={{ minRows: 1, maxRows: 5 }}
                        onPressEnter={(e) => {
                          if (!e.shiftKey) {
                            e.preventDefault();
                            onComposerSubmit();
                          }
                        }}
                      />
                      <Button
                        type="primary"
                        shape="circle"
                        icon={<SendOutlined />}
                        loading={sending || savingEdit}
                        onClick={onComposerSubmit}
                        disabled={!draft.trim()}
                        className="order-chatbox-send-btn"
                      />
                    </div>
                  </div>
                </>
              )}
            </main>
          </div>
        )}
      </Drawer>

      <Modal
        title={createType === 'group' ? 'New group chat' : 'New chat'}
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={onCreate}
        confirmLoading={creating}
        okText="Create"
        destroyOnHidden
        centered
        width="min(480px, 92vw)"
        rootClassName="order-chatbox-modal-root"
        okButtonProps={{ className: 'order-chatbox-modal-ok-btn' }}
      >
        <div className="order-chatbox-modal-field">
          <Text type="secondary">Chat name</Text>
          <Input
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder={
              createType === 'group'
                ? 'e.g. Order Discussion'
                : 'e.g. Design review with John'
            }
          />
        </div>
        <div className="order-chatbox-modal-field">
          <Text type="secondary">
            {createType === 'group'
              ? 'Participants (empty = all stakeholders)'
              : 'Chat with'}
          </Text>
          <Select
            mode={createType === 'group' ? 'multiple' : undefined}
            style={{ width: '100%' }}
            placeholder="Select user(s)"
            classNames={{ popup: { root: 'order-chatbox-select-dropdown' } }}
            value={
              createType === 'group' ? createParticipants : createParticipants[0]
            }
            onChange={(val) => {
              if (createType === 'group') {
                setCreateParticipants(val || []);
              } else {
                setCreateParticipants(val != null ? [val] : []);
              }
            }}
            options={otherStakeholders.map((s) => ({
              value: s.user_id,
              label: `${s.user_name} (${s.user_role || s.order_role})`,
            }))}
          />
        </div>
      </Modal>
    </>
  );
}

export function OrderChatButton({ totalUnread = 0, onClick, disabled, size = 'small' }) {
  return (
    <Badge
      count={totalUnread}
      size="small"
      offset={[-2, 2]}
      overflowCount={99}
      className={totalUnread > 0 ? 'order-chatbox-trigger-badge-active' : undefined}
    >
      <Button
        size={size}
        icon={<MessageOutlined />}
        onClick={onClick}
        disabled={disabled}
        className="order-chatbox-trigger-btn"
        style={totalUnread > 0 ? { borderColor: '#0da3d8', color: '#0da3d8' } : undefined}
      >
        <span className="order-chatbox-trigger-label">Order Chat</span>
      </Button>
    </Badge>
  );
}
