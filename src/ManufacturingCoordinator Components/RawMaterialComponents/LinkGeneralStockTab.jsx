import React, { useState, useEffect } from "react";
import axios from "axios";
import { API_BASE_URL } from "../../Config/auth";
import { 
  Card, Table, Button, Select, message, Spin, Tree, 
  Modal, InputNumber, Tag, Typography, Space, Collapse,
  Empty, Row, Col, Alert, App
} from "antd";
import { 
  ShoppingCartOutlined, 
  LinkOutlined, 
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined
} from "@ant-design/icons";

const { Text, Title } = Typography;
const { Panel } = Collapse;
const { useApp } = App;

const LinkGeneralStockTab = () => {
  const { message, modal } = useApp();
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderHierarchy, setOrderHierarchy] = useState(null);
  const [generalStock, setGeneralStock] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [linkModalVisible, setLinkModalVisible] = useState(false);
  const [selectedPart, setSelectedPart] = useState(null);
  const [selectedStock, setSelectedStock] = useState(null);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [selectedFormType, setSelectedFormType] = useState(null);
  const [requiredQuantity, setRequiredQuantity] = useState(1);
  const [expandedKeys, setExpandedKeys] = useState([]);
  // 🔥 NEW: Unit-based tracking state
  const [availableUnits, setAvailableUnits] = useState([]);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [requiredLength, setRequiredLength] = useState(null);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [lengthError, setLengthError] = useState(null);

  const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
  const userId = storedUser?.id;

  useEffect(() => {
    fetchOrders();
    fetchGeneralStock();
    fetchRawMaterials();
  }, []);

  const fetchRawMaterials = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/rawmaterials/`);
      setRawMaterials(response.data || []);
    } catch (error) {
      console.error('Error fetching raw materials:', error);
    }
  };

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/orders/`, {
        params: { manufacturing_coordinator_id: userId }
      });
      setOrders(response.data || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
      message.error('Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  };

  const fetchGeneralStock = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/rawmaterials/stock/`);
      // Filter only general stock (source_type = 'general')
      const generalStockData = response.data.filter(stock => 
        stock.source_type === 'general' && stock.status === 'available'
      );
      setGeneralStock(generalStockData);
    } catch (error) {
      console.error('Error fetching general stock:', error);
    }
  };

  const fetchOrderHierarchy = async (orderId) => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/orders/${orderId}/hierarchical`);
      setOrderHierarchy(response.data.product_hierarchy);
      // Expand all by default
      setExpandedKeys(['all']);
    } catch (error) {
      console.error('Error fetching order hierarchy:', error);
      message.error('Failed to fetch order hierarchy');
    } finally {
      setLoading(false);
    }
  };

  const handleOrderClick = (order) => {
    setSelectedOrder(order);
    fetchOrderHierarchy(order.id);
  };

  const handleLinkMaterial = (part) => {
    setSelectedPart(part);
    // If part already has a linked unit, clear selections for new assignment
    if (part.part.raw_material_unit_id) {
      // Part already has a unit - clear selections for reassignment
      setSelectedStock(null);
      setSelectedMaterial(null);
      setSelectedFormType(null);
      setSelectedUnit(null);
      setRequiredLength(null);
    } else {
      // No existing unit assignment
      setSelectedStock(null);
      setSelectedMaterial(null);
      setSelectedFormType(null);
      setSelectedUnit(null);
      setRequiredLength(null);
    }
    setLinkModalVisible(true);
  };

  const handleUnlinkMaterial = (part) => {
    modal.confirm({
      title: 'Confirm Unlink',
      content: (
        <div>
          <p>Are you sure you want to unlink the raw material unit from this part?</p>
          <p><strong>Part:</strong> {part.part.part_number} - {part.part.part_name}</p>
          {part.part.raw_material_unit_id && (
            <div>
              <p><strong>Currently Assigned:</strong></p>
              <p>Unit #{part.part.raw_material_unit_id}</p>
              <p>Material: {part.part.raw_material_name} (ID: {part.part.raw_material_id})</p>
            </div>
          )}
        </div>
      ),
      okText: 'Yes, Unlink',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await axios.put(`${API_BASE_URL}/parts/${part.part.id}`, {
            raw_material_stock_id: null,
            raw_material_unit_id: null,
            raw_material_id: null,
            required_length: null
          });
          message.success('Material unlinked successfully');
          // Refresh hierarchy
          if (selectedOrder) {
            fetchOrderHierarchy(selectedOrder.id);
          }
        } catch (error) {
          console.error('Error unlinking material:', error);
          message.error('Failed to unlink material');
        }
      }
    });
  };

  const handleSaveLink = async () => {
    if (!selectedStock) {
      message.error('Please select a stock item');
      return;
    }
    
    // 🔥 NEW: Unit-based assignment
    if (!selectedUnit) {
      message.error('Please select a unit (rod/sheet)');
      return;
    }
    
    if (!requiredLength || requiredLength <= 0) {
      message.error('Please enter a valid required length');
      return;
    }
    
    if (requiredLength > selectedUnit.remaining_length) {
      message.error(`Required length (${requiredLength}) exceeds available length (${selectedUnit.remaining_length})`);
      return;
    }

    try {
      // 🔥 NEW: Call the unit-based assignment API
      await axios.post(`${API_BASE_URL}/rawmaterials/assign-material/`, null, {
        params: {
          unit_id: selectedUnit.id,
          part_id: selectedPart.part.id,
          required_length: requiredLength
        }
      });
      
      message.success('Material assigned successfully');
      setLinkModalVisible(false);
      setSelectedMaterial(null);
      setSelectedFormType(null);
      setSelectedStock(null);
      setSelectedUnit(null);
      setRequiredLength(null);
      setAvailableUnits([]);
      setLengthError(null); // Clear error after successful save
      
      // Refresh hierarchy
      if (selectedOrder) {
        fetchOrderHierarchy(selectedOrder.id);
      }
    } catch (error) {
      console.error('Error assigning material:', error);
      message.error(error.response?.data?.detail || 'Failed to assign material');
    }
  };

  const getStockDimensions = (stock) => {
    if (stock.form_type === 'Round') {
      return `Ø${stock.diameter} × ${stock.length}mm`;
    } else if (stock.form_type === 'Square') {
      return `${stock.breadth} × ${stock.height} × ${stock.length}mm`;
    } else if (stock.form_type === 'Pipe') {
      return `Ø${stock.outer_diameter}/${stock.inner_diameter} × ${stock.length}mm`;
    }
    return 'Custom';
  };

  // 🔥 NEW: Fetch available units for a stock (now includes partially used units)
  const fetchAvailableUnits = async (stockId) => {
    try {
      setLoadingUnits(true);
      const response = await axios.get(`${API_BASE_URL}/rawmaterials/stock/${stockId}/units`);
      // Keep all units (including exhausted) - will disable exhausted ones in dropdown
      setAvailableUnits(response.data || []);
    } catch (error) {
      console.error('Error fetching available units:', error);
      message.error('Failed to fetch available units');
      setAvailableUnits([]);
    } finally {
      setLoadingUnits(false);
    }
  };

  // 🔥 NEW: Validate required length input
  const handleRequiredLengthChange = (value) => {
    if (selectedUnit && value > selectedUnit.remaining_length) {
      setLengthError(`Maximum allowed length is ${selectedUnit.remaining_length}mm`);
      return;
    }
    setLengthError(null);
    setRequiredLength(value);
  };

  // Flatten hierarchy to get all parts
  const getAllParts = (hierarchy) => {
    const parts = [];
    
    const processAssembly = (assembly, path = []) => {
      const currentPath = [...path, assembly.assembly.assembly_name];
      
      // Process direct parts of this assembly
      if (assembly.parts && assembly.parts.length > 0) {
        assembly.parts.forEach(partDetail => {
          parts.push({
            ...partDetail,
            path: currentPath.join(' > ')
          });
        });
      }
      
      // Process subassemblies recursively
      if (assembly.subassemblies && assembly.subassemblies.length > 0) {
        assembly.subassemblies.forEach(subassembly => {
          processAssembly(subassembly, currentPath);
        });
      }
    };
    
    // Process direct parts of product
    if (hierarchy?.direct_parts) {
      hierarchy.direct_parts.forEach(partDetail => {
        parts.push({
          ...partDetail,
          path: 'Direct Parts'
        });
      });
    }
    
    // Process assemblies
    if (hierarchy?.assemblies) {
      hierarchy.assemblies.forEach(assembly => {
        processAssembly(assembly);
      });
    }
    
    return parts;
  };

  const renderPartRow = (part) => {
    const isLinked = part.part.raw_material_unit_id !== null;
    // Use the part's own linked material data from API response
    const linkedMaterialName = part.part.raw_material_name;
    const linkedMaterialDimensions = part.part.raw_material_stock_dimensions;
    const linkedMaterialFormType = part.part.raw_material_form_type;
    const stockSourceType = part.part.raw_material_stock_details?.source_type || null;
    const linkedUnitId = part.part.raw_material_unit_id;
    const linkedMaterialId = part.part.raw_material_id;
    const linkedRequiredLength = part.part.required_length;
    const partType = part.part.type_name || 'N/A';
    const partDetail = part.part.part_detail;
    const isInHouse = partType.toLowerCase().includes('in-house');
    const isOutsource = !isInHouse;
    const isStandard = partType.toLowerCase().includes('standard');
    
    // Determine if part has raw material based on part_detail field from API
    const hasRawMaterial = partDetail === 'WITH_RAW_MATERIAL';
    const isOrderStock = stockSourceType === 'order';
    const canLinkMaterial = (isInHouse || (isOutsource && hasRawMaterial) || isStandard || (isOutsource && !hasRawMaterial) || isOrderStock);
    
    return (
      <div key={part.part.id} style={{ 
        padding: '8px',
        borderBottom: '1px solid #f0f0f0',
        backgroundColor: isLinked ? '#f6ffed' : '#fff'
      }}>
        <Row gutter={[8, 8]} align="middle">
          <Col xs={12} sm={8} md={4}>
            <div>
              <Text strong>{part.part.part_number}</Text>
              <br />
              <Text type="secondary" style={{ fontSize: '12px' }}>{part.part.part_name}</Text>
            </div>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Text type="secondary" style={{ fontSize: '12px' }}>{part.path}</Text>
          </Col>
          <Col xs={12} sm={8} md={3}>
            <Space size={4}>
              <Tag color={isInHouse ? 'blue' : isStandard ? 'green' : 'orange'}>{partType}</Tag>
              {isOutsource && partDetail && (
                <Tag color={partDetail === 'WITH_RAW_MATERIAL' ? 'green' : 'default'}>
                  {partDetail === 'WITH_RAW_MATERIAL' ? 'With RM' : 'Without RM'}
                </Tag>
              )}
            </Space>
          </Col>
          <Col xs={12} sm={8} md={2}>
            <Text>Qty: {part.part.qty}</Text>
          </Col>
          <Col xs={12} sm={8} md={2}>
            {isLinked && stockSourceType ? (
              <Tag color={stockSourceType === 'general' ? 'geekblue' : 'purple'}>
                {stockSourceType === 'general' ? 'General' : 'Order'}
              </Tag>
            ) : (
              <Text type="secondary" style={{ fontSize: '12px' }}>-</Text>
            )}
          </Col>
          <Col xs={12} sm={8} md={5}>
            {isLinked ? (
              <div>
                <Text strong style={{ fontSize: '12px' }}>
                  {linkedMaterialName || part.part.raw_material_unit_details?.material_name || ''}
                </Text>
                <br />
                <Text type="secondary" style={{ fontSize: '11px' }}>
                  {linkedMaterialFormType || part.part.raw_material_unit_details?.form_type || 'Unknown'}
                </Text>
                <br />
                <Text type="secondary" style={{ fontSize: '11px' }}>
                  Unit #{linkedUnitId}
                </Text>
                {linkedRequiredLength && linkedRequiredLength > 0 && (
                  <>
                    <br />
                    <Text type="secondary" style={{ fontSize: '11px' }}>
                      Required Length: {linkedRequiredLength}mm
                    </Text>
                    
                  </>
                )}
              </div>
            ) : (
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {canLinkMaterial ? 'Not Linked' : 'N/A'}
              </Text>
            )}
          </Col>
          <Col xs={12} sm={8} md={4}>
            {canLinkMaterial && (
              <>
                {isLinked ? (
                  <Button 
                    size="small" 
                    type="primary"
                    disabled={isOrderStock || isStandard || (isOutsource && !hasRawMaterial)}
                    onClick={() => handleLinkMaterial(part)}
                  >
                    Change
                  </Button>
                ) : (
                  <Button 
                    size="small" 
                    type="primary" 
                    icon={<LinkOutlined />}
                    disabled={isOrderStock || isStandard || (isOutsource && !hasRawMaterial)}
                    onClick={() => handleLinkMaterial(part)}
                  >
                    Link
                  </Button>
                )}
                {isLinked && (
                  <Button 
                    size="small" 
                    danger 
                    style={{ marginLeft: '4px' }}
                    disabled={isOrderStock || isStandard || (isOutsource && !hasRawMaterial)}
                    onClick={() => handleUnlinkMaterial(part)}
                  >
                    Unlink
                  </Button>
                )}
              </>
            )}
          </Col>
        </Row>
      </div>
    );
  };

  const getStatusColor = (status) => {
    const statusColors = {
      'Pending': 'orange',
      'Scheduling': 'blue',
      'In Progress': 'processing',
      'Completed': 'green',
      'Cancelled': 'red',
      'On Hold': 'default'
    };
    return statusColors[status] || 'default';
  };

  const orderColumns = [
    {
      title: 'Order Number',
      dataIndex: 'sale_order_number',
      key: 'sale_order_number',
      responsive: ['md', 'lg', 'xl']
    },
    {
      title: 'Customer',
      dataIndex: 'company_name',
      key: 'company_name',
    },
    {
      title: 'Product',
      dataIndex: 'product_name',
      key: 'product_name',
      responsive: ['lg', 'xl']
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => <Tag color={getStatusColor(status)}>{status}</Tag>
    },
    {
      title: 'Action',
      key: 'action',
      render: (_, record) => (
        <Button 
          type="primary" 
          size="small"
          onClick={() => handleOrderClick(record)}
        >
          View BOM
        </Button>
      )
    }
  ];

  return (
    <div style={{ padding: '16px' }}>
      <Row gutter={16} style={{ marginBottom: '16px' }}>
        <Col span={24}>
          <Card 
            extra={
              <Space>
                {selectedOrder && (
                  <Button 
                    onClick={() => {
                      setSelectedOrder(null);
                      setOrderHierarchy(null);
                    }}
                  >
                    ← Back to Orders
                  </Button>
                )}
                <Button 
                  icon={<ReloadOutlined />} 
                  onClick={() => {
                    fetchOrders();
                    fetchGeneralStock();
                  }}
                >
                  Refresh
                </Button>
              </Space>
            }
          >
            {!selectedOrder ? (
              <Table
                columns={orderColumns}
                dataSource={orders}
                loading={loading}
                rowKey="id"
                pagination={{ pageSize: 10 }}
                size="small"
              />
            ) : (
              <div>
                {loading ? (
                  <div style={{ textAlign: 'center', padding: '40px' }}>
                    <Spin size="large" />
                  </div>
                ) : orderHierarchy ? (() => {
                  const allParts = getAllParts(orderHierarchy);
                  return (
                    <div>
                      <Title level={5}>Parts BOM ({allParts.length} parts)</Title>
                      <Card size="small">
                        <div style={{ backgroundColor: '#fafafa', padding: '6px 8px', fontWeight: 'bold', marginBottom: '4px' }}>
                          <Row gutter={[8, 8]}>
                            <Col xs={12} sm={8} md={4}>Part Number / Name</Col>
                            <Col xs={12} sm={8} md={4}>Assembly Path</Col>
                            <Col xs={12} sm={8} md={3}>Part Type</Col>
                            <Col xs={12} sm={8} md={2}>Quantity</Col>
                            <Col xs={12} sm={8} md={2}>Stock Type</Col>
                            <Col xs={12} sm={8} md={5}>Raw Material Status</Col>
                            <Col xs={12} sm={8} md={4}>Action</Col>
                          </Row>
                        </div>
                        {allParts.map(part => renderPartRow(part))}
                      </Card>
                    </div>
                  );
                })() : (
                  <Empty description="No hierarchy data available" />
              )}
            </div>
          )}
        </Card>
      </Col>
    </Row>

    {/* Link Material Modal */}
    <Modal
      title={selectedPart?.part?.raw_material_unit_id ? "Change Raw Material Unit" : "Assign Raw Material Unit to Part"}
      open={linkModalVisible}
      onOk={handleSaveLink}
      onCancel={() => {
        setLinkModalVisible(false);
        setSelectedPart(null);
        setSelectedStock(null);
        setSelectedMaterial(null);
        setSelectedFormType(null);
        setSelectedUnit(null);
        setRequiredLength(null);
        setAvailableUnits([]);
        setLengthError(null); // Clear error when modal closes
      }}
      width={800}
    >
        {selectedPart && (
          <div>
            <Card size="small" style={{ marginBottom: '16px' }}>
              <Space orientation="vertical">
                <Text strong>Part: {selectedPart.part.part_number} - {selectedPart.part.part_name}</Text>
                <Text type="secondary">Assembly Path: {selectedPart.path}</Text>
                <Text>Part Type: <Tag color={selectedPart.part.type_name?.toLowerCase().includes('in-house') ? 'blue' : 'orange'}>{selectedPart.part.type_name}</Tag></Text>
                <Text>Part Quantity: {selectedPart.part.qty}</Text>
                              </Space>
            </Card>

            {selectedPart.part.raw_material_unit_id && (
              <Alert
                message="Warning"
                description={
                  <div>
                    This part is already assigned to Unit #{selectedPart.part.raw_material_unit_id}.
                    Selecting a new unit will replace the current assignment.
                    <br />
                    <Text type="secondary">
                      Current material: {selectedPart.part.raw_material_name} (ID: {selectedPart.part.raw_material_id})
                    </Text>
                  </div>
                }
                type="warning"
                showIcon
                style={{ marginBottom: '16px' }}
              />
            )}

            <div style={{ marginBottom: '16px' }}>
              <Text strong>Step 1: Select Raw Material:</Text>
              <Select
                style={{ width: '100%', marginTop: '8px' }}
                placeholder="Select raw material"
                showSearch
                optionFilterProp="children"
                value={selectedMaterial}
                onChange={(value) => {
                  setSelectedMaterial(value);
                  setSelectedFormType(null);
                  setSelectedStock(null);
                }}
              >
                {rawMaterials.map(material => (
                  <Select.Option key={material.id} value={material.id}>
                    {material.material_name}
                  </Select.Option>
                ))}
              </Select>
            </div>

            {selectedMaterial && (
              <div style={{ marginBottom: '16px' }}>
                <Text strong>Step 2: Select Form Type:</Text>
                <Select
                  style={{ width: '100%', marginTop: '8px' }}
                  placeholder="Select form type"
                  value={selectedFormType}
                  onChange={(value) => {
                    setSelectedFormType(value);
                    setSelectedStock(null);
                  }}
                >
                  {[...new Set(generalStock.filter(s => s.material_id === selectedMaterial).map(s => s.form_type))].map(formType => (
                    <Select.Option key={formType} value={formType}>
                      {formType}
                    </Select.Option>
                  ))}
                </Select>
              </div>
            )}

            {selectedMaterial && selectedFormType && (
              <div style={{ marginBottom: '16px' }}>
                <Text strong>Step 3: Select Stock:</Text>
                <Select
                  style={{ width: '100%', marginTop: '8px' }}
                  placeholder="Select stock"
                  showSearch
                  optionFilterProp="children"
                  value={selectedStock?.id}
                  onChange={async (value) => {
                    const stock = generalStock.find(s => s.id === value);
                    setSelectedStock(stock);
                    setSelectedUnit(null);
                    setRequiredLength(null);
                    setLengthError(null); // Clear error when stock changes
                    // 🔥 NEW: Fetch available units for selected stock
                    if (stock) {
                      await fetchAvailableUnits(stock.id);
                    }
                  }}
                >
                  {generalStock
                    .filter(stock => stock.material_id === selectedMaterial && stock.form_type === selectedFormType)
                    .map(stock => (
                      <Select.Option key={stock.id} value={stock.id}>
                        <div>
                          <div>{getStockDimensions(stock)}</div>
                          <div style={{ fontSize: '12px', color: '#666' }}>
                            Available: {stock.available_quantity}
                          </div>
                        </div>
                      </Select.Option>
                    ))}
                </Select>
              </div>
            )}

            {selectedStock && (
              <div style={{ marginBottom: '16px' }}>
                <Text strong>Step 4: Select Unit (Rod/Sheet):</Text>
                {loadingUnits ? (
                  <div style={{ marginTop: '8px' }}>
                    <Spin size="small" /> Loading units...
                  </div>
                ) : availableUnits.length > 0 ? (
                  <Select
                    style={{ width: '100%', marginTop: '8px' }}
                    placeholder="Select a unit"
                    showSearch
                    optionFilterProp="children"
                    value={selectedUnit?.id}
                    onChange={(value) => {
                      const unit = availableUnits.find(u => u.id === value);
                      setSelectedUnit(unit);
                      setRequiredLength(null);
                      setLengthError(null); // Clear error when unit changes
                    }}
                  >
                    {availableUnits.map(unit => (
                      <Select.Option 
                        key={unit.id} 
                        value={unit.id}
                        disabled={unit.status === 'exhausted'}
                      >
                        <div>
                          <div style={{ fontWeight: 'bold' }}>
                            Unit #{unit.id} - Total: {unit.total_length}mm, Remaining: {unit.remaining_length}mm
                          </div>
                          <div style={{ fontSize: '12px', color: '#666' }}>
                            Status: <Tag color={unit.status === 'available' ? 'green' : unit.status === 'partially_used' ? 'orange' : 'red'}>{unit.status}</Tag>
                            {unit.status === 'exhausted' && <span> - Not available</span>}
                          </div>
                        </div>
                      </Select.Option>
                    ))}
                  </Select>
                ) : (
                  <div style={{ marginTop: '8px', color: '#ff4d4f' }}>
                    No available units for this stock
                  </div>
                )}
              </div>
            )}

            {selectedUnit && (
              <div style={{ marginBottom: '16px' }}>
                <Text strong>Step 5: Enter Required Length (mm):</Text>
                <InputNumber
                  style={{ width: '100%', marginTop: '8px' }}
                  min={1}
                  max={selectedUnit.remaining_length}
                  value={requiredLength}
                  onChange={handleRequiredLengthChange}
                  onBeforeInput={(e) => {
                    const currentValue = e.target.value || '';
                    const char = e.data;
                    // Prevent input if it would exceed max
                    if (char && /[0-9]/.test(char)) {
                      const newValue = currentValue + char;
                      if (Number(newValue) > selectedUnit.remaining_length) {
                        e.preventDefault();
                      }
                    }
                  }}
                  placeholder={`Max: ${selectedUnit.remaining_length}mm`}
                  status={lengthError ? 'error' : undefined}
                />
                {lengthError && (
                  <div style={{ marginTop: '4px', fontSize: '12px', color: '#ff4d4f' }}>
                    {lengthError}
                  </div>
                )}
                <div style={{ marginTop: '4px', fontSize: '12px', color: '#666' }}>
                  Available length: {selectedUnit.remaining_length}mm
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default LinkGeneralStockTab;
