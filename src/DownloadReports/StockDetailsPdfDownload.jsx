import React, { useState } from "react";
import { Button, Dropdown, message } from "antd";
import { DownloadOutlined, FilePdfOutlined, FileExcelOutlined } from "@ant-design/icons";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmt = (v) => (v == null || v === "" ? "—" : String(v));
const fmtNum = (v, d = 3) => (v != null ? parseFloat(v).toFixed(d) : "—");

const getDimensions = (s) => {
  if (s.form_type === "Round") return `\u2205${s.diameter} \u00d7 ${s.length}mm`;
  if (s.form_type === "Square") return `${s.breadth} \u00d7 ${s.height} \u00d7 ${s.length}mm`;
  if (s.form_type === "Pipe") return `\u2205${s.outer_diameter}/${s.inner_diameter} \u00d7 ${s.length}mm`;
  return "-";
};

const COLUMNS = [
  "SL", "Material", "Process", "Form", "Dimensions",
  "Qty", "Mass (kg)", "Source", "Order No", "Stock Status",
  "Unit", "Total Len", "Remaining", "Used For", "Unit Status",
];

// Build export rows — material shown once per material group, stock shown once per stock group
const buildExportRows = (rows) => {
  const result = [];
  let lastSlNo = null;
  let lastStockId = null;

  rows.forEach((row) => {
    const isNewMat = row.slNo !== lastSlNo;
    const isNewStock = row.stock?.id !== lastStockId;

    const matName = isNewMat ? fmt(row.material?.material_name) : "";
    const slNo = isNewMat ? (row.slNo ?? "") : "";
    const process = isNewStock ? fmt(row.stock?.process_type) : "";
    const form = isNewStock ? fmt(row.stock?.form_type) : "";
    const dim = isNewStock && row.stock ? getDimensions(row.stock) : "";
    const qty = isNewStock ? fmt(row.stock?.quantity) : "";
    const mass = isNewStock && row.stock ? fmtNum(row.stock?.mass) : "";
    const src = isNewStock && row.stock ? (row.stock.source_type === "order" ? "Order" : "General") : "";
    const order = isNewStock ? fmt(row.stock?.source_order_number) : "";
    const stockStatus = isNewStock ? fmt(row.stock?.status?.replace(/_/g, " ")) : "";

    if (row.slNo !== null) lastSlNo = row.slNo;
    if (row.stock?.id != null) lastStockId = row.stock.id;

    if (row.type === "no-stock") {
      result.push([slNo, matName, "—","—","—","—","—","—","—","—","—","—","—","—","—"]);
    } else if (row.type === "no-unit") {
      result.push([slNo, matName, process, form, dim, qty, mass, src, order, stockStatus, "—","—","—","—","—"]);
    } else {
      const usedFor = row.unit?.usages?.length > 0
        ? row.unit.usages.map((u) => u.part_number ? `${u.part_number}(${fmtNum(u.used_length, 2)}mm)` : null).filter(Boolean).join(", ") || "—"
        : "—";
      result.push([
        slNo, matName, process, form, dim, qty, mass, src, order, stockStatus,
        row.unitSeq != null ? `Unit ${row.unitSeq}` : fmt(row.unit?.id),
        fmtNum(row.unit?.total_length, 2),
        fmtNum(row.unit?.remaining_length, 2),
        usedFor,
        fmt(row.unit?.status?.replace(/_/g, " ")),
      ]);
    }
  });
  return result;
};

// ---------------------------------------------------------------------------
// PDF Export
// ---------------------------------------------------------------------------

const exportPDF = (rows, label) => {
  const data = buildExportRows(rows);
  if (!data.length) { message.warning("No data to export"); return; }

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 8;
  const generatedAt = new Date().toLocaleString();

  const drawHeader = () => {
    doc.setFillColor(30, 64, 175);
    doc.rect(margin, 8, pageW - margin * 2, 10, "F");
    doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
    doc.text("RAW MATERIAL INVENTORY REPORT", pageW / 2, 14.5, { align: "center" });
    doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 100, 100);
    doc.text(`Generated: ${generatedAt}`, margin, 22);
    doc.text(`${label}   |   Records: ${rows.length}`, pageW / 2, 22, { align: "center" });
    doc.text("CMF Digitization", pageW - margin, 22, { align: "right" });
    doc.setDrawColor(30, 64, 175); doc.setLineWidth(0.3);
    doc.line(margin, 24, pageW - margin, 24);
  };

  drawHeader();

  // col widths: SL,Material,Process,Form,Dim,Qty,Mass,Src,Order,StockSt,UnitID,TotLen,RemLen,UsedFor,UnitSt
  const colW = [8, 24, 18, 14, 30, 10, 16, 14, 22, 18, 13, 16, 16, 30, 18];

  autoTable(doc, {
    startY: 27,
    head: [COLUMNS],
    body: data,
    styles: { fontSize: 6, cellPadding: { top: 1.5, bottom: 1.5, left: 1.5, right: 1.5 }, valign: "middle", overflow: "linebreak", lineColor: [209, 213, 219], lineWidth: 0.2, textColor: [30, 30, 30] },
    headStyles: { fillColor: [30, 64, 175], textColor: [255, 255, 255], fontStyle: "bold", halign: "center", fontSize: 6, lineColor: [255, 255, 255], lineWidth: 0.3 },
    alternateRowStyles: { fillColor: [239, 246, 255] },
    bodyStyles: { halign: "center" },
    columnStyles: Object.fromEntries(colW.map((w, i) => [i, { cellWidth: w, halign: [1, 2, 4, 13].includes(i) ? "left" : "center" }])),
    didParseCell: (d) => {
      if (d.section !== "body") return;
      const v = String(d.cell.raw || "");
      if (v === "available") { d.cell.styles.textColor = [22, 163, 74]; d.cell.styles.fontStyle = "bold"; }
      else if (v === "exhausted") { d.cell.styles.textColor = [207, 19, 34]; }
      else if (v === "not available") { d.cell.styles.textColor = [89, 89, 89]; }
      else if (v === "partially used") { d.cell.styles.textColor = [212, 107, 8]; }
    },
    margin: { left: margin, right: margin, top: 27, bottom: 18 },
    didDrawPage: (d) => {
      if (d.pageNumber > 1) drawHeader();
      doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(156, 163, 175);
      doc.setDrawColor(209, 213, 219); doc.setLineWidth(0.2);
      doc.line(margin, pageH - 10, pageW - margin, pageH - 10);
      doc.text(`Page ${d.pageNumber} of ${doc.internal.getNumberOfPages()}`, pageW / 2, pageH - 6, { align: "center" });
      doc.text("CMF Digitization — Confidential", margin, pageH - 6);
    },
  });

  doc.save(`Inventory_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
};

// ---------------------------------------------------------------------------
// Excel Export
// ---------------------------------------------------------------------------

const exportExcel = async (rows, label) => {
  const data = buildExportRows(rows);
  if (!data.length) { message.warning("No data to export"); return; }

  const wb = new ExcelJS.Workbook();
  wb.creator = "CMF Digitization";
  wb.created = new Date();
  const ws = wb.addWorksheet("Inventory", { pageSetup: { orientation: "landscape" } });

  // Row 1: Title
  ws.mergeCells(1, 1, 1, COLUMNS.length);
  const t = ws.getCell("A1");
  t.value = "RAW MATERIAL INVENTORY REPORT";
  t.font = { bold: true, size: 14, color: { argb: "FF1E40AF" } };
  t.alignment = { horizontal: "center", vertical: "middle" };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
  ws.getRow(1).height = 28;

  // Row 2: Subtitle
  ws.mergeCells(2, 1, 2, COLUMNS.length);
  const s = ws.getCell("A2");
  s.value = `Generated: ${new Date().toLocaleString()}   |   ${label}   |   Rows: ${rows.length}`;
  s.font = { size: 9, italic: true, color: { argb: "FF6B7280" } };
  s.alignment = { horizontal: "center" };
  ws.getRow(2).height = 16;

  ws.addRow([]);

  // Row 4: Header
  const hdr = ws.addRow(COLUMNS);
  hdr.height = 20;
  hdr.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 8 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { top: { style: "thin", color: { argb: "FF93C5FD" } }, bottom: { style: "thin", color: { argb: "FF93C5FD" } }, left: { style: "thin", color: { argb: "FF93C5FD" } }, right: { style: "thin", color: { argb: "FF93C5FD" } } };
  });

  // Data rows
  data.forEach((r, idx) => {
    const dr = ws.addRow(r);
    dr.height = 14;
    const isAlt = idx % 2 === 1;
    dr.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isAlt ? "FFEFF6FF" : "FFFFFFFF" } };
      cell.border = { top: { style: "hair", color: { argb: "FFD1D5DB" } }, bottom: { style: "hair", color: { argb: "FFD1D5DB" } }, left: { style: "hair", color: { argb: "FFD1D5DB" } }, right: { style: "hair", color: { argb: "FFD1D5DB" } } };
      const v = String(cell.value || "");
      if (v === "available") cell.font = { color: { argb: "FF16A34A" }, bold: true };
      else if (v === "exhausted") cell.font = { color: { argb: "FFCF1322" } };
      else if (v === "not available") cell.font = { color: { argb: "FF595959" } };
      else if (v === "partially used") cell.font = { color: { argb: "FFD46B08" } };
    });
  });

  // Col widths
  const colWidths = [6, 22, 14, 10, 26, 8, 12, 10, 18, 14, 10, 12, 12, 28, 14];
  COLUMNS.forEach((_, i) => { ws.getColumn(i + 1).width = colWidths[i] || 12; });
  ws.views = [{ state: "frozen", ySplit: 4 }];
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: COLUMNS.length } };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Inventory_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
};

// ---------------------------------------------------------------------------
// Component — used both from inventory view and stock modal
// ---------------------------------------------------------------------------

export const StockDetailsPdfDownload = ({ rows = [], label = "All Records", stockData, materialName, materialDensity, materialCost, fileName }) => {
  const [loading, setLoading] = useState("");

  // Support legacy usage (stockData array) by converting to rows format
  const exportRows = rows.length > 0 ? rows : (stockData || []).map((s, i) => ({
    type: "no-unit", slNo: i + 1, matRowSpan: 1,
    material: { material_name: materialName },
    stock: s, stockRowSpan: 1,
  }));

  const handlePDF = () => {
    if (!exportRows.length) { message.warning("No data to export"); return; }
    setLoading("pdf");
    try { exportPDF(exportRows, label); }
    catch (e) { message.error("PDF export failed"); }
    finally { setLoading(""); }
  };

  const handleExcel = async () => {
    if (!exportRows.length) { message.warning("No data to export"); return; }
    setLoading("excel");
    try { await exportExcel(exportRows, label); }
    catch (e) { message.error("Excel export failed"); }
    finally { setLoading(""); }
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
