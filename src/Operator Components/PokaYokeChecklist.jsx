import React, { useEffect, useMemo, useState } from 'react';
import {Modal,Button,Typography,List,Input,InputNumber,Select,Spin,message} from 'antd';
import {CheckCircleOutlined,CloseOutlined,FileTextOutlined,InfoCircleOutlined,CheckOutlined} from '@ant-design/icons';
import { API_BASE_URL } from '../Config/auth.js';

const { Title, Text } = Typography;

const PokaYokeChecklist = ({ open, onClose, machineId: propMachineId }) => {
  const nowIST = () => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
        .formatToParts(new Date())
        .map((p) => [p.type, p.value])
    );
    const ms = String(new Date().getMilliseconds()).padStart(3, '0');
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${ms}`;
  };
  const [loading, setLoading] = useState(false);
  const [assignments, setAssignments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [namesByChecklistId, setNamesByChecklistId] = useState({});
  const [items, setItems] = useState([]);
  const [activeStep, setActiveStep] = useState(1);
  const [responses, setResponses] = useState({});
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [comments, setComments] = useState('');
  const [parts, setParts] = useState([]);
  const [partsLoading, setPartsLoading] = useState(false);
  const [selectedPartId, setSelectedPartId] = useState(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMeta, setSuccessMeta] = useState({ orderText: '', partText: '' });

  const machineId = useMemo(() => {
    if (propMachineId) return propMachineId;
    try {
      const stored = localStorage.getItem('selectedMachine');
      if (!stored) return null;
      const m = JSON.parse(stored);
      return m?.id ?? m?.machine_id ?? m?.machineId ?? m?.machine?.id ?? null;
    } catch {
      return null;
    }
  }, [propMachineId]);

  const operatorId = useMemo(() => {
    try {
      const storedRaw =
        localStorage.getItem('selectedOperator') ??
        localStorage.getItem('operator') ??
        localStorage.getItem('selectedUser') ??
        localStorage.getItem('user');
      if (!storedRaw) return null;
      let o = null;
      try {
        o = JSON.parse(storedRaw);
      } catch {
        o = storedRaw;
      }
      return (
        o?.id ??
        o?.operator_id ??
        o?.operatorId ??
        o?.user_id ??
        o?.userId ??
        o?.user?.id ??
        null
      );
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setShowSuccess(false);
      setSuccessMeta({ orderText: '', partText: '' });
    }
  }, [open]);
  useEffect(() => {
    const fetchAssignments = async () => {
      if (!open) return;
      if (!machineId) {
        setAssignments([]);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(
          `${API_BASE_URL}/pokayoke-checklists/machines/${machineId}/assignments`,
          {
            headers: { accept: 'application/json' },
          }
        );
        const data = await res.json();
        const arr = Array.isArray(data) ? data : [];
        setAssignments(arr);
        const ids = arr
          .map((it) => it?.checklist_id ?? it?.pokayoke_checklist_id ?? it?.checklistId ?? it?.checklist?.id ?? null)
          .filter((id) => id !== null);
        const missing = ids.filter((id) => namesByChecklistId[String(id)] === undefined);
        if (missing.length > 0) {
          const results = await Promise.all(
            missing.map(async (id) => {
              try {
                const r = await fetch(`${API_BASE_URL}/pokayoke-checklists/${id}`, {
                  headers: { accept: 'application/json' },
                });
                const d = await r.json();
                const nm = d?.name ?? d?.title ?? `Checklist #${id}`;
                return [String(id), nm];
              } catch {
                return [String(id), `Checklist #${id}`];
              }
            })
          );
          const merged = { ...namesByChecklistId };
          results.forEach(([id, nm]) => {
            merged[id] = nm;
          });
          setNamesByChecklistId(merged);
        }
      } catch {
        setAssignments([]);
      } finally {
        setLoading(false);
      }
    };
    fetchAssignments();
  }, [open, machineId]);

  useEffect(() => {
    const run = async () => {
      if (!selected) {
        setItems([]);
        setActiveStep(1);
        return;
      }
      setActiveStep(2);
      const checklistId =
        selected?.checklist_id ??
        selected?.pokayoke_checklist_id ??
        selected?.checklistId ??
        selected?.checklist?.id ??
        null;
      if (!checklistId) {
        setItems([]);
        return;
      }
      try {
        const res = await fetch(`${API_BASE_URL}/pokayoke-checklists/${checklistId}/items`, {
          headers: { accept: 'application/json' },
        });
        const data = await res.json();
        const arr = Array.isArray(data) ? data : [];
        setItems(arr);
        setResponses({});
      } catch {
        setItems([]);
      }
    };
    run();
  }, [selected]);

  useEffect(() => {
    const loadOrders = async () => {
      if (activeStep !== 2) return;
      setOrdersLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/orders/`, {
          headers: { accept: 'application/json' },
        });
        const data = await res.json();
        const arr = Array.isArray(data) ? data : [];
        setOrders(arr);
      } catch {
        setOrders([]);
      } finally {
        setOrdersLoading(false);
      }
    };
    loadOrders();
  }, [activeStep]);

  useEffect(() => {
    const loadParts = async () => {
      setSelectedPartId(null);
      setParts([]);
      if (!selectedOrderId) return;
      setPartsLoading(true);
      try {
        const orderObj = orders.find(o => o.id === selectedOrderId);
        const saleOrderNumber = orderObj?.sale_order_number || orderObj?.order_number || orderObj?.id;
        if (!saleOrderNumber) {
           setParts([]);
           return;
        }
        const res = await fetch(`${API_BASE_URL}/orders/sale-order/${saleOrderNumber}/parts`, {
          headers: { accept: 'application/json' },
        });
        const data = await res.json();
        const arr = Array.isArray(data) ? data : [];
        setParts(arr);
      } catch {
        setParts([]);
      } finally {
        setPartsLoading(false);
      }
    };
    loadParts();
  }, [selectedOrderId, orders]);
  // Compute if any response is non-conforming (answer "No" when expected "Yes", etc.)
  const hasNonConforming = useMemo(() => {
    const truthy = new Set(['true', 'yes', 'y', '1', 'on']);
    const falsy = new Set(['false', 'no', 'n', '0', 'off']);
    return items.some((it) => {
      const id = it?.id ?? it?.item_text ?? it?.name ?? 'Item';
      const val = responses[id];
      const exp = it?.expected_value ?? it?.expected ?? it?.expectedValue;
      const typeRaw = (it?.item_type ?? it?.type ?? '').toLowerCase();
      if (val === undefined || val === null) return false;
      if (typeRaw.includes('bool')) {
        const v = String(val).toLowerCase();
        const e = exp != null ? String(exp).toLowerCase() : 'true';
        const vBool = truthy.has(v) ? true : falsy.has(v) ? false : null;
        const eBool = truthy.has(e) ? true : falsy.has(e) ? false : true;
        if (vBool === null) return true;
        return vBool !== eBool;
      } else if (typeRaw.includes('num')) {
        const vNum = typeof val === 'number' ? val : parseFloat(String(val));
        const eNum = exp != null ? parseFloat(String(exp)) : null;
        if (eNum == null || Number.isNaN(vNum) || Number.isNaN(eNum)) return false;
        return vNum !== eNum;
      } else {
        if (exp == null) return false;
        return String(val).toLowerCase().trim() !== String(exp).toLowerCase().trim();
      }
    });
  }, [items, responses]);

  // Check if all required items are completed
  const allRequiredComplete = useMemo(() => {
    return items
      .filter((it) => it?.is_required ?? it?.required ?? it?.mandatory ?? false)
      .every((it) => {
        const id = it?.id ?? it?.item_text ?? it?.name ?? 'Item';
        const val = responses[id];
        return val !== undefined && val !== null && val !== '';
      });
  }, [items, responses]);

  const checklistId =
    selected?.checklist_id ??
    selected?.pokayoke_checklist_id ??
    selected?.checklistId ??
    selected?.checklist?.id ??
    null;
  const requirePart = parts.length > 0;
  const canSubmit =
    Boolean(machineId) &&
    Boolean(checklistId) &&
    Boolean(selectedOrderId) &&
    Boolean(operatorId) &&
    (!requirePart || Boolean(selectedPartId)) &&
    allRequiredComplete;

  const handleSubmit = async () => {
    if (!canSubmit || submitLoading) return;
    setSubmitLoading(true);
    try {
      const selectedAssignment = selected;
      const assignmentId = selectedAssignment?.id ?? null;
      const assignmentFrequency = selectedAssignment?.frequency ?? null;
      const assignmentShift = selectedAssignment?.shift ?? null;
      
      const payload = {
        machine_id: machineId ?? null,
        checklist_id: checklistId,
        assignment_id: assignmentId,
        frequency: assignmentFrequency,
        shift: assignmentShift,
        production_order_id: selectedOrderId,
        order_id: selectedOrderId,
        part_id: selectedPartId ?? null,
        operator_id: operatorId ?? null,
        comments: comments ?? '',
        completed_at: nowIST(),
        all_items_passed: !hasNonConforming && allRequiredComplete,
        responses: items
          .map((it) => {
            const id = it?.id ?? null;
            const key = id ?? (it?.item_text ?? it?.name ?? 'Item');
            const value = responses[key];
            if (value === undefined || value === null) return null;
            return {
              item_id: id,
              value,
            };
          })
          .filter(Boolean),
      };
      const res = await fetch(`${API_BASE_URL}/pokayoke-completed-logs/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let detail = 'Submission failed';
        try {
          const err = await res.json();
          detail = err?.detail ? JSON.stringify(err.detail) : detail;
        } catch {
          const errText = await res.text();
          detail = errText || detail;
        }
        throw new Error(detail);
      }
      let created;
      try {
        created = await res.json();
      } catch {
        created = null;
      }
      const createdId =
        created?.id ??
        created?.log_id ??
        created?.pokayoke_completed_log_id ??
        created?.data?.id ??
        null;
      if (createdId && Array.isArray(payload.responses) && payload.responses.length > 0) {
        const truthy = new Set(['true', 'yes', 'y', '1', 'on']);
        const falsy = new Set(['false', 'no', 'n', '0', 'off']);
        for (const r of payload.responses) {
          try {
            const item = items.find((it) => (it?.id ?? null) === r.item_id);
            const typeRaw = (item?.item_type ?? item?.type ?? '').toLowerCase();
            const expected = item?.expected_value ?? item?.expected ?? item?.expectedValue ?? null;
            const valStr = String(r.value);
            let isConfirming = false;
            if (typeRaw.includes('bool')) {
              const vBool = truthy.has(valStr.toLowerCase()) ? true : falsy.has(valStr.toLowerCase()) ? false : null;
              const e = expected != null ? String(expected).toLowerCase() : 'true';
              const eBool = truthy.has(e) ? true : falsy.has(e) ? false : true;
              isConfirming = vBool !== null && vBool === eBool;
            } else if (typeRaw.includes('num')) {
              const vNum = parseFloat(valStr);
              const eNum = expected != null ? parseFloat(String(expected)) : null;
              isConfirming = eNum != null && !Number.isNaN(vNum) && !Number.isNaN(eNum) && vNum === eNum;
            } else {
              isConfirming =
                expected != null &&
                valStr.toLowerCase().trim() === String(expected).toLowerCase().trim();
            }
            const singlePayload = {
              completed_log_id: createdId,
              item_id: r.item_id,
              response_value: valStr,
              is_confirming: Boolean(isConfirming),
              timestamp: nowIST(),
            };
            await fetch(`${API_BASE_URL}/pokayoke-completed-logs/item-responses`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', accept: 'application/json' },
              body: JSON.stringify(singlePayload),
            });
          } catch {
          }
        }
      }
      const chosenOrder = orders.find((o) => String(o?.id) === String(selectedOrderId));
      const orderText =
        chosenOrder?.sale_order_number ??
        chosenOrder?.order_number ??
        chosenOrder?.order_name ??
        chosenOrder?.name ??
        chosenOrder?.title ??
        (selectedOrderId != null ? String(selectedOrderId) : '');

      const chosenPart = parts.find((p) => String(p?.part_id ?? p?.id) === String(selectedPartId));
      const partText =
        chosenPart?.part_number ??
        chosenPart?.part_name ??
        chosenPart?.name ??
        (selectedPartId != null ? String(selectedPartId) : '');

      setSuccessMeta({ orderText, partText });
      setShowSuccess(true);
      message.success('Checklist submitted');
      setSubmitLoading(false);
    } catch (e) {
      message.error(String(e?.message || 'Submit failed'));
      setSubmitLoading(false);
    }
  };

  const handleNewChecklist = () => {
    setShowSuccess(false);
    setSuccessMeta({ orderText: '', partText: '' });
    setSelected(null);
    setItems([]);
    setResponses({});
    setActiveStep(1);
    setSelectedOrderId(null);
    setSelectedPartId(null);
    setComments('');
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={780}
      closable={false}
      styles={{
        content: { padding: 0, borderRadius: 12, overflow: 'hidden' },
      }}
    >
      {/* Header */}
      <div
        style={{
          background: showSuccess ? '#fff' : '#1677FF',
          padding: showSuccess ? '14px 20px' : '12px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: showSuccess ? '1px solid #eef2f7' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {showSuccess ? (
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: 9,
                border: '2px solid #1677FF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#1677FF',
                fontSize: 12,
                lineHeight: 1,
                fontWeight: 700,
              }}
            >
              ✓
            </div>
          ) : (
            <CheckCircleOutlined style={{ color: '#fff', fontSize: 20 }} />
          )}
          <span
            style={{
              color: showSuccess ? '#0f172a' : '#fff',
              fontWeight: 600,
              fontSize: showSuccess ? 14 : 16,
            }}
          >
            Poka Yoke Checklist
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: showSuccess ? '#94a3b8' : '#fff',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
            fontSize: showSuccess ? 16 : 18,
          }}
        >
          <CloseOutlined />
        </button>
      </div>

      <div
        style={{
          padding: showSuccess ? 28 : 24,
          maxHeight: showSuccess ? undefined : '70vh',
          overflowY: showSuccess ? undefined : 'auto',
        }}
      >
        {showSuccess ? (
          <div
            style={{
              minHeight: 260,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              gap: 10,
            }}
          >
            <div
              style={{
                width: 84,
                height: 84,
                borderRadius: 42,
                background: '#22c55e',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 4,
              }}
            >
              <CheckOutlined style={{ color: '#fff', fontSize: 38 }} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#0f172a' }}>
              Checklist Completed Successfully!
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              {successMeta?.orderText ? `Production Order: ${successMeta.orderText}` : 'Production Order: —'}
              {successMeta?.partText ? ` | Part: ${successMeta.partText}` : ''}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <Button type="primary" onClick={handleNewChecklist} style={{ borderRadius: 8 }}>
                New Checklist
              </Button>
              <Button onClick={onClose} style={{ borderRadius: 8 }}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <>
        {/* Title block */}
        <div
          style={{
            background: '#E6F4FF',
            border: '1px solid #dbeafe',
            borderRadius: 12,
            padding: 16,
            marginBottom: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <FileTextOutlined style={{ fontSize: 24, color: '#1677FF' }} />
            <Title level={4} style={{ margin: 0 }}>
              Poka Yoke Checklist
            </Title>
          </div>
          <Text style={{ color: '#64748b', fontSize: 14 }}>
            Complete the required checklist items to ensure quality standards are met.
          </Text>
        </div>

        {/* Step indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 0,
            marginBottom: 24,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: activeStep === 2 ? '#1677FF' : '#E6F4FF',
                border: '2px solid #1677FF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: activeStep === 2 ? '#fff' : '#1677FF',
                fontSize: activeStep === 2 ? 18 : 16,
                fontWeight: 600,
              }}
            >
              {activeStep === 2 ? <CheckOutlined /> : '1'}
            </div>
            <div style={{ marginTop: 8, textAlign: 'center' }}>
              <div style={{ fontWeight: 600, color: '#0f172a' }}>Select Checklist</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                Choose from assigned checklists
              </div>
            </div>
          </div>
          <div
            style={{
              flex: 1,
              minWidth: 60,
              height: 2,
              background: activeStep === 2 ? '#1677FF' : '#e2e8f0',
              marginTop: 18,
              marginLeft: 8,
              marginRight: 8,
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: activeStep === 2 ? '#E6F4FF' : '#f1f5f9',
                border: `2px solid ${activeStep === 2 ? '#1677FF' : '#e2e8f0'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: activeStep === 2 ? '#1677FF' : '#94a3b8',
                fontSize: 16,
                fontWeight: 600,
              }}
            >
              2
            </div>
            <div style={{ marginTop: 8, textAlign: 'center' }}>
              <div style={{ fontWeight: 600, color: activeStep === 2 ? '#0f172a' : '#94a3b8' }}>
                Complete Items
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                Fill all required items
              </div>
            </div>
          </div>
        </div>

        {/* Step 1: Checklist list */}
        {activeStep === 1 && (
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <Spin />
                <div style={{ marginTop: 12, color: '#94a3b8' }}>Loading checklists...</div>
              </div>
            ) : assignments.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                No assigned checklists
              </div>
            ) : (
              assignments.map((item, idx) => {
                const cidRaw =
                  item?.checklist_id ??
                  item?.pokayoke_checklist_id ??
                  item?.checklistId ??
                  item?.checklist?.id ??
                  null;
                const cid = cidRaw != null ? String(cidRaw) : null;
                const name =
                  namesByChecklistId[cid] ??
                  item?.name ??
                  item?.title ??
                  (cid ? `Checklist #${cid}` : 'Checklist');
                const frequency = item?.frequency ?? item?.checklist?.frequency ?? null;
                const shift = item?.shift ?? item?.checklist?.shift ?? null;
                const scheduledDay = item?.scheduled_day ?? item?.checklist?.scheduled_day ?? null;
                
                // Build frequency display text and style
                let frequencyDisplay = frequency || '';
                let badgeStyle = { padding: '2px 8px', borderRadius: 4 };
                
                if (frequency) {
                  const freqLower = frequency.toLowerCase();
                  if (freqLower === 'daily' && shift) {
                    frequencyDisplay = `${frequency} (${shift})`;
                    badgeStyle = { ...badgeStyle, background: '#dcfce7', color: '#16a34a' }; // Green for Daily
                  } else if (freqLower === 'weekly' && scheduledDay) {
                    frequencyDisplay = `${frequency} (${scheduledDay})`;
                    badgeStyle = { ...badgeStyle, background: '#fef3c7', color: '#d97706' }; // Amber for Weekly
                  } else if (freqLower === 'monthly' && scheduledDay) {
                    frequencyDisplay = `${frequency} (${scheduledDay})`;
                    badgeStyle = { ...badgeStyle, background: '#ede9fe', color: '#7c3aed' }; // Purple for Monthly
                  } else {
                    badgeStyle = { ...badgeStyle, background: '#f0f9ff', color: '#0284c7' }; // Default blue
                  }
                }
                
                return (
                  <div
                    key={cid ?? idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '16px 20px',
                      borderBottom: idx < assignments.length - 1 ? '1px solid #e2e8f0' : 'none',
                      gap: 16,
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 10,
                        background: '#E0F2FE',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <FileTextOutlined style={{ fontSize: 22, color: '#0284c7' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>
                        {name}
                      </div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>
                        {frequencyDisplay && (
                          <span style={badgeStyle}>
                            {frequencyDisplay}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      type="primary"
                      onClick={() => setSelected(item)}
                      style={{ borderRadius: 8 }}
                    >
                      Select
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Step 2: Complete items */}
        {activeStep === 2 && selected && (
          <div>
            <div
              style={{
                background: '#E6F4FF',
                border: '1px solid #dbeafe',
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 12 }}>Select Production Order</div>
              <Select
                loading={ordersLoading}
                value={selectedOrderId}
                onChange={(v) => setSelectedOrderId(v)}
                placeholder="Select a production order"
                style={{ width: '100%' }}
                options={orders.map((o) => ({
                  value: o?.id,
                  label:
                    o?.name ??
                    o?.order_name ??
                    o?.title ??
                    o?.sale_order_number ??
                    o?.order_number ??
                    (o?.id ? `Order #${o.id}` : 'Order'),
                }))}
              />
              <div style={{ fontWeight: 600, marginTop: 12, marginBottom: 12 }}>Select Part</div>
              <Select
                disabled={!selectedOrderId}
                loading={partsLoading}
                value={selectedPartId}
                onChange={(v) => setSelectedPartId(v)}
                placeholder="Select a part"
                style={{ width: '100%' }}
                options={parts.map((p) => {
                  const pid = p?.part_id ?? p?.id;
                  const label =
                    p?.part_name ??
                    p?.name ??
                    p?.part_number ??
                    (pid ? `Part #${pid}` : 'Part');
                  return { value: pid, label };
                })}
              />
            </div>

            {/* Info alert */}
            <div
              style={{
                background: '#E6F4FF',
                border: '1px solid #dbeafe',
                borderRadius: 12,
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                marginBottom: 20,
              }}
            >
              <InfoCircleOutlined style={{ fontSize: 18, color: '#1677FF', marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 600, color: '#0f172a' }}>
                  Please complete all required items
                </div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                  Items marked as required must be completed before submission.
                </div>
              </div>
            </div>

            {/* Checklist items */}
            <div style={{ marginBottom: 24 }}>
              {items.map((it, idx) => {
                const nm =
                  it?.item_text ?? it?.name ?? it?.title ?? it?.label ?? 'Item';
                const required =
                  it?.is_required ?? it?.required ?? it?.mandatory ?? false;
                const expected =
                  it?.expected_value ?? it?.expected ?? it?.expectedValue ?? null;
                const typeRaw = (it?.item_type ?? it?.type ?? '').toLowerCase();
                const isBoolean = typeRaw.includes('bool');
                const isNumeric = typeRaw.includes('num');
                const isString = !isBoolean && !isNumeric;
                const id = it?.id ?? nm;
                const value = responses[id];
                const setValue = (val) =>
                  setResponses((prev) => ({ ...prev, [id]: val }));

                const truthy = new Set(['true', 'yes', 'y', '1', 'on']);
                const falsy = new Set(['false', 'no', 'n', '0', 'off']);
                let isConforming = false;
                if (value !== undefined && value !== null) {
                  if (isBoolean) {
                    const v = String(value).toLowerCase();
                    const e = expected != null ? String(expected).toLowerCase() : 'true';
                    const vBool = truthy.has(v) ? true : falsy.has(v) ? false : null;
                    const eBool = truthy.has(e) ? true : falsy.has(e) ? false : true;
                    isConforming = vBool !== null && vBool === eBool;
                  } else if (isNumeric) {
                    const vNum = typeof value === 'number' ? value : parseFloat(String(value));
                    const eNum = expected != null ? parseFloat(String(expected)) : null;
                    isConforming = eNum != null && !Number.isNaN(vNum) && !Number.isNaN(eNum) && vNum === eNum;
                  } else {
                    isConforming =
                      expected != null &&
                      String(value).toLowerCase().trim() === String(expected).toLowerCase().trim();
                  }
                }
                const isNonConforming = Boolean(value !== undefined && value !== null && !isConforming);

                return (
                  <div
                    key={id}
                    style={{
                      padding: '16px 0',
                      borderBottom:
                        idx < items.length - 1 ? '1px solid #e2e8f0' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          background: '#E6F4FF',
                          border: '1px solid #dbeafe',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#1677FF',
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        {typeof it?.sequence_number === 'number' ? it.sequence_number : idx + 1}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>
                          {nm}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                          {required && (
                            <span
                              style={{
                                background: '#E6F4FF',
                                color: '#1677FF',
                                padding: '2px 10px',
                                borderRadius: 9999,
                                fontSize: 12,
                                fontWeight: 500,
                              }}
                            >
                              Required
                            </span>
                          )}
                          {isNonConforming && (
                            <span
                              style={{
                                background: '#fef2f2',
                                color: '#dc2626',
                                padding: '2px 10px',
                                borderRadius: 9999,
                                fontSize: 12,
                                fontWeight: 500,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <CloseOutlined style={{ fontSize: 10 }} />
                              Non-conforming
                            </span>
                          )}
                          {isConforming && (
                            <span
                              style={{
                                background: '#dcfce7',
                                color: '#16a34a',
                                padding: '2px 10px',
                                borderRadius: 9999,
                                fontSize: 12,
                                fontWeight: 500,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <CheckOutlined style={{ fontSize: 10 }} />
                              Conforming
                            </span>
                          )}
                        </div>
                        {isBoolean && (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              onClick={() => setValue('yes')}
                              style={{
                                padding: '8px 20px',
                                borderRadius: 8,
                                border: value === 'yes' ? 'none' : '1px solid #e2e8f0',
                                background: value === 'yes' ? '#E6F4FF' : '#fff',
                                color: value === 'yes' ? '#1677FF' : '#64748b',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 8,
                                fontWeight: 500,
                              }}
                            >
                              <CheckOutlined
                                style={{
                                  color: value === 'yes' ? '#16a34a' : '#94a3b8',
                                  fontSize: 14,
                                }}
                              />
                              Yes
                            </button>
                            <button
                              onClick={() => setValue('no')}
                              style={{
                                padding: '8px 20px',
                                borderRadius: 8,
                                border: value === 'no' ? 'none' : '1px solid #e2e8f0',
                                background: value === 'no' ? '#dc2626' : '#fff',
                                color: value === 'no' ? '#fff' : '#64748b',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 8,
                                fontWeight: 500,
                              }}
                            >
                              <CloseOutlined
                                style={{
                                  color: value === 'no' ? '#fff' : '#94a3b8',
                                  fontSize: 14,
                                }}
                              />
                              No
                            </button>
                          </div>
                        )}
                        {isNumeric && (
                          <InputNumber
                            value={value}
                            onChange={(v) => setValue(v)}
                            style={{ width: 220 }}
                          />
                        )}
                        {isString && (
                          <Input
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            style={{ width: '100%', maxWidth: 280 }}
                          />
                        )}
                        {expected != null && (
                          <div
                            style={{
                              fontSize: 12,
                              color: '#94a3b8',
                              marginTop: 8,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <InfoCircleOutlined style={{ fontSize: 12 }} />
                            Expected: {String(expected)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Additional Comments */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Additional Comments</div>
              <Input.TextArea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Enter any additional comments or observations..."
                rows={4}
                style={{ borderRadius: 8 }}
              />
            </div>

            {/* Footer */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                flexWrap: 'wrap',
                paddingTop: 16,
                borderTop: '1px solid #e2e8f0',
              }}
            >
              {hasNonConforming ? (
                <div
                  style={{
                    background: '#FFFBEB',
                    border: '1px solid #FDE68A',
                    borderRadius: 8,
                    padding: '10px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    flex: 1,
                    minWidth: 200,
                  }}
                >
                  <span style={{ color: '#d97706', fontSize: 16 }}>⚠</span>
                  <span style={{ color: '#92400e', fontSize: 13, fontWeight: 500 }}>
                    Non-conforming responses detected
                  </span>
                </div>
              ) : (
                <div />
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <Button onClick={() => setSelected(null)} style={{ borderRadius: 8 }}>
                  Back
                </Button>
                <Button
                  type="primary"
                  disabled={!canSubmit || submitLoading}
                  icon={<CheckOutlined />}
                  style={{ borderRadius: 8 }}
                  loading={submitLoading}
                  onClick={handleSubmit}
                >
                  Submit Checklist
                </Button>
              </div>
            </div>
          </div>
        )}
          </>
        )}
      </div>
    </Modal>
  );
};

export default PokaYokeChecklist;
