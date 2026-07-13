import React, {
  forwardRef, useCallback, useDeferredValue, useEffect, useImperativeHandle, useMemo, useRef, useState,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Timeline } from 'vis-timeline';
import { DataSet } from 'vis-data';
import 'vis-timeline/styles/vis-timeline-graph2d.css';
import { message } from 'antd';
import {
  buildShiftHiddenDates,
  buildTimelineGroups,
  buildTimelineItems,
  buildTimelineLabelFormatters,
  buildTimelineStyleSheet,
  buildTooltipTemplate,
  getComponentColors,
  getFilteredOperationsWindow,
  getHiddenDatesRange,
  getTimeAxisScale,
  getTimeAxisStep,
  getTimeRange,
  filterScheduledOperations,
} from './schedulingTimelineUtils.js';
import {
  getItemBatchSize,
  getSyncDebounceMs,
  getWindowAnimation,
} from './schedulingTimelineMotion.js';

const ROW_HEIGHT = 34;
const INTERACTION_COOLDOWN_MS = 280;

const upsertDataSet = (dataSet, nextItems, batchSize) => {
  if (!dataSet) return;
  const nextIds = new Set(nextItems.map((item) => item.id));
  dataSet.getIds().forEach((id) => {
    if (!nextIds.has(id)) dataSet.remove(id);
  });

  if (nextItems.length <= batchSize) {
    dataSet.update(nextItems);
    return;
  }

  let index = 0;
  const pushBatch = () => {
    const slice = nextItems.slice(index, index + batchSize);
    dataSet.update(slice);
    index += batchSize;
    if (index < nextItems.length) {
      requestAnimationFrame(pushBatch);
    }
  };
  pushBatch();
};

const windowsMatch = (a, b) => {
  if (!a || !b) return false;
  return new Date(a.start).getTime() === new Date(b.start).getTime()
    && new Date(a.end).getTime() === new Date(b.end).getTime();
};

const SchedulingGanttTimeline = forwardRef(({
  scheduledOperations = [],
  availableMachines = [],
  shiftConfigs = [],
  selectedMachines = [],
  selectedComponents = [],
  selectedProductionOrders = [],
  dateRange = null,
  viewType = 'week',
  minHeight = 300,
}, ref) => {
  const rootRef = useRef(null);
  const containerRef = useRef(null);
  const timelineRef = useRef(null);
  const itemsDataSetRef = useRef(null);
  const groupsDataSetRef = useRef(null);
  const styleElementRef = useRef(null);
  const styleSignatureRef = useRef('');
  const isInteractingRef = useRef(false);
  const interactionTimerRef = useRef(null);
  const pendingPayloadRef = useRef(null);
  const lastWindowRef = useRef(null);
  const lastOptionsKeyRef = useRef('');
  const cleanupInteractionRef = useRef(null);

  const [isSyncing, setIsSyncing] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);

  useImperativeHandle(ref, () => timelineRef.current);

  const deferredOperations = useDeferredValue(scheduledOperations);

  const colors = useMemo(
    () => getComponentColors(scheduledOperations),
    [scheduledOperations]
  );

  const timelinePayload = useMemo(() => {
    const operations = filterScheduledOperations(deferredOperations, {
      selectedComponents,
      selectedProductionOrders,
      selectedMachines,
    });

    const scheduleData = { scheduled_operations: deferredOperations };
    const timeRange = getTimeRange(viewType, dateRange, scheduleData);
    const hasOrderFilter = selectedProductionOrders.length > 0;
    const filteredWindow = hasOrderFilter ? getFilteredOperationsWindow(operations) : null;
    const displayWindow = dateRange
      ? { start: timeRange.start, end: timeRange.end }
      : (filteredWindow || { start: timeRange.start, end: timeRange.end });
    const hiddenRange = getHiddenDatesRange(displayWindow, operations);
    const hiddenDates = buildShiftHiddenDates(shiftConfigs, hiddenRange.start, hiddenRange.end);
    const groupsArr = buildTimelineGroups(availableMachines, operations, {
      selectedComponents,
      selectedProductionOrders,
      selectedMachines,
    });

    return {
      operations,
      items: buildTimelineItems(operations, colors, shiftConfigs),
      groups: groupsArr,
      displayWindow,
      hiddenDates,
      timelineHeightPx: Math.max(minHeight, groupsArr.length * ROW_HEIGHT + 28),
      labelFormatters: buildTimelineLabelFormatters(shiftConfigs),
      tooltipTemplate: buildTooltipTemplate(shiftConfigs),
      optionsKey: JSON.stringify({
        viewType,
        hiddenDatesLength: hiddenDates.length,
        shiftCount: shiftConfigs.length,
        height: groupsArr.length,
      }),
    };
  }, [
    deferredOperations,
    availableMachines,
    shiftConfigs,
    selectedMachines,
    selectedComponents,
    selectedProductionOrders,
    dateRange,
    viewType,
    colors,
    minHeight,
  ]);

  const markInteracting = useCallback(() => {
    isInteractingRef.current = true;
    setIsInteracting(true);
    if (interactionTimerRef.current) clearTimeout(interactionTimerRef.current);
    interactionTimerRef.current = setTimeout(() => {
      isInteractingRef.current = false;
      setIsInteracting(false);
      if (pendingPayloadRef.current) {
        pendingPayloadRef.current();
        pendingPayloadRef.current = null;
      }
    }, INTERACTION_COOLDOWN_MS);
  }, []);

  const bindInteractionHandlers = useCallback((timeline, rootEl) => {
    cleanupInteractionRef.current?.();

    const onPointerDown = (event) => {
      if (event.button > 0) return;
      markInteracting();
    };
    const onWheel = () => markInteracting();
    const onRangeChange = () => markInteracting();

    rootEl.addEventListener('pointerdown', onPointerDown, { passive: true });
    rootEl.addEventListener('wheel', onWheel, { passive: true });
    timeline.on('rangechange', onRangeChange);
    timeline.on('rangechanged', onRangeChange);

    cleanupInteractionRef.current = () => {
      rootEl.removeEventListener('pointerdown', onPointerDown);
      rootEl.removeEventListener('wheel', onWheel);
      timeline.off('rangechange', onRangeChange);
      timeline.off('rangechanged', onRangeChange);
    };
  }, [markInteracting]);

  const runSync = useCallback((payload) => {
    if (!containerRef.current) return;

    try {
      setIsSyncing(true);

      const signature = Object.keys(colors).sort().join('|');
      const css = buildTimelineStyleSheet(colors);
      if (styleSignatureRef.current !== signature || !styleElementRef.current) {
        if (styleElementRef.current) {
          styleElementRef.current.textContent = css;
        } else {
          const styleEl = document.createElement('style');
          styleEl.textContent = css;
          document.head.appendChild(styleEl);
          styleElementRef.current = styleEl;
        }
        styleSignatureRef.current = signature;
      }

      const {
        items,
        groups,
        displayWindow,
        hiddenDates,
        timelineHeightPx,
        labelFormatters,
        tooltipTemplate,
        optionsKey,
      } = payload;

      const options = {
        stack: false,
        moveable: true,
        zoomable: true,
        zoomKey: 'ctrlKey',
        horizontalScroll: true,
        horizontalScrollInvert: false,
        verticalScroll: true,
        orientation: 'top',
        height: `${timelineHeightPx}px`,
        margin: { item: { horizontal: 8, vertical: 4 }, axis: 5 },
        start: displayWindow.start,
        end: displayWindow.end,
        zoomMin: 1000 * 60 * 30,
        zoomMax: 1000 * 60 * 60 * 24 * 365 * 2,
        editable: false,
        showCurrentTime: true,
        tooltip: {
          followMouse: true,
          overflowMethod: 'cap',
          template: tooltipTemplate,
        },
        timeAxis: { scale: getTimeAxisScale(viewType), step: getTimeAxisStep(viewType) },
        format: labelFormatters,
        hiddenDates,
      };

      const batchSize = getItemBatchSize(items.length);
      const windowAnimation = getWindowAnimation(items.length);
      const shouldAnimateWindow = !isInteractingRef.current
        && !windowsMatch(lastWindowRef.current, displayWindow);

      if (!timelineRef.current) {
        itemsDataSetRef.current = new DataSet(items);
        groupsDataSetRef.current = new DataSet(groups);
        timelineRef.current = new Timeline(
          containerRef.current,
          itemsDataSetRef.current,
          groupsDataSetRef.current,
          options
        );
        bindInteractionHandlers(timelineRef.current, rootRef.current);
      } else {
        upsertDataSet(itemsDataSetRef.current, items, batchSize);
        upsertDataSet(groupsDataSetRef.current, groups, batchSize);
        if (lastOptionsKeyRef.current !== optionsKey) {
          timelineRef.current.setOptions(options);
          lastOptionsKeyRef.current = optionsKey;
        }
      }

      if (shouldAnimateWindow) {
        timelineRef.current.setWindow(displayWindow.start, displayWindow.end, {
          animation: windowAnimation,
        });
      } else if (!windowsMatch(lastWindowRef.current, displayWindow)) {
        timelineRef.current.setWindow(displayWindow.start, displayWindow.end, { animation: false });
      }

      lastWindowRef.current = displayWindow;
      setIsReady(true);
      requestAnimationFrame(() => setIsSyncing(false));
    } catch (err) {
      console.error('Timeline sync error:', err);
      message.error('Timeline failed: ' + err.message);
      setIsSyncing(false);
    }
  }, [bindInteractionHandlers, colors, viewType]);

  useEffect(() => {
    let cancelled = false;
    const debounceMs = getSyncDebounceMs(timelinePayload.items.length);

    const queueSync = () => {
      if (cancelled) return;
      const execute = () => runSync(timelinePayload);
      if (isInteractingRef.current) {
        pendingPayloadRef.current = execute;
        return;
      }
      execute();
    };

    const timer = setTimeout(queueSync, debounceMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [timelinePayload, runSync]);

  useEffect(() => {
    const updateCurrentTime = () => {
      if (!isInteractingRef.current) {
        timelineRef.current?.setCurrentTime(new Date());
      }
    };

    updateCurrentTime();
    const interval = setInterval(updateCurrentTime, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => () => {
    if (interactionTimerRef.current) clearTimeout(interactionTimerRef.current);
    cleanupInteractionRef.current?.();
    if (timelineRef.current) {
      try { timelineRef.current.destroy(); } catch (e) { console.error(e); }
      timelineRef.current = null;
    }
    itemsDataSetRef.current = null;
    groupsDataSetRef.current = null;
    if (styleElementRef.current) {
      try { styleElementRef.current.remove(); } catch (e) { console.error(e); }
      styleElementRef.current = null;
    }
    styleSignatureRef.current = '';
    lastWindowRef.current = null;
    lastOptionsKeyRef.current = '';
  }, []);

  const isPendingLargeDataset = scheduledOperations.length !== deferredOperations.length;

  return (
    <motion.div
      ref={rootRef}
      className={`scheduling-gantt-root${isInteracting ? ' is-interacting' : ''}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: isReady ? 1 : 0.94, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      <AnimatePresence>
        {(isSyncing || isPendingLargeDataset) && (
          <motion.div
            key="sync-indicator"
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 3,
              transformOrigin: 'left center',
              background: 'linear-gradient(90deg, #1677ff, #69b1ff)',
              zIndex: 4,
              borderRadius: '0 2px 2px 0',
            }}
          />
        )}
      </AnimatePresence>
      <div ref={containerRef} style={{ minHeight, background: '#fff' }} />
    </motion.div>
  );
});

SchedulingGanttTimeline.displayName = 'SchedulingGanttTimeline';

export default SchedulingGanttTimeline;