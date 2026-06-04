import React from 'react';
import { Modal, Button, Select, InputNumber, message } from 'antd';
import { AppstoreOutlined } from '@ant-design/icons';
import DimensionInputs from './DimensionInputs';

const { Option } = Select;

const handleInputKeyDown = (e) => {
  // Allow: Backspace, Delete, Tab, Escape, Enter, Arrow keys
  if ([8, 9, 27, 13, 37, 38, 39, 40].includes(e.keyCode)) {
    return;
  }
  // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
  if (e.ctrlKey && [65, 67, 86, 88].includes(e.keyCode)) {
    return;
  }
  // Block: non-digit characters
  if (e.key && !/^\d$/.test(e.key)) {
    e.preventDefault();
  }
};

const ProcureRawMaterialModal = ({
  open,
  onCancel,
  onSubmit,
  loading,
  procureForm,
  setProcureForm,
  externalRawMaterials,
  orders,
  vendors,
  ordersLoading,
  onFetchOrders,
  onFetchVendors,
  handleProcureDimensionChange
}) => {
  return (
    <Modal
      open={open}
      onCancel={onCancel}
      title={
        <div className="flex items-center gap-2">
          <AppstoreOutlined className="text-blue-600" />
          <span className="font-bold text-gray-800 text-sm sm:text-base">Procure Raw Material</span>
        </div>
      }
      width={{ xs: '95%', sm: '90%', md: 600, lg: 700 }}
      centered
      footer={[
        <Button key="cancel" onClick={onCancel} className="w-full sm:w-auto">
          Cancel
        </Button>,
        <Button
          key="submit"
          type="primary"
          style={{ backgroundColor: '#2563eb' }}
          onClick={onSubmit}
          loading={loading}
          className="w-full sm:w-auto"
        >
          Order Raw Material
        </Button>
      ]}
    >

        {/* Order Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Order <span className="text-red-500">*</span></label>
          <Select
            style={{ width: '100%' }}
            placeholder="Select Order"
            value={procureForm.order_id}
            onChange={(value) => setProcureForm(prev => ({ ...prev, order_id: value }))}
            onOpenChange={(open) => {
              if (open) onFetchOrders();
            }}
            showSearch
            filterOption={(input, option) =>
              option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
            }
            loading={ordersLoading}
          >
            {orders.map(order => (
              <Option key={order.id} value={order.id}>
                {order.sale_order_number}
              </Option>
            ))}
          </Select>
        </div>


      <div className="py-4 space-y-4" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
        {/* Material Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Material <span className="text-red-500">*</span></label>
          <Select
            style={{ width: '100%' }}
            placeholder="Select Material"
            value={procureForm.material_id}
            onChange={(value) => setProcureForm(prev => ({ ...prev, material_id: value }))}
            showSearch
            filterOption={(input, option) =>
              option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
            }
          >
            {(externalRawMaterials || []).map(material => (
              <Option key={material.id} value={material.id}>
                {material.material_name}
              </Option>
            ))}
          </Select>
          {procureForm.material_id && (
            <div className="mt-1 text-xs text-gray-600">
              Cost: {(externalRawMaterials || []).find(m => m.id === procureForm.material_id)?.cost_per_kg || 'N/A'} per kg
            </div>
          )}
        </div>

        {/* Process Type Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Process Type <span className="text-red-500">*</span></label>
          <Select
            style={{ width: '100%' }}
            placeholder="Select Process Type"
            value={procureForm.process_type}
            onChange={(value) => setProcureForm(prev => ({ ...prev, process_type: value }))}
          >
            <Option value="Forging">Forging</Option>
            <Option value="Barstocks">Barstocks</Option>
            <Option value="Casting">Casting</Option>
          </Select>
        </div>

        {/* Form Type Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Form Type <span className="text-red-500">*</span></label>
          <Select
            style={{ width: '100%' }}
            placeholder="Select Form Type"
            value={procureForm.form_type}
            onChange={(value) => setProcureForm(prev => ({ ...prev, form_type: value }))}
          >
            <Option value="Round">Round</Option>
            <Option value="Square">Square</Option>
            <Option value="Pipe">Pipe</Option>
          </Select>
        </div>

        {/* Dimensions */}
        {procureForm.form_type && (
          <DimensionInputs
            formType={procureForm.form_type}
            dimensions={{
              diameter: procureForm.diameter,
              length: procureForm.length,
              breadth: procureForm.breadth,
              height: procureForm.height,
              inner_diameter: procureForm.inner_diameter,
              outer_diameter: procureForm.outer_diameter,
            }}
            onChange={handleProcureDimensionChange}
          />
        )}

        {/* Quantity */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Quantity <span className="text-red-500">*</span></label>
          <InputNumber
            min={1}
            precision={0}
            controls={false}
            onKeyDown={handleInputKeyDown}
            style={{ width: '100%' }}
            placeholder="Quantity"
            value={procureForm.quantity}
            onChange={(value) => {
              if (value !== null && value >= 1) {
                setProcureForm(prev => ({ ...prev, quantity: value }));
              }
            }}
          />
        </div>

        {/* Estimated Cost */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Cost (₹) <span className="text-red-500">*</span></label>
          <InputNumber
            min={0}
            precision={0}
            controls={false}
            style={{ width: '100%' }}
            placeholder="Estimated Cost"
            value={procureForm.estimated_cost}
            onChange={(value) => {
              // Only accept non-negative integers
              if (value !== null && value >= 0 && Number.isInteger(value)) {
                setProcureForm(prev => ({ ...prev, estimated_cost: value }));
              } else if (value === null) {
                setProcureForm(prev => ({ ...prev, estimated_cost: null }));
              }
            }}
            onKeyPress={(e) => {
              // Prevent non-numeric characters
              const charCode = e.which ? e.which : e.keyCode;
              if (charCode < 48 || charCode > 57) {
                e.preventDefault();
              }
            }}
          />
        </div>

        {/* Vendor Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Vendor <span className="text-red-500">*</span></label>
          <Select
            mode="multiple"
            style={{ width: '100%' }}
            placeholder="Select Vendor"
            value={procureForm.selected_vendor_id}
            onChange={(value) => setProcureForm(prev => ({ ...prev, selected_vendor_id: value }))}
            onOpenChange={(open) => {
              if (open) onFetchVendors();
            }}
            showSearch
            filterOption={(input, option) =>
              option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
            }
          >
            {vendors.map(vendor => (
              <Option key={vendor.id} value={vendor.id}>
                {vendor.company_name}
              </Option>
            ))}
          </Select>
        </div>
      </div>
    </Modal>
  );
};

export default ProcureRawMaterialModal;
