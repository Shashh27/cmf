import React from 'react';
import { Space, Button, Typography, Divider, Tag, Tooltip } from 'antd';
import { ArrowLeftOutlined, ExportOutlined, SettingOutlined, CheckCircleOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const { Text } = Typography;

const displayOrDash = (value) => {
  const s = (value ?? '').toString().trim();
  return s || '—';
};

const C = {
  slate50: '#f8fafc',
  slate100: '#f1f5f9',
  slate200: '#e2e8f0',
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate700: '#334155',
  slate900: '#0f172a',
  blue500: '#3b82f6',
  blue600: '#2563eb',
  emerald500: '#10b981',
  emerald600: '#059669',
};

const segmentBtn = (active, disabled = false) => ({
  border: 'none',
  outline: 'none',
  cursor: disabled ? 'not-allowed' : 'pointer',
  minWidth: 88,
  height: 32,
  padding: '0 16px',
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  transition: 'all 0.18s ease',
  opacity: disabled ? 0.45 : 1,
  background: active ? '#ffffff' : 'transparent',
  color: active ? C.slate900 : C.slate500,
  boxShadow: active ? '0 1px 3px rgba(15, 23, 42, 0.1), 0 1px 2px rgba(15, 23, 42, 0.06)' : 'none',
});

const primaryActionBtn = (enabled = true) => ({
  height: 36,
  paddingInline: 18,
  borderRadius: 10,
  border: 'none',
  fontWeight: 600,
  fontSize: 13,
  letterSpacing: '0.01em',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  cursor: enabled ? 'pointer' : 'not-allowed',
  opacity: enabled ? 1 : 0.55,
  background: enabled
    ? `linear-gradient(180deg, ${C.blue500} 0%, ${C.blue600} 100%)`
    : C.slate100,
  color: enabled ? '#ffffff' : C.slate400,
  boxShadow: enabled ? '0 2px 8px rgba(37, 99, 235, 0.28)' : 'none',
  transition: 'transform 0.12s ease, box-shadow 0.12s ease, opacity 0.12s ease',
});

const ftpActionBtn = (enabled = true) => ({
  height: 36,
  paddingInline: 18,
  borderRadius: 10,
  fontWeight: 600,
  fontSize: 13,
  letterSpacing: '0.01em',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  cursor: enabled ? 'pointer' : 'not-allowed',
  border: enabled ? `1px solid ${C.emerald500}` : `1px solid ${C.slate200}`,
  background: enabled ? `linear-gradient(180deg, ${C.emerald500} 0%, ${C.emerald600} 100%)` : C.slate50,
  color: enabled ? '#ffffff' : C.slate400,
  boxShadow: enabled ? '0 2px 8px rgba(16, 185, 129, 0.25)' : 'none',
  transition: 'transform 0.12s ease, box-shadow 0.12s ease',
});

const InspectorHeader = ({
  projectName = '',
  partName = '',
  operationName = '',
  fileName = 'Drawing.pdf',
  mode = 'PLAN',
  onModeChange,
  planStatus = null,
  confirmedByUsername = null,
  onConfirmPlan,
  confirmPlanDisabled = false,
  measureOnly = false,
  hideTopActions = false,
  showApproveFtp = false,
  onApproveFtp = null,
  approveFtpDisabled = false,
}) => {
  const navigate = useNavigate();
  const canConfirm = typeof onConfirmPlan === 'function' && !confirmPlanDisabled;

  return (
    <div
      style={{
        height: 60,
        padding: '0 20px',
        background: '#fff',
        borderBottom: `1px solid ${C.slate200}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
        zIndex: 10,
      }}
    >
      <Space size="large" align="center">
        <Button
          type="text"
          onClick={() => navigate(-1)}
          style={{
            fontWeight: 600,
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: C.slate500,
            borderRadius: 8,
            height: 34,
          }}
        >
          <ArrowLeftOutlined style={{ fontSize: 14 }} />
          Back
        </Button>
        <Divider orientation="vertical" style={{ height: 30, borderColor: C.slate200 }} />

        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 220 }}>
          <Text style={{ fontSize: 10, textTransform: 'uppercase', color: C.slate400, letterSpacing: '0.08em', fontWeight: 600 }}>
            Project
          </Text>
          <Text strong style={{ fontSize: 13, maxWidth: '100%', color: C.slate900 }} ellipsis={projectName ? { tooltip: projectName } : false}>
            {displayOrDash(projectName)}
          </Text>
        </div>

        <Divider orientation="vertical" style={{ height: 30, borderColor: C.slate200 }} />

        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.blue500 }} />
            <Text style={{ fontSize: 10, textTransform: 'uppercase', color: C.slate400, letterSpacing: '0.08em', fontWeight: 600 }}>
              Part
            </Text>
          </div>
          <Text strong style={{ fontSize: 13, maxWidth: '100%', color: C.slate900 }} ellipsis={partName ? { tooltip: partName } : false}>
            {displayOrDash(partName)}
          </Text>
        </div>

        <Divider orientation="vertical" style={{ height: 30, borderColor: C.slate200 }} />

        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 240 }}>
          <Text style={{ fontSize: 10, textTransform: 'uppercase', color: C.slate400, letterSpacing: '0.08em', fontWeight: 600 }}>
            Operation
          </Text>
          <Text strong style={{ fontSize: 13, maxWidth: '100%', color: C.slate900 }} ellipsis={operationName ? { tooltip: operationName } : false}>
            {displayOrDash(operationName)}
          </Text>
        </div>

        <Divider orientation="vertical" style={{ height: 30, borderColor: C.slate200 }} />

        <Text style={{ fontSize: 12, color: C.slate400, fontStyle: 'italic', maxWidth: 200 }} ellipsis={{ tooltip: fileName }}>
          {fileName}
        </Text>
      </Space>

      <Space size={12} align="center">
        {measureOnly ? (
          <Tag
            color="processing"
            style={{
              margin: 0,
              fontWeight: 600,
              fontSize: 11,
              letterSpacing: '0.06em',
              borderRadius: 8,
              padding: '2px 10px',
              border: 'none',
            }}
          >
            MEASURE MODE
          </Tag>
        ) : (
          <div
            style={{
              background: C.slate100,
              padding: 3,
              borderRadius: 11,
              display: 'flex',
              gap: 2,
              border: `1px solid ${C.slate200}`,
            }}
          >
            <button type="button" style={segmentBtn(mode === 'PLAN')} onClick={() => onModeChange?.('PLAN')}>
              Plan
            </button>
            <Tooltip title={planStatus !== 'confirmed' ? 'Confirm the inspection plan first to enable measurement mode' : ''}>
              <button
                type="button"
                style={segmentBtn(mode === 'MEASURE', planStatus !== 'confirmed')}
                onClick={() => onModeChange?.('MEASURE')}
                disabled={planStatus !== 'confirmed'}
              >
                Measure
              </button>
            </Tooltip>
          </div>
        )}

        {planStatus === 'confirmed' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, maxWidth: 220 }}>
            <Tag
              color="success"
              style={{
                margin: 0,
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 11,
                border: 'none',
                background: '#ecfdf5',
                color: C.emerald600,
              }}
            >
              Plan confirmed
            </Tag>
            {confirmedByUsername ? (
              <Text style={{ fontSize: 11, lineHeight: 1.2, color: C.slate400 }} ellipsis={{ tooltip: confirmedByUsername }}>
                by {confirmedByUsername}
              </Text>
            ) : null}
          </div>
        )}

        {!measureOnly && planStatus !== 'confirmed' && typeof onConfirmPlan === 'function' && (
          <button
            type="button"
            style={primaryActionBtn(canConfirm)}
            disabled={confirmPlanDisabled}
            onClick={onConfirmPlan}
            onMouseEnter={(e) => {
              if (!canConfirm) return;
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.32)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = canConfirm ? '0 2px 8px rgba(37, 99, 235, 0.28)' : 'none';
            }}
          >
            <CheckCircleOutlined style={{ fontSize: 15 }} />
            Confirm plan
          </button>
        )}

        {showApproveFtp && (
          <button
            type="button"
            style={ftpActionBtn(!approveFtpDisabled)}
            disabled={approveFtpDisabled}
            onClick={onApproveFtp}
            onMouseEnter={(e) => {
              if (approveFtpDisabled) return;
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = approveFtpDisabled ? 'none' : '0 2px 8px rgba(16, 185, 129, 0.25)';
            }}
          >
            <SafetyCertificateOutlined style={{ fontSize: 15 }} />
            Approve FTP
          </button>
        )}

        {!hideTopActions && (
          <Button
            style={{
              height: 36,
              borderRadius: 10,
              border: `1px solid ${C.slate200}`,
              background: '#fff',
              color: C.slate700,
              fontWeight: 600,
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
            }}
          >
            <ExportOutlined style={{ fontSize: 14, color: C.slate500 }} />
            Export
          </Button>
        )}
        {!hideTopActions && (
          <Button
            type="text"
            icon={<SettingOutlined style={{ fontSize: 17, color: C.slate500 }} />}
            style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${C.slate200}` }}
          />
        )}
      </Space>
    </div>
  );
};

export default InspectorHeader;
