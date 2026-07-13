import React, { useState } from 'react';
import { Card, Typography, Tag, Space, Row, Col, DatePicker, Select, Input, Button, message } from 'antd';
import { ProfileOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { SCHEDULING_API_BASE_URL } from '../Config/schedulingconfig';

const { Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

const ProductionLog = ({ isActivated, selectedJob, cardHeight, onProductionSubmit }) => {
  const [fromDate, setFromDate] = useState(null);
  const [fromHour, setFromHour] = useState(null);
  const [fromMinute, setFromMinute] = useState(null);
  const [toDate, setToDate] = useState(null);
  const [toHour, setToHour] = useState(null);
  const [toMinute, setToMinute] = useState(null);
  const [notes, setNotes] = useState('');
  const [producedQuantity, setProducedQuantity] = useState(0);
  const [reworkSubmitQuantity, setReworkSubmitQuantity] = useState(0);
  const [loading, setLoading] = useState(false);

  const effectivelyActivated = isActivated || 
                                [selectedJob?.status, selectedJob?.operation_status].some(s => {
                                  const up = s?.toString().toUpperCase();
                                  return up === 'INPROGRESS' || up === 'IN-PROGRESS' || up === 'IN PROGRESS';
                                });

  const hourOptions = Array.from({ length: 24 }, (_, i) => i);
  const minuteOptions = Array.from({ length: 60 }, (_, i) => i);

  const handleSubmit = async () => {
    if (!fromDate || fromHour === null || fromMinute === null || !toDate || toHour === null || toMinute === null) {
      message.error('Please fill in all date and time fields.');
      return;
    }

    if (!selectedJob) {
      message.error('No active operation found.');
      return;
    }

    const producedQty = parseInt(producedQuantity, 10) || 0;
    const reworkSubmitQty = parseInt(reworkSubmitQuantity, 10) || 0;

    if (producedQty === 0 && reworkSubmitQty === 0) {
      message.error('Enter at least one quantity: new produced units or rework submit.');
      return;
    }

    let operationId = selectedJob.id || selectedJob.operation_id || selectedJob.job_id || selectedJob.schedule_id;
    if (!operationId) {
      message.error('Operation ID not found. Please check the job selection.');
      return;
    }

    const totalQuantity = selectedJob.total_quantity || selectedJob.quantity || 0;
    if (totalQuantity > 0) {
      try {
        const response = await fetch(`${SCHEDULING_API_BASE_URL}/production-logs/operation/${operationId}?skip=0`);
        if (response.ok) {
          const logs = await response.json();
          const sortedLogs = logs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          const latestLog = sortedLogs[0];
          const remainingToClose = latestLog?.remaining_to_close ?? totalQuantity;
          
          if (remainingToClose <= 0) {
            message.error('Production quota already met. No more production logs can be submitted.');
            return;
          }
        }
      } catch (error) {
        console.error('Error checking production quota:', error);
      }
    }

    setLoading(true);
    try {
      const payload = {
        notes: notes || '',
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
        if (onProductionSubmit) {
          onProductionSubmit(producedQty + reworkSubmitQty);
        }
        setFromDate(null); setFromHour(null); setFromMinute(null);
        setToDate(null); setToHour(null); setToMinute(null);
        setNotes('');
        setProducedQuantity(0);
        setReworkSubmitQuantity(0);
      } else {
        const errorData = await response.json();
        message.error(`Failed to submit production log: ${errorData.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error submitting production log:', error);
      message.error('Failed to submit production log. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Space>
            <ProfileOutlined style={{ color: '#1677FF' }} />
            <span>Production Progress</span>
          </Space>
          <Tag color={effectivelyActivated ? "processing" : "default"}>
            {effectivelyActivated ? "In Progress" : "No operation"}
          </Tag>
        </div>
      }
      style={{ borderRadius: '16px', height: cardHeight, display: 'flex', flexDirection: 'column' }}
      headStyle={{ borderRadius: '16px 16px 0 0' }}
      bodyStyle={{ padding: 16, display: 'flex', flexDirection: 'column', flex: 1, overflow: 'auto' }}
    >
      <div style={{
        background: effectivelyActivated ? '#f0f9ff' : '#E6F4FF',
        border: '1px solid #e6e6e6',
        borderRadius: 12,
        padding: 16,
        opacity: effectivelyActivated ? 1 : 0.7,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Text style={{ fontWeight: 600 }}>Production Log Entry</Text>
        </div>

        <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
          <Col xs={24} md={12}>
            <Text style={{ display: 'block', marginBottom: 6 }}>From Date &amp; Time</Text>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <DatePicker 
                style={{ flex: '1 1 100%', marginBottom: 4 }}
                disabled={!effectivelyActivated} 
                value={fromDate} 
                onChange={setFromDate}
                format="DD-MM-YYYY"
              />
              <Select placeholder="H" style={{ flex: 1, minWidth: 60 }}
                disabled={!effectivelyActivated} value={fromHour} onChange={setFromHour}>
                {hourOptions.map(h => <Option key={h} value={h}>{h}</Option>)}
              </Select>
              <Select placeholder="M" style={{ flex: 1, minWidth: 60 }}
                disabled={!effectivelyActivated} value={fromMinute} onChange={setFromMinute}>
                {minuteOptions.map(m => <Option key={m} value={m}>{m}</Option>)}
              </Select>
            </div>
          </Col>
          <Col xs={24} md={12}>
            <Text style={{ display: 'block', marginBottom: 6 }}>To Date &amp; Time</Text>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <DatePicker 
                style={{ flex: '1 1 100%', marginBottom: 4 }}
                disabled={!effectivelyActivated} 
                value={toDate} 
                onChange={setToDate}
                format="DD-MM-YYYY"
                disabledDate={(current) => fromDate && current && current.isBefore(fromDate, 'day')}
              />
              <Select placeholder="H" style={{ flex: 1, minWidth: 60 }}
                disabled={!effectivelyActivated} value={toHour} onChange={setToHour}>
                {hourOptions.map(h => <Option key={h} value={h}>{h}</Option>)}
              </Select>
              <Select placeholder="M" style={{ flex: 1, minWidth: 60 }}
                disabled={!effectivelyActivated} value={toMinute} onChange={setToMinute}>
                {minuteOptions.map(m => <Option key={m} value={m}>{m}</Option>)}
              </Select>
            </div>
          </Col>
        </Row>

        <Text style={{ display: 'block', marginBottom: 6 }}>Produced Quantity (new units)</Text>
        <Input
          type="number"
          placeholder="First-run or reject replacement"
          disabled={!effectivelyActivated}
          value={producedQuantity}
          onChange={(e) => setProducedQuantity(e.target.value)}
          min={0}
          style={{ marginBottom: 12 }}
        />

        <Text style={{ display: 'block', marginBottom: 6 }}>Rework Submit Quantity</Text>
        <Input
          type="number"
          placeholder="Same parts reworked"
          disabled={!effectivelyActivated}
          value={reworkSubmitQuantity}
          onChange={(e) => setReworkSubmitQuantity(e.target.value)}
          min={0}
          style={{ marginBottom: 12 }}
        />

        <Text style={{ display: 'block', marginBottom: 6 }}>Notes (optional)</Text>
        <TextArea 
          rows={3} 
          placeholder="Enter notes"
          disabled={!effectivelyActivated} 
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          style={{ 
            resize: 'vertical',
            maxHeight: '80px',
            minHeight: '72px'
          }}
        />

        <Button type="primary" block loading={loading}
          disabled={!effectivelyActivated} onClick={handleSubmit}
          style={{
            marginTop: 12,
            background: effectivelyActivated ? '#1677FF' : '#EEF2FF',
            color: effectivelyActivated ? '#fff' : '#64748b',
            borderColor: effectivelyActivated ? '#1677FF' : '#e6e6e6',
          }}
        >
          Submit Production Log
        </Button>
      </div>
    </Card>
  );
};

export default ProductionLog;
