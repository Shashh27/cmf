import React, { useEffect, useState } from 'react';
import { Form, Input, InputNumber, Button, Modal, message, Row, Col, Select, DatePicker } from 'antd';
import { API_BASE_URL } from '../../../Config/auth.js';
import dayjs from 'dayjs';

const { Option } = Select;
const { TextArea } = Input;

const ToolForm = ({ visible, onCancel, onSubmit, editingTool, selectedCategory, selectedSubCategory }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = React.useState(false);
  const [categoryValue, setCategoryValue] = useState(null);
  const [frequencyUnit, setFrequencyUnit] = useState(null);
  const [calibrationDueDate, setCalibrationDueDate] = useState(null);
  const [customColumns, setCustomColumns] = useState([]);
  const [customColumnsLoading, setCustomColumnsLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      // Check if editing an existing tool (has id) or creating new with context
      const isEditingExisting = editingTool && editingTool.id;

      if (isEditingExisting) {
        // Editing an existing tool
        const formValues = { ...editingTool };

        // Convert calibration_date string to dayjs object for DatePicker
        if (formValues.calibration_date) {
          formValues.calibration_date = dayjs(formValues.calibration_date);
        }

        // Parse calibration_frequency into value and unit
        if (formValues.calibration_frequency) {
          const freqParts = formValues.calibration_frequency.split(' ');
          if (freqParts.length === 2) {
            formValues.calibration_frequency_value = parseInt(freqParts[0]);
            formValues.calibration_frequency_unit = freqParts[1];
            setFrequencyUnit(freqParts[1]);
          }
        }

        // Set due date from backend response
        if (formValues.calibration_due_date) {
          setCalibrationDueDate(formValues.calibration_due_date);
        }

        // Add custom field values to form
        if (formValues.custom_fields && typeof formValues.custom_fields === 'object') {
          Object.keys(formValues.custom_fields).forEach(key => {
            formValues[key] = formValues.custom_fields[key];
          });
        }

        form.setFieldsValue(formValues);
        // Set category value for conditional rendering
        const category = editingTool?.category || editingTool?.category_name;
        setCategoryValue(category);

        // Fetch custom columns for editing
        if (editingTool.category_id || editingTool.sub_category_id) {
          fetchCustomColumns(editingTool.category_id, editingTool.sub_category_id);
        }
      } else {
        // New row - fetch custom columns based on selected category/sub-category
        form.resetFields();
        setCategoryValue(null);
        setFrequencyUnit(null);
        setCalibrationDueDate(null);
        setCustomColumns([]);

        // Fetch custom columns for new row
        if (selectedCategory || selectedSubCategory) {
          // Need to resolve category_id and sub_category_id from names
          const fetchIdsAndColumns = async () => {
            try {
              const treeResponse = await fetch(`${API_BASE_URL}/tools-list/categories/tree`);
              if (treeResponse.ok) {
                const tree = await treeResponse.json();
                let categoryId = null;
                let subCategoryId = null;

                if (selectedSubCategory) {
                  for (const cat of tree) {
                    const subCat = cat.sub_categories.find(sc => sc.sub_category === selectedSubCategory);
                    if (subCat) {
                      categoryId = cat.id;
                      subCategoryId = subCat.id;
                      break;
                    }
                  }
                } else if (selectedCategory) {
                  const cat = tree.find(c => c.category === selectedCategory);
                  if (cat) {
                    categoryId = cat.id;
                  }
                }

                if (categoryId || subCategoryId) {
                  fetchCustomColumns(categoryId, subCategoryId);
                }
              }
            } catch (error) {
              console.error('Failed to fetch category tree:', error);
            }
          };
          fetchIdsAndColumns();
        }
      }
    }
  }, [visible, editingTool, form, selectedCategory, selectedSubCategory]);

  // Function to calculate due date on client side
  const calculateDueDate = (calibrationDate, frequencyValue, frequencyUnit) => {
    if (!calibrationDate || !frequencyValue || !frequencyUnit) {
      setCalibrationDueDate(null);
      form.setFieldsValue({ calibration_due_date: '' });
      return;
    }

    const value = parseInt(frequencyValue);
    let dueDate = dayjs(calibrationDate);

    switch (frequencyUnit) {
      case 'days':
        dueDate = dueDate.add(value, 'day');
        break;
      case 'months':
        dueDate = dueDate.add(value, 'month');
        break;
      case 'years':
        dueDate = dueDate.add(value, 'year');
        break;
    }

    const formattedDate = dueDate.format('YYYY-MM-DD');
    setCalibrationDueDate(formattedDate);
    form.setFieldsValue({ calibration_due_date: formattedDate });
  };

  // Fetch custom columns for the selected category/sub-category
  const fetchCustomColumns = async (categoryId, subCategoryId) => {
    setCustomColumnsLoading(true);
    try {
      // Fetch all custom columns
      const response = await fetch(`${API_BASE_URL}/tools-list/custom-columns`);
      if (!response.ok) {
        setCustomColumns([]);
        return;
      }

      const responseData = await response.json();
      const allColumns = responseData.data || [];

      // Filter columns based on category/sub-category
      const filteredColumns = allColumns.filter(col => {
        if (subCategoryId) {
          // Include columns for this sub-category OR for the parent category
          return col.sub_category_id === subCategoryId || col.category_id === categoryId;
        } else if (categoryId) {
          // Only category is provided, include columns for this category
          return col.category_id === categoryId;
        }
        return false;
      });

      // Deduplicate columns by column_name (sub-category columns take precedence)
      const uniqueColumns = [];
      const seenNames = new Set();
      for (const col of filteredColumns) {
        const colNameLower = col.column_name.toLowerCase().trim();
        if (!seenNames.has(colNameLower)) {
          seenNames.add(colNameLower);
          uniqueColumns.push(col);
        }
      }

      setCustomColumns(uniqueColumns);
    } catch (error) {
      console.error('Failed to fetch custom columns:', error);
      setCustomColumns([]);
    } finally {
      setCustomColumnsLoading(false);
    }
  };

  // Fetch custom columns when category/sub-category changes
  useEffect(() => {
    if (visible && editingTool) {
      const categoryId = editingTool?.category_id;
      const subCategoryId = editingTool?.sub_category_id;
      if (categoryId || subCategoryId) {
        fetchCustomColumns(categoryId, subCategoryId);
      } else {
        setCustomColumns([]);
      }
    }
  }, [visible, editingTool]);

  // Set custom field values after custom columns are loaded
  useEffect(() => {
    if (visible && editingTool && customColumns.length > 0 && editingTool.custom_fields) {
      const formValues = {};
      customColumns.forEach(col => {
        const value = editingTool.custom_fields[col.column_key];
        if (value !== undefined && value !== null) {
          if (col.data_type === 'date') {
            formValues[col.column_key] = dayjs(value);
          } else {
            formValues[col.column_key] = value;
          }
        }
      });
      if (Object.keys(formValues).length > 0) {
        form.setFieldsValue(formValues);
      }
    }
  }, [customColumns, editingTool, visible, form]);

  const handleCalibrationDateChange = (date) => {
    const freqValue = form.getFieldValue('calibration_frequency_value');
    const freqUnit = form.getFieldValue('calibration_frequency_unit');
    calculateDueDate(date, freqValue, freqUnit);
  };

  const handleFrequencyValueChange = (e) => {
    const value = e.target.value;
    const calDate = form.getFieldValue('calibration_date');
    const freqUnit = form.getFieldValue('calibration_frequency_unit');
    calculateDueDate(calDate, value, freqUnit);
  };

  const handleFrequencyUnitChange = (unit) => {
    const calDate = form.getFieldValue('calibration_date');
    const freqValue = form.getFieldValue('calibration_frequency_value');
    calculateDueDate(calDate, freqValue, unit);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      // Convert DatePicker value to date-only string (YYYY-MM-DD)
      if (values.calibration_date) {
        values.calibration_date = values.calibration_date.format('YYYY-MM-DD');
      }

      // Combine calibration_frequency_value and unit into single string
      if (values.calibration_frequency_value && values.calibration_frequency_unit) {
        values.calibration_frequency = `${values.calibration_frequency_value} ${values.calibration_frequency_unit}`;
      }

      // Remove the separate value and unit fields
      delete values.calibration_frequency_value;
      delete values.calibration_frequency_unit;

      // Collect custom field values
      const customFields = {};
      customColumns.forEach(col => {
        const value = values[col.column_key];
        if (value !== undefined && value !== null && value !== '') {
          // Convert dayjs date to string for date fields
          if (col.data_type === 'date' && value && value.format) {
            customFields[col.column_key] = value.format('YYYY-MM-DD');
          } else {
            customFields[col.column_key] = value;
          }
        }
        delete values[col.column_key];
      });

      // Include category and sub_category in submission data
      const submissionData = {
        ...values,
        category: editingTool?.category || values.category,
        sub_category: editingTool?.sub_category || values.sub_category,
        total_quantity: editingTool?.id ?
          (values.total_quantity !== undefined ? values.total_quantity : editingTool.total_quantity) :
          values.total_quantity || values.quantity
      };

      // Add custom_fields if there are any
      if (Object.keys(customFields).length > 0) {
        submissionData.custom_fields = customFields;
      }
      
      if (editingTool?.id) {
        // Check if any changes were made
        const hasChanges = Object.keys(submissionData).some(key => {
          const originalValue = editingTool[key];
          const newValue = submissionData[key];
          
          // Handle undefined/null comparison
          if (originalValue === undefined || originalValue === null) {
            return newValue !== undefined && newValue !== null && newValue !== '';
          }
          if (newValue === undefined || newValue === null) {
            return originalValue !== undefined && originalValue !== null && originalValue !== '';
          }
          
          // Convert to string for comparison
          return String(originalValue) !== String(newValue);
        });
        
        if (!hasChanges) {
          message.info('No changes made to the tool');
          setLoading(false);
          return;
        }
        
        // Update existing tool
        const response = await fetch(`${API_BASE_URL}/tools-list/${editingTool.id}`, {
          method: 'PUT',
          headers: { 
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(submissionData)
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Failed to update tool');
        }
        
        message.success('Tool updated successfully');
      } else {
        // Create new tool
        const response = await fetch(`${API_BASE_URL}/tools-list/`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(submissionData)
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Failed to create tool');
        }
        
        message.success('Tool created successfully');
      }
      
      onSubmit(values);
      form.resetFields();
    } catch (error) {
      if (error.errorFields) {
        // Validation error
        return;
      }
      console.error('Failed to save tool:', error);
      message.error('Failed to save tool: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={editingTool?.id ? 'Edit Tool' : 'Create New Tool'}
      open={visible}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          Cancel
        </Button>,
        <Button key="submit" type="primary" loading={loading} onClick={handleSubmit}>
          {editingTool?.id ? 'Update' : 'Create'}
        </Button>,
      ]}
      width={800}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        name="toolForm"
      >
        {/* Hidden fields for category and sub_category */}
        <Form.Item name="category" hidden><Input /></Form.Item>
        <Form.Item name="sub_category" hidden><Input /></Form.Item>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="item_description"
              label="Item Description"
              rules={[
                { required: true, message: 'Please enter item description' },
                { max: 30, message: 'Item description cannot exceed 30 characters' }
              ]}
            >
              <Input placeholder="Enter item description" maxLength={30} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="range"
              label="Range (mm)"
              rules={[{ max: 10, message: 'Range cannot exceed 10 characters' }]}
            >
              <Input placeholder="Enter range (e.g., 0-150mm)" maxLength={10} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="identification_code"
              label="Identification Code"
              rules={[
                { required: true, message: 'Please enter identification code' },
                { max: 10, message: 'Identification code cannot exceed 10 characters' }
              ]}
            >
              <Input placeholder="Enter identification code" maxLength={10} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="make"
              label="Make"
              rules={[{ max: 20, message: 'Make cannot exceed 20 characters' }]}
            >
              <Input placeholder="Enter make/manufacturer" maxLength={20} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={6}>
            <Form.Item
              name="quantity"
              label="Available Qty"
              rules={[
                { required: true, message: 'Required' },
                {
                  validator: (_, value) => {
                    if (value === null || value === undefined || value < 0) {
                      return Promise.reject(new Error('Quantity must be greater than or equal to 0'));
                    }
                    const totalQty = form.getFieldValue('total_quantity');
                    if (value != null && totalQty != null && value > totalQty) {
                      return Promise.reject(new Error('Cannot exceed Total Qty'));
                    }
                    // Ensure at least one quantity is greater than 0
                    if (value === 0 && totalQty === 0) {
                      return Promise.reject(new Error('At least one quantity must be greater than 0'));
                    }
                    return Promise.resolve();
                  }
                }
              ]}
            >
              <InputNumber
                placeholder="Qty"
                style={{ width: '100%' }}
                min={0}
                max={9999999}
                precision={0}
                maxLength={7}
                onKeyPress={(event) => {
                  if (!/[0-9]/.test(event.key)) {
                    event.preventDefault();
                  }
                }}
              />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item
              name="total_quantity"
              label="Total Qty"
              rules={[
                { required: true, message: 'Required' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    const qty = getFieldValue('quantity');
                    if (value != null && qty != null && value < qty) {
                      form.validateFields(['quantity']);
                    }
                    // Ensure at least one quantity is greater than 0
                    if (value === 0 && qty === 0) {
                      return Promise.reject(new Error('At least one quantity must be greater than 0'));
                    }
                    return Promise.resolve();
                  },
                }),
              ]}
            >
              <InputNumber
                placeholder="Total"
                style={{ width: '100%' }}
                min={0}
                max={9999999}
                precision={0}
                maxLength={7}
                onKeyPress={(event) => {
                  if (!/[0-9]/.test(event.key)) {
                    event.preventDefault();
                  }
                }}
              />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item
              name="amount"
              label="Amount (₹)"
            >
              <InputNumber
                placeholder="Amount"
                style={{ width: '100%' }}
                min={0}
                max={9999999.99}
                step={0.01}
                precision={2}
                maxLength={10}
                onKeyPress={(event) => {
                  // Allow digits and one dot
                  const isDigit = /[0-9]/.test(event.key);
                  const isDot = event.key === '.';
                  const hasDot = (event.target.value || '').includes('.');
                  if (!isDigit && (!isDot || hasDot)) {
                    event.preventDefault();
                  }
                }}
              />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item
              name="type"
              label="Type"
            >
              <Select placeholder="Select type" allowClear>
                <Option value="CONSUMABLES">CONSUMABLES</Option>
                <Option value="NON-CONSUMABLES">NON-CONSUMABLES</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="location"
              label="Location"
              rules={[{ max: 30, message: 'Location cannot exceed 30 characters' }]}
            >
              <Input placeholder="Enter location" maxLength={30} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="gauge"
              label="Gauge"
              rules={[{ max: 30, message: 'Gauge cannot exceed 30 characters' }]}
            >
              <Input placeholder="Enter gauge specification" maxLength={30} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="ref_ledger"
              label="Reference Ledger"
              rules={[{ max: 30, message: 'Ref Ledger cannot exceed 30 characters' }]}
            >
              <Input placeholder="Enter reference ledger" maxLength={30} />
            </Form.Item>
          </Col>
        </Row>

        {/* Calibration fields - only show for Instruments category */}
        {categoryValue?.toLowerCase() === 'instruments' && (
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="calibration_date"
                label="Calibration Date"
              >
                <DatePicker 
                  style={{ width: '100%' }}
                  format="YYYY-MM-DD"
                  placeholder="Select calibration date"
                  onChange={handleCalibrationDateChange}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="calibration_frequency"
                label="Calibration Frequency"
                tooltip="Frequency for calibration (e.g., every 6 months, 1 year)"
              >
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Form.Item
                    name="calibration_frequency_value"
                    noStyle
                  >
                    <Input
                      type="text"
                      style={{ width: '100%' }}
                      placeholder="Enter value"
                      disabled={!frequencyUnit}
                      maxLength={frequencyUnit === 'days' ? 3 : 2}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (!/^\d*$/.test(value)) {
                          e.target.value = value.replace(/\D/g, '');
                          form.setFieldsValue({ calibration_frequency_value: e.target.value });
                          return;
                        }
                        if (value) {
                          const numValue = Number(value);
                          const maxValue = frequencyUnit === 'days' ? 365 : frequencyUnit === 'months' ? 24 : 10;
                          if (numValue > maxValue) {
                            form.setFieldsValue({ calibration_frequency_value: maxValue });
                          }
                        }
                        handleFrequencyValueChange(e);
                      }}
                    />
                  </Form.Item>
                  <Form.Item
                    name="calibration_frequency_unit"
                    noStyle
                  >
                    <Select
                      style={{ width: '120px' }}
                      placeholder="Unit"
                      onChange={(value) => {
                        setFrequencyUnit(value);
                        form.setFieldsValue({ calibration_frequency_value: null });
                        handleFrequencyUnitChange(value);
                      }}
                    >
                      <Select.Option value="days">Days</Select.Option>
                      <Select.Option value="months">Months</Select.Option>
                      <Select.Option value="years">Years</Select.Option>
                    </Select>
                  </Form.Item>
                </div>
                <div style={{ fontSize: '12px', color: '#8c8c8c', marginTop: '4px' }}>
                  {frequencyUnit === 'days' && 'Valid range: 1-365 days'}
                  {frequencyUnit === 'months' && 'Valid range: 1-24 months'}
                  {frequencyUnit === 'years' && 'Valid range: 1-10 years'}
                </div>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="calibration_due_date"
                label="Calibration Due Date"
              >
                <Input 
                  disabled
                  style={{ backgroundColor: '#f5f5f5' }}
                />
              </Form.Item>
            </Col>
          </Row>
        )}

        <Form.Item
          name="remarks"
          label="Remarks"
          rules={[{ max: 30, message: 'Remarks cannot exceed 30 characters' }]}
        >
          <TextArea
            rows={3}
            placeholder="Enter any additional remarks"
            maxLength={30}
            showCount
          />
        </Form.Item>

        {/* Custom Columns */}
        {customColumns.length > 0 && (
          <>
            <div style={{ margin: '16px 0', borderTop: '1px solid #f0f0f0' }}></div>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: '#262626' }}>
              Custom Fields
            </div>
            <Row gutter={16}>
              {customColumns.map((col) => (
                <Col span={12} key={col.id}>
                  <Form.Item
                    name={col.column_key}
                    label={col.column_name}
                    rules={col.is_required ? [{ required: true, message: `${col.column_name} is required` }] : []}
                  >
                    {col.data_type === 'text' && (
                      <Input placeholder={`Enter ${col.column_name}`} />
                    )}
                    {col.data_type === 'number' && (
                      <InputNumber
                        placeholder={`Enter ${col.column_name}`}
                        style={{ width: '100%' }}
                      />
                    )}
                    {col.data_type === 'date' && (
                      <DatePicker
                        style={{ width: '100%' }}
                        format="YYYY-MM-DD"
                        placeholder={`Select ${col.column_name}`}
                      />
                    )}
                    {col.data_type === 'boolean' && (
                      <Select placeholder={`Select ${col.column_name}`}>
                        <Option value={true}>Yes</Option>
                        <Option value={false}>No</Option>
                      </Select>
                    )}
                  </Form.Item>
                </Col>
              ))}
            </Row>
          </>
        )}
      </Form>
    </Modal>
  );
};

export default ToolForm;
