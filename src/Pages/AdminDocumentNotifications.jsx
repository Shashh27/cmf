import React, { useState, useEffect } from "react";
import { BellOutlined, EyeOutlined, CheckCircleOutlined, CloseCircleOutlined, FileTextOutlined, ClockCircleOutlined, SearchOutlined } from "@ant-design/icons";
import { Badge, Button, Modal, Input, Empty, Spin, Tag, Typography, Tooltip, message, Table, Space, Select, Card } from "antd";
import { api } from '../api/client.js';

const { Text } = Typography;
const { TextArea } = Input;

const AdminDocumentNotifications = ({ currentUserId, orderId }) => {
  const [notifications, setNotifications] = useState([]);
  const [filteredNotifications, setFilteredNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [ackRemarks, setAckRemarks] = useState("");
  const [rejectRemarks, setRejectRemarks] = useState("");
  const [ackModalOpen, setAckModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [partFilter, setPartFilter] = useState(null);
  const [searchText, setSearchText] = useState('');

  const getCurrentUserId = () => {
    try {
      const stored = localStorage.getItem("user");
      if (!stored) return null;
      const u = JSON.parse(stored);
      if (u?.id == null) return null;
      return u.id;
    } catch {
      return null;
    }
  };

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const params = { pending_only: false };
      if (orderId) params.order_id = orderId;
      const response = await api.get(`/admin-document-notifications`, { params });
      setNotifications(response.data || []);
      setFilteredNotifications(response.data || []);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      message.error("Failed to load notifications");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let filtered = [...notifications];

    // Filter by status
    if (statusFilter === 'pending') {
      filtered = filtered.filter(n => !n.is_acknowledged && !n.is_rejected);
    } else if (statusFilter === 'acknowledged') {
      filtered = filtered.filter(n => n.is_acknowledged);
    } else if (statusFilter === 'rejected') {
      filtered = filtered.filter(n => n.is_rejected);
    }

    // Filter by part number
    if (partFilter) {
      filtered = filtered.filter(n => 
        n.part && n.part.part_number.toLowerCase().includes(partFilter.toLowerCase())
      );
    }

    // Filter by search text
    if (searchText) {
      const searchLower = searchText.toLowerCase();
      filtered = filtered.filter(n =>
        n.document.document_name.toLowerCase().includes(searchLower) ||
        (n.part && n.part.part_name.toLowerCase().includes(searchLower)) ||
        (n.part && n.part.part_number.toLowerCase().includes(searchLower))
      );
    }

    setFilteredNotifications(filtered);
  }, [statusFilter, partFilter, searchText, notifications]);

  // Calculate pending count from notifications
  const pendingCount = notifications.filter(n => !n.is_acknowledged && !n.is_rejected).length;

  const handleOpenModal = () => {
    setIsModalOpen(true);
    fetchNotifications();
  };

  const handlePreview = (document) => {
    setPreviewDoc(document);
  };

  // Fetch the preview through the authenticated api client and expose it as a
  // blob URL so <img>/<iframe> can render it (those tags cannot send the JWT).
  useEffect(() => {
    let revokedUrl = null;
    if (previewDoc?.id) {
      const type = getPreviewType(previewDoc);
      if (type === "image" || type === "pdf") {
        setPreviewLoading(true);
        setPreviewBlobUrl(null);
        api
          .get(`/documents/${previewDoc.id}/preview`, { responseType: "blob" })
          .then((res) => {
            const blobUrl = window.URL.createObjectURL(res.data);
            revokedUrl = blobUrl;
            setPreviewBlobUrl(blobUrl);
          })
          .catch((e) => {
            console.error("Error loading document preview", e);
            setPreviewBlobUrl(null);
          })
          .finally(() => setPreviewLoading(false));
      }
    }
    return () => {
      if (revokedUrl) window.URL.revokeObjectURL(revokedUrl);
      setPreviewBlobUrl(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewDoc?.id]);

  // Download via the authenticated api client so the JWT is sent, then save the
  // returned blob (a raw <a href> to the API would 401 without the token).
  const downloadBlobWithAuth = async (documentId, fileName) => {
    try {
      const res = await api.get(`/documents/${documentId}/download`, {
        responseType: "blob",
      });
      const blobUrl = window.URL.createObjectURL(res.data);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.setAttribute("download", fileName || `document_${documentId}`);
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
    } catch (e) {
      console.error("Error downloading document", e);
      message.error("Failed to download document");
    }
  };

  const handleAcknowledge = async () => {
    if (!selectedNotification) return;

    try {
      await api.put(`/admin-document-notifications/${selectedNotification.id}/acknowledge`, {
        remarks: ackRemarks
      });
      message.success("Document acknowledged successfully");
      setAckModalOpen(false);
      setAckRemarks("");
      setSelectedNotification(null);
      fetchNotifications();
    } catch (error) {
      console.error("Error acknowledging document:", error);
      message.error("Failed to acknowledge document");
    }
  };

  const handleReject = async () => {
    if (!selectedNotification) return;
    if (!rejectRemarks.trim()) {
      message.warning("Rejection remarks are required");
      return;
    }

    try {
      await api.put(`/admin-document-notifications/${selectedNotification.id}/reject`, {
        remarks: rejectRemarks.trim()
      });
      message.success("Document rejected successfully");
      setRejectModalOpen(false);
      setRejectRemarks("");
      setSelectedNotification(null);
      fetchNotifications();
    } catch (error) {
      console.error("Error rejecting document:", error);
      message.error("Failed to reject document");
    }
  };

  const openAckModal = (notification) => {
    setSelectedNotification(notification);
    setAckRemarks("");
    setAckModalOpen(true);
  };

  const openRejectModal = (notification) => {
    setSelectedNotification(notification);
    setRejectRemarks("");
    setRejectModalOpen(true);
  };

  const getPreviewType = (document) => {
    // Check document_url first as it has the actual file extension
    let url = document?.document_url || '';
    let name = document?.document_name || '';
    
    // Extract extension from URL if available, otherwise from name
    let ext = '';
    if (url) {
      const urlParts = url.split('/');
      const filename = urlParts[urlParts.length - 1];
      ext = filename.split('.').pop().toLowerCase();
    } else if (name) {
      ext = name.split('.').pop().toLowerCase();
    }
    
    if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(ext)) return 'image';
    if (ext === 'pdf') return 'pdf';
    if (['stl', 'step', 'stp', 'obj', '3ds', 'fbx', 'gltf', 'glb'].includes(ext)) return '3d';
    return 'other';
  };

  // Get unique part numbers for filter dropdown
  const uniquePartNumbers = [...new Set(notifications.map(n => n.part?.part_number).filter(Boolean))];

  const columns = [

    {
      title: 'Part',
      key: 'part',
      width: 150,
      render: (_, record) => record.part ? (
        <Space orientation="vertical" size={0}>
          <Text style={{ fontSize: '12px' }}>{record.part.part_name}</Text>
          <Text type="secondary" style={{ fontSize: '11px' }}>{record.part.part_number}</Text>
        </Space>
      ) : <Text type="secondary" style={{ fontSize: '12px' }}>-</Text>,
    },
    {
      title: 'Document',
      dataIndex: ['document', 'document_name'],
      key: 'document_name',
      width: 200,
      render: (text, record) => (
        <Space orientation="vertical" size={0}>
          <Text strong style={{ fontSize: '12px' }}>{text}</Text>
          <Text type="secondary" style={{ fontSize: '11px' }}>
            {record.document.document_type} • Revision: {record.document.document_version}
          </Text>
        </Space>
      ),
    },
    
    {
      title: 'Status',
      key: 'status',
      width: 120,
      render: (_, record) => {
        const isPending = !record.is_acknowledged && !record.is_rejected;
        if (isPending) return <Tag color="orange" icon={<ClockCircleOutlined />} className="m-0 text-xs">Pending</Tag>;
        if (record.is_rejected) return <Tag color="red" icon={<CloseCircleOutlined />} className="m-0 text-xs">Rejected</Tag>;
        return <Tag color="green" icon={<CheckCircleOutlined />} className="m-0 text-xs">Acknowledged</Tag>;
      },
    },
    {
      title: 'Remarks',
      key: 'remarks',
      width: 250,
      render: (_, record) => {
        if (record.ack_remarks) return <Text style={{ fontSize: '12px', color: '#52c41a' }}>{record.ack_remarks}</Text>;
        if (record.reject_remarks) return <Text style={{ fontSize: '12px', color: '#ff4d4f' }}>{record.reject_remarks}</Text>;
        return <Text type="secondary" style={{ fontSize: '12px' }}>-</Text>;
      },
    },
    {
      title: 'Date',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 120,
      render: (date) => <Text style={{ fontSize: '12px' }}>{new Date(date).toLocaleDateString()}</Text>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      fixed: 'right',
      render: (_, record) => {
        const isPending = !record.is_acknowledged && !record.is_rejected;
        return (
          <Space size="small">
            <Tooltip title="Preview">
              <Button size="small" icon={<EyeOutlined />} onClick={() => handlePreview(record.document)} />
            </Tooltip>
            <Tooltip title={isPending ? "Acknowledge" : "Already handled"}>
              <Button 
                size="small" 
                type="primary" 
                icon={<CheckCircleOutlined />} 
                onClick={() => openAckModal(record)}
                disabled={!isPending}
              />
            </Tooltip>
            <Tooltip title={isPending ? "Reject" : "Already handled"}>
              <Button 
                size="small" 
                danger 
                icon={<CloseCircleOutlined />} 
                onClick={() => openRejectModal(record)}
                disabled={!isPending}
              />
            </Tooltip>
          </Space>
        );
      },
    },
  ];

  return (
    <>
      <Tooltip title="Document Notifications">
        <Badge count={pendingCount} size="small" offset={[-5, 5]}>
          <Button
            type="text"
            icon={<BellOutlined />}
            onClick={handleOpenModal}
            style={{ fontSize: '18px', color: pendingCount > 0 ? '#1890ff' : '#8c8c8c' }}
          />
        </Badge>
      </Tooltip>

      <Modal
        title={
          <Space>
            <BellOutlined />
            <span>Document Acknowledgment Requests</span>
            <Badge count={pendingCount} style={{ backgroundColor: '#52c41a' }} />
          </Space>
        }
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        width={1200}
        style={{ top: 20 }}
      >
        {/* Filters */}
        <Card size="small" style={{ marginBottom: 16 }}>
          <Space wrap>
            <Input
              placeholder="Search documents..."
              prefix={<SearchOutlined />}
              style={{ width: 200 }}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
            />
            <Select
              placeholder="Filter by status"
              style={{ width: 150 }}
              value={statusFilter}
              onChange={setStatusFilter}
              allowClear
            >
              <Select.Option value="all">All Status</Select.Option>
              <Select.Option value="pending">Pending</Select.Option>
              <Select.Option value="acknowledged">Acknowledged</Select.Option>
              <Select.Option value="rejected">Rejected</Select.Option>
            </Select>
            <Select
              placeholder="Filter by part number"
              style={{ width: 200 }}
              value={partFilter}
              onChange={setPartFilter}
              allowClear
            >
              {uniquePartNumbers.map(partNum => (
                <Select.Option key={partNum} value={partNum}>{partNum}</Select.Option>
              ))}
            </Select>
          </Space>
        </Card>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <Spin size="large" />
          </div>
        ) : filteredNotifications.length === 0 ? (
          <Empty
            description="No document acknowledgments found"
            style={{ padding: '40px 0' }}
          />
        ) : (
          <Table
            dataSource={filteredNotifications}
            columns={columns}
            rowKey="id"
            scroll={{ x: 1000, y: 400 }}
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showTotal: (total) => `Total ${total} items`,
            }}
            size="small"
          />
        )}
      </Modal>

      {/* Preview Modal */}
      <Modal
        title="Document Preview"
        open={!!previewDoc}
        onCancel={() => setPreviewDoc(null)}
        footer={[
          <Button key="close" onClick={() => setPreviewDoc(null)}>
            Close
          </Button>
        ]}
        width={1200}
        style={{ top: 20 }}
      >
        {previewDoc && (
          <div style={{ textAlign: 'center' }}>
            {previewLoading ? (
              <div style={{ padding: '60px' }}>
                <Spin />
                <p style={{ marginTop: 16, color: '#8c8c8c' }}>Loading preview…</p>
              </div>
            ) : (getPreviewType(previewDoc) === 'pdf' || getPreviewType(previewDoc) === 'image') && !previewBlobUrl ? (
              <div style={{ padding: '40px' }}>
                <FileTextOutlined style={{ fontSize: '48px', color: '#8c8c8c' }} />
                <p>Preview unavailable</p>
                <Button
                  type="primary"
                  onClick={() => downloadBlobWithAuth(previewDoc.id, previewDoc.document_name)}
                >
                  Download
                </Button>
              </div>
            ) : getPreviewType(previewDoc) === 'pdf' ? (
              <iframe
                src={previewBlobUrl}
                style={{ width: '100%', height: '700px', border: 'none' }}
                title="PDF Preview"
              />
            ) : getPreviewType(previewDoc) === 'image' ? (
              <img
                src={previewBlobUrl}
                alt={previewDoc.document_name}
                style={{ maxWidth: '100%', maxHeight: '700px' }}
              />
            ) : (
              <div style={{ padding: '40px' }}>
                <FileTextOutlined style={{ fontSize: '48px', color: '#8c8c8c' }} />
                <p>Preview not available for this file type</p>
                <Button
                  type="primary"
                  onClick={() => downloadBlobWithAuth(previewDoc.id, previewDoc.document_name)}
                >
                  Download
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Acknowledge Modal */}
      <Modal
        title="Acknowledge Document"
        open={ackModalOpen}
        onOk={handleAcknowledge}
        onCancel={() => {
          setAckModalOpen(false);
          setAckRemarks("");
          setSelectedNotification(null);
        }}
        okText="Acknowledge"
        cancelText="Cancel"
      >
        <Space orientation="vertical" style={{ width: '100%' }} size="small">
          <Text>Do you want to acknowledge this document?</Text>
          {selectedNotification && (
            <Text strong>{selectedNotification.document.document_name}</Text>
          )}
          <Text type="secondary">Add remarks (optional):</Text>
          <TextArea
            rows={4}
            placeholder="Enter any technical remarks or notes..."
            value={ackRemarks}
            onChange={(e) => setAckRemarks(e.target.value)}
          />
        </Space>
      </Modal>

      {/* Reject Modal */}
      <Modal
        title="Reject Document"
        open={rejectModalOpen}
        onOk={handleReject}
        onCancel={() => {
          setRejectModalOpen(false);
          setRejectRemarks("");
          setSelectedNotification(null);
        }}
        okText="Reject"
        cancelText="Cancel"
        okButtonProps={{ danger: true, disabled: !rejectRemarks.trim() }}
      >
        <Space orientation="vertical" style={{ width: '100%' }} size="small">
          <Text>Do you want to reject this document?</Text>
          {selectedNotification && (
            <Text strong>{selectedNotification.document.document_name}</Text>
          )}
          <Text type="secondary">Add rejection remarks (required):</Text>
          <TextArea
            rows={4}
            placeholder="Please provide technical reasons for rejection..."
            value={rejectRemarks}
            onChange={(e) => setRejectRemarks(e.target.value)}
            status={!rejectRemarks.trim() ? 'error' : ''}
          />
        </Space>
      </Modal>
    </>
  );
};

export default AdminDocumentNotifications;
