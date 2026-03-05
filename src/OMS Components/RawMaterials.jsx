import React, { useState, useEffect, useRef } from "react";
import { API_BASE_URL } from "../Config/auth";
import { Table, Button, Tabs, Badge, Modal, Form, Input, InputNumber,Select, Typography, Space, Spin, Empty, 
  message, Checkbox, Row, Col, Tooltip, Card, Tag } from "antd";
import { CaretDownOutlined,CaretRightOutlined,AppstoreOutlined,CodeSandboxOutlined,EditOutlined,DeleteOutlined,PlusOutlined,
  BlockOutlined,FileTextOutlined,InfoCircleOutlined,ExperimentOutlined,LinkOutlined,SafetyCertificateOutlined,CheckOutlined,CloseOutlined,SearchOutlined } from "@ant-design/icons";
import { RawMaterialsInventoryPdfDownload, PartsWithRawMaterialsStatusPdfDownload } from "../DownloadReports/RawMaterialsPdfDownload";

const { Title, Text } = Typography;
const { Option } = Select;

const RawMaterials = () => {
  const [form] = Form.useForm();
  const [orders, setOrders] = useState([]);
  const [orderBomMap, setOrderBomMap] = useState({});
  const [rawMaterials, setRawMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bomLoadingMap, setBomLoadingMap] = useState({});
  const [expandedOrders, setExpandedOrders] = useState({});
  const [expandedAssemblies, setExpandedAssemblies] = useState({});
  const [selectedPartsByOrder, setSelectedPartsByOrder] = useState({});
  const [selectedRawMaterialIds, setSelectedRawMaterialIds] = useState({});
  const [rawMaterialModalOpen, setRawMaterialModalOpen] = useState(false);
  const [editingRawMaterial, setEditingRawMaterial] = useState(null);
  const [savingRawMaterial, setSavingRawMaterial] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkedMaterials, setLinkedMaterials] = useState([]);
  const [linkedMaterialsLoading, setLinkedMaterialsLoading] = useState(false);

  // Lazy loading states
  const [activeTab, setActiveTab] = useState("raw-materials");
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [hasFetchedOrders, setHasFetchedOrders] = useState(false);
  const [hasFetchedRawMaterials, setHasFetchedRawMaterials] = useState(false);

  // Refs to track ongoing fetches
  const fetchingRawMaterials = useRef(false);
  const fetchingOrders = useRef(false);
  const fetchingLinkedMaterials = useRef(false);

  const [rawMaterialsPagination, setRawMaterialsPagination] = useState({ current: 1, pageSize: 15 });
  const [linkedMaterialsPagination, setLinkedMaterialsPagination] = useState({ current: 1, pageSize: 15 });
  const [inlineEditRow, setInlineEditRow] = useState(null);
  const [statusEditRowId, setStatusEditRowId] = useState(null);
  const [statusEditValue, setStatusEditValue] = useState(null);
  const [orderValuesByMaterial, setOrderValuesByMaterial] = useState({});
  const [searchText, setSearchText] = useState("");
  const [orderSearchText, setOrderSearchText] = useState("");
  const [linkedMaterialsSearchText, setLinkedMaterialsSearchText] = useState("");

  const [statusEditOrderKg, setStatusEditOrderKg] = useState(null);
  const [statusEditOrderQty, setStatusEditOrderQty] = useState(null);
  const [statusEditCurrentLinkages, setStatusEditCurrentLinkages] = useState([]);
  const [statusEditPartsToRemove, setStatusEditPartsToRemove] = useState([]);
  const [statusEditPartsToAdd, setStatusEditPartsToAdd] = useState([]);
  const [statusEditAvailableParts, setStatusEditAvailableParts] = useState([]);
  const [orderHierarchyMap, setOrderHierarchyMap] = useState({});
  const [decimalWarnings, setDecimalWarnings] = useState({});
  const [selectedStockType, setSelectedStockType] = useState("");
  const [isCustomStockType, setIsCustomStockType] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      if (activeTab === "raw-materials") {
        if (!hasFetchedRawMaterials) {
          await fetchRawMaterials();
          setHasFetchedRawMaterials(true);
        }
      } else if (activeTab === "linking") {
        if (!hasFetchedOrders) {
          await fetchOrders();
          setHasFetchedOrders(true);
        }
        if (!hasFetchedRawMaterials) {
          await fetchRawMaterials();
          setHasFetchedRawMaterials(true);
        }
      } else if (activeTab === "order-status") {
        await fetchLinkedMaterials();
      }
    };
    loadData();
  }, [activeTab]);

  const fetchOrders = async () => {
    if (fetchingOrders.current) return;
    fetchingOrders.current = true;
    setOrdersLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/orders/`);
      if (response.ok) {
        const data = await response.json();
        setOrders(data);
      } else {
        setOrders([]);
      }
    } catch (error) {
      console.error("Error fetching orders:", error);
      setOrders([]);
    } finally {
      setOrdersLoading(false);
      fetchingOrders.current = false;
    }
  };

  const fetchRawMaterials = async () => {
    if (fetchingRawMaterials.current) return;
    fetchingRawMaterials.current = true;
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/rawmaterials/`);
      if (response.ok) {
        const data = await response.json();
        setRawMaterials(Array.isArray(data) ? data : []);
      } else {
        setRawMaterials([]);
      }
    } catch (error) {
      console.error("Error fetching raw materials:", error);
      setRawMaterials([]);
    } finally {
      setLoading(false);
      fetchingRawMaterials.current = false;
    }
  };

  const fetchLinkedMaterials = async () => {
    if (fetchingLinkedMaterials.current) return;
    fetchingLinkedMaterials.current = true;
    setLinkedMaterialsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/order-parts-raw-material-linked/`);
      if (response.ok) {
        const data = await response.json();
        setLinkedMaterials(data);
      }
    } catch (error) {
      console.error("Error fetching linked materials:", error);
    } finally {
      setLinkedMaterialsLoading(false);
      fetchingLinkedMaterials.current = false;
    }
  };

  const openCreateRawMaterial = () => {
    setEditingRawMaterial(null);
    setSelectedStockType("");
    setIsCustomStockType(false);
    form.resetFields();
    setRawMaterialModalOpen(true);
  };

  const openEditRawMaterial = (material) => {
    setEditingRawMaterial(material);
    const stockType = material.stock_type || "";
    const isCustom = !["Sheet Metal", "Rod", "Solid Bar"].includes(stockType);
    setSelectedStockType(isCustom ? "Other" : stockType);
    setIsCustomStockType(isCustom);
    form.setFieldsValue({
      material_name: material.material_name || "",
      material_specification: material.material_specification || "",
      mass: material.mass ?? "",
      density: material.density ?? "",
      volume: material.volume ?? "",
      stock_type: isCustom ? stockType : stockType,
      quantity: material.quantity ?? "",
      stock_dimensions: material.stock_dimensions || "",
    });
    setRawMaterialModalOpen(true);
  };

  const closeRawMaterialModal = () => {
    setRawMaterialModalOpen(false);
    setEditingRawMaterial(null);
    setSelectedStockType("");
    setIsCustomStockType(false);
  };

  const limitDecimals = (value, fieldName, precision = 3) => {
    if (value === null || value === undefined || value === '') return value;
    const cleaned = String(value).replace(/[^0-9.]/g, '');
    let str = cleaned;
    if (precision === 0) {
      str = str.replace(/\./g, '');
      if (str.length > 5) {
        showDecimalWarning(fieldName, 0, 'Max 5 digits allowed');
        return str.slice(0, 5);
      }
      return str;
    }

    if (str.includes('.')) {
      const [int, dec] = str.split('.');
      if (dec.length > precision) {
        showDecimalWarning(fieldName, precision);
        return `${int}.${dec.slice(0, precision)}`;
      }
      return str;
    }
    return str;
  };

  const showDecimalWarning = (fieldName, precision, customMsg) => {
    if (!fieldName) return;
    const msg = customMsg ?? (precision === 0 ? "Only whole numbers allowed" : `Max ${precision} decimal places allowed`);
    setDecimalWarnings(prev => ({ ...prev, [fieldName]: msg }));
    setTimeout(() => {
      setDecimalWarnings(prev => ({ ...prev, [fieldName]: null }));
    }, 3000);
  };

  const blockExtraDecimals = (e, fieldName, precision = 3) => {
    const { value } = e.target;
    const forbiddenKeys = ['-', '+', 'e', 'E', '@', '#', '$', '%', '&', '*', '(', ')', '_', '=', '<', '>', '/', '?', ';', ':', '"', "'", '[', ']', '{', '}', '|', '\\', '`', '~'];
    if (forbiddenKeys.includes(e.key)) {
      e.preventDefault();
      return;
    }
    if (precision === 0 && e.key === '.') {
      showDecimalWarning(fieldName, 0);
      e.preventDefault();
      return;
    }
    if (precision === 0 && /[0-9]/.test(e.key)) {
      const digitsOnly = String(value).replace(/\D/g, '');
      const hasSelection = e.target.selectionStart !== e.target.selectionEnd;
      if (digitsOnly.length >= 5 && !hasSelection) {
        showDecimalWarning(fieldName, 0, 'Max 5 digits allowed');
        e.preventDefault();
        return;
      }
    }
    const allowedKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Escape', 'Control', '.', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    if (!allowedKeys.includes(e.key) && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      return;
    }
    if (e.key === '.' && value.includes('.')) {
      e.preventDefault();
      return;
    }
    if (value.includes('.')) {
      const parts = value.split('.');
      const selectionStart = e.target.selectionStart;
      const dotIndex = value.indexOf('.');
      if (selectionStart > dotIndex && parts[1].length >= precision) {
        if (e.target.selectionStart === e.target.selectionEnd) {
          showDecimalWarning(fieldName, precision);
          e.preventDefault();
        }
      }
    }
  };

  const handleSaveRawMaterial = async (values) => {
    setSavingRawMaterial(true);

    try {
      const isEdit = !!editingRawMaterial?.id;
      const url = isEdit
        ? `${API_BASE_URL}/rawmaterials/${editingRawMaterial.id}`
        : `${API_BASE_URL}/rawmaterials/`;
      const method = isEdit ? "PUT" : "POST";

      const payload = {
        material_name: values.material_name,
        material_specification: values.material_specification,
        mass: values.mass === "" ? 0 : Number(values.mass) || 0,
        density: values.density === "" ? 0 : Number(values.density) || 0,
        volume: values.volume === "" ? 0 : Number(values.volume) || 0,
        stock_type: values.stock_type,
        quantity: values.quantity === "" ? 0 : Number(values.quantity) || 0,
        stock_dimensions: values.stock_dimensions,
      };

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        await fetchRawMaterials();
        message.success(
          isEdit ? "Raw material updated successfully" : "Raw material created successfully"
        );
        closeRawMaterialModal();
      } else {
        message.error("Failed to save raw material");
      }
    } catch (error) {
      console.error("Error saving raw material:", error);
      message.error("Error saving raw material");
    } finally {
      setSavingRawMaterial(false);
    }
  };

  const startInlineEdit = (record) => {
    if (!record?.id) return;
    const existing = orderValuesByMaterial[record.id] || {};
    setInlineEditRow({
      id: record.id,
      mass: existing.order_mass ?? record.mass ?? 0,
      quantity: existing.order_quantity ?? 0,
    });
  };

  const cancelInlineEdit = () => {
    setInlineEditRow(null);
  };

  const changeInlineEdit = (field, value) => {
    setInlineEditRow((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const saveInlineEdit = (record) => {
    if (!inlineEditRow || inlineEditRow.id !== record.id || !record?.id) return;

    const order_mass =
      inlineEditRow.mass === "" ||
      inlineEditRow.mass === null ||
      inlineEditRow.mass === undefined
        ? 0
        : Number(inlineEditRow.mass) || 0;

    const order_quantity =
      inlineEditRow.quantity === "" ||
      inlineEditRow.quantity === null ||
      inlineEditRow.quantity === undefined
        ? 0
        : Number(inlineEditRow.quantity) || 0;

    setOrderValuesByMaterial((prev) => ({
      ...prev,
      [record.id]: {
        order_mass,
        order_quantity,
      },
    }));

    setInlineEditRow(null);
    message.success("Order Kg and Qty captured for this material");
  };

  const handleDeleteLinkGroup = (record) => {
    const ids = record.linkage_ids || [];
    if (!ids.length) {
      message.warning("No linked records found to delete.");
      return;
    }

    Modal.confirm({
      title: 'Confirm Delete',
      content: 'Are you sure you want to remove this material from the order and parts?',
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const responses = await Promise.all(
            ids.map((id) =>
              fetch(`${API_BASE_URL}/order-parts-raw-material-linked/${id}`, {
                method: "DELETE",
              })
            )
          );

          const allOk = responses.every((res) => res.ok);
          if (allOk) {
            await fetchLinkedMaterials();
            message.success("Linked material removed successfully");
          } else {
            message.error("Failed to delete linked material");
          }
        } catch (error) {
          console.error("Error deleting linked material:", error);
          message.error("Error deleting linked material");
        }
      },
    });
  };

  // Flatten all IN-House parts for an order from /orders/{id}/hierarchical response
  const flattenPartsFromOrderHierarchy = (orderHierarchy) => {
    if (!orderHierarchy || !orderHierarchy.product_hierarchy) return [];
    const { assemblies = [], direct_parts = [] } = orderHierarchy.product_hierarchy || {};
    const parts = [];

    const visitAssemblies = (assemblyDetailsList) => {
      (assemblyDetailsList || []).forEach((ad) => {
        const assemblyParts = ad.parts || [];
        assemblyParts.forEach((pd) => {
          const p = pd.part || pd;
          if (p && p.id && (!p.type_name || p.type_name === "IN-House")) {
            parts.push(p);
          }
        });
        const subs = ad.subassemblies || [];
        if (subs.length) visitAssemblies(subs);
      });
    };

    visitAssemblies(assemblies);

    (direct_parts || []).forEach((pd) => {
      const p = pd.part || pd;
      if (p && p.id && (!p.type_name || p.type_name === "IN-House")) {
        parts.push(p);
      }
    });

    return parts;
  };


  const handleDeleteRawMaterial = async (material) => {
    Modal.confirm({
      title: 'Confirm Delete',
      content: `Are you sure you want to delete raw material "${material.material_name}"?`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const response = await fetch(
            `${API_BASE_URL}/rawmaterials/${material.id}`,
            {
              method: "DELETE",
            }
          );
          if (response.ok) {
            await fetchRawMaterials();
            message.success("Raw material deleted successfully");
          } else {
            message.error("Failed to delete raw material");
          }
        } catch (error) {
          console.error("Error deleting raw material:", error);
          message.error("Error deleting raw material");
        }
      }
    });
  };

  const fetchOrderBom = async (orderId, productId) => {
    setBomLoadingMap((prev) => ({ ...prev, [orderId]: true }));
    try {
      const response = await fetch(`${API_BASE_URL}/products/${productId}/hierarchical`);
      if (response.ok) {
        const data = await response.json();
        setOrderBomMap((prev) => ({ ...prev, [orderId]: data }));
        setExpandedAssemblies((prev) => {
          const next = { ...prev };
          (data.assemblies || []).forEach((a) => {
            const assembly = a.assembly || a;
            if (assembly?.id) next[assembly.id] = true;
          });
          return next;
        });
      } else {
        setOrderBomMap((prev) => ({ ...prev, [orderId]: null }));
      }
    } catch (error) {
      console.error("Error fetching BOM:", error);
      setOrderBomMap((prev) => ({ ...prev, [orderId]: null }));
    } finally {
      setBomLoadingMap((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  const toggleOrderExpand = (order) => {
    const isExpanded = expandedOrders[order.id];
    setExpandedOrders((prev) => ({ ...prev, [order.id]: !prev[order.id] }));
    if (!isExpanded && order.product_id && !orderBomMap[order.id]) {
      fetchOrderBom(order.id, order.product_id);
    }
  };

  const toggleAssemblyExpand = (assemblyId) => {
    setExpandedAssemblies((prev) => ({ ...prev, [assemblyId]: !prev[assemblyId] }));
  };

  const togglePartSelection = (orderId, partId) => {
    setSelectedPartsByOrder((prev) => {
      const current = prev[orderId] || {};
      return {
        ...prev,
        [orderId]: {
          ...current,
          [partId]: !current[partId],
        },
      };
    });
  };

  const renderPart = (partDetails, level = 0, orderId) => {
    const part = partDetails.part || partDetails;
    if (!part || !part.id) return null;
    
    // Filter out Out-Source parts, only show IN-House parts
    if (part.type_name === "Out-Source") return null;
    
    const isSelected = selectedPartsByOrder[orderId]?.[part.id];
    return (
      <div
        key={part.id}
        className={`
          flex items-center gap-2 px-3 py-2.5 rounded-lg transition-all duration-200
          ${isSelected 
            ? 'bg-gradient-to-r from-blue-50 to-blue-100 border-l-4 border-blue-500 shadow-sm' 
            : 'hover:bg-gray-50 border-l-4 border-transparent'
          }
        `}
        style={{ marginLeft: `${level * 20}px` }}
      >
        <Checkbox
          checked={!!isSelected}
          onChange={() => togglePartSelection(orderId, part.id)}
          className="mr-2"
        />
        <CodeSandboxOutlined className="text-green-500" />
        <div className="flex flex-col">
            <Text className="font-medium text-gray-800 leading-tight">{part.part_number}</Text>
            <Text className="text-gray-500 text-xs">{part.part_name}</Text>
        </div>
      </div>
    );
  };

  const renderAssembly = (assemblyDetails, level = 0, orderId) => {
    const assembly = assemblyDetails.assembly || assemblyDetails;
    if (!assembly || !assembly.id) return null;
    const parts = assemblyDetails.parts || [];
    const subassemblies = assemblyDetails.subassemblies || [];
    const hasChildren = parts.length > 0 || subassemblies.length > 0;
    const isExpanded = expandedAssemblies[assembly.id];

    return (
      <div key={assembly.id} className="mb-1">
        <div
          className={`
            flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200
            ${hasChildren && isExpanded 
                ? 'bg-gradient-to-r from-gray-50 to-gray-100 border-l-4 border-gray-400' 
                : 'hover:bg-gray-50 border-l-4 border-transparent'
            }
          `}
          style={{ marginLeft: `${level * 20}px` }}
          onClick={() => hasChildren && toggleAssemblyExpand(assembly.id)}
        >
          <div className="flex-shrink-0 w-6">
            {hasChildren && (
              <Button 
                type="text" 
                size="small" 
                icon={isExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
                className="text-blue-500 hover:bg-blue-100 rounded-md"
              />
            )}
          </div>
          <BlockOutlined className="text-blue-500" />
          <div className="flex flex-col">
            <Text className="font-medium text-gray-800 leading-tight">{assembly.assembly_number}</Text>
            <Text className="text-gray-500 text-xs">{assembly.assembly_name}</Text>
          </div>
        </div>
        {isExpanded && (
          <div className="mt-1">
            {parts.map((p) => renderPart(p, level + 1, orderId))}
            {subassemblies.map((s) => renderAssembly(s, level + 1, orderId))}
          </div>
        )}
      </div>
    );
  };

  const renderOrderBom = (order) => {
    const bomData = orderBomMap[order.id];
    const isLoading = bomLoadingMap[order.id];

    if (isLoading) {
      return (
        <div className="p-4 ml-6 text-gray-500 flex items-center gap-2">
          <Spin size="small" /> Loading BOM...
        </div>
      );
    }
    if (!bomData) {
      return (
        <div className="p-4 ml-6 text-gray-400 italic">
          No BOM data available
        </div>
      );
    }

    const product = bomData.product;
    const assemblies = bomData.assemblies || [];
    const directParts = bomData.direct_parts || [];

    return (
      <div className="pl-4 border-l-2 border-gray-200 ml-4 mt-2 mb-2 space-y-1">
        {product && (
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 mb-2">
            <AppstoreOutlined className="text-indigo-600" />
            <Text className="font-bold text-gray-800">{product.product_number}</Text>
            <Text className="text-gray-500 text-sm">{product.product_name}</Text>
          </div>
        )}
        {assemblies.map((a) => renderAssembly(a, 0, order.id))}
        {directParts.map((p) => renderPart(p, 0, order.id))}
      </div>
    );
  };

  const renderOrderTree = () => {
    return (
      <div className="p-2 space-y-1">
        {filteredOrders.map((order) => {
          const isExpanded = expandedOrders[order.id];
          const hasProduct = !!order.product_id;

          return (
            <div key={order.id} className="mb-1">
              <div
                className={`
                  flex items-center gap-2 px-4 py-3 rounded-lg cursor-pointer transition-all duration-200
                  ${isExpanded 
                    ? 'bg-gradient-to-r from-indigo-50 to-indigo-100 border-l-4 border-indigo-500 shadow-sm' 
                    : 'hover:bg-gray-50 border-l-4 border-transparent'
                  }
                `}
                onClick={() => toggleOrderExpand(order)}
              >
                <div className="w-6 flex-shrink-0">
                  {hasProduct && (
                    <Button
                      type="text"
                      size="small"
                      icon={isExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
                      className="text-indigo-500 hover:bg-indigo-100 rounded-md"
                    />
                  )}
                </div>
                <div className={`w-2 h-2 rounded-full mr-2 ${isExpanded ? 'bg-indigo-500' : 'bg-gray-400'}`} />
                <Text className={`font-medium ${isExpanded ? 'text-indigo-800' : 'text-gray-800'}`}>
                    {order.sale_order_number}
                </Text>
              </div>
              {isExpanded && renderOrderBom(order)}
            </div>
          );
        })}
        {filteredOrders.length === 0 && !ordersLoading && (
          <Empty description={orderSearchText ? "No orders found matching your search" : "No orders found"} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
        {ordersLoading && (
          <div className="py-12 flex justify-center">
            <Spin size="large" />
          </div>
        )}
      </div>
    );
  };

  const handleSubmitLinks = async () => {
    const orderPartSelections = Object.entries(selectedPartsByOrder || {})
      .map(([orderId, partMap]) => {
        const partIds = Object.keys(partMap || {})
          .filter((id) => partMap[id])
          .map((id) => Number(id));
        return {
          orderId: Number(orderId),
          partIds,
        };
      })
      .filter((item) => item.partIds.length > 0);

    if (!orderPartSelections.length) {
      message.warning("Please select at least one part.");
      return;
    }

    const rawMaterialIds = Object.keys(selectedRawMaterialIds)
      .filter((id) => selectedRawMaterialIds[id])
      .map((id) => Number(id));

    if (rawMaterialIds.length === 0) {
      message.warning("Please select at least one raw material.");
      return;
    }

    const allPartIds = [];
    orderPartSelections.forEach((item) => {
      allPartIds.push(...item.partIds);
    });
    const uniquePartIds = Array.from(new Set(allPartIds));

    const isManyParts = uniquePartIds.length > 1;
    const isManyMaterials = rawMaterialIds.length > 1;

    if (isManyParts && isManyMaterials) {
      message.error("Adding many parts to many raw materials is not allowed.");
      return;
    }

    const order_quantities = {};
    const order_masses = {};

    rawMaterialIds.forEach((id) => {
      const vals = orderValuesByMaterial[id];
      if (vals) {
        if (vals.order_quantity !== undefined && vals.order_quantity !== null) {
          order_quantities[id] = Number(vals.order_quantity) || 0;
        }
        if (vals.order_mass !== undefined && vals.order_mass !== null) {
          order_masses[id] = Number(vals.order_mass) || 0;
        }
      }
    });

    setLinking(true);
    try {
      const linkageGroupId = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID().replace(/-/g, "")
        : `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      const responses = await Promise.all(
        orderPartSelections.map(({ orderId, partIds }) => {
          if (!partIds.length) {
            return null;
          }
          return fetch(
            `${API_BASE_URL}/order-parts-raw-material-linked/bulk`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                raw_material_ids: rawMaterialIds,
                part_ids: partIds,
                order_id: orderId,
                order_quantities,
                order_masses,
                linkage_group_id: linkageGroupId,
              }),
            }
          );
        })
      );

      const validResponses = responses.filter((res) => !!res);
      const allOk =
        validResponses.length > 0 &&
        validResponses.every((res) => res && res.ok);

      if (allOk) {
        message.success("Raw Materials added Successfully.");
      } else {
        message.error("Adding failed. Please check your selections and try again.");
      }
    } catch (error) {
      console.error("Error Adding parts and raw materials:", error);
      message.error("Error while Adding. Please try again.");
    } finally {
      setLinking(false);
    }
  };

  const renderLinkedMaterialsTable = () => {
    const groupedMap = {};
    filteredLinkedMaterials.forEach((item) => {
      if (!item) return;
      const materialId = item.raw_material_id ?? "no-material";
      const orderId = item.order_id ?? "no-order";
      const groupId = item.linkage_group_id || null;
      const groupKey = groupId ? `${groupId}-${orderId}` : `order-${orderId}`;
      const key = `${materialId}-${groupKey}`;

      if (!groupedMap[key]) {
        groupedMap[key] = {
          id: key,
          raw_material_id: item.raw_material_id,
          order_id: item.order_id,
          linkage_group_id: item.linkage_group_id || null,
          sale_order_number: item.sale_order_number,
          project_name: item.project_name,
          material_name: item.material_name,
          quantity: item.order_quantity,
          mass: item.mass,
          material_status: item.material_status,
          part_numbers: [],
          part_names: [],
          linkage_ids: [],
          first_created_at: item.created_at || null,
        };
      }

      const g = groupedMap[key];
      if (item.part_number && !g.part_numbers.includes(item.part_number)) {
        g.part_numbers.push(item.part_number);
      }
      if (item.part_name && !g.part_names.includes(item.part_name)) {
        g.part_names.push(item.part_name);
      }
      if (item.id != null) {
        g.linkage_ids.push(item.id);
      }
    });

    const groupedData = Object.values(groupedMap).sort((a, b) => {
      const aTime = a.first_created_at ? new Date(a.first_created_at).getTime() : 0;
      const bTime = b.first_created_at ? new Date(b.first_created_at).getTime() : 0;
      if (aTime !== bTime) return aTime - bTime;
      const aMat = a.raw_material_id ?? 0;
      const bMat = b.raw_material_id ?? 0;
      if (aMat !== bMat) return aMat - bMat;
      const aOrder = a.order_id ?? 0;
      const bOrder = b.order_id ?? 0;
      return aOrder - bOrder;
    });

    const getMaterialRowSpan = (record, index) => {
      if (!groupedData.length) return 1;
      const prev = groupedData[index - 1];
      const sameBatch = prev && prev.raw_material_id === record.raw_material_id && prev.linkage_group_id === record.linkage_group_id;
      if (sameBatch) return 0;
      let rowSpan = 1;
      for (let i = index + 1; i < groupedData.length; i++) {
        const next = groupedData[i];
        if (next.raw_material_id === record.raw_material_id && next.linkage_group_id === record.linkage_group_id) {
          rowSpan++;
        } else {
          break;
        }
      }
      return rowSpan;
    };

    const columns = [
      {
        title: <span className="font-semibold text-gray-700">SL NO</span>,
        key: 'index',
        width: 80,
        render: (_, __, index) => <span className="text-gray-500 font-mono">{index + 1}</span>,
      },
      {
        title: <span className="font-semibold text-gray-700">Project Number</span>,
        dataIndex: 'sale_order_number',
        key: 'sale_order_number',
        render: (text) => <span className="font-mono text-gray-700">{text}</span>
      },
      {
        title: <span className="font-semibold text-gray-700">Project Name</span>,
        dataIndex: 'project_name',
        key: 'project_name',
        ellipsis: true,
        render: (text) => text || <span className="text-gray-400">-</span>,
      },
      {
        title: <span className="font-semibold text-gray-700">Part Number</span>,
        dataIndex: 'part_numbers',
        key: 'part_number',
        ellipsis: true,
        render: (values, record) => {
          const isEditing = statusEditRowId === record.id;
          if (!isEditing) {
            if (!values || values.length === 0) {
              return <span className="text-gray-400">-</span>;
            }
            return (
              <Space size="small" wrap>
                {values.map((val, idx) => (
                  <Tag key={idx} color="geekblue">
                    {val}
                  </Tag>
                ))}
              </Space>
            );
          }

          const currentParts = statusEditCurrentLinkages.filter(
            (l) =>
              l.raw_material_id === record.raw_material_id &&
              l.order_id === record.order_id &&
              (l.linkage_group_id || null) === (record.linkage_group_id || null) &&
              !statusEditPartsToRemove.includes(l.id)
          );

          return (
            <div className="flex flex-col gap-2" style={{ minWidth: 220 }}>
              <div className="flex flex-wrap gap-1">
                {currentParts.map((l) => (
                  <Tag
                    key={l.id}
                    color="geekblue"
                    closable
                    onClose={(e) => {
                      e.preventDefault();
                      setStatusEditPartsToRemove((prev) =>
                        prev.includes(l.id) ? prev : [...prev, l.id]
                      );
                    }}
                    className="flex items-center text-xs"
                  >
                    {l.part_number}
                    <Tooltip title={l.part_name}><span className="ml-1 font-mono text-gray-500">({l.part_name.slice(0,5)}...)</span></Tooltip>
                  </Tag>
                ))}
                {currentParts.length === 0 && (
                  <span className="text-gray-400 text-xs italic">No parts linked</span>
                )}
              </div>
              
              {statusEditAvailableParts.length > 0 && (
                <div className="border-t border-gray-200 pt-2 mt-1">
                  <span className="text-gray-500 text-xs font-semibold block mb-1.5">
                    Add parts from order:
                  </span>
                  <Select
                    mode="multiple"
                    size="small"
                    style={{ width: '100%' }}
                    placeholder="Select parts to add"
                    value={statusEditPartsToAdd}
                    onChange={(vals) => setStatusEditPartsToAdd(vals)}
                    dropdownMatchSelectWidth={false}
                    popupClassName="w-auto min-w-[250px]"
                  >
                    {statusEditAvailableParts.map((p) => (
                      <Option key={p.id} value={p.id}>
                        <div className="flex flex-col leading-tight">
                          <span className="font-medium">{p.part_number}</span>
                          <span className="text-gray-500 text-xs">{p.part_name}</span>
                        </div>
                      </Option>
                    ))}
                  </Select>
                </div>
              )}
            </div>
          );
        },
      },
      {
        title: <span className="font-semibold text-gray-700">Part Name</span>,
        dataIndex: 'part_names',
        key: 'part_name',
        ellipsis: true,
        render: (values) => {
          if (!values || values.length === 0) {
            return <span className="text-gray-400">-</span>;
          }
          return (
            <Space size="small" wrap>
              {values.map((val, idx) => (
                <Tag key={idx} color="blue">
                  {val}
                </Tag>
              ))}
            </Space>
          );
        },
      },
      {
        title: <span className="font-semibold text-gray-700">Material Name</span>,
        dataIndex: 'material_name',
        key: 'material_name',
        ellipsis: true,
        render: (text) => <span className="font-medium text-gray-800">{text}</span>,
        onCell: (record, index) => ({
          rowSpan: getMaterialRowSpan(record, index),
        }),
      },
      {
        title: <span className="font-semibold text-gray-700">Mass (kg)</span>,
        dataIndex: 'mass',
        key: 'mass',
        render: (value, record) => {
          const isEditing = statusEditRowId === record.id;
          if (isEditing) {
            const fieldKey = `status-mass-${record.id}`;
            return (
              <div className="flex flex-col">
                <InputNumber
                  min={0}
                  precision={3}
                  step={0.001}
                  size="small"
                  style={{ width: '100%' }}
                  value={statusEditOrderKg}
                  stringMode
                  parser={(val) => limitDecimals(val, fieldKey, 3)}
                  onKeyDown={(e) => blockExtraDecimals(e, fieldKey, 3)}
                  onChange={(v) => setStatusEditOrderKg(v)}
                />
                {decimalWarnings[fieldKey] && (
                  <span className="text-[10px] text-orange-500 leading-none mt-1 animate-pulse">
                    {decimalWarnings[fieldKey]}
                  </span>
                )}
              </div>
            );
          }
          return value !== null && value !== undefined
            ? <span className="font-mono text-gray-700">{value}</span>
            : <span className="text-gray-400">-</span>;
        },
        onCell: (record, index) => ({
          rowSpan: getMaterialRowSpan(record, index),
        }),
      },
      {
        title: <span className="font-semibold text-gray-700">Quantity</span>,
        dataIndex: 'quantity',
        key: 'quantity',
        render: (value, record) => {
          const isEditing = statusEditRowId === record.id;
          if (isEditing) {
            const fieldKey = `status-qty-${record.id}`;
            return (
              <div className="flex flex-col">
                <InputNumber
                  min={0}
                  precision={0}
                  step={1}
                  max={99999}
                  size="small"
                  style={{ width: '100%' }}
                  value={statusEditOrderQty}
                  stringMode
                  parser={(val) => limitDecimals(val, fieldKey, 0)}
                  onKeyDown={(e) => blockExtraDecimals(e, fieldKey, 0)}
                  onChange={(v) => setStatusEditOrderQty(v)}
                />
                {decimalWarnings[fieldKey] && (
                  <span className="text-[10px] text-orange-500 leading-none mt-1 animate-pulse">
                    {decimalWarnings[fieldKey]}
                  </span>
                )}
              </div>
            );
          }
          return value !== null && value !== undefined ? value : <span className="text-gray-400">-</span>;
        },
        onCell: (record, index) => ({
          rowSpan: getMaterialRowSpan(record, index),
        }),
      },
      {
        title: <span className="font-semibold text-gray-700">Status</span>,
        dataIndex: 'material_status',
        key: 'material_status',
        render: (status, record) => {
          const isEditing = statusEditRowId === record.id;
          if (isEditing) {
            return (
              <Select
                value={statusEditValue}
                onChange={setStatusEditValue}
                style={{ width: '100%' }}
                size="small"
              >
                <Option value="available">Available</Option>
                <Option value="purchase request">Purchase Request</Option>
                <Option value="purchase order">Purchase Order</Option>
              </Select>
            );
          }
          let color = 'default';
          if (status === 'available') color = 'success';
          if (status === 'purchase order') color = 'processing';
          if (status === 'purchase request') color = 'warning';
          return <Tag color={color}>{status || "-"}</Tag>;
        },
        onCell: (record, index) => ({
          rowSpan: getMaterialRowSpan(record, index),
        }),
      },
      {
        title: <span className="font-semibold text-gray-700">Actions</span>,
        key: 'status_actions',
        render: (_, record) => {
          const isEditing = statusEditRowId === record.id;
          if (isEditing) {
            return (
              <Space>
                <Tooltip title="Save">
                  <Button
                    type="text"
                    size="small"
                    icon={<CheckOutlined />}
                    className="text-green-600 hover:bg-green-50"
                    onClick={async () => {
                      try {
                        const ids = (record.linkage_ids && record.linkage_ids.length)
                          ? record.linkage_ids
                          : (record.id != null ? [record.id] : []);
                        if (!ids.length) {
                          message.warning("No linkage IDs found for this row.");
                          return;
                        }

                        const newStatus = statusEditValue || record.material_status || "available";
                        const newQty =
                          statusEditOrderQty != null
                            ? Number(statusEditOrderQty)
                            : record.quantity ?? 0;
                        const newKg =
                          statusEditOrderKg != null
                            ? Number(statusEditOrderKg)
                            : record.mass ?? 0;

                        const groupId = record.linkage_group_id || null;

                        // 1) Update existing linkages (status + qty/kg)
                        // For grouped records we will update status/qty/kg AFTER
                        // deletions/additions so all current parts in the batch share
                        // the same values.
                        if (!groupId) {
                          // Fallback: update individual linkages when there is no group id
                          const updates = await Promise.all(
                            ids.map((id) => {
                              const linkage = (linkedMaterials || []).find((l) => l.id === id);
                              if (!linkage) return null;
                              const body = {
                                raw_material_id: linkage.raw_material_id,
                                part_id: linkage.part_id,
                                order_id: linkage.order_id,
                                order_quantity: newQty,
                                mass: newKg,
                                material_status: newStatus,
                                linkage_group_id: linkage.linkage_group_id || null,
                              };
                              return fetch(
                                `${API_BASE_URL}/order-parts-raw-material-linked/${id}`,
                                {
                                  method: "PUT",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify(body),
                                }
                              );
                            })
                          );

                          const validResponses = updates.filter((res) => !!res);
                          const allOk =
                            validResponses.length > 0 &&
                            validResponses.every((res) => res && res.ok);

                          if (!allOk) {
                            message.error("Failed to update one or more linkages");
                            return;
                          }
                        }

                        // 2) Remove selected parts (delete specific linkages)
                        if (statusEditPartsToRemove.length > 0) {
                          const delResponses = await Promise.all(
                            statusEditPartsToRemove.map((id) =>
                              fetch(
                                `${API_BASE_URL}/order-parts-raw-material-linked/${id}`,
                                { method: "DELETE" }
                              )
                            )
                          );
                          const delOk =
                            delResponses.length > 0 &&
                            delResponses.every((res) => res && res.ok);
                          if (!delOk) {
                            message.error("Failed to remove some parts from batch");
                            return;
                          }
                        }

                        // 3) Add new parts into same batch/order
                        if (statusEditPartsToAdd.length > 0) {
                          const rawMaterialId = record.raw_material_id;
                          const orderId = record.order_id;
                          const linkageGroupId =
                            (statusEditCurrentLinkages[0] &&
                              statusEditCurrentLinkages[0].linkage_group_id) ||
                            record.linkage_group_id ||
                            null;

                          const addBody = {
                            raw_material_ids: [rawMaterialId],
                            part_ids: statusEditPartsToAdd,
                            order_id: orderId,
                            order_quantities: { [rawMaterialId]: newQty },
                            order_masses: { [rawMaterialId]: newKg },
                            linkage_group_id: linkageGroupId,
                          };
                          const addRes = await fetch(
                            `${API_BASE_URL}/order-parts-raw-material-linked/bulk`,
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify(addBody),
                            }
                          );
                          if (!addRes.ok) {
                            message.error("Failed to add some parts to batch");
                            return;
                          }
                        }

                        // 4) For grouped records, now update status + qty/kg
                        // for the final set of parts in this batch.
                        if (groupId) {
                          const statusRes = await fetch(
                            `${API_BASE_URL}/order-parts-raw-material-linked/status/group/${groupId}`,
                            {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                material_status: newStatus,
                                order_quantity: newQty,
                                mass: newKg,
                              }),
                            }
                          );
                          if (!statusRes.ok) {
                            message.error("Failed to update status/quantities for this batch");
                            return;
                          }
                        }

                        await fetchLinkedMaterials();
                        message.success("Updated successfully");
                        setStatusEditRowId(null);
                        setStatusEditValue(null);
                        setStatusEditOrderKg(null);
                        setStatusEditOrderQty(null);
                        setStatusEditCurrentLinkages([]);
                        setStatusEditPartsToRemove([]);
                        setStatusEditPartsToAdd([]);
                        setStatusEditAvailableParts([]);
                      } catch (error) {
                        console.error("Error updating linkages:", error);
                        message.error("Error updating linkages");
                      }
                    }}
                  />
                </Tooltip>
                <Tooltip title="Cancel">
                  <Button
                    type="text"
                    size="small"
                    icon={<CloseOutlined />}
                    className="text-gray-500 hover:bg-gray-100"
                    onClick={() => {
                      setStatusEditRowId(null);
                      setStatusEditValue(null);
                      setStatusEditOrderKg(null);
                      setStatusEditOrderQty(null);
                      setStatusEditCurrentLinkages([]);
                      setStatusEditPartsToRemove([]);
                      setStatusEditPartsToAdd([]);
                      setStatusEditAvailableParts([]);
                    }}
                  />
                </Tooltip>
              </Space>
            );
          }
          return (
            <Space>
              <Tooltip title="Edit">
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  className="text-blue-600 hover:bg-blue-50"
                  onClick={async () => {
                    setStatusEditRowId(record.id);
                    setStatusEditValue(record.material_status || "available");
                    setStatusEditOrderKg(record.mass ?? 0);
                    setStatusEditOrderQty(record.quantity ?? 0);

                    // Current linkages for this batch (same order, material, group)
                    const current = (linkedMaterials || []).filter(
                      (l) =>
                        l.raw_material_id === record.raw_material_id &&
                        l.order_id === record.order_id &&
                        (l.linkage_group_id || null) === (record.linkage_group_id || null)
                    );
                    setStatusEditCurrentLinkages(current);
                    setStatusEditPartsToRemove([]);
                    setStatusEditPartsToAdd([]);

                    try {
                      const orderId = record.order_id;
                      let hierarchy = orderHierarchyMap[orderId];
                      if (!hierarchy) {
                        const res = await fetch(
                          `${API_BASE_URL}/orders/${orderId}/hierarchical`
                        );
                        if (!res.ok) {
                          setStatusEditAvailableParts([]);
                          return;
                        }
                        hierarchy = await res.json();
                        setOrderHierarchyMap((prev) => ({
                          ...prev,
                          [orderId]: hierarchy,
                        }));
                      }

                      const allParts = flattenPartsFromOrderHierarchy(hierarchy) || [];
                      const existingPartIds = new Set(current.map((l) => l.part_id));
                      const available = allParts.filter(
                        (p) => p && p.id && !existingPartIds.has(p.id)
                      );
                      setStatusEditAvailableParts(available);
                    } catch (e) {
                      console.error("Error loading available parts for edit:", e);
                      setStatusEditAvailableParts([]);
                    }
                  }}
                />
              </Tooltip>
              <Tooltip title="Delete Link">
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined />}
                  className="text-red-500 hover:bg-red-50"
                  onClick={() => handleDeleteLinkGroup(record)}
                />
              </Tooltip>
            </Space>
          );
        },
      },
    ];

    return (
      <Card 
        className="shadow-sm rounded-lg lg:rounded-xl border border-gray-100" 
        styles={{ body: { padding: 0 } }}
        title={
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3">
                <div className="flex items-center gap-2">
                    <SafetyCertificateOutlined className="text-blue-500" />
                    <span className="font-bold text-gray-800 text-sm sm:text-base">Parts with Raw Materials Status</span>
                </div>
                <Space className="w-full sm:w-auto flex-col sm:flex-row gap-2">
                    <Input.Search
                        placeholder="Search..."
                        allowClear
                        onSearch={handleLinkedMaterialsSearch}
                        onChange={(e) => handleLinkedMaterialsSearch(e.target.value)}
                        className="w-full sm:w-64"
                        size="middle"
                    />
                    <PartsWithRawMaterialsStatusPdfDownload linkedMaterials={linkedMaterials} />
                </Space>
            </div>
        }
       >
        <Table
            columns={columns}
            dataSource={groupedData}
            rowKey="id"
            size="small"
            bordered
            pagination={{
              current: linkedMaterialsPagination.current,
              pageSize: linkedMaterialsPagination.pageSize,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
              pageSizeOptions: ['10', '20', '50', '100'],
              placement: 'bottom',
              responsive: true,
            }}
            onChange={(paginationConfig) => {
              setLinkedMaterialsPagination({
                current: paginationConfig.current,
                pageSize: paginationConfig.pageSize,
              });
            }}
            locale={{ emptyText: <Empty description="No linked materials found" /> }}
            className="modern-table"
            scroll={{ x: 1200 }}
        />
      </Card>
    );
  };

  const handleSearch = (value) => {
    setSearchText(value);
  };

  const handleOrderSearch = (value) => {
    setOrderSearchText(value);
  };

  const handleLinkedMaterialsSearch = (value) => {
    setLinkedMaterialsSearchText(value);
  };

  const filteredLinkedMaterials = (linkedMaterials || []).filter((item, index) => {
    if (!linkedMaterialsSearchText) return true;
    
    const searchLower = linkedMaterialsSearchText.toLowerCase();
    
    // SL NO
    const slNo = String(index + 1);
    
    // Project Number & Name
    const saleOrderNumber = (item.sale_order_number || "").toLowerCase();
    const projectName = (item.project_name || "").toLowerCase();
    
    // Part details
    const partNumber = (item.part_number || "").toLowerCase();
    const partName = (item.part_name || "").toLowerCase();
    
    // Material details
    const materialName = (item.material_name || "").toLowerCase();
    const quantity = String(item.order_quantity || "");
    const mass = String(item.mass || "");
    
    // Status
    const materialStatus = (item.material_status || "").toLowerCase();
    
    return (
      slNo.includes(searchLower) ||
      saleOrderNumber.includes(searchLower) ||
      projectName.includes(searchLower) ||
      materialName.includes(searchLower) ||
      partNumber.includes(searchLower) ||
      partName.includes(searchLower) ||
      quantity.includes(searchLower) ||
      mass.includes(searchLower) ||
      materialStatus.includes(searchLower)
    );
  });

  const filteredOrders = orders.filter((order, index) => {
    if (!orderSearchText) return true;
    
    const searchLower = orderSearchText.toLowerCase();
    
    // Project Number & Name
    const saleOrderNumber = (order.sale_order_number || "").toLowerCase();
    const projectName = (order.project_name || "").toLowerCase();
    
    return (
      saleOrderNumber.includes(searchLower) ||
      projectName.includes(searchLower)
    );
  });

  const filteredMaterials = rawMaterials.filter((material, index) => {
    if (!searchText) return true;
    
    const searchLower = searchText.toLowerCase();
    
    // # (index + 1)
    const slNo = String(index + 1);
    
    // Material basic info
    const materialName = (material.material_name || "").toLowerCase();
    const materialSpec = (material.material_specification || "").toLowerCase();
    const mass = String(material.mass || "");
    const density = String(material.density || "");
    const volume = String(material.volume || "");
    const stockType = (material.stock_type || "").toLowerCase();
    const quantity = String(material.quantity || "");
    const stockDimensions = (material.stock_dimensions || "").toLowerCase();
    
    // Status
    const statusText = (material.quantity ?? 0) > 0 ? 'available' : 'not available';
    
    return (
      slNo.includes(searchLower) ||
      materialName.includes(searchLower) ||
      materialSpec.includes(searchLower) ||
      mass.includes(searchLower) ||
      density.includes(searchLower) ||
      volume.includes(searchLower) ||
      stockType.includes(searchLower) ||
      quantity.includes(searchLower) ||
      stockDimensions.includes(searchLower) ||
      statusText.includes(searchLower)
    );
  });

  const renderMaterialsTable = ({ showSelection = false, showActions = false } = {}) => {
    const columns = [
      {
        title: <span className="font-semibold text-gray-700">#</span>,
        dataIndex: 'index',
        key: 'index',
        width: 60,
        render: (_, __, index) => <span className="text-gray-500 font-mono">{index + 1}</span>,
      },
      {
        title: <span className="font-semibold text-gray-700">Material Name</span>,
        dataIndex: 'material_name',
        key: 'material_name',
        ellipsis: true,
        render: (text) => (
          <Tooltip title={text}>
            <span className="font-medium text-gray-800">{text || "-"}</span>
          </Tooltip>
        ),
      },
      {
        title: <span className="font-semibold text-gray-700">Specification</span>,
        dataIndex: 'material_specification',
        key: 'material_specification',
        ellipsis: true,
        render: (text) => (
          <Tooltip title={text}>
            <span className="text-gray-600">{text || "-"}</span>
          </Tooltip>
        ),
      },
    ];

    // Add additional columns only for main Raw Materials tab (not for Link Materials)
    if (!showSelection) {
      columns.push(
        {
          title: <span className="font-semibold text-gray-700">Mass (kg)</span>,
          dataIndex: 'mass',
          key: 'mass',
          render: (text) => text !== null && text !== undefined ? text : "-",
        },
        {
          title: <span className="font-semibold text-gray-700">Density (kg/m³)</span>,
          dataIndex: 'density',
          key: 'density',
          render: (text) => text !== null && text !== undefined ? text : "-",
        },
        {
          title: <span className="font-semibold text-gray-700">Volume (m³)</span>,
          dataIndex: 'volume',
          key: 'volume',
          render: (text) => text !== null && text !== undefined ? text : "-",
        },
        {
          title: <span className="font-semibold text-gray-700">Stock Type</span>,
          dataIndex: 'stock_type',
          key: 'stock_type',
          render: (text) => text ? <Tag>{text}</Tag> : "-",
        },
        {
          title: <span className="font-semibold text-gray-700">Qty</span>,
          dataIndex: 'quantity',
          key: 'quantity',
          render: (text) => text !== null && text !== undefined ? text : "-",
        },
        {
          title: <span className="font-semibold text-gray-700">Dimensions</span>,
          dataIndex: 'stock_dimensions',
          key: 'stock_dimensions',
          ellipsis: true,
          render: (text) => (
            <Tooltip title={text}>
              <span className="text-gray-600 font-mono text-xs">{text || "-"}</span>
            </Tooltip>
          ),
        }
      );
    } else {
      columns.push(
        {
          title: <span className="font-semibold text-gray-700">Available Kg</span>,
          dataIndex: 'mass',
          key: 'available_mass',
          render: (value) => value || "-",
        },
        {
          title: <span className="font-semibold text-gray-700">Order Kg</span>,
          key: 'order_mass',
          render: (value, record) => {
            const stored = orderValuesByMaterial[record.id]?.order_mass;
            const isEditing = inlineEditRow && inlineEditRow.id === record.id;
            if (!isEditing) {
              return stored !== undefined ? stored : "-";
            }
            const fieldKey = `inv-mass-${record.id}`;
            return (
              <div className="flex flex-col">
                <InputNumber
                  min={0}
                  precision={3}
                  step={0.001}
                  style={{ width: '100%' }}
                  value={inlineEditRow.mass}
                  stringMode
                  parser={(val) => limitDecimals(val, fieldKey, 3)}
                  onKeyDown={(e) => blockExtraDecimals(e, fieldKey, 3)}
                  onChange={(val) => changeInlineEdit('mass', val)}
                />
                {decimalWarnings[fieldKey] && (
                  <span className="text-[10px] text-orange-500 leading-none mt-1 animate-pulse">
                    {decimalWarnings[fieldKey]}
                  </span>
                )}
              </div>
            );
          },
        },
        {
          title: <span className="font-semibold text-gray-700">Order Qty</span>,
          key: 'order_quantity',
          render: (value, record) => {
            const stored = orderValuesByMaterial[record.id]?.order_quantity;
            const isEditing = inlineEditRow && inlineEditRow.id === record.id;
            if (!isEditing) {
              return stored !== undefined ? stored : "-";
            }
            const fieldKey = `inv-qty-${record.id}`;
            return (
              <div className="flex flex-col">
                <InputNumber
                  min={0}
                  precision={0}
                  step={1}
                  max={99999}
                  style={{ width: '100%' }}
                  value={inlineEditRow.quantity}
                  stringMode
                  parser={(val) => limitDecimals(val, fieldKey, 0)}
                  onKeyDown={(e) => blockExtraDecimals(e, fieldKey, 0)}
                  onChange={(val) => changeInlineEdit('quantity', val)}
                />
                {decimalWarnings[fieldKey] && (
                  <span className="text-[10px] text-orange-500 leading-none mt-1 animate-pulse">
                    {decimalWarnings[fieldKey]}
                  </span>
                )}
              </div>
            );
          },
        }
      );
    }

    // Add Status column only for main Raw Materials tab (not for Link Materials)
    if (!showSelection) {
      columns.push({
        title: <span className="font-semibold text-gray-700">Status</span>,
        dataIndex: 'status',
        key: 'status',
        render: (_, record) => {
          const qty = record.quantity ?? 0;
          const text = qty > 0 ? 'AVAILABLE' : 'NOT AVAILABLE';
          const color = qty > 0 ? 'success' : 'error';
          return <Tag color={color}>{text}</Tag>;
        },
      });
    }

    // Add Actions column
    if (showActions || showSelection) {
      columns.push({
        title: <span className="font-semibold text-gray-700">Actions</span>,
        key: 'actions',
        width: 140,
        render: (_, record) => {
          const isEditing = inlineEditRow && inlineEditRow.id === record.id;
          const isLinkTabRow = showSelection;

          if (isLinkTabRow && isEditing) {
            return (
              <Space>
                <Tooltip title="Save">
                  <Button
                    type="text"
                    size="small"
                    icon={<CheckOutlined />}
                    className="text-green-600 hover:bg-green-50"
                    onClick={() => saveInlineEdit(record)}
                  />
                </Tooltip>
                <Tooltip title="Cancel">
                  <Button
                    type="text"
                    size="small"
                    icon={<CloseOutlined />}
                    className="text-gray-500 hover:bg-gray-50"
                    onClick={cancelInlineEdit}
                  />
                </Tooltip>
              </Space>
            );
          }

          return (
            <Space>
              <Tooltip title="Edit">
                <Button
                  type="text"
                  size="small"
                  icon={<EditOutlined />}
                  className="text-blue-500 hover:bg-blue-50"
                  onClick={() => {
                    if (isLinkTabRow) {
                      startInlineEdit(record);
                    } else {
                      openEditRawMaterial(record);
                    }
                  }}
                />
              </Tooltip>
              {!isLinkTabRow && (
                <Tooltip title="Delete">
                  <Button
                    type="text"
                    size="small"
                    icon={<DeleteOutlined />}
                    className="text-red-500 hover:bg-red-50"
                    onClick={() => handleDeleteRawMaterial(record)}
                  />
                </Tooltip>
              )}
            </Space>
          );
        },
      });
    }

    const rowSelection = showSelection ? {
      selectedRowKeys: Object.keys(selectedRawMaterialIds).filter(id => selectedRawMaterialIds[id]).map(k => Number(k)),
      onChange: (selectedRowKeys) => {
        const next = {};
        selectedRowKeys.forEach(id => { next[id] = true; });
        setSelectedRawMaterialIds(next);
      },
    } : null;

    return (
      <Card 
        className="shadow-sm rounded-lg lg:rounded-xl border border-gray-100" 
        styles={{ body: { padding: 0 } }}
        title={
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3">
                <div className="flex items-center gap-2">
                    <ExperimentOutlined className="text-purple-600" />
                    <span className="font-bold text-gray-800 text-sm sm:text-base">Raw Materials Inventory</span>
                </div>
                {showActions && !showSelection && (
                  <Space className="w-full sm:w-auto flex-col sm:flex-row gap-2">
                    <Input.Search
                      placeholder="Search..."
                      allowClear
                      onSearch={handleSearch}
                      onChange={(e) => handleSearch(e.target.value)}
                      className="w-full sm:w-64"
                      size="middle"
                    />
                    <div className="flex gap-2 w-full sm:w-auto">
                      <RawMaterialsInventoryPdfDownload rawMaterials={rawMaterials} />
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={openCreateRawMaterial}
                        size="middle"
                        style={{ backgroundColor: '#2563eb' }}
                        className="border-none shadow-md no-hover-btn flex-1 sm:flex-initial"
                      >
                        <span className="hidden sm:inline">Add Raw Material</span>
                        <span className="sm:hidden">Add</span>
                      </Button>
                    </div>
                  </Space>
                )}
            </div>
        }
      >
        <Table
            columns={columns}
            dataSource={filteredMaterials}
            rowKey="id"
            size="small"
            bordered
            rowSelection={rowSelection || undefined}
            scroll={{ x: 1200 }}
            pagination={{
              current: rawMaterialsPagination.current,
              pageSize: rawMaterialsPagination.pageSize,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
              pageSizeOptions: ['10', '20', '50', '100'],
              placement: 'bottom',
              responsive: true,
            }}
          onChange={(paginationConfig) => {
            setRawMaterialsPagination({
              current: paginationConfig.current,
              pageSize: paginationConfig.pageSize,
            });
          }}
            locale={{ emptyText: <Empty description={searchText ? "No raw materials found matching your search" : "No raw materials found"} /> }}
            className="modern-table"
        />
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="flex flex-col items-center">
            <Spin size="large" />
            <p className="mt-4 text-gray-500 font-medium">Loading raw materials...</p>
        </div>
      </div>
    );
  }

  const tabItems = [
    {
      key: 'raw-materials',
      label: (
        <span className="flex items-center gap-2 px-2">
            <ExperimentOutlined /> Raw Materials
        </span>
      ),
      children: renderMaterialsTable({ showSelection: false, showActions: true })
    },
    {
      key: 'linking',
      label: (
        <span className="flex items-center gap-2 px-2">
            <LinkOutlined /> Link Materials
        </span>
      ),
      children: (
        <div className="mt-2 sm:mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
            {/* Left side - Orders tree */}
            <div className="lg:col-span-1">
                <Card 
                    title={
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <BlockOutlined className="text-blue-600" />
                                <span className="font-bold text-gray-800 text-sm sm:text-base">Order Structure</span>
                            </div>
                            <Input.Search
                                placeholder="Search..."
                                allowClear
                                onSearch={handleOrderSearch}
                                onChange={(e) => handleOrderSearch(e.target.value)}
                                className="w-full sm:w-48"
                                size="small"
                            />
                        </div>
                    }
                    className="shadow-sm rounded-lg lg:rounded-xl border border-gray-100 h-full"
                    styles={{ 
                      body: { 
                        padding: 'clamp(8px, 2vw, 12px)', 
                        maxHeight: 'calc(100vh - 280px)', 
                        overflowY: 'auto' 
                      },
                      header: { padding: 'clamp(12px, 2vw, 16px)' }
                    }}
                >
                    {renderOrderTree()}
                </Card>
            </div>

            {/* Right side - Raw Materials table */}
            <div className="lg:col-span-2 space-y-3 sm:space-y-4">
                {renderMaterialsTable({ showSelection: true, showActions: false })}
                <div className="flex justify-end pt-2">
                    <Button
                        type="primary"
                        icon={<LinkOutlined />}
                        onClick={handleSubmitLinks}
                        loading={linking}
                        size="large"
                        style={{ backgroundColor: '#2563eb' }}
                        className="border-none shadow-md no-hover-btn px-6 sm:px-8 w-full sm:w-auto"
                    >
                        <span className="hidden sm:inline">Submit Selections</span>
                        <span className="sm:hidden">Submit</span>
                    </Button>
                </div>
            </div>
          </div>
        </div>
      )
    },
    {
      key: 'order-status',
      label: (
        <span className="flex items-center gap-2 px-2">
            <SafetyCertificateOutlined /> Parts with Raw Materials Status
        </span>
      ),
      children: <div className="mt-4">{renderLinkedMaterialsTable()}</div>
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-2 sm:p-4 lg:p-6">
      <style>{`
        .no-hover-btn, .no-hover-btn:hover, .no-hover-btn:focus, .no-hover-btn:active {
          background-color: #2563eb !important;
          color: white !important;
          opacity: 1 !important;
          border: none !important;
          box-shadow: none !important;
        }
      `}</style>
      <style>{`
        .modern-table .ant-table-thead > tr > th {
          background: linear-gradient(to bottom, #f0f5ff, #e6f0ff);
          font-weight: 600;
          border-bottom: 2px solid #1890ff;
        }
        .modern-table .ant-table-tbody > tr:hover > td {
          background: #f0f8ff !important;
        }
        .modern-table .ant-table-tbody > tr > td {
          border-bottom: 1px solid #f0f0f0;
        }
        .ant-tabs-nav {
            margin-bottom: 0 !important;
        }
        .ant-card-head {
            border-bottom: 1px solid #f0f0f0;
            min-height: 56px;
        }
        @media (max-width: 768px) {
          .ant-table {
            font-size: 12px;
          }
          .ant-table-thead > tr > th,
          .ant-table-tbody > tr > td {
            padding: 8px 4px;
          }
        }
      `}</style>

      {/* Header */}
      <div className="bg-white rounded-lg lg:rounded-xl shadow-sm border border-gray-100 p-3 sm:p-4 mb-4 lg:mb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="w-full sm:w-auto">
                <Title 
                  level={2} 
                  style={{ margin: 0, fontSize: 'clamp(18px, 4vw, 24px)' }} 
                  className="flex items-center gap-2 sm:gap-3 text-gray-800"
                >
                    <ExperimentOutlined className="text-blue-600" />
                    <span className="hidden sm:inline">Raw Materials Management</span>
                    <span className="sm:hidden">Raw Materials</span>
                </Title>
                <Text className="text-gray-500 mt-1 block text-xs sm:text-sm">Manage raw materials, inventory, and order linking</Text>
            </div>
        </div>
      </div>

      <div className="bg-white rounded-lg lg:rounded-xl shadow-lg border border-gray-100 p-1 sm:p-2">
        <Tabs 
            activeKey={activeTab} 
            onChange={setActiveTab} 
            items={tabItems}
            type="card"
            className="custom-tabs"
            tabBarStyle={{ margin: 0, padding: '4px 4px 0 4px' }}
        />
      </div>

      {/* Raw Material Modal */}
      <Modal
        open={rawMaterialModalOpen}
        onCancel={closeRawMaterialModal}
        width="95%"
        style={{ maxWidth: 800 }}
        title={
            <div className="flex items-center gap-2">
                {editingRawMaterial ? <EditOutlined className="text-blue-500" /> : <PlusOutlined className="text-blue-500" />}
                <span className="font-bold text-gray-800 text-sm sm:text-base">{editingRawMaterial ? "Edit Raw Material" : "Add New Raw Material"}</span>
            </div>
        }
        footer={null}
        className="rounded-xl overflow-hidden"
      >
        <style>{`
          @media (max-width: 768px) {
            .ant-modal-body {
              padding: 16px;
            }
          }
        `}</style>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSaveRawMaterial}
          className="pt-4"
        >
          <Row gutter={[12, 0]}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="material_name"
                label={<span className="font-semibold text-gray-700 text-xs sm:text-sm">Material Name</span>}
                rules={[{ required: true, message: 'Please enter material name' }]}
              >
                <Input placeholder="Enter material name" size="large" className="rounded-md" autoComplete="off" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="material_specification"
                label={<span className="font-semibold text-gray-700 text-xs sm:text-sm">Specification</span>}
              >
                <Input placeholder="Enter specification" size="large" className="rounded-md" autoComplete="off" />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8}>
              <Form.Item
                name="mass"
                label={<span className="font-semibold text-gray-700 text-xs sm:text-sm">Mass (kg)</span>}
                validateStatus={decimalWarnings['mass'] ? 'warning' : ''}
                help={decimalWarnings['mass']}
              >
                <InputNumber 
                  style={{ width: '100%' }} 
                  min={0} 
                  precision={3} 
                  step={0.001} 
                  placeholder="0.000 kg" 
                  size="large" 
                  className="rounded-md"
                  stringMode
                  parser={(val) => limitDecimals(val, 'mass', 3)}
                  onKeyDown={(e) => blockExtraDecimals(e, 'mass', 3)}
                />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8}>
              <Form.Item
                name="density"
                label={<span className="font-semibold text-gray-700 text-xs sm:text-sm">Density (kg/m³)</span>}
                validateStatus={decimalWarnings['density'] ? 'warning' : ''}
                help={decimalWarnings['density']}
              >
                <InputNumber 
                  style={{ width: '100%' }} 
                  min={0} 
                  precision={3} 
                  step={0.001} 
                  placeholder="0.000 kg/m³" 
                  size="large" 
                  className="rounded-md"
                  stringMode
                  parser={(val) => limitDecimals(val, 'density', 3)}
                  onKeyDown={(e) => blockExtraDecimals(e, 'density', 3)}
                />
              </Form.Item>
            </Col>
            <Col xs={12} sm={8}>
              <Form.Item
                name="volume"
                label={<span className="font-semibold text-gray-700 text-xs sm:text-sm">Volume (m³)</span>}
                validateStatus={decimalWarnings['volume'] ? 'warning' : ''}
                help={decimalWarnings['volume']}
              >
                <InputNumber 
                  style={{ width: '100%' }} 
                  min={0} 
                  precision={3} 
                  step={0.001} 
                  placeholder="0.000 m³" 
                  size="large" 
                  className="rounded-md"
                  stringMode
                  parser={(val) => limitDecimals(val, 'volume', 3)}
                  onKeyDown={(e) => blockExtraDecimals(e, 'volume', 3)}
                />
              </Form.Item>
            </Col>
            <Col xs={12} sm={12}>
              <Form.Item
                name="stock_type"
                label={<span className="font-semibold text-gray-700 text-xs sm:text-sm">Stock Type</span>}
              >
                {isCustomStockType ? (
                  <div className="flex gap-2">
                    <Input 
                      placeholder="Enter custom stock type" 
                      size="large" 
                      className="rounded-md flex-1" 
                      autoComplete="off"
                      onChange={(e) => {
                        form.setFieldValue('stock_type', e.target.value);
                      }}
                    />
                    <Button 
                      type="default" 
                      size="large"
                      onClick={() => {
                        setIsCustomStockType(false);
                        setSelectedStockType("");
                        form.setFieldValue('stock_type', '');
                        form.setFieldValue('stock_dimensions', '');
                      }}
                      className="rounded-md"
                    >
                      Back to List
                    </Button>
                  </div>
                ) : (
                  <Select 
                    placeholder="Select stock type" 
                    size="large" 
                    className="rounded-md" 
                    value={selectedStockType}
                    onChange={(value) => {
                      if (value === "Other") {
                        setSelectedStockType("Other");
                        setIsCustomStockType(true);
                        form.setFieldValue('stock_type', '');
                      } else {
                        setSelectedStockType(value);
                        setIsCustomStockType(false);
                        form.setFieldValue('stock_type', value);
                      }
                      // Clear dimensions when stock type changes
                      form.setFieldValue('stock_dimensions', '');
                    }}
                    allowClear
                  >
                    <Option value="Sheet Metal">Sheet Metal</Option>
                    <Option value="Rod">Rod</Option>
                    <Option value="Solid Bar">Solid Bar</Option>
                    <Option value="Other">Other (Custom)</Option>
                  </Select>
                )}
              </Form.Item>
            </Col>
            <Col xs={12} sm={12}>
              <Form.Item
                name="quantity"
                label={<span className="font-semibold text-gray-700 text-xs sm:text-sm">Quantity</span>}
                validateStatus={decimalWarnings['modal-qty'] ? 'warning' : ''}
                help={decimalWarnings['modal-qty']}
              >
                <InputNumber 
                  style={{ width: '100%' }} 
                  min={0} 
                  precision={0} 
                  step={1} 
                  max={99999}
                  placeholder="0" 
                  size="large" 
                  className="rounded-md" 
                  autoComplete="off" 
                  stringMode
                  parser={(val) => limitDecimals(val, 'modal-qty', 0)}
                  onKeyDown={(e) => blockExtraDecimals(e, 'modal-qty', 0)}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="stock_dimensions"
                label={<span className="font-semibold text-gray-700 text-xs sm:text-sm">Dimensions (mm)</span>}
              >
                <Input 
                  placeholder={
                    selectedStockType === "Sheet Metal" ? "Length × Width × Thickness (mm)" :
                    selectedStockType === "Rod" ? "Length × Diameter (mm)" :
                    selectedStockType === "Solid Bar" ? "Length × Width × Height (mm)" :
                    isCustomStockType ? "Enter dimensions (mm)" :
                    "Select stock type first"
                  } 
                  size="large" 
                  className="rounded-md" 
                  autoComplete="off" 
                />
              </Form.Item>
            </Col>
          </Row>
          
          <div className="flex flex-col sm:flex-row justify-end gap-3 mt-6 sm:mt-8 pt-4 border-t border-gray-100">
            <Button 
              onClick={closeRawMaterialModal} 
              size="large" 
              className="rounded-md w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button 
              type="primary" 
              htmlType="submit" 
              loading={savingRawMaterial} 
              size="large" 
              style={{ backgroundColor: '#2563eb' }}
              className="rounded-md border-none shadow-md no-hover-btn w-full sm:w-auto"
            >
              {savingRawMaterial ? "Saving..." : (editingRawMaterial ? "Update Material" : "Create Material")}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default RawMaterials;
