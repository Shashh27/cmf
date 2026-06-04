import React from 'react';
import { Button, Input, InputNumber } from 'antd';
import { 
  CheckOutlined, 
  CloseOutlined, 
  InfoCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';

const PokaYokeChecklistForm = ({
  items,
  responses,
  setResponses,
  comments,
  setComments,
  hasNonConforming,
  canSubmit,
  submitLoading,
  onSubmit,
  onBack,
  approvalInfo,
}) => {
  const isRedo = approvalInfo?.status === 'rejected';
  const rejectedItems = isRedo ? (approvalInfo?.rejection_details?.items || []).filter(i => i.approval_status === 'rejected') : [];
  const rejectedItemIds = new Set(rejectedItems.map(i => i.item_id));

  const truthy = new Set(['true', 'yes', 'y', '1', 'on']);
  const falsy = new Set(['false', 'no', 'n', '0', 'off']);

  const checkConforming = (value, expected, isBoolean, isNumeric) => {
    if (value === undefined || value === null) return false;
    
    if (isBoolean) {
      const v = String(value).toLowerCase();
      const e = expected != null ? String(expected).toLowerCase() : 'true';
      const vBool = truthy.has(v) ? true : falsy.has(v) ? false : null;
      const eBool = truthy.has(e) ? true : falsy.has(e) ? false : true;
      return vBool !== null && vBool === eBool;
    } else if (isNumeric) {
      const vNum = typeof value === 'number' ? value : parseFloat(String(value));
      const expStr = String(expected).trim();
      
      if (Number.isNaN(vNum)) return false;
      
      // Handle range comparisons
      if (expStr.startsWith('<=')) {
        const eNum = parseFloat(expStr.substring(2).trim());
        return !Number.isNaN(eNum) && vNum <= eNum;
      } else if (expStr.startsWith('>=')) {
        const eNum = parseFloat(expStr.substring(2).trim());
        return !Number.isNaN(eNum) && vNum >= eNum;
      } else if (expStr.startsWith('<')) {
        const eNum = parseFloat(expStr.substring(1).trim());
        return !Number.isNaN(eNum) && vNum < eNum;
      } else if (expStr.startsWith('>')) {
        const eNum = parseFloat(expStr.substring(1).trim());
        return !Number.isNaN(eNum) && vNum > eNum;
      } else if (expStr.includes('-')) {
        // Handle range format like "80-100"
        const parts = expStr.split('-');
        if (parts.length === 2) {
          const min = parseFloat(parts[0].trim());
          const max = parseFloat(parts[1].trim());
          return !Number.isNaN(min) && !Number.isNaN(max) && vNum >= min && vNum <= max;
        }
      }
      
      // Handle exact equality
      const eNum = parseFloat(expStr);
      return !Number.isNaN(eNum) && vNum === eNum;
    } else {
      return (
        expected != null &&
        String(value).toLowerCase().trim() === String(expected).toLowerCase().trim()
      );
    }
  };

  return (
    <div>
      <div
        style={{
          background: '#E6F4FF',
          border: '1px solid #dbeafe',
          borderRadius: 12,
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <InfoCircleOutlined style={{ fontSize: 18, color: '#1677FF', marginTop: 2 }} />
        <div>
          <div style={{ fontWeight: 600, color: '#0f172a' }}>
            Please complete all required items
          </div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
            Items marked as required must be completed before submission.
          </div>
        </div>
      </div>

      {isRedo && (
        <div
          style={{
            background: '#fff1f0',
            border: '1px solid #ffccc7',
            borderRadius: 12,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            marginBottom: 20,
          }}
        >
          <CloseCircleOutlined style={{ fontSize: 18, color: '#ff4d4f', marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 600, color: '#cf1322' }}>
              Checklist Rejected - Redo Required
            </div>
            <div style={{ fontSize: 13, color: '#851111', marginTop: 2 }}>
              Please correct the rejected items below and resubmit.
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 24 }}>
        {items.map((it, idx) => {
          const nm =
            it?.item_text ?? it?.name ?? it?.title ?? it?.label ?? 'Item';
          const required =
            it?.is_required ?? it?.required ?? it?.mandatory ?? false;
          const expected =
            it?.expected_value ?? it?.expected ?? it?.expectedValue ?? null;
          const typeRaw = (it?.item_type ?? it?.type ?? '').toLowerCase();
          const isBoolean = typeRaw.includes('bool');
          const isNumeric = typeRaw.includes('num');
          const isString = !isBoolean && !isNumeric;
          const id = it?.id ?? nm;
          const value = responses[id];
          const setValue = (val) =>
            setResponses((prev) => ({ ...prev, [id]: val }));

          const isConforming = checkConforming(value, expected, isBoolean, isNumeric);
          const isNonConforming = Boolean(value !== undefined && value !== null && !isConforming);
          
          const itemApproval = isRedo ? (approvalInfo?.rejection_details?.items || []).find(i => i.item_id === (it.id ?? null)) : null;
          const isItemRejected = itemApproval?.approval_status === 'rejected';
          const isItemDisabled = isRedo && !isItemRejected;

          return (
            <div
              key={id}
              style={{
                padding: '16px 0',
                borderBottom:
                  idx < items.length - 1 ? '1px solid #e2e8f0' : 'none',
                opacity: isItemDisabled ? 0.6 : 1,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: isItemRejected ? '#fff1f0' : '#E6F4FF',
                    border: isItemRejected ? '1px solid #ffccc7' : '1px solid #dbeafe',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isItemRejected ? '#ff4d4f' : '#1677FF',
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  {typeof it?.sequence_number === 'number' ? it.sequence_number : idx + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>
                    {nm}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                    {required && (
                      <span
                        style={{
                          background: '#E6F4FF',
                          color: '#1677FF',
                          padding: '2px 10px',
                          borderRadius: 9999,
                          fontSize: 12,
                          fontWeight: 500,
                        }}
                      >
                        Required
                      </span>
                    )}
                    {isItemRejected && (
                      <span
                        style={{
                          background: '#fff1f0',
                          color: '#ff4d4f',
                          padding: '2px 10px',
                          borderRadius: 9999,
                          fontSize: 12,
                          fontWeight: 500,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <CloseCircleOutlined style={{ fontSize: 10 }} />
                        Rejected
                      </span>
                    )}
                    {!isItemRejected && isRedo && (
                      <span
                        style={{
                          background: '#f6ffed',
                          color: '#52c41a',
                          padding: '2px 10px',
                          borderRadius: 9999,
                          fontSize: 12,
                          fontWeight: 500,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <CheckOutlined style={{ fontSize: 10 }} />
                        Approved
                      </span>
                    )}
                    {isNonConforming && !isRedo && (
                      <span
                        style={{
                          background: '#fef2f2',
                          color: '#dc2626',
                          padding: '2px 10px',
                          borderRadius: 9999,
                          fontSize: 12,
                          fontWeight: 500,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <CloseOutlined style={{ fontSize: 10 }} />
                        Non-conforming
                      </span>
                    )}
                    {isConforming && !isRedo && (
                      <span
                        style={{
                          background: '#dcfce7',
                          color: '#16a34a',
                          padding: '2px 10px',
                          borderRadius: 9999,
                          fontSize: 12,
                          fontWeight: 500,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <CheckOutlined style={{ fontSize: 10 }} />
                        Conforming
                      </span>
                    )}
                  </div>

                  {/* Rejection Comment */}
                  {isItemRejected && itemApproval.approval_comments && (
                    <div style={{ 
                      marginBottom: 12, 
                      padding: '8px 12px', 
                      background: '#fff7e6', 
                      borderLeft: '4px solid #ffa940',
                      borderRadius: '0 4px 4px 0',
                      fontSize: 13,
                      color: '#d46b08'
                    }}>
                      <ExclamationCircleOutlined style={{ marginRight: 8 }} />
                      <strong>Supervisor Comment:</strong> {itemApproval.approval_comments}
                    </div>
                  )}

                  {isBoolean && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => !isItemDisabled && setValue('yes')}
                        disabled={isItemDisabled}
                        style={{
                          padding: '8px 20px',
                          borderRadius: 8,
                          border: value === 'yes' ? 'none' : '1px solid #e2e8f0',
                          background: value === 'yes' ? '#E6F4FF' : '#fff',
                          color: value === 'yes' ? '#1677FF' : '#64748b',
                          cursor: isItemDisabled ? 'not-allowed' : 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                          fontWeight: 500,
                        }}
                      >
                        <CheckOutlined
                          style={{
                            color: value === 'yes' ? '#16a34a' : '#94a3b8',
                            fontSize: 14,
                          }}
                        />
                        Yes
                      </button>
                      <button
                        onClick={() => !isItemDisabled && setValue('no')}
                        disabled={isItemDisabled}
                        style={{
                          padding: '8px 20px',
                          borderRadius: 8,
                          border: value === 'no' ? 'none' : '1px solid #e2e8f0',
                          background: value === 'no' ? '#dc2626' : '#fff',
                          color: value === 'no' ? '#fff' : '#64748b',
                          cursor: isItemDisabled ? 'not-allowed' : 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                          fontWeight: 500,
                        }}
                      >
                        <CloseOutlined
                          style={{
                            color: value === 'no' ? '#fff' : '#94a3b8',
                            fontSize: 14,
                          }}
                        />
                        No
                      </button>
                    </div>
                  )}
                  {isNumeric && (
                    <InputNumber
                      value={value}
                      onChange={(v) => !isItemDisabled && setValue(v)}
                      disabled={isItemDisabled}
                      style={{ width: 220 }}
                    />
                  )}
                  {isString && (
                    <Input
                      value={value}
                      onChange={(e) => !isItemDisabled && setValue(e.target.value)}
                      disabled={isItemDisabled}
                      style={{ width: '100%', maxWidth: 280 }}
                    />
                  )}
                  {expected != null && (
                    <div
                      style={{
                        fontSize: 12,
                        color: '#94a3b8',
                        marginTop: 8,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <InfoCircleOutlined style={{ fontSize: 12 }} />
                      Expected: {String(expected)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Additional Comments</div>
        <Input.TextArea
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          placeholder="Enter any additional comments or observations..."
          rows={4}
          style={{ borderRadius: 8 }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          paddingTop: 16,
          borderTop: '1px solid #e2e8f0',
        }}
      >
        {hasNonConforming ? (
          <div
            style={{
              background: '#FFFBEB',
              border: '1px solid #FDE68A',
              borderRadius: 8,
              padding: '10px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flex: 1,
              minWidth: 200,
            }}
          >
            <span style={{ color: '#d97706', fontSize: 16 }}>⚠</span>
            <span style={{ color: '#92400e', fontSize: 13, fontWeight: 500 }}>
              Non-conforming responses detected
            </span>
          </div>
        ) : (
          <div />
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={onBack} style={{ borderRadius: 8 }}>
            Back
          </Button>
          <Button
            type="primary"
            disabled={!canSubmit || submitLoading}
            icon={<CheckOutlined />}
            style={{ borderRadius: 8 }}
            loading={submitLoading}
            onClick={onSubmit}
          >
            Submit Checklist
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PokaYokeChecklistForm;