import React, { useState, useEffect } from "react";
import { DeleteOutlined, UndoOutlined, SearchOutlined, CaretDownOutlined, CaretRightOutlined, MenuOutlined } from "@ant-design/icons";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth";
import { Table, Button, App, message, Modal, Typography, Tag, Empty, Spin, Input, Space, Layout, Tree, Drawer } from "antd";

const { Title, Text } = Typography;
const { Sider, Content } = Layout;

const Recyclebin = ({ orderId }) => {
  const { message: antMessage, modal } = App.useApp();
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [bomData, setBomData] = useState(null);
  const [filteredBomData, setFilteredBomData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [expandedKeys, setExpandedKeys] = useState([]);
  const [treeRefreshKey, setTreeRefreshKey] = useState(0);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [allParts, setAllParts] = useState([]);
  const [allAssemblies, setAllAssemblies] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);
  const [checkedKeys, setCheckedKeys] = useState([]);

  const getCurrentUser = () => {
    try {
      const stored = localStorage.getItem("user");
      if (!stored) return null;
      const user = JSON.parse(stored);
      return user;
    } catch {
      return null;
    }
  };

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const user = getCurrentUser();
      let url = `${API_BASE_URL}/recycle-bin/parts`;
      
      if (user && user.id) {
        const params = new URLSearchParams();
        const role = (user.role || user.user_role || "").toLowerCase();
        
        if (role.includes("admin")) {
          params.append("admin_id", user.id);
        } else if (role.includes("manufacturing_coordinator") || role.includes("mc")) {
          params.append("manufacturing_coordinator_id", user.id);
        } else if (role.includes("project_coordinator") || role.includes("pc")) {
          params.append("project_coordinator_id", user.id);
        } else {
          params.append("user_id", user.id);
        }
        
        if (orderId) {
          params.append("order_id", orderId);
        }
        
        if (params.toString()) {
          url += `?${params.toString()}`;
        }
      }
      
      const response = await axios.get(url);
      const allParts = response.data.parts || [];
      const allAssemblies = response.data.assemblies || [];
      const orderInfo = response.data.order_info;
      
      setAllParts(allParts);
      setAllAssemblies(allAssemblies);
      
      // If order_info is provided and no parts/assemblies, display order info
      if (orderInfo && allParts.length === 0 && allAssemblies.length === 0) {
        setProjects([{
          product_id: orderInfo.product_id,
          product_name: orderInfo.product_name,
          sale_order_number: orderInfo.sale_order_number,
          project_name: orderInfo.product_name,
          parts: [],
          assemblies: []
        }]);
        return { allParts, allAssemblies, orderInfo };
      }
      
      // Group by product
      const projectMap = {};
      allParts.forEach(part => {
        if (part.product_id) {
          if (!projectMap[part.product_id]) {
            projectMap[part.product_id] = {
              product_id: part.product_id,
              product_name: orderInfo?.product_name || part.product_name,
              sale_order_number: orderInfo?.sale_order_number || part.sale_order_number,
              project_name: orderInfo?.product_name || part.project_name,
              parts: [],
              assemblies: []
            };
          }
          projectMap[part.product_id].parts.push(part);
        }
      });
      
      allAssemblies.forEach(assembly => {
        if (assembly.product_id) {
          if (!projectMap[assembly.product_id]) {
            projectMap[assembly.product_id] = {
              product_id: assembly.product_id,
              product_name: orderInfo?.product_name || assembly.product_name,
              sale_order_number: orderInfo?.sale_order_number || assembly.sale_order_number,
              project_name: orderInfo?.product_name || assembly.project_name,
              parts: [],
              assemblies: []
            };
          }
          projectMap[assembly.product_id].assemblies.push(assembly);
        }
      });
      
      setProjects(Object.values(projectMap));
      
      // Return the data for immediate use
      return { allParts, allAssemblies, orderInfo };
    } catch (error) {
      console.error("Error fetching projects:", error);
      antMessage.error("Failed to load projects");
    } finally {
      setLoading(false);
    }
  };

  const fetchProductBOM = async (productId, partsData = null, assembliesData = null) => {
    setLoading(true);
    try {
      // Filter parts and assemblies by product_id from the provided data or state
      const sourceParts = partsData || allParts;
      const sourceAssemblies = assembliesData || allAssemblies;
      const productParts = sourceParts.filter(part => part.product_id === productId);
      const productAssemblies = sourceAssemblies.filter(assembly => assembly.product_id === productId);

      // Use the hierarchical structure directly from the backend
      // The backend already returns assemblies with child_assemblies
      const directParts = productParts.filter(part => !part.assembly_id);

      // Build the final BOM structure
      const bomData = {
        product: {
          id: productId,
          product_name: selectedProject?.product_name || productParts[0]?.product_name || productAssemblies[0]?.product_name || ''
        },
        parts: directParts,
        assemblies: productAssemblies
      };

      setBomData(bomData);
      setFilteredBomData(bomData);
    } catch (error) {
      console.error("Error filtering BOM:", error);
      antMessage.error("Failed to load BOM");
    } finally {
      setLoading(false);
    }
  };

  // Expand all tree keys when filteredBomData changes
  useEffect(() => {
    if (filteredBomData) {
      setTreeRefreshKey(prev => prev + 1);
    }
  }, [filteredBomData]);

  const collectAllTreeKeys = (treeData) => {
    const keys = [];
    const traverse = (nodes) => {
      nodes.forEach(node => {
        if (node.key) {
          keys.push(node.key);
        }
        if (node.children) {
          traverse(node.children);
        }
      });
    };
    traverse(treeData);
    return keys;
  };

  const handleProjectClick = (project) => {
    setSelectedProject(project);
    fetchProductBOM(project.product_id);
  };

  const handleRestore = async (item, type) => {
    modal.confirm({
      title: `Restore ${type === 'part' ? 'Part' : 'Assembly'}`,
      content: `Are you sure you want to restore ${type === 'part' ? 'part' : 'assembly'} "${type === 'part' ? item.part_name : item.assembly_name}"?`,
      okText: "Yes",
      okType: "primary",
      cancelText: "No",
      onOk: async () => {
        try {
          if (type === 'part') {
            await axios.post(`${API_BASE_URL}/recycle-bin/parts/${item.id}/restore`);
            antMessage.success(`Part "${item.part_name}" restored successfully`);
          } else {
            await axios.post(`${API_BASE_URL}/recycle-bin/assemblies/${item.id}/restore`);
            antMessage.success(`Assembly "${item.assembly_name}" and all its parts restored successfully`);
          }
          // Clear selection
          setCheckedKeys([]);
          setSelectedItems([]);
          const data = await fetchProjects();
          if (selectedProject) {
            await fetchProductBOM(selectedProject.product_id, data?.allParts, data?.allAssemblies);
          }
        } catch (error) {
          console.error("Error restoring:", error);
          let errorMessage = `Error restoring ${type}`;
          
          if (error.response) {
            if (error.response.data && error.response.data.detail) {
              errorMessage = error.response.data.detail;
            } else if (error.response.data && error.response.data.message) {
              errorMessage = error.response.data.message;
            } else {
              errorMessage = `Server error: ${error.response.status}`;
            }
          } else if (error.request) {
            errorMessage = "Network error: No response from server";
          } else {
            errorMessage = error.message || `Error restoring ${type}`;
          }
          
          antMessage.error(errorMessage);
        }
      },
    });
  };

  const handlePermanentDelete = async (item, type) => {
    modal.confirm({
      title: `Permanently Delete ${type === 'part' ? 'Part' : 'Assembly'}`,
      content: (
        <div>
          <Text>Are you sure you want to permanently delete {type === 'part' ? 'part' : 'assembly'} "{type === 'part' ? item.part_name : item.assembly_name}"?</Text>
          <br />
          <Text type="danger" strong>
            This action cannot be undone.
          </Text>
        </div>
      ),
      okText: "Delete Permanently",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        try {
          if (type === 'part') {
            await axios.delete(`${API_BASE_URL}/recycle-bin/parts/${item.id}/permanent-delete`);
            antMessage.success(`Part "${item.part_name}" permanently deleted`);
          } else {
            await axios.delete(`${API_BASE_URL}/recycle-bin/assemblies/${item.id}/permanent-delete`);
            antMessage.success(`Assembly "${item.assembly_name}" permanently deleted`);
          }
          // Clear selection
          setCheckedKeys([]);
          setSelectedItems([]);
          const data = await fetchProjects();
          if (selectedProject) {
            await fetchProductBOM(selectedProject.product_id, data?.allParts, data?.allAssemblies);
          }
        } catch (error) {
          console.error("Error permanently deleting:", error);
          const detail =
            error?.response?.data?.detail ||
            error?.response?.data?.message ||
            error?.message ||
            `Error permanently deleting ${type}`;
          antMessage.error(detail);
        }
      },
    });
  };

  const handleBulkRestore = async () => {
    if (selectedItems.length === 0) {
      antMessage.warning("Please select items to restore");
      return;
    }

    modal.confirm({
      title: `Restore ${selectedItems.length} ${selectedItems.length > 1 ? 'items' : 'item'}`,
      content: `Are you sure you want to restore ${selectedItems.length} ${selectedItems.length > 1 ? 'items' : 'item'}?`,
      okText: "Yes",
      okType: "primary",
      cancelText: "No",
      onOk: async () => {
        try {
          let successCount = 0;
          let errorCount = 0;

          for (const item of selectedItems) {
            try {
              if (item.type === 'part') {
                await axios.post(`${API_BASE_URL}/recycle-bin/parts/${item.id}/restore`);
                successCount++;
              } else if (item.type === 'assembly') {
                await axios.post(`${API_BASE_URL}/recycle-bin/assemblies/${item.id}/restore`);
                successCount++;
              }
            } catch (error) {
              errorCount++;
              console.error(`Error restoring ${item.type}:`, error);
            }
          }

          setCheckedKeys([]);
          setSelectedItems([]);
          
          if (errorCount > 0) {
            antMessage.warning(`${successCount} items restored, ${errorCount} failed`);
          } else {
            antMessage.success(`${successCount} items restored successfully`);
          }

          const data = await fetchProjects();
          if (selectedProject) {
            await fetchProductBOM(selectedProject.product_id, data?.allParts, data?.allAssemblies);
          }
        } catch (error) {
          console.error("Error in bulk restore:", error);
          antMessage.error("Error performing bulk restore");
        }
      },
    });
  };

  const handleBulkDelete = async () => {
    if (selectedItems.length === 0) {
      antMessage.warning("Please select items to delete");
      return;
    }

    modal.confirm({
      title: `Permanently Delete ${selectedItems.length} ${selectedItems.length > 1 ? 'items' : 'item'}`,
      content: (
        <div>
          <Text>Are you sure you want to permanently delete {selectedItems.length} {selectedItems.length > 1 ? 'items' : 'item'}?</Text>
          <br />
          <Text type="danger" strong>
            This action cannot be undone.
          </Text>
        </div>
      ),
      okText: "Delete Permanently",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        try {
          let successCount = 0;
          let errorCount = 0;

          for (const item of selectedItems) {
            try {
              if (item.type === 'part') {
                await axios.delete(`${API_BASE_URL}/recycle-bin/parts/${item.id}/permanent-delete`);
                successCount++;
              } else if (item.type === 'assembly') {
                await axios.delete(`${API_BASE_URL}/recycle-bin/assemblies/${item.id}/permanent-delete`);
                successCount++;
              }
            } catch (error) {
              errorCount++;
              console.error(`Error deleting ${item.type}:`, error);
            }
          }

          setCheckedKeys([]);
          setSelectedItems([]);

          if (errorCount > 0) {
            antMessage.warning(`${successCount} items deleted, ${errorCount} failed`);
          } else {
            antMessage.success(`${successCount} items permanently deleted`);
          }

          const data = await fetchProjects();
          if (selectedProject) {
            await fetchProductBOM(selectedProject.product_id, data?.allParts, data?.allAssemblies);
          }
        } catch (error) {
          console.error("Error in bulk delete:", error);
          antMessage.error("Error performing bulk delete");
        }
      },
    });
  };

  const onCheck = (checkedKeys, info) => {
    setCheckedKeys(checkedKeys);
    
    const items = [];
    checkedKeys.forEach(key => {
      if (key.startsWith('part-')) {
        const partId = parseInt(key.replace('part-', ''));
        const part = allParts.find(p => p.id === partId);
        if (part) {
          items.push({ id: partId, type: 'part', ...part });
        }
      } else if (key.startsWith('assembly-')) {
        const assemblyId = parseInt(key.replace('assembly-', ''));
        const assembly = allAssemblies.find(a => a.id === assemblyId);
        if (assembly) {
          items.push({ id: assemblyId, type: 'assembly', ...assembly });
        }
      }
    });
    setSelectedItems(items);
  };

  const buildBOMTreeData = (data) => {
    if (!data) return [];
    
    const product = data.product;
    const assemblies = data.assemblies || [];
    const parts = data.parts || [];
    
    const treeData = [];
    
    // Product node
    const productChildren = [];
    
    // Add assemblies (only if in recycle bin or have children in recycle bin)
    assemblies.forEach(assembly => {
      const assemblyNode = buildAssemblyTreeNode(assembly);
      if (assemblyNode) {
        productChildren.push(assemblyNode);
      }
    });
    
    // Add direct parts (parts without assembly)
    parts.forEach(part => {
      if (!part.assembly_id) {
        productChildren.push({
          title: (
            <div className="flex items-center justify-between w-full pr-2">
              <span className="flex items-center gap-2">
                <span>{part.part_name}</span>
                <Tag color="blue" className="text-xs">{part.part_number}</Tag>
              </span>
              <div className="flex gap-1 items-center">
                <Button
                  type="text"
                  size="small"
                  icon={<UndoOutlined />}
                  onClick={(e) => { e.stopPropagation(); handleRestore(part, 'part'); }}
                  className="text-green-600"
                />
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={(e) => { e.stopPropagation(); handlePermanentDelete(part, 'part'); }}
                  className="text-red-600"
                />
              </div>
            </div>
          ),
          key: `part-${part.id}`,
          isLeaf: true,
        });
      }
    });
    
    // Only return product node if it has children in recycle bin
    if (treeData.length > 0 || productChildren.length > 0) {
      return [{
        title: (
          <div className="flex items-center gap-2">
            <span className="font-semibold">{product.product_name}</span>
          </div>
        ),
        key: `product-${product.id}`,
        children: [...treeData, ...productChildren],
        disableCheckbox: true,
      }];
    }
    
    return [];
  };

  const buildAssemblyTreeNode = (assembly) => {
    if (!assembly) return null;
    
    const children = [];
    
    // Add parts in this assembly
    if (assembly.parts && assembly.parts.length > 0) {
      assembly.parts.forEach(part => {
        children.push({
          title: (
            <div className="flex items-center justify-between w-full pr-2">
              <span className="flex items-center gap-2">
                <span>{part.part_name}</span>
                <Tag color="blue" className="text-xs">{part.part_number}</Tag>
              </span>
              <div className="flex gap-1 items-center">
                <Button
                  type="text"
                  size="small"
                  icon={<UndoOutlined />}
                  onClick={(e) => { e.stopPropagation(); handleRestore(part, 'part'); }}
                  className="text-green-600"
                />
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={(e) => { e.stopPropagation(); handlePermanentDelete(part, 'part'); }}
                  className="text-red-600"
                />
              </div>
            </div>
          ),
          key: `part-${part.id}`,
          isLeaf: true,
        });
      });
    }
    
    // Add child assemblies recursively
    if (assembly.child_assemblies && assembly.child_assemblies.length > 0) {
      assembly.child_assemblies.forEach(child => {
        const childNode = buildAssemblyTreeNode(child);
        if (childNode) {
          children.push(childNode);
        }
      });
    }
    
    // Only return assembly node if it's in recycle bin or has children
    if (assembly.recycle_bin || children.length > 0) {
      return {
        title: (
          <div className="flex items-center justify-between w-full pr-2">
            <span className="flex items-center gap-2">
              <span>{assembly.assembly_name}</span>
              <Tag color="orange" className="text-xs">{assembly.assembly_number}</Tag>
              {assembly.parent_assembly_name && (
                <Tag color="gray" className="text-xs">Sub-assembly of {assembly.parent_assembly_name}</Tag>
              )}
            </span>
            {assembly.recycle_bin && (
              <div className="flex gap-1 items-center">
                <Button
                  type="text"
                  size="small"
                  icon={<UndoOutlined />}
                  onClick={(e) => { e.stopPropagation(); handleRestore(assembly, 'assembly'); }}
                  className="text-green-600"
                />
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={(e) => { e.stopPropagation(); handlePermanentDelete(assembly, 'assembly'); }}
                  className="text-red-600"
                />
              </div>
            )}
          </div>
        ),
        key: `assembly-${assembly.id}`,
        children: children.length > 0 ? children : undefined,
      };
    }
    
    return null;
  };

  useEffect(() => {
    fetchProjects();
    
    // Handle responsive layout
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (bomData) {
      if (!searchText) {
        setFilteredBomData(bomData);
        setExpandedKeys(['product-' + bomData.product.id]);
      } else {
        // Filter the BOM tree based on search text and collect keys to expand
        const searchLower = searchText.toLowerCase();
        const keysToExpand = new Set(['product-' + bomData.product.id]);
        
        const filterAssembly = (assembly, parentKey) => {
          const filteredParts = [];
          if (assembly.parts) {
            assembly.parts.forEach(part => {
              if (part.recycle_bin && 
                  (part.part_name?.toLowerCase().includes(searchLower) ||
                   part.part_number?.toLowerCase().includes(searchLower))) {
                filteredParts.push(part);
                keysToExpand.add(parentKey);
              }
            });
          }
          
          const filteredChildAssemblies = [];
          if (assembly.child_assemblies) {
            assembly.child_assemblies.forEach(child => {
              const assemblyKey = `assembly-${child.id}`;
              const filteredChild = filterAssembly(child, assemblyKey);
              if (filteredChild) {
                filteredChildAssemblies.push(filteredChild);
                keysToExpand.add(assemblyKey);
              }
            });
          }
          
          const matchesName = assembly.assembly_name?.toLowerCase().includes(searchLower);
          const matchesNumber = assembly.assembly_number?.toLowerCase().includes(searchLower);
          const hasMatchingChildren = filteredParts.length > 0 || filteredChildAssemblies.length > 0;
          
          if (matchesName || matchesNumber) {
            keysToExpand.add(parentKey);
          }
          
          if (assembly.recycle_bin && (matchesName || matchesNumber || hasMatchingChildren)) {
            return {
              ...assembly,
              parts: filteredParts,
              child_assemblies: filteredChildAssemblies
            };
          }
          return null;
        };
        
        const filteredAssemblies = [];
        bomData.assemblies.forEach(assembly => {
          const assemblyKey = `assembly-${assembly.id}`;
          const filtered = filterAssembly(assembly, assemblyKey);
          if (filtered) {
            filteredAssemblies.push(filtered);
            keysToExpand.add(assemblyKey);
          }
        });
        
        const filteredParts = [];
        bomData.parts.forEach(part => {
          if (part.recycle_bin && 
              (part.part_name?.toLowerCase().includes(searchLower) ||
               part.part_number?.toLowerCase().includes(searchLower))) {
            filteredParts.push(part);
            keysToExpand.add('product-' + bomData.product.id);
          }
        });
        
        setExpandedKeys(Array.from(keysToExpand));
        setFilteredBomData({
          ...bomData,
          assemblies: filteredAssemblies,
          parts: filteredParts
        });
      }
    }
  }, [searchText, bomData]);

  const projectColumns = [
    {
      title: "Order Number",
      dataIndex: "sale_order_number",
      key: "sale_order_number",
    },
    {
      title: "Order Name",
      dataIndex: "product_name",
      key: "product_name",
    },
    {
      title: "Deleted Parts",
      dataIndex: "parts",
      key: "parts",
      render: (parts) => parts.length,
    },
    {
      title: "Deleted Assemblies",
      dataIndex: "assemblies",
      key: "assemblies",
      render: (assemblies) => assemblies.length,
    },
  ];

  return (
    <Layout style={{ height: '100vh' }}>
      {isMobile && (
        <Button
          icon={<MenuOutlined />}
          onClick={() => setSidebarVisible(true)}
          style={{ position: 'fixed', top: 16, left: 16, zIndex: 1000 }}
        />
      )}
      <Sider
        width="40%"
        style={{ background: '#fff', padding: '16px', borderRight: '1px solid #e0e0e0' }}
        breakpoint="lg"
        collapsedWidth={0}
        onBreakpoint={(broken) => {
          if (broken) {
            setSidebarVisible(false);
          }
        }}
      >
        <div className="flex justify-between items-center mb-4">
          <Title level={4} className="m-0">Orders</Title>
          {isMobile && (
            <Button
              type="text"
              icon={<MenuOutlined />}
              onClick={() => setSidebarVisible(false)}
            />
          )}
        </div>
        <Text type="secondary" className="block mb-4">
          Select an order to view its BOM with deleted items
        </Text>
        <Table
          columns={projectColumns}
          dataSource={projects}
          rowKey="product_id"
          pagination={false}
          size="small"
          scroll={{ x: 'max-content', y: 'calc(100vh - 200px)' }}
          onRow={(record) => ({
            onClick: () => {
              handleProjectClick(record);
              if (isMobile) {
                setSidebarVisible(false);
              }
            },
            style: {
              cursor: 'pointer',
              background: selectedProject?.product_id === record.product_id ? '#e6f7ff' : 'transparent',
            },
          })}
        />
      </Sider>
      <Drawer
        title="Orders"
        placement="left"
        onClose={() => setSidebarVisible(false)}
        open={sidebarVisible}
        size="large"
        styles={{ body: { padding: 0 } }}
      >
        <div style={{ padding: '16px' }}>
          <Title level={4} className="m-0 mb-4">Orders</Title>
          <Text type="secondary" className="block mb-4">
            Select an order to view its BOM with deleted items
          </Text>
          <Table
            columns={projectColumns}
            dataSource={projects}
            rowKey="product_id"
            pagination={false}
            size="small"
            scroll={{ x: 'max-content' }}
            onRow={(record) => ({
              onClick: () => {
                handleProjectClick(record);
                setSidebarVisible(false);
              },
              style: {
                cursor: 'pointer',
                background: selectedProject?.product_id === record.product_id ? '#e6f7ff' : 'transparent',
              },
            })}
          />
        </div>
      </Drawer>
      <Content style={{ padding: '16px', background: '#f5f5f5', overflow: 'auto', width: '60%' }}>
        {selectedProject ? (
          <div style={{ background: '#fff', padding: '16px', borderRadius: '8px', minHeight: '100%' }}>
            <div className="flex justify-between items-center mb-4">
              <div className="flex gap-2 items-center">
                <span className="text-sm text-gray-600">Selected: {selectedItems.length}</span>
                <Button
                  type="primary"
                  icon={<UndoOutlined />}
                  onClick={handleBulkRestore}
                  disabled={selectedItems.length === 0}
                  size="small"
                >
                  Restore Selected
                </Button>
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  onClick={handleBulkDelete}
                  disabled={selectedItems.length === 0}
                  size="small"
                >
                  Delete Selected
                </Button>
              </div>
              <Input
                placeholder="Search by name or number"
                prefix={<SearchOutlined />}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{ width: '100%', maxWidth: 300 }}
                allowClear
              />
            </div>
            {loading ? (
              <div className="flex justify-center items-center h-64">
                <Spin size="large" />
              </div>
            ) : filteredBomData ? (
              <div style={{ overflowX: 'auto' }}>
                <Tree
                  key={treeRefreshKey}
                  treeData={buildBOMTreeData(filteredBomData)}
                  defaultExpandAll
                  showLine
                  checkable
                  checkedKeys={checkedKeys}
                  onCheck={onCheck}
                  switcherIcon={({ expanded }) => expanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
                />
              </div>
            ) : (
              <Empty description="No BOM data available" />
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full">
            <Empty
              description="Select a project from the left panel to view its BOM"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          </div>
        )}
      </Content>
    </Layout>
  );
};

export default Recyclebin;
