import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Timeline } from 'vis-timeline/standalone';
import 'vis-timeline/styles/vis-timeline-graph2d.css';
import { Empty, Space, Select, DatePicker, Button, Tooltip, Spin, Alert, Badge, Radio } from 'antd';
import { ZoomIn, ZoomOut, Maximize, RefreshCw, Pause, Play } from 'lucide-react';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

const VIEW_MODES = {
  daily: {
    label: 'Daily',
    getRange: () => [dayjs().startOf('day'), dayjs().endOf('day')],
    scale: 'hour',
    step: 1
  },
  weekly: {
    label: 'Weekly',
    getRange: () => [dayjs().startOf('week'), dayjs().endOf('week')],
    scale: 'day',
    step: 1
  },
  monthly: {
    label: 'Monthly',
    getRange: () => [dayjs().startOf('month'), dayjs().endOf('month')],
    scale: 'day',
    step: 1
  }
};

const MACHINE_COLORS = [
  '#10B981', // green
  '#3B82F6', // blue
  '#F59E42', // orange
  '#EF4444', // red
  '#A78BFA', // purple
  '#FBBF24', // yellow
  '#6366F1', // indigo
  '#EC4899', // pink
  '#22D3EE', // cyan
  '#6EE7B7', // teal
];

const ROW_TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'production', label: 'Operator Log' },
  { value: 'live', label: 'Machine Timeline' },
  { value: 'issues', label: 'Operator Issues' },
];

const ALL_ROW_TYPES = ['scheduled', 'production', 'live', 'issues'];

const LegendSwatch = ({ color, label }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 4 }}>
    <span
      style={{
        width: 14,
        height: 14,
        borderRadius: 3,
        backgroundColor: color,
        display: 'inline-block',
        flexShrink: 0,
      }}
    />
    <span style={{ fontSize: 12, color: '#374151', fontWeight: 400 }}>{label}</span>
  </span>
);
const SimpleGanttChart = ({ 
  data = [],
  machines = [],
  dateRange, 
  selectedMachine,
  onDateChange,
  onMachineChange,
  onSubmit,
  onClear,
  isLoading,
  error
}) => {
  const containerRef = useRef(null);
  const timelineRef = useRef(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [viewMode, setViewMode] = useState('daily');
  const [selectedOrder, setSelectedOrder] = useState('all');
  const [selectedRowTypes, setSelectedRowTypes] = useState('all'); 
  // Extract unique production orders from data
  const productionOrders = React.useMemo(() => {
    const orders = new Set();
    data.forEach(item => {
      if (item.po) {
        orders.add(item.po);
      } else if (item.sale_order_number) {
        orders.add(item.sale_order_number);
      }
    });
    return Array.from(orders).sort();
  }, [data]);
  
  // Handle production order selection from parent component
  useEffect(() => {
    if (selectedOrder && selectedOrder !== 'all') {
      // Find the first item with this production order to ensure it's in view
      const firstMatchingItem = data.find(item => 
        item.po === selectedOrder || item.sale_order_number === selectedOrder
      );
      
      if (firstMatchingItem && timelineRef.current) {
        // Wait for the next tick to ensure the timeline is rendered with filtered data
        setTimeout(() => {
          const itemId = firstMatchingItem.id || `item-${data.indexOf(firstMatchingItem)}`;
          const itemElement = document.querySelector(`.vis-item[data-item-id="${itemId}"]`);
          if (itemElement) {
            itemElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);
      }
    }
  }, [selectedOrder, data]);

  // Filter data based on selected machine, production order, and row types
  const filteredData = React.useMemo(() => {
    let result = [...data];

    const matchMachine = (itemMachine, selected) => {
      if (!selected) return true;
      if (selected.includes(' (')) {
        return itemMachine === selected.split(' (')[0];
      }
      return itemMachine === selected;
    };

    // Default: only machines with Scheduled work. "all" = every machine with data.
    if (!selectedMachine || selectedMachine === 'scheduled') {
      const scheduledMachines = new Set(
        data.filter((item) => item.type === 'scheduled').map((item) => item.machine)
      );
      result = result.filter((item) => scheduledMachines.has(item.machine));
    } else if (selectedMachine !== 'all') {
      result = result.filter((item) => matchMachine(item.machine, selectedMachine));
    }

    if (selectedOrder && selectedOrder !== 'all') {
      const orderCore = result.filter(
        (item) =>
          (item.type === 'scheduled' || item.type === 'production') &&
          (item.po === selectedOrder || item.sale_order_number === selectedOrder)
      );
      const orderMachines = new Set(orderCore.map((item) => item.machine));
      let windowStart = null;
      let windowEnd = null;
      orderCore.forEach((item) => {
        const s = dayjs(item.start_time);
        const e = dayjs(item.end_time);
        if (s.isValid()) {
          windowStart = windowStart == null || s.isBefore(windowStart) ? s : windowStart;
        }
        if (e.isValid()) {
          windowEnd = windowEnd == null || e.isAfter(windowEnd) ? e : windowEnd;
        }
      });

      result = result.filter((item) => {
        if (item.type === 'scheduled' || item.type === 'production') {
          return item.po === selectedOrder || item.sale_order_number === selectedOrder;
        }
        if ((item.type === 'live' || item.type === 'issues') && orderMachines.has(item.machine)) {
          if (!windowStart || !windowEnd) return true;
          const s = dayjs(item.start_time);
          const e = dayjs(item.end_time);
          if (!s.isValid() || !e.isValid()) return false;
          return s.isBefore(windowEnd) && e.isAfter(windowStart);
        }
        return false;
      });
    }

    if (selectedRowTypes && selectedRowTypes !== 'all') {
      result = result.filter((item) => item.type === selectedRowTypes);
    }

    return result;
  }, [data, selectedMachine, selectedOrder, selectedRowTypes]);

  // Handle auto-refresh with countdown
  useEffect(() => {
    let countdownInterval;

    const refreshData = () => {
      if (onSubmit) {
        onSubmit(false);
        console.log('Auto-refreshing data...', new Date().toLocaleString());
      }
      return 60;
    };

    if (autoRefresh) {
      // Initial refresh
      setCountdown(prev => prev === 60 ? prev : 60);
      
      // Set up countdown interval
      countdownInterval = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            return refreshData();
          }
          return prev - 1;
        });
      }, 1000);

      console.log('Auto-refresh enabled', new Date().toLocaleString());
    } else {
      setCountdown(60);
      console.log('Auto-refresh disabled', new Date().toLocaleString());
    }

    return () => {
      if (countdownInterval) {
        clearInterval(countdownInterval);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh]);

  const toggleAutoRefresh = useCallback(() => {
    setAutoRefresh(prev => !prev);
  }, []);

  // Memoize the refresh handler to prevent unnecessary re-renders
  const handleRefresh = useCallback(() => {
    if (onSubmit) {
      onSubmit(true);
    }
  }, [onSubmit]);

  // Handle view mode change
  const handleViewModeChange = (e) => {
    const newMode = e.target.value;
    setViewMode(newMode);
    if (onDateChange) {
      const newRange = VIEW_MODES[newMode].getRange();
      onDateChange(newRange);
    }
  };

  // Main timeline rendering effect
  useEffect(() => {
    if (!containerRef.current) return;

    try {
      // Destroy existing timeline
      if (timelineRef.current) {
        timelineRef.current.destroy();
        timelineRef.current = null;
      }

      // Don't render if no data
      if (!data || data.length === 0) {
        console.log('No data to render timeline');
        return;
      }

      console.log('Rendering timeline with data:', data.length, 'items');

      // Machines shown = those present in filtered data (scheduled-only by default)
      let uniqueMachines = [...new Set(filteredData.map((item) => {
        if (item.machine && item.machine.includes(' (')) {
          return item.machine.split(' (')[0];
        }
        return item.machine;
      }).filter(Boolean))].sort();

      // When "All Machines" is selected, also include configured machines with no data
      if (selectedMachine === 'all') {
        const allMachineNames = machines.map((machine) => {
          if (machine.includes(' (')) return machine.split(' (')[0];
          return machine;
        });
        uniqueMachines = [...new Set([...uniqueMachines, ...allMachineNames])].sort();
      }
      
      // Use the filtered data for rendering
      const itemsToRender = filteredData;

      console.log('Unique machines:', uniqueMachines);

      // Create groups for hierarchical structure
      const groups = [];
      
      uniqueMachines.forEach((machine, machineIndex) => {
        const machineColor = MACHINE_COLORS[machineIndex % MACHINE_COLORS.length];
        const visibleTypes = selectedRowTypes === 'all' || !selectedRowTypes
          ? ALL_ROW_TYPES
          : [selectedRowTypes];
        
        // Check if this machine has any data
        const hasData = itemsToRender.some(item => {
          const itemMachine = item.machine && item.machine.includes(' (') 
            ? item.machine.split(' (')[0] 
            : item.machine;
          return itemMachine === machine;
        });
        
        // Parent machine group
        groups.push({
          id: `machine-${machine}`,
          content: `
            <div style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; font-weight: 700; font-size: 14px;">
              <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background-color: ${machineColor}; border: 2px solid white; box-shadow: 0 0 0 1px ${machineColor};"></span>
              <span style="color: #111827; font-weight: 700;">${machine}</span>
              ${!hasData ? '<span style="margin-left: 8px; font-size: 11px; color: #999; font-weight: 400;">(No Data)</span>' : ''}
            </div>
          `,
          style: `background: #ffffff; border-bottom: 1px solid #e5e7eb; ${!hasData ? 'opacity: 0.6;' : ''}`,
          order: machineIndex * 100,
          nestedGroups: hasData ? visibleTypes.map((t) => `${machine}-${t}`) : undefined,
          showNested: hasData
        });
        
        // Only add subgroups if machine has data
        if (hasData) {
          if (visibleTypes.includes('scheduled')) {
            groups.push({
              id: `${machine}-scheduled`,
              content: `
                <div style="display: flex; align-items: center; gap: 8px; padding: 8px 12px 8px 40px; font-weight: 400; font-size: 13px; min-height: 40px;">
                  <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #ffa940;"></span>
                  <span style="color: #d46b08; font-weight: 400;">Scheduled</span>
                </div>
              `,
              style: 'background-color: #fff7e6; border-bottom: 1px solid #ffe7ba;',
              order: (machineIndex * 100) + 10,
              parent: `machine-${machine}`
            });
          }

          if (visibleTypes.includes('production')) {
            groups.push({
              id: `${machine}-production`,
              content: `
                <div style="display: flex; align-items: center; gap: 8px; padding: 8px 12px 8px 40px; font-weight: 400; font-size: 13px; min-height: 40px;">
                  <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #237804;"></span>
                  <span style="color: #237804; font-weight: 400;">Operator Log</span>
                </div>
              `,
              style: 'background-color: #f6ffed; border-bottom: 1px solid #d9f7be;',
              order: (machineIndex * 100) + 20,
              parent: `machine-${machine}`
            });
          }

          if (visibleTypes.includes('live')) {
            groups.push({
              id: `${machine}-live`,
              content: `
                <div style="display: flex; align-items: center; gap: 8px; padding: 8px 12px 8px 40px; font-weight: 400; font-size: 13px; min-height: 40px;">
                  <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #1677ff;"></span>
                  <span style="color: #1677ff; font-weight: 400;">Machine Timeline</span>
                </div>
              `,
              style: 'background-color: #e6f4ff; border-bottom: 1px solid #bae0ff;',
              order: (machineIndex * 100) + 30,
              parent: `machine-${machine}`
            });
          }

          if (visibleTypes.includes('issues')) {
            groups.push({
              id: `${machine}-issues`,
              content: `
                <div style="display: flex; align-items: center; gap: 8px; padding: 8px 12px 8px 40px; font-weight: 400; font-size: 13px; min-height: 40px;">
                  <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: #ef4444;"></span>
                  <span style="color: #dc2626; font-weight: 400;">Operator Issues</span>
                </div>
              `,
              style: 'background-color: #fef2f2; border-bottom: 1px solid #fecaca;',
              order: (machineIndex * 100) + 40,
              parent: `machine-${machine}`
            });
          }
        }
      });

      console.log('Created groups:', groups.length);

      // Create timeline items
      const items = itemsToRender.map((item, idx) => {
        try {
          const startTime = dayjs(item.start_time);
          const endTime = dayjs(item.end_time);
          
          if (!startTime.isValid() || !endTime.isValid()) {
            console.warn('Invalid dates for item:', item);
            return null;
          }

          const duration = endTime.diff(startTime, 'minutes');
          const groupId = `${item.machine}-${item.type}`;
          const liveStatus = (item.live_status || item.status || '').toString().toUpperCase();
          const itemClass = item.type === 'live'
            ? `live-item live-${liveStatus.toLowerCase()}`
            : `${item.type}-item`;
          const titleColor = item.type === 'scheduled'
            ? '#d46b08'
            : item.type === 'live'
              ? (liveStatus === 'PRODUCTION' ? '#389e0d' : liveStatus === 'OFF' ? '#8c8c8c' : '#1677ff')
              : item.type === 'issues'
                ? '#dc2626'
                : '#389e0d';
          const typeLabel = item.type === 'live'
            ? 'Machine Timeline'
            : item.type === 'production'
              ? 'Operator Log'
              : item.type === 'scheduled'
                ? 'Scheduled'
                : item.type === 'issues'
                  ? 'Operator Issues'
                  : item.type;
          const titleLabel = item.type === 'live'
            ? liveStatus
            : item.type === 'issues'
              ? (item.issue_category || item.component || 'Issue')
              : (item.component || 'N/A');
          const barContent = item.type === 'live'
            ? ''
            : item.type === 'issues'
              ? `${item.issue_category || 'Issue'}`
              : `${item.component || 'N/A'}${item.operation_number ? ` - ${item.operation_number}` : ''}${item.operation_name ? ` - ${item.operation_name}` : ''}`;
          
          return {
            id: item.id || `item-${idx}`,
            group: groupId,
            start: startTime.toDate(),
            end: endTime.toDate(),
            content: item.type === 'live'
              ? ''
              : `
              <div class="gantt-item-content">
                <div class="item-title">${barContent}</div>
              </div>
            `,
            className: itemClass,
            title: `
              <div style="font-weight: 400; margin-bottom: 8px; color: ${titleColor};">${titleLabel}</div>
              ${item.type === 'issues' && item.issue_reason ? `<div style="margin-bottom: 4px;"><strong>Reason:</strong> ${item.issue_reason}</div>` : ''}
              ${item.type !== 'live' && item.type !== 'issues' && item.po ? `<div style="margin-bottom: 4px;"><strong>Order:</strong> ${item.po}</div>` : ''}
              ${item.type !== 'live' && item.type !== 'issues' && item.component ? `<div style="margin-bottom: 4px;"><strong>Part Name:</strong> ${item.component}</div>` : ''}
              ${item.operation_name ? `<div style="margin-bottom: 4px;"><strong>Operation:</strong> ${item.operation_name}</div>` : ''}
              ${item.operation_number ? `<div style="margin-bottom: 4px;"><strong>Operation #:</strong> ${item.operation_number}</div>` : ''}
              <div style="margin-bottom: 4px;"><strong>Machine:</strong> ${item.machine}</div>
              <div style="margin-bottom: 4px;"><strong>Type:</strong> ${typeLabel}</div>
              ${item.status ? `<div style="margin-bottom: 4px;"><strong>Status:</strong> ${item.status}</div>` : ''}
              ${item.type !== 'live' && item.type !== 'issues' ? `<div style="margin-bottom: 4px;"><strong>Quantity:</strong> ${item.quantity || 0}</div>` : ''}
              ${item.type === 'production' ? `
                <div style="margin-bottom: 4px;"><strong>Produced Qty:</strong> ${item.produced_quantity || 0}</div>
                <div style="margin-bottom: 4px;"><strong>Approved Qty:</strong> ${item.approved_quantity !== undefined ? item.approved_quantity : 0}</div>
              ` : ''}
              <div style="margin-bottom: 4px;"><strong>Duration:</strong> ${duration} minutes</div>
              <div style="margin-bottom: 2px;"><strong>Start:</strong> ${startTime.format('YYYY-MM-DD HH:mm:ss')}</div>
              <div><strong>End:</strong> ${endTime.format('YYYY-MM-DD HH:mm:ss')}</div>
            `
          };
        } catch (error) {
          console.error('Error processing item:', item, error);
          return null;
        }
      }).filter(Boolean);

      console.log('Created items:', items.length);

      // Calculate appropriate time range
      const startRange = dateRange?.[0] ? dateRange[0].toDate() : dayjs().startOf('day').toDate();
      const endRange = dateRange?.[1] ? dateRange[1].toDate() : dayjs().endOf('day').toDate();

      // Timeline options
      const options = {
        // Layout options
        stack: false,  // Disable stacking to allow side-by-side items
        stackSubgroups: false,  // Disable subgroup stacking
        width: '100%',
        height: 'auto',
        minHeight: '600px',
        maxHeight: '900px',
        
        // Time range
        start: startRange,
        end: endRange,
        
        // Interaction
        editable: false,
        selectable: false,
        zoomable: true,
        moveable: true,
        zoomKey: 'ctrlKey',
        zoomMin: 1000 * 60 * 2,
        zoomMax: 1000 * 60 * 60 * 24 * 31,
        
        // Margins and spacing
        margin: {
          item: {
            horizontal: 0,
            vertical: 0
          },
          axis: 30
        },
        
        // Group configuration
        groupOrder: 'order',
        groupHeightMode: 'fixed',
        
        // Scrolling
        horizontalScroll: true,
        verticalScroll: true,
        
        // Item styling
        itemsAlwaysDraggable: false,
        showCurrentTime: true,
        showMajorLabels: true,
        showMinorLabels: true,
        
        // Tooltip
        tooltip: {
          followMouse: true,
          overflowMethod: 'cap',
          delay: 300
        },
        
        // Time formatting — finer labels when zoomed in
        format: {
          minorLabels: {
            millisecond: 'HH:mm:ss',
            second: 'HH:mm:ss',
            minute: 'HH:mm',
            hour: 'HH:mm',
            weekday: 'ddd D',
            day: 'D',
            week: 'w',
            month: 'MMM',
            year: 'YYYY'
          },
          majorLabels: {
            millisecond: 'HH:mm:ss',
            second: 'D MMMM HH:mm',
            minute: 'ddd D MMMM',
            hour: 'ddd D MMMM',
            weekday: 'MMMM YYYY',
            day: 'MMMM YYYY',
            week: 'MMMM YYYY',
            month: 'YYYY',
            year: ''
          }
        },
        
        orientation: 'top',
        
        // Additional width and spacing options
        autoResize: true,
      };

      // Create timeline
      timelineRef.current = new Timeline(containerRef.current, items, groups, options);
      
      console.log('Timeline created successfully');

      // Event listeners
      timelineRef.current.on('select', (event) => {
        if (event.items && event.items.length > 0) {
          const itemId = event.items[0];
          const selectedItem = items.find(item => item.id === itemId);
          if (selectedItem) {
            const originalItem = data.find(item => 
              item.id === selectedItem.id || 
              (item.po === selectedItem.po && item.machine === selectedItem.machine)
            );
            
            if (originalItem) {
              const productionOrder = originalItem.po || originalItem.sale_order_number;
              if (productionOrder) {
                setSelectedOrder(productionOrder);
                
                // If the item is not fully visible, scroll it into view
                const itemElement = document.querySelector(`.vis-item[data-item-id="${itemId}"]`);
                if (itemElement) {
                  itemElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }
            }
          }
        }
      });
      
      // Add click handler to items
      timelineRef.current.on('click', (properties) => {
        if (properties.item) {
          const selectedItem = items.find(item => item.id === properties.item);
          if (selectedItem) {
            const originalItem = data.find(item => 
              item.id === selectedItem.id || 
              (item.po === selectedItem.po && item.machine === selectedItem.machine)
            );
            
            if (originalItem) {
              const productionOrder = originalItem.po || originalItem.sale_order_number;
              if (productionOrder) {
                setSelectedOrder(productionOrder);
              }
            }
          }
        }
      });

    } catch (error) {
      console.error('Error creating timeline:', error);
    }
  }, [data, dateRange, viewMode, selectedMachine, selectedOrder, selectedRowTypes, filteredData]);

  // Zoom and navigation functions
  const handleZoomIn = () => {
    if (timelineRef.current) {
      timelineRef.current.zoomIn(0.5);
    }
  };

  const handleZoomOut = () => {
    if (timelineRef.current) {
      timelineRef.current.zoomOut(0.5);
    }
  };

  const handleFit = () => {
    if (timelineRef.current) {
      timelineRef.current.fit();
    }
  };

  // Create color map for machine dropdown
  const machineColorMap = {};
  machines.forEach((machine, idx) => {
    machineColorMap[machine] = MACHINE_COLORS[idx % MACHINE_COLORS.length];
  });

  return (
    <div className="gantt-chart">
      {/* Controls */}
      <div className="gantt-controls">
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          gap: '16px', 
          padding: '16px', 
          borderBottom: '1px solid #e5e7eb', 
          background: '#f9fafb',
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            {/* Machine Selector */}
            <Select
              value={selectedMachine}
              onChange={onMachineChange}
              style={{ width: 250 }}
              options={[
                { value: 'scheduled', label: 'Scheduled Machines' },
                { value: 'all', label: 'All Machines' },
                ...machines.map((m, idx) => ({
                  value: m,
                  label: (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          display: 'inline-block',
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          backgroundColor: machineColorMap[m],
                        }}
                      />
                      <span style={{ fontWeight: 500 }}>{m}</span>
                    </span>
                  ),
                }))
              ]}
              placeholder="Select Machine"
              disabled={isLoading}
            />
            
            {/* View Mode Selector */}
            <Radio.Group
              value={viewMode}
              onChange={handleViewModeChange}
              disabled={isLoading}
              size="small"
              style={{ marginRight: 8 }}
            >
              {Object.entries(VIEW_MODES).map(([key, { label }]) => (
                <Radio.Button key={key} value={key}>
                  {label}
                </Radio.Button>
              ))}
            </Radio.Group>
            
            {/* Production Order Selector */}
            <Select
              value={selectedOrder}
              onChange={setSelectedOrder}
              style={{ width: 200 }}
              placeholder="Filter by Order"
              disabled={isLoading || productionOrders.length === 0}
              allowClear
              onClear={() => setSelectedOrder('all')}
              options={[
                { value: 'all', label: 'All Production Orders' },
                ...productionOrders.map(order => ({
                  value: order,
                  label: order
                }))
              ]}
            />

            {/* Row type filter */}
            <Select
              value={selectedRowTypes}
              onChange={(val) => setSelectedRowTypes(val || 'all')}
              style={{ width: 160 }}
              placeholder="Rows"
              disabled={isLoading}
              options={ROW_TYPE_OPTIONS}
            />

            {/* Date Range Picker */}
            <RangePicker
              value={dateRange}
              onChange={onDateChange}
              showTime
              format="YYYY-MM-DD HH:mm"
              style={{ minWidth: '300px' }}
              allowClear={false}
              disabled={isLoading}
            />
            
            {/* Action Buttons */}
            <Space>
              <Button 
                icon={<RefreshCw size={16} />} 
                onClick={handleRefresh}
                loading={isLoading}
                disabled={isLoading}
                className="control-button"
              >
                Refresh
              </Button>
              <Button 
                type="primary" 
                onClick={() => onSubmit && onSubmit(false)}
                loading={isLoading}
              >
                Submit
              </Button>
              <Button 
                onClick={() => onSubmit && onSubmit(true)}
                disabled={isLoading}
              >
                Get All Data
              </Button>
              <Button 
                onClick={onClear}
                disabled={isLoading}
              >
                Reset
              </Button>
            </Space>
          </div>

          {/* Right side controls */}
          <Space>
            {/* Legend */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '12px', 
              background: 'white', 
              padding: '8px 14px', 
              borderRadius: '6px', 
              border: '1px solid #d9d9d9',
              flexWrap: 'wrap',
            }}>
              <LegendSwatch color="#ffa940" label="Scheduled" />
              <LegendSwatch color="#237804" label="Operator Log" />
              <LegendSwatch color="#1677ff" label="ON" />
              <LegendSwatch color="#95de64" label="Production" />
              <LegendSwatch color="#8c8c8c" label="OFF" />
              <LegendSwatch color="#ef4444" label="Operator Issues" />
            </div>
            
            {/* Auto Refresh */}
            <Tooltip title={autoRefresh ? `Auto Refresh: ${countdown}s` : "Start Auto Refresh"}>
              <Button 
                icon={autoRefresh ? <Pause size={16} /> : <Play size={16} />}
                onClick={toggleAutoRefresh}
                type={autoRefresh ? "primary" : "default"}
                disabled={isLoading}
              >
                {autoRefresh && <span style={{ marginLeft: '4px' }}>{countdown}s</span>}
              </Button>
            </Tooltip>

            {/* Zoom Controls */}
            <Tooltip title="Zoom In">
              <Button icon={<ZoomIn size={16} />} onClick={handleZoomIn} disabled={isLoading} />
            </Tooltip>
            <Tooltip title="Zoom Out">
              <Button icon={<ZoomOut size={16} />} onClick={handleZoomOut} disabled={isLoading} />
            </Tooltip>
            <Tooltip title="Refresh Now">
              <Button icon={<RefreshCw size={16} />} onClick={() => onSubmit && onSubmit(false)} disabled={isLoading} />
            </Tooltip>
          </Space>
        </div>
      </div>

      {/* Auto-refresh progress bar */}
      {autoRefresh && (
        <div style={{
          height: '3px',
          backgroundColor: '#f0f0f0',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div 
            style={{ 
              height: '100%',
              background: 'linear-gradient(90deg, #10B981, #22d3ee)',
              position: 'absolute',
              left: 0,
              top: 0,
              width: `${(countdown / 60) * 100}%`,
              transition: 'width 1s linear'
            }} 
          />
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <Alert message="Error" description={error} type="error" showIcon style={{ margin: '16px' }} />
      )}

      {/* Main Content */}
      {isLoading ? (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '500px' 
        }}>
          <Spin size="large" tip="Loading data..." />
        </div>
      ) : data && data.length > 0 ? (
        <>
          {selectedMachine && selectedMachine !== 'all' && (
            <div style={{
              fontWeight: 700,
              fontSize: '18px',
              margin: '16px 0 8px 16px',
              color: machineColorMap[selectedMachine] || '#333',
              padding: '8px 0',
              borderBottom: '2px solid #f0f0f0'
            }}>
              Machine: {selectedMachine}
            </div>
          )}
          <div 
            ref={containerRef} 
            className="timeline-container" 
            style={{ 
              minHeight: '400px',
              borderTop: '1px solid #e5e7eb'
            }} 
          />
        </>
      ) : (
        <Empty 
          description="No data available for the selected criteria" 
          style={{ padding: '80px 20px' }} 
        />
      )}

      {/* Global Styles */}
      <style jsx global>{`
        .gantt-chart {
          background: white;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          border: 1px solid #e5e7eb;
        }

        .vis-timeline {
          border: none !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        }

        .gantt-item-content {
          padding: 4px 8px;
          border-radius: 0;
          background: transparent;
          font-size: 11px;
          line-height: 1.3;
          height: 100%;
          min-height: 100%;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .item-title {
          font-weight: 400 !important;
          font-size: 12px;
          margin-bottom: 0;
        }

        .item-details {
          font-size: 10px;
          color: #666;
          margin-bottom: 1px;
        }

        .item-time {
          font-size: 10px;
          color: #999;
        }

        .scheduled-item {
          border: none !important;
          border-left: none !important;
          background-color: rgba(255, 169, 64, 0.72) !important;
          box-shadow: none !important;
        }

        .scheduled-item .item-title {
          color: #d46b08 !important;
          font-weight: 400 !important;
        }

        .production-item {
          border: none !important;
          border-left: none !important;
          background-color: rgba(35, 120, 4, 0.88) !important;
          box-shadow: none !important;
        }

        .production-item .item-title {
          color: #ffffff !important;
          font-weight: 400 !important;
        }

        .issues-item {
          border: none !important;
          border-left: none !important;
          background-color: rgba(239, 68, 68, 0.72) !important;
          box-shadow: none !important;
        }

        .issues-item .item-title {
          color: #ffffff !important;
          font-weight: 400 !important;
        }

        .live-item.live-production {
          border: none !important;
          border-left: none !important;
          background-color: rgba(149, 222, 100, 0.9) !important;
          box-shadow: none !important;
        }

        .live-item.live-on {
          border: none !important;
          border-left: none !important;
          background-color: rgba(22, 119, 255, 0.78) !important;
          box-shadow: none !important;
        }

        .live-item.live-off {
          border: none !important;
          border-left: none !important;
          background-color: rgba(140, 140, 140, 0.72) !important;
          box-shadow: none !important;
        }

        .live-item .item-title,
        .live-item .gantt-item-content {
          display: none !important;
        }

        .vis-item {
          border: none !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          font-weight: 400 !important;
          height: 100% !important;
          top: 0 !important;
          bottom: 0 !important;
        }

        .vis-item .vis-item-overflow {
          height: 100% !important;
        }

        .vis-item .vis-item-content {
          padding: 0 4px !important;
          height: 100% !important;
          display: flex !important;
          align-items: center !important;
        }

        .vis-item.live-item .vis-item-content {
          padding: 0 !important;
        }

        .vis-labelset .vis-label {
          font-weight: 400 !important;
          text-align: left !important;
        }

        .vis-labelset .vis-label.vis-nesting-group {
          font-weight: 700 !important;
          background: #ffffff !important;
        }

        .vis-labelset .vis-label.vis-nesting-group .vis-inner {
          font-weight: 700 !important;
        }

        .vis-time-axis .vis-grid.vis-minor {
          border-color: #f0f0f0 !important;
        }

        .vis-time-axis .vis-grid.vis-major {
          border-color: #d9d9d9 !important;
          font-weight: 500 !important;
        }

        .vis-current-time {
          background-color: #ef4444 !important;
          width: 2px !important;
        }

        .vis-tooltip {
          background: white !important;
          border: 1px solid #d9d9d9 !important;
          border-radius: 8px !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
          font-size: 12px !important;
          padding: 12px !important;
          max-width: 300px !important;
          line-height: 1.4 !important;
        }

        .vis-panel.vis-center {
          border-left: 1px solid #e5e7eb !important;
        }

        .vis-labelset .vis-label {
          border-bottom: 1px solid #e5e7eb !important;
        }

        .timeline-container {
          position: relative;
        }
      `}</style>
    </div>
  );
};

export default SimpleGanttChart;
