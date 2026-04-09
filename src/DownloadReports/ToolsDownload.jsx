import React, { useMemo } from "react";
import { Button, Tooltip, Space } from "antd";
import { FilePdfOutlined, FileExcelOutlined } from "@ant-design/icons";
import {
  PDFDownloadLink,
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import * as XLSX from "xlsx";

Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: {
    paddingTop: 32,
    paddingBottom: 32,
    paddingHorizontal: 32,
    fontSize: 8,
    fontFamily: "Helvetica",
  },
  header: {
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
    borderBottomStyle: "solid",
    paddingBottom: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: 700,
    textTransform: "uppercase",
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 9,
    color: "#6b7280",
    textAlign: "center",
  },
  metaRow: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  metaText: {
    fontSize: 8,
    color: "#4b5563",
  },
  table: {
    width: "auto",
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "#d1d5db",
    marginBottom: 12,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    borderBottomStyle: "solid",
  },
  tableHeader: {
    backgroundColor: "#f3f4f6",
    fontWeight: 600,
  },
  tableCol: {
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 4,
  },
  tableCell: {
    fontSize: 7,
  },
  itemDescCol: { width: "25%" },
  rangeCol: { width: "15%" },
  idCodeCol: { width: "15%" },
  makeCol: { width: "12%" },
  partNumberCol: { width: "12%" },
  partNameCol: { width: "18%" },
  assemblyCol: { width: "15%" },
  operationCol: { width: "18%" },
});

// PDF Document Component
const ToolsPdfDocument = ({ tools, product }) => {
  const sortedTools = useMemo(() => {
    return [...tools].sort((a, b) => {
      // Sort by assembly name, then part number, then operation number
      const assemblyCompare = (a.assembly_name || '').localeCompare(b.assembly_name || '');
      if (assemblyCompare !== 0) return assemblyCompare;
      
      const partCompare = (a.part_number || '').localeCompare(b.part_number || '');
      if (partCompare !== 0) return partCompare;
      
      return (a.operation_number || '').localeCompare(b.operation_number || '');
    });
  }, [tools]);

  const currentDate = new Date().toLocaleDateString();

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Tools Report</Text>
          <Text style={styles.subtitle}>
            Product: {product?.product_name || "N/A"}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>
              Generated: {currentDate}
            </Text>
            <Text style={styles.metaText}>
              Total Tools: {tools.length}
            </Text>
          </View>
        </View>

        <View style={styles.table}>
          {/* Table Header */}
          <View style={[styles.tableRow, styles.tableHeader]}>
            <View style={[styles.tableCol, styles.itemDescCol]}>
              <Text style={styles.tableCell}>Item Description</Text>
            </View>
            <View style={[styles.tableCol, styles.rangeCol]}>
              <Text style={styles.tableCell}>Range / Size</Text>
            </View>
            <View style={[styles.tableCol, styles.idCodeCol]}>
              <Text style={styles.tableCell}>ID Code</Text>
            </View>
            <View style={[styles.tableCol, styles.makeCol]}>
              <Text style={styles.tableCell}>Make</Text>
            </View>
            <View style={[styles.tableCol, styles.partNumberCol]}>
              <Text style={styles.tableCell}>Part Number</Text>
            </View>
            <View style={[styles.tableCol, styles.partNameCol]}>
              <Text style={styles.tableCell}>Part Name</Text>
            </View>
            <View style={[styles.tableCol, styles.assemblyCol]}>
              <Text style={styles.tableCell}>Assembly</Text>
            </View>
            <View style={[styles.tableCol, styles.operationCol]}>
              <Text style={styles.tableCell}>Operation</Text>
            </View>
          </View>

          {/* Table Rows */}
          {sortedTools.map((tool, index) => (
            <View key={index} style={styles.tableRow}>
              <View style={[styles.tableCol, styles.itemDescCol]}>
                <Text style={styles.tableCell}>
                  {tool?.tool?.item_description || "N/A"}
                </Text>
              </View>
              <View style={[styles.tableCol, styles.rangeCol]}>
                <Text style={styles.tableCell}>
                  {tool?.tool?.range || "-"}
                </Text>
              </View>
              <View style={[styles.tableCol, styles.idCodeCol]}>
                <Text style={styles.tableCell}>
                  {tool?.tool?.identification_code || "-"}
                </Text>
              </View>
              <View style={[styles.tableCol, styles.makeCol]}>
                <Text style={styles.tableCell}>
                  {tool?.tool?.make || "-"}
                </Text>
              </View>
              <View style={[styles.tableCol, styles.partNumberCol]}>
                <Text style={styles.tableCell}>
                  {tool?.part_number || "N/A"}
                </Text>
              </View>
              <View style={[styles.tableCol, styles.partNameCol]}>
                <Text style={styles.tableCell}>
                  {tool?.part_name || "N/A"}
                </Text>
              </View>
              <View style={[styles.tableCol, styles.assemblyCol]}>
                <Text style={styles.tableCell}>
                  {tool?.assembly_name || "-"}
                </Text>
              </View>
              <View style={[styles.tableCol, styles.operationCol]}>
                <Text style={styles.tableCell}>
                  {tool?.operation_number
                    ? `${tool.operation_number} - ${tool.operation_name || ""}`
                    : tool?.operation_name || "-"}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {tools.length === 0 && (
          <View style={{ alignItems: "center", marginTop: 40 }}>
            <Text style={{ fontSize: 10, color: "#6b7280" }}>
              No tools found for this product
            </Text>
          </View>
        )}
      </Page>
    </Document>
  );
};

// Excel Download Function
const generateExcel = (tools, product) => {
  // Sort tools by assembly, then part number, then operation number
  const sortedTools = [...tools].sort((a, b) => {
    const assemblyCompare = (a.assembly_name || '').localeCompare(b.assembly_name || '');
    if (assemblyCompare !== 0) return assemblyCompare;
    
    const partCompare = (a.part_number || '').localeCompare(b.part_number || '');
    if (partCompare !== 0) return partCompare;
    
    return (a.operation_number || '').localeCompare(b.operation_number || '');
  });

  // Prepare data for Excel
  const excelData = sortedTools.map((tool, index) => ({
    "S.No": index + 1,
    "Item Description": tool?.tool?.item_description || "N/A",
    "Range / Size": tool?.tool?.range || "-",
    "ID Code": tool?.tool?.identification_code || "-",
    "Make": tool?.tool?.make || "-",
    "Part Number": tool?.part_number || "N/A",
    "Part Name": tool?.part_name || "N/A",
    "Assembly Name": tool?.assembly_name || "-",
    "Operation Number": tool?.operation_number || "-",
    "Operation Name": tool?.operation_name || "-",
    "Product Name": tool?.product_name || product?.product_name || "N/A"
  }));

  // Create workbook
  const ws = XLSX.utils.json_to_sheet(excelData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Tools");

  // Set column widths
  const colWidths = [
    { wch: 6 },  // S.No
    { wch: 30 }, // Item Description
    { wch: 15 }, // Range / Size
    { wch: 15 }, // ID Code
    { wch: 15 }, // Make
    { wch: 15 }, // Part Number
    { wch: 25 }, // Part Name
    { wch: 20 }, // Assembly Name
    { wch: 15 }, // Operation Number
    { wch: 25 }, // Operation Name
    { wch: 25 }  // Product Name
  ];
  ws['!cols'] = colWidths;

  // Generate filename
  const fileName = `${product?.product_name || "Product"}_Tools_${new Date()
    .toISOString()
    .slice(0, 10)}.xlsx`;

  // Download file
  XLSX.writeFile(wb, fileName);
};

// Main Component
const ToolsDownload = ({ tools, product, disabled = false }) => {
  const fileName = `${product?.product_name || "Product"}_Tools_${new Date()
    .toISOString()
    .slice(0, 10)}.pdf`;

  return (
    <Space>
      <PDFDownloadLink
        document={<ToolsPdfDocument tools={tools} product={product} />}
        fileName={fileName}
      >
        {({ loading }) => (
          <Tooltip title="Download Tools PDF">
            <Button
              icon={<FilePdfOutlined />}
              loading={loading}
              disabled={disabled || loading}
              size="small"
              type="text"
              style={{ color: disabled ? "#d1d5db" : "#dc2626" }}
            >
              PDF
            </Button>
          </Tooltip>
        )}
      </PDFDownloadLink>

      <Tooltip title="Download Tools Excel">
        <Button
          icon={<FileExcelOutlined />}
          onClick={() => generateExcel(tools, product)}
          disabled={disabled}
          size="small"
          type="text"
          style={{ color: disabled ? "#d1d5db" : "#16a34a" }}
        >
          Excel
        </Button>
      </Tooltip>
    </Space>
  );
};

export default ToolsDownload;
