import React, { useState, useEffect } from "react";
import axios from "axios";
import { API_BASE_URL } from "../../Config/auth";
import { Button, Card, InputNumber, App, Select } from "antd";
import { 
  AppstoreOutlined
} from "@ant-design/icons";
import DimensionInputs from "./DimensionInputs";

const { Option } = Select;

const LinkMaterialsTab = ({ rawMaterials: propRawMaterials, onDataChanged }) => {
  const { message } = App.useApp();
  const [orders, setOrders] = useState([]);
  const [rawMaterials, setRawMaterials] = useState(propRawMaterials || []);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [vendors, setVendors] = useState([]);
  
  // Add Stock mode state
  const [newStockForm, setNewStockForm] = useState({
    material_id: null,
    form_type: null,
    diameter: '',
    length: '',
    breadth: '',
    height: '',
    inner_diameter: '',
    outer_diameter: '',
    quantity: 1,
    order_id: null,
    selected_vendor_id: [], // Multiple vendors for enquiry
    order_status: 'enquiry'
  });
  const [addStockLoading, setAddStockLoading] = useState(false);

  // Sync rawMaterials state with prop changes
  useEffect(() => {
    setRawMaterials(propRawMaterials || []);
  }, [propRawMaterials]);

  const handleDimensionChange = (field, value) => {
    setNewStockForm(prev => ({ ...prev, [field]: value }));
  };

  const getCurrentUserId = () => {
    try {
      const stored = localStorage.getItem("user");
      if (!stored) return null;
      const user = JSON.parse(stored);
      return user?.user_id || user?.id || null;
    } catch (error) {
      console.error("Error getting user ID:", error);
      return null;
    }
  };

  const fetchOrders = async () => {
    setOrdersLoading(true);
    try {
      const uid = getCurrentUserId();
      const response = await axios.get(`${API_BASE_URL}/orders/`, {
        params: uid != null ? { manufacturing_coordinator_id: uid } : undefined,
      });
      // Filter out orders that already have raw materials linked
      const availableOrders = (response.data || []).filter(order => !order.has_raw_materials);
      setOrders(availableOrders);
    } catch (error) {
      console.error("Error fetching orders:", error);
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  };

  const fetchVendors = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/rawmaterials/vendors`);
      setVendors(response.data || []);
    } catch (error) {
      console.error("Error fetching vendors:", error);
      setVendors([]);
    }
  };

  // New functions for Add Stock mode
  const handleOrderSelectionForStock = (orderId) => {
    setNewStockForm(prev => ({ ...prev, order_id: orderId }));
  };

  const handleAddStock = async () => {
    const userId = getCurrentUserId();
    if (!userId) {
      message.error('User not authenticated');
      return;
    }

    // Require all details
    if (!newStockForm.material_id) {
      message.error('Please select a material');
      return;
    }

    if (!newStockForm.form_type) {
      message.error('Please select a form type');
      return;
    }

    if (!newStockForm.quantity || newStockForm.quantity <= 0) {
      message.error('Please enter a valid quantity');
      return;
    }

    if (!newStockForm.selected_vendor_id || newStockForm.selected_vendor_id.length === 0) {
      message.error('Please select at least one vendor');
      return;
    }

    if (!newStockForm.order_id) {
      message.error('Please select an order - this tab is for order-linked stock only');
      return;
    }

    setAddStockLoading(true);
    try {
      const requestData = {
        raw_material_id: newStockForm.material_id,
        form_type: newStockForm.form_type,
        diameter: newStockForm.diameter || null,
        length: newStockForm.length,
        breadth: newStockForm.breadth || null,
        height: newStockForm.height || null,
        inner_diameter: newStockForm.inner_diameter || null,
        outer_diameter: newStockForm.outer_diameter || null,
        order_id: newStockForm.order_id,
        part_ids: [],
        required_lengths: [],
        vendor_id: newStockForm.selected_vendor_id || null,
        quantity: newStockForm.quantity,
        user_id: userId
      };

      const response = await axios.post(`${API_BASE_URL}/rawmaterials/order-materials/link`, requestData);
      
      if (response.data) {
        message.success('Stock added successfully!');
        
        // Reset form
        setNewStockForm({
          material_id: null,
          form_type: null,
          diameter: '',
          length: '',
          breadth: '',
          height: '',
          inner_diameter: '',
          outer_diameter: '',
          quantity: 1,
          order_id: null,
          selected_vendor_id: [],
          order_status: 'enquiry'
        });
        
        // Refresh raw materials list
        if (onDataChanged) {
          onDataChanged();
        }
      }
    } catch (error) {
      message.error('Failed to add stock: ' + (error.response?.data?.detail || error.message));
    } finally {
      setAddStockLoading(false);
    }
  };

  return (
    <div className="mt-4">
      {/* Add Stock Form */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <AppstoreOutlined className="text-blue-600" />
            <span>Add Order-Linked Stock</span>
          </div>
        }
        className="shadow-sm rounded-lg border border-gray-100"
      >
        <div className="space-y-4">
          {/* First Row: Material, Form Type */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Material <span className="text-red-500">*</span></label>
              <Select
                style={{ width: '100%' }}
                placeholder="Select Material"
                value={newStockForm.material_id}
                onChange={(value) => setNewStockForm(prev => ({ ...prev, material_id: value }))}
                showSearch
                filterOption={(input, option) =>
                  option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
                }
              >
                {rawMaterials.map(material => (
                  <Option key={material.id} value={material.id}>
                    {material.material_name}
                  </Option>
                ))}
              </Select>
              {newStockForm.material_id && (
                <div className="mt-1 text-xs text-gray-600">
                  Cost: {rawMaterials.find(m => m.id === newStockForm.material_id)?.cost_per_kg || 'N/A'} per kg
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Form Type <span className="text-red-500">*</span></label>
              <Select
                style={{ width: '100%' }}
                placeholder="Select Form Type"
                value={newStockForm.form_type}
                onChange={(value) => setNewStockForm(prev => ({ ...prev, form_type: value }))}
              >
                <Option value="Round">Round</Option>
                <Option value="Square">Square</Option>
                <Option value="Pipe">Pipe</Option>
              </Select>
            </div>
          </div>

          {/* Second Row: Dimensions */}
          {newStockForm.form_type && (
            <DimensionInputs
              formType={newStockForm.form_type}
              dimensions={{
                diameter: newStockForm.diameter,
                length: newStockForm.length,
                breadth: newStockForm.breadth,
                height: newStockForm.height,
                inner_diameter: newStockForm.inner_diameter,
                outer_diameter: newStockForm.outer_diameter,
              }}
              onChange={handleDimensionChange}
            />
          )}

          {/* Third Row: Quantity, Vendor */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity <span className="text-red-500">*</span></label>
              <InputNumber
                style={{ width: '100%' }}
                placeholder="Quantity"
                keyboard={false}
                value={newStockForm.quantity}
                onChange={(value) => setNewStockForm(prev => ({ ...prev, quantity: value }))}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vendors <span className="text-red-500">*</span></label>
              <Select
                mode="multiple"
                style={{ width: '100%' }}
                placeholder="Select Vendors"
                value={newStockForm.selected_vendor_id || []}
                onChange={(value) => setNewStockForm(prev => ({ ...prev, selected_vendor_id: value }))}
                onOpenChange={(open) => {
                  if (open) fetchVendors();
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

          {/* Fourth Row: Order */}
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Order <span className="text-red-500">*</span></label>
              <Select
                style={{ width: '100%' }}
                placeholder="Select Order"
                value={newStockForm.order_id}
                onChange={handleOrderSelectionForStock}
                onOpenChange={(open) => {
                  if (open) fetchOrders();
                }}
                showSearch
                filterOption={(input, option) =>
                  option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
                }
              >
                {orders.map(order => (
                  <Option key={order.id} value={order.id}>
                    {order.sale_order_number}
                  </Option>
                ))}
              </Select>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end pt-4">
            <Button
              type="primary"
              onClick={handleAddStock}
              loading={addStockLoading}
              size="large"
              style={{ backgroundColor: '#2563eb' }}
              className="border-none shadow-md px-8"
            >
              Add Order-Linked Stock
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default LinkMaterialsTab;
