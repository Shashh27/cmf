import React, { useState, useEffect } from 'react';
import { Card, Tabs, Table, Tag, Button, Empty, Spin, Typography, Space, Modal, Form, Input, InputNumber, DatePicker, notification, Select, message, Tooltip } from 'antd';
import { FileTextOutlined, EyeOutlined, CheckCircleOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { API_BASE_URL } from '../Config/auth';
import { SCHEDULING_API_BASE_URL } from '../Config/schedulingconfig';
import ModelViewer3D from './ModelViewer3D';
import OperationChecklist from './OperationChecklist';


const { TabPane } = Tabs;
const { Text, Title } = Typography;
const { TextArea } = Input;
const { Option } = Select;



const PartDocumentTab = ({ selectedJob, isActivated, onActivate, completedQuantity = 0, productionStats: propStats }) => {
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

  // Preview Modal State

  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);

  // Request Modal State

  const [isRequestModalVisible, setIsRequestModalVisible] = useState(false);
  const [selectedToolForRequest, setSelectedToolForRequest] = useState(null);
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestForm] = Form.useForm();
  
  // Complete Modal State
  const [isCompleteModalVisible, setIsCompleteModalVisible] = useState(false);
  const [completingOp, setCompletingOp] = useState(null);
  const [completeLoading, setCompleteLoading] = useState(false);
  const [completeForm] = Form.useForm();

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
  }, [selectedJob?.schedule_id]);

  useEffect(() => {
    if (partData) {
      fetchSubmissionStatuses();
    }
  }, [partData]);

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

      if (!orderId && orderNumber) {
        try {
          const ordersRes = await axios.get(`${API_BASE_URL}/orders`);
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
      const response = await axios.get(`${API_BASE_URL}/orders/${orderId}/hierarchical`);
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
    { title: 'Available', key: 'available_qty', render: (_, record) => record.tool?.quantity ?? record.quantity ?? 0 },
    {

      title: 'Action', key: 'action',
      render: (_, record) => (
        <Button type="primary" size="small"
          onClick={() => handleShowRequestModal(record)}
          disabled={(record.tool?.quantity ?? record.quantity ?? 0) <= 0}
        >Request</Button>
      )
    },
  ];


  const rawMaterialColumns = [
    { title: 'Raw Material Name', dataIndex: 'raw_material_name', key: 'name' },
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

        // ✅ Remaining = total - approved (never go below 0)
        const remainingQty = Math.max(0, totalQty - completedQty);

        return (
          <div style={{ fontSize: '12px' }}>
            <div>Total: {totalQty}</div>
            <div>Completed: {completedQty}</div>
            <div>Remaining: {remainingQty}</div>
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
        const isCompletedByQuota = totalQuantity > 0 && effectiveStats.totalApproved >= totalQuantity;
        const isCompleted = isCompletedByStatus || isCompletedByQuota;
        
        // This specific operation's activation status
        const isThisOpActivated = effectivelyActivated && (
          (record.operation_number && record.operation_number.toString() === selectedJob?.operation_number?.toString()) ||
          (record.number && record.number.toString() === selectedJob?.operation_number?.toString())
        );

        const isDisabled = effectivelyActivated || activating || isCompleted;

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
              Complete
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


  const operationDocuments = selectedOperation?.documents || selectedOperation?.operation_documents || [];
  const partDocuments = partData?.documents || partData?.part_documents || [];
  const rawMaterials = partData?.part?.raw_material_name ? [{
    raw_material_name: partData.part.raw_material_name,
    raw_material_status: partData.part.raw_material_status || 'N/A'
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
    setSelectedToolForRequest(tool);
    setIsRequestModalVisible(true);

    const currentOrderId = selectedJob.sale_order_id || selectedJob.order_id || selectedJob.id;
    const currentOrder = orders.find(o => o.id === currentOrderId);

    if (currentOrder) {
      fetchParts(currentOrder.sale_order_number);
    } else if (selectedJob.sale_order_number || selectedJob.production_order) {
      fetchParts(selectedJob.sale_order_number || selectedJob.production_order);
    }

    requestForm.setFieldsValue({
      project_id: currentOrderId,
      part_id: selectedJob?.part_id || selectedJob?.id,
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
        // Check if checklist is assigned to this operation
        try {
          const assignmentResponse = await axios.get(
            `${API_BASE_URL}/operation-checklists/assignments?operation_id=${op.id}`
          );
          if (assignmentResponse.status === 200 && assignmentResponse.data && assignmentResponse.data.length > 0) {
            checklistAssigned[op.id] = true;
          } else {
            checklistAssigned[op.id] = false;
          }
        } catch (error) {
          checklistAssigned[op.id] = false;
        }

        // Fetch submission status
        try {
          const response = await axios.get(
            `${API_BASE_URL}/operation-checklists/submissions/latest?operation_id=${op.id}&operator=${operatorId}`
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
      notes: ''
    });
  };

  const handleCompleteSubmit = async (values) => {
    if (!selectedJob || !completingOp) return;

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
      const now = dayjs();
      const payload = {
        operation_id: parseInt(operationId),
        operator_id: parseInt(operatorId),
        supervisor_id: 0,
        notes: values.notes || '',
        remarks: '',
        produced_quantity: parseInt(values.produced_quantity) || 0,
        approved_quantity: 0,
        from_date: now.format('YYYY-MM-DD'),
        from_time: now.format('HH:mm:ss') + '.000Z',
        to_date: now.format('YYYY-MM-DD'),
        to_time: now.format('HH:mm:ss') + '.000Z',
        status: 'pending'
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
        window.location.reload();
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
        tool_id: selectedToolForRequest?.id || 0,
        operator_id: operatorId,
        project_id: values.project_id,
        part_id: values.part_id,
        quantity: values.quantity,
        purpose_of_use: values.purpose_of_use || ""
      };

      const response = await axios.post(`${API_BASE_URL}/inventory-requests/`, payload);
      if (response.status === 200 || response.status === 201) {
        notification.success({ message: 'Success', description: 'Request submitted successfully' });
        setIsRequestModalVisible(false);
        requestForm.resetFields();
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

  const renderDocuments = (docs, filter) => {
    // Filter to show only latest versions for operators
    const latestDocs = getLatestVersionDocuments(docs);
    const filtered = filter === 'all' ? latestDocs : latestDocs.filter(d => (d.document_type || d.type || '').toLowerCase().includes(filter));
    if (filtered.length === 0) return <Empty description="No documents found." />;
    return filtered.map((doc, i) => (
      <Card key={i} size="small" style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <FileTextOutlined style={{ color: '#1677FF' }} />
            <div>
              <Text strong>{doc.document_name || doc.name}</Text>
              <div style={{ fontSize: '12px', color: '#8c8c8c' }}>
                Version: {doc.document_version || '00'}
              </div>
            </div>
          </Space>
          <Space>
            <Tag color="blue">{doc.document_type || doc.tag || doc.type}</Tag>
            <Button icon={<EyeOutlined />} size="small" type="text" onClick={() => handlePreview(doc)} />
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

          {/* ── Tab 2: Operation Documents (docs only, no Tools sub-tab) ── */}
          <TabPane tab="Operation Documents" key="op_documents">
            {selectedOperation ? (
              <div>
                <Title level={5}>{selectedOperation.operation_name} - Documents</Title>
                {renderDocuments(operationDocuments, 'all')}
              </div>
            ) : (
              <Empty description="Select an operation to view its documents." />
            )}
          </TabPane>

          {/* ── Tab 3: Tools (moved from sub-tab to top-level) ── */}
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

        </Tabs>
      </Spin>


      {/* Request Inventory Modal */}

      <Modal
        title="Request Inventory"
        open={isRequestModalVisible}
        onCancel={() => { setIsRequestModalVisible(false); requestForm.resetFields(); }}
        footer={null}
        maskClosable={false}
      >
        <Form form={requestForm} layout="vertical" onFinish={handleRequestSubmit}>
          <Form.Item name="project_id" label="Project" rules={[{ required: true, message: 'Please select a project' }]}>
            <Select disabled placeholder="Select a project"
              onChange={(value) => {
                const selectedOrder = orders.find(o => o.id === value);
                if (selectedOrder) fetchParts(selectedOrder.sale_order_number);
                requestForm.setFieldsValue({ part_id: undefined });
              }}
            >
              {orders.map(o => <Option key={o.id} value={o.id}>{o.sale_order_number || `Order ${o.id}`}</Option>)}
            </Select>
          </Form.Item>

          <Form.Item name="part_id" label="Part" rules={[{ required: true, message: 'Please select a part' }]}>
            <Select disabled placeholder="Select a part">
              {parts.map(p => <Option key={p.id} value={p.id}>{p.part_name || p.part_number}</Option>)}
            </Select>
          </Form.Item>

          <Form.Item name="quantity" label="Quantity"
            rules={[
              { required: true, message: 'Please enter quantity' },
              {
                validator(_, value) {
                  const available = selectedToolForRequest?.quantity ?? 0;
                  if (value && value > available) return Promise.reject(new Error(`Available quantity: ${available}.`));
                  return Promise.resolve();
                },
              },
            ]}
            extra={<span style={{ fontSize: 12, color: '#8c8c8c' }}>Available: {selectedToolForRequest?.quantity ?? 0}</span>}
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
              <Button onClick={() => { setIsRequestModalVisible(false); requestForm.resetFields(); }}>Cancel</Button>
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
            Activate
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
        width="80%"
        style={{ top: 20 }}
        bodyStyle={{ height: '70vh', padding: 0 }}
      >
        {previewDoc && (previewDoc.document_type === '3D' || previewDoc.type === '3D' || previewDoc.tag === '3D') ? (
            <div style={{ width: '100%', height: '100%' }}>
              <ModelViewer3D
                key={previewDoc.id || previewDoc.document_id}
                documentId={previewDoc.id || previewDoc.document_id}
                height="70vh"
                showControls={true}
                showEdgeButton={true}
              />
            </div>
          ) : previewDoc?.document_url && (
              previewDoc.format?.toLowerCase() === 'pdf' ||
              previewDoc.document_type?.toLowerCase() === 'pdf' ||
              previewDoc.type?.toLowerCase() === 'pdf' ||
              previewDoc.document_url?.toLowerCase().endsWith('.pdf')
            ) ? (
            <iframe src={`${previewDoc.document_url}#toolbar=0`} title="PDF Preview" width="100%" height="100%" style={{ border: 'none' }} />
          ) : (
            <Empty description="No preview available for this file type. Please download to view." />
         )}
      </Modal>

      {/* Poka-Yoke Checklist Popup */}
      <OperationChecklist
        visible={isChecklistVisible}
        onClose={() => setIsChecklistVisible(false)}
        operationId={checklistOperationId}
      />

      {/* Complete Operation Modal */}
      <Modal
        title={
          <Space>
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
            <span>Complete Operation: {completingOp?.operation_name || completingOp?.name}</span>
          </Space>
        }
        open={isCompleteModalVisible}
        onCancel={() => setIsCompleteModalVisible(false)}
        footer={null}
        destroyOnClose
      >
        <Form
          form={completeForm}
          layout="vertical"
          onFinish={handleCompleteSubmit}
        >
          <Form.Item
            name="produced_quantity"
            label="Produced Quantity"
            rules={[
              { required: true, message: 'Please enter produced quantity' },
              {
                validator: (_, value) => {
                  if (value === 0 || value === '0') {
                    return Promise.reject(new Error('Produced quantity cannot be 0'));
                  }
                  return Promise.resolve();
                }
              }
            ]}
          >
            <InputNumber
              min={0}
              max={999999}
              style={{ width: '100%' }}
              placeholder="Enter quantity"
              precision={0}
              parser={value => {
                // Strip non-digits then cap at 6 digits
                const digits = String(value || '').replace(/[^\d]/g, '').slice(0, 6);
                return digits ? parseInt(digits, 10) : '';
              }}
              formatter={value => {
                if (value === '' || value === null || value === undefined) return '';
                // Ensure formatted value never exceeds 6 digits
                return String(value).replace(/[^\d]/g, '').slice(0, 6);
              }}
              onKeyDown={e => {
                const currentVal = String(completeForm.getFieldValue('produced_quantity') || '');
                const isDigit = /^\d$/.test(e.key);
                const isControl = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key);
                // Block non-digits
                if (!isDigit && !isControl) {
                  e.preventDefault();
                  return;
                }
                // Block digit input if already at 6 digits
                if (isDigit && currentVal.replace(/[^\d]/g, '').length >= 6) {
                  e.preventDefault();
                }
              }}
            />
          </Form.Item>

          <Form.Item
            name="notes"
            label="Notes (optional)"
          >
            <TextArea rows={4} placeholder="Enter any notes or observations" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setIsCompleteModalVisible(false)}>
                Back
              </Button>
              <Button type="primary" htmlType="submit" loading={completeLoading}>
                Submit
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};
export default PartDocumentTab;