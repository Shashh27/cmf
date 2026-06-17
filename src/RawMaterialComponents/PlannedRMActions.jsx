import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth";
import { Button, Modal, Select, App, Spin, Tag, Typography, Space } from "antd";
import { LinkOutlined, ReloadOutlined, CheckCircleOutlined, CloseCircleOutlined, DisconnectOutlined, ShoppingCartOutlined } from "@ant-design/icons";

const { Text } = Typography;

const PlannedRMActions = ({ row, recommendations, isMobile, planningData, isSaved, materialExists, linkedStock, isProcured, updateLinkedStock, onRefresh }) => {
  const { message } = App.useApp();
  const [generalStock, setGeneralStock] = useState([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [linkModalVisible, setLinkModalVisible] = useState(false);
  const [selectedStock, setSelectedStock] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [loadingLink, setLoadingLink] = useState(false);
  const [stockUnits, setStockUnits] = useState({});
  const [loadingUnits, setLoadingUnits] = useState({});

  // Procurement states
  const [procureModalVisible, setProcureModalVisible] = useState(false);
  const [selectedProcessType, setSelectedProcessType] = useState(null);

  // Use a local copy of row to prevent mutations
  const rowData = useMemo(() => ({ ...row }), [row]);

  // Dispatch global event so PartsWithRawMaterialStatusTab (and any other listener) auto-refreshes
  const dispatchRMChanged = () => window.dispatchEvent(new Event('rawMaterialChanged'));

  // Get planned length from planningData
  const plannedLength = planningData?.[row.key]?.dimensions?.length || null;

  // Check if raw material is planned and saved
  const isMaterialPlanned = isSaved;

  // Check if material is already linked to general stock (from prop)
  const isAlreadyLinkedToGeneralStock = linkedStock?.sourceType === 'general';
  
  // Check if material is linked to order stock (procured)
  const isLinkedToOrderStock = linkedStock?.sourceType === 'order';

  // Get user ID from localStorage
  const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
  const userId = storedUser?.id;

  const fetchGeneralStock = async () => {
    try {
      setLoadingStock(true);
      const response = await axios.get(`${API_BASE_URL}/rawmaterials/stock/`, {
        params: {
          material_name: rowData.rmName,
          material_id: rowData.rmId,
          source_type: 'general'
        }
      });
      setGeneralStock(response.data || []);
    } catch (error) {
      message.error('Failed to fetch general stock');
    } finally {
      setLoadingStock(false);
    }
  };

  const fetchStockUnits = async (stockId) => {
    try {
      setLoadingUnits(prev => ({ ...prev, [stockId]: true }));
      const response = await axios.get(`${API_BASE_URL}/rawmaterials/stock/${stockId}/units`);
      setStockUnits(prev => ({ ...prev, [stockId]: response.data || [] }));
    } catch (error) {
    } finally {
      setLoadingUnits(prev => ({ ...prev, [stockId]: false }));
    }
  };

  const handleUnlinkStock = async (stockId = null, unitId = null) => {
    // Show confirmation dialog
    Modal.confirm({
      title: 'Confirm Unlink Stock',
      content: (
        <div>
          <p>Are you sure you want to unlink the stock unit from this part?</p>
        </div>
      ),
      okText: 'Yes, Unlink',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          setLoadingLink(true);
          await axios.put(`${API_BASE_URL}/parts/${rowData.partId}`, {
            raw_material_stock_id: null,
            raw_material_unit_id: null,
            raw_material_id: null,
            required_length: null
          });
          message.success('Stock unlinked successfully');
          setSelectedStock(null);
          setSelectedUnit(null);
          if (updateLinkedStock) updateLinkedStock(rowData.partId, null);
          fetchGeneralStock();
          dispatchRMChanged();
          if (onRefresh) onRefresh();
        } catch (error) {
          message.error('Failed to unlink stock');
        } finally {
          setLoadingLink(false);
        }
      }
    });
  };

  const handleLinkStock = async (stockId = null, unitId = null) => {
    const targetStockId = stockId || selectedStock;
    const targetUnitId = unitId || selectedUnit;
    
    if (!targetStockId) {
      message.warning('Please select a stock to link');
      return;
    }
    
    if (!targetUnitId) {
      message.warning('Please select a unit to link');
      return;
    }

    if (!plannedLength) {
      message.warning('Planned length is not available. Please save planned dimensions first.');
      return;
    }

    // Validate that planned length is not more than available stock length
    const unit = stockUnits[targetStockId]?.find(u => u.id === targetUnitId);
    if (unit && plannedLength > unit.remaining_length) {
      message.error(`Required length (${plannedLength}mm) exceeds available stock length (${unit.remaining_length}mm)`);
      return;
    }

    // Show confirmation dialog
    Modal.confirm({
      title: 'Confirm Link Stock',
      content: (
        <div>
          <p>Are you sure you want to link this stock unit to the part?</p>
          <p><strong>Required Length:</strong> {plannedLength} mm</p>
          <p><strong>Available Length:</strong> {unit?.remaining_length} mm</p>
        </div>
      ),
      okText: 'Yes, Link',
      okType: 'primary',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          setLoadingLink(true);
          await axios.post(`${API_BASE_URL}/rawmaterials/assign-material/`, null, {
            params: {
              unit_id: targetUnitId,
              part_id: rowData.partId,
              required_length: plannedLength,
              user_id: userId
            }
          });
          message.success('Stock linked successfully');
          setSelectedStock(null);
          setSelectedUnit(null);
          if (updateLinkedStock) updateLinkedStock(rowData.partId, { stockId: targetStockId, unitId: targetUnitId });
          fetchGeneralStock();
          dispatchRMChanged();
          if (onRefresh) onRefresh();
        } catch (error) {
          message.error('Failed to link stock');
        } finally {
          setLoadingLink(false);
        }
      }
    });
  };

  const handleOpenLinkModal = () => {
    setLinkModalVisible(true);
    fetchGeneralStock();
  };

  const handleOpenProcureModal = () => {
    setProcureModalVisible(true);
  };

  const getFormType = () => {
    const dimensions = planningData?.[row.key]?.dimensions || {};
    if (dimensions.diameter && dimensions.inner_diameter && dimensions.outer_diameter) {
      return 'Hollow';
    } else if (dimensions.breadth && dimensions.height) {
      return 'Square';
    } else if (dimensions.diameter) {
      return 'Round';
    }
    return 'Unknown';
  };

  const getDimensionsToShow = () => {
    const dimensions = planningData?.[row.key]?.dimensions || {};
    const showDiameter = dimensions.diameter !== undefined && dimensions.diameter !== null;
    const showLength = dimensions.length !== undefined && dimensions.length !== null;
    const showBreadth = dimensions.breadth !== undefined && dimensions.breadth !== null;
    const showHeight = dimensions.height !== undefined && dimensions.height !== null;
    const showInnerDiameter = dimensions.inner_diameter !== undefined && dimensions.inner_diameter !== null;
    const showOuterDiameter = dimensions.outer_diameter !== undefined && dimensions.outer_diameter !== null;

    return { showDiameter, showLength, showBreadth, showHeight, showInnerDiameter, showOuterDiameter };
  };

  const handleProcureConfirm = async () => {
    if (!selectedProcessType) {
      message.error('Please select a process type');
      return;
    }
    
    // Get planned dimensions and form type directly from planningData
    const dimensions = planningData?.[row.key]?.dimensions || {};
    const formType = planningData?.[row.key]?.formType || 'Round';
    
    try {
      setLoadingLink(true);
      
      // Call the auto-extract-process endpoint to create order material
      // Send form_type and dimensions directly to avoid re-parsing issues
      await axios.post(`${API_BASE_URL}/rawmaterials/auto-extract-process`, {
        part_id: rowData.partId,
        material_name: rowData.rmName,
        required_length: dimensions.length || plannedLength,
        process_type: selectedProcessType,
        user_id: userId,
        form_type: formType,
        dimensions: dimensions
      });
      
      message.success('Order material created successfully. Please go to Procurement tab to complete the procurement.');
      setProcureModalVisible(false);
      setSelectedProcessType(null);
      dispatchRMChanged();
      if (onRefresh) onRefresh();
    } catch (error) {
      message.error(error.response?.data?.detail || 'Failed to create order material');
    } finally {
      setLoadingLink(false);
    }
  };

  const handleStockClick = (stockId) => {
    setSelectedStock(stockId);
    if (!stockUnits[stockId]) {
      fetchStockUnits(stockId);
    }
  };

  // Fetch units for all stocks when they are loaded
  useEffect(() => {
    if (generalStock.length > 0) {
      generalStock.forEach(stock => {
        if (!stockUnits[stock.id]) {
          fetchStockUnits(stock.id);
        }
      });
    }
  }, [generalStock]);

  return (
    <div>
      {/* Recommended Stocks - only show if not already assigned and recommendations have available units */}
      {!linkedStock && recommendations && recommendations.length > 0 && generalStock.some(stock => 
        recommendations.some(rec => rec.stock_id === stock.id) && 
        (stockUnits[stock.id] || []).some(unit => unit.status !== 'exhausted')
      ) ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8 }}>
          <Text style={{ color: '#1890ff', fontSize: isMobile ? 9 : 11, fontWeight: 500 }}>
            Recommended Stocks:
          </Text>
          {recommendations.slice(0, 3).map((rec, idx) => (
            <div key={idx} style={{ fontSize: isMobile ? 8 : 9, color: '#666' }}>
              {rec.stock_size} (Score: {Math.round(rec.match_score * 100)}%)
            </div>
          ))}
          {recommendations.length > 3 && (
            <Text style={{ fontSize: isMobile ? 8 : 9, color: '#999' }}>
              +{recommendations.length - 3} more
            </Text>
          )}
        </div>
      ) : linkedStock ? (
        <Text style={{ color: '#52c41a', fontSize: isMobile ? 9 : 11, fontWeight: 500 }}>
          {isLinkedToOrderStock ? (linkedStock.orderStatus || 'Material procured') : 'Assigned to general stock'}
        </Text>
      ) : isSaved ? (
        <Text style={{ color: '#ff4d4f', fontSize: isMobile ? 9 : 11, fontWeight: 500 }}>No stock available</Text>
      ) : (
        <Text style={{ color: '#ccc', fontSize: isMobile ? 9 : 11 }}>Save to see recommendations</Text>
      )}

      {/* Link General Stock Button */}
      <Button
        size="small"
        type="dashed"
        icon={<LinkOutlined />}
        onClick={handleOpenLinkModal}
        disabled={!isMaterialPlanned || !materialExists || isLinkedToOrderStock}
        style={{ 
          fontSize: isMobile ? 8 : 10, 
          padding: isMobile ? '1px 4px' : '2px 8px',
          height: isMobile ? '20px' : '24px',
          marginTop: 4
        }}
      >
        Assign General Stock
      </Button>

      {/* Procure Raw Material Button */}
      <Button
        size="small"
        type="primary"
        icon={<ShoppingCartOutlined />}
        onClick={handleOpenProcureModal}
        disabled={!isMaterialPlanned || !materialExists || isAlreadyLinkedToGeneralStock || isLinkedToOrderStock}
        style={{ 
          fontSize: isMobile ? 8 : 10, 
          padding: isMobile ? '1px 4px' : '2px 8px',
          height: isMobile ? '20px' : '24px',
          marginTop: 4
        }}
      >
        Procure Raw Material
      </Button>

      {/* Link Stock Modal */}
      <Modal
        title={<span><LinkOutlined /> Assign General Stock</span>}
        open={linkModalVisible}
        onCancel={() => {
          setLinkModalVisible(false);
          setSelectedStock(null);
        }}
        footer={[
          <Button key="close" onClick={() => {
            setLinkModalVisible(false);
            setSelectedStock(null);
          }}>
            Close
          </Button>
        ]}
        width="90%"
        style={{ maxWidth: '900px', top: '3vh' }}
      >
        <div style={{ marginBottom: 16 }}>
          <Text strong>Material:</Text> <Text>{rowData.rmName}</Text>
        </div>
        <div style={{ marginBottom: 16 }}>
          <Text strong>Extracted Dimension:</Text> <Text>{rowData.dimension}</Text>
        </div>
        <div style={{ marginBottom: 16 }}>
          <Text strong>Planned Length (Required):</Text> <Text>{plannedLength ? `${plannedLength} mm` : 'Not planned'}</Text>
        </div>
        
        {/* Recommended Stocks Section - only show if not already assigned and recommendations have available units */}
        {!linkedStock && recommendations && recommendations.length > 0 && generalStock.some(stock => 
          recommendations.some(rec => rec.stock_id === stock.id) && 
          (stockUnits[stock.id] || []).some(unit => unit.status !== 'exhausted')
        ) && (
          <div style={{ marginBottom: 24, padding: '12px', backgroundColor: '#f0f8ff', borderRadius: '4px', border: '1px solid #b3d9ff' }}>
            <Text strong style={{ color: '#1890ff', fontSize: 12 }}>Recommended Stocks :</Text>
            <div style={{ marginTop: 8, maxHeight: '300px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, border: '1px solid #b3d9ff' }}>
                <thead style={{ backgroundColor: '#e6f7ff' }}>
                  <tr>
                    <th style={{ padding: '6px', border: '1px solid #b3d9ff', textAlign: 'left' }}>Stock ID</th>
                    <th style={{ padding: '6px', border: '1px solid #b3d9ff', textAlign: 'left' }}>Stock Size</th>
                    <th style={{ padding: '6px', border: '1px solid #b3d9ff', textAlign: 'left' }}>Match Score</th>
                  </tr>
                </thead>
                <tbody>
                  {recommendations.map((rec, idx) => (
                    <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? 'white' : '#f9f9f9' }}>
                      <td style={{ padding: '6px', border: '1px solid #b3d9ff' }}>{rec.stock_id}</td>
                      <td style={{ padding: '6px', border: '1px solid #b3d9ff' }}>{rec.stock_size}</td>
                      <td style={{ padding: '6px', border: '1px solid #b3d9ff' }}>
                        <Tag color="green" style={{ margin: 0 }}>{Math.round(rec.match_score * 100)}%</Tag>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        
        {/* Available General Stock Section */}
        <div>
          <Text strong>Available General Stock with Units:</Text>
          {loadingStock ? (
            <Spin style={{ marginLeft: 16 }} />
          ) : generalStock.length === 0 ? (
            <Text style={{ marginLeft: 16, color: '#999' }}>No general stock available</Text>
          ) : (
            <div style={{ marginTop: 8, maxHeight: '400px', overflowY: 'auto' }}>
              <table style={{ 
                width: '100%', 
                borderCollapse: 'collapse', 
                fontSize: 10,
                border: '1px solid #e0e0e0'
              }}>
                <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f5f5f5', zIndex: 1 }}>
                  <tr>
                    <th rowSpan={2} style={{ padding: '8px', border: '1px solid #e0e0e0', textAlign: 'left' }}>Stock ID</th>
                    <th rowSpan={2} style={{ padding: '8px', border: '1px solid #e0e0e0', textAlign: 'left' }}>Dimensions</th>
                    <th rowSpan={2} style={{ padding: '8px', border: '1px solid #e0e0e0', textAlign: 'left' }}>Process Type</th>
                    <th rowSpan={2} style={{ padding: '8px', border: '1px solid #e0e0e0', textAlign: 'left' }}>Form Type</th>
                    <th rowSpan={2} style={{ padding: '8px', border: '1px solid #e0e0e0', textAlign: 'left' }}>Available Qty</th>
                    <th colSpan={6} style={{ padding: '8px', border: '1px solid #e0e0e0', textAlign: 'left' }}>Units Details</th>
                  </tr>
                  <tr>
                    <th style={{ padding: '6px', border: '1px solid #e0e0e0', textAlign: 'left' }}>Unit ID</th>
                    <th style={{ padding: '6px', border: '1px solid #e0e0e0', textAlign: 'left' }}>Total Length (mm)</th>
                    <th style={{ padding: '6px', border: '1px solid #e0e0e0', textAlign: 'left' }}>Remaining Length (mm)</th>
                    <th style={{ padding: '6px', border: '1px solid #e0e0e0', textAlign: 'left' }}>Used Length (mm)</th>
                    <th style={{ padding: '6px', border: '1px solid #e0e0e0', textAlign: 'left' }}>Status</th>
                    <th style={{ padding: '6px', border: '1px solid #e0e0e0', textAlign: 'left' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {generalStock.map((stock) => {
                    const units = stockUnits[stock.id] || [];
                    const plannedDims = planningData?.[row.key]?.dimensions || {};
                    const plannedFormType = planningData?.[row.key]?.formType;

                    // Skip stocks whose cross-section is smaller than planned dimensions
                    if (plannedFormType === 'Round' && plannedDims.diameter) {
                      if ((stock.diameter || 0) < plannedDims.diameter) return null;
                    } else if (plannedFormType === 'Square' && (plannedDims.breadth || plannedDims.height)) {
                      if ((stock.breadth || 0) < (plannedDims.breadth || 0)) return null;
                      if ((stock.height || 0) < (plannedDims.height || 0)) return null;
                    } else if (plannedFormType === 'Pipe' && plannedDims.outer_diameter) {
                      if ((stock.outer_diameter || 0) < plannedDims.outer_diameter) return null;
                    }

                    // Filter units: exclude exhausted units and units with insufficient remaining length
                    const filteredUnits = units.filter(unit => {
                      if (linkedStock && linkedStock.unitId === unit.id) return true; // always show currently linked unit
                      if (unit.status === 'exhausted') return false;
                      if (plannedLength && unit.remaining_length < plannedLength) return false;
                      return true;
                    });
                    const hasFilteredUnits = filteredUnits.length > 0;
                    
                    // Skip stocks that have no available units
                    if (!hasFilteredUnits) return null;
                    
                    return (
                      <React.Fragment key={stock.id}>
                        {hasFilteredUnits ? (
                          filteredUnits.map((unit, idx) => (
                            <tr key={`${stock.id}-${unit.id}`} style={{ backgroundColor: idx % 2 === 0 ? 'white' : '#fafafa' }}>
                              {idx === 0 && (
                                <>
                                  <td rowSpan={filteredUnits.length} style={{ padding: '8px', border: '1px solid #e0e0e0', verticalAlign: 'top' }}>{stock.id}</td>
                                  <td rowSpan={filteredUnits.length} style={{ padding: '8px', border: '1px solid #e0e0e0', verticalAlign: 'top' }}>
                                    {stock.diameter ? `${stock.diameter}x${stock.length}` : 
                                     stock.breadth ? `${stock.breadth}x${stock.height}x${stock.length}` :
                                     stock.outer_diameter ? `${stock.outer_diameter}x${stock.inner_diameter}x${stock.length}` : 
                                     'N/A'}
                                  </td>
                                  <td rowSpan={filteredUnits.length} style={{ padding: '8px', border: '1px solid #e0e0e0', verticalAlign: 'top' }}>{stock.process_type}</td>
                                  <td rowSpan={filteredUnits.length} style={{ padding: '8px', border: '1px solid #e0e0e0', verticalAlign: 'top' }}>{stock.form_type}</td>
                                  <td rowSpan={filteredUnits.length} style={{ padding: '8px', border: '1px solid #e0e0e0', verticalAlign: 'top' }}>{stock.available_quantity || 0}</td>
                                </>
                              )}
                              <td style={{ padding: '6px', border: '1px solid #e0e0e0' }}>{unit.id}</td>
                              <td style={{ padding: '6px', border: '1px solid #e0e0e0' }}>{unit.total_length || 'N/A'}</td>
                              <td style={{ padding: '6px', border: '1px solid #e0e0e0' }}>{unit.remaining_length || 'N/A'}</td>
                              <td style={{ padding: '6px', border: '1px solid #e0e0e0' }}>
                                {(unit.total_length && unit.remaining_length) ? (unit.total_length - unit.remaining_length).toFixed(2) : 'N/A'}
                              </td>
                              <td style={{ padding: '6px', border: '1px solid #e0e0e0' }}>
                                <Tag color={unit.status === 'available' ? 'green' : unit.status === 'partially_used' ? 'orange' : 'red'} style={{ fontSize: 8, margin: 0 }}>
                                  {unit.status}
                                </Tag>
                                {unit.status === 'exhausted' && <span style={{ marginLeft: 4, color: '#999' }}> - Not available</span>}
                                {plannedLength && unit.remaining_length < plannedLength && <span style={{ marginLeft: 4, color: '#ff4d4f' }}> </span>}
                              </td>
                              <td style={{ padding: '6px', border: '1px solid #e0e0e0' }}>
                                <Space size="small">
                                  <Button
                                    size="small"
                                    type="primary"
                                    onClick={() => handleLinkStock(stock.id, unit.id)}
                                    disabled={unit.status === 'exhausted' || (plannedLength && unit.remaining_length < plannedLength) || (isAlreadyLinkedToGeneralStock && (!linkedStock || linkedStock.unitId !== unit.id))}
                                    style={{ fontSize: 9, padding: '1px 4px' }}
                                  >
                                    Assign
                                  </Button>
                                  <Button
                                    size="small"
                                    danger
                                    onClick={() => handleUnlinkStock(stock.id, unit.id)}
                                    disabled={!linkedStock || linkedStock.unitId !== unit.id}
                                    style={{ fontSize: 9, padding: '1px 4px' }}
                                  >
                                    Unassign
                                  </Button>
                                </Space>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr style={{ backgroundColor: 'white' }}>
                            <td style={{ padding: '8px', border: '1px solid #e0e0e0' }}>{stock.id}</td>
                            <td style={{ padding: '8px', border: '1px solid #e0e0e0' }}>
                              {stock.diameter ? `${stock.diameter}x${stock.length}` : 
                               stock.breadth ? `${stock.breadth}x${stock.height}x${stock.length}` :
                               stock.outer_diameter ? `${stock.outer_diameter}x${stock.inner_diameter}x${stock.length}` : 
                               'N/A'}
                            </td>
                            <td style={{ padding: '8px', border: '1px solid #e0e0e0' }}>{stock.process_type}</td>
                            <td style={{ padding: '8px', border: '1px solid #e0e0e0' }}>{stock.form_type}</td>
                            <td style={{ padding: '8px', border: '1px solid #e0e0e0' }}>{stock.available_quantity || 0}</td>
                            <td colSpan={6} style={{ padding: '8px', border: '1px solid #e0e0e0', textAlign: 'center', color: '#999' }}>
                              {loadingUnits[stock.id] ? <Spin size="small" /> : 'No units'}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        
        {selectedStock && (
          <div style={{ marginTop: 16, padding: '8px 12px', backgroundColor: '#f6ffed', borderRadius: '4px', border: '1px solid #b7eb8f' }}>
            <Text strong style={{ color: '#52c41a' }}>Selected Stock ID: {selectedStock}</Text>
          </div>
        )}
      </Modal>

      {/* Process Type Selection Modal for Procurement */}
      <Modal
        title={<span><ShoppingCartOutlined /> Order Raw Material</span>}
        open={procureModalVisible}
        onCancel={() => {
          setProcureModalVisible(false);
          setSelectedProcessType(null);
        }}
        onOk={handleProcureConfirm}
        okText="Continue to Procurement"
        cancelText="Cancel"
        width={500}
      >
        <div style={{ padding: '20px 0' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%', marginBottom: 16 }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #d9d9d9', padding: '8px', backgroundColor: '#fafafa', fontWeight: 'bold' }}>Material</th>
                <th style={{ border: '1px solid #d9d9d9', padding: '8px', backgroundColor: '#fafafa', fontWeight: 'bold' }}>Form Type</th>
                {getDimensionsToShow().showDiameter && <th style={{ border: '1px solid #d9d9d9', padding: '8px', backgroundColor: '#fafafa', fontWeight: 'bold' }}>Diameter</th>}
                {getDimensionsToShow().showLength && <th style={{ border: '1px solid #d9d9d9', padding: '8px', backgroundColor: '#fafafa', fontWeight: 'bold' }}>Length</th>}
                {getDimensionsToShow().showBreadth && <th style={{ border: '1px solid #d9d9d9', padding: '8px', backgroundColor: '#fafafa', fontWeight: 'bold' }}>Breadth</th>}
                {getDimensionsToShow().showHeight && <th style={{ border: '1px solid #d9d9d9', padding: '8px', backgroundColor: '#fafafa', fontWeight: 'bold' }}>Height</th>}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ border: '1px solid #d9d9d9', padding: '8px' }}>{rowData.rmName}</td>
                <td style={{ border: '1px solid #d9d9d9', padding: '8px' }}><Tag color="blue">{getFormType()}</Tag></td>
                {getDimensionsToShow().showDiameter && <td style={{ border: '1px solid #d9d9d9', padding: '8px' }}>{planningData?.[row.key]?.dimensions?.diameter} mm</td>}
                {getDimensionsToShow().showLength && <td style={{ border: '1px solid #d9d9d9', padding: '8px' }}>{planningData?.[row.key]?.dimensions?.length} mm</td>}
                {getDimensionsToShow().showBreadth && <td style={{ border: '1px solid #d9d9d9', padding: '8px' }}>{planningData?.[row.key]?.dimensions?.breadth} mm</td>}
                {getDimensionsToShow().showHeight && <td style={{ border: '1px solid #d9d9d9', padding: '8px' }}>{planningData?.[row.key]?.dimensions?.height} mm</td>}
              </tr>
              {(getDimensionsToShow().showInnerDiameter || getDimensionsToShow().showOuterDiameter) && (
                <tr>
                  <td style={{ border: '1px solid #d9d9d9', padding: '8px', backgroundColor: '#fafafa', fontWeight: 'bold' }} colSpan={2}>Additional Dimensions</td>
                  {getDimensionsToShow().showInnerDiameter && <td style={{ border: '1px solid #d9d9d9', padding: '8px', backgroundColor: '#fafafa', fontWeight: 'bold' }}>Inner Diameter</td>}
                  {getDimensionsToShow().showInnerDiameter && <td style={{ border: '1px solid #d9d9d9', padding: '8px' }} colSpan={getDimensionsToShow().showOuterDiameter ? 1 : 2}>{planningData?.[row.key]?.dimensions?.inner_diameter} mm</td>}
                  {getDimensionsToShow().showOuterDiameter && <td style={{ border: '1px solid #d9d9d9', padding: '8px', backgroundColor: '#fafafa', fontWeight: 'bold' }}>Outer Diameter</td>}
                  {getDimensionsToShow().showOuterDiameter && <td style={{ border: '1px solid #d9d9d9', padding: '8px' }}>{planningData?.[row.key]?.dimensions?.outer_diameter} mm</td>}
                </tr>
              )}
            </tbody>
          </table>
          <div style={{ marginBottom: 16 }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>Process Type:</Text>
            <Select
              style={{ width: '100%' }}
              placeholder="Select process type"
              value={selectedProcessType}
              onChange={setSelectedProcessType}
              options={[
                { label: 'Forging', value: 'Forging' },
                { label: 'Bar stocks', value: 'Bar stocks' },
                { label: 'Casting', value: 'Casting' }
              ]}
            />
          </div>
          <div style={{ marginTop: 20, padding: 12, backgroundColor: '#f0f8ff', borderRadius: 4, border: '1px solid #b3d9ff' }}>
            <Text style={{ fontSize: 12, color: '#1890ff' }}>
              After selecting process type, go to the Procurement tab to complete the procurement by linking vendors.
            </Text>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PlannedRMActions;
