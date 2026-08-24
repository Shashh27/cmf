import React, { useState, useEffect } from "react";
import { DeleteOutlined, UndoOutlined, SearchOutlined, CaretDownOutlined, CaretRightOutlined, MenuOutlined } from "@ant-design/icons";
import { Table, Button, App, message, Modal, Typography, Tag, Empty, Spin, Input, Space, Layout, Tree, Drawer } from "antd";
import { api } from '../api/client.js';

const { Title, Text } = Typography;
const { Sider, Content } = Layout;

const Recyclebin = ({ orderId, productId = null, projectName = null, projectNumber = null }) => {
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
  const [flatAssemblies, setFlatAssemblies] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);
  const [checkedKeys, setCheckedKeys] = useState([]);

  const flattenAssemblies = (assemblies = []) => {
    const result = [];
    const walk = (items) => {
      items.forEach((assembly) => {
        result.push(assembly);
        if (assembly.child_assemblies?.length) {
          walk(assembly.child_assemblies);
        }
      });
    };
    walk(assemblies);
    return result;
  };

  const findAssemblyById = (assemblyId, assemblies = allAssemblies) => {
    for (const assembly of assemblies) {
      if (assembly.id === assemblyId) return assembly;
      if (assembly.child_assemblies?.length) {
        const found = findAssemblyById(assemblyId, assembly.child_assemblies);
        if (found) return found;
      }
    }
    return null;
  };

  const isPartRestoreBlocked = (part) => {
    if (!part?.assembly_id) return false;

    let assemblyId = part.assembly_id;
    while (assemblyId) {
      const assembly = flatAssemblies.find((item) => item.id === assemblyId);
      if (!assembly) break;
      if (assembly.recycle_bin) return true;
      assemblyId = assembly.parent_id;
    }
    return false;
  };

  const buildSelectedItems = (keys) => {
    const items = [];
    keys.forEach((key) => {
      if (key.startsWith("part-")) {
        const partId = parseInt(key.replace("part-", ""), 10);
        const part = allParts.find((item) => item.id === partId);
        if (part) items.push({ id: partId, type: "part", ...part });
      } else if (key.startsWith("assembly-")) {
        const assemblyId = parseInt(key.replace("assembly-", ""), 10);
        const assembly = flatAssemblies.find((item) => item.id === assemblyId);
        if (assembly) items.push({ id: assemblyId, type: "assembly", ...assembly });
      }
    });
    return items;
  };

  const collectAssemblyChildrenKeys = (assembly) => {
    const keys = [`assembly-${assembly.id}`];

    if (assembly.parts?.length) {
      assembly.parts.forEach((part) => {
        if (part.recycle_bin) keys.push(`part-${part.id}`);
      });
    }

    if (assembly.child_assemblies?.length) {
      assembly.child_assemblies.forEach((child) => {
        keys.push(...collectAssemblyChildrenKeys(child));
      });
    }

    return keys;
  };

  const getTopLevelAssemblies = (items) => {
    const assemblyItems = items.filter((item) => item.type === "assembly" && item.recycle_bin);
    const assemblyIds = new Set(assemblyItems.map((item) => item.id));

    return assemblyItems.filter((item) => {
      let parentId = item.parent_id;
      while (parentId) {
        if (assemblyIds.has(parentId)) return false;
        const parent = flatAssemblies.find((assembly) => assembly.id === parentId);
        parentId = parent?.parent_id;
      }
      return true;
    });
  };

  const getStandaloneParts = (items, assemblyIds) => {
    return items.filter((item) => {
      if (item.type !== "part") return false;
      if (!item.assembly_id) return true;
      if (assemblyIds.has(item.assembly_id)) return false;

      let assemblyId = item.assembly_id;
      while (assemblyId) {
        if (assemblyIds.has(assemblyId)) return false;
        const assembly = flatAssemblies.find((entry) => entry.id === assemblyId);
        assemblyId = assembly?.parent_id;
      }
      return true;
    });
  };

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

  const sameProduct = (itemProductId, targetId) =>
    itemProductId != null && targetId != null && Number(itemProductId) === Number(targetId);

  const countDeletedAssemblies = (assemblies = []) => {
    let count = 0;
    const walk = (items) => {
      items.forEach((assembly) => {
        if (assembly.recycle_bin) count += 1;
        if (assembly.child_assemblies?.length) walk(assembly.child_assemblies);
      });
    };
    walk(assemblies);
    return count;
  };

  const fetchProjects = async () => {
    setLoading(true);
    try {
      let url = `/recycle-bin/parts`;
      if (orderId) {
        url += `?order_id=${orderId}`;
      }
      
      const [response, ordersRes] = await Promise.all([
        api.get(url),
        api.get(`/orders/`).catch(() => ({ data: [] })),
      ]);
      let fetchedParts = response.data.parts || [];
      let fetchedAssemblies = response.data.assemblies || [];
      const orderInfo = response.data.order_info;

      // Scope to the current PDM product (same idea as admin orderId filter)
      const scopedProductId = productId != null ? Number(productId) : null;
      if (scopedProductId != null) {
        fetchedParts = fetchedParts.filter((p) => sameProduct(p.product_id, scopedProductId));
        fetchedAssemblies = fetchedAssemblies.filter((a) => sameProduct(a.product_id, scopedProductId));
      }
      
      setAllParts(fetchedParts);
      setAllAssemblies(fetchedAssemblies);
      setFlatAssemblies(flattenAssemblies(fetchedAssemblies));

      // Map product_id -> sale_order_number from orders + recycled parts
      // (assemblies API payload does not include sale_order_number)
      const saleOrderByProduct = {};
      const projectNameByProduct = {};
      const ordersList = Array.isArray(ordersRes?.data) ? ordersRes.data : (ordersRes?.data?.orders || []);
      ordersList.forEach((order) => {
        if (order?.product_id == null) return;
        const pid = Number(order.product_id);
        if (order.sale_order_number) saleOrderByProduct[pid] = order.sale_order_number;
        if (order.project_name || order.product_name) {
          projectNameByProduct[pid] = order.project_name || order.product_name;
        }
      });
      fetchedParts.forEach((part) => {
        if (part.product_id != null && part.sale_order_number) {
          saleOrderByProduct[Number(part.product_id)] = part.sale_order_number;
        }
      });

      const resolveSaleOrder = (pid) =>
        projectNumber ||
        saleOrderByProduct[Number(pid)] ||
        orderInfo?.sale_order_number ||
        '';
      const resolveProductName = (pid, fallback = '') =>
        projectName ||
        projectNameByProduct[Number(pid)] ||
        fallback ||
        orderInfo?.product_name ||
        '';
      
      if (orderInfo && fetchedParts.length === 0 && fetchedAssemblies.length === 0) {
        const emptyProject = {
          product_id: scopedProductId || orderInfo.product_id,
          product_name: projectName || orderInfo.product_name,
          sale_order_number: projectNumber || orderInfo.sale_order_number || resolveSaleOrder(orderInfo.product_id),
          project_name: projectName || orderInfo.product_name,
          parts: [],
          assemblies: []
        };
        setProjects([emptyProject]);
        setSelectedProject(emptyProject);
        setBomData({
          product: { id: emptyProject.product_id, product_name: emptyProject.product_name },
          parts: [],
          assemblies: []
        });
        setFilteredBomData({
          product: { id: emptyProject.product_id, product_name: emptyProject.product_name },
          parts: [],
          assemblies: []
        });
        return { allParts: fetchedParts, allAssemblies: fetchedAssemblies, orderInfo };
      }
      
      const projectMap = {};
      fetchedParts.forEach(part => {
        if (part.product_id != null) {
          const pid = Number(part.product_id);
          if (!projectMap[pid]) {
            projectMap[pid] = {
              product_id: pid,
              product_name: part.product_name || resolveProductName(pid),
              sale_order_number: part.sale_order_number || resolveSaleOrder(pid),
              project_name: part.project_name || part.product_name || resolveProductName(pid),
              parts: [],
              assemblies: []
            };
          }
          projectMap[pid].parts.push(part);
          if (part.sale_order_number) {
            projectMap[pid].sale_order_number = part.sale_order_number;
          }
          if (part.product_name && !projectMap[pid].product_name) {
            projectMap[pid].product_name = part.product_name;
          }
        }
      });
      
      fetchedAssemblies.forEach(assembly => {
        if (assembly.product_id != null) {
          const pid = Number(assembly.product_id);
          if (!projectMap[pid]) {
            projectMap[pid] = {
              product_id: pid,
              product_name: assembly.product_name || resolveProductName(pid),
              sale_order_number: resolveSaleOrder(pid),
              project_name: assembly.product_name || resolveProductName(pid),
              parts: [],
              assemblies: []
            };
          }
          projectMap[pid].assemblies.push(assembly);
          if (assembly.product_name && !projectMap[pid].product_name) {
            projectMap[pid].product_name = assembly.product_name;
          }
          if (!projectMap[pid].sale_order_number) {
            projectMap[pid].sale_order_number = resolveSaleOrder(pid);
          }
        }
      });
      
      const projectList = Object.values(projectMap);
      setProjects(projectList);

      if (scopedProductId != null) {
        const match =
          projectList.find((p) => sameProduct(p.product_id, scopedProductId)) ||
          (projectList.length === 0
            ? {
                product_id: scopedProductId,
                product_name: resolveProductName(scopedProductId),
                sale_order_number: resolveSaleOrder(scopedProductId),
                project_name: resolveProductName(scopedProductId),
                parts: [],
                assemblies: [],
              }
            : null);
        if (match) {
          if (projectList.length === 0) setProjects([match]);
          setSelectedProject(match);
          await fetchProductBOM(match.product_id, fetchedParts, fetchedAssemblies, match);
        }
      }
      
      return { allParts: fetchedParts, allAssemblies: fetchedAssemblies, orderInfo };
    } catch (error) {
      console.error("Error fetching projects:", error);
      antMessage.error("Failed to load projects");
    } finally {
      setLoading(false);
    }
  };

  const fetchProductBOM = async (targetProductId, partsData = null, assembliesData = null, projectOverride = null) => {
    setLoading(true);
    try {
      const sourceParts = partsData || allParts;
      const sourceAssemblies = assembliesData || allAssemblies;
      const productParts = sourceParts.filter(part => sameProduct(part.product_id, targetProductId));
      const productAssemblies = sourceAssemblies.filter(assembly => sameProduct(assembly.product_id, targetProductId));
      const directParts = productParts.filter(part => !part.assembly_id);

      const projectMeta = projectOverride || selectedProject;
      const bomData = {
        product: {
          id: Number(targetProductId),
          product_name:
            projectMeta?.product_name ||
            projectName ||
            productParts[0]?.product_name ||
            productAssemblies[0]?.product_name ||
            ''
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

  useEffect(() => {
    if (filteredBomData) {
      setTreeRefreshKey(prev => prev + 1);
    }
  }, [filteredBomData]);

  const handleProjectClick = (project) => {
    setSelectedProject(project);
    setCheckedKeys([]);
    setSelectedItems([]);
    fetchProductBOM(project.product_id, null, null, project);
  };

  const handleRestore = async (item, type) => {
    if (type === "part" && isPartRestoreBlocked(item)) {
      antMessage.error("Restore the parent assembly first before restoring this part.");
      return;
    }

    modal.confirm({
      title: `Restore ${type === 'part' ? 'Part' : 'Assembly'}`,
      content: `Are you sure you want to restore ${type === 'part' ? 'part' : 'assembly'} "${type === 'part' ? item.part_name : item.assembly_name}"?`,
      okText: "Yes",
      okType: "primary",
      cancelText: "No",
      onOk: async () => {
        try {
          if (type === 'part') {
            await api.post(`/recycle-bin/parts/${item.id}/restore`);
            antMessage.success(`Part "${item.part_name}" restored successfully`);
          } else {
            await api.post(`/recycle-bin/assemblies/${item.id}/restore`);
            antMessage.success(`Assembly "${item.assembly_name}" and all its parts restored successfully`);
          }
          setCheckedKeys([]);
          setSelectedItems([]);
          const data = await fetchProjects();
          if (selectedProject) {
            await fetchProductBOM(selectedProject.product_id, data?.allParts, data?.allAssemblies, selectedProject);
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
            await api.delete(`/recycle-bin/parts/${item.id}/permanent-delete`);
            antMessage.success(`Part "${item.part_name}" permanently deleted`);
          } else {
            await api.delete(`/recycle-bin/assemblies/${item.id}/permanent-delete`);
            antMessage.success(`Assembly "${item.assembly_name}" permanently deleted`);
          }
          setCheckedKeys([]);
          setSelectedItems([]);
          const data = await fetchProjects();
          if (selectedProject) {
            await fetchProductBOM(selectedProject.product_id, data?.allParts, data?.allAssemblies, selectedProject);
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
          const topAssemblies = getTopLevelAssemblies(selectedItems);
          const assemblyIds = new Set(topAssemblies.map((item) => item.id));
          const standaloneParts = getStandaloneParts(selectedItems, assemblyIds).filter(
            (item) => !isPartRestoreBlocked(item)
          );
          const blockedCount = getStandaloneParts(selectedItems, assemblyIds).length - standaloneParts.length;

          let successCount = 0;
          let errorCount = 0;

          for (const item of topAssemblies) {
            try {
              await api.post(`/recycle-bin/assemblies/${item.id}/restore`);
              successCount++;
            } catch (error) {
              errorCount++;
              console.error("Error restoring assembly:", error);
            }
          }

          for (const item of standaloneParts) {
            try {
              await api.post(`/recycle-bin/parts/${item.id}/restore`);
              successCount++;
            } catch (error) {
              errorCount++;
              console.error("Error restoring part:", error);
            }
          }

          setCheckedKeys([]);
          setSelectedItems([]);

          if (blockedCount > 0 && successCount === 0 && errorCount === 0) {
            antMessage.error("Selected parts cannot be restored until their parent assembly is restored.");
          } else if (errorCount > 0) {
            antMessage.warning(`${successCount} items restored, ${errorCount} failed`);
          } else {
            antMessage.success(`${successCount} items restored successfully`);
          }

          const data = await fetchProjects();
          if (selectedProject) {
            await fetchProductBOM(selectedProject.product_id, data?.allParts, data?.allAssemblies, selectedProject);
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
          const topAssemblies = getTopLevelAssemblies(selectedItems);
          const assemblyIds = new Set(topAssemblies.map((item) => item.id));
          const standaloneParts = getStandaloneParts(selectedItems, assemblyIds);

          let successCount = 0;
          let errorCount = 0;

          for (const item of topAssemblies) {
            try {
              await api.delete(`/recycle-bin/assemblies/${item.id}/permanent-delete`);
              successCount++;
            } catch (error) {
              errorCount++;
              console.error("Error deleting assembly:", error);
            }
          }

          for (const item of standaloneParts) {
            try {
              await api.delete(`/recycle-bin/parts/${item.id}/permanent-delete`);
              successCount++;
            } catch (error) {
              errorCount++;
              console.error("Error deleting part:", error);
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
            await fetchProductBOM(selectedProject.product_id, data?.allParts, data?.allAssemblies, selectedProject);
          }
        } catch (error) {
          console.error("Error in bulk delete:", error);
          antMessage.error("Error performing bulk delete");
        }
      },
    });
  };

  const onCheck = (checkedKeysValue, info) => {
    const keys = Array.isArray(checkedKeysValue)
      ? checkedKeysValue
      : checkedKeysValue.checked;

    if (info?.node?.key?.startsWith("assembly-") && info.checked) {
      const assemblyId = parseInt(info.node.key.replace("assembly-", ""), 10);
      const assembly = findAssemblyById(assemblyId);
      if (assembly) {
        const mergedKeys = Array.from(new Set([...keys, ...collectAssemblyChildrenKeys(assembly)]));
        setCheckedKeys(mergedKeys);
        setSelectedItems(buildSelectedItems(mergedKeys));
        return;
      }
    }

    setCheckedKeys(keys);
    setSelectedItems(buildSelectedItems(keys));
  };

  const buildBOMTreeData = (data) => {
    if (!data) return [];
    
    const product = data.product;
    const assemblies = data.assemblies || [];
    const parts = data.parts || [];
    
    const treeData = [];
    const productChildren = [];
    
    assemblies.forEach(assembly => {
      const assemblyNode = buildAssemblyTreeNode(assembly);
      if (assemblyNode) {
        productChildren.push(assemblyNode);
      }
    });
    
    parts.forEach(part => {
      if (!part.assembly_id && part.recycle_bin) {
        const restoreBlocked = isPartRestoreBlocked(part);
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
                  disabled={restoreBlocked}
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
          disableCheckbox: restoreBlocked,
        });
      }
    });
    
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
    
    if (assembly.parts && assembly.parts.length > 0) {
      assembly.parts.forEach(part => {
        if (!part.recycle_bin) return;
        const restoreBlocked = isPartRestoreBlocked(part);
        children.push({
          title: (
            <div className="flex items-center justify-between w-full pr-2">
              <span className="flex items-center gap-2">
                <span>{part.part_name}</span>
                <Tag color="blue" className="text-xs">{part.part_number}</Tag>
                {restoreBlocked && (
                  <Tag color="default" className="text-xs">Restore parent assembly first</Tag>
                )}
              </span>
              <div className="flex gap-1 items-center">
                <Button
                  type="text"
                  size="small"
                  icon={<UndoOutlined />}
                  disabled={restoreBlocked}
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
          disableCheckbox: restoreBlocked,
        });
      });
    }
    
    if (assembly.child_assemblies && assembly.child_assemblies.length > 0) {
      assembly.child_assemblies.forEach(child => {
        const childNode = buildAssemblyTreeNode(child);
        if (childNode) {
          children.push(childNode);
        }
      });
    }
    
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
    
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    
    return () => window.removeEventListener('resize', handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, orderId]);

  useEffect(() => {
    if (bomData) {
      if (!searchText) {
        setFilteredBomData(bomData);
        setExpandedKeys(['product-' + bomData.product.id]);
      } else {
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
      title: "Project Number",
      dataIndex: "sale_order_number",
      key: "sale_order_number",
    },
    {
      title: "Project Name",
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
      render: (assemblies) => countDeletedAssemblies(assemblies),
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
          <Title level={4} className="m-0">Projects</Title>
          {isMobile && (
            <Button
              type="text"
              icon={<MenuOutlined />}
              onClick={() => setSidebarVisible(false)}
            />
          )}
        </div>
        <Text type="secondary" className="block mb-4">
          Select a project to view its BOM with deleted items
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
              background: sameProduct(selectedProject?.product_id, record.product_id) ? '#e6f7ff' : 'transparent',
            },
          })}
        />
      </Sider>
      <Drawer
        title="Projects"
        placement="left"
        onClose={() => setSidebarVisible(false)}
        open={sidebarVisible}
        size="large"
        styles={{ body: { padding: 0 } }}
      >
        <div style={{ padding: '16px' }}>
          <Title level={4} className="m-0 mb-4">Projects</Title>
          <Text type="secondary" className="block mb-4">
            Select a project to view its BOM with deleted items
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
                background: sameProduct(selectedProject?.product_id, record.product_id) ? '#e6f7ff' : 'transparent',
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
