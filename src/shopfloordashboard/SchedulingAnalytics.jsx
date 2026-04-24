import React, { useMemo, useState } from 'react';
import { Card, Table, Tag, Space, Typography, Collapse, Empty, Alert, Row, Col, Statistic, DatePicker, Radio, Tooltip, Spin } from 'antd';
import {
  CalendarOutlined,
  ClockCircleOutlined,
  ToolOutlined,
  ShoppingCartOutlined,
  SettingOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
  FilterOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Text, Title } = Typography;
const { Panel } = Collapse;

const SchedulingAnalytics = ({ machines, viewMode }) => {
  // Filter states for heatmap
  const [filterMode, setFilterMode] = useState('month'); // 'day', 'month', 'year', 'custom'
  const [selectedDate, setSelectedDate] = useState(dayjs());
  const [customStartDate, setCustomStartDate] = useState(dayjs().startOf('month'));
  const [customEndDate, setCustomEndDate] = useState(dayjs().endOf('month'));
  const [isLoading, setIsLoading] = useState(false);

  // Filter and process scheduled items
  const scheduledData = useMemo(() => {
    const data = [];
    
    machines.forEach(machine => {
      const scheduledItems = machine.parts_operations
        .filter(op => op.planned_schedule && op.planned_schedule.planned_start_time)
        .map(op => ({
          machine_id: machine.machine_id,
          machine_make: machine.machine_make,
          machine_model: machine.machine_model,
          machine_type: machine.machine_type,
          work_center: machine.work_center,
          operation_id: op.operation_id,
          operation_name: op.operation_name,
          operation_number: op.operation_number,
          part_id: op.part_id,
          part_name: op.part_name,
          part_number: op.part_number,
          order_id: op.order_id,
          sale_order_number: op.sale_order_number,
          planned_start_time: op.planned_schedule.planned_start_time,
          planned_end_time: op.planned_schedule.planned_end_time,
          total_quantity: op.planned_schedule.total_quantity
        }))
        .sort((a, b) => new Date(a.planned_start_time) - new Date(b.planned_start_time));

      if (scheduledItems.length > 0) {
        data.push({
          machine,
          scheduledItems
        });
      }
    });

    return data;
  }, [machines]);

  // Calculate availability gaps for each machine
  const availabilityGaps = useMemo(() => {
    const gaps = {};

    scheduledData.forEach(({ machine, scheduledItems }) => {
      const machineGaps = [];
      const sortedItems = [...scheduledItems].sort((a, b) => new Date(a.planned_start_time) - new Date(b.planned_start_time));

      // Find gaps between scheduled items
      for (let i = 0; i < sortedItems.length - 1; i++) {
        const currentEnd = new Date(sortedItems[i].planned_end_time);
        const nextStart = new Date(sortedItems[i + 1].planned_start_time);
        const gapDuration = nextStart - currentEnd;

        if (gapDuration > 0) {
          machineGaps.push({
            start: currentEnd,
            end: nextStart,
            duration: gapDuration,
            durationHours: (gapDuration / (1000 * 60 * 60)).toFixed(2)
          });
        }
      }

      // Gap before first scheduled item
      if (sortedItems.length > 0) {
        const firstStart = new Date(sortedItems[0].planned_start_time);
        const now = new Date();
        if (firstStart > now) {
          machineGaps.unshift({
            start: now,
            end: firstStart,
            duration: firstStart - now,
            durationHours: ((firstStart - now) / (1000 * 60 * 60)).toFixed(2)
          });
        }
      }

      gaps[machine.machine_id] = machineGaps;
    });

    return gaps;
  }, [scheduledData]);

  // Calculate statistics
  const statistics = useMemo(() => {
    let totalScheduled = 0;
    let totalMachinesWithSchedule = 0;
    let totalGaps = 0;

    scheduledData.forEach(({ machine, scheduledItems }) => {
      totalScheduled += scheduledItems.length;
      totalMachinesWithSchedule++;
      totalGaps += availabilityGaps[machine.machine_id]?.length || 0;
    });

    return {
      totalScheduled,
      totalMachinesWithSchedule,
      totalMachines: machines.length,
      totalGaps
    };
  }, [scheduledData, availabilityGaps, machines.length]);

  // Transform data for calendar heatmap view with filtering
  const heatmapData = useMemo(() => {
    setIsLoading(true);
    const data = [];
    const now = dayjs().startOf('day');
    let startDate, endDate, daysCount;

    if (filterMode === 'day') {
      startDate = selectedDate.startOf('day');
      endDate = selectedDate.endOf('day');
      daysCount = 1;
    } else if (filterMode === 'month') {
      startDate = selectedDate.startOf('month');
      endDate = selectedDate.endOf('month');
      daysCount = selectedDate.daysInMonth();
    } else if (filterMode === 'year') {
      startDate = selectedDate.startOf('year');
      endDate = selectedDate.endOf('year');
      const year = selectedDate.year();
      const isLeap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
      daysCount = isLeap ? 366 : 365;
    } else if (filterMode === 'custom') {
      startDate = customStartDate.startOf('day');
      endDate = customEndDate.endOf('day');
      // Limit custom range to 60 days for performance
      const maxDays = 60;
      const actualDays = endDate.diff(startDate, 'day') + 1;
      if (actualDays > maxDays) {
        endDate = startDate.add(maxDays - 1, 'day');
        daysCount = maxDays;
      } else {
        daysCount = actualDays;
      }
    }

    // Create data points for each machine and each day
    machines.forEach(machine => {
      const scheduledItems = machine.parts_operations
        .filter(op => op.planned_schedule && op.planned_schedule.planned_start_time);

      for (let i = 0; i < daysCount; i++) {
        const currentDate = startDate.add(i, 'day');
        const dateStr = currentDate.format('DD-MM-YYYY');
        const isPastDate = currentDate.isBefore(now, 'day');
        const isToday = currentDate.isSame(now, 'day');

        // Check if machine has any scheduled operations on this day
        const daySchedule = scheduledItems.filter(op => {
          const opDate = dayjs(op.planned_schedule.planned_start_time);
          return opDate.isSame(currentDate, 'day');
        });

        if (daySchedule.length > 0) {
          daySchedule.forEach(op => {
            data.push({
              machine: `${machine.machine_make} ${machine.machine_model}`,
              machineId: machine.machine_id,
              date: dateStr,
              dateObj: currentDate,
              order: op.sale_order_number,
              part: op.part_name,
              partNumber: op.part_number,
              operation: op.operation_name,
              operationNumber: op.operation_number,
              start: dayjs(op.planned_schedule.planned_start_time).format('HH:mm'),
              end: dayjs(op.planned_schedule.planned_end_time).format('HH:mm'),
              duration: ((new Date(op.planned_schedule.planned_end_time) - new Date(op.planned_schedule.planned_start_time)) / (1000 * 60 * 60)).toFixed(1),
              quantity: op.total_quantity,
              status: 'scheduled',
              isPastDate,
              isToday
            });
          });
        } else {
          // Determine status based on date
          let status;
          if (isPastDate) {
            status = 'not_scheduled';
          } else if (isToday) {
            status = 'today_available';
          } else {
            status = 'available';
          }

          data.push({
            machine: `${machine.machine_make} ${machine.machine_model}`,
            machineId: machine.machine_id,
            date: dateStr,
            dateObj: currentDate,
            order: null,
            part: null,
            partNumber: null,
            operation: null,
            operationNumber: null,
            start: null,
            end: null,
            duration: 0,
            quantity: 0,
            status,
            isPastDate,
            isToday
          });
        }
      }
    });

    // Clear loading after a short delay to allow UI to render
    setTimeout(() => setIsLoading(false), 100);

    return { data, daysCount, startDate };
  }, [machines, filterMode, selectedDate, customStartDate, customEndDate]);


  const formatDateTime = (dateTime) => {
    if (!dateTime) return 'N/A';
    const d = new Date(dateTime);
    return d.toLocaleDateString('en-GB').replace(/\//g, '-') + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };

  const getDuration = (start, end) => {
    if (!start || !end) return 'N/A';
    const duration = new Date(end) - new Date(start);
    const hours = Math.floor(duration / (1000 * 60 * 60));
    const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const columns = [
    {
      title: 'Machine',
      key: 'machine',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong style={{ fontSize: 13 }}>
            <SettingOutlined style={{ color: '#1890ff', marginRight: 4 }} />
            {record.machine_make} {record.machine_model}
          </Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {record.machine_type} • {record.work_center}
          </Text>
        </Space>
      )
    },
    {
      title: 'Order',
      dataIndex: 'sale_order_number',
      key: 'sale_order_number',
      render: (text) => (
        <Space>
          <ShoppingCartOutlined style={{ color: '#722ed1' }} />
          <span style={{ fontWeight: 500 }}>{text}</span>
        </Space>
      )
    },
    {
      title: 'Part',
      key: 'part',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: 12, fontWeight: 500 }}>{record.part_name}</Text>
          <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>{record.part_number}</Tag>
        </Space>
      )
    },
    {
      title: 'Operation',
      key: 'operation',
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: 12 }}>{record.operation_name}</Text>
          <Tag color="cyan" style={{ fontSize: 10, margin: 0 }}>#{record.operation_number}</Tag>
        </Space>
      )
    },
    {
      title: 'Quantity',
      dataIndex: 'total_quantity',
      key: 'total_quantity',
      render: (text) => <Text strong>{text || '-'}</Text>
    },
    {
      title: 'Start Time',
      dataIndex: 'planned_start_time',
      key: 'planned_start_time',
      render: (text) => (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: 11, color: '#52c41a' }}>
            <CalendarOutlined style={{ marginRight: 4 }} />
            {formatDateTime(text)}
          </Text>
        </Space>
      )
    },
    {
      title: 'End Time',
      dataIndex: 'planned_end_time',
      key: 'planned_end_time',
      render: (text) => (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: 11, color: '#f5222d' }}>
            <CalendarOutlined style={{ marginRight: 4 }} />
            {formatDateTime(text)}
          </Text>
        </Space>
      )
    },
    {
      title: 'Duration',
      key: 'duration',
      render: (_, record) => (
        <Text style={{ fontSize: 12 }}>
          <ClockCircleOutlined style={{ marginRight: 4, color: '#1890ff' }} />
          {getDuration(record.planned_start_time, record.planned_end_time)}
        </Text>
      )
    }
  ];

  if (scheduledData.length === 0) {
    return (
      <div style={{ padding: '24px' }}>
        <Alert
          message="No Scheduled Items"
          description="There are currently no scheduled operations for any machine."
          type="info"
          showIcon
          icon={<InfoCircleOutlined />}
        />
      </div>
    );
  }

  return (
    <div>
      {/* Statistics Cards - Only show for table view */}
      {viewMode === 'table' && (
        <Row gutter={[12, 12]} style={{ marginBottom: '12px' }}>
          <Col xs={24} sm={12} md={6}>
            <Card size="small" style={{ borderRadius: '8px' }}>
              <Statistic
                title="Total Machines"
                value={statistics.totalMachines}
                valueStyle={{ color: '#1890ff', fontSize: '20px' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small" style={{ borderRadius: '8px' }}>
              <Statistic
                title="Machines with Schedule"
                value={statistics.totalMachinesWithSchedule}
                valueStyle={{ color: '#52c41a', fontSize: '20px' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small" style={{ borderRadius: '8px' }}>
              <Statistic
                title="Total Scheduled Operations"
                value={statistics.totalScheduled}
                valueStyle={{ color: '#722ed1', fontSize: '20px' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card size="small" style={{ borderRadius: '8px' }}>
              <Statistic
                title="Available Time Slots"
                value={statistics.totalGaps}
                valueStyle={{ color: '#faad14', fontSize: '20px' }}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* Calendar Heatmap View - Compact Layout with Filters */}
      {viewMode === 'heatmap' && (
        <Card
          title={
            <Space size="middle">
              <span>Machine Schedule Calendar Heatmap</span>
              <Space size="small" style={{ marginLeft: 16 }}>
                <Tooltip title="Scheduled">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: 12, height: 12, background: '#1890ff', borderRadius: '2px' }}></div>
                    <Text style={{ fontSize: '10px' }}>Scheduled</Text>
                  </div>
                </Tooltip>
                <Tooltip title="Available for scheduling">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: 12, height: 12, background: '#52c41a', borderRadius: '2px' }}></div>
                    <Text style={{ fontSize: '10px' }}>Available</Text>
                  </div>
                </Tooltip>
                <Tooltip title="Not Scheduled (Past dates)">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: 12, height: 12, background: '#ff4d4f', borderRadius: '2px' }}></div>
                    <Text style={{ fontSize: '10px' }}>Not Scheduled</Text>
                  </div>
                </Tooltip>
                <Tooltip title="Today">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: 12, height: 12, background: '#52c41a', border: '2px solid #faad14', borderRadius: '2px' }}></div>
                    <Text style={{ fontSize: '10px' }}>Today</Text>
                  </div>
                </Tooltip>
              </Space>
            </Space>
          }
          extra={
            <Space>
              <Radio.Group
                value={filterMode}
                onChange={(e) => setFilterMode(e.target.value)}
                optionType="button"
                buttonStyle="solid"
                size="small"
              >
                <Radio.Button value="day">Day</Radio.Button>
                <Radio.Button value="month">Month</Radio.Button>
                <Radio.Button value="year">Year</Radio.Button>
                <Radio.Button value="custom">Custom</Radio.Button>
              </Radio.Group>
              {filterMode !== 'custom' ? (
                <DatePicker
                  picker={filterMode}
                  value={selectedDate}
                  onChange={(date) => date && setSelectedDate(date)}
                  size="small"
                  style={{ width: 140 }}
                />
              ) : (
                <Space size="small">
                  <DatePicker
                    placeholder="Start Date"
                    value={customStartDate}
                    onChange={(date) => date && setCustomStartDate(date)}
                    size="small"
                    style={{ width: 120 }}
                  />
                  <Text style={{ fontSize: '12px' }}>to</Text>
                  <DatePicker
                    placeholder="End Date"
                    value={customEndDate}
                    onChange={(date) => date && setCustomEndDate(date)}
                    size="small"
                    style={{ width: 120 }}
                  />
                </Space>
              )}
            </Space>
          }
          style={{ marginBottom: '12px', borderRadius: '8px' }}
        >

          <Spin spinning={isLoading} tip="Loading calendar data...">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr style={{ background: '#fff' }}>
                  <th style={{ border: '1px solid #d9d9d9', padding: '2px 4px', background: '#fafafa', minWidth: '150px', fontSize: '10px' }}>Machine</th>
                  {Array.from({ length: heatmapData.daysCount }, (_, i) => {
                    const date = heatmapData.startDate.add(i, 'day');
                    const isToday = date.isSame(dayjs(), 'day');
                    const isFirstDayOfMonth = date.date() === 1;
                    const monthIndex = date.month();
                    const solidColors = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96', '#fa541c', '#a0d911', '#2f54eb', '#fadb14', '#ff4d4f'];
                    const monthName = date.format('MMM');
                    const isYearOrCustom = filterMode === 'year' || (filterMode === 'custom' && heatmapData.daysCount > 31);
                    return (
                      <th key={i} style={{
                        border: '1px solid #d9d9d9',
                        borderLeft: isFirstDayOfMonth ? '2px solid #262626' : '1px solid #d9d9d9',
                        padding: '2px',
                        background: isYearOrCustom ? solidColors[monthIndex] : (isToday ? '#fff7e6' : '#fafafa'),
                        minWidth: filterMode === 'year' ? '24px' : (filterMode === 'month' ? '32px' : '50px'),
                        fontSize: filterMode === 'year' ? '7px' : (filterMode === 'month' ? '8px' : '9px')
                      }}>
                        <div style={{ fontWeight: 'bold', color: isYearOrCustom ? '#fff' : '#000' }}>
                          {date.format('DD')}
                        </div>
                        {!isYearOrCustom && filterMode !== 'custom' && <div style={{ fontSize: '7px', color: '#000', fontWeight: 'bold' }}>{date.format('ddd')}</div>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {machines.map(machine => {
                  const machineSchedule = heatmapData.data.filter(d => d.machineId === machine.machine_id);
                  return (
                    <tr key={machine.machine_id} style={{ height: '22px' }}>
                      <td style={{ border: '1px solid #d9d9d9', padding: '1px 4px', fontWeight: 'bold', fontSize: '9px', background: '#fff', minWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {machine.machine_make} {machine.machine_model}
                      </td>
                      {Array.from({ length: heatmapData.daysCount }, (_, i) => {
                        const date = heatmapData.startDate.add(i, 'day');
                        const allDayData = machineSchedule.filter(d => d.date === date.format('DD-MM-YYYY'));
                        const scheduledOps = allDayData.filter(d => d.status === 'scheduled');
                        const dayData = scheduledOps[0]; // First one for display
                        const isToday = date.isSame(dayjs(), 'day');
                        const isFirstDayOfMonth = date.date() === 1;
                        const baseBorderLeft = isFirstDayOfMonth ? '2px solid #262626' : '1px solid #d9d9d9';

                        if (scheduledOps.length > 0) {
                          // Build tooltip with all operations
                          const tooltipContent = scheduledOps.map((op, idx) =>
                            `Op ${idx + 1}: ${op.operation}\nOrder: ${op.order}\nPart: ${op.part}\nTime: ${op.start} - ${op.end}\nDuration: ${op.duration} hrs\nQty: ${op.quantity}`
                          ).join('\n\n');

                          return (
                            <td
                              key={i}
                              style={{
                                border: isToday ? '2px solid #faad14' : '1px solid #d9d9d9',
                                borderLeft: baseBorderLeft,
                                padding: '1px',
                                background: '#1890ff',
                                cursor: 'pointer',
                                transition: 'background 0.2s',
                                height: '20px',
                                textAlign: 'center'
                              }}
                              title={tooltipContent}
                              onMouseEnter={(e) => e.target.style.background = '#40a9ff'}
                              onMouseLeave={(e) => e.target.style.background = '#1890ff'}
                            >
                              <div style={{ fontSize: filterMode === 'year' ? '6px' : '8px', color: 'white', fontWeight: 'bold', lineHeight: '1' }}>
                                {scheduledOps.length > 1 ? `${scheduledOps.length} ops` : (filterMode === 'year' ? '•' : dayData.start)}
                              </div>
                            </td>
                          );
                        } else if (allDayData.length > 0 && allDayData[0].status === 'not_scheduled') {
                          return (
                            <td
                              key={i}
                              style={{
                                border: isToday ? '2px solid #faad14' : '1px solid #d9d9d9',
                                borderLeft: baseBorderLeft,
                                padding: '1px',
                                background: '#ff4d4f',
                                cursor: 'pointer',
                                transition: 'background 0.2s',
                                height: '20px'
                              }}
                              title="Not Scheduled (Past Date)"
                              onMouseEnter={(e) => e.target.style.background = '#ff7875'}
                              onMouseLeave={(e) => e.target.style.background = '#ff4d4f'}
                            >
                              <div style={{ fontSize: '7px', color: 'white', textAlign: 'center' }}>
                                {filterMode !== 'year' ? 'NS' : ''}
                              </div>
                            </td>
                          );
                        } else if (dayData && dayData.status === 'today_available') {
                          return (
                            <td
                              key={i}
                              style={{
                                border: '2px solid #faad14',
                                borderLeft: baseBorderLeft,
                                padding: '1px',
                                background: '#52c41a',
                                cursor: 'pointer',
                                transition: 'background 0.2s',
                                height: '20px'
                              }}
                              title="Today - Available for scheduling"
                              onMouseEnter={(e) => e.target.style.background = '#73d13d'}
                              onMouseLeave={(e) => e.target.style.background = '#52c41a'}
                            >
                            </td>
                          );
                        } else {
                          return (
                            <td
                              key={i}
                              style={{
                                border: isToday ? '2px solid #faad14' : '1px solid #d9d9d9',
                                borderLeft: baseBorderLeft,
                                padding: '1px',
                                background: '#52c41a',
                                cursor: 'pointer',
                                transition: 'background 0.2s',
                                height: '20px'
                              }}
                              title="Available for scheduling"
                              onMouseEnter={(e) => e.target.style.background = '#73d13d'}
                              onMouseLeave={(e) => e.target.style.background = '#52c41a'}
                            >
                            </td>
                          );
                        }
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </Spin>
          {filterMode === 'year' && (
            <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((month, idx) => {
                const solidColors = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96', '#fa541c', '#a0d911', '#2f54eb', '#fadb14', '#ff4d4f'];
                return (
                  <div key={month} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: 16, height: 16, background: solidColors[idx], borderRadius: '3px', border: '1px solid #d9d9d9' }}></div>
                    <Text style={{ fontSize: '11px' }}>{month}</Text>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Machine-wise Schedule with Availability Gaps - Table View */}
      {viewMode === 'table' && (
        <Collapse
          defaultActiveKey={[]}
          style={{ background: 'white', borderRadius: '8px' }}
          items={scheduledData.map(({ machine, scheduledItems }) => {
            const machineGaps = availabilityGaps[machine.machine_id] || [];

          return {
            key: machine.machine_id,
            label: (
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Space>
                  <SettingOutlined style={{ color: '#1890ff' }} />
                  <Text strong>{machine.machine_make} {machine.machine_model}</Text>
                  <Tag color="blue">{machine.machine_type}</Tag>
                  <Tag color="default">{scheduledItems.length} scheduled</Tag>
                </Space>
                {machineGaps.length > 0 && (
                  <Tag color="orange" icon={<ClockCircleOutlined />}>
                    {machineGaps.length} available slots
                  </Tag>
                )}
              </Space>
            ),
            children: (
              <div style={{ padding: '12px 0' }}>
                {/* Availability Gaps */}
                {machineGaps.length > 0 && (
                  <div style={{
                    background: '#fff7e6',
                    border: '1px solid #ffd591',
                    borderRadius: '6px',
                    padding: '12px',
                    marginBottom: '12px'
                  }}>
                    <Text strong style={{ color: '#d46b08', marginBottom: '8px', display: 'block' }}>
                      <ClockCircleOutlined style={{ marginRight: 4 }} />
                      Available Time Slots for New Scheduling:
                    </Text>
                    <div style={{
                      background: 'white',
                      padding: '10px',
                      borderRadius: '4px',
                      border: '1px solid #ffd591',
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '12px'
                    }}>
                      {machineGaps.map((gap, index) => (
                        <div key={index} style={{
                          fontSize: 12,
                          padding: '4px 8px',
                          background: '#fff7e6',
                          borderRadius: '4px',
                          border: '1px solid #ffd591'
                        }}>
                          <Text strong>{formatDateTime(gap.start)}</Text>
                          <Text style={{ margin: '0 6px', color: '#8c8c8c' }}>→</Text>
                          <Text strong>{formatDateTime(gap.end)}</Text>
                          <Text style={{ marginLeft: '8px', color: '#d46b08' }}>
                            ({gap.durationHours} hrs)
                          </Text>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Scheduled Items Table */}
                <Table
                  dataSource={scheduledItems}
                  columns={columns}
                  pagination={false}
                  size="small"
                  rowKey="operation_id"
                  scroll={{ x: 1000 }}
                />
              </div>
            )
          };
        })}
      />
      )}
    </div>
  );
};

export { SchedulingAnalytics };
export default SchedulingAnalytics;

