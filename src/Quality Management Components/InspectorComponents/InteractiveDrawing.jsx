import { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import { motion, useMotionValue, AnimatePresence, animate } from 'framer-motion';
import { Loader2, AlertTriangle } from 'lucide-react';
import { getDrawingInfo, getDrawingPageImage } from '../../lib/api';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs) { return twMerge(clsx(inputs)); }

// ── Module-level constants (avoid re-creation per render) ───────────────
const BALLOON_THEMES = {
  blue: {
    active: "bg-sky-400/30",
    inactive: "bg-sky-500/10 hover:bg-sky-500/20",
    balloonPoint: "bg-sky-400",
    balloonPointInactive: "bg-sky-400/60"
  },
  red: {
    active: "bg-red-500/30",
    inactive: "bg-red-500/10 hover:bg-red-500/20",
    balloonPoint: "bg-red-500",
    balloonPointInactive: "bg-red-500/60"
  }
};

export const InteractiveDrawing = forwardRef(({
  pdfId,
  directImageSrc,
  pageNumber = 1,
  balloons,
  activeBalloonId,
  selectedBalloonIds = [],
  notes = [],
  activeNoteId = null,
  onBalloonClick,
  onCanvasClick,
  onRegionSelect,
  activeTool = 'pan',
  isLoading = false,
  processingTip = 'Processing…',
  balloonColor = 'blue',
  sidebarOffset = 50,
  rotation = 0
}, ref) => {
  const containerRef = useRef(null);
  const imageRef = useRef(null);

  // Data states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [imageSrc, setImageSrc] = useState(null);
  const [pageInfo, setPageInfo] = useState(null);
  const containerSize = useRef({ width: 0, height: 0, left: 0, top: 0 });

  // Region Selection states
  const [selection, setSelection] = useState(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const selectionRef = useRef(null);
  const selectionRafId = useRef(0);

  // Update container size cache on resize
  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        containerSize.current = {
          width: rect.width,
          height: rect.height,
          left: rect.left,
          top: rect.top
        };
      }
    };
    const observer = new ResizeObserver(updateSize);
    observer.observe(containerRef.current);
    updateSize();
    window.addEventListener('scroll', updateSize, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', updateSize);
    };
  }, []);

  // Viewport states for Zoom/Pan
  const scale = useMotionValue(1);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const PADDING = 40;

  // Calculate scale to fit drawing in container
  const calculateFitScale = useCallback(() => {
    if (!pageInfo || containerSize.current.width === 0) return 1;
    const containerW = containerSize.current.width - (PADDING * 2 + sidebarOffset);
    const containerH = containerSize.current.height - (PADDING * 2);
    const scaleX = containerW / pageInfo.width;
    const scaleY = containerH / pageInfo.height;
    return Math.min(scaleX, scaleY, 1);
  }, [pageInfo, sidebarOffset]);

  // Middle-button Panning
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let isMiddlePanning = false;
    let lastX = 0;
    let lastY = 0;
    const onMouseDown = (e) => {
      if (e.button === 1) { 
        isMiddlePanning = true;
        lastX = e.clientX;
        lastY = e.clientY;
        e.preventDefault();
        el.style.cursor = 'grabbing';
      }
    };
    const onMouseMove = (e) => {
      if (!isMiddlePanning) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      x.set(x.get() + dx);
      y.set(y.get() + dy);
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onMouseUp = (e) => {
      if (e.button === 1 && isMiddlePanning) {
        isMiddlePanning = false;
        el.style.cursor = '';
      }
    };
    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [x, y]);

  // Load PDF info and initial page image
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!pdfId && !directImageSrc) return;
      setLoading(true);
      setError(null);
      try {
        let pInfo = null;
        if (pdfId) {
          const info = await getDrawingInfo(pdfId);
          if (cancelled) return;
          const page = info.pages?.find((p) => p.page_number === pageNumber - 1) || info.pages?.[0];
          if (page) {
            pInfo = { width: page.width, height: page.height };
            setPageInfo(pInfo);
          }
        }
        if (directImageSrc) {
          if (!pInfo) {
            const img = new Image();
            img.src = directImageSrc;
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = () => reject(new Error('Failed to load image'));
            });
            if (cancelled) return;
            pInfo = { width: img.naturalWidth, height: img.naturalHeight };
            setPageInfo(pInfo);
          }
          setImageSrc(directImageSrc);
        } else if (pdfId && pInfo) {
          const imageRes = await getDrawingPageImage(pdfId, pageNumber, 0, 0, pInfo.width, pInfo.height, 1.5, false, true);
          if (cancelled) return;
          if (imageRes.success && imageRes.image_base64) {
            setImageSrc(imageRes.image_base64);
          } else {
            throw new Error('Failed to load drawing image');
          }
        }
        if (pInfo && containerRef.current) {
          const containerW = containerRef.current.clientWidth - (PADDING * 2 + sidebarOffset);
          const containerH = containerRef.current.clientHeight - (PADDING * 2);
          const fitScale = Math.min(containerW / pInfo.width, containerH / pInfo.height, 1);
          animate(scale, fitScale, { type: 'spring', stiffness: 300, damping: 30 });
          animate(x, sidebarOffset / 2, { type: 'spring', stiffness: 300, damping: 30 });
          animate(y, 0, { type: 'spring', stiffness: 300, damping: 30 });
        }
      } catch (err) {
        console.error('InteractiveDrawing error:', err);
        setError(err.message || 'Failed to load drawing');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [pdfId, directImageSrc, pageNumber, sidebarOffset]);

  // Reset view
  const handleReset = useCallback(() => {
    const fitScale = calculateFitScale();
    animate(scale, fitScale, { type: 'spring', stiffness: 300, damping: 30 });
    animate(x, sidebarOffset / 2, { type: 'spring', stiffness: 300, damping: 30 });
    animate(y, 0, { type: 'spring', stiffness: 300, damping: 30 });
  }, [calculateFitScale, scale, x, y, sidebarOffset]);

  const visibleBalloons = useMemo(() => {
    return (balloons || []).filter(b => b.page === pageNumber);
  }, [balloons, pageNumber]);

  const zoomToSelection = useCallback((targetIdOverride = null, selectedIdsOverride = null) => {
    if (!pageInfo) return;
    const targetIds = (selectedIdsOverride && selectedIdsOverride.length > 0) 
      ? selectedIdsOverride.map(String) 
      : (targetIdOverride ? [String(targetIdOverride)] : (selectedBalloonIds && selectedBalloonIds.length > 0 ? selectedBalloonIds.map(String) : (activeBalloonId ? [String(activeBalloonId)] : [])));
    
    if (targetIds.length === 0) return;
    const targets = [
      ...visibleBalloons.filter(b => targetIds.includes(String(b.id))),
      ...notes.filter(n => n.page === pageNumber && targetIds.includes(String(n.id)))
    ];
    if (targets.length === 0) return;
    const containerW = containerSize.current.width;
    const containerH = containerSize.current.height;
    if (containerW === 0 || containerH === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    targets.forEach(b => {
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    });
    const bWidth = maxX - minX;
    const bHeight = maxY - minY;
    const bCenterX = minX + bWidth / 2;
    const bCenterY = minY + bHeight / 2;
    const ox = bCenterX - pageInfo.width / 2;
    const oy = bCenterY - pageInfo.height / 2;
    const fitScale = calculateFitScale();
    let targetScale;
    if (targets.length === 1) {
      const b = targets[0];
      targetScale = Math.min(Math.max(fitScale * 1, (containerH * 0.1) / b.height), 15);
    } else {
      const availableW = containerW - PADDING * 4;
      const availableH = containerH - PADDING * 4;
      targetScale = Math.min(availableW / bWidth, availableH / bHeight, 15);
      targetScale = Math.max(targetScale, fitScale);
    }
    animate(scale, targetScale, { type: 'spring', stiffness: 120, damping: 24 });
    animate(x, -ox * targetScale, { type: 'spring', stiffness: 120, damping: 24 });
    animate(y, -oy * targetScale, { type: 'spring', stiffness: 120, damping: 24 });
  }, [pageInfo, visibleBalloons, activeBalloonId, selectedBalloonIds, calculateFitScale, scale, x, y]);

  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      const ns = Math.min(scale.get() * 1.5, 20);
      animate(scale, ns, { type: 'spring', stiffness: 300, damping: 30 });
    },
    zoomOut: () => {
      const fitScale = calculateFitScale();
      const ns = Math.max(scale.get() / 1.5, Math.min(0.05, fitScale * 0.5));
      animate(scale, ns, { type: 'spring', stiffness: 300, damping: 30 });
    },
    resetView: handleReset,
    zoomToSelection
  }));

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheelManual = (e) => {
      e.preventDefault();
      const delta = -e.deltaY;
      const zoomFactor = Math.pow(2, delta / 1000);
      const currentScale = scale.get();
      let newScale = currentScale * zoomFactor;
      const fitScale = calculateFitScale();
      const minS = Math.min(0.05, fitScale * 0.5);
      newScale = Math.min(Math.max(newScale, minS), 20);
      if (newScale === currentScale) return;
      
      const rect = containerSize.current;
      if (rect.width > 0) {
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const currentX = x.get();
        const currentY = y.get();
        const ratio = newScale / currentScale;
        const newX = currentX * ratio + (mouseX - cx) * (1 - ratio);
        const newY = currentY * ratio + (mouseY - cy) * (1 - ratio);
        x.set(newX);
        y.set(newY);
        scale.set(newScale);
      }
    };
    el.addEventListener('wheel', handleWheelManual, { passive: false });
    return () => el.removeEventListener('wheel', handleWheelManual);
  }, [calculateFitScale, scale, x, y]);

  const [isDragging, setIsDragging] = useState(false);
  const theme = BALLOON_THEMES[balloonColor];

  const renderedBalloons = useMemo(() => {
    if (!pageInfo || !imageSrc) return null;
    const balloonBaseSize = Math.max(pageInfo.width * 0.015, 20);
    const innerCircleSize = balloonBaseSize * 0.8;
    const fontLabelSize = balloonBaseSize * 0.4;
    return visibleBalloons.map((b) => {
      const isActive = b.id === activeBalloonId;
      return (
        <div
          key={b.id}
          onClick={(e) => { e.stopPropagation(); onBalloonClick?.(b); }}
          className={cn("absolute cursor-pointer", isActive ? theme.active : theme.inactive, isActive ? "z-30" : "z-20")}
          style={{
            left: `${(b.x / pageInfo.width) * 100}%`,
            top: `${(b.y / pageInfo.height) * 100}%`,
            width: `${(b.width / pageInfo.width) * 100}%`,
            height: `${(b.height / pageInfo.height) * 100}%`,
            transform: 'translateZ(0)',
          }}
        >
          <div
            style={{ width: `${balloonBaseSize}px`, height: `${balloonBaseSize}px` }}
            className={cn("absolute -top-0 left-full -translate-y-full flex items-center justify-center origin-bottom-left rounded-[50%_50%_50%_0%] shadow-none", isActive ? theme.balloonPoint : theme.balloonPointInactive, isActive && "scale-170")}
          >
            <div style={{ width: `${innerCircleSize}px`, height: `${innerCircleSize}px` }} className="rounded-full bg-white flex items-center justify-center">
              <span style={{ fontSize: `${fontLabelSize}px` }} className="font-mono font-black text-slate-900 leading-none">
                {b.label || b.id}
              </span>
            </div>
          </div>
        </div>
      );
    });
  }, [visibleBalloons, activeBalloonId, pageInfo, imageSrc, theme, onBalloonClick]);

  const renderedNotes = useMemo(() => {
    if (!pageInfo || !imageSrc || !notes) return null;
    return notes
      .filter(n => n.page === pageNumber)
      .map((n) => {
        const isActive = String(n.id) === String(activeNoteId);
        return (
          <div
            key={`note-${n.id}`}
            className={cn(
              "absolute pointer-events-none border-2 transition-all duration-300",
              isActive ? "border-yellow-400 bg-yellow-400/20 z-40" : "border-yellow-400/30 border-dashed bg-yellow-400/5 z-10"
            )}
            style={{
              left: `${(n.x / pageInfo.width) * 100}%`,
              top: `${(n.y / pageInfo.height) * 100}%`,
              width: `${(n.width / pageInfo.width) * 100}%`,
              height: `${(n.height / pageInfo.height) * 100}%`,
            }}
          />
        );
      });
  }, [notes, activeNoteId, pageInfo, imageSrc, pageNumber]);

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-slate-50 select-none group/canvas">
      <div className="absolute inset-0 z-0 bg-[radial-gradient(rgba(100,116,139,0.25)_1.2px,transparent_1.2px)] [background-size:20px_20px]" />
      <div className="absolute inset-0 z-0 bg-[radial-gradient(rgba(100,116,139,0.4)_1.5px,transparent_1.5px)] [background-size:100px_100px]" />

      <AnimatePresence>
        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-white/80 backdrop-blur-sm">
            <Loader2 className="w-8 h-8 animate-spin text-sky-500/30" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Processing Drawing...</span>
          </motion.div>
        )}
        {isLoading && !loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-white/60 backdrop-blur-[2px]">
            <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">{processingTip}</span>
          </motion.div>
        )}
        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-white">
            <AlertTriangle className="w-12 h-12 text-red-500/20" />
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest text-center leading-relaxed">{error}</p>
            <button onClick={() => window.location.reload()} className="px-4 py-1.5 rounded-sm bg-sky-500/10 border border-sky-500/20 text-sky-600 text-[10px] font-black uppercase tracking-wider hover:bg-sky-500/20">Retry Load</button>
          </motion.div>
        )}
      </AnimatePresence>

      {imageSrc && pageInfo && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-visible pointer-events-none">
          <motion.div
            drag={activeTool === 'pan'}
            dragMomentum={false}
            dragConstraints={false}
            onDragStart={() => setIsDragging(true)}
            onDragEnd={() => setIsDragging(false)}
            onMouseDown={(e) => {
              if ((activeTool !== 'balloon' && activeTool !== 'select' && activeTool !== 'stamp' && activeTool !== 'notes') || e.button !== 0) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const sx = (e.clientX - rect.left) / rect.width * pageInfo.width;
              const sy = (e.clientY - rect.top) / rect.height * pageInfo.height;
              const initial = { startX: sx, startY: sy, curX: sx, curY: sy };
              selectionRef.current = initial;
              setSelection(initial);
              setIsSelecting(true);
            }}
            onMouseMove={(e) => {
              if (!isSelecting || !selectionRef.current) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const cx = (e.clientX - rect.left) / rect.width * pageInfo.width;
              const cy = (e.clientY - rect.top) / rect.height * pageInfo.height;
              selectionRef.current = { ...selectionRef.current, curX: cx, curY: cy };
              if (!selectionRafId.current) {
                selectionRafId.current = requestAnimationFrame(() => {
                  setSelection(selectionRef.current ? { ...selectionRef.current } : null);
                  selectionRafId.current = 0;
                });
              }
            }}
            onMouseUp={() => {
              if (!isSelecting || !selectionRef.current) return;
              setIsSelecting(false);
              if (selectionRafId.current) { cancelAnimationFrame(selectionRafId.current); selectionRafId.current = 0; }
              const sel = selectionRef.current;
              const x1 = Math.min(sel.startX, sel.curX);
              const y1 = Math.min(sel.startY, sel.curY);
              const w = Math.abs(sel.startX - sel.curX);
              const h = Math.abs(sel.startY - sel.curY);
              if (w > 5 || h > 5) onRegionSelect?.({ x: x1, y: y1, width: w, height: h, page: pageNumber });
              setSelection(null);
              selectionRef.current = null;
            }}
            style={{ scale, x, y, rotate: rotation, width: pageInfo.width, height: pageInfo.height, backfaceVisibility: 'hidden', transformStyle: 'preserve-3d' }}
            className={cn(
              "relative origin-center bg-white pointer-events-auto shrink-0 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.15)]", 
              isLoading ? "cursor-wait" : 
              isDragging ? "cursor-grabbing" : 
              activeTool === 'pan' ? "cursor-grab" : 
              (activeTool === 'select' || activeTool === 'stamp' || activeTool === 'notes') ? "cursor-crosshair" : 
              "cursor-default"
            )}
            onClick={(e) => {
              if (activeTool === 'stamp') {
                const rect = e.currentTarget.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const clickY = e.clientY - rect.top;
                if (pageInfo) {
                  const pdfX = (clickX / rect.width) * pageInfo.width;
                  const pdfY = (clickY / rect.height) * pageInfo.height;
                  onCanvasClick?.({ x: pdfX, y: pdfY, page: pageNumber });
                }
              }
            }}
          >
            <motion.img ref={imageRef} src={imageSrc} alt="Engineering Drawing" className="w-full h-full pointer-events-none" onDragStart={(e) => e.preventDefault()} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} />
            {selection && isSelecting && (
              <div className="absolute border-2 border-sky-500 bg-sky-500/10 pointer-events-none z-40" style={{ left: `${(Math.min(selection.startX, selection.curX) / pageInfo.width) * 100}%`, top: `${(Math.min(selection.startY, selection.curY) / pageInfo.height) * 100}%`, width: `${(Math.abs(selection.startX - selection.curX) / pageInfo.width) * 100}%`, height: `${(Math.abs(selection.startY - selection.curY) / pageInfo.height) * 100}%` }} />
            )}
            <div className="absolute inset-0">
              {renderedNotes}
              {renderedBalloons}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
});

export default InteractiveDrawing;
