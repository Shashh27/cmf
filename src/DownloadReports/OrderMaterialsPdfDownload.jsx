import React, { useState } from "react";
import { Button, Dropdown, message } from "antd";
import { DownloadOutlined, FilePdfOutlined, FileExcelOutlined } from "@ant-design/icons";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmt = (val) => (val == null || val === "" ? "—" : String(val));
const fmtCost = (val) =>
  val != null
    ? `Rs.${Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "—";
const fmtNum = (val, dec = 3) => (val != null ? parseFloat(val).toFixed(dec) : "—");

const getMergeGroupId = (row) => {
  const groupId = row.merge_group_id?.trim?.() || row.merge_group_id;
  if (!groupId || groupId === "Group") return null;
  return groupId;
};

const uniqueJoin = (values, separator = ", ") =>
  [...new Set((values || []).filter(Boolean).map((v) => String(v).trim()).filter(Boolean))].join(separator) || "—";

const COLUMNS = [
  "Material Name",
  "Project Number",
  "Part Numbers",
  "Stock Dimensions",
  "Process Type",
  "Form Type",
  "Quantity",
  "Volume (m³)",
  "Mass (kg)",
  "Weight (N)",
  "Est. Cost (Rs.)",
  "Final Cost (Rs.)",
  "Vendor",
  "Order Status",
];

/**
 * Build export rows like the UI:
 * - Sort merge-group stocks by project so same order sits together
 * - Project Number rowspan for consecutive same-order rows (89 once for its parts)
 * - Material / Final Cost / Vendor / Status rowspan once per merge group
 */
const buildGroupedExportModel = (rows) => {
  const model = [];
  const seenGroups = new Set();
  let i = 0;

  while (i < rows.length) {
    const row = rows[i];
    const groupId = getMergeGroupId(row);

    if (!groupId) {
      model.push({
        material: fmt(row.material_name),
        project: fmt(row.source_order_number),
        parts: uniqueJoin(row.part_numbers),
        dimensions: fmt(row.stock_dimensions),
        process: fmt(row.process_type),
        form: fmt(row.form_type),
        quantity: fmt(row.quantity),
        volume: fmt(row.volume),
        mass: fmtNum(row.mass),
        weight: fmtNum(row.weight),
        estimated: fmtCost(row.estimated_cost),
        final: fmtCost(row.final_cost),
        vendor: fmt(row.received_vendor_name || row.vendor_name),
        status: fmt(row.order_status),
        materialSpan: 1,
        projectSpan: 1,
        sharedSpan: 1,
        estimated_cost_num: parseFloat(row.estimated_cost) || 0,
        final_cost_num: parseFloat(row.final_cost) || 0,
        mass_num: parseFloat(row.mass) || 0,
        includeFinalInTotal: true,
      });
      i += 1;
      continue;
    }

    if (seenGroups.has(groupId)) {
      i += 1;
      continue;
    }
    seenGroups.add(groupId);

    const groupItems = [];
    for (let j = i; j < rows.length; j += 1) {
      if (getMergeGroupId(rows[j]) === groupId) groupItems.push(rows[j]);
    }

    const orderedItems = [...groupItems].sort((a, b) => {
      const oa = String(a.source_order_number || "");
      const ob = String(b.source_order_number || "");
      if (oa !== ob) return oa.localeCompare(ob, undefined, { numeric: true });
      return (a.id || 0) - (b.id || 0);
    });

    const span = orderedItems.length;
    const sharedFinal = orderedItems.find((item) => item.final_cost != null)?.final_cost ?? orderedItems[0].final_cost;
    const sharedVendor = orderedItems[0].received_vendor_name || orderedItems[0].vendor_name;
    const sharedStatus = orderedItems[0].order_status;
    const materialWithGroup = `${fmt(orderedItems[0].material_name)}\n(${groupId})`;

    // Project rowspan for consecutive same-order blocks
    const projectSpans = orderedItems.map(() => 1);
    let start = 0;
    while (start < orderedItems.length) {
      let end = start + 1;
      const orderKey = String(orderedItems[start].source_order_number || "");
      while (
        end < orderedItems.length
        && String(orderedItems[end].source_order_number || "") === orderKey
      ) {
        end += 1;
      }
      projectSpans[start] = end - start;
      for (let k = start + 1; k < end; k += 1) projectSpans[k] = 0;
      start = end;
    }

    orderedItems.forEach((item, idx) => {
      const isFirst = idx === 0;
      const projectSpan = projectSpans[idx];
      model.push({
        material: isFirst ? materialWithGroup : "",
        project: projectSpan > 0 ? fmt(item.source_order_number) : "",
        parts: uniqueJoin(item.part_numbers),
        dimensions: fmt(item.stock_dimensions),
        process: fmt(item.process_type),
        form: fmt(item.form_type),
        quantity: fmt(item.quantity),
        volume: fmt(item.volume),
        mass: fmtNum(item.mass),
        weight: fmtNum(item.weight),
        estimated: fmtCost(item.estimated_cost),
        final: isFirst ? fmtCost(sharedFinal) : "",
        vendor: isFirst ? fmt(sharedVendor) : "",
        status: isFirst ? fmt(sharedStatus) : "",
        materialSpan: isFirst ? span : 0,
        projectSpan,
        sharedSpan: isFirst ? span : 0,
        estimated_cost_num: parseFloat(item.estimated_cost) || 0,
        final_cost_num: isFirst ? parseFloat(sharedFinal) || 0 : 0,
        mass_num: parseFloat(item.mass) || 0,
        includeFinalInTotal: isFirst,
      });
    });

    i += groupItems.length;
  }

  return model;
};

const computeExportTotals = (model) =>
  model.reduce(
    (acc, row) => {
      acc.totalMass += row.mass_num || 0;
      acc.totalEst += row.estimated_cost_num || 0;
      if (row.includeFinalInTotal) acc.totalFinal += row.final_cost_num || 0;
      return acc;
    },
    { totalEst: 0, totalFinal: 0, totalMass: 0 },
  );

const cellOrSpan = (value, span) => {
  if (!span || span <= 0) return null;
  if (span === 1) return value;
  return { content: value, rowSpan: span, styles: { valign: "middle" } };
};

const modelToPdfBody = (model) =>
  model.map((row) => {
    const cells = [
      cellOrSpan(row.material, row.materialSpan),
      cellOrSpan(row.project, row.projectSpan),
      row.parts,
      row.dimensions,
      row.process,
      row.form,
      row.quantity,
      row.volume,
      row.mass,
      row.weight,
      row.estimated,
      cellOrSpan(row.final, row.sharedSpan),
      cellOrSpan(row.vendor, row.sharedSpan),
      cellOrSpan(row.status, row.sharedSpan),
    ];
    return cells.filter((c) => c !== null);
  });

// ---------------------------------------------------------------------------
// PDF Export
// ---------------------------------------------------------------------------

const exportPDF = (rows, label) => {
  const model = buildGroupedExportModel(rows);
  if (!model.length) {
    message.warning("No data to export");
    return;
  }

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  const generatedAt = new Date().toLocaleString();
  const { totalEst, totalFinal, totalMass } = computeExportTotals(model);

  const drawHeader = () => {
    doc.setFillColor(30, 64, 175);
    doc.rect(margin, 8, pageW - margin * 2, 10, "F");
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("PROCURE RAW MATERIALS REPORT", pageW / 2, 14.5, { align: "center" });

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated: ${generatedAt}`, margin, 22);
    doc.text(`Total Records: ${model.length}  |  ${label}`, pageW / 2, 22, { align: "center" });
    doc.text("CMF Digitization", pageW - margin, 22, { align: "right" });

    doc.setDrawColor(30, 64, 175);
    doc.setLineWidth(0.3);
    doc.line(margin, 24, pageW - margin, 24);
  };

  drawHeader();

  const body = modelToPdfBody(model);
  const colW = [22, 22, 18, 26, 16, 14, 12, 14, 14, 14, 20, 20, 24, 18];
  const totalW = colW.reduce((a, b) => a + b, 0);
  const leftMargin = (pageW - totalW) / 2;

  autoTable(doc, {
    startY: 27,
    head: [COLUMNS],
    body,
    styles: {
      fontSize: 6.5,
      cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
      valign: "middle",
      overflow: "linebreak",
      lineColor: [209, 213, 219],
      lineWidth: 0.2,
      textColor: [30, 30, 30],
    },
    headStyles: {
      fillColor: [30, 64, 175],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center",
      valign: "middle",
      fontSize: 6.5,
      lineColor: [255, 255, 255],
      lineWidth: 0.3,
    },
    alternateRowStyles: { fillColor: [239, 246, 255] },
    bodyStyles: { halign: "left" },
    columnStyles: Object.fromEntries(
      colW.map((w, idx) => [
        idx,
        {
          cellWidth: w,
          halign: [0, 1, 2, 3, 4, 5, 12, 13].includes(idx) ? "left" : "center",
        },
      ]),
    ),
    didParseCell: (d) => {
      if (d.section !== "body") return;
      const v = d.cell.raw;
      const text = typeof v === "object" && v !== null ? v.content : v;
      if (text === "received") {
        d.cell.styles.textColor = [22, 163, 74];
        d.cell.styles.fontStyle = "bold";
      } else if (text === "purchase_order") {
        d.cell.styles.textColor = [37, 99, 235];
      } else if (text === "purchase_request" || text === "Purchase Request") {
        d.cell.styles.textColor = [234, 88, 12];
      } else if (text === "enquiry") {
        d.cell.styles.textColor = [8, 145, 178];
      }
    },
    margin: { left: leftMargin, right: leftMargin, top: 27, bottom: 18 },
    didDrawPage: (d) => {
      if (d.pageNumber > 1) drawHeader();
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(156, 163, 175);
      doc.setDrawColor(209, 213, 219);
      doc.setLineWidth(0.2);
      doc.line(margin, pageH - 10, pageW - margin, pageH - 10);
      doc.text(`Page ${d.pageNumber} of ${doc.internal.getNumberOfPages()}`, pageW / 2, pageH - 6, { align: "center" });
      doc.text("CMF Digitization — Confidential", margin, pageH - 6);
    },
  });

  const finalY = doc.lastAutoTable.finalY + 6;
  doc.setFillColor(239, 246, 255);
  doc.setDrawColor(30, 64, 175);
  doc.setLineWidth(0.4);
  doc.roundedRect(leftMargin, finalY, totalW, 18, 2, 2, "FD");

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 64, 175);
  doc.text("OVERALL TOTALS", leftMargin + 4, finalY + 5);

  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "normal");
  doc.text(`Total Mass: ${totalMass.toFixed(3)} kg`, leftMargin + 4, finalY + 11);
  doc.text(
    `Total Estimated Cost: Rs.${Number(totalEst).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    leftMargin + 4,
    finalY + 16,
  );
  doc.text(
    `Total Final Cost: Rs.${Number(totalFinal).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    leftMargin + totalW / 2,
    finalY + 16,
  );

  doc.save(`Procure_RM_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
};

// ---------------------------------------------------------------------------
// Excel Export
// ---------------------------------------------------------------------------

const exportExcel = async (rows, label) => {
  const model = buildGroupedExportModel(rows);
  if (!model.length) {
    message.warning("No data to export");
    return;
  }

  const { totalEst, totalFinal, totalMass } = computeExportTotals(model);
  const wb = new ExcelJS.Workbook();
  wb.creator = "CMF Digitization";
  wb.created = new Date();
  const ws = wb.addWorksheet("Procure RM", { pageSetup: { orientation: "landscape" } });

  ws.mergeCells(1, 1, 1, COLUMNS.length);
  const t = ws.getCell("A1");
  t.value = "PROCURE RAW MATERIALS REPORT";
  t.font = { bold: true, size: 14, color: { argb: "FF1E40AF" } };
  t.alignment = { horizontal: "center", vertical: "middle" };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
  ws.getRow(1).height = 28;

  ws.mergeCells(2, 1, 2, COLUMNS.length);
  const s = ws.getCell("A2");
  s.value = `Generated: ${new Date().toLocaleString()}   |   ${label}   |   Records: ${model.length}`;
  s.font = { size: 9, italic: true, color: { argb: "FF6B7280" } };
  s.alignment = { horizontal: "center" };
  ws.getRow(2).height = 16;

  ws.addRow([]);

  const hdr = ws.addRow(COLUMNS);
  hdr.height = 20;
  hdr.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FF93C5FD" } },
      bottom: { style: "thin", color: { argb: "FF93C5FD" } },
      left: { style: "thin", color: { argb: "FF93C5FD" } },
      right: { style: "thin", color: { argb: "FF93C5FD" } },
    };
  });

  const dataStartRow = 5;
  model.forEach((row, idx) => {
    const values = [
      row.material,
      row.project,
      row.parts,
      row.dimensions,
      row.process,
      row.form,
      row.quantity,
      row.volume,
      row.mass,
      row.weight,
      row.estimated,
      row.final,
      row.vendor,
      row.status,
    ];
    const dr = ws.addRow(values);
    dr.height = Math.max(15, (row.project?.split("\n").length || 1) * 12);
    const isAlt = idx % 2 === 1;
    dr.eachCell((cell, colNum) => {
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isAlt ? "FFEFF6FF" : "FFFFFFFF" } };
      cell.border = {
        top: { style: "hair", color: { argb: "FFD1D5DB" } },
        bottom: { style: "hair", color: { argb: "FFD1D5DB" } },
        left: { style: "hair", color: { argb: "FFD1D5DB" } },
        right: { style: "hair", color: { argb: "FFD1D5DB" } },
      };
      const colName = COLUMNS[colNum - 1];
      const val = cell.value;
      if (colName === "Order Status") {
        if (val === "received") cell.font = { color: { argb: "FF16A34A" }, bold: true };
        else if (val === "purchase_order") cell.font = { color: { argb: "FF2563EB" } };
        else if (val === "purchase_request") cell.font = { color: { argb: "FFEA580C" } };
        else if (val === "enquiry") cell.font = { color: { argb: "FF0891B2" } };
      }
      if ((colName === "Est. Cost (Rs.)" || colName === "Final Cost (Rs.)") && val && val !== "—") {
        cell.font = { bold: true, color: { argb: "FF1E40AF" } };
      }
    });
  });

  // Merge rowspan-style cells for grouped rows in Excel:
  // - Material / Final Cost / Vendor / Status: once per merge group
  // - Project Number: only consecutive same-order blocks (89 once for its parts)
  model.forEach((row, idx) => {
    const excelRow = dataStartRow + idx;

    if (row.sharedSpan > 1) {
      const end = excelRow + row.sharedSpan - 1;
      ws.mergeCells(excelRow, 1, end, 1); // Material
      ws.mergeCells(excelRow, 12, end, 12); // Final Cost
      ws.mergeCells(excelRow, 13, end, 13); // Vendor
      ws.mergeCells(excelRow, 14, end, 14); // Status
      [1, 12, 13, 14].forEach((col) => {
        const cell = ws.getCell(excelRow, col);
        cell.alignment = { vertical: "middle", wrapText: true, horizontal: col === 1 || col >= 13 ? "left" : "center" };
      });
    }

    if (row.projectSpan > 1) {
      const end = excelRow + row.projectSpan - 1;
      ws.mergeCells(excelRow, 2, end, 2); // Project Number
      ws.getCell(excelRow, 2).alignment = { vertical: "middle", wrapText: true, horizontal: "left" };
    }
  });

  ws.addRow([]);

  const totalsRow = ws.addRow(
    COLUMNS.map((c) => {
      if (c === "Material Name") return "OVERALL TOTALS";
      if (c === "Mass (kg)") return `${totalMass.toFixed(3)} kg`;
      if (c === "Est. Cost (Rs.)") {
        return `Rs.${Number(totalEst).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
      if (c === "Final Cost (Rs.)") {
        return `Rs.${Number(totalFinal).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
      return "";
    }),
  );
  totalsRow.height = 20;
  totalsRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "medium", color: { argb: "FF93C5FD" } },
      bottom: { style: "medium", color: { argb: "FF93C5FD" } },
      left: { style: "thin", color: { argb: "FF93C5FD" } },
      right: { style: "thin", color: { argb: "FF93C5FD" } },
    };
  });

  const colWidths = [18, 20, 16, 24, 14, 12, 10, 12, 12, 12, 16, 16, 22, 16];
  COLUMNS.forEach((_, i) => {
    ws.getColumn(i + 1).width = colWidths[i] || 14;
  });

  ws.views = [{ state: "frozen", ySplit: 4 }];
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: COLUMNS.length } };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Procure_RM_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const OrderMaterialsPdfDownload = ({ rows, label = "All Records" }) => {
  const [loading, setLoading] = useState("");

  const handlePDF = async () => {
    if (!rows?.length) {
      message.warning("No data to export");
      return;
    }
    setLoading("pdf");
    try {
      exportPDF(rows, label);
    } catch (e) {
      message.error("PDF export failed");
    } finally {
      setLoading("");
    }
  };

  const handleExcel = async () => {
    if (!rows?.length) {
      message.warning("No data to export");
      return;
    }
    setLoading("excel");
    try {
      await exportExcel(rows, label);
    } catch (e) {
      message.error("Excel export failed");
    } finally {
      setLoading("");
    }
  };

  const menuItems = [
    { key: "pdf", label: "Download PDF", icon: <FilePdfOutlined style={{ color: "#ef4444" }} />, onClick: handlePDF },
    { key: "excel", label: "Download Excel", icon: <FileExcelOutlined style={{ color: "#16a34a" }} />, onClick: handleExcel },
  ];

  return (
    <Dropdown menu={{ items: menuItems }} trigger={["click"]} disabled={!!loading}>
      <Button icon={<DownloadOutlined />} loading={!!loading} size="small" style={{ fontSize: 11 }}>
        Export
      </Button>
    </Dropdown>
  );
};

export default OrderMaterialsPdfDownload;
