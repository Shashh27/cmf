import { message } from 'antd';
import { API_BASE_URL } from '../Config/auth.js';
import { authFetch } from '../api/client.js';

export const downloadUrgentAttachment = async (attachment) => {
  if (!attachment?.id) return;
  try {
    const response = await authFetch(`${API_BASE_URL}/urgent-job-indents/attachments/${attachment.id}/download`);
    if (!response.ok) {
      message.error('Failed to download file');
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = attachment.file_name || 'file';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch {
    message.error('Failed to download file');
  }
};
