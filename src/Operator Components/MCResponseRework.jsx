import React from 'react';
import { Card, Typography, Space, Empty } from 'antd';
import { SettingOutlined, WarningOutlined, MessageOutlined } from '@ant-design/icons';

const { Text } = Typography;

const MCResponseRework = ({ productionStats, latestHelpReply, cardHeight }) => {
  const hasRework = productionStats?.hasRework;
  const hasMCReply = !!latestHelpReply;

  return (
    <Card
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Space>
            <MessageOutlined style={{ color: '#1677FF' }} />
            <span>Response & Rework</span>
          </Space>
        </div>
      }
      style={{ borderRadius: '16px', height: cardHeight, display: 'flex', flexDirection: 'column' }}
      headStyle={{ borderRadius: '16px 16px 0 0' }}
      bodyStyle={{ padding: 16, display: 'flex', flexDirection: 'column', flex: 1, overflow: 'auto' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Rework Information */}
        {hasRework ? (
          <div style={{ 
            background: '#FFF2E8', 
            borderRadius: 12, 
            padding: 16, 
            border: '1px solid #FFBB96'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <WarningOutlined style={{ color: '#FA8C16', fontSize: 18 }} />
              <Text strong style={{ color: '#FA8C16', fontSize: 16 }}>Rework Required (Latest Submitted Log)</Text>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 12 }}>
              <div>
                <Text style={{ color: '#64748b', fontSize: 12, display: 'block' }}>Produced Quantity</Text>
                <div style={{ marginTop: 4, fontWeight: 700, color: '#52C41A', fontSize: 18 }}>
                  {productionStats.latestProduced || 0}
                </div>
              </div>
              <div>
                <Text style={{ color: '#64748b', fontSize: 12, display: 'block' }}>Rework Quantity</Text>
                <div style={{ marginTop: 4, fontWeight: 700, color: '#FA8C16', fontSize: 18 }}>
                  {productionStats.latestRework || 0}
                </div>
              </div>
            </div>
            <div>
              <Text style={{ color: '#64748b', fontSize: 12, display: 'block' }}>Remarks</Text>
              <div style={{ 
                marginTop: 4, 
                fontWeight: 600, 
                color: '#8C4A00', 
                fontSize: 14,
                wordBreak: 'break-word',
                background: 'rgba(255, 255, 255, 0.5)',
                padding: '8px 12px',
                borderRadius: 8
              }}>
                {productionStats.reworkRemarks || 'No remarks'}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ 
            background: '#F6FFED', 
            borderRadius: 12, 
            padding: 16, 
            border: '1px solid #B7EB8F',
            textAlign: 'center'
          }}>
            <Text style={{ color: '#389E0D' }}>No Rework Pending</Text>
          </div>
        )}

        {/* MC Reply Information */}
        {hasMCReply ? (
          <div style={{ 
            background: '#F6FFED', 
            borderRadius: 12, 
            padding: 16, 
            border: '1px solid #B7EB8F'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ 
                width: 28, 
                height: 28, 
                borderRadius: '50%', 
                background: '#52C41A', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center' 
              }}>
                <SettingOutlined style={{ color: 'white', fontSize: 16 }} />
              </div>
              <Text strong style={{ color: '#389E0D', fontSize: 16 }}>MC Response</Text>
              {latestHelpReply.replied_at && (
                <Text type="secondary" style={{ fontSize: 12, marginLeft: 'auto' }}>
                  {new Date(latestHelpReply.replied_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              )}
            </div>
            <div style={{ 
              background: 'white', 
              borderRadius: 8, 
              padding: '12px', 
              border: '1px solid #D9F7BE'
            }}>
              {latestHelpReply.description && (
                <div style={{ marginBottom: 10 }}>
                  <Text style={{ color: '#595959', fontSize: 13, display: 'block' }}>
                    <strong>Operator Request:</strong>
                    <div style={{ marginTop: 4, fontStyle: 'italic', paddingLeft: 8, borderLeft: '3px solid #f0f0f0' }}>
                      "{latestHelpReply.description}"
                    </div>
                  </Text>
                </div>
              )}
              <div style={{ marginBottom: 4 }}>
                <Text style={{ color: '#237804', fontSize: 14, display: 'block' }}>
                  <strong>MC Response:</strong>
                  <div style={{ marginTop: 4, fontWeight: 600, paddingLeft: 8, borderLeft: '3px solid #52C41A' }}>
                    "{latestHelpReply.mc_reply}"
                  </div>
                </Text>
              </div>
              <div style={{ marginTop: 8, textAlign: 'right' }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  — {latestHelpReply.replied_by_name || 'Manufacturing Coordinator'}
                </Text>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ 
            background: '#f0f7ff', 
            borderRadius: 12, 
            padding: 16, 
            border: '1px solid #d4e8ff',
            textAlign: 'center'
          }}>
            <Text type="secondary">No MC Responses yet</Text>
          </div>
        )}

        {!hasRework && !hasMCReply && (
          <Empty description="No updates available" style={{ marginTop: 40 }} />
        )}
      </div>
    </Card>
  );
};

export default MCResponseRework;
