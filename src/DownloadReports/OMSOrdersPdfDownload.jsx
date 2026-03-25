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

const columnWidths = {
  slNo: 25,
  projectNumber: 70,
  projectName: 120,
  customer: 100,
  product: 100,
  qty: 30,
  orderDate: 65,
  dueDate: 65,
  status: 55,
  coordinator: 80,
};

const OMSOrdersPdfDocument = ({
  orders,
  formatDate,
}) => {
  const generatedAt = new Date().toLocaleString();
  const totalOrders = orders.length;

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>
            CMF DIGITIZATION - CMTI
          </Text>
          <Text style={styles.subtitle}>
            Order Management System – Orders Summary Report
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>Total orders: {totalOrders}</Text>
            <Text style={styles.metaText}>Generated on: {generatedAt}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, { width: columnWidths.slNo }]}>
              SL NO
            </Text>
            <Text
              style={[styles.headerCell, { width: columnWidths.projectNumber }]}
            >
              PROJECT NO
            </Text>
            <Text
              style={[styles.headerCell, { width: columnWidths.projectName }]}
            >
              PROJECT NAME
            </Text>
            <Text style={[styles.headerCell, { width: columnWidths.customer }]}>
              CUSTOMER
            </Text>
            <Text style={[styles.headerCell, { width: columnWidths.product }]}>
              PRODUCT
            </Text>
            <Text style={[styles.headerCell, { width: columnWidths.qty }]}>
              QTY
            </Text>
            <Text
              style={[styles.headerCell, { width: columnWidths.orderDate }]}
            >
              ORDER DATE
            </Text>
            <Text style={[styles.headerCell, { width: columnWidths.dueDate }]}>
              DUE DATE
            </Text>
            <Text style={[styles.headerCell, { width: columnWidths.status }]}>
              STATUS
            </Text>
            <Text
              style={[styles.headerCell, { width: columnWidths.coordinator }]}
            >
              COORDINATOR
            </Text>
          </View>

          {orders.map((order, index) => (
            <View key={order.id || index} style={styles.row}>
              <Text style={[styles.cell, { width: columnWidths.slNo }]}>
                {index + 1}
              </Text>
              <Text
                style={[styles.cell, { width: columnWidths.projectNumber }]}
              >
                {order.sale_order_number || "-"}
              </Text>
              <Text
                style={[styles.cell, { width: columnWidths.projectName }]}
              >
                {order.product_name || order.product || order.project_name || "-"}
              </Text>
              <Text style={[styles.cell, { width: columnWidths.customer }]}>
                {order.customer_name || order.customer || "-"}
              </Text>
              <Text style={[styles.cell, { width: columnWidths.product }]}>
                {order.product_name || order.product || "-"}
              </Text>
              <Text style={[styles.cell, { width: columnWidths.qty }]}>
                {order.quantity != null ? String(order.quantity) : "-"}
              </Text>
              <Text style={[styles.cell, { width: columnWidths.orderDate }]}>
                {order.order_date ? formatDate(order.order_date) : "-"}
              </Text>
              <Text style={[styles.cell, { width: columnWidths.dueDate }]}>
                {order.due_date ? formatDate(order.due_date) : "-"}
              </Text>
              <Text style={[styles.cell, { width: columnWidths.status }]}>
                {(order.status || "-").toUpperCase()}
              </Text>
              <Text style={[styles.cell, { width: columnWidths.coordinator }]}>
                {order.user_name || order.user_id || "-"}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.footer}>
          Generated by CMF Digitization OMS module
        </Text>
      </Page>
    </Document>
  );
};

const OMSOrdersPdfDownload = ({
  orders,
  formatDate,
  fileName = "oms-orders-report.pdf",
}) => {
  const [isModalVisible, setIsModalVisible] = useState(false);

  const handleDownloadExcel = () => {
    if (!orders || orders.length === 0) return;

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([]);

    // Add header information
    XLSX.utils.sheet_add_aoa(ws, [
      ["CMF DIGITIZATION - CMTI"],
      ["Order Management System – Orders Summary Report"],
      [],
      [`Total Orders: ${orders.length}`],
      [`Generated on: ${new Date().toLocaleString()}`],
      []
    ], { origin: "A1" });

    // Add table headers
    const headers = [
      "SL NO",
      "PROJECT NO", 
      "PROJECT NAME",
      "CUSTOMER",
      "PRODUCT",
      "QTY",
      "ORDER DATE",
      "DUE DATE",
      "STATUS",
      "COORDINATOR"
    ];

    // Merge cells for header titles and metadata
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }, // CMF DIGITIZATION - CMTI
      { s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } }, // Order Management System – Orders Summary Report
      { s: { r: 3, c: 0 }, e: { r: 3, c: headers.length - 1 } }, // Total Orders
      { s: { r: 4, c: 0 }, e: { r: 4, c: headers.length - 1 } }  // Generated on
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

    // Prepare and add table data
    const excelData = orders.map((order, index) => [
      index + 1,
      order.sale_order_number || "-",
      order.product_name || order.product || order.project_name || "-",
      order.customer_name || order.customer || "-",
      order.product_name || order.product || "-",
      order.quantity != null ? order.quantity : "-",
      order.order_date ? formatDate(order.order_date) : "-",
      order.due_date ? formatDate(order.due_date) : "-",
      (order.status || "-").toUpperCase(),
      order.user_name || order.user_id || "-"
    ]);

    XLSX.utils.sheet_add_aoa(ws, excelData, { origin: "A8" });

    // Set column widths
    const colWidths = [
      { wch: 8 },   // SL NO
      { wch: 15 },  // PROJECT NO
      { wch: 25 },  // PROJECT NAME
      { wch: 20 },  // CUSTOMER
      { wch: 20 },  // PRODUCT
      { wch: 8 },   // QTY
      { wch: 12 },  // ORDER DATE
      { wch: 12 },  // DUE DATE
      { wch: 12 },  // STATUS
      { wch: 15 }   // COORDINATOR
    ];
    ws['!cols'] = colWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, "Orders Report");

    // Generate and download Excel file
    const excelFileName = fileName.replace('.pdf', '.xlsx');
    XLSX.writeFile(wb, excelFileName);
    
    setIsModalVisible(false);
  };

  if (!orders || orders.length === 0) {
    return (
      <Tooltip title="No orders available for export">
        <Button icon={<DownloadOutlined />} disabled>
          Download Orders
        </Button>
      </Tooltip>
    );
  }

  return (
    <>
      <Button 
        icon={<DownloadOutlined />} 
        onClick={() => setIsModalVisible(true)}
        type="default"
      >
        Download Orders
      </Button>

      <Modal
        title="Download Orders Report"
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
              document={<OMSOrdersPdfDocument orders={orders} formatDate={formatDate} />}
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

export default OMSOrdersPdfDownload;

