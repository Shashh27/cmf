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

const machineLabel = (m) => {
  const parts = [m.make, m.model].filter(Boolean);
  return parts.length ? parts.join(" ") : m.type || `M${m.id}`;
};

// ---------------------------------------------------------------------------
// PDF Export
// ---------------------------------------------------------------------------

const exportPDF = (particulars, machines, valueLookup, editedValues, editedRecommendedMhr) => {
  if (!particulars || particulars.length === 0) {
    message.warning("No data to export");
    return;
  }

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 8;
  const generatedAt = new Date().toLocaleString();

  const drawHeader = () => {
    doc.setFillColor(30, 64, 175);
    doc.rect(margin, 8, pageW - margin * 2, 10, "F");
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("MACHINE HOUR RATE (MHR) MATRIX REPORT", pageW / 2, 14.5, { align: "center" });

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated: ${generatedAt}`, margin, 22);
    doc.text(`Total Machines: ${machines.length}`, pageW / 2, 22, { align: "center" });
    doc.text("CMF Digitization", pageW - margin, 22, { align: "right" });

    doc.setDrawColor(30, 64, 175);
    doc.setLineWidth(0.3);
    doc.line(margin, 24, pageW - margin, 24);
  };

  drawHeader();

  // Build headers: SL, Particulars, Code, Calculation, then each machine
  const headers = ["SL", "PARTICULARS", "CODE", "CALCULATION", ...machines.map(m => machineLabel(m))];

  // Build body data
  const body = particulars.map((p, idx) => {
    const row = [
      idx + 1,
      `${p.name}${p.unit ? ` (${p.unit})` : ""}`,
      p.code,
      p.is_input ? "Input" : (p.formula || "—"),
    ];

    // Add machine columns
    machines.forEach(m => {
      const rec = valueLookup[m.id]?.[p.code];
      if (!rec) {
        row.push("—");
        return;
      }

      if (p.is_input) {
        const key = `${m.id}-${rec.particular_id}`;
        const edited = editedValues[key];
        const value = edited !== undefined ? edited : rec.input_value;
        row.push(fmt(value));
      } else {
        row.push(fmt(rec.computed_value?.toFixed(2)));
      }
    });

    return row;
  });

  // Add Calculated MHR row
  body.push([
    "",
    "Calculated MHR",
    "MHR*",
    "—",
    ...machines.map(m => m.mhr != null ? `₹${m.mhr}` : "—")
  ]);

  // Add Recommended MHR row
  body.push([
    "",
    "Recommended MHR",
    "REC",
    "Input",
    ...machines.map(m => {
      const edited = editedRecommendedMhr[m.id];
      const value = edited !== undefined ? edited : m.recommended_mhr;
      return fmt(value);
    })
  ]);

  autoTable(doc, {
    startY: 28,
    head: [headers],
    body,
    styles: {
      fontSize: 5,
      cellPadding: { top: 1, bottom: 1, left: 1.5, right: 1.5 },
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
      fontSize: 5,
      lineColor: [255, 255, 255],
      lineWidth: 0.3,
    },
    alternateRowStyles: { fillColor: [239, 246, 255] },
    bodyStyles: { halign: "left" },
    columnStyles: {
      0: { cellWidth: 6, halign: "center", fontStyle: "bold" },
      1: { cellWidth: 25 },
      2: { cellWidth: 10, halign: "center" },
      3: { cellWidth: 20 },
    },
    // Machine columns get auto width
    tableWidth: 'auto',
    margin: { left: margin, right: margin },
    didParseCell: (d) => {
      if (d.section !== "body") return;
      const v = d.cell.raw;
      const text = typeof v === "object" && v !== null ? v.content : v;
      
      // Highlight Calculated MHR and Recommended MHR rows
      const rowIndex = d.row.index;
      const isLastTwoRows = rowIndex >= body.length - 2;
      if (isLastTwoRows) {
        d.cell.styles.fontStyle = "bold";
        d.cell.styles.fillColor = [243, 244, 246];
      }

      // Color coding for Input/Formula in Calculation column
      if (d.column.index === 3 && !isLastTwoRows) {
        if (text === "Input") {
          d.cell.styles.textColor = [22, 163, 74];
          d.cell.styles.fontStyle = "bold";
        } else if (text !== "—") {
          d.cell.styles.textColor = [37, 99, 235];
        }
      }
    },
  });

  doc.save(`MHR_Matrix_${Date.now()}.pdf`);
  message.success("PDF exported successfully");
};

// ---------------------------------------------------------------------------
// Excel Export
// ---------------------------------------------------------------------------

const exportExcel = async (particulars, machines, valueLookup, editedValues, editedRecommendedMhr) => {
  if (!particulars || particulars.length === 0) {
    message.warning("No data to export");
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("MHR Matrix");

  // Header styling
  const headerStyle = {
    font: { bold: true, color: { argb: "FFFFFFFF" } },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } },
    alignment: { horizontal: "center", vertical: "middle", wrapText: true },
    border: {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    },
  };

  // Cell styling
  const cellStyle = {
    alignment: { horizontal: "left", vertical: "middle", wrapText: true },
    border: {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    },
  };

  const centerStyle = {
    ...cellStyle,
    alignment: { horizontal: "center", vertical: "middle", wrapText: true },
  };

  const boldStyle = {
    ...cellStyle,
    font: { bold: true },
  };

  // Add title row
  const titleCol = String.fromCharCode(65 + machines.length + 3); // Calculate last column letter
  worksheet.mergeCells(`A1:${titleCol}1`);
  const titleCell = worksheet.getCell("A1");
  titleCell.value = "MACHINE HOUR RATE (MHR) MATRIX REPORT";
  titleCell.font = { bold: true, size: 14, color: { argb: "FF1E40AF" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  // Add summary row
  worksheet.mergeCells(`A2:${titleCol}2`);
  const summaryCell = worksheet.getCell("A2");
  summaryCell.value = `Total Machines: ${machines.length} | Generated: ${new Date().toLocaleString()}`;
  summaryCell.font = { size: 10 };
  summaryCell.alignment = { horizontal: "center", vertical: "middle" };

  // Add headers
  const headers = ["SL", "PARTICULARS", "CODE", "CALCULATION", ...machines.map(m => machineLabel(m))];
  headers.forEach((header, index) => {
    const cell = worksheet.getCell(3, index + 1);
    cell.value = header;
    Object.assign(cell, headerStyle);
  });

  // Add particular rows
  particulars.forEach((p, rowIndex) => {
    const row = rowIndex + 4;
    const rowData = [
      rowIndex + 1,
      `${p.name}${p.unit ? ` (${p.unit})` : ""}`,
      p.code,
      p.is_input ? "Input" : (p.formula || "—"),
    ];

    // Add machine columns
    machines.forEach(m => {
      const rec = valueLookup[m.id]?.[p.code];
      if (!rec) {
        rowData.push("—");
        return;
      }

      if (p.is_input) {
        const key = `${m.id}-${rec.particular_id}`;
        const edited = editedValues[key];
        const value = edited !== undefined ? edited : rec.input_value;
        rowData.push(fmt(value));
      } else {
        rowData.push(fmt(rec.computed_value?.toFixed(2)));
      }
    });

    rowData.forEach((value, colIndex) => {
      const cell = worksheet.getCell(row, colIndex + 1);
      cell.value = value;
      const style = [0, 2].includes(colIndex) ? centerStyle : cellStyle;
      Object.assign(cell, style);

      // Color coding for Calculation column
      if (colIndex === 3) {
        if (value === "Input") {
          cell.font = { color: { argb: "FF10B981" }, bold: true };
        } else if (value !== "—") {
          cell.font = { color: { argb: "FF2563EB" } };
        }
      }
    });
  });

  // Add Calculated MHR row
  const calcRow = particulars.length + 4;
  const calcData = [
    "",
    "Calculated MHR",
    "MHR*",
    "—",
    ...machines.map(m => m.mhr != null ? `₹${m.mhr}` : "—")
  ];
  calcData.forEach((value, colIndex) => {
    const cell = worksheet.getCell(calcRow, colIndex + 1);
    cell.value = value;
    Object.assign(cell, boldStyle);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
  });

  // Add Recommended MHR row
  const recRow = particulars.length + 5;
  const recData = [
    "",
    "Recommended MHR",
    "REC",
    "Input",
    ...machines.map(m => {
      const edited = editedRecommendedMhr[m.id];
      const value = edited !== undefined ? edited : m.recommended_mhr;
      return fmt(value);
    })
  ];
  recData.forEach((value, colIndex) => {
    const cell = worksheet.getCell(recRow, colIndex + 1);
    cell.value = value;
    Object.assign(cell, boldStyle);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
  });

  // Auto-fit columns based on content
  worksheet.columns.forEach((column) => {
    let maxLength = 0;
    column.eachCell({ includeEmpty: true }, (cell) => {
      const cellValue = cell.value ? String(cell.value) : "";
      const approxWidth = cellValue.length * 1.1;
      maxLength = Math.max(maxLength, approxWidth);
    });
    column.width = Math.max(Math.min(maxLength + 2, 50), 10);
  });

  // Generate buffer and download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `MHR_Matrix_${Date.now()}.xlsx`;
  link.click();
  window.URL.revokeObjectURL(url);
  message.success("Excel exported successfully");
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const MachineMHRsMatrixExport = ({ particulars, machines, valueLookup, editedValues, editedRecommendedMhr }) => {
  const items = [
    {
      key: "pdf",
      label: "Export as PDF",
      icon: <FilePdfOutlined />,
      onClick: () => exportPDF(particulars, machines, valueLookup, editedValues, editedRecommendedMhr),
    },
    {
      key: "excel",
      label: "Export as Excel",
      icon: <FileExcelOutlined />,
      onClick: () => exportExcel(particulars, machines, valueLookup, editedValues, editedRecommendedMhr),
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

export default MachineMHRsMatrixExport;
