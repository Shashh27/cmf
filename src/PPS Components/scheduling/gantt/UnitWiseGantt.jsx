/**
 * Unit-wise Gantt + order/part palette legend for Intelligent Scheduler.
 */
import React, { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import SchedulingGanttTimeline from '../../SchedulingGanttTimeline.jsx';
import { getUnitWiseOrderPalettes } from '../../schedulingTimelineUtils.js';
import { LEGEND_CHIP_MOTION, LEGEND_MOTION } from '../../schedulingTimelineMotion.js';

const UnitWiseOrderPaletteLegend = React.memo(({
  palettes,
  title,
  activeOrders,
  activeParts,
  onToggleOrder,
  onTogglePart,
}) => (
  <div style={{ marginTop: 12, padding: '10px 14px', background: '#fafafa', borderRadius: 6, border: '1px solid #f0f0f0' }}>
    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>{title}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {palettes.map(({ order, parts }, orderIndex) => {
        const orderActive = !activeOrders || activeOrders.length === 0 || activeOrders.includes(order);
        return (
          <motion.div
            key={order}
            {...LEGEND_CHIP_MOTION(orderIndex)}
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 10,
              opacity: orderActive ? 1 : 0.35,
              transition: 'opacity .2s',
            }}
          >
            <span
              onClick={() => onToggleOrder && onToggleOrder(order)}
              style={{
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                minWidth: 110,
                color: '#262626',
              }}
              title="Filter by production order"
            >
              {order}
            </span>
            <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              {parts.map(({ part, part_name, quantity, color }) => {
                const partActive = !activeParts || activeParts.length === 0 || activeParts.includes(part);
                return (
                  <span
                    key={`${order}::${part}`}
                    onClick={() => onTogglePart && onTogglePart(part)}
                    title={part_name ? `${part_name}${quantity ? ` · qty ${quantity}` : ''}` : (quantity ? `qty ${quantity}` : part)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      cursor: 'pointer',
                      fontSize: 12,
                      opacity: partActive ? 1 : 0.35,
                      transition: 'opacity .2s',
                    }}
                  >
                    <span
                      style={{
                        width: 13,
                        height: 13,
                        borderRadius: 3,
                        flexShrink: 0,
                        background: color.backgroundColor,
                        display: 'inline-block',
                      }}
                    />
                    <span>{part}{quantity > 0 ? ` ×${quantity}` : ''}</span>
                  </span>
                );
              })}
            </span>
          </motion.div>
        );
      })}
    </div>
  </div>
));

export default function UnitWiseGantt({
  timelineRef,
  scheduledOperations,
  availableMachines,
  shiftConfigs,
  selectedMachines,
  selectedComponents,
  selectedProductionOrders,
  dateRange,
  viewType,
  onToggleOrder,
  onTogglePart,
}) {
  const palettes = useMemo(
    () => getUnitWiseOrderPalettes(scheduledOperations),
    [scheduledOperations]
  );

  return (
    <>
      <div
        style={{
          height: availableMachines.length > 24 ? '70vh' : 'auto',
          overflowY: availableMachines.length > 24 ? 'auto' : 'hidden',
          overflowX: 'hidden',
          border: '1px solid #e8e8e8',
          borderRadius: 8,
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          background: '#fff',
        }}
      >
        <SchedulingGanttTimeline
          ref={timelineRef}
          scheduledOperations={scheduledOperations}
          availableMachines={availableMachines}
          shiftConfigs={shiftConfigs}
          selectedMachines={selectedMachines}
          selectedComponents={selectedComponents}
          selectedProductionOrders={selectedProductionOrders}
          dateRange={dateRange}
          viewType={viewType}
          colorBy="part"
        />
      </div>

      <AnimatePresence>
        {palettes.length > 0 && (
          <motion.div key="legend-unit" {...LEGEND_MOTION} style={{ overflow: 'hidden' }}>
            <UnitWiseOrderPaletteLegend
              palettes={palettes}
              title="Production Orders"
              activeOrders={selectedProductionOrders}
              activeParts={selectedComponents}
              onToggleOrder={onToggleOrder}
              onTogglePart={onTogglePart}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
