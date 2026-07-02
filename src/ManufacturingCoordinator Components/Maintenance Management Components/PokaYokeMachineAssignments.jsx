import React, { useState, useEffect } from 'react';
import { Button, Modal, Form, Select, message, Typography, Space, DatePicker, Spin, Radio, Popconfirm } from 'antd';
import {
  PlusOutlined, CalendarOutlined, ReloadOutlined,
  FileTextOutlined, CloseOutlined, CheckSquareOutlined, DeleteOutlined,
} from '@ant-design/icons';
import { API_BASE_URL } from '../../Config/auth';
import dayjs from 'dayjs';

const { Text } = Typography;
const { Option } = Select;

/* ─── Design tokens ─────────────────────────────────────────────────────── */
const T = {
  bg:         '#FDFBF7',      // Off-White/Cream main background
  surface:    '#FFFFFF',
  sidebar:    '#F5F5F5',      // Pearl White for sidebar
  border:     '#D1D5DB',      // Bolder border color
  borderMid:  '#E5E5E5',
  primary:    '#4A6CF7',      // Blue for buttons (restored)
  primaryBg:  '#EEF2FF',
  success:    '#22C55E',
  successBg:  '#DCFCE7',
  warning:    '#F59E0B',
  warningBg:  '#FEF3C7',
  weekend:    '#F9FAFB',
  text:       '#111827',
  textMid:    '#374151',
  textSub:    '#6B7280',
  textMuted:  '#9CA3AF',
  radius:     '12px',
  radiusSm:   '8px',
  shadow:     '0 1px 4px rgba(0,0,0,0.07), 0 4px 16px rgba(0,0,0,0.05)',
};

// Mat colors for frequency indicators (more saturated/darker)
const MAT_COLORS = {
  Daily:   '#1E40AF',   // Darker saturated blue
  Weekly:  '#5B21B6',   // Darker saturated purple
  Monthly: '#B45309',   // Darker saturated orange
  Custom:  '#059669', 
};

const MAT_BGS = {
  Daily:   '#BFDBFE',
  Weekly:  '#DDD6FE',
  Monthly: '#FED7AA',
  Custom:  '#A7F3D0',
};

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS_SHORT = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

const FREQ_COLOR = { Daily: MAT_COLORS.Daily, Weekly: MAT_COLORS.Weekly, Monthly: MAT_COLORS.Monthly };
const FREQ_BG   = { Daily: MAT_BGS.Daily, Weekly: MAT_BGS.Weekly, Monthly: MAT_BGS.Monthly };

// Purple and orange for other uses
const T_PURPLE = '#8B5CF6';
const T_ORANGE = '#F97316';
const T_PURPLE_BG = '#EDE9FE';
const T_ORANGE_BG = '#FFF0E6';

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function getDaysInMonth(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = firstDay - 1; i >= 0; i--) cells.push({ day: prevDays - i, cur: false });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, cur: true });
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) cells.push({ day: d, cur: false });
  return cells;
}

/* ─── Frequency badge ────────────────────────────────────────────────────── */
const FreqBadge = ({ freq }) => (
  <span style={{
    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
    background: FREQ_BG[freq] || T.primaryBg,
    color: FREQ_COLOR[freq] || T.primary,
    letterSpacing: '0.03em', display: 'inline-block',
  }}>{freq}</span>
);

/* ─── Items Popup Modal ──────────────────────────────────────────────────── */
const ItemsPopup = ({ visible, onClose, assignment }) => {
  if (!assignment) return null;
  const items = assignment.checklist?.items || [];
  const freqColor = FREQ_COLOR[assignment.frequency] || T.primary;
  const freqBg    = FREQ_BG[assignment.frequency]    || T.primaryBg;

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      footer={null}
      width={800}
      centered
      closeIcon={
        <span style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 28, height: 28, borderRadius: '50%', background: T.bg,
          color: T.textSub, fontSize: 14,
        }}>✕</span>
      }
      styles={{
        content: { borderRadius: 16, overflow: 'hidden', padding: 0 },
        body:    { padding: 0 },
      }}
    >
      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, ${freqColor}18 0%, ${freqColor}08 100%)`,
        borderBottom: `1px solid ${T.border}`,
        padding: '20px 24px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: freqBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 2px 8px ${freqColor}20`,
          }}>
            <FileTextOutlined style={{ color: freqColor, fontSize: 18 }} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text, lineHeight: 1.3 }}>
              {assignment.checklistName}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
              <FreqBadge freq={assignment.frequency} />
              {assignment.frequency === 'Daily' && assignment.shift && (
                <span style={{ fontSize: 10, color: T.textSub, background: '#F3F4F6', borderRadius: 99, padding: '2px 8px', fontWeight: 500 }}>
                  ⏱ {assignment.shift} shift
                </span>
              )}
              {assignment.frequency === 'Weekly' && assignment.scheduled_day && (
                <span style={{ fontSize: 10, color: T.textSub, background: '#F3F4F6', borderRadius: 99, padding: '2px 8px', fontWeight: 500 }}>
                  📅 {assignment.scheduled_day}
                </span>
              )}
              {assignment.frequency === 'Monthly' && assignment.scheduled_day && (
                <span style={{ fontSize: 10, color: T.textSub, background: '#F3F4F6', borderRadius: 99, padding: '2px 8px', fontWeight: 500 }}>
                  📆 Day {assignment.scheduled_day}
                </span>
              )}
              {assignment.nextDueDate && (
  <span style={{ fontSize: 10, color: T.textSub, background: '#F3F4F6', borderRadius: 99, padding: '2px 8px', fontWeight: 500 }}>
    📅 Due: {new Date(assignment.nextDueDate).toLocaleDateString()}
  </span>
)}
            </div>
          </div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 12, color: T.textSub, fontWeight: 500,
        }}>
          <CheckSquareOutlined style={{ color: freqColor }} />
          <span>{items.length} checklist item{items.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Items list - vertical table format */}
      <div style={{ padding: '16px 20px 20px', maxHeight: 420, overflowY: 'auto' }}>
        {items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: T.textMuted }}>
            <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.4 }}>📋</div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>No items found</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>This checklist has no items configured</div>
          </div>
        ) : (
          <div>
            {items.map((item, i) => (
              <div key={item.id || i} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px',
                marginBottom: 6,
                background: i % 2 === 0 ? T.bg : T.surface,
                borderRadius: 8,
                border: `1px solid ${T.border}`,
                transition: 'box-shadow 0.15s',
              }}>
                {/* Index badge */}
                <span style={{
                  minWidth: 28, height: 28, borderRadius: '50%',
                  background: freqBg, color: freqColor,
                  fontSize: 12, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>{i + 1}</span>

                {/* Item text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 4, lineHeight: 1.4 }}>
                    {item.item_text || `Item ${i + 1}`}
                  </div>
                  {/* Metadata badges */}
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {item.item_type && (
                      <span style={{ fontSize: 10, color: T.textSub, background: '#F3F4F6', borderRadius: 4, padding: '2px 6px', fontWeight: 500 }}>
                        {item.item_type}
                      </span>
                    )}
                    {item.expected_value && (
                      <span style={{ fontSize: 10, color: T.primary, background: '#E0E7FF', borderRadius: 4, padding: '2px 6px', fontWeight: 500 }}>
                        Expected: {item.expected_value}
                      </span>
                    )}
                    {item.is_required && (
                      <span style={{ fontSize: 10, color: '#EF4444', background: '#FEF2F2', borderRadius: 4, padding: '2px 6px', fontWeight: 600 }}>
                        Required
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: `1px solid ${T.border}`, padding: '12px 20px', textAlign: 'right' }}>
        <Button onClick={onClose} style={{ borderRadius: 8, fontWeight: 600 }}>Close</Button>
      </div>
    </Modal>
  );
};

/* ─── Assignment detail card (side panel) ────────────────────────────────── */
const AssignmentCard = ({ assignment, onViewItems, onDelete }) => (
  <div
    style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: T.radiusSm, padding: '12px 14px', marginBottom: 8,
      borderLeft: `3px solid ${FREQ_COLOR[assignment.frequency] || T.primary}`,
      transition: 'box-shadow 0.15s, transform 0.15s',
    }}
    onMouseEnter={e => {
      e.currentTarget.style.boxShadow = T.shadow;
      e.currentTarget.style.transform = 'translateY(-1px)';
    }}
    onMouseLeave={e => {
      e.currentTarget.style.boxShadow = 'none';
      e.currentTarget.style.transform = 'translateY(0)';
    }}
  >
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <div 
        onClick={() => onViewItems(assignment)}
        style={{
          flex: 1, minWidth: 0, cursor: 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            background: FREQ_BG[assignment.frequency] || T.primaryBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <FileTextOutlined style={{ color: FREQ_COLOR[assignment.frequency] || T.primary, fontSize: 14 }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 6, lineHeight: 1.3 }}>
              {assignment.checklistName}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
              <FreqBadge freq={assignment.frequency} />
              {assignment.frequency === 'Daily' && assignment.shift && (
                <span style={{ fontSize: 10, color: T.textSub, background: '#F3F4F6', borderRadius: 99, padding: '2px 7px', fontWeight: 500 }}>
                  ⏱ {assignment.shift} shift
                </span>
              )}
              {assignment.frequency === 'Weekly' && assignment.scheduled_day && (
                <span style={{ fontSize: 10, color: T.textSub, background: '#F3F4F6', borderRadius: 99, padding: '2px 7px', fontWeight: 500 }}>
                  📅 {assignment.scheduled_day}
                </span>
              )}
              {assignment.nextDueDate && (
  <span style={{ fontSize: 10, color: T.textSub, background: '#F3F4F6', borderRadius: 99, padding: '2px 8px', fontWeight: 500 }}>
    📅 Due: {new Date(assignment.nextDueDate).toLocaleDateString()}
  </span>
)}
              {assignment.frequency === 'Monthly' && assignment.scheduled_day && (
                <span style={{ fontSize: 10, color: T.textSub, background: '#F3F4F6', borderRadius: 99, padding: '2px 7px', fontWeight: 500 }}>
                  📆 Day {assignment.scheduled_day}
                </span>
              )}
              {/* Items badge */}
              <span style={{
                fontSize: 10, color: T.success,
                background: T.successBg,
                border: `1px solid ${T.success}40`,
                borderRadius: 99, padding: '2px 9px', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <CheckSquareOutlined style={{ fontSize: 9 }} />
                {assignment.itemsCount} Items
              </span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Delete button */}
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <Popconfirm
          title="Delete Assignment"
          description={`Are you sure you want to delete the assignment "${assignment.checklistName}"? This action cannot be undone.`}
          onConfirm={() => onDelete(assignment)}
          okText="Delete"
          cancelText="Cancel"
          okButtonProps={{ danger: true }}
        >
          <Button
            type="text"
            size="small"
            icon={<DeleteOutlined />}
            style={{
              color: '#EF4444',
              borderColor: '#EF4444',
              borderRadius: 6,
              padding: '4px 8px',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#FEF2F2';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
            }}
          />
        </Popconfirm>
      </div>
    </div>
  </div>
);

/* ─── Main Component ──────────────────────────────────────────────────────── */
const PokaYokeMachineAssignments = ({ machines = [], fetchMachines, machinesLoading }) => {
  const [checklists, setChecklists]               = useState([]);
  const [assignments, setAssignments]             = useState([]);
  const [loading, setLoading]                     = useState(false);
  const [checklistsLoading, setChecklistsLoading] = useState(false);
  const [selectedMachine, setSelectedMachine]     = useState(null);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [selectedDate, setSelectedDate]           = useState(null);
  const [selectedDateAssignments, setSelectedDateAssignments] = useState([]);
  const [itemsPopupVisible, setItemsPopupVisible] = useState(false);
  const [activeAssignment, setActiveAssignment]   = useState(null);
  const [calendarMode, setCalendarMode]           = useState('month');

  const today = dayjs();
  const [viewYear, setViewYear]   = useState(today.year());
  const [viewMonth, setViewMonth] = useState(today.month());
  const [form] = Form.useForm();

  useEffect(() => {
    if (selectedMachine) fetchMachineAssignments(selectedMachine);
  }, [selectedMachine]);

  const fetchChecklists = async () => {
    setChecklistsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/pokayoke-checklists/`);
      if (!res.ok) throw new Error('Failed to fetch checklists');
      setChecklists(await res.json());
    } catch (e) { message.error('Failed to fetch checklists: ' + e.message); }
    finally { setChecklistsLoading(false); }
  };

 const fetchMachineAssignments = async (machineId) => {
  setLoading(true);
  try {
    const res = await fetch(`${API_BASE_URL}/pokayoke-checklists/machines/${machineId}/assignments`);
    if (!res.ok) throw new Error('Failed to fetch assignments');
    const data = await res.json();
    setAssignments(data.map(a => {
      const items = a.checklist?.items || [];
      let earliestDue = null;
      let dueFrequency = null;
      
    const unitToFreq = {
      'Day': 'Daily',
      'Week': 'Weekly',
      'Month': 'Monthly',
      'Year': 'Monthly'
    };

    items.forEach(item => {
        if (item.frequency_type === 'Time Based' && item.interval_value && item.interval_unit) {
          const baseDate = a.next_due_date ? new Date(a.next_due_date) : new Date(a.assigned_at);
          const dueDate = new Date(baseDate);

          switch (item.interval_unit) {
            case 'Day': dueDate.setDate(dueDate.getDate() + item.interval_value); break;
            case 'Week': dueDate.setDate(dueDate.getDate() + item.interval_value * 7); break;
            case 'Month': dueDate.setMonth(dueDate.getMonth() + item.interval_value); break;
            case 'Year': dueDate.setFullYear(dueDate.getFullYear() + item.interval_value); break;
          }

          if (!earliestDue || dueDate < earliestDue) {
            earliestDue = dueDate;
            dueFrequency = unitToFreq[item.interval_unit] || 'Monthly';
          }
        }
      });

      if (!earliestDue) {
        earliestDue = new Date(a.assigned_at);
        dueFrequency = 'Custom';
      }

      return {
        ...a,
        checklistName: a.checklist?.name || 'Unknown',
        itemsCount:    a.checklist?.items?.length || 0,
        assignedDate:  new Date(a.assigned_at),
        nextDueDate:   earliestDue,
        frequency:     dueFrequency || 'Monthly',
      };
    }));
  } catch (e) { message.error('Failed to fetch assignments: ' + e.message); }
  finally { setLoading(false); }
};

  const handleAssignChecklist = async (values) => {
    if (!values.machine_ids || values.machine_ids.length === 0) {
      message.error('Please select at least one machine');
      return;
    }
    if (!values.checklist_ids || values.checklist_ids.length === 0) {
      message.error('Please select at least one checklist');
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/pokayoke-checklists/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machine_ids: values.machine_ids,
          checklist_ids: values.checklist_ids,
          frequency: values.frequency,
          shift: values.frequency === 'Daily' ? values.shift : null,
          scheduled_day: values.frequency === 'Weekly' ? values.dayOfWeek
            : values.frequency === 'Monthly' ? (values.dayOfMonth?.format('D') ?? null) : null,
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Failed'); }
      message.success('Checklist assigned successfully');
      setAssignModalVisible(false);
      form.resetFields();
      // Refresh assignments for all selected machines
      values.machine_ids.forEach(machineId => fetchMachineAssignments(machineId));
    } catch (e) { message.error('Failed to assign checklist: ' + e.message); }
  };

 const getAssignmentsForDate = (year, month, day, isWeekend, dow) => {
  if (isWeekend || !assignments.length) return [];
  return assignments.filter(a => {
    const nextDue = a.nextDueDate ? new Date(a.nextDueDate) : null;
    const assigned = a.assignedDate ? new Date(a.assignedDate) : null;
    
    const matchesDue = nextDue && 
      nextDue.getDate() === day && 
      nextDue.getMonth() === month && 
      nextDue.getFullYear() === year;
    
    const matchesAssigned = assigned &&
      assigned.getDate() === day &&
      assigned.getMonth() === month &&
      assigned.getFullYear() === year;
    
    return matchesDue || matchesAssigned;
  });
};

  const handleDateClick = (year, month, day) => {
    const d = dayjs(new Date(year, month, day));
    setSelectedDate(d);
    const dow = d.day();
    const isWeekend = dow === 0; // Only Sunday is weekend, Saturday is included in weekly
    setSelectedDateAssignments(isWeekend ? [] : getAssignmentsForDate(year, month, day, false, dow));
  };

  const handleViewItems = async (assignment) => {
    try {
      // Fetch items using the specific items endpoint
      const res = await fetch(`${API_BASE_URL}/pokayoke-checklists/${assignment.checklist_id}/items`);
      if (!res.ok) throw new Error('Failed to fetch checklist items');
      const itemsData = await res.json();
      
      // Update assignment with items
      const updatedAssignment = {
        ...assignment,
        checklist: {
          ...assignment.checklist,
          items: itemsData || [],
        },
      };
      
      setActiveAssignment(updatedAssignment);
      setItemsPopupVisible(true);
    } catch (e) {
      message.error('Failed to load checklist items: ' + e.message);
    }
  };

  const handleDeleteAssignment = async (assignment) => {
    try {
      const res = await fetch(`${API_BASE_URL}/pokayoke-checklists/assignments/${assignment.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to delete assignment');
      }
      message.success('Assignment deleted successfully');
      
      // Refresh assignments for the selected machine
      if (selectedMachine) {
        fetchMachineAssignments(selectedMachine);
      }
      
      // Update selected date assignments if needed
      if (selectedDate) {
        const dow = selectedDate.day();
        const isWeekend = dow === 0; // Only Sunday is weekend, Saturday is included in weekly
        if (!isWeekend) {
          const updatedAssignments = getAssignmentsForDate(
            selectedDate.year(),
            selectedDate.month(),
            selectedDate.date(),
            false,
            dow
          );
          setSelectedDateAssignments(updatedAssignments);
        }
      }
    } catch (e) {
      message.error('Failed to delete assignment: ' + e.message);
    }
  };

  const cells = getDaysInMonth(viewYear, viewMonth);
  const machineName = machines.find(m => m.id === selectedMachine);
  const machineLabel = machineName ? `${machineName.make} - ${machineName.model || 'N/A'}` : '';

  /* ─── Calendar cell ─────────────────────────────────────────────────────── */
  const renderCell = ({ day, cur }, idx) => {
    const date = new Date(viewYear, cur ? viewMonth : (idx < 7 ? viewMonth - 1 : viewMonth + 1), day);
    const dow = date.getDay();
    const isWeekend = dow === 0; // Only Sunday is weekend, Saturday is included in weekly
    const isToday = cur && day === today.date() && viewMonth === today.month() && viewYear === today.year();
    const isSelected = selectedDate && cur
      && selectedDate.date() === day
      && selectedDate.month() === viewMonth
      && selectedDate.year() === viewYear;

    const cellAssignments = cur ? getAssignmentsForDate(viewYear, viewMonth, day, isWeekend, dow) : [];
    const count = cellAssignments.length;

   const freqs = cur && !isWeekend && count > 0
  ? [...new Set(cellAssignments.map(a => a.frequency || 'Custom'))]
  : [];
 
const dominant = freqs.includes('Daily') ? 'Daily'
  : freqs.includes('Weekly') ? 'Weekly'
  : freqs.includes('Monthly') ? 'Monthly' 
  : freqs.includes('Custom') ? 'Custom' : null;
    return (
      <div
        key={idx}
        onClick={() => cur && handleDateClick(viewYear, viewMonth, day)}
        style={{
          position: 'relative',
          minHeight: 85,
          padding: '8px 10px',
          borderRadius: 0,
          background: isSelected ? '#EEF2FF'
            : isWeekend && cur ? T.weekend
            : cur ? T.surface : 'transparent',
          border: 'none',
          borderRight: `1px solid ${T.border}`,
          borderBottom: `1px solid ${T.border}`,
          cursor: cur && !isWeekend ? 'pointer' : 'default',
          opacity: cur ? 1 : 0.3,
          outline: isSelected ? `2px solid ${T.primary}` : isToday ? `2px solid ${T.primary}` : 'none',
          outlineOffset: isSelected ? '-2px' : '-2px',
          transition: 'background 0.12s',
        }}
        onMouseEnter={e => {
          if (cur && !isSelected && !isWeekend) e.currentTarget.style.background = '#F5F7FF';
        }}
        onMouseLeave={e => {
          if (cur && !isSelected) e.currentTarget.style.background =
            isWeekend ? T.weekend : T.surface;
        }}
      >
        {/* Day number */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{
            fontSize: 13, fontWeight: isToday ? 700 : 500,
            color: isToday ? T.surface : isWeekend ? T.textMuted : T.textMid,
            width: 26, height: 26, borderRadius: '50%',
            background: isToday ? T.primary : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>{day}</span>
          {isWeekend && cur && (
            <span style={{
              fontSize: 9, fontWeight: 700, color: '#92400E',
              background: T.warningBg, borderRadius: 4, padding: '1px 5px',
            }}>OFF</span>
          )}
        </div>

        {/* Assignments block – matches the image layout */}
        {cur && !isWeekend && count > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {/* Dot + "Assignments" label */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: FREQ_COLOR[dominant] || T.primary,
                flexShrink: 0,
                boxShadow: `0 0 0 2px ${FREQ_BG[dominant] || T.primaryBg}`,
              }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: T.textMid }}>Assignments</span>
            </div>
            {/* Frequency pills */}
            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              {freqs.map(f => (
                <span key={f} style={{
                  fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
                  background: FREQ_BG[f], color: FREQ_COLOR[f],
                  letterSpacing: '0.02em',
                }}>{f}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  /* ─── Render ─────────────────────────────────────────────────────────────── */
  return (
    <div style={{ padding: 0, fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif", background: T.bg }}>

      {/* ── Top bar ── */}
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius,
        padding: '10px 14px', marginBottom: 10, boxShadow: T.shadow,
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <Text strong style={{ fontSize: 13, color: T.textMid, whiteSpace: 'nowrap' }}>Select Machine:</Text>
        <div style={{ flex: '1 1 280px', minWidth: 220 }}>
          <Select
            showSearch
            placeholder="Choose a machine to view assignments"
            loading={machinesLoading}
            onFocus={fetchMachines}
            style={{ width: '100%' }}
            value={selectedMachine}
            onChange={setSelectedMachine}
            filterOption={(input, opt) =>
              (Array.isArray(opt?.children) ? opt.children.join('') : opt?.children || '')
                .toString().toLowerCase().includes(input.toLowerCase())
            }
          >
            {machines.map(m => (
              <Option key={m.id} value={m.id}>{m.make} - {m.model || 'N/A'}</Option>
            ))}
          </Select>
        </div>
        {selectedMachine && (
          <span style={{
            fontSize: 12, fontWeight: 600, color: T.primary,
            background: T.primaryBg, borderRadius: 99, padding: '4px 12px',
          }}>{machineLabel}</span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => selectedMachine ? fetchMachineAssignments(selectedMachine) : fetchMachines()}
            loading={loading}
            style={{ borderRadius: 8 }}
          >Refresh</Button>
          <Button
            type="primary" icon={<PlusOutlined />}
            onClick={() => {
              fetchChecklists();
              fetchMachines();
              // Pre-select the currently selected machine if any
              if (selectedMachine) {
                form.setFieldsValue({ machine_ids: [selectedMachine] });
              } else {
                form.setFieldsValue({ machine_ids: [] });
              }
              setAssignModalVisible(true);
            }}
            style={{ background: T.primary, borderColor: T.primary, borderRadius: 8, fontWeight: 600 }}
          >New Assignment</Button>
        </div>
      </div>

      {selectedMachine ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 12, alignItems: 'stretch' }}>

          {/* ── Calendar card ── */}
          <div style={{
            background: T.bg, border: `1px solid ${T.border}`,
            borderRadius: T.radius, boxShadow: T.shadow, overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }}>
            {/* Calendar header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', borderBottom: `1px solid ${T.border}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <CalendarOutlined style={{ color: T.primary, fontSize: 16 }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Assignment Calendar</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {/* Year selector */}
                <Select size="small" value={viewYear} onChange={setViewYear} style={{ width: 80 }}>
                  {Array.from({ length: 21 }, (_, i) => today.year() - 10 + i).map(y => (
                    <Option key={y} value={y}>{y}</Option>
                  ))}
                </Select>
                {/* Month selector */}
                <Select size="small" value={viewMonth} onChange={setViewMonth} style={{ width: 108 }}>
                  {MONTHS.map((m, i) => <Option key={i} value={i}>{m}</Option>)}
                </Select>
                {/* Month / Year toggle */}
                <Radio.Group value={calendarMode} onChange={e => setCalendarMode(e.target.value)} size="small">
                  <Radio.Button value="month">Month</Radio.Button>
                  <Radio.Button value="year">Year</Radio.Button>
                </Radio.Group>
                {/* Today */}
                <button
                  onClick={() => { setViewMonth(today.month()); setViewYear(today.year()); }}
                  style={{
                    fontSize: 12, fontWeight: 600, color: T.primary, background: T.primaryBg,
                    border: 'none', borderRadius: 8, padding: '4px 12px', cursor: 'pointer',
                  }}
                >Today</button>
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 48, flex: 1 }}>
                <Spin size="large" />
                <p style={{ marginTop: 12, color: T.textSub }}>Loading assignments…</p>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                {/* Day-of-week headers */}
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
                  borderBottom: `1px solid ${T.border}`,
                }}>
                  {DAYS_SHORT.map((d, i) => (
                    <div key={d} style={{
                      textAlign: 'center',
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
                      color: (i === 0 || i === 6) ? T.textMuted : T.textSub,
                      padding: '6px 0',
                      borderRight: i < 6 ? `1px solid ${T.border}` : 'none',
                    }}>{d}</div>
                  ))}
                </div>

                {/* Calendar grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', flex: 1 }}>
                  {cells.map((cell, idx) => renderCell(cell, idx))}
                </div>

                {/* Legend */}
                <div style={{
                  display: 'flex', gap: 14, padding: '8px 12px',
                  borderTop: `1px solid ${T.border}`, flexWrap: 'wrap',
                }}>
                  {['Daily','Weekly','Monthly'].map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: FREQ_COLOR[f], display: 'inline-block' }} />
                      <span style={{ fontSize: 11, color: T.textSub, fontWeight: 500 }}>{f}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#92400E', background: T.warningBg, borderRadius: 2, padding: '1px 5px' }}>OFF</span>
                    <span style={{ fontSize: 11, color: T.textSub, fontWeight: 500 }}>Weekend</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: T.primary, display: 'inline-block' }} />
                    <span style={{ fontSize: 11, color: T.textSub, fontWeight: 500 }}>Today</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Details panel ── */}
          <div style={{
            background: T.sidebar, border: `1px solid ${T.border}`, borderRadius: T.radius,
            boxShadow: T.shadow, overflow: 'hidden', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ padding: '12px 14px', borderBottom: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>
                {selectedDate
                  ? `Assignments — ${selectedDate.format('ddd, DD MMM YYYY')}`
                  : 'Assignment Details'}
              </div>
              {selectedDate && selectedDateAssignments.length > 0 && (
                <div style={{ fontSize: 11, color: T.textSub, marginTop: 2 }}>
                  {selectedDateAssignments.length} assignment{selectedDateAssignments.length > 1 ? 's' : ''} scheduled
                </div>
              )}
            </div>

            <div style={{ padding: 10, maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}>
              {!selectedDate ? (
                <div style={{ textAlign: 'center', padding: '36px 16px', color: T.textMuted }}>
                  <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.4 }}>📅</div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>Select a date</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Click any weekday to see its assignments</div>
                </div>
              ) : selectedDate.day() === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 16px' }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>🏖️</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.warning }}>Weekend</div>
                  <div style={{ fontSize: 12, color: T.textSub, marginTop: 4 }}>No assignments scheduled</div>
                </div>
              ) : selectedDateAssignments.length > 0 ? (
                selectedDateAssignments.map((a, i) => (
                  <AssignmentCard key={i} assignment={a} onViewItems={handleViewItems} onDelete={handleDeleteAssignment} />
                ))
              ) : (
                <div style={{ textAlign: 'center', padding: '36px 16px', color: T.textMuted }}>
                  <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.4 }}>✅</div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>No assignments</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Nothing scheduled for this date</div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius,
          boxShadow: T.shadow, textAlign: 'center', padding: '56px 24px',
        }}>
          <CalendarOutlined style={{ fontSize: 48, color: T.primary, opacity: 0.3, marginBottom: 12, display: 'block' }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: T.textMid, marginBottom: 6 }}>Select a machine to get started</div>
          <div style={{ fontSize: 13, color: T.textSub }}>Choose a machine from the dropdown above to view its assignment calendar</div>
        </div>
      )}

      {/* ── New Assignment Modal ── */}
      <Modal
        title={<div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 }}><PlusOutlined style={{ color: T.primary }} /> New Assignment</div>}
        open={assignModalVisible}
        onCancel={() => { setAssignModalVisible(false); form.resetFields(); }}
        footer={null}
        width={480}
        centered
        maskClosable={false}
      >
        <Form form={form} layout="vertical" onFinish={handleAssignChecklist} style={{ marginTop: 20 }}>
          <Form.Item name="machine_ids" label="Select Machines" rules={[{ required: true, message: 'Please select at least one machine' }]}>
            <Select 
              mode="multiple"
              placeholder="Select machines" 
              loading={machinesLoading}
              onFocus={fetchMachines}
              showSearch
              filterOption={(input, opt) =>
                (Array.isArray(opt?.children) ? opt.children.join('') : opt?.children || '')
                  .toString().toLowerCase().includes(input.toLowerCase())}
            >
              {machines.map(m => <Option key={m.id} value={m.id}>{m.make} - {m.model || 'N/A'}</Option>)}
            </Select>
          </Form.Item>

          <Form.Item name="checklist_ids" label="Select Checklists" rules={[{ required: true, message: 'Please select at least one checklist' }]}>
            <Select 
              mode="multiple"
              placeholder="Select checklists" 
              loading={checklistsLoading} 
              showSearch
              filterOption={(input, opt) =>
                (Array.isArray(opt?.children) ? opt.children.join('') : opt?.children || '')
                  .toString().toLowerCase().includes(input.toLowerCase())}
            >
              {checklists.map(c => <Option key={c.id} value={c.id}>{c.name}</Option>)}
            </Select>
          </Form.Item>

          


          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => { setAssignModalVisible(false); form.resetFields(); }} style={{ borderRadius: 8 }}>Cancel</Button>
              <Button type="primary" htmlType="submit"
                style={{ background: T.primary, borderColor: T.primary, borderRadius: 8, fontWeight: 600 }}
              >Assign Checklist</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Items Popup Modal ── */}
      <ItemsPopup
        visible={itemsPopupVisible}
        onClose={() => { setItemsPopupVisible(false); setActiveAssignment(null); }}
        assignment={activeAssignment}
      />
    </div>
  );
};

export default PokaYokeMachineAssignments;