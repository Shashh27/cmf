import React, { useState } from "react";
import { Button, Dropdown, message } from "antd";
import { DownloadOutlined, FilePdfOutlined, FileExcelOutlined } from "@ant-design/icons";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatPlannedDims = (row, planningData) => {
  const p = planningData?.[row.key];
  if (!p?.formType || !p?.dimensions) return "—";
  const d = p.dimensions;
  if (p.formType === "Round" && d.diameter && d.length)
    return `Ø${d.diameter} × ${d.length} mm`;
  if (p.formType === "Square" && d.breadth && d.height && d.length)
    return `${d.breadth} × ${d.height} × ${d.length} mm`;
  if (p.formType === "Pipe" && d.outer_diameter && d.inner_diameter && d.length)
    return `OD${d.outer_diameter} / ID${d.inner_diameter} × ${d.length} mm`;
  return p.formType;
};

const getStockSourceLabel = (src) => {
  if (src === "general") return "General Stock";
  if (src === "order") return "Procured";
  return "Not Assigned";
};

// Build flat rows for export — one row per part
const buildExportRows = (tableData, planningData, savedRows) =>
  tableData.map((row) => ({
    Order: row.orderName || "—",
    "Raw Material": row.rmName || "—",
    "Part Number": row.partNumber || "—",
    "Part Name": row.partName || "—",
    Qty: row.qty ?? "—",
    "Extracted Dimension": row.dimension || "—",
    "Form Type": planningData?.[row.key]?.formType || "—",
    "Planned Dimension": formatPlannedDims(row, planningData),
    "Planning Status": savedRows?.[row.key] ? "Saved" : "Not Saved",
    "Assigned Material": row.linkedMaterial || "—",
    "Assigned Stock Dims": row.linkedStock || "—",
    "Stock Source": getStockSourceLabel(row.stockSource),
  }));

// ---------------------------------------------------------------------------
// PDF Export (jspdf-autotable)
// ---------------------------------------------------------------------------

const exportPDF = (tableData, planningData, savedRows) => {
  const rows = buildExportRows(tableData, planningData, savedRows);
  // A4 landscape: 297mm x 210mm, usable width ~277mm (10mm margins each side)
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  const generatedAt = new Date().toLocaleString();

  const drawPageHeader = () => {
    // Title bar
    doc.setFillColor(30, 64, 175);
    doc.rect(margin, 8, pageW - margin * 2, 10, "F");
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("PLAN & PROCURE RAW MATERIALS REPORT", pageW / 2, 14.5, { align: "center" });

    // Sub-header line
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated: ${generatedAt}`, margin, 22);
    doc.text(`Total Records: ${rows.length}`, pageW / 2, 22, { align: "center" });
    doc.text(`CMF Digitization`, pageW - margin, 22, { align: "right" });

    // Divider
    doc.setDrawColor(30, 64, 175);
    doc.setLineWidth(0.3);
    doc.line(margin, 24, pageW - margin, 24);
  };

  drawPageHeader();

  const columns = Object.keys(rows[0]);
  const body = rows.map((r) => columns.map((c) => String(r[c] ?? "—")));

  // A4 landscape usable width = 277mm; distribute columns to fit
  const colWidthsPDF = [20, 22, 18, 30, 8, 24, 14, 26, 18, 22, 24, 18];
  const totalTableWidth = colWidthsPDF.reduce((a, b) => a + b, 0); // 244mm
  const centeredMargin = (pageW - totalTableWidth) / 2;

  autoTable(doc, {
    startY: 27,
    head: [columns],
    body,
    styles: {
      fontSize: 7,
      cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
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
      fontSize: 7,
      lineColor: [255, 255, 255],
      lineWidth: 0.3,
    },
    alternateRowStyles: {
      fillColor: [239, 246, 255],
    },
    bodyStyles: {
      halign: "left",
    },
    columnStyles: {
      0:  { cellWidth: 20, halign: "center" }, // Order
      1:  { cellWidth: 22 },                   // Raw Material
      2:  { cellWidth: 18, halign: "center" }, // Part Number
      3:  { cellWidth: 30 },                   // Part Name
      4:  { cellWidth: 8,  halign: "center" }, // Qty
      5:  { cellWidth: 24 },                   // Extracted Dim
      6:  { cellWidth: 14, halign: "center" }, // Form Type
      7:  { cellWidth: 26 },                   // Planned Dim
      8:  { cellWidth: 18, halign: "center" }, // Planning Status
      9:  { cellWidth: 22 },                   // Assigned Material
      10: { cellWidth: 24 },                   // Assigned Stock Dims
      11: { cellWidth: 18, halign: "center" }, // Stock Source
    },
    didParseCell: (data) => {
      if (data.section === "body") {
        const val = data.cell.raw;
        if (val === "Saved") {
          data.cell.styles.textColor = [22, 163, 74];
          data.cell.styles.fontStyle = "bold";
        } else if (val === "Not Saved") {
          data.cell.styles.textColor = [156, 163, 175];
        } else if (val === "Not Assigned") {
          data.cell.styles.textColor = [220, 38, 38];
        } else if (val === "General Stock") {
          data.cell.styles.textColor = [22, 163, 74];
          data.cell.styles.fontStyle = "bold";
        } else if (val === "Procured") {
          data.cell.styles.textColor = [37, 99, 235];
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
    margin: { left: centeredMargin, right: centeredMargin, top: 27, bottom: 12 },
    didDrawPage: (data) => {
      // Re-draw header on every page after the first
      if (data.pageNumber > 1) drawPageHeader();
      // Footer
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(156, 163, 175);
      doc.setDrawColor(209, 213, 219);
      doc.setLineWidth(0.2);
      doc.line(margin, pageH - 10, pageW - margin, pageH - 10);
      doc.text(
        `Page ${data.pageNumber} of ${doc.internal.getNumberOfPages()}`,
        pageW / 2,
        pageH - 6,
        { align: "center" }
      );
      doc.text("CMF Digitization — Confidential", margin, pageH - 6);
    },
  });

  doc.save(`Plan_Procure_RM_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
};

// ---------------------------------------------------------------------------
// Excel Export (exceljs)
// ---------------------------------------------------------------------------

const exportExcel = async (tableData, planningData, savedRows) => {
  const rows = buildExportRows(tableData, planningData, savedRows);
  const wb = new ExcelJS.Workbook();
  wb.creator = "CMF Digitization";
  wb.created = new Date();

  const ws = wb.addWorksheet("Plan & Procure RM", { pageSetup: { orientation: "landscape" } });

  const columns = Object.keys(rows[0]);

  // Title rows
  ws.mergeCells(1, 1, 1, columns.length);
  const titleCell = ws.getCell("A1");
  titleCell.value = "PLAN & PROCURE RAW MATERIALS REPORT";
  titleCell.font = { bold: true, size: 14, color: { argb: "FF1E40AF" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
  ws.getRow(1).height = 28;

  ws.mergeCells(2, 1, 2, columns.length);
  const subCell = ws.getCell("A2");
  subCell.value = `Generated: ${new Date().toLocaleString()}   |   Total Records: ${rows.length}`;
  subCell.font = { size: 9, italic: true, color: { argb: "FF6B7280" } };
  subCell.alignment = { horizontal: "center" };
  ws.getRow(2).height = 16;

  // Blank row
  ws.addRow([]);

  // Header row
  const headerRow = ws.addRow(columns);
  headerRow.height = 20;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FF93C5FD" } },
      bottom: { style: "thin", color: { argb: "FF93C5FD" } },
      left: { style: "thin", color: { argb: "FF93C5FD" } },
      right: { style: "thin", color: { argb: "FF93C5FD" } },
    };
  });

  // Data rows
  rows.forEach((r, idx) => {
    const dataRow = ws.addRow(columns.map((c) => r[c]));
    dataRow.height = 16;
    const isAlt = idx % 2 === 1;
    dataRow.eachCell((cell, colNum) => {
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isAlt ? "FFEFF6FF" : "FFFFFFFF" } };
      cell.border = {
        top: { style: "hair", color: { argb: "FFD1D5DB" } },
        bottom: { style: "hair", color: { argb: "FFD1D5DB" } },
        left: { style: "hair", color: { argb: "FFD1D5DB" } },
        right: { style: "hair", color: { argb: "FFD1D5DB" } },
      };

      // Colour-code specific columns
      const colName = columns[colNum - 1];
      const val = cell.value;
      if (colName === "Planning Status") {
        if (val === "Saved") cell.font = { color: { argb: "FF16A34A" }, bold: true };
        else cell.font = { color: { argb: "FF9CA3AF" } };
      }
      if (colName === "Stock Source") {
        if (val === "General Stock") cell.font = { color: { argb: "FF16A34A" }, bold: true };
        else if (val === "Procured") cell.font = { color: { argb: "FF2563EB" }, bold: true };
        else cell.font = { color: { argb: "FFEF4444" } };
      }
    });
  });

  // Column widths — set individually to avoid resetting the worksheet
  const colWidths = [18, 18, 14, 38, 6, 24, 14, 24, 16, 20, 24, 18];
  columns.forEach((_, i) => {
    ws.getColumn(i + 1).width = colWidths[i] || 16;
  });

  // Freeze pane below header
  ws.views = [{ state: "frozen", ySplit: 4 }];

  // Auto-filter on header row
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: columns.length } };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Plan_Procure_RM_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const PlanProcureRMDownload = ({ tableData, planningData, savedRows }) => {
  const [loading, setLoading] = useState("");

  const handlePDF = async () => {
    if (!tableData?.length) { message.warning("No data to export"); return; }
    setLoading("pdf");
    try { exportPDF(tableData, planningData, savedRows); }
    catch (e) { message.error("PDF export failed"); }
    finally { setLoading(""); }
  };

  const handleExcel = async () => {
    if (!tableData?.length) { message.warning("No data to export"); return; }
    setLoading("excel");
    try { await exportExcel(tableData, planningData, savedRows); }
    catch (e) { message.error("Excel export failed"); }
    finally { setLoading(""); }
  };

  const menuItems = [
    {
      key: "pdf",
      label: "Download PDF",
      icon: <FilePdfOutlined style={{ color: "#ef4444" }} />,
      onClick: handlePDF,
    },
    {
      key: "excel",
      label: "Download Excel",
      icon: <FileExcelOutlined style={{ color: "#16a34a" }} />,
      onClick: handleExcel,
    },
  ];

  return (
    <Dropdown menu={{ items: menuItems }} trigger={["click"]} disabled={!!loading}>
      <Button
        icon={<DownloadOutlined />}
        loading={!!loading}
        size="small"
        style={{ fontSize: 11 }}
      >
        Export {loading ? `(${loading.toUpperCase()})` : ""}
      </Button>
    </Dropdown>
  );
};

export default PlanProcureRMDownload;
