import React, { useState, useEffect } from 'react';
import { Card, Tabs, Table, Tag, Button, Empty, Spin, Typography, Space, Modal, Form, Input, InputNumber, DatePicker, notification, Select, message, Tooltip, Alert, Row, Col, Divider, Upload, Popconfirm } from 'antd';
import { FileTextOutlined, EyeOutlined, CheckCircleOutlined, PlusCircleOutlined, ReloadOutlined, UploadOutlined, DeleteOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { SCHEDULING_API_BASE_URL } from '../Config/schedulingconfig';
import ModelViewer3D from './ModelViewer3D';
import OperationChecklist from './OperationChecklist';
import { api } from '../api/client.js';
import DocumentPreviewer from './Document Components/DocumentPreviewer';


const { TabPane } = Tabs;
const { Text, Title } = Typography;
const { TextArea } = Input;
const { Option } = Select;

const getInventoryToolId = (record) => {
  if (record?.tool?.id != null) return record.tool.id;
  if (record?.tool_id != null) return record.tool_id;
  return record?.id;
};

const getBaseToolQuantity = (record) => record?.tool?.quantity ?? record?.quantity ?? 0;

const getAvailableToolQuantity = (record, pendingQtyByToolId = {}) => {
  const toolId = getInventoryToolId(record);
  const pending = pendingQtyByToolId[toolId] || 0;
  return Math.max(0, getBaseToolQuantity(record) - pending);
};

const PartDocumentTab = ({ selectedJob, isActivated, onActivate, completedQuantity = 0, productionStats: propStats, onProductionSubmit }) => {
  const [loading, setLoading] = useState(false);
  const [partData, setPartData] = useState(null);
  const [selectedOperation, setSelectedOperation] = useState(null);
  const [activeTab, setActiveTab] = useState('operations');
  const [activeDocTab, setActiveDocTab] = useState('all');
  const [activeOpDocTab, setActiveOpDocTab] = useState('docs');
  const [activating, setActivating] = useState(false);

  // True only when THIS job's status is IN-PROGRESS (from API) or just activated

  const [justActivated, setJustActivated] = useState(false);
  const [sessionActivationTime, setSessionActivationTime] = useState(null);
  const [liveOpDocs, setLiveOpDocs] = useState([]);
  const [opDocsReady, setOpDocsReady] = useState(false);
  const [uploadFileList, setUploadFileList] = useState([]);
  const [uploading, setUploading] = useState(false);

  // Preview Modal State

  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);

  // Request Modal State

  const [isRequestModalVisible, setIsRequestModalVisible] = useState(false);
  const [selectedToolForRequest, setSelectedToolForRequest] = useState(null);
  const [selectedToolRecord, setSelectedToolRecord] = useState(null);
  const [pendingQtyByToolId, setPendingQtyByToolId] = useState({});
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestForm] = Form.useForm();
  
  // Complete Modal State
  const [isCompleteModalVisible, setIsCompleteModalVisible] = useState(false);
  const [completingOp, setCompletingOp] = useState(null);
  const [completeLoading, setCompleteLoading] = useState(false);
  const [completeForm] = Form.useForm();
  const watchedProduced = Form.useWatch('produced_quantity', completeForm);
  const watchedRework = Form.useWatch('rework_submit_quantity', completeForm);
  const totalPresented =
    (parseInt(watchedProduced, 10) || 0) + (parseInt(watchedRework, 10) || 0);

  // Activate Confirmation Modal State
  const [isActivateModalVisible, setIsActivateModalVisible] = useState(false);
  const [operationToActivate, setOperationToActivate] = useState(null);

  // Poka-Yoke Checklist State
  const [isChecklistVisible, setIsChecklistVisible] = useState(false);
  const [checklistOperationId, setChecklistOperationId] = useState(null);
  const [submissionStatuses, setSubmissionStatuses] = useState({});
  const [checklistAssigned, setChecklistAssigned] = useState({});

  const [orders, setOrders] = useState([]);
  const [parts, setParts] = useState([]);
  const [requestOperations, setRequestOperations] = useState([]);
  const [productionStats, setProductionStats] = useState({
    totalProduced: 0,
    totalRework: 0,
    totalApproved: 0,
    hasRework: false,
    reworkRemarks: '',
    operatorStatus: null
  });

  // Dashboard is the single source of truth for production-logs.
  // propStats is always passed from Dashboard — PartDocumentTab never fetches independently.
  const effectiveStats = propStats || productionStats;

  // ── Reset justActivated and production stats whenever the selected job changes ──

  useEffect(() => {
    setJustActivated(false);
    setSessionActivationTime(null);
    setProductionStats({ totalProduced: 0, totalRework: 0, totalApproved: 0, hasRework: false, reworkRemarks: '', operatorStatus: null });
    setLiveOpDocs([]);
    setOpDocsReady(false);
    setUploadFileList([]);
  }, [selectedJob?.schedule_id]);

  useEffect(() => {
    if (partData) {
      fetchSubmissionStatuses();
      fetchPendingToolQuantities();
    }
  }, [partData]);

  const fetchPendingToolQuantities = async () => {
    try {
      const response = await api.get(`/inventory-requests/`);
      if (response.status === 200) {
        const map = {};
        (response.data || []).forEach((req) => {
          if ((req.status || '').toLowerCase() === 'pending' && req.tool_id) {
            map[req.tool_id] = (map[req.tool_id] || 0) + (req.quantity || 0);
          }
        });
        setPendingQtyByToolId(map);
      }
    } catch (error) {
      console.error('Failed to fetch pending tool requests:', error);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────

  // The ONLY check for whether this operation is active:
  // 1. The API already returned status IN-PROGRESS for this job, OR
  // 2. The user just clicked Activate in this session (justActivated flag)
  const effectivelyActivated =
    isActivated ||
    justActivated ||
    [selectedJob?.status, selectedJob?.operation_status, effectiveStats?.operatorStatus].some(s => {
      const up = s?.toString().toUpperCase();
      return up === 'INPROGRESS' || up === 'IN-PROGRESS' || up === 'IN PROGRESS';
    });
  const isActivationBlocked = Array.isArray(selectedJob?.blocked_by) && selectedJob.blocked_by.length > 0;
  const activationBlockReason = selectedJob?.block_reason || 'This operation cannot be activated until prior operations are completed.';



  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const response = await api.get(`/orders/`);
      if (response.status === 200) {
        setOrders(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    }
  };

  const fetchParts = async (saleOrderNumber) => {
    try {
      const response = await api.get(`/orders/sale-order/${saleOrderNumber}/parts`);
      if (response.status === 200) {
        const partsList = Array.isArray(response.data) ? response.data : (response.data.parts || []);
        setParts(partsList);
      }
    } catch (error) {
      console.error('Failed to fetch parts:', error);
      notification.error({ message: 'Failed to fetch parts' });
    }
  };

  const fetchOperations = async (partId) => {
    if (!partId) {
      setRequestOperations([]);
      return;
    }
    try {
      const response = await api.get(`/operations/part/${partId}`);
      if (response.status === 200) {
        setRequestOperations(Array.isArray(response.data) ? response.data : []);
      }
    } catch (error) {
      console.error('Failed to fetch operations:', error);
      notification.error({ message: 'Failed to fetch operations' });
      setRequestOperations([]);
    }
  };

  useEffect(() => {
    const fetchOrderAndData = async () => {
      if (!selectedJob) return;

      let orderId = selectedJob.sale_order_id || selectedJob.order_id || selectedJob.id;
      const orderNumber = selectedJob.sale_order_number || selectedJob.production_order;

      if (!orderId && orderNumber) {
        try {
          const ordersRes = await api.get(`/orders`);
          const matchingOrder = ordersRes.data.find(o => o.sale_order_number === orderNumber);
          if (matchingOrder) orderId = matchingOrder.id;
        } catch (err) {
          console.error('Error fetching orders to find ID:', err);
        }
      }

      if (orderId) {
        fetchPartData(orderId);
        // Production stats are fetched by Dashboard and passed via propStats — no call here.
      }
    };


    fetchOrderAndData();
  }, [selectedJob]);



  const fetchPartData = async (orderId) => {
    setLoading(true);
    try {
      const response = await api.get(`/orders/${orderId}/hierarchical`);
      if (response.status === 200) {
        let relevantPart = null;
        const data = response.data;
        const partIdToFind = selectedJob.part_id || selectedJob.part_number;
        const hierarchy = data.product_hierarchy;

        if (hierarchy) {
          if (hierarchy.direct_parts) {
            for (const partDetail of hierarchy.direct_parts) {
              if (isMatchingPart(partDetail, partIdToFind)) { relevantPart = partDetail; break; }
            }
          }

          if (!relevantPart && hierarchy.assemblies) {
            for (const assembly of hierarchy.assemblies) {
              relevantPart = findPartInAssembly(assembly, partIdToFind);
              if (relevantPart) break;
            }
          }
        }

        setPartData(relevantPart);

        const partOps = relevantPart?.operations || relevantPart?.part_operations || relevantPart?.partOperations || [];
        if (partOps.length > 0) {
          let initialOp = partOps[0];
          if (selectedJob.operation_name || selectedJob.operation_number) {
            const matchedOp = partOps.find(op => {
              const opNameMatch = selectedJob.operation_name && (op.operation_name === selectedJob.operation_name || op.name === selectedJob.operation_name);
              const opNumMatch = selectedJob.operation_number && (op.operation_number === selectedJob.operation_number || op.number === selectedJob.operation_number);
              
              // If both are provided, both must match for precise identification
              if (selectedJob.operation_name && selectedJob.operation_number) {
                return opNameMatch && opNumMatch;
              }
              // If only operation_number is provided, match by number (more specific)
              if (selectedJob.operation_number) {
                return opNumMatch;
              }
              // If only operation_name is provided, match by name
              return opNameMatch;
            });

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

  const getSelectedOperationId = () =>
    selectedOperation?.id || selectedJob?.operation_id || null;

  const fetchOpDocuments = async (opId) => {
    if (!opId) {
      setLiveOpDocs([]);
      setOpDocsReady(false);
      return;
    }
    try {
      const res = await api.get(`/operation-documents/operation/${opId}`);
      setLiveOpDocs(Array.isArray(res.data) ? res.data : []);
      setOpDocsReady(true);
    } catch (error) {
      console.error('Error fetching operation documents:', error);
      setOpDocsReady(false);
    }
  };

  useEffect(() => {
    fetchOpDocuments(getSelectedOperationId());
  }, [selectedOperation?.id, selectedJob?.operation_id]);

  const getCurrentUserId = () => {
    try {
      const stored = localStorage.getItem('user');
      if (!stored) return null;
      const u = JSON.parse(stored);
      return u?.id ?? null;
    } catch {
      return null;
    }
  };

  const handleOperatorUpload = async () => {
    const opId = getSelectedOperationId();
    if (!selectedJob || !opId) {
      message.warning('Select a job card first');
      return;
    }
    if (!uploadFileList.length) {
      message.warning('Please select files to upload');
      return;
    }
    const fd = new FormData();
    fd.append('operation_id', String(opId));
    uploadFileList.forEach((item) => {
      const file = item.originFileObj || item;
      if (file) fd.append('files', file);
    });
    fd.append('document_type', 'Technical');
    fd.append('document_version', '00');
    const uid = getCurrentUserId();
    if (uid != null) fd.append('user_id', String(uid));
    setUploading(true);
    try {
      await api.post('/operation-documents/upload/', fd);
      message.success('Files uploaded for this job card');
      setUploadFileList([]);
      await fetchOpDocuments(opId);
    } catch (error) {
      const detail = error?.response?.data?.detail || error?.response?.data?.message || 'Upload failed';
      message.error(detail);
    } finally {
      setUploading(false);
    }
  };

  const canDeleteOwnDoc = (doc) => {
    const uid = getCurrentUserId();
    if (uid == null || doc?.user_id == null) return false;
    return Number(doc.user_id) === Number(uid);
  };

  const handleDeleteOwnDocument = async (doc) => {
    const docId = doc?.id || doc?.document_id;
    if (!docId) {
      message.error('Cannot delete this file');
      return;
    }
    try {
      await api.delete(`/operation-documents/${docId}`);
      message.success('File deleted');
      await fetchOpDocuments(getSelectedOperationId());
    } catch (error) {
      const detail = error?.response?.data?.detail || error?.response?.data?.message || 'Failed to delete';
      message.error(detail);
    }
  };


  const isMatchingPart = (partDetail, partIdOrNumber) => {
    if (!partDetail || !partDetail.part) return false;
    const p = partDetail.part;
    return p.id == partIdOrNumber || p.part_id == partIdOrNumber || p.part_number == partIdOrNumber || p.number == partIdOrNumber;
  };


  const findPartInAssembly = (assembly, partIdOrNumber) => {
    if (assembly.parts) {
      for (const partDetail of assembly.parts) {
        if (isMatchingPart(partDetail, partIdOrNumber)) return partDetail;
      }
    }

    if (assembly.subassemblies) {
      for (const sub of assembly.subassemblies) {
        const found = findPartInAssembly(sub, partIdOrNumber);
        if (found) return found;
      }
    }
    return null;
  };


  const toolColumns = [
    { title: 'SL No', key: 'sl_no', width: 60, render: (_, __, index) => index + 1 },
    { title: 'Tool Name', key: 'tool_name', render: (_, record) => record.tool?.item_description || record.item_description || '-' },
    { title: 'Range', key: 'range', render: (_, record) => record.tool?.range || record.range || '-' },
    { title: 'Type', key: 'type', render: (_, record) => record.tool?.type || record.type || '-' },
    { title: 'Available', key: 'available_qty', render: (_, record) => getAvailableToolQuantity(record, pendingQtyByToolId) },
    {

      title: 'Action', key: 'action',
      render: (_, record) => (
        <Button type="primary" size="small"
          onClick={() => handleShowRequestModal(record)}
          disabled={getAvailableToolQuantity(record, pendingQtyByToolId) <= 0}
        >Request</Button>
      )
    },
  ];


  const rawMaterialColumns = [
    { title: 'Raw Material Name', dataIndex: 'raw_material_name', key: 'name' },
    { title: 'Form Type', dataIndex: 'form_type', key: 'form_type' },
    { title: 'Stock Dimensions', dataIndex: 'stock_dimensions', key: 'stock_dimensions' },
    {
      title: 'Raw Material Status', dataIndex: 'raw_material_status', key: 'status',
      render: (status) => <Tag color={status === 'Available' ? 'green' : 'red'}>{status}</Tag>
    },
  ];

  const processPlanColumns = [
    {
      title: 'Operation No', key: 'op_num',
      render: (record) => record.operation_number || record.number || record.op_no || '-'
    },
    {
      title: 'Operation Name', key: 'op_name',
      render: (record) => record.operation_name || record.name || record.op_name || '-'
    },
    {
      title: 'Setup Time', key: 'setup_time',
      render: (record) => record.setup_time || record.setupTime || record.preparation_time || '-'
    },
    {
      title: 'Cycle Time', key: 'cycle_time',
      render: (record) => record.cycle_time || record.cycleTime || record.run_time || '-'
    },
    {
      title: 'Work Center', key: 'wc_name',
      render: (record) => record.work_center_name || record.work_center?.name || '-'
    },
  ];


  const operationColumns = [
    {
      title: 'Operation No', key: 'op_num',
      render: (record) => record.operation_number || record.number || record.op_no || '-'
    },
    {
      title: 'Operation Name', key: 'op_name',
      render: (record) => record.operation_name || record.name || record.op_name || '-'
    },
    {
      title: 'Setup Time', key: 'setup_time',
      render: (record) => record.setup_time || record.setupTime || record.preparation_time || '-'
    },
    {
      title: 'Cycle Time', key: 'cycle_time',
      render: (record) => record.cycle_time || record.cycleTime || record.run_time || '-'
    },
    {
      title: 'Work Center', key: 'wc_name',
      render: (record) => record.work_center_name || record.work_center?.name || '-'
    },
    {
      title: 'Part Qty', key: 'part_qty',
      render: (record) => {
        // Total qty comes from the hierarchical API response
        const totalQty = selectedJob?.total_quantity || record.total_quantity || record.total_qty || record.quantity || selectedJob?.quantity || 0;

        // ✅ Completed = sum of approved_quantity from production-logs API
        const completedQty = effectiveStats.totalApproved || 0;

        // ✅ Remaining to close = only approved_quantity closes the order
        const remainingQty = effectiveStats.remainingToClose ?? Math.max(0, totalQty - completedQty);
        const reworkDue = effectiveStats.reworkDue || 0;
        const rejectDue = effectiveStats.rejectDue || 0;

        return (
          <div style={{ fontSize: '12px', lineHeight: 1.6 }}>
            <div><Text type="secondary">Total:</Text> <strong>{totalQty}</strong></div>
            <div><Text type="secondary">Approved:</Text> <strong style={{ color: '#52c41a' }}>{completedQty}</strong></div>
            <div><Text type="secondary">Remaining:</Text> <strong style={{ color: '#1677FF' }}>{remainingQty}</strong></div>
            {reworkDue > 0 && (
              <div style={{ color: '#FA8C16', marginTop: 2 }}>
                ↻ Rework: {reworkDue}
              </div>
            )}
            {rejectDue > 0 && (
              <div style={{ color: '#FF4D4F' }}>
                ✕ Reject: {rejectDue}
              </div>
            )}
          </div>
        );
      }
    },
    {
      title: 'Operation Type', key: 'operation_type',
      render: (record) => record.part_type_name || record.operation_type || record.type || record.op_type || '-'
    },
    {
      title: 'Work Instructions', key: 'work_instructions',
      render: (record) => {
        const instructions = record.work_instructions || '-';
        // If instructions are long, truncate and show full text in tooltip
        const isLong = instructions.length > 50;
        const displayText = isLong ? instructions.substring(0, 50) + '...' : instructions;
        return (
          <Tooltip title={isLong ? instructions : undefined} placement="topLeft">
            <Text style={{ fontSize: 12 }}>
              {displayText}
            </Text>
          </Tooltip>
        );
      }
    },
    {
      title: 'Notes', key: 'notes',
      render: (record) => {
        const notes = record.notes || '-';
        const isLong = notes.length > 30;
        const displayText = isLong ? notes.substring(0, 30) + '...' : notes;
        return (
          <Tooltip title={isLong ? notes : undefined} placement="topLeft">
            <Text style={{ fontSize: 12 }}>
              {displayText}
            </Text>
          </Tooltip>
        );
      }
    },
    
    {
      title: 'Activation Time', key: 'activation_time',
      render: (record) => {
        const opId = record.operation_id || record.id || record.operation_number || record.number;
        const stats = effectiveStats;
        
        // If the record matches the currently selected job's operation, use the dashboard's productionStats
        const isCurrentOp = (
            (record.operation_number && record.operation_number.toString() === selectedJob?.operation_number?.toString()) ||
            (record.number && record.number.toString() === selectedJob?.operation_number?.toString())
          );
  
          // Only show activation time if:
          // 1. It was just activated in this session
          // 2. The backend says it's currently INPROGRESS
          const opStatus = isCurrentOp ? (stats.operatorStatus?.toString().toUpperCase()) : null;
          const isInProgress = opStatus === 'INPROGRESS' || opStatus === 'IN-PROGRESS' || opStatus === 'IN PROGRESS';
          
          const activationTime = (justActivated && isCurrentOp) ? sessionActivationTime : (isInProgress ? stats.activationTime : null);
          
          if (!activationTime) return '-';
        
        // Format the date/time string "YYYY-MM-DD HH:mm:ss.SSSSSS" to something more readable
        try {
          const [datePart, timePart] = activationTime.split(' ');
          const [h, m, s] = timePart.split(':');
          const [day, month, year] = datePart.split('-'); // Assuming YYYY-MM-DD format based on your input
          
          // Re-format nicely
          const d = dayjs(activationTime);
          if (d.isValid()) {
            return d.format('DD-MM-YYYY, HH:mm:ss');
          }
          return activationTime; // Fallback to raw string if dayjs fails
        } catch (e) {
          return activationTime;
        }
      }
    },
    {
      title: 'Action', key: 'action',
      render: (record) => {
        // Check if operation is completed by status OR by production quota
        const isCompletedByStatus = [selectedJob?.status, selectedJob?.operation_status].some(s => s?.toString().toUpperCase() === 'COMPLETED');
        const totalQuantity = selectedJob?.total_quantity || selectedJob?.quantity || 0;
        const isCompletedByQuota = totalQuantity > 0 && (
          effectiveStats.remainingToClose === 0 ||
          effectiveStats.totalApproved >= totalQuantity
        );
        const isCompleted = isCompletedByStatus || isCompletedByQuota;
        
        // This specific operation's activation status
        const isThisOpActivated = effectivelyActivated && (
          (record.operation_number && record.operation_number.toString() === selectedJob?.operation_number?.toString()) ||
          (record.number && record.number.toString() === selectedJob?.operation_number?.toString())
        );

        const isDisabled = effectivelyActivated || activating || isCompleted || isActivationBlocked;

        return (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Button
              type="default"
              size="small"
              block
              onClick={(e) => {
                e.stopPropagation();
                if (submissionStatuses[record.id] === 'pending') {
                  message.info('Supervisor approval required');
                } else {
                  handleShowChecklist(record);
                }
              }}
              style={{
                backgroundColor: submissionStatuses[record.id] === 'approved' ? '#52c41a' : submissionStatuses[record.id] === 'rejected' ? '#ff4d4f' : '#fa8c16',
                borderColor: submissionStatuses[record.id] === 'approved' ? '#52c41a' : submissionStatuses[record.id] === 'rejected' ? '#ff4d4f' : '#fa8c16',
                color: '#fff'
              }}
            >
              Poka-Yoke
            </Button>
            <Tooltip
              title={isActivationBlocked ? activationBlockReason : null}
              placement="top"
            >
              <span style={{ display: 'block' }}>
                <Button
                  type="primary"
                  size="small"
                  block
                  disabled={isDisabled || (checklistAssigned[record.id] && (!submissionStatuses[record.id] || submissionStatuses[record.id] !== 'approved'))}
                  loading={activating}
                  onClick={(e) => { e.stopPropagation(); handleShowActivateModal(record); }}
                  style={effectivelyActivated ? {
                    background: '#52c41a', borderColor: '#52c41a', color: '#fff', cursor: 'not-allowed'
                  } : isCompleted ? {
                    background: '#52c41a', borderColor: '#52c41a', color: '#fff', cursor: 'not-allowed'
                  } : {}}
                >
                  {isCompleted ? 'Completed' : effectivelyActivated ? 'In Progress' : 'Activate'}
                </Button>
              </span>
            </Tooltip>
            
            <Button
              type="default"
              size="small"
              block
              icon={<CheckCircleOutlined />}
              disabled={!isThisOpActivated || isCompleted}
              onClick={(e) => { e.stopPropagation(); handleOpenCompleteModal(record); }}
              style={isThisOpActivated && !isCompleted ? {
                borderColor: '#52c41a',
                color: '#52c41a'
              } : {}}
            >
              Submit Log
            </Button>
          </Space>
        );
      }
    }
  ];


  const allOperations = partData?.operations || partData?.part_operations || partData?.partOperations || [];
  const operations = allOperations.filter(op => {
    if (!selectedJob) return true;
    if (!selectedJob.operation_name && !selectedJob.operation_number) return true;

    const opNameMatch = selectedJob.operation_name && (
      (op.operation_name && op.operation_name.toLowerCase() === selectedJob.operation_name.toLowerCase()) ||
      (op.name && op.name.toLowerCase() === selectedJob.operation_name.toLowerCase())
    );
    
    const opNumMatch = selectedJob.operation_number && (
      (op.operation_number && op.operation_number.toString() === selectedJob.operation_number.toString()) ||
      (op.number && op.number.toString() === selectedJob.operation_number.toString())
    );

    // If both are provided, both must match for precise identification
    if (selectedJob.operation_name && selectedJob.operation_number) {
      return opNameMatch && opNumMatch;
    }
    // If only operation_number is provided, match by number (more specific)
    if (selectedJob.operation_number) {
      return opNumMatch;
    }
    // If only operation_name is provided, match by name
    return opNameMatch;
  });


  const hierarchyOpDocs = selectedOperation?.documents || selectedOperation?.operation_documents || [];
  const operationDocuments = opDocsReady ? liveOpDocs : hierarchyOpDocs;
  const partDocuments = partData?.documents || partData?.part_documents || [];
  const rawMaterials = partData?.part?.raw_material_name ? [{
    raw_material_name: partData.part.raw_material_name,
    raw_material_status: partData.part.raw_material_status || 'N/A',
    form_type: partData.part.raw_material_unit_details?.form_type || '-',
    stock_dimensions: partData.part.raw_material_unit_details?.stock_dimensions || '-'
  }] : [];

  const tools = selectedOperation?.tools || selectedOperation?.operation_tools || partData?.tools || [];

  // Doc tabs for Part Documents — Raw Materials is now a separate top-level tab
  const docTabs = [
    { key: 'all', label: 'All Documents' },
    { key: 'process_plan', label: 'Process Plan' },
    { key: '2d', label: '2D' },
    { key: '3d', label: '3D' },
  ];

  const handleShowRequestModal = (record) => {
    const tool = record.tool || record;
    setSelectedToolRecord(record);
    setSelectedToolForRequest(tool);
    setIsRequestModalVisible(true);

    const currentOrderId = selectedJob.sale_order_id || selectedJob.order_id || selectedJob.id;
    const currentOrder = orders.find(o => o.id === currentOrderId);
    const partId = selectedJob?.part_id || selectedJob?.id;
    const operationId = selectedJob?.operation_id || selectedJob?.id || selectedJob?.job_id;

    if (currentOrder) {
      fetchParts(currentOrder.sale_order_number);
    } else if (selectedJob.sale_order_number || selectedJob.production_order) {
      fetchParts(selectedJob.sale_order_number || selectedJob.production_order);
    }

    if (partId) {
      fetchOperations(partId);
    } else {
      setRequestOperations([]);
    }

    requestForm.setFieldsValue({
      project_id: currentOrderId,
      part_id: partId,
      operation_id: operationId,
      quantity: 1,
    });
  };

  const handleShowChecklist = (operation) => {
    const opId = operation.operation_id || operation.id;
    setChecklistOperationId(opId);
    setIsChecklistVisible(true);
  };

  const fetchSubmissionStatuses = async () => {
    try {
      const allOperations = partData?.operations || partData?.part_operations || partData?.partOperations || [];
      let operatorId = null;
      try {
        const userStr = localStorage.getItem('user');
        if (userStr) {
          const user = JSON.parse(userStr);
          operatorId = user.id;
        }
      } catch (e) {
        console.error('Error parsing user from local storage', e);
      }

      if (!operatorId) return;

      const statuses = {};
      const checklistAssigned = {};

      for (const op of allOperations) {
        // Check if operation has checklists (MC-assigned or default general checklists)
        try {
          const assignmentResponse = await api.get(`/operation-checklists/assignments?operation_id=${op.id}&fallback_to_general=true`
          );
          checklistAssigned[op.id] = (
            assignmentResponse.status === 200 &&
            Array.isArray(assignmentResponse.data) &&
            assignmentResponse.data.length > 0
          );
        } catch (error) {
          checklistAssigned[op.id] = false;
        }

        // Fetch submission status
        try {
          const response = await api.get(`/operation-checklists/submissions/latest?operation_id=${op.id}&operator=${operatorId}`
          );
          if (response.status === 200 && response.data.status) {
            statuses[op.id] = response.data.status;
          }
        } catch (error) {
          // No submission for this operation - don't set status
        }
      }
      setSubmissionStatuses(statuses);
      setChecklistAssigned(checklistAssigned);
    } catch (error) {
      console.error('Failed to fetch submission statuses:', error);
    }
  };

  const handleShowActivateModal = (operation) => {
    setOperationToActivate(operation);
    setIsActivateModalVisible(true);
  };

  const handleActivate = async (operation) => {
    const opId = operation.operation_id || operation.id;
    if (!opId) {
      notification.error({ message: 'Activation Failed', description: 'No operation ID found for this job.' });
      return;
    }

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

    setActivating(true);
    try {
      const response = await axios.post(
        `${SCHEDULING_API_BASE_URL}/scheduling/operation-status/${opId}/activate?operator_id=${operatorId}`,
        {}
      );

      if (response.status === 200 || response.status === 201) {
        setJustActivated(true);
        setSessionActivationTime(dayjs().format('YYYY-MM-DD HH:mm:ss'));

        notification.success({
          message: 'Operation Activated',
          description: 'Status Updated. Production log is now enabled.',
        });

        onActivate(operation);
        setIsActivateModalVisible(false);
        setOperationToActivate(null);
      }
    } catch (error) {
      console.error('Error activating operation:', error);
      notification.error({
        message: 'Activation Failed',
        description: error.response?.data?.detail || 'Failed to activate operation.',
      });
    } finally {
      setActivating(false);
    }
  };

  const handleOpenCompleteModal = (operation) => {
    setCompletingOp(operation);
    setIsCompleteModalVisible(true);
    completeForm.setFieldsValue({
      produced_quantity: null,
      rework_submit_quantity: null,
      notes: ''
    });
  };

  const handleCompleteSubmit = async (values) => {
    if (!selectedJob || !completingOp) return;

    const producedQty = parseInt(values.produced_quantity, 10) || 0;
    const reworkSubmitQty = parseInt(values.rework_submit_quantity, 10) || 0;

    if (producedQty === 0 && reworkSubmitQty === 0) {
      message.error('Enter at least one quantity: new produced units or rework submit.');
      return;
    }

    let operationId = selectedJob.id || selectedJob.operation_id || selectedJob.job_id || selectedJob.schedule_id;
    let operatorId = null;
    
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        operatorId = user.id;
      } catch (e) {
        console.error("Error parsing user from local storage", e);
      }
    }
    if (!operatorId) operatorId = localStorage.getItem('operator_id');
    
    if (!operatorId) {
      message.error('Operator not found in session. Please log in again.');
      return;
    }

    setCompleteLoading(true);
    try {
      const payload = {
        notes: values.notes || '',
        produced_quantity: producedQty,
        rework_submit_quantity: reworkSubmitQty,
      };

      const response = await fetch(`${SCHEDULING_API_BASE_URL}/production-logs/operation/${operationId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        message.success('Production log submitted successfully!');
        setIsCompleteModalVisible(false);
        completeForm.resetFields();
        if (onProductionSubmit) onProductionSubmit();
      } else {
        const errorData = await response.json();
        message.error(`Failed to submit production log: ${errorData.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error submitting production log:', error);
      message.error('Failed to submit production log. Please try again.');
    } finally {
      setCompleteLoading(false);
    }
  };


  const handleRequestSubmit = async (values) => {
    let operatorId = 0;
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) { const user = JSON.parse(userStr); operatorId = user.id || 0; }
    } catch (e) { console.error('Error parsing user from local storage', e); }

    setRequestLoading(true);
    try {
      const payload = {
        tool_id: getInventoryToolId(selectedToolRecord) || selectedToolForRequest?.id || 0,
        operator_id: operatorId,
        project_id: values.project_id,
        part_id: values.part_id,
        operation_id: values.operation_id,
        quantity: values.quantity,
        purpose_of_use: values.purpose_of_use || ""
      };

      const response = await api.post(`/inventory-requests/`, payload);
      if (response.status === 200 || response.status === 201) {
        notification.success({ message: 'Success', description: 'Request submitted successfully' });
        setIsRequestModalVisible(false);
        requestForm.resetFields();
        setSelectedToolRecord(null);
        await fetchPendingToolQuantities();
      }

    } catch (error) {
      notification.error({
        message: 'Request Failed',
        description: error.response?.data?.detail || 'The quantity requested is more than available.',
      });

    } finally {
      setRequestLoading(false);
    }
  };


  const handlePreview = (doc) => {
    setIsPreviewVisible(false);
    setPreviewDoc(null);
    setTimeout(() => {
      setPreviewDoc(doc);
      setIsPreviewVisible(true);
    }, 50);
  };

  const getLatestVersionDocuments = (docs) => {
    if (!docs || docs.length === 0) return [];

    // Create a map to track document chains by their root document (parent_id = null)
    // Documents in the same chain have the same root (the one with parent_id = null)
    const docChains = new Map();

    // First, identify all root documents (parent_id = null)
    docs.forEach(doc => {
      if (doc.parent_id === null) {
        docChains.set(doc.id, [doc]);
      }
    });

    // Then, add child documents to their respective chains
    docs.forEach(doc => {
      if (doc.parent_id !== null) {
        // Find the root by traversing up the parent chain
        let rootId = doc.parent_id;
        let currentDoc = doc;
        
        // Traverse up to find the ultimate root
        while (true) {
          const parentDoc = docs.find(d => d.id === rootId);
          if (!parentDoc || parentDoc.parent_id === null) {
            break;
          }
          rootId = parentDoc.parent_id;
        }

        if (docChains.has(rootId)) {
          docChains.get(rootId).push(doc);
        } else {
          // If root not found, this might be an orphan, add it as its own chain
          docChains.set(doc.id, [doc]);
        }
      }
    });

    // For each chain, keep only the document with the highest version
    const latestDocs = [];
    docChains.forEach(chain => {
      if (chain.length === 0) return;
      
      // Sort by version (descending) and take the first one
      const sorted = chain.sort((a, b) => {
        const versionA = a.document_version || '00';
        const versionB = b.document_version || '00';
        return versionB.localeCompare(versionA);
      });
      
      latestDocs.push(sorted[0]);
    });

    return latestDocs;
  };

  const renderDocuments = (docs, filter, { allowOwnerDelete } = {}) => {
    // Filter to show only latest versions for operators
    const latestDocs = getLatestVersionDocuments(docs);
    const filtered = filter === 'all' ? latestDocs : latestDocs.filter(d => (d.document_type || d.type || '').toLowerCase().includes(filter));
    if (filtered.length === 0) return <Empty description="No documents found." />;
    return (
      <Table
        dataSource={filtered}
        rowKey={(doc) => doc.id || doc.document_id || doc.document_name}
        size="small"
        pagination={false}
        columns={[
          {
            title: 'File',
            key: 'name',
            render: (_, doc) => (
              <Space>
                <FileTextOutlined style={{ color: '#1677FF' }} />
                <Text strong>{doc.document_name || doc.name}</Text>
              </Space>
            ),
          },
          {
            title: 'Type',
            key: 'type',
            width: 120,
            render: (_, doc) => <Tag color="blue">{doc.document_type || doc.tag || doc.type || '-'}</Tag>,
          },
          {
            title: 'Action',
            key: 'action',
            width: 140,
            render: (_, doc) => (
              <Space>
                <Button icon={<EyeOutlined />} size="small" type="text" onClick={() => handlePreview(doc)} />
                {allowOwnerDelete && canDeleteOwnDoc(doc) && (
                  <Popconfirm
                    title="Delete this file?"
                    okText="Delete"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => handleDeleteOwnDocument(doc)}
                  >
                    <Button icon={<DeleteOutlined />} size="small" type="text" danger />
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />
    );
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

          {/* ── Tab 1: Operations ── */}
          <TabPane tab="Operations" key="operations">
            {operations.length > 0 ? (
              <Table
                dataSource={operations}
                columns={operationColumns}
                rowKey={(record) => record.operation_id || record.id || record.operation_number || record.number}
                size="small"
                scroll={{ x: true }}
              />
            ) : (
              <Empty description="No operations found for this job." />
            )}
          </TabPane>

          {/* ── Tab 2: Tools (moved from sub-tab to top-level) ── */}
          <TabPane tab="Tools" key="tools">
            {selectedOperation ? (
              <div>
                <Title level={5} style={{ marginBottom: 12 }}>{selectedOperation.operation_name} - Tools</Title>
                <Table
                  dataSource={tools}
                  columns={toolColumns}
                  rowKey={(record) => record.tool?.id || record.id}
                  size="small"
                  pagination={false}
                  scroll={{ x: true }}
                />
              </div>
            ) : (
              <Empty description="Select an operation to view its tools." />
            )}
          </TabPane>

          {/* ── Tab 4: Part Documents (doc sub-tabs only, no Raw Materials) ── */}
          <TabPane tab="Part Documents" key="part_documents">
            <Tabs activeKey={activeDocTab} onChange={setActiveDocTab} size="small">
              {docTabs.map(t => <TabPane tab={t.label} key={t.key} />)}
            </Tabs>
            <div style={{ marginTop: 16 }}>
              {activeDocTab === 'process_plan' ? (
                allOperations.length > 0 ? (
                  <Table
                    dataSource={allOperations}
                    columns={processPlanColumns}
                    rowKey={(record) => record.id || record.operation_id || record.operation_number || record.number}
                    size="small"
                    pagination={false}
                    scroll={{ x: true }}
                  />
                ) : (
                  <Empty description="No operations found for this part." />
                )
              ) : (
                docTabs.some(t => t.key === activeDocTab) && renderDocuments(partDocuments, activeDocTab)
              )}
            </div>
          </TabPane>

          {/* ── Tab 5: Raw Materials (moved from sub-tab to top-level) ── */}
          <TabPane tab="Raw Materials" key="raw_materials">
            <Table
              dataSource={rawMaterials}
              columns={rawMaterialColumns}
              rowKey={(record) => record.raw_material_name}
              size="small"
              pagination={false}
            />
          </TabPane>

          <TabPane tab="Upload Setup Photos" key="op_documents">
            {selectedJob && selectedOperation ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                  <Title level={5} style={{ margin: 0 }}>{selectedOperation.operation_name} - Setup Photos</Title>
                  <Space wrap>
                    <Upload
                      multiple
                      fileList={uploadFileList}
                      beforeUpload={() => false}
                      onChange={({ fileList }) => setUploadFileList(fileList)}
                      accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.gif,.bmp,.webp,.mp4,.mov,.avi,.mkv,.webm"
                    >
                      <Button icon={<UploadOutlined />}>Select files</Button>
                    </Upload>
                    <Button
                      type="primary"
                      icon={<UploadOutlined />}
                      loading={uploading}
                      onClick={handleOperatorUpload}
                      disabled={!uploadFileList.length}
                    >
                      Upload
                    </Button>
                  </Space>
                </div>
                {renderDocuments(operationDocuments, 'all', { allowOwnerDelete: true })}
              </div>
            ) : (
              <Empty description="Select a job card to upload setup photos." />
            )}
          </TabPane>

        </Tabs>
      </Spin>


      {/* Request Inventory Modal */}

      <Modal
        title="Request Inventory"
        open={isRequestModalVisible}
        onCancel={() => {
          setIsRequestModalVisible(false);
          requestForm.resetFields();
          setRequestOperations([]);
          setSelectedToolRecord(null);
        }}
        footer={null}
        maskClosable={false}
      >
        <Form form={requestForm} layout="vertical" onFinish={handleRequestSubmit}>
          <Form.Item name="project_id" label="Project" rules={[{ required: true, message: 'Please select a project' }]}>
            <Select disabled placeholder="Select a project"
              onChange={(value) => {
                const selectedOrder = orders.find(o => o.id === value);
                if (selectedOrder) fetchParts(selectedOrder.sale_order_number);
                requestForm.setFieldsValue({ part_id: undefined, operation_id: undefined });
                setRequestOperations([]);
              }}
            >
              {orders.map(o => <Option key={o.id} value={o.id}>{o.sale_order_number || `Order ${o.id}`}</Option>)}
            </Select>
          </Form.Item>

          <Form.Item name="part_id" label="Part" rules={[{ required: true, message: 'Please select a part' }]}>
            <Select disabled placeholder="Select a part"
              onChange={(value) => {
                fetchOperations(value);
                requestForm.setFieldsValue({ operation_id: undefined });
              }}
            >
              {parts.map(p => <Option key={p.id} value={p.id}>{p.part_name || p.part_number}</Option>)}
            </Select>
          </Form.Item>

          <Form.Item name="operation_id" label="Operation" rules={[{ required: true, message: 'Please select an operation' }]}>
            <Select disabled placeholder="Select an operation" showSearch optionFilterProp="label">
              {requestOperations.map((op) => (
                <Option
                  key={op.id}
                  value={op.id}
                  label={`${op.operation_number || ''} - ${op.operation_name || ''}`}
                >
                  {op.operation_number} - {op.operation_name}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="quantity" label="Quantity"
            rules={[
              { required: true, message: 'Please enter quantity' },
              {
                validator(_, value) {
                  const available = getAvailableToolQuantity(selectedToolRecord, pendingQtyByToolId);
                  if (value && value > available) return Promise.reject(new Error(`Available quantity: ${available}.`));
                  return Promise.resolve();
                },
              },
            ]}
            extra={(
              <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                Available: {getAvailableToolQuantity(selectedToolRecord, pendingQtyByToolId)}
              </span>
            )}
          >
            <InputNumber min={1} style={{ width: '100%' }} precision={0}
              parser={value => value.replace(/[^\d]/g, '')}
              formatter={value => value ? String(value).replace(/[^\d]/g, '') : ''}
              onKeyDown={e => {
                if (!/^\d$/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) e.preventDefault();
              }}
            />
          </Form.Item>
          <Form.Item name="purpose_of_use" label="Purpose of Use">
            <TextArea rows={4} />
          </Form.Item>

          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => {
                setIsRequestModalVisible(false);
                requestForm.resetFields();
                setRequestOperations([]);
                setSelectedToolRecord(null);
              }}
              >
                Cancel
              </Button>
              <Button type="primary" htmlType="submit" loading={requestLoading}>Submit Request</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Activate Confirmation Modal */}
      <Modal
        title="Activate Operation"
        open={isActivateModalVisible}
        onCancel={() => { setIsActivateModalVisible(false); setOperationToActivate(null); }}
        footer={[
          <Button key="cancel" onClick={() => { setIsActivateModalVisible(false); setOperationToActivate(null); }}>
            Cancel
          </Button>,
          <Button key="activate" type="primary" loading={activating} onClick={() => handleActivate(operationToActivate)}>
            Confirm & Activate
          </Button>
        ]}
      >
        {operationToActivate && (
          <div>
            <p>Are you sure you want to activate the following operation?</p>
            <div style={{ marginTop: 16, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 8 }}>
              <div><strong>Operation Number:</strong> {operationToActivate.operation_number || operationToActivate.number || '-'}</div>
              <div><strong>Operation Name:</strong> {operationToActivate.operation_name || operationToActivate.name || '-'}</div>
            </div>
          </div>
        )}
      </Modal>

      {/* Preview Modal */}
      <Modal
        title={previewDoc?.document_name || previewDoc?.name || "Document Preview"}
        open={isPreviewVisible}
        onCancel={() => { setIsPreviewVisible(false); setPreviewDoc(null); }}
        destroyOnClose={true}
        footer={[
          <Button key="close" onClick={() => setIsPreviewVisible(false)}>Close</Button>
        ]}
        width="90%"
        style={{ top: 16 }}
        styles={{ body: { height: '80vh', padding: 0, overflow: 'hidden' } }}
      >
        {previewDoc && (previewDoc.document_type === '3D' || previewDoc.type === '3D' || previewDoc.tag === '3D') ? (
            <div style={{ width: '100%', height: '100%' }}>
              <ModelViewer3D
                key={previewDoc.id || previewDoc.document_id}
                documentId={previewDoc.id || previewDoc.document_id}
                height="80vh"
                showControls={true}
                showEdgeButton={true}
              />
            </div>
          ) : previewDoc?.document_url ? (
            <DocumentPreviewer
              url={previewDoc.document_url}
              fileName={previewDoc.document_name || previewDoc.name}
              meta={previewDoc}
              height="100%"
            />
          ) : (
            <Empty description="No preview available for this file type. Please download to view." />
         )}
      </Modal>

      {/* Poka-Yoke Checklist Popup */}
      <OperationChecklist
        visible={isChecklistVisible}
        onClose={() => setIsChecklistVisible(false)}
        operationId={checklistOperationId}
        onSubmitted={fetchSubmissionStatuses}
      />

      {/* Complete Operation Modal */}
      <Modal
        title={
          <Space>
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
            <span>Submit Production Log: {completingOp?.operation_name || completingOp?.name}</span>
          </Space>
        }
        open={isCompleteModalVisible}
        onCancel={() => setIsCompleteModalVisible(false)}
        footer={null}
        destroyOnClose
        width={720}
      >
        <Form
          form={completeForm}
          layout="vertical"
          onFinish={handleCompleteSubmit}
        >
          {/* Ledger summary */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 10,
            marginBottom: 16,
          }}>
            {[
              { label: 'Remaining to close', value: effectiveStats.remainingToClose ?? '-', color: '#1677FF' },
              { label: 'Rework due', value: effectiveStats.reworkDue || 0, color: '#FA8C16' },
              { label: 'Reject due', value: effectiveStats.rejectDue || 0, color: '#FF4D4F' },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{
                  background: '#fafafa',
                  border: '1px solid #f0f0f0',
                  borderRadius: 8,
                  padding: '10px 12px',
                  textAlign: 'center',
                }}
              >
                <Text style={{ fontSize: 11, color: '#94a3b8', display: 'block' }}>{label}</Text>
                <Text strong style={{ fontSize: 20, color }}>{value}</Text>
              </div>
            ))}
          </div>

          <Divider style={{ margin: '0 0 16px' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Choose what you are submitting</Text>
          </Divider>

          <Row gutter={16}>
            {/* Section 1: New units */}
            <Col xs={24} md={12}>
              <div style={{
                background: '#f6ffed',
                border: '2px solid #b7eb8f',
                borderRadius: 12,
                padding: 16,
                height: '100%',
              }}>
                <Space align="start" style={{ marginBottom: 12 }}>
                  <PlusCircleOutlined style={{ color: '#52c41a', fontSize: 20, marginTop: 2 }} />
                  <div>
                    <Text strong style={{ display: 'block', color: '#389e0d' }}>New Units</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      Brand-new parts you made now
                    </Text>
                  </div>
                </Space>
                <ul style={{ fontSize: 11, color: '#595959', paddingLeft: 18, margin: '0 0 12px' }}>
                  <li>First production run</li>
                  <li>Replacement for rejected scrap</li>
                  <li>Balance never produced yet</li>
                </ul>
                {effectiveStats.rejectDue > 0 && (
                  <Alert
                    type="warning"
                    showIcon
                    message={`${effectiveStats.rejectDue} rejected — make new units here`}
                    style={{ marginBottom: 12, fontSize: 11 }}
                  />
                )}
                <Form.Item
                  name="produced_quantity"
                  label="Quantity"
                  style={{ marginBottom: 0 }}
                >
                  <InputNumber
                    min={0}
                    max={999999}
                    style={{ width: '100%' }}
                    placeholder="0"
                    precision={0}
                    parser={value => {
                      const digits = String(value || '').replace(/[^\d]/g, '').slice(0, 6);
                      return digits ? parseInt(digits, 10) : '';
                    }}
                    formatter={value => {
                      if (value === '' || value === null || value === undefined) return '';
                      return String(value).replace(/[^\d]/g, '').slice(0, 6);
                    }}
                  />
                </Form.Item>
              </div>
            </Col>

            {/* Section 2: Rework */}
            <Col xs={24} md={12}>
              <div style={{
                background: '#fff7e6',
                border: '2px solid #ffd591',
                borderRadius: 12,
                padding: 16,
                height: '100%',
              }}>
                <Space align="start" style={{ marginBottom: 12 }}>
                  <ReloadOutlined style={{ color: '#FA8C16', fontSize: 20, marginTop: 2 }} />
                  <div>
                    <Text strong style={{ display: 'block', color: '#d46b08' }}>Rework (Same Parts)</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      Parts you already made, fixed and sent again
                    </Text>
                  </div>
                </Space>
                <ul style={{ fontSize: 11, color: '#595959', paddingLeft: 18, margin: '0 0 12px' }}>
                  <li>Same physical parts from earlier</li>
                  <li>Do <strong>not</strong> count as new production</li>
                  <li>Leave at 0 if nothing to rework</li>
                </ul>
                {effectiveStats.reworkDue > 0 && (
                  <Alert
                    type="warning"
                    showIcon
                    message={`${effectiveStats.reworkDue} awaiting rework — enter here`}
                    style={{ marginBottom: 12, fontSize: 11 }}
                  />
                )}
                <Form.Item
                  name="rework_submit_quantity"
                  label="Quantity"
                  style={{ marginBottom: 0 }}
                >
                  <InputNumber
                    min={0}
                    max={999999}
                    style={{ width: '100%' }}
                    placeholder="0"
                    precision={0}
                    parser={value => {
                      const digits = String(value || '').replace(/[^\d]/g, '').slice(0, 6);
                      return digits ? parseInt(digits, 10) : '';
                    }}
                    formatter={value => {
                      if (value === '' || value === null || value === undefined) return '';
                      return String(value).replace(/[^\d]/g, '').slice(0, 6);
                    }}
                  />
                </Form.Item>
              </div>
            </Col>
          </Row>

          {/* Live total */}
          <div style={{
            marginTop: 16,
            padding: '10px 14px',
            background: totalPresented > 0 ? '#e6f4ff' : '#fafafa',
            border: `1px solid ${totalPresented > 0 ? '#91caff' : '#f0f0f0'}`,
            borderRadius: 8,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <Text style={{ fontSize: 12 }}>
              New units + Rework = <strong>Total presented for review</strong>
            </Text>
            <Text strong style={{ fontSize: 18, color: totalPresented > 0 ? '#1677FF' : '#94a3b8' }}>
              {totalPresented}
            </Text>
          </div>

          <Form.Item
            name="notes"
            label="Notes (optional)"
            style={{ marginTop: 16, marginBottom: 0 }}
          >
            <TextArea rows={3} placeholder="Enter any notes or observations" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, marginTop: 16, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setIsCompleteModalVisible(false)}>
                Back
              </Button>
              <Button type="primary" htmlType="submit" loading={completeLoading}>
                Submit Log
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};
export default PartDocumentTab;