import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Tree, Spin, message, Button, Modal, Input, Upload } from 'antd';
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

const DocumentTree = forwardRef(({ onNodeSelect, isMobile = false }, ref) => {
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [treeData, setTreeData] = useState([]);
  const [expandedKeys, setExpandedKeys] = useState([]);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [loadedParts, setLoadedParts] = useState({}); // Track which orders have parts loaded
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
    fetchGeneralFolders();
  }, []);

  // Reinitialize tree data when general folders change
  useEffect(() => {
    if (orders.length > 0) {
      initializeTreeData(orders);
    }
  }, [generalFolders, orders]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://172.18.100.76:8000/api/v1/orders/');
      if (!response.ok) {
        throw new Error('Failed to fetch orders');
      }
      const data = await response.json();
      setOrders(data);
      initializeTreeData(data);
    } catch (error) {
      message.error('Failed to fetch orders: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchGeneralFolders = async () => {
    try {
      const response = await fetch('http://172.18.100.76:8000/general-documents/folders/tree');
      if (!response.ok) {
        throw new Error('Failed to fetch general folders');
      }
      const data = await response.json();
      setGeneralFolders(data);
    } catch (error) {
      message.error('Failed to fetch general folders: ' + error.message);
    }
  };

  const initializeTreeData = (ordersData) => {
    const initialTreeData = [
      {
        title: (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <FolderOutlined style={{ color: '#1890ff' }} />
            <span>Orders</span>
          </span>
        ),
        key: 'orders-root',
        selectable: false,
        children: ordersData.map(order => ({
          title: (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ShoppingOutlined style={{ color: '#52c41a', fontSize: '14px' }} />
              <span>{order.sale_order_number}</span>
            </span>
          ),
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
      const response = await fetch('http://172.18.100.76:8000/general-documents/folders', {
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
      initializeTreeData(orders);
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
      const response = await fetch(`http://172.18.100.76:8000/general-documents/folders/${folderToDelete.id}`, {
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
      initializeTreeData(orders);
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
      
      const response = await fetch('http://172.18.100.76:8000/general-documents/upload', {
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
      initializeTreeData(orders);
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

  const fetchPartsByOrder = async (orderId) => {
    try {
      const response = await fetch(`http://172.18.100.76:8000/api/v1/order-parts-raw-material-linked/order/${orderId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch parts');
      }
      const data = await response.json();
      return data;
    } catch (error) {
      message.error('Failed to fetch parts: ' + error.message);
      return [];
    }
  };

  const fetchOperationsByPart = async (partId) => {
    try {
      const response = await fetch(`http://172.18.100.76:8000/api/v1/operations/part/${partId}`);
      
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

  
  // Load parts when order is expanded
  const onExpand = async (expandedKeysValue, info) => {
    setExpandedKeys(expandedKeysValue);

    // Check if an order node is being expanded
    if (info.node && info.node.key.startsWith('order-')) {
      const orderId = info.node.key.replace('order-', '');
      
      // Check if parts are already loaded for this order
      if (!loadedParts[orderId]) {
        setLoading(true);
        const parts = await fetchPartsByOrder(orderId);
        
        // Update the tree data with parts directly under the order
        const updatedTreeData = [...treeData];
        const ordersRootNode = updatedTreeData.find(node => node.key === 'orders-root');
        
        if (ordersRootNode) {
          const orderNode = ordersRootNode.children.find(child => child.key === `order-${orderId}`);
          if (orderNode) {
            // Add parts directly to order children, keeping Reports folder
            const partsChildren = parts.map((part, index) => {
              return {
                title: (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AppstoreOutlined style={{ color: '#fa8c16', fontSize: '14px' }} />
                    <span>{part.part_name}</span>
                  </span>
                ),
                key: `part-${part.part_id}`,
                isLeaf: false,
                selectable: false,
                children: [
                {
                  title: (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <FolderOutlined style={{ color: '#722ed1' }} />
                      <span>MPP</span>
                    </span>
                  ),
                  key: `mpp-${part.part_id}`,
                  isLeaf: true,
                  selectable: true,
                  nodeData: { type: 'folder', category: 'MPP', partId: part.part_id, partName: part.part_name, orderId }
                },
                {
                  title: (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <FolderOutlined style={{ color: '#722ed1' }} />
                      <span>ENGINEERING_DRAWING</span>
                    </span>
                  ),
                  key: `eng-${part.part_id}`,
                  isLeaf: true,
                  selectable: true,
                  nodeData: { type: 'folder', category: 'ENGINEERING_DRAWING', partId: part.part_id, partName: part.part_name, orderId }
                },
                {
                  title: (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <FolderOutlined style={{ color: '#722ed1' }} />
                      <span>IPID</span>
                    </span>
                  ),
                  key: `ipid-${part.part_id}`,
                  isLeaf: true,
                  selectable: true,
                  nodeData: { type: 'folder', category: 'IPID', partId: part.part_id, partName: part.part_name, orderId }
                },
                {
                  title: (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <FolderOutlined style={{ color: '#722ed1' }} />
                      <span>Balloon</span>
                    </span>
                  ),
                  key: `balloon-${part.part_id}`,
                  isLeaf: true,
                  selectable: true,
                  nodeData: { type: 'folder', category: 'Balloon', partId: part.part_id, partName: part.part_name, orderId }
                },
                {
                  title: (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <FolderOutlined style={{ color: '#13c2c2' }} />
                      <span>CNCPrograms</span>
                    </span>
                  ),
                  key: `cnc-${part.part_id}`,
                  isLeaf: false,
                  selectable: false,
                  children: [] // Will be loaded dynamically with operations
                }
              ]
              };
            });
            
            // Combine existing Reports folder with new parts
            orderNode.children = [...partsChildren, ...orderNode.children];
          }
        }
        
        // Update tree data and mark parts as loaded
        setTreeData(updatedTreeData);
        setLoadedParts(prev => ({ ...prev, [orderId]: true }));
        setLoading(false);
      }
    }

    // Check if a CNCPrograms node is being expanded
    if (info.node && info.node.key.startsWith('cnc-')) {
      const partId = info.node.key.replace('cnc-', '');
      
      // Check if operations are already loaded for this part
      if (!loadedOperations[partId]) {
        setLoading(true);
        
        try {
          const operations = await fetchOperationsByPart(partId);
          
          // Simple approach: Create mock operations for now to prevent crashes
          let mockOperations = [];
          
          if (operations && operations.length > 0) {
            mockOperations = operations.map((operation) => ({
              title: operation.operation_name || `Operation ${operation.id}`,
              key: `operation-${operation.id}`,
              isLeaf: true,
              selectable: true,
              nodeData: { 
                type: 'operation', 
                category: 'CNCPrograms', 
                operationId: operation.id, 
                operationName: operation.operation_name,
                partId: partId 
              }
            }));
          } else {
            mockOperations = [{
              title: 'No operations found',
              key: `no-operations-${partId}`,
              isLeaf: true,
              selectable: false
            }];
          }
          
          // Update the specific node directly without complex tree manipulation
          const newExpandedKeys = [...expandedKeys];
          setExpandedKeys(newExpandedKeys);
          
          // Update the tree with operations
          if (operations && operations.length > 0) {
            // Create operation nodes with proper styling and fallback
            const operationNodes = operations.map((operation, index) => {
              const operationName = operation.operation_name || 
                                   operation.name || 
                                   operation.operation_number || 
                                   `Operation ${index + 1}`;
              
              return {
                title: (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <FileOutlined style={{ color: '#13c2c2' }} />
                    <span>{operationName}</span>
                  </span>
                ),
                key: `operation-${operation.id}`,
                isLeaf: true,
                selectable: true,
                nodeData: { 
                  type: 'operation', 
                  category: 'CNCPrograms', 
                  operationId: operation.id, 
                  operationName: operationName,
                  partId: partId 
                }
              };
            });
            
            // Update tree with operations
            try {
              let cncFolderFound = false;
              const updatedTreeData = treeData.map(orderNode => {
                if (orderNode.children) {
                  return {
                    ...orderNode,
                    children: orderNode.children.map(child => {
                      // Check if this is an order (starts with 'order-')
                      if (child.key.startsWith('order-') && child.children) {
                        return {
                          ...child,
                          children: child.children.map(partChild => {
                            // Look for parts inside the order
                            if (partChild.key.startsWith('part-') && partChild.children) {
                              return {
                                ...partChild,
                                children: partChild.children.map(folder => {
                                  // Look for CNCPrograms folder
                                  if (folder.key === `cnc-${partId}`) {
                                    cncFolderFound = true;
                                    return {
                                      ...folder,
                                      children: operationNodes,
                                      isLeaf: false
                                    };
                                  }
                                  return folder;
                                })
                              };
                            }
                            return partChild;
                          })
                        };
                      }
                      return child;
                    })
                  };
                }
                return orderNode;
              });
              
              if (cncFolderFound) {
                setTreeData(updatedTreeData);
                
                // Auto-expand after a short delay
                setTimeout(() => {
                  setExpandedKeys(prev => [...prev, `cnc-${partId}`]);
                }, 200);
              }
              
            } catch (error) {
              console.error('Error updating tree:', error);
            }
            
            // Mark as loaded to prevent repeated calls
            setLoadedOperations(prev => ({ ...prev, [partId]: true }));
            
          } else {
            message.info('No operations found for this part');
            
            // Add "No operations found" placeholder
            const updatedTreeData = treeData.map(orderNode => {
              if (orderNode.children) {
                const updatedChildren = orderNode.children.map(child => {
                  if (child.children) {
                    const updatedGrandChildren = child.children.map(folder => {
                      if (folder.key === `cnc-${partId}`) {
                        return {
                          ...folder,
                          children: [{
                            title: 'No operations found',
                            key: `no-operations-${partId}`,
                            isLeaf: true,
                            selectable: false
                          }]
                        };
                      }
                      return folder;
                    });
                    return {
                      ...child,
                      children: updatedGrandChildren
                    };
                  }
                  return child;
                });
                return {
                  ...orderNode,
                  children: updatedChildren
                };
              }
              return orderNode;
            });
            
            setTreeData(updatedTreeData);
          }
          
          // Mark as loaded to prevent repeated calls
          setLoadedOperations(prev => ({ ...prev, [partId]: true }));
          
        } catch (error) {
          console.error('Error loading operations:', error);
          message.error('Failed to load operations: ' + error.message);
        } finally {
          setLoading(false);
        }
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
    <div style={{ 
      height: '100%', 
      overflow: 'auto',
      padding: isMobile ? '8px' : '16px'
    }}>
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
            fontSize: isMobile ? '12px' : '14px'
          }}
          showLine={!isMobile}
          blockNode={isMobile}
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