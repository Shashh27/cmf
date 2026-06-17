import React, { useState, useEffect, useRef, useMemo } from "react";

import axios from "axios";

import { API_BASE_URL } from "../Config/auth";

import { 

  Card, Button, Select, message, Spin, 

  Modal, InputNumber, Tag, Typography, Space,

  Empty, Alert, App, Input, Tooltip

} from "antd";

import { 

  ShoppingCartOutlined, 

  CheckCircleOutlined,

  DeleteOutlined,

  SafetyCertificateOutlined

} from "@ant-design/icons";

import OrderMaterialsPdfDownload from "../DownloadReports/OrderMaterialsPdfDownload";



const { Text } = Typography;

const { Option } = Select;

// ── Column filter dropdown ────────────────────────────────────────────────────
const FilterHeader = ({ label, options, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const active = value && value.length > 0;
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 3, cursor: 'pointer', userSelect: 'none' }}
      onClick={() => setOpen(o => !o)}>
      <span>{label}</span>
      <span style={{ fontSize: 9, color: active ? '#2563eb' : '#aaa' }}>▼</span>
      {active && <span style={{ background: '#2563eb', color: '#fff', borderRadius: 8, fontSize: 9, padding: '0 4px', lineHeight: '14px' }}>{value.length}</span>}
      {open && (
        <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, background: '#fff', border: '1px solid #d9d9d9', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,.15)', zIndex: 9999, minWidth: 180, maxHeight: 260, overflowY: 'auto', padding: '6px 0' }}>
          <div style={{ padding: '2px 10px', fontSize: 10, color: '#999', borderBottom: '1px solid #f0f0f0', marginBottom: 3 }}>Filter</div>
          {options.map(opt => (
            <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={value.includes(opt)} onChange={() => onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt])} />
              {opt}
            </label>
          ))}
          {value.length > 0 && (
            <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 3, padding: '3px 10px' }}>
              <span onClick={() => onChange([])} style={{ fontSize: 10, color: '#2563eb', cursor: 'pointer' }}>Clear</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};



const PartsWithRawMaterialStatusTab = ({ onDataChanged, rawMaterials: externalRawMaterials, refreshTrigger }) => {

  const [linkedMaterials, setLinkedMaterials] = useState([]);

  const [loading, setLoading] = useState(false);

  const [searchText, setSearchText] = useState("");

  

  // Group/Ungroup state

  const [selectedRowKeys, setSelectedRowKeys] = useState([]);

  const [groupLoading, setGroupLoading] = useState(false);

  

  // Vendors state

  const [vendors, setVendors] = useState([]);

  

  // Filter states

  const [filterProjectNumber, setFilterProjectNumber] = useState([]);

  const [filterVendorName, setFilterVendorName] = useState([]);

  const [filterMaterialName, setFilterMaterialName] = useState([]);

  const [filterGroup, setFilterGroup] = useState([]);

  // Column header filters
  const [colProcess, setColProcess] = useState([]);
  const [colForm, setColForm] = useState([]);
  const [colOrderStatus, setColOrderStatus] = useState([]);

  

  // Quick status modal states

  const [quickStatusModalOpen, setQuickStatusModalOpen] = useState(false);

  const [quickStatusRecord, setQuickStatusRecord] = useState(null);

  const [quickStatusReceivedVendorId, setQuickStatusReceivedVendorId] = useState(null);



  // Vendor selection modal for auto-extracted materials

  const [vendorSelectModalOpen, setVendorSelectModalOpen] = useState(false);

  const [vendorSelectRecord, setVendorSelectRecord] = useState(null);

  const [selectedVendors, setSelectedVendors] = useState([]);

  const [vendorSelectLoading, setVendorSelectLoading] = useState(false);



  const fetching = useRef(false);

  const initializedRef = useRef(false);



  const { modal, message } = App.useApp();

  const dispatchRMChanged = () => window.dispatchEvent(new Event('rawMaterialChanged'));



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

    fetchVendors();

  }, []);



  // Refresh when parent signals this tab became active after a mutation

  useEffect(() => {

    if (refreshTrigger > 0) fetchLinkedMaterials();

  }, [refreshTrigger]);



  const fetchLinkedMaterials = async () => {

    if (fetching.current) return;

    fetching.current = true;

    setLoading(true);

    try {

      const uid = getCurrentUserId();

      // Admin dashboard - use combined filtering to see all materials from orders where admin is involved

      const response = await axios.get(`${API_BASE_URL}/rawmaterials/order-parts-raw-material-linked/`, {

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



  // Extract unique project numbers from linkedMaterials

  const getUniqueProjectNumbers = () => {

    const projectNumbers = linkedMaterials

      .map(item => item.source_order_number)

      .filter(pn => pn && pn.trim() !== '');

    return [...new Set(projectNumbers)].sort();

  };



  // Extract unique vendor names from linkedMaterials (using backend response)

  const getUniqueVendorNames = () => {

    const vendorNames = new Set();

    linkedMaterials.forEach(item => {

      if (item.vendor_name) {

        // Split by comma if multiple vendors

        const names = item.vendor_name.split(',').map(name => name.trim()).filter(name => name);

        names.forEach(name => vendorNames.add(name));

      }

    });

    return Array.from(vendorNames).sort();

  };



  const getUniqueMaterialNames = () => {

    const materialNames = linkedMaterials

      .map(item => item.material_name)

      .filter(mn => mn && mn.trim() !== '');

    return [...new Set(materialNames)].sort();

  };



  const getUniqueGroups = () => {

    const groups = linkedMaterials

      .map(item => item.merge_group_id)

      .filter(group => group && group.trim() !== '');

    return [...new Set(groups)].sort();
  };



  const getStatusColor = (status) => {

    const colors = {

      enquiry: 'cyan',

      purchase_request: 'orange',

      purchase_order: 'warning',

      received: 'success',

      available: 'success',

      exhausted: 'error'

    };

    return colors[status] || 'default';

  };



  const handleQuickStatusChange = (record) => {

    // Open the quick status modal with current record data

    setQuickStatusRecord({ 

      ...record, 

      order_status: record.order_status || record.material_status || 'enquiry',

      material_status: record.material_status || record.order_status || 'enquiry'

    });

    setQuickStatusReceivedVendorId(record.received_vendor_id || null);

    setQuickStatusModalOpen(true);

  };



  const handleSaveQuickStatus = async () => {

    if (!quickStatusRecord) return;

    try {

      const record = quickStatusRecord;

      const stockId = record.id;

      const newStatus = record.order_status || record.material_status;

      const newVendor = quickStatusReceivedVendorId;



      // Validate vendor selection when status is purchase_request, purchase_order, or received

      if (newStatus === 'purchase_request' || newStatus === 'purchase_order' || newStatus === 'received') {

        if (!quickStatusReceivedVendorId) {

          message.error('Vendor selection is required when status is purchase_request, purchase_order, or received');

          return;

        }

      }



      // Always call PUT endpoint to update status and vendor

      const updateData = {

        order_status: newStatus

      };



      if (newVendor) {

        updateData.received_vendor_id = newVendor;

      }



      // Always include final_cost in updateData (even if null/erased)

      updateData.final_cost = quickStatusRecord.final_cost;



      // Check if this record is part of a group

      if (record.merge_group_id) {

        // Update all items in the group

        await axios.put(

          `${API_BASE_URL}/rawmaterials/order-parts-raw-material-linked/group/${record.merge_group_id}`,

          updateData,

          { headers: { "Content-Type": "application/json" } }

        );

        const count = await getGroupCount(record.merge_group_id);

        message.success(`Status updated successfully for ${count} grouped orders`);

      } else {

        // Update single record

        await axios.put(

          `${API_BASE_URL}/rawmaterials/order-parts-raw-material-linked/${stockId}`,

          updateData,

          { headers: { "Content-Type": "application/json" } }

        );

        message.success("Status updated successfully");

      }



      // Force refresh the table data

      await new Promise(resolve => setTimeout(resolve, 500));

      await fetchLinkedMaterials();

      dispatchRMChanged();

      if (typeof onDataChanged === "function") {

        onDataChanged();

      }

      setQuickStatusModalOpen(false);

      setQuickStatusRecord(null);

      setQuickStatusReceivedVendorId(null);

    } catch (error) {

      message.error(error?.response?.data?.detail || error?.response?.data?.message || "Error updating status");

    }

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

          await axios.delete(`${API_BASE_URL}/rawmaterials/order-parts-raw-material-linked/${record.id}`, {

            params: { user_id: getCurrentUserId() ?? undefined },

          });

          await fetchLinkedMaterials();

          dispatchRMChanged();

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



  const handleLinkedMaterialsSearch = (value) => {

    // Remove special characters but keep alphanumeric, spaces, and decimal points for number search

    const cleanedValue = (value || '').replace(/[^a-zA-Z0-9 .]/g, '');

    setSearchText(cleanedValue.toLowerCase().slice(0, 50));

  };



  const handleOpenVendorSelect = async (record) => {

    // Fetch vendors if not already loaded

    if (vendors.length === 0) {

      await fetchVendors();

    }

    setVendorSelectRecord(record);

    setSelectedVendors(record.vendor_id ? record.vendor_id.split(',').map(id => parseInt(id)) : []);

    setVendorSelectModalOpen(true);

  };



  const handleCloseVendorSelect = () => {

    setVendorSelectModalOpen(false);

    setVendorSelectRecord(null);

    setSelectedVendors([]);

  };



  const handleSaveVendorSelection = async () => {

    if (!vendorSelectRecord) return;

    

    if (selectedVendors.length === 0) {

      message.error('Please select at least one vendor');

      return;

    }



    setVendorSelectLoading(true);

    try {

      // Check if this record is part of a group

      if (vendorSelectRecord.merge_group_id) {

        // Update all items in the group

        await axios.put(

          `${API_BASE_URL}/rawmaterials/order-parts-raw-material-linked/group/${vendorSelectRecord.merge_group_id}`,

          {

            vendor_id: selectedVendors.join(',')

          }

        );

        message.success(`Vendors linked successfully to ${await getGroupCount(vendorSelectRecord.merge_group_id)} grouped orders`);

      } else {

        // Update single record

        await axios.put(

          `${API_BASE_URL}/rawmaterials/order-parts-raw-material-linked/${vendorSelectRecord.id}`,

          {

            vendor_id: selectedVendors.join(',')

          }

        );

        message.success('Vendors linked successfully');

      }

      handleCloseVendorSelect();

      await fetchLinkedMaterials();

      dispatchRMChanged();

    } catch (error) {

      message.error(error.response?.data?.detail || 'Failed to link vendors');

    } finally {

      setVendorSelectLoading(false);

    }

  };



  const getGroupCount = async (groupId) => {

    try {

      const response = await axios.get(`${API_BASE_URL}/rawmaterials/order-parts-raw-material-linked/`);

      const count = response.data.filter(item => item.merge_group_id === groupId).length;

      return count;

    } catch (error) {

      return 0;

    }

  };



  // Check if any selected row is already in a group

  const areSelectedRowsAlreadyGrouped = () => {

    if (selectedRowKeys.length < 2) return false;

    

    const selectedRows = filteredDataWithRowSpans.filter(row => selectedRowKeys.includes(row.id));

    if (selectedRows.length === 0) return false;

    

    // If any selected row has a merge_group_id, they are already grouped

    const hasGroupedRow = selectedRows.some(row => row.merge_group_id !== null && row.merge_group_id !== undefined);

    

    return hasGroupedRow;

  };



  // Check if any selected row can be ungrouped (has a merge_group_id)

  const canUngroupSelectedRows = () => {

    if (selectedRowKeys.length === 0) return false;

    

    const selectedRows = filteredDataWithRowSpans.filter(row => selectedRowKeys.includes(row.id));

    if (selectedRows.length === 0) return false;

    

    // If any selected row has a merge_group_id, it can be ungrouped

    const hasGroupedRow = selectedRows.some(row => row.merge_group_id !== null && row.merge_group_id !== undefined);

    

    return hasGroupedRow;

  };



  const fetchVendors = async () => {

    try {

      const response = await axios.get(`${API_BASE_URL}/rawmaterials/vendors`);

      const vendorsData = response.data || [];

      setVendors(vendorsData);

    } catch (error) {

      console.error("Error fetching vendors:", error);

      setVendors([]);

    }

  };



  const handleGroupOrders = async () => {

    if (selectedRowKeys.length < 2) {

      message.warning('Please select at least 2 orders to group');

      return;

    }

    

    modal.confirm({

      title: 'Confirm Group',

      content: `Are you sure you want to group ${selectedRowKeys.length} orders? After grouping, vendor linking and status changes will apply to ALL grouped orders together.`,

      okText: 'Yes, Group',

      cancelText: 'Cancel',

      onOk: async () => {

        setGroupLoading(true);

        try {

          // Refresh data before group to ensure we have latest state

          await fetchLinkedMaterials();

          

          await axios.post(

            `${API_BASE_URL}/rawmaterials/order-parts-raw-material-linked/group`,

            { stock_ids: selectedRowKeys }

          );

          message.success('Orders grouped successfully. Now you can link vendors or change status for all grouped orders at once.');

          setSelectedRowKeys([]);

          await fetchLinkedMaterials();

        } catch (error) {

          message.error(error?.response?.data?.detail || 'Failed to group orders');

        } finally {

          setGroupLoading(false);

        }

      }

    });

  };



  const handleUngroupOrders = async () => {

    if (selectedRowKeys.length === 0) {

      message.warning('Please select orders to ungroup');

      return;

    }

    

    modal.confirm({

      title: 'Confirm Ungroup',

      content: `Are you sure you want to ungroup ${selectedRowKeys.length} orders? After ungrouping, you will need to manage vendor linking and status changes individually for each order.`,

      okText: 'Yes, Ungroup',

      cancelText: 'Cancel',

      onOk: async () => {

        setGroupLoading(true);

        try {

          await axios.post(

            `${API_BASE_URL}/rawmaterials/order-parts-raw-material-linked/ungroup`,

            { stock_ids: selectedRowKeys }

          );

          message.success('Orders ungrouped successfully');

          setSelectedRowKeys([]);

          // Force refresh to ensure latest data from DB

          await fetchLinkedMaterials();

          // Small delay to ensure data is fully refreshed

          await new Promise(resolve => setTimeout(resolve, 500));

        } catch (error) {

          message.error(error?.response?.data?.detail || 'Failed to ungroup orders');

        } finally {

          setGroupLoading(false);

        }

      }

    });

  };



  const colFilterOptions = useMemo(() => ({
    process: [...new Set(linkedMaterials.map(i => i.process_type).filter(Boolean))].sort(),
    form: [...new Set(linkedMaterials.map(i => i.form_type).filter(Boolean))].sort(),
    orderStatus: [...new Set(linkedMaterials.map(i => i.order_status).filter(Boolean))].sort(),
  }), [linkedMaterials]);

  const filtered = linkedMaterials.filter(item => {

    if (!searchText) return true;

    const searchLower = searchText.toLowerCase();

    return (

      (item.source_order_number?.toLowerCase() || '').includes(searchLower) ||

      (item.material_name?.toLowerCase() || '').includes(searchLower) ||

      (item.vendor_name?.toLowerCase() || '').includes(searchLower) ||

      (item.order_status?.toLowerCase() || '').includes(searchLower) ||

      (item.part_numbers?.join(' ').toLowerCase() || '').includes(searchLower)

    );

  }).filter(item => {

    // Apply project number filter (multi-select)
    if (filterProjectNumber.length > 0 && !filterProjectNumber.includes(item.source_order_number)) return false;

    // Apply vendor filter (multi-select)
    if (filterVendorName.length > 0) {
      if (!item.vendor_name) return false;
      const vendorNames = item.vendor_name.split(',').map(n => n.trim());
      if (!filterVendorName.some(v => vendorNames.includes(v))) return false;
    }

    // Apply material name filter (multi-select)
    if (filterMaterialName.length > 0 && !filterMaterialName.includes(item.material_name)) return false;

    // Apply group filter (multi-select)
    if (filterGroup.length > 0 && !filterGroup.includes(item.merge_group_id)) return false;

    // Column header filters
    if (colProcess.length > 0 && !colProcess.includes(item.process_type)) return false;
    if (colForm.length > 0 && !colForm.includes(item.form_type)) return false;
    if (colOrderStatus.length > 0 && !colOrderStatus.includes(item.order_status)) return false;

    return true;

  });





  // Transform data to use row spans.
  // Grouping logic:
  //   - Material Name column: spans rows within each sub-group only.
  //     For a merged group of 3 it spans 3; for each ungrouped item it spans 1.
  //     This means the material name cell repeats once per sub-group.
  //   - Project Number column: spans rows that share the same order number AND the same
  //     merge_group_id. Ungrouped items each get their own cell.

  const filteredDataWithRowSpans = useMemo(() => {

    const rows = [];

    // Step 1: group by material name
    const materialGroups = {};

    filtered.forEach(item => {

      const materialName = item.material_name || 'Unknown';

      if (!materialGroups[materialName]) {

        materialGroups[materialName] = { materialName, subGroups: [] };

      }

      materialGroups[materialName].subGroups.push(item);

    });

    let globalIndex = 0;

    Object.values(materialGroups).forEach(materialGroup => {

      const allItems = materialGroup.subGroups;

      // Step 2: build ordered sub-groups.
      // Grouped items (merge_group_id set)      → keyed by merge_group_id alone.
      // Ungrouped + no vendor (vendor_id null)  → share one "__unlinked__" key → single merged row.
      // Ungrouped + has vendor (vendor_id set)  → unique key per item → separate row each.
      const subGroupMap = new Map();
      let vendorLinkedCounter = 0;

      allItems.forEach(item => {

        let subKey;

        if (item.merge_group_id) {

          // Explicitly grouped — use group id as key
          subKey = `__grouped__${item.merge_group_id}`;

        } else if (!item.vendor_id) {

          // Ungrouped and no vendor linked yet — collapse into one shared row
          subKey = `__unlinked__`;

        } else {

          // Ungrouped but vendor already linked — show as its own separate row
          subKey = `__vendor_linked__${vendorLinkedCounter++}__${item.id}`;

        }

        if (!subGroupMap.has(subKey)) {

          subGroupMap.set(subKey, []);

        }

        subGroupMap.get(subKey).push(item);

      });

      // Step 3: flatten into rows with spans.
      // For grouped sub-groups (merge_group_id set):
      //   materialRowSpan and orderRowSpan both span the full sub-group size.
      // For unlinked sub-groups (__unlinked__ key, no vendor):
      //   materialRowSpan spans all items (EN8 shown once for the whole unlinked set),
      //   but orderRowSpan = 1 per item so each row shows its own Project Number separately.
      // For vendor-linked individual rows:
      //   both spans = 1 (single row each).

      subGroupMap.forEach((subItems, subKey) => {

        const isUnlinkedGroup = subKey === '__unlinked__';

        // groupOrderNumbers only relevant for grouped sub-groups (merge_group_id set)
        // where one spanned cell must show all distinct orders.
        // For unlinked items each row shows its own order number — no groupOrderNumbers needed.
        const groupOrderNumbers = isUnlinkedGroup
          ? null
          : [...new Set(subItems.map(it => it.source_order_number).filter(Boolean))];

        subItems.forEach((item, i) => {

          rows.push({

            ...item,

            key: item.id,

            materialRowSpan: i === 0 ? subItems.length : 0,

            orderRowSpan: isUnlinkedGroup ? 1 : (i === 0 ? subItems.length : 0),

            groupOrderNumbers,

            index: globalIndex + 1

          });

          globalIndex++;

        });

      });

    });

    return rows;

  }, [filtered]);





  return (

    <div className="mt-4">

      <Card className="shadow-sm rounded-lg lg:rounded-xl border border-gray-100" styles={{ body: { padding: 0 } }} title={<div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 lg:gap-4"><div className="flex items-center gap-2"><SafetyCertificateOutlined className="text-blue-500 text-lg sm:text-xl" /><span className="font-bold text-gray-800 text-sm sm:text-base">Ordered Raw Materials</span></div><Space className="w-full lg:w-auto flex flex-col sm:flex-row flex-wrap gap-2" size="small"><Input.Search placeholder="Search..." allowClear onSearch={handleLinkedMaterialsSearch} onChange={(e) => handleLinkedMaterialsSearch(e.target.value)} value={searchText} maxLength={50} className="w-full sm:w-auto min-w-[150px] xs:min-w-[200px]" size="middle" /><Select mode="multiple" placeholder="Material" allowClear value={filterMaterialName} onChange={v => setFilterMaterialName(v || [])} size="middle" className="w-full sm:w-auto min-w-[120px] xs:min-w-[140px]" showSearch optionFilterProp="children" maxTagCount="responsive">{getUniqueMaterialNames().map(mname => <Option key={mname} value={mname}>{mname}</Option>)}</Select><Select mode="multiple" placeholder="Project" allowClear value={filterProjectNumber} onChange={v => setFilterProjectNumber(v || [])} size="middle" className="w-full sm:w-auto min-w-[120px] xs:min-w-[140px]" showSearch optionFilterProp="children" maxTagCount="responsive">{getUniqueProjectNumbers().map(pn => <Option key={pn} value={pn}>{pn}</Option>)}</Select><Select mode="multiple" placeholder="Vendor" allowClear value={filterVendorName} onChange={v => setFilterVendorName(v || [])} size="middle" className="w-full sm:w-auto min-w-[120px] xs:min-w-[140px]" showSearch optionFilterProp="children" maxTagCount="responsive">{getUniqueVendorNames().map(vname => <Option key={vname} value={vname}>{vname}</Option>)}</Select><Select mode="multiple" placeholder="Group" allowClear value={filterGroup} onChange={v => setFilterGroup(v || [])} size="middle" className="w-full sm:w-auto min-w-[120px] xs:min-w-[140px]" showSearch optionFilterProp="children" maxTagCount="responsive">{getUniqueGroups().map(group => <Option key={group} value={group}>{group}</Option>)}</Select><Button type="primary" size="middle" onClick={handleGroupOrders} loading={groupLoading} disabled={selectedRowKeys.length < 2 || areSelectedRowsAlreadyGrouped()} className="bg-blue-600">Group ({filteredDataWithRowSpans.filter(r => selectedRowKeys.includes(r.id) && !r.merge_group_id).length})</Button><Button size="middle" onClick={handleUngroupOrders} loading={groupLoading} disabled={!canUngroupSelectedRows()}>Ungroup ({filteredDataWithRowSpans.filter(r => selectedRowKeys.includes(r.id) && r.merge_group_id).length})</Button><OrderMaterialsPdfDownload rows={filteredDataWithRowSpans} label={[filterProjectNumber, filterMaterialName, filterVendorName].filter(Boolean).join(" | ") || "All Records"} /></Space></div>}>

        {loading ? (

          <div style={{ padding: 40, textAlign: 'center' }}><Spin size="large" /><div style={{ marginTop: 12 }}>Loading...</div></div>

        ) : filteredDataWithRowSpans.length === 0 ? (

          <div style={{ padding: 40, textAlign: 'center' }}><Empty description="No linked materials found" /></div>

        ) : (

          <div style={{ overflowX: 'auto', maxWidth: '100%' }}>

            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '100%', border: '1px solid #000' }}>

              <thead>

                <tr>

                  <th style={{ border: '1px solid #000', padding: '8px 12px', textAlign: 'center', fontWeight: 600, fontSize: 12, background: '#f0f0f0', width: '40px' }}>

                    <input

                      type="checkbox"

                      checked={selectedRowKeys.length > 0 && selectedRowKeys.length === filteredDataWithRowSpans.length}

                      onChange={(e) => {

                        if (e.target.checked) {

                          setSelectedRowKeys(filteredDataWithRowSpans.map(row => row.id));

                        } else {

                          setSelectedRowKeys([]);

                        }

                      }}

                    />

                  </th>

                  <th style={{ border: '1px solid #000', padding: '8px 12px', textAlign: 'center', fontWeight: 600, fontSize: 12, background: '#f0f0f0' }}><FilterHeader label="Material Name" options={getUniqueMaterialNames()} value={colProcess.length === 0 && colForm.length === 0 && colOrderStatus.length === 0 ? filterMaterialName : filterMaterialName} onChange={setFilterMaterialName} /></th>

                  <th style={{ border: '1px solid #000', padding: '8px 12px', textAlign: 'center', fontWeight: 600, fontSize: 12, background: '#f0f0f0' }}><FilterHeader label="Project Number" options={getUniqueProjectNumbers()} value={filterProjectNumber} onChange={setFilterProjectNumber} /></th>

                  <th style={{ border: '1px solid #000', padding: '8px 12px', textAlign: 'center', fontWeight: 600, fontSize: 12, background: '#f0f0f0' }}>Part Number</th>

                  <th style={{ border: '1px solid #000', padding: '8px 12px', textAlign: 'center', fontWeight: 600, fontSize: 12, background: '#f0f0f0' }}>Stock Dimensions</th>

                  <th style={{ border: '1px solid #000', padding: '8px 12px', textAlign: 'center', fontWeight: 600, fontSize: 12, background: '#f0f0f0' }}><FilterHeader label="Process Type" options={colFilterOptions.process} value={colProcess} onChange={setColProcess} /></th>

                  <th style={{ border: '1px solid #000', padding: '8px 12px', textAlign: 'center', fontWeight: 600, fontSize: 12, background: '#f0f0f0' }}><FilterHeader label="Form Type" options={colFilterOptions.form} value={colForm} onChange={setColForm} /></th>

                  <th style={{ border: '1px solid #000', padding: '8px 12px', textAlign: 'center', fontWeight: 600, fontSize: 12, background: '#f0f0f0' }}>Quantity</th>

                  <th style={{ border: '1px solid #000', padding: '8px 12px', textAlign: 'center', fontWeight: 600, fontSize: 12, background: '#f0f0f0' }}>Volume (m³)</th>

                  <th style={{ border: '1px solid #000', padding: '8px 12px', textAlign: 'center', fontWeight: 600, fontSize: 12, background: '#f0f0f0' }}>Mass (kg)</th>

                  <th style={{ border: '1px solid #000', padding: '8px 12px', textAlign: 'center', fontWeight: 600, fontSize: 12, background: '#f0f0f0' }}>Weight (N)</th>

                  <th style={{ border: '1px solid #000', padding: '8px 12px', textAlign: 'center', fontWeight: 600, fontSize: 12, background: '#f0f0f0' }}>Est. Cost (₹)</th>

                  <th style={{ border: '1px solid #000', padding: '8px 12px', textAlign: 'center', fontWeight: 600, fontSize: 12, background: '#f0f0f0' }}>Final Cost (₹)</th>

                  <th style={{ border: '1px solid #000', padding: '8px 12px', textAlign: 'center', fontWeight: 600, fontSize: 12, background: '#f0f0f0' }}><FilterHeader label="Vendor" options={getUniqueVendorNames()} value={filterVendorName} onChange={setFilterVendorName} /></th>

                  <th style={{ border: '1px solid #000', padding: '8px 12px', textAlign: 'center', fontWeight: 600, fontSize: 12, background: '#f0f0f0' }}><FilterHeader label="Order Status" options={colFilterOptions.orderStatus} value={colOrderStatus} onChange={setColOrderStatus} /></th>

                  <th style={{ border: '1px solid #000', padding: '8px 12px', textAlign: 'center', fontWeight: 600, fontSize: 12, background: '#f0f0f0' }}>Actions</th>

                </tr>

              </thead>

              <tbody>

                {filteredDataWithRowSpans.map((row, index) => {

                  // For grouped rows: isFirstOfGroup = first item in the sub-group (orderRowSpan > 0).
                  // groupRowSpan reuses orderRowSpan which already holds the exact sub-group size.

                  const isFirstOfGroup = row.merge_group_id && row.orderRowSpan > 0;

                  const groupRowSpan = isFirstOfGroup ? row.orderRowSpan : 0;

                  

                  return (

                  <tr key={row.id} style={{ backgroundColor: row.merge_group_id ? '#e6f7ff' : 'inherit' }}>

                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontSize: 11, verticalAlign: 'middle', textAlign: 'center', color: '#000' }}>

                      <input

                        type="checkbox"

                        checked={selectedRowKeys.includes(row.id)}

                        onChange={(e) => {

                          if (e.target.checked) {

                            setSelectedRowKeys([...selectedRowKeys, row.id]);

                          } else {

                            setSelectedRowKeys(selectedRowKeys.filter(key => key !== row.id));

                          }

                        }}

                      />

                    </td>

                    {row.materialRowSpan > 0 && <td rowSpan={row.materialRowSpan} style={{ border: '1px solid #000', padding: '4px 8px', fontSize: 11, verticalAlign: 'middle', textAlign: 'left', color: '#000' }}>{row.material_name}</td>}

                    {row.orderRowSpan > 0 && (
                      <td rowSpan={row.orderRowSpan} style={{ border: '1px solid #000', padding: '4px 8px', fontSize: 11, verticalAlign: 'middle', textAlign: 'left', color: '#000' }}>
                        {row.groupOrderNumbers && row.groupOrderNumbers.length > 1
                          ? row.groupOrderNumbers.map((on, idx) => (
                              <div key={idx}>
                                <div style={{ fontWeight: 500, paddingBottom: idx < row.groupOrderNumbers.length - 1 ? 4 : 0 }}>{on}</div>
                                {idx < row.groupOrderNumbers.length - 1 && (
                                  <div style={{ borderBottom: '1px solid #000', margin: '0 -8px' }} />
                                )}
                              </div>
                            ))
                          : (row.source_order_number || '-')}
                        {row.merge_group_id && <Tag color="blue" style={{ marginTop: 4, fontSize: 9 }}>{row.merge_group_id}</Tag>}
                      </td>
                    )}

                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontSize: 11, verticalAlign: 'middle', textAlign: 'left', color: '#000' }}>

                      {row.part_numbers && row.part_numbers.length > 0 ? (

                        <div>

                          {[...new Set(row.part_numbers)].slice(0, 3).map((part, idx) => (

                            <div key={idx} style={{ fontSize: '10px' }}>{part}</div>

                          ))}

                          {[...new Set(row.part_numbers)].length > 3 && (

                            <div style={{ fontSize: '9px', color: '#999' }}>+{[...new Set(row.part_numbers)].length - 3} more</div>

                          )}

                        </div>

                      ) : '-'}

                    </td>

                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontSize: 11, verticalAlign: 'middle', textAlign: 'left', color: '#000' }}>{row.stock_dimensions || '-'}</td>

                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontSize: 11, verticalAlign: 'middle', textAlign: 'center', color: '#000' }}>{row.process_type || '-'}</td>

                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontSize: 11, verticalAlign: 'middle', textAlign: 'center', color: '#000' }}>

                      {row.form_type ? <Tag color={row.form_type === 'Round' ? 'blue' : row.form_type === 'Square' ? 'green' : row.form_type === 'Pipe' ? 'orange' : 'default'}>{row.form_type}</Tag> : '-'}

                    </td>

                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontSize: 11, verticalAlign: 'middle', textAlign: 'center', color: '#000' }}>{row.quantity != null ? row.quantity : '-'}</td>

                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontSize: 11, verticalAlign: 'middle', textAlign: 'center', color: '#000' }}>{row.volume != null ? row.volume : '-'}</td>

                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontSize: 11, verticalAlign: 'middle', textAlign: 'center', color: '#000' }}>{row.mass != null ? row.mass.toFixed(3) : '-'}</td>

                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontSize: 11, verticalAlign: 'middle', textAlign: 'center', color: '#000' }}>{row.weight != null ? row.weight.toFixed(3) : '-'}</td>

                    <td style={{ border: '1px solid #000', padding: '4px 8px', fontSize: 11, verticalAlign: 'middle', textAlign: 'center', color: '#000' }}>{row.estimated_cost != null ? `₹${Number(row.estimated_cost).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}</td>

                    {/* Final Cost - row-span for groups */}

                    {(!row.merge_group_id || isFirstOfGroup) ? (

                      <td rowSpan={groupRowSpan > 0 ? groupRowSpan : undefined} style={{ border: '1px solid #000', padding: '4px 8px', fontSize: 11, verticalAlign: 'middle', textAlign: 'center', color: '#000' }}>{row.final_cost != null ? `₹${Number(row.final_cost).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}</td>

                    ) : null}

                    {/* Vendor - row-span for groups */}

                    {(!row.merge_group_id || isFirstOfGroup) ? (

                      <td rowSpan={groupRowSpan > 0 ? groupRowSpan : undefined} style={{ border: '1px solid #000', padding: '4px 8px', fontSize: 11, verticalAlign: 'middle', textAlign: 'left', color: '#000' }}>

                        {row.received_vendor_name ? (

                          <span className="font-medium text-green-700">{row.received_vendor_name}</span>

                        ) : row.vendor_name ? (

                          row.vendor_name

                        ) : '-'}

                      </td>

                    ) : null}

                    {/* Order Status - row-span for groups */}

                    {(!row.merge_group_id || isFirstOfGroup) ? (

                      <td rowSpan={groupRowSpan > 0 ? groupRowSpan : undefined} style={{ border: '1px solid #000', padding: '4px 8px', fontSize: 11, verticalAlign: 'middle', textAlign: 'center', color: '#000' }}>

                        {row.source_type === 'general' ? '-' : row.order_status ? (

                          <Tag color={

                            row.order_status === 'enquiry' ? 'cyan' :

                            row.order_status === 'purchase_request' ? 'orange' :

                            row.order_status === 'purchase_order' ? 'warning' :

                            row.order_status === 'received' ? 'success' : 'default'

                          }>

                            {row.order_status === 'enquiry' ? 'Purchase Request' : row.order_status}

                          </Tag>

                        ) : '-'}

                      </td>

                    ) : null}

                    {/* Actions column - use rowspan for groups */}

                    {(!row.merge_group_id || isFirstOfGroup) ? (

                      <td rowSpan={groupRowSpan > 0 ? groupRowSpan : undefined} style={{ border: '1px solid #000', padding: '4px 8px', fontSize: 11, verticalAlign: 'middle', textAlign: 'center', color: '#000' }}>

                        {row.merge_group_id ? (

                          // For grouped orders (first row only), show action buttons with tooltip indicating it applies to all

                          <Space>

                            {/* Only show link vendors button if vendors are not already linked */}

                            {!row.vendor_id && (

                              <Tooltip title="Link Vendors (applies to all grouped orders)">

                                <Button type="text" size="small" icon={<ShoppingCartOutlined />} className="text-purple-600 hover:bg-purple-50" onClick={() => handleOpenVendorSelect(row)} />

                              </Tooltip>

                            )}

                            <Tooltip title="Quick Status Change (applies to all grouped orders)">

                              <Button type="text" size="small" icon={<CheckCircleOutlined />} className="text-green-600 hover:bg-green-50" onClick={() => handleQuickStatusChange(row, 'purchase_request')} />

                            </Tooltip>

                            <Tooltip title="Delete Link (applies to all grouped orders)">

                              <Button type="text" size="small" icon={<DeleteOutlined />} className="text-red-500 hover:bg-red-50" onClick={() => handleDeleteLinkGroup(row)} />

                            </Tooltip>

                          </Space>

                        ) : (

                          // For non-grouped orders, show normal action buttons

                          <Space>

                            {/* Only show link vendors button if vendors are not already linked */}

                            {row.creation_source === 'auto_extract' && (!row.vendor_id || row.vendor_id === '') && (

                              <Tooltip title="Link Vendors">

                                <Button type="text" size="small" icon={<ShoppingCartOutlined />} className="text-purple-600 hover:bg-purple-50" onClick={() => handleOpenVendorSelect(row)} />

                              </Tooltip>

                            )}

                            <Tooltip title="Quick Status Change">

                              <Button type="text" size="small" icon={<CheckCircleOutlined />} className="text-green-600 hover:bg-green-50" onClick={() => handleQuickStatusChange(row, 'purchase_request')} />

                            </Tooltip>

                            <Tooltip title="Delete Link"><Button type="text" size="small" icon={<DeleteOutlined />} className="text-red-500 hover:bg-red-50" onClick={() => handleDeleteLinkGroup(row)} /></Tooltip>

                          </Space>

                        )}

                      </td>

                    ) : null}

                  </tr>

                  );

                })}

              </tbody>

            </table>

          </div>

        )}

      </Card>



      {/* Quick Status Modal - for dropdown status changes */}

      <Modal open={quickStatusModalOpen} onCancel={() => setQuickStatusModalOpen(false)} title={<div className="flex items-center gap-2"><CheckCircleOutlined className="text-blue-500" /><span className="font-bold text-gray-800 text-sm sm:text-base">{quickStatusRecord?.merge_group_id ? 'Update Order Status & Vendor (Merged Orders)' : 'Update Order Status & Vendor'}</span></div>} width={{ xs: '90%', sm: '80%', md: 500, lg: 500 }} centered footer={[<Button key="cancel" onClick={() => setQuickStatusModalOpen(false)} className="w-full sm:w-auto">Cancel</Button>, <Button key="save" type="primary" style={{ backgroundColor: '#2563eb' }} onClick={handleSaveQuickStatus} className="w-full sm:w-auto">{quickStatusRecord?.merge_group_id ? 'Update All Merged' : 'Update Status'}</Button>]}>

        <div className="py-4 space-y-4">

          {quickStatusRecord?.merge_group_id && (

            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">

              <p className="text-sm text-purple-800">

                <strong>⚠️ Merged Orders:</strong> This status change will apply to ALL orders in this merge group.

              </p>

            </div>

          )}

          {/* Order Status */}

          <div className="space-y-1">

            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Order Status</Text>

            <Select

              style={{ width: '100%' }}

              placeholder="Select Order Status"

              value={quickStatusRecord?.order_status && quickStatusRecord.order_status !== 'enquiry' ? quickStatusRecord.order_status : undefined}

              onChange={(value) => {

                setQuickStatusRecord(prev => ({ ...prev, order_status: value, material_status: value }));

              }}

              size="middle"

              className="rounded-md"

            >

              <Option value="purchase_order">Purchase Order</Option>

              <Option value="received">Received</Option>

            </Select>

          </div>

          

          {/* Vendor Selection - Always visible */}

          <div className="space-y-1">

            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Selected Vendor *</Text>

            <Select

              style={{ width: '100%' }}

              placeholder="Select the vendor for this order"

              value={quickStatusReceivedVendorId}

              onChange={(value) => setQuickStatusReceivedVendorId(value)}

              size="middle"

              className="rounded-md"

              showSearch

              optionFilterProp="children"

            >

              {quickStatusRecord?.vendor_name ? (

                quickStatusRecord.vendor_name.split(',').map((name, idx) => {

                  const vendorIds = quickStatusRecord.vendor_id?.split(',').map(id => parseInt(id.trim())) || [];

                  return (

                    <Option key={vendorIds[idx] || idx} value={vendorIds[idx]}>

                      {name.trim()}

                    </Option>

                  );

                })

              ) : (

                <Option disabled>No vendors available</Option>

              )}

            </Select>

            <Text type="secondary" className="text-xs">Select from vendors contacted during enquiry</Text>

          </div>



          {/* Final Cost - Always visible */}

          <div className="space-y-1">

            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Final Cost (₹) *</Text>

            <InputNumber

              min={0}

              precision={0}

              controls={false}

              style={{ width: '100%' }}

              placeholder="Enter final cost"

              value={quickStatusRecord?.final_cost}

              onChange={(value) => {

                if (value !== null && value >= 0 && Number.isInteger(value)) {

                  setQuickStatusRecord(prev => ({ ...prev, final_cost: value }));

                } else if (value === null) {

                  setQuickStatusRecord(prev => ({ ...prev, final_cost: null }));

                }

              }}

              onKeyPress={(e) => {

                const charCode = e.which ? e.which : e.keyCode;

                if (charCode < 48 || charCode > 57) {

                  e.preventDefault();

                }

              }}

              size="middle"

              className="rounded-md"

            />

          </div>

        </div>

      </Modal>



      {/* Vendor Selection Modal for Auto-Extracted Materials */}

      <Modal

        open={vendorSelectModalOpen}

        onCancel={handleCloseVendorSelect}

        title={<div className="flex items-center gap-2"><ShoppingCartOutlined className="text-purple-500" /><span className="font-bold text-gray-800">{vendorSelectRecord?.merge_group_id ? 'Link Vendors for Enquiry (Merged Orders)' : 'Link Vendors for Enquiry'}</span></div>}

        width={{ xs: '90%', sm: '80%', md: 500, lg: 500 }}

        centered

        footer={[

          <Button key="cancel" onClick={handleCloseVendorSelect}>Cancel</Button>,

          <Button key="save" type="primary" loading={vendorSelectLoading} onClick={handleSaveVendorSelection}>{vendorSelectRecord?.merge_group_id ? 'Send for Enquiry (All Merged)' : 'Send for Enquiry'}</Button>

        ]}

      >

        <div className="py-4 space-y-4">

          {vendorSelectRecord?.merge_group_id && (

            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">

              <p className="text-sm text-purple-800">

                <strong>⚠️ Merged Orders:</strong> This will link the selected vendors to ALL orders in this merge group.

              </p>

            </div>

          )}

          {vendorSelectRecord && (

            <div className="space-y-2">

              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Material</Text>

              <div className="bg-gray-50 p-3 rounded">

                <Text strong>{vendorSelectRecord.material_name}</Text>

                <br />

                <Text type="secondary" className="text-sm">

                  {vendorSelectRecord.form_type} | Qty: {vendorSelectRecord.quantity} | 

                  {vendorSelectRecord.diameter && ` Ø${vendorSelectRecord.diameter}`}

                  {vendorSelectRecord.length && ` × ${vendorSelectRecord.length}mm`}

                </Text>

              </div>

            </div>

          )}

          <div className="space-y-2">

            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Select Vendors</Text>

            <Select

              mode="multiple"

              placeholder="Select vendors to send for enquiry"

              value={selectedVendors}

              onChange={setSelectedVendors}

              style={{ width: '100%' }}

              options={vendors.map(v => ({

                label: v.company_name || v.vendor_name || v.name || `Vendor ${v.id}`,

                value: v.id

              }))}

              showSearch

              filterOption={(input, option) =>

                option.label.toLowerCase().indexOf(input.toLowerCase()) >= 0

              }

            />

          </div>

        </div>

      </Modal>

    </div>

  );

};



export default PartsWithRawMaterialStatusTab;

