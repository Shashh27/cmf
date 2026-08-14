import React, { useEffect, useState, useMemo } from 'react';
import { 
  DatePicker, 
  Select, Empty, Spin, Tabs, Table, Tooltip,
  Button, Modal, Input
} from 'antd';
import { api } from '../../api/client.js';

import {
  Activity, BarChart2, 
  RefreshCw, Filter,
  Award, Clock, 
  CheckCircle, Target, AlertTriangle
} from 'lucide-react';
import { Line } from '@ant-design/plots';
import dayjs from 'dayjs';
import axios from 'axios';

const { Option } = Select;
const { Search: SearchInput } = Input;
const { RangePicker } = DatePicker;

const formatPercent = (value) => (
  value === null || value === undefined ? '—' : `${Number(value).toFixed(1)}%`
);
const formatMinutes = (value) => (
  value === null || value === undefined ? '—' : `${value} min`
);
const formatDuration = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return `${value} min`;
  const raw = String(value);
  if (raw.includes(':')) {
    const parts = raw.split(':').map(Number);
    const h = parts[0] || 0;
    const m = parts[1] || 0;
    const s = parts[2] || 0;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(Math.floor(s)).padStart(2, '0')}`;
  }
  return raw;
};
const formatCount = (value) => (
  value === null || value === undefined ? '—' : value
);
const durationToSeconds = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  const parts = String(value).split(':').map(Number);
  if (parts.some((n) => Number.isNaN(n))) return null;
  return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
};

const compareShiftValues = (aVal, bVal, field) => {
  if (aVal == null && bVal == null) return 0;
  if (aVal == null) return 1;
  if (bVal == null) return -1;
  if (field === 'date') return new Date(aVal) - new Date(bVal);
  if (['productionTime', 'idleTime', 'offTime'].includes(field)) {
    return (durationToSeconds(aVal) ?? -1) - (durationToSeconds(bVal) ?? -1);
  }
  if (typeof aVal === 'string') return aVal.localeCompare(String(bVal));
  return Number(aVal) - Number(bVal);
};
const getOeeColor = (value) => {
  if (value === null || value === undefined) return '#94a3b8';
  if (value >= 85) return '#10b981';
  if (value >= 60) return '#f59e0b';
  return '#ef4444';
};

const OEE_TIER = {
  EXCELLENT: { cardBg: '#f0fdf4', cardBorder: '#86efac', pillBg: '#16a34a', pillText: '#fff', label: 'Excellent' },
  AVERAGE: { cardBg: '#fffbeb', cardBorder: '#fcd34d', pillBg: '#f59e0b', pillText: '#fff', label: 'Average' },
  POOR: { cardBg: '#fff1f2', cardBorder: '#fca5a5', pillBg: '#dc2626', pillText: '#fff', label: 'Poor' },
  NO_DATA: { cardBg: '#f8fafc', cardBorder: '#cbd5e1', pillBg: '#64748b', pillText: '#fff', label: 'No Data' },
};

const getOeeTierKey = (value) => {
  if (value === null || value === undefined) return 'NO_DATA';
  if (value >= 85) return 'EXCELLENT';
  if (value >= 60) return 'AVERAGE';
  return 'POOR';
};

const TIER_MATCH = {
  ALL: () => true,
  EXCELLENT: (value) => getOeeTierKey(value) === 'EXCELLENT',
  AVERAGE: (value) => getOeeTierKey(value) === 'AVERAGE',
  POOR: (value) => getOeeTierKey(value) === 'POOR',
  NO_DATA: (value) => getOeeTierKey(value) === 'NO_DATA',
};

const Field = ({ label, value, accent }) => (
  <div>
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#64748b', marginBottom: 3 }}>
      {label}
    </div>
    <div style={{
      fontSize: 13, fontWeight: 600, color: value && value !== '—' ? (accent || '#0f172a') : '#94a3b8',
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    }}>
      {value || '—'}
    </div>
  </div>
);

const MetricBox = ({ label, value, color, bg }) => (
  <div style={{ background: bg, borderRadius: 8, padding: '10px 6px', textAlign: 'center', minWidth: 0 }}>
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#64748b', marginBottom: 4 }}>
      {label}
    </div>
    <div style={{ fontSize: 17, fontWeight: 800, color: value !== '—' ? color : '#94a3b8', lineHeight: 1.2 }}>
      {value}
    </div>
  </div>
);

const OeeStatusPill = ({ oee }) => {
  if (oee === null || oee === undefined) return null;
  const s = OEE_TIER[getOeeTierKey(oee)];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: 99,
      background: s.pillBg, fontSize: 11, fontWeight: 700,
      color: s.pillText, letterSpacing: '0.05em', textTransform: 'uppercase',
      flexShrink: 0, whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  );
};

const OEEMachineCard = ({ machine, onClick }) => {
  const oee = machine.oee ?? machine.average_oee ?? null;
  const availability = machine.availability ?? machine.average_availability ?? null;
  const performance = machine.performance ?? machine.average_performance ?? null;
  const quality = machine.quality ?? machine.average_quality ?? null;
  const hasOee = oee !== null && oee !== undefined;
  const tier = hasOee ? OEE_TIER[getOeeTierKey(oee)] : { cardBg: '#ffffff', cardBorder: '#e2e8f0' };
  const accentColor = hasOee ? getOeeColor(oee) : '#cbd5e1';
  const availLoss = machine.losses?.availability_loss ?? null;
  const perfLoss = machine.losses?.performance_loss ?? null;
  const qualLoss = machine.losses?.quality_loss ?? null;
  const hasParts = [machine.total_parts, machine.good_parts, machine.bad_parts].some(v => v != null);

  return (
    <div
      onClick={onClick}
      style={{
        background: tier.cardBg,
        border: `1.5px solid ${tier.cardBorder}`,
        borderTop: `4px solid ${accentColor}`,
        borderRadius: 10,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 0.15s, transform 0.15s',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 18px rgba(0,0,0,0.10)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      <div style={{ padding: '14px 14px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', lineHeight: 1.3, wordBreak: 'break-word' }}>
            {machine.machine_name || 'Unknown'}
          </div>
          <div style={{ marginTop: 6 }}>
            <OeeStatusPill oee={oee} />
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: hasOee ? getOeeColor(oee) : '#94a3b8', lineHeight: 1 }}>
            {formatPercent(oee)}
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8', marginTop: 4 }}>
            OEE
          </div>
        </div>
      </div>

      <div style={{ height: 1, background: tier.cardBorder, opacity: 0.45, margin: '0 14px' }} />

      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <MetricBox label="Availability" value={formatPercent(availability)} color="#2563eb" bg="#eff6ff" />
          <MetricBox label="Performance" value={formatPercent(performance)} color="#d97706" bg="#fffbeb" />
          <MetricBox label="Quality" value={formatPercent(quality)} color="#7c3aed" bg="#f5f3ff" />
        </div>

        {hasParts && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '10px 12px', background: 'rgba(255,255,255,0.65)', borderRadius: 8, border: '1px solid rgba(0,0,0,0.04)' }}>
            <Field label="Total Parts" value={formatCount(machine.total_parts)} />
            <Field label="Good Parts" value={formatCount(machine.good_parts)} accent="#16a34a" />
            <Field label="Bad Parts" value={formatCount(machine.bad_parts)} accent="#dc2626" />
          </div>
        )}

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <AlertTriangle size={12} color="#ef4444" />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b' }}>
              Loss Analysis
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <MetricBox label="Avail. Loss" value={formatPercent(availLoss)} color="#dc2626" bg="#fef2f2" />
            <MetricBox label="Perf. Loss" value={formatPercent(perfLoss)} color="#ea580c" bg="#fff7ed" />
            <MetricBox label="Qual. Loss" value={formatPercent(qualLoss)} color="#db2777" bg="#fdf2f8" />
          </div>
        </div>
      </div>
    </div>
  );
};

const OEEDashboard = () => {
  const [machines, setMachines] = useState([]);
  const [oeeData, setOeeData] = useState({
    dateRange: [dayjs().startOf('day'), dayjs().endOf('day')],
    selectedShift: 'all',
  });

  const [activeTab, setActiveTab] = useState('3');
  const [selectedMachineIds, setSelectedMachineIds] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [machineSortOrder, setMachineSortOrder] = useState('oee');
  const [tierFilter, setTierFilter] = useState('ALL');
  const [trendModalVisible, setTrendModalVisible] = useState(false);
  const [trendModalLoading, setTrendModalLoading] = useState(false);
  const [selectedMachineForTrend, setSelectedMachineForTrend] = useState(null);
  const [shiftSummaryFilter, setShiftSummaryFilter] = useState({
    search: '',
    sortBy: 'oee',
    sortDirection: 'desc'
  });
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
  });
  const [allMachinesOEE, setAllMachinesOEE] = useState([]);
  const [isLoadingMachines, setIsLoadingMachines] = useState(false);
  const [selectedMachineData, setSelectedMachineData] = useState(null);
  const [shiftSummaryData, setShiftSummaryData] = useState([]);
  const [isLoadingShiftSummary, setIsLoadingShiftSummary] = useState(false);
  const [trendData, setTrendData] = useState([]);
  const [overallOEEData, setOverallOEEData] = useState(null);
  const [isLoadingOverallOEE, setIsLoadingOverallOEE] = useState(false);
  
  useEffect(() => {
    fetchAllData();
  }, [oeeData.dateRange, oeeData.selectedShift]);

  const displayedMachines = useMemo(() => {
    const matchTier = TIER_MATCH[tierFilter] || TIER_MATCH.ALL;
    return [...allMachinesOEE]
      .filter((machine) => {
        const machineOee = machine.oee ?? machine.average_oee ?? null;
        const matchesTier = matchTier(machineOee);
        const matchesSearch = !searchQuery || (machine.machine_name || '').toLowerCase().includes(searchQuery.toLowerCase());
        const matchesSelection = selectedMachineIds.length === 0
          || selectedMachineIds.includes('ALL')
          || selectedMachineIds.includes(machine.machine_id);
        return matchesTier && matchesSearch && matchesSelection;
      })
      .sort((a, b) => {
        if (machineSortOrder === 'name') {
          return (a.machine_name || '').localeCompare(b.machine_name || '');
        }
        const aOee = a.oee ?? a.average_oee ?? -1;
        const bOee = b.oee ?? b.average_oee ?? -1;
        if (aOee === -1 && bOee === -1) return 0;
        if (aOee === -1) return 1;
        if (bOee === -1) return -1;
        return bOee - aOee;
      });
  }, [allMachinesOEE, selectedMachineIds, searchQuery, machineSortOrder, tierFilter]);

  // Combined fetch function for hierarchical data
  const fetchAllData = async () => {
    setIsLoadingOverallOEE(true);
    setIsLoadingShiftSummary(true);
    setIsLoadingMachines(true);
    
    try {
      const [from, to] = oeeData.dateRange || [];
      const params = new URLSearchParams();
      if (from && to) {
        params.append('start_date', dayjs(from).format('YYYY-MM-DD HH:mm:ss'));
        params.append('end_date', dayjs(to).format('YYYY-MM-DD HH:mm:ss'));
      }
      // Shift filter applies to machine-wise analysis (and KPIs); shift summary still uses range
      params.append('shift', oeeData.selectedShift || 'all');
      
      // Call the single hierarchical endpoint
      const response = await api.get(`/production-analytics/overall-oee-analytics/?${params.toString()}`
      );
      
      const data = response.data;

      // 1. Set Overall KPI Data
      setOverallOEEData(data);

      setAllMachinesOEE(data.machine_breakdown || []);
      setMachines((data.machine_breakdown || []).map((m) => ({
        machine_id: m.machine_id,
        machine_name: m.machine_name,
      })));

      const tableData = (data.detailed_summaries || []).map((item, index) => ({
        key: index,
        date: item.date,
        shift: item.shift,
        machine: item.machine_name,
        machineId: item.machine_id,
        productionTime: item.production_time ?? null,
        idleTime: item.idle_time ?? null,
        offTime: item.off_time ?? null,
        totalParts: item.total_parts ?? null,
        goodParts: item.good_parts ?? null,
        badParts: item.bad_parts ?? null,
        availability: item.availability ?? item.oee_metrics?.availability ?? null,
        performance: item.performance ?? item.oee_metrics?.performance ?? null,
        quality: item.quality ?? item.oee_metrics?.quality ?? null,
        oee: item.oee ?? item.oee_metrics?.oee ?? null
      }));
      setShiftSummaryData(tableData);

    } catch (error) {
    } finally {
      setIsLoadingOverallOEE(false);
      setIsLoadingShiftSummary(false);
      setIsLoadingMachines(false);
    }
  };
  // Show trend modal and fetch data
  // const showTrendModal = async (machineId) => {
  //   setSelectedMachineForTrend(machineId);
  //   const machine = allMachinesOEE.find(m => m.machine_id === machineId);
  //   setSelectedMachineData(machine);
  //   setTrendModalVisible(true);
  //   setTrendModalLoading(true);
    
  //   try {
  //     const [startDate, endDate] = oeeData.dateRange;
  //     const formattedStartDate = dayjs(startDate).format('YYYY-MM-DD');
  //     const formattedEndDate = dayjs(endDate).format('YYYY-MM-DD');
      
  //     const response = await axios.get(
  //       `http://172.19.224.1:8002/production_monitoring/machine-oee-analysis/${machineId}?start_date=${formattedStartDate}&end_date=${formattedEndDate}`
  //     );
      
  //     if (response.data && response.data.oee_trends) {
  //       // Transform data for chart
  //       const chartData = response.data.oee_trends.flatMap(trend => [
  //         { date: trend.date, type: 'OEE', value: trend.oee },
  //         { date: trend.date, type: 'Availability', value: trend.availability },
  //         { date: trend.date, type: 'Performance', value: trend.performance },
  //         { date: trend.date, type: 'Quality', value: trend.quality }
  //       ]);
        
  //       setTrendData(chartData);
  //     }
  //   } catch (error) {
  //     console.error('Error fetching trend data:', error);
  //   } finally {
  //     setTrendModalLoading(false);
  //   }
  // };

  const showTrendModal = async (machineId) => {
  setSelectedMachineForTrend(machineId);
  const machine = allMachinesOEE.find(m => m.machine_id === machineId);
  setSelectedMachineData(machine);
  setTrendModalVisible(true);
  setTrendModalLoading(true);
  
  try {
    const rangeEnd = Array.isArray(oeeData.dateRange)
      ? oeeData.dateRange[1]
      : oeeData.dateRange;
    const selectedDate = dayjs(rangeEnd || undefined).format('YYYY-MM-DD');
    
    const params = new URLSearchParams();
    params.append('date', selectedDate);
    
    if (oeeData.selectedShift !== null && oeeData.selectedShift !== 'all') {
      params.append('shift', oeeData.selectedShift);
    } else {
      params.append('shift', 'all');
    }
    
    const response = await api.get(`/production-analytics/machine-oee-analysis/${machineId}?${params.toString()}`
    );
    
    if (response.data && response.data.oee_trends) {
      // Transform data for chart
      const chartData = response.data.oee_trends.flatMap(trend => [
        { date: trend.date, type: 'OEE', value: trend.oee },
        { date: trend.date, type: 'Availability', value: trend.availability },
        { date: trend.date, type: 'Performance', value: trend.performance },
        { date: trend.date, type: 'Quality', value: trend.quality }
      ]);
      
      setTrendData(chartData);
    }
  } catch (error) {
  } finally {
    setTrendModalLoading(false);
  }
};
  
  // Handle date range change
  const handleDateChange = (dates) => {
    if (dates && dates[0] && dates[1]) {
      setOeeData({ ...oeeData, dateRange: dates });
    }
  };
  
  // Handle shift selection change
  const handleShiftChange = (value) => {
    setOeeData({ ...oeeData, selectedShift: value });
  };
  
  // Handle refresh
  const handleRefresh = () => {
    setOeeData({
      ...oeeData,
      dateRange: [dayjs().startOf('day'), dayjs().endOf('day')],
    });
  };

  const handleTableChange = (nextPagination, _filters, sorter) => {
    setPagination(nextPagination);
    if (sorter && sorter.field) {
      if (sorter.order) {
        setShiftSummaryFilter((prev) => ({
          ...prev,
          sortBy: sorter.field,
          sortDirection: sorter.order === 'ascend' ? 'asc' : 'desc',
        }));
      }
    }
  };
  
  // Sort shift summary data
  const sortedShiftSummaryData = useMemo(() => {
    const sortField = shiftSummaryFilter.sortBy;
    const sortOrder = shiftSummaryFilter.sortDirection === 'asc' ? 1 : -1;
    return [...shiftSummaryData].sort((a, b) => (
      sortOrder * compareShiftValues(a[sortField], b[sortField], sortField)
    ));
  }, [shiftSummaryData, shiftSummaryFilter.sortBy, shiftSummaryFilter.sortDirection]);
  
  // Filter shift summary data by search term
  const filteredShiftSummaryData = useMemo(() => {
    const searchTerm = (shiftSummaryFilter.search || '').toLowerCase();
    if (!searchTerm) return sortedShiftSummaryData;
    return sortedShiftSummaryData.filter((item) => (
      (item.machine || '').toLowerCase().includes(searchTerm)
      || (item.date || '').toLowerCase().includes(searchTerm)
      || String(item.shift || '').includes(searchTerm)
    ));
  }, [sortedShiftSummaryData, shiftSummaryFilter.search]);

  const makeSorter = (field) => (a, b) => compareShiftValues(a[field], b[field], field);
  
  // Table columns
  const columns = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      width: 110,
      fixed: 'left',
      sorter: makeSorter('date'),
      sortOrder: shiftSummaryFilter.sortBy === 'date'
        ? (shiftSummaryFilter.sortDirection === 'asc' ? 'ascend' : 'descend')
        : null,
    },
    {
      title: 'Shift',
      dataIndex: 'shift',
      key: 'shift',
      width: 90,
      fixed: 'left',
      sorter: makeSorter('shift'),
      sortOrder: shiftSummaryFilter.sortBy === 'shift'
        ? (shiftSummaryFilter.sortDirection === 'asc' ? 'ascend' : 'descend')
        : null,
      render: (value) => (
        <span style={{
          display: 'inline-flex', padding: '2px 8px', borderRadius: 99,
          background: '#eff6ff', color: '#1d4ed8', fontSize: 12, fontWeight: 700,
        }}>
          {value ? `Shift ${value}` : '—'}
        </span>
      ),
    },
    {
      title: 'Machine',
      dataIndex: 'machine',
      key: 'machine',
      width: 170,
      fixed: 'left',
      sorter: makeSorter('machine'),
      sortOrder: shiftSummaryFilter.sortBy === 'machine'
        ? (shiftSummaryFilter.sortDirection === 'asc' ? 'ascend' : 'descend')
        : null,
      render: (value) => <span style={{ fontWeight: 700, color: '#0f172a' }}>{value || '—'}</span>,
    },
    {
      title: 'Production Time',
      dataIndex: 'productionTime',
      key: 'productionTime',
      width: 140,
      sorter: makeSorter('productionTime'),
      sortOrder: shiftSummaryFilter.sortBy === 'productionTime'
        ? (shiftSummaryFilter.sortDirection === 'asc' ? 'ascend' : 'descend')
        : null,
      render: (value) => (
        <span style={{ fontWeight: 600, color: '#059669', fontVariantNumeric: 'tabular-nums' }}>
          {formatDuration(value)}
        </span>
      ),
    },
    {
      title: 'Idle Time',
      dataIndex: 'idleTime',
      key: 'idleTime',
      width: 120,
      sorter: makeSorter('idleTime'),
      sortOrder: shiftSummaryFilter.sortBy === 'idleTime'
        ? (shiftSummaryFilter.sortDirection === 'asc' ? 'ascend' : 'descend')
        : null,
      render: (value) => (
        <span style={{ fontWeight: 600, color: '#d97706', fontVariantNumeric: 'tabular-nums' }}>
          {formatDuration(value)}
        </span>
      ),
    },
    {
      title: 'Off Time',
      dataIndex: 'offTime',
      key: 'offTime',
      width: 120,
      sorter: makeSorter('offTime'),
      sortOrder: shiftSummaryFilter.sortBy === 'offTime'
        ? (shiftSummaryFilter.sortDirection === 'asc' ? 'ascend' : 'descend')
        : null,
      render: (value) => (
        <span style={{ fontWeight: 600, color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>
          {formatDuration(value)}
        </span>
      ),
    },
    {
      title: 'Parts',
      dataIndex: 'totalParts',
      key: 'totalParts',
      width: 130,
      sorter: makeSorter('totalParts'),
      sortOrder: shiftSummaryFilter.sortBy === 'totalParts'
        ? (shiftSummaryFilter.sortDirection === 'asc' ? 'ascend' : 'descend')
        : null,
      render: (_, record) => (
        <div style={{ display: 'grid', gap: 2, fontSize: 12 }}>
          <div><span style={{ color: '#64748b' }}>Total </span><b>{formatCount(record.totalParts)}</b></div>
          <div><span style={{ color: '#16a34a' }}>Good </span><b style={{ color: '#16a34a' }}>{formatCount(record.goodParts)}</b></div>
          <div><span style={{ color: '#dc2626' }}>Bad </span><b style={{ color: '#dc2626' }}>{formatCount(record.badParts)}</b></div>
        </div>
      ),
    },
    {
      title: 'Availability',
      dataIndex: 'availability',
      key: 'availability',
      width: 120,
      sorter: makeSorter('availability'),
      sortOrder: shiftSummaryFilter.sortBy === 'availability'
        ? (shiftSummaryFilter.sortDirection === 'asc' ? 'ascend' : 'descend')
        : null,
      render: (value) => <span style={{ fontWeight: 700, color: '#2563eb' }}>{formatPercent(value)}</span>,
    },
    {
      title: 'Performance',
      dataIndex: 'performance',
      key: 'performance',
      width: 120,
      sorter: makeSorter('performance'),
      sortOrder: shiftSummaryFilter.sortBy === 'performance'
        ? (shiftSummaryFilter.sortDirection === 'asc' ? 'ascend' : 'descend')
        : null,
      render: (value) => <span style={{ fontWeight: 700, color: '#d97706' }}>{formatPercent(value)}</span>,
    },
    {
      title: 'Quality',
      dataIndex: 'quality',
      key: 'quality',
      width: 110,
      sorter: makeSorter('quality'),
      sortOrder: shiftSummaryFilter.sortBy === 'quality'
        ? (shiftSummaryFilter.sortDirection === 'asc' ? 'ascend' : 'descend')
        : null,
      render: (value) => <span style={{ fontWeight: 700, color: '#7c3aed' }}>{formatPercent(value)}</span>,
    },
    {
      title: 'OEE',
      dataIndex: 'oee',
      key: 'oee',
      width: 120,
      fixed: 'right',
      sorter: makeSorter('oee'),
      sortOrder: shiftSummaryFilter.sortBy === 'oee'
        ? (shiftSummaryFilter.sortDirection === 'asc' ? 'ascend' : 'descend')
        : null,
      render: (value) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 800, color: getOeeColor(value) }}>{formatPercent(value)}</span>
          <OeeStatusPill oee={value} />
        </div>
      ),
    },
  ];

  const tabItems = [
    {
      key: '3',
      label: (
        <span className="flex items-center gap-2">
          <BarChart2 size={16} />
          Machine-wise Analysis
        </span>
      ),
      children: (
        <div className="p-1">
          {showFilters && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 9, padding: '13px 16px', marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 5 }}>OEE Tier</div>
                <Select value={tierFilter} onChange={setTierFilter} size="small" style={{ width: 140 }}>
                  <Option value="ALL">All</Option>
                  <Option value="EXCELLENT">Excellent</Option>
                  <Option value="AVERAGE">Average</Option>
                  <Option value="POOR">Poor</Option>
                  <Option value="NO_DATA">No Data</Option>
                </Select>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 5 }}>Sort</div>
                <Select value={machineSortOrder} onChange={setMachineSortOrder} size="small" style={{ width: 130 }}>
                  <Option value="oee">By OEE</Option>
                  <Option value="name">By Name</Option>
                </Select>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 5 }}>Search</div>
                <SearchInput placeholder="Search machines…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} size="small" style={{ width: 200 }} allowClear />
              </div>
              {(tierFilter !== 'ALL' || searchQuery) && (
                <Button size="small" type="link" style={{ fontSize: 12, padding: 0 }} onClick={() => { setTierFilter('ALL'); setSearchQuery(''); }}>Clear all</Button>
              )}
            </div>
          )}

          <div style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>
              {displayedMachines.length} machine{displayedMachines.length !== 1 ? 's' : ''}{tierFilter !== 'ALL' || searchQuery || selectedMachineIds.length > 0 ? ' · filtered' : ''}
            </span>
          </div>

          {isLoadingMachines ? (
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: 256, background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0' }}>
              <Spin size="large" />
              <p style={{ marginTop: 16, color: '#64748b' }}>Loading machine data...</p>
            </div>
          ) : displayedMachines.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
              {displayedMachines.map(machine => (
                <OEEMachineCard
                  key={machine.machine_id}
                  machine={machine}
                  onClick={() => showTrendModal(machine.machine_id)}
                />
              ))}
            </div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '60px 0', textAlign: 'center' }}>
              <Empty description={
                allMachinesOEE.length > 0 ? 'No machines match your filters' : 'No machines configured'
              } />
              {allMachinesOEE.length > 0 && (
                <Button size="small" style={{ marginTop: 8 }} onClick={() => { setTierFilter('ALL'); setSearchQuery(''); setSelectedMachineIds([]); }}>
                  Clear filters
                </Button>
              )}
            </div>
          )}
        </div>
      )
    },
    {
      key: '2',
      label: (
        <span className="flex items-center gap-2">
          <Activity size={16} />
          Shift Summary
        </span>
      ),
      children: (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 9, padding: '16px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <SearchInput
              placeholder="Search machine, date, or shift…"
              style={{ width: 280 }}
              value={shiftSummaryFilter.search}
              onChange={e => setShiftSummaryFilter({
                ...shiftSummaryFilter,
                search: e.target.value
              })}
              allowClear
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Sort by</span>
              <Select
                style={{ width: 160 }}
                size="small"
                value={shiftSummaryFilter.sortBy}
                onChange={value => setShiftSummaryFilter({
                  ...shiftSummaryFilter,
                  sortBy: value
                })}
              >
                <Option value="date">Date</Option>
                <Option value="shift">Shift</Option>
                <Option value="machine">Machine</Option>
                <Option value="productionTime">Production Time</Option>
                <Option value="idleTime">Idle Time</Option>
                <Option value="offTime">Off Time</Option>
                <Option value="totalParts">Total Parts</Option>
                <Option value="availability">Availability</Option>
                <Option value="performance">Performance</Option>
                <Option value="quality">Quality</Option>
                <Option value="oee">OEE</Option>
              </Select>
              <Select
                style={{ width: 120 }}
                size="small"
                value={shiftSummaryFilter.sortDirection}
                onChange={value => setShiftSummaryFilter({
                  ...shiftSummaryFilter,
                  sortDirection: value
                })}
              >
                <Option value="desc">Descending</Option>
                <Option value="asc">Ascending</Option>
              </Select>
            </div>
          </div>
          
          {isLoadingShiftSummary ? (
            <div className="flex justify-center items-center py-10">
              <Spin size="large" />
            </div>
          ) : filteredShiftSummaryData.length > 0 ? (
            <Table 
              columns={columns} 
              dataSource={filteredShiftSummaryData} 
              scroll={{ x: 1500, y: 560 }}
              pagination={{
                ...pagination,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50', '100'],
                showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} entries`,
              }}
              onChange={handleTableChange}
              size="middle"
              rowKey={(record) => `${record.machineId}-${record.date}-${record.shift}-${record.key}`}
              style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}
            />
          ) : (
            <Empty description={shiftSummaryData.length ? 'No rows match your search' : 'No shift summary rows for this date/shift'} />
          )}
        </div>
      )
    }
  ];

  const oee = overallOEEData?.overall_oee || 0;
  const avail = overallOEEData?.overall_availability || 0;
  const perf = overallOEEData?.overall_performance || 0;
  const qual = overallOEEData?.overall_quality || 0;

  const kpiCards = [
    { label: 'OEE', value: oee.toFixed(1), icon: Award, color: oee >= 85 ? '#10b981' : oee >= 60 ? '#f59e0b' : '#ef4444' },
    { label: 'Availability', value: avail.toFixed(1), icon: Clock, color: '#185FA5' },
    { label: 'Performance', value: perf.toFixed(1), icon: Target, color: '#BA7517' },
    { label: 'Quality', value: qual.toFixed(1), icon: CheckCircle, color: '#534AB7' },
  ];

  return (
    <div style={{ background: '#f1f5f9', minHeight: '100vh', fontFamily: 'Inter, system-ui, -apple-system, sans-serif', padding: '24px' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 2, fontWeight: 500 }}>
            {Array.isArray(oeeData.dateRange) && oeeData.dateRange[0] && oeeData.dateRange[1]
              ? `${dayjs(oeeData.dateRange[0]).format('MMM D, YYYY HH:mm')} → ${dayjs(oeeData.dateRange[1]).format('MMM D, YYYY HH:mm')}`
              : dayjs().format('MMMM D, YYYY')}
            {' · '}{dayjs().format('HH:mm:ss')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {activeTab === '3' && (
            <Select
              mode="multiple"
              placeholder="Select Machines"
              style={{ width: 200, minWidth: 200, maxWidth: 200 }}
              size="small"
              allowClear
              maxTagCount="responsive"
              maxTagPlaceholder={(omitted) => `+${omitted.length} selected`}
              value={selectedMachineIds}
              onChange={(values) => setSelectedMachineIds(values || [])}
              options={[
                { label: 'ALL', value: 'ALL' },
                ...machines.map(m => ({ label: m.machine_name, value: m.machine_id }))
              ]}
            />
          )}
          <RangePicker
            value={oeeData.dateRange}
            onChange={handleDateChange}
            allowClear={false}
            showTime={{ format: 'HH:mm' }}
            format="YYYY-MM-DD HH:mm"
            size="small"
            style={{ minWidth: 320 }}
          />
          {activeTab === '3' && (
            <Select
              placeholder="Shift"
              style={{ width: 100 }}
              value={oeeData.selectedShift}
              onChange={handleShiftChange}
              allowClear
              size="small"
            >
              <Option value="all">All</Option>
              <Option value={1}>Shift 1</Option>
              <Option value={2}>Shift 2</Option>
            </Select>
          )}
          <Button size="small" onClick={handleRefresh} icon={<RefreshCw size={13} style={{ verticalAlign: 'middle' }} />} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }} loading={isLoadingOverallOEE || isLoadingShiftSummary || isLoadingMachines}>
            Refresh
          </Button>
          {activeTab === '3' && (
            <Button size="small" type={showFilters ? 'primary' : 'default'} onClick={() => setShowFilters(v => !v)} icon={<Filter size={13} style={{ verticalAlign: 'middle' }} />} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
              Filters
            </Button>
          )}
        </div>
      </div>

      {isLoadingOverallOEE ? (
        <div className="flex justify-center items-center h-28">
          <Spin size="large" />
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {kpiCards.map(({ label, value, icon: Icon, color }) => (
            <div
              key={label}
              style={{
                background: color,
                borderRadius: 10,
                padding: '16px 20px',
                flex: 1,
                minWidth: 130,
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
              }}
            >
              <Icon size={28} color="rgba(255,255,255,0.85)" strokeWidth={1.8} style={{ flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 30, fontWeight: 900, color: '#fff', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  {value}%
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 4 }}>
                  {label}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
      
      {/* Trend Modal */}
      <Modal
        title={
          <div className="flex items-center">
            <BarChart2 size={18} className="mr-2 text-blue-500" />
            <span>OEE Trends - {selectedMachineData?.machine_name || 'Machine'}</span>
          </div>
        }
        open={trendModalVisible}
        onCancel={() => setTrendModalVisible(false)}
        width={900}
        footer={[
          <Button key="close" onClick={() => setTrendModalVisible(false)}>
            Close
          </Button>
        ]}
      >
        {trendModalLoading ? (
          <div className="flex justify-center items-center py-10">
            <Spin size="large" />
          </div>
        ) : trendData.length > 0 ? (
          <div style={{ height: 500 }}>
            <Line 
              data={trendData}
              xField="date"
              yField="value"
              seriesField="type"
              yAxis={{
                min: 0,
                max: 100,
                title: {
                  text: 'Percentage (%)'
                }
              }}
              color={['#1890ff', '#52c41a', '#faad14', '#722ed1']}
              legend={{
                position: 'top'
              }}
              animation={false}
            />
          </div>
        ) : (
          <Empty description="No trend data available for this machine" />
        )}
      </Modal>
    </div>
  );
};

export default OEEDashboard; 