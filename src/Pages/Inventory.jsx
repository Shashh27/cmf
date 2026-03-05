import React, { useState } from 'react';
import { Tabs, message, Card, Typography } from 'antd';
import { DatabaseOutlined } from '@ant-design/icons';
import { ToolsList, InstrumentsList, ToolForm } from '../Inventory Components/InventoryMaster';
import { API_BASE_URL } from '../Config/auth.js';

const { TabPane } = Tabs;
const { Title, Text } = Typography;

const Inventory = () => {
  const [toolFormVisible, setToolFormVisible] = useState(false);
  const [editingTool, setEditingTool] = useState(null);
  const [toolsListRefresh, setToolsListRefresh] = useState(0);

  const refreshToolsList = () => {
    setToolsListRefresh(prev => prev + 1);
  };

  const handleEditTool = (tool) => {
    setEditingTool(tool);
    setToolFormVisible(true);
  };

  const handleDeleteTool = async (tool) => {
    try {
      const response = await fetch(`${API_BASE_URL}/tools-list/${tool.id}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to delete tool');
      }
      
      message.success('Tool deleted successfully');
      refreshToolsList();
    } catch (error) {
      console.error('Failed to delete tool:', error);
      message.error('Failed to delete tool: ' + error.message);
    }
  };

  const handleCreateTool = () => {
    setEditingTool(null);
    setToolFormVisible(true);
  };

  const handleToolFormSubmit = (values) => {
    setToolFormVisible(false);
    setEditingTool(null);
    refreshToolsList();
    message.success('Tool operation completed successfully');
  };

  const handleToolFormCancel = () => {
    setToolFormVisible(false);
    setEditingTool(null);
  };

  const handleEditInstrument = (instrument) => {
    message.info(`Edit instrument: ${instrument.instrument_name || 'Unknown'}`);
    // TODO: Implement edit functionality
  };

  const handleDeleteInstrument = (instrument) => {
    message.info(`Delete instrument: ${instrument.instrument_name || 'Unknown'}`);
    // TODO: Implement delete functionality
  };

  const handleCreateInstrument = () => {
    message.info('Create new instrument');
    // TODO: Implement create new instrument functionality
  };

  return (
    <div style={{ padding: '16px' }}>
      {/* Header Card */}
      <Card 
        bordered={false} 
        style={{ 
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
          marginBottom: '16px'
        }}
        bodyStyle={{ padding: '16px 24px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <DatabaseOutlined style={{ fontSize: '28px', color: '#1890ff' }} />
          <div>
            <Title level={3} style={{ margin: 0, fontSize: '22px', fontWeight: 600, color: '#1a1a1a' }}>
              Inventory Master
            </Title>
            <Text type="secondary" style={{ fontSize: '14px', marginTop: '2px', display: 'block' }}>
              Manage and track all tools, instruments, and inventory items in your facility
            </Text>
          </div>
        </div>
      </Card>
      
      <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <Tabs defaultActiveKey="tools" destroyInactiveTabPane={false}>
          <TabPane tab="Tools" key="tools">
            <ToolsList
              key={toolsListRefresh}
              onEdit={handleEditTool}
              onDelete={handleDeleteTool}
              onCreateNew={handleCreateTool}
            />
          </TabPane>
          
          <TabPane tab="Instruments" key="instruments">
            <InstrumentsList
              onEdit={handleEditInstrument}
              onDelete={handleDeleteInstrument}
              onCreateNew={handleCreateInstrument}
            />
          </TabPane>
        </Tabs>
      </div>

      <ToolForm
        visible={toolFormVisible}
        onCancel={handleToolFormCancel}
        onSubmit={handleToolFormSubmit}
        editingTool={editingTool}
      />
    </div>
  );
};

export default Inventory;
