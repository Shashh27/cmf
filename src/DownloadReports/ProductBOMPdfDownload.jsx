import React, { useState } from "react";
import { Button, Tooltip, Spin, Dropdown, message } from "antd";
import { FilePdfOutlined, FileExcelOutlined, DownloadOutlined } from "@ant-design/icons";
import { PDFDownloadLink, Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import ExcelJS from "exceljs";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmt = (val) => (val == null || val === "" ? "—" : String(val));

// ---------------------------------------------------------------------------
// PDF Export - @react-pdf/renderer
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#FFFFFF',
    padding: 15,
  },
  header: {
    backgroundColor: '#1E40AF',
    padding: 12,
    marginBottom: 10,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  headerSubtitle: {
    color: '#FFFFFF',
    fontSize: 9,
    textAlign: 'center',
    marginTop: 5,
  },
  section: {
    margin: 5,
    padding: 5,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#1E40AF',
  },
  table: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    borderWidth: 1,
    borderColor: '#000000',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
  },
  tableCell: {
    borderRightWidth: 1,
    borderRightColor: '#000000',
    fontSize: 7,
    padding: 4,
    textAlign: 'left',
  },
  tableCellHeader: {
    borderRightWidth: 1,
    borderRightColor: '#FFFFFF',
    fontSize: 8,
    fontWeight: 'bold',
    padding: 4,
    textAlign: 'center',
    backgroundColor: '#1E40AF',
    color: '#FFFFFF',
  },
  tableCellCenter: {
    borderRightWidth: 1,
    borderRightColor: '#000000',
    fontSize: 7,
    padding: 4,
    textAlign: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 15,
    left: 15,
    right: 15,
    textAlign: 'center',
    fontSize: 8,
    color: '#9CA3AF',
  },
});

const ProductBOMPdfDocument = ({ product, bomExport }) => {
  const assemblies = bomExport?.assemblies || [];
  const parts = bomExport?.parts || [];
  const operations = bomExport?.operations || [];
  const documents = bomExport?.documents || [];

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>PRODUCT BOM REPORT</Text>
          <Text style={styles.headerSubtitle}>
            Product: {product?.product_name || product?.id || 'N/A'} | Generated: {new Date().toLocaleString()}
          </Text>
        </View>

        {assemblies.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Assemblies ({assemblies.length})</Text>
            <View style={styles.table}>
              <View style={styles.tableRow}>
                <Text style={[styles.tableCellHeader, { width: 30 }]}>#</Text>
                <Text style={[styles.tableCellHeader, { width: 80 }]}>Assembly No</Text>
                <Text style={[styles.tableCellHeader, { width: 120 }]}>Assembly Name</Text>
                <Text style={[styles.tableCellHeader, { flex: 1 }]}>Parent Assembly</Text>
              </View>
              {assemblies.map((asm, index) => (
                <View key={index} style={styles.tableRow}>
                  <Text style={[styles.tableCellCenter, { width: 30 }]}>{index + 1}</Text>
                  <Text style={[styles.tableCell, { width: 80 }]}>{fmt(asm.assembly_number)}</Text>
                  <Text style={[styles.tableCell, { width: 120 }]}>{fmt(asm.assembly_name)}</Text>
                  <Text style={[styles.tableCell, { flex: 1 }]}>
                    {asm.parent_assembly_number 
                      ? `${fmt(asm.parent_assembly_number)} - ${fmt(asm.parent_assembly_name)}` 
                      : '—'}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {parts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Parts ({parts.length})</Text>
            <View style={styles.table}>
              <View style={styles.tableRow}>
                <Text style={[styles.tableCellHeader, { width: 30 }]}>#</Text>
                <Text style={[styles.tableCellHeader, { width: 80 }]}>Part No</Text>
                <Text style={[styles.tableCellHeader, { width: 120 }]}>Part Name</Text>
                <Text style={[styles.tableCellHeader, { width: 60 }]}>Type</Text>
                <Text style={[styles.tableCellHeader, { flex: 1 }]}>Parent Assembly</Text>
              </View>
              {parts.map((part, index) => (
                <View key={index} style={styles.tableRow}>
                  <Text style={[styles.tableCellCenter, { width: 30 }]}>{index + 1}</Text>
                  <Text style={[styles.tableCell, { width: 80 }]}>{fmt(part.part_number)}</Text>
                  <Text style={[styles.tableCell, { width: 120 }]}>{fmt(part.part_name)}</Text>
                  <Text style={[styles.tableCell, { width: 60 }]}>{fmt(part.type_name)}</Text>
                  <Text style={[styles.tableCell, { flex: 1 }]}>
                    {part.parent_assembly_number 
                      ? `${fmt(part.parent_assembly_number)} - ${fmt(part.parent_assembly_name)}` 
                      : '—'}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {operations.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Operations ({operations.length})</Text>
            <View style={styles.table}>
              <View style={styles.tableRow}>
                <Text style={[styles.tableCellHeader, { width: 25 }]}>#</Text>
                <Text style={[styles.tableCellHeader, { width: 60 }]}>Part No</Text>
                <Text style={[styles.tableCellHeader, { width: 80 }]}>Part Name</Text>
                <Text style={[styles.tableCellHeader, { width: 30 }]}>OP</Text>
                <Text style={[styles.tableCellHeader, { width: 80 }]}>Operation</Text>
                <Text style={[styles.tableCellHeader, { width: 50 }]}>Type</Text>
                <Text style={[styles.tableCellHeader, { width: 60 }]}>Machine</Text>
                <Text style={[styles.tableCellHeader, { width: 40 }]}>Setup</Text>
                <Text style={[styles.tableCellHeader, { width: 40 }]}>Cycle</Text>
                <Text style={[styles.tableCellHeader, { flex: 1 }]}>Workcenter</Text>
              </View>
              {operations.map((op, index) => (
                <View key={index} style={styles.tableRow}>
                  <Text style={[styles.tableCellCenter, { width: 25 }]}>{index + 1}</Text>
                  <Text style={[styles.tableCell, { width: 60 }]}>{fmt(op.part_number)}</Text>
                  <Text style={[styles.tableCell, { width: 80 }]}>{fmt(op.part_name)}</Text>
                  <Text style={[styles.tableCellCenter, { width: 30 }]}>{fmt(op.operation_number)}</Text>
                  <Text style={[styles.tableCell, { width: 80 }]}>{fmt(op.operation_name)}</Text>
                  <Text style={[styles.tableCell, { width: 50 }]}>{fmt(op.part_type_name || 'IN-House')}</Text>
                  <Text style={[styles.tableCell, { width: 60 }]}>{fmt(op.machine_name || op.machine_id)}</Text>
                  <Text style={[styles.tableCellCenter, { width: 40 }]}>{fmt(op.setup_time || '00:00:00')}</Text>
                  <Text style={[styles.tableCellCenter, { width: 40 }]}>{fmt(op.cycle_time || '00:00:00')}</Text>
                  <Text style={[styles.tableCell, { flex: 1 }]}>{fmt(op.work_center_name || op.workcenter_id)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {documents.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Documents ({documents.length})</Text>
            <View style={styles.table}>
              <View style={styles.tableRow}>
                <Text style={[styles.tableCellHeader, { width: 25 }]}>#</Text>
                <Text style={[styles.tableCellHeader, { width: 60 }]}>Part No</Text>
                <Text style={[styles.tableCellHeader, { width: 80 }]}>Part Name</Text>
                <Text style={[styles.tableCellHeader, { width: 50 }]}>Type</Text>
                <Text style={[styles.tableCellHeader, { width: 100 }]}>Document</Text>
                <Text style={[styles.tableCellHeader, { width: 45 }]}>Version</Text>
                <Text style={[styles.tableCellHeader, { flex: 1 }]}>URL</Text>
              </View>
              {documents.map((doc, index) => (
                <View key={index} style={styles.tableRow}>
                  <Text style={[styles.tableCellCenter, { width: 25 }]}>{index + 1}</Text>
                  <Text style={[styles.tableCell, { width: 60 }]}>{fmt(doc.part_number)}</Text>
                  <Text style={[styles.tableCell, { width: 80 }]}>{fmt(doc.part_name)}</Text>
                  <Text style={[styles.tableCell, { width: 50 }]}>{fmt(doc.document_type)}</Text>
                  <Text style={[styles.tableCell, { width: 100 }]}>{fmt(doc.document_name)}</Text>
                  <Text style={[styles.tableCellCenter, { width: 45 }]}>
                    {doc.document_version 
                      ? (doc.document_version.startsWith('v') ? doc.document_version : `v${doc.document_version}`) 
                      : 'v1.0'}
                  </Text>
                  <Text style={[styles.tableCell, { flex: 1 }]}>{fmt(doc.document_url)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <Text style={styles.footer} render={({ pageNumber, totalPages }) => (
          `Page ${pageNumber} of ${totalPages} | CMF Digitization — Confidential`
        )} fixed />
      </Page>
    </Document>
  );
};

// ---------------------------------------------------------------------------
// Excel Export
// ---------------------------------------------------------------------------

const exportExcel = async (product, bomExport) => {
  if (!bomExport) {
    message.warning("No BOM data available");
    return;
  }

  const assemblies = bomExport?.assemblies || [];
  const parts = bomExport?.parts || [];
  const operations = bomExport?.operations || [];
  const documents = bomExport?.documents || [];

  if (assemblies.length === 0 && parts.length === 0) {
    message.warning("No BOM data available");
    return;
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "CMF Digitization";
  wb.created = new Date();

  // Product Details Sheet
  const productWs = wb.addWorksheet("Product Details");
  productWs.mergeCells(1, 1, 1, 2);
  const t = productWs.getCell("A1");
  t.value = "PRODUCT BOM REPORT";
  t.font = { bold: true, size: 14, color: { argb: "FF1E40AF" } };
  t.alignment = { horizontal: "center", vertical: "middle" };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
  productWs.getRow(1).height = 28;

  productWs.mergeCells(2, 1, 2, 2);
  const s = productWs.getCell("A2");
  s.value = `Product: ${product?.product_name || product?.id || "N/A"}   |   Generated: ${new Date().toLocaleString()}`;
  s.font = { size: 9, italic: true, color: { argb: "FF6B7280" } };
  s.alignment = { horizontal: "center" };
  productWs.getRow(2).height = 16;

  productWs.addRow([]);
  const summaryData = [
    ["Total Assemblies", assemblies.length],
    ["Total Parts", parts.length],
    ["Total Operations", operations.length],
    ["Total Documents", documents.length],
  ];
  summaryData.forEach(row => productWs.addRow(row));
  productWs.getRow(4).eachCell(cell => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7FF" } };
  });

  // Assemblies Sheet
  if (assemblies.length > 0) {
    const asmWs = wb.addWorksheet("Assemblies");
    const asmHeaders = ["#", "Assembly No", "Assembly Name", "Parent Assembly"];
    const hdr = asmWs.addRow(asmHeaders);
    hdr.height = 20;
    hdr.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = {
        top: { style: "thin", color: { argb: "FF93C5FD" } },
        bottom: { style: "thin", color: { argb: "FF93C5FD" } },
        left: { style: "thin", color: { argb: "FF93C5FD" } },
        right: { style: "thin", color: { argb: "FF93C5FD" } },
      };
    });

    assemblies.forEach((asm, idx) => {
      const dr = asmWs.addRow([
        idx + 1,
        fmt(asm.assembly_number),
        fmt(asm.assembly_name),
        asm.parent_assembly_number ? `${fmt(asm.parent_assembly_number)} - ${fmt(asm.parent_assembly_name)}` : "—",
      ]);
      dr.height = 18;
      const isAlt = idx % 2 === 1;
      dr.eachCell((cell) => {
        cell.alignment = { vertical: "middle" };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: isAlt ? "FFEFF6FF" : "FFFFFFFF" };
        cell.border = {
          top: { style: "hair", color: { argb: "FFD1D5DB" } },
          bottom: { style: "hair", color: { argb: "FFD1D5DB" } },
          left: { style: "hair", color: { argb: "FFD1D5DB" } },
          right: { style: "hair", color: { argb: "FFD1D5DB" } },
        };
      });
    });

    asmWs.getColumn(1).width = 8;
    asmWs.getColumn(2).width = 20;
    asmWs.getColumn(3).width = 35;
    asmWs.getColumn(4).width = 35;
    asmWs.views = [{ state: "frozen", ySplit: 1 }];
    asmWs.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 4 } };
  }

  // Parts Sheet
  if (parts.length > 0) {
    const partWs = wb.addWorksheet("Parts");
    const partHeaders = ["#", "Part No", "Part Name", "Type", "Parent Assembly"];
    const hdr = partWs.addRow(partHeaders);
    hdr.height = 20;
    hdr.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = {
        top: { style: "thin", color: { argb: "FF93C5FD" } },
        bottom: { style: "thin", color: { argb: "FF93C5FD" } },
        left: { style: "thin", color: { argb: "FF93C5FD" } },
        right: { style: "thin", color: { argb: "FF93C5FD" } },
      };
    });

    parts.forEach((part, idx) => {
      const dr = partWs.addRow([
        idx + 1,
        fmt(part.part_number),
        fmt(part.part_name),
        fmt(part.type_name),
        part.parent_assembly_number ? `${fmt(part.parent_assembly_number)} - ${fmt(part.parent_assembly_name)}` : "—",
      ]);
      dr.height = 18;
      const isAlt = idx % 2 === 1;
      dr.eachCell((cell) => {
        cell.alignment = { vertical: "middle" };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: isAlt ? "FFEFF6FF" : "FFFFFFFF" };
        cell.border = {
          top: { style: "hair", color: { argb: "FFD1D5DB" } },
          bottom: { style: "hair", color: { argb: "FFD1D5DB" } },
          left: { style: "hair", color: { argb: "FFD1D5DB" } },
          right: { style: "hair", color: { argb: "FFD1D5DB" } },
        };
      });
    });

    partWs.getColumn(1).width = 8;
    partWs.getColumn(2).width = 20;
    partWs.getColumn(3).width = 35;
    partWs.getColumn(4).width = 15;
    partWs.getColumn(5).width = 35;
    partWs.views = [{ state: "frozen", ySplit: 1 }];
    partWs.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 5 } };
  }

  // Operations Sheet
  if (operations.length > 0) {
    const opWs = wb.addWorksheet("Operations");
    const opHeaders = ["#", "Part No", "Part Name", "OP", "Operation", "Type", "Machine", "Setup", "Cycle", "Workcenter"];
    const hdr = opWs.addRow(opHeaders);
    hdr.height = 20;
    hdr.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = {
        top: { style: "thin", color: { argb: "FF93C5FD" } },
        bottom: { style: "thin", color: { argb: "FF93C5FD" } },
        left: { style: "thin", color: { argb: "FF93C5FD" } },
        right: { style: "thin", color: { argb: "FF93C5FD" } },
      };
    });

    operations.forEach((op, idx) => {
      const dr = opWs.addRow([
        idx + 1,
        fmt(op.part_number),
        fmt(op.part_name),
        fmt(op.operation_number),
        fmt(op.operation_name),
        fmt(op.part_type_name || "IN-House"),
        fmt(op.machine_name || op.machine_id),
        fmt(op.setup_time || "00:00:00"),
        fmt(op.cycle_time || "00:00:00"),
        fmt(op.work_center_name || op.workcenter_id),
      ]);
      dr.height = 18;
      const isAlt = idx % 2 === 1;
      dr.eachCell((cell) => {
        cell.alignment = { vertical: "middle" };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: isAlt ? "FFEFF6FF" : "FFFFFFFF" };
        cell.border = {
          top: { style: "hair", color: { argb: "FFD1D5DB" } },
          bottom: { style: "hair", color: { argb: "FFD1D5DB" } },
          left: { style: "hair", color: { argb: "FFD1D5DB" } },
          right: { style: "hair", color: { argb: "FFD1D5DB" } },
        };
      });
    });

    opWs.getColumn(1).width = 6;
    opWs.getColumn(2).width = 18;
    opWs.getColumn(3).width = 28;
    opWs.getColumn(4).width = 8;
    opWs.getColumn(5).width = 28;
    opWs.getColumn(6).width = 14;
    opWs.getColumn(7).width = 18;
    opWs.getColumn(8).width = 12;
    opWs.getColumn(9).width = 12;
    opWs.getColumn(10).width = 18;
    opWs.views = [{ state: "frozen", ySplit: 1 }];
    opWs.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 10 } };
  }

  // Documents Sheet
  if (documents.length > 0) {
    const docWs = wb.addWorksheet("Documents");
    const docHeaders = ["#", "Part No", "Part Name", "Type", "Document", "Version", "URL"];
    const hdr = docWs.addRow(docHeaders);
    hdr.height = 20;
    hdr.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = {
        top: { style: "thin", color: { argb: "FF93C5FD" } },
        bottom: { style: "thin", color: { argb: "FF93C5FD" } },
        left: { style: "thin", color: { argb: "FF93C5FD" } },
        right: { style: "thin", color: { argb: "FF93C5FD" } },
      };
    });

    documents.forEach((doc, idx) => {
      const dr = docWs.addRow([
        idx + 1,
        fmt(doc.part_number),
        fmt(doc.part_name),
        fmt(doc.document_type),
        fmt(doc.document_name),
        doc.document_version ? (doc.document_version.startsWith('v') ? doc.document_version : `v${doc.document_version}`) : "v1.0",
        fmt(doc.document_url),
      ]);
      dr.height = 18;
      const isAlt = idx % 2 === 1;
      dr.eachCell((cell) => {
        cell.alignment = { vertical: "middle" };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: isAlt ? "FFEFF6FF" : "FFFFFFFF" };
        cell.border = {
          top: { style: "hair", color: { argb: "FFD1D5DB" } },
          bottom: { style: "hair", color: { argb: "FFD1D5DB" } },
          left: { style: "hair", color: { argb: "FFD1D5DB" } },
          right: { style: "hair", color: { argb: "FFD1D5DB" } },
        };
      });
    });

    docWs.getColumn(1).width = 6;
    docWs.getColumn(2).width = 18;
    docWs.getColumn(3).width = 28;
    docWs.getColumn(4).width = 14;
    docWs.getColumn(5).width = 32;
    docWs.getColumn(6).width = 12;
    docWs.getColumn(7).width = 45;
    docWs.views = [{ state: "frozen", ySplit: 1 }];
    docWs.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 7 } };
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Product_BOM_${product?.product_name || product?.id}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ProductBOMPdfDownload = ({
  product,
  bomExport,
  fileName,
}) => {
  const [loading, setLoading] = useState("");
  const [fullHierarchicalData, setFullHierarchicalData] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  if (!bomExport) {
    return (
      <Tooltip title="Expand product to load BOM before export">
        <Button icon={<DownloadOutlined />} size="small" disabled />
      </Tooltip>
    );
  }

  const hasContent =
    (bomExport.assemblies && bomExport.assemblies.length > 0) ||
    (bomExport.parts && bomExport.parts.length > 0);

  if (!hasContent) {
    return (
      <Tooltip title="No BOM data available for this product">
        <Button icon={<DownloadOutlined />} size="small" disabled />
      </Tooltip>
    );
  }

  // Flatten hierarchical data to match export expectations
  const flattenHierarchicalData = (hierarchicalData) => {
    const assemblies = [];
    const parts = [];
    const operations = [];
    const documents = [];

    const processAssembly = (assembly, parentAssembly = null) => {
      assemblies.push({
        id: assembly.assembly.id,
        assembly_number: assembly.assembly.assembly_number,
        assembly_name: assembly.assembly.assembly_name,
        parent_assembly_number: parentAssembly?.assembly_number || null,
        parent_assembly_name: parentAssembly?.assembly_name || null,
      });

      assembly.parts.forEach(partDetail => {
        const part = partDetail.part;
        parts.push({
          id: part.id,
          part_number: part.part_number,
          part_name: part.part_name,
          type_name: part.type_name,
          parent_assembly_number: assembly.assembly.assembly_number,
          parent_assembly_name: assembly.assembly.assembly_name,
        });

        partDetail.operations.forEach(op => {
          operations.push({
            id: op.id,
            part_number: part.part_number,
            part_name: part.part_name,
            operation_number: op.operation_number,
            operation_name: op.operation_name,
            part_type_name: op.part_type_name,
            machine_name: op.machine_name,
            machine_id: op.machine_id,
            setup_time: op.setup_time,
            cycle_time: op.cycle_time,
            work_center_name: op.work_center_name,
            workcenter_id: op.workcenter_id,
            work_instructions: op.work_instructions,
            notes: op.notes,
          });
        });

        partDetail.documents.forEach(doc => {
          documents.push({
            id: doc.id,
            part_number: part.part_number,
            part_name: part.part_name,
            document_type: doc.document_type,
            document_name: doc.document_name,
            document_version: doc.document_version,
            document_url: doc.document_url,
          });
        });
      });

      assembly.subassemblies.forEach(subAssembly => {
        processAssembly(subAssembly, assembly.assembly);
      });
    };

    hierarchicalData.assemblies.forEach(assembly => {
      processAssembly(assembly);
    });

    hierarchicalData.direct_parts.forEach(partDetail => {
      const part = partDetail.part;
      parts.push({
        id: part.id,
        part_number: part.part_number,
        part_name: part.part_name,
        type_name: part.type_name,
        parent_assembly_number: null,
        parent_assembly_name: null,
      });

      partDetail.operations.forEach(op => {
        operations.push({
          id: op.id,
          part_number: part.part_number,
          part_name: part.part_name,
          operation_number: op.operation_number,
          operation_name: op.operation_name,
          part_type_name: op.part_type_name,
          machine_name: op.machine_name,
          machine_id: op.machine_id,
          setup_time: op.setup_time,
          cycle_time: op.cycle_time,
          work_center_name: op.work_center_name,
          workcenter_id: op.workcenter_id,
          work_instructions: op.work_instructions,
          notes: op.notes,
        });
      });

      partDetail.documents.forEach(doc => {
        documents.push({
          id: doc.id,
          part_number: part.part_number,
          part_name: part.part_name,
          document_type: doc.document_type,
          document_name: doc.document_name,
          document_version: doc.document_version,
          document_url: doc.document_url,
        });
      });
    });

    return { assemblies, parts, operations, documents };
  };

  const handleExcel = async () => {
    const dataForExport = fullHierarchicalData 
      ? flattenHierarchicalData(fullHierarchicalData)
      : {
          assemblies: bomExport.assemblies || [],
          parts: bomExport.parts || [],
          operations: [],
          documents: [],
        };
    
    if (!dataForExport.assemblies.length && !dataForExport.parts.length) {
      message.warning("No BOM data available");
      return;
    }
    
    setLoading("excel");
    try {
      await exportExcel(product, dataForExport);
      setDropdownOpen(false);
    } catch (e) {
      message.error("Excel export failed");
    } finally {
      setLoading("");
    }
  };

  const handlePrepareDownload = async () => {
    setLoading("prepare");
    try {
      const response = await axios.get(`${API_BASE_URL}/products/${product.id}/hierarchical`);
      setFullHierarchicalData(response.data);
      setDropdownOpen(true); // Open dropdown after data is loaded
    } catch (error) {
      console.error("Error fetching full hierarchical data for BOM download:", error);
      message.error("Failed to load BOM data");
    } finally {
      setLoading("");
    }
  };

  const dataForExport = fullHierarchicalData 
    ? flattenHierarchicalData(fullHierarchicalData)
    : {
        assemblies: bomExport.assemblies || [],
        parts: bomExport.parts || [],
        operations: [],
        documents: [],
      };

  const menuItems = fullHierarchicalData ? [
    { 
      key: "pdf", 
      label: "Download PDF", 
      icon: <FilePdfOutlined style={{ color: "#ef4444" }} />,
      onClick: () => setDropdownOpen(false)
    },
    { key: "excel", label: "Download Excel", icon: <FileExcelOutlined style={{ color: "#16a34a" }} />, onClick: handleExcel },
  ] : [
    { key: "loading", label: "Loading...", disabled: true },
  ];

  if (loading === "prepare") {
    return (
      <Tooltip title="Preparing BOM data...">
        <Button icon={<Spin size="small" />} size="small" disabled />
      </Tooltip>
    );
  }

  return (
    <Dropdown 
      menu={{ 
        items: fullHierarchicalData ? [
          { 
            key: "pdf", 
            label: (
              <PDFDownloadLink
                document={<ProductBOMPdfDocument product={product} bomExport={dataForExport} />}
                fileName={`Product_BOM_${product?.product_name || product?.id}_${new Date().toISOString().slice(0, 10)}.pdf`}
              >
                {({ loading }) => (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FilePdfOutlined style={{ color: "#ef4444" }} />
                    {loading ? "Preparing PDF..." : "Download PDF"}
                  </span>
                )}
              </PDFDownloadLink>
            ),
            onClick: () => setDropdownOpen(false)
          },
          { key: "excel", label: "Download Excel", icon: <FileExcelOutlined style={{ color: "#16a34a" }} />, onClick: handleExcel },
        ] : [
          { key: "loading", label: "Loading...", disabled: true },
        ]
      }} 
      trigger={["click"] } 
      disabled={!!loading}
      open={dropdownOpen}
      onOpenChange={(open) => {
        if (open && !fullHierarchicalData && loading !== "prepare") {
          handlePrepareDownload();
          setDropdownOpen(false);
        } else {
          setDropdownOpen(open);
        }
      }}
    >
      <Tooltip title="Download full BOM report">
        <Button
          icon={<DownloadOutlined />}
          loading={!!loading}
          size="small"
          type="text"
          style={{ padding: 4, minWidth: 24, height: 24 }}
        />
      </Tooltip>
    </Dropdown>
  );
};

export default ProductBOMPdfDownload;
