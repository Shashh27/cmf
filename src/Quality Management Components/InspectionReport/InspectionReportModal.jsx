import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Modal, Select, Spin, Tag, Typography, message } from 'antd';
import {
  ArrowLeftOutlined,
  CloseOutlined,
  CloudDownloadOutlined,
  CompressOutlined,
  DragOutlined,
  EditOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  LeftOutlined,
  PrinterOutlined,
  ReloadOutlined,
  RightOutlined,
  SaveOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons';
import InspectionReportEditor from './InspectionReportEditor';
import { downloadInspectionReportPdf } from './downloadReportPdf';
import {
  mergeReportEditsFromHtml,
} from './reportEdits';
import { useInspectionReport } from './useInspectionReport';
import './inspectionReport.css';

const { Text, Title } = Typography;

const A4_WIDTH_PX = (210 / 25.4) * 96;
const A4_HEIGHT_PX = (297 / 25.4) * 96;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;
const ZOOM_WHEEL_FACTOR = 1.1;
const ZOOM_BUTTON_FACTOR = 1.15;

function clampZoom(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function isPanBlockedTarget(target) {
  return Boolean(target?.closest?.('button, a, input, textarea, select, .ant-btn, .ant-select'));
}

/**
 * Self-contained inspection report viewer: PDF-like editable page (Tiptap) + Word export.
 */
export default function InspectionReportModal({
  open,
  target,
  projectName,
  assemblyName,
  onClose,
}) {
  const viewportRef = useRef(null);
  const panRef = useRef({ x: 0, y: 0 });
  const panDragRef = useRef({
    pending: false,
    active: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  });
  const [fitZoom, setFitZoom] = useState(0.75);
  const [manualZoom, setManualZoom] = useState(null);
  const [downloadingWord, setDownloadingWord] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [exportProgress, setExportProgress] = useState(null);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const editorRef = useRef(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [handMode, setHandMode] = useState(false);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const hasCenteredRef = useRef(false);
  const zoomStateRef = useRef({ fitZoom: 0.75, manualZoom: null });

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  const applyPan = useCallback((next) => {
    panRef.current = next;
    setPan(next);
  }, []);

  const {
    loading,
    payload,
    reportQty,
    setReportQty,
    qtyOptions,
    downloadDocx,
    saveEdits,
    reload,
  } = useInspectionReport({
    target,
    projectName,
    assemblyName,
    enabled: open && !!target,
  });

  const displayPayload = payload;
  const pageCount = displayPayload?.pages?.length ?? 1;
  const isMultiPage = pageCount > 1;

  useEffect(() => {
    if (!open) {
      setIsDirty(false);
    }
  }, [open]);

  useEffect(() => {
    setActivePageIndex(0);
  }, [reportQty, payload?.reportNo, payload?.totalQuantity]);

  useEffect(() => {
    if (!payload || loading) return;
    setIsDirty(false);
  }, [payload, loading, reportQty]);

  const recomputeFitZoom = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    if (width < 80 || height < 80) return;
    const pad = 32;
    const page = el.querySelector('.ir-print-page-slot--active .ir-a4-sheet')
      || el.querySelector('.ir-print-carousel-slide:not([aria-hidden="true"]) .ir-a4-sheet')
      || el.querySelector('#inspection-report-print-root .ir-a4-sheet')
      || el.querySelector('#inspection-report-print-root');
    const neededH = page?.offsetHeight || A4_HEIGHT_PX;
    const scaleW = (width - pad) / A4_WIDTH_PX;
    const scaleH = (height - pad) / neededH;
    setFitZoom(clampZoom(Math.min(scaleW, scaleH) * 0.98));
  }, []);

  const centerSheet = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const host = viewport.querySelector('.ir-zoom-host');
    if (!host) return;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const currentZoom = zoomStateRef.current.manualZoom ?? zoomStateRef.current.fitZoom;
    const pw = host.offsetWidth * currentZoom;
    const ph = host.offsetHeight * currentZoom;
    applyPan({
      x: Math.max(24, (vw - pw) / 2),
      y: Math.max(24, (vh - ph) / 2),
    });
    hasCenteredRef.current = true;
  }, [applyPan]);

  const applyZoomAtAnchor = useCallback((nextZoom, anchorX, anchorY) => {
    const clamped = clampZoom(nextZoom);
    const currentZoom = zoomStateRef.current.manualZoom ?? zoomStateRef.current.fitZoom;
    if (Math.abs(clamped - currentZoom) < 0.001) return;
    const pan = panRef.current;
    const contentX = (anchorX - pan.x) / currentZoom;
    const contentY = (anchorY - pan.y) / currentZoom;
    zoomStateRef.current = { ...zoomStateRef.current, manualZoom: clamped };
    setManualZoom(clamped);
    applyPan({
      x: anchorX - contentX * clamped,
      y: anchorY - contentY * clamped,
    });
    hasCenteredRef.current = true;
  }, [applyPan]);

  useEffect(() => {
    if (!open) {
      setManualZoom(null);
      setHandMode(false);
      hasCenteredRef.current = false;
      applyPan({ x: 0, y: 0 });
      return undefined;
    }
    const id = requestAnimationFrame(recomputeFitZoom);
    window.addEventListener('resize', recomputeFitZoom);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', recomputeFitZoom);
    };
  }, [open, applyPan, payload, loading, reportQty, recomputeFitZoom]);

  useEffect(() => {
    if (!open || !payload || loading) return undefined;
    hasCenteredRef.current = false;
    const t = window.setTimeout(() => {
      recomputeFitZoom();
      if (zoomStateRef.current.manualZoom == null) {
        centerSheet();
      }
    }, 150);
    return () => window.clearTimeout(t);
  }, [open, payload, loading, reportQty, recomputeFitZoom, centerSheet]);

  useEffect(() => {
    if (!open || !payload || loading || manualZoom != null) return undefined;
    const id = requestAnimationFrame(() => centerSheet());
    return () => cancelAnimationFrame(id);
  }, [open, payload, loading, fitZoom, manualZoom, centerSheet]);

  const zoom = manualZoom ?? fitZoom;
  const zoomPct = Math.round(zoom * 100);
  const isFitMode = manualZoom == null;

  useEffect(() => {
    zoomStateRef.current = { fitZoom, manualZoom };
  }, [fitZoom, manualZoom]);

  const nudgeZoom = (delta) => {
    const viewport = viewportRef.current;
    const base = manualZoom ?? fitZoom;
    const factor = delta > 0 ? ZOOM_BUTTON_FACTOR : 1 / ZOOM_BUTTON_FACTOR;
    const next = clampZoom(base * factor);
    if (!viewport) {
      setManualZoom(next);
      return;
    }
    applyZoomAtAnchor(next, viewport.clientWidth / 2, viewport.clientHeight / 2);
  };

  const handleFit = () => {
    setManualZoom(null);
    hasCenteredRef.current = false;
    requestAnimationFrame(() => {
      recomputeFitZoom();
      requestAnimationFrame(centerSheet);
    });
  };

  const goToPage = useCallback((nextIndex) => {
    setActivePageIndex((prev) => {
      const clamped = Math.max(0, Math.min(pageCount - 1, nextIndex));
      return Number.isFinite(clamped) ? clamped : prev;
    });
    hasCenteredRef.current = false;
    window.setTimeout(() => {
      if (zoomStateRef.current.manualZoom == null) {
        centerSheet();
      }
    }, 50);
  }, [pageCount, centerSheet]);

  useEffect(() => {
    if (!open) return undefined;

    const onWheel = (event) => {
      const viewport = viewportRef.current;
      if (!viewport || !viewport.contains(event.target)) return;
      if (event.target.closest('.ant-select-dropdown, .ir-sidebar, button, a, .ant-btn, input, textarea, select')) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const { fitZoom: fit, manualZoom: manual } = zoomStateRef.current;
      const current = manual ?? fit;
      const factor = event.deltaY > 0 ? 1 / ZOOM_WHEEL_FACTOR : ZOOM_WHEEL_FACTOR;
      const next = clampZoom(current * factor);
      const rect = viewport.getBoundingClientRect();
      applyZoomAtAnchor(next, event.clientX - rect.left, event.clientY - rect.top);
    };

    document.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => document.removeEventListener('wheel', onWheel, { capture: true });
  }, [open, applyZoomAtAnchor]);

  useEffect(() => {
    if (!open || !isMultiPage) return undefined;
    const onKeyDown = (event) => {
      if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToPage(activePageIndex - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goToPage(activePageIndex + 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, isMultiPage, activePageIndex, goToPage]);

  useEffect(() => {
    if (!open || !payload || loading) return undefined;
    hasCenteredRef.current = false;
    const t = window.setTimeout(() => {
      if (zoomStateRef.current.manualZoom == null) {
        centerSheet();
      }
    }, 80);
    return () => window.clearTimeout(t);
  }, [activePageIndex, open, payload, loading, centerSheet]);

  useEffect(() => {
    if (!open) return undefined;

    const viewport = () => viewportRef.current;

    const onMouseDown = (event) => {
      const root = viewport();
      if (!root || loading) return;
      if (!root.contains(event.target)) return;
      if (event.button !== 0 && event.button !== 1) return;
      if (isPanBlockedTarget(event.target)) return;

      const onHandle = Boolean(event.target.closest('[data-ir-pan-handle]'));
      const handActive = handMode || event.button === 1;

      // Only pan from grip bar, hand tool, or middle-click — never from normal sheet clicks.
      if (!handActive && !onHandle) return;

      panDragRef.current = {
        pending: false,
        active: true,
        startX: event.clientX,
        startY: event.clientY,
        originX: panRef.current.x,
        originY: panRef.current.y,
      };

      setIsPanning(true);
      event.preventDefault();
      event.stopPropagation();
    };

    const onMouseMove = (event) => {
      const drag = panDragRef.current;
      if (!drag.active) return;

      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;

      event.preventDefault();
      applyPan({
        x: drag.originX + dx,
        y: drag.originY + dy,
      });
    };

    const endPan = (event) => {
      const drag = panDragRef.current;
      if (!drag.active) return;
      if (drag.active) event.preventDefault();
      drag.pending = false;
      drag.active = false;
      setIsPanning(false);
    };

    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('mousemove', onMouseMove, { passive: false });
    document.addEventListener('mouseup', endPan);
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', endPan);
    };
  }, [open, loading, handMode, applyPan]);

  const handlePrint = () => {
    if (!displayPayload) return;
    window.print();
  };

  const handleSave = async () => {
    const html = editorRef.current?.getHtml?.();
    if (!html || !payload) {
      message.warning('Report preview is not ready.');
      return;
    }
    try {
      setSaving(true);
      const merged = mergeReportEditsFromHtml(html, payload);
      await saveEdits(merged);
      setIsDirty(false);
      message.success('Report saved to database. Downloads will include your edits.');
    } catch (err) {
      console.error(err);
      message.error(err.response?.data?.detail || err.message || 'Could not save report edits.');
    } finally {
      setSaving(false);
    }
  };

  const handleReload = async () => {
    setIsDirty(false);
    await reload();
  };

  const handleDownloadWord = async () => {
    if (isDirty) {
      message.warning('Save your changes before downloading Word.');
      return;
    }
    try {
      setDownloadingWord(true);
      setExportProgress(null);
      await downloadDocx(displayPayload, { useSavedEdits: Boolean(displayPayload?.savedAt) });
      message.success('Word report downloaded.');
    } catch (err) {
      console.error(err);
      message.error(err.response?.data?.detail || err.message || 'Word download failed');
    } finally {
      setDownloadingWord(false);
      setExportProgress(null);
    }
  };

  const handleDownloadPdf = async () => {
    if (isDirty) {
      message.warning('Save your changes before downloading PDF.');
      return;
    }
    const root = document.getElementById('inspection-report-print-root');
    if (!root || !displayPayload) {
      message.warning('Report preview is not ready.');
      return;
    }
    try {
      setDownloadingPdf(true);
      setExportProgress(null);
      await downloadInspectionReportPdf(
        root,
        `Inspection_Report_${displayPayload.reportNo}.pdf`,
        {
          onProgress: ({ page, total }) => setExportProgress({ page, total }),
        },
      );
      message.success('PDF report downloaded.');
    } catch (err) {
      console.error(err);
      message.error(err.message || 'PDF download failed');
    } finally {
      setDownloadingPdf(false);
      setExportProgress(null);
    }
  };

  const isExporting = downloadingPdf || downloadingWord;
  const exportTitle = downloadingPdf
    ? 'Generating PDF'
    : downloadingWord
      ? 'Generating Word document'
      : '';
  const exportDetail = downloadingPdf && exportProgress?.total > 1
    ? `Capturing page ${exportProgress.page} of ${exportProgress.total}…`
    : 'Please wait, this may take a moment…';

  const partLabel = target?.partNumber || '—';
  const opLabel = target?.opNo ?? '—';
  const qtyLabel = reportQty === 'consolidated' ? 'Consolidated' : `Qty ${reportQty}`;

  return (
    <Modal
      className="ir-modal"
      open={open}
      onCancel={onClose}
      width="100%"
      style={{ top: 0, padding: 0, maxWidth: '100vw' }}
      footer={null}
      destroyOnClose
      closable={false}
      title={null}
      maskClosable
    >
      <div className="ir-layout">
        <aside className="ir-sidebar">
          <div className="ir-sidebar-panel ir-sidebar-panel--chrome">
            <div className="ir-sidebar-header">
              <Button
                type="text"
                icon={<ArrowLeftOutlined />}
                className="ir-back-btn"
                onClick={onClose}
              >
                Back
              </Button>
              <Button
                type="text"
                icon={<CloseOutlined />}
                className="ir-close-btn"
                aria-label="Close"
                onClick={onClose}
              />
            </div>

            <div className="ir-sidebar-brand">
              <div className="ir-sidebar-brand-icon-wrap">
                <FileTextOutlined className="ir-sidebar-brand-icon" />
              </div>
              <div className="ir-sidebar-brand-text">
                <Title level={5} className="ir-sidebar-title">Inspection Report</Title>
                <Text type="secondary" className="ir-sidebar-subtitle">A4 editable preview</Text>
              </div>
            </div>
          </div>

          <div className="ir-sidebar-panel">
            <Text className="ir-sidebar-section-title">Part details</Text>
            <div className="ir-meta-grid">
              <div className="ir-meta-item">
                <Text className="ir-sidebar-label">Part</Text>
                <Text strong className="ir-sidebar-value">{partLabel}</Text>
              </div>
              <div className="ir-meta-item">
                <Text className="ir-sidebar-label">Operation</Text>
                <Text strong className="ir-sidebar-value">Op {opLabel}</Text>
              </div>
            </div>
            <div className="ir-meta-qty">
              <Text className="ir-sidebar-label">Quantity</Text>
              <Select
                size="middle"
                className="ir-sidebar-select"
                value={reportQty}
                options={qtyOptions}
                onChange={setReportQty}
                disabled={loading}
              />
            </div>
          </div>

          <div className="ir-sidebar-panel ir-sidebar-panel--actions">
            <div className="ir-sidebar-actions-head">
              <Text className="ir-sidebar-section-title">Actions</Text>
              {isDirty ? (
                <Tag color="orange" className="ir-status-tag">Unsaved</Tag>
              ) : displayPayload?.savedAt ? (
                <Tag color="success" className="ir-status-tag">Saved</Tag>
              ) : null}
            </div>

            <Button
              block
              size="large"
              type="primary"
              icon={<SaveOutlined />}
              className="ir-save-btn"
              loading={saving}
              disabled={!payload || loading || !isDirty}
              onClick={() => void handleSave()}
            >
              Save changes
            </Button>

            <div className="ir-action-row">
              <Button
                icon={<PrinterOutlined />}
                className="ir-sidebar-btn-secondary"
                onClick={handlePrint}
                disabled={!displayPayload || loading}
              >
                Print
              </Button>
              <Button
                icon={<ReloadOutlined />}
                className="ir-sidebar-btn-secondary"
                onClick={() => void handleReload()}
                loading={loading}
              >
                Reload
              </Button>
            </div>

            <Text className="ir-sidebar-export-label">Export</Text>
            <div className="ir-export-grid">
              <Button
                icon={<FilePdfOutlined />}
                className="ir-sidebar-btn-secondary"
                loading={downloadingPdf}
                disabled={!displayPayload || loading || downloadingWord || isDirty}
                onClick={() => void handleDownloadPdf()}
              >
                PDF
              </Button>
              <Button
                icon={<CloudDownloadOutlined />}
                className="ir-sidebar-btn-secondary"
                loading={downloadingWord}
                disabled={!displayPayload || loading || downloadingPdf || isDirty}
                onClick={() => void handleDownloadWord()}
              >
                Word
              </Button>
            </div>
          </div>

          <div className="ir-sidebar-panel ir-sidebar-panel--view">
            <Text className="ir-sidebar-section-title">View</Text>
            <Button
              block
              type={handMode ? 'primary' : 'default'}
              icon={<DragOutlined />}
              className={handMode ? 'ir-hand-btn--active' : 'ir-sidebar-btn-secondary'}
              onClick={() => setHandMode((v) => !v)}
            >
              {handMode ? 'Hand tool on' : 'Hand tool'}
            </Button>
            <div className="ir-zoom-toolbar">
              <Button
                icon={<ZoomOutOutlined />}
                disabled={zoom <= MIN_ZOOM + 0.001}
                onClick={() => nudgeZoom(-1)}
              />
              <button
                type="button"
                className={`ir-zoom-readout${isFitMode ? ' ir-zoom-readout--fit' : ''}`}
                onClick={handleFit}
                title="Reset to fit page"
              >
                {isFitMode ? 'Fit' : `${zoomPct}%`}
              </button>
              <Button
                icon={<ZoomInOutlined />}
                disabled={zoom >= MAX_ZOOM - 0.001}
                onClick={() => nudgeZoom(1)}
              />
              <Button
                icon={<CompressOutlined />}
                title="Fit to screen"
                onClick={handleFit}
              />
            </div>
          </div>

          <Text type="secondary" className="ir-sidebar-footer-hint">
            {handMode
              ? 'Turn off Hand tool to edit cells.'
              : isMultiPage
                ? 'Scroll to zoom · arrows to change page · grip to drag.'
                : 'Scroll to zoom · click cells to edit · grip bar to drag.'}
          </Text>
        </aside>

        <section className="ir-workspace">
          <div className="ir-workspace-chrome">
            <div className="ir-workspace-meta">
              <span className={`ir-mode-pill${handMode ? ' ir-mode-pill--pan' : ' ir-mode-pill--edit'}`}>
                {handMode ? <DragOutlined /> : <EditOutlined />}
                {handMode ? 'Pan' : 'Edit'}
              </span>
              <Text className="ir-workspace-breadcrumb">
                {partLabel} · Op {opLabel} · {qtyLabel}
              </Text>
              {isDirty ? (
                <Tag color="orange" className="ir-workspace-tag">Unsaved edits</Tag>
              ) : displayPayload?.savedAt ? (
                <Tag color="success" className="ir-workspace-tag">Saved</Tag>
              ) : null}
            </div>
            <div className="ir-workspace-tools">
              {isMultiPage ? (
                <Text className="ir-workspace-page">
                  Page {activePageIndex + 1} / {pageCount}
                </Text>
              ) : null}
              <Text className="ir-workspace-zoom">{isFitMode ? 'Fit' : `${zoomPct}%`}</Text>
            </div>
          </div>

          <div
            ref={viewportRef}
            className={`ir-canvas-viewport${isPanning ? ' ir-canvas-viewport--panning' : ''}${handMode ? ' ir-canvas-viewport--hand' : ''}${isMultiPage ? ' ir-canvas-viewport--carousel' : ''}`}
          >
            {isMultiPage ? (
              <>
                <Button
                  type="default"
                  shape="circle"
                  size="large"
                  className="ir-page-nav ir-page-nav--prev"
                  icon={<LeftOutlined />}
                  disabled={activePageIndex <= 0 || loading}
                  aria-label="Previous page"
                  onClick={() => goToPage(activePageIndex - 1)}
                />
                <Button
                  type="default"
                  shape="circle"
                  size="large"
                  className="ir-page-nav ir-page-nav--next"
                  icon={<RightOutlined />}
                  disabled={activePageIndex >= pageCount - 1 || loading}
                  aria-label="Next page"
                  onClick={() => goToPage(activePageIndex + 1)}
                />
              </>
            ) : null}
            <div
              className="ir-canvas-stage"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${Number(zoom.toFixed(3))})`,
                transformOrigin: '0 0',
              }}
            >
              <Spin spinning={loading} wrapperClassName="ir-canvas-spin">
                {displayPayload ? (
                  <InspectionReportEditor
                    ref={editorRef}
                    payload={displayPayload}
                    handMode={handMode}
                    activePageIndex={activePageIndex}
                    onDirtyChange={setIsDirty}
                    onLayoutChange={() => {
                      recomputeFitZoom();
                      if (zoomStateRef.current.manualZoom == null && !hasCenteredRef.current) {
                        centerSheet();
                      }
                    }}
                  />
                ) : (
                  <div className="ir-page ir-a4-sheet ir-page-empty">
                    <Text type="secondary">No report data</Text>
                  </div>
                )}
              </Spin>
            </div>
          </div>
        </section>
      </div>

      {isExporting ? (
        <div className="ir-export-overlay" role="status" aria-live="polite" aria-busy="true">
          <div className="ir-export-overlay-card">
            <Spin size="large" />
            <Title level={4} className="ir-export-overlay-title">{exportTitle}</Title>
            <Text type="secondary" className="ir-export-overlay-detail">{exportDetail}</Text>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
