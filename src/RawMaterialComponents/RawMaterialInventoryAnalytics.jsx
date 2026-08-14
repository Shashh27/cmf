import React, { useMemo, useState, useEffect } from "react";
import { Card, Row, Col, Statistic, Empty, Spin, Select, Button } from "antd";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, Treemap
} from "recharts";
import {
  Package, Layers, Box, CheckCircle, AlertTriangle,
  Ruler, Circle, Square, Activity, RotateCcw
} from "lucide-react";

const COLORS = {
  available: "#52c41a",
  partially_used: "#faad14",
  exhausted: "#ff4d4f",
  not_available: "#d9d9d9",
  chart: ["#2E8B57", "#3CB371", "#66CDAA", "#8FBC8F", "#2E8B57", "#20B2AA", "#48D1CC", "#40E0D0"]
};

const fmtDim = (s) => {
  if (!s) return "-";
  if (s.form_type === "Round") return `⌀${s.diameter} × ${s.length}mm`;
  if (s.form_type === "Square") return `${s.length} × ${s.breadth} × ${s.height}mm`;
  if (s.form_type === "Pipe") return `⌀${s.outer_diameter}/${s.inner_diameter} × ${s.length}mm`;
  return "-";
};

const RawMaterialInventoryAnalytics = ({ inventoryData = [], loading = false }) => {
  const [selectedMaterial, setSelectedMaterial] = useState([]);
  const [selectedProcess, setSelectedProcess] = useState([]);
  const [selectedForm, setSelectedForm] = useState([]);
  const [selectedSource, setSelectedSource] = useState([]);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  const handleResetFilters = () => {
    setSelectedMaterial([]);
    setSelectedProcess([]);
    setSelectedForm([]);
    setSelectedSource([]);
  };

  // Get unique filter options from inventory data
  const filterOptions = useMemo(() => {
    const materials = inventoryData.map(m => ({ id: m.id, name: m.material_name }));
    const processes = [...new Set(inventoryData.flatMap(m => (m.stocks || []).map(s => s.process_type).filter(Boolean)))];
    const forms = [...new Set(inventoryData.flatMap(m => (m.stocks || []).map(s => s.form_type).filter(Boolean)))];
    const sources = [...new Set(inventoryData.flatMap(m => (m.stocks || []).map(s => s.source_type).filter(Boolean)))];
    return { materials, processes, forms, sources };
  }, [inventoryData]);

  const analyticsData = useMemo(() => {
    if (!inventoryData.length) return null;

    let totalMaterials = 0;
    let totalStocks = 0;
    let totalUnits = 0;
    let availableUnits = 0;
    let partiallyUsedUnits = 0;
    let exhaustedUnits = 0;
    let notAvailableUnits = 0;

    const materialStats = [];
    const dimensionStats = [];
    const formTypeStats = [];
    const sourceTypeStats = [];

    // Filter inventory data based on selected filters
    const filteredInventory = inventoryData.map(material => {
      if (selectedMaterial.length > 0 && !selectedMaterial.includes(material.id)) return null;
      const filteredStocks = (material.stocks || []).filter(stock => {
        if (selectedProcess.length > 0 && !selectedProcess.includes(stock.process_type)) return false;
        if (selectedForm.length > 0 && !selectedForm.includes(stock.form_type)) return false;
        if (selectedSource.length > 0 && !selectedSource.includes(stock.source_type)) return false;
        return true;
      });
      return { ...material, stocks: filteredStocks };
    }).filter(m => m !== null && m.stocks.length > 0);

    filteredInventory.forEach((material) => {
      totalMaterials++;
      const stocks = material.stocks || [];
      totalStocks += stocks.length;

      const materialDimensions = [];
      let materialAvailableUnits = 0;
      let materialTotalUnits = 0;

      stocks.forEach((stock) => {
        const units = stock.units || [];
        totalUnits += units.length;
        materialTotalUnits += units.length;

        const dimStr = fmtDim(stock);
        if (dimStr !== "-") {
          materialDimensions.push({
            dimensions: dimStr,
            processType: stock.process_type || "-",
            formType: stock.form_type || "-",
            totalUnits: units.length,
            availableUnits: units.filter(u => u.status === "available").length,
            partiallyUsedUnits: units.filter(u => u.status === "partially_used").length,
            exhaustedUnits: units.filter(u => u.status === "exhausted").length,
            notAvailableUnits: units.filter(u => u.status === "not_available").length,
            mass: stock.mass || 0,
            quantity: stock.quantity || 0
          });
        }

        units.forEach((unit) => {
          if (unit.status === "available") {
            availableUnits++;
            materialAvailableUnits++;
          } else if (unit.status === "partially_used") {
            partiallyUsedUnits++;
          } else if (unit.status === "exhausted") {
            exhaustedUnits++;
          } else if (unit.status === "not_available") {
            notAvailableUnits++;
          }
        });

        // Form type stats
        if (stock.form_type) {
          const existingForm = formTypeStats.find(f => f.name === stock.form_type);
          if (existingForm) {
            existingForm.count += units.length;
          } else {
            formTypeStats.push({ name: stock.form_type, count: units.length });
          }
        }

        // Source type stats
        if (stock.source_type) {
          const existingSource = sourceTypeStats.find(s => s.name === stock.source_type);
          if (existingSource) {
            existingSource.count += units.length;
          } else {
            sourceTypeStats.push({ name: stock.source_type, count: units.length });
          }
        }
      });

      materialStats.push({
        name: material.material_name,
        totalStocks: stocks.length,
        totalUnits: materialTotalUnits,
        availableUnits: materialAvailableUnits,
        dimensions: materialDimensions
      });

      dimensionStats.push(...materialDimensions);
    });

    // Aggregate dimension stats
    const aggregatedDimensions = {};
    dimensionStats.forEach((dim) => {
      const key = dim.dimensions;
      if (!aggregatedDimensions[key]) {
        aggregatedDimensions[key] = {
          dimensions: key,
          totalUnits: 0,
          availableUnits: 0,
          partiallyUsedUnits: 0,
          exhaustedUnits: 0,
          count: 0
        };
      }
      aggregatedDimensions[key].totalUnits += dim.totalUnits;
      aggregatedDimensions[key].availableUnits += dim.availableUnits;
      aggregatedDimensions[key].partiallyUsedUnits += dim.partiallyUsedUnits;
      aggregatedDimensions[key].exhaustedUnits += dim.exhaustedUnits;
      aggregatedDimensions[key].count += 1;
    });

    return {
      overview: {
        totalMaterials,
        totalStocks,
        totalUnits,
        availableUnits,
        partiallyUsedUnits,
        exhaustedUnits,
        notAvailableUnits,
        availabilityRate: totalUnits > 0 ? ((availableUnits / totalUnits) * 100).toFixed(1) : 0
      },
      materialStats,
      dimensionStats: Object.values(aggregatedDimensions).sort((a, b) => b.totalUnits - a.totalUnits),
      formTypeStats: formTypeStats.sort((a, b) => b.count - a.count),
      sourceTypeStats: sourceTypeStats.sort((a, b) => b.count - a.count),
      unitStatusData: [
        { name: "Available", value: availableUnits, color: COLORS.available },
        { name: "Partially Used", value: partiallyUsedUnits, color: COLORS.partially_used },
        { name: "Exhausted", value: exhaustedUnits, color: COLORS.exhausted },
        { name: "Not Available", value: notAvailableUnits, color: COLORS.not_available }
      ]
    };
  }, [inventoryData, selectedMaterial, selectedProcess, selectedForm, selectedSource]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-16">
        <Spin size="large" />
      </div>
    );
  }

  if (!analyticsData || !inventoryData.length) {
    return <Empty description="No inventory data available for analytics" />;
  }

  const { overview, materialStats, dimensionStats, formTypeStats, sourceTypeStats, unitStatusData } = analyticsData;

  const { Option } = Select;

  return (
    <div className="space-y-6">
      {/* Analytics Filters */}
      <Card className="shadow-sm" bordered={false} bodyStyle={{ padding: '12px' }}>
        <div className="flex justify-end items-center gap-2 flex-wrap">
          <Select
            mode="multiple"
            placeholder="Materials"
            allowClear
            value={selectedMaterial}
            onChange={setSelectedMaterial}
            style={{ minWidth: 150, maxWidth: 200 }}
            size="small"
            maxTagCount="responsive"
          >
            {filterOptions.materials.map(m => (
              <Option key={m.id} value={m.id}>{m.name}</Option>
            ))}
          </Select>
          <Select
            mode="multiple"
            placeholder="Processes"
            allowClear
            value={selectedProcess}
            onChange={setSelectedProcess}
            style={{ minWidth: 120, maxWidth: 160 }}
            size="small"
            maxTagCount="responsive"
          >
            {filterOptions.processes.map(p => (
              <Option key={p} value={p}>{p}</Option>
            ))}
          </Select>
          <Select
            mode="multiple"
            placeholder="Forms"
            allowClear
            value={selectedForm}
            onChange={setSelectedForm}
            style={{ minWidth: 120, maxWidth: 160 }}
            size="small"
            maxTagCount="responsive"
          >
            {filterOptions.forms.map(f => (
              <Option key={f} value={f}>{f}</Option>
            ))}
          </Select>
          <Select
            mode="multiple"
            placeholder="Sources"
            allowClear
            value={selectedSource}
            onChange={setSelectedSource}
            style={{ minWidth: 120, maxWidth: 160 }}
            size="small"
            maxTagCount="responsive"
          >
            {filterOptions.sources.map(s => (
              <Option key={s} value={s}>{s}</Option>
            ))}
          </Select>
          <Button
            icon={<RotateCcw className="w-4 h-4" />}
            onClick={handleResetFilters}
            size="small"
            type="default"
          >
            Reset
          </Button>
        </div>
      </Card>

      {/* Overview Cards */}
      <Row gutter={[8, 8]}>
        <Col xs={12} sm={12} md={6} lg={6}>
          <Card className="shadow-sm" bordered={false} bodyStyle={{ padding: '12px' }}>
            <Statistic
              title={<span className="text-gray-600 text-xs font-medium">Total Materials</span>}
              value={overview.totalMaterials}
              prefix={<Package className="w-4 h-4 text-blue-500" />}
              valueStyle={{ color: "#1890ff", fontSize: '20px' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6} lg={6}>
          <Card className="shadow-sm" bordered={false} bodyStyle={{ padding: '12px' }}>
            <Statistic
              title={<span className="text-gray-600 text-xs font-medium">Total Stocks</span>}
              value={overview.totalStocks}
              prefix={<Layers className="w-4 h-4 text-green-500" />}
              valueStyle={{ color: "#52c41a", fontSize: '20px' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6} lg={6}>
          <Card className="shadow-sm" bordered={false} bodyStyle={{ padding: '12px' }}>
            <Statistic
              title={<span className="text-gray-600 text-xs font-medium">Total Units</span>}
              value={overview.totalUnits}
              prefix={<Box className="w-4 h-4 text-orange-500" />}
              valueStyle={{ color: "#fa8c16", fontSize: '20px' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6} lg={6}>
          <Card className="shadow-sm" bordered={false} bodyStyle={{ padding: '12px' }}>
            <Statistic
              title={<span className="text-gray-600 text-xs font-medium">Available Units</span>}
              value={overview.availableUnits}
              prefix={<CheckCircle className="w-4 h-4 text-green-600" />}
              valueStyle={{ color: "#52c41a", fontSize: '20px' }}
              suffix={<span className="text-xs text-gray-500">/ {overview.totalUnits}</span>}
            />
          </Card>
        </Col>
      </Row>

      {/* Unit Status Distribution */}
      <Row gutter={[12, 12]}>
        <Col xs={24} sm={24} md={12}>
          <Card title={<span className="text-sm font-semibold">Unit Status Distribution</span>} className="shadow-sm" bordered={false} bodyStyle={{ padding: '12px' }}>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={unitStatusData.filter(d => d.value > 0)}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent, value }) => {
                    const percentage = (percent * 100).toFixed(1);
                    if (parseFloat(percentage) < 5) {
                      return ''; // Don't show label for very small slices
                    }
                    return `${percentage}%`;
                  }}
                  outerRadius={windowWidth < 768 ? 80 : 110}
                  innerRadius={windowWidth < 768 ? 40 : 50}
                  fill="#8884d8"
                  dataKey="value"
                  labelStyle={{ fontSize: windowWidth < 768 ? '11px' : '13px', fontWeight: 700, fill: '#fff' }}
                >
                  {unitStatusData.filter(d => d.value > 0).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name, props) => {
                    const percentage = ((value / unitStatusData.reduce((sum, d) => sum + d.value, 0)) * 100).toFixed(1);
                    return [`${value} units (${percentage}%)`, name];
                  }}
                  contentStyle={{ fontSize: '12px', fontWeight: 500 }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={60}
                  iconType="circle"
                  wrapperStyle={{ fontSize: windowWidth < 768 ? '11px' : '13px', fontWeight: 600 }}
                  payload={unitStatusData.filter(d => d.value > 0).map(entry => {
                    const percentage = ((entry.value / unitStatusData.reduce((sum, d) => sum + d.value, 0)) * 100).toFixed(1);
                    return {
                      value: `${entry.name}: ${entry.value} (${percentage}%)`,
                      type: 'circle',
                      color: entry.color
                    };
                  })}
                />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} sm={24} md={12}>
          <Card title={<span className="text-sm font-semibold">Source Type Distribution</span>} className="shadow-sm" bordered={false} bodyStyle={{ padding: '12px' }}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={sourceTypeStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: '11px' }} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="count" fill="#2E8B57" name="Units" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      {/* Material-wise Breakdown */}
      <Card title={<span className="text-sm font-semibold">Material-wise Inventory Overview</span>} className="shadow-sm" bordered={false} bodyStyle={{ padding: '12px' }}>
        <ResponsiveContainer width="100%" height={windowWidth < 768 ? 300 : 400}>
          <BarChart data={materialStats} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" tick={{ fontSize: 10 }} />
            <YAxis dataKey="name" type="category" width={windowWidth < 768 ? 100 : 150} tick={{ fontSize: windowWidth < 768 ? 9 : 11 }} />
            <Tooltip contentStyle={{ fontSize: '11px' }} />
            <Legend wrapperStyle={{ fontSize: '11px' }} />
            <Bar dataKey="totalUnits" fill="#2E8B57" name="Total Units" />
            <Bar dataKey="availableUnits" fill="#52c41a" name="Available Units" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Dimensions Breakdown */}
      <Card title={<span className="text-sm font-semibold">Stock Dimensions & Unit Availability</span>} className="shadow-sm" bordered={false} bodyStyle={{ padding: '12px' }}>
        <ResponsiveContainer width="100%" height={windowWidth < 768 ? 400 : 500}>
          <BarChart data={dimensionStats.slice(0, windowWidth < 768 ? 8 : 15)}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="dimensions"
              angle={-45}
              textAnchor="end"
              height={windowWidth < 768 ? 80 : 100}
              tick={{ fontSize: windowWidth < 768 ? 8 : 10 }}
              interval={0}
            />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ fontSize: '11px' }} />
            <Legend wrapperStyle={{ fontSize: '11px' }} />
            <Bar dataKey="totalUnits" fill="#2E8B57" name="Total Units" />
            <Bar dataKey="availableUnits" fill="#52c41a" name="Available Units" />
            <Bar dataKey="partiallyUsedUnits" fill="#faad14" name="Partially Used" />
            <Bar dataKey="exhaustedUnits" fill="#ff4d4f" name="Exhausted" />
          </BarChart>
        </ResponsiveContainer>
        {dimensionStats.length > (windowWidth < 768 ? 8 : 15) && (
          <div className="text-center text-gray-500 text-xs mt-2">
            Showing top {windowWidth < 768 ? 8 : 15} dimensions by unit count
          </div>
        )}
      </Card>

      {/* Form Type Distribution */}
      <Row gutter={[12, 12]}>
        <Col xs={24} sm={24} md={12}>
          <Card title={<span className="text-sm font-semibold">Form Type Distribution</span>} className="shadow-sm" bordered={false} bodyStyle={{ padding: '12px' }}>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={formTypeStats}
                  cx="50%"
                  cy="50%"
                  labelLine={true}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                  outerRadius={windowWidth < 768 ? 70 : 80}
                  fill="#8884d8"
                  dataKey="count"
                  labelStyle={{ fontSize: windowWidth < 768 ? '9px' : '11px' }}
                >
                  {formTypeStats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS.chart[index % COLORS.chart.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: '11px' }} />
                <Legend wrapperStyle={{ fontSize: windowWidth < 768 ? '9px' : '11px' }} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} sm={24} md={12}>
          <Card
            title={
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-semibold">Availability Summary</span>
              </div>
            }
            className="shadow-sm"
            bordered={false}
            bodyStyle={{ padding: '12px' }}
          >
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-600 text-xs">Availability Rate</span>
                <span className="text-xl font-bold text-green-600">{overview.availabilityRate}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 text-xs">Partially Used</span>
                <span className="text-lg font-semibold text-orange-500">{overview.partiallyUsedUnits}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 text-xs">Exhausted Units</span>
                <span className="text-lg font-semibold text-red-500">{overview.exhaustedUnits}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${overview.availabilityRate}%` }}
                ></div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Detailed Material Dimensions Table */}
      <Card title={<span className="text-sm font-semibold">Detailed Material & Dimensions Breakdown</span>} className="shadow-sm" bordered={false} bodyStyle={{ padding: '12px' }}>
        <div className="space-y-3">
          {materialStats.map((material) => (
            <div key={material.name} className="border border-gray-200 rounded-lg p-3">
              <div className="flex flex-wrap justify-between items-center mb-2 gap-2">
                <h3 className="text-sm font-semibold text-gray-800">{material.name}</h3>
                <div className="flex flex-wrap gap-3 text-xs">
                  <span className="text-gray-600">Stocks: <strong>{material.totalStocks}</strong></span>
                  <span className="text-gray-600">Units: <strong>{material.totalUnits}</strong></span>
                  <span className="text-green-600">Available: <strong>{material.availableUnits}</strong></span>
                </div>
              </div>
              {material.dimensions.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {material.dimensions.map((dim, idx) => (
                    <div key={idx} className="bg-gray-50 rounded p-2 border border-gray-100">
                      <div className="flex items-center gap-2 mb-1 text-xs">
                        <span className="font-medium text-gray-700 font-mono">{dim.dimensions}</span>
                        <span className="text-gray-400">|</span>
                        <span className="text-gray-500">Process: <span className="font-semibold text-gray-700">{dim.processType}</span></span>
                        <span className="text-gray-400">|</span>
                        <span className="text-gray-500">Form: <span className="font-semibold text-gray-700">{dim.formType}</span></span>
                      </div>
                      <div className="grid grid-cols-2 gap-1 text-xs">
                        <div>
                          <span className="text-gray-500">Total:</span>
                          <span className="font-semibold ml-1">{dim.totalUnits}</span>
                        </div>
                        <div>
                          <span className="text-green-600">Avail:</span>
                          <span className="font-semibold ml-1">{dim.availableUnits}</span>
                        </div>
                        <div>
                          <span className="text-orange-500">Part:</span>
                          <span className="font-semibold ml-1">{dim.partiallyUsedUnits}</span>
                        </div>
                        <div>
                          <span className="text-red-500">Exh:</span>
                          <span className="font-semibold ml-1">{dim.exhaustedUnits}</span>
                        </div>
                      </div>
                      <div className="mt-1 w-full bg-gray-200 rounded-full h-1.5">
                        <div
                          className="bg-green-500 h-1.5 rounded-full"
                          style={{ width: `${dim.totalUnits > 0 ? (dim.availableUnits / dim.totalUnits) * 100 : 0}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-400 italic text-xs">No dimensions available</div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default RawMaterialInventoryAnalytics;
