import React from 'react';
import { Button, Typography } from 'antd';
import { CloseOutlined, FileOutlined, DownloadOutlined, ExpandOutlined } from '@ant-design/icons';
import { canPreviewPendingFile } from './chatUtils';

const { Text } = Typography;

export function ChatInlinePreview({ preview, onClose }) {
  if (!preview) return null;
  const { file_url, file_name, file_category } = preview;

  return (
    <div
      className="order-chatbox-inline-preview"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="order-chatbox-inline-preview-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="order-chatbox-inline-preview-header">
          <Text ellipsis className="order-chatbox-inline-preview-title">
            {file_name}
          </Text>
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined />}
            onClick={onClose}
            aria-label="Close preview"
          />
        </div>
        {file_category === 'image' ? (
          <img
            src={file_url}
            alt={file_name}
            className="order-chatbox-inline-preview-media"
          />
        ) : (
          <video
            src={file_url}
            controls
            autoPlay
            playsInline
            className="order-chatbox-inline-preview-media"
          />
        )}
      </div>
    </div>
  );
}

export function MessageAttachment({ attachment, onPreview }) {
  const { file_url, file_name, file_category } = attachment;

  if (file_category === 'image') {
    return (
      <div className="order-chatbox-attachment-preview">
        <button
          type="button"
          className="order-chatbox-attachment-image-btn"
          onClick={() => onPreview?.(attachment)}
          aria-label={`Preview ${file_name}`}
        >
          <img
            src={file_url}
            alt={file_name}
            className="order-chatbox-attachment-image"
            loading="lazy"
          />
        </button>
      </div>
    );
  }

  if (file_category === 'video') {
    return (
      <div className="order-chatbox-attachment-preview order-chatbox-attachment-video-wrap">
        <video
          src={file_url}
          controls
          className="order-chatbox-attachment-video"
          preload="metadata"
          playsInline
        />
        <Button
          type="text"
          size="small"
          icon={<ExpandOutlined />}
          className="order-chatbox-attachment-expand-btn"
          aria-label={`Expand ${file_name}`}
          onClick={() => onPreview?.(attachment)}
        />
      </div>
    );
  }

  return (
    <div className="order-chatbox-attachment-file-card">
      <FileOutlined className="order-chatbox-attachment-file-icon" />
      <div className="order-chatbox-attachment-file-body">
        <div className="order-chatbox-attachment-file-name">{file_name}</div>
        <Text type="secondary" className="order-chatbox-attachment-file-hint">
          Preview not available
        </Text>
      </div>
      <Button
        type="link"
        size="small"
        icon={<DownloadOutlined />}
        className="order-chatbox-attachment-download-btn"
        onClick={() => {
          const link = document.createElement('a');
          link.href = file_url;
          link.download = file_name;
          link.rel = 'noopener noreferrer';
          link.click();
        }}
      >
        Download
      </Button>
    </div>
  );
}

export function PendingAttachmentPreview({ item, onRemove, onPreview, disabled }) {
  const openPreview = () => {
    if (canPreviewPendingFile(item.category)) {
      onPreview?.({
        file_url: item.previewUrl,
        file_name: item.name,
        file_category: item.category,
      });
    }
  };

  return (
    <div className="order-chatbox-pending-item">
      {canPreviewPendingFile(item.category) ? (
        <button
          type="button"
          className="order-chatbox-pending-thumb-btn"
          onClick={openPreview}
          aria-label={`Preview ${item.name}`}
        >
          {item.category === 'image' ? (
            <img
              src={item.previewUrl}
              alt={item.name}
              className="order-chatbox-pending-thumb"
            />
          ) : (
            <video
              src={item.previewUrl}
              className="order-chatbox-pending-thumb"
              preload="metadata"
              muted
            />
          )}
        </button>
      ) : (
        <div className="order-chatbox-pending-file-thumb">
          <FileOutlined />
          <span className="order-chatbox-pending-file-thumb-name">{item.name}</span>
          <Text type="secondary" className="order-chatbox-pending-file-hint">
            Preview not available
          </Text>
        </div>
      )}
      <Button
        type="text"
        size="small"
        className="order-chatbox-pending-item-remove"
        icon={<CloseOutlined />}
        onClick={() => onRemove(item.id)}
        disabled={disabled}
      />
    </div>
  );
}
