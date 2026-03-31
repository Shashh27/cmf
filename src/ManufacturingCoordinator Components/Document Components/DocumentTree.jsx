import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Tree, Spin, message, Button, Modal, Input, Upload, Card } from 'antd';
import { FolderOutlined,  FileOutlined, CaretDownOutlined, CaretRightOutlined,ShoppingOutlined, AppstoreOutlined, PlusOutlined, FileAddOutlined, DeleteOutlined, UploadOutlined,ShoppingCartOutlined,DesktopOutlined} from '@ant-design/icons';
import config from '../Config/config';

const DocumentTree = forwardRef(({ onNodeSelect, isMobile = false, onDocumentsChange }, ref) => {
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [machines, setMachines] = useState([]);
  const [treeData, setTreeData] = useState([]);
  const [expandedKeys, setExpandedKeys] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [loadedParts, setLoadedParts] = useState({}); // Track which orders have parts loaded
  const [loadedAllParts, setLoadedAllParts] = useState(false); // Track if global parts list is loaded
  const [loadedOperations, setLoadedOperations] = useState({}); // Track which parts have operations loaded
  const [loadedMachineFolders, setLoadedMachineFolders] = useState({}); // Track which machines have folders loaded
  
  // General Documents statesss
  const [generalFolders, setGeneralFolders] = useState([]);
  const [commonFolders, setCommonFolders] = useState([]);
  const [newFolderModalVisible, setNewFolderModalVisible] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [parentFolderId, setParentFolderId] = useState(null);
  
  // Common Documents state
  const [commonNewFolderModalVisible, setCommonNewFolderModalVisible] = useState(false);
  const [commonNewFolderName, setCommonNewFolderName] = useState('');
  const [commonParentFolderId, setCommonParentFolderId] = useState(null);
  const [commonDeleteFolderModalVisible, setCommonDeleteFolderModalVisible] = useState(false);
  const [commonFolderToDelete, setCommonFolderToDelete] = useState(null);
  const [commonUploadModalVisible, setCommonUploadModalVisible] = useState(false);
  const [commonUploadFolderId, setCommonUploadFolderId] = useState(null);
  const [commonFileList, setCommonFileList] = useState([]);
  
  // Delete and Upload state
  const [deleteFolderModalVisible, setDeleteFolderModalVisible] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState(null);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [uploadFolderId, setUploadFolderId] = useState(null);
  const [fileList, setFileList] = useState([]);

  const [machineNewFolderModalVisible, setMachineNewFolderModalVisible] = useState(false);
  const [machineNewFolderName, setMachineNewFolderName] = useState('');
  const [machineParentFolderId, setMachineParentFolderId] = useState(null);
  const [machineParentMachineId, setMachineParentMachineId] = useState(null);
  const [machineDeleteFolderModalVisible, setMachineDeleteFolderModalVisible] = useState(false);
  const [machineFolderToDelete, setMachineFolderToDelete] = useState(null);
  const [machineUploadModalVisible, setMachineUploadModalVisible] = useState(false);
  const [machineUploadFolderId, setMachineUploadFolderId] = useState(null);
  const [machineUploadMachineId, setMachineUploadMachineId] = useState(null);
  const [machineFileList, setMachineFileList] = useState([]);
  const [commonRootDocumentCount, setCommonRootDocumentCount] = useState(0);

  // Fetch orders, parts and general folders on component mount
  useEffect(() => {
    fetchOrders();
    fetchGeneralFolders();
    fetchCommonFolders();
    fetchMachines();
  }, []);

  // Reinitialize tree data when general folders, common folders, orders, or machines change
  useEffect(() => {
    if (orders.length > 0 || machines.length > 0 || generalFolders.length > 0 || commonFolders.length > 0) {
      initializeTreeData(orders, machines);
    }
  }, [generalFolders, commonFolders, orders, machines]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${config.API_BASE_URL}/orders/`);
      if (!response.ok) {
        throw new Error('Failed to fetch orders');
      }
      const data = await response.json();
      setOrders(data);
      initializeTreeData(data, machines);
    } catch (error) {
      message.error('Failed to fetch orders: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchGeneralFolders = async () => {
    try {
      const response = await fetch(`http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}general-documents/folders/tree`);
      if (!response.ok) {
        throw new Error('Failed to fetch general folders');
      }
      const data = await response.json();
      setGeneralFolders(data);
    } catch (error) {
      message.error('Failed to fetch general folders: ' + error.message);
    }
  };

  const fetchCommonFolders = async () => {
    try {
      const baseUrl = `http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}`;
      const [foldersResponse, docsResponse] = await Promise.all([
        fetch(`${baseUrl}common-documents/folders/tree`),
        fetch(`${baseUrl}common-documents/all/documents`)
      ]);

      if (!foldersResponse.ok) {
        throw new Error('Failed to fetch common folders');
      }
      if (!docsResponse.ok) {
        throw new Error('Failed to fetch common documents');
      }

      const foldersData = await foldersResponse.json();
      const docsData = await docsResponse.json();

      setCommonFolders(foldersData);
      setCommonRootDocumentCount(Array.isArray(docsData) ? docsData.length : 0);
    } catch (error) {
      console.error('Error fetching common folders or documents:', error);
      message.error('Failed to fetch common folders: ' + error.message);
    }
  };

  const fetchMachines = async () => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/machines/?skip=0&limit=100`);
      if (!response.ok) {
        throw new Error('Failed to fetch machines');
      }
      const data = await response.json();
      setMachines(data || []);
    } catch (error) {
      message.error('Failed to fetch machines: ' + error.message);
    }
  };

  const fetchMachineFoldersByMachine = async (machineId) => {
    let resolvedMachineId = machineId;

    if (typeof resolvedMachineId === 'string') {
      const numericId = Number(resolvedMachineId);
      if (Number.isNaN(numericId)) {
        const match = resolvedMachineId.match(/(\d+)$/);
        if (match) {
          const folderId = Number(match[1]);
          let foundMachineId = null;

          const searchFolders = (nodes) => {
            for (const node of nodes) {
              if (node.nodeData && node.nodeData.type === 'machine-folder' && node.nodeData.folderId === folderId) {
                foundMachineId = node.nodeData.machineId;
                return true;
              }
              if (node.children && searchFolders(node.children)) {
                return true;
              }
            }
            return false;
          };

          searchFolders(treeData);

          if (foundMachineId) {
            resolvedMachineId = foundMachineId;
          }
        }
      } else {
        resolvedMachineId = numericId;
      }
    }

    const baseUrl = `http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}`;
    const response = await fetch(`${baseUrl}machine-documents/machines/${resolvedMachineId}/folders`);
    if (!response.ok) {
      throw new Error('Failed to fetch machine folders');
    }
    const data = await response.json();
    return data || [];
  };

  const buildPartNode = (part, orderId = null, operations = [], includeIPID = true) => {
    const children = [
      {
        title: (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <FolderOutlined style={{ color: '#722ed1' }} />
            <span>MPP</span>
          </span>
        ),
        titleText: 'MPP',
        key: `mpp-${part.id}${orderId ? `-${orderId}` : ''}`,
        isLeaf: true,
        selectable: true,
        nodeData: { type: 'part-category', category: 'MPP', partId: part.id, partName: part.part_name, orderId }
      },
      {
        title: (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <FolderOutlined style={{ color: '#722ed1' }} />
            <span>ENGINEERING_DRAWING</span>
          </span>
        ),
        titleText: 'ENGINEERING_DRAWING',
        key: `eng-${part.id}${orderId ? `-${orderId}` : ''}`,
        isLeaf: true,
        selectable: true,
        nodeData: { type: 'part-category', category: 'ENGINEERING_DRAWING', partId: part.id, partName: part.part_name, orderId }
      }
    ];

    if (includeIPID) {
      children.push({
        title: (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <FolderOutlined style={{ color: '#722ed1' }} />
            <span>IPID</span>
          </span>
        ),
        titleText: 'IPID',
        key: `ipid-${part.id}${orderId ? `-${orderId}` : ''}`,
        isLeaf: true,
        selectable: true,
        nodeData: { type: 'part-category', category: 'IPID', partId: part.id, partName: part.part_name, orderId }
      });
    }

    children.push(
      {
        title: (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <FolderOutlined style={{ color: '#722ed1' }} />
            <span>Balloon</span>
          </span>
        ),
        titleText: 'Balloon',
        key: `balloon-${part.id}${orderId ? `-${orderId}` : ''}`,
        isLeaf: true,
        selectable: true,
        nodeData: { type: 'part-category', category: 'Balloon', partId: part.id, partName: part.part_name, orderId }
      },
      // CNC Programs folder
      {
        title: (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <FolderOutlined style={{ color: '#13c2c2' }} />
            <span>CNC Programs</span>
          </span>
        ),
        titleText: 'CNC Programs',
        key: `cnc-${part.id}${orderId ? `-${orderId}` : ''}`,
        isLeaf: false,
        selectable: false,
        children: operations.length > 0 ? operations.map(op => ({
          title: (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <FolderOutlined style={{ color: '#13c2c2' }} />
              <span>{op.operation_name}</span>
            </span>
          ),
          titleText: op.operation_name,
          key: `op-${op.id}${orderId ? `-${orderId}` : ''}`,
          isLeaf: true,
          selectable: true,
          nodeData: { type: 'operation-folder', operationId: op.id, operationName: op.operation_name, partId: part.id, orderId }
        })) : []
      }
    );

    return {
      title: (
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <AppstoreOutlined style={{ color: '#fa8c16', fontSize: '14px' }} />
          <span>{part.part_name}</span>
        </span>
      ),
      titleText: part.part_name,
      key: `part-${part.id}${orderId ? `-${orderId}` : ''}`,
      isLeaf: false,
      selectable: false,
      children
    };
  };

const buildMachineFoldersTree = (folders, machine) => {
  return folders.map(folder => ({
    title: (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <FolderOutlined style={{ color: '#52c41a' }} />
          <span>{folder.folder_name}</span>
          {folder.document_count > 0 && (
            <span style={{ fontSize: '11px', color: '#999' }}>({folder.document_count})</span>
          )}
        </span>
        <div style={{ display: 'flex', gap: '2px' }}>
          <Button
            type="text"
            size="small"
            icon={<PlusOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              setMachineParentMachineId(machine.id);
              setMachineParentFolderId(folder.id);
              setMachineNewFolderModalVisible(true);
            }}
            style={{
              padding: '0 2px',
              height: '16px',
              fontSize: '10px',
              color: '#52c41a',
              minWidth: 'auto'
            }}
          />
          <Button
            type="text"
            size="small"
            icon={<UploadOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              setMachineUploadFolderId(folder.id);
              setMachineFileList([]);
              setMachineUploadModalVisible(true);
            }}
            style={{
              padding: '0 2px',
              height: '16px',
              fontSize: '10px',
              color: '#1890ff',
              minWidth: 'auto'
            }}
          />
            <Button
            type="text"
            size="small"
            icon={<DeleteOutlined />}
            onClick={(e) => {
              e.stopPropagation();
                setMachineFolderToDelete({
                  id: folder.id,
                  folder_name: folder.folder_name,
                  machineId: machine.id
                });
              setMachineDeleteFolderModalVisible(true);
            }}
            style={{
              padding: '0 2px',
              height: '16px',
              fontSize: '10px',
              color: '#ff4d4f',
              minWidth: 'auto'
            }}
          />
        </div>
      </div>
    ),
    titleText: folder.folder_name,
    key: `machine-folder-${folder.id}`,
    selectable: true,
    nodeData: {
      type: 'machine-folder',
      folderId: folder.id,
      folderName: folder.folder_name,
      machineId: machine.id,
      machineName: machine.label,
      documentCount: folder.document_count
    },
    children: folder.children && folder.children.length > 0 ? buildMachineFoldersTree(folder.children, machine) : []
  }));
};

  const buildMachineNode = (machine) => {
    const label = machine.make
      ? (machine.model ? `${machine.make} - ${machine.model}` : machine.make)
      : (machine.type ? `${machine.type} - ${machine.id}` : `Machine ${machine.id}`);

    return {
      title: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <FolderOutlined style={{ color: '#52c41a' }} />
            <span>{label}</span>
          </span>
          <div style={{ display: 'flex', gap: '2px' }}>
            <Button
              type="text"
              size="small"
              icon={<PlusOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                setMachineParentMachineId(machine.id);
                setMachineParentFolderId(null);
                setMachineNewFolderModalVisible(true);
              }}
              style={{
                padding: '0 2px',
                height: '16px',
                fontSize: '10px',
                color: '#52c41a',
                minWidth: 'auto'
              }}
            />
            <Button
              type="text"
              size="small"
              icon={<UploadOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                setMachineUploadFolderId(null); // null for direct machine upload
                setMachineUploadMachineId(machine.id); // Set machine ID for direct upload
                setMachineFileList([]);
                setMachineUploadModalVisible(true);
              }}
              style={{
                padding: '0 2px',
                height: '16px',
                fontSize: '10px',
                color: '#1890ff',
                minWidth: 'auto'
              }}
            />
          </div>
        </div>
      ),
      titleText: label,
      key: `machine-${machine.id}`,
      selectable: true,
      isLeaf: false,
      nodeData: {
        type: 'machine',
        machineId: machine.id,
        machineName: label
      },
      children: []
    };
  };

  const initializeTreeData = (ordersData, machinesData = []) => {
    const filteredGeneralFolders = generalFolders.filter(folder => folder.folder_name !== 'Common Folder');

    const initialTreeData = [
      {
        title: (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ShoppingCartOutlined style={{ color: '#1890ff' }} />
            <span>Orders</span>
          </span>
        ),
        titleText: 'Orders',
        key: 'orders-root',
        selectable: false,
        children: ordersData.map(order => ({
          title: (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ShoppingOutlined style={{ color: '#52c41a', fontSize: '14px' }} />
              <span>{order.sale_order_number}</span>
            </span>
          ),
          titleText: order.sale_order_number,
          key: `order-${order.id}`,
          selectable: false,
          isLeaf: false,
          children: [
            {
              title: (
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <FolderOutlined style={{ color: '#52c41a' }} />
                  <span>Reports</span>
                </span>
              ),
              titleText: 'Reports',
              key: `reports-${order.id}`,
              isLeaf: true,
              selectable: true,
              nodeData: { type: 'folder', category: 'Reports', orderId: order.id, folderName: 'Reports' }
            }
          ]
        }))
      },
      {
        title: (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <DesktopOutlined style={{ color: '#52c41a' }} />
            <span>Machine Documents</span>
          </span>
        ),
        titleText: 'Machines',
        key: 'machines-root',
        selectable: false,
        children: machinesData.map(machine => buildMachineNode(machine))
      },
      {
        title: (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <FolderOutlined style={{ color: '#eb2f96' }} />
              <span>Common Folders</span>
              {commonRootDocumentCount > 0 && (
                <span style={{ fontSize: '11px', color: '#999' }}>({commonRootDocumentCount})</span>
              )}
            </span>
            <div style={{ display: 'flex', gap: '2px' }}>
              <Button
                type="text"
                size="small"
                icon={<PlusOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  setCommonParentFolderId(null);
                  setCommonNewFolderName('');
                  setCommonNewFolderModalVisible(true);
                }}
                style={{
                  padding: '0 2px',
                  height: '16px',
                  fontSize: '10px',
                  color: '#eb2f96',
                  minWidth: 'auto'
                }}
              />
              <Button
                type="text"
                size="small"
                icon={<UploadOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  setCommonUploadFolderId(null);
                  setCommonFileList([]);
                  setCommonUploadModalVisible(true);
                }}
                style={{
                  padding: '0 2px',
                  height: '16px',
                  fontSize: '10px',
                  color: '#1890ff',
                  minWidth: 'auto'
                }}
              />
            </div>
          </div>
        ),
        titleText: 'Common Folders',
        key: 'common-folders-root',
        selectable: true,
        isLeaf: false,
        nodeData: {
          type: 'common-root'
        },
        children: buildCommonFoldersTree(commonFolders)
      },
      ...buildGeneralFoldersTree(filteredGeneralFolders)
    ];
    
    // Clear tree data first to force re-render
    setTreeData([]);
    
    // Set new tree data after a short delay
    setTimeout(() => {
      setTreeData(initialTreeData);
    }, 100);
  };

  const buildGeneralFoldersTree = (folders, level = 0) => {
    return folders.map(folder => ({
      title: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <FolderOutlined style={{ color: folder.folder_name === 'Common Folder' ? '#eb2f96' : '#722ed1' }} />
            <span>{folder.folder_name}</span>
            {folder.document_count > 0 && (
              <span style={{ fontSize: '11px', color: '#999' }}>({folder.document_count})</span>
            )}
          </span>
          <div style={{ display: 'flex', gap: '2px' }}>
            <Button
              type="text"
              size="small"
              icon={<PlusOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                setParentFolderId(folder.id);
                setNewFolderModalVisible(true);
              }}
              style={{
                padding: '0 2px',
                height: '16px',
                fontSize: '10px',
                color: folder.folder_name === 'Common Folder' ? '#eb2f96' : '#722ed1',
                minWidth: 'auto'
              }}
            />
            <Button
              type="text"
              size="small"
              icon={<UploadOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                setUploadFolderId(folder.id);
                setFileList([]);
                setUploadModalVisible(true);
              }}
              style={{
                padding: '0 2px',
                height: '16px',
                fontSize: '10px',
                color: '#1890ff',
                minWidth: 'auto'
              }}
            />
            {folder.folder_name !== 'Common Folder' && (
              <Button
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  setFolderToDelete(folder);
                  setDeleteFolderModalVisible(true);
                }}
                style={{
                  padding: '0 2px',
                  height: '16px',
                  fontSize: '10px',
                  color: '#ff4d4f',
                  minWidth: 'auto'
                }}
              />
            )}
          </div>
        </div>
      ),
      titleText: folder.folder_name,
      key: `general-folder-${folder.id}`,
      selectable: true,
      isLeaf: false,
      nodeData: {
        type: 'general-folder',
        folderId: folder.id,
        folderName: folder.folder_name,
        documentCount: folder.document_count
      },
      children: folder.children && folder.children.length > 0 ? buildGeneralFoldersTree(folder.children, level + 1) : []
    }));
  };

  const buildCommonFoldersTree = (folders, level = 0) => {
    return folders.map(folder => {
      return {
        title: (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <FolderOutlined style={{ color: '#eb2f96' }} />
              <span>{folder.folder_name}</span>
              {folder.document_count > 0 && (
                <span style={{ fontSize: '11px', color: '#999' }}>({folder.document_count})</span>
              )}
            </span>
            <div style={{ display: 'flex', gap: '2px' }}>
              <Button
                type="text"
                size="small"
                icon={<PlusOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  setCommonParentFolderId(folder.id);
                  setCommonNewFolderName('');
                  setCommonNewFolderModalVisible(true);
                }}
                style={{
                  padding: '0 2px',
                  height: '16px',
                  fontSize: '10px',
                  color: '#eb2f96',
                  minWidth: 'auto'
                }}
              />
              <Button
                type="text"
                size="small"
                icon={<UploadOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  setCommonUploadFolderId(folder.id);
                  setCommonFileList([]);
                  setCommonUploadModalVisible(true);
                }}
                style={{
                  padding: '0 2px',
                  height: '16px',
                  fontSize: '10px',
                  color: '#1890ff',
                  minWidth: 'auto'
                }}
              />
              <Button
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  setCommonFolderToDelete(folder);
                  setCommonDeleteFolderModalVisible(true);
                }}
                style={{
                  padding: '0 2px',
                  height: '16px',
                  fontSize: '10px',
                  color: '#ff4d4f',
                  minWidth: 'auto'
                }}
              />
            </div>
          </div>
        ),
        titleText: folder.folder_name,
        key: `common-folder-${folder.id}`,
        selectable: true,
        isLeaf: false,
        nodeData: {
          type: 'common-folder',
          folderId: folder.id,
          folderName: folder.folder_name,
          documentCount: folder.document_count
        },
        children: folder.children && folder.children.length > 0 ? buildCommonFoldersTree(folder.children, level + 1) : []
      };
    });
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      message.error('Please enter a folder name');
      return;
    }

    try {
      const response = await fetch(`http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}general-documents/folders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          folder_name: newFolderName.trim(),
          parent_id: parentFolderId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create folder');
      }

      message.success('Folder created successfully');
      setNewFolderModalVisible(false);
      setNewFolderName('');
      setParentFolderId(null);
      
      await fetchGeneralFolders();
      initializeTreeData(orders, parts, machines);
      if (onDocumentsChange && typeof onDocumentsChange === 'function') {
        onDocumentsChange();
      }
    } catch (error) {
      message.error('Failed to create folder: ' + error.message);
    }
  };

  const handleCreateCommonFolder = async () => {
    if (!commonNewFolderName.trim()) {
      message.error('Please enter a folder name');
      return;
    }

    try {
      const response = await fetch(`http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}common-documents/folders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          folder_name: commonNewFolderName.trim(),
          parent_id: commonParentFolderId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create common folder');
      }

      message.success('Common folder created successfully');
      setCommonNewFolderModalVisible(false);
      setCommonNewFolderName('');
      setCommonParentFolderId(null);
      
      await fetchCommonFolders();
      initializeTreeData(orders, parts, machines);
      if (onDocumentsChange && typeof onDocumentsChange === 'function') {
        onDocumentsChange();
      }
    } catch (error) {
      message.error('Failed to create common folder: ' + error.message);
    }
  };

  const handleCreateDocument = (folderId) => {
    // This will open the document creation interface
    // For now, we'll just show a message
    message.info(`Document creation for folder ${folderId} - To be implemented`);
  };

  const handleDeleteFolder = async () => {
    if (!folderToDelete) return;

    try {
      const response = await fetch(`http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}general-documents/folders/${folderToDelete.id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to delete folder');
      }

      message.success('Folder deleted successfully');
      setDeleteFolderModalVisible(false);
      setFolderToDelete(null);
      
      await fetchGeneralFolders();
      initializeTreeData(orders, parts, machines);
      if (onDocumentsChange && typeof onDocumentsChange === 'function') {
        onDocumentsChange();
      }
    } catch (error) {
      message.error('Failed to delete folder: ' + error.message);
    }
  };

  const handleDeleteCommonFolder = async () => {
    if (!commonFolderToDelete) return;

    try {
      const response = await fetch(`http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}common-documents/folders/${commonFolderToDelete.id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to delete common folder');
      }

      message.success('Common folder deleted successfully');
      setCommonDeleteFolderModalVisible(false);
      setCommonFolderToDelete(null);
      
      await fetchCommonFolders();
      initializeTreeData(orders, parts, machines);
      if (onDocumentsChange && typeof onDocumentsChange === 'function') {
        onDocumentsChange();
      }
    } catch (error) {
      message.error('Failed to delete common folder: ' + error.message);
    }
  };

  const handleUploadDocument = async () => {
    if (fileList.length === 0) {
      message.error('Please select a file to upload');
      return;
    }

    const fileObj = fileList[0];
    // Get the actual file object from the originFileObj
    const file = fileObj.originFileObj || fileObj;
    
    // Validate that we have a proper File object
    if (!(file instanceof File) && !(file instanceof Blob)) {
      message.error('Invalid file object');
      return;
    }
    
    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('file_name', file.name);
    
    // Handle different upload scenarios
    let uploadUrl;
    // General folder upload
    formData.append('folder_id', uploadFolderId.toString());
    uploadUrl = `http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}general-documents/upload`;
    
    try {
      setLoading(true);
   
      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
        // Don't set Content-Type header, let browser set it with boundary
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Upload error response:', errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { detail: errorText };
        }
        throw new Error(errorData.detail || `Failed to upload document: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      message.success('Document uploaded successfully');
      setUploadModalVisible(false);
      setFileList([]);
      setUploadFolderId(null);
      
      // Refresh folders
      await fetchGeneralFolders();
      
      // Reinitialize tree data
      initializeTreeData(orders, parts, machines);
    } catch (error) {
      console.error('Upload error:', error);
      message.error('Failed to upload document: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadCommonDocument = async () => {
    if (commonFileList.length === 0) {
      message.error('Please select a file to upload');
      return;
    }

    const fileObj = commonFileList[0];
    const file = fileObj.originFileObj || fileObj;

    if (!(file instanceof File) && !(file instanceof Blob)) {
      message.error('Invalid file object');
      return;
    }

    const formData = new FormData();
    formData.append('file', file, file.name);
    if (commonUploadFolderId !== null && commonUploadFolderId !== undefined) {
      formData.append('folder_id', commonUploadFolderId.toString());
    }

    try {
      setLoading(true);
      const baseUrl = `http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}`;
      const uploadUrl = `${baseUrl}common-documents/upload`;

      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Upload error response:', errorText);
        let errorData;
        try {
          errorData = await response.json();
        } catch {
          errorData = { detail: errorText };
        }
        throw new Error(errorData.detail || `Failed to upload common document: ${response.status} ${response.statusText}`);
      }

      message.success('Common document uploaded successfully');
      setCommonUploadModalVisible(false);
      setCommonFileList([]);
      setCommonUploadFolderId(null);
      
      await fetchCommonFolders();
      initializeTreeData(orders, parts, machines);
      if (onDocumentsChange && typeof onDocumentsChange === 'function') {
        onDocumentsChange();
      }
    } catch (error) {
      console.error('Upload error:', error);
      message.error('Failed to upload common document: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMachineFolder = async () => {
    if (!machineNewFolderName.trim() || !machineParentMachineId) {
      message.error('Please enter a folder name');
      return;
    }

    try {
      const targetMachineId = machineParentMachineId;
      const baseUrl = `http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}`;
      const response = await fetch(`${baseUrl}machine-documents/folders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          folder_name: machineNewFolderName.trim(),
          machine_id: machineParentMachineId,
          parent_id: machineParentFolderId
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to create machine folder');
      }

      message.success('Folder created successfully');
      setMachineNewFolderModalVisible(false);
      setMachineNewFolderName('');
      setMachineParentFolderId(null);
      setMachineParentMachineId(null);
      
      // Refresh only this machine's folders in the tree and preserve expansion
      const machineIdNum = Number(targetMachineId);
      try {
        const folders = await fetchMachineFoldersByMachine(machineIdNum);
        const updatedTreeData = [...treeData];
        const machinesRootNode = updatedTreeData.find(node => node.key === 'machines-root');
        const machineNodeKey = `machine-${machineIdNum}`;
        
        if (machinesRootNode) {
          const machineNode = machinesRootNode.children.find(child => child.key === machineNodeKey);
          if (machineNode) {
            const newFolders = folders && folders.length > 0
              ? buildMachineFoldersTree(folders, { id: machineIdNum, label: machineNode.titleText })
              : [];
            machineNode.children = newFolders;
            setTreeData(updatedTreeData);
            
            // Ensure machine node stays expanded
            setExpandedKeys(prev => {
              const next = new Set(prev);
              next.add(machineNodeKey);
              return Array.from(next);
            });
          }
        }
      } catch (err) {
        console.error('Failed to refresh machine folders after create:', err);
      }
    } catch (error) {
      message.error('Failed to create machine folder: ' + error.message);
    }
  };

  const handleDeleteMachineFolder = async () => {
    if (!machineFolderToDelete) return;

    try {
      const baseUrl = `http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}`;
      const response = await fetch(`${baseUrl}machine-documents/folders/${machineFolderToDelete.id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to delete folder');
      }

      message.success('Folder deleted successfully');
      setMachineDeleteFolderModalVisible(false);
      const machineIdNum = machineFolderToDelete.machineId;
      setMachineFolderToDelete(null);
      
      // Refresh this machine's folders in the tree and preserve expansion
      try {
        const folders = await fetchMachineFoldersByMachine(machineIdNum);
        const updatedTreeData = [...treeData];
        const machinesRootNode = updatedTreeData.find(node => node.key === 'machines-root');
        const machineNodeKey = `machine-${machineIdNum}`;
        
        if (machinesRootNode) {
          const machineNode = machinesRootNode.children.find(child => child.key === machineNodeKey);
          if (machineNode) {
            const newFolders = folders && folders.length > 0
              ? buildMachineFoldersTree(folders, { id: machineIdNum, label: machineNode.titleText })
              : [];
            machineNode.children = newFolders;
            setTreeData(updatedTreeData);
            
            setExpandedKeys(prev => {
              const next = new Set(prev);
              next.add(machineNodeKey);
              return Array.from(next);
            });
          }
        }
      } catch (err) {
        console.error('Failed to refresh machine folders after delete:', err);
      }
    } catch (error) {
      message.error('Failed to delete folder: ' + error.message);
    }
  };

  const handleUploadMachineDocument = async () => {
    if ((!machineUploadFolderId && !machineUploadMachineId) || machineFileList.length === 0) {
      message.error('Please select a file to upload');
      return;
    }

    const fileObj = machineFileList[0];
    const file = fileObj.originFileObj || fileObj;

    if (!(file instanceof File) && !(file instanceof Blob)) {
      message.error('Invalid file object');
      return;
    }

    const formData = new FormData();
    formData.append('file', file, file.name);
    
    // Append folder_id or machine_id (one will be null, the other will have a value)
    if (machineUploadFolderId) {
      formData.append('folder_id', machineUploadFolderId.toString());
    }
    if (machineUploadMachineId) {
      formData.append('machine_id', machineUploadMachineId.toString());
    }

    try {
      setLoading(true);
      const baseUrl = `http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}`;
      const uploadUrl = `${baseUrl}machine-documents/upload`;

      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { detail: errorText };
        }
        throw new Error(errorData.detail || `Failed to upload document: ${response.status} ${response.statusText}`);
      }

      message.success('Document uploaded successfully');
      setMachineUploadModalVisible(false);
      setMachineFileList([]);
      setMachineUploadFolderId(null);
      setMachineUploadMachineId(null);
      
      // Find which machine this folder belongs to and refresh it
      // We need to find the machine ID for this folder
      let targetMachineId = null;
      
      // Search through the tree to find which machine contains this folder
      const findMachineForFolder = (nodes, folderId) => {
        for (const node of nodes) {
          if (node.key === 'machines-root' && node.children) {
            for (const machineNode of node.children) {
              if (machineNode.children) {
                const searchInFolders = (folders) => {
                  for (const folder of folders) {
                    if (folder.nodeData && folder.nodeData.folderId === folderId) {
                      return folder.nodeData.machineId;
                    }
                    if (folder.children) {
                      const found = searchInFolders(folder.children);
                      if (found) return found;
                    }
                  }
                  return null;
                };
                const machineId = searchInFolders(machineNode.children);
                if (machineId) return machineId;
              }
            }
          }
        }
        return null;
      };
      
      targetMachineId = findMachineForFolder(treeData, machineUploadFolderId);
      
      if (targetMachineId) {
        // Refresh the specific machine folders to update document counts
        // Use the refreshMachineFolders method from useImperativeHandle
        setTimeout(() => {
          const machineNodeKey = `machine-${targetMachineId}`;
          const folders = fetchMachineFoldersByMachine(targetMachineId);
          
          folders.then(foldersData => {
            const updatedTreeData = [...treeData];
            const machinesRootNode = updatedTreeData.find(node => node.key === 'machines-root');
            
            if (machinesRootNode) {
              const machineNode = machinesRootNode.children.find(child => child.key === machineNodeKey);
              if (machineNode) {
                const machine = machines.find(m => m.id === targetMachineId);
                const label = machine ? machineNode.titleText : `Machine ${targetMachineId}`;
                
                // Update the machine node with new folders (with updated counts)
                machineNode.children = foldersData && foldersData.length > 0 
                  ? buildMachineFoldersTree(foldersData, { id: targetMachineId, label: label })
                  : [];
                
                // Mark as loaded and update tree
                setLoadedMachineFolders(prev => ({
                  ...prev,
                  [targetMachineId.toString()]: true
                }));
                setTreeData(updatedTreeData);
                
                // Ensure machine stays expanded
                setExpandedKeys(prev => {
                  const newExpandedKeys = new Set(prev);
                  newExpandedKeys.add(machineNodeKey);
                  return Array.from(newExpandedKeys);
                });
              }
            }
          }).catch(error => {
            console.error('Failed to refresh machine folders:', error);
          });
        }, 100);
      } else {
        // Fallback: clear all loaded machine folders to force refresh
        setLoadedMachineFolders({});
      }
      
      // Notify parent component to refresh content side
      if (onDocumentsChange && typeof onDocumentsChange === 'function') {
        onDocumentsChange();
      }
      
      // Force content refresh for machine folder operations
      setTimeout(() => {
        if (onNodeSelect && typeof onNodeSelect === 'function') {
          const currentSelectedKey = selectedKeys[0];
          if (currentSelectedKey && currentSelectedKey.startsWith('machine-folder-')) {
            const findSelectedNode = (nodes) => {
              for (const node of nodes) {
                if (node.key === currentSelectedKey) {
                  return node.nodeData;
                }
                if (node.children) {
                  const found = findSelectedNode(node.children);
                  if (found) return found;
                }
              }
              return null;
            };
            
            const selectedNodeData = findSelectedNode(treeData);
            if (selectedNodeData) {
              onNodeSelect(null);
              setTimeout(() => {
                onNodeSelect(selectedNodeData);
              }, 50);
            }
          }
        }
      }, 200);
    } catch (error) {
      message.error('Failed to upload document: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    openNewFolderModal: () => {
      setParentFolderId(null);
      setNewFolderModalVisible(true);
    },
    refreshTree: () => {
      // Store current state before refresh
      const currentExpandedKeys = new Set(expandedKeys);
      const currentLoadedMachineFolders = { ...loadedMachineFolders };
      
      fetchGeneralFolders();
      fetchCommonFolders().then(() => {
        // Reinitialize tree data with existing data to preserve machine folders
        initializeTreeData(orders, machines);
        
        // Restore expanded state after tree rebuild
        setTimeout(() => {
          setExpandedKeys(Array.from(currentExpandedKeys));
          setLoadedMachineFolders(currentLoadedMachineFolders);
        }, 100);
      });
    },
    refreshMachineFolders: (machineId) => {
      // Refresh specific machine folders by fetching and updating the tree
      const updateMachineFolders = async () => {
        try {
          // Store current expanded keys to preserve them
          const currentExpandedKeys = new Set(expandedKeys);
          const machineNodeKey = `machine-${machineId}`;
          
          const folders = await fetchMachineFoldersByMachine(machineId);
          const machineIdNum = Number(machineId);
          
          // Find the machine in the current machines state
          const machine = machines.find(m => m.id === machineIdNum);
          if (!machine) return;
          
          // Update the tree data with new folders
          const updatedTreeData = [...treeData];
          const machinesRootNode = updatedTreeData.find(node => node.key === 'machines-root');
          
          if (machinesRootNode) {
            const machineNode = machinesRootNode.children.find(child => child.key === machineNodeKey);
            if (machineNode) {
              // Build new folder structure
              const newFolders = folders && folders.length > 0 
                ? buildMachineFoldersTree(folders, { id: machineIdNum, label: machineNode.titleText })
                : [];
              
              // Update the machine node with new folders
              machineNode.children = newFolders;
              
              // Mark this machine as loaded to prevent re-fetching
              setLoadedMachineFolders(prev => ({
                ...prev,
                [machineId.toString()]: true
              }));
              
              // Update the tree state first
              setTreeData(updatedTreeData);
              
              // Then restore expanded state - ensure machine node stays expanded
              // and restore any previously expanded folder keys
              setTimeout(() => {
                setExpandedKeys(prev => {
                  const newExpandedKeys = new Set(prev);
                  
                  // Always ensure the machine node is expanded
                  newExpandedKeys.add(machineNodeKey);
                  
                  // Restore any folder keys that were previously expanded
                  // (keys that start with machine-folder- and belong to this machine)
                  prev.forEach(key => {
                    if (key.startsWith('machine-folder-')) {
                      newExpandedKeys.add(key);
                    }
                  });
                  
                  return Array.from(newExpandedKeys);
                });
              }, 100);
            }
          }
          
        } catch (error) {
          console.error('Failed to refresh machine folders:', error);
          message.error('Failed to refresh machine folders');
        }
      };
      
      updateMachineFolders();
    }
  }));

  const fetchOrderHierarchy = async (orderId) => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/orders/${orderId}/hierarchical`);
      if (!response.ok) {
        throw new Error('Failed to fetch order hierarchy');
      }
      const data = await response.json();
      return data;
    } catch (error) {
      message.error('Failed to fetch order hierarchy: ' + error.message);
      return null;
    }
  };

  const fetchOperationsByPart = async (partId) => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/operations/part/${partId}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch operations: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching operations:', error);
      message.error('Failed to fetch operations: ' + error.message);
      return [];
    }
  };

  
  // Helper to collect all parts from hierarchy
  const collectAllParts = (hierarchy) => {
    let allParts = [];
    
    // Add direct parts
    if (hierarchy.direct_parts) {
      allParts = [...allParts, ...hierarchy.direct_parts];
    }
    
    // Add parts from assemblies recursively
    const collectFromAssemblies = (assemblies) => {
      assemblies.forEach(asm => {
        if (asm.parts) {
          allParts = [...allParts, ...asm.parts];
        }
        if (asm.subassemblies) {
          collectFromAssemblies(asm.subassemblies);
        }
      });
    };
    
    if (hierarchy.assemblies) {
      collectFromAssemblies(hierarchy.assemblies);
    }
    
    return allParts;
  };

  // Load parts when order is expanded
  const onExpand = async (expandedKeysValue, info) => {
    setExpandedKeys(expandedKeysValue);

    // 1. Check if an order node is being expanded
    if (info.node && info.node.key.startsWith('order-')) {
      const orderId = info.node.key.replace('order-', '');
      
      if (!loadedParts[orderId]) {
        setLoading(true);
        const hierarchyData = await fetchOrderHierarchy(orderId);
        
        if (!hierarchyData || !hierarchyData.product_hierarchy) {
          setLoading(false);
          return;
        }

        const partsFromHierarchy = collectAllParts(hierarchyData.product_hierarchy);
        
        const updatedTreeData = [...treeData];
        const ordersRootNode = updatedTreeData.find(node => node.key === 'orders-root');
        
        if (ordersRootNode) {
          const orderNode = ordersRootNode.children.find(child => child.key === `order-${orderId}`);
          if (orderNode) {
            const partsChildren = partsFromHierarchy.map((partDetail) => {
              return buildPartNode(partDetail.part, orderId, partDetail.operations || []);
            });
            
            const reportsFolder = orderNode.children.find(child => child.key === `reports-${orderId}`);
            orderNode.children = reportsFolder ? [...partsChildren, reportsFolder] : partsChildren;
          }
        }
        
        setTreeData(updatedTreeData);
        setLoadedParts(prev => ({ ...prev, [orderId]: true }));
        setLoading(false);
      }
    }

    // 2. Check if CNC Programs folder is being expanded
    if (info.node && info.node.key.startsWith('cnc-')) {
      const keyParts = info.node.key.split('-');
      const partId = keyParts[1];
      const orderId = keyParts[2] || null;
      
      if (!loadedOperations[info.node.key]) {
        setLoading(true);
        const operations = await fetchOperationsByPart(partId);
        
        const updatedTreeData = [...treeData];
        
        // Function to find and update the CNC folder recursively
        const updateCncFolder = (nodes) => {
          for (let node of nodes) {
            if (node.key === info.node.key) {
              node.children = operations.map(op => ({
                title: (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <FolderOutlined style={{ color: '#13c2c2' }} />
                    <span>{op.operation_name}</span>
                  </span>
                ),
                titleText: op.operation_name,
                key: `op-${op.id}${orderId ? `-${orderId}` : ''}`,
                isLeaf: true,
                selectable: true,
                nodeData: { type: 'operation-folder', operationId: op.id, operationName: op.operation_name, partId, orderId }
              }));
              return true;
            }
            if (node.children && updateCncFolder(node.children)) {
              return true;
            }
          }
          return false;
        };
        
        updateCncFolder(updatedTreeData);
        setTreeData(updatedTreeData);
        setLoadedOperations(prev => ({ ...prev, [info.node.key]: true }));
        setLoading(false);
      }
    }

    // 3. Load machine folders when a machine node is expanded
    if (info.node && info.node.key.startsWith('machine-')) {
      const machineId = info.node.key.replace('machine-', '');
      
      if (!loadedMachineFolders[machineId]) {
        setLoading(true);
        try {
          const folders = await fetchMachineFoldersByMachine(machineId);
          
          const updatedTreeData = [...treeData];
          const machinesRootNode = updatedTreeData.find(node => node.key === 'machines-root');
          
          if (machinesRootNode) {
            const machineNode = machinesRootNode.children.find(child => child.key === info.node.key);
            if (machineNode) {
              machineNode.children = folders && folders.length > 0 
                ? buildMachineFoldersTree(folders, { id: Number(machineId), label: machineNode.titleText })
                : [];
            }
          }
          
          setTreeData(updatedTreeData);
          setLoadedMachineFolders(prev => ({ ...prev, [machineId]: true }));
        } catch (error) {
          console.error('Failed to fetch machine folders:', error);
          message.error('Failed to fetch machine folders');
        } finally {
          setLoading(false);
        }
      }
    }
  };

  const onSelect = (selectedKeysValue, info) => {
    setSelectedKeys(selectedKeysValue);
    
    if (info.node && info.node.nodeData) {
      onNodeSelect(info.node.nodeData);
    }
  };

  return (
    <div 
      className="tree-scroll-container"
      style={{ 
        padding: isMobile ? '8px' : '16px',
        width: '100%',
        overflowX: 'auto',
        overflowY: 'hidden' // Vertical scroll is handled by the parent div in Document.jsx
      }}
    >
      <style>
        {`
          .tree-scroll-container::-webkit-scrollbar {
            width: 8px;
          }
          .tree-scroll-container::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 4px;
          }
          .tree-scroll-container::-webkit-scrollbar-thumb {
            background: #c1c1c1;
            border-radius: 4px;
          }
          .tree-scroll-container::-webkit-scrollbar-thumb:hover {
            background: #a8a8a8;
          }
          .tree-scroll-container {
            scrollbar-width: thin;
            scrollbar-color: #c1c1c1 #f1f1f1;
          }
        `}
      </style>
      
      <Spin spinning={loading}>
        <Tree
          showIcon
          treeData={treeData}
          expandedKeys={expandedKeys}
          selectedKeys={selectedKeys}
          onExpand={onExpand}
          onSelect={onSelect}
          style={{ 
            background: 'transparent',
            fontSize: isMobile ? '14px' : '16px', // Increased font size
          }}
          showLine={false}
          blockNode={isMobile}
          virtual={false} // Disable virtual scrolling for better compatibility
        />
      </Spin>
      
      {/* New Folder Modal */}
      <Modal
        title="Create New Folder"
        open={newFolderModalVisible}
        onOk={handleCreateFolder}
        onCancel={() => {
          setNewFolderModalVisible(false);
          setNewFolderName('');
          setParentFolderId(null);
        }}
        okText="Create"
        cancelText="Cancel"
      >
        <Input
          placeholder="Enter folder name"
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          onPressEnter={handleCreateFolder}
        />
      </Modal>

      
      {/* Delete Folder Modal */}
      <Modal
        title="Delete Folder"
        open={deleteFolderModalVisible}
        onOk={handleDeleteFolder}
        onCancel={() => {
          setDeleteFolderModalVisible(false);
          setFolderToDelete(null);
        }}
        okText="Delete"
        cancelText="Cancel"
        okButtonProps={{ danger: true }}
      >
        <p>Are you sure you want to delete the folder "{folderToDelete?.folder_name}"?</p>
        <p style={{ color: '#ff4d4f', fontSize: '12px' }}>
          Warning: This will delete the folder and all its contents. This action cannot be undone.
        </p>
      </Modal>

      <Modal
        title="Upload Document"
        open={uploadModalVisible}
        onOk={handleUploadDocument}
        onCancel={() => {
          setUploadModalVisible(false);
          setFileList([]);
          setUploadFolderId(null);
        }}
        okText="Upload"
        cancelText="Cancel"
        confirmLoading={loading}
      >
        <Upload
          beforeUpload={(file) => {
            console.log('Before upload - file:', file);
            // Prevent automatic upload
            return false;
          }}
          fileList={fileList}
          onChange={({ fileList }) => {
            console.log('File list changed:', fileList);
            setFileList(fileList);
          }}
          onRemove={() => {
            console.log('File removed');
            setFileList([]);
          }}
          maxCount={1}
          accept=".pdf,.docx,.doc,.txt,.jpg,.jpeg,.png,.xlsx,.xls,.csv"
          customRequest={({ onSuccess, onError, file }) => {
            // This prevents automatic upload
            setTimeout(() => {
              onSuccess('ok');
            }, 0);
          }}
        >
          <Button icon={<UploadOutlined />}>Select File</Button>
        </Upload>
        <p style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
          Select a file to upload to the folder.
        </p>
      </Modal>

      <Modal
        title="Create Machine Folder"
        open={machineNewFolderModalVisible}
        onOk={handleCreateMachineFolder}
        onCancel={() => {
          setMachineNewFolderModalVisible(false);
          setMachineNewFolderName('');
          setMachineParentFolderId(null);
          setMachineParentMachineId(null);
        }}
        okText="Create"
        cancelText="Cancel"
      >
        <Input
          placeholder="Enter folder name"
          value={machineNewFolderName}
          onChange={(e) => setMachineNewFolderName(e.target.value)}
          onPressEnter={handleCreateMachineFolder}
        />
      </Modal>

      <Modal
        title="Delete Machine Folder"
        open={machineDeleteFolderModalVisible}
        onOk={handleDeleteMachineFolder}
        onCancel={() => {
          setMachineDeleteFolderModalVisible(false);
          setMachineFolderToDelete(null);
        }}
        okText="Delete"
        cancelText="Cancel"
        okButtonProps={{ danger: true }}
      >
        <p>Are you sure you want to delete the folder "{machineFolderToDelete?.folder_name}"?</p>
      </Modal>

      <Modal
        title="Upload Machine Document"
        open={machineUploadModalVisible}
        onOk={handleUploadMachineDocument}
        onCancel={() => {
          setMachineUploadModalVisible(false);
          setMachineFileList([]);
          setMachineUploadFolderId(null);
          setMachineUploadMachineId(null);
        }}
        okText="Upload"
        cancelText="Cancel"
        confirmLoading={loading}
      >
        <Upload
          beforeUpload={() => false}
          fileList={machineFileList}
          onChange={({ fileList }) => setMachineFileList(fileList)}
          onRemove={() => setMachineFileList([])}
          maxCount={1}
          accept=".pdf,.docx,.doc,.txt,.jpg,.jpeg,.png,.xlsx,.xls,.csv"
          customRequest={({ onSuccess }) => {
            setTimeout(() => {
              onSuccess('ok');
            }, 0);
          }}
        >
          <Button icon={<UploadOutlined />}>Select File</Button>
        </Upload>
        <p style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
          Select a file to upload to the selected machine folder.
        </p>
      </Modal>

      {/* Common Folder Modals */}
      <Modal
        title="Create Common Folder"
        open={commonNewFolderModalVisible}
        onOk={handleCreateCommonFolder}
        onCancel={() => {
          setCommonNewFolderModalVisible(false);
          setCommonNewFolderName('');
          setCommonParentFolderId(null);
        }}
        okText="Create"
        cancelText="Cancel"
        confirmLoading={loading}
      >
        <Input
          placeholder="Enter folder name"
          value={commonNewFolderName}
          onChange={(e) => setCommonNewFolderName(e.target.value)}
          onPressEnter={handleCreateCommonFolder}
        />
      </Modal>

      <Modal
        title="Delete Common Folder"
        open={commonDeleteFolderModalVisible}
        onOk={handleDeleteCommonFolder}
        onCancel={() => {
          setCommonDeleteFolderModalVisible(false);
          setCommonFolderToDelete(null);
        }}
        okText="Delete"
        cancelText="Cancel"
        confirmLoading={loading}
        okButtonProps={{ danger: true }}
      >
        <p>Are you sure you want to delete the folder "{commonFolderToDelete?.folder_name}"?</p>
        <p style={{ color: '#ff4d4f', fontSize: '12px' }}>
          Note: This will only delete the folder if it's empty (no subfolders or documents).
        </p>
      </Modal>

      <Modal
        title="Upload Common Document"
        open={commonUploadModalVisible}
        onOk={handleUploadCommonDocument}
        onCancel={() => {
          setCommonUploadModalVisible(false);
          setCommonFileList([]);
          setCommonUploadFolderId(null);
        }}
        okText="Upload"
        cancelText="Cancel"
        confirmLoading={loading}
      >
        <Upload
          beforeUpload={(file) => {
            console.log('Before upload - file:', file);
            // Prevent automatic upload
            return false;
          }}
          fileList={commonFileList}
          onChange={({ fileList }) => {
            console.log('File list changed:', fileList);
            setCommonFileList(fileList);
          }}
          onRemove={() => {
            console.log('File removed');
            setCommonFileList([]);
          }}
          maxCount={1}
          accept=".pdf,.docx,.doc,.txt,.jpg,.jpeg,.png,.xlsx,.xls,.csv"
          customRequest={({ onSuccess, onError, file }) => {
            // This prevents automatic upload
            setTimeout(() => {
              onSuccess('ok');
            }, 0);
          }}
        >
          <Button icon={<UploadOutlined />}>Select File</Button>
        </Upload>
        <p style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
          Select a file to upload to the common folder.
        </p>
      </Modal>
    </div>
  );
});

DocumentTree.displayName = 'DocumentTree';

export default DocumentTree;
