import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Tabs, Button, Select, Input, DatePicker, message, Space, Typography } from 'antd';
import { WarningOutlined, ToolOutlined, LockOutlined } from '@ant-design/icons';
import { API_BASE_URL } from '../Config/auth.js';
const { TabPane } = Tabs;
const { TextArea } = Input;
const { Text } = Typography;
const categoryOptions = ['Availability', 'Quality', 'Performance'];
const oeeReasons = ['Machine Oeeissue', 'Tool Change', 'Setup/Adjustment', 'Power Failure', 'Material Shortage', 'Planned Maintenance'];
const breakdownReasons = ['Machine Breakdown', 'Electrical Issue', 'Mechanical Issue', 'Hydraulic Issue', 'Pneumatic Issue', 'Software Issue', 'Emergency Stop'];
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
  const [oeeTimes, setOeeTimes] = useState([null, null]);
  const [machineStatus, setMachineStatus] = useState('ON');
  const [breakdownCategory, setBreakdownCategory] = useState('Availability');
  const [breakdownReasonsSel, setBreakdownReasonsSel] = useState([]);
  const [breakdownAdditional, setBreakdownAdditional] = useState('');
  const [componentStatus, setComponentStatus] = useState('Available');
  const [orders, setOrders] = useState([]);
  const [parts, setParts] = useState([]);
  const [orderId, setOrderId] = useState(null);
  const [partId, setPartId] = useState(null);
  const [componentDesc, setComponentDesc] = useState('');
  const operatorId = useMemo(() => getUserId(), []);
  useEffect(() => {
    if (open) {
      fetch(`${API_BASE_URL}/orders/?skip=0&limit=1000`).then(async (r) => {
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
  const resetAll = () => {
    setActiveTab('oee');
    setOeeCategory('Availability');
    setOeeReasonsSel([]);
    setOeeTimes([null, null]);
    setMachineStatus('ON');
    setBreakdownCategory('Availability');
    setBreakdownReasonsSel([]);
    setBreakdownAdditional('');
    setComponentStatus('Available');
    setOrderId(null);
    setPartId(null);
    setComponentDesc('');
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
    const payload = {
      machine_id: parseInt(machineId),
      reported_by: parseInt(operatorId),
      issue_category: oeeCategory,
      issue_reason: oeeReasonsSel,
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
    const payload = {
      machine_id: parseInt(machineId),
      reported_by: parseInt(operatorId),
      issue_category: breakdownCategory,
      machine_status: machineStatus,
      issue_reason: breakdownReasonsSel,
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
    if (!componentStatus || !orderId || !partId || !componentDesc) {
      message.error('Fill all required fields');
      return;
    }
    const payload = {
      machine_id: parseInt(machineId),
      reported_by: parseInt(operatorId),
      component_status: componentStatus,
      production_order_id: parseInt(orderId),
      part_id: parseInt(partId),
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
            <Select
              value={orderId}
              onChange={(v) => { setOrderId(v); setPartId(null); }}
              placeholder="Select production order"
              style={{ width: '100%' }}
              showSearch
              optionFilterProp="label"
              options={orders.map((o) => ({ label: o.sale_order_number ?? o.order_no ?? o.id, value: o.id }))}
            />
            <Text strong><span style={{ color: '#ef4444' }}>*</span> Part Name</Text>
            <Select
              value={partId}
              onChange={setPartId}
              placeholder="Select part"
              style={{ width: '100%' }}
              showSearch
              optionFilterProp="label"
              options={parts.map((p) => {
                const pid = p?.part_id ?? p?.id;
                const label = p.part_name || (pid ? `Part #${pid}` : 'Part');
                return { label, value: pid };
              })}
            />
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
      </Tabs>
    </Modal>
  );
};
export default ReportIssue;
