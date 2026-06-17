import React, { useState } from "react";
import { Button, Dropdown, message } from "antd";
import { DownloadOutlined, FilePdfOutlined, FileExcelOutlined } from "@ant-design/icons";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";

// ── Helpers ──────────────────────────────────────────────────────────────────

const formatHms = (seconds) => {
  const sec = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const fmtCost = (val) =>
  val != null && val > 0
    ? `Rs.${Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "—";

// ── PDF Export ────────────────────────────────────────────────────────────────

const exportPDF = (summaryData, productName) => {
  const { machineRows, rows, totalSetup, totalCycle, totalAll, totalCost } = summaryData;
  if (!rows?.length && !machineRows?.length) { message.warning("No data to export"); return; }

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  const generatedAt = new Date().toLocaleString();

  const drawHeader = () => {
    doc.setFillColor(30, 64, 175);
    doc.rect(margin, 8, pageW - margin * 2, 10, "F");
    doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
    doc.text("PRODUCT SUMMARY REPORT", pageW / 2, 14.5, { align: "center" });
    doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 100, 100);
    doc.text(`Product: ${productName || "N/A"}`, margin, 22);
    doc.text(`Generated: ${generatedAt}`, pageW / 2, 22, { align: "center" });
    doc.text("CMF Digitization", pageW - margin, 22, { align: "right" });
    doc.setDrawColor(30, 64, 175); doc.setLineWidth(0.3);
    doc.line(margin, 24, pageW - margin, 24);
  };

  drawHeader();

  const pageFooter = (d) => {
    if (d.pageNumber > 1) drawHeader();
    doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(156, 163, 175);
    doc.setDrawColor(209, 213, 219); doc.setLineWidth(0.2);
    doc.line(margin, pageH - 10, pageW - margin, pageH - 10);
    doc.text(`Page ${d.pageNumber} of ${doc.internal.getNumberOfPages()}`, pageW / 2, pageH - 6, { align: "center" });
    doc.text("CMF Digitization — Confidential", margin, pageH - 6);
  };

  const baseStyles = { fontSize: 6.5, cellPadding: { top: 2, bottom: 2, left: 2, right: 2 }, valign: "middle", overflow: "linebreak", lineColor: [209, 213, 219], lineWidth: 0.2, textColor: [30, 30, 30] };
  const headStyles = { fillColor: [30, 64, 175], textColor: [255, 255, 255], fontStyle: "bold", halign: "center", fontSize: 6.5, lineColor: [255, 255, 255], lineWidth: 0.3 };

  // ── 1. Summary Stats table ──
  autoTable(doc, {
    startY: 27,
    head: [["Total Setup Time", "Total Cycle Time", "Total (Setup + Cycle)", "Total Machining Cost"]],
    body: [[formatHms(totalSetup), formatHms(totalCycle), formatHms(totalAll), fmtCost(totalCost)]],
    styles: { ...baseStyles, fontStyle: "bold", halign: "center" },
    headStyles,
    alternateRowStyles: { fillColor: [239, 246, 255] },
    columnStyles: { 3: { textColor: [21, 128, 61] } },
    margin: { left: margin, right: margin, top: 27, bottom: 18 },
    didDrawPage: pageFooter,
  });

  // ── 2. Machine-wise table ──
  if (machineRows.length > 0) {
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 64, 175);
    doc.text(`Machine-wise Total Hours (${machineRows.length})`, margin, doc.lastAutoTable.finalY + 8);

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 12,
      head: [["Machine", "Setup Time", "Cycle Time", "Total Hours", "MHR Rate", "Machine Cost"]],
      body: machineRows.map((r) => [
        r.machine_name || "N/A",
        formatHms(r.setup_seconds),
        formatHms(r.cycle_seconds),
        formatHms(r.total_seconds),
        r.mhr_rate ? `Rs.${r.mhr_rate}/hr` : "—",
        fmtCost(r.machine_cost),
      ]),
      styles: baseStyles,
      headStyles,
      alternateRowStyles: { fillColor: [239, 246, 255] },
      bodyStyles: { halign: "center" },
      columnStyles: {
        0: { halign: "left" },
        5: { textColor: [21, 128, 61], fontStyle: "bold" },
      },
      margin: { left: margin, right: margin, top: 27, bottom: 18 },
      didParseCell: (d) => {
        if (d.section === "body" && d.column.index === 5 && d.cell.raw === "—") {
          d.cell.styles.textColor = [148, 163, 184];
        }
      },
      didDrawPage: pageFooter,
    });
  }

  // ── 3. Part Operations table ──
  if (rows.length > 0) {
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 64, 175);
    doc.text(`Part Operations (${rows.length})`, margin, doc.lastAutoTable.finalY + 8);

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 12,
      head: [["Part No", "Part Name", "Op#", "Operation", "Qty", "Machine", "Setup", "Cycle", "Total", "MHR Rate", "Cost", "Type"]],
      body: rows.map((r) => [
        r.part_number || "—",
        r.part_name || "—",
        r.operation_number || "—",
        r.operation_name || "—",
        r.part_qty || 1,
        r.machine_name || "N/A",
        r.setup_time || "00:00:00",
        r.cycle_time || "00:00:00",
        formatHms(r.total_seconds),
        r.mhr_rate ? `Rs.${r.mhr_rate}/hr` : "—",
        fmtCost(r.machine_cost),
        r.is_outsource ? "OUTSOURCE" : "IN-HOUSE",
      ]),
      styles: baseStyles,
      headStyles,
      alternateRowStyles: { fillColor: [239, 246, 255] },
      bodyStyles: { halign: "center" },
      columnStyles: {
        0: { halign: "left", cellWidth: 18 },
        1: { halign: "left", cellWidth: 24 },
        3: { halign: "left", cellWidth: 24 },
        5: { halign: "left", cellWidth: 20 },
        10: { textColor: [21, 128, 61], fontStyle: "bold" },
        11: { cellWidth: 16 },
      },
      didParseCell: (d) => {
        if (d.section !== "body") return;
        if (d.column.index === 11 && d.cell.raw === "OUTSOURCE") { d.cell.styles.textColor = [220, 38, 38]; d.cell.styles.fontStyle = "bold"; }
        if (d.column.index === 10 && d.cell.raw === "—") { d.cell.styles.textColor = [148, 163, 184]; }
      },
      margin: { left: margin, right: margin, top: 27, bottom: 18 },
      didDrawPage: pageFooter,
    });
  }

  doc.save(`Product_Summary_${(productName || "report").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`);
};

// ── Excel Export ──────────────────────────────────────────────────────────────

const exportExcel = async (summaryData, productName) => {
  const { machineRows, rows, totalSetup, totalCycle, totalAll, totalCost } = summaryData;
  if (!rows?.length && !machineRows?.length) { message.warning("No data to export"); return; }

  const wb = new ExcelJS.Workbook();
  wb.creator = "CMF Digitization";
  wb.created = new Date();

  const hdrFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
  const hdrFont = (sz = 9) => ({ bold: true, color: { argb: "FFFFFFFF" }, size: sz });
  const hdrAlign = { horizontal: "center", vertical: "middle", wrapText: true };
  const hdrBorder = { top: { style: "thin", color: { argb: "FF93C5FD" } }, bottom: { style: "thin", color: { argb: "FF93C5FD" } }, left: { style: "thin", color: { argb: "FF93C5FD" } }, right: { style: "thin", color: { argb: "FF93C5FD" } } };
  const dataBorder = { top: { style: "hair", color: { argb: "FFD1D5DB" } }, bottom: { style: "hair", color: { argb: "FFD1D5DB" } }, left: { style: "hair", color: { argb: "FFD1D5DB" } }, right: { style: "hair", color: { argb: "FFD1D5DB" } } };

  const addTitleRows = (ws, title, colCount) => {
    ws.mergeCells(1, 1, 1, colCount);
    const t = ws.getCell("A1");
    t.value = title; t.font = { bold: true, size: 13, color: { argb: "FF1E40AF" } };
    t.alignment = { horizontal: "center", vertical: "middle" };
    t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
    ws.getRow(1).height = 24;

    ws.mergeCells(2, 1, 2, colCount);
    const s = ws.getCell("A2");
    s.value = `Product: ${productName || "N/A"}   |   Generated: ${new Date().toLocaleString()}`;
    s.font = { size: 8, italic: true, color: { argb: "FF6B7280" } };
    s.alignment = { horizontal: "center" };
    ws.getRow(2).height = 14;
    ws.addRow([]);
  };

  const styleHeaderRow = (row) => {
    row.height = 20;
    row.eachCell((cell) => { cell.font = hdrFont(); cell.fill = hdrFill; cell.alignment = hdrAlign; cell.border = hdrBorder; });
  };

  const styleDataRow = (row, idx) => {
    const isAlt = idx % 2 === 1;
    row.height = 14;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isAlt ? "FFEFF6FF" : "FFFFFFFF" } };
      cell.border = dataBorder;
    });
  };

  // ── Sheet 1: Summary ──
  const ws1 = wb.addWorksheet("Summary", { pageSetup: { orientation: "landscape" } });
  addTitleRows(ws1, "PRODUCT SUMMARY REPORT", 4);
  styleHeaderRow(ws1.addRow(["Total Setup Time", "Total Cycle Time", "Total (Setup + Cycle)", "Total Machining Cost"]));
  const statsRow = ws1.addRow([formatHms(totalSetup), formatHms(totalCycle), formatHms(totalAll), fmtCost(totalCost)]);
  styleDataRow(statsRow, 0);
  statsRow.getCell(1).font = { bold: true, color: { argb: "FF1E40AF" }, size: 10 };
  statsRow.getCell(2).font = { bold: true, color: { argb: "FF16A34A" }, size: 10 };
  statsRow.getCell(3).font = { bold: true, color: { argb: "FF2563EB" }, size: 10 };
  statsRow.getCell(4).font = { bold: true, color: { argb: "FF7C3AED" }, size: 10 };
  [25, 25, 25, 25].forEach((w, i) => { ws1.getColumn(i + 1).width = w; });
  ws1.views = [{ state: "frozen", ySplit: 4 }];

  // ── Sheet 2: Machine-wise ──
  if (machineRows.length > 0) {
    const ws2 = wb.addWorksheet("Machine-wise", { pageSetup: { orientation: "landscape" } });
    const mCols = ["S.No", "Machine", "Setup Time", "Cycle Time", "Total Hours", "MHR Rate (Rs./hr)", "Machine Cost (Rs.)"];
    addTitleRows(ws2, "MACHINE-WISE TOTAL HOURS", mCols.length);
    styleHeaderRow(ws2.addRow(mCols));
    machineRows.forEach((r, idx) => {
      const dr = ws2.addRow([
        idx + 1, r.machine_name || "N/A",
        formatHms(r.setup_seconds), formatHms(r.cycle_seconds), formatHms(r.total_seconds),
        r.mhr_rate ? `Rs.${r.mhr_rate}/hr` : "—",
        r.machine_cost > 0 ? fmtCost(r.machine_cost) : "—",
      ]);
      styleDataRow(dr, idx);
      if (r.machine_cost > 0) dr.getCell(7).font = { bold: true, color: { argb: "FF15803D" } };
      if (r.mhr_rate) dr.getCell(6).font = { color: { argb: "FF7C3AED" } };
    });
    // Totals row
    const totRow = ws2.addRow(["", "TOTAL", "", "", "", "", fmtCost(machineRows.reduce((s, r) => s + (r.machine_cost || 0), 0))]);
    totRow.height = 18;
    totRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = { top: { style: "medium", color: { argb: "FF93C5FD" } }, bottom: { style: "medium", color: { argb: "FF93C5FD" } }, left: { style: "thin", color: { argb: "FF93C5FD" } }, right: { style: "thin", color: { argb: "FF93C5FD" } } };
    });
    [6, 24, 14, 14, 14, 18, 20].forEach((w, i) => { ws2.getColumn(i + 1).width = w; });
    ws2.views = [{ state: "frozen", ySplit: 4 }];
    ws2.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: mCols.length } };
  }

  // ── Sheet 3: Part Operations ──
  if (rows.length > 0) {
    const ws3 = wb.addWorksheet("Part Operations", { pageSetup: { orientation: "landscape" } });
    const oCols = ["S.No", "Part Number", "Part Name", "Op #", "Operation", "Qty", "Machine", "Setup", "Cycle", "Total", "MHR Rate", "Cost (Rs.)", "Type"];
    addTitleRows(ws3, "PART OPERATIONS DETAIL", oCols.length);
    styleHeaderRow(ws3.addRow(oCols));
    rows.forEach((r, idx) => {
      const dr = ws3.addRow([
        idx + 1, r.part_number || "—", r.part_name || "—",
        r.operation_number || "—", r.operation_name || "—",
        r.part_qty || 1, r.machine_name || "N/A",
        r.setup_time || "00:00:00", r.cycle_time || "00:00:00",
        formatHms(r.total_seconds),
        r.mhr_rate ? `Rs.${r.mhr_rate}/hr` : "—",
        r.machine_cost > 0 ? fmtCost(r.machine_cost) : "—",
        r.is_outsource ? "OUTSOURCE" : "IN-HOUSE",
      ]);
      styleDataRow(dr, idx);
      if (r.machine_cost > 0) dr.getCell(12).font = { bold: true, color: { argb: "FF15803D" } };
      if (r.mhr_rate) dr.getCell(11).font = { color: { argb: "FF7C3AED" } };
      if (r.is_outsource) dr.getCell(13).font = { bold: true, color: { argb: "FFDC2626" } };
    });
    // Totals row
    const totalOps = rows.reduce((s, r) => s + (r.machine_cost || 0), 0);
    const totRow = ws3.addRow(["", "", "", "", "TOTAL", "", "", "", "", "", "", fmtCost(totalOps), ""]);
    totRow.height = 18;
    totRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = { top: { style: "medium", color: { argb: "FF93C5FD" } }, bottom: { style: "medium", color: { argb: "FF93C5FD" } }, left: { style: "thin", color: { argb: "FF93C5FD" } }, right: { style: "thin", color: { argb: "FF93C5FD" } } };
    });
    [6, 16, 24, 6, 24, 6, 20, 12, 12, 12, 14, 18, 12].forEach((w, i) => { ws3.getColumn(i + 1).width = w; });
    ws3.views = [{ state: "frozen", ySplit: 4 }];
    ws3.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: oCols.length } };
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Product_Summary_${(productName || "report").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
};

// ── Component ─────────────────────────────────────────────────────────────────

export const ProductSummaryDownload = ({ summaryData, productName, fileName }) => {
  const [loading, setLoading] = useState("");

  const handlePDF = () => {
    if (!summaryData) { message.warning("No data to export"); return; }
    setLoading("pdf");
    try { exportPDF(summaryData, productName); }
    catch (e) { message.error("PDF export failed"); }
    finally { setLoading(""); }
  };

  const handleExcel = async () => {
    if (!summaryData) { message.warning("No data to export"); return; }
    setLoading("excel");
    try { await exportExcel(summaryData, productName); }
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
        Export Summary
      </Button>
    </Dropdown>
  );
};

export default ProductSummaryDownload;
