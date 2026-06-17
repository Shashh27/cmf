import React, { useState, useEffect } from "react";
import axios from "axios";
import { API_BASE_URL } from "../../Config/auth";
import { 
  Card, Table, Button, Select, message, Spin, Tree, 
  Modal, InputNumber, Input, Tag, Typography, Space, Collapse,
  Empty, Row, Col, Alert, App, Divider, Statistic,
  List, Avatar, Tooltip, Badge, Image
} from "antd";
import { 
  ShoppingCartOutlined, 
  LinkOutlined, 
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  InboxOutlined,
  InfoCircleOutlined,
  EditOutlined,
  DisconnectOutlined,
  SearchOutlined,
  EyeOutlined,
  FileTextOutlined
} from "@ant-design/icons";
import OrderRequirementsDisplay from "./OrderRequirementsDisplay";

const { Text, Title } = Typography;
const { Panel } = Collapse;
const { useApp } = App;

const LinkGeneralStockTab = ({ rawMaterials }) => {
  const { message, modal } = useApp();
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderHierarchy, setOrderHierarchy] = useState(null);
  const [generalStock, setGeneralStock] = useState([]);
  const [linkModalVisible, setLinkModalVisible] = useState(false);
  const [selectedPart, setSelectedPart] = useState(null);
  const [selectedStock, setSelectedStock] = useState(null);
  const [selectedProcessType, setSelectedProcessType] = useState(null);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [selectedFormType, setSelectedFormType] = useState(null);
  const [requiredQuantity, setRequiredQuantity] = useState(1);
  const [expandedKeys, setExpandedKeys] = useState([]);
  const [availableUnits, setAvailableUnits] = useState([]);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [requiredLength, setRequiredLength] = useState(null);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [lengthError, setLengthError] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showOrderRequirements, setShowOrderRequirements] = useState(false);
  const [externalDocument, setExternalDocument] = useState(null);

  const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
  const userId = storedUser?.id;

  useEffect(() => {
    fetchOrders();
  }, []);

  
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
      const response = await axios.get(`${API_BASE_URL}/rawmaterials/order-raw-material-hierarchy/${orderId}`);
      setOrderHierarchy(response.data.product_hierarchy);
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
    if (part.part.raw_material_unit_id) {
      setSelectedStock(null);
      setSelectedProcessType(null);
      setSelectedMaterial(null);
      setSelectedFormType(null);
      setSelectedUnit(null);
      setRequiredLength(null);
    } else {
      setSelectedStock(null);
      setSelectedProcessType(null);
      setSelectedMaterial(null);
      setSelectedFormType(null);
      setSelectedUnit(null);
      setRequiredLength(null);
    }
    // Fetch general stock only when opening the link modal
    fetchGeneralStock();
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
              <p>Stock Dimensions: {part.part.raw_material_stock_dimensions || '—'}</p>
              <p>Material: {part.part.raw_material_name} </p>
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
          if (selectedOrder) {
            fetchOrderHierarchy(selectedOrder.id);
          }
        } catch (error) {
          console.error('Error unlinking material:', error);
          const detail =
            error?.response?.data?.detail ||
            error?.response?.data?.message ||
            'Failed to unlink material';
          message.error(detail);
        }
      }
    });
  };

  const handleViewPartDetails = (part) => {
    // Set selected part and show OrderRequirementsDisplay modal
    setSelectedPart(part);
    setShowOrderRequirements(true);
  };

  const handleDocumentPreview = (document) => {
    // Set external document to be handled by OrderRequirementsDisplay
    setExternalDocument(document);
    // Ensure OrderRequirementsDisplay modal is open
    if (!showOrderRequirements) {
      setShowOrderRequirements(true);
    }
  };

  const handleExternalDocumentPreview = (document) => {
    setExternalDocument(document);
  };

  const handleSaveLink = async () => {
    if (!selectedStock) {
      message.error('Please select a stock item');
      return;
    }
    
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
      await axios.post(`${API_BASE_URL}/rawmaterials/assign-material/`, null, {
        params: {
          unit_id: selectedUnit.id,
          part_id: selectedPart.part.id,
          required_length: requiredLength,
          user_id: userId
        }
      });
      
      message.success('Material assigned successfully');
      setLinkModalVisible(false);
      setSelectedProcessType(null);
      setSelectedMaterial(null);
      setSelectedFormType(null);
      setSelectedStock(null);
      setSelectedUnit(null);
      setRequiredLength(null);
      setAvailableUnits([]);
      setLengthError(null);
      
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

  const fetchAvailableUnits = async (stockId) => {
    try {
      setLoadingUnits(true);
      const response = await axios.get(`${API_BASE_URL}/rawmaterials/stock/${stockId}/units`);
      setAvailableUnits(response.data || []);
    } catch (error) {
      console.error('Error fetching available units:', error);
      message.error('Failed to fetch available units');
      setAvailableUnits([]);
    } finally {
      setLoadingUnits(false);
    }
  };

  const handleRequiredLengthChange = (value) => {
    if (selectedUnit && value > selectedUnit.remaining_length) {
      setLengthError(`Maximum allowed length is ${selectedUnit.remaining_length}mm`);
      return;
    }
    setLengthError(null);
    setRequiredLength(value);
  };

  // Helper function to get latest extracted data
  const getLatestExtractedData = (extractedDataArray) => {
    if (!extractedDataArray || !Array.isArray(extractedDataArray) || extractedDataArray.length === 0) {
      return null;
    }
    const sorted = [...extractedDataArray].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return sorted[0];
  };

  const getAllParts = (hierarchy) => {
    const parts = [];
    
    const processAssembly = (assembly, path = []) => {
      const currentPath = [...path, assembly.assembly.assembly_name];
      
      if (assembly.parts && assembly.parts.length > 0) {
        assembly.parts.forEach(partDetail => {
          parts.push({
            ...partDetail,
            path: currentPath.join(' > ')
          });
        });
      }
      
      if (assembly.subassemblies && assembly.subassemblies.length > 0) {
        assembly.subassemblies.forEach(subassembly => {
          processAssembly(subassembly, currentPath);
        });
      }
    };
    
    if (hierarchy?.direct_parts) {
      hierarchy.direct_parts.forEach(partDetail => {
        parts.push({
          ...partDetail,
          path: 'Direct Parts'
        });
      });
    }
    
    if (hierarchy?.assemblies) {
      hierarchy.assemblies.forEach(assembly => {
        processAssembly(assembly);
      });
    }
    
    return parts;
  };

  const filteredParts = () => {
    if (!orderHierarchy) return [];
    
    let allParts = getAllParts(orderHierarchy);
    
    if (searchText) {
      allParts = allParts.filter(part => 
        part.part.part_number.toLowerCase().includes(searchText.toLowerCase()) ||
        part.part.part_name.toLowerCase().includes(searchText.toLowerCase()) ||
        part.path.toLowerCase().includes(searchText.toLowerCase())
      );
    }
    
    if (filterStatus !== 'all') {
      allParts = allParts.filter(part => {
        const isLinked = part.part.raw_material_unit_id !== null;
        if (filterStatus === 'linked') return isLinked;
        if (filterStatus === 'unlinked') return !isLinked;
        return true;
      });
    }
    
    return allParts;
  };

  const getStatistics = () => {
    const parts = filteredParts();
    const totalParts = parts.length;
    const linkedParts = parts.filter(part => part.part.raw_material_unit_id !== null).length;
    const unlinkedParts = totalParts - linkedParts;
    
    return { totalParts, linkedParts, unlinkedParts };
  };

  const renderPartCard = (part) => {
    const isLinked = part.part.raw_material_unit_id !== null;
    const linkedMaterialName = part.part.raw_material_name;
    const linkedMaterialDimensions = part.part.raw_material_stock_dimensions || part.part.raw_material_unit_details?.stock_dimensions;
    const linkedMaterialFormType = part.part.raw_material_unit_details?.form_type || part.part.raw_material_form_type;
    const stockSourceType = part.part.raw_material_stock_details?.source_type || part.part.raw_material_unit_details?.source_type || null;
    const linkedUnitId = part.part.raw_material_unit_id;
    const linkedRequiredLength = part.part.required_length;
    const partType = part.part.type_name || 'N/A';
    const partDetail = part.part.part_detail;
    const isInHouse = partType.toLowerCase().includes('in-house');
    const isOutsource = !isInHouse;
    const isStandard = partType.toLowerCase().includes('standard');
    const hasRawMaterial = partDetail === 'WITH_RAW_MATERIAL';
    const isOrderStock = stockSourceType === 'order';
    const canLinkMaterial = (isInHouse || (isOutsource && hasRawMaterial) || isStandard || (isOutsource && !hasRawMaterial) || isOrderStock);
    const isMobile = window.innerWidth <= 768;
    
    return (
      <div key={part.part.id} style={{ 
        padding: isMobile ? '8px' : '6px 8px',
        borderBottom: '1px solid #f0f0f0',
        transition: 'all 0.2s ease',
        backgroundColor: isLinked ? '#f6ffed' : '#fff'
      }}>
        <Row gutter={[isMobile ? 4 : 8, 0]} align="middle">
          
          {/* Part Number & Name */}
          <Col xs={24} sm={5} md={4}>
            <Text strong style={{ fontSize: isMobile ? '12px' : '13px', color: '#000', fontWeight: '600' }}>
              {part.part.part_number}
            </Text>
            <br />
            <Text style={{ fontSize: isMobile ? '11px' : '12px', color: '#262626', fontWeight: '500' }}>
              {part.part.part_name.length > (isMobile ? 15 : 18) ? part.part.part_name.substring(0, (isMobile ? 15 : 18)) + '...' : part.part.part_name}
            </Text>
          </Col>
          
          {/* Assembly Path - Hidden on mobile */}
          {!isMobile && (
            <Col xs={24} sm={4} md={3}>
              <Text style={{ fontSize: '11px', color: '#595959', fontWeight: '500' }}>
                {part.path.length > 22 ? part.path.substring(0, 22) + '...' : part.path}
              </Text>
            </Col>
          )}
          
          {/* Part Type */}
          <Col xs={24} sm={2} md={2}>
            <div>
              <Tag 
                color={isInHouse ? 'blue' : isStandard ? 'green' : 'orange'} 
                style={{ fontSize: isMobile ? '9px' : '10px', padding: isMobile ? '1px 4px' : '2px 5px', fontWeight: '600' }}
              >
                {isMobile ? (partType.length > 8 ? partType.substring(0, 8) : partType) : partType}
              </Tag>
              {isOutsource && partDetail && (
                <div style={{ marginTop: '2px' }}>
                  <Tag 
                    color={partDetail === 'WITH_RAW_MATERIAL' ? 'green' : 'default'} 
                    style={{ fontSize: isMobile ? '8px' : '9px', padding: isMobile ? '1px 3px' : '1px 4px', fontWeight: '500' }}
                  >
                    {partDetail === 'WITH_RAW_MATERIAL' ? 'RM' : 'No RM'}
                  </Tag>
                </div>
              )}
            </div>
          </Col>
          
          {/* Quantity */}
          <Col xs={24} sm={1} md={1}>
            <div style={{ textAlign: 'center' }}>
              <Text style={{ fontSize: isMobile ? '12px' : '13px', fontWeight: '600', color: '#000' }}>
                {part.part.qty}
              </Text>
            </div>
          </Col>

          {/* Extracted Raw Materials */}
          <Col xs={24} sm={4} md={5}>
            {(() => {
              const latestExtractedData = getLatestExtractedData(part.extracted_data);
              return latestExtractedData ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <Text style={{ fontSize: '11px', color: '#595959', fontWeight: '500' }}>Material:</Text>
                      <Text strong style={{ fontSize: '11px', color: '#000', lineHeight: '1.2' }}>
                        {latestExtractedData.material || 'N/A'}
                      </Text>
                    </div>
                    {latestExtractedData.stock_size && (
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <Text style={{ fontSize: '10px', color: '#8c8c8c' }}>Stock Size:</Text>
                        <Text style={{ fontSize: '10px', color: '#595959', lineHeight: '1.2' }}>
                          {latestExtractedData.stock_size}
                        </Text>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <Text style={{ fontSize: '11px', color: '#bfbfbf' }}>N/A</Text>
              );
            })()}
          </Col>
          
          {/* Material Details */}
          <Col xs={24} sm={5} md={6}>
            {isLinked ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '2px' }}>
                  <InboxOutlined style={{ color: '#52c41a', marginRight: '4px', fontSize: isMobile ? '11px' : '12px' }} />
                  <Text strong style={{ fontSize: isMobile ? '10px' : '11px', color: '#000', fontWeight: '600' }}>
                    {linkedMaterialName?.length > (isMobile ? 15 : 20) ? linkedMaterialName.substring(0, (isMobile ? 15 : 20)) + '...' : linkedMaterialName || 'N/A'}
                  </Text>
                </div>
                <div style={{ fontSize: isMobile ? '9px' : '10px', lineHeight: '1.3' }}>
                  <Text style={{ color: '#595959' }}>
                    {linkedMaterialFormType || 'Unknown'}
                  </Text>
                  <span style={{ margin: '0 4px', color: '#d9d9d9' }}>|</span>
                  <Text style={{ color: '#1890ff', fontWeight: '500' }}>
                    {linkedMaterialDimensions || '—'}
                  </Text>
                  {linkedRequiredLength && (
                    <>
                      <span style={{ margin: '0 4px', color: '#d9d9d9' }}>|</span>
                      <Text style={{ color: '#fa8c16', fontWeight: '500' }}>
                        {linkedRequiredLength}mm
                      </Text>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <Text style={{ fontSize: isMobile ? '9px' : '10px', color: '#8c8c8c' }}>
                No Material Linked
              </Text>
            )}
          </Col>
          
          {/* Actions */}
          <Col xs={24} sm={3} md={3}>
            <div style={{ display: 'flex', gap: '4px', justifyContent: isMobile ? 'flex-start' : 'center' }}>
              {canLinkMaterial && (
                <>
                  {isLinked ? (
                    <Tooltip title="Change Material">
                      <Button 
                        type="primary"
                        size="small"
                        icon={<EditOutlined />}
                        disabled={isOrderStock || isStandard || (isOutsource && !hasRawMaterial)}
                        onClick={() => handleLinkMaterial(part)}
                        style={{ fontSize: '12px', height: isMobile ? '24px' : '28px', width: isMobile ? '28px' : '32px', padding: '0' }}
                      />
                    </Tooltip>
                  ) : (
                    <Tooltip title="Link Material">
                      <Button 
                        type="primary"
                        size="small"
                        icon={<LinkOutlined />}
                        disabled={isOrderStock || isStandard || (isOutsource && !hasRawMaterial)}
                        onClick={() => handleLinkMaterial(part)}
                        style={{ fontSize: '12px', height: isMobile ? '24px' : '28px', width: isMobile ? '28px' : '32px', padding: '0' }}
                      />
                    </Tooltip>
                  )}
                  {isLinked && (
                    <Tooltip title="Unlink Material">
                      <Button 
                        danger
                        size="small"
                        icon={<DisconnectOutlined />}
                        disabled={isOrderStock || isStandard || (isOutsource && !hasRawMaterial)}
                        onClick={() => handleUnlinkMaterial(part)}
                        style={{ fontSize: '12px', height: isMobile ? '24px' : '28px', width: isMobile ? '28px' : '32px', padding: '0' }}
                      />
                    </Tooltip>
                  )}
                </>
              )}
                  <Tooltip title="View Details">
                    <Button 
                      type="primary"
                      size="small"
                      icon={<EyeOutlined />}
                      onClick={() => handleViewPartDetails(part)}
                      style={{ fontSize: '12px', height: isMobile ? '24px' : '28px', width: isMobile ? '28px' : '32px', padding: '0', backgroundColor: '#52c41a', borderColor: '#52c41a' }}
                    />
                  </Tooltip>
            </div>
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

  const stats = getStatistics();

  return (
    <div style={{ padding: '16px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      <Row gutter={[16, 16]}>
        {/* Orders Section */}
        <Col xs={24} lg={8}>
          <Card 
            title={
              <Space style={{ fontSize: '13px' }}>
                <ShoppingCartOutlined />
                <span>Orders</span>
                <Badge count={orders.length} style={{ backgroundColor: '#52c41a' }} />
              </Space>
            }
            styles={{ body: { padding: '8px' } }}
            style={{ height: '600px', overflow: 'auto' }}
          >
            <div>
              {loading ? (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                  <Spin size="large" />
                </div>
              ) : (
                orders.map((order) => (
                  <div
                    key={order.id}
                    style={{
                      padding: '8px 10px',
                      border: selectedOrder?.id === order.id ? '2px solid #1890ff' : '1px solid #f0f0f0',
                      borderRadius: '4px',
                      marginBottom: '3px',
                      cursor: 'pointer',
                      backgroundColor: selectedOrder?.id === order.id ? '#e6f7ff' : '#fff',
                      transition: 'all 0.2s ease',
                      boxShadow: selectedOrder?.id === order.id ? '0 1px 3px rgba(24, 144, 255, 0.15)' : '0 1px 2px rgba(0,0,0,0.05)'
                    }}
                    onClick={() => handleOrderClick(order)}
                  >
                    <div style={{ width: '100%', display: 'flex', alignItems: 'flex-start' }}>
                      <ShoppingCartOutlined style={{ 
                        fontSize: '16px', 
                        color: selectedOrder?.id === order.id ? '#1890ff' : '#52c41a', 
                        marginRight: '8px',
                        marginTop: '2px'
                      }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                          <Text strong style={{ fontSize: '13px', color: '#000', fontWeight: '600' }}>
                            {order.sale_order_number}
                          </Text>
                          <Tag color={getStatusColor(order.status)} size="small" style={{ fontSize: '10px', padding: '2px 5px', fontWeight: '600' }}>
                            {order.status}
                          </Tag>
                        </div>
                        <Text style={{ fontSize: '11px', color: '#595959', fontWeight: '500', display: 'block' }}>
                          {order.product_name?.length > 28 ? order.product_name.substring(0, 28) + '...' : order.product_name}
                        </Text>
                        <Text style={{ fontSize: '12px', color: '#262626', fontWeight: '500', display: 'block', marginBottom: '1px' }}>
                          {order.company_name}
                        </Text>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </Col>

        {/* Parts Section */}
        <Col xs={24} lg={16}>
          <Card 
            title={
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                width: '100%',
                flexWrap: 'wrap',
                gap: '8px'
              }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  flexWrap: 'wrap',
                  gap: '8px',
                  fontSize: '13px'
                }}>
                  <InboxOutlined />
                  <span>Parts BOM</span>
                  {selectedOrder && (
                    <Tag color="blue" style={{ fontSize: '10px' }}>{selectedOrder.sale_order_number}</Tag>
                  )}
                  {selectedOrder && window.innerWidth > 768 && (
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '8px',
                      marginLeft: '16px'
                    }}>
                      <span style={{ fontSize: '11px', color: '#8c8c8c' }}>Total:</span>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: '#1890ff' }}>{stats.totalParts}</span>
                      <span style={{ fontSize: '11px', color: '#8c8c8c' }}>Linked:</span>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: '#52c41a' }}>{stats.linkedParts}</span>
                      <span style={{ fontSize: '11px', color: '#8c8c8c' }}>Unlinked:</span>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: '#ff4d4f' }}>{stats.unlinkedParts}</span>
                    </div>
                  )}
                </div>
                {selectedOrder && (
                  <div style={{ 
                    display: 'flex', 
                    gap: '4px',
                    alignItems: 'center',
                    flexWrap: 'wrap'
                  }}>
                    <Input
                      placeholder="Search..."
                      prefix={<SearchOutlined />}
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      style={{ fontSize: '11px', width: window.innerWidth < 768 ? '120px' : '150px' }}
                      size="small"
                    />
                    <Select
                      value={filterStatus}
                      onChange={setFilterStatus}
                      style={{ fontSize: '11px', width: window.innerWidth < 768 ? '100px' : '120px' }}
                      size="small"
                    >
                      <Select.Option value="all">All</Select.Option>
                      <Select.Option value="linked">Linked</Select.Option>
                      <Select.Option value="unlinked">Unlinked</Select.Option>
                    </Select>
                  </div>
                )}
              </div>
            }
           
          >
            {!selectedOrder ? (
              <Empty 
                description="Please select an order to view parts"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                style={{ padding: '20px' }}
              />
            ) : (
              <>
                {/* Mobile Statistics */}
                {window.innerWidth <= 768 && (
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-around', 
                    padding: '8px',
                    backgroundColor: '#fafafa',
                    borderRadius: '4px',
                    marginBottom: '8px',
                    fontSize: '11px'
                  }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontWeight: '600', color: '#1890ff' }}>{stats.totalParts}</div>
                      <div style={{ color: '#8c8c8c' }}>Total</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontWeight: '600', color: '#52c41a' }}>{stats.linkedParts}</div>
                      <div style={{ color: '#8c8c8c' }}>Linked</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontWeight: '600', color: '#ff4d4f' }}>{stats.unlinkedParts}</div>
                      <div style={{ color: '#8c8c8c' }}>Unlinked</div>
                    </div>
                  </div>
                )}
                
                {/* Parts List - Responsive height with table format for mobile */}
                {window.innerWidth <= 768 ? (
                  // Mobile Table Format
                  <div style={{ height: '400px', overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: '4px' }}>
                    {loading ? (
                      <div style={{ textAlign: 'center', padding: '20px' }}>
                        <Spin size="large" />
                      </div>
                    ) : filteredParts().length > 0 ? (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#fafafa', borderBottom: '2px solid #f0f0f0', position: 'sticky', top: 0, zIndex: 10 }}>
                            <th style={{ padding: '8px 4px', textAlign: 'left', fontSize: '10px', fontWeight: 'bold', color: '#262626' }}>Part</th>
                            <th style={{ padding: '8px 4px', textAlign: 'left', fontSize: '10px', fontWeight: 'bold', color: '#262626' }}>Type</th>
                            <th style={{ padding: '8px 4px', textAlign: 'center', fontSize: '10px', fontWeight: 'bold', color: '#262626' }}>Qty</th>
                            <th style={{ padding: '8px 4px', textAlign: 'left', fontSize: '10px', fontWeight: 'bold', color: '#262626' }}>Extracted RM</th>
                            <th style={{ padding: '8px 4px', textAlign: 'left', fontSize: '10px', fontWeight: 'bold', color: '#262626' }}>Material</th>
                            <th style={{ padding: '8px 4px', textAlign: 'center', fontSize: '10px', fontWeight: 'bold', color: '#262626' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredParts().map(part => {
                            const isLinked = part.part.raw_material_unit_id !== null;
                            const linkedMaterialName = part.part.raw_material_name;
                            const linkedMaterialDimensions = part.part.raw_material_stock_dimensions || part.part.raw_material_unit_details?.stock_dimensions;
                            const linkedMaterialFormType = part.part.raw_material_unit_details?.form_type || part.part.raw_material_form_type;
                            const linkedUnitId = part.part.raw_material_unit_id;
                            const linkedRequiredLength = part.part.required_length;
                            const partType = part.part.type_name || 'N/A';
                            const partDetail = part.part.part_detail;
                            const isInHouse = partType.toLowerCase().includes('in-house');
                            const isOutsource = !isInHouse;
                            const isStandard = partType.toLowerCase().includes('standard');
                            const hasRawMaterial = partDetail === 'WITH_RAW_MATERIAL';
                            const stockSourceType = part.part.raw_material_stock_details?.source_type || part.part.raw_material_unit_details?.source_type || null;
                            const isOrderStock = stockSourceType === 'order';
                            const canLinkMaterial = (isInHouse || (isOutsource && hasRawMaterial) || isStandard || (isOutsource && !hasRawMaterial) || isOrderStock);
                            
                            return (
                              <tr key={part.part.id} style={{ borderBottom: '1px solid #f0f0f0', backgroundColor: isLinked ? '#f6ffed' : '#fff' }}>
                                <td style={{ padding: '8px 4px', verticalAlign: 'top' }}>
                                  <div>
                                    <div style={{ fontWeight: '600', color: '#000', fontSize: '11px' }}>{part.part.part_number}</div>
                                    <div style={{ color: '#262626', fontSize: '10px' }}>
                                      {part.part.part_name.length > 15 ? part.part.part_name.substring(0, 15) + '...' : part.part.part_name}
                                    </div>
                                  </div>
                                </td>
                                <td style={{ padding: '8px 4px', verticalAlign: 'top' }}>
                                  <Tag 
                                    color={isInHouse ? 'blue' : isStandard ? 'green' : 'orange'} 
                                    style={{ fontSize: '9px', padding: '1px 4px', fontWeight: '600' }}
                                  >
                                    {partType.length > 8 ? partType.substring(0, 8) : partType}
                                  </Tag>
                                  {isOutsource && partDetail && (
                                    <div style={{ marginTop: '2px' }}>
                                      <Tag 
                                        color={partDetail === 'WITH_RAW_MATERIAL' ? 'green' : 'default'} 
                                        style={{ fontSize: '8px', padding: '1px 3px', fontWeight: '500' }}
                                      >
                                        {partDetail === 'WITH_RAW_MATERIAL' ? 'RM' : 'No RM'}
                                      </Tag>
                                    </div>
                                  )}
                                </td>
                                <td style={{ padding: '8px 4px', textAlign: 'center', verticalAlign: 'top' }}>
                                  <span style={{ fontSize: '11px', fontWeight: '600', color: '#000' }}>{part.part.qty}</span>
                                </td>
                                <td style={{ padding: '8px 4px', verticalAlign: 'top' }}>
                                  {(() => {
                                    const latestExtractedData = getLatestExtractedData(part.extracted_data);
                                    return latestExtractedData ? (
                                      <div style={{ fontSize: '9px', lineHeight: '1.3' }}>
                                        <div>
                                          <div style={{ color: '#000', fontWeight: '600' }}><span style={{ color: '#8c8c8c', fontWeight: 'normal' }}>Material: </span>{latestExtractedData.material || 'N/A'}</div>
                                          {latestExtractedData.stock_size && <div style={{ color: '#595959' }}><span style={{ color: '#8c8c8c', fontWeight: 'normal' }}>Stock Size: </span>{latestExtractedData.stock_size}</div>}
                                        </div>
                                      </div>
                                    ) : (
                                      <span style={{ fontSize: '9px', color: '#bfbfbf' }}>N/A</span>
                                    );
                                  })()}
                                </td>
                                <td style={{ padding: '8px 4px', verticalAlign: 'top' }}>
                                  {isLinked ? (
                                    <div>
                                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '2px' }}>
                                        <InboxOutlined style={{ color: '#52c41a', marginRight: '2px', fontSize: '10px' }} />
                                        <span style={{ fontWeight: '600', color: '#000', fontSize: '10px' }}>
                                          {linkedMaterialName?.length > 12 ? linkedMaterialName.substring(0, 12) + '...' : linkedMaterialName || 'N/A'}
                                        </span>
                                      </div>
                                      <div style={{ fontSize: '9px', lineHeight: '1.3' }}>
                                        <span style={{ color: '#595959' }}>{linkedMaterialFormType || 'Unknown'}</span>
                                        <span style={{ margin: '0 2px', color: '#d9d9d9' }}>|</span>
                                        <span style={{ color: '#1890ff', fontWeight: '500' }}>{linkedMaterialDimensions || '—'}</span>
                                        {linkedRequiredLength && (
                                          <>
                                            <span style={{ margin: '0 2px', color: '#d9d9d9' }}>|</span>
                                            <span style={{ color: '#fa8c16', fontWeight: '500' }}>{linkedRequiredLength}mm</span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <span style={{ fontSize: '9px', color: '#8c8c8c' }}>No Material Linked</span>
                                  )}
                                </td>
                                <td style={{ padding: '8px 4px', textAlign: 'center', verticalAlign: 'top' }}>
                                  <div style={{ display: 'flex', gap: '2px', justifyContent: 'center' }}>
                                    {canLinkMaterial && (
                                      <>
                                        {isLinked ? (
                                          <Tooltip title="Change Material">
                                            <Button 
                                              type="primary"
                                              size="small"
                                              icon={<EditOutlined />}
                                              disabled={isOrderStock || isStandard || (isOutsource && !hasRawMaterial)}
                                              onClick={() => handleLinkMaterial(part)}
                                              style={{ fontSize: '10px', height: '22px', width: '24px', padding: '0' }}
                                            />
                                          </Tooltip>
                                        ) : (
                                          <Tooltip title="Link Material">
                                            <Button 
                                              type="primary"
                                              size="small"
                                              icon={<LinkOutlined />}
                                              disabled={isOrderStock || isStandard || (isOutsource && !hasRawMaterial)}
                                              onClick={() => handleLinkMaterial(part)}
                                              style={{ fontSize: '10px', height: '22px', width: '24px', padding: '0' }}
                                            />
                                          </Tooltip>
                                        )}
                                        {isLinked && (
                                          <Tooltip title="Unlink Material">
                                            <Button 
                                              danger
                                              size="small"
                                              icon={<DisconnectOutlined />}
                                              disabled={isOrderStock || isStandard || (isOutsource && !hasRawMaterial)}
                                              onClick={() => handleUnlinkMaterial(part)}
                                              style={{ fontSize: '10px', height: '22px', width: '24px', padding: '0' }}
                                            />
                                          </Tooltip>
                                        )}
                                      </>
                                    )}
                                    <Tooltip title="View Details">
                                      <Button 
                                        type="primary"
                                        size="small"
                                        icon={<EyeOutlined />}
                                        onClick={() => handleViewPartDetails(part)}
                                        style={{ fontSize: '10px', height: '22px', width: '24px', padding: '0', backgroundColor: '#52c41a', borderColor: '#52c41a' }}
                                      />
                                    </Tooltip>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '40px' }}>
                        <Empty 
                          description="No parts found"
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  // Desktop Format
                  <div style={{ height: '570px', overflow: 'auto' }}>
                    {loading ? (
                      <div style={{ textAlign: 'center', padding: '20px' }}>
                        <Spin size="large" />
                      </div>
                    ) : filteredParts().length > 0 ? (
                      <div>
                        {/* Table Header */}
                        <div style={{ 
                          padding: '6px 12px', 
                          backgroundColor: '#fafafa', 
                          borderBottom: '2px solid #f0f0f0',
                          fontWeight: 'bold',
                          fontSize: '10px',
                          color: '#262626',
                          position: 'sticky',
                          top: 0,
                          zIndex: 10
                        }}>
                          <Row gutter={[4, 0]} align="middle">
                            <Col xs={24} sm={5} md={4} style={{ fontSize: '10px', fontWeight: 'bold' }}>
                              {window.innerWidth <= 768 ? 'Part' : 'Part / Name'}
                            </Col>
                            {window.innerWidth > 768 && <Col xs={24} sm={4} md={3} style={{ fontSize: '10px', fontWeight: 'bold' }}>Assembly</Col>}
                            <Col xs={24} sm={2} md={2} style={{ fontSize: '10px', fontWeight: 'bold' }}>Type</Col>
                            <Col xs={24} sm={1} md={1} style={{ fontSize: '10px', fontWeight: 'bold' }}>Qty</Col>
                            <Col xs={24} sm={4} md={5} style={{ fontSize: '10px', fontWeight: 'bold' }}>Extracted Raw materials</Col>
                            <Col xs={24} sm={5} md={6} style={{ fontSize: '10px', fontWeight: 'bold' }}>
                              {window.innerWidth <= 768 ? 'Material' : 'Assigned Material Details'}
                            </Col>
                            <Col xs={24} sm={3} md={3} style={{ fontSize: '10px', fontWeight: 'bold' }}>Actions</Col>
                          </Row>
                        </div>
                        {/* Table Rows */}
                        {filteredParts().map(part => renderPartCard(part))}
                      </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '40px' }}>
                      <Empty 
                        description="No parts found"
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                      />
                    </div>
                  )}
                </div>
              )}
              </>
            )}
          </Card>
        </Col>
      </Row>

      {/* Link Material Modal */}
      <Modal
        title={
          <Space>
            <LinkOutlined />
            <span>
              {selectedPart?.part?.raw_material_unit_id ? "Change Raw Material Unit" : "Assign Raw Material Unit to Part"}
            </span>
          </Space>
        }
        open={linkModalVisible}
        onOk={handleSaveLink}
        onCancel={() => {
          setLinkModalVisible(false);
          setSelectedPart(null);
          setSelectedStock(null);
          setSelectedProcessType(null);
          setSelectedMaterial(null);
          setSelectedFormType(null);
          setSelectedUnit(null);
          setRequiredLength(null);
          setAvailableUnits([]);
          setLengthError(null);
        }}
        width={800}
      >
        {selectedPart && (
          <div>
            {/* Part Information */}
            <Card size="small" style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
                <div>
                  <Text strong>Part Information:</Text>
                  <div style={{ marginTop: '8px' }}>
                    <Text>{selectedPart.part.part_number} - {selectedPart.part.part_name}</Text>
                    <br />
                    <Text type="secondary">Assembly: {selectedPart.path}</Text>
                    <br />
                    <Tag color={selectedPart.part.type_name?.toLowerCase().includes('in-house') ? 'blue' : 'orange'}>
                      {selectedPart.part.type_name}
                    </Tag>
                    <Text style={{ marginLeft: '8px' }}>Quantity: {selectedPart.part.qty}</Text>
                  </div>
                </div>
              </div>
            </Card>

            {/* Warning for existing assignment */}
            {selectedPart.part.raw_material_unit_id && (
              <Alert
                title="Warning"
                description={
                  <div>
                    This part is already assigned to unit with stock dimensions: {selectedPart.part.raw_material_stock_dimensions || selectedPart.part.raw_material_unit_details?.stock_dimensions || '—'}.
                    Selecting a new unit will replace the current assignment.
                    <br />
                   
                  </div>
                }
                type="warning"
                showIcon
                style={{ marginBottom: '16px' }}
              />
            )}

            {/* Step 1: Select Process Type */}
            <div style={{ marginBottom: '16px' }}>
              <Text strong>Step 1: Select Process Type</Text>
              <Select
                style={{ width: '100%', marginTop: '8px' }}
                placeholder="Select process type"
                value={selectedProcessType}
                onChange={(value) => {
                  setSelectedProcessType(value);
                  setSelectedMaterial(null);
                  setSelectedFormType(null);
                  setSelectedStock(null);
                }}
              >
                <Select.Option value="Forging">Forging</Select.Option>
                <Select.Option value="Barstocks">Barstocks</Select.Option>
                <Select.Option value="Casting">Casting</Select.Option>
              </Select>
            </div>

            {/* Step 2: Select Raw Material */}
            {selectedProcessType && (
              <div style={{ marginBottom: '16px' }}>
                <Text strong>Step 2: Select Raw Material</Text>
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
                  {[...new Set(generalStock.filter(s => s.process_type === selectedProcessType).map(s => s.material_id))].map(materialId => {
                    const material = rawMaterials.find(m => m.id === materialId);
                    return material ? (
                      <Select.Option key={material.id} value={material.id}>
                        {material.material_name}
                      </Select.Option>
                    ) : null;
                  })}
                </Select>
              </div>
            )}

            {/* Step 3: Select Form Type */}
            {selectedProcessType && selectedMaterial && (
              <div style={{ marginBottom: '16px' }}>
                <Text strong>Step 3: Select Form Type</Text>
                <Select
                  style={{ width: '100%', marginTop: '8px' }}
                  placeholder="Select form type"
                  value={selectedFormType}
                  onChange={(value) => {
                    setSelectedFormType(value);
                    setSelectedStock(null);
                  }}
                >
                  {[...new Set(generalStock.filter(s => s.material_id === selectedMaterial && s.process_type === selectedProcessType).map(s => s.form_type))].map(formType => (
                    <Select.Option key={formType} value={formType}>
                      {formType}
                    </Select.Option>
                  ))}
                </Select>
              </div>
            )}

            {/* Step 4: Select Stock */}
            {selectedProcessType && selectedMaterial && selectedFormType && (
              <div style={{ marginBottom: '16px' }}>
                <Text strong>Step 4: Select Stock</Text>
                <Select
                  style={{ width: '100%', marginTop: '8px' }}
                  placeholder="Select stock"
                  value={selectedStock?.id}
                  onChange={async (value) => {
                    const stock = generalStock.find(s => s.id === value);
                    setSelectedStock(stock);
                    setSelectedUnit(null);
                    setRequiredLength(null);
                    setLengthError(null);
                    if (stock) {
                      await fetchAvailableUnits(stock.id);
                    }
                  }}
                >
                  {generalStock
                    .filter(stock => stock.material_id === selectedMaterial && stock.form_type === selectedFormType && stock.process_type === selectedProcessType)
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

            {/* Step 4: Select Unit */}
            {selectedStock && (
              <div style={{ marginBottom: '16px' }}>
                <Text strong>Step 4: Select Unit (Rod/Sheet)</Text>
                {loadingUnits ? (
                  <div style={{ marginTop: '8px' }}>
                    <Spin size="small" /> Loading units...
                  </div>
                ) : availableUnits.length > 0 ? (
                  <Select
                    style={{ width: '100%', marginTop: '8px' }}
                    placeholder="Select a unit"
                    value={selectedUnit?.id}
                    onChange={(value) => {
                      const unit = availableUnits.find(u => u.id === value);
                      setSelectedUnit(unit);
                      setRequiredLength(null);
                      setLengthError(null);
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

            {/* Step 5: Enter Required Length */}
            {selectedUnit && (
              <div style={{ marginBottom: '16px' }}>
                <Text strong>Step 5: Enter Required Length (mm)</Text>
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

      {/* Order Requirements Display Modal */}
      <Modal
        title="Part Details & Requirements"
        open={showOrderRequirements}
        onCancel={() => {
          setShowOrderRequirements(false);
          setSelectedPart(null);
          setExternalDocument(null);
        }}
        footer={null}
        width="90%"
        style={{ maxWidth: 1200, top: 20 }}
        styles={{ body: { padding: '16px', maxHeight: '75vh', overflowY: 'auto' } }}
        destroyOnHidden
      >
        <OrderRequirementsDisplay 
          selectedOrder={selectedOrder}
          visible={showOrderRequirements}
          orderHierarchy={orderHierarchy}
          selectedPart={selectedPart}
          onDocumentPreview={handleDocumentPreview}
          onExternalDocumentPreview={handleExternalDocumentPreview}
          externalDocument={externalDocument}
        />
      </Modal>
    </div>
  );
};

export default LinkGeneralStockTab;
