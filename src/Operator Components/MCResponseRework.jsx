import React from 'react';
import { Card, Typography, Button } from 'antd';
import { SettingOutlined, WarningOutlined, MessageOutlined, CheckCircleOutlined } from '@ant-design/icons';

const { Text } = Typography;

const MCResponseRework = ({ productionStats, latestHelpReply, cardHeight, onReportIssue }) => {
  const hasRework = productionStats?.hasRework;
  const hasMCReply = !!latestHelpReply;

  return (
    <Card
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MessageOutlined style={{ color: '#1677FF' }} />
            <span>Response & Rework</span>
          </div>
          <Button
            type="link"
            danger
            style={{ padding: 0, height: 'auto', fontSize: 13 }}
            onClick={onReportIssue}
          >
            <WarningOutlined /> Report Issue
          </Button>
        </div>
      }
      style={{ borderRadius: 16, height: cardHeight, display: 'flex', flexDirection: 'column' }}
      headStyle={{ borderRadius: '16px 16px 0 0', padding: '10px 16px', minHeight: 'unset' }}
      bodyStyle={{ padding: 12, display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
    >
      {/* Side-by-side layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, height: '100%' }}>

        {/* LEFT: Rework Panel */}
        {hasRework ? (
          <div style={{
            background: '#FFF7F0',
            borderRadius: 10,
            padding: 12,
            border: '1px solid #FFBB96',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <WarningOutlined style={{ color: '#FA8C16', fontSize: 14 }} />
              <Text strong style={{ color: '#FA8C16', fontSize: 12 }}>Rework Required</Text>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { label: 'Produced', value: productionStats.latestProduced || 0, color: '#52C41A' },
                { label: 'Approved', value: productionStats.latestApproved || 0, color: '#52C41A' },
                { label: 'Rework',   value: productionStats.latestRework   || 0, color: '#FA8C16' },
                { label: 'Rejected', value: productionStats.latestRejected || 0, color: '#FF4D4F' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: 'rgba(255,255,255,0.6)', borderRadius: 8, padding: '6px 10px' }}>
                  <Text style={{ color: '#94a3b8', fontSize: 11, display: 'block' }}>{label}</Text>
                  <div style={{ fontWeight: 700, color, fontSize: 20, lineHeight: 1.2 }}>{value}</div>
                </div>
              ))}
            </div>

            {productionStats.latestRemarks && (
              <div style={{
                background: 'rgba(255,255,255,0.5)',
                borderRadius: 6,
                padding: '6px 8px',
                border: '1px solid #FFD8A8',
              }}>
                <Text style={{ color: '#94a3b8', fontSize: 10, display: 'block' }}>Remarks</Text>
                <Text style={{ color: '#8C4A00', fontSize: 12, fontWeight: 600 }}>
                  {productionStats.latestRemarks}
                </Text>
              </div>
            )}
          </div>
        ) : (
          <div style={{
            background: '#F6FFED',
            borderRadius: 10,
            padding: 12,
            border: '1px solid #B7EB8F',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}>
            <CheckCircleOutlined style={{ color: '#52C41A', fontSize: 24 }} />
            <Text style={{ color: '#389E0D', fontSize: 13, fontWeight: 600 }}>No Rework Pending</Text>
          </div>
        )}

        {/* RIGHT: MC Response Panel */}
        {hasMCReply ? (
          <div style={{
            background: '#F6FFED',
            borderRadius: 10,
            padding: 12,
            border: '1px solid #B7EB8F',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                background: '#52C41A',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <SettingOutlined style={{ color: 'white', fontSize: 12 }} />
              </div>
              <Text strong style={{ color: '#389E0D', fontSize: 13 }}>MC Response</Text>
              {latestHelpReply.replied_at && (
                <Text type="secondary" style={{ fontSize: 11, marginLeft: 'auto' }}>
                  {new Date(latestHelpReply.replied_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              )}
            </div>

            <div style={{
              background: 'white',
              borderRadius: 8,
              padding: '8px 10px',
              border: '1px solid #D9F7BE',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              overflow: 'auto',
              maxHeight: '100%',
            }}>
              {latestHelpReply.description && (
                <div>
                  <Text style={{ color: '#94a3b8', fontSize: 11, display: 'block', marginBottom: 2 }}>
                    Operator Request
                  </Text>
                  <div style={{
                    fontSize: 12, fontStyle: 'italic', color: '#595959',
                    paddingLeft: 8, borderLeft: '3px solid #f0f0f0',
                    wordBreak: 'break-word',
                  }}>
                    "{latestHelpReply.description}"
                  </div>
                </div>
              )}
              <div>
                <Text style={{ color: '#94a3b8', fontSize: 11, display: 'block', marginBottom: 2 }}>
                  MC Response
                </Text>
                <div style={{
                  fontSize: 13, fontWeight: 600, color: '#237804',
                  paddingLeft: 8, borderLeft: '3px solid #52C41A',
                  wordBreak: 'break-word',
                }}>
                  "{latestHelpReply.mc_reply}"
                </div>
              </div>
              <Text type="secondary" style={{ fontSize: 11, textAlign: 'right', marginTop: 'auto' }}>
                — {latestHelpReply.replied_by_name || 'Manufacturing Coordinator'}
              </Text>
            </div>
          </div>
        ) : (
          <div style={{
            background: '#f0f7ff',
            borderRadius: 10,
            padding: 12,
            border: '1px solid #d4e8ff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Text type="secondary" style={{ fontSize: 13 }}>No MC Responses yet</Text>
          </div>
        )}

      </div>
    </Card>
  );
};

export default MCResponseRework;