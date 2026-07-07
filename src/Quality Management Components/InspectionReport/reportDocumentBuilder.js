export function fmtReportTol(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  if (Math.abs(n) < 1e-12) return '0';
  return n > 0 ? `+${n}` : `${n}`;
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function matchStageRow(qtyList, masterId) {
  return qtyList.find((row) => {
    try {
      return JSON.parse(row.bbox || '{}').master_boc_id === masterId;
    } catch {
      return false;
    }
  });
}

function rowFromChar(ch, m, sno) {
  const rowNominal = m ? (m.nominal_value ?? ch.nominal) : ch.nominal;
  const rowUpper = m ? (m.uppertol ?? ch.uppertol) : ch.uppertol;
  const rowLower = m ? (m.lowertol ?? ch.lowertol) : ch.lowertol;
  return {
    sno,
    specified: `${ch.dimension_type || 'Dim'}: ${rowNominal} (${fmtReportTol(rowUpper)}/${fmtReportTol(rowLower)})`,
    zone: ch.zone || '',
    measurements: m?.measurements || [],
    instrument: m?.measured_instrument || ch.measured_instrument || 'default',
    remarks: m?.remarks || '',
  };
}

export function buildRowsForOutcome(chars, outcome) {
  const qtyList = outcome?.data || [];
  return chars.map((ch, idx) => rowFromChar(ch, matchStageRow(qtyList, ch.id), idx + 1));
}

/** @deprecated use buildRowsForOutcome — kept for callers passing flat outcomes */
export function buildReportRows({ chars, outcomes, consolidated }) {
  if (consolidated) {
    return outcomes.map((o) => ({
      qty: o.qty,
      rows: buildRowsForOutcome(chars, o),
    }));
  }
  return buildRowsForOutcome(chars, outcomes[0]);
}

/** Average numeric measured values; empty string if none are numeric. */
export function averageMeasurements(measurements) {
  const nums = (measurements || [])
    .map((v) => {
      if (v === '' || v == null) return NaN;
      const n = Number(String(v).trim());
      return Number.isFinite(n) ? n : NaN;
    })
    .filter((n) => Number.isFinite(n));
  if (!nums.length) return '';
  const avg = nums.reduce((sum, n) => sum + n, 0) / nums.length;
  const rounded = Math.round(avg * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

/** One row per characteristic with per-quantity measurement averages. */
export function buildConsolidatedRows(qtyGroups) {
  if (!qtyGroups?.length) return [];
  const charCount = qtyGroups[0].rows?.length ?? 0;
  const rows = [];
  for (let i = 0; i < charCount; i += 1) {
    const first = qtyGroups[0].rows[i];
    const qtyAverages = qtyGroups.map((group) =>
      averageMeasurements(group.rows[i]?.measurements),
    );
    rows.push({
      sno: first.sno,
      specified: first.specified,
      zone: first.zone,
      qtyAverages,
      instrument: first.instrument,
      remarks: first.remarks || '',
    });
  }
  return rows;
}

function fillerDataRowHtml(layout, isConsolidated = false) {
  const { maxSamples, specCols, instCols, remCols, quantityCount } = layout;
  const blank = '<p>&nbsp;</p>';
  if (isConsolidated) {
    const qtyCells = Array.from({ length: quantityCount }, () => `<td class="ir-col-qty">${blank}</td>`).join('');
    return `<tr class="ir-data-row ir-data-row--filler" aria-hidden="true">
      <td>${blank}</td>
      <td colspan="${specCols}">${blank}</td>
      <td class="ir-col-zone">${blank}</td>
      ${qtyCells}
      <td colspan="${instCols}">${blank}</td>
      <td colspan="${remCols}">${blank}</td>
    </tr>`;
  }
  const cells = Array.from({ length: maxSamples }, () => `<td>${blank}</td>`).join('');
  return `<tr class="ir-data-row ir-data-row--filler" aria-hidden="true">
    <td>${blank}</td>
    <td colspan="${specCols}">${blank}</td>
    <td class="ir-col-zone">${blank}</td>
    ${cells}
    <td colspan="${instCols}">${blank}</td>
    <td colspan="${remCols}">${blank}</td>
  </tr>`;
}

function buildBodyRowsHtml(rows, layout, { isConsolidated = false, padForFooter = false } = {}) {
  const rowHtml = isConsolidated ? consolidatedDataRowHtml : dataRowHtml;
  const dataRows = (rows || []).map((row) => rowHtml(row, layout)).join('');
  if (!padForFooter) return dataRows;

  const maxRows = computeMaxDataRowsPerPage(true, { singleHeaderRow: isConsolidated });
  const fillerCount = Math.max(0, maxRows - (rows || []).length);
  const fillerRows = Array.from({ length: fillerCount }, () => fillerDataRowHtml(layout, isConsolidated)).join('');
  return dataRows + fillerRows;
}

export function buildReportPayload({
  reportRows,
  reportQty,
  partName,
  partNumber,
  orderId,
  opNo,
  projectName,
  assembly,
  qtyMax = 1,
}) {
  const isConsolidated = reportQty === 'consolidated';
  const shared = {
    reportNo: `RPT-${orderId}-${opNo}`,
    componentTitle: partName || '',
    date: new Date().toLocaleDateString(),
    projectNo: String(orderId),
    drgNo: partNumber || '',
    projectName: projectName || '',
    assembly: assembly || 'Main',
  };

  if (isConsolidated) {
    const qtyGroups = reportRows;
    const quantityCount = qtyGroups.length;
    const consolidatedRows = buildConsolidatedRows(qtyGroups);
    const consolidatedTotalQuantity = quantityCount > 1 ? `All (1–${quantityCount})` : '1';
    const pages = buildPageList([{ rows: consolidatedRows }], {
      ...shared,
      totalQuantity: consolidatedTotalQuantity,
    }, {
      isConsolidated: true,
      quantityCount,
    });
    const colLayout = computeTableColumnLayout(true, quantityCount);
    return {
      ...shared,
      isConsolidated: true,
      quantityCount,
      pages,
      sheets: qtyGroups.map((source) => ({
        qty: source.qty,
        rows: source.rows,
        totalQuantity: String(source.qty),
      })),
      rows: consolidatedRows,
      maxSamples: quantityCount,
      totalCols: colLayout.totalCols,
      sheet: pages.length > 1 ? `1 of ${pages.length}` : '1 of 1',
      totalQuantity: consolidatedTotalQuantity,
    };
  }

  const rows = Array.isArray(reportRows) ? reportRows : [];
  const pages = buildPageList([{ rows }], { ...shared, totalQuantity: String(reportQty) }, {
    qty: reportQty,
  });
  const maxSamples = Math.max(3, ...pages.map((p) => p.maxSamples), 0);
  return {
    ...shared,
    totalQuantity: String(reportQty),
    sheet: pages.length > 1 ? `1 of ${pages.length}` : '1 of 1',
    pages,
    rows,
    maxSamples,
    totalCols: computeTableColumnLayout(false, maxSamples).totalCols,
    isConsolidated: false,
  };
}

/** Column spans for the measurement table (must match data rows + headers). */
export function computeTableColumnLayout(isConsolidated, maxSamples) {
  const slCols = 1;
  const specCols = 2;
  const zoneCols = 1;
  const measureCols = maxSamples;
  const compact = isConsolidated && maxSamples >= 4;
  const instCols = compact ? 1 : 2;
  const remCols = compact ? 2 : 4;
  const totalCols = slCols + specCols + zoneCols + measureCols + instCols + remCols;
  return {
    totalCols,
    slCols,
    specCols,
    zoneCols,
    measureCols,
    instCols,
    remCols,
    quantityCount: isConsolidated ? maxSamples : 0,
    compact,
  };
}

function normalizeColWidths(widths) {
  const rounded = widths.map((w) => Math.round(w * 10) / 10);
  const diff = Math.round((100 - rounded.reduce((a, b) => a + b, 0)) * 10) / 10;
  if (Math.abs(diff) > 0.001 && rounded.length) {
    rounded[rounded.length - 1] = Math.round((rounded[rounded.length - 1] + diff) * 10) / 10;
  }
  return rounded;
}

/** Meta header row spans (3 fields) — must sum to totalCols. */
export function getMetaColSpans(totalCols) {
  if (totalCols === 13) return [4, 5, 4];
  const a = Math.max(1, Math.round((totalCols * 4) / 13));
  const b = Math.max(1, Math.round((totalCols * 5) / 13));
  const c = Math.max(1, totalCols - a - b);
  return [a, b, c];
}

function metaRowsHtml(data, totalCols) {
  const [spanA, spanB, spanC] = getMetaColSpans(totalCols);
  return `<tr class="ir-meta-row">
        ${metaFieldHtml('Report No :', data.reportNo, spanA)}
        ${metaFieldHtml('Component Title:', data.componentTitle, spanB)}
        ${metaFieldHtml('Date:', data.date, spanC)}
      </tr>
      <tr class="ir-meta-row">
        ${metaFieldHtml('Project No.:', data.projectNo, spanA)}
        ${metaFieldHtml('Drg No:', data.drgNo, spanB)}
        ${metaFieldHtml('Sheet', data.sheet, spanC)}
      </tr>
      <tr class="ir-meta-row">
        ${metaFieldHtml('Project Name:', data.projectName, spanA)}
        ${metaFieldHtml('Quantity:', data.totalQuantity, spanB)}
        ${metaFieldHtml('Assembly', data.assembly, spanC)}
      </tr>`;
}

function getConsolidatedColumnWidths(quantityCount, colLayout) {
  const { instCols, remCols } = colLayout;
  const sl = 5;
  const spec = 28;
  const zone = 5;
  const inst = instCols === 1 ? 10 : 14;
  const rem = remCols === 2 ? 10 : 18;
  const qtyBudget = 100 - sl - spec - zone - inst - rem;
  const qtyEach = Math.max(5.5, qtyBudget / Math.max(1, quantityCount));
  const widths = [sl, spec / 2, spec / 2, zone];
  for (let i = 0; i < quantityCount; i += 1) widths.push(qtyEach);
  if (instCols === 2) {
    widths.push(inst / 2, inst / 2);
  } else {
    widths.push(inst);
  }
  if (remCols === 4) {
    widths.push(rem / 4, rem / 4, rem / 4, rem / 4);
  } else {
    widths.push(rem / 2, rem / 2);
  }
  return normalizeColWidths(widths);
}

/** Column width % — tuned so labels/values do not overlap (sums to 100). */
export function getReportColumnWidths(totalCols, isConsolidated, maxSamples, colLayout) {
  if (!isConsolidated && maxSamples === 3 && totalCols === 13) {
    return [8, 8, 15, 7, 8, 7, 6, 6, 7, 7, 7, 8, 6];
  }
  if (isConsolidated) {
    return getConsolidatedColumnWidths(maxSamples, colLayout || computeTableColumnLayout(true, maxSamples));
  }
  const base = 100 / totalCols;
  return Array.from({ length: totalCols }, () => Math.round(base * 100) / 100);
}

export function computeReportLayoutMm(data) {
  const isConsolidated = Boolean(data?.isConsolidated);
  const maxSamples = data?.maxSamples || 3;
  const colLayout = computeTableColumnLayout(isConsolidated, maxSamples);
  const totalCols = data?.totalCols || colLayout.totalCols;
  return {
    totalCols,
    colWidths: getReportColumnWidths(totalCols, isConsolidated, maxSamples, colLayout),
  };
}

function dataRowHtml(row, layout) {
  const { maxSamples, specCols, instCols, remCols } = layout;
  const cells = Array.from({ length: maxSamples }, (_, mi) => {
    const v = row.measurements?.[mi];
    return `<td><p>${esc(v !== '' && v != null ? v : '')}</p></td>`;
  }).join('');
  return `<tr class="ir-data-row">
    <td><p>${esc(row.sno)}</p></td>
    <td colspan="${specCols}" class="ir-text-left"><p>${esc(row.specified)}</p></td>
    <td class="ir-col-zone"><p>${esc(row.zone)}</p></td>
    ${cells}
    <td colspan="${instCols}"><p>${esc(row.instrument || 'default')}</p></td>
    <td colspan="${remCols}" class="ir-text-left"><p>${esc(row.remarks || '')}</p></td>
  </tr>`;
}

function consolidatedDataRowHtml(row, layout) {
  const { quantityCount, specCols, instCols, remCols } = layout;
  const averages = row.qtyAverages || [];
  const qtyCells = Array.from({ length: quantityCount }, (_, qi) => {
    const v = averages[qi];
    return `<td class="ir-col-qty"><p>${esc(v !== '' && v != null ? v : '')}</p></td>`;
  }).join('');
  return `<tr class="ir-data-row">
    <td><p>${esc(row.sno)}</p></td>
    <td colspan="${specCols}" class="ir-text-left"><p>${esc(row.specified)}</p></td>
    <td class="ir-col-zone"><p>${esc(row.zone)}</p></td>
    ${qtyCells}
    <td colspan="${instCols}"><p>${esc(row.instrument || 'default')}</p></td>
    <td colspan="${remCols}" class="ir-text-left"><p>${esc(row.remarks || '')}</p></td>
  </tr>`;
}

function metaFieldHtml(label, value, colspan) {
  return `<td colspan="${colspan}" class="ir-meta-field ir-text-left"><p><strong>${label}</strong> ${esc(value)}</p></td>`;
}

function splitWidthsIntoThirds(colWidths) {
  const total = colWidths.reduce((a, b) => a + b, 0);
  const t1 = total / 3;
  const t2 = (2 * total) / 3;
  let cum = 0;
  let end1 = 0;
  for (; end1 < colWidths.length; end1 += 1) {
    cum += colWidths[end1];
    if (cum >= t1 - 0.001) break;
  }
  end1 += 1;
  let end2 = end1;
  for (; end2 < colWidths.length; end2 += 1) {
    cum += colWidths[end2];
    if (cum >= t2 - 0.001) break;
  }
  end2 += 1;
  return {
    chemCols: end1,
    ultCols: end2 - end1,
    hardCols: colWidths.length - end2,
  };
}

function signSplitByWidth(colWidths) {
  const total = colWidths.reduce((a, b) => a + b, 0);
  let cum = 0;
  let left = 0;
  for (; left < colWidths.length; left += 1) {
    cum += colWidths[left];
    if (cum >= total / 2 - 0.001) break;
  }
  left += 1;
  return { signLeftCols: left, signRightCols: colWidths.length - left };
}

function labelSpanForSection(sectionCols) {
  return Math.max(1, Math.min(2, Math.round(sectionCols / 2)));
}

/** Label|value per test section; sign row 50/50 by table width. */
export function getFooterLayout(totalCols, colWidths) {
  const widths = colWidths?.length === totalCols ? colWidths : null;
  const sections = widths
    ? splitWidthsIntoThirds(widths)
    : {
        chemCols: Math.floor(totalCols / 3),
        ultCols: Math.floor(totalCols / 3),
        hardCols: totalCols - Math.floor(totalCols / 3) * 2,
      };
  const { chemCols, ultCols, hardCols } = sections;
  const labelW = labelSpanForSection(chemCols);
  const labelW2 = labelSpanForSection(ultCols);
  const labelW3 = labelSpanForSection(hardCols);
  const sign = widths
    ? signSplitByWidth(widths)
    : { signLeftCols: Math.floor(totalCols / 2), signRightCols: totalCols - Math.floor(totalCols / 2) };
  return {
    chemCols,
    ultCols,
    hardCols,
    chunk: chemCols,
    tailCols: hardCols,
    labelW,
    labelW2,
    labelW3,
    valueW1: Math.max(1, chemCols - labelW),
    valueW2: Math.max(1, ultCols - labelW2),
    valueW3: Math.max(1, hardCols - labelW3),
    ...sign,
  };
}

function footerLabelTd(text, span) {
  const spanAttr = span > 1 ? ` colspan="${span}"` : '';
  return `<td${spanAttr} class="ir-footer-label"><p><strong>${text}</strong></p></td>`;
}

function footerDetailRow(label1, label2, label3, layout, values = ['', '', '']) {
  const { labelW, labelW2, labelW3, valueW1, valueW2, valueW3 } = layout;
  const [v1 = '', v2 = '', v3 = ''] = values;
  const valueCell = (text, span) =>
    `<td colspan="${span}" class="ir-footer-value"><p>${text ? esc(text) : '<br>'}</p></td>`;
  return `<tr class="ir-page-footer ir-footer-row">
    ${footerLabelTd(label1, labelW)}
    ${valueCell(v1, valueW1)}
    ${footerLabelTd(label2, labelW2)}
    ${valueCell(v2, valueW2)}
    ${footerLabelTd(label3, labelW3)}
    ${valueCell(v3, valueW3)}
  </tr>`;
}

function footerBlockHtml(data, layout) {
  const { chemCols, ultCols, hardCols } = layout;
  return `<tr class="ir-page-footer ir-footer-head">
        <td colspan="${chemCols}"><p><strong>Chemical Test</strong></p></td>
        <td colspan="${ultCols}"><p><strong>Ultrasonic Test</strong></p></td>
        <td colspan="${hardCols}"><p><strong>Hardness Test</strong></p></td>
      </tr>
      ${footerDetailRow('Date', 'Date', 'Date', layout, footerRowValues(data.footerRows, 0))}
      ${footerDetailRow('Report No', 'Report No', 'W.O.NO', layout, footerRowValues(data.footerRows, 1))}
      ${footerDetailRow('Authoriser', 'Authoriser', 'Hardness Value', layout, footerRowValues(data.footerRows, 2))}
      ${footerDetailRow('Status', 'Status', 'Status', layout, footerRowValues(data.footerRows, 3))}
      ${footerSignRow(layout, data.inspectedBy || '', data.checkedBy || '')}`;
}

function footerSignRow(layout, inspectedBy = '', checkedBy = '') {
  const { signLeftCols, signRightCols } = layout;
  const leftValue = inspectedBy ? esc(inspectedBy) : '<br>';
  const rightValue = checkedBy ? esc(checkedBy) : '<br>';
  return `<tr class="ir-page-footer ir-sign">
    <td colspan="${signLeftCols}" class="ir-sign-block ir-sign-inspected"><p><strong>Inspected by:</strong> ${leftValue}</p></td>
    <td colspan="${signRightCols}" class="ir-sign-block ir-sign-checked"><p><strong>Checked by:</strong> ${rightValue}</p></td>
  </tr>`;
}

function footerRowValues(footerRows, index) {
  const row = footerRows?.[index];
  if (!row) return ['', '', ''];
  return [row.chemical || '', row.ultrasonic || '', row.hardness || ''];
}

/** A4 content budget (mm) — conservative so rows + footer fit without clipping. */
export const REPORT_PAGE_LAYOUT_MM = {
  pageContentHeight: 268,
  banner: 22,
  meta: 30,
  headers: 16,
  dataRow: 8.2,
  footer: 58,
};

const MIN_ORPHAN_ROWS = 8;

export function computeMaxDataRowsPerPage(includeFooter, { singleHeaderRow = false } = {}) {
  const { pageContentHeight, banner, meta, headers, dataRow, footer } = REPORT_PAGE_LAYOUT_MM;
  const headerBudget = singleHeaderRow ? 8 : headers;
  const fixed = banner + meta + headerBudget + (includeFooter ? footer : 0);
  const raw = (pageContentHeight - fixed) / dataRow;
  const safety = includeFooter ? 0.88 : 0.92;
  return Math.max(1, Math.floor(raw * safety));
}

/** Split characteristic rows across A4 pages; footer only on the final chunk. */
export function paginateReportRows(rows, { singleHeaderRow = false } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return [{ rows: [], showFooter: true }];

  const maxNoFooter = computeMaxDataRowsPerPage(false, { singleHeaderRow });
  const maxWithFooter = computeMaxDataRowsPerPage(true, { singleHeaderRow });
  const pages = [];
  let i = 0;

  while (i < list.length) {
    const remaining = list.length - i;
    if (remaining <= maxWithFooter) {
      pages.push({ rows: list.slice(i), showFooter: true });
      break;
    }
    if (remaining <= maxNoFooter) {
      const lead = remaining - maxWithFooter;
      if (lead > 0 && lead < MIN_ORPHAN_ROWS) {
        const first = Math.floor(remaining / 2);
        if (first > 0) {
          pages.push({ rows: list.slice(i, i + first), showFooter: false });
          i += first;
        }
        pages.push({ rows: list.slice(i), showFooter: true });
        break;
      }
      if (lead > 0) {
        pages.push({ rows: list.slice(i, i + lead), showFooter: false });
        i += lead;
      }
      pages.push({ rows: list.slice(i), showFooter: true });
      break;
    }
    pages.push({ rows: list.slice(i, i + maxNoFooter), showFooter: false });
    i += maxNoFooter;
  }

  return pages;
}

export function buildPageList(rowGroups, shared, {
  qty,
  footerRows,
  inspectedBy,
  checkedBy,
  isConsolidated = false,
  quantityCount = 0,
} = {}) {
  const pages = [];
  rowGroups.forEach((group) => {
    const chunks = paginateReportRows(group.rows || [], { singleHeaderRow: isConsolidated });
    chunks.forEach((chunk, chunkIndex) => {
      const maxSamples = isConsolidated
        ? quantityCount
        : Math.max(3, ...chunk.rows.map((r) => (r.measurements || []).length), 0);
      const colLayout = computeTableColumnLayout(isConsolidated, maxSamples);
      pages.push({
        qty: qty ?? group.qty,
        rows: chunk.rows,
        showFooter: chunk.showFooter,
        pageInGroup: `${chunkIndex + 1} of ${chunks.length}`,
        qtyGroupStart: chunkIndex === 0,
        totalQuantity: isConsolidated
          ? (shared.totalQuantity ?? '')
          : (qty != null ? String(qty) : String(group.qty ?? shared.totalQuantity ?? '')),
        maxSamples,
        quantityCount: isConsolidated ? quantityCount : undefined,
        isConsolidated,
        totalCols: colLayout.totalCols,
        footerRows: chunk.showFooter ? (footerRows ?? group.footerRows) : undefined,
        inspectedBy: chunk.showFooter ? inspectedBy : undefined,
        checkedBy: chunk.showFooter ? checkedBy : undefined,
      });
    });
  });
  const total = pages.length;
  pages.forEach((page, index) => {
    page.sheet = `${index + 1} of ${total}`;
    page.pageIndex = index;
  });
  return pages;
}

/** One editor page — never pass the full pages[] array into the HTML builder. */
export function buildEditorPagePayload(basePayload, page) {
  if (!basePayload || !page) return basePayload;
  const {
    pages: _pages,
    sheets: _sheets,
    rows: _rows,
    ...shared
  } = basePayload;
  return {
    ...shared,
    ...page,
    rows: page.rows,
    totalQuantity: page.totalQuantity || shared.totalQuantity,
    isConsolidated: Boolean(basePayload.isConsolidated),
    quantityCount: basePayload.quantityCount ?? page.quantityCount,
    footerRows: page.footerRows ?? basePayload.footerRows,
    inspectedBy: page.inspectedBy ?? basePayload.inspectedBy,
    checkedBy: page.checkedBy ?? basePayload.checkedBy,
  };
}

function groupPagesByQty(pages) {
  const groups = [];
  pages.forEach((page) => {
    const qtyKey = String(page.qty ?? page.totalQuantity ?? '');
    const last = groups[groups.length - 1];
    if (last && last.qtyKey === qtyKey) {
      last.pages.push(page);
    } else {
      groups.push({ qtyKey, qty: page.qty ?? page.totalQuantity, pages: [page] });
    }
  });
  return groups;
}

export { groupPagesByQty };

/** One A4 page — standard or consolidated layout; footer omitted on continuation pages. */
export function buildSingleSheetTableHtml(data) {
  if (!data) return '';
  if (data.isConsolidated) {
    return buildConsolidatedSheetTableHtml(data);
  }

  const maxSamples = data.maxSamples || 3;
  const colLayout = computeTableColumnLayout(false, maxSamples);
  const { totalCols, specCols, instCols, remCols } = colLayout;
  const colWidths = getReportColumnWidths(totalCols, false, maxSamples, colLayout);
  const layout = getFooterLayout(totalCols, colWidths);

  const bodyRows = buildBodyRowsHtml(data.rows, { maxSamples, ...colLayout }, {
    padForFooter: data.showFooter !== false,
  });

  const sampleHead = Array.from({ length: maxSamples }, (_, i) => `<th><p>${i + 1}</p></th>`).join('');
  const colgroup = `<colgroup>${colWidths.map((w) => `<col style="width:${w}%">`).join('')}</colgroup>`;
  const showFooter = data.showFooter !== false;

  const footerHtml = showFooter ? footerBlockHtml(data, layout) : '';

  return `<table class="ir-sheet-table">
    ${colgroup}
    <tbody class="ir-sheet-body">
      ${metaRowsHtml(data, totalCols)}
      <tr class="ir-head ir-head-main">
        <th><p>Sl No</p></th>
        <th colspan="${specCols}"><p>Specified Values</p></th>
        <th><p>Zone</p></th>
        <th colspan="${colLayout.measureCols}"><p>Measured Values</p></th>
        <th colspan="${instCols}"><p>Instrument</p></th>
        <th colspan="${remCols}"><p>Remarks</p></th>
      </tr>
      <tr class="ir-head ir-head-sub">
        <th><p></p></th>
        <th colspan="${specCols}"><p></p></th>
        <th><p></p></th>
        ${sampleHead}
        <th colspan="${instCols}"><p></p></th>
        <th colspan="${remCols}"><p></p></th>
      </tr>
      ${bodyRows}
      ${footerHtml}
    </tbody>
  </table>`;
}

function buildConsolidatedSheetTableHtml(data) {
  const quantityCount = data.quantityCount || data.maxSamples || 1;
  const colLayout = computeTableColumnLayout(true, quantityCount);
  const { totalCols, specCols, instCols, remCols } = colLayout;
  const colWidths = getReportColumnWidths(totalCols, true, quantityCount, colLayout);
  const layout = getFooterLayout(totalCols, colWidths);
  const showFooter = data.showFooter !== false;
  const qtyLabel = quantityCount >= 4 ? 'Qty' : 'Quantity';

  const bodyRows = buildBodyRowsHtml(data.rows, { quantityCount, ...colLayout }, {
    isConsolidated: true,
    padForFooter: showFooter,
  });

  const qtyHead = Array.from(
    { length: quantityCount },
    (_, i) => `<th class="ir-head-qty"><p>${qtyLabel} ${i + 1}</p></th>`,
  ).join('');

  const colgroup = `<colgroup>${colWidths.map((w) => `<col style="width:${w}%">`).join('')}</colgroup>`;

  const footerHtml = showFooter ? footerBlockHtml(data, layout) : '';

  return `<table class="ir-sheet-table ir-sheet-table--consolidated" data-qty-count="${quantityCount}">
    ${colgroup}
    <tbody class="ir-sheet-body">
      ${metaRowsHtml(data, totalCols)}
      <tr class="ir-head ir-head-main ir-head-group">
        <th><p>Sl No</p></th>
        <th colspan="${specCols}"><p>Specified Values</p></th>
        <th class="ir-head-zone"><p>Zone</p></th>
        ${qtyHead}
        <th colspan="${instCols}"><p>Instrument</p></th>
        <th colspan="${remCols}"><p>Remarks</p></th>
      </tr>
      ${bodyRows}
      ${footerHtml}
    </tbody>
  </table>`;
}

/** Tiptap HTML — one physical page only (used inside each ReportSheetEditor). */
export function buildReportDocumentHtml(data) {
  if (!data) return '<p></p>';
  return buildSingleSheetTableHtml(data);
}
