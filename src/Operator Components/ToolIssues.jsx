import React, { useEffect, useState } from 'react';
import { Table, Tag, message, Button, Modal } from 'antd';
import { API_BASE_URL } from '../Config/auth';
 
const ToolIssues = () => {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewUrls, setPreviewUrls] = useState([]); // Changed to array
 
  const getOperatorId = () => {
    try {
      const stored = localStorage.getItem('user');
      if (stored) {
        const u = JSON.parse(stored);
        if (u && u.id != null) return parseInt(u.id);
      }
    } catch {}
    const fallback = localStorage.getItem('operator_id');
    return fallback ? parseInt(fallback) : null;
  };
 
  const fetchIssues = async () => {
    setLoading(true);
    try {
      const opId = getOperatorId();
      let url = `${API_BASE_URL}/tool-issues/`;
      if (opId != null) {
        url = `${API_BASE_URL}/tool-issues/by-operator/${opId}`;
      }
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setIssues(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to load tool issues', e);
      message.error('Failed to load tool issues');
      setIssues([]);
    } finally {
      setLoading(false);
    }
  };
 
  useEffect(() => {
    fetchIssues();
  }, []);
 
  const getStatusColor = (status) => {
    switch ((status || '').toLowerCase()) {
      case 'pending': return 'orange';
      case 'approved': return 'green';
      case 'rejected': return 'red';
      default: return 'default';
    }
  };
 
  const columns = [
    {
      title: 'SL NO',
      key: 'sl_no',
      width: 70,
      align: 'center',
      render: (_, __, index) => (pagination.current - 1) * pagination.pageSize + index + 1,
    },
    {
      title: 'Tool Name',
      dataIndex: 'tool_name',
      key: 'tool_name',
      width: 200,
      ellipsis: true,
    },
    {
      title: 'Project Number',
      dataIndex: 'sale_order_number',
      key: 'project_number',
      width: 140,
      ellipsis: true,
      render: (_, record) => record.sale_order_number || record.project_name || '-',
    },
    {
      title: 'Issue Qty',
      dataIndex: 'tool_issue_qty',
      key: 'tool_issue_qty',
      width: 120,
      align: 'center',
    },
    {
      title: 'Issue Category',
      dataIndex: 'issue_category',
      key: 'issue_category',
      width: 140,
      render: (text) => text || '-',
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      width: 240,
      ellipsis: true,
      render: (text) => text || '-',
    },
    {
      title: 'Document',
      key: 'document',
      width: 130,
      render: (_, record) => record.documents && record.documents.length > 0 ? (
        <Button size="small" onClick={() => { 
          const urls = record.documents.map(doc => doc.document_url);
          setPreviewUrls(urls); 
          setPreviewVisible(true); 
        }}>
          Preview ({record.documents.length})
        </Button>
      ) : '—'
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      align: 'center',
      render: (status) => (
        <Tag color={getStatusColor(status)}>
          {status ? status.toUpperCase() : '-'}
        </Tag>
      ),
    },
    {
      title: 'Approved By',
      dataIndex: 'inventory_supervisor_name',
      key: 'inventory_supervisor_name',
      width: 140,
      render: (text) => text || '-',
    },
  ];
 
  return (
    <div style={{ background: '#fff', padding: 24, borderRadius: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button onClick={fetchIssues}>Refresh</Button>
      </div>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={issues}
        loading={loading}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          showSizeChanger: true,
          showQuickJumper: true,
          onChange: (page, pageSize) => setPagination({ current: page, pageSize }),
        }}
        scroll={{ x: 1100 }}
      />
      <Modal
        title="Document Preview"
        open={previewVisible}
        onCancel={() => { setPreviewVisible(false); setPreviewUrls([]); }}
        footer={[
          <Button key="close" onClick={() => { setPreviewVisible(false); setPreviewUrls([]); }}>Close</Button>
        ]}
        width={800}
        style={{ top: 20 }}
      >
        <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {previewUrls.length > 0 ? (
            previewUrls.map((url, idx) => (
              <div key={idx} style={{ marginBottom: 20, borderBottom: idx < previewUrls.length - 1 ? '1px solid #eee' : 'none', paddingBottom: 15 }}>
                <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                  <strong>Document {idx + 1}</strong>
                  <a href={url} target="_blank" rel="noreferrer">Open in new tab</a>
                </div>
                {url.toLowerCase().includes('.pdf') ? (
                  <iframe src={url} style={{ width: '100%', height: 400, border: 'none' }} title={`Preview ${idx}`} />
                ) : url.toLowerCase().match(/\.(jpg|jpeg|png|gif|bmp|webp)$/) ? (
                  <img src={url} alt={`Preview ${idx}`} style={{ maxWidth: '100%', maxHeight: 400, display: 'block', margin: '0 auto' }} />
                ) : (
                  <div style={{ padding: 20, textAlign: 'center', background: '#f5f5f5' }}>
                    <p>Document type cannot be previewed.</p>
                  </div>
                )}
              </div>
            ))
          ) : <p>No documents to preview.</p>}
        </div>
      </Modal>
    </div>
  );
};
 
export default ToolIssues;
