import React, { useState } from "react";
import { Button, Tooltip, Modal, Space } from "antd";
import { FilePdfOutlined, FileExcelOutlined, DownloadOutlined } from "@ant-design/icons";
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
    paddingHorizontal: 24,
    fontSize: 9,
    fontFamily: "Helvetica",
  },
  header: {
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
    borderBottomStyle: "solid",
    paddingBottom: 8,
    alignItems: "center",
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 4,
    textTransform: "uppercase",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 10,
    color: "#6b7280",
    textAlign: "center",
  },
  metaRow: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  metaText: {
    fontSize: 8,
    color: "#4b5563",
  },
  table: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderStyle: "solid",
    width: "100%",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    borderBottomStyle: "solid",
  },
  headerCell: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRightWidth: 1,
    borderRightColor: "#e5e7eb",
    borderRightStyle: "solid",
    fontWeight: 700,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    borderBottomStyle: "solid",
  },
  cell: {
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRightWidth: 1,
    borderRightColor: "#f3f4f6",
    borderRightStyle: "solid",
  },
  footer: {
    marginTop: 16,
    fontSize: 7,
    color: "#9ca3af",
    textAlign: "right",
  },
});

const partWiseColumnWidths = {
  slNo: 30,
  projectNumber: 80,
  projectName: 140,
  productName: 140,
  partNumber: 100,
  partName: 160,
  priority: 45,
};

const orderWiseColumnWidths = {
  slNo: 30,
  projectNumber: 90,
  projectName: 160,
  productName: 160,
  priorityRange: 100,
  partCount: 60,
};

const PartWisePriorityPdfDocument = ({ data }) => {
  const generatedAt = new Date().toLocaleString();
  const total = data.length;

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>
            CMF DIGITIZATION 
          </Text>
          <Text style={styles.subtitle}>
            Part Wise Priority Report
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>Total parts: {total}</Text>
            <Text style={styles.metaText}>Generated on: {generatedAt}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, { width: partWiseColumnWidths.slNo }]}>
              SL NO
            </Text>
            <Text style={[styles.headerCell, { width: partWiseColumnWidths.projectName }]}>
              PROJECT NAME
            </Text>
            <Text style={[styles.headerCell, { width: partWiseColumnWidths.projectNumber }]}>
              PROJECT NO
            </Text>
            <Text style={[styles.headerCell, { width: partWiseColumnWidths.productName }]}>
              PRODUCT NAME
            </Text>
            <Text style={[styles.headerCell, { width: partWiseColumnWidths.partName }]}>
              PART NAME
            </Text>
            <Text style={[styles.headerCell, { width: partWiseColumnWidths.partNumber }]}>
              PART NO
            </Text>
            <Text style={[styles.headerCell, { width: partWiseColumnWidths.priority }]}>
              PRIORITY
            </Text>
          </View>

          {data.map((row, index) => (
            <View key={row.id || index} style={styles.row}>
              <Text style={[styles.cell, { width: partWiseColumnWidths.slNo }]}>
                {index + 1}
              </Text>
              <Text style={[styles.cell, { width: partWiseColumnWidths.projectName }]}>
                {row.product_name || row.project_name || "-"}
              </Text>
              <Text style={[styles.cell, { width: partWiseColumnWidths.projectNumber }]}>
                {row.sale_order_number || "-"}
              </Text>
              <Text style={[styles.cell, { width: partWiseColumnWidths.productName }]}>
                {row.product_name || "-"}
              </Text>
              <Text style={[styles.cell, { width: partWiseColumnWidths.partName }]}>
                {row.part_name || "-"}
              </Text>
              <Text style={[styles.cell, { width: partWiseColumnWidths.partNumber }]}>
                {row.part_number || "-"}
              </Text>
              <Text style={[styles.cell, { width: partWiseColumnWidths.priority }]}>
                {row.priority != null ? String(row.priority) : "-"}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.footer}>
          Generated by CMF Digitization Parts Priority module
        </Text>
      </Page>
    </Document>
  );
};

const OrderWisePriorityPdfDocument = ({ data }) => {
  const generatedAt = new Date().toLocaleString();
  const total = data.length;

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>
            CMF DIGITIZATION 
          </Text>
          <Text style={styles.subtitle}>
            Order Wise Priority Report
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>Total orders: {total}</Text>
            <Text style={styles.metaText}>Generated on: {generatedAt}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, { width: orderWiseColumnWidths.slNo }]}>
              SL NO
            </Text>
            <Text style={[styles.headerCell, { width: orderWiseColumnWidths.projectName }]}>
              PROJECT NAME
            </Text>
            <Text style={[styles.headerCell, { width: orderWiseColumnWidths.projectNumber }]}>
              PROJECT NO
            </Text>
            <Text style={[styles.headerCell, { width: orderWiseColumnWidths.productName }]}>
              PRODUCT NAME
            </Text>
            <Text style={[styles.headerCell, { width: orderWiseColumnWidths.priorityRange }]}>
              PRIORITY RANGE
            </Text>
            <Text style={[styles.headerCell, { width: orderWiseColumnWidths.partCount }]}>
              PARTS COUNT
            </Text>
          </View>

          {data.map((row, index) => (
            <View key={row.order_id || index} style={styles.row}>
              <Text style={[styles.cell, { width: orderWiseColumnWidths.slNo }]}>
                {index + 1}
              </Text>
              <Text style={[styles.cell, { width: orderWiseColumnWidths.projectName }]}>
                {row.product_name || row.project_name || "-"}
              </Text>
              <Text style={[styles.cell, { width: orderWiseColumnWidths.projectNumber }]}>
                {row.sale_order_number || "-"}
              </Text>
              <Text style={[styles.cell, { width: orderWiseColumnWidths.productName }]}>
                {row.product_name || "-"}
              </Text>
              <Text style={[styles.cell, { width: orderWiseColumnWidths.priorityRange }]}>
                {row.min_priority != null && row.max_priority != null
                  ? `${row.min_priority} - ${row.max_priority}`
                  : "-"}
              </Text>
              <Text style={[styles.cell, { width: orderWiseColumnWidths.partCount }]}>
                {row.part_count != null ? String(row.part_count) : "-"}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.footer}>
          Generated by CMF Digitization Parts Priority module
        </Text>
      </Page>
    </Document>
  );
};

export const PartWisePriorityPdfDownload = ({
  data,
  fileName = "parts-priority-part-wise.pdf",
}) => {
  const [isModalVisible, setIsModalVisible] = useState(false);

  const handleDownloadExcel = () => {
    if (!data || data.length === 0) return;

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([]);

    // Add header information
    XLSX.utils.sheet_add_aoa(ws, [
      ["CMF DIGITIZATION "],
      ["Part Wise Priority Report"],
      [],
      [`Total Parts: ${data.length}`],
      [`Generated on: ${new Date().toLocaleString()}`],
      []
    ], { origin: "A1" });

    // Add table headers
    const headers = [
      "SL NO",
      "PROJECT NAME",
      "PROJECT NO",
      "PRODUCT NAME",
      "PRODUCT NAME",
      "PART NAME",
      "PART NO",
      "PRIORITY"
    ];

    // Merge cells for header titles and metadata
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: headers.length - 1 } },
      { s: { r: 4, c: 0 }, e: { r: 4, c: headers.length - 1 } }
    ];

    // Apply styling to header cells
    if (ws['A1']) ws['A1'].s = { font: { sz: 16, bold: true }, alignment: { horizontal: "center", vertical: "center" } };
    if (ws['A2']) ws['A2'].s = { font: { sz: 14, bold: true }, alignment: { horizontal: "center", vertical: "center" } };
    if (ws['A4']) ws['A4'].s = { font: { bold: true }, alignment: { horizontal: "center", vertical: "center" } };
    if (ws['A5']) ws['A5'].s = { font: { bold: true }, alignment: { horizontal: "center", vertical: "center" } };

    XLSX.utils.sheet_add_aoa(ws, [headers], { origin: "A7" });

    // Apply styling to table headers
    for (let i = 0; i < headers.length; i++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 6, c: i });
      if (ws[cellAddress]) {
        ws[cellAddress].s = { 
          font: { bold: true }, 
          alignment: { horizontal: "center", vertical: "center" },
          fill: { fgColor: { rgb: "F3F4F6" } }
        };
      }
    }

    // Prepare and add table data - ensure exact alignment with headers
    data.forEach((row, index) => {
      const rowData = [
        index + 1,                                    // Column A: SL NO
        row.product_name || row.project_name || "-",  // Column B: PROJECT NAME
        row.sale_order_number || "-",                 // Column C: PROJECT NO
        row.product_name || "-",                      // Column D: PRODUCT NAME
        row.product_name || "-",                      // Column E: PRODUCT NAME
        row.part_name || "-",                         // Column F: PART NAME
        row.part_number || "-",                       // Column G: PART NO
        row.priority != null ? row.priority : "-"     // Column H: PRIORITY
      ];
      
      // Write each row individually to ensure proper alignment
      const rowNum = 8 + index; // Start from row 8 (after headers)
      XLSX.utils.sheet_add_aoa(ws, [rowData], { origin: `A${rowNum}` });
    });

    // Set column widths
    const colWidths = [
      { wch: 8 },   // SL NO
      { wch: 15 },  // PROJECT NO
      { wch: 20 },  // PROJECT NAME
      { wch: 20 },  // PRODUCT NAME
      { wch: 15 },  // PART NO
      { wch: 25 },  // PART NAME
      { wch: 12 }   // PRIORITY
    ];
    ws['!cols'] = colWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, "Part Wise Priority");

    // Generate and download Excel file
    const excelFileName = fileName.replace('.pdf', '.xlsx');
    XLSX.writeFile(wb, excelFileName);
    
    setIsModalVisible(false);
  };

  if (!data || data.length === 0) {
    return (
      <Tooltip title="No part-wise priority data for export">
        <Button icon={<DownloadOutlined />} disabled>
          Download Part Priority
        </Button>
      </Tooltip>
    );
  }

  return (
    <>
      <Button 
        icon={<DownloadOutlined />} 
        onClick={() => setIsModalVisible(true)}
      >
        Download Part Priority
      </Button>

      <Modal
        title="Download Part Wise Priority Report"
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        footer={null}
        centered
        width={400}
      >
        <div style={{ padding: "20px 0" }}>
          <p style={{ marginBottom: "20px", textAlign: "center", color: "#666" }}>
            Choose your preferred download format:
          </p>
          
          <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
            <PDFDownloadLink
              document={<PartWisePriorityPdfDocument data={data} />}
              fileName={fileName}
              style={{ textDecoration: "none", width: "100%" }}
            >
              {({ loading }) => (
                <Button 
                  icon={<FilePdfOutlined />} 
                  size="large"
                  style={{ width: "100%", height: "50px" }}
                  type="default"
                >
                  {loading ? "Preparing PDF..." : "Download PDF"}
                </Button>
              )}
            </PDFDownloadLink>

            <Button 
              icon={<FileExcelOutlined />} 
              size="large"
              style={{ width: "100%", height: "50px" }}
              type="default"
              onClick={handleDownloadExcel}
            >
              Download Excel
            </Button>
          </Space>
        </div>
      </Modal>
    </>
  );
};

export const OrderWisePriorityPdfDownload = ({
  data,
  fileName = "parts-priority-order-wise.pdf",
}) => {
  const [isModalVisible, setIsModalVisible] = useState(false);

  const handleDownloadExcel = () => {
    if (!data || data.length === 0) return;

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([]);

    // Add header information
    XLSX.utils.sheet_add_aoa(ws, [
      ["CMF DIGITIZATION "],
      ["Order Wise Priority Report"],
      [],
      [`Total Orders: ${data.length}`],
      [`Generated on: ${new Date().toLocaleString()}`],
      []
    ], { origin: "A1" });

    // Add table headers
    const headers = [
      "SL NO",
      "PROJECT NAME",
      "PROJECT NO",
      "PRODUCT NAME",
      "PRODUCT NAME",
      "PRIORITY RANGE",
      "PARTS COUNT"
    ];

    // Merge cells for header titles and metadata
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: headers.length - 1 } },
      { s: { r: 4, c: 0 }, e: { r: 4, c: headers.length - 1 } }
    ];

    // Apply styling to header cells
    if (ws['A1']) ws['A1'].s = { font: { sz: 16, bold: true }, alignment: { horizontal: "center", vertical: "center" } };
    if (ws['A2']) ws['A2'].s = { font: { sz: 14, bold: true }, alignment: { horizontal: "center", vertical: "center" } };
    if (ws['A4']) ws['A4'].s = { font: { bold: true }, alignment: { horizontal: "center", vertical: "center" } };
    if (ws['A5']) ws['A5'].s = { font: { bold: true }, alignment: { horizontal: "center", vertical: "center" } };

    XLSX.utils.sheet_add_aoa(ws, [headers], { origin: "A7" });

    // Apply styling to table headers
    for (let i = 0; i < headers.length; i++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 6, c: i });
      if (ws[cellAddress]) {
        ws[cellAddress].s = { 
          font: { bold: true }, 
          alignment: { horizontal: "center", vertical: "center" },
          fill: { fgColor: { rgb: "F3F4F6" } }
        };
      }
    }

    // Prepare and add table data - ensure exact alignment with headers
    data.forEach((row, index) => {
      const priorityRange = row.min_priority != null && row.max_priority != null
        ? `${row.min_priority} - ${row.max_priority}`
        : "-";
      
      const rowData = [
        index + 1,                                    // Column A: SL NO
        row.product_name || row.project_name || "-",  // Column B: PROJECT NAME
        row.sale_order_number || "-",                 // Column C: PROJECT NO
        row.product_name || "-",                      // Column D: PRODUCT NAME
        row.product_name || "-",                      // Column E: PRODUCT NAME
        priorityRange,                                 // Column F: PRIORITY RANGE
        row.part_count != null ? row.part_count : "-" // Column G: PARTS COUNT
      ];
      
      // Write each row individually to ensure proper alignment
      const rowNum = 8 + index; // Start from row 8 (after headers)
      XLSX.utils.sheet_add_aoa(ws, [rowData], { origin: `A${rowNum}` });
    });

    // Set column widths
    const colWidths = [
      { wch: 8 },   // SL NO
      { wch: 15 },  // PROJECT NO
      { wch: 20 },  // PROJECT NAME
      { wch: 20 },  // PRODUCT NAME
      { wch: 18 },  // PRIORITY RANGE
      { wch: 12 }   // PARTS COUNT
    ];
    ws['!cols'] = colWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, "Order Wise Priority");

    // Generate and download Excel file
    const excelFileName = fileName.replace('.pdf', '.xlsx');
    XLSX.writeFile(wb, excelFileName);
    
    setIsModalVisible(false);
  };

  if (!data || data.length === 0) {
    return (
      <Tooltip title="No order-wise priority data for export">
        <Button icon={<DownloadOutlined />} disabled>
          Download Order Priority
        </Button>
      </Tooltip>
    );
  }

  return (
    <>
      <Button 
        icon={<DownloadOutlined />} 
        onClick={() => setIsModalVisible(true)}
      >
        Download Order Priority
      </Button>

      <Modal
        title="Download Order Wise Priority Report"
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        footer={null}
        centered
        width={400}
      >
        <div style={{ padding: "20px 0" }}>
          <p style={{ marginBottom: "20px", textAlign: "center", color: "#666" }}>
            Choose your preferred download format:
          </p>
          
          <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
            <PDFDownloadLink
              document={<OrderWisePriorityPdfDocument data={data} />}
              fileName={fileName}
              style={{ textDecoration: "none", width: "100%" }}
            >
              {({ loading }) => (
                <Button 
                  icon={<FilePdfOutlined />} 
                  size="large"
                  style={{ width: "100%", height: "50px" }}
                  type="default"
                >
                  {loading ? "Preparing PDF..." : "Download PDF"}
                </Button>
              )}
            </PDFDownloadLink>

            <Button 
              icon={<FileExcelOutlined />} 
              size="large"
              style={{ width: "100%", height: "50px" }}
              type="default"
              onClick={handleDownloadExcel}
            >
              Download Excel
            </Button>
          </Space>
        </div>
      </Modal>
    </>
  );
};
