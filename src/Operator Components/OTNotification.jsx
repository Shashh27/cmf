import React, { useState, useEffect, useMemo } from 'react';
import { Table, Spin, message, Button, Select, Space } from 'antd';
import { CheckOutlined, ReloadOutlined, ClearOutlined } from '@ant-design/icons';
import { SCHEDULING_API_BASE_URL } from '../Config/schedulingconfig';

const getOperatorId = () => {
  const storedUser = localStorage.getItem('user');
  if (!storedUser) return null;
  try {
    const user = JSON.parse(storedUser);
    return user.id ?? user.user_id ?? user.userId ?? null;
  } catch (e) {
    console.error('Error parsing user from local storage', e);
    return null;
  }
};

const getMachineName = (record) => {
  if (record.machine_label) return record.machine_label;
  if (record.machine_name) return record.machine_name;
  if (record.machine) {
    if (typeof record.machine === 'string') return record.machine;
    const makeModel = [record.machine.make, record.machine.model].filter(Boolean).join(' - ');
    if (makeModel) return makeModel;
    if (record.machine.name) return record.machine.name;
  }
  if (record.machine_make || record.machine_model) {
    return [record.machine_make, record.machine_model].filter(Boolean).join(' - ');
  }
  return record.machine_id != null ? `Machine ${record.machine_id}` : 'N/A';
};

const getMachineFilterValue = (record) => {
  if (record.machine_id != null) return String(record.machine_id);
  return getMachineName(record);
};

const getShiftDate = (record) => {
  const value =
    record.shift_date ||
    record.shiftDate ||
    record.date ||
    record.assignment_date ||
    record.ot_date ||
    null;
  if (!value) return 'N/A';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return String(value);
  }
};

const getAssignedBy = (record) => {
  if (record.assigned_by_name) return record.assigned_by_name;
  if (typeof record.assigned_by === 'string') return record.assigned_by;
  if (record.assigned_by?.user_name) {
    const role = record.assigned_by.role;
    return role ? `${record.assigned_by.user_name} (${role})` : record.assigned_by.user_name;
  }
  if (record.assigned_by?.name) return record.assigned_by.name;
  if (record.created_by_name) return record.created_by_name;
  if (record.assigner_name) return record.assigner_name;
  if (record.assigned_by_id != null) return `User ${record.assigned_by_id}`;
  if (typeof record.assigned_by === 'number') return `User ${record.assigned_by}`;
  return 'N/A';
};

const isAcknowledged = (record) =>
  record.is_read === true ||
  record.read === true ||
  Boolean(record.read_at) ||
  Boolean(record.acknowledged_at);

const OTNotification = ({ onUnacknowledgedCountChange }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [acknowledgingIds, setAcknowledgingIds] = useState(new Set());
  const [machineFilter, setMachineFilter] = useState([]);

  useEffect(() => {
    fetchNotifications();
  }, []);

  useEffect(() => {
    const unreadCount = notifications.filter((n) => !isAcknowledged(n)).length;
    onUnacknowledgedCountChange?.(unreadCount);
  }, [notifications, onUnacknowledgedCountChange]);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const operatorId = getOperatorId();
      if (!operatorId) {
        message.error('Operator not found in session. Please log in again.');
        setNotifications([]);
        return;
      }

      const response = await fetch(
        `${SCHEDULING_API_BASE_URL}/notifications/operator/${operatorId}?unread_only=false&limit=50`,
        { headers: { accept: 'application/json' } }
      );

      if (!response.ok) {
        message.error('Failed to fetch OT assignments');
        setNotifications([]);
        return;
      }

      const data = await response.json();
      const list = Array.isArray(data)
        ? data
        : (data.items || data.notifications || data.data || []);

      const sorted = [...list].sort((a, b) => {
        const ackA = isAcknowledged(a);
        const ackB = isAcknowledged(b);
        if (ackA !== ackB) return ackA ? 1 : -1;

        const dateA = new Date(a.shift_date || a.created_at || a.date || 0).getTime();
        const dateB = new Date(b.shift_date || b.created_at || b.date || 0).getTime();
        return dateB - dateA;
      });

      setNotifications(sorted);
    } catch (error) {
      console.error('Error fetching OT assignments:', error);
      message.error('Failed to fetch OT assignments');
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledge = async (notificationId) => {
    try {
      setAcknowledgingIds((prev) => new Set(prev).add(notificationId));

      const response = await fetch(
        `${SCHEDULING_API_BASE_URL}/notifications/${notificationId}/read`,
        {
          method: 'PATCH',
          headers: {
            accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ is_read: true }),
        }
      );

      if (response.ok) {
        message.success('OT assignment acknowledged');
        await fetchNotifications();
        setAcknowledgingIds((prev) => {
          const next = new Set(prev);
          next.delete(notificationId);
          return next;
        });
      } else {
        let errorMessage = 'Unknown error';
        try {
          const errorData = await response.json();
          if (typeof errorData.detail === 'string') errorMessage = errorData.detail;
          else if (errorData.message) errorMessage = errorData.message;
        } catch {
          /* ignore parse errors */
        }
        message.error(`Failed to acknowledge OT assignment: ${errorMessage}`);
        setAcknowledgingIds((prev) => {
          const next = new Set(prev);
          next.delete(notificationId);
          return next;
        });
      }
    } catch (error) {
      console.error('Error acknowledging OT assignment:', error);
      message.error('Failed to acknowledge OT assignment');
      setAcknowledgingIds((prev) => {
        const next = new Set(prev);
        next.delete(notificationId);
        return next;
      });
    }
  };

  const machineOptions = useMemo(() => {
    const machineMap = new Map();
    notifications.forEach((record) => {
      const value = getMachineFilterValue(record);
      const label = getMachineName(record);
      if (value && !machineMap.has(value)) {
        machineMap.set(value, label);
      }
    });
    return Array.from(machineMap.entries()).map(([value, label]) => ({ value, label }));
  }, [notifications]);

  const filteredNotifications = useMemo(() => {
    if (machineFilter.length === 0) return notifications;
    return notifications.filter((record) => machineFilter.includes(getMachineFilterValue(record)));
  }, [notifications, machineFilter]);

  const hasActiveFilters = machineFilter.length > 0;

  const clearFilters = () => {
    setMachineFilter([]);
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const columns = [
    {
      title: 'Sl\nNo',
      key: 'slNo',
      align: 'center',
      width: 60,
      render: (_text, _record, index) =>
        (pagination.current - 1) * pagination.pageSize + index + 1,
    },
    {
      title: 'Machine Name',
      key: 'machineName',
      align: 'center',
      width: 200,
      sorter: (a, b) => getMachineName(a).localeCompare(getMachineName(b)),
      render: (_text, record) => getMachineName(record),
    },
    {
      title: 'Shift Date',
      key: 'shiftDate',
      align: 'center',
      width: 120,
      sorter: (a, b) => {
        const dateA = new Date(a.shift_date || a.date || 0).getTime();
        const dateB = new Date(b.shift_date || b.date || 0).getTime();
        return dateA - dateB;
      },
      render: (_text, record) => getShiftDate(record),
    },
    {
      title: 'Assigned By',
      key: 'assignedBy',
      align: 'center',
      width: 160,
      sorter: (a, b) => getAssignedBy(a).localeCompare(getAssignedBy(b)),
      render: (_text, record) => getAssignedBy(record),
    },
    {
      title: 'Action',
      key: 'action',
      align: 'center',
      width: 120,
      fixed: 'right',
      render: (_text, record) => (
        <Button
          type="primary"
          icon={<CheckOutlined />}
          size="small"
          onClick={() => handleAcknowledge(record.id)}
          disabled={isAcknowledged(record) || acknowledgingIds.has(record.id)}
        >
          Acknowledge
        </Button>
      ),
    },
  ];

  return (
    <Spin spinning={loading}>
      <div
        style={{
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
          padding: '16px 16px 0',
        }}
      >
        <Space wrap>
          <Select
            mode="multiple"
            showSearch
            allowClear
            placeholder="Filter by machine"
            style={{ minWidth: 220, maxWidth: 360 }}
            value={machineFilter}
            onChange={(value) => {
              setMachineFilter(value || []);
              setPagination((prev) => ({ ...prev, current: 1 }));
            }}
            options={machineOptions}
            filterOption={(input, option) =>
              (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
          />
          {hasActiveFilters && (
            <Button icon={<ClearOutlined />} onClick={clearFilters}>
              Clear
            </Button>
          )}
        </Space>
        <Button icon={<ReloadOutlined />} onClick={fetchNotifications} loading={loading}>
          Refresh
        </Button>
      </div>
      <Table
        columns={columns}
        dataSource={filteredNotifications}
        rowKey="id"
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          pageSizeOptions: [10, 20, 50, 100],
          showSizeChanger: true,
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
          onChange: (page, pageSize) => {
            setPagination({ current: page, pageSize });
          },
          onShowSizeChange: (_current, size) => {
            setPagination({ current: 1, pageSize: size });
          },
        }}
        variant="outlined"
        scroll={{ x: 'max-content', y: 'calc(100vh - 400px)' }}
        style={{ textAlign: 'center' }}
        components={{
          header: {
            cell: (props) => (
              <th
                {...props}
                style={{
                  ...props.style,
                  background: 'linear-gradient(to bottom, #f0f5ff, #e6f0ff)',
                  fontWeight: 'bold',
                  borderBottom: '2px solid #1890ff',
                }}
              >
                {props.children}
              </th>
            ),
          },
        }}
      />
    </Spin>
  );
};

export default OTNotification;
