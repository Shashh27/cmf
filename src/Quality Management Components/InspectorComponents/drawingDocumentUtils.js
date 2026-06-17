import { QUALITY_API_BASE_URL } from '../../Config/qualityconfig';

/** Matches new "Balloon document" uploads and legacy BALOON / typo baloon. */
export function isBalloonOperationDocument(d) {
  if (!d) return false;
  const t = String(d.document_type || '').trim().toLowerCase();
  return t === 'baloon' || t === 'balloon' || t.includes('balloon');
}

export function isBalloonDocumentName(name) {
  const n = String(name || '').toLowerCase();
  return n.includes('balloon') || n.includes('baloon') || n.includes('_balloon.');
}

/** Confirmed-plan export in MinIO (legacy Balloon type or IPID with balloon filename). */
export function isExportedInspectionPlanDocument(d) {
  if (!d) return false;
  return isBalloonOperationDocument(d) || isBalloonDocumentName(d.document_name);
}

function isDrawingDocument(d) {
  if (!d || isBalloonOperationDocument(d)) return false;
  const type = (d.document_type || '').toLowerCase();
  const name = (d.document_name || '').toLowerCase();
  const url = (d.document_url || '').toLowerCase();
  const isPdfFile = url.endsWith('.pdf') || type.includes('pdf');
  return (
    type.includes('2d') ||
    type.includes('drawing') ||
    type.includes('ipid') ||
    name.includes('drawing') ||
    isPdfFile ||
    url.endsWith('.png') ||
    url.endsWith('.jpg') ||
    url.endsWith('.jpeg')
  );
}

function toDrawingInfo(doc) {
  const isPdf =
    (doc.document_url || '').toLowerCase().endsWith('.pdf') ||
    (doc.document_type || '').toLowerCase().includes('pdf');
  const endpoint = doc.operation_id != null ? 'operation-documents' : 'documents';
  return {
    url: `${QUALITY_API_BASE_URL}/${endpoint}/${doc.id}/preview`,
    isPdf,
    name: doc.document_name,
    apiDocumentId: doc.id,
    endpoint,
  };
}

/**
 * Pick the clean base drawing for interactive views (plan modal, inspector).
 * Never returns exported balloon PDFs — balloons are rendered from master BOC.
 */
export function resolveBaseDrawingDocument(operationDocs, partDocs) {
  const opDocs = (Array.isArray(operationDocs) ? operationDocs : []).filter(
    (d) => !isBalloonOperationDocument(d) && !isBalloonDocumentName(d.document_name),
  );
  const partDocList = (Array.isArray(partDocs) ? partDocs : []).filter(
    (d) => !isBalloonOperationDocument(d) && !isBalloonDocumentName(d.document_name),
  );

  const previewDrawing =
    opDocs.find(isDrawingDocument) ||
    partDocList.find(isDrawingDocument) ||
    opDocs[0] ||
    partDocList[0];

  if (!previewDrawing) {
    return { url: null, isPdf: false, name: '', apiDocumentId: null, endpoint: null };
  }

  return toDrawingInfo(previewDrawing);
}
