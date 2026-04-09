import React from 'react';
import { Button, Spin } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';

const PokaYokeChecklistSelector = ({
  loading,
  assignments,
  namesByChecklistId,
  onSelectChecklist,
  completedTodayIds = new Set(),
}) => {
  const getFrequencyDisplay = (frequency, shift, scheduledDay) => {
    let frequencyDisplay = frequency || '';
    let badgeStyle = { padding: '2px 8px', borderRadius: 4 };
    
    if (frequency) {
      const freqLower = frequency.toLowerCase();
      if (freqLower === 'daily' && shift) {
        frequencyDisplay = `${frequency} (${shift})`;
        badgeStyle = { ...badgeStyle, background: '#dcfce7', color: '#16a34a' };
      } else if (freqLower === 'weekly' && scheduledDay) {
        frequencyDisplay = `${frequency} (${scheduledDay})`;
        badgeStyle = { ...badgeStyle, background: '#fef3c7', color: '#d97706' };
      } else if (freqLower === 'monthly' && scheduledDay) {
        frequencyDisplay = `${frequency} (${scheduledDay})`;
        badgeStyle = { ...badgeStyle, background: '#ede9fe', color: '#7c3aed' };
      } else {
        badgeStyle = { ...badgeStyle, background: '#f0f9ff', color: '#0284c7' };
      }
    }
    
    return { frequencyDisplay, badgeStyle };
  };

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <Spin />
          <div style={{ marginTop: 12, color: '#94a3b8' }}>Loading checklists...</div>
        </div>
      ) : assignments.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
          No assigned checklists
        </div>
      ) : (
        assignments.map((item, idx) => {
          const cidRaw =
            item?.checklist_id ??
            item?.pokayoke_checklist_id ??
            item?.checklistId ??
            item?.checklist?.id ??
            null;
          const cid = cidRaw != null ? String(cidRaw) : null;
          const name =
            namesByChecklistId[cid] ??
            item?.name ??
            item?.title ??
            (cid ? `Checklist #${cid}` : 'Checklist');
          const frequency = item?.frequency ?? item?.checklist?.frequency ?? null;
          const shift = item?.shift ?? item?.checklist?.shift ?? null;
          const scheduledDay = item?.scheduled_day ?? item?.checklist?.scheduled_day ?? null;
          
          const { frequencyDisplay, badgeStyle } = getFrequencyDisplay(frequency, shift, scheduledDay);
          
          const isCompleted = cid && completedTodayIds.has(String(cid));
          
          return (
            <div
              key={cid ?? idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '16px 20px',
                borderBottom: idx < assignments.length - 1 ? '1px solid #e2e8f0' : 'none',
                gap: 16,
                opacity: isCompleted ? 0.7 : 1,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: isCompleted ? '#f1f5f9' : '#E0F2FE',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <FileTextOutlined style={{ fontSize: 22, color: isCompleted ? '#94a3b8' : '#0284c7' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: isCompleted ? '#64748b' : '#0f172a', marginBottom: 4 }}>
                  {name} {isCompleted && <span style={{ color: '#16a34a', fontSize: 12, fontWeight: 500 }}>(Completed)</span>}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  {frequencyDisplay && (
                    <span style={badgeStyle}>
                      {frequencyDisplay}
                    </span>
                  )}
                </div>
              </div>
              <Button
                type={isCompleted ? "default" : "primary"}
                onClick={() => onSelectChecklist(item)}
                style={{ borderRadius: 8 }}
                disabled={isCompleted}
              >
                {isCompleted ? "Completed" : "Select"}
              </Button>
            </div>
          );
        })
      )}
    </div>
  );
};

export default PokaYokeChecklistSelector;
