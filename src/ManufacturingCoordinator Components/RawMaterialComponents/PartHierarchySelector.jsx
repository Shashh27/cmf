import React from "react";
import { InputNumber, Spin, Tree, message } from "antd";
import { EyeOutlined } from "@ant-design/icons";
import { Button } from "antd";

const PartHierarchySelector = ({
  treeData,
  selectedPartIds,
  onTreeCheck,
  orderPartsForStock,
  selectedPartIdsString,
  onRequiredLengthChange,
  dimensionLength,
  loadingOrderParts,
  requiredLengths,
  onDocumentPreview
}) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Parts Hierarchy - Left Side */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Parts Hierarchy
        </label>
        <div className="border border-gray-300 rounded-md p-2 max-h-80 overflow-y-auto bg-white">
          {loadingOrderParts ? (
            <div className="flex justify-center py-4">
              <Spin size="small" />
            </div>
          ) : treeData.length > 0 ? (
            <Tree
              checkable
              defaultExpandAll
              onCheck={onTreeCheck}
              checkedKeys={selectedPartIds.map(id => `part-${id}`)}
              treeData={treeData}
              selectable={false}
              showLine={{ showLeafIcon: false }}
              showIcon={false}
            />
          ) : (
            <div className="text-gray-500 text-center py-4">
              No parts available for this order
            </div>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          💡 Select an assembly to auto-select all its parts. Subassemblies are shown nested.
        </p>
      </div>

      {/* Part Required Lengths - Right Side */}
      {selectedPartIdsString && selectedPartIdsString.split(',').length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Part Required Lengths (mm)</label>
          <div className="border border-gray-300 rounded-md p-2 max-h-80 overflow-y-auto bg-white">
            <div className="space-y-2">
              {orderPartsForStock
                .filter(part => selectedPartIdsString.split(',').includes(part.id.toString()))
                .map(part => (
                  <div key={part.id} className="flex items-center space-x-2">
                    <span className="text-sm flex-1">{part.part_number} - {part.part_name}</span>
                    <InputNumber
                      placeholder="Length (mm)"
                      style={{ width: '120px' }}
                      keyboard={false}
                      value={requiredLengths?.[part.id] || dimensionLength}
                      onChange={(value) => {
                        onRequiredLengthChange(part.id, value || dimensionLength);
                      }}
                    />
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PartHierarchySelector;
