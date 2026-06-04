import React, { useState } from "react";
import { Button, Tooltip, Modal, Space, message } from "antd";
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
import dayjs from "dayjs";

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

const HistoryPDFDocument = ({ historyData, selectedMaterial }) => {
  const formatDate = (date) => dayjs(date).format('YYYY-MM-DD HH:mm');

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Raw Material History Report</Text>
          <Text style={styles.subtitle}>
            {selectedMaterial 
              ? `Material: ${selectedMaterial.material_name} (${selectedMaterial.material_code})`
              : 'All Materials'
            }
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>
              Generated: {formatDate(new Date())}
            </Text>
            <Text style={styles.metaText}>
              Total Records: {historyData.length}
            </Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, { width: '16%' }]}>Date & Time</Text>
            <Text style={[styles.headerCell, { width: '13%' }]}>Activity</Text>
            <Text style={[styles.headerCell, { width: '16%' }]}>Raw Material</Text>
            <Text style={[styles.headerCell, { width: '9%' }]}>Form Type</Text>
            <Text style={[styles.headerCell, { width: '11%' }]}>Dimensions</Text>
            <Text style={[styles.headerCell, { width: '9%' }]}>Source</Text>
            <Text style={[styles.headerCell, { width: '11%' }]}>Order</Text>
            <Text style={[styles.headerCell, { width: '11%' }]}>Part</Text>
            <Text style={[styles.headerCell, { width: '9%' }]}>Length Used</Text>
            <Text style={[styles.headerCell, { width: '11%' }]}>User</Text>
            <Text style={[styles.headerCell, { width: '12%' }]}>Vendor</Text>
          </View>
          {historyData.map((item, index) => (
            <View key={index} style={styles.row}>
              <Text style={[styles.cell, { width: '16%' }]}>{formatDate(item.timestamp)}</Text>
              <Text style={[styles.cell, { width: '13%' }]}>{item.activity_type?.replace(/_/g, ' ') || '-'}</Text>
              <Text style={[styles.cell, { width: '16%' }]}>{item.material_name || item.raw_material_name || '-'}</Text>
              <Text style={[styles.cell, { width: '9%' }]}>{item.form_type || '-'}</Text>
              <Text style={[styles.cell, { width: '11%' }]}>{item.dimensions || '-'}</Text>
              <Text style={[styles.cell, { width: '9%' }]}>{item.source_type?.toUpperCase() || '-'}</Text>
              <Text style={[styles.cell, { width: '11%' }]}>{item.order_number || '-'}</Text>
              <Text style={[styles.cell, { width: '11%' }]}>{item.part_name ? `${item.part_name} - ${item.part_number || '-'}` : '-'}</Text>
              <Text style={[styles.cell, { width: '9%' }]}>
                {item.activity_type === 'material_linked' && item.used_length
                  ? `${item.used_length}mm`
                  : item.quantity
                  ? `${item.quantity} units`
                  : '-'}
              </Text>
              <Text style={[styles.cell, { width: '11%' }]}>{item.user_name || '-'}</Text>
              <Text style={[styles.cell, { width: '12%' }]}>{item.vendor_name || item.received_vendor_name || '-'}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.footer}>
          Report generated by CMF Digitization System
        </Text>
      </Page>
    </Document>
  );
};

const RawMaterialHistoryDownload = ({ historyData, selectedMaterial }) => {
  const [modalVisible, setModalVisible] = useState(false);

  const downloadExcel = () => {
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

      // Group data by material
      const groupedByMaterial = {};
      historyData.forEach(item => {
        const materialName = item.material_name || item.raw_material_name || 'Unknown';
        if (!groupedByMaterial[materialName]) {
          groupedByMaterial[materialName] = [];
        }
        groupedByMaterial[materialName].push(item);
      });

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

      // Add summary sheet if multiple materials
      if (Object.keys(groupedByMaterial).length > 1) {
        const summaryWs = XLSX.utils.aoa_to_sheet([]);
        const summaryHeader = [
          ["CMF DIGITIZATION"],
          ["History Summary by Material"],
          [],
          [`Generated on: ${dayjs().format('YYYY-MM-DD HH:mm:ss')}`],
          []
        ];

        XLSX.utils.sheet_add_aoa(summaryWs, summaryHeader, { origin: "A1" });

        summaryWs['!merges'] = [
          { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
          { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
          { s: { r: 3, c: 0 }, e: { r: 3, c: 2 } }
        ];

        if (summaryWs['A1']) summaryWs['A1'].s = { font: { sz: 16, bold: true }, alignment: { horizontal: "center", vertical: "center" } };
        if (summaryWs['A2']) summaryWs['A2'].s = { font: { sz: 14, bold: true }, alignment: { horizontal: "center", vertical: "center" } };

        const summaryHeaders = ["Material Name", "Total Records", "Activities"];
        XLSX.utils.sheet_add_aoa(summaryWs, [summaryHeaders], { origin: "A6" });

        let summaryRow = 7;
        Object.entries(groupedByMaterial).forEach(([materialName, records]) => {
          const activities = [...new Set(records.map(r => r.activity_type?.replace(/_/g, ' ')))].join(', ');
          const summaryData = [materialName, records.length, activities];
          XLSX.utils.sheet_add_aoa(summaryWs, [summaryData], { origin: `A${summaryRow}` });
          summaryRow++;
        });

        summaryWs['!cols'] = [
          { wch: 30 },
          { wch: 15 },
          { wch: 50 }
        ];

        XLSX.utils.book_append_sheet(workbook, summaryWs, 'Summary');
      }

      const fileName = selectedMaterial
        ? `RawMaterialHistory_${selectedMaterial.material_name}_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`
        : `RawMaterialHistory_All_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`;

      XLSX.writeFile(workbook, fileName);
      message.success('Excel download started');
      setModalVisible(false);
    } catch (error) {
      console.error('Error downloading Excel:', error);
      message.error('Failed to download Excel');
    }
  };

  const fileName = selectedMaterial
    ? `RawMaterialHistory_${selectedMaterial.material_name}_${dayjs().format('YYYYMMDD_HHmmss')}.pdf`
    : `RawMaterialHistory_All_${dayjs().format('YYYYMMDD_HHmmss')}.pdf`;

  return (
    <>
      <Button
        size="small"
        icon={<DownloadOutlined />}
        onClick={() => setModalVisible(true)}
        style={{ marginLeft: '70px' }}
      >
        Download History
      </Button>

      <Modal
        title="Download History Report"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        centered
        width={400}
      >
        <div style={{ padding: "20px 0" }}>
          <p style={{ marginBottom: "20px", textAlign: "center", color: "#666" }}>
            Choose your preferred download format:
          </p>

          <div style={{ textAlign: "center", marginBottom: "20px" }}>
            <p style={{ fontSize: "14px", margin: 0, marginBottom: "8px" }}>
              {selectedMaterial
                ? `Material: ${selectedMaterial.material_name} (${selectedMaterial.material_code})`
                : 'All Materials'
              }
            </p>
            <p style={{ fontSize: "12px", color: "#666", margin: 0 }}>
              Total records: {historyData.length}
            </p>
          </div>

          <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
            <PDFDownloadLink
              document={<HistoryPDFDocument historyData={historyData} selectedMaterial={selectedMaterial} />}
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
              onClick={downloadExcel}
            >
              Download Excel
            </Button>
          </Space>
        </div>
      </Modal>
    </>
  );
};

export default RawMaterialHistoryDownload;
