import React, { useState } from 'react';
import { Tabs, message, Card, Typography } from 'antd';
import { DatabaseOutlined } from '@ant-design/icons';
import { ToolsList, ToolForm } from '../InventorySupervisor Components/Inventory/InventoryMaster';
import { API_BASE_URL } from '../Config/auth.js';

const { Title, Text } = Typography;

const Inventory = () => {
  const [toolFormVisible, setToolFormVisible] = useState(false);
  const [editingTool, setEditingTool] = useState(null);
  const [toolsListRefresh, setToolsListRefresh] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState(null);

  const refreshToolsList = () => {
    setToolsListRefresh(prev => prev + 1);
  };

  const handleEditTool = (tool) => {
    // Merge the tool data with any existing context if needed,
    // though the tool record already contains its category/sub_category.
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

  const handleCreateTool = (context) => {
    if (context) {
      setEditingTool({
        item_description: context.item_description || '',
        category: context.category || '',
        sub_category: context.sub_category || '',
      });
      setSelectedCategory(context.category || null);
      setSelectedSubCategory(context.sub_category || null);
    } else {
      setEditingTool(null);
      setSelectedCategory(null);
      setSelectedSubCategory(null);
    }
    setToolFormVisible(true);
  };

  const handleToolFormSubmit = (values) => {
    setToolFormVisible(false);
    setEditingTool(null);
    setSelectedCategory(null);
    setSelectedSubCategory(null);
    refreshToolsList();
  };

  const handleToolFormCancel = () => {
    setToolFormVisible(false);
    setEditingTool(null);
    setSelectedCategory(null);
    setSelectedSubCategory(null);
  };

  return (
    <>
      <ToolsList
        key={toolsListRefresh}
        onEdit={handleEditTool}
        onDelete={handleDeleteTool}
        onCreateNew={handleCreateTool}
      />
      <ToolForm
        visible={toolFormVisible}
        onCancel={handleToolFormCancel}
        onSubmit={handleToolFormSubmit}
        editingTool={editingTool}
        selectedCategory={selectedCategory}
        selectedSubCategory={selectedSubCategory}
      />
    </>
  );
};

export default Inventory;
