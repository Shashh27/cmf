import React, { useEffect, useState } from 'react';
import {
  Card, DatePicker,
  Select, Empty, Spin, Tabs, Table, Tooltip,
  Button, Divider, Modal, Input
} from 'antd';
import { Line } from '@ant-design/plots';

import {
  Activity, BarChart2,
  AlertTriangle, RefreshCw,
  Wrench,
  Award, Clock,
  CheckCircle, XCircle, Target
} from 'lucide-react';
import dayjs from 'dayjs';
import axios from 'axios';
import { API_BASE_URL } from '../Config/auth';

const { Option } = Select;
const { Search: SearchInput } = Input;

const OEEDashboard = () => {
  const [machines, setMachines] = useState([]);
  const [oeeData, setOeeData] = useState({
    dateRange: dayjs(),
    selectedShift: 'all',
    selectedMachine: 'all'
  });

  const [activeTab, setActiveTab] = useState('3');
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
  const [filteredMachines, setFilteredMachines] = useState([]);
  const [shiftSummaryData, setShiftSummaryData] = useState([]);
  const [isLoadingShiftSummary, setIsLoadingShiftSummary] = useState(false);
  const [trendData, setTrendData] = useState([]);
  const [overallOEEData, setOverallOEEData] = useState(null);
  const [isLoadingOverallOEE, setIsLoadingOverallOEE] = useState(false);

  useEffect(() => {
    const initializeDashboard = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/monitoring/live`);
        const currentMachines = response.data.map(m => ({
          machine_id: m.machine_id,
          machine_name: m.machine_name
        }));
        setMachines(currentMachines);
      } catch (error) {}
      fetchAllData();
    };
    initializeDashboard();
  }, [oeeData.dateRange, oeeData.selectedShift]);

  useEffect(() => {
    if (oeeData.selectedMachine && oeeData.selectedMachine !== 'all') {
      setFilteredMachines(allMachinesOEE.filter(m => m.machine_id === oeeData.selectedMachine));
    } else {
      setFilteredMachines(allMachinesOEE);
    }
  }, [oeeData.selectedMachine, allMachinesOEE]);

  const fetchAllData = async () => {
    setIsLoadingOverallOEE(true);
    setIsLoadingShiftSummary(true);
    setIsLoadingMachines(true);
    try {
      const selectedDate = dayjs(oeeData.dateRange).format('YYYY-MM-DD');
      const params = new URLSearchParams();
      params.append('date', selectedDate);
      params.append('shift', oeeData.selectedShift || 'all');

      const response = await axios.get(
        `${API_BASE_URL}/production-analytics/overall-oee-analytics/?${params.toString()}`
      );
      const data = response.data;

      setOverallOEEData(data);
      setAllMachinesOEE(data.machine_breakdown);
      setFilteredMachines(data.machine_breakdown);

      const tableData = data.detailed_summaries.map((item, index) => ({
        key: index,
        date: item.date,
        shift: item.shift,
        machine: item.machine_name,
        machineId: item.machine_id,
        productionTime: item.production_time,
        idleTime: item.idle_time,
        offTime: item.off_time,
        totalParts: item.total_parts,
        goodParts: item.good_parts,
        bad_parts: item.bad_parts,
        availability: item.oee_metrics?.availability || 0,
        performance: item.oee_metrics?.performance || 0,
        quality: item.oee_metrics?.quality || 0,
        oee: item.oee_metrics?.oee || 0
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
      const response = await axios.get(
        `${API_BASE_URL}/production-analytics/machine-oee-analysis/${machineId}?${params.toString()}`
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
  const handleMachineChange = (value) => setOeeData({ ...oeeData, selectedMachine: value });
  const handleShiftChange = (value) => setOeeData({ ...oeeData, selectedShift: value });
  const handleRefresh = () => {
    setOeeData({ ...oeeData, dateRange: dayjs() });
    fetchAllData();
  };
  const handleTableChange = (pagination) => setPagination(pagination);

  const sortedShiftSummaryData = [...shiftSummaryData].sort((a, b) => {
    const sortField = shiftSummaryFilter.sortBy;
    const sortOrder = shiftSummaryFilter.sortDirection === 'asc' ? 1 : -1;
    if (sortField === 'date') return sortOrder * (new Date(a.date) - new Date(b.date));
    if (typeof a[sortField] === 'string') return sortOrder * a[sortField].localeCompare(b[sortField]);
    return sortOrder * (a[sortField] - b[sortField]);
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
        <Tooltip title={`${value} minutes`}>
          <div className="font-medium text-emerald-600">{value} min</div>
        </Tooltip>
      )
    },
    {
      title: 'Idle Time', dataIndex: 'idleTime', key: 'idleTime', width: 120,
      render: (value) => (
        <Tooltip title={`${value} minutes`}>
          <div className="font-medium text-amber-600">{value} min</div>
        </Tooltip>
      )
    },
    {
      title: 'Off Time', dataIndex: 'offTime', key: 'offTime', width: 120,
      render: (value) => (
        <Tooltip title={`${value} minutes`}>
          <div className="font-medium text-red-600">{value} min</div>
        </Tooltip>
      )
    },
    {
      title: 'Parts', dataIndex: 'parts', key: 'parts', width: 60,
      render: (_, record) => (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Total:</span>
            <span className="font-medium">{record.totalParts}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-green-600">Good:</span>
            <span className="font-medium text-green-600">{record.goodParts}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-red-600">Bad:</span>
            <span className="font-medium text-red-600">{record.badParts}</span>
          </div>
        </div>
      )
    },
    {
      title: 'Availability', dataIndex: 'availability', key: 'availability', width: 100,
      render: (value) => (
        <Tooltip title={`${value.toFixed(1)}%`}>
          <div className="font-medium text-blue-600">{value.toFixed(1)}%</div>
        </Tooltip>
      )
    },
    {
      title: 'Performance', dataIndex: 'performance', key: 'performance', width: 100,
      render: (value) => (
        <Tooltip title={`${value.toFixed(1)}%`}>
          <div className="font-medium text-amber-600">{value.toFixed(1)}%</div>
        </Tooltip>
      )
    },
    {
      title: 'Quality', dataIndex: 'quality', key: 'quality', width: 100,
      render: (value) => (
        <Tooltip title={`${value.toFixed(1)}%`}>
          <div className="font-medium text-purple-600">{value.toFixed(1)}%</div>
        </Tooltip>
      )
    },
    {
      title: 'OEE', dataIndex: 'oee', key: 'oee', width: 120, fixed: 'right',
      render: (value) => (
        <div className="flex items-center gap-2">
          <div className="font-medium" style={{
            color: value >= 85 ? '#10b981' : value >= 60 ? '#f59e0b' : '#ef4444'
          }}>
            {value.toFixed(1)}%
          </div>
        </div>
      ),
      sorter: (a, b) => a.oee - b.oee,
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
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 9, padding: '16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="flex items-center">
              <Activity size={18} className="text-blue-500 mr-3" />
              <Select
                placeholder="Select a machine"
                style={{ width: 300 }}
                onChange={handleMachineChange}
                value={oeeData.selectedMachine}
                allowClear
                className="min-w-[250px]"
                styles={{ popup: { root: { borderRadius: '8px' } } }}
              >
                <Option value="all">All Machines</Option>
                {machines.map(machine => (
                  <Option key={machine.machine_id} value={machine.machine_id}>
                    {machine.machine_name}
                  </Option>
                ))}
              </Select>
            </div>
            <Button
              icon={<RefreshCw size={16} />}
              onClick={() => fetchAllData()}
              loading={isLoadingMachines}
              className="flex items-center hover:bg-blue-50 border-blue-200 text-blue-600 hover:text-blue-700"
            >
              Refresh Data
            </Button>
          </div>

          {isLoadingMachines ? (
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: 256, background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <Spin size="large" />
              <p style={{ marginTop: 16, color: '#64748b' }}>Loading machine data...</p>
            </div>
          ) : filteredMachines.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredMachines.map(machine => (
                <div
                  key={machine.machine_id}
                  style={{
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    borderTop: `4px solid ${(machine.oee || machine.average_oee || 0) >= 85 ? '#10b981' : (machine.oee || machine.average_oee || 0) >= 60 ? '#f59e0b' : '#ef4444'}`,
                    padding: '16px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    transition: 'box-shadow 0.2s',
                  }}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="text-lg font-semibold">{machine.machine_name}</div>
                      <div className="text-xs text-gray-500 flex items-center">
                        <Wrench size={12} className="mr-1" />
                        ID: {machine.machine_id}
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <div className="text-2xl font-bold mt-1" style={{
                        color: (machine.oee || machine.average_oee || 0) >= 85 ? '#10b981' :
                               (machine.oee || machine.average_oee || 0) >= 60 ? '#f59e0b' : '#ef4444'
                      }}>
                        {(machine.oee || machine.average_oee || 0).toFixed(1)}%
                      </div>
                      <div className="text-xs text-gray-500">OEE Score</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="bg-blue-50 rounded-lg p-2 text-center">
                      <div className="text-xs text-gray-500">Availability</div>
                      <div className="text-xl font-bold text-blue-600">
                        {(machine.availability || machine.average_availability || 0).toFixed(1)}%
                      </div>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-2 text-center">
                      <div className="text-xs text-gray-500">Performance</div>
                      <div className="text-xl font-semibold text-amber-600">
                        {(machine.performance || machine.average_performance || 0).toFixed(1)}%
                      </div>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-2 text-center">
                      <div className="text-xs text-gray-500">Quality</div>
                      <div className="text-xl font-semibold text-purple-600">
                        {(machine.quality || machine.average_quality || 0).toFixed(1)}%
                      </div>
                    </div>
                  </div>

                  <Divider className="my-2">
                    <span className="text-xs text-gray-500 flex items-center">
                      <AlertTriangle size={12} className="mr-1 text-red-500" />
                      Loss Analysis
                    </span>
                  </Divider>

                  <div className="grid grid-cols-3 gap-2 text-center mb-4">
                    <div>
                      <div className="text-xs text-gray-500">Availability Loss</div>
                      <div className="text-sm font-semibold text-red-500">
                        {(machine.losses?.availability_loss || 0).toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Performance Loss</div>
                      <div className="text-sm font-semibold text-orange-500">
                        {(machine.losses?.performance_loss || 0).toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Quality Loss</div>
                      <div className="text-sm font-semibold text-pink-500">
                        {(machine.losses?.quality_loss || 0).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 48, textAlign: 'center' }}>
              <Empty description="No machine OEE data found for the selected criteria" />
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
          ) : filteredShiftSummaryData.length > 0 ? (
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
              <Empty description="No shift summary data available" />
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
            OEE
          </h1>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 2, fontWeight: 500 }}>
            {dayjs().format('MMMM D, YYYY · HH:mm:ss')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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

