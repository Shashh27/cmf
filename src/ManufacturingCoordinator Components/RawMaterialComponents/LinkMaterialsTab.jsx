import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { API_BASE_URL } from "../../Config/auth";
import { Table, Button, Empty, Card, Input, Space, Tooltip, InputNumber, Spin, Checkbox, Typography, message } from "antd";
import { 
  LinkOutlined, 
  BlockOutlined, 
  ExperimentOutlined, 
  CheckOutlined, 
  CloseOutlined,
  EditOutlined,
  CaretDownOutlined,
  CaretRightOutlined,
  CodeSandboxOutlined,
  AppstoreOutlined
} from "@ant-design/icons";

const { Text } = Typography;

const LinkMaterialsTab = ({ rawMaterials: propRawMaterials, onDataChanged }) => {
  const [orders, setOrders] = useState([]);
  const [orderBomMap, setOrderBomMap] = useState({});
  const [rawMaterials, setRawMaterials] = useState(propRawMaterials || []);
  const [loading, setLoading] = useState(false);
  const [bomLoadingMap, setBomLoadingMap] = useState({});
  const [expandedOrders, setExpandedOrders] = useState({});
  const [expandedAssemblies, setExpandedAssemblies] = useState({});
  const [selectedPartsByOrder, setSelectedPartsByOrder] = useState({});
  const [selectedRawMaterialIds, setSelectedRawMaterialIds] = useState({});
  const [linking, setLinking] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [rawMaterialsPagination, setRawMaterialsPagination] = useState({ current: 1, pageSize: 15 });
  const [inlineEditRow, setInlineEditRow] = useState(null);
  const [orderValuesByMaterial, setOrderValuesByMaterial] = useState({});
  const [orderSearchText, setOrderSearchText] = useState("");
  const [decimalWarnings, setDecimalWarnings] = useState({});

  const fetchingOrders = useRef(false);
  const initializedRef = useRef(false);

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

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    fetchOrders();
  }, []);

  useEffect(() => {
    // Update rawMaterials when props change
    if (propRawMaterials) {
      setRawMaterials(propRawMaterials);
    }
  }, [propRawMaterials]);

  const fetchOrders = async () => {
    if (fetchingOrders.current) return;
    fetchingOrders.current = true;
    setOrdersLoading(true);
    try {
      const uid = getCurrentUserId();
      // For manufacturing coordinator view, show only orders where this user is the manufacturing coordinator
      const params = uid != null ? { manufacturing_coordinator_id: uid } : undefined;
      const response = await axios.get(`${API_BASE_URL}/orders/`, { params });
      setOrders(response.data);
    } catch (error) {
      console.error("Error fetching orders:", error);
      setOrders([]);
    } finally {
      setOrdersLoading(false);
      fetchingOrders.current = false;
    }
  };

  const fetchOrderBom = async (orderId, productId) => {
    setBomLoadingMap((prev) => ({ ...prev, [orderId]: true }));
    try {
      // Do not filter by user_id: all roles see the same product hierarchy for the order
      const response = await axios.get(`${API_BASE_URL}/products/${productId}/hierarchical`);
      const data = response.data;
      setOrderBomMap((prev) => ({ ...prev, [orderId]: data }));
      setExpandedAssemblies((prev) => {
        const next = { ...prev };
        (data.assemblies || []).forEach((a) => {
          const assembly = a.assembly || a;
          if (assembly?.id) next[assembly.id] = true;
        });
        return next;
      });
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
      return { ...prev, [orderId]: { ...current, [partId]: !current[partId] } };
    });
  };

  const handleSubmitLinks = async () => {
    const orderPartSelections = Object.entries(selectedPartsByOrder || {})
      .map(([orderId, partMap]) => ({
        orderId: Number(orderId),
        partIds: Object.keys(partMap || {}).filter((id) => partMap[id]).map((id) => Number(id)),
      }))
      .filter((item) => item.partIds.length > 0);

    if (!orderPartSelections.length) {
      message.warning("Please select at least one part.");
      return;
    }

    const rawMaterialIds = Object.keys(selectedRawMaterialIds).filter((id) => selectedRawMaterialIds[id]).map((id) => Number(id));
    if (rawMaterialIds.length === 0) {
      message.warning("Please select at least one raw material.");
      return;
    }

    const allPartIds = [];
    orderPartSelections.forEach((item) => allPartIds.push(...item.partIds));
    if (new Set(allPartIds).size > 1 && rawMaterialIds.length > 1) {
      message.error("Adding many parts to many raw materials is not allowed.");
      return;
    }

    const order_quantities = {};
    const order_masses = {};
    rawMaterialIds.forEach((id) => {
      const vals = orderValuesByMaterial[id];
      if (vals) {
        if (vals.order_quantity != null) order_quantities[id] = Number(vals.order_quantity) || 0;
        if (vals.order_mass != null) order_masses[id] = Number(vals.order_mass) || 0;
      }
    });

    setLinking(true);
    try {
      const linkageGroupId = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID().replace(/-/g, "")
        : `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      const uid = getCurrentUserId();
      const responses = await Promise.all(
        orderPartSelections.map(({ orderId, partIds }) =>
          axios.post(
            `${API_BASE_URL}/order-parts-raw-material-linked/bulk`,
            {
              raw_material_ids: rawMaterialIds,
              part_ids: partIds,
              order_id: orderId,
              order_quantities,
              order_masses,
              linkage_group_id: linkageGroupId,
              user_id: uid,
            },
            { headers: { "Content-Type": "application/json" } }
          )
        )
      );
      if (responses.every((res) => res && res.status >= 200 && res.status < 300)) {
        message.success("Raw Materials added Successfully.");
        setSelectedPartsByOrder({});
        setSelectedRawMaterialIds({});
        setExpandedOrders({});
        setExpandedAssemblies({});
        setOrderBomMap({});
        setOrderValuesByMaterial({});
        // notify parent so other tabs can refresh
        if (typeof onDataChanged === "function") {
          onDataChanged();
        }
      } else {
        message.error("Adding failed.");
      }
    } catch (error) {
      console.error("Error Adding parts and raw materials:", error);
      const detail =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        "Error while Adding.";
      message.error(detail);
    } finally {
      setLinking(false);
    }
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
      let finalInt = int;
      if (int.length > 6) {
        showDecimalWarning(fieldName, precision, 'Max 6 digits allowed before decimal');
        finalInt = int.slice(0, 6);
      }
      
      if (dec.length > precision) {
        showDecimalWarning(fieldName, precision);
        return `${finalInt}.${dec.slice(0, precision)}`;
      }
      return `${finalInt}.${dec}`;
    } else {
      if (str.length > 6) {
        showDecimalWarning(fieldName, precision, 'Max 6 digits allowed before decimal');
        return str.slice(0, 6);
      }
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
    const controlKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Escape', 'Control'];
    if (controlKeys.includes(e.key) || e.ctrlKey || e.metaKey) return;
    if (!/[0-9.]/.test(e.key)) { e.preventDefault(); return; }
    if (precision === 0 && e.key === '.') { showDecimalWarning(fieldName, 0); e.preventDefault(); return; }

    if (/[0-9]/.test(e.key)) {
      const hasSelection = e.target.selectionStart !== e.target.selectionEnd;
      if (precision === 0) {
        const digitsOnly = String(value).replace(/\D/g, '');
        if (digitsOnly.length >= 5 && !hasSelection) {
          showDecimalWarning(fieldName, 0, 'Max 5 digits allowed');
          e.preventDefault();
          return;
        }
      } else {
        const parts = value.split('.');
        const selectionStart = e.target.selectionStart;
        const dotIndex = value.indexOf('.');
        if ((dotIndex === -1 || selectionStart <= dotIndex) && !hasSelection) {
          const integerPart = dotIndex === -1 ? value : parts[0];
          if (integerPart.length >= 6) {
            showDecimalWarning(fieldName, precision, 'Max 6 digits allowed before decimal');
            e.preventDefault();
            return;
          }
        }
      }
    }
    if (e.key === '.' && value.includes('.')) { e.preventDefault(); return; }
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

  const startInlineEdit = (record) => {
    const existing = orderValuesByMaterial[record.id] || {};
    setInlineEditRow({
      id: record.id,
      mass: existing.order_mass ?? record.mass ?? 0,
      quantity: existing.order_quantity ?? 0,
    });
  };

  const changeInlineEdit = (field, value) => {
    setInlineEditRow((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const cancelInlineEdit = () => {
    setInlineEditRow(null);
  };

  const saveInlineEdit = (record) => {
    if (!inlineEditRow || inlineEditRow.id !== record.id) return;
    const order_mass = Number(inlineEditRow.mass) || 0;
    const order_quantity = Number(inlineEditRow.quantity) || 0;
    setOrderValuesByMaterial((prev) => ({
      ...prev,
      [record.id]: { order_mass, order_quantity },
    }));
    setInlineEditRow(null);
    message.success("Order Kg and Qty captured for this material");
  };

  const filteredOrders = (orders || []).filter((o) => 
    !orderSearchText || Object.values(o).some(value => 
      value !== null && value !== undefined && 
      String(value).toLowerCase().includes(orderSearchText.toLowerCase())
    )
  ).sort((a, b) => (a.id || 0) - (b.id || 0));

  const filteredMaterials = (rawMaterials || []).filter((item) => 
    !orderSearchText || Object.values(item).some(value => 
      value !== null && value !== undefined && 
      String(value).toLowerCase().includes(orderSearchText.toLowerCase())
    )
  ).sort((a, b) => (a.id || 0) - (b.id || 0));

  const collectAssemblyPartIds = (assemblyDetails, acc = []) => {
    if (!assemblyDetails) return acc;
    const parts = assemblyDetails.parts || [];
    const subassemblies = assemblyDetails.subassemblies || [];
    parts.forEach((p) => {
      const part = p.part || p;
      if (part && part.id && part.type_name !== "Out-Source") {
        acc.push(part.id);
      }
    });
    subassemblies.forEach((s) => collectAssemblyPartIds(s, acc));
    return acc;
  };

  const toggleAssemblySelection = (orderId, assemblyDetails, checked) => {
    const partIds = collectAssemblyPartIds(assemblyDetails, []);
    if (!partIds.length) return;
    setSelectedPartsByOrder((prev) => {
      const current = { ...(prev[orderId] || {}) };
      partIds.forEach((id) => {
        current[id] = checked;
      });
      return { ...prev, [orderId]: current };
    });
  };

  const renderPart = (partDetails, level = 0, orderId) => {
    const part = partDetails.part || partDetails;
    if (!part || !part.id || part.type_name === "Out-Source") return null;
    const isSelected = selectedPartsByOrder[orderId]?.[part.id];
    return (
      <div key={part.id} className={`flex items-center gap-2 px-3 py-2.5 rounded-lg transition-all duration-200 ${isSelected ? 'bg-gradient-to-r from-blue-50 to-blue-100 border-l-4 border-blue-500 shadow-sm' : 'hover:bg-gray-50 border-l-4 border-transparent'}`} style={{ marginLeft: `${level * 20}px` }}>
        <Checkbox checked={!!isSelected} onChange={() => togglePartSelection(orderId, part.id)} className="mr-2" />
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

    const descendantPartIds = collectAssemblyPartIds(assemblyDetails, []);
    const orderSelection = selectedPartsByOrder[orderId] || {};
    const allSelected =
      descendantPartIds.length > 0 &&
      descendantPartIds.every((pid) => orderSelection[pid]);
    const someSelected =
      descendantPartIds.length > 0 &&
      descendantPartIds.some((pid) => orderSelection[pid]) &&
      !allSelected;

    return (
      <div key={assembly.id} className="mb-1">
        <div
          className={`flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200 ${
            hasChildren && isExpanded
              ? 'bg-gradient-to-r from-gray-50 to-gray-100 border-l-4 border-gray-400'
              : 'hover:bg-gray-50 border-l-4 border-transparent'
          }`}
          style={{ marginLeft: `${level * 20}px` }}
        >
          <div className="flex-shrink-0 w-6">
            {hasChildren && (
              <Button
                type="text"
                size="small"
                icon={isExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
                className="text-blue-500 hover:bg-blue-100 rounded-md"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleAssemblyExpand(assembly.id);
                }}
              />
            )}
          </div>
          <Checkbox
            checked={allSelected}
            indeterminate={someSelected}
            onChange={(e) => {
              e.stopPropagation();
              toggleAssemblySelection(orderId, assemblyDetails, e.target.checked);
            }}
            className="mr-1"
          />
          <BlockOutlined className="text-blue-500" />
          <div className="flex flex-col">
            <Text className="font-medium text-gray-800 leading-tight">{assembly.assembly_number}</Text>
            <Text className="text-gray-500 text-xs">{assembly.assembly_name}</Text>
          </div>
        </div>
        {isExpanded && <div className="mt-1">{parts.map((p) => renderPart(p, level + 1, orderId))}{subassemblies.map((s) => renderAssembly(s, level + 1, orderId))}</div>}
      </div>
    );
  };

  const renderOrderBom = (order) => {
    const bomData = orderBomMap[order.id];
    if (bomLoadingMap[order.id]) return <div className="p-4 ml-6 text-gray-500 flex items-center gap-2"><Spin size="small" /> Loading BOM...</div>;
    if (!bomData) return <div className="p-4 ml-6 text-gray-400 italic">No BOM data available</div>;
    return (
      <div className="pl-4 border-l-2 border-gray-200 ml-4 mt-2 mb-2 space-y-1">
        {bomData.product && (
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 mb-2">
            <AppstoreOutlined className="text-indigo-600" />
            <Text className="font-bold text-gray-800">{bomData.product.product_name || `Product ${bomData.product.id}`}</Text>
          </div>
        )}
        {(bomData.assemblies || []).map((a) => renderAssembly(a, 0, order.id))}
        {(bomData.direct_parts || []).map((p) => renderPart(p, 0, order.id))}
      </div>
    );
  };

  const columns = [
    {
      title: <span className="font-semibold text-gray-700">#</span>,
      dataIndex: 'index',
      key: 'index',
      width: 60,
      render: (_, __, index) => {
        const { current, pageSize } = rawMaterialsPagination;
        return <span className="text-gray-500 font-mono">{(current - 1) * pageSize + index + 1}</span>;
      },
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
        if (!isEditing) return stored !== undefined ? stored : "-";
        const fieldKey = `inv-mass-${record.id}`;
        return (
          <div className="flex flex-col">
            <InputNumber min={0} precision={3} step={0.001} style={{ width: '100%' }} value={inlineEditRow.mass} stringMode parser={(val) => limitDecimals(val, fieldKey, 3)} onKeyDown={(e) => blockExtraDecimals(e, fieldKey, 3)} onChange={(val) => changeInlineEdit('mass', val)} />
            {decimalWarnings[fieldKey] && <span className="text-[10px] text-orange-500 leading-none mt-1 animate-pulse">{decimalWarnings[fieldKey]}</span>}
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
        if (!isEditing) return stored !== undefined ? stored : "-";
        const fieldKey = `inv-qty-${record.id}`;
        return (
          <div className="flex flex-col">
            <InputNumber min={0} precision={0} step={1} max={99999} style={{ width: '100%' }} value={inlineEditRow.quantity} stringMode parser={(val) => limitDecimals(val, fieldKey, 0)} onKeyDown={(e) => blockExtraDecimals(e, fieldKey, 0)} onChange={(val) => changeInlineEdit('quantity', val)} />
            {decimalWarnings[fieldKey] && <span className="text-[10px] text-orange-500 leading-none mt-1 animate-pulse">{decimalWarnings[fieldKey]}</span>}
          </div>
        );
      },
    },
    {
      title: <span className="font-semibold text-gray-700">Actions</span>,
      key: 'actions',
      width: 140,
      render: (_, record) => {
        const isEditing = inlineEditRow && inlineEditRow.id === record.id;
        if (isEditing) {
          return (
            <Space>
              <Tooltip title="Save"><Button type="text" size="small" icon={<CheckOutlined />} className="text-green-600 hover:bg-green-50" onClick={() => saveInlineEdit(record)} /></Tooltip>
              <Tooltip title="Cancel"><Button type="text" size="small" icon={<CloseOutlined />} className="text-gray-500 hover:bg-gray-50" onClick={cancelInlineEdit} /></Tooltip>
            </Space>
          );
        }
        return <Tooltip title="Edit"><Button type="text" size="small" icon={<EditOutlined />} className="text-blue-500 hover:bg-blue-50" onClick={() => startInlineEdit(record)} /></Tooltip>;
      },
    }
  ];

  const handleSearchChange = (e) => {
    const value = e.target.value;
    // Allow only letters, numbers, and spaces
    const sanitizedValue = value.replace(/[^a-zA-Z0-9 ]/g, '');
    setOrderSearchText(sanitizedValue);
  };

  return (
    <div className="mt-2 sm:mt-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
        <div className="lg:col-span-1">
            <Card title={<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2"><div className="flex items-center gap-2"><BlockOutlined className="text-blue-600" /><span className="font-bold text-gray-800 text-sm sm:text-base">Order Structure</span></div><Input.Search placeholder="Search..." allowClear onSearch={setOrderSearchText} onChange={handleSearchChange} value={orderSearchText} maxLength={20} className="w-full sm:w-48" size="small" /></div>} className="shadow-sm rounded-lg lg:rounded-xl border border-gray-100 h-full" styles={{ body: { padding: 'clamp(8px, 2vw, 12px)', maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }, header: { padding: 'clamp(12px, 2vw, 16px)' } }}>
                <div className="p-2 space-y-1">
                  {filteredOrders.map((order) => (
                    <div key={order.id} className="mb-1">
                      <div className={`flex items-center gap-2 px-4 py-3 rounded-lg cursor-pointer transition-all duration-200 ${expandedOrders[order.id] ? 'bg-gradient-to-r from-indigo-50 to-indigo-100 border-l-4 border-indigo-500 shadow-sm' : 'hover:bg-gray-50 border-l-4 border-transparent'}`} onClick={() => toggleOrderExpand(order)}>
                        <div className="w-6 flex-shrink-0">{order.product_id && <Button type="text" size="small" icon={expandedOrders[order.id] ? <CaretDownOutlined /> : <CaretRightOutlined />} className="text-indigo-500 hover:bg-indigo-100 rounded-md" />}</div>
                        <div className={`w-2 h-2 rounded-full mr-2 ${expandedOrders[order.id] ? 'bg-indigo-500' : 'bg-gray-400'}`} />
                        <Text className={`font-medium ${expandedOrders[order.id] ? 'text-indigo-800' : 'text-gray-800'}`}>{order.sale_order_number}</Text>
                      </div>
                      {expandedOrders[order.id] && renderOrderBom(order)}
                    </div>
                  ))}
                  {filteredOrders.length === 0 && !ordersLoading && <Empty description={orderSearchText ? "No orders found matching your search" : "No orders found"} image={Empty.PRESENTED_IMAGE_SIMPLE} />}
                  {ordersLoading && <div className="py-12 flex justify-center"><Spin size="large" /></div>}
                </div>
            </Card>
        </div>
        <div className="lg:col-span-2 space-y-3 sm:space-y-4">
            <Card className="shadow-sm rounded-lg lg:rounded-xl border border-gray-100" styles={{ body: { padding: 0 } }} title={<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3"><div className="flex items-center gap-2"><ExperimentOutlined className="text-purple-600" /><span className="font-bold text-gray-800 text-sm sm:text-base">Raw Materials Inventory</span></div><Input.Search placeholder="Search..." allowClear onSearch={setOrderSearchText} onChange={handleSearchChange} value={orderSearchText} maxLength={20} className="w-full sm:w-64" size="middle" /></div>}>
              <Table columns={columns} dataSource={filteredMaterials} rowKey="id" size="small" bordered rowSelection={{ selectedRowKeys: Object.keys(selectedRawMaterialIds).filter(id => selectedRawMaterialIds[id]).map(Number), onChange: (keys) => { const next = {}; keys.forEach(k => next[k] = true); setSelectedRawMaterialIds(next); }}} scroll={{ x: 1200 }} pagination={{ current: rawMaterialsPagination.current, pageSize: rawMaterialsPagination.pageSize, showSizeChanger: true, showQuickJumper: true, showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`, pageSizeOptions: ['10', '20', '50', '100'], placement: 'bottom', responsive: true }} onChange={(p) => setRawMaterialsPagination({ current: p.current, pageSize: p.pageSize })} locale={{ emptyText: <Empty description={orderSearchText ? "No raw materials found matching your search" : "No raw materials found"} /> }} className="modern-table" loading={loading} />
            </Card>
            <div className="flex justify-end pt-2"><Button type="primary" icon={<LinkOutlined />} onClick={handleSubmitLinks} loading={linking} size="large" style={{ backgroundColor: '#2563eb' }} className="border-none shadow-md no-hover-btn px-6 sm:px-8 w-full sm:w-auto"><span className="hidden sm:inline">Submit Selections</span><span className="sm:hidden">Submit</span></Button></div>
        </div>
      </div>
    </div>
  );
};

export default LinkMaterialsTab;
