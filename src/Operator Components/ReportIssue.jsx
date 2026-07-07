import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Tabs, Button, Select, Input, DatePicker, message, Space, Typography } from 'antd';
import { WarningOutlined, ToolOutlined, LockOutlined, CustomerServiceOutlined } from '@ant-design/icons';
import { API_BASE_URL } from '../Config/auth.js';
const { TabPane } = Tabs;
const { TextArea } = Input;
const { Text } = Typography;
const categoryOptions = ['Availability', 'Quality', 'Performance'];
const oeeReasons = ['Machine Oeeissue', 'Tool Change', 'Setup/Adjustment', 'Power Failure', 'Material Shortage', 'Planned Maintenance', 'Other'];
const breakdownReasons = ['Machine Breakdown', 'Electrical Issue', 'Mechanical Issue', 'Hydraulic Issue', 'Pneumatic Issue', 'Software Issue', 'Emergency Stop', 'Other'];
const componentStatusOpts = ['Available', 'Not Available'];
const getUserId = () => {
  try {
    const stored = localStorage.getItem('user');
    const u = stored ? JSON.parse(stored) : null;
    return u?.id ?? u?.user_id ?? null;
  } catch {
    return null;
  }
};
const formatLocalNaive = (date) => {
  if (!date) return '';
  const d = date && typeof date.toDate === 'function' ? date.toDate() : new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
};
const ReportIssue = ({ open, onClose, machineId }) => {
  const [activeTab, setActiveTab] = useState('oee');
  const [oeeCategory, setOeeCategory] = useState('Availability');
  const [oeeReasonsSel, setOeeReasonsSel] = useState([]);
  const [oeeCustomReason, setOeeCustomReason] = useState('');
  const [oeeTimes, setOeeTimes] = useState([null, null]);
  const [machineStatus, setMachineStatus] = useState('ON');
  const [breakdownCategory, setBreakdownCategory] = useState('Availability');
  const [breakdownReasonsSel, setBreakdownReasonsSel] = useState([]);
  const [breakdownCustomReason, setBreakdownCustomReason] = useState('');
  const [breakdownAdditional, setBreakdownAdditional] = useState('');
  const [componentStatus, setComponentStatus] = useState('Available');
  const [orders, setOrders] = useState([]);
  const [parts, setParts] = useState([]);
  const [orderId, setOrderId] = useState(null);
  const [partId, setPartId] = useState(null);
  const [operations, setOperations] = useState([]);
  const [operationId, setOperationId] = useState(null);
  const [componentDesc, setComponentDesc] = useState('');
  
  // Help & Support state variables
  const [helpOrderId, setHelpOrderId] = useState(null);
  const [helpPartId, setHelpPartId] = useState(null);
  const [helpOperations, setHelpOperations] = useState([]);
  const [helpOperationId, setHelpOperationId] = useState(null);
  const [helpDescription, setHelpDescription] = useState('');
  const [helpParts, setHelpParts] = useState([]);
  
  // Selected job from localStorage
  const [selectedJob, setSelectedJob] = useState(null);
  const operatorId = useMemo(() => getUserId(), []);
  useEffect(() => {
    if (open) {
      // Read selected job from localStorage
      try {
        const job = localStorage.getItem('selectedJob');
        if (job) {
          const parsedJob = JSON.parse(job);
          setSelectedJob(parsedJob);
          // Auto-fill component issue fields
          setOrderId(parsedJob.sale_order_id);
          setPartId(parsedJob.part_id);
          setOperationId(parsedJob.operation_id);
          // Auto-fill help support fields
          setHelpOrderId(parsedJob.sale_order_id);
          setHelpPartId(parsedJob.part_id);
          setHelpOperationId(parsedJob.operation_id);
          // Fetch operations for the part
          fetch(`${API_BASE_URL}/operations/part/${parsedJob.part_id}`, { headers: { accept: 'application/json' } })
            .then(async (r) => {
              if (r.ok) {
                const data = await r.json();
                const arr = Array.isArray(data) ? data : [];
                setOperations(arr);
                setHelpOperations(arr);
              }
            })
            .catch(() => {});
        } else {
          setSelectedJob(null);
        }
      } catch (e) {
        setSelectedJob(null);
      }
      
      fetch(`${API_BASE_URL}/orders/`).then(async (r) => {
        if (r.ok) {
          const data = await r.json();
          setOrders(Array.isArray(data) ? data : []);
        }
      }).catch(() => {});
    }
  }, [open]);
  useEffect(() => {
    if (!orderId) {
      setParts([]);
      setPartId(null);
      setOperations([]);
      setOperationId(null);
      return;
    }
    const orderObj = orders.find(o => o.id === orderId);
    const saleOrderNumber = orderObj?.sale_order_number || orderObj?.order_no || orderObj?.id;
    if (!saleOrderNumber) {
      setParts([]);
      return;
    }
    fetch(`${API_BASE_URL}/orders/sale-order/${saleOrderNumber}/parts`, { headers: { accept: 'application/json' } })
      .then(async (r) => {
        if (r.ok) {
          const data = await r.json();
          const arr = Array.isArray(data) ? data : [];
          const normalized = arr
            .map((item) => {
              const p = item?.part ?? item;
              const id = p?.part_id ?? p?.id;
              if (id == null) return null;
              const part_number = p?.part_number ?? p?.part_no ?? null;
              const part_name = p?.part_name ?? p?.name ?? null;
              return { id, part_number, part_name };
            })
            .filter(Boolean);
          const unique = Object.values(
            normalized.reduce((acc, cur) => {
              acc[cur.id] = acc[cur.id] || cur;
              return acc;
            }, {})
          );
          setParts(unique);
        } else {
          setParts([]);
        }
      })
      .catch(() => setParts([]));
  }, [orderId, orders]);
  
  // Fetch operations when part is selected for Component Issue
  useEffect(() => {
    if (!partId) {
      setOperations([]);
      setOperationId(null);
      return;
    }
    fetch(`${API_BASE_URL}/operations/part/${partId}`, { headers: { accept: 'application/json' } })
      .then(async (r) => {
        if (r.ok) {
          const data = await r.json();
          const arr = Array.isArray(data) ? data : [];
          setOperations(arr);
        } else {
          setOperations([]);
        }
      })
      .catch(() => setOperations([]));
  }, [partId]);
  
  // Help & Support parts fetch effect
  useEffect(() => {
    if (!helpOrderId) {
      setHelpParts([]);
      setHelpPartId(null);
      setHelpOperations([]);
      setHelpOperationId(null);
      return;
    }
    const orderObj = orders.find(o => o.id === helpOrderId);
    const saleOrderNumber = orderObj?.sale_order_number || orderObj?.order_no || orderObj?.id;
    if (!saleOrderNumber) {
      setHelpParts([]);
      return;
    }
    fetch(`${API_BASE_URL}/orders/sale-order/${saleOrderNumber}/parts`, { headers: { accept: 'application/json' } })
      .then(async (r) => {
        if (r.ok) {
          const data = await r.json();
          const arr = Array.isArray(data) ? data : [];
          const normalized = arr
            .map((item) => {
              const p = item?.part ?? item;
              const id = p?.part_id ?? p?.id;
              if (id == null) return null;
              const part_number = p?.part_number ?? p?.part_no ?? null;
              const part_name = p?.part_name ?? p?.name ?? null;
              return { id, part_number, part_name };
            })
            .filter(Boolean);
          const unique = Object.values(
            normalized.reduce((acc, cur) => {
              acc[cur.id] = acc[cur.id] || cur;
              return acc;
            }, {})
          );
          setHelpParts(unique);
        } else {
          setHelpParts([]);
        }
      })
      .catch(() => setHelpParts([]));
  }, [helpOrderId, orders]);
  
  // Fetch operations when part is selected for Help & Support
  useEffect(() => {
    if (!helpPartId) {
      setHelpOperations([]);
      setHelpOperationId(null);
      return;
    }
    fetch(`${API_BASE_URL}/operations/part/${helpPartId}`, { headers: { accept: 'application/json' } })
      .then(async (r) => {
        if (r.ok) {
          const data = await r.json();
          const arr = Array.isArray(data) ? data : [];
          setHelpOperations(arr);
        } else {
          setHelpOperations([]);
        }
      })
      .catch(() => setHelpOperations([]));
  }, [helpPartId]);
  const resetAll = () => {
    setActiveTab('oee');
    setOeeCategory('Availability');
    setOeeReasonsSel([]);
    setOeeCustomReason('');
    setOeeTimes([null, null]);
    setMachineStatus('ON');
    setBreakdownCategory('Availability');
    setBreakdownReasonsSel([]);
    setBreakdownCustomReason('');
    setBreakdownAdditional('');
    setComponentStatus('Available');
    setOrderId(null);
    setPartId(null);
    setOperationId(null);
    setOperations([]);
    setComponentDesc('');
    // Reset Help & Support state
    setHelpOrderId(null);
    setHelpPartId(null);
    setHelpOperationId(null);
    setHelpOperations([]);
    setHelpDescription('');
    setHelpParts([]);
    setSelectedJob(null);
  };
  const handleClose = () => {
    resetAll();
    onClose?.();
  };
  const categoryButtonStyle = (isActive) => ({
    borderRadius: 9999,
    paddingInline: 20,
    backgroundColor: isActive ? '#1677ff' : '#ffffff',
    color: isActive ? '#ffffff' : '#111827',
    borderColor: isActive ? '#1677ff' : '#d1d5db',
  });
  const submitOEE = async () => {
    if (!machineId || !operatorId) {
      message.error('Machine or operator not found');
      return;
    }
    if (!oeeCategory || oeeReasonsSel.length === 0 || !oeeTimes[0] || !oeeTimes[1]) {
      message.error('Fill all required fields');
      return;
    }
    if (oeeReasonsSel.includes('Other') && !oeeCustomReason.trim()) {
      message.error('Please specify the custom issue reason');
      return;
    }
    let finalReasons = [...oeeReasonsSel];
    if (oeeReasonsSel.includes('Other') && oeeCustomReason.trim()) {
      finalReasons = finalReasons.filter(r => r !== 'Other');
      finalReasons.push(oeeCustomReason.trim());
    }
    const payload = {
      machine_id: parseInt(machineId),
      reported_by: parseInt(operatorId),
      issue_category: oeeCategory,
      issue_reason: finalReasons,
      start_time: formatLocalNaive(oeeTimes[0]),
      end_time: formatLocalNaive(oeeTimes[1]),
      reported_at: formatLocalNaive(new Date()),
    };
    try {
      const res = await fetch(`${API_BASE_URL}/maintenance/oee-issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to submit OEE issue');
      message.success('OEE issue submitted');
      handleClose();
    } catch (e) {
      message.error(e.message);
    }
  };
  const submitBreakdown = async () => {
    if (!machineId || !operatorId) {
      message.error('Machine or operator not found');
      return;
    }
    if (!machineStatus || !breakdownCategory || breakdownReasonsSel.length === 0) {
      message.error('Fill all required fields');
      return;
    }
    if (breakdownReasonsSel.includes('Other') && !breakdownCustomReason.trim()) {
      message.error('Please specify the custom issue reason');
      return;
    }
    let finalReasons = [...breakdownReasonsSel];
    if (breakdownReasonsSel.includes('Other') && breakdownCustomReason.trim()) {
      finalReasons = finalReasons.filter(r => r !== 'Other');
      finalReasons.push(breakdownCustomReason.trim());
    }
    const payload = {
      machine_id: parseInt(machineId),
      reported_by: parseInt(operatorId),
      issue_category: breakdownCategory,
      machine_status: machineStatus,
      issue_reason: finalReasons,
      additional_reason: breakdownAdditional || null,
      reported_at: formatLocalNaive(new Date()),
    };
    try {
      const res = await fetch(`${API_BASE_URL}/maintenance/machine-breakdown`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to submit machine breakdown');
      message.success('Machine breakdown submitted');
      handleClose();
    } catch (e) {
      message.error(e.message);
    }
  };
  const submitComponent = async () => {
    if (!machineId || !operatorId) {
      message.error('Machine or operator not found');
      return;
    }
    if (!componentStatus || !orderId || !partId || !operationId || !componentDesc) {
      message.error('Fill all required fields');
      return;
    }
    const payload = {
      machine_id: parseInt(machineId),
      reported_by: parseInt(operatorId),
      component_status: componentStatus,
      production_order_id: parseInt(orderId),
      part_id: parseInt(partId),
      operation_id: parseInt(operationId),
      description: componentDesc,
      reported_at: formatLocalNaive(new Date()),
    };
    try {
      const res = await fetch(`${API_BASE_URL}/maintenance/component-issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to submit component issue');
      message.success('Component issue submitted');
      handleClose();
    } catch (e) {
      message.error(e.message);
    }
  };
  
  const submitHelpSupport = async () => {
    if (!machineId || !operatorId) {
      message.error('Machine or operator not found');
      return;
    }
    if (!helpOrderId || !helpPartId || !helpOperationId || !helpDescription) {
      message.error('Fill all required fields');
      return;
    }
    const payload = {
      machine_id: parseInt(machineId),
      reported_by: parseInt(operatorId),
      production_order_id: parseInt(helpOrderId),
      part_id: parseInt(helpPartId),
      operation_id: parseInt(helpOperationId),
      description: helpDescription,
      reported_at: formatLocalNaive(new Date()),
    };
    try {
      const res = await fetch(`${API_BASE_URL}/maintenance/help-support`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to submit help support request');
      message.success('Help support request submitted');
      handleClose();
    } catch (e) {
      message.error(e.message);
    }
  };
  return (
    <Modal
      open={open}
      onCancel={handleClose}
      footer={null}
      width={720}
      centered
      maskClosable={false}
      keyboard={false}
      bodyStyle={{ paddingTop: 16 }}
      title={
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <WarningOutlined style={{ color: '#ef4444' }} />
          <span style={{ fontWeight: 600, color: '#ef4444' }}>Raise Ticket</span>
        </div>
      }
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        tabBarGutter={32}
        tabBarStyle={{ marginBottom: 24 }}
      >
        <TabPane
          key="oee"
          tab={
            <span>
              <WarningOutlined style={{ marginRight: 6 }} />
              OEE Issue
            </span>
          }
        >
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <Text strong><span style={{ color: '#ef4444' }}>*</span> Issue Category</Text>
            <Space>
              {categoryOptions.map((c) => {
                const active = oeeCategory === c;
                return (
                  <Button
                    key={c}
                    type="default"
                    onClick={() => setOeeCategory(c)}
                    style={categoryButtonStyle(active)}
                  >
                    {c}
                  </Button>
                );
              })}
            </Space>
            <Text strong><span style={{ color: '#ef4444' }}>*</span> Issue Reason (description)</Text>
            <Select
              mode="multiple"
              value={oeeReasonsSel}
              onChange={setOeeReasonsSel}
              placeholder="Select reasons"
              style={{ width: '100%' }}
              options={oeeReasons.map((r) => ({ label: r, value: r }))}
            />
            {oeeReasonsSel.includes('Other') && (
              <>
                <Text strong><span style={{ color: '#ef4444' }}>*</span> Please specify the issue</Text>
                <TextArea 
                  rows={2} 
                  value={oeeCustomReason} 
                  onChange={(e) => setOeeCustomReason(e.target.value)} 
                  placeholder="Enter custom issue reason..."
                />
              </>
            )}
            <Text strong><span style={{ color: '#ef4444' }}>*</span> Start and End Time</Text>
            <Space>
              <DatePicker
                showTime
                value={oeeTimes[0]}
                onChange={(v) => {
                  if (oeeTimes[1] && v && v.isAfter(oeeTimes[1])) {
                    setOeeTimes([v, null]);
                  } else {
                    setOeeTimes([v, oeeTimes[1]]);
                  }
                }}
                style={{ width: 280 }}
              />
              <DatePicker
                showTime
                value={oeeTimes[1]}
                onChange={(v) => setOeeTimes([oeeTimes[0], v])}
                style={{ width: 280 }}
                disabledDate={(current) => oeeTimes[0] && current && current.isBefore(oeeTimes[0], 'day')}
              />
            </Space>
            <Button
              type="primary"
              block
              onClick={submitOEE}
              style={{
                background: '#ef4444',
                borderColor: '#ef4444',
                borderRadius: 9999,
                height: 44,
                fontWeight: 600,
              }}
            >
              Submit OEE Issue Report
            </Button>
          </Space>
        </TabPane>
        <TabPane
          key="breakdown"
          tab={
            <span>
              <ToolOutlined style={{ marginRight: 6 }} />
              Machine Breakdown
            </span>
          }
        >
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <Text strong><span style={{ color: '#ef4444' }}>*</span> Machine Status</Text>
            <Select
              value={machineStatus}
              onChange={setMachineStatus}
              style={{ width: '100%' }}
              options={[
                { label: 'ON - Machine is Available', value: 'ON' },
                { label: 'OFF - Machine Not Available', value: 'OFF' },
              ]}
            />
            <Text strong><span style={{ color: '#ef4444' }}>*</span> Issue Category</Text>
            <Space>
              {categoryOptions.map((c) => {
                const active = breakdownCategory === c;
                return (
                  <Button
                    key={c}
                    type="default"
                    onClick={() => setBreakdownCategory(c)}
                    style={categoryButtonStyle(active)}
                  >
                    {c}
                  </Button>
                );
              })}
            </Space>
            <Text strong><span style={{ color: '#ef4444' }}>*</span> Issue Reason (description)</Text>
            <Select
              mode="multiple"
              value={breakdownReasonsSel}
              onChange={setBreakdownReasonsSel}
              placeholder="Select reasons"
              style={{ width: '100%' }}
              options={breakdownReasons.map((r) => ({ label: r, value: r }))}
            />
            {breakdownReasonsSel.includes('Other') && (
              <>
                <Text strong><span style={{ color: '#ef4444' }}>*</span> Please specify the issue</Text>
                <TextArea 
                  rows={2} 
                  value={breakdownCustomReason} 
                  onChange={(e) => setBreakdownCustomReason(e.target.value)} 
                  placeholder="Enter custom issue reason..."
                />
              </>
            )}
            <Text strong>Additional Description (Optional)</Text>
            <TextArea rows={4} value={breakdownAdditional} onChange={(e) => setBreakdownAdditional(e.target.value)} />
            <Button
              type="primary"
              block
              onClick={submitBreakdown}
              style={{
                background: '#ef4444',
                borderColor: '#ef4444',
                borderRadius: 9999,
                height: 44,
                fontWeight: 600,
              }}
            >
              Submit Machine Issue
            </Button>
          </Space>
        </TabPane>
        <TabPane
          key="component"
          tab={
            <span>
              <LockOutlined style={{ marginRight: 6 }} />
              Component Issue
            </span>
          }
        >
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <Text strong><span style={{ color: '#ef4444' }}>*</span> Component Status</Text>
            <Select
              value={componentStatus}
              onChange={setComponentStatus}
              style={{ width: '100%' }}
              options={componentStatusOpts.map((s) => ({ label: s, value: s }))}
            />
            <Text strong><span style={{ color: '#ef4444' }}>*</span> Production Order</Text>
            {selectedJob ? (
              <Input
                value={selectedJob.sale_order_number || ''}
                disabled
                style={{ width: '100%', backgroundColor: '#f5f5f5' }}
              />
            ) : (
              <Select
                value={orderId}
                onChange={(v) => { setOrderId(v); setPartId(null); }}
                placeholder="Select production order"
                style={{ width: '100%' }}
                showSearch
                optionFilterProp="label"
                options={orders.map((o) => ({ label: o.sale_order_number ?? o.order_no ?? o.id, value: o.id }))}
              />
            )}
            <Text strong><span style={{ color: '#ef4444' }}>*</span> Part Name</Text>
            {selectedJob ? (
              <Input
                value={selectedJob.part_number ? `${selectedJob.part_name} (${selectedJob.part_number})` : selectedJob.part_name || ''}
                disabled
                style={{ width: '100%', backgroundColor: '#f5f5f5' }}
              />
            ) : (
              <Select
                value={partId}
                onChange={(v) => { setPartId(v); setOperationId(null); }}
                placeholder="Select part"
                style={{ width: '100%' }}
                showSearch
                optionFilterProp="label"
                options={parts.map((p) => {
                  const pid = p?.part_id ?? p?.id;
                  const partName = p.part_name || '';
                  const partNum = p.part_number || '';
                  const label = partNum ? `${partName} (${partNum})` : (partName || (pid ? `Part #${pid}` : 'Part'));
                  return { label, value: pid };
                })}
              />
            )}
            <Text strong><span style={{ color: '#ef4444' }}>*</span> Operation</Text>
            {selectedJob ? (
              <Input
                value={selectedJob.operation_number ? `${selectedJob.operation_name} (${selectedJob.operation_number})` : selectedJob.operation_name || ''}
                disabled
                style={{ width: '100%', backgroundColor: '#f5f5f5' }}
              />
            ) : (
              <Select
                value={operationId}
                onChange={setOperationId}
                placeholder="Select operation"
                style={{ width: '100%' }}
                showSearch
                optionFilterProp="label"
                options={operations.map((op) => {
                  const opName = op.operation_name || '';
                  const opNum = op.operation_number || '';
                  const label = opNum ? `${opName} (${opNum})` : (opName || `Operation #${op.id}`);
                  return { label, value: op.id };
                })}
              />
            )}
            <Text strong><span style={{ color: '#ef4444' }}>*</span> Description</Text>
            <TextArea rows={4} value={componentDesc} onChange={(e) => setComponentDesc(e.target.value)} />
            <Button
              type="primary"
              block
              onClick={submitComponent}
              style={{
                background: '#ef4444',
                borderColor: '#ef4444',
                borderRadius: 9999,
                height: 44,
                fontWeight: 600,
              }}
            >
              Submit Component Issue
            </Button>
          </Space>
        </TabPane>
        <TabPane
          key="help"
          tab={
            <span>
              <CustomerServiceOutlined style={{ marginRight: 6 }} />
              Help & Support
            </span>
          }
        >
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <Text strong><span style={{ color: '#ef4444' }}>*</span> Production Order</Text>
            {selectedJob ? (
              <Input
                value={selectedJob.sale_order_number || ''}
                disabled
                style={{ width: '100%', backgroundColor: '#f5f5f5' }}
              />
            ) : (
              <Select
                value={helpOrderId}
                onChange={(v) => { setHelpOrderId(v); setHelpPartId(null); }}
                placeholder="Select production order"
                style={{ width: '100%' }}
                showSearch
                optionFilterProp="label"
                options={orders.map((o) => ({ label: o.sale_order_number ?? o.order_no ?? o.id, value: o.id }))}
              />
            )}
            <Text strong><span style={{ color: '#ef4444' }}>*</span> Part Name</Text>
            {selectedJob ? (
              <Input
                value={selectedJob.part_number ? `${selectedJob.part_name} (${selectedJob.part_number})` : selectedJob.part_name || ''}
                disabled
                style={{ width: '100%', backgroundColor: '#f5f5f5' }}
              />
            ) : (
              <Select
                value={helpPartId}
                onChange={(v) => { setHelpPartId(v); setHelpOperationId(null); }}
                placeholder="Select part"
                style={{ width: '100%' }}
                showSearch
                optionFilterProp="label"
                options={helpParts.map((p) => {
                  const pid = p?.part_id ?? p?.id;
                  const partName = p.part_name || '';
                  const partNum = p.part_number || '';
                  const label = partNum ? `${partName} (${partNum})` : (partName || (pid ? `Part #${pid}` : 'Part'));
                  return { label, value: pid };
                })}
              />
            )}
            <Text strong><span style={{ color: '#ef4444' }}>*</span> Operation</Text>
            {selectedJob ? (
              <Input
                value={selectedJob.operation_number ? `${selectedJob.operation_name} (${selectedJob.operation_number})` : selectedJob.operation_name || ''}
                disabled
                style={{ width: '100%', backgroundColor: '#f5f5f5' }}
              />
            ) : (
              <Select
                value={helpOperationId}
                onChange={setHelpOperationId}
                placeholder="Select operation"
                style={{ width: '100%' }}
                showSearch
                optionFilterProp="label"
                options={helpOperations.map((op) => {
                  const opName = op.operation_name || '';
                  const opNum = op.operation_number || '';
                  const label = opNum ? `${opName} (${opNum})` : (opName || `Operation #${op.id}`);
                  return { label, value: op.id };
                })}
              />
            )}
            <Text strong><span style={{ color: '#ef4444' }}>*</span> Description</Text>
            <TextArea rows={4} value={helpDescription} onChange={(e) => setHelpDescription(e.target.value)} />
            <Button
              type="primary"
              block
              onClick={submitHelpSupport}
              style={{
                background: '#ef4444',
                borderColor: '#ef4444',
                borderRadius: 9999,
                height: 44,
                fontWeight: 600,
              }}
            >
              Submit Help & Support
            </Button>
          </Space>
        </TabPane>
      </Tabs>
    </Modal>
  );
};
export default ReportIssue;
