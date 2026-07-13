import React, { useState } from "react";
import { Button, Dropdown, message } from "antd";
import { FilePdfOutlined, FileExcelOutlined, DownloadOutlined } from "@ant-design/icons";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmt = (val) => (val == null || val === "" ? "—" : String(val));
const fmtCost = (val) =>
  val != null
    ? `Rs.${Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "—";
const fmtNum = (val, dec = 3) => (val != null ? parseFloat(val).toFixed(dec) : "—");

const groupLinkedMaterials = (linkedMaterials) => {
  const groupedMap = {};

  (linkedMaterials || []).forEach((item) => {
    if (!item) return;
    const key = item.id || `${item.raw_material_id}-${item.order_id}-${item.part_number}`;

    if (!groupedMap[key]) {
      groupedMap[key] = {
        id: key,
        raw_material_id: item.raw_material_id,
        order_id: item.order_id,
        sale_order_number: item.source_order_number || item.sale_order_number,
        project_name: item.project_name || item.product_name,
        material_name: item.material_name,
        part_number: item.part_numbers && item.part_numbers.length > 0 ? item.part_numbers.join(', ') : item.part_number,
        form_type: item.form_type,
        quantity: item.quantity || item.order_quantity,
        mass: item.mass,
        weight: item.weight,
        cost: item.cost,
        vendor: item.vendor_name || item.received_vendor_name,
        material_status: item.material_status || item.status,
        order_status: item.order_status,
      };
    }
  });

  const groupedData = Object.values(groupedMap).sort((a, b) => {
    const aOrder = a.sale_order_number || '';
    const bOrder = b.sale_order_number || '';
    return aOrder.localeCompare(bOrder);
  });

  return groupedData;
};

const formatStatus = (status) => {
  if (!status) return "-";
  const value = String(status).toLowerCase();
  if (value === "available") return "AVAILABLE";
  if (value === "purchase order") return "PURCHASE ORDER";
  if (value === "purchase request") return "PURCHASE REQUEST";
  return status;
};

// ---------------------------------------------------------------------------
// PDF Export - Raw Materials Inventory
// ---------------------------------------------------------------------------

const exportInventoryPDF = (rawMaterials) => {
  if (!rawMaterials || rawMaterials.length === 0) {
    message.warning("No raw materials available");
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
    doc.text("RAW MATERIALS INVENTORY REPORT", pageW / 2, 14.5, { align: "center" });

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated: ${generatedAt}`, margin, 22);
    doc.text(`Total Materials: ${rawMaterials.length}`, pageW / 2, 22, { align: "center" });
    doc.text("CMF Digitization", pageW - margin, 22, { align: "right" });

    doc.setDrawColor(30, 64, 175);
    doc.setLineWidth(0.3);
    doc.line(margin, 24, pageW - margin, 24);
  };

  drawHeader();

  const headers = ["SL NO", "MATERIAL NAME", "DENSITY(kg/m³)", "COST(₹/kg)", "STATUS"];
  const body = rawMaterials.map((m, index) => {
    const hasAvailableStock = m.has_available_stock;
    const statusText = hasAvailableStock ? "AVAILABLE" : "NOT AVAILABLE";
    return [
      index + 1,
      m.material_name || "-",
      m.density != null ? String(m.density) : "-",
      m.cost_per_kg != null ? `₹${m.cost_per_kg.toFixed(2)}` : "-",
      statusText,
    ];
  });

  autoTable(doc, {
    startY: 27,
    head: [headers],
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
    },
    alternateRowStyles: { fillColor: [239, 246, 255] },
    columnStyles: {
      0: { cellWidth: "auto", halign: "center" },
      1: { cellWidth: "auto" },
      2: { cellWidth: "auto", halign: "center" },
      3: { cellWidth: "auto", halign: "center" },
      4: { cellWidth: "auto", halign: "center" },
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

  doc.save(`RawMaterialsInventory_${new Date().toISOString().slice(0, 10)}.pdf`);
};

// ---------------------------------------------------------------------------
// PDF Export - Parts with Raw Materials Status
// ---------------------------------------------------------------------------

const exportStatusPDF = (linkedMaterials) => {
  const groupedData = groupLinkedMaterials(linkedMaterials);
  if (!groupedData.length) {
    message.warning("No status records available");
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
    doc.text("PARTS WITH RAW MATERIALS STATUS REPORT", pageW / 2, 14.5, { align: "center" });

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated: ${generatedAt}`, margin, 22);
    doc.text(`Total Records: ${groupedData.length}`, pageW / 2, 22, { align: "center" });
    doc.text("CMF Digitization", pageW - margin, 22, { align: "right" });

    doc.setDrawColor(30, 64, 175);
    doc.setLineWidth(0.3);
    doc.line(margin, 24, pageW - margin, 24);
  };

  drawHeader();

  const headers = ["SL NO", "PROJECT NO", "PART NO", "MATERIAL", "FORM TYPE", "QTY", "MASS (KG)", "WEIGHT (N)", "COST", "VENDOR", "STATUS", "ORDER STATUS"];
  const body = groupedData.map((row, index) => [
    index + 1,
    row.sale_order_number || "-",
    row.part_number || "-",
    row.material_name || "-",
    row.form_type || "-",
    row.quantity != null ? String(row.quantity) : "-",
    row.mass != null ? String(row.mass) : "-",
    row.weight != null ? String(row.weight) : "-",
    row.cost != null ? `₹${new Intl.NumberFormat('en-IN').format(row.cost)}` : "-",
    row.vendor || "-",
    formatStatus(row.material_status),
    row.order_status || "-",
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
      0: { cellWidth: "auto", halign: "center" },
      1: { cellWidth: "auto" },
      2: { cellWidth: "auto" },
      3: { cellWidth: "auto" },
      4: { cellWidth: "auto" },
      5: { cellWidth: "auto", halign: "center" },
      6: { cellWidth: "auto", halign: "center" },
      7: { cellWidth: "auto", halign: "center" },
      8: { cellWidth: "auto", halign: "center" },
      9: { cellWidth: "auto" },
      10: { cellWidth: "auto" },
      11: { cellWidth: "auto" },
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

  doc.save(`PartsRawMaterialStatus_${new Date().toISOString().slice(0, 10)}.pdf`);
};

// ---------------------------------------------------------------------------
// Excel Export - Raw Materials Inventory
// ---------------------------------------------------------------------------

const exportInventoryExcel = async (rawMaterials) => {
  if (!rawMaterials || rawMaterials.length === 0) {
    message.warning("No raw materials available");
    return;
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "CMF Digitization";
  wb.created = new Date();
  const ws = wb.addWorksheet("Raw Materials Inventory", { pageSetup: { orientation: "landscape" } });

  const headers = ["SL NO", "MATERIAL NAME", "DENSITY(kg/m³)", "COST(₹/kg)", "STATUS"];

  ws.mergeCells(1, 1, 1, headers.length);
  const t = ws.getCell("A1");
  t.value = "CMF DIGITIZATION - RAW MATERIALS INVENTORY REPORT";
  t.font = { bold: true, size: 14, color: { argb: "FF1E40AF" } };
  t.alignment = { horizontal: "center", vertical: "middle" };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
  ws.getRow(1).height = 28;

  ws.mergeCells(2, 1, 2, headers.length);
  const s = ws.getCell("A2");
  s.value = `Total Materials: ${rawMaterials.length} | Generated: ${new Date().toLocaleString()}`;
  s.font = { size: 9, italic: true, color: { argb: "FF6B7280" } };
  s.alignment = { horizontal: "center" };
  ws.getRow(2).height = 16;

  ws.addRow([]);

  const hdr = ws.addRow(headers);
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

  rawMaterials.forEach((m, index) => {
    const hasAvailableStock = m.has_available_stock;
    const statusText = hasAvailableStock ? "AVAILABLE" : "NOT AVAILABLE";
    const values = [
      index + 1,
      m.material_name || "-",
      m.density != null ? m.density : "-",
      m.cost_per_kg != null ? `₹${m.cost_per_kg.toFixed(2)}` : "-",
      statusText,
    ];
    const dr = ws.addRow(values);
    dr.height = 15;
    dr.eachCell((cell) => {
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
      cell.border = {
        top: { style: "hair", color: { argb: "FFD1D5DB" } },
        bottom: { style: "hair", color: { argb: "FFD1D5DB" } },
        left: { style: "hair", color: { argb: "FFD1D5DB" } },
        right: { style: "hair", color: { argb: "FFD1D5DB" } },
      };
    });
  });

  const colWidths = [8, 25, 15, 15, 15];
  headers.forEach((_, i) => {
    ws.getColumn(i + 1).width = colWidths[i] || 14;
  });

  ws.views = [{ state: "frozen", ySplit: 4 }];
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: headers.length } };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `RawMaterialsInventory_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
};

// ---------------------------------------------------------------------------
// Excel Export - Parts with Raw Materials Status
// ---------------------------------------------------------------------------

const exportStatusExcel = async (linkedMaterials) => {
  const groupedData = groupLinkedMaterials(linkedMaterials);
  if (!groupedData.length) {
    message.warning("No status records available");
    return;
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "CMF Digitization";
  wb.created = new Date();
  const ws = wb.addWorksheet("Parts with Raw Materials Status", { pageSetup: { orientation: "landscape" } });

  const headers = ["SL NO", "PROJECT NO", "PART NO", "MATERIAL", "FORM TYPE", "QTY", "MASS (KG)", "WEIGHT (N)", "COST", "VENDOR", "STATUS", "ORDER STATUS"];

  ws.mergeCells(1, 1, 1, headers.length);
  const t = ws.getCell("A1");
  t.value = "CMF DIGITIZATION - PARTS WITH RAW MATERIALS STATUS REPORT";
  t.font = { bold: true, size: 14, color: { argb: "FF1E40AF" } };
  t.alignment = { horizontal: "center", vertical: "middle" };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
  ws.getRow(1).height = 28;

  ws.mergeCells(2, 1, 2, headers.length);
  const s = ws.getCell("A2");
  s.value = `Total Records: ${groupedData.length} | Generated: ${new Date().toLocaleString()}`;
  s.font = { size: 9, italic: true, color: { argb: "FF6B7280" } };
  s.alignment = { horizontal: "center" };
  ws.getRow(2).height = 16;

  ws.addRow([]);

  const hdr = ws.addRow(headers);
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

  groupedData.forEach((row, index) => {
    const values = [
      index + 1,
      row.sale_order_number || "-",
      row.part_number || "-",
      row.material_name || "-",
      row.form_type || "-",
      row.quantity != null ? row.quantity : "-",
      row.mass != null ? row.mass : "-",
      row.weight != null ? row.weight : "-",
      row.cost != null ? `₹${new Intl.NumberFormat('en-IN').format(row.cost)}` : "-",
      row.vendor || "-",
      formatStatus(row.material_status),
      row.order_status || "-",
    ];
    const dr = ws.addRow(values);
    dr.height = 15;
    dr.eachCell((cell) => {
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
      cell.border = {
        top: { style: "hair", color: { argb: "FFD1D5DB" } },
        bottom: { style: "hair", color: { argb: "FFD1D5DB" } },
        left: { style: "hair", color: { argb: "FFD1D5DB" } },
        right: { style: "hair", color: { argb: "FFD1D5DB" } },
      };
    });
  });

  const colWidths = [8, 15, 15, 20, 15, 8, 12, 12, 15, 15, 20, 20];
  headers.forEach((_, i) => {
    ws.getColumn(i + 1).width = colWidths[i] || 14;
  });

  ws.views = [{ state: "frozen", ySplit: 4 }];
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: headers.length } };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `PartsRawMaterialStatus_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
};

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export const RawMaterialsInventoryPdfDownload = ({
  rawMaterials,
  fileName = "raw-materials-inventory.pdf",
}) => {
  const [loading, setLoading] = useState("");

  const handlePDF = async () => {
    if (!rawMaterials?.length) {
      message.warning("No raw materials available");
      return;
    }
    setLoading("pdf");
    try {
      exportInventoryPDF(rawMaterials);
    } catch (e) {
      message.error("PDF export failed");
    } finally {
      setLoading("");
    }
  };

  const handleExcel = async () => {
    if (!rawMaterials?.length) {
      message.warning("No raw materials available");
      return;
    }
    setLoading("excel");
    try {
      await exportInventoryExcel(rawMaterials);
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

  if (!rawMaterials || rawMaterials.length === 0) {
    return (
      <Button icon={<DownloadOutlined />} size="middle" disabled>
        Download Raw Materials
      </Button>
    );
  }

  return (
    <Dropdown menu={{ items: menuItems }} trigger={["click"]} disabled={!!loading}>
      <Button icon={<DownloadOutlined />} loading={!!loading} size="middle" style={{ fontSize: 11 }}>
        Download Raw Materials
      </Button>
    </Dropdown>
  );
};

export const PartsWithRawMaterialsStatusPdfDownload = ({
  linkedMaterials,
  fileName = "parts-with-raw-materials-status.pdf",
}) => {
  const [loading, setLoading] = useState("");

  const handlePDF = async () => {
    if (!linkedMaterials?.length) {
      message.warning("No status records available");
      return;
    }
    setLoading("pdf");
    try {
      exportStatusPDF(linkedMaterials);
    } catch (e) {
      message.error("PDF export failed");
    } finally {
      setLoading("");
    }
  };

  const handleExcel = async () => {
    if (!linkedMaterials?.length) {
      message.warning("No status records available");
      return;
    }
    setLoading("excel");
    try {
      await exportStatusExcel(linkedMaterials);
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

  if (!linkedMaterials || linkedMaterials.length === 0) {
    return (
      <Button icon={<DownloadOutlined />} size="middle" disabled>
        Download Parts Raw Material
      </Button>
    );
  }

  return (
    <Dropdown menu={{ items: menuItems }} trigger={["click"]} disabled={!!loading}>
      <Button icon={<DownloadOutlined />} loading={!!loading} size="middle" style={{ fontSize: 11 }}>
        Download Parts Raw Material
      </Button>
    </Dropdown>
  );
};