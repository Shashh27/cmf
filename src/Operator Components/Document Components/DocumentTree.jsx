import React, { useState, useEffect } from 'react';
import { Tree, Spin, message } from 'antd';
import { FolderOutlined, FileOutlined,DesktopOutlined } from '@ant-design/icons';
import { API_BASE_URL } from "../../Config/auth";

const OperatorDocumentTree = ({ onNodeSelect }) => {
  const [loading, setLoading] = useState(false);
  const [treeData, setTreeData] = useState([]);
  const [expandedKeys, setExpandedKeys] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState([]);

  useEffect(() => {
    fetchTreeData();
  }, []);

  const getSelectedMachineInfo = () => {
    const selectedMachineRaw = localStorage.getItem('selectedMachine');
    if (!selectedMachineRaw) return { id: null, label: null };
    try {
      const m = JSON.parse(selectedMachineRaw);
      if (!m || m.id == null) return { id: null, label: null };

      const idNum = Number(m.id);
      const id = Number.isNaN(idNum) ? null : idNum;

      let label = null;
      if (m.machine_name) {
        label = m.machine_name;
      } else if (m.make) {
        label = m.model ? `${m.make} - ${m.model}` : m.make;
      } else if (m.type) {
        label = m.model ? `${m.type} - ${m.model}` : m.type;
      }

      if (!label && id != null) {
        label = `Machine ${id}`;
      }

      return { id, label };
    } catch {
      return { id: null, label: null };
    }
  };

  const fetchTreeData = async () => {
    try {
      setLoading(true);

      let machineId = null;
      let machineLabel = null;

      // Preferred: selectedMachine object saved during operator login
      const selectedInfo = getSelectedMachineInfo();
      if (selectedInfo.id != null) {
        machineId = selectedInfo.id;
        machineLabel = selectedInfo.label || `Machine ${selectedInfo.id}`;
      } else {
        // Fallback: direct machine_id
        const storedMachineId = localStorage.getItem('machine_id');
        if (storedMachineId) {
          const num = Number(storedMachineId);
          if (!Number.isNaN(num)) {
            machineId = num;
            machineLabel = `Machine ${num}`;
          }
        }
      }

      const baseUrl = `http://${API_BASE_URL.replace('http://', '').replace('api/v1', '')}`;

      const requests = [];
      if (machineId != null) {
        requests.push(fetch(`${baseUrl}machine-documents/machines/${machineId}/folders`));
      } else {
        requests.push(Promise.resolve(null));
      }
      requests.push(fetch(`${baseUrl}common-documents/folders/tree`));

      const [machineFoldersRes, commonFoldersRes] = await Promise.all(requests);

      let machineFolders = [];
      if (machineFoldersRes) {
        if (!machineFoldersRes.ok) {
          throw new Error('Failed to fetch machine folders');
        }
        machineFolders = await machineFoldersRes.json();
      }

      if (!commonFoldersRes.ok) {
        throw new Error('Failed to fetch common folders');
      }
      const commonFolders = await commonFoldersRes.json();

      const nodes = [];

      if (machineId != null) {
        const machineNode = {
          title: (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <DesktopOutlined style={{ color: '#52c41a' }} />
              <span style={{ fontWeight: 600 }}>Machine Documents</span>
            </span>
          ),
          key: 'machines-root',
          selectable: false,
          children: [
            {
              title: (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <FolderOutlined style={{ color: '#52c41a' }} />
                  <span style={{ fontWeight: 500 }}>{machineLabel}</span>
                </span>
              ),
              key: `machine-${machineId}`,
              selectable: true,
              isLeaf: false,
              nodeData: {
                type: 'machine',
                machineId,
                machineName: machineLabel
              },
              children: buildMachineFolderTree(machineFolders, machineId, machineLabel)
            }
          ]
        };
        nodes.push(machineNode);
      }

      const commonNode = {
        title: (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <FolderOutlined style={{ color: '#eb2f96' }} />
            <span style={{ fontWeight: 600 }}>Common Folders</span>
          </span>
        ),
        key: 'common-root',
        selectable: true,
        isLeaf: false,
        nodeData: {
          type: 'common-root'
        },
        children: buildCommonFolderTree(commonFolders)
      };
      nodes.push(commonNode);

      setTreeData(nodes);

      const expKeys = ['common-root'];
      if (machineId != null) {
        expKeys.push('machines-root', `machine-${machineId}`);
      }
      setExpandedKeys(expKeys);
    } catch (error) {
      message.error(error.message || 'Failed to load document tree');
      setTreeData([]);
    } finally {
      setLoading(false);
    }
  };

  const buildMachineFolderTree = (folders, machineId, machineLabel) => {
    if (!Array.isArray(folders)) return [];

    const buildNodes = (items, parentId = null) => {
      return items
        .filter(f => f.parent_id === parentId)
        .map(f => ({
          title: (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <FolderOutlined style={{ color: '#52c41a' }} />
                <span style={{ fontWeight: 500 }}>{f.folder_name}</span>
              </span>
            </div>
          ),
          key: `machine-folder-${f.id}`,
          selectable: true,
          isLeaf: false,
          nodeData: {
            type: 'machine-folder',
            folderId: f.id,
            folderName: f.folder_name,
            machineId,
            machineName: machineLabel || `Machine ${machineId}`
          },
          children: buildNodes(items, f.id)
        }));
    };

    return buildNodes(folders, null);
  };

  const buildCommonFolderTree = (folders) => {
    if (!Array.isArray(folders)) return [];

    const buildNodes = (items, parentId = null) => {
      return items
        .filter(f => f.parent_id === parentId)
        .map(f => ({
          title: (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <FolderOutlined style={{ color: '#eb2f96' }} />
              <span style={{ fontWeight: 500 }}>{f.folder_name}</span>
              {typeof f.document_count === 'number' && f.document_count > 0 && (
                <span style={{ fontSize: 11, color: '#999' }}>({f.document_count})</span>
              )}
            </span>
          ),
          key: `common-folder-${f.id}`,
          selectable: true,
          isLeaf: false,
          nodeData: {
            type: 'common-folder',
            folderId: f.id,
            folderName: f.folder_name
          },
          children: buildNodes(items, f.id)
        }));
    };

    return buildNodes(folders, null);
  };

  const handleSelect = (keys, info) => {
    setSelectedKeys(keys);
    const nodeData = info.node.nodeData;
    if (onNodeSelect && nodeData) {
      onNodeSelect(nodeData);
    }
  };

  return (
    <div 
      style={{ 
        padding: 8,
        height: '100%',
        overflow: 'auto'
      }}
    >
      <style>
        {`
          .operator-tree-scroll::-webkit-scrollbar {
            width: 8px;
          }
          .operator-tree-scroll::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 4px;
          }
          .operator-tree-scroll::-webkit-scrollbar-thumb {
            background: #c1c1c1;
            border-radius: 4px;
          }
          .operator-tree-scroll::-webkit-scrollbar-thumb:hover {
            background: #a8a8a8;
          }
        `}
      </style>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
          <Spin />
        </div>
      ) : (
        <div className="operator-tree-scroll" style={{ maxHeight: '100%', overflow: 'auto' }}>
          <Tree
            showIcon
            selectable
            onSelect={handleSelect}
            treeData={treeData}
            expandedKeys={expandedKeys}
            onExpand={setExpandedKeys}
            selectedKeys={selectedKeys}
            showLine={false}
            style={{
              background: 'transparent',
              fontSize: 16,
              minWidth: 'max-content'
            }}
          />
        </div>
      )}
    </div>
  );
};

export default OperatorDocumentTree;

