import React, {
  forwardRef, useCallback, useDeferredValue, useEffect, useImperativeHandle, useMemo, useRef, useState,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  buildShiftHiddenDates,
  buildTimelineGroups,
  buildTimelineItems,
  buildTimelineLabelFormatters,
  buildTimelineStyleSheet,
  buildTooltipTemplate,
  getScheduleBarColors,
  getFilteredOperationsWindow,
  getHiddenDatesRange,
  getTimeAxisForWindow,
  ZOOM_MIN_MS,
  ZOOM_MAX_MS,
  getTimeRange,
  getWindowContainingOperations,
  filterScheduledOperations,
  filterOperationsToVisibleWindow,
  downsampleOperationsForView,
} from '../PPS Components/schedulingTimelineUtils.js';
import { Timeline } from 'vis-timeline';
import {
  getItemBatchSize,
  getSyncDebounceMs,
  getWindowAnimation,
} from '../PPS Components/schedulingTimelineMotion.js';
import { DataSet } from 'vis-data';
import 'vis-timeline/styles/vis-timeline-graph2d.css';
import { message } from 'antd';

const ROW_HEIGHT = 34;
const INTERACTION_COOLDOWN_MS = 280;

const upsertDataSet = (dataSet, nextItems, batchSize, generationRef) => {
  if (!dataSet || !generationRef) return;
  const generation = generationRef.current + 1;
  generationRef.current = generation;
  const nextIds = new Set(nextItems.map((item) => item.id));
  dataSet.getIds().forEach((id) => {
    if (generationRef.current !== generation) return;
    if (!nextIds.has(id)) dataSet.remove(id);
  });
  if (generationRef.current !== generation) return;

  if (!nextItems.length) return;

  // A visible window with no bars reports item count 0, and that batch size
  // was reused for machine groups. A size of 0 never advances, so the rows
  // stay out of the timeline and only the time axis is drawn.
  const size = batchSize > 0 ? batchSize : nextItems.length;
  if (nextItems.length <= size) {
    dataSet.update(nextItems);
    return;
  }

  let index = 0;
  const pushBatch = () => {
    if (generationRef.current !== generation) return;
    const slice = nextItems.slice(index, index + size);
    dataSet.update(slice);
    index += size;
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

const deferredPayload = (minHeight) => ({
  operations: [],
  items: [],
  groups: [],
  displayWindow: { start: new Date(), end: new Date(Date.now() + 24 * 60 * 60 * 1000) },
  hiddenDates: [],
  timeAxis: { scale: 'hour', step: 4 },
  timelineHeightPx: minHeight,
  labelFormatters: { minorLabels: () => '', majorLabels: () => '' },
  tooltipTemplate: () => '',
  optionsKey: 'deferred',
});

class GanttErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div role="alert" style={{ padding: 24, background: '#fff', border: '1px solid #ffccc7', borderRadius: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>The schedule chart could not be drawn.</div>
          <div style={{ color: '#595959', marginBottom: 12 }}>{this.state.error.message}</div>
          <button type="button" onClick={this.props.onRetry} style={{ padding: '4px 12px', cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const SchedulingGanttTimeline = forwardRef(({
  scheduledOperations = [],
  availableMachines = [],
  shiftConfigs = [],
  selectedMachines = [],
  selectedComponents = [],
  selectedProductionOrders = [],
  dateRange = null,
  viewType = 'day',
  minHeight = 300,
  colorBy = 'order',
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
  const itemBatchGenerationRef = useRef(0);
  const groupBatchGenerationRef = useRef(0);
  const windowOwnerRef = useRef('');

  const windowOwnerKey = [
    viewType,
    dateRange ? dateRange.map((value) => new Date(value).getTime()).join(',') : '',
    selectedMachines.join(','),
    selectedComponents.join(','),
    selectedProductionOrders.join(','),
  ].join('|');
  windowOwnerRef.current = windowOwnerKey;

  const [isSyncing, setIsSyncing] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const [chartFrameReady, setChartFrameReady] = useState(false);
  const [liveWindow, setLiveWindow] = useState(null);
  const [liveOwner, setLiveOwner] = useState('');

  useEffect(() => {
    const frame = requestAnimationFrame(() => setChartFrameReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useImperativeHandle(ref, () => timelineRef.current);

  const deferredOperations = useDeferredValue(scheduledOperations);

  const colors = useMemo(
    () => (chartFrameReady ? getScheduleBarColors(scheduledOperations, colorBy) : {}),
    [chartFrameReady, scheduledOperations, colorBy]
  );
  const colorClassPrefix = colorBy === 'part' ? 'part' : 'order';

  const timelinePayload = useMemo(() => {
    if (!chartFrameReady) return deferredPayload(minHeight);
    const operations = filterScheduledOperations(deferredOperations, {
      selectedComponents,
      selectedProductionOrders,
      selectedMachines,
    });

    const scheduleData = { scheduled_operations: deferredOperations };
    const timeRange = getTimeRange(viewType, dateRange, scheduleData);
    const hasOrderFilter = selectedProductionOrders.length > 0;
    const filteredWindow = hasOrderFilter ? getFilteredOperationsWindow(operations) : null;
    let computedWindow = dateRange
      ? { start: timeRange.start, end: timeRange.end }
      : (filteredWindow || { start: timeRange.start, end: timeRange.end });
    if (!dateRange && !hasOrderFilter && operations.length) {
      const inView = filterOperationsToVisibleWindow(operations, computedWindow);
      if (!inView.length) {
        const snapped = getWindowContainingOperations(operations, viewType);
        if (snapped) computedWindow = snapped;
      }
    }
    const displayWindow = liveOwner === windowOwnerKey && liveWindow ? liveWindow : computedWindow;
    const hiddenRange = getHiddenDatesRange(displayWindow);
    const hiddenDates = buildShiftHiddenDates(shiftConfigs, hiddenRange.start, hiddenRange.end);
    const drawnOperations = downsampleOperationsForView(
      filterOperationsToVisibleWindow(operations, displayWindow),
      displayWindow,
    );
    const groupsArr = buildTimelineGroups(availableMachines, drawnOperations, {
      selectedComponents,
      selectedProductionOrders,
      selectedMachines,
    });

    const axis = getTimeAxisForWindow(displayWindow.start, displayWindow.end);

    return {
      operations: drawnOperations,
      items: buildTimelineItems(drawnOperations, colors, shiftConfigs, { colorBy }),
      groups: groupsArr,
      displayWindow,
      hiddenDates,
      timeAxis: { scale: axis.scale, step: axis.step },
      timelineHeightPx: Math.max(minHeight, groupsArr.length * ROW_HEIGHT + 28),
      labelFormatters: buildTimelineLabelFormatters(shiftConfigs),
      tooltipTemplate: buildTooltipTemplate(shiftConfigs),
      optionsKey: JSON.stringify({
        viewType,
        colorBy,
        axisScale: axis.scale,
        axisStep: axis.step,
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
    chartFrameReady,
    colors,
    colorBy,
    minHeight,
    liveWindow,
    liveOwner,
    windowOwnerKey,
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

    const onRangeChanged = (props) => {
      if (!props?.start || !props?.end) return;
      const next = { start: new Date(props.start), end: new Date(props.end) };
      lastWindowRef.current = next;
      setLiveOwner(windowOwnerRef.current);
      setLiveWindow((prev) => (windowsMatch(prev, next) ? prev : next));
    };

    rootEl.addEventListener('pointerdown', onPointerDown, { passive: true });
    rootEl.addEventListener('wheel', onWheel, { passive: true });
    timeline.on('rangechange', onRangeChange);
    timeline.on('rangechanged', onRangeChanged);

    cleanupInteractionRef.current = () => {
      rootEl.removeEventListener('pointerdown', onPointerDown);
      rootEl.removeEventListener('wheel', onWheel);
      timeline.off('rangechange', onRangeChange);
      timeline.off('rangechanged', onRangeChanged);
    };
  }, [markInteracting]);

  const runSync = useCallback((payload) => {
    if (!containerRef.current) return;

    try {
      setIsSyncing(true);

      const signature = `${colorClassPrefix}|${Object.keys(colors).sort().join('|')}`;
      const css = buildTimelineStyleSheet(colors, { classPrefix: colorClassPrefix });
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
        timeAxis,
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
        zoomMin: ZOOM_MIN_MS,
        zoomMax: ZOOM_MAX_MS,
        editable: false,
        showCurrentTime: true,
        tooltip: {
          followMouse: true,
          overflowMethod: 'cap',
          template: tooltipTemplate,
        },
        timeAxis,
        format: labelFormatters,
        hiddenDates,
      };

      const batchSize = getItemBatchSize(items.length);
      const windowAnimation = getWindowAnimation(items.length);
      const shouldAnimateWindow = !isInteractingRef.current
        && !windowsMatch(lastWindowRef.current, displayWindow);

      if (!timelineRef.current) {
        itemsDataSetRef.current = new DataSet();
        groupsDataSetRef.current = new DataSet();
        timelineRef.current = new Timeline(
          containerRef.current,
          itemsDataSetRef.current,
          groupsDataSetRef.current,
          options
        );
        bindInteractionHandlers(timelineRef.current, rootRef.current);
        lastOptionsKeyRef.current = optionsKey;
      } else if (lastOptionsKeyRef.current !== optionsKey) {
        timelineRef.current.setOptions(options);
        lastOptionsKeyRef.current = optionsKey;
      }

      upsertDataSet(itemsDataSetRef.current, items, batchSize, itemBatchGenerationRef);
      upsertDataSet(groupsDataSetRef.current, groups, batchSize, groupBatchGenerationRef);

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
  }, [bindInteractionHandlers, colors, colorClassPrefix, viewType]);

  useEffect(() => {
    if (!chartFrameReady) return undefined;
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
  }, [chartFrameReady, timelinePayload, runSync]);

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
    itemBatchGenerationRef.current += 1;
    groupBatchGenerationRef.current += 1;
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

const SchedulingGanttTimelineWithBoundary = forwardRef((props, ref) => {
  const [attempt, setAttempt] = useState(0);
  return (
    <GanttErrorBoundary key={attempt} onRetry={() => setAttempt((n) => n + 1)}>
      <SchedulingGanttTimeline ref={ref} {...props} />
    </GanttErrorBoundary>
  );
});

SchedulingGanttTimelineWithBoundary.displayName = 'SchedulingGanttTimelineWithBoundary';

export default SchedulingGanttTimelineWithBoundary;