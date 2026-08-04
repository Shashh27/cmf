import React, { useState, useCallback } from "react";
import { Input, Select, Space, Button, Switch } from "antd";
import { StockDetailsPdfDownload } from "../DownloadReports/StockDetailsPdfDownload";
import RawMaterialInventoryView from "./RawMaterialInventoryView";
import RawMaterialInventoryAnalytics from "./RawMaterialInventoryAnalytics";
import ExhaustedUnitsModal from "./ExhaustedUnitsModal";
import { BarChart3, Table } from "lucide-react";

const { Option } = Select;

const RawMaterialInventoryTab = ({ rawMaterials = [] }) => {
  const [invSearch, setInvSearch] = useState("");
  const [invFilters, setInvFilters] = useState({ fMaterial: [], fSource: [], fOrder: [], fPart: [], fStockStatus: [], fUnitStatus: [] });
  const [invFilterOptions, setInvFilterOptions] = useState({ materials: [], orders: [], partsByOrder: {} });
  const [invRows, setInvRows] = useState([]);
  const [exhaustedModalOpen, setExhaustedModalOpen] = useState(false);
  const [inventoryData, setInventoryData] = useState([]);
  const [invRefreshKey, setInvRefreshKey] = useState(0);
  const [viewMode, setViewMode] = useState("table"); // "table" or "analytics"
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const setF = (key, val) => setInvFilters(prev => ({ ...prev, [key]: val || [] }));
  const handleFilterOptionsReady = useCallback((opts) => setInvFilterOptions(opts), []);
  const handleRowsReady = useCallback((r) => setInvRows(r), []);
  const handleInventoryDataReady = useCallback((data) => setInventoryData(data), []);
  const handleDocumentsChanged = useCallback(() => setInvRefreshKey((k) => k + 1), []);

  return (
    <div className="mt-4">
      <div className="bg-white rounded-lg lg:rounded-xl shadow-sm border border-gray-100 p-3 mb-4">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
              <Table className={`w-4 h-4 ${viewMode === "table" ? "text-blue-600" : "text-gray-400"}`} />
              <Switch
                checked={viewMode === "analytics"}
                onChange={(checked) => setViewMode(checked ? "analytics" : "table")}
                size="small"
                checkedChildren="Analytics"
                unCheckedChildren="Table"
              />
              <BarChart3 className={`w-4 h-4 ${viewMode === "analytics" ? "text-blue-600" : "text-gray-400"}`} />
            </div>
            <Input.Search
              placeholder="Search material / stock..."
              allowClear
              value={invSearch}
              onChange={(e) => setInvSearch(e.target.value)}
              onSearch={setInvSearch}
              style={{ width: 200 }}
              size="middle"
            />
            <Select mode="multiple" placeholder="Material" allowClear showSearch optionFilterProp="children" value={invFilters.fMaterial} onChange={v => setF('fMaterial', v)} style={{ minWidth: 160, maxWidth: 260 }} size="middle" maxTagCount={1} maxTagPlaceholder={(omitted) => `+${omitted.length} more`}>
              {invFilterOptions.materials.map(m => <Option key={m.id} value={m.id}>{m.name}</Option>)}
            </Select>
            <Select mode="multiple" placeholder="Source" allowClear value={invFilters.fSource} onChange={v => { setInvFilters(p => ({ ...p, fSource: v || [], fOrder: [], fPart: [] })); }} style={{ minWidth: 110, maxWidth: 200 }} size="middle" maxTagCount={1} maxTagPlaceholder={(omitted) => `+${omitted.length} more`}>
              <Option value="general">General</Option>
              <Option value="order">Order</Option>
            </Select>
            <Select mode="multiple" placeholder="Order No" allowClear showSearch optionFilterProp="children" value={invFilters.fOrder} onChange={v => { setInvFilters(p => ({ ...p, fOrder: v || [], fPart: [] })); }} style={{ minWidth: 140, maxWidth: 260 }} size="middle" maxTagCount={1} maxTagPlaceholder={(omitted) => `+${omitted.length} more`} disabled={invFilters.fSource.length > 0 && !invFilters.fSource.includes('order')}>
              {invFilterOptions.orders.map(o => <Option key={o} value={o}>{o}</Option>)}
            </Select>
            <Select mode="multiple" placeholder="Part No" allowClear showSearch optionFilterProp="children" value={invFilters.fPart} onChange={v => setF('fPart', v)} style={{ minWidth: 130, maxWidth: 260 }} size="middle" maxTagCount={1} maxTagPlaceholder={(omitted) => `+${omitted.length} more`} disabled={invFilters.fOrder.length === 0}>
              {Array.from(new Set(invFilters.fOrder.flatMap(o => invFilterOptions.partsByOrder[o] || []))).sort().map(p => <Option key={p} value={p}>{p}</Option>)}
            </Select>
            <Select mode="multiple" placeholder="Stock Status" allowClear value={invFilters.fStockStatus} onChange={v => setF('fStockStatus', v)} style={{ minWidth: 140, maxWidth: 240 }} size="middle" maxTagCount={1} maxTagPlaceholder={(omitted) => `+${omitted.length} more`}>
              <Option value="available">Available</Option>
              <Option value="not_available">Not Available</Option>
              <Option value="exhausted">Exhausted</Option>
            </Select>
            <Select mode="multiple" placeholder="Unit Status" allowClear value={invFilters.fUnitStatus} onChange={v => setF('fUnitStatus', v)} style={{ minWidth: 140, maxWidth: 240 }} size="middle" maxTagCount={1} maxTagPlaceholder={(omitted) => `+${omitted.length} more`}>
              <Option value="available">Available</Option>
              <Option value="partially_used">Partially Used</Option>
              <Option value="not_available">Not Available</Option>
              <Option value="exhausted">Exhausted</Option>
            </Select>
            <StockDetailsPdfDownload rows={invRows} label={`Inventory — ${invRows.length} rows`} />
          </div>
          <Button 
            type="primary" 
            danger
            onClick={() => setExhaustedModalOpen(true)}
            size="middle"
            style={{
              background: "#dc2626",
              borderColor: "#dc2626",
              fontWeight: 600,
              boxShadow: "0 2px 4px rgba(220, 38, 38, 0.2)"
            }}
          >
            🗑️ Exhausted Units
          </Button>
        </div>
      </div>

      {viewMode === "table" ? (
        <RawMaterialInventoryView
          rawMaterials={rawMaterials}
          refreshKey={invRefreshKey}
          searchText={invSearch}
          fMaterial={invFilters.fMaterial}
          fSource={invFilters.fSource}
          fOrder={invFilters.fOrder}
          fPart={invFilters.fPart}
          fStockStatus={invFilters.fStockStatus}
          fUnitStatus={invFilters.fUnitStatus}
          onFilterOptionsReady={handleFilterOptionsReady}
          onRowsReady={handleRowsReady}
          onInventoryDataReady={handleInventoryDataReady}
          onLoadingChange={setAnalyticsLoading}
        />
      ) : (
        <RawMaterialInventoryAnalytics
          inventoryData={inventoryData}
          loading={analyticsLoading}
        />
      )}

      <ExhaustedUnitsModal
        open={exhaustedModalOpen}
        onClose={() => setExhaustedModalOpen(false)}
        inventoryData={inventoryData}
        onDocumentsChanged={handleDocumentsChanged}
      />
    </div>
  );
};

export default RawMaterialInventoryTab;
