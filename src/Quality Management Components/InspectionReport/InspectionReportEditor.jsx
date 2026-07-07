import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import TextAlign from '@tiptap/extension-text-align';
import { HolderOutlined } from '@ant-design/icons';
import {
  buildEditorPagePayload,
  buildReportDocumentHtml,
  computeReportLayoutMm,
} from './reportDocumentBuilder';
import cmtiReportLogo from '../../assets/cmti-report-logo.png';

function classAttr() {
  return {
    default: null,
    parseHTML: (el) => el.getAttribute('class'),
    renderHTML: (attrs) => (attrs.class ? { class: attrs.class } : {}),
  };
}

const ReportTable = Table.extend({
  addAttributes() {
    return { ...this.parent?.(), class: classAttr() };
  },
});

const ReportTableRow = TableRow.extend({
  addAttributes() {
    return { ...this.parent?.(), class: classAttr() };
  },
});

const ReportTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      class: classAttr(),
      colwidth: { default: null, renderHTML: () => ({}) },
    };
  },
});

const ReportTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      class: classAttr(),
      colwidth: { default: null, renderHTML: () => ({}) },
    };
  },
});

function applySheetLayout(root, layout) {
  const tables = root?.querySelectorAll('table.ir-sheet-table') || [];
  if (!tables.length) return;

  const totalCols = layout.totalCols || 13;
  const widths = layout.colWidths?.length === totalCols
    ? layout.colWidths
    : Array.from({ length: totalCols }, () => 100 / totalCols);

  tables.forEach((table) => {
    table.style.width = '100%';
    table.style.minWidth = '100%';
    table.style.maxWidth = '100%';
    table.style.tableLayout = 'fixed';
    table.style.borderCollapse = 'collapse';
    table.style.height = 'auto';
    table.style.minHeight = '';

    table.querySelectorAll('colgroup').forEach((g) => g.remove());
    const colgroup = document.createElement('colgroup');
    widths.forEach((pct) => {
      const col = document.createElement('col');
      col.style.width = `${pct}%`;
      colgroup.appendChild(col);
    });
    table.insertBefore(colgroup, table.firstChild);

    table.querySelectorAll('td, th').forEach((cell) => {
      cell.style.width = '';
      cell.style.minWidth = '';
      cell.style.maxWidth = '';
      cell.removeAttribute('colwidth');
    });
  });
}

function ReportBannerHeader() {
  return (
    <table className="ir-header-banner" aria-label="Report header">
      <tbody>
        <tr>
          <td className="ir-logo-cell">
            <img src={cmtiReportLogo} alt="CMTI" className="ir-report-logo" />
          </td>
          <td className="ir-title-cell">
            <strong>INSPECTION REPORT</strong>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

const ReportSheetEditor = forwardRef(function ReportSheetEditor(
  {
    payload,
    pageIndex = 0,
    printRootId,
    showPanHandle = true,
    handMode = false,
    onDirtyChange,
    onLayoutChange,
    embedded = false,
    qtyGroupStart = false,
  },
  ref,
) {
  const html = useMemo(() => buildReportDocumentHtml(payload), [payload]);
  const layout = useMemo(() => computeReportLayoutMm(payload), [payload]);
  const contentKey = payload
    ? `${payload.reportNo}-${payload.totalQuantity}-${payload.sheet}-${payload.showFooter}-${payload.savedAt || ''}-${pageIndex}`
    : 'empty';
  const pageRef = useRef(null);
  const skipDirtyRef = useRef(false);
  const onDirtyChangeRef = useRef(onDirtyChange);
  const onLayoutChangeRef = useRef(onLayoutChange);

  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange;
  }, [onDirtyChange]);

  useEffect(() => {
    onLayoutChangeRef.current = onLayoutChange;
  }, [onLayoutChange]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        dropcursor: false,
        gapcursor: false,
      }),
      TextAlign.configure({ types: ['paragraph'] }),
      ReportTable.configure({ resizable: false }),
      ReportTableRow,
      ReportTableHeader,
      ReportTableCell,
    ],
    editable: true,
    content: '<p></p>',
    editorProps: {
      attributes: {
        class: 'ir-prosemirror',
        spellcheck: 'false',
      },
    },
    onUpdate: () => {
      if (!skipDirtyRef.current) onDirtyChangeRef.current?.(true);
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!handMode);
  }, [editor, handMode]);

  useImperativeHandle(ref, () => ({
    getHtml: () => editor?.getHTML?.() || '',
    getQty: () => payload?.totalQuantity || payload?.qty,
    getPageIndex: () => pageIndex,
  }), [editor, payload, pageIndex]);

  useEffect(() => {
    if (!editor || !payload) return;
    skipDirtyRef.current = true;
    editor.commands.setContent(html, false);
    onDirtyChangeRef.current?.(false);
    const resetDirtyFlag = window.setTimeout(() => {
      skipDirtyRef.current = false;
    }, 0);
    return () => window.clearTimeout(resetDirtyFlag);
  }, [editor, html, contentKey]);

  useEffect(() => {
    if (!editor || !payload) return;

    const runLayout = () => {
      const root = pageRef.current;
      if (root) {
        applySheetLayout(root, layout);
        onLayoutChangeRef.current?.();
      }
    };

    const id1 = requestAnimationFrame(runLayout);
    const id2 = window.setTimeout(runLayout, 50);
    const id3 = window.setTimeout(runLayout, 200);
    return () => {
      cancelAnimationFrame(id1);
      window.clearTimeout(id2);
      window.clearTimeout(id3);
    };
  }, [editor, layout, contentKey, payload]);

  useEffect(() => {
    const root = pageRef.current;
    if (!root || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      onLayoutChangeRef.current?.();
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, [contentKey]);

  const pageBody = (
    <div
      ref={pageRef}
      id={printRootId}
      className={`ir-page ir-a4-sheet${embedded ? ' ir-a4-sheet--embedded' : ''}${payload?.showFooter !== false ? ' ir-a4-sheet--with-footer' : ''}${qtyGroupStart ? ' ir-a4-sheet--qty-start' : ''}`}
      data-qty={payload?.totalQuantity ?? ''}
      data-page-index={pageIndex}
    >
      <div className={`ir-sheet-stack${payload?.showFooter !== false ? ' ir-sheet-stack--with-footer' : ''}`}>
        <ReportBannerHeader />
        <EditorContent editor={editor} className="ir-editor-root" />
      </div>
    </div>
  );

  if (embedded) {
    return pageBody;
  }

  return (
    <div className={`ir-zoom-host${handMode ? ' ir-zoom-host--hand' : ''}`}>
      {showPanHandle ? (
        <div
          className="ir-sheet-pan-handle"
          data-ir-pan-handle
          title="Drag to move sheet"
        >
          <HolderOutlined />
          <span>Drag to move</span>
        </div>
      ) : null}
      {pageBody}
    </div>
  );
});

function renderPageEditor({
  payload,
  page,
  index,
  pageRefs,
  handMode,
  onDirtyChange,
  onLayoutChange,
  embedded = false,
  qtyGroupStart = false,
}) {
  const pagePayload = buildEditorPagePayload(payload, page);
  return (
    <ReportSheetEditor
      key={`page-${page.pageIndex ?? index}-${page.sheet ?? index}-qty-${page.qty ?? page.totalQuantity ?? index}`}
      ref={(el) => {
        pageRefs.current[index] = el;
      }}
      payload={pagePayload}
      pageIndex={page.pageIndex ?? index}
      showPanHandle={false}
      handMode={handMode}
      onDirtyChange={onDirtyChange}
      onLayoutChange={onLayoutChange}
      embedded={embedded}
      qtyGroupStart={qtyGroupStart}
    />
  );
}

const InspectionReportEditor = forwardRef(function InspectionReportEditor(
  {
    payload,
    handMode = false,
    activePageIndex = 0,
    onLayoutChange,
    onDirtyChange,
  },
  ref,
) {
  const pageRefs = useRef([]);
  const reportPages = payload?.pages?.length ? payload.pages : null;
  const isMultiPage = Boolean(reportPages && reportPages.length > 1);

  useImperativeHandle(ref, () => ({
    getHtml: () => {
      if (reportPages?.length) {
        return pageRefs.current
          .filter(Boolean)
          .sort((a, b) => (a.getPageIndex?.() ?? 0) - (b.getPageIndex?.() ?? 0))
          .map((pageRefItem) => {
            const index = pageRefItem.getPageIndex?.() ?? 0;
            const qty = pageRefItem.getQty?.() ?? '';
            const inner = pageRefItem.getHtml?.() || '';
            return `<div class="ir-report-page" data-page-index="${index}" data-qty="${qty}">${inner}</div>`;
          })
          .join('');
      }
      return pageRefs.current[0]?.getHtml?.() || '';
    },
  }), [reportPages]);

  if (reportPages?.length) {
    if (isMultiPage) {
      const safeIndex = Math.max(0, Math.min(reportPages.length - 1, activePageIndex));
      return (
        <div className={`ir-zoom-host ir-zoom-host--paged${handMode ? ' ir-zoom-host--hand' : ''}`}>
          <div
            className="ir-sheet-pan-handle"
            data-ir-pan-handle
            title="Drag to move sheet"
          >
            <HolderOutlined />
            <span>Drag to move</span>
          </div>
          <div id="inspection-report-print-root" className="ir-print-pages-root">
            {reportPages.map((page, index) => (
              <div
                key={`page-slot-${page.pageIndex ?? index}-${page.sheet ?? index}`}
                className={`ir-print-page-slot${index === safeIndex ? ' ir-print-page-slot--active' : ''}`}
                aria-hidden={index !== safeIndex}
              >
                {renderPageEditor({
                  payload,
                  page,
                  index,
                  pageRefs,
                  handMode,
                  onDirtyChange,
                  onLayoutChange,
                  embedded: true,
                  qtyGroupStart: Boolean(page.qtyGroupStart),
                })}
              </div>
            ))}
          </div>
        </div>
      );
    }

    const page = reportPages[0];
    return (
      <ReportSheetEditor
        ref={(el) => {
          pageRefs.current[0] = el;
        }}
        payload={buildEditorPagePayload(payload, page)}
        printRootId="inspection-report-print-root"
        handMode={handMode}
        onDirtyChange={onDirtyChange}
        onLayoutChange={onLayoutChange}
      />
    );
  }

  return (
    <ReportSheetEditor
      ref={(el) => {
        pageRefs.current[0] = el;
      }}
      payload={payload}
      printRootId="inspection-report-print-root"
      handMode={handMode}
      onDirtyChange={onDirtyChange}
      onLayoutChange={onLayoutChange}
    />
  );
});

export default InspectionReportEditor;
