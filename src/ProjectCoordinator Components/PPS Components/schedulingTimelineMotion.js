export const WINDOW_ANIMATION = {
  duration: 380,
  easingFunction: 'easeInOutCubic',
};

export const WINDOW_ANIMATION_FAST = {
  duration: 220,
  easingFunction: 'easeOutCubic',
};

// Big datasets feel *smoother* with a shorter window animation, not a longer
// one — a 420ms pan across 600+ DOM items spends more time mid-animation
// with stale/half-updated rows visible. Snap faster once we cross the
// threshold where vis-timeline is doing real DOM work per frame.
export const getWindowAnimation = (itemCount = 0) =>
  itemCount > 300 ? WINDOW_ANIMATION_FAST : WINDOW_ANIMATION;

// Debounce before pushing a fresh dataset into vis-timeline. Tuned so a
// coordinator adjusting filters rapidly on a 50-100 order schedule doesn't
// trigger a full DataSet diff on every keystroke/click.
export const getSyncDebounceMs = (operationCount = 0) => {
  if (operationCount > 800) return 260;
  if (operationCount > 400) return 190;
  if (operationCount > 150) return 130;
  return 70;
};

// How many timeline items get pushed into the vis-timeline DataSet per
// animation frame. Smaller batches = more frames = the browser can still
// paint/respond to input while a big schedule is loading, instead of one
// long blocking `update()` call that reads as a freeze.
export const getItemBatchSize = (itemCount = 0) => {
  if (itemCount > 800) return 60;
  if (itemCount > 400) return 100;
  if (itemCount > 150) return 150;
  return itemCount;
};

// Shared framer-motion presets so the control bar / legend / tab content
// all animate with the same easing language as the timeline itself.
export const CONTROL_BAR_MOTION = {
  initial: { opacity: 0, y: -6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
};

export const LEGEND_MOTION = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
};

export const LEGEND_CHIP_MOTION = (index = 0) => ({
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1 },
  transition: { duration: 0.16, ease: 'easeOut', delay: Math.min(index * 0.015, 0.3) },
});

export const TAB_CONTENT_MOTION = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
};  