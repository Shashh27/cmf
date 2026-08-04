import React from "react";
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
  "Code",
  "Name",
  "Type",
  "Value",
  "Unit",
  "Formula",
];

// ---------------------------------------------------------------------------
// PDF Export
// ---------------------------------------------------------------------------

const exportPDF = (values, machine, finalMhr, recommendedMhr) => {
  if (!values || values.length === 0) {
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
    doc.text("MACHINE HOUR RATE (MHR) REPORT", pageW / 2, 14.5, { align: "center" });

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated: ${generatedAt}`, margin, 22);
    doc.text(`Machine: ${machine?.type || ""} ${machine?.model || ""}`, pageW / 2, 22, { align: "center" });
    doc.text("CMF Digitization", pageW - margin, 22, { align: "right" });

    doc.setDrawColor(30, 64, 175);
    doc.setLineWidth(0.3);
    doc.line(margin, 24, pageW - margin, 24);
  };

  drawHeader();

  // Add MHR summary
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  doc.text(`Calculated MHR: ${fmt(finalMhr)}`, margin, 28);
  doc.text(`Recommended MHR: ${fmt(recommendedMhr)}`, pageW - margin, 28, { align: "right" });

  const body = values.map((item, index) => [
    index + 1,
    fmt(item.particular?.code),
    fmt(item.particular?.name),
    item.particular?.is_input ? "Input" : "Formula",
    item.particular?.is_input 
      ? fmt(item.input_value)
      : fmt(item.computed_value?.toFixed(2)),
    fmt(item.particular?.unit),
    fmt(item.particular?.formula),
  ]);

  autoTable(doc, {
    startY: 32,
    head: [COLUMNS],
    body,
    styles: {
      fontSize: 7,
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
      fontSize: 7,
      lineColor: [255, 255, 255],
      lineWidth: 0.3,
    },
    alternateRowStyles: { fillColor: [239, 246, 255] },
    bodyStyles: { halign: "left" },
    columnStyles: {
      0: { cellWidth: 12, halign: "center" },
      1: { cellWidth: 15 },
      2: { cellWidth: 50 },
      3: { cellWidth: 15, halign: "center" },
      4: { cellWidth: 20, halign: "center" },
      5: { cellWidth: 15 },
      6: { cellWidth: 50 },
    },
    tableWidth: 'wrap',
    margin: { left: margin, right: margin },
    didParseCell: (d) => {
      if (d.section !== "body") return;
      const v = d.cell.raw;
      const text = typeof v === "object" && v !== null ? v.content : v;
      if (d.column.index === 3) {
        // Type column
        if (text === "Input") {
          d.cell.styles.textColor = [22, 163, 74];
          d.cell.styles.fontStyle = "bold";
        } else if (text === "Formula") {
          d.cell.styles.textColor = [37, 99, 235];
        }
      }
    },
  });

  doc.save(`MHR_${machine?.type}_${machine?.model}_${Date.now()}.pdf`);
  message.success("PDF exported successfully");
};

// ---------------------------------------------------------------------------
// Excel Export
// ---------------------------------------------------------------------------

const exportExcel = async (values, machine, finalMhr, recommendedMhr) => {
  if (!values || values.length === 0) {
    message.warning("No data to export");
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("MHR Report");

  // Header styling
  const headerStyle = {
    font: { bold: true, color: { argb: "FFFFFFFF" } },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } },
    alignment: { horizontal: "center", vertical: "middle" },
    border: {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    },
  };

  // Cell styling
  const cellStyle = {
    alignment: { horizontal: "left", vertical: "middle" },
    border: {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    },
  };

  const centerStyle = {
    ...cellStyle,
    alignment: { horizontal: "center", vertical: "middle" },
  };

  // Add title row
  worksheet.mergeCells("A1:G1");
  const titleCell = worksheet.getCell("A1");
  titleCell.value = "MACHINE HOUR RATE (MHR) REPORT";
  titleCell.font = { bold: true, size: 14, color: { argb: "FF1E40AF" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  // Add machine info
  worksheet.mergeCells("A2:G2");
  const machineCell = worksheet.getCell("A2");
  machineCell.value = `Machine: ${machine?.type || ""} ${machine?.model || ""}`;
  machineCell.font = { bold: true, size: 10 };
  machineCell.alignment = { horizontal: "center", vertical: "middle" };

  // Add MHR summary
  worksheet.mergeCells("A3:G3");
  const mhrCell = worksheet.getCell("A3");
  mhrCell.value = `Calculated MHR: ${fmt(finalMhr)} | Recommended MHR: ${fmt(recommendedMhr)}`;
  mhrCell.font = { bold: true, size: 10 };
  mhrCell.alignment = { horizontal: "center", vertical: "middle" };

  // Add generated at
  worksheet.mergeCells("A4:G4");
  const genCell = worksheet.getCell("A4");
  genCell.value = `Generated: ${new Date().toLocaleString()}`;
  genCell.font = { size: 9, color: { argb: "FF666666" } };
  genCell.alignment = { horizontal: "center", vertical: "middle" };

  // Add headers
  const headers = COLUMNS;
  headers.forEach((header, index) => {
    const cell = worksheet.getCell(5, index + 1);
    cell.value = header;
    Object.assign(cell, headerStyle);
  });

  // Add data
  values.forEach((item, rowIndex) => {
    const row = rowIndex + 6;
    const rowData = [
      rowIndex + 1,
      fmt(item.particular?.code),
      fmt(item.particular?.name),
      item.particular?.is_input ? "Input" : "Formula",
      item.particular?.is_input 
        ? fmt(item.input_value)
        : fmt(item.computed_value?.toFixed(2)),
      fmt(item.particular?.unit),
      fmt(item.particular?.formula),
    ];

    rowData.forEach((value, colIndex) => {
      const cell = worksheet.getCell(row, colIndex + 1);
      cell.value = value;
      const style = [0, 3, 4].includes(colIndex) ? centerStyle : cellStyle;
      Object.assign(cell, style);

      // Color coding for Type column
      if (colIndex === 3) {
        if (value === "Input") {
          cell.font = { color: { argb: "FF10B981" }, bold: true };
        } else if (value === "Formula") {
          cell.font = { color: { argb: "FF2563EB" } };
        }
      }
    });
  });

  // Auto-fit columns based on content
  worksheet.columns.forEach((column) => {
    let maxLength = 0;
    column.eachCell({ includeEmpty: true }, (cell) => {
      const cellValue = cell.value ? String(cell.value) : "";
      // Approximate character width (some characters are wider)
      const approxWidth = cellValue.length * 1.2;
      maxLength = Math.max(maxLength, approxWidth);
    });
    // Set minimum width of 10 and maximum of 60
    column.width = Math.max(Math.min(maxLength + 2, 60), 10);
  });

  // Generate buffer and download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `MHR_${machine?.type}_${machine?.model}_${Date.now()}.xlsx`;
  link.click();
  window.URL.revokeObjectURL(url);
  message.success("Excel exported successfully");
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const MachineMhrExport = ({ values, machine, finalMhr, recommendedMhr }) => {
  const items = [
    {
      key: "pdf",
      label: "Export as PDF",
      icon: <FilePdfOutlined />,
      onClick: () => exportPDF(values, machine, finalMhr, recommendedMhr),
    },
    {
      key: "excel",
      label: "Export as Excel",
      icon: <FileExcelOutlined />,
      onClick: () => exportExcel(values, machine, finalMhr, recommendedMhr),
    },
  ];

  return (
    <Dropdown menu={{ items }} trigger={["click"]}>
      <Button icon={<DownloadOutlined />} size="small">
        Export
      </Button>
    </Dropdown>
  );
};

export default MachineMhrExport;
