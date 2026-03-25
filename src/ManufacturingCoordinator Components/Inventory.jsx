import React, { useState } from 'react';
import { Tabs, message, Card, Typography } from 'antd';
import { DatabaseOutlined } from '@ant-design/icons';
import { ToolsList, ToolForm } from '../InventorySupervisor Components/Inventory/InventoryMaster';
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
    <div style={{ padding: '10px' }}>
      <div style={{ background: '#fff', padding: '8px 12px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <style>{`
          .ant-tabs-nav { 
            margin: 0 0 10px 0 !important; 
          }
          .ant-tabs-tab {
            padding: 6px 10px !important;
            margin: 0 !important;
          }
          .ant-tabs-ink-bar {
            height: 2px !important;
          }
        `}</style>
        <Tabs 
          defaultActiveKey="tools" 
          destroyInactiveTabPane={false}
          tabBarStyle={{ margin: 0 }}
          style={{ marginTop: 0 }}
        >
          <TabPane tab="Tools" key="tools">
            <ToolsList
              key={toolsListRefresh}
              onEdit={handleEditTool}
              onDelete={handleDeleteTool}
              onCreateNew={handleCreateTool}
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
