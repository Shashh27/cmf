import React, { useEffect, useState } from 'react';
import { Table, Tag, message, Button, Modal, Input, Tooltip } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { API_BASE_URL } from '../Config/auth';
 
const ToolIssues = () => {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [filters, setFilters] = useState({});
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewUrls, setPreviewUrls] = useState([]);
 
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
      const sortedData = Array.isArray(data) ? data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) : [];
      setIssues(sortedData);
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

  const handleTableChange = (newPagination, newFilters) => {
    setPagination({ current: newPagination.current, pageSize: newPagination.pageSize });
    setFilters(newFilters);
  };
 
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
      title: 'Sl No',
      key: 'sl_no',
      width: 50,
      align: 'center',
      render: (_, __, index) => (pagination.current - 1) * pagination.pageSize + index + 1,
    },
    {
      title: 'Tool Name',
      dataIndex: 'tool_name',
      key: 'tool_name',
      width: 120,
      filteredValue: [searchText],
      onFilter: (value, record) =>
        String(record.tool_name || '').toLowerCase().includes(value.toLowerCase()) ||
        String(record.sale_order_number || '').toLowerCase().includes(value.toLowerCase()) ||
        String(record.project_name || '').toLowerCase().includes(value.toLowerCase()),
      sorter: (a, b) => (a.tool_name || '').localeCompare(b.tool_name || ''),
    },
    {
      title: 'Range',
      dataIndex: 'tool_range',
      key: 'tool_range',
      width: 80,
      render: (text) => text || '-',
    },
    {
      title: 'ID Code',
      dataIndex: 'identification_code',
      key: 'identification_code',
      width: 100,
      render: (text) => text || '-',
    },
    {
      title: 'Project',
      dataIndex: 'sale_order_number',
      key: 'project_number',
      width: 120,
      render: (_, record) => {
        const projName = record.sale_order_number || record.project_name || '-';
        const productName = record.product_name || '';
        return (
          <div>
            <div>{projName}</div>
            {productName && <div style={{ fontSize: '12px', color: '#8c8c8c' }}>{productName}</div>}
          </div>
        );
      },
    },
    {
      title: 'Part',
      dataIndex: 'part_name',
      key: 'part_name',
      width: 120,
      render: (_, record) => {
        const partName = record.part_name || '-';
        const partNum = record.part_number || '';
        return (
          <div>
            <div>{partName}</div>
            {partNum && <div style={{ fontSize: '12px', color: '#8c8c8c' }}>#{partNum}</div>}
          </div>
        );
      },
    },
    {
      title: 'Operation',
      key: 'operation',
      width: 120,
      render: (_, record) => {
        const opName = record.operation_name || '-';
        const opNum = record.operation_number || '';
        return (
          <div>
            <div>{opName}</div>
            {opNum && <div style={{ fontSize: '12px', color: '#8c8c8c' }}>#{opNum}</div>}
          </div>
        );
      },
    },
    {
      title: 'Issue Qty',
      dataIndex: 'tool_issue_qty',
      key: 'tool_issue_qty',
      width: 80,
      align: 'center',
    },
    {
      title: 'Issue Category',
      dataIndex: 'issue_category',
      key: 'issue_category',
      width: 120,
      render: (text) => text || '-',
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      width: 140,
      render: (text) => text ? (
        <Tooltip title={text} placement="topLeft">
          <span style={{ cursor: 'pointer' }}>{text}</span>
        </Tooltip>
      ) : '-',
    },
    {
      title: 'Document',
      key: 'document',
      width: 100,
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
      title: 'Reported At',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 130,
      render: (text) => {
        if (!text) return '-';
        const d = new Date(text);
        const date = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
        const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
        return `${date}, ${time}`;
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      align: 'center',
      filteredValue: filters.status || null,
      render: (status) => (
        <Tag color={getStatusColor(status)}>
          {status ? status.toUpperCase() : '-'}
        </Tag>
      ),
      filters: [
        { text: 'Pending', value: 'pending' },
        { text: 'Approved', value: 'approved' },
        { text: 'Rejected', value: 'rejected' },
      ],
      onFilter: (value, record) => record.status?.toLowerCase() === value,
    },
    {
      title: 'Acknowledged At',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 130,
      render: (text) => {
        if (!text) return '-';
        const d = new Date(text);
        const date = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
        const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
        return `${date}, ${time}`;
      },
    },
    {
      title: 'Remarks',
      dataIndex: 'remarks',
      key: 'remarks',
      width: 140,
      render: (text) => text ? (
        <Tooltip title={text} placement="topLeft">
          <span style={{ cursor: 'pointer' }}>{text}</span>
        </Tooltip>
      ) : '-',
    },
    {
      title: 'Acknowledged By',
      dataIndex: 'inventory_supervisor_name',
      key: 'inventory_supervisor_name',
      width: 130,
      render: (text) => text || '-',
    },
  ];
 
  return (
    <div style={{ background: '#fff', padding: 24, borderRadius: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <Input
          placeholder="Search tool issues..."
          allowClear
          prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
          size="middle"
          style={{ width: 300 }}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <Button icon={<ReloadOutlined />} onClick={fetchIssues}>Refresh</Button>
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
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
          position: ['bottomCenter'],
        }}
        onChange={handleTableChange}
        scroll={{ x: 1100 }}
        components={{
          header: {
            cell: (props) => (
              <th {...props} style={{ ...props.style, background: 'linear-gradient(to bottom, #f0f5ff, #e6f0ff)', fontWeight: 'bold', borderBottom: '2px solid #1890ff' }}>
                {props.children}
              </th>
            ),
          },
        }}
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