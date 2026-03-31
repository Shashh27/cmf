import React, { useState, useEffect } from 'react';
import { Card, Tabs, Table, Tag, Button, Empty, Spin, Typography, Space, Modal, Form, Input, InputNumber, DatePicker, notification, Select } from 'antd';
import { FileTextOutlined, DownloadOutlined, ToolOutlined, HistoryOutlined, EyeOutlined } from '@ant-design/icons';
import axios from 'axios';
import { API_BASE_URL } from '../Config/auth';

const { TabPane } = Tabs;
const { Text, Title } = Typography;
const { TextArea } = Input;
const { Option } = Select;

const PartDocumentTab = ({ selectedJob }) => {
  const [loading, setLoading] = useState(false);
  const [partData, setPartData] = useState(null);
  const [selectedOperation, setSelectedOperation] = useState(null);
  const [activeTab, setActiveTab] = useState('operations');
  const [activeDocTab, setActiveDocTab] = useState('all');
  const [activeOpDocTab, setActiveOpDocTab] = useState('docs');

  // Preview Modal State
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);

  // Request Modal State
  const [isRequestModalVisible, setIsRequestModalVisible] = useState(false);
  const [selectedToolForRequest, setSelectedToolForRequest] = useState(null);
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestForm] = Form.useForm();
  const [orders, setOrders] = useState([]);
  const [parts, setParts] = useState([]);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/orders/`);
      if (response.status === 200) {
        setOrders(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    }
  };

  const fetchParts = async (saleOrderNumber) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/orders/sale-order/${saleOrderNumber}/parts`);
      if (response.status === 200) {
        const partsList = Array.isArray(response.data) ? response.data : (response.data.parts || []);
        setParts(partsList);
      }
    } catch (error) {
      console.error('Failed to fetch parts:', error);
      notification.error({ message: 'Failed to fetch parts' });
    }
  };

  useEffect(() => {
    const fetchOrderAndData = async () => {
      if (!selectedJob) return;

      let orderId = selectedJob.sale_order_id || selectedJob.order_id || selectedJob.id;
      const orderNumber = selectedJob.sale_order_number || selectedJob.production_order;

      // If we don't have an integer ID but have a number, try to find the ID
      if (!orderId && orderNumber) {
        try {
          const ordersRes = await axios.get(`${API_BASE_URL}/orders`);
          const matchingOrder = ordersRes.data.find(o => o.sale_order_number === orderNumber);
          if (matchingOrder) {
            orderId = matchingOrder.id;
          }
        } catch (err) {
          console.error('Error fetching orders to find ID:', err);
        }
      }

      if (orderId) {
        fetchPartData(orderId);
      }
    };

    fetchOrderAndData();
  }, [selectedJob]);

  const fetchPartData = async (orderId) => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/orders/${orderId}/hierarchical`);
      if (response.status === 200) {
        let relevantPart = null;
        const data = response.data;
        const partIdToFind = selectedJob.part_id || selectedJob.part_number;

        // The hierarchy is in data.product_hierarchy
        const hierarchy = data.product_hierarchy;
        if (hierarchy) {
          // 1. Search in direct_parts
          if (hierarchy.direct_parts) {
            for (const partDetail of hierarchy.direct_parts) {
              if (isMatchingPart(partDetail, partIdToFind)) {
                relevantPart = partDetail;
                break;
              }
            }
          }

          // 2. Search in assemblies if not found
          if (!relevantPart && hierarchy.assemblies) {
            for (const assembly of hierarchy.assemblies) {
              relevantPart = findPartInAssembly(assembly, partIdToFind);
              if (relevantPart) break;
            }
          }
        }

        setPartData(relevantPart);
        
        // Find if any operation matches the selectedJob's operation
        const partOps = relevantPart?.operations || relevantPart?.part_operations || relevantPart?.partOperations || [];
        if (partOps.length > 0) {
          let initialOp = partOps[0];
          
          if (selectedJob.operation_name || selectedJob.operation_number) {
            const matchedOp = partOps.find(op => 
              (selectedJob.operation_name && (op.operation_name === selectedJob.operation_name || op.name === selectedJob.operation_name)) ||
              (selectedJob.operation_number && (op.operation_number === selectedJob.operation_number || op.number === selectedJob.operation_number))
            );
            if (matchedOp) initialOp = matchedOp;
          }
          
          setSelectedOperation(initialOp);
        }
      }
    } catch (error) {
      console.error('Error fetching part data:', error);
    } finally {
      setLoading(false);
    }
  };

  const isMatchingPart = (partDetail, partIdOrNumber) => {
    if (!partDetail || !partDetail.part) return false;
    const p = partDetail.part;
    return (
      p.id == partIdOrNumber || 
      p.part_id == partIdOrNumber || 
      p.part_number == partIdOrNumber ||
      p.number == partIdOrNumber
    );
  };

  const findPartInAssembly = (assembly, partIdOrNumber) => {
    // Check parts in this assembly
    if (assembly.parts) {
      for (const partDetail of assembly.parts) {
        if (isMatchingPart(partDetail, partIdOrNumber)) {
          return partDetail;
        }
      }
    }

    // Check subassemblies
    if (assembly.subassemblies) {
      for (const sub of assembly.subassemblies) {
        const found = findPartInAssembly(sub, partIdOrNumber);
        if (found) return found;
      }
    }

    return null;
  };

  const toolColumns = [
    { 
      title: 'SL No', 
      key: 'sl_no', 
      width: 60,
      render: (_, __, index) => index + 1 
    },
    { 
      title: 'Tool Name', 
      key: 'tool_name', 
      render: (_, record) => record.tool?.item_description || record.item_description || '-' 
    },
    { 
      title: 'Range', 
      key: 'range', 
      render: (_, record) => record.tool?.range || record.range || '-' 
    },
    { 
      title: 'Type', 
      key: 'type', 
      render: (_, record) => record.tool?.type || record.type || '-' 
    },
    { 
      title: 'Available', 
      key: 'available_qty', 
      render: (_, record) => record.tool?.quantity ?? record.quantity ?? 0 
    },
    { 
      title: 'Action', 
      key: 'action', 
      render: (_, record) => (
        <Button 
          type="primary" 
          size="small" 
          onClick={() => handleShowRequestModal(record)}
          disabled={(record.tool?.quantity ?? record.quantity ?? 0) <= 0}
        >
          Request
        </Button>
      ) 
    },
  ];

  const rawMaterialColumns = [
    { title: 'Raw Material Name', dataIndex: 'raw_material_name', key: 'name' },
    { title: 'Raw Material Status', dataIndex: 'raw_material_status', key: 'status', render: (status) => <Tag color={status === 'Available' ? 'green' : 'red'}>{status}</Tag> },
  ];

  const operationColumns = [
    { 
      title: 'Operation Number', 
      key: 'op_num',
      render: (record) => record.operation_number || record.number || record.op_no || '-'
    },
    { 
      title: 'Operation Name', 
      key: 'op_name',
      render: (record) => record.operation_name || record.name || record.op_name || '-'
    },
    { 
      title: 'Work Center', 
      key: 'wc_name',
      render: (record) => record.work_center_name || record.work_center?.name || '-'
    },
    { 
      title: 'Duration (hrs)', 
      key: 'duration',
      render: (record) => record.duration_hours || record.duration || '-'
    },
  ];

  const allOperations = partData?.operations || partData?.part_operations || partData?.partOperations || [];
  
  // Filter operations to only show the one from selectedJob
  const operations = allOperations.filter(op => {
    // If no job is selected, show all operations
    if (!selectedJob) return true;
    
    // If we have no specific operation info in the job, show all operations
    if (!selectedJob.operation_name && !selectedJob.operation_number) return true;
    
    const opNameMatch = selectedJob.operation_name && (
      (op.operation_name && op.operation_name.toLowerCase() === selectedJob.operation_name.toLowerCase()) || 
      (op.name && op.name.toLowerCase() === selectedJob.operation_name.toLowerCase())
    );
    
    const opNumMatch = selectedJob.operation_number && (
      (op.operation_number && op.operation_number.toString() === selectedJob.operation_number.toString()) || 
      (op.number && op.number.toString() === selectedJob.operation_number.toString())
    );

    return opNameMatch || opNumMatch;
  });

  // If filtering resulted in nothing but we have operations, maybe fallback to all or keep empty?
  // The user says "only the perticular operation needs to be displayed", so if it's there, show only that.
  // If we can't find it, we might want to show all as a fallback or just empty. 
  // Given the requirement, showing empty if no match is found is safer to avoid confusion, 
  // but let's assume there's always a match if selectedJob is valid.
  
  const operationDocuments = selectedOperation?.documents || selectedOperation?.operation_documents || [];
  const partDocuments = partData?.documents || partData?.part_documents || [];
  
  // Raw materials and tools from PartDetails
  const rawMaterials = partData?.part?.raw_material_name ? [
    {
      raw_material_name: partData.part.raw_material_name,
      raw_material_status: partData.part.raw_material_status || 'N/A'
    }
  ] : [];
  
  const tools = selectedOperation?.tools || selectedOperation?.operation_tools || partData?.tools || [];

  const docTabs = [
    { key: 'all', label: 'All Documents' },
    { key: 'mpp', label: 'MPP' },
    { key: 'drawing', label: 'Drawing' },
    { key: '2d', label: '2D' },
    { key: '3d', label: '3D' },
    { key: 'cnc', label: 'CNC Program' },
  ];

  const handleShowRequestModal = (record) => {
    const tool = record.tool || record;
    setSelectedToolForRequest(tool);
    setIsRequestModalVisible(true);
    
    // Find the current order and fetch its parts
    const currentOrderId = selectedJob.sale_order_id || selectedJob.order_id || selectedJob.id;
    const currentOrder = orders.find(o => o.id === currentOrderId);
    
    if (currentOrder) {
      fetchParts(currentOrder.sale_order_number);
    } else if (selectedJob.sale_order_number || selectedJob.production_order) {
      // Fallback if currentOrder not in orders yet
      fetchParts(selectedJob.sale_order_number || selectedJob.production_order);
    }

    // Auto-fill fields from selectedJob and tool
    requestForm.setFieldsValue({
      project_id: currentOrderId,
      part_id: selectedJob?.part_id || selectedJob?.id,
      quantity: 1,
    });
  };

  const handleRequestSubmit = async (values) => {
    let operatorId = 0;
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        operatorId = user.id || 0;
      }
    } catch (e) {
      console.error('Error parsing user from local storage', e);
    }

    setRequestLoading(true);
    try {
      const payload = {
        tool_id: selectedToolForRequest?.id || 0,
        operator_id: operatorId,
        project_id: values.project_id,
        part_id: values.part_id,
        quantity: values.quantity,
        purpose_of_use: values.purpose_of_use || ""
      };

      const response = await axios.post(`${API_BASE_URL}/inventory-requests/`, payload);

      if (response.status === 200 || response.status === 201) {
        notification.success({
          message: 'Success',
          description: 'Request submitted successfully',
        });
        setIsRequestModalVisible(false);
        requestForm.resetFields();
      }
    } catch (error) {
      console.error('Error submitting tool request:', error);
      notification.error({
        message: 'Request Failed',
        description: error.response?.data?.detail || 'The quantity requested is more than available.',
      });
    } finally {
      setRequestLoading(false);
    }
  };

  const handleDownload = async (doc) => {
    if (!doc.document_url) return;
    
    try {
      const response = await fetch(doc.document_url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.document_name || doc.name || 'document.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
      // Fallback: open in new tab if fetch fails (e.g. CORS issues)
      window.open(doc.document_url, '_blank');
    }
  };

  const handlePreview = (doc) => {
    setPreviewDoc(doc);
    setIsPreviewVisible(true);
  };

  const renderDocuments = (docs, filter) => {
    const filtered = filter === 'all' ? docs : docs.filter(d => (d.document_type || d.type || '').toLowerCase().includes(filter));
    if (filtered.length === 0) return <Empty description="No documents found." />;

    return filtered.map((doc, i) => (
      <Card key={i} size="small" style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <FileTextOutlined style={{ color: '#1677FF' }} />
            <div>
              <Text strong>{doc.document_name || doc.name}</Text>
              <br />
              <Text type="secondary">Version: {doc.document_version || doc.version} • Format: {doc.format || 'PDF'}</Text>
            </div>
          </Space>
          <Space>
            <Tag color="blue">{doc.document_type || doc.tag || doc.type}</Tag>
            <Button 
              icon={<EyeOutlined />} 
              size="small" 
              type="text"
              onClick={() => handlePreview(doc)}
            />
            <Button 
              icon={<DownloadOutlined />} 
              size="small" 
              type="text"
              onClick={() => handleDownload(doc)}
            />
          </Space>
        </div>
      </Card>
    ));
  };

  return (
    <Card
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileTextOutlined style={{ color: '#1677FF' }} />
          <span>Documents</span>
        </div>
      }
      style={{ borderRadius: 16 }}
      headStyle={{ borderRadius: '16px 16px 0 0' }}
    >
      <Spin spinning={loading}>
        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <TabPane tab="Operations" key="operations">
            {operations.length > 0 ? (
              <Table
                dataSource={operations}
                columns={operationColumns}
                rowKey={(record) => record.operation_id || record.id || record.operation_number || record.number}
                onRow={(record) => ({
                  onClick: () => {
                    setSelectedOperation(record);
                    setActiveTab('op_documents');
                  },
                })}
                pagination={false}
                size="small"
                scroll={{ x: true }}
              />
            ) : (
              <Empty description="No operations found for this job." />
            )}
          </TabPane>

          <TabPane tab="Operation Documents" key="op_documents">
            {selectedOperation ? (
              <div>
                <Title level={5}>{selectedOperation.operation_name} - Documents</Title>
                <Tabs activeKey={activeOpDocTab} onChange={setActiveOpDocTab} size="small">
                  <TabPane tab="All Documents" key="docs">
                    {renderDocuments(operationDocuments, 'all')}
                  </TabPane>
                  <TabPane tab="Tools" key="tools">
                    <Table 
                      dataSource={tools} 
                      columns={toolColumns} 
                      rowKey={(record) => record.tool?.id || record.id} 
                      size="small" 
                      pagination={false} 
                      scroll={{ x: true }}
                    />
                  </TabPane>
                </Tabs>
              </div>
            ) : (
              <Empty description="Select an operation to view its documents." />
            )}
          </TabPane>

          <TabPane tab="Part Documents" key="part_documents">
            <Tabs activeKey={activeDocTab} onChange={setActiveDocTab} size="small">
              {docTabs.map(t => <TabPane tab={t.label} key={t.key} />)}
              <TabPane tab="Raw Materials" key="raw_materials" />
            </Tabs>
            <div style={{ marginTop: 16 }}>
              {activeDocTab === 'raw_materials' && (
                <Table 
                  dataSource={rawMaterials} 
                  columns={rawMaterialColumns} 
                  rowKey={(record) => record.raw_material_name} 
                  size="small" 
                  pagination={false} 
                />
              )}
              {docTabs.some(t => t.key === activeDocTab) && renderDocuments(partDocuments, activeDocTab)}
            </div>
          </TabPane>
        </Tabs>
      </Spin>

      <Modal
        title="Request Inventory"
        open={isRequestModalVisible}
        onCancel={() => {
          setIsRequestModalVisible(false);
          requestForm.resetFields();
        }}
        footer={null}
        maskClosable={false}
      >
        <Form form={requestForm} layout="vertical" onFinish={handleRequestSubmit}>
          <Form.Item
            name="project_id"
            label="Project"
            rules={[{ required: true, message: 'Please select a project' }]}
          >
            <Select
              disabled
              placeholder="Select a project"
              onChange={(value) => {
                const selectedOrder = orders.find(o => o.id === value);
                if (selectedOrder) fetchParts(selectedOrder.sale_order_number);
                requestForm.setFieldsValue({ part_id: undefined });
              }}
            >
              {orders.map(o => (
                <Option key={o.id} value={o.id}>{o.sale_order_number || `Order ${o.id}`}</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="part_id"
            label="Part"
            rules={[{ required: true, message: 'Please select a part' }]}
          >
            <Select disabled placeholder="Select a part">
              {parts.map(p => (
                <Option key={p.id} value={p.id}>{p.part_name || p.part_number}</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="quantity"
            label="Quantity"
            rules={[
              { required: true, message: 'Please enter quantity' },
              {
                validator(_, value) {
                  const available = selectedToolForRequest?.quantity ?? 0;
                  if (value && value > available) {
                    return Promise.reject(
                      new Error(`Available quantity: ${available}. You cannot request more than this.`)
                    );
                  }
                  return Promise.resolve();
                },
              },
            ]}
            extra={
              <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                Available quantity: {selectedToolForRequest?.quantity ?? 0}. You cannot request more than this.
              </span>
            }
          >
            <InputNumber
              min={1}
              style={{ width: '100%' }}
              precision={0}
              parser={value => value.replace(/[^\d]/g, '')}
              formatter={value => value ? String(value).replace(/[^\d]/g, '') : ''}
              onKeyDown={e => {
                if (!/^\d$/.test(e.key) && !['Backspace','Delete','ArrowLeft','ArrowRight','Tab'].includes(e.key)) {
                  e.preventDefault();
                }
              }}
            />
          </Form.Item>

          <Form.Item name="purpose_of_use" label="Purpose of Use">
            <TextArea rows={4} />
          </Form.Item>

          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => { setIsRequestModalVisible(false); requestForm.resetFields(); }}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit" loading={requestLoading}>
                Submit Request
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Preview Modal */}
      <Modal
        title={previewDoc?.document_name || previewDoc?.name || "Document Preview"}
        open={isPreviewVisible}
        onCancel={() => {
          setIsPreviewVisible(false);
          setPreviewDoc(null);
        }}
        footer={[
          <Button key="download" type="primary" icon={<DownloadOutlined />} onClick={() => handleDownload(previewDoc)}>
            Download
          </Button>,
          <Button key="close" onClick={() => setIsPreviewVisible(false)}>
            Close
          </Button>
        ]}
        width="80%"
        style={{ top: 20 }}
        bodyStyle={{ height: '70vh', padding: 0 }}
      >
        {previewDoc?.document_url ? (
          <iframe
            src={`${previewDoc.document_url}#toolbar=0`}
            title="PDF Preview"
            width="100%"
            height="100%"
            style={{ border: 'none' }}
          />
        ) : (
          <Empty description="No preview available" />
        )}
      </Modal>
    </Card>
  );
};

export default PartDocumentTab;
