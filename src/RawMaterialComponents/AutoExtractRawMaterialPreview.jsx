import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../Config/auth';
import {
  Modal, Button, Input, Select, InputNumber,
  Card, Tag, Space, Typography, Alert, Spin, Divider, Row, Col, App
} from 'antd';
import {
  ShoppingCartOutlined, CheckCircleOutlined,
  CloseCircleOutlined, InfoCircleOutlined
} from '@ant-design/icons';
import DimensionInputs, { handleInputKeyDown } from './DimensionInputs';

const { Text, Title } = Typography;
const { Option } = Select;

const AutoExtractRawMaterialPreview = ({
  visible,
  onCancel,
  part,
  extractedData,
  onSuccess,
  userId,
  rawMaterials: rawMaterialsProp
}) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [rawMaterials, setRawMaterials] = useState(rawMaterialsProp || []);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [materialNotFound, setMaterialNotFound] = useState(false);
  const [stockSize, setStockSize] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [requiredLength, setRequiredLength] = useState(null);

  // Sync rawMaterials state with prop
  useEffect(() => {
    setRawMaterials(rawMaterialsProp || []);
  }, [rawMaterialsProp]);
  
  // Individual dimension fields
  const [diameter, setDiameter] = useState(null);
  const [innerDiameter, setInnerDiameter] = useState(null);
  const [length, setLength] = useState(null);
  const [breadth, setBreadth] = useState(null);
  const [height, setHeight] = useState(null);
  
  // Auto-detected form and process types
  const [formType, setFormType] = useState('Round');
  const [processType, setProcessType] = useState('Barstocks');

  const processTypes = ['Forging', 'Barstocks', 'Casting'];
  const formTypes = ['Round', 'Square', 'Pipe'];

  // Parse stock size string to individual dimensions
  const parseStockSize = (stockSizeStr) => {
    if (!stockSizeStr) return;

    // Replace both "x" and "*" with standard separator
    const cleaned = stockSizeStr.toLowerCase().replace(/\s/g, '').replace(/\*/g, 'x');
    
    // Try format: CYLINDER 260(DIA) x 50(LENGTH) or similar
    if (cleaned.includes('(dia)') || cleaned.includes('(diameter)')) {
      // Extract diameter from (dia) or (diameter)
      const diaMatch = cleaned.match(/(\d+)\s*\(\s*dia(?:meter)?\s*\)/i);
      // Extract length from (length) or (len)
      const lenMatch = cleaned.match(/(\d+)\s*\(\s*len(?:gth)?\s*\)/i);
      
      if (diaMatch) {
        setDiameter(parseFloat(diaMatch[1]));
      }
      if (lenMatch) {
        setLength(parseFloat(lenMatch[1]));
      }
      
      // Auto-detect form type based on keyword
      if (cleaned.includes('cylinder') || cleaned.includes('round') || cleaned.includes('bar')) {
        setFormType('Round');
      } else if (cleaned.includes('pipe') || cleaned.includes('tube')) {
        setFormType('Pipe');
      } else if (cleaned.includes('square') || cleaned.includes('sheet') || cleaned.includes('plate')) {
        setFormType('Square');
      } else {
        setFormType('Round'); // Default to Round for cylinder
      }
      return;
    }
    
    // Try pipe format: 50/30x1000 or 50/30
    if (cleaned.includes('/')) {
      const parts = cleaned.split('/');
      if (parts.length >= 2) {
        const diam = parseFloat(parts[0]);
        const inner = parseFloat(parts[1]);
        let len = null;
        
        // Check if there's an x for length
        if (parts[1].includes('x')) {
          const innerParts = parts[1].split('x');
          setInnerDiameter(parseFloat(innerParts[0]));
          setLength(parseFloat(innerParts[1]));
        } else {
          setInnerDiameter(inner);
          // Check if there's length after the second /
          if (parts.length >= 3) {
            len = parseFloat(parts[2].replace('x', ''));
            setLength(len);
          }
        }
        
        setDiameter(diam);
        setFormType('Pipe');
        return;
      }
    }
    
    // Try 3-number format: 122 x 1165 x 1380 or 690*480*55
    const tripleMatch = cleaned.match(/^(\d+)x(\d+)x(\d+)$/);
    if (tripleMatch) {
      const values = [parseFloat(tripleMatch[1]), parseFloat(tripleMatch[2]), parseFloat(tripleMatch[3])];
      const values_sorted = [...values].sort((a, b) => a - b);
      
      // If the largest is significantly larger than the others, treat it as length (Square)
      if (values_sorted[2] > values_sorted[1] * 2) {
        setBreadth(values[0]);
        setHeight(values[1]);
        setLength(values[2]);
        setFormType('Square');
      } else {
        // Similar magnitudes - default to Square for 3 dimensions
        setBreadth(values[0]);
        setHeight(values[1]);
        setLength(values[2]);
        setFormType('Square');
      }
      return;
    }
    
    // Try round format: 50x1000
    const roundMatch = cleaned.match(/^(\d+)x(\d+)$/);
    if (roundMatch) {
      setDiameter(parseFloat(roundMatch[1]));
      setLength(parseFloat(roundMatch[2]));
      setFormType('Round');
      return;
    }
    
    // Single number - assume it's diameter (round bar)
    const singleMatch = cleaned.match(/^(\d+)$/);
    if (singleMatch) {
      setDiameter(parseFloat(singleMatch[1]));
      setFormType('Round');
    }
  };

  // Build stock size string from individual dimensions
  const buildStockSize = () => {
    if (formType === 'Pipe') {
      return diameter && innerDiameter && length 
        ? `${diameter}/${innerDiameter}x${length}`
        : diameter && innerDiameter 
        ? `${diameter}/${innerDiameter}`
        : '';
    } else if (formType === 'Square') {
      return breadth && height && length 
        ? `${breadth}x${height}x${length}`
        : '';
    } else if (formType === 'Round') {
      return diameter && length 
        ? `${diameter}x${length}`
        : diameter 
        ? `${diameter}`
        : '';
    }
    return '';
  };

  useEffect(() => {
    if (visible && extractedData) {
      resetForm();
      setStockSize(extractedData.stock_size || '');
      setQuantity(extractedData.quantity || 1);
      setRequiredLength(extractedData.required_length || null);
      parseStockSize(extractedData.stock_size || '');
      checkMaterial(extractedData.material);
    }
  }, [visible, extractedData]);

  useEffect(() => {
    if (!visible) {
      resetForm();
    }
  }, [visible]);

  const resetForm = () => {
    setSelectedMaterial(null);
    setMaterialNotFound(false);
    setStockSize('');
    setQuantity(1);
    setRequiredLength(null);
    setDiameter(null);
    setInnerDiameter(null);
    setLength(null);
    setBreadth(null);
    setHeight(null);
    setFormType('Round');
    setProcessType('Barstocks');
  };

  const checkMaterial = async (materialName) => {
    if (!materialName) {
      setMaterialNotFound(true);
      return;
    }

    const materials = rawMaterialsProp || [];
    const found = materials.find(m =>
      m.material_name.toLowerCase().includes(materialName.toLowerCase())
    );

    if (found) {
      setSelectedMaterial(found.id);
      setMaterialNotFound(false);
    } else {
      setMaterialNotFound(true);
    }
  };

  
  const handleMaterialChange = (value) => {
    setSelectedMaterial(value);
    // Don't set materialNotFound to false - keep the selection card visible
    // Stock check will only happen when user clicks Procure
  };

  const handleProcure = async () => {
    // Validate required length against dimension length
    const dimensionLength = length;
    if (requiredLength && dimensionLength && requiredLength > dimensionLength) {
      message.error(`Required length (${requiredLength}mm) cannot exceed dimension length (${dimensionLength}mm)`);
      return;
    }

    setLoading(true);
    try {
      const builtStockSize = buildStockSize();
      const response = await axios.post(`${API_BASE_URL}/rawmaterials/auto-extract-process`, {
        part_id: part.part.id,
        material_name: selectedMaterial ? rawMaterials.find(m => m.id === selectedMaterial)?.material_name : extractedData?.material,
        stock_size: builtStockSize,
        quantity: quantity,
        required_length: requiredLength,
        user_id: userId,
        process_type: processType
      });

      if (response.data.success) {
        message.success(response.data.message || 'Material processed successfully');
        // Trigger refresh event for Parts with Raw Material Status tab
        window.dispatchEvent(new Event('rawMaterialChanged'));
        onSuccess();
        onCancel();
      } else {
        message.error(response.data.message || 'Failed to process material');
      }
    } catch (error) {
      console.error('Error processing material:', error);
      message.error(error.response?.data?.detail || 'Failed to process material');
    } finally {
      setLoading(false);
    }
  };

  
  return (
    <App>
      <Modal
        open={visible}
        onCancel={onCancel}
        title={
        <Space>
          <InfoCircleOutlined />
          <span>Auto-Extract Raw Material</span>
        </Space>
      }
      width={600}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          Close
        </Button>,
        <Button
          key="procure"
          type="primary"
          loading={loading}
          onClick={handleProcure}
          disabled={materialNotFound && !selectedMaterial}
        >
          Procure
        </Button>
      ]}
    >
      <div style={{ padding: '16px 0' }}>
        {/* Part Information */}
        <Card size="small" style={{ marginBottom: '16px', backgroundColor: '#f5f5f5' }}>
          <Space orientation="vertical" size="small" style={{ width: '100%' }}>
            <div>
              <Text strong>Part:</Text>
              <Text style={{ marginLeft: '8px' }}>
                {part?.part?.part_number} - {part?.part?.part_name}
              </Text>
            </div>
            <div>
              <Text strong>Quantity:</Text>
              <Text style={{ marginLeft: '8px' }}>{part?.part?.qty}</Text>
            </div>
          </Space>
        </Card>

        {/* Extracted Data */}
        <Card size="small" title="Extracted Material Data" style={{ marginBottom: '16px' }}>
          <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            {/* Material Name */}
            <div>
              <Text strong>Material:</Text>
              <Text style={{ marginLeft: '8px', marginRight: '8px' }}>
                {extractedData?.material || 'N/A'}
              </Text>
              {materialNotFound && (
                <Tag color="warning" style={{ fontSize: '10px' }}>Not Found</Tag>
              )}
            </div>

            {/* Form Type and Process Type */}
            <Row gutter={16}>
              <Col span={12}>
                <div>
                  <Text strong style={{ display: 'block', marginBottom: '4px' }}>Form Type:</Text>
                  <Select
                    value={formType}
                    onChange={(value) => setFormType(value)}
                    style={{ width: '100%' }}
                    size="small"
                  >
                    {formTypes.map(ft => (
                      <Option key={ft} value={ft}>{ft}</Option>
                    ))}
                  </Select>
                </div>
              </Col>
              <Col span={12}>
                <div>
                  <Text strong style={{ display: 'block', marginBottom: '4px' }}>Process Type:</Text>
                  <Select
                    value={processType}
                    onChange={(value) => setProcessType(value)}
                    style={{ width: '100%' }}
                    size="small"
                  >
                    {processTypes.map(pt => (
                      <Option key={pt} value={pt}>{pt}</Option>
                    ))}
                  </Select>
                </div>
              </Col>
            </Row>

            {/* Dimension Fields based on Form Type */}
            <div style={{ backgroundColor: '#fafafa', padding: '12px', borderRadius: '4px' }}>
              <Text strong style={{ display: 'block', marginBottom: '8px', color: '#1890ff' }}>
                Dimensions (mm):
              </Text>
              
              {formType === 'Round' && (
                <Row gutter={16}>
                  <Col span={12}>
                    <div>
                      <Text style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Diameter:</Text>
                      <InputNumber
                        value={diameter}
                        onChange={(value) => setDiameter(value)}
                        placeholder="Diameter"
                        style={{ width: '100%' }}
                        size="small"
                        precision={0}
                        onKeyDown={handleInputKeyDown}
                        controls={false}
                      />
                    </div>
                  </Col>
                  <Col span={12}>
                    <div>
                      <Text style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Length:</Text>
                      <InputNumber
                        value={length}
                        onChange={(value) => setLength(value)}
                        placeholder="Length"
                        style={{ width: '100%' }}
                        size="small"
                        precision={0}
                        onKeyDown={handleInputKeyDown}
                        controls={false}
                      />
                    </div>
                  </Col>
                </Row>
              )}

              {formType === 'Square' && (
                <Row gutter={16}>
                  <Col span={8}>
                    <div>
                      <Text style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Breadth:</Text>
                      <InputNumber
                        value={breadth}
                        onChange={(value) => setBreadth(value)}
                        placeholder="Breadth"
                        style={{ width: '100%' }}
                        size="small"
                        precision={0}
                        onKeyDown={handleInputKeyDown}
                        controls={false}
                      />
                    </div>
                  </Col>
                  <Col span={8}>
                    <div>
                      <Text style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Height:</Text>
                      <InputNumber
                        value={height}
                        onChange={(value) => setHeight(value)}
                        placeholder="Height"
                        style={{ width: '100%' }}
                        size="small"
                        precision={0}
                        onKeyDown={handleInputKeyDown}
                        controls={false}
                      />
                    </div>
                  </Col>
                  <Col span={8}>
                    <div>
                      <Text style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Length:</Text>
                      <InputNumber
                        value={length}
                        onChange={(value) => setLength(value)}
                        placeholder="Length"
                        style={{ width: '100%' }}
                        size="small"
                        precision={0}
                        onKeyDown={handleInputKeyDown}
                        controls={false}
                      />
                    </div>
                  </Col>
                </Row>
              )}

              {formType === 'Pipe' && (
                <Row gutter={16}>
                  <Col span={8}>
                    <div>
                      <Text style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Outer Diameter:</Text>
                      <InputNumber
                        value={diameter}
                        onChange={(value) => setDiameter(value)}
                        placeholder="Outer Dia"
                        style={{ width: '100%' }}
                        size="small"
                      />
                    </div>
                  </Col>
                  <Col span={8}>
                    <div>
                      <Text style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Inner Diameter:</Text>
                      <InputNumber
                        value={innerDiameter}
                        onChange={(value) => setInnerDiameter(value)}
                        placeholder="Inner Dia"
                        style={{ width: '100%' }}
                        size="small"
                        precision={0}
                        onKeyDown={handleInputKeyDown}
                        controls={false}
                      />
                    </div>
                  </Col>
                  <Col span={8}>
                    <div>
                      <Text style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>Length:</Text>
                      <InputNumber
                        value={length}
                        onChange={(value) => setLength(value)}
                        placeholder="Length"
                        style={{ width: '100%' }}
                        size="small"
                        precision={0}
                        onKeyDown={handleInputKeyDown}
                        controls={false}
                      />
                    </div>
                  </Col>
                </Row>
              )}
            </div>

            {/* Generated Stock Size */}
            <div>
              <Text strong style={{ display: 'block', marginBottom: '4px' }}>Generated Stock Size:</Text>
              <Input
                value={buildStockSize()}
                readOnly
                style={{ backgroundColor: '#f0f0f0', fontFamily: 'monospace' }}
                size="small"
              />
            </div>

            {/* Quantity and Required Length */}
            <Row gutter={16}>
              <Col span={12}>
                <div>
                  <Text strong style={{ display: 'block', marginBottom: '4px' }}>Quantity:</Text>
                  <InputNumber
                    value={quantity}
                    onChange={(value) => setQuantity(value || 1)}
                    min={1}
                    style={{ width: '100%' }}
                    size="small"
                    precision={0}
                    onKeyDown={handleInputKeyDown}
                    controls={false}
                    disabled
                  />
                </div>
              </Col>
              <Col span={12}>
                <div>
                  <Text strong style={{ display: 'block', marginBottom: '4px' }}>Required Length (mm):</Text>
                  <InputNumber
                    value={requiredLength}
                    onChange={(value) => setRequiredLength(value)}
                    placeholder="Required length"
                    style={{ width: '100%' }}
                    size="small"
                    precision={0}
                    onKeyDown={handleInputKeyDown}
                    controls={false}
                  />
                </div>
              </Col>
            </Row>
          </Space>
        </Card>

        {/* Material Selection (if not found or manually selected) */}
        {(materialNotFound || selectedMaterial) && (
          <Card size="small" title="Select Material" style={{ marginBottom: '16px' }}>
            <Space orientation="vertical" size="small" style={{ width: '100%' }}>
              {materialNotFound && (
                <Alert
                  title="Material not found in database"
                  description="Please select an existing material from the list below"
                  type="warning"
                  showIcon
                  style={{ marginBottom: '8px' }}
                />
              )}
              <Select
                value={selectedMaterial}
                onChange={handleMaterialChange}
                placeholder="Select a material"
           
                style={{ width: '100%' }}
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
            </Space>
          </Card>
        )}
      </div>
    </Modal>
    </App>
  );
};

export default AutoExtractRawMaterialPreview;
