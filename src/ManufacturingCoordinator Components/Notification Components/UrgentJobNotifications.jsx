import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, message, Spin, Empty } from 'antd';
import dayjs from 'dayjs';
import { API_BASE_URL } from '../../Config/auth.js';
import { authFetch, readStoredUser } from '../../api/client.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import {
  ModernTableStyles,
  getNotificationTableProps,
  renderAckCell,
  useLatestCallback,
} from '../../Notification Components/notificationTableUtils';

const resolveUserId = (authUser) => {
  const candidates = [authUser, readStoredUser()];
  try {
    const raw = localStorage.getItem('user');
    if (raw) candidates.push(JSON.parse(raw));
  } catch {
    // ignore
  }
  for (const user of candidates) {
    const id = user?.id ?? user?.user_id;
    if (id) return Number(id);
  }
  return null;
};

const statusLabel = (status) => {
  if (status === 'accepted' || status === 'assigned') return 'Approved';
  const value = status || 'pending';
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const UrgentJobNotifications = ({ dateRange, onCount, refreshKey = 0, query = '' }) => {
  const { user } = useAuth();
  const userId = resolveUserId(user);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const onCountRef = useLatestCallback(onCount);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (userId) params.set('for_mc_id', String(userId));
      const response = await authFetch(`${API_BASE_URL}/urgent-job-indents/?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch notifications');
      const data = await response.json();
      let list = (Array.isArray(data) ? data : []).filter((row) => {
        const completedForMe = Boolean(row.completed_at) && (
          row.mc_id == null || Number(row.mc_id) === Number(userId)
        );
        if (completedForMe) return true;
        if (Number(row.created_by) === Number(userId)) return false;
        return row.mc_id == null || Number(row.created_by) !== Number(row.mc_id);
      });
      if (dateRange?.[0] && dateRange?.[1]) {
        const start = dayjs(dateRange[0]).startOf('day');
        const end = dayjs(dateRange[1]).endOf('day');
        list = list.filter((row) => {
          const stamp = dayjs(row.created_at);
          return stamp.isValid() && !stamp.isBefore(start) && !stamp.isAfter(end);
        });
      }
      setNotifications(list);
      onCountRef.current?.(list.filter((row) => {
        const completedForMe = Boolean(row.completed_at) && (
          row.mc_id == null || Number(row.mc_id) === Number(userId)
        );
        return completedForMe ? !(row.mc_decision || row.supervisor_decision) : !row.mc_ack;
      }).length);
    } catch (error) {
      message.error(error.message || 'Failed to fetch notifications');
    } finally {
      setLoading(false);
    }
  }, [dateRange, onCountRef, userId]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications, refreshKey]);

  const isCompletionForMe = (row) => Boolean(row?.completed_at) && (
    row?.mc_id == null || Number(row?.mc_id) === Number(userId)
  );

  const handleAcknowledge = async (record) => {
    if (!userId) {
      message.error('User not found in session. Please log in again.');
      return;
    }
    try {
      if (isCompletionForMe(record)) {
        const response = await authFetch(`${API_BASE_URL}/urgent-job-indents/${record.id}/completion-review`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            as_role: 'mc',
            status: 'approved',
            remark: null,
          }),
        });
        if (!response.ok) throw new Error('Failed to approve log');
        message.success('Log approved');
      } else {
        const response = await authFetch(`${API_BASE_URL}/urgent-job-indents/${record.id}/acknowledge`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            as_role: 'mc',
          }),
        });
        if (!response.ok) throw new Error('Failed to acknowledge notification');
        message.success('Notification acknowledged');
      }
      fetchNotifications();
    } catch (error) {
      message.error(error.message);
    }
  };

  const columns = useMemo(
    () => [
      {
        title: 'Sl No',
        key: 'sl_no',
        sorter: false,
        render: (_, __, index) => (currentPage - 1) * pageSize + index + 1,
      },
      {
        title: 'Sent By',
        dataIndex: 'created_by_name',
        key: 'created_by_name',
        render: (text) => text || '-',
      },
      {
        title: 'Project Number',
        dataIndex: 'order_no',
        key: 'order_no',
        render: (text) => text || '-',
      },
      {
        title: 'Project Name',
        dataIndex: 'project_name',
        key: 'project_name',
        render: (text) => text || '-',
      },
      {
        title: 'Description',
        dataIndex: 'description',
        key: 'description',
        render: (text) => text || '-',
      },
      {
        title: 'Operator',
        dataIndex: 'operator_name',
        key: 'operator_name',
        render: (text) => text || '-',
      },
      {
        title: 'Machine',
        dataIndex: 'machine_name',
        key: 'machine_name',
        render: (text) => text || '-',
      },
      {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (status, record) => (record.completed_at ? 'Completed' : statusLabel(status)),
      },
      {
        title: 'Activated at',
        dataIndex: 'activated_at',
        key: 'activated_at',
        render: (text) => (text ? dayjs(text).format('DD/MM/YYYY HH:mm') : '-'),
      },
      {
        title: 'Completed at',
        dataIndex: 'completed_at',
        key: 'completed_at',
        render: (text) => (text ? dayjs(text).format('DD/MM/YYYY HH:mm') : '-'),
      },
      {
        title: 'Remarks',
        dataIndex: 'mc_remark',
        key: 'mc_remark',
        render: (text) => text || '-',
      },
      {
        title: 'Created At',
        dataIndex: 'created_at',
        key: 'created_at',
        render: (text) => (text ? dayjs(text).format('DD/MM/YYYY HH:mm') : '-'),
      },
      {
        title: 'Acknowledged',
        key: 'acknowledged',
        sorter: false,
        render: (_, record) =>
          renderAckCell({
            isAck: isCompletionForMe(record)
              ? !!(record.mc_decision || record.supervisor_decision)
              : !!record.mc_ack,
            ackBy: isCompletionForMe(record)
              ? (record.mc_decision_by || (record.supervisor_decision ? 'Supervisor' : null) || record.mc_ack_by || record.mc_name)
              : (record.mc_ack_by || record.mc_name),
            onAcknowledge: () => handleAcknowledge(record),
          }),
      },
    ],
    [currentPage, pageSize, userId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notifications;
    return notifications.filter((n) =>
      [
        n.created_by_name,
        n.order_no,
        n.project_name,
        n.description,
        n.status,
        n.mc_remark,
        n.operator_name,
        n.machine_name,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [notifications, query]);

  return (
    <Spin spinning={loading}>
      <ModernTableStyles />
      <Table
        {...getNotificationTableProps({
          columns,
          dataSource: filtered,
          rowKey: 'id',
          loading: false,
          pagination: {
            current: currentPage,
            pageSize,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
            pageSizeOptions: ['10', '20', '50', '100'],
            onChange: (page, size) => {
              setCurrentPage(page);
              setPageSize(size);
            },
          },
        })}
        locale={{ emptyText: <Empty description="No right now job notifications found" /> }}
      />
    </Spin>
  );
};

export default UrgentJobNotifications;
