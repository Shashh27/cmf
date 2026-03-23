import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth";
import { Table, Button, Empty, Card, Input, Space, Tooltip, Tag, Dropdown, Modal, InputNumber, Select, Typography, App } from "antd";
import { 
  SafetyCertificateOutlined, 
  EditOutlined, 
  DeleteOutlined,
  CheckCircleOutlined
} from "@ant-design/icons";
import { PartsWithRawMaterialsStatusPdfDownload } from "../DownloadReports/RawMaterialsPdfDownload";

const { Text } = Typography;
const { Option } = Select;

const PartsWithRawMaterialStatusTab = ({ onDataChanged }) => {
  const [linkedMaterials, setLinkedMaterials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [pagination, setPagination] = useState({ current: 1, pageSize: 15 });
  const [statusEditModalOpen, setStatusEditModalOpen] = useState(false);
  const [statusEditRecord, setStatusEditRecord] = useState(null);
  const [statusEditOrderKg, setStatusEditOrderKg] = useState(null);
  const [statusEditOrderQty, setStatusEditOrderQty] = useState(null);
  const [statusEditCurrentLinkages, setStatusEditCurrentLinkages] = useState([]);
  const [statusEditPartsToRemove, setStatusEditPartsToRemove] = useState([]);
  const [statusEditPartsToAdd, setStatusEditPartsToAdd] = useState([]);
  const [statusEditAvailableParts, setStatusEditAvailableParts] = useState([]);
  const [orderHierarchyMap, setOrderHierarchyMap] = useState({});
  const [statusEditPartMetaById, setStatusEditPartMetaById] = useState({});
  const [decimalWarnings, setDecimalWarnings] = useState({});

  const fetching = useRef(false);
  const initializedRef = useRef(false);

  const { modal, message } = App.useApp();

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
    fetchLinkedMaterials();
  }, []);

  const fetchLinkedMaterials = async () => {
    if (fetching.current) return;
    fetching.current = true;
    setLoading(true);
    try {
      const uid = getCurrentUserId();
      const response = await axios.get(`${API_BASE_URL}/order-parts-raw-material-linked/`, {
        params: uid != null ? { admin_id: uid } : undefined,
      });
      setLinkedMaterials(response.data);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
      fetching.current = false;
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

  const handleQuickStatusChange = (record, newStatus) => {
    modal.confirm({
      title: 'Confirm Status Change',
      content: `Are you sure you want to change the status to "${newStatus}"?`,
      okText: 'Change',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const uid = getCurrentUserId();
          const groupId = record.linkage_group_id || null;
          const ids = record.linkage_ids || [];
          if (groupId) {
            await axios.put(
              `${API_BASE_URL}/order-parts-raw-material-linked/status/group/${groupId}`,
              {
                material_status: newStatus,
                order_quantity: record.quantity ?? 0,
                mass: record.mass ?? 0,
                user_id: uid,
              },
              { headers: { "Content-Type": "application/json" } }
            );
          } else {
            const updates = await Promise.all(
              ids.map((id) => {
                const linkage = (linkedMaterials || []).find((l) => l.id === id);
                if (!linkage) return null;
                return axios.put(
                  `${API_BASE_URL}/order-parts-raw-material-linked/${id}`,
                  { ...linkage, material_status: newStatus, user_id: uid },
                  { headers: { "Content-Type": "application/json" } }
                );
              })
            );
            if (!updates.every((res) => res && res.status >= 200 && res.status < 300)) throw new Error("Failed to update some linkages");
          }
          await fetchLinkedMaterials();
          if (typeof onDataChanged === "function") {
            onDataChanged();
          }
          message.success(`Status updated to "${newStatus}"`);
        } catch (error) {
          console.error("Error updating status:", error);
          const detail =
            error?.response?.data?.detail ||
            error?.response?.data?.message ||
            "Failed to update status";
          message.error(detail);
        }
      },
    });
  };

  const handleSaveStatusEdit = async () => {
    if (!statusEditRecord) return;
    try {
      const record = statusEditRecord;
      const ids = record.linkage_ids || [];
      const newQty = statusEditOrderQty != null ? Number(statusEditOrderQty) : record.quantity ?? 0;
      const newKg = statusEditOrderKg != null ? Number(statusEditOrderKg) : record.mass ?? 0;
      const groupId = record.linkage_group_id || null;

      const uid = getCurrentUserId();

      if (!groupId) {
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
              material_status: linkage.material_status || "available",
              linkage_group_id: linkage.linkage_group_id || null,
              user_id: uid,
            };
            return axios.put(
              `${API_BASE_URL}/order-parts-raw-material-linked/${id}`,
              body,
              { headers: { "Content-Type": "application/json" } }
            );
          })
        );
        if (!updates.every((res) => res && res.status >= 200 && res.status < 300)) {
          message.error("Failed to update one or more linkages");
          return;
        }
      }

      if (statusEditPartsToRemove.length > 0) {
        await Promise.all(
          statusEditPartsToRemove.map((id) =>
            axios.delete(`${API_BASE_URL}/order-parts-raw-material-linked/${id}`, {
              params: { user_id: getCurrentUserId() ?? undefined },
            })
          )
        );
      }

      if (statusEditPartsToAdd.length > 0) {
        const rawMaterialId = record.raw_material_id;
        const orderId = record.order_id;
        const linkageGroupId = record.linkage_group_id || null;
        const addBody = {
          raw_material_ids: [rawMaterialId],
          part_ids: statusEditPartsToAdd,
          order_id: orderId,
          order_quantities: { [rawMaterialId]: newQty },
          order_masses: { [rawMaterialId]: newKg },
          linkage_group_id: linkageGroupId,
          user_id: getCurrentUserId(),
        };
        await axios.post(
          `${API_BASE_URL}/order-parts-raw-material-linked/bulk`,
          addBody,
          { headers: { "Content-Type": "application/json" } }
        );
      }

      if (groupId) {
        await axios.put(
          `${API_BASE_URL}/order-parts-raw-material-linked/status/group/${groupId}`,
          {
            material_status: record.material_status || "available",
            order_quantity: newQty,
            mass: newKg,
          },
          { headers: { "Content-Type": "application/json" } }
        );
      }

      await fetchLinkedMaterials();
      if (typeof onDataChanged === "function") {
        onDataChanged();
      }
      message.success("Updated successfully");
      setStatusEditModalOpen(false);
    } catch (error) {
      console.error("Error updating linkages:", error);
      const detail =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        "Error updating linkages";
      message.error(detail);
    }
  };

  const flattenPartsFromOrderHierarchy = (orderHierarchy) => {
    if (!orderHierarchy || !orderHierarchy.product_hierarchy) return { parts: [], meta: {} };
    const { assemblies = [], direct_parts = [] } = orderHierarchy.product_hierarchy || {};
    const parts = [];
    const meta = {};
    const visitAssemblies = (assemblyDetailsList, parentPath = []) => {
      (assemblyDetailsList || []).forEach((ad) => {
        const a = ad.assembly || ad;
        const currentPath = a && a.assembly_name ? [...parentPath, a.assembly_name] : parentPath;
        (ad.parts || []).forEach((pd) => {
          const p = pd.part || pd;
          if (p && p.id && (!p.type_name || p.type_name === "IN-House")) {
            parts.push(p);
            meta[p.id] = {
              path: currentPath,
              isDirect: false,
            };
          }
        });
        const subs = ad.subassemblies || [];
        if (subs.length) visitAssemblies(subs, currentPath);
      });
    };
    visitAssemblies(assemblies, []);
    (direct_parts || []).forEach((pd) => {
      const p = pd.part || pd;
      if (p && p.id && (!p.type_name || p.type_name === "IN-House")) {
        parts.push(p);
        if (!meta[p.id]) {
          meta[p.id] = {
            path: [],
            isDirect: true,
          };
        }
      }
    });
    return { parts, meta };
  };

  const openStatusEditModal = async (record) => {
    setStatusEditRecord(record);
    setStatusEditOrderKg(record.mass ?? 0);
    setStatusEditOrderQty(record.quantity ?? 0);
    const current = (linkedMaterials || []).filter((l) => l.raw_material_id === record.raw_material_id && l.order_id === record.order_id && (l.linkage_group_id || null) === (record.linkage_group_id || null));
    setStatusEditCurrentLinkages(current);
    setStatusEditPartsToRemove([]);
    setStatusEditPartsToAdd([]);
    try {
      const orderId = record.order_id;
      let hierarchy = orderHierarchyMap[orderId];
      if (!hierarchy) {
        const res = await axios.get(`${API_BASE_URL}/orders/${orderId}/hierarchical`);
        hierarchy = res.data;
        setOrderHierarchyMap(prev => ({ ...prev, [orderId]: hierarchy }));
      }
      if (hierarchy) {
        const { parts: allParts, meta } = flattenPartsFromOrderHierarchy(hierarchy) || { parts: [], meta: {} };
        const existingPartIds = new Set(current.map(l => l.part_id));
        setStatusEditAvailableParts(allParts.filter(p => p && p.id && !existingPartIds.has(p.id)));
        setStatusEditPartMetaById(meta || {});
      }
    } catch (e) { console.error(e); }
    setStatusEditModalOpen(true);
  };

  const handleDeleteLinkGroup = (record) => {
    modal.confirm({
      title: 'Confirm Delete',
      content: 'Are you sure you want to remove this material from the order and parts?',
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await Promise.all(
            record.linkage_ids.map((id) =>
              axios.delete(`${API_BASE_URL}/order-parts-raw-material-linked/${id}`)
            )
          );
      await fetchLinkedMaterials();
      if (typeof onDataChanged === "function") {
        onDataChanged();
      }
          message.success("Linked material removed successfully");
        } catch (error) {
          console.error("Error deleting linked material:", error);
          const detail =
            error?.response?.data?.detail ||
            error?.response?.data?.message ||
            "Error deleting linked material";
          message.error(detail);
        }
      },
    });
  };

  const handleLinkedMaterialsSearch = (value) => setSearchText((value || '').replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 20));

  const filtered = linkedMaterials.filter(item => 
    !searchText || Object.values(item).some(value => 
      value !== null && value !== undefined && 
      String(value).toLowerCase().includes(searchText.toLowerCase())
    )
  );

  const groupedMap = {};
  filtered.forEach((item) => {
    const key = `${item.raw_material_id}-${item.linkage_group_id || 'no-group'}-${item.order_id}`;
    if (!groupedMap[key]) {
      groupedMap[key] = { 
        ...item, 
        _items: [], // Store all items in this group to sort parts later
        linkage_ids: [], 
        min_id: item.id 
      };
    }
    groupedMap[key]._items.push(item);
    groupedMap[key].linkage_ids.push(item.id);
    if (item.id < groupedMap[key].min_id) {
      groupedMap[key].min_id = item.id;
    }
    groupedMap[key].quantity = item.order_quantity;
    groupedMap[key].mass = item.mass;
  });

  const groupedData = Object.values(groupedMap).map(group => {
    // Sort items within group by id
    const sortedItems = [...group._items].sort((a, b) => (a.id || 0) - (b.id || 0));
    const part_numbers = [];
    const part_names = [];
    
    sortedItems.forEach(item => {
      if (!part_numbers.includes(item.part_number)) part_numbers.push(item.part_number);
      if (!part_names.includes(item.part_name)) part_names.push(item.part_name);
    });

    return {
      ...group,
      part_numbers,
      part_names
    };
  }).sort((a, b) => (a.min_id || 0) - (b.min_id || 0)); // Sort table by FIFO (min linkage id)

  const getMaterialRowSpan = (record, index) => {
    const prev = groupedData[index - 1];
    if (prev && prev.raw_material_id === record.raw_material_id && prev.linkage_group_id === record.linkage_group_id) return 0;
    let rowSpan = 1;
    for (let i = index + 1; i < groupedData.length; i++) {
      if (groupedData[i].raw_material_id === record.raw_material_id && groupedData[i].linkage_group_id === record.linkage_group_id) rowSpan++;
      else break;
    }
    return rowSpan;
  };

  const columns = [
    {
      title: <span className="font-semibold text-gray-700">SL NO</span>,
      key: 'index',
      width: 80,
      render: (_, __, index) => {
        const { current, pageSize } = pagination;
        return <span className="text-gray-500 font-mono">{(current - 1) * pageSize + index + 1}</span>;
      },
    },
    {
      title: <span className="font-semibold text-gray-700">Project Number</span>,
      dataIndex: 'sale_order_number',
      key: 'sale_order_number',
      render: (text) => <span className="font-mono text-gray-700">{text}</span>
    },
    {
      title: <span className="font-semibold text-gray-700">Project Name</span>,
      dataIndex: 'product_name',
      key: 'product_name',
      ellipsis: true,
      render: (text) => text || <span className="text-gray-400">-</span>,
    },
    {
      title: <span className="font-semibold text-gray-700">Part Number</span>,
      dataIndex: 'part_numbers',
      key: 'part_number',
      ellipsis: true,
      render: (values) => (
        <Space size="small" wrap>
          {values?.map((val, idx) => (
            <Tag key={idx} color="geekblue">{val}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: <span className="font-semibold text-gray-700">Part Name</span>,
      dataIndex: 'part_names',
      key: 'part_name',
      ellipsis: true,
      render: (values) => (
        <Space size="small" wrap>
          {values?.map((val, idx) => (
            <Tag key={idx} color="blue">{val}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: <span className="font-semibold text-gray-700">Material Name</span>,
      dataIndex: 'material_name',
      key: 'material_name',
      ellipsis: true,
      render: (text) => <span className="font-medium text-gray-800">{text}</span>,
      onCell: (record, index) => ({ rowSpan: getMaterialRowSpan(record, index) }),
    },
    {
      title: <span className="font-semibold text-gray-700">Mass (kg)</span>,
      dataIndex: 'mass',
      key: 'mass',
      render: (value) => value != null ? <span className="font-mono text-gray-700">{value}</span> : <span className="text-gray-400">-</span>,
      onCell: (record, index) => ({ rowSpan: getMaterialRowSpan(record, index) }),
    },
    {
      title: <span className="font-semibold text-gray-700">Quantity</span>,
      dataIndex: 'quantity',
      key: 'quantity',
      render: (value) => value != null ? value : <span className="text-gray-400">-</span>,
      onCell: (record, index) => ({ rowSpan: getMaterialRowSpan(record, index) }),
    },
    {
      title: <span className="font-semibold text-gray-700">Status</span>,
      dataIndex: 'material_status',
      key: 'material_status',
      render: (status) => {
        let color = 'default';
        if (status === 'available') color = 'success';
        if (status === 'purchase order') color = 'processing';
        if (status === 'purchase request') color = 'warning';
        return <Tag color={color}>{status || "-"}</Tag>;
      },
      onCell: (record, index) => ({ rowSpan: getMaterialRowSpan(record, index) }),
    },
    {
      title: <span className="font-semibold text-gray-700">Actions</span>,
      key: 'status_actions',
      render: (_, record, index) => (
        <Space>
          {getMaterialRowSpan(record, index) > 0 && (
            <Tooltip title="Quick Status Change">
              <Dropdown menu={{ items: [{ key: 'available', label: 'Available' }, { key: 'purchase request', label: 'Purchase Request' }, { key: 'purchase order', label: 'Purchase Order' }], onClick: ({ key }) => handleQuickStatusChange(record, key) }} trigger={['click']}>
                <Button type="text" size="small" icon={<CheckCircleOutlined />} className="text-green-600 hover:bg-green-50" />
              </Dropdown>
            </Tooltip>
          )}
          <Tooltip title="Edit Link"><Button type="text" size="small" icon={<EditOutlined />} className="text-blue-600 hover:bg-blue-50" onClick={() => openStatusEditModal(record)} /></Tooltip>
          <Tooltip title="Delete Link"><Button type="text" size="small" icon={<DeleteOutlined />} className="text-red-500 hover:bg-red-50" onClick={() => handleDeleteLinkGroup(record)} /></Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div className="mt-4">
      <Card className="shadow-sm rounded-lg lg:rounded-xl border border-gray-100" styles={{ body: { padding: 0 } }} title={<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3"><div className="flex items-center gap-2"><SafetyCertificateOutlined className="text-blue-500" /><span className="font-bold text-gray-800 text-sm sm:text-base">Parts with Raw Materials Status</span></div><Space className="w-full sm:w-auto flex-col sm:flex-row gap-2"><Input.Search placeholder="Search..." allowClear onSearch={handleLinkedMaterialsSearch} onChange={(e) => handleLinkedMaterialsSearch(e.target.value)} value={searchText} maxLength={20} className="w-full sm:w-64" size="middle" /><PartsWithRawMaterialsStatusPdfDownload linkedMaterials={linkedMaterials} /></Space></div>}>
        <Table columns={columns} dataSource={groupedData} rowKey="id" size="small" bordered pagination={{ current: pagination.current, pageSize: pagination.pageSize, showSizeChanger: true, showQuickJumper: true, showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`, pageSizeOptions: ['10', '20', '50', '100'], placement: 'bottom', responsive: true }} onChange={p => setPagination(p)} locale={{ emptyText: <Empty description="No linked materials found" /> }} className="modern-table" scroll={{ x: 1200 }} loading={loading} />
      </Card>

      <Modal open={statusEditModalOpen} onCancel={() => setStatusEditModalOpen(false)} title={<div className="flex items-center gap-2"><EditOutlined className="text-blue-500" /><span className="font-bold text-gray-800">Edit Linked Parts & Status</span></div>} width={600} footer={[<Button key="cancel" onClick={() => setStatusEditModalOpen(false)}>Cancel</Button>, <Button key="save" type="primary" style={{ backgroundColor: '#2563eb' }} onClick={handleSaveStatusEdit}>Save Changes</Button>]}>
        <div className="py-4 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Mass (kg)</Text>
              <InputNumber min={0} precision={3} step={0.001} style={{ width: '100%' }} value={statusEditOrderKg} onChange={setStatusEditOrderKg} size="large" className="rounded-md" stringMode parser={(v) => limitDecimals(v, 'status-edit-mass', 3)} onKeyDown={(e) => blockExtraDecimals(e, 'status-edit-mass', 3)} />
              {decimalWarnings['status-edit-mass'] && <Text type="warning" className="text-[10px] block mt-1">{decimalWarnings['status-edit-mass']}</Text>}
            </div>
            <div className="space-y-1">
              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Quantity</Text>
              <InputNumber min={0} precision={0} step={1} max={99999} style={{ width: '100%' }} value={statusEditOrderQty} onChange={setStatusEditOrderQty} size="large" className="rounded-md" stringMode parser={(v) => limitDecimals(v, 'status-edit-qty', 0)} onKeyDown={(e) => blockExtraDecimals(e, 'status-edit-qty', 0)} />
              {decimalWarnings['status-edit-qty'] && <Text type="warning" className="text-[10px] block mt-1">{decimalWarnings['status-edit-qty']}</Text>}
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between"><Text className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Linked Parts</Text><Text className="text-xs text-gray-400">{statusEditCurrentLinkages.filter(l => !statusEditPartsToRemove.includes(l.id)).length} Parts Linked</Text></div>
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 min-h-[60px] flex flex-wrap gap-2">
              {statusEditCurrentLinkages
                .filter(l => !statusEditPartsToRemove.includes(l.id))
                .map(l => {
                  const meta = statusEditPartMetaById[l.part_id];
                  const pathLabel = meta?.path?.length
                    ? `Assembly: ${meta.path.join(" / ")}`
                    : meta?.isDirect
                      ? "Direct Part"
                      : "";
                  return (
                    <Tag
                      key={l.id}
                      color="geekblue"
                      closable
                      onClose={() => setStatusEditPartsToRemove(prev => [...prev, l.id])}
                      className="flex items-center px-2 py-1 rounded-md text-sm border-none shadow-sm"
                    >
                      <span className="font-semibold">{l.part_number}</span>
                      <span className="mx-1 opacity-60">|</span>
                      <span className="text-xs opacity-80">{l.part_name}</span>
                      {pathLabel && (
                        <>
                          <span className="mx-1 opacity-40">|</span>
                          <span className="text-[10px] opacity-70">{pathLabel}</span>
                        </>
                      )}
                    </Tag>
                  );
                })}
            </div>
          </div>
          <div className="space-y-2">
            <Text className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Add More Parts</Text>
            <Select mode="multiple" style={{ width: '100%' }} placeholder="Select parts to add" value={statusEditPartsToAdd} onChange={setStatusEditPartsToAdd} size="large" className="rounded-md" optionFilterProp="children" allowClear>
              {statusEditAvailableParts.map(p => {
                const meta = statusEditPartMetaById[p.id];
                const pathLabel = meta?.path?.length
                  ? `Assembly: ${meta.path.join(" / ")}`
                  : meta?.isDirect
                    ? "Direct Part"
                    : "";
                return (
                  <Option key={p.id} value={p.id}>
                    <div className="flex flex-col py-1">
                      <span className="font-semibold text-gray-800">{p.part_number}</span>
                      <span className="text-xs text-gray-500">{p.part_name}</span>
                      {pathLabel && (
                        <span className="text-[10px] text-gray-400 mt-0.5">{pathLabel}</span>
                      )}
                    </div>
                  </Option>
                );
              })}
            </Select>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PartsWithRawMaterialStatusTab;
