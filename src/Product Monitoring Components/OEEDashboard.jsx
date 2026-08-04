import React, { useEffect, useState, useMemo } from 'react';
import {
  DatePicker,
  Select, Empty, Spin, Tabs, Table, Tooltip,
  Button, Modal, Input
} from 'antd';
import { api } from '../api/client.js';

import {
  Activity, BarChart2,
  RefreshCw, Filter,
  Award, Clock,
  CheckCircle, Target, AlertTriangle
} from 'lucide-react';
import { Line } from '@ant-design/plots';
import dayjs from 'dayjs';

const { Option } = Select;
const { Search: SearchInput } = Input;

const formatPercent = (value) => (
  value === null || value === undefined ? '—' : `${Number(value).toFixed(1)}%`
);
const formatMinutes = (value) => (
  value === null || value === undefined ? '—' : `${value} min`
);
const formatCount = (value) => (
  value === null || value === undefined ? '—' : value
);
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
    dateRange: dayjs(),
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
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
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

  const fetchAllData = async () => {
    setIsLoadingOverallOEE(true);
    setIsLoadingShiftSummary(true);
    setIsLoadingMachines(true);
    try {
      const selectedDate = dayjs(oeeData.dateRange).format('YYYY-MM-DD');
      const params = new URLSearchParams();
      params.append('date', selectedDate);
      params.append('shift', oeeData.selectedShift || 'all');

      const response = await api.get(`/production-analytics/overall-oee-analytics/?${params.toString()}`
      );
      const data = response.data;

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
        availability: item.oee_metrics?.availability ?? null,
        performance: item.oee_metrics?.performance ?? null,
        quality: item.oee_metrics?.quality ?? null,
        oee: item.oee_metrics?.oee ?? null,
      }));
      setShiftSummaryData(tableData);
    } catch (error) {
    } finally {
      setIsLoadingOverallOEE(false);
      setIsLoadingShiftSummary(false);
      setIsLoadingMachines(false);
    }
  };

  const showTrendModal = async (machineId) => {
    setSelectedMachineForTrend(machineId);
    const machine = allMachinesOEE.find(m => m.machine_id === machineId);
    setSelectedMachineData(machine);
    setTrendModalVisible(true);
    setTrendModalLoading(true);
    try {
      const selectedDate = dayjs(oeeData.dateRange).format('YYYY-MM-DD');
      const params = new URLSearchParams();
      params.append('date', selectedDate);
      params.append('shift', oeeData.selectedShift !== null && oeeData.selectedShift !== 'all' ? oeeData.selectedShift : 'all');
      const response = await api.get(`/production-analytics/machine-oee-analysis/${machineId}?${params.toString()}`
      );
      if (response.data && response.data.oee_trends) {
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

  const handleDateChange = (date) => {
    if (date) setOeeData({ ...oeeData, dateRange: date });
  };
  const handleShiftChange = (value) => setOeeData({ ...oeeData, selectedShift: value });
  const handleRefresh = () => {
    setOeeData({ ...oeeData, dateRange: dayjs() });
    fetchAllData();
  };
  const handleTableChange = (pagination) => setPagination(pagination);

  const sortedShiftSummaryData = [...shiftSummaryData].sort((a, b) => {
    const sortField = shiftSummaryFilter.sortBy;
    const sortOrder = shiftSummaryFilter.sortDirection === 'asc' ? 1 : -1;
    const aVal = a[sortField];
    const bVal = b[sortField];
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    if (sortField === 'date') return sortOrder * (new Date(aVal) - new Date(bVal));
    if (typeof aVal === 'string') return sortOrder * aVal.localeCompare(bVal);
    return sortOrder * (aVal - bVal);
  });

  const filteredShiftSummaryData = sortedShiftSummaryData.filter(item => {
    const searchTerm = shiftSummaryFilter.search.toLowerCase();
    return (
      item.machine.toLowerCase().includes(searchTerm) ||
      item.date.toLowerCase().includes(searchTerm)
    );
  });

  const columns = [
    { title: 'Date', dataIndex: 'date', key: 'date', width: 100, fixed: 'left' },
    {
      title: 'Shift', dataIndex: 'shift', key: 'shift', width: 80, fixed: 'left',
      render: (value) => value || 'All'
    },
    { title: 'Machine', dataIndex: 'machine', key: 'machine', width: 150, fixed: 'left' },
    {
      title: 'Production Time', dataIndex: 'productionTime', key: 'productionTime', width: 120,
      render: (value) => (
        <Tooltip title={value == null ? 'No data' : `${value} minutes`}>
          <div className="font-medium text-emerald-600">{formatMinutes(value)}</div>
        </Tooltip>
      )
    },
    {
      title: 'Idle Time', dataIndex: 'idleTime', key: 'idleTime', width: 120,
      render: (value) => (
        <Tooltip title={value == null ? 'No data' : `${value} minutes`}>
          <div className="font-medium text-amber-600">{formatMinutes(value)}</div>
        </Tooltip>
      )
    },
    {
      title: 'Off Time', dataIndex: 'offTime', key: 'offTime', width: 120,
      render: (value) => (
        <Tooltip title={value == null ? 'No data' : `${value} minutes`}>
          <div className="font-medium text-red-600">{formatMinutes(value)}</div>
        </Tooltip>
      )
    },
    {
      title: 'Parts', dataIndex: 'parts', key: 'parts', width: 60,
      render: (_, record) => (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Total:</span>
            <span className="font-medium">{formatCount(record.totalParts)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-green-600">Good:</span>
            <span className="font-medium text-green-600">{formatCount(record.goodParts)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-red-600">Bad:</span>
            <span className="font-medium text-red-600">{formatCount(record.badParts)}</span>
          </div>
        </div>
      )
    },
    {
      title: 'Availability', dataIndex: 'availability', key: 'availability', width: 100,
      render: (value) => (
        <Tooltip title={value == null ? 'No data' : formatPercent(value)}>
          <div className="font-medium text-blue-600">{formatPercent(value)}</div>
        </Tooltip>
      )
    },
    {
      title: 'Performance', dataIndex: 'performance', key: 'performance', width: 100,
      render: (value) => (
        <Tooltip title={value == null ? 'No data' : formatPercent(value)}>
          <div className="font-medium text-amber-600">{formatPercent(value)}</div>
        </Tooltip>
      )
    },
    {
      title: 'Quality', dataIndex: 'quality', key: 'quality', width: 100,
      render: (value) => (
        <Tooltip title={value == null ? 'No data' : formatPercent(value)}>
          <div className="font-medium text-purple-600">{formatPercent(value)}</div>
        </Tooltip>
      )
    },
    {
      title: 'OEE', dataIndex: 'oee', key: 'oee', width: 120, fixed: 'right',
      render: (value) => (
        <div className="flex items-center gap-2">
          <div className="font-medium" style={{ color: getOeeColor(value) }}>
            {formatPercent(value)}
          </div>
        </div>
      ),
      sorter: (a, b) => {
        if (a.oee == null && b.oee == null) return 0;
        if (a.oee == null) return 1;
        if (b.oee == null) return -1;
        return a.oee - b.oee;
      },
      defaultSortOrder: 'descend'
    }
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
          <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
            <div className="flex items-center gap-4">
              <SearchInput
                placeholder="Search by machine name or date..."
                style={{ width: 250 }}
                value={shiftSummaryFilter.search}
                onChange={e => setShiftSummaryFilter({ ...shiftSummaryFilter, search: e.target.value })}
                allowClear
              />
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Sort by:</span>
                <Select
                  style={{ width: 150 }}
                  value={shiftSummaryFilter.sortBy}
                  onChange={value => setShiftSummaryFilter({ ...shiftSummaryFilter, sortBy: value })}
                >
                  <Option value="date">Date</Option>
                  <Option value="machine">Machine</Option>
                  <Option value="productionTime">Production Time</Option>
                  <Option value="idleTime">Idle Time</Option>
                  <Option value="offTime">Off Time</Option>
                  <Option value="oee">OEE</Option>
                </Select>
              </div>
            </div>
          </div>

          {isLoadingShiftSummary ? (
            <div className="flex justify-center items-center py-10">
              <Spin size="large" />
            </div>
          ) : shiftSummaryData.length > 0 ? (
            <Table
              columns={columns}
              dataSource={filteredShiftSummaryData}
              scroll={{ x: 1500, y: 600 }}
              pagination={{
                ...pagination,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50', '100'],
                showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} entries`,
              }}
              onChange={handleTableChange}
              size="middle"
              variant="outlined"
              className="custom-table"
            />
          ) : (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <Empty description="No machines configured" />
            </div>
          )}
        </div>
      )
    }
  ];

  // ── KPI data derived from API ──────────────────────────────────────────────
  const oee       = overallOEEData?.overall_oee          || 0;
  const avail     = overallOEEData?.overall_availability  || 0;
  const perf      = overallOEEData?.overall_performance   || 0;
  const qual      = overallOEEData?.overall_quality       || 0;

  const kpiCards = [
    { label: 'OEE',          value: oee.toFixed(1), icon: Award,    color: oee  >= 85 ? '#10b981' : oee  >= 60 ? '#f59e0b' : '#ef4444' },
    { label: 'Availability', value: avail.toFixed(1), icon: Clock,    color: '#185FA5' },
    { label: 'Performance',  value: perf.toFixed(1),  icon: Target,   color: '#BA7517' },
    { label: 'Quality',      value: qual.toFixed(1),  icon: CheckCircle, color: '#534AB7' },
  ];

  return (
    <div style={{ background: '#f1f5f9', minHeight: '100vh', fontFamily: 'Inter, system-ui, -apple-system, sans-serif', padding: '24px' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.5px' }}>
            Overall Equipment Effectiveness
          </h1>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 2, fontWeight: 500 }}>
            {dayjs(oeeData.dateRange).format('MMMM D, YYYY')} · {dayjs().format('HH:mm:ss')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
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
          <DatePicker
            value={oeeData.dateRange}
            onChange={handleDateChange}
            allowClear={false}
            format="YYYY-MM-DD"
            size="small"
          />
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
            <Option value={3}>Shift 3</Option>
          </Select>
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

      {/* ── KPI cards ───────────────────────────────────────────────────────── */}
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

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />

      {/* ── Trend Modal ─────────────────────────────────────────────────────── */}
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
          <Button key="close" onClick={() => setTrendModalVisible(false)}>Close</Button>
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
              yAxis={{ min: 0, max: 100, title: { text: 'Percentage (%)' } }}
              color={['#1890ff', '#52c41a', '#faad14', '#722ed1']}
              legend={{ position: 'top' }}
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

