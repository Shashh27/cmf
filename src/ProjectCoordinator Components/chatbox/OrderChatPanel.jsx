import React from 'react';
import { App } from 'antd';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useOrderChat } from './useOrderChat';
import OrderChatPanelView, { OrderChatButton } from './OrderChatPanelView';
import './chatbox.css';

export { OrderChatButton, useOrderChat };

/** Project Coordinator order chat panel. */
export default function PCOrderChatPanel({
  open,
  onClose,
  orderId,
  orderLabel,
  chat: chatProp,
}) {
  const { message: messageApi } = App.useApp();
  const { user } = useAuth();
  const internalChat = useOrderChat({
    orderId: chatProp ? null : orderId,
    panelOpen: open,
    currentUserId: user?.id,
    messageApi,
  });
  const chat = chatProp || internalChat;

  return (
    <OrderChatPanelView
      open={open}
      onClose={onClose}
      orderId={orderId}
      orderLabel={orderLabel}
      currentUserId={user?.id}
      chat={chat}
    />
  );
}
