import React, { useState } from "react";
import { Button, Dropdown, message } from "antd";
import { FilePdfOutlined, FileExcelOutlined, DownloadOutlined } from "@ant-design/icons";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import dayjs from "dayjs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmt = (val) => (val == null || val === "" ? "—" : String(val));
const formatDate = (date) => dayjs(date).format('YYYY-MM-DD HH:mm');

// ---------------------------------------------------------------------------
// PDF Export
// ---------------------------------------------------------------------------

const exportPDF = (historyData, selectedMaterial) => {
  if (!historyData || historyData.length === 0) {
    message.warning("No history data available");
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
    doc.text("RAW MATERIAL HISTORY REPORT", pageW / 2, 14.5, { align: "center" });

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated: ${generatedAt}`, margin, 22);
    doc.text(
      selectedMaterial 
        ? `Material: ${selectedMaterial.material_name} (${selectedMaterial.material_code})`
        : 'All Materials',
      pageW / 2, 22, { align: "center" }
    );
    doc.text(`Total Records: ${historyData.length}`, pageW - margin, 22, { align: "right" });

    doc.setDrawColor(30, 64, 175);
    doc.setLineWidth(0.3);
    doc.line(margin, 24, pageW - margin, 24);
  };

  drawHeader();

  const headers = ["Date & Time", "Activity", "Raw Material", "Form Type", "Dimensions", "Source", "Order", "Part", "Length Used", "User", "Vendor"];
  const body = historyData.map((item) => [
    formatDate(item.timestamp),
    item.activity_type?.replace(/_/g, ' ') || '-',
    item.material_name || item.raw_material_name || '-',
    item.form_type || '-',
    item.dimensions || '-',
    item.source_type?.toUpperCase() || '-',
    item.order_number || '-',
    item.part_name ? `${item.part_name} - ${item.part_number || '-'}` : '-',
    item.activity_type === 'material_linked' && item.used_length
      ? `${item.used_length}mm`
      : item.quantity
      ? `${item.quantity} units`
      : '-',
    item.user_name || '-',
    item.vendor_name || item.received_vendor_name || '-',
  ]);

  autoTable(doc, {
    startY: 27,
    head: [headers],
    body,
    styles: {
      fontSize: 6,
      cellPadding: { top: 1, bottom: 1, left: 1, right: 1 },
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
      fontSize: 6,
    },
    alternateRowStyles: { fillColor: [239, 246, 255] },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: "auto" },
      2: { cellWidth: "auto" },
      3: { cellWidth: "auto" },
      4: { cellWidth: "auto" },
      5: { cellWidth: "auto" },
      6: { cellWidth: "auto" },
      7: { cellWidth: "auto" },
      8: { cellWidth: "auto" },
      9: { cellWidth: "auto" },
      10: { cellWidth: "auto" },
    },
    tableWidth: "auto",
    margin: { left: margin, right: margin, top: 27, bottom: 10 },
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

  const fileName = selectedMaterial
    ? `RawMaterialHistory_${selectedMaterial.material_name}_${dayjs().format('YYYYMMDD_HHmmss')}.pdf`
    : `RawMaterialHistory_All_${dayjs().format('YYYYMMDD_HHmmss')}.pdf`;

  doc.save(fileName);
};

// ---------------------------------------------------------------------------
// Excel Export
// ---------------------------------------------------------------------------

const exportExcel = (historyData, selectedMaterial) => {
  if (!historyData || historyData.length === 0) {
    message.warning("No history data available");
    return;
  }

  try {
    const workbook = XLSX.utils.book_new();

    // Add header information
    const headerData = [
      ["CMF DIGITIZATION"],
      ["Raw Material History Report"],
      [],
      [selectedMaterial 
        ? `Material: ${selectedMaterial.material_name} (${selectedMaterial.material_code})`
        : 'All Materials'
      ],
      [`Total Records: ${historyData.length}`],
      [`Generated on: ${dayjs().format('YYYY-MM-DD HH:mm:ss')}`],
      []
    ];

    // Create worksheet
    const ws = XLSX.utils.aoa_to_sheet([]);
    XLSX.utils.sheet_add_aoa(ws, headerData, { origin: "A1" });

    // Merge header cells
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 10 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: 10 } },
      { s: { r: 4, c: 0 }, e: { r: 4, c: 10 } },
      { s: { r: 5, c: 0 }, e: { r: 5, c: 10 } }
    ];

    // Apply styling to header
    if (ws['A1']) ws['A1'].s = { font: { sz: 16, bold: true }, alignment: { horizontal: "center", vertical: "center" } };
    if (ws['A2']) ws['A2'].s = { font: { sz: 14, bold: true }, alignment: { horizontal: "center", vertical: "center" } };
    if (ws['A4']) ws['A4'].s = { font: { bold: true }, alignment: { horizontal: "center", vertical: "center" } };
    if (ws['A5']) ws['A5'].s = { font: { bold: true }, alignment: { horizontal: "center", vertical: "center" } };
    if (ws['A6']) ws['A6'].s = { font: { bold: true }, alignment: { horizontal: "center", vertical: "center" } };

    let currentRow = 8;

    // Table headers
    const headers = [
      "Date & Time",
      "Activity",
      "Raw Material",
      "Form Type",
      "Dimensions",
      "Source",
      "Order",
      "Part",
      "Length Used",
      "User",
      "Vendor"
    ];

    XLSX.utils.sheet_add_aoa(ws, [headers], { origin: `A${currentRow}` });
    currentRow++;

    // Apply styling to table headers
    for (let i = 0; i < headers.length; i++) {
      const cellAddress = XLSX.utils.encode_cell({ r: currentRow - 1, c: i });
      if (ws[cellAddress]) {
        ws[cellAddress].s = {
          font: { bold: true },
          alignment: { horizontal: "center", vertical: "center" },
          fill: { fgColor: { rgb: "F3F4F6" } }
        };
      }
    }

    // Add data rows
    historyData.forEach((item) => {
      const rowData = [
        dayjs(item.timestamp).format('YYYY-MM-DD HH:mm'),
        item.activity_type?.replace(/_/g, ' ') || '-',
        item.material_name || item.raw_material_name || '-',
        item.form_type || '-',
        item.dimensions || '-',
        item.source_type?.toUpperCase() || '-',
        item.order_number || '-',
        item.part_name ? `${item.part_name} - ${item.part_number || '-'}` : '-',
        item.activity_type === 'material_linked' && item.used_length
          ? `${item.used_length}mm`
          : item.quantity
          ? `${item.quantity} units`
          : '-',
        item.user_name || '-',
        item.vendor_name || item.received_vendor_name || '-'
      ];

      XLSX.utils.sheet_add_aoa(ws, [rowData], { origin: `A${currentRow}` });
      currentRow++;
    });

    // Set column widths
    const colWidths = [
      { wch: 18 },  // Date & Time
      { wch: 18 },  // Activity
      { wch: 25 },  // Raw Material
      { wch: 12 },  // Form Type
      { wch: 15 },  // Dimensions
      { wch: 10 },  // Source
      { wch: 15 },  // Order
      { wch: 25 },  // Part
      { wch: 12 },  // Length Used
      { wch: 15 },  // User
      { wch: 20 }   // Vendor
    ];
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(workbook, ws, 'History');

    const fileName = selectedMaterial
      ? `RawMaterialHistory_${selectedMaterial.material_name}_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`
      : `RawMaterialHistory_All_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`;

    XLSX.writeFile(workbook, fileName);
  } catch (error) {
    console.error('Excel export error:', error);
    throw error;
  }
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const RawMaterialHistoryDownload = ({ historyData, selectedMaterial }) => {
  const [loading, setLoading] = useState("");

  const handlePDF = async () => {
    if (!historyData?.length) {
      message.warning("No history data available");
      return;
    }
    setLoading("pdf");
    try {
      exportPDF(historyData, selectedMaterial);
    } catch (e) {
      message.error("PDF export failed");
    } finally {
      setLoading("");
    }
  };

  const handleExcel = () => {
    if (!historyData?.length) {
      message.warning("No history data available");
      return;
    }
    setLoading("excel");
    try {
      exportExcel(historyData, selectedMaterial);
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
      <Button icon={<DownloadOutlined />} loading={!!loading} size="small" style={{ fontSize: 11, marginLeft: '70px' }}>
        Download History
      </Button>
    </Dropdown>
  );
};

export default RawMaterialHistoryDownload;
