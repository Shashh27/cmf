import React, { useState, useCallback } from "react";
import { Input, Select, Space, Button } from "antd";
import { StockDetailsPdfDownload } from "../../DownloadReports/StockDetailsPdfDownload";
import RawMaterialInventoryView from "./RawMaterialInventoryView";
import ExhaustedUnitsModal from "./ExhaustedUnitsModal";

const { Option } = Select;

const RawMaterialInventoryTab = () => {
  const [invSearch, setInvSearch] = useState("");
  const [invFilters, setInvFilters] = useState({ fMaterial: [], fSource: [], fOrder: [], fPart: [], fStockStatus: [], fUnitStatus: [] });
  const [invFilterOptions, setInvFilterOptions] = useState({ materials: [], orders: [], partsByOrder: {} });
  const [invRows, setInvRows] = useState([]);
  const [exhaustedModalOpen, setExhaustedModalOpen] = useState(false);
  const [inventoryData, setInventoryData] = useState([]);

  const setF = (key, val) => setInvFilters(prev => ({ ...prev, [key]: val || [] }));
  const handleFilterOptionsReady = useCallback((opts) => setInvFilterOptions(opts), []);
  const handleRowsReady = useCallback((r) => setInvRows(r), []);
  const handleInventoryDataReady = useCallback((data) => setInventoryData(data), []);

  return (
    <div className="mt-4">
      <div className="bg-white rounded-lg lg:rounded-xl shadow-sm border border-gray-100 p-3 mb-4">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="flex flex-wrap gap-2 items-center">
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

      <RawMaterialInventoryView
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
      />

      <ExhaustedUnitsModal
        open={exhaustedModalOpen}
        onClose={() => setExhaustedModalOpen(false)}
        inventoryData={inventoryData}
      />
    </div>
  );
};

export default RawMaterialInventoryTab;
