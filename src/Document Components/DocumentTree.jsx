import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Tree, Spin, message, Button, Modal, Input, Upload, Card } from 'antd';
import { 
  FolderOutlined, 
  FileOutlined, 
  CaretDownOutlined, 
  CaretRightOutlined,
  ShoppingOutlined,  // Icon for orders
  AppstoreOutlined,   // Icon for parts
  PlusOutlined,      // Icon for new folder/document
  FileAddOutlined,   // Icon for add document
  DeleteOutlined,    // Icon for delete
  UploadOutlined     // Icon for upload
} from '@ant-design/icons';
import config from '../Config/config';

const DocumentTree = forwardRef(({ onNodeSelect, isMobile = false }, ref) => {
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [parts, setParts] = useState([]);
  const [treeData, setTreeData] = useState([]);
  const [expandedKeys, setExpandedKeys] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [loadedParts, setLoadedParts] = useState({}); // Track which orders have parts loaded
  const [loadedAllParts, setLoadedAllParts] = useState(false); // Track if global parts list is loaded
  const [loadedOperations, setLoadedOperations] = useState({}); // Track which parts have operations loaded
  
  // General Documents state
  const [generalFolders, setGeneralFolders] = useState([]);
  const [newFolderModalVisible, setNewFolderModalVisible] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [parentFolderId, setParentFolderId] = useState(null);
  
  // Delete and Upload state
  const [deleteFolderModalVisible, setDeleteFolderModalVisible] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState(null);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [uploadFolderId, setUploadFolderId] = useState(null);
  const [fileList, setFileList] = useState([]);

  // Fetch orders and general folders on component mount
  useEffect(() => {
    fetchOrders();
    fetchPartsList();
    fetchGeneralFolders();
  }, []);

  // Reinitialize tree data when general folders change
  useEffect(() => {
    if (orders.length > 0 || parts.length > 0) {
      initializeTreeData(orders, parts);
    }
  }, [generalFolders, orders, parts]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${config.API_BASE_URL}/orders/`);
      if (!response.ok) {
        throw new Error('Failed to fetch orders');
      }
      const data = await response.json();
      setOrders(data);
      initializeTreeData(data, parts);
    } catch (error) {
      message.error('Failed to fetch orders: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchPartsList = async () => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/parts/`);
      if (!response.ok) {
        throw new Error('Failed to fetch parts');
      }
      const data = await response.json();
      setParts(data);
    } catch (error) {
      message.error('Failed to fetch parts: ' + error.message);
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

  const initializeTreeData = (ordersData, partsData) => {
    const initialTreeData = [
      {
        title: (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <FolderOutlined style={{ color: '#1890ff' }} />
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
          children: [
            {
              title: (
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <FolderOutlined style={{ color: '#eb2f96' }} />
                  <span>Reports</span>
                </span>
              ),
              titleText: 'Reports',
              key: `reports-${order.id}`,
              isLeaf: true,
              selectable: true,
              nodeData: { 
                type: 'folder', 
                category: 'Reports', 
                partId: null, 
                partName: null, 
                orderId: order.id 
              }
            }
          ]
        }))
      },
      {
        title: (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <FolderOutlined style={{ color: '#fa8c16' }} />
            <span>Parts</span>
          </span>
        ),
        titleText: 'Parts',
        key: 'parts-root',
        selectable: false,
        children: partsData.map(part => buildPartNode(part, null, [], false))
      },
      ...buildGeneralFoldersTree(generalFolders)
    ];
    setTreeData(initialTreeData);
  };

  const buildGeneralFoldersTree = (folders, level = 0) => {
    return folders.map(folder => ({
      title: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <FolderOutlined style={{ color: '#722ed1' }} />
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
                color: '#52c41a',
                minWidth: 'auto'
              }}
              title="Add Subfolder"
            />
            <Button 
              type="text" 
              size="small" 
              icon={<UploadOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                setUploadFolderId(folder.id);
                setUploadModalVisible(true);
              }}
              style={{ 
                padding: '0 2px',
                height: '16px',
                fontSize: '10px',
                color: '#1890ff',
                minWidth: 'auto'
              }}
              title="Upload Document"
            />
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
              title="Delete Folder"
            />
          </div>
        </div>
      ),
      titleText: folder.folder_name,
      key: `general-folder-${folder.id}`,
      selectable: true,
      nodeData: {
        type: 'general-folder',
        folderId: folder.id,
        folderName: folder.folder_name,
        documentCount: folder.document_count
      },
      children: folder.children && folder.children.length > 0 ? buildGeneralFoldersTree(folder.children, level + 1) : []
    }));
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
      
      // Refresh general folders
      await fetchGeneralFolders();
      
      // Reinitialize tree data
      initializeTreeData(orders, parts);
    } catch (error) {
      message.error('Failed to create folder: ' + error.message);
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
      
      // Refresh general folders
      await fetchGeneralFolders();
      
      // Reinitialize tree data
      initializeTreeData(orders, parts);
    } catch (error) {
      message.error('Failed to delete folder: ' + error.message);
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
    
    console.log('File object details:', {
      name: file.name,
      size: file.size,
      type: file.type,
      originFileObj: fileObj.originFileObj,
      isFile: file instanceof File
    });
    
    // Validate that we have a proper File object
    if (!(file instanceof File) && !(file instanceof Blob)) {
      message.error('Invalid file object');
      return;
    }
    
    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('folder_id', uploadFolderId.toString());
    formData.append('file_name', file.name);
    
    // Don't log FormData contents as it can be large
    
    try {
      setLoading(true);
      console.log('Uploading file:', file.name, 'to folder:', uploadFolderId);
      
      const response = await fetch(`http://${config.API_BASE_URL.replace('http://', '').replace('api/v1', '')}general-documents/upload`, {
        method: 'POST',
        body: formData,
        // Don't set Content-Type header, let browser set it with boundary
      });

      console.log('Upload response status:', response.status);
      
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
      console.log('Upload success:', result);
      message.success('Document uploaded successfully');
      setUploadModalVisible(false);
      setFileList([]);
      setUploadFolderId(null);
      
      // Refresh general folders
      await fetchGeneralFolders();
      
      // Reinitialize tree data
      initializeTreeData(orders, parts);
    } catch (error) {
      console.error('Upload error:', error);
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
            orderNode.children = reportsFolder ? [reportsFolder, ...partsChildren] : partsChildren;
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
  };

  const onSelect = (selectedKeysValue, info) => {
    setSelectedKeys(selectedKeysValue);
    
    if (info.node && info.node.selectable && info.node.nodeData) {
      onNodeSelect(info.node.nodeData);
    }
  };

  return (
    <div 
      className="tree-scroll-container"
      style={{ 
        padding: isMobile ? '8px' : '16px',
        minWidth: 'max-content' // Ensure tree items don't get cut off
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
            fontSize: isMobile ? '12px' : '14px',
            minWidth: 'max-content' // Ensure tree items don't get cut off
          }}
          showLine={!isMobile}
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

      {/* Upload Document Modal */}
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
    </div>
  );
});

DocumentTree.displayName = 'DocumentTree';

export default DocumentTree;