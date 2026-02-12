import React, { useState } from 'react';
import { Tabs, message } from 'antd';
import { ToolsList, InstrumentsList, ToolForm } from '../Inventory Components/InventoryMaster';

const { TabPane } = Tabs;

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
      const response = await fetch(`http://172.18.100.76:8000/api/v1/tools-list/${tool.id}`, {
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
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>Inventory Master</h1>
      </div>
      
      <Tabs defaultActiveKey="tools">
        <TabPane tab="Tools" key="tools">
          <div style={{ background: '#fff', padding: '24px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <ToolsList
              key={toolsListRefresh}
              onEdit={handleEditTool}
              onDelete={handleDeleteTool}
              onCreateNew={handleCreateTool}
            />
          </div>
        </TabPane>
        
        <TabPane tab="Instruments" key="instruments">
          <div style={{ background: '#fff', padding: '24px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <InstrumentsList
              onEdit={handleEditInstrument}
              onDelete={handleDeleteInstrument}
              onCreateNew={handleCreateInstrument}
            />
          </div>
        </TabPane>
      </Tabs>

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