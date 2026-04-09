import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth";
import { Button, Card, InputNumber, Spin, Typography, message, Select } from "antd";
import { 
  AppstoreOutlined
} from "@ant-design/icons";

const { Text } = Typography;
const { Option } = Select;

const LinkMaterialsTab = ({ rawMaterials: propRawMaterials, onDataChanged }) => {
  // Add custom CSS to force vendor dropdown downward
  React.useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .vendor-dropdown-downward .ant-select-dropdown {
        top: auto !important;
        bottom: auto !important;
        transform: translateY(0) !important;
      }
      .vendor-dropdown-downward .ant-select-dropdown-placement-bottomLeft {
        top: auto !important;
        bottom: auto !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const [orders, setOrders] = useState([]);
  const [rawMaterials, setRawMaterials] = useState(propRawMaterials || []);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersFetched, setOrdersFetched] = useState(false);
  const [vendors, setVendors] = useState([]);
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [vendorsFetched, setVendorsFetched] = useState(false);
  
  // Add Stock mode state
  const [newStockForm, setNewStockForm] = useState({
    material_id: null,
    form_type: 'Round',
    diameter: '',
    length: '',
    breadth: '',
    height: '',
    inner_diameter: '',
    outer_diameter: '',
    quantity: 1,
    order_id: null,
    part_id: null, // Will store comma-separated IDs like "1,2,3,4"
    vendor_ids: [], // Multiple vendors for enquiry phase
    selected_vendor_id: null, // Final selected vendor for purchase
    order_status: 'enquiry'  // Default to enquiry for multiple vendor workflow
  });
  const [addStockLoading, setAddStockLoading] = useState(false);
  const [selectedOrderForStock, setSelectedOrderForStock] = useState(null);
  const [orderPartsForStock, setOrderPartsForStock] = useState([]);
  const [loadingOrderParts, setLoadingOrderParts] = useState(false);
  const [enquiryMode, setEnquiryMode] = useState(true); // Start with enquiry mode

  const fetchingOrders = useRef(false);
  const initializedRef = useRef(false);

  const getCurrentUserId = () => {
    try {
      const stored = localStorage.getItem("user");
      if (!stored) return null;
      const user = JSON.parse(stored);
      return user?.user_id || user?.id || null;
    } catch (error) {
      // Error getting user ID
      // console.error("Error getting user ID:", error);
      return null;
    }
  };

  const fetchOrders = async () => {
    if (ordersFetched) return; // Don't fetch if already fetched
    if (fetchingOrders.current) return;
    fetchingOrders.current = true;
    setOrdersLoading(true);
    try {
      const uid = getCurrentUserId();
      const response = await axios.get(`${API_BASE_URL}/orders/`, {
        params: uid != null ? { admin_id: uid } : undefined,
      });
      // Filter out orders that already have raw materials linked
      const availableOrders = (response.data || []).filter(order => !order.has_raw_materials);
      setOrders(availableOrders);
      setOrdersFetched(true);
    } catch (error) {
      // Error fetching orders
      // console.error("Error fetching orders:", error);
      setOrders([]);
    } finally {
      setOrdersLoading(false);
      fetchingOrders.current = false;
    }
  };

  const fetchVendors = async () => {
    if (vendorsFetched) return; // Don't fetch if already fetched
    setVendorsLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/rawmaterials/vendors`);
      setVendors(response.data || []);
      setVendorsFetched(true);
    } catch (error) {
      // Error fetching vendors
      // console.error("Error fetching vendors:", error);
      setVendors([]);
    } finally {
      setVendorsLoading(false);
    }
  };

  // New functions for Add Stock mode
  const handleOrderSelectionForStock = async (orderId) => {
    setSelectedOrderForStock(orderId);
    setNewStockForm(prev => ({ ...prev, order_id: orderId, part_id: null }));
    
    if (!orderId) {
      setOrderPartsForStock([]);
      return;
    }

    setLoadingOrderParts(true);
    try {
      // Use existing order data instead of making redundant API call
      const existingOrder = orders.find(order => order.id === orderId);
      
      if (!existingOrder) {
        message.error('Order not found in loaded data');
        setOrderPartsForStock([]);
        return;
      }

      const productId = existingOrder.product_id;
      
      if (!productId) {
        message.error('Order has no product associated');
        setOrderPartsForStock([]);
        return;
      }

      // Only make one API call for product hierarchy
      const hierarchyResponse = await axios.get(`${API_BASE_URL}/products/${productId}/hierarchical`);
      if (hierarchyResponse.data) {
        const allParts = [];
        const extractParts = (items) => {
          items.forEach(item => {
            if (item.part && item.part.type_name !== "Out-Source") {
              allParts.push(item.part);
            }
            if (item.subassemblies) {
              extractParts(item.subassemblies);
            }
          });
        };
        
        // Extract parts from assemblies and direct parts
        if (hierarchyResponse.data.assemblies) {
          hierarchyResponse.data.assemblies.forEach(assembly => {
            extractParts(assembly.parts || []);
            if (assembly.subassemblies) {
              extractParts(assembly.subassemblies);
            }
          });
        }
        
        if (hierarchyResponse.data.direct_parts) {
          extractParts(hierarchyResponse.data.direct_parts);
        }
        
        setOrderPartsForStock(allParts);
      }
    } catch (error) {
      // Error loading order parts
      // console.error('Error loading order parts:', error);
      message.error('Failed to load order parts');
      setOrderPartsForStock([]);
    } finally {
      setLoadingOrderParts(false);
    }
  };

  const handleVendorEnquiry = async () => {
    if (newStockForm.vendor_ids.length === 0) {
      message.error('Please select at least one vendor for enquiry');
      return;
    }

    if (!newStockForm.order_id) {
      message.error('Please select an order for enquiry');
      return;
    }

    if (!newStockForm.material_id) {
      message.error('Please select a material for enquiry');
      return;
    }

    // Validate that total quantity >= sum of all part quantities
    if (newStockForm.part_id) {
      const partIds = newStockForm.part_id.split(',');
      let totalPartQuantity = 0;
      
      for (const partId of partIds) {
        const partQty = newStockForm[`part_quantity_${partId}`] || 1;
        totalPartQuantity += parseFloat(partQty) || 0;
      }
      
      if (totalPartQuantity > newStockForm.quantity) {
        message.error(`Total quantity (${newStockForm.quantity}) must be >= sum of part quantities (${totalPartQuantity})`);
        return;
      }
    }

    setAddStockLoading(true);
    try {
      const userId = getCurrentUserId();
      
      // Create stock record with enquiry status and multiple vendors
      const stockData = {
        material_id: newStockForm.material_id,
        form_type: newStockForm.form_type,
        diameter: newStockForm.diameter,
        length: newStockForm.length,
        breadth: newStockForm.breadth,
        height: newStockForm.height,
        inner_diameter: newStockForm.inner_diameter,
        outer_diameter: newStockForm.outer_diameter,
        quantity: newStockForm.quantity,
        order_id: newStockForm.order_id,
        part_id: newStockForm.part_id,
        vendor_id: newStockForm.vendor_ids.join(','), // Store as comma-separated
        user_id: userId,
        source_type: 'order',
        source_order_id: newStockForm.order_id,
        order_status: 'enquiry' // Default to enquiry
      };

      // Remove empty fields
      Object.keys(stockData).forEach(key => {
        if (stockData[key] === '' || stockData[key] === null) {
          if (!(key === 'source_order_id' && stockData.source_type === 'order')) {
            delete stockData[key];
          }
        }
      });
      delete stockData.order_id; // Remove original order_id

      const response = await axios.post(`${API_BASE_URL}/rawmaterials/stock/`, stockData);
      
      if (response.data) {
        const createdStock = response.data;
        
        // Automatically allocate materials to parts if parts are selected
        if (newStockForm.part_id && newStockForm.part_id.split(',').length > 0) {
          const partIds = newStockForm.part_id.split(',');
          
          // Prepare bulk allocation data
          const allocationData = partIds.map(partId => ({
            part_id: parseInt(partId),
            stock_id: createdStock.id,
            required_quantity: newStockForm[`part_quantity_${partId}`] || 1,
            user_id: userId
          }));
          
          try {
            const bulkAllocationResponse = await axios.post(
              `${API_BASE_URL}/rawmaterials/tracking/allocate/bulk`,
              allocationData
            );
            
            if (bulkAllocationResponse.data.success) {
              message.success(`Enquiry sent to ${newStockForm.vendor_ids.length} vendor(s) and materials allocated to ${bulkAllocationResponse.data.successful_allocations} parts!`);
            } else {
              message.warning(`Enquiry sent to ${newStockForm.vendor_ids.length} vendor(s) but ${bulkAllocationResponse.data.failed_allocations} allocations failed. Please allocate manually.`);
            }
          } catch (allocationError) {
            message.warning(`Enquiry sent to ${newStockForm.vendor_ids.length} vendor(s) but allocation failed. Please allocate manually.`);
          }
        } else {
          message.success(`Enquiry sent to ${newStockForm.vendor_ids.length} vendor(s) and stock created!`);
        }
        
        // Reset form
        setNewStockForm({
          material_id: null,
          form_type: 'Round',
          diameter: '',
          length: '',
          breadth: '',
          height: '',
          inner_diameter: '',
          outer_diameter: '',
          quantity: 1,
          order_id: null,
          part_id: null, // This will be null, not empty string
          vendor_ids: [], // Multiple vendors for enquiry phase
          selected_vendor_id: null, // Final selected vendor for purchase
          order_status: 'enquiry'  // Default to enquiry for multiple vendor workflow
        });
        setEnquiryMode(true);
        setSelectedOrderForStock(null);
        setOrderPartsForStock([]);
        
        // Refresh raw materials list
        if (onDataChanged) {
          onDataChanged();
        }
      }
    } catch (error) {
      message.error('Failed to send enquiry: ' + (error.response?.data?.detail || error.message));
    } finally {
      setAddStockLoading(false);
    }
  };

  const handleAddStock = async () => {
    const userId = getCurrentUserId();
    if (!userId) {
      message.error('User not authenticated');
      return;
    }

    // In enquiry mode, call handleVendorEnquiry instead
    if (enquiryMode) {
      if (!newStockForm.order_id) {
        message.error('Please select an order for enquiry');
        return;
      }
      if (newStockForm.vendor_ids.length === 0) {
        message.error('Please select at least one vendor for enquiry');
        return;
      }
      if (!newStockForm.material_id) {
        message.error('Please select a material for enquiry');
        return;
      }
      await handleVendorEnquiry();
      return;
    }

    // For actual stock creation, require all details
    if (!newStockForm.material_id) {
      message.error('Please select a material');
      return;
    }

    if (!newStockForm.order_id) {
      message.error('Please select an order - this tab is for order-linked stock only');
      return;
    }

    if (!newStockForm.quantity || newStockForm.quantity <= 0) {
      message.error('Please enter a valid quantity');
      return;
    }

    // Validate that total quantity >= sum of all part quantities
    if (newStockForm.part_id) {
      const partIds = newStockForm.part_id.split(',');
      let totalPartQuantity = 0;
      
      for (const partId of partIds) {
        const partQty = newStockForm[`part_quantity_${partId}`] || 1;
        totalPartQuantity += parseFloat(partQty) || 0;
      }
      
      if (totalPartQuantity > newStockForm.quantity) {
        message.error(`Total quantity (${newStockForm.quantity}) must be >= sum of part quantities (${totalPartQuantity})`);
        return;
      }
    }

    setAddStockLoading(true);
    try {
      const stockData = {
        ...newStockForm,
        user_id: userId,
        source_type: 'order' // Always order type in this tab
      };

      // Map order_id to source_order_id for backend
      stockData.source_order_id = newStockForm.order_id;
      
      // Handle vendor data correctly
      if (newStockForm.vendor_ids && newStockForm.vendor_ids.length > 0) {
        // Always store comma-separated vendor IDs in vendor_id field for enquiry tracking
        stockData.vendor_id = newStockForm.vendor_ids.join(',');
        stockData.received_vendor_id = null; // Default to null for enquiry
      }
      
      // Use selected_vendor_id for received_vendor_id if in purchase mode (not enquiry)
      if (newStockForm.selected_vendor_id && !enquiryMode) {
        stockData.received_vendor_id = newStockForm.selected_vendor_id;
        // Keep vendor_id as comma-separated string to preserve original enquiry vendors
        // Don't set vendor_id to null - keep the enquiry vendor list
      }
      
      // Remove vendor_ids and selected_vendor_id from final payload
      delete stockData.vendor_ids;
      delete stockData.selected_vendor_id;

      // Remove empty fields but keep source_order_id if source_type is 'order'
      Object.keys(stockData).forEach(key => {
        if (stockData[key] === '' || stockData[key] === null) {
          // Don't remove source_order_id if source_type is 'order'
          if (!(key === 'source_order_id' && stockData.source_type === 'order')) {
            delete stockData[key];
          }
        }
      });

      // Remove the original order_id field as backend expects source_order_id
      delete stockData.order_id;

      const response = await axios.post(`${API_BASE_URL}/rawmaterials/stock/`, stockData);
      
      if (response.data) {
        const createdStock = response.data;
        
        // Automatically allocate materials to parts if parts are selected
        if (newStockForm.part_id && newStockForm.part_id.split(',').length > 0) {
          const partIds = newStockForm.part_id.split(',');
          
          // Prepare bulk allocation data
          const allocationData = partIds.map(partId => ({
            part_id: parseInt(partId),
            stock_id: createdStock.id,
            required_quantity: newStockForm[`part_quantity_${partId}`] || 1,
            user_id: userId
          }));
          
          try {
            const bulkAllocationResponse = await axios.post(
              `${API_BASE_URL}/rawmaterials/tracking/allocate/bulk`,
              allocationData
            );
            
            if (bulkAllocationResponse.data.success) {
              message.success(`Stock created and materials allocated to ${bulkAllocationResponse.data.successful_allocations} parts!`);
            } else {
              message.warning(`Stock created but ${bulkAllocationResponse.data.failed_allocations} allocations failed. Please allocate manually.`);
            }
          } catch (allocationError) {
            message.warning(`Stock created but allocation failed. Please allocate manually.`);
          }
        } else {
          message.success('Stock created successfully!');
        }
        // Reset form
        setNewStockForm({
          material_id: null,
          form_type: 'Round',
          diameter: '',
          length: '',
          breadth: '',
          height: '',
          inner_diameter: '',
          outer_diameter: '',
          quantity: 1,
          order_id: null,
          part_id: null, // This will be null, not empty string
          vendor_ids: [], // Multiple vendors for enquiry phase
          selected_vendor_id: null, // Final selected vendor for purchase
          order_status: 'enquiry'  // Default to enquiry for multiple vendor workflow
        });
        setEnquiryMode(true);
        setSelectedOrderForStock(null);
        setOrderPartsForStock([]);
        
        // Refresh raw materials list
        if (onDataChanged) {
          onDataChanged();
        }
      }
    } catch (error) {
      // Error adding stock
      // console.error('Error adding stock:', error);
      message.error('Failed to add stock: ' + (error.response?.data?.detail || error.message));
    } finally {
      setAddStockLoading(false);
    }
  };

  // Update rawMaterials when prop changes
  useEffect(() => {
    setRawMaterials(propRawMaterials || []);
  }, [propRawMaterials]);

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
                value={newStockForm.form_type}
                onChange={(value) => setNewStockForm(prev => ({ ...prev, form_type: value }))}
              >
                <Option value="Round">Round</Option>
                <Option value="Square">Square</Option>
                <Option value="Pipe">Pipe</Option>
              </Select>
            </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Order <span className="text-red-500">*</span></label>
            <Select
              style={{ width: '100%' }}
              placeholder="Select Order (Required)"
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

          {newStockForm.order_id && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Parts (Optional - Select Multiple)</label>
              <Select
                mode="multiple"
                style={{ width: '100%' }}
                placeholder="Select Parts (Optional - Can select multiple)"
                value={newStockForm.part_id ? newStockForm.part_id.split(',').map(id => parseInt(id)) : []}
                onChange={(values) => setNewStockForm(prev => ({ ...prev, part_id: values.join(',') }))}
                allowClear
                showSearch
                loading={loadingOrderParts}
                filterOption={(input, option) =>
                  option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
                }
              >
                {orderPartsForStock.map(part => (
                  <Option key={part.id} value={part.id}>
                    {part.part_number} - {part.part_name}
                  </Option>
                ))}
              </Select>
            </div>
          )}

          {/* Part Quantities Section */}
          {newStockForm.part_id && newStockForm.part_id.split(',').length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Part Required Quantities</label>
              <div className="space-y-2">
                {orderPartsForStock
                  .filter(part => newStockForm.part_id.split(',').includes(part.id.toString()))
                  .map(part => (
                    <div key={part.id} className="flex items-center space-x-2">
                      <span className="text-sm flex-1">{part.part_number} - {part.part_name}</span>
                      <InputNumber
                        placeholder="Qty"
                        min={0}
                        step={0.1}
                        style={{ width: '100px' }}
                        value={newStockForm[`part_quantity_${part.id}`] || 1}
                        onChange={(value) => setNewStockForm(prev => ({ 
                          ...prev, 
                          [`part_quantity_${part.id}`]: value || 1 
                        }))}
                      />
                    </div>
                  ))
                }
              </div>
            </div>
          )}

          {newStockForm.form_type === 'Round' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Diameter (mm) <span className="text-red-500">*</span></label>
              <InputNumber
                style={{ width: '100%' }}
                placeholder="Diameter"
                value={newStockForm.diameter}
                onChange={(value) => setNewStockForm(prev => ({ ...prev, diameter: value }))}
                min={0}
                step={0.01}
              />
            </div>
          )}

          {newStockForm.form_type === 'Square' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Breadth (mm) <span className="text-red-500">*</span></label>
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder="Breadth"
                  value={newStockForm.breadth}
                  onChange={(value) => setNewStockForm(prev => ({ ...prev, breadth: value }))}
                  min={0}
                  step={0.01}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Height (mm) <span className="text-red-500">*</span></label>
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder="Height"
                  value={newStockForm.height}
                  onChange={(value) => setNewStockForm(prev => ({ ...prev, height: value }))}
                  min={0}
                  step={0.01}
                />
              </div>
            </>
          )}

          {newStockForm.form_type === 'Pipe' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Outer Diameter (mm) <span className="text-red-500">*</span></label>
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder="Outer Diameter"
                  value={newStockForm.outer_diameter}
                  onChange={(value) => setNewStockForm(prev => ({ ...prev, outer_diameter: value }))}
                  min={0}
                  step={0.01}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Inner Diameter (mm) <span className="text-red-500">*</span></label>
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder="Inner Diameter"
                  value={newStockForm.inner_diameter}
                  onChange={(value) => setNewStockForm(prev => ({ ...prev, inner_diameter: value }))}
                  min={0}
                  step={0.01}
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Length (mm) <span className="text-red-500">*</span></label>
            <InputNumber
              style={{ width: '100%' }}
              placeholder="Length"
              value={newStockForm.length}
              onChange={(value) => setNewStockForm(prev => ({ ...prev, length: value }))}
              min={0}
              step={0.01}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quantity <span className="text-red-500">*</span></label>
            <InputNumber
              style={{ width: '100%' }}
              placeholder="Quantity"
              value={newStockForm.quantity}
              onChange={(value) => setNewStockForm(prev => ({ ...prev, quantity: value }))}
              min={1}
            />
          </div>

          {enquiryMode ? (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vendors for Enquiry <span className="text-red-500">*</span></label>
              <Select
                mode="multiple"
                style={{ width: '100%' }}
                placeholder="Select vendors to send enquiry"
                value={newStockForm.vendor_ids}
                onChange={(value) => setNewStockForm(prev => ({ ...prev, vendor_ids: value }))}
                onOpenChange={(open) => {
                  if (open) fetchVendors();
                }}
                showSearch
                placement="bottomLeft"
                getPopupContainer={() => document.body}
                styles={{ popup: { root: { position: 'fixed', zIndex: 9999 } } }}
                className="vendor-dropdown-downward"
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
          </>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Selected Vendor</label>
            <Select
              style={{ width: '100%' }}
              placeholder="Vendor"
              value={newStockForm.selected_vendor_id}
              onChange={(value) => setNewStockForm(prev => ({ ...prev, selected_vendor_id: value }))}
              disabled
            >
              {vendors.map(vendor => (
                <Option key={vendor.id} value={vendor.id}>
                  {vendor.company_name}
                </Option>
              ))}
            </Select>
            <Button
              type="link"
              onClick={() => setEnquiryMode(true)}
              style={{ padding: 0, height: 'auto' }}
            >
              ← Back to Vendor Enquiry
            </Button>
          </div>
        )}
          </div>

       

        <div className="flex justify-end pt-4">
            <Button
              type="primary"
              onClick={handleAddStock}
              loading={addStockLoading}
              size="large"
              style={{ backgroundColor: '#2563eb' }}
              className="border-none shadow-md px-8"
            >
              {enquiryMode ? 'Send Enquiry' : 'Add Order-Linked Stock'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default LinkMaterialsTab;
