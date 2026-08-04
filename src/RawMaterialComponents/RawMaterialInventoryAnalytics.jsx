import React, { useMemo } from "react";
import { Card, Row, Col, Statistic, Empty, Spin } from "antd";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, Treemap
} from "recharts";
import { 
  Package, Layers, Box, CheckCircle, AlertTriangle, 
  Ruler, Circle, Square, Activity 
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

    inventoryData.forEach((material) => {
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
            formType: stock.form_type,
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
  }, [inventoryData]);

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

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card className="shadow-sm" bordered={false}>
            <Statistic
              title={<span className="text-gray-600 text-sm font-medium">Total Materials</span>}
              value={overview.totalMaterials}
              prefix={<Package className="w-5 h-5 text-blue-500" />}
              valueStyle={{ color: "#1890ff" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="shadow-sm" bordered={false}>
            <Statistic
              title={<span className="text-gray-600 text-sm font-medium">Total Stocks</span>}
              value={overview.totalStocks}
              prefix={<Layers className="w-5 h-5 text-green-500" />}
              valueStyle={{ color: "#52c41a" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="shadow-sm" bordered={false}>
            <Statistic
              title={<span className="text-gray-600 text-sm font-medium">Total Units</span>}
              value={overview.totalUnits}
              prefix={<Box className="w-5 h-5 text-orange-500" />}
              valueStyle={{ color: "#fa8c16" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="shadow-sm" bordered={false}>
            <Statistic
              title={<span className="text-gray-600 text-sm font-medium">Available Units</span>}
              value={overview.availableUnits}
              prefix={<CheckCircle className="w-5 h-5 text-green-600" />}
              valueStyle={{ color: "#52c41a" }}
              suffix={`/ ${overview.totalUnits}`}
            />
          </Card>
        </Col>
      </Row>

      {/* Unit Status Distribution */}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card title="Unit Status Distribution" className="shadow-sm" bordered={false}>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={unitStatusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {unitStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Source Type Distribution" className="shadow-sm" bordered={false}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={sourceTypeStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill="#2E8B57" name="Units" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      {/* Material-wise Breakdown */}
      <Card title="Material-wise Inventory Overview" className="shadow-sm" bordered={false}>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={materialStats} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis dataKey="name" type="category" width={150} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="totalUnits" fill="#2E8B57" name="Total Units" />
            <Bar dataKey="availableUnits" fill="#52c41a" name="Available Units" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Dimensions Breakdown */}
      <Card title="Stock Dimensions & Unit Availability" className="shadow-sm" bordered={false}>
        <ResponsiveContainer width="100%" height={500}>
          <BarChart data={dimensionStats.slice(0, 15)}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="dimensions" 
              angle={-45} 
              textAnchor="end" 
              height={100}
              tick={{ fontSize: 10 }}
            />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="totalUnits" fill="#2E8B57" name="Total Units" />
            <Bar dataKey="availableUnits" fill="#52c41a" name="Available Units" />
            <Bar dataKey="partiallyUsedUnits" fill="#faad14" name="Partially Used" />
            <Bar dataKey="exhaustedUnits" fill="#ff4d4f" name="Exhausted" />
          </BarChart>
        </ResponsiveContainer>
        {dimensionStats.length > 15 && (
          <div className="text-center text-gray-500 text-sm mt-2">
            Showing top 15 dimensions by unit count
          </div>
        )}
      </Card>

      {/* Form Type Distribution */}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card title="Form Type Distribution" className="shadow-sm" bordered={false}>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={formTypeStats}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {formTypeStats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS.chart[index % COLORS.chart.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card 
            title={
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-500" />
                <span>Availability Summary</span>
              </div>
            } 
            className="shadow-sm" 
            bordered={false}
          >
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Availability Rate</span>
                <span className="text-2xl font-bold text-green-600">{overview.availabilityRate}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Partially Used</span>
                <span className="text-xl font-semibold text-orange-500">{overview.partiallyUsedUnits}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Exhausted Units</span>
                <span className="text-xl font-semibold text-red-500">{overview.exhaustedUnits}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-green-500 h-3 rounded-full transition-all duration-300" 
                  style={{ width: `${overview.availabilityRate}%` }}
                ></div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Detailed Material Dimensions Table */}
      <Card title="Detailed Material & Dimensions Breakdown" className="shadow-sm" bordered={false}>
        <div className="space-y-4">
          {materialStats.map((material) => (
            <div key={material.name} className="border border-gray-200 rounded-lg p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-lg font-semibold text-gray-800">{material.name}</h3>
                <div className="flex gap-4 text-sm">
                  <span className="text-gray-600">Stocks: <strong>{material.totalStocks}</strong></span>
                  <span className="text-gray-600">Units: <strong>{material.totalUnits}</strong></span>
                  <span className="text-green-600">Available: <strong>{material.availableUnits}</strong></span>
                </div>
              </div>
              {material.dimensions.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {material.dimensions.map((dim, idx) => (
                    <div key={idx} className="bg-gray-50 rounded p-3 border border-gray-100">
                      <div className="font-medium text-sm text-gray-700 mb-2 font-mono">
                        {dim.dimensions}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-gray-500">Total:</span>
                          <span className="font-semibold ml-1">{dim.totalUnits}</span>
                        </div>
                        <div>
                          <span className="text-green-600">Available:</span>
                          <span className="font-semibold ml-1">{dim.availableUnits}</span>
                        </div>
                        <div>
                          <span className="text-orange-500">Partial:</span>
                          <span className="font-semibold ml-1">{dim.partiallyUsedUnits}</span>
                        </div>
                        <div>
                          <span className="text-red-500">Exhausted:</span>
                          <span className="font-semibold ml-1">{dim.exhaustedUnits}</span>
                        </div>
                      </div>
                      <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-green-500 h-2 rounded-full" 
                          style={{ width: `${dim.totalUnits > 0 ? (dim.availableUnits / dim.totalUnits) * 100 : 0}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-400 italic text-sm">No dimensions available</div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default RawMaterialInventoryAnalytics;
