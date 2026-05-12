import React from "react";
import { InputNumber } from "antd";

const DimensionInputs = ({ formType, dimensions, onChange }) => {
  if (formType === 'Round') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Diameter (mm) <span className="text-red-500">*</span></label>
          <InputNumber
            style={{ width: '100%' }}
            placeholder="Diameter"
            keyboard={false}
            value={dimensions.diameter}
            onChange={(value) => onChange('diameter', value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Length (mm) <span className="text-red-500">*</span></label>
          <InputNumber
            style={{ width: '100%' }}
            placeholder="Length"
            keyboard={false}
            value={dimensions.length}
            onChange={(value) => onChange('length', value)}
          />
        </div>
      </div>
    );
  }

  if (formType === 'Square') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Breadth (mm) <span className="text-red-500">*</span></label>
          <InputNumber
            style={{ width: '100%' }}
            placeholder="Breadth"
            keyboard={false}
            value={dimensions.breadth}
            onChange={(value) => onChange('breadth', value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Height (mm) <span className="text-red-500">*</span></label>
          <InputNumber
            style={{ width: '100%' }}
            placeholder="Height"
            keyboard={false}
            value={dimensions.height}
            onChange={(value) => onChange('height', value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Length (mm) <span className="text-red-500">*</span></label>
          <InputNumber
            style={{ width: '100%' }}
            placeholder="Length"
            keyboard={false}
            value={dimensions.length}
            onChange={(value) => onChange('length', value)}
          />
        </div>
      </div>
    );
  }

  if (formType === 'Pipe') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Inner Diameter (mm) <span className="text-red-500">*</span></label>
          <InputNumber
            style={{ width: '100%' }}
            placeholder="Inner Diameter"
            keyboard={false}
            value={dimensions.inner_diameter}
            onChange={(value) => onChange('inner_diameter', value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Outer Diameter (mm) <span className="text-red-500">*</span></label>
          <InputNumber
            style={{ width: '100%' }}
            placeholder="Outer Diameter"
            keyboard={false}
            value={dimensions.outer_diameter}
            onChange={(value) => onChange('outer_diameter', value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Length (mm) <span className="text-red-500">*</span></label>
          <InputNumber
            style={{ width: '100%' }}
            placeholder="Length"
            keyboard={false}
            value={dimensions.length}
            onChange={(value) => onChange('length', value)}
          />
        </div>
      </div>
    );
  }

  return null;
};

export default DimensionInputs;
