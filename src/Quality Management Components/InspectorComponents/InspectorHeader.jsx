import React from 'react';
import { Space, Button, Typography, Divider, Tag, Tooltip } from 'antd';
import { ArrowLeftOutlined, ExportOutlined, SettingOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const { Text } = Typography;

const displayOrDash = (value) => {
  const s = (value ?? '').toString().trim();
  return s || '—';
};

const InspectorHeader = ({
  projectName = '',
  partName = '',
  operationName = '',
  fileName = 'Drawing.pdf',
  mode = 'PLAN',
  onModeChange,
  planStatus = null,
  /** Stored when the plan was confirmed (login username). */
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

  return (
    <div
      style={{
        height: '60px',
        padding: '0 20px',
        background: '#fff',
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        zIndex: 10,
      }}
    >
      <Space size="large" align="center">
        <Button
          type="text"
          onClick={() => navigate(-1)}
          style={{ fontWeight: 600, fontSize: '12px', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <ArrowLeftOutlined style={{ fontSize: 16, color: '#64748b' }} />
          BACK
        </Button>
        <Divider orientation="vertical" style={{ height: '30px' }} />

        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '220px' }}>
          <Text type="secondary" style={{ fontSize: '10px', textTransform: 'uppercase' }}>
            Project
          </Text>
          <Text strong style={{ fontSize: '13px', maxWidth: '100%' }} ellipsis={projectName ? { tooltip: projectName } : false}>
            {displayOrDash(projectName)}
          </Text>
        </div>

        <Divider orientation="vertical" style={{ height: '30px' }} />

        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '220px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#1890ff' }} />
            <Text type="secondary" style={{ fontSize: '10px', textTransform: 'uppercase' }}>
              Part
            </Text>
          </div>
          <Text strong style={{ fontSize: '13px', maxWidth: '100%' }} ellipsis={partName ? { tooltip: partName } : false}>
            {displayOrDash(partName)}
          </Text>
        </div>

        <Divider orientation="vertical" style={{ height: '30px' }} />

        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '240px' }}>
          <Text type="secondary" style={{ fontSize: '10px', textTransform: 'uppercase' }}>
            Operation
          </Text>
          <Text strong style={{ fontSize: '13px', maxWidth: '100%' }} ellipsis={operationName ? { tooltip: operationName } : false}>
            {displayOrDash(operationName)}
          </Text>
        </div>

        <Divider orientation="vertical" style={{ height: '30px' }} />

        <Text type="secondary" style={{ fontSize: '13px', fontStyle: 'italic' }}>
          {fileName}
        </Text>
      </Space>

      <Space size="middle">
        {measureOnly ? (
          <Tag color="processing" style={{ margin: 0, fontWeight: 600 }}>
            MEASURE MODE
          </Tag>
        ) : (
          <div style={{ background: '#f5f5f5', padding: '4px', borderRadius: '6px', display: 'flex', gap: '4px' }}>
            <Button
              size="small"
              type={mode === 'PLAN' ? 'primary' : 'text'}
              style={{ fontSize: '12px', minWidth: '70px', height: '28px' }}
              onClick={() => onModeChange?.('PLAN')}
            >
              PLAN
            </Button>
            <Tooltip title={planStatus !== 'confirmed' ? "Confirm the inspection plan first to enable measurement mode" : ""}>
              <Button
                size="small"
                type={mode === 'MEASURE' ? 'primary' : 'text'}
                style={{ fontSize: '12px', minWidth: '70px', height: '28px' }}
                onClick={() => onModeChange?.('MEASURE')}
                disabled={planStatus !== 'confirmed'}
              >
                MEASURE
              </Button>
            </Tooltip>
          </div>
        )}

        {planStatus === 'confirmed' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, maxWidth: 220 }}>
            <Tag color="success" style={{ margin: 0 }}>
              Plan confirmed
            </Tag>
            {confirmedByUsername ? (
              <Text type="secondary" style={{ fontSize: '11px', lineHeight: 1.2 }} ellipsis={{ tooltip: confirmedByUsername }}>
                by {confirmedByUsername}
              </Text>
            ) : null}
          </div>
        )}
        {!measureOnly && planStatus !== 'confirmed' && typeof onConfirmPlan === 'function' && (
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            style={{ height: '36px' }}
            onClick={onConfirmPlan}
            disabled={confirmPlanDisabled}
          >
            Confirm plan
          </Button>
        )}
        {showApproveFtp && (
          <Button
            type="primary"
            style={{ height: '36px' }}
            disabled={approveFtpDisabled}
            onClick={onApproveFtp}
          >
            Approve FTP
          </Button>
        )}
        {!hideTopActions && (
          <Button style={{ height: '36px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <ExportOutlined style={{ fontSize: 16, color: '#64748b' }} />
            EXPORT
          </Button>
        )}
        {!hideTopActions && <Button type="text" icon={<SettingOutlined style={{ fontSize: 18, color: '#64748b' }} />} />}
      </Space>
    </div>
  );
};

export default InspectorHeader;
