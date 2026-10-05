import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Empty, Space, Spin, Tooltip, Typography } from 'antd';
import {
  ZoomInOutlined,
  ZoomOutOutlined,
  ExpandOutlined,
  LeftOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { Document, Page, pdfjs } from 'react-pdf';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.js?url';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

const { Text } = Typography;

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp']);
const WHEEL_ZOOM_SPEED = 0.0018;

const getExtension = (url = '') => {
  const clean = String(url).split('?')[0].split('#')[0];
  const parts = clean.toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
};

/** Resolve preview kind from URL + optional document metadata. */
export const getPreviewKind = (url, meta = {}) => {
  if (!url) return 'unsupported';

  const ext = getExtension(url);
  const hint = String(
    meta.format || meta.document_type || meta.type || meta.tag || '',
  ).toLowerCase();
  const urlLower = url.toLowerCase();

  if (ext === 'pdf' || hint.includes('pdf') || urlLower.includes('.pdf')) {
    return 'pdf';
  }
  if (IMAGE_EXTS.has(ext) || hint.includes('image')) {
    return 'image';
  }
  for (const e of IMAGE_EXTS) {
    if (urlLower.includes(`.${e}`)) return 'image';
  }
  if (hint.includes('drawing') || hint.includes('2d')) {
    return 'image';
  }
  return 'unsupported';
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Interactive document preview with:
 * - centered fit on open
 * - mouse-wheel zoom toward cursor
 * - click-drag pan
 */
const DocumentPreviewer = ({ url, fileName, meta = {}, height = '100%' }) => {
  const viewportRef = useRef(null);
  const transformRef = useRef({ scale: 1, x: 0, y: 0 });
  const naturalRef = useRef(null);
  const dragRef = useRef(null);
  const rafRef = useRef(null);

  const [kind, setKind] = useState(() => getPreviewKind(url, meta));
  const [loading, setLoading] = useState(true);
  const [naturalSize, setNaturalSize] = useState(null);
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [isDragging, setIsDragging] = useState(false);

  const applyTransform = useCallback((next) => {
    transformRef.current = next;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setTransform(next);
    });
  }, []);

  const getFitTransform = useCallback(() => {
    const viewport = viewportRef.current;
    const natural = naturalRef.current;
    if (!viewport || !natural?.width || !natural?.height) {
      return { scale: 1, x: 0, y: 0 };
    }
    const pad = 24;
    const availW = Math.max(viewport.clientWidth - pad, 40);
    const availH = Math.max(viewport.clientHeight - pad, 40);
    const scale = Math.min(availW / natural.width, availH / natural.height);
    const x = (viewport.clientWidth - natural.width * scale) / 2;
    const y = (viewport.clientHeight - natural.height * scale) / 2;
    return { scale, x, y };
  }, []);

  const getScaleLimits = useCallback(() => {
    const fitScale = getFitTransform().scale || 1;
    return {
      fitScale,
      minScale: fitScale * 0.4,
      maxScale: fitScale * 12,
    };
  }, [getFitTransform]);

  const fitToView = useCallback(() => {
    applyTransform(getFitTransform());
  }, [applyTransform, getFitTransform]);

  // Reset when document / page changes
  useEffect(() => {
    setKind(getPreviewKind(url, meta));
    setLoading(true);
    setNaturalSize(null);
    naturalRef.current = null;
    setTransform({ scale: 1, x: 0, y: 0 });
    transformRef.current = { scale: 1, x: 0, y: 0 };
    setNumPages(0);
    setPageNumber(1);
  }, [url, meta?.format, meta?.document_type, meta?.type, meta?.tag]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const onNaturalSized = useCallback(
    (width, height) => {
      const viewport = viewportRef.current;
      if (!viewport || viewport.clientWidth < 40 || viewport.clientHeight < 40) {
        requestAnimationFrame(() => onNaturalSized(width, height));
        return;
      }
      naturalRef.current = { width, height };
      setNaturalSize({ width, height });
      setLoading(false);
      const fitted = (() => {
        const pad = 24;
        const availW = Math.max(viewport.clientWidth - pad, 40);
        const availH = Math.max(viewport.clientHeight - pad, 40);
        const scale = Math.min(availW / width, availH / height);
        return {
          scale,
          x: (viewport.clientWidth - width * scale) / 2,
          y: (viewport.clientHeight - height * scale) / 2,
        };
      })();
      applyTransform(fitted);
    },
    [applyTransform],
  );

  // Keep centered fit when the modal resizes (only if still near fit scale)
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !naturalSize || typeof ResizeObserver === 'undefined') return undefined;

    let frame = null;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        fitToView();
      });
    });
    ro.observe(viewport);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [naturalSize, fitToView]);

  /** Zoom toward a point in viewport coordinates (cursor-based). */
  const zoomAtPoint = useCallback(
    (clientX, clientY, factor) => {
      const viewport = viewportRef.current;
      if (!viewport) return;

      const rect = viewport.getBoundingClientRect();
      const cursorX = clientX - rect.left;
      const cursorY = clientY - rect.top;
      const { scale, x, y } = transformRef.current;
      const { minScale, maxScale } = getScaleLimits();

      const nextScale = clamp(scale * factor, minScale, maxScale);
      if (nextScale === scale) return;

      // Keep the content point under the cursor fixed
      const contentX = (cursorX - x) / scale;
      const contentY = (cursorY - y) / scale;
      applyTransform({
        scale: nextScale,
        x: cursorX - contentX * nextScale,
        y: cursorY - contentY * nextScale,
      });
    },
    [applyTransform, getScaleLimits],
  );

  const handleWheel = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Smooth, cursor-anchored zoom (works for mouse wheel + trackpad)
      const factor = Math.exp(-e.deltaY * WHEEL_ZOOM_SPEED);
      zoomAtPoint(e.clientX, e.clientY, factor);
    },
    [zoomAtPoint],
  );

  // Non-passive wheel listener so preventDefault works
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !naturalSize) return undefined;
    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  }, [naturalSize, handleWheel]);

  const handlePointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: transformRef.current.x,
      origY: transformRef.current.y,
    };
    setIsDragging(true);
  }, []);

  const handlePointerMove = useCallback(
    (e) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      applyTransform({
        scale: transformRef.current.scale,
        x: dragRef.current.origX + dx,
        y: dragRef.current.origY + dy,
      });
    },
    [applyTransform],
  );

  const handlePointerUp = useCallback((e) => {
    if (!dragRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = null;
    setIsDragging(false);
  }, []);

  const zoomByButton = useCallback(
    (direction) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      zoomAtPoint(cx, cy, direction > 0 ? 1.25 : 0.8);
    },
    [zoomAtPoint],
  );

  const scalePercent = (() => {
    if (!naturalSize) return 100;
    const fitScale = getFitTransform().scale || 1;
    return Math.round((transform.scale / fitScale) * 100);
  })();
  const pageInfo = useMemo(
    () => (kind === 'pdf' && numPages > 0 ? { page: pageNumber, numPages } : null),
    [kind, pageNumber, numPages],
  );

  if (!url) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty description="No document URL available" />
      </div>
    );
  }

  if (kind === 'unsupported') {
    return (
      <div
        style={{
          height,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
        }}
      >
        <Empty
          description={`Preview not available${fileName ? ` for ${fileName}` : ''}.`}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        height,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: '#f5f5f5',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '8px 12px',
          background: '#fff',
          borderBottom: '1px solid #f0f0f0',
          flexShrink: 0,
        }}
      >
        <Space size={4} wrap>
          <Tooltip title="Zoom out">
            <Button
              size="small"
              icon={<ZoomOutOutlined />}
              disabled={!naturalSize}
              onClick={() => zoomByButton(-1)}
            />
          </Tooltip>
          <Text style={{ minWidth: 52, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
            {naturalSize ? `${scalePercent}%` : '—'}
          </Text>
          <Tooltip title="Zoom in">
            <Button
              size="small"
              icon={<ZoomInOutlined />}
              disabled={!naturalSize}
              onClick={() => zoomByButton(1)}
            />
          </Tooltip>
          <Tooltip title="Fit to view">
            <Button
              size="small"
              icon={<ExpandOutlined />}
              disabled={!naturalSize}
              onClick={fitToView}
            >
              Fit
            </Button>
          </Tooltip>
          {pageInfo && pageInfo.numPages > 1 && (
            <>
              <Button
                size="small"
                icon={<LeftOutlined />}
                disabled={pageNumber <= 1}
                onClick={() => {
                  setLoading(true);
                  setNaturalSize(null);
                  naturalRef.current = null;
                  setPageNumber((p) => Math.max(1, p - 1));
                }}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {pageInfo.page} / {pageInfo.numPages}
              </Text>
              <Button
                size="small"
                icon={<RightOutlined />}
                disabled={pageNumber >= numPages}
                onClick={() => {
                  setLoading(true);
                  setNaturalSize(null);
                  naturalRef.current = null;
                  setPageNumber((p) => Math.min(numPages, p + 1));
                }}
              />
            </>
          )}
        </Space>
      </div>

      <div
        ref={viewportRef}
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          overflow: 'hidden',
          cursor: isDragging ? 'grabbing' : 'grab',
          touchAction: 'none',
          userSelect: 'none',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={fitToView}
      >
        {loading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 3,
              background: 'rgba(245,245,245,0.85)',
            }}
          >
            <Spin tip="Loading document..." />
          </div>
        )}

        {/* Hidden measure pass */}
        {!naturalSize && (
          <div style={{ position: 'absolute', left: -10000, top: 0, visibility: 'hidden' }} aria-hidden>
            {kind === 'image' ? (
              <img
                src={url}
                alt=""
                onLoad={(e) => {
                  const { naturalWidth, naturalHeight } = e.currentTarget;
                  onNaturalSized(naturalWidth, naturalHeight);
                }}
                onError={() => {
                  if (kind === 'image') {
                    setKind('pdf');
                    setLoading(true);
                    return;
                  }
                  setLoading(false);
                  setKind('unsupported');
                }}
              />
            ) : (
              <Document
                file={url}
                loading={null}
                onLoadSuccess={({ numPages: pages }) => setNumPages(pages)}
                onLoadError={() => {
                  setLoading(false);
                  setKind('unsupported');
                }}
              >
                <Page
                  pageNumber={pageNumber}
                  scale={1}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  loading={null}
                  onLoadSuccess={(page) => {
                    const viewport = page.getViewport({ scale: 1 });
                    onNaturalSized(viewport.width, viewport.height);
                  }}
                />
              </Document>
            )}
          </div>
        )}

        {naturalSize && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
              transformOrigin: '0 0',
              willChange: 'transform',
            }}
          >
            {kind === 'image' ? (
              <img
                src={url}
                alt={fileName || 'Document'}
                draggable={false}
                style={{
                  width: naturalSize.width,
                  height: naturalSize.height,
                  maxWidth: 'none',
                  display: 'block',
                  pointerEvents: 'none',
                }}
              />
            ) : (
              <Document file={url} loading={null}>
                <Page
                  pageNumber={pageNumber}
                  width={naturalSize.width}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  loading={null}
                />
              </Document>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentPreviewer;
