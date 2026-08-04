import React, { useMemo } from 'react';
import { Modal, Button, Popconfirm, Table, Tag } from 'antd';
import {
  DeleteOutlined, CalendarOutlined, ClockCircleOutlined, DashboardOutlined,
} from '@ant-design/icons';
import {
  PM_T, btnSharp, formatDate, formatDateTime, itemTypeShort, STATUS_COLORS,
} from './pmUtils';
import dayjs from 'dayjs';

function getIntervalLabel(ci) {
  if (!ci) return '—';
  if (ci.frequency_type === 'Usage Based') return ci.trigger_hours != null ? String(ci.trigger_hours) : '—';
  if (ci.interval_value != null) return String(ci.interval_value);
  return '—';
}

function getFrequencyLabel(ci) {
  if (!ci) return '—';
  if (ci.frequency_type === 'Condition Based') return 'Condition Based';
  if (ci.frequency_type === 'Usage Based') return `Usage · ${ci.trigger_hours ?? '—'} hrs`;
  if (ci.frequency_type === 'Time Based' && ci.interval_value === 1 && ci.interval_unit === 'Day') return 'Daily';
  if (ci.interval_unit === 'Week') return ci.interval_value === 1 ? 'Weekly' : `Every ${ci.interval_value} Weeks`;
  if (ci.interval_unit === 'Month') return ci.interval_value === 1 ? 'Monthly' : `Every ${ci.interval_value} Months`;
  if (ci.interval_unit === 'Year') return ci.interval_value === 1 ? 'Yearly' : `Every ${ci.interval_value} Years`;
  if (ci.interval_unit === 'Day') return ci.interval_value === 1 ? 'Daily' : `Every ${ci.interval_value} Days`;
  return ci.frequency_type;
}

function responseColor(val) {
  const v = String(val || '').toLowerCase();
  if (['yes', 'true', '1'].includes(v)) return '#16A34A';
  if (['no', 'false', '0'].includes(v)) return '#DC2626';
  return PM_T.text;
}

const compactLabel = { fontSize: 10, color: PM_T.textMuted, marginBottom: 1 };
const compactValue = { fontSize: 10, fontWeight: 600, color: PM_T.text, lineHeight: 1.3 };

function Cell({ label, value, color }) {
  return (
    <div style={{ padding: '3px 6px', minWidth: 0 }}>
      <div style={compactLabel}>{label}</div>
      <div style={{ ...compactValue, color: color || PM_T.text }}>{value}</div>
    </div>
  );
}

function SectionBar({ n, title }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '4px 8px', background: '#F8FAFC', borderBottom: `1px solid ${PM_T.border}`,
      fontSize: 11, fontWeight: 600, color: PM_T.primary,
    }}>
      <span style={{
        width: 18, height: 18, borderRadius: '50%', background: PM_T.primary, color: '#fff',
        fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, lineHeight: 1,
      }}>
        {n}
      </span>
      {title}
    </div>
  );
}

const CheckpointDetailModal = ({ item, allSubmissions, open, onClose, onDelete }) => {
  const historySubs = useMemo(() => {
    if (!item) return [];
    const aiId = item.assignmentItem?.id;
    return (allSubmissions || [])
      .filter((s) => s.assignment_item_id === aiId)
      .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
  }, [item, allSubmissions]);

  const lastCompleted = item?.assignmentItem?.schedule?.last_completed_date;

  const currentCycleSub = useMemo(() => {
    if (!historySubs.length) return null;
    if (!lastCompleted) {
      const pending = historySubs.find((s) => s.status === 'Submitted');
      if (pending) return pending;
      const rejected = historySubs.find((s) => s.status === 'Rejected');
      if (rejected) return rejected;
      if (historySubs[0]?.status === 'Approved') return null;
      return historySubs[0];
    }
    return historySubs.find((s) => dayjs(s.submitted_at).isAfter(dayjs(lastCompleted), 'day')) || null;
  }, [historySubs, lastCompleted]);

  if (!item) return null;

  const ai = item.assignmentItem;
  const ci = ai.checklist_item;
  const assignment = item.assignment;
  const frequencyLabel = getFrequencyLabel(ci);
  const intervalText = getIntervalLabel(ci);

  const nextDueDate = ai.schedule?.next_due_date;
  const cycleDueDate = nextDueDate;
  const isToday = cycleDueDate ? dayjs(cycleDueDate).isSame(dayjs(), 'day') : false;

  let cycleStatus = 'Not Submitted';
  if (currentCycleSub?.status === 'Submitted') cycleStatus = 'Submitted';
  else if (currentCycleSub?.status === 'Approved') cycleStatus = 'Approved';
  else if (currentCycleSub?.status === 'Rejected') cycleStatus = 'Rejected';

  const latestSub = historySubs[0] || null;
  const latestOnly = latestSub ? [latestSub] : [];

  const historyColumns = [
    {
      title: 'Submitted On',
      dataIndex: 'submitted_at',
      width: 128,
      className: 'pm-compact-th',
      render: (d) => <span style={{ fontSize: 10 }}>{formatDateTime(d)}</span>,
    },
    {
      title: 'Operator',
      key: 'operator',
      width: 100,
      className: 'pm-compact-th',
      render: (_, r) => <span style={{ fontSize: 10 }}>{r.operator_name ?? r.operator_id ?? '—'}</span>,
    },
    {
      title: 'Response',
      dataIndex: 'response_value',
      width: 60,
      className: 'pm-compact-th',
      render: (v) => <span style={{ fontSize: 10, fontWeight: 700, color: responseColor(v) }}>{v || '—'}</span>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 72,
      className: 'pm-compact-th',
      render: (s) => <Tag color={STATUS_COLORS[s]} style={{ fontSize: 9, borderRadius: 0, margin: 0, lineHeight: '14px', padding: '0 4px' }}>{s}</Tag>,
    },
    {
      title: 'Supervisor',
      key: 'supervisor',
      width: 64,
      className: 'pm-compact-th',
      render: (_, r) => (
        <span style={{ fontSize: 10, color: PM_T.textSub }}>
          {r.supervisor_id ?? (r.status === 'Submitted' ? 'Pending' : '—')}
        </span>
      ),
    },
    {
      title: 'Remarks',
      key: 'remarks',
      className: 'pm-compact-th',
      ellipsis: true,
      render: (_, r) => (
        <span style={{ fontSize: 10, color: PM_T.textSub }}>
          {r.supervisor_comments || r.operator_comments || '—'}
        </span>
      ),
    },
  ];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={640}
      destroyOnClose
      centered
      footer={<Button size="small" onClick={onClose} style={btnSharp}>Close</Button>}
      styles={{
        body: { padding: '8px 10px 6px', maxHeight: '80vh', overflowY: 'auto' },
        header: { padding: '8px 10px 4px', marginBottom: 0 },
        footer: { padding: '4px 10px 8px', marginTop: 0 },
      }}
      title={(
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 16 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', background: PM_T.primary,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <DashboardOutlined style={{ fontSize: 13, color: '#fff' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2 }}>{item.checkpointName}</div>
            <div style={{ display: 'flex', gap: 5, marginTop: 2, flexWrap: 'wrap' }}>
              <Tag style={{ margin: 0, fontSize: 9, lineHeight: '14px', padding: '0 5px', borderRadius: 8 }}>
                <ClockCircleOutlined style={{ marginRight: 2, fontSize: 9 }} />{frequencyLabel}
              </Tag>
              <Tag style={{ margin: 0, fontSize: 9, lineHeight: '14px', padding: '0 5px', borderRadius: 8, color: PM_T.textSub }}>
                <CalendarOutlined style={{ marginRight: 2, fontSize: 9 }} />
                Assigned {assignment?.assigned_at ? formatDateTime(assignment.assigned_at) : '—'}
              </Tag>
            </div>
          </div>
          {onDelete && !item.hasSubmissions && (
            <Popconfirm title="Remove from machine?" onConfirm={() => { onDelete(item); onClose(); }}>
              <Button type="text" danger size="small" icon={<DeleteOutlined />} style={{ ...btnSharp, padding: 0 }} />
            </Popconfirm>
          )}
        </div>
      )}
    >
      <style>{`
        .pm-detail-modal .ant-table-thead > tr > th.pm-compact-th {
          font-size: 9px !important;
          padding: 2px 5px !important;
          background: #fafafa !important;
        }
        .pm-detail-modal .ant-table-tbody > tr > td {
          font-size: 10px !important;
          padding: 2px 5px !important;
        }
        .pm-detail-modal .ant-table { margin: 0 !important; }
      `}</style>

      <div className="pm-detail-modal" style={{ border: `1px solid ${PM_T.border}` }}>
        <SectionBar n={1} title="Checkpoint Information" />
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          borderBottom: `1px solid ${PM_T.border}`,
          background: '#fff',
        }}>
          <Cell label="Type" value={ci ? itemTypeShort(ci.item_type) : '—'} color="#16A34A" />
          <Cell label="Expected" value={ci?.expected_value || '—'} color="#16A34A" />
          <Cell label="Frequency" value={frequencyLabel} color={PM_T.primary} />
          <Cell label="Interval" value={intervalText} />
          <Cell label="Remarks" value={ci?.remarks || '—'} color={PM_T.textSub} />
          <Cell
            label="Last completed"
            value={ai.schedule?.last_completed_date ? formatDate(ai.schedule.last_completed_date) : 'Not yet'}
            color={ai.schedule?.last_completed_date ? PM_T.text : '#D97706'}
          />
          <Cell
            label="Next due"
            value={nextDueDate ? formatDate(nextDueDate) : '—'}
            color="#DC2626"
          />
        </div>

        <SectionBar n={2} title="Current Due Cycle" />
        <div style={{
          display: 'grid',
          gridTemplateColumns: '120px 1fr',
          gap: 6,
          padding: '5px 8px',
          borderBottom: `1px solid ${PM_T.border}`,
          background: '#fff',
          alignItems: 'center',
        }}>
          <div>
            <div style={compactLabel}>Due Date</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: PM_T.primary }}>
              {cycleDueDate ? formatDate(cycleDueDate) : '—'}
              {isToday && <span style={{ fontSize: 9, color: '#16A34A', marginLeft: 3 }}>(Today)</span>}
            </div>
          </div>
          <div style={{ borderLeft: `1px solid ${PM_T.border}`, paddingLeft: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 1 }}>
              <span style={compactLabel}>Status</span>
              <Tag color={STATUS_COLORS[cycleStatus] || 'default'} style={{ fontSize: 9, margin: 0, borderRadius: 0, lineHeight: '14px' }}>
                {cycleStatus}
              </Tag>
            </div>
            <div style={{ fontSize: 10, color: PM_T.textSub, lineHeight: 1.3 }}>
              {cycleStatus === 'Not Submitted' && 'Waiting for operator to complete this cycle.'}
              {cycleStatus === 'Submitted' && 'Pending supervisor review.'}
              {cycleStatus === 'Approved' && currentCycleSub && `Approved · Response: ${currentCycleSub.response_value}`}
              {cycleStatus === 'Rejected' && (currentCycleSub?.supervisor_comments || 'Rejected — resubmit required.')}
            </div>
          </div>
        </div>

        <SectionBar n={3} title="Latest Submission" />
        {latestOnly.length > 0 ? (
          <Table
            rowKey="id"
            size="small"
            bordered={false}
            pagination={false}
            columns={historyColumns}
            dataSource={latestOnly}
          />
        ) : (
          <div style={{ padding: '6px 8px', fontSize: 10, color: PM_T.textMuted, background: '#fff' }}>
            No submissions yet.
          </div>
        )}
      </div>
    </Modal>
  );
};

export default CheckpointDetailModal;
