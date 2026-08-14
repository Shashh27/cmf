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

const formatDate = (dateStr) => {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const COLUMNS = [
  "SL NO",
  "Project Number",
  "Project Name",
  "Customer",
  "Qty",
  "Created By",
  "Order Date",
  "Due Date",
  "Status",
  "Project Coordinator",
  "Mfg Coordinator",
  "Approval Status",
  "Approval Remarks",
  "Approved At",
];

// ---------------------------------------------------------------------------
// PDF Export
// ---------------------------------------------------------------------------

const exportPDF = (orders, label) => {
  if (!orders || orders.length === 0) {
    message.warning("No data to export");
    return;
  }

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  const generatedAt = new Date().toLocaleString();

  const drawHeader = () => {
    doc.setFillColor(30, 64, 175);
    doc.rect(margin, 8, pageW - margin * 2, 10, "F");
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("ORDER MANAGEMENT SYSTEM - PROJECTS REPORT", pageW / 2, 14.5, { align: "center" });

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated: ${generatedAt}`, margin, 22);
    doc.text(`Total Projects: ${orders.length}  |  ${label}`, pageW / 2, 22, { align: "center" });
    doc.text("CMF Digitization", pageW - margin, 22, { align: "right" });

    doc.setDrawColor(30, 64, 175);
    doc.setLineWidth(0.3);
    doc.line(margin, 24, pageW - margin, 24);
  };

  drawHeader();

  const body = orders.map((order, index) => [
    index + 1,
    fmt(order.sale_order_number),
    fmt(order.product_name || order.project_name),
    fmt(order.customer_name || order.company_name),
    fmt(order.quantity),
    fmt(order.user_name),
    formatDate(order.order_date),
    formatDate(order.due_date),
    fmt(order.status),
    fmt(order.project_coordinator_name || order.project_coordinator_id),
    fmt(order.manufacturing_coordinator_name || order.manufacturing_coordinator_id),
    fmt(order.approval_status),
    fmt(order.approval_remarks),
    formatDate(order.approved_at),
  ]);

  const colW = [12, 25, 35, 25, 10, 20, 18, 18, 15, 22, 22, 25, 25, 18];
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
          halign: [0, 5, 6, 7, 8, 12, 13].includes(idx) ? "center" : "left",
        },
      ]),
    ),
    didParseCell: (d) => {
      if (d.section !== "body") return;
      const v = d.cell.raw;
      const text = typeof v === "object" && v !== null ? v.content : v;
      if (d.column.index === 8) {
        // Status column
        if (text === "PENDING") {
          d.cell.styles.textColor = [249, 115, 22];
          d.cell.styles.fontStyle = "bold";
        } else if (text === "IN PROGRESS") {
          d.cell.styles.textColor = [37, 99, 235];
        } else if (text === "COMPLETED") {
          d.cell.styles.textColor = [22, 163, 74];
          d.cell.styles.fontStyle = "bold";
        }
      }
      if (d.column.index === 11) {
        // Approval Status column
        if (text === "APPROVED" || text === "CREATED BY ADMIN" || text === "AUTO-APPROVED") {
          d.cell.styles.textColor = [22, 163, 74];
          d.cell.styles.fontStyle = "bold";
        } else if (text === "REJECTED") {
          d.cell.styles.textColor = [239, 68, 68];
          d.cell.styles.fontStyle = "bold";
        } else if (text === "PENDING APPROVAL") {
          d.cell.styles.textColor = [249, 115, 22];
        }
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

  doc.save(`OMS_Projects_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
};

// ---------------------------------------------------------------------------
// Excel Export
// ---------------------------------------------------------------------------

const exportExcel = async (orders, label) => {
  if (!orders || orders.length === 0) {
    message.warning("No data to export");
    return;
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "CMF Digitization";
  wb.created = new Date();
  const ws = wb.addWorksheet("Orders Report", { pageSetup: { orientation: "landscape" } });

  ws.mergeCells(1, 1, 1, COLUMNS.length);
  const t = ws.getCell("A1");
  t.value = "ORDER MANAGEMENT SYSTEM - PROJECTS REPORT";
  t.font = { bold: true, size: 14, color: { argb: "FF1E40AF" } };
  t.alignment = { horizontal: "center", vertical: "middle" };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
  ws.getRow(1).height = 28;

  ws.mergeCells(2, 1, 2, COLUMNS.length);
  const s = ws.getCell("A2");
  s.value = `Generated: ${new Date().toLocaleString()}   |   ${label}   |   Records: ${orders.length}`;
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
  orders.forEach((order, idx) => {
    const values = [
      idx + 1,
      fmt(order.sale_order_number),
      fmt(order.product_name || order.project_name),
      fmt(order.customer_name || order.company_name),
      fmt(order.quantity),
      fmt(order.user_name),
      formatDate(order.order_date),
      formatDate(order.due_date),
      fmt(order.status),
      fmt(order.project_coordinator_name || order.project_coordinator_id),
      fmt(order.manufacturing_coordinator_name || order.manufacturing_coordinator_id),
      fmt(order.approval_status),
      fmt(order.approval_remarks),
      formatDate(order.approved_at),
    ];
    const dr = ws.addRow(values);
    dr.height = 18;
    const isAlt = idx % 2 === 1;
    dr.eachCell((cell, colNum) => {
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: isAlt ? "FFEFF6FF" : "FFFFFFFF" };
      cell.border = {
        top: { style: "hair", color: { argb: "FFD1D5DB" } },
        bottom: { style: "hair", color: { argb: "FFD1D5DB" } },
        left: { style: "hair", color: { argb: "FFD1D5DB" } },
        right: { style: "hair", color: { argb: "FFD1D5DB" } },
      };
      const colName = COLUMNS[colNum - 1];
      const val = cell.value;
      if (colName === "Status") {
        if (val === "PENDING") cell.font = { color: { argb: "FFF97316" }, bold: true };
        else if (val === "IN PROGRESS") cell.font = { color: { argb: "FF2563EB" } };
        else if (val === "COMPLETED") cell.font = { color: { argb: "FF16A34A" }, bold: true };
      }
      if (colName === "Approval Status") {
        if (val === "APPROVED" || val === "CREATED BY ADMIN" || val === "AUTO-APPROVED") {
          cell.font = { color: { argb: "FF16A34A" }, bold: true };
        } else if (val === "REJECTED") {
          cell.font = { color: { argb: "FFDC2626" }, bold: true };
        } else if (val === "PENDING APPROVAL") {
          cell.font = { color: { argb: "FFF97316" } };
        }
      }
    });
  });

  const colWidths = [8, 18, 28, 22, 10, 18, 16, 16, 14, 20, 20, 22, 22, 16];
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
  a.download = `OMS_Projects_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const OMSOrdersPdfDownload = ({ orders, orderCount, getOrdersForExport, label = "All Records" }) => {
  const [loading, setLoading] = useState("");

  const resolveExportOrders = () => {
    if (getOrdersForExport) return getOrdersForExport();
    return orders || [];
  };

  const resolvedOrderCount = orderCount ?? orders?.length ?? 0;

  const handlePDF = async () => {
    const exportOrders = resolveExportOrders();
    if (!exportOrders?.length) {
      message.warning("No data to export");
      return;
    }
    setLoading("pdf");
    try {
      exportPDF(exportOrders, label);
    } catch (e) {
      message.error("PDF export failed");
    } finally {
      setLoading("");
    }
  };

  const handleExcel = async () => {
    const exportOrders = resolveExportOrders();
    if (!exportOrders?.length) {
      message.warning("No data to export");
      return;
    }
    setLoading("excel");
    try {
      await exportExcel(exportOrders, label);
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
    <Dropdown menu={{ items: menuItems }} trigger={["click"]} disabled={!!loading || resolvedOrderCount === 0}>
      <Button icon={<DownloadOutlined />} loading={!!loading} size="middle" style={{ fontSize: 13 }}>
        Download Projects
      </Button>
    </Dropdown>
  );
};

export default OMSOrdersPdfDownload;
