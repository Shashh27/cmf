import React, { useState, useEffect } from 'react';
import { Table, Typography, message, Spin } from 'antd';
import { API_BASE_URL } from '../Config/auth.js';

const { Title, Text } = Typography;

const PokayokeHistory = ({ machineId }) => {
  const [loading, setLoading] = useState(false);
  const [historyData, setHistoryData] = useState([]);

  useEffect(() => {
    if (machineId) {
      fetchHistoryData();
    }
  }, [machineId]);

  const fetchHistoryData = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/pokayoke-completed-logs/machines/${machineId}/logs`,
        { headers: { accept: 'application/json' } }
      );
      const data = await res.json();
      const logs = Array.isArray(data) ? data : [];
      setHistoryData(logs);
    } catch (error) {
      message.error('Failed to fetch checklist history');
      console.error('Error fetching history:', error);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: 'Checklist Name',
      dataIndex: 'checklist_name',
      key: 'checklist_name',
      render: (_, record) => record.checklist_name || `Checklist #${record.checklist_id}`,
    },
    {
      title: 'Frequency',
      dataIndex: 'frequency',
      key: 'frequency',
    },
    {
      title: 'Shift',
      dataIndex: 'shift',
      key: 'shift',
    },
    {
      title: 'Completed At',
      dataIndex: 'completed_at',
      key: 'completed_at',
      render: (date) => {
        if (!date) return '-';
        const d = new Date(date);
        return d.toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
      },
    },
    {
      title: 'Status',
      dataIndex: 'overall_approval_status',
      key: 'overall_approval_status',
      render: (status) => {
        const statusColors = {
          approved: 'green',
          pending: 'orange',
          rejected: 'red',
        };
        return (
          <span style={{ color: statusColors[status?.toLowerCase()] || 'default', fontWeight: 500 }}>
            {status?.toUpperCase() || 'PENDING'}
          </span>
        );
      },
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>
        Checklist History
      </Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        View the completion history of all checklists for this machine.
      </Text>
      <Spin spinning={loading}>
        <Table
          columns={columns}
          dataSource={historyData}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showSizeChanger: false,
          }}
        />
      </Spin>
    </div>
  );
};

export default PokayokeHistory;