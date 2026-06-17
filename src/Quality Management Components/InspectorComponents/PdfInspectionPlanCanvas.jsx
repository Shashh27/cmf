import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Document, Page } from 'react-pdf';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { App, Button, Empty, Space, Spin, Typography } from 'antd';
import axios from 'axios';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { QUALITY_API_BASE_URL } from '../../Config/qualityconfig';

const { Text } = Typography;

const BASE_PAGE_WIDTH = 880;
const ZOOM_MIN = 0.35;
const ZOOM_MAX = 2.75;
const ZOOM_STEP = 0.15;

const PdfInspectionPlanCanvas = ({
  fileUrl,
  documentId,
  partId,
  activeTool = 'pan',
  onDetectionComplete,
  onStampRegion,
  onNoteRegion,
  onExportBalloonedReady,
  loadingExternal = false,
  zoom = 1,
  onZoomChange,
  maxDisplayWidth = BASE_PAGE_WIDTH,
  /** viewport height (px) for contain-fit; omit to width-only */
  maxDisplayHeight,
  pdfRotation = 0,
  balloonOverlays = [],
  noteOverlays = [],
  selectedBalloonId = null,
  /** When false the source file is an image, not a PDF — use <img> instead of react-pdf. */
  isPdf = true,
}) => {
  const { message } = App.useApp();
  const canvasWrapRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const detectingRef = useRef(false);
  const dragRef = useRef(null);
  const pdfDocRef = useRef(null);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pdfDimensions, setPdfDimensions] = useState(null);
  const [drag, setDrag] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pdfLoadError, setPdfLoadError] = useState(null);
  const [balloonScreenRects, setBalloonScreenRects] = useState([]);
  const [noteScreenRects, setNoteScreenRects] = useState([]);
  /** Explicit scroll content size (px) so overflow always matches the PDF + padding (reliable vs CSS max-content). */
  const [scrollContentSize, setScrollContentSize] = useState({ mw: 0, mh: 0 });

  const pad = 12;
  const padTotal = pad * 2;
  const availW = Math.max(0, (maxDisplayWidth || BASE_PAGE_WIDTH) - padTotal);
  const availH = maxDisplayHeight != null ? Math.max(120, maxDisplayHeight - padTotal) : null;

  const baseFitWidth = useMemo(() => {
    if (!pdfDimensions || !availH) {
      return Math.max(320, availW || BASE_PAGE_WIDTH);
    }
    const pw = pdfDimensions.width;
    const ph = pdfDimensions.height;
    if (pw <= 0 || ph <= 0) return Math.max(320, availW);
    const fitByWidth = availW;
    const fitByHeight = (availH * pw) / ph;
    return Math.max(120, Math.floor(Math.min(fitByWidth, fitByHeight)));
  }, [pdfDimensions, availW, availH]);

  const pageWidth = Math.max(80, Math.round(baseFitWidth * zoom));

  const canDragSelect = activeTool === 'select' || activeTool === 'stamp' || activeTool === 'notes';
  const isPan = activeTool === 'pan';

  const onDocLoad = useCallback((pdf) => {
    setNumPages(pdf.numPages);
    setPdfLoadError(null);
    setPageNumber((p) => (p > pdf.numPages ? 1 : p));
  }, []);

  const onDocLoadError = useCallback((err) => {
    console.error(err);
    setPdfLoadError(err?.message || 'Failed to load PDF');
  }, []);

  const onPageRenderSuccess = useCallback(async () => {
    try {
      const pdf = pdfDocRef.current;
      if (!pdf) return;
      const realPage = await pdf.getPage(pageNumber);
      const intrinsic = realPage.rotate || 0;
      const rotation = pdfRotation === 0 ? intrinsic : pdfRotation;
      const vp = realPage.getViewport({ scale: 1.0, rotation });
      setPdfDimensions({ width: vp.width, height: vp.height });
    } catch (e) {
      console.warn('[CMF] pdfDimensions fallback', e);
    }
  }, [pageNumber, pdfRotation]);

  const getCanvasDisplaySize = useCallback(() => {
    const el = canvasWrapRef.current;
    if (!el) return { width: 0, height: 0 };
    const canvas = el.querySelector('canvas');
    if (canvas) {
      const sw = parseFloat(canvas.style.width);
      const sh = parseFloat(canvas.style.height);
      if (sw > 0 && sh > 0) return { width: sw, height: sh };
      const dpr = window.devicePixelRatio || 1;
      return { width: canvas.width / dpr, height: canvas.height / dpr };
    }
    return { width: el.offsetWidth, height: el.offsetHeight };
  }, []);

  /**
   * Build a PDF with balloon rectangles and labels in PDF user space (same bbox as overlays).
   * Upload as application/pdf to operation-documents (MinIO).
   */
  const exportBalloonedPdf = useCallback(async () => {
    if (!fileUrl) return null;
    let res;
    try {
      res = await fetch(fileUrl);
    } catch (e) {
      console.error(e);
      return null;
    }
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());

    let pdfDoc;
    if (isPdf) {
      pdfDoc = await PDFDocument.load(bytes);
    } else {
      pdfDoc = await PDFDocument.create();
      let img;
      const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
      if (isPng) {
        img = await pdfDoc.embedPng(bytes);
      } else {
        img = await pdfDoc.embedJpg(bytes);
      }
      const dims = img.scale(1);
      const page = pdfDoc.addPage([dims.width, dims.height]);
      page.drawImage(img, { x: 0, y: 0, width: dims.width, height: dims.height });
    }

    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontSize = 9;
    const green = rgb(34 / 255, 197 / 255, 94 / 255);
    const pageCount = pdfDoc.getPageCount();

    const byPage = new Map();
    for (const b of balloonOverlays) {
      const p = Number(b.page) >= 1 ? Number(b.page) : 1;
      if (!byPage.has(p)) byPage.set(p, []);
      byPage.get(p).push(b);
    }

    for (let p = 1; p <= pageCount; p += 1) {
      const page = pdfDoc.getPage(p - 1);
      const pageH = page.getHeight();
      const pageW = page.getWidth();
      const pageOverlays = byPage.get(p) || [];
      for (const b of pageOverlays) {
        const { pdfRect, label } = b;
        const { x, y, width, height } = pdfRect;
        if (!Number.isFinite(x) || !Number.isFinite(y) || width <= 0 || height <= 0) continue;
        const yPdf = pageH - y - height;
        const drawX = Math.max(0, Math.min(x, pageW - 0.5));
        const drawY = Math.max(0, Math.min(yPdf, pageH - 0.5));
        const drawW = Math.min(width, pageW - drawX);
        const drawH = Math.min(height, pageH - drawY);

        page.drawRectangle({
          x: drawX,
          y: drawY,
          width: drawW,
          height: drawH,
          borderColor: green,
          borderWidth: 1,
          borderOpacity: 1,
          color: green,
          opacity: 0.12,
        });

        const txt = String(label || '').trim();
        if (txt) {
          const textW = font.widthOfTextAtSize(txt, fontSize);
          const tagH = 14;
          const padX = 6;
          const tagW = Math.min(Math.max(20, textW + padX * 2), pageW);
          const tagTopTl = Math.max(0, y - tagH - 2);
          const tagYbl = pageH - tagTopTl - tagH;
          const tagX = Math.max(0, x - 2);
          const availTagW = pageW - tagX;
          const tw = Math.min(tagW, availTagW);
          page.drawRectangle({
            x: tagX,
            y: tagYbl,
            width: tw,
            height: tagH,
            color: green,
          });
          page.drawText(txt, {
            x: tagX + (tw - textW) / 2,
            y: tagYbl + 3,
            size: fontSize,
            font,
            color: rgb(1, 1, 1),
          });
        }
      }
    }

    const outBytes = await pdfDoc.save();
    return new Blob([outBytes], { type: 'application/pdf' });
  }, [fileUrl, balloonOverlays, isPdf]);

  useEffect(() => {
    if (typeof onExportBalloonedReady !== 'function') return;
    onExportBalloonedReady(exportBalloonedPdf);
    return () => onExportBalloonedReady(null);
  }, [onExportBalloonedReady, exportBalloonedPdf]);

  useLayoutEffect(() => {
    let cancelled = false;
    const applyBalloons = () => {
      if (cancelled) return;
      if (!pdfDimensions || !balloonOverlays.length) {
        setBalloonScreenRects([]);
        return;
      }
      const canvasDisplay = getCanvasDisplaySize();
      if (canvasDisplay.width < 1 || canvasDisplay.height < 1) {
        setBalloonScreenRects([]);
        return;
      }
      const { width: pw, height: ph } = pdfDimensions;
      const next = balloonOverlays
        .filter((b) => b.page === pageNumber)
        .map((b) => {
          const { x, y, width, height } = b.pdfRect;
          return {
            id: b.id,
            label: b.label,
            left: (x / pw) * canvasDisplay.width,
            top: (y / ph) * canvasDisplay.height,
            width: Math.max((width / pw) * canvasDisplay.width, 4),
            height: Math.max((height / ph) * canvasDisplay.height, 4),
            selected: selectedBalloonId != null && b.id === selectedBalloonId,
          };
        });
      setBalloonScreenRects(next);
    };
    applyBalloons();
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(applyBalloons);
    });
    const el = canvasWrapRef.current;
    const ro =
      el &&
      new ResizeObserver(() => {
        applyBalloons();
      });
    if (el && ro) ro.observe(el);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [balloonOverlays, pdfDimensions, pageNumber, selectedBalloonId, getCanvasDisplaySize]);

  useLayoutEffect(() => {
    let cancelled = false;
    const applyNotes = () => {
      if (cancelled) return;
      if (!pdfDimensions || !noteOverlays.length) {
        setNoteScreenRects([]);
        return;
      }
      const canvasDisplay = getCanvasDisplaySize();
      if (canvasDisplay.width < 1 || canvasDisplay.height < 1) {
        setNoteScreenRects([]);
        return;
      }
      const { width: pw, height: ph } = pdfDimensions;
      const next = noteOverlays
        .filter((n) => n.page === pageNumber)
        .map((n) => {
          const { x, y, width, height } = n.pdfRect;
          return {
            id: n.id,
            left: (x / pw) * canvasDisplay.width,
            top: (y / ph) * canvasDisplay.height,
            width: Math.max((width / pw) * canvasDisplay.width, 4),
            height: Math.max((height / ph) * canvasDisplay.height, 4),
          };
        });
      setNoteScreenRects(next);
    };
    applyNotes();
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(applyNotes);
    });
    const el = canvasWrapRef.current;
    const ro =
      el &&
      new ResizeObserver(() => {
        applyNotes();
      });
    if (el && ro) ro.observe(el);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [noteOverlays, pdfDimensions, pageNumber, getCanvasDisplaySize]);

  /** Keep scrollable area exactly max(viewport, canvas+padding) so scroll ranges match the PDF. */
  useLayoutEffect(() => {
    const sc = scrollContainerRef.current;
    const wrap = canvasWrapRef.current;
    if (!sc || !wrap) return;

    const update = () => {
      const vw = sc.clientWidth;
      const vh = sc.clientHeight;
      const cw = wrap.offsetWidth;
      const ch = wrap.offsetHeight;
      if (vw < 1 || vh < 1) return;
      setScrollContentSize({
        mw: Math.max(vw, cw + padTotal),
        mh: Math.max(vh, ch + padTotal),
      });
    };

    update();
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(update);
    });
    ro.observe(sc);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [pageWidth, pageNumber, pdfRotation, padTotal]);

  const [isPanning, setIsPanning] = useState(false);

  const startPan = useCallback(
    (e) => {
      if (activeTool !== 'pan' && activeTool !== 'notes') return;
      if (!scrollContainerRef.current) return;
      e.preventDefault();
      const sc = scrollContainerRef.current;
      let lastX = e.clientX;
      let lastY = e.clientY;
      setIsPanning(true);
      sc.style.userSelect = 'none';

      const move = (ev) => {
        const dx = ev.clientX - lastX;
        const dy = ev.clientY - lastY;
        lastX = ev.clientX;
        lastY = ev.clientY;
        sc.scrollLeft -= dx;
        sc.scrollTop -= dy;
      };
      const up = () => {
        setIsPanning(false);
        sc.style.userSelect = '';
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    },
    [activeTool],
  );

  useEffect(() => {
    const sc = scrollContainerRef.current;
    if (!sc) return;
    const cap = (e) => {
      if (activeTool !== 'pan' && activeTool !== 'notes') return;
      if (e.button !== 0) return;
      startPan(e);
    };
    sc.addEventListener('mousedown', cap, true);
    return () => sc.removeEventListener('mousedown', cap, true);
  }, [activeTool, startPan]);

  const onWheelZoom = useCallback(
    (e) => {
      if (!onZoomChange) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      e.stopPropagation();
      const step = e.deltaY > 0 ? -0.06 : 0.06;
      onZoomChange((prev) => {
        const z = typeof prev === 'number' ? prev : 1;
        return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round((z + step) * 100) / 100));
      });
    },
    [onZoomChange],
  );

  useEffect(() => {
    const sc = scrollContainerRef.current;
    if (!sc || !onZoomChange) return;
    const fn = (e) => onWheelZoom(e);
    sc.addEventListener('wheel', fn, { passive: false });
    return () => sc.removeEventListener('wheel', fn);
  }, [onZoomChange, onWheelZoom]);

  const runProcessDimensions = useCallback(
    async (box) => {
      if (!documentId || !partId || !box) return;
      if (detectingRef.current) return;
      detectingRef.current = true;
      setLoading(true);
      try {
        const res = await axios.post(`${QUALITY_API_BASE_URL}/pdf-annotation/process-dimensions`, {
          part_id: partId,
          pdf_id: String(documentId),
          bounding_box: box,
          scale_factor: 1.0,
          pdf_content_type: 'normal',
        });
        onDetectionComplete?.(res.data);
        const n = res.data?.count ?? 0;
        if (n > 0) {
          message.success(`Detected ${n} characteristic(s)`);
        } else {
          message.info('No dimensions found — try selecting tighter around the dimension text.');
        }
      } catch (err) {
        console.error(err);
        const detail = err.response?.data?.detail;
        message.error(typeof detail === 'string' ? detail : err.message || 'Detection failed');
      } finally {
        setLoading(false);
        detectingRef.current = false;
      }
    },
    [documentId, partId, onDetectionComplete, message],
  );

  const runNoteRegion = useCallback(
    async (box) => {
      if (!box || detectingRef.current) return;
      detectingRef.current = true;
      setLoading(true);
      try {
        await onNoteRegion?.(box);
      } finally {
        setLoading(false);
        detectingRef.current = false;
      }
    },
    [onNoteRegion],
  );

  const onCanvasMouseDown = (e) => {
    if (isPan) return;
    if (!canDragSelect) return;
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      x0: e.clientX - rect.left,
      y0: e.clientY - rect.top,
      x1: e.clientX - rect.left,
      y1: e.clientY - rect.top,
    };
    setDrag({ ...dragRef.current });
  };

  const onCanvasMouseMove = (e) => {
    if (!canDragSelect || !dragRef.current) return;
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      ...dragRef.current,
      x1: e.clientX - rect.left,
      y1: e.clientY - rect.top,
    };
    setDrag({ ...dragRef.current });
  };

  const onCanvasMouseUp = (e) => {
    if (!canDragSelect) return;
    e.stopPropagation();
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d) return;

    const x = Math.min(d.x0, d.x1);
    const y = Math.min(d.y0, d.y1);
    const w = Math.abs(d.x1 - d.x0);
    const h = Math.abs(d.y1 - d.y0);
    if (w < 4 || h < 4) return;

    if (!pdfDimensions) {
      message.warning('PDF dimensions not loaded yet.');
      return;
    }

    const canvasDisplay = getCanvasDisplaySize();
    if (canvasDisplay.width < 1 || canvasDisplay.height < 1) {
      message.warning('Canvas not ready.');
      return;
    }

    const scaleX = pdfDimensions.width / canvasDisplay.width;
    const scaleY = pdfDimensions.height / canvasDisplay.height;

    const box = {
      x: x * scaleX,
      y: y * scaleY,
      width: w * scaleX,
      height: h * scaleY,
      page: pageNumber,
    };

    if (box.width < 0.5 || box.height < 0.5) {
      message.warning('Selection too small.');
      return;
    }

    if (activeTool === 'stamp') {
      onStampRegion?.(box);
      return;
    }
    if (activeTool === 'notes') {
      void runNoteRegion(box);
      return;
    }

    if (!documentId || !partId) {
      message.warning('Missing document or part for detection.');
      return;
    }
    void runProcessDimensions(box);
  };

  const onCanvasMouseLeave = () => {
    if (!canDragSelect) return;
    dragRef.current = null;
    setDrag(null);
  };

  const overlayRect = drag
    ? {
        left: Math.min(drag.x0, drag.x1),
        top: Math.min(drag.y0, drag.y1),
        width: Math.abs(drag.x1 - drag.x0),
        height: Math.abs(drag.y1 - drag.y0),
      }
    : null;

  const overlayStyle =
    activeTool === 'stamp'
      ? {
          border: '2px dashed #d97706',
          background: 'rgba(217, 119, 6, 0.12)',
        }
      : {
          border: '2px solid #38bdf8',
          background: 'rgba(56, 189, 248, 0.15)',
        };

  const busy = loading || loadingExternal;
  const spinTip = loading
    ? activeTool === 'notes'
      ? 'Extracting notes…'
      : 'Detecting…'
    : loadingExternal
      ? 'Saving…'
      : 'Working…';

  const cursorStyle = isPan ? (isPanning ? 'grabbing' : 'grab') : canDragSelect ? 'crosshair' : 'default';

  if (!fileUrl) {
    return <Empty description="No drawing URL" />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, flex: 1, position: 'relative' }}>
      {busy && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 20,
            background: 'rgba(255,255,255,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Spin size="large" tip={spinTip} />
        </div>
      )}

      {pdfLoadError && (
        <Text type="danger" style={{ display: 'block', marginBottom: 8 }}>
          {pdfLoadError}
        </Text>
      )}

      <div
        ref={scrollContainerRef}
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 120,
          overflow: 'auto',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          background: '#ffffff',
          cursor: isPan ? 'grab' : 'default',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxSizing: 'border-box',
            padding: pad,
            background: '#ffffff',
            minWidth: scrollContentSize.mw > 0 ? scrollContentSize.mw : '100%',
            minHeight: scrollContentSize.mh > 0 ? scrollContentSize.mh : '100%',
          }}
        >
          {isPdf ? (
          <Document
            file={fileUrl}
            onLoadSuccess={(pdf) => {
              pdfDocRef.current = pdf;
              onDocLoad(pdf);
            }}
            onLoadError={onDocLoadError}
            loading={
              <div style={{ padding: 48, textAlign: 'center' }}>
                <Spin tip="Loading PDF…" />
              </div>
            }
          >
            <div
              ref={canvasWrapRef}
              style={{
                position: 'relative',
                display: 'inline-block',
                lineHeight: 0,
                verticalAlign: 'top',
                flexShrink: 0,
                cursor: cursorStyle,
                touchAction: 'none',
                boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
              }}
              onMouseDown={onCanvasMouseDown}
              onMouseMove={onCanvasMouseMove}
              onMouseUp={onCanvasMouseUp}
              onMouseLeave={onCanvasMouseLeave}
            >
              <Page
                pageNumber={pageNumber}
                width={pageWidth}
                rotate={pdfRotation === 0 ? undefined : pdfRotation}
                onRenderSuccess={onPageRenderSuccess}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
              {overlayRect && (
                <div
                  style={{
                    position: 'absolute',
                    left: overlayRect.left,
                    top: overlayRect.top,
                    width: overlayRect.width,
                    height: overlayRect.height,
                    boxSizing: 'border-box',
                    pointerEvents: 'none',
                    borderRadius: 2,
                    ...overlayStyle,
                  }}
                />
              )}
              {balloonScreenRects.map((br) => (
                <div
                  key={br.id}
                  style={{
                    position: 'absolute',
                    left: br.left,
                    top: br.top,
                    width: br.width,
                    height: br.height,
                    border: br.selected ? '3px solid #f59e0b' : '2px solid #22c55e',
                    boxSizing: 'border-box',
                    background: br.selected ? 'rgba(245, 158, 11, 0.12)' : 'rgba(34, 197, 94, 0.1)',
                    pointerEvents: 'none',
                    borderRadius: 3,
                    zIndex: 5,
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      left: -2,
                      top: -18,
                      minWidth: 20,
                      height: 18,
                      padding: '0 6px',
                      fontSize: 11,
                      fontWeight: 700,
                      lineHeight: '18px',
                      textAlign: 'center',
                      color: '#fff',
                      background: br.selected ? '#f59e0b' : '#22c55e',
                      borderRadius: 4,
                      boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                    }}
                  >
                    {br.label}
                  </span>
                </div>
              ))}
              {noteScreenRects.map((n) => (
                  <div
                    key={`note-${n.id}`}
                    style={{
                      position: 'absolute',
                      left: n.left,
                      top: n.top,
                      width: n.width,
                      height: n.height,
                      border: '2px solid #f59e0b',
                      background: 'rgba(245,158,11,0.10)',
                      pointerEvents: 'none',
                      borderRadius: 3,
                      zIndex: 5,
                    }}
                  />
                ))}
            </div>
          </Document>
          ) : (
            <div
              ref={canvasWrapRef}
              style={{
                position: 'relative',
                display: 'inline-block',
                lineHeight: 0,
                verticalAlign: 'top',
                flexShrink: 0,
                cursor: cursorStyle,
                touchAction: 'none',
                boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
              }}
              onMouseDown={onCanvasMouseDown}
              onMouseMove={onCanvasMouseMove}
              onMouseUp={onCanvasMouseUp}
              onMouseLeave={onCanvasMouseLeave}
            >
              <img
                src={fileUrl}
                alt="Drawing"
                style={{ width: pageWidth, display: 'block' }}
                onLoad={(e) => {
                  const nw = e.currentTarget.naturalWidth;
                  const nh = e.currentTarget.naturalHeight;
                  if (nw > 0 && nh > 0) setPdfDimensions({ width: nw, height: nh });
                }}
                draggable={false}
              />
              {overlayRect && (
                <div
                  style={{
                    position: 'absolute',
                    left: overlayRect.left,
                    top: overlayRect.top,
                    width: overlayRect.width,
                    height: overlayRect.height,
                    boxSizing: 'border-box',
                    pointerEvents: 'none',
                    borderRadius: 2,
                    ...overlayStyle,
                  }}
                />
              )}
              {balloonScreenRects.map((br) => (
                <div
                  key={br.id}
                  style={{
                    position: 'absolute',
                    left: br.left,
                    top: br.top,
                    width: br.width,
                    height: br.height,
                    border: br.selected ? '3px solid #f59e0b' : '2px solid #22c55e',
                    boxSizing: 'border-box',
                    background: br.selected ? 'rgba(245, 158, 11, 0.12)' : 'rgba(34, 197, 94, 0.1)',
                    pointerEvents: 'none',
                    borderRadius: 3,
                    zIndex: 5,
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      left: -2,
                      top: -18,
                      minWidth: 20,
                      height: 18,
                      padding: '0 6px',
                      fontSize: 11,
                      fontWeight: 700,
                      lineHeight: '18px',
                      textAlign: 'center',
                      color: '#fff',
                      background: br.selected ? '#f59e0b' : '#22c55e',
                      borderRadius: 4,
                      boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                    }}
                  >
                    {br.label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {numPages != null && numPages > 1 && (
        <Space style={{ marginTop: 8 }} align="center">
          <Button
            size="small"
            icon={<LeftOutlined />}
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
          />
          <Text type="secondary" style={{ fontSize: 11 }}>
            Page {pageNumber} of {numPages}
          </Text>
          <Button
            size="small"
            icon={<RightOutlined />}
            disabled={pageNumber >= numPages}
            onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
          />
        </Space>
      )}
      {numPages != null && numPages <= 1 && (
        <Text type="secondary" style={{ fontSize: 11, marginTop: 8 }}>
          Page {pageNumber}
        </Text>
      )}
      <Text type="secondary" style={{ fontSize: 11, marginTop: 4 }}>
        {activeTool === 'pan' && 'Pan: drag to move. Scroll wheel zooms. Use scrollbars to reach edges.'}
        {activeTool === 'notes' && 'Notes: drag a region to extract and save notes. Wheel zooms.'}
        {activeTool === 'select' && 'Select: drag to detect dimensions (requires part document). Wheel zooms.'}
        {activeTool === 'stamp' && 'Stamp: drag a region, then complete the form. Wheel zooms.'}
        {!canDragSelect && !isPan && 'Click Select or Stamp in the sidebar to draw on the PDF.'}
      </Text>
    </div>
  );
};

export { BASE_PAGE_WIDTH, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP };
export default PdfInspectionPlanCanvas;
