import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DatePicker, Select, Button, Card, Space, Tag, Typography, message, Empty, Spin } from 'antd';
import { HistoryOutlined, FilterOutlined, ReloadOutlined, StockOutlined, LinkOutlined, ShoppingOutlined } from '@ant-design/icons';
import axios from 'axios';
import { API_BASE_URL } from '../../Config/auth';
import dayjs from 'dayjs';
import RawMaterialHistoryDownload from '../../DownloadReports/RawMaterialHistoryDownload';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

// ── Column filter dropdown ────────────────────────────────────────────────────
const FilterHeader = ({ label, options, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const ref = useRef(null);
  
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  
  useEffect(() => {
    if (open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const dropdownWidth = 180;
      const viewportWidth = window.innerWidth;
      
      let left = rect.left;
      // If dropdown would go off right edge, align to right side
      if (left + dropdownWidth > viewportWidth) {
        left = viewportWidth - dropdownWidth - 10;
      }
      
      setDropdownPosition({
        top: rect.bottom + 4,
        left: left
      });
    }
  }, [open]);
  
  const active = value && value.length > 0;
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 3, cursor: 'pointer', userSelect: 'none' }}
      onClick={() => setOpen(o => !o)}>
      <span>{label}</span>
      <span style={{ fontSize: 9, color: active ? '#2563eb' : '#aaa' }}>▼</span>
      {active && <span style={{ background: '#2563eb', color: '#fff', borderRadius: 0, fontSize: 9, padding: '0 4px', lineHeight: '14px' }}>{value.length}</span>}
      {open && (
        <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', top: dropdownPosition.top, left: dropdownPosition.left, background: '#fff', border: '1px solid #d9d9d9', borderRadius: 0, boxShadow: '0 4px 12px rgba(0,0,0,.15)', zIndex: 10000, minWidth: 180, maxWidth: 250, maxHeight: 260, overflowY: 'auto', padding: '6px 0' }}>
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

const border = "1px solid #d0d0d0";
const thStyle = {
  border, padding: "5px 8px", textAlign: "center",
  fontWeight: 600, fontSize: 12, background: "#f0f5ff",
  whiteSpace: "nowrap",
};
const tdStyle = {
  border, padding: "4px 8px", fontSize: 11,
  verticalAlign: "middle", textAlign: "center", color: "#333",
};

const RawMaterialHistoryTab = () => {
  const [allHistory, setAllHistory] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [isResetting, setIsResetting] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
  });
  
  // Filter states
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [year, setYear] = useState(null);
  const [month, setMonth] = useState(null);
  const [day, setDay] = useState(null);
  const [sourceType, setSourceType] = useState([]);
  const [activityType, setActivityType] = useState([]);
  const [filterMaterial, setFilterMaterial] = useState([]);
  const [filterOrderNumber, setFilterOrderNumber] = useState([]);
  const [filterVendorName, setFilterVendorName] = useState([]);
  
  // Column filter states
  const [colMaterial, setColMaterial] = useState([]);
  const [colActivity, setColActivity] = useState([]);
  const [colFormType, setColFormType] = useState([]);
  const [colSource, setColSource] = useState([]);
  const [colOrder, setColOrder] = useState([]);
  const [colPart, setColPart] = useState([]);
  const [colUser, setColUser] = useState([]);
  const [colVendor, setColVendor] = useState([]);

  const getCurrentUserId = () => {
    const user = localStorage.getItem('user');
    if (user) {
      try {
        const userData = JSON.parse(user);
        return userData.id || userData.user_id;
      } catch (e) {
        console.error('Error parsing user data:', e);
        return null;
      }
    }
    return null;
  };

  const getUserRole = () => {
    const user = localStorage.getItem('user');
    if (user) {
      try {
        const userData = JSON.parse(user);
        return userData.role || userData.user_role;
      } catch (e) {
        console.error('Error parsing user role:', e);
        return null;
      }
    }
    return null;
  };

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const params = {};
      
      // Note: No user filtering - both Admin and MC see all history data
      
      const response = await axios.get(`${API_BASE_URL}/rawmaterials/history`, { params });
      setAllHistory(response.data.history);
      // Apply current filters to the new data
      applyFilters(response.data.history);
    } catch (error) {
      console.error('Error fetching history:', error);
      message.error('Failed to fetch history');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = (data = allHistory) => {
    let filteredData = [...data];
    
    // Filter by material (multiple)
    if (filterMaterial && filterMaterial.length > 0) {
      filteredData = filteredData.filter(item => {
        return filterMaterial.includes(item.material_name) || 
               filterMaterial.includes(item.raw_material_name) ||
               filterMaterial.includes(item.material?.material_name);
      });
    }
    
    // Filter by column filters
    if (colMaterial.length > 0) {
      filteredData = filteredData.filter(item => {
        return colMaterial.includes(item.material_name) || 
               colMaterial.includes(item.raw_material_name) ||
               colMaterial.includes(item.material?.material_name);
      });
    }
    if (colActivity.length > 0) {
      filteredData = filteredData.filter(item => colActivity.includes(getActivityTypeLabel(item.activity_type)));
    }
    if (colFormType.length > 0) {
      filteredData = filteredData.filter(item => colFormType.includes(item.form_type));
    }
    if (colSource.length > 0) {
      filteredData = filteredData.filter(item => colSource.includes(item.source_type?.toUpperCase()));
    }
    if (colOrder.length > 0) {
      filteredData = filteredData.filter(item => colOrder.includes(item.order_number));
    }
    if (colPart.length > 0) {
      filteredData = filteredData.filter(item => colPart.includes(item.part_name));
    }
    if (colUser.length > 0) {
      filteredData = filteredData.filter(item => colUser.includes(item.user_name));
    }
    if (colVendor.length > 0) {
      filteredData = filteredData.filter(item => {
        for (const vendor of colVendor) {
          if (item.received_vendor_name && item.received_vendor_name === vendor) {
            return true;
          }
          if (item.enquiry_vendor_name) {
            const enquiryVendors = item.enquiry_vendor_name.split(',').map(v => v.trim());
            if (enquiryVendors.includes(vendor)) {
              return true;
            }
          }
          if (item.vendor_name) {
            const vendors = item.vendor_name.split(',').map(v => v.trim());
            if (vendors.includes(vendor)) {
              return true;
            }
          }
        }
        return false;
      });
    }
    
    // Filter by date range
    if (startDate && endDate) {
      filteredData = filteredData.filter(item => {
        const itemDate = dayjs(item.timestamp);
        return itemDate.isAfter(startDate.startOf('day')) && itemDate.isBefore(endDate.endOf('day'));
      });
    } else if (year) {
      filteredData = filteredData.filter(item => {
        const itemDate = dayjs(item.timestamp);
        if (month) {
          if (day) {
            return itemDate.year() === year && itemDate.month() + 1 === month && itemDate.date() === day;
          }
          return itemDate.year() === year && itemDate.month() + 1 === month;
        }
        return itemDate.year() === year;
      });
    }
    
    // Filter by source type (multiple)
    if (sourceType && sourceType.length > 0) {
      filteredData = filteredData.filter(item => sourceType.includes(item.source_type));
    }
    
    // Filter by activity type (multiple)
    if (activityType && activityType.length > 0) {
      filteredData = filteredData.filter(item => activityType.includes(item.activity_type));
    }
    
    // Filter by order number (multiple)
    if (filterOrderNumber && filterOrderNumber.length > 0) {
      filteredData = filteredData.filter(item => filterOrderNumber.includes(item.order_number));
    }
    
    // Filter by vendor name (multiple)
    if (filterVendorName && filterVendorName.length > 0) {
      filteredData = filteredData.filter(item => {
        // Check if any of the selected vendors match
        for (const vendor of filterVendorName) {
          // Check received vendor name
          if (item.received_vendor_name && item.received_vendor_name === vendor) {
            return true;
          }
          // Check enquiry vendor name (split by comma for individual vendors)
          if (item.enquiry_vendor_name) {
            const enquiryVendors = item.enquiry_vendor_name.split(',').map(v => v.trim());
            if (enquiryVendors.includes(vendor)) {
              return true;
            }
          }
          // Check vendor name (split by comma for individual vendors)
          if (item.vendor_name) {
            const vendors = item.vendor_name.split(',').map(v => v.trim());
            if (vendors.includes(vendor)) {
              return true;
            }
          }
        }
        return false;
      });
    }
    
    // Force re-render by creating a completely new array
    setHistory([...filteredData]);
    setTotalCount(filteredData.length);
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  useEffect(() => {
    // Apply filters when date filters change
    if (allHistory.length > 0 && !isResetting) {
      applyFilters();
    }
  }, [startDate, endDate, year, month, day]);

  useEffect(() => {
    // Apply filters when activity or source type change
    if (allHistory.length > 0 && !isResetting) {
      applyFilters();
    }
  }, [activityType, sourceType, filterMaterial, filterOrderNumber, filterVendorName, colMaterial, colActivity, colFormType, colSource, colOrder, colPart, colUser, colVendor]);


  const handleResetFilters = () => {
    setIsResetting(true);
    
    setStartDate(null);
    setEndDate(null);
    setYear(null);
    setMonth(null);
    setDay(null);
    setSourceType([]);
    setActivityType([]);
    setFilterMaterial([]);
    setFilterOrderNumber([]);
    setFilterVendorName([]);
    
    // Reset column filters
    setColMaterial([]);
    setColActivity([]);
    setColFormType([]);
    setColSource([]);
    setColOrder([]);
    setColPart([]);
    setColUser([]);
    setColVendor([]);
    
    // Clear history immediately to show all data
    setHistory(allHistory);
    setTotalCount(allHistory.length);
    
    // Then fetch fresh data
    fetchHistory().finally(() => {
      setIsResetting(false);
    });
  };

  const getActivityTypeColor = (type) => {
    switch (type) {
      case 'material_created':
        return 'blue';
      case 'material_updated':
        return 'cyan';
      case 'material_deleted':
        return 'red';
      case 'stock_created':
        return 'green';
      case 'stock_updated':
        return 'purple';
      case 'stock_deleted':
        return 'red';
      case 'stock_status_changed':
        return 'orange';
      case 'unit_created':
        return 'geekblue';
      case 'unit_deleted':
        return 'red';
      case 'unit_status_changed':
        return 'gold';
      case 'material_linked':
        return 'green';
      case 'material_unlinked':
        return 'red';
      case 'order_status_changed':
        return 'orange';
      case 'vendor_changed':
        return 'magenta';
      default:
        return 'default';
    }
  };

  const getActivityTypeLabel = (type) => {
    switch (type) {
      case 'material_created':
        return 'Material Created';
      case 'material_updated':
        return 'Material Updated';
      case 'material_deleted':
        return 'Material Deleted';
      case 'stock_created':
        return 'Stock Created';
      case 'stock_updated':
        return 'Stock Updated';
      case 'stock_deleted':
        return 'Stock Deleted';
      case 'stock_status_changed':
        return 'Stock Status Changed';
      case 'unit_created':
        return 'Unit Created';
      case 'unit_deleted':
        return 'Unit Deleted';
      case 'unit_status_changed':
        return 'Unit Status Changed';
      case 'material_linked':
        return 'Material Linked';
      case 'material_unlinked':
        return 'Material Unlinked';
      case 'order_status_changed':
        return 'Order Status Changed';
      case 'vendor_changed':
        return 'Vendor Changed';
      default:
        return type;
    }
  };

  // Group history by material for rowspan
  const groupedHistory = useMemo(() => {
    const grouped = {};
    history.forEach(item => {
      const materialKey = item.material_id || item.raw_material_id || item.material?.id || 'unknown';
      const materialName = item.material_name || item.raw_material_name || item.material?.material_name || 'Unknown';
      const materialCode = item.material_code || item.material?.material_code || '';
      
      if (!grouped[materialKey]) {
        grouped[materialKey] = {
          materialId: materialKey,
          materialName,
          materialCode,
          entries: []
        };
      }
      grouped[materialKey].entries.push(item);
    });
    
    return Object.values(grouped).map(group => ({
      ...group,
      rowCount: group.entries.length
    }));
  }, [history]);

  // Column filter options
  const colFilterOptions = useMemo(() => {
    const materials = new Set();
    const activities = new Set();
    const formTypes = new Set();
    const sources = new Set();
    const orders = new Set();
    const parts = new Set();
    const users = new Set();
    const vendors = new Set();
    
    allHistory.forEach(h => {
      if (h.material_name) materials.add(h.material_name);
      if (h.raw_material_name) materials.add(h.raw_material_name);
      if (h.material?.material_name) materials.add(h.material.material_name);
      if (h.activity_type) activities.add(getActivityTypeLabel(h.activity_type));
      if (h.form_type) formTypes.add(h.form_type);
      if (h.source_type) sources.add(h.source_type.toUpperCase());
      if (h.order_number) orders.add(h.order_number);
      if (h.part_name) parts.add(h.part_name);
      if (h.user_name) users.add(h.user_name);
      if (h.vendor_name) {
        h.vendor_name.split(',').forEach(v => vendors.add(v.trim()));
      }
      if (h.received_vendor_name) vendors.add(h.received_vendor_name);
      if (h.enquiry_vendor_name) {
        h.enquiry_vendor_name.split(',').forEach(v => vendors.add(v.trim()));
      }
    });
    
    return {
      materials: Array.from(materials).sort(),
      activities: Array.from(activities).sort(),
      formTypes: Array.from(formTypes).sort(),
      sources: Array.from(sources).sort(),
      orders: Array.from(orders).sort(),
      parts: Array.from(parts).sort(),
      users: Array.from(users).sort(),
      vendors: Array.from(vendors).sort(),
    };
  }, [allHistory]);

  // Generate year options (last 5 years)
  const currentYear = new Date().getFullYear();
  const yearOptions = [];
  for (let i = 0; i < 5; i++) {
    yearOptions.push({ label: currentYear - i, value: currentYear - i });
  }

  // Generate month options
  const monthOptions = [
    { label: 'January', value: 1 },
    { label: 'February', value: 2 },
    { label: 'March', value: 3 },
    { label: 'April', value: 4 },
    { label: 'May', value: 5 },
    { label: 'June', value: 6 },
    { label: 'July', value: 7 },
    { label: 'August', value: 8 },
    { label: 'September', value: 9 },
    { label: 'October', value: 10 },
    { label: 'November', value: 11 },
    { label: 'December', value: 12 },
  ];

  // Generate day options (1-31)
  const dayOptions = [];
  for (let i = 1; i <= 31; i++) {
    dayOptions.push({ label: i, value: i });
  }

  return (
    <div style={{ padding: '16px', height: '100%', minHeight: 'calc(100vh - 120px)' }} className="raw-material-history-container">
      <style>{`
        .raw-material-history-container * {
          border-radius: 0 !important;
        }
        .raw-material-history-container .ant-select-selector,
        .raw-material-history-container .ant-picker,
        .raw-material-history-container .ant-btn,
        .raw-material-history-container .ant-card,
        .raw-material-history-container .ant-tag,
        .raw-material-history-container .ant-select-dropdown,
        .raw-material-history-container .ant-picker-dropdown,
        .raw-material-history-container .ant-dropdown,
        .raw-material-history-container .ant-popover,
        .raw-material-history-container .ant-modal,
        .raw-material-history-container .ant-message,
        .raw-material-history-container .ant-notification {
          border-radius: 0 !important;
        }
        .raw-material-history-container .ant-select-dropdown .ant-select-item-option-selected {
          border-radius: 0 !important;
        }
        .raw-material-history-container td, 
        .raw-material-history-container th {
          border-radius: 0 !important;
        }
      `}</style>
      {/* Header with Filters */}
      <Card size="small" style={{ marginBottom: 16 }} styles={{ body: { padding: '12px' } }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap', overflowX: 'auto' }}>
              <Text strong style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>Date Range:</Text>
              <RangePicker
                size="small"
                style={{ width: 200 }}
                value={[startDate, endDate]}
                onChange={(dates) => {
                  setStartDate(dates ? dates[0] : null);
                  setEndDate(dates ? dates[1] : null);
                  setYear(null);
                  setMonth(null);
                  setDay(null);
                }}
              />

              <Text strong style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>Material:</Text>
              <Select
                size="small"
                style={{ width: 150 }}
                placeholder="Materials"
                value={filterMaterial}
                onChange={setFilterMaterial}
                allowClear
                showSearch
                mode="multiple"
                maxTagCount={1} maxTagPlaceholder={(omitted) => `+${omitted.length} more`}
                optionFilterProp="children"
                options={(() => {
                  const materials = new Set();
                  allHistory.forEach(h => {
                    if (h.material_name) materials.add(h.material_name);
                    if (h.raw_material_name) materials.add(h.raw_material_name);
                    if (h.material?.material_name) materials.add(h.material.material_name);
                  });
                  return Array.from(materials).sort().map(m => ({ label: m, value: m }));
                })()}
              />

              <Text strong style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>Activity:</Text>
              <Select
                size="small"
                style={{ width: 150 }}
                placeholder="Select activities"
                value={activityType}
                onChange={setActivityType}
                allowClear
                mode="multiple"
                maxTagCount={1} maxTagPlaceholder={(omitted) => `+${omitted.length} more`}
                options={[
                  { label: 'Material Created', value: 'material_created' },
                  { label: 'Material Updated', value: 'material_updated' },
                  { label: 'Material Deleted', value: 'material_deleted' },
                  { label: 'Stock Created', value: 'stock_created' },
                  { label: 'Stock Updated', value: 'stock_updated' },
                  { label: 'Stock Deleted', value: 'stock_deleted' },
                  { label: 'Stock Status Changed', value: 'stock_status_changed' },
                  { label: 'Unit Created', value: 'unit_created' },
                  { label: 'Unit Deleted', value: 'unit_deleted' },
                  { label: 'Unit Status Changed', value: 'unit_status_changed' },
                  { label: 'Material Linked', value: 'material_linked' },
                  { label: 'Material Unlinked', value: 'material_unlinked' },
                  { label: 'Order Status Changed', value: 'order_status_changed' },
                  { label: 'Vendor Changed', value: 'vendor_changed' },
                ]}
              />

              <Text strong style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>Source:</Text>
              <Select
                size="small"
                style={{ width: 100 }}
                placeholder="Source"
                value={sourceType}
                onChange={setSourceType}
                allowClear
                mode="multiple"
                maxTagCount={1} maxTagPlaceholder={(omitted) => `+${omitted.length} more`}
                options={[
                  { label: 'General', value: 'general' },
                  { label: 'Order', value: 'order' },
                ]}
              />

              <Text strong style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>Order:</Text>
              <Select
                size="small"
                style={{ width: 150 }}
                placeholder="Order Numbers"
                value={filterOrderNumber}
                onChange={setFilterOrderNumber}
                allowClear
                showSearch
                mode="multiple"
                maxTagCount={1} maxTagPlaceholder={(omitted) => `+${omitted.length} more`}
                optionFilterProp="children"
                options={[
                  ...new Set(allHistory.filter(h => h.order_number).map(h => h.order_number))
                ].map(order => ({ label: order, value: order }))}
              />

              <Text strong style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>Vendor:</Text>
              <Select
                size="small"
                style={{ width: 150 }}
                placeholder="Vendor Names"
                value={filterVendorName}
                onChange={setFilterVendorName}
                allowClear
                showSearch
                mode="multiple"
                maxTagCount={1} maxTagPlaceholder={(omitted) => `+${omitted.length} more`}
                optionFilterProp="children"
                options={(() => {
                  const vendorNames = new Set();
                  allHistory.forEach(h => {
                    if (h.received_vendor_name) {
                      vendorNames.add(h.received_vendor_name);
                    }
                    if (h.enquiry_vendor_name) {
                      h.enquiry_vendor_name.split(',').forEach(v => vendorNames.add(v.trim()));
                    }
                    if (h.vendor_name) {
                      h.vendor_name.split(',').forEach(v => vendorNames.add(v.trim()));
                    }
                  });
                  return Array.from(vendorNames).sort().map(vendor => ({ label: vendor, value: vendor }));
                })()}
              />

              <Button size="small" onClick={handleResetFilters}>
                Reset
              </Button>

              <RawMaterialHistoryDownload historyData={history} />
            </div>
          </Card>

          {/* History Table */}
          <Card style={{ height: 'calc(100vh - 200px)' }} styles={{ body: { padding: 0, height: '100%', overflow: 'hidden' } }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <Spin size="large" />
              </div>
            ) : groupedHistory.length === 0 ? (
              <Empty description="No history found" style={{ marginTop: 40 }} />
            ) : (
              <div style={{ overflowX: 'auto', overflowY: 'auto', height: '100%' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1200, border }}>
                  <thead>
                    <tr>
                      <th rowSpan={2} style={thStyle}><FilterHeader label="Raw Material" options={colFilterOptions.materials} value={colMaterial} onChange={setColMaterial} /></th>
                      <th rowSpan={2} style={thStyle}>Date & Time</th>
                      <th rowSpan={2} style={thStyle}><FilterHeader label="Activity" options={colFilterOptions.activities} value={colActivity} onChange={setColActivity} /></th>
                      <th rowSpan={2} style={thStyle}><FilterHeader label="Form Type" options={colFilterOptions.formTypes} value={colFormType} onChange={setColFormType} /></th>
                      <th rowSpan={2} style={thStyle}>Dimensions</th>
                      <th rowSpan={2} style={thStyle}><FilterHeader label="Source" options={colFilterOptions.sources} value={colSource} onChange={setColSource} /></th>
                      <th rowSpan={2} style={thStyle}><FilterHeader label="Order" options={colFilterOptions.orders} value={colOrder} onChange={setColOrder} /></th>
                      <th rowSpan={2} style={thStyle}><FilterHeader label="Part" options={colFilterOptions.parts} value={colPart} onChange={setColPart} /></th>
                      <th rowSpan={2} style={thStyle}>Length Used</th>
                      <th rowSpan={2} style={thStyle}><FilterHeader label="User" options={colFilterOptions.users} value={colUser} onChange={setColUser} /></th>
                      <th rowSpan={2} style={thStyle}><FilterHeader label="Vendor" options={colFilterOptions.vendors} value={colVendor} onChange={setColVendor} /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedHistory.map((group, groupIdx) => (
                      group.entries.map((entry, entryIdx) => (
                        <tr key={entry.id} style={{ background: (groupIdx + entryIdx) % 2 === 0 ? '#fff' : '#fafafa' }}>
                          {entryIdx === 0 && (
                            <td rowSpan={group.rowCount} style={{ ...tdStyle, fontWeight: 600, textAlign: 'left', background: '#f5f5ff' }}>
                              <div>
                                <Text strong>{group.materialName}</Text>
                                {group.materialCode && (
                                  <div>
                                    <Text type="secondary" style={{ fontSize: '10px' }}>{group.materialCode}</Text>
                                  </div>
                                )}
                              </div>
                            </td>
                          )}
                          <td style={tdStyle}>{dayjs(entry.timestamp).format('YYYY-MM-DD HH:mm')}</td>
                          <td style={tdStyle}>
                            <Tag color={getActivityTypeColor(entry.activity_type)} icon={entry.activity_type === 'stock_created' ? <StockOutlined /> : entry.activity_type === 'material_linked' ? <LinkOutlined /> : null}>
                              {getActivityTypeLabel(entry.activity_type)}
                            </Tag>
                            {entry.activity_type === 'order_status_changed' && entry.description && (
                              <div style={{ fontSize: '10px', color: '#666', marginTop: '2px', fontWeight: 'bold' }}>
                                {entry.description}
                              </div>
                            )}
                          </td>
                          <td style={tdStyle}>{entry.form_type || '-'}</td>
                          <td style={tdStyle}>{entry.dimensions || '-'}</td>
                          <td style={tdStyle}>{entry.source_type ? entry.source_type.toUpperCase() : '-'}</td>
                          <td style={tdStyle}>{entry.order_number || '-'}</td>
                          <td style={{ ...tdStyle, textAlign: 'left' }}>
                            {entry.part_name ? (
                              <div>
                                <Text strong style={{ fontSize: '11px' }}>{entry.part_name}</Text>
                                <br />
                                <Text type="secondary" style={{ fontSize: '10px' }}>{entry.part_number}</Text>
                              </div>
                            ) : '-'}
                          </td>
                          <td style={tdStyle}>
                            {entry.activity_type === 'material_linked' && entry.used_length ? `${entry.used_length}mm` : entry.quantity ? `${entry.quantity} units` : '-'}
                          </td>
                          <td style={tdStyle}>{entry.user_name || '-'}</td>
                          <td style={{ ...tdStyle, textAlign: 'left', fontSize: '10px' }}>
                            {entry.activity_type === 'order_status_changed' ? (
                              entry.received_vendor_name ? (
                                <div>
                                  <div>
                                    <Text type="secondary">Enquiry: </Text>
                                    <Text>{entry.enquiry_vendor_name || '-'} ({entry.enquiry_vendor_count || 0})</Text>
                                  </div>
                                  <div style={{ marginTop: '2px' }}>
                                    <Text type="secondary">From: </Text>
                                    <Text strong style={{ color: '#52c41a' }}>{entry.received_vendor_name}</Text>
                                  </div>
                                </div>
                              ) : entry.enquiry_vendor_name ? (
                                <div>
                                  <Text type="secondary">Enquiry: </Text>
                                  <Text>{entry.enquiry_vendor_name} ({entry.enquiry_vendor_count})</Text>
                                </div>
                              ) : '-'
                            ) : entry.vendor_name || '-'}
                          </td>
                        </tr>
                      ))
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
    </div>
  );
};

export default RawMaterialHistoryTab;
