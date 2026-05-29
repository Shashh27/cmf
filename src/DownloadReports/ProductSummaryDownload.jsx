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

Font.register({
  family: 'Helvetica',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/helvetica/v14/Helvetica.ttf' },
  ],
});

Font.register({
  family: 'Courier',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/courierprime/v6/u-470qkzQ2RvjeKz.woff2' },
  ],
});

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
  sectionTitle: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    color: "#1e293b",
  },
  table: {
    marginTop: 8,
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
    fontSize: 8,
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
    fontSize: 8,
  },
  footer: {
    marginTop: 16,
    fontSize: 7,
    color: "#9ca3af",
    textAlign: "right",
  },
});

const parseHmsToSeconds = (val) => {
  if (!val || typeof val !== "string") return 0;
  const parts = val.split(":");
  if (parts.length < 2) return 0;
  const [hh, mm, ssRaw] = parts;
  const ss = (ssRaw || "0").split(".")[0];
  const h = parseInt(hh, 10), m = parseInt(mm, 10), s = parseInt(ss, 10);
  if ([h, m, s].some((n) => Number.isNaN(n))) return 0;
  return h * 3600 + m * 60 + s;
};

const formatHms = (seconds) => {
  const sec = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const ProductSummaryPdfDocument = ({ summaryData, productName }) => {
  const generatedAt = new Date().toLocaleString();
  const { machineRows, rows, totalSetup, totalCycle, totalAll } = summaryData;

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>
            CMF DIGITIZATION
          </Text>
          <Text style={styles.subtitle}>
            Product Summary Report
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>Product: {productName || "N/A"}</Text>
            <Text style={styles.metaText}>Generated on: {generatedAt}</Text>
          </View>
        </View>

        {/* Summary Stats */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, { width: "33.33%" }]}>
              Total Setup Time
            </Text>
            <Text style={[styles.headerCell, { width: "33.33%" }]}>
              Total Cycle Time
            </Text>
            <Text style={[styles.headerCell, { width: "33.33%" }]}>
              Total (Setup + Cycle)
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={[styles.cell, { width: "33.33%", fontFamily: "Courier", fontWeight: 600 }]}>
              {formatHms(totalSetup)}
            </Text>
            <Text style={[styles.cell, { width: "33.33%", fontFamily: "Courier", fontWeight: 600 }]}>
              {formatHms(totalCycle)}
            </Text>
            <Text style={[styles.cell, { width: "33.33%", fontFamily: "Courier", fontWeight: 600 }]}>
              {formatHms(totalAll)}
            </Text>
          </View>
        </View>

        {/* Machine-wise Table */}
        {machineRows.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>
              Machine-wise Total Hours ({machineRows.length})
            </Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.headerCell, { width: "30%" }]}>
                  Machine
                </Text>
                <Text style={[styles.headerCell, { width: "23.33%" }]}>
                  Setup Time
                </Text>
                <Text style={[styles.headerCell, { width: "23.33%" }]}>
                  Cycle Time
                </Text>
                <Text style={[styles.headerCell, { width: "23.33%" }]}>
                  Total
                </Text>
              </View>
              {machineRows.map((row, index) => (
                <View key={index} style={styles.row}>
                  <Text style={[styles.cell, { width: "30%" }]}>
                    {row.machine_name || "N/A"}
                  </Text>
                  <Text style={[styles.cell, { width: "23.33%", fontFamily: "Courier" }]}>
                    {formatHms(row.setup_seconds)}
                  </Text>
                  <Text style={[styles.cell, { width: "23.33%", fontFamily: "Courier" }]}>
                    {formatHms(row.cycle_seconds)}
                  </Text>
                  <Text style={[styles.cell, { width: "23.33%", fontFamily: "Courier", fontWeight: 600 }]}>
                    {formatHms(row.total_seconds)}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Part Operations Table */}
        {rows.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>
              Part Operations ({rows.length})
            </Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.headerCell, { width: "18%" }]}>
                  Part Number
                </Text>
                <Text style={[styles.headerCell, { width: "18%" }]}>
                  Part Name
                </Text>
                <Text style={[styles.headerCell, { width: "8%" }]}>
                  Op #
                </Text>
                <Text style={[styles.headerCell, { width: "20%" }]}>
                  Operation
                </Text>
                <Text style={[styles.headerCell, { width: "6%" }]}>
                  Qty
                </Text>
                <Text style={[styles.headerCell, { width: "10%" }]}>
                  Machine
                </Text>
                <Text style={[styles.headerCell, { width: "10%" }]}>
                  Setup
                </Text>
                <Text style={[styles.headerCell, { width: "10%" }]}>
                  Cycle
                </Text>
                <Text style={[styles.headerCell, { width: "10%" }]}>
                  Total
                </Text>
              </View>
              {rows.map((row, index) => (
                <View key={row.key || index} style={styles.row}>
                  <Text style={[styles.cell, { width: "18%", fontFamily: "Courier" }]}>
                    {row.part_number || "—"}
                  </Text>
                  <Text style={[styles.cell, { width: "18%" }]}>
                    {row.part_name || "—"}
                  </Text>
                  <Text style={[styles.cell, { width: "8%", fontFamily: "Courier" }]}>
                    {row.operation_number || "—"}
                  </Text>
                  <Text style={[styles.cell, { width: "20%", color: row.is_outsource ? "#dc2626" : "#1e293b" }]}>
                    {row.operation_name || "—"} {row.is_outsource && "(OUTSOURCE)"}
                  </Text>
                  <Text style={[styles.cell, { width: "6%", fontFamily: "Courier" }]}>
                    {row.part_qty || 1}
                  </Text>
                  <Text style={[styles.cell, { width: "10%" }]}>
                    {row.machine_name || "N/A"}
                  </Text>
                  <Text style={[styles.cell, { width: "10%", fontFamily: "Courier" }]}>
                    {row.setup_time || "00:00:00"}
                  </Text>
                  <Text style={[styles.cell, { width: "10%", fontFamily: "Courier" }]}>
                    {row.cycle_time || "00:00:00"}
                  </Text>
                  <Text style={[styles.cell, { width: "10%", fontFamily: "Courier", fontWeight: 600 }]}>
                    {formatHms(row.total_seconds)}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        <Text style={styles.footer}>
          Generated by CMF Digitization Product Summary module
        </Text>
      </Page>
    </Document>
  );
};

export const ProductSummaryDownload = ({ summaryData, productName, fileName = "product-summary.pdf" }) => {
  const [isModalVisible, setIsModalVisible] = useState(false);

  const handleDownloadExcel = () => {
    if (!summaryData) return;

    const { machineRows, rows, totalSetup, totalCycle, totalAll } = summaryData;
    const wb = XLSX.utils.book_new();

    // Summary Sheet
    const summarySheet = XLSX.utils.aoa_to_sheet([
      ["CMF DIGITIZATION"],
      ["Product Summary Report"],
      [],
      ["Product", productName || "N/A"],
      ["Generated on", new Date().toLocaleString()],
      [],
      ["Summary Statistics"],
      ["Total Setup Time", formatHms(totalSetup)],
      ["Total Cycle Time", formatHms(totalCycle)],
      ["Total (Setup + Cycle)", formatHms(totalAll)],
    ]);
    
    // Merge cells for header
    summarySheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } },
    ];
    
    XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

    // Machine-wise Sheet
    if (machineRows.length > 0) {
      const machineData = machineRows.map((row, index) => ({
        "S.No": index + 1,
        "Machine": row.machine_name || "N/A",
        "Setup Time": formatHms(row.setup_seconds),
        "Cycle Time": formatHms(row.cycle_seconds),
        "Total": formatHms(row.total_seconds),
      }));
      const machineWs = XLSX.utils.json_to_sheet(machineData);
      machineWs['!cols'] = [
        { wch: 6 },
        { wch: 20 },
        { wch: 15 },
        { wch: 15 },
        { wch: 15 },
      ];
      XLSX.utils.book_append_sheet(wb, machineWs, "Machine-wise");
    }

    // Part Operations Sheet
    if (rows.length > 0) {
      const operationsData = rows.map((row, index) => ({
        "S.No": index + 1,
        "Part Number": row.part_number || "—",
        "Part Name": row.part_name || "—",
        "Operation Number": row.operation_number || "—",
        "Operation Name": row.operation_name || "—",
        "Quantity": row.part_qty || 1,
        "Machine": row.machine_name || "N/A",
        "Setup Time": row.setup_time || "00:00:00",
        "Cycle Time": row.cycle_time || "00:00:00",
        "Total Time": formatHms(row.total_seconds),
        "Type": row.is_outsource ? "OUTSOURCE" : "IN-HOUSE",
      }));
      const operationsWs = XLSX.utils.json_to_sheet(operationsData);
      operationsWs['!cols'] = [
        { wch: 6 },
        { wch: 15 },
        { wch: 25 },
        { wch: 8 },
        { wch: 25 },
        { wch: 8 },
        { wch: 15 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
        { wch: 10 },
      ];
      XLSX.utils.book_append_sheet(wb, operationsWs, "Part Operations");
    }

    const excelFileName = fileName.replace('.pdf', '.xlsx');
    XLSX.writeFile(wb, excelFileName);
    setIsModalVisible(false);
  };

  if (!summaryData) {
    return (
      <Tooltip title="No summary data available for export">
        <Button icon={<DownloadOutlined />} size="middle" disabled>
          Download Summary
        </Button>
      </Tooltip>
    );
  }

  return (
    <>
      <Button 
        icon={<DownloadOutlined />} 
        size="small"
        onClick={() => setIsModalVisible(true)}
      >
        Download Summary
      </Button>

      <Modal
        title="Download Product Summary Report"
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
              document={<ProductSummaryPdfDocument summaryData={summaryData} productName={productName} />}
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

export default ProductSummaryDownload;
