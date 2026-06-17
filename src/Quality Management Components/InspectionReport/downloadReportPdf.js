import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const CAPTURE_SCALE = 2;

function nextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

async function waitForLayout(node, ms = 100) {
  void node?.offsetHeight;
  await nextFrame();
  if (ms > 0) {
    await new Promise((resolve) => window.setTimeout(resolve, ms));
  }
}

function collectReportSheets(root) {
  if (!root) return [];

  const pagesRoot = root.classList.contains('ir-print-pages-root')
    ? root
    : root.querySelector('.ir-print-pages-root');

  if (pagesRoot) {
    return Array.from(pagesRoot.querySelectorAll('.ir-print-page-slot .ir-a4-sheet'));
  }

  if (root.classList.contains('ir-a4-sheet')) {
    return [root];
  }

  const single = root.querySelector('.ir-a4-sheet');
  return single ? [single] : [];
}

function patchCloneForCapture(doc) {
  doc.querySelectorAll('.ir-canvas-stage').forEach((node) => {
    node.style.transform = 'none';
    node.style.position = 'static';
  });
  doc.querySelectorAll('.ir-a4-sheet').forEach((sheet) => {
    sheet.style.transform = 'none';
    sheet.style.boxShadow = 'none';
    sheet.style.margin = '0';
    const hasFooter = sheet.classList.contains('ir-a4-sheet--with-footer')
      || sheet.classList.contains('ir-a4-sheet--embedded')
      || sheet.querySelector('.ir-sheet-stack--with-footer');
    if (hasFooter) {
      sheet.style.height = '297mm';
      sheet.style.maxHeight = '297mm';
      sheet.style.minHeight = '297mm';
      sheet.style.overflow = 'hidden';
    } else {
      sheet.style.height = 'auto';
      sheet.style.maxHeight = 'none';
      sheet.style.minHeight = '297mm';
      sheet.style.overflow = 'visible';
    }
  });
  doc.querySelectorAll('.ir-sheet-table').forEach((table) => {
    table.style.tableLayout = 'fixed';
    table.style.width = '100%';
    table.style.minWidth = '100%';
  });
  doc.querySelectorAll('.ir-data-row td, .ir-data-row th').forEach((cell) => {
    cell.style.height = 'auto';
    cell.style.minHeight = '8.2mm';
    cell.style.maxHeight = 'none';
    cell.style.overflow = 'visible';
    cell.style.verticalAlign = 'middle';
    cell.style.paddingTop = '4px';
    cell.style.paddingBottom = '4px';
  });
  doc.querySelectorAll('.ir-data-row td p, .ir-data-row th p').forEach((p) => {
    p.style.margin = '0';
    p.style.overflow = 'visible';
    p.style.display = 'block';
    p.style.webkitLineClamp = 'unset';
    p.style.lineClamp = 'unset';
    p.style.webkitBoxOrient = 'unset';
    p.style.textOverflow = 'clip';
    p.style.lineHeight = '1.3';
  });
  doc.querySelectorAll('.ir-meta-row td, .ir-head th').forEach((cell) => {
    cell.style.overflow = 'visible';
    cell.style.whiteSpace = 'normal';
  });
}

function setActiveCaptureSlot(pagesRoot, activeIndex) {
  if (!pagesRoot) return () => {};
  const slots = Array.from(pagesRoot.querySelectorAll('.ir-print-page-slot'));
  const prevActive = slots.findIndex((slot) => slot.classList.contains('ir-print-page-slot--active'));

  slots.forEach((slot, index) => {
    slot.classList.toggle('ir-print-page-slot--pdf-capture', index === activeIndex);
  });

  return () => {
    slots.forEach((slot, index) => {
      slot.classList.remove('ir-print-page-slot--pdf-capture');
      slot.classList.toggle('ir-print-page-slot--active', index === prevActive);
    });
  };
}

function fitImageToA4(pdf, imgData, canvas) {
  const aspect = canvas.width / canvas.height;
  const pageAspect = A4_WIDTH_MM / A4_HEIGHT_MM;
  let drawWidth = A4_WIDTH_MM;
  let drawHeight = A4_HEIGHT_MM;
  let offsetX = 0;
  let offsetY = 0;

  if (aspect > pageAspect) {
    drawHeight = A4_WIDTH_MM / aspect;
    offsetY = (A4_HEIGHT_MM - drawHeight) / 2;
  } else {
    drawWidth = A4_HEIGHT_MM * aspect;
    offsetX = (A4_WIDTH_MM - drawWidth) / 2;
  }

  pdf.addImage(imgData, 'JPEG', offsetX, offsetY, drawWidth, drawHeight);
}

/**
 * Capture each A4 sheet and save as a multi-page PDF.
 * @param {HTMLElement} element
 * @param {string} filename
 * @param {{ onProgress?: (info: { page: number, total: number }) => void }} options
 */
export async function downloadInspectionReportPdf(
  element,
  filename = 'Inspection_Report.pdf',
  options = {},
) {
  if (!element) {
    throw new Error('Report preview is not ready.');
  }

  const sheets = collectReportSheets(element);
  if (!sheets.length) {
    throw new Error('No report pages found to export.');
  }

  const pagesRoot = element.classList.contains('ir-print-pages-root')
    ? element
    : element.querySelector('.ir-print-pages-root');
  const stage = element.closest('.ir-canvas-stage');

  const prevStageTransform = stage?.style.transform ?? '';
  const prevStageOrigin = stage?.style.transformOrigin ?? '';
  const prevStagePosition = stage?.style.position ?? '';

  document.body.classList.add('ir-pdf-exporting');
  if (stage) {
    stage.style.transform = 'none';
    stage.style.transformOrigin = 'top left';
    stage.style.position = 'static';
  }

  try {
    await nextFrame();

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    for (let index = 0; index < sheets.length; index += 1) {
      options.onProgress?.({ page: index + 1, total: sheets.length });

      const restoreSlot = setActiveCaptureSlot(pagesRoot, index);
      const sheet = sheets[index];
      await waitForLayout(sheet);

      const canvas = await html2canvas(sheet, {
        scale: CAPTURE_SCALE,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
        width: sheet.scrollWidth,
        height: sheet.scrollHeight,
        windowWidth: sheet.scrollWidth,
        windowHeight: sheet.scrollHeight,
        onclone: (clonedDoc) => {
          patchCloneForCapture(clonedDoc);
        },
      });

      restoreSlot();

      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      if (index > 0) pdf.addPage();
      fitImageToA4(pdf, imgData, canvas);
    }

    pdf.save(filename);
  } finally {
    document.body.classList.remove('ir-pdf-exporting');
    if (stage) {
      stage.style.transform = prevStageTransform;
      stage.style.transformOrigin = prevStageOrigin;
      stage.style.position = prevStagePosition;
    }
    pagesRoot?.querySelectorAll('.ir-print-page-slot--pdf-capture').forEach((slot) => {
      slot.classList.remove('ir-print-page-slot--pdf-capture');
    });
  }
}
