import React, { useState, useEffect } from 'react';
import { Modal, Upload, Table, Button, message, Space, Input, Spin, Alert, Divider, Tag } from 'antd';
import { UploadOutlined, CloseOutlined, SaveOutlined, DeleteOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import { API_BASE_URL } from '../../../Config/auth.js';

const { Dragger } = Upload;

const ToolsBulkUpload = ({ visible, onCancel, onSuccess, selectedCategory = null, selectedSubCategory = null }) => {
  const [file, setFile] = useState(null);
  const [previewData, setPreviewData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [customColumns, setCustomColumns] = useState([]);
  const [customColumnsLoading, setCustomColumnsLoading] = useState(false);

  // Fetch custom columns when modal opens
  useEffect(() => {
    if (visible) {
      fetchCustomColumns();
    } else {
      setCustomColumns([]);
    }
  }, [visible, selectedCategory, selectedSubCategory]);

  const fetchCustomColumns = async () => {
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

      // Get category and sub-category IDs from tree
      const treeResponse = await fetch(`${API_BASE_URL}/tools-list/categories/tree`);
      if (!treeResponse.ok) {
        setCustomColumns([]);
        return;
      }

      const tree = await treeResponse.json();

      // Find the category and sub-category IDs from the tree
      let categoryId = null;
      let subCategoryId = null;

      if (selectedSubCategory) {
        // Find the category that contains this sub-category
        for (const cat of tree) {
          const subCat = cat.sub_categories.find(sc => sc.sub_category === selectedSubCategory);
          if (subCat) {
            categoryId = cat.id;
            subCategoryId = subCat.id;
            break;
          }
        }
      } else if (selectedCategory) {
        // Find the category ID
        const cat = tree.find(c => c.category === selectedCategory);
        if (cat) {
          categoryId = cat.id;
        }
      }

      // Filter columns based on category/sub-category
      const filteredColumns = allColumns.filter(col => {
        if (subCategoryId) {
          // Include columns for this sub-category OR for the parent category
          return col.sub_category_id === subCategoryId || col.category_id === categoryId;
        } else if (categoryId) {
          // Only category is selected, include columns for this category
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

  const handleDownloadTemplate = () => {
    const headers = [
      'Item Description',
      'Range',
      'Identification Code',
      'Make',
      'Quantity',
      'Location',
      'Gauge',
      'Remarks',
      'Amount',
      'Ref Ledger',
      'Type',
      'Category',
      'Sub Category',
    ];

    // Add custom column headers
    customColumns.forEach(col => {
      headers.push(col.column_name);
    });

    // Create a sample row
    const sampleRow = {
      'Item Description': 'Sample Tool',
      'Range': '0-100mm',
      'Identification Code': 'TOOL001',
      'Make': 'Brand Name',
      'Quantity': 10,
      'Location': 'Rack A1',
      'Gauge': 'Standard',
      'Remarks': 'Sample remarks',
      'Amount': '',
      'Ref Ledger': '',
      'Type': 'NON-CONSUMABLES',
      'Category': selectedCategory || 'Tools',
      'Sub Category': selectedSubCategory || '',
    };

    // Add empty values for custom columns
    customColumns.forEach(col => {
      sampleRow[col.column_name] = '';
    });

    const ws = XLSX.utils.json_to_sheet([headers, sampleRow], { skipHeader: true });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'Tools_Upload_Template.xlsx');
    message.success('Template downloaded successfully');
  };

  const handleFileUpload = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
        
        if (jsonData.length < 2) {
          message.error('File appears to be empty or has no data');
          return;
        }

        // Get headers from first row
        const headers = jsonData[0].map(h => (h || '').toString().trim().toLowerCase());

        // Map Excel columns to our schema
        const columnMap = {
          'item description': 'item_description',
          'item_description': 'item_description',
          'description': 'item_description',
          'range': 'range',
          'range / size': 'range',
          'range in mm': 'range',
          'identification code': 'identification_code',
          'identification_code': 'identification_code',
          'id code': 'identification_code',
          'code': 'identification_code',
          'make': 'make',
          'brand': 'make',
          'manufacturer': 'make',
          'quantity': 'quantity',
          'qty': 'quantity',
          'stock': 'quantity',
          'available': 'quantity',
          'total quantity': 'total_quantity',
          'total_quantity': 'total_quantity',
          'total': 'total_quantity',
          'location': 'location',
          'rack': 'location',
          'bin': 'location',
          'gauge': 'gauge',
          'size': 'gauge',
          'remarks': 'remarks',
          'remark': 'remarks',
          'note': 'remarks',
          'amount': 'amount',
          'price': 'amount',
          'cost': 'amount',
          'ref ledger': 'ref_ledger',
          'ref_ledger': 'ref_ledger',
          'reference': 'ref_ledger',
          'type': 'type',
          'category': 'category',
          'sub category': 'sub_category',
          'sub_category': 'sub_category',
        };

        // Add custom columns to the column map
        customColumns.forEach(col => {
          const columnNameLower = col.column_name.toLowerCase();
          columnMap[columnNameLower] = col.column_key;
        });

        // Convert data rows to objects
        const processedData = jsonData.slice(1).map((row, index) => {
          const obj = { id: index + 1 };
          headers.forEach((header, colIndex) => {
            const mappedKey = columnMap[header];
            if (mappedKey) {
              obj[mappedKey] = row[colIndex];
            }
          });
          return obj;
        }).filter(row => Object.keys(row).length > 1); // Filter out empty rows

        if (processedData.length === 0) {
          message.error('No valid data found in the file');
          return;
        }

        setPreviewData(processedData);
        setFile(file);
        
        // Check if category column exists in the file
        const hasCategoryColumn = processedData.some(row => row.category);
        if (!hasCategoryColumn && !selectedCategory) {
          message.warning('No category column found in file. Please select a category before uploading, or add a category column to your Excel file.');
        }
        
        message.success(`Loaded ${processedData.length} records from file`);
      } catch (error) {
        console.error('Error reading file:', error);
        message.error('Failed to read file. Please ensure it is a valid Excel file.');
      }
    };
    reader.readAsArrayBuffer(file);
    return false; // Prevent automatic upload
  };

  const handleCellEdit = (rowIndex, field, value) => {
    const newData = [...previewData];
    newData[rowIndex][field] = value;
    setPreviewData(newData);
  };

  const handleDeleteRow = (rowIndex) => {
    const newData = previewData.filter((_, index) => index !== rowIndex);
    setPreviewData(newData);
    message.success('Row deleted');
  };

  const handleSubmit = async () => {
    if (previewData.length === 0) {
      message.error('No data to upload');
      return;
    }

    // Validate that category is provided either from file or from selection
    const hasCategoryInData = previewData.some(row => row.category);
    if (!hasCategoryInData && !selectedCategory) {
      message.error('Category is required. Either select a category before uploading or include a category column in your Excel file.');
      return;
    }

    setUploading(true);
    try {
      // Convert to backend format - if category/sub-category are selected, use them
      const worksheet = XLSX.utils.json_to_sheet(previewData.map((row, index) => {
        const baseData = {
          'Item Description': row.item_description || '',
          'Range': row.range || '',
          'Identification Code': row.identification_code || '',
          'Make': row.make || '',
          'Quantity': row.quantity || 0,
          'Location': row.location || '',
          'Gauge': row.gauge || '',
          'Remarks': row.remarks || '',
          'Amount': row.amount || '',
          'Ref Ledger': row.ref_ledger || '',
          'Type': row.type || 'NON-CONSUMABLES',
          'Category': row.category || selectedCategory || '',
          'Sub Category': row.sub_category || selectedSubCategory || '',
        };

        // Add custom columns to the Excel data
        customColumns.forEach(col => {
          if (row[col.column_key] !== undefined && row[col.column_key] !== null && row[col.column_key] !== '') {
            baseData[col.column_name] = row[col.column_key];
          }
        });

        return baseData;
      }));
      
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Tools');
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      
      const formData = new FormData();
      formData.append('file', new File([blob], 'tools_upload.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));

      // Build URL with query parameters for category/sub-category
      let url = `${API_BASE_URL}/tools-list/upload-excel`;
      const params = new URLSearchParams();
      if (selectedCategory) params.append('category', selectedCategory);
      if (selectedSubCategory) params.append('sub_category', selectedSubCategory);
      if (params.toString()) url += `?${params.toString()}`;

      const response = await fetch(url, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Upload failed');
      }

      const result = await response.json();
      
      // Store the upload result for display
      setUploadResult(result);
      setShowResult(true);
      
      // Show summary message
      if (result.skipped_duplicates > 0) {
        message.warning(
          `Upload completed: ${result.processed_count} tools added, ${result.skipped_duplicates} duplicates skipped.`
        );
      } else {
        message.success(`Successfully uploaded ${result.processed_count} tools`);
      }
      
      onSuccess();
    } catch (error) {
      console.error('Upload error:', error);
      message.error('Upload failed: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleCancel = () => {
    setFile(null);
    setPreviewData([]);
    setUploadResult(null);
    setShowResult(false);
    onCancel();
  };

  const handleNewUpload = () => {
    setFile(null);
    setPreviewData([]);
    setUploadResult(null);
    setShowResult(false);
  };

  const columns = [
    {
      title: 'Item Description',
      dataIndex: 'item_description',
      key: 'item_description',
      width: 200,
      editable: true,
      render: (text, record, index) => (
        <Input
          value={text}
          onChange={(e) => handleCellEdit(index, 'item_description', e.target.value)}
          placeholder="Item Description"
        />
      ),
    },
    {
      title: 'Range',
      dataIndex: 'range',
      key: 'range',
      width: 120,
      editable: true,
      render: (text, record, index) => (
        <Input
          value={text}
          onChange={(e) => handleCellEdit(index, 'range', e.target.value)}
          placeholder="Range"
        />
      ),
    },
    {
      title: 'ID Code',
      dataIndex: 'identification_code',
      key: 'identification_code',
      width: 150,
      editable: true,
      render: (text, record, index) => (
        <Input
          value={text}
          onChange={(e) => handleCellEdit(index, 'identification_code', e.target.value)}
          placeholder="ID Code"
        />
      ),
    },
    {
      title: 'Make',
      dataIndex: 'make',
      key: 'make',
      width: 120,
      editable: true,
      render: (text, record, index) => (
        <Input
          value={text}
          onChange={(e) => handleCellEdit(index, 'make', e.target.value)}
          placeholder="Make"
        />
      ),
    },
    {
      title: 'Quantity',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
      editable: true,
      render: (text, record, index) => (
        <Input
          type="number"
          value={text}
          onChange={(e) => handleCellEdit(index, 'quantity', parseInt(e.target.value) || 0)}
          placeholder="Qty"
        />
      ),
    },
    {
      title: 'Location',
      dataIndex: 'location',
      key: 'location',
      width: 120,
      editable: true,
      render: (text, record, index) => (
        <Input
          value={text}
          onChange={(e) => handleCellEdit(index, 'location', e.target.value)}
          placeholder="Location"
        />
      ),
    },
    {
      title: 'Gauge',
      dataIndex: 'gauge',
      key: 'gauge',
      width: 120,
      editable: true,
      render: (text, record, index) => (
        <Input
          value={text}
          onChange={(e) => handleCellEdit(index, 'gauge', e.target.value)}
          placeholder="Gauge"
        />
      ),
    },
    {
      title: 'Remarks',
      dataIndex: 'remarks',
      key: 'remarks',
      width: 150,
      editable: true,
      render: (text, record, index) => (
        <Input
          value={text}
          onChange={(e) => handleCellEdit(index, 'remarks', e.target.value)}
          placeholder="Remarks"
        />
      ),
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      width: 100,
      editable: true,
      render: (text, record, index) => (
        <Input
          type="number"
          value={text}
          onChange={(e) => handleCellEdit(index, 'amount', parseFloat(e.target.value) || 0)}
          placeholder="Amount"
        />
      ),
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 150,
      editable: true,
      render: (text, record, index) => (
        <Input
          value={text || 'NON-CONSUMABLES'}
          onChange={(e) => handleCellEdit(index, 'type', e.target.value)}
          placeholder="Type"
        />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 80,
      fixed: 'right',
      render: (_, record, index) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => handleDeleteRow(index)}
          size="small"
        />
      ),
    },
  ];

  return (
    <Modal
      title="Bulk Upload Tools"
      open={visible}
      onCancel={handleCancel}
      width={1200}
      footer={
        showResult ? [
          <Button key="new" onClick={handleNewUpload}>
            Upload Another File
          </Button>,
          <Button key="close" type="primary" onClick={handleCancel}>
            Close
          </Button>,
        ] : [
          <Button key="cancel" onClick={handleCancel} disabled={uploading}>
            Cancel
          </Button>,
          <Button
            key="submit"
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSubmit}
            loading={uploading}
            disabled={previewData.length === 0}
          >
            Upload {previewData.length} Records
          </Button>,
        ]
      }
      destroyOnHidden
    >
      <div style={{ minHeight: 500 }}>
        {showResult && uploadResult ? (
          <div>
            {/* Upload Summary */}
            <Alert
              message="Upload Completed"
              description={
                <div>
                  <p style={{ margin: '8px 0' }}>
                    <strong>Total records in file:</strong> {previewData.length}
                  </p>
                  <p style={{ margin: '8px 0' }}>
                    <strong>Successfully added:</strong> <Tag color="success">{uploadResult.processed_count}</Tag>
                  </p>
                  <p style={{ margin: '8px 0' }}>
                    <strong>Duplicates skipped:</strong> <Tag color="warning">{uploadResult.skipped_duplicates}</Tag>
                  </p>
                  {uploadResult.message && (
                    <p style={{ margin: '8px 0', color: '#8c8c8c', fontSize: 12 }}>
                      {uploadResult.message}
                    </p>
                  )}
                </div>
              }
              type={uploadResult.skipped_duplicates > 0 ? 'warning' : 'success'}
              showIcon
              style={{ marginBottom: 16 }}
            />
            
            <Divider>Successfully Added Tools</Divider>
            
            <Table
              columns={columns.filter(col => col.key !== 'actions')}
              dataSource={uploadResult.tools}
              rowKey="id"
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50', '100'],
                showTotal: (total) => `Total ${total} records`,
              }}
              scroll={{ x: 1200, y: 400 }}
              size="small"
              bordered
            />
          </div>
        ) : !file ? (
          <div style={{ padding: '40px 0' }}>
            <div style={{ marginBottom: 16, textAlign: 'center' }}>
              <Button
                type="link"
                onClick={handleDownloadTemplate}
                style={{ fontSize: 14 }}
              >
                Download Excel Template (includes custom columns)
              </Button>
            </div>
            <Dragger
              accept=".xlsx,.xls"
              beforeUpload={handleFileUpload}
              showUploadList={false}
              style={{ padding: '40px' }}
            >
              <p className="ant-upload-drag-icon">
                <UploadOutlined style={{ fontSize: 48, color: '#1890ff' }} />
              </p>
              <p className="ant-upload-text" style={{ fontSize: 16, fontWeight: 600 }}>
                Click or drag Excel file to this area to upload
              </p>
              <p className="ant-upload-hint" style={{ fontSize: 13, color: '#8c8c8c' }}>
                Support for .xlsx and .xls files. The file should contain columns for:
                Item Description, Range, ID Code, Make, Quantity, Location, Gauge, Remarks, Amount, Type
                {customColumns.length > 0 && `, and custom columns: ${customColumns.map(c => c.column_name).join(', ')}`}
              </p>
            </Dragger>
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontWeight: 600, color: '#262626' }}>
                  File: {file.name}
                </span>
                <span style={{ marginLeft: 16, color: '#8c8c8c' }}>
                  {previewData.length} records loaded
                </span>
              </div>
              <Button
                type="text"
                danger
                icon={<CloseOutlined />}
                onClick={handleCancel}
              >
                Clear
              </Button>
            </div>
            <div style={{ marginBottom: 12, padding: 12, background: '#f6ffed', borderRadius: 8, border: '1px solid #b7eb8f' }}>
              <p style={{ margin: 0, fontSize: 13, color: '#389e0d' }}>
                <strong>Tip:</strong> You can edit any cell in the table below before uploading. Click on a cell to modify its value.
              </p>
            </div>
            <Table
              columns={columns}
              dataSource={previewData}
              rowKey="id"
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50', '100'],
                showTotal: (total) => `Total ${total} records`,
              }}
              scroll={{ x: 1200, y: 400 }}
              size="small"
              bordered
            />
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ToolsBulkUpload;
