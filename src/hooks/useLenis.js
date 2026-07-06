import { useEffect } from 'react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

const TIMELINE_SELECTOR = '.scheduling-gantt-root, .vis-timeline, .ant-select-dropdown, .ant-picker-dropdown';

const shouldSkipLenis = (node) => {
  if (!(node instanceof Element)) return false;
  return Boolean(node.closest(TIMELINE_SELECTOR));
};

/**
 * Smooth vertical page scroll for scheduling screens.
 * Skips the Gantt timeline so horizontal pan / wheel stay native to vis-timeline.
 */
export default function useLenis(enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;

    const lenis = new Lenis({
      duration: 1.05,
      easing: (t) => Math.min(1, 1.001 - (2 ** (-10 * t))),
      smoothWheel: true,
      // Coordinators on shop-floor tablets pan mostly by touch. syncTouch
      // keeps the page scroll 1:1 with the finger (no rubber-band lag),
      // which reads as "smooth" far more than an eased touch scroll does.
      syncTouch: true,
      syncTouchLerp: 0.08,
      touchMultiplier: 1.1,
      wheelMultiplier: 0.9,
      prevent: (node) => shouldSkipLenis(node),
    });

    let frameId = 0;
    const raf = (time) => {
      lenis.raf(time);
      frameId = requestAnimationFrame(raf);
    };
    frameId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(frameId);
      lenis.destroy();
    };
  }, [enabled]);
}