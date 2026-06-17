import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

/** Sky-blue balloon styling (matches InteractiveDrawing blue theme). */
const BALLOON_STROKE = rgb(56 / 255, 189 / 255, 248 / 255);
const BALLOON_TAG = rgb(14 / 255, 165 / 255, 233 / 255);

/**
 * Draw a circular balloon badge at the top-right of a characteristic bbox (PDF export only).
 * InteractiveDrawing keeps bbox highlights in the UI; export shows balloons only.
 */
function drawBalloonBadge(page, pageH, pageW, x, y, width, height, label, font, fontSize) {
  const txt = String(label || '').trim();
  if (!txt) return;

  const balloonD = Math.max(pageW * 0.018, 16);
  const radius = balloonD / 2;
  // Match InteractiveDrawing: balloon sits above the top-right of the bbox.
  const centerXTl = x + width + radius * 0.85;
  const centerYTl = Math.max(radius, y - radius * 0.15);
  const cx = Math.min(pageW - radius, Math.max(radius, centerXTl));
  const cy = pageH - centerYTl;

  page.drawCircle({
    x: cx,
    y: cy,
    size: radius,
    color: BALLOON_TAG,
    borderColor: BALLOON_STROKE,
    borderWidth: 0.75,
  });

  page.drawCircle({
    x: cx,
    y: cy,
    size: radius * 0.72,
    color: rgb(1, 1, 1),
  });

  const textW = font.widthOfTextAtSize(txt, fontSize);
  page.drawText(txt, {
    x: cx - textW / 2,
    y: cy - fontSize / 2 + 1,
    size: fontSize,
    font,
    color: rgb(0.12, 0.16, 0.22),
  });
}

/**
 * Build a ballooned PDF: base drawing + numbered balloon badges only (no bbox rectangles).
 * @param {{ fileUrl: string, isPdf?: boolean, balloonOverlays: Array<{ page?: number, label?: string, pdfRect: { x, y, width, height } }> }} params
 * @returns {Promise<Blob|null>}
 */
export async function exportBalloonedPdf({ fileUrl, isPdf = true, balloonOverlays = [] }) {
  if (!fileUrl || !Array.isArray(balloonOverlays) || !balloonOverlays.length) return null;

  let res;
  try {
    res = await fetch(fileUrl);
  } catch (e) {
    console.error('exportBalloonedPdf fetch failed', e);
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
      drawBalloonBadge(page, pageH, pageW, x, y, width, height, label, font, fontSize);
    }
  }

  const outBytes = await pdfDoc.save();
  return new Blob([outBytes], { type: 'application/pdf' });
}
