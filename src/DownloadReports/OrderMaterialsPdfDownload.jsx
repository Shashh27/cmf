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
const fmtCost = (val) => (val != null ? `Rs.${Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—");
const fmtNum = (val, dec = 3) => (val != null ? parseFloat(val).toFixed(dec) : "—");

const buildExportRows = (rows) =>
  rows.map((row) => ({
    "Material Name": fmt(row.material_name),
    "Project Number": row.groupOrderNumbers?.length > 1
      ? row.groupOrderNumbers.join(", ")
      : fmt(row.source_order_number),
    "Part Numbers": row.part_numbers?.length > 0
      ? [...new Set(row.part_numbers)].join(", ")
      : "—",
    "Stock Dimensions": fmt(row.stock_dimensions),
    "Process Type": fmt(row.process_type),
    "Form Type": fmt(row.form_type),
    "Quantity": fmt(row.quantity),
    "Volume (m³)": fmt(row.volume),
    "Mass (kg)": fmtNum(row.mass),
    "Weight (N)": fmtNum(row.weight),
    "Est. Cost (Rs.)": fmtCost(row.estimated_cost),
    "Final Cost (Rs.)": fmtCost(row.final_cost),
    "Vendor": fmt(row.received_vendor_name || row.vendor_name),
    "Order Status": fmt(row.order_status),
  }));

// ---------------------------------------------------------------------------
// PDF Export
// ---------------------------------------------------------------------------

const exportPDF = (rows, label) => {
  const data = buildExportRows(rows);
  if (!data.length) { message.warning("No data to export"); return; }

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  const generatedAt = new Date().toLocaleString();

  // Totals
  const totalEst = rows.reduce((s, r) => s + (parseFloat(r.estimated_cost) || 0), 0);
  const totalFinal = rows.reduce((s, r) => s + (parseFloat(r.final_cost) || 0), 0);
  const totalMass = rows.reduce((s, r) => s + (parseFloat(r.mass) || 0), 0);

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
    doc.text(`Total Records: ${rows.length}  |  ${label}`, pageW / 2, 22, { align: "center" });
    doc.text("CMF Digitization", pageW - margin, 22, { align: "right" });

    doc.setDrawColor(30, 64, 175);
    doc.setLineWidth(0.3);
    doc.line(margin, 24, pageW - margin, 24);
  };

  drawHeader();

  const columns = Object.keys(data[0]);
  const body = data.map((r) => columns.map((c) => r[c]));

  // Col widths sum = 275mm, fits A4 landscape (277mm usable)
  const colW = [22, 20, 20, 26, 18, 14, 12, 16, 16, 16, 20, 20, 20, 18];
  const totalW = colW.reduce((a, b) => a + b, 0);
  const leftMargin = (pageW - totalW) / 2;

  autoTable(doc, {
    startY: 27,
    head: [columns],
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
      colW.map((w, i) => [i, {
        cellWidth: w,
        halign: [0, 1, 2, 3, 4, 5, 12, 13].includes(i) ? "left" : "center",
      }])
    ),
    didParseCell: (d) => {
      if (d.section !== "body") return;
      const v = d.cell.raw;
      if (v === "received") { d.cell.styles.textColor = [22, 163, 74]; d.cell.styles.fontStyle = "bold"; }
      else if (v === "purchase_order") { d.cell.styles.textColor = [37, 99, 235]; }
      else if (v === "purchase_request" || v === "Purchase Request") { d.cell.styles.textColor = [234, 88, 12]; }
      else if (v === "enquiry") { d.cell.styles.textColor = [8, 145, 178]; }
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

  // Totals summary box after table
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
  doc.text(`Total Estimated Cost: Rs.${Number(totalEst).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, leftMargin + 4, finalY + 16);
  doc.text(
    `Total Final Cost: Rs.${Number(totalFinal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    leftMargin + totalW / 2,
    finalY + 16
  );

  doc.save(`Procure_RM_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
};

// ---------------------------------------------------------------------------
// Excel Export
// ---------------------------------------------------------------------------

const exportExcel = async (rows, label) => {
  const data = buildExportRows(rows);
  if (!data.length) { message.warning("No data to export"); return; }

  const totalEst = rows.reduce((s, r) => s + (parseFloat(r.estimated_cost) || 0), 0);
  const totalFinal = rows.reduce((s, r) => s + (parseFloat(r.final_cost) || 0), 0);
  const totalMass = rows.reduce((s, r) => s + (parseFloat(r.mass) || 0), 0);

  const wb = new ExcelJS.Workbook();
  wb.creator = "CMF Digitization";
  wb.created = new Date();
  const ws = wb.addWorksheet("Procure RM", { pageSetup: { orientation: "landscape" } });

  const columns = Object.keys(data[0]);

  // Row 1: Title
  ws.mergeCells(1, 1, 1, columns.length);
  const t = ws.getCell("A1");
  t.value = "PROCURE RAW MATERIALS REPORT";
  t.font = { bold: true, size: 14, color: { argb: "FF1E40AF" } };
  t.alignment = { horizontal: "center", vertical: "middle" };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
  ws.getRow(1).height = 28;

  // Row 2: Subtitle
  ws.mergeCells(2, 1, 2, columns.length);
  const s = ws.getCell("A2");
  s.value = `Generated: ${new Date().toLocaleString()}   |   ${label}   |   Records: ${rows.length}`;
  s.font = { size: 9, italic: true, color: { argb: "FF6B7280" } };
  s.alignment = { horizontal: "center" };
  ws.getRow(2).height = 16;

  ws.addRow([]); // blank row

  // Row 4: Header
  const hdr = ws.addRow(columns);
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

  // Data rows
  data.forEach((r, idx) => {
    const dr = ws.addRow(columns.map((c) => r[c]));
    dr.height = 15;
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
      const colName = columns[colNum - 1];
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

  // Blank row before totals
  ws.addRow([]);

  // Totals row
  const totalsRow = ws.addRow(
    columns.map((c) => {
      if (c === "Material Name") return "OVERALL TOTALS";
      if (c === "Mass (kg)") return `${totalMass.toFixed(3)} kg`;
      if (c === "Est. Cost (Rs.)") return `Rs.${Number(totalEst).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      if (c === "Final Cost (Rs.)") return `Rs.${Number(totalFinal).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      return "";
    })
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

  // Column widths
  const colWidths = [22, 18, 22, 26, 16, 12, 10, 14, 14, 14, 18, 18, 20, 16];
  columns.forEach((_, i) => { ws.getColumn(i + 1).width = colWidths[i] || 14; });

  ws.views = [{ state: "frozen", ySplit: 4 }];
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: columns.length } };

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
    if (!rows?.length) { message.warning("No data to export"); return; }
    setLoading("pdf");
    try { exportPDF(rows, label); }
    catch (e) { message.error("PDF export failed"); }
    finally { setLoading(""); }
  };

  const handleExcel = async () => {
    if (!rows?.length) { message.warning("No data to export"); return; }
    setLoading("excel");
    try { await exportExcel(rows, label); }
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

export default OrderMaterialsPdfDownload;
