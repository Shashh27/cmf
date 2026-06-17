import React, { useState, useEffect } from "react";
import { Modal, Tabs, Button, Checkbox, Input, Spin, Empty, Tag, message, Tooltip, Popconfirm, Select, Collapse } from "antd";
import { UnorderedListOutlined, PlusCircleOutlined, CheckSquareOutlined, DeleteOutlined, PlusOutlined, EditOutlined, DownOutlined, RightOutlined } from "@ant-design/icons";
import axios from "axios";
import { API_BASE_URL } from "../../Config/auth";

const { Search } = Input;

const OperationChecklistsModal = ({ visible, onClose, operation }) => {
  const [allChecklists, setAllChecklists] = useState([]);
  const [assignedChecklistIds, setAssignedChecklistIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [newChecklistName, setNewChecklistName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createType, setCreateType] = useState('general');
  const [editingChecklist, setEditingChecklist] = useState(null);
  const [editChecklistName, setEditChecklistName] = useState('');
  const [showEditForm, setShowEditForm] = useState(false);
  const [selectedForAssign, setSelectedForAssign] = useState([]);
  const [activeCollapseKeys, setActiveCollapseKeys] = useState([]);
  const [selectAllGeneral, setSelectAllGeneral] = useState(false);
  const [selectAllCustom, setSelectAllCustom] = useState(false);

  const getCurrentUserId = () => {
    try {
      const stored = localStorage.getItem("user");
      if (!stored) return null;
      const u = JSON.parse(stored);
      if (u?.id == null) return null;
      return u.id;
    } catch {
      return null;
    }
  };

  const fetchChecklists = async () => {
    if (!operation) return;
    setLoading(true);
    try {
      const [checklistsRes, assignedRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/operation-checklists`),
        axios.get(`${API_BASE_URL}/operation-checklists/assignments?operation_id=${operation.id}`)
      ]);
      setAllChecklists(checklistsRes.data);
      setAssignedChecklistIds(assignedRes.data.map(a => a.checklist_id));
      setSelectedForAssign(assignedRes.data.map(a => a.checklist_id));
    } catch (e) {
      console.error(e);
      message.error('Failed to fetch checklists');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible && operation) {
      fetchChecklists();
    }
  }, [visible, operation]);

  const handleCreateChecklist = async () => {
    if (!newChecklistName.trim()) { message.warning('Please enter a checklist name'); return; }
    const userId = getCurrentUserId();
    if (!userId) { message.error('User not authenticated'); return; }
    
    try {
      await axios.post(`${API_BASE_URL}/operation-checklists`, {
        name: newChecklistName,
        type: createType,
        created_by: userId
      });
      message.success('Checklist created successfully');
      setNewChecklistName('');
      setShowCreateForm(false);
      await fetchChecklists();
    } catch (e) {
      console.error(e);
      message.error('Failed to create checklist');
    }
  };

  const handleEditChecklist = async () => {
    if (!editChecklistName.trim()) { message.warning('Please enter a checklist name'); return; }
    if (!editingChecklist) return;
    
    try {
      await axios.put(`${API_BASE_URL}/operation-checklists/${editingChecklist.id}`, {
        name: editChecklistName
      });
      message.success('Checklist updated successfully');
      setEditChecklistName('');
      setEditingChecklist(null);
      setShowEditForm(false);
      await fetchChecklists();
    } catch (e) {
      console.error(e);
      message.error('Failed to update checklist');
    }
  };

  const handleDeleteChecklist = async (checklistId) => {
    try {
      await axios.delete(`${API_BASE_URL}/operation-checklists/${checklistId}`);
      message.success('Checklist deleted successfully');
      await fetchChecklists();
    } catch (e) {
      console.error(e);
      message.error('Failed to delete checklist');
    }
  };

  const openEditForm = (checklist) => {
    setEditingChecklist(checklist);
    setEditChecklistName(checklist.name);
    setShowEditForm(true);
  };

  const handleBulkAssign = async () => {
    if (selectedForAssign.length === 0) {
      message.warning('Please select at least one checklist');
      return;
    }
    const userId = getCurrentUserId();
    if (!userId) { message.error('User not authenticated'); return; }
    
    try {
      await axios.post(`${API_BASE_URL}/operation-checklists/assignments/bulk`, {
        operation_id: operation.id,
        checklist_ids: selectedForAssign,
        assigned_by: userId
      });
      message.success('Checklists assigned successfully');
      await fetchChecklists();
    } catch (e) {
      console.error(e);
      message.error('Failed to assign checklists');
    }
  };

  const handleSelectAllGeneral = (checked) => {
    setSelectAllGeneral(checked);
    const generalIds = filterChecklists(allChecklists, 'general').map(c => c.id);
    if (checked) {
      setSelectedForAssign([...new Set([...selectedForAssign, ...generalIds])]);
    } else {
      setSelectedForAssign(selectedForAssign.filter(id => !generalIds.includes(id)));
    }
  };

  const handleSelectAllCustom = (checked) => {
    setSelectAllCustom(checked);
    const customIds = filterChecklists(allChecklists, 'custom').map(c => c.id);
    if (checked) {
      setSelectedForAssign([...new Set([...selectedForAssign, ...customIds])]);
    } else {
      setSelectedForAssign(selectedForAssign.filter(id => !customIds.includes(id)));
    }
  };

  const filterChecklists = (checklists, type) => {
    let filtered = checklists.filter(c => c.type === type);
    if (!searchText) return filtered;
    return filtered.filter(c => 
      c.name.toLowerCase().includes(searchText.toLowerCase())
    );
  };

  const renderAssignList = (type) => {
    const filtered = filterChecklists(allChecklists, type);
    if (filtered.length === 0) {
      return <Empty description={`No ${type} checklists found`} className="py-4 text-sm" />;
    }

    return filtered.map(checklist => (
      <div 
        key={checklist.id} 
        className="flex items-center p-3 border-b border-gray-100 hover:bg-gray-50 transition-all"
      >
        <Checkbox 
          checked={selectedForAssign.includes(checklist.id)}
          onChange={(e) => {
            if (e.target.checked) {
              setSelectedForAssign([...selectedForAssign, checklist.id]);
            } else {
              setSelectedForAssign(selectedForAssign.filter(id => id !== checklist.id));
            }
          }}
          className="mr-3"
        />
        <span className="flex-1 text-sm text-gray-700">{checklist.name}</span>
        {assignedChecklistIds.includes(checklist.id) && (
          <Tag color="green" className="text-xs">Assigned</Tag>
        )}
      </div>
    ));
  };

  const renderManageList = (type) => {
    const filtered = filterChecklists(allChecklists, type);
    if (filtered.length === 0) {
      return <Empty description={`No ${type} checklists found`} className="py-4 text-sm" />;
    }

    return filtered.map(checklist => (
      <div key={checklist.id} className="flex items-center justify-between p-2 mb-1 hover:bg-gray-50 transition-all">
        <span className="text-sm text-gray-800">{checklist.name}</span>
        <div className="flex gap-1">
          <Tooltip title="Edit">
            <Button 
              size="small" 
              icon={<EditOutlined />}
              onClick={() => openEditForm(checklist)}
              className="text-blue-500"
            />
          </Tooltip>
          <Popconfirm 
            title="Delete this checklist?"
            onConfirm={() => handleDeleteChecklist(checklist.id)}
            okText="Yes"
            cancelText="No"
          >
            <Tooltip title="Delete">
              <Button 
                size="small" 
                danger 
                icon={<DeleteOutlined />}
              />
            </Tooltip>
          </Popconfirm>
        </div>
      </div>
    ));
  };

  const tabItems = [
    {
      key: 'assign',
      label: (
        <span className="flex items-center gap-1">
          <CheckSquareOutlined />
          <span className="text-sm font-medium">Assign Checklists</span>
        </span>
      ),
      children: (
        <div className="flex gap-4 max-h-[500px]">
          {loading ? <div className="flex justify-center py-8 w-full"><Spin /></div> : (
            <>
              <div className="flex-1 overflow-y-auto">
                <Collapse
                  activeKey={activeCollapseKeys}
                  onChange={setActiveCollapseKeys}
                  className="bg-white"
                  items={[
                    {
                      key: 'general',
                      label: (
                        <div className="flex items-center justify-between w-full pr-4">
                          <span className="flex items-center gap-2">
                            <UnorderedListOutlined />
                            <span className="font-medium">General Checklists</span>
                            <span className="text-xs text-gray-400">({filterChecklists(allChecklists, 'general').length})</span>
                          </span>
                          <Checkbox 
                            checked={selectAllGeneral}
                            onChange={(e) => handleSelectAllGeneral(e.target.checked)}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="text-xs">Select All</span>
                          </Checkbox>
                        </div>
                      ),
                      children: renderAssignList('general')
                    },
                    {
                      key: 'custom',
                      label: (
                        <div className="flex items-center justify-between w-full pr-4">
                          <span className="flex items-center gap-2">
                            <PlusCircleOutlined />
                            <span className="font-medium">Custom Checklists</span>
                            <span className="text-xs text-gray-400">({filterChecklists(allChecklists, 'custom').length})</span>
                          </span>
                          <Checkbox 
                            checked={selectAllCustom}
                            onChange={(e) => handleSelectAllCustom(e.target.checked)}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="text-xs">Select All</span>
                          </Checkbox>
                        </div>
                      ),
                      children: renderAssignList('custom')
                    }
                  ]}
                />
              </div>
              
              <div className="w-80 flex-shrink-0">
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 max-h-[500px] flex flex-col">
                  <p className="text-sm text-gray-600 mb-3 font-medium">Selected checklists:</p>
                  <div className="flex flex-wrap gap-2 mb-3 flex-1 overflow-y-auto">
                    {selectedForAssign.length === 0 ? (
                      <span className="text-sm text-gray-400 italic">No checklists selected</span>
                    ) : (
                      selectedForAssign.map(id => {
                        const checklist = allChecklists.find(c => c.id === id);
                        return checklist ? (
                          <Tag 
                            key={id} 
                            closable 
                            onClose={() => setSelectedForAssign(selectedForAssign.filter(i => i !== id))}
                            color="blue"
                            className="text-sm px-3 py-1"
                          >
                            {checklist.name}
                          </Tag>
                        ) : null;
                      })
                    )}
                  </div>
                  <Button 
                    type="primary" 
                    onClick={handleBulkAssign}
                    disabled={selectedForAssign.length === 0}
                    size="small"
                  >
                    Submit ({selectedForAssign.length})
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )
    },
    {
      key: 'manage',
      label: (
        <span className="flex items-center gap-1">
          <UnorderedListOutlined />
          <span className="text-sm font-medium">Manage Checklists</span>
        </span>
      ),
      children: (
        <div className="max-h-[500px] overflow-y-auto">
          {loading ? <div className="flex justify-center py-8"><Spin /></div> : (
            <>
              <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex gap-2 items-center">
                  <Select
                    value={createType}
                    onChange={setCreateType}
                    className="w-32"
                    size="middle"
                  >
                    <Select.Option value="general">General</Select.Option>
                    <Select.Option value="custom">Custom</Select.Option>
                  </Select>
                  <Input 
                    placeholder="Enter checklist name"
                    value={newChecklistName}
                    onChange={e => setNewChecklistName(e.target.value)}
                    onPressEnter={handleCreateChecklist}
                    maxLength={20}
                    className="flex-1"
                    size="middle"
                  />
                  <Button type="primary" onClick={handleCreateChecklist} size="middle">
                    <PlusOutlined />
                  </Button>
                  <Search 
                    placeholder="Search..." 
                    allowClear
                    onChange={e => setSearchText(e.target.value)}
                    size="middle"
                    className="w-48"
                  />
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-200">
                    <UnorderedListOutlined />
                    <span className="font-medium">General Checklists</span>
                    <span className="text-xs text-gray-400">({filterChecklists(allChecklists, 'general').length})</span>
                  </div>
                  <div className="max-h-[400px] overflow-y-auto">
                    {renderManageList('general')}
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-200">
                    <PlusCircleOutlined />
                    <span className="font-medium">Custom Checklists</span>
                    <span className="text-xs text-gray-400">({filterChecklists(allChecklists, 'custom').length})</span>
                  </div>
                  <div className="max-h-[400px] overflow-y-auto">
                    {renderManageList('custom')}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )
    }
  ];

  return (
    <Modal
      title={
        <div className="flex items-center gap-2">
          <UnorderedListOutlined />
          <span className="text-sm">Checklists</span>
          {operation && (
            <span className="text-xs text-gray-500">
              - {operation.operation_name}
            </span>
          )}
        </div>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={900}
    >
      {showEditForm && (
        <div className="mb-3 p-3 bg-yellow-50 rounded border border-yellow-200">
          <p className="text-xs font-semibold text-gray-600 mb-2">Edit Checklist</p>
          <Input 
            size="small"
            placeholder="Enter checklist name"
            value={editChecklistName}
            onChange={e => setEditChecklistName(e.target.value)}
            onPressEnter={handleEditChecklist}
            className="mb-2"
          />
          <div className="flex gap-2">
            <Button size="small" type="primary" onClick={handleEditChecklist}>Save</Button>
            <Button size="small" onClick={() => { setShowEditForm(false); setEditingChecklist(null); setEditChecklistName(''); }}>Cancel</Button>
          </div>
        </div>
      )}
      <Tabs items={tabItems} defaultActiveKey="assign" size="middle" />
    </Modal>
  );
};

export default OperationChecklistsModal;
