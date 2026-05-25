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
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [allParts, setAllParts] = useState([]);
  const [allAssemblies, setAllAssemblies] = useState([]);

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
        return;
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
    } catch (error) {
      console.error("Error fetching projects:", error);
      antMessage.error("Failed to load projects");
    } finally {
      setLoading(false);
    }
  };

  const fetchProductBOM = async (productId) => {
    setLoading(true);
    try {
      // Filter parts and assemblies by product_id from the already fetched recycle-bin data
      const productParts = allParts.filter(part => part.product_id === productId);
      const productAssemblies = allAssemblies.filter(assembly => assembly.product_id === productId);
      
      // Need to fetch full hierarchy to get assembly structure
      // since parts may belong to assemblies not in recycle bin
      const hierarchyResponse = await axios.get(`${API_BASE_URL}/products/${productId}/hierarchical-lightweight`);
      const fullHierarchy = hierarchyResponse.data;
      
      // Build hierarchy structure from full hierarchy data
      // But only show parts that are in recycle bin
      const assemblyMap = {};
      const buildAssemblyMap = (assemblies) => {
        if (!assemblies) return;
        assemblies.forEach(assembly => {
          assemblyMap[assembly.id] = {
            ...assembly,
            parts: [],
            child_assemblies: []
          };
          if (assembly.child_assemblies) {
            buildAssemblyMap(assembly.child_assemblies);
          }
        });
      };
      
      buildAssemblyMap(fullHierarchy.assemblies || []);
      
      // Build parent-child relationships for assemblies
      const rootAssemblies = [];
      const buildTree = (assemblies, parentId = null) => {
        if (!assemblies) return;
        assemblies.forEach(assembly => {
          if (assemblyMap[assembly.id]) {
            if (parentId && assemblyMap[parentId]) {
              assemblyMap[parentId].child_assemblies.push(assemblyMap[assembly.id]);
            } else {
              rootAssemblies.push(assemblyMap[assembly.id]);
            }
            if (assembly.child_assemblies) {
              buildTree(assembly.child_assemblies, assembly.id);
            }
          }
        });
      };
      
      buildTree(fullHierarchy.assemblies || []);
      
      // Assign recycle bin parts to their assemblies
      productParts.forEach(part => {
        if (part.assembly_id && assemblyMap[part.assembly_id]) {
          assemblyMap[part.assembly_id].parts.push(part);
        }
      });
      
      // Build the final BOM structure
      const bomData = {
        product: {
          id: productId,
          product_name: selectedProject?.product_name || productParts[0]?.product_name || productAssemblies[0]?.product_name || fullHierarchy.product?.product_name || ''
        },
        parts: productParts.filter(part => !part.assembly_id), // Direct parts (no assembly)
        assemblies: rootAssemblies
      };
      
      setBomData(bomData);
      setFilteredBomData(bomData);
      setExpandedKeys(['product-' + productId]);
    } catch (error) {
      console.error("Error filtering BOM:", error);
      antMessage.error("Failed to load BOM");
    } finally {
      setLoading(false);
    }
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
          fetchProjects();
          if (selectedProject) {
            fetchProductBOM(selectedProject.product_id);
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
          fetchProjects();
          if (selectedProject) {
            fetchProductBOM(selectedProject.product_id);
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
      const assemblyChildren = [];
      
      // Add parts in assembly (only if in recycle bin)
      if (assembly.parts && assembly.parts.length > 0) {
        assembly.parts.forEach(part => {
          if (part.recycle_bin) {
            assemblyChildren.push({
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
                    <Tag color="red" className="text-xs">RECYCLE BIN</Tag>
                  </div>
                </div>
              ),
              key: `part-${part.id}`,
              isLeaf: true,
            });
          }
        });
      }
      
      // Add child assemblies recursively (only if in recycle bin or have children in recycle bin)
      if (assembly.child_assemblies && assembly.child_assemblies.length > 0) {
        assembly.child_assemblies.forEach(child => {
          const childData = buildAssemblyTreeNode(child);
          if (childData) {
            assemblyChildren.push(childData);
          }
        });
      }
      
      // Only add assembly if it's in recycle bin or has children in recycle bin
      if (assembly.recycle_bin || assemblyChildren.length > 0) {
        treeData.push({
          title: (
            <div className="flex items-center justify-between w-full pr-2">
              <span className="flex items-center gap-2">
                <span>{assembly.assembly_name}</span>
                <Tag color="orange" className="text-xs">{assembly.assembly_number}</Tag>
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
          children: assemblyChildren.length > 0 ? assemblyChildren : undefined,
        });
      }
    });
    
    // Add direct parts (only if in recycle bin)
    parts.forEach(part => {
      if (part.recycle_bin) {
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
        children: treeData.length > 0 ? treeData : (productChildren.length > 0 ? productChildren : undefined),
      }];
    }
    
    return [];
  };

  const buildAssemblyTreeNode = (assembly) => {
    if (!assembly) return null;
    
    const children = [];
    
    // Add parts in assembly (only if in recycle bin)
    if (assembly.parts && assembly.parts.length > 0) {
      assembly.parts.forEach(part => {
        if (part.recycle_bin) {
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
        }
      });
    }
    
    // Add child assemblies recursively (only if in recycle bin or have children in recycle bin)
    if (assembly.child_assemblies && assembly.child_assemblies.length > 0) {
      assembly.child_assemblies.forEach(child => {
        const childData = buildAssemblyTreeNode(child);
        if (childData) {
          children.push(childData);
        }
      });
    }
    
    // Only return assembly node if it's in recycle bin or has children in recycle bin
    if (assembly.recycle_bin || children.length > 0) {
      return {
        title: (
          <div className="flex items-center justify-between w-full pr-2">
            <span className="flex items-center gap-2">
              <span>{assembly.assembly_name}</span>
              <Tag color="orange" className="text-xs">{assembly.assembly_number}</Tag>
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
            <div className="flex justify-end mb-4">
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
                  treeData={buildBOMTreeData(filteredBomData)}
                  defaultExpandAll
                  showLine
                  switcherIcon={({ expanded }) => expanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
                  expandedKeys={expandedKeys}
                  onExpand={(keys) => setExpandedKeys(keys)}
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
