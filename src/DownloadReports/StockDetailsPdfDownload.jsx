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
  materialInfo: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  materialInfoText: {
    fontSize: 9,
    color: "#4b5563",
    fontWeight: 600,
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

const stockColumnWidths = {
  processType: 70,
  formType: 60,
  dimensions: 100,
  quantity: 50,
  volume: 60,
  mass: 60,
  weight: 60,
  cost: 60,
  source: 50,
  order: 70,
  parts: 80,
  userName: 70,
  status: 50,
};

const StockDetailsPdfDocument = ({ materialName, materialDensity, materialCost, stockData }) => {
  const generatedAt = new Date().toLocaleString();
  const total = stockData.length;

  const getDimensions = (record) => {
    if (record.form_type === 'Round') return `⌀${record.diameter} × ${record.length}mm`;
    if (record.form_type === 'Square') return `${record.breadth} × ${record.height} × ${record.length}mm`;
    if (record.form_type === 'Pipe') return `⌀${record.outer_diameter}/${record.inner_diameter} × ${record.length}mm`;
    return '-';
  };

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>
            CMF DIGITIZATION 
          </Text>
          <Text style={styles.subtitle}>
            Stock Details Report
          </Text>
          <View style={styles.materialInfo}>
            <Text style={styles.materialInfoText}>
              Material: {materialName}
            </Text>
            <Text style={styles.materialInfoText}>
              Density: {materialDensity != null ? `${materialDensity} kg/m³` : "-"}
            </Text>
            <Text style={styles.materialInfoText}>
              Cost: {materialCost != null ? `₹${materialCost.toFixed(2)}/kg` : "-"}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>Total stocks: {total}</Text>
            <Text style={styles.metaText}>Generated on: {generatedAt}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, { width: stockColumnWidths.processType }]}>
              PROCESS TYPE
            </Text>
            <Text style={[styles.headerCell, { width: stockColumnWidths.formType }]}>
              FORM TYPE
            </Text>
            <Text style={[styles.headerCell, { width: stockColumnWidths.dimensions }]}>
              DIMENSIONS
            </Text>
            <Text style={[styles.headerCell, { width: stockColumnWidths.quantity }]}>
              QUANTITY
            </Text>
            <Text style={[styles.headerCell, { width: stockColumnWidths.volume }]}>
              VOLUME (m³)
            </Text>
            <Text style={[styles.headerCell, { width: stockColumnWidths.mass }]}>
              MASS (kg)
            </Text>
            <Text style={[styles.headerCell, { width: stockColumnWidths.weight }]}>
              WEIGHT (N)
            </Text>
            <Text style={[styles.headerCell, { width: stockColumnWidths.cost }]}>
              COST (₹)
            </Text>
            <Text style={[styles.headerCell, { width: stockColumnWidths.source }]}>
              SOURCE
            </Text>
            <Text style={[styles.headerCell, { width: stockColumnWidths.order }]}>
              ORDER
            </Text>
            <Text style={[styles.headerCell, { width: stockColumnWidths.parts }]}>
              PARTS
            </Text>
            <Text style={[styles.headerCell, { width: stockColumnWidths.userName }]}>
              USER NAME
            </Text>
            <Text style={[styles.headerCell, { width: stockColumnWidths.status }]}>
              STATUS
            </Text>
          </View>

          {stockData.map((stock, index) => (
            <View key={stock.id || index} style={styles.row}>
              <Text style={[styles.cell, { width: stockColumnWidths.processType }]}>
                {stock.process_type || "-"}
              </Text>
              <Text style={[styles.cell, { width: stockColumnWidths.formType }]}>
                {stock.form_type || "-"}
              </Text>
              <Text style={[styles.cell, { width: stockColumnWidths.dimensions }]}>
                {getDimensions(stock)}
              </Text>
              <Text style={[styles.cell, { width: stockColumnWidths.quantity }]}>
                {stock.quantity != null ? String(stock.quantity) : "-"}
              </Text>
              <Text style={[styles.cell, { width: stockColumnWidths.volume }]}>
                {stock.volume != null ? String(stock.volume.toFixed(6)) : "-"}
              </Text>
              <Text style={[styles.cell, { width: stockColumnWidths.mass }]}>
                {stock.mass != null ? String(stock.mass.toFixed(3)) : "-"}
              </Text>
              <Text style={[styles.cell, { width: stockColumnWidths.weight }]}>
                {stock.weight != null ? String(stock.weight.toFixed(3)) : "-"}
              </Text>
              <Text style={[styles.cell, { width: stockColumnWidths.cost }]}>
                {stock.cost != null ? `₹${stock.cost.toFixed(2)}` : "-"}
              </Text>
              <Text style={[styles.cell, { width: stockColumnWidths.source }]}>
                {stock.source_type === 'order' ? 'Order' : 'General'}
              </Text>
              <Text style={[styles.cell, { width: stockColumnWidths.order }]}>
                {stock.source_order_number || "-"}
              </Text>
              <Text style={[styles.cell, { width: stockColumnWidths.parts }]}>
                {stock.part_numbers?.length > 0 ? stock.part_numbers.join(', ') : "-"}
              </Text>
              <Text style={[styles.cell, { width: stockColumnWidths.userName }]}>
                {stock.creator_name || "-"}
              </Text>
              <Text style={[styles.cell, { width: stockColumnWidths.status }]}>
                {stock.status || "-"}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.footer}>
          Generated by CMF Digitization Raw Materials module
        </Text>
      </Page>
    </Document>
  );
};

export const StockDetailsPdfDownload = ({
  materialName,
  materialDensity,
  materialCost,
  stockData,
  fileName = "stock-details.pdf",
}) => {
  const [isModalVisible, setIsModalVisible] = useState(false);

  const handleDownloadExcel = () => {
    if (!stockData || stockData.length === 0) return;

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([]);

    // Add header information
    XLSX.utils.sheet_add_aoa(ws, [
      ["CMF DIGITIZATION"],
      ["Stock Details Report"],
      [],
      [`Material: ${materialName}`],
      [`Density: ${materialDensity != null ? `${materialDensity} kg/m³` : "-"}`],
      [`Cost: ${materialCost != null ? `₹${materialCost.toFixed(2)}/kg` : "-"}`],
      [],
      [`Total Stocks: ${stockData.length}`],
      [`Generated on: ${new Date().toLocaleString()}`],
      []
    ], { origin: "A1" });

    // Add table headers
    const headers = [
      "PROCESS TYPE",
      "FORM TYPE",
      "DIMENSIONS",
      "QUANTITY",
      "VOLUME (m³)",
      "MASS (kg)",
      "WEIGHT (N)",
      "COST (₹)",
      "SOURCE",
      "ORDER",
      "PARTS",
      "USER NAME",
      "STATUS"
    ];

    // Merge cells for header titles and metadata
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: headers.length - 1 } },
      { s: { r: 4, c: 0 }, e: { r: 4, c: headers.length - 1 } },
      { s: { r: 5, c: 0 }, e: { r: 5, c: headers.length - 1 } },
      { s: { r: 7, c: 0 }, e: { r: 7, c: headers.length - 1 } },
      { s: { r: 8, c: 0 }, e: { r: 8, c: headers.length - 1 } }
    ];

    // Apply styling to header cells
    if (ws['A1']) ws['A1'].s = { font: { sz: 16, bold: true }, alignment: { horizontal: "center", vertical: "center" } };
    if (ws['A2']) ws['A2'].s = { font: { sz: 14, bold: true }, alignment: { horizontal: "center", vertical: "center" } };
    if (ws['A4']) ws['A4'].s = { font: { bold: true }, alignment: { horizontal: "left", vertical: "center" } };
    if (ws['A5']) ws['A5'].s = { font: { bold: true }, alignment: { horizontal: "left", vertical: "center" } };
    if (ws['A6']) ws['A6'].s = { font: { bold: true }, alignment: { horizontal: "left", vertical: "center" } };
    if (ws['A8']) ws['A8'].s = { font: { bold: true }, alignment: { horizontal: "center", vertical: "center" } };
    if (ws['A9']) ws['A9'].s = { font: { bold: true }, alignment: { horizontal: "center", vertical: "center" } };

    XLSX.utils.sheet_add_aoa(ws, [headers], { origin: "A11" });

    // Apply styling to table headers
    for (let i = 0; i < headers.length; i++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 10, c: i });
      if (ws[cellAddress]) {
        ws[cellAddress].s = { 
          font: { bold: true }, 
          alignment: { horizontal: "center", vertical: "center" },
          fill: { fgColor: { rgb: "F3F4F6" } }
        };
      }
    }

    const getDimensions = (record) => {
      if (record.form_type === 'Round') return `⌀${record.diameter} × ${record.length}mm`;
      if (record.form_type === 'Square') return `${record.breadth} × ${record.height} × ${record.length}mm`;
      if (record.form_type === 'Pipe') return `⌀${record.outer_diameter}/${record.inner_diameter} × ${record.length}mm`;
      return '-';
    };

    // Prepare and add table data
    let currentRow = 12;
    stockData.forEach((stock) => {
      const rowData = [
        stock.process_type || "-",
        stock.form_type || "-",
        getDimensions(stock),
        stock.quantity != null ? stock.quantity : "-",
        stock.volume != null ? stock.volume.toFixed(6) : "-",
        stock.mass != null ? stock.mass.toFixed(3) : "-",
        stock.weight != null ? stock.weight.toFixed(3) : "-",
        stock.cost != null ? `₹${stock.cost.toFixed(2)}` : "-",
        stock.source_type === 'order' ? 'Order' : 'General',
        stock.source_order_number || "-",
        stock.part_numbers?.length > 0 ? stock.part_numbers.join(', ') : "-",
        stock.creator_name || "-",
        stock.status || "-"
      ];
      
      XLSX.utils.sheet_add_aoa(ws, [rowData], { origin: `A${currentRow}` });
      currentRow++;
    });

    // Set column widths
    const colWidths = [
      { wch: 12 },  // PROCESS TYPE
      { wch: 10 },  // FORM TYPE
      { wch: 20 },  // DIMENSIONS
      { wch: 10 },  // QUANTITY
      { wch: 12 },  // VOLUME (m³)
      { wch: 10 },  // MASS (kg)
      { wch: 10 },  // WEIGHT (N)
      { wch: 10 },  // COST (₹)
      { wch: 10 },  // SOURCE
      { wch: 12 },  // ORDER
      { wch: 15 },  // PARTS
      { wch: 12 },  // USER NAME
      { wch: 10 }   // STATUS
    ];
    ws['!cols'] = colWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, "Stock Details");

    // Generate and download Excel file
    const excelFileName = fileName.replace('.pdf', '.xlsx');
    XLSX.writeFile(wb, excelFileName);
    
    setIsModalVisible(false);
  };

  if (!stockData || stockData.length === 0) {
    return (
      <Tooltip title="No stock data available for export">
        <Button icon={<DownloadOutlined />} size="small" disabled>
          Download
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
        Download
      </Button>

      <Modal
        title="Download Stock Details Report"
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
              document={
                <StockDetailsPdfDocument 
                  materialName={materialName}
                  materialDensity={materialDensity}
                  materialCost={materialCost}
                  stockData={stockData}
                />
              }
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
