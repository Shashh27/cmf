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

const inventoryColumnWidths = {
  slNo: 25,
  name: 110,
  spec: 140,
  mass: 45,
  density: 55,
  volume: 55,
  stockType: 65,
  qty: 45,
  dimensions: 110,
  status: 65,
};

const statusColumnWidths = {
  slNo: 25,
  projectNumber: 75,
  projectName: 110,
  materialName: 110,
  quantity: 35,
  mass: 35,
  status: 80,
  partNumbers: 130,
  partNames: 130,
};

const RawMaterialsInventoryPdfDocument = ({ rawMaterials }) => {
  const generatedAt = new Date().toLocaleString();
  const total = rawMaterials.length;

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>
            CMF DIGITIZATION 
          </Text>
          <Text style={styles.subtitle}>
            Raw Materials Inventory Report
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>Total materials: {total}</Text>
            <Text style={styles.metaText}>Generated on: {generatedAt}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, { width: inventoryColumnWidths.slNo }]}>
              SL NO
            </Text>
            <Text style={[styles.headerCell, { width: inventoryColumnWidths.name }]}>
              MATERIAL NAME
            </Text>
            <Text style={[styles.headerCell, { width: inventoryColumnWidths.spec }]}>
              SPECIFICATION
            </Text>
            <Text style={[styles.headerCell, { width: inventoryColumnWidths.mass }]}>
              KG
            </Text>
            <Text style={[styles.headerCell, { width: inventoryColumnWidths.density }]}>
              DENSITY
            </Text>
            <Text style={[styles.headerCell, { width: inventoryColumnWidths.volume }]}>
              VOLUME
            </Text>
            <Text style={[styles.headerCell, { width: inventoryColumnWidths.stockType }]}>
              STOCK TYPE
            </Text>
            <Text style={[styles.headerCell, { width: inventoryColumnWidths.qty }]}>
              QTY
            </Text>
            <Text style={[styles.headerCell, { width: inventoryColumnWidths.dimensions }]}>
              DIMENSIONS
            </Text>
            <Text style={[styles.headerCell, { width: inventoryColumnWidths.status }]}>
              STATUS
            </Text>
          </View>

          {rawMaterials.map((m, index) => {
            const qty = m.quantity ?? 0;
            const statusText = qty > 0 ? "AVAILABLE" : "NOT AVAILABLE";
            return (
              <View key={m.id || index} style={styles.row}>
                <Text style={[styles.cell, { width: inventoryColumnWidths.slNo }]}>
                  {index + 1}
                </Text>
                <Text style={[styles.cell, { width: inventoryColumnWidths.name }]}>
                  {m.material_name || "-"}
                </Text>
                <Text style={[styles.cell, { width: inventoryColumnWidths.spec }]}>
                  {m.material_specification || "-"}
                </Text>
                <Text style={[styles.cell, { width: inventoryColumnWidths.mass }]}>
                  {m.mass != null ? String(m.mass) : "-"}
                </Text>
                <Text style={[styles.cell, { width: inventoryColumnWidths.density }]}>
                  {m.density != null ? String(m.density) : "-"}
                </Text>
                <Text style={[styles.cell, { width: inventoryColumnWidths.volume }]}>
                  {m.volume != null ? String(m.volume) : "-"}
                </Text>
                <Text style={[styles.cell, { width: inventoryColumnWidths.stockType }]}>
                  {m.stock_type || "-"}
                </Text>
                <Text style={[styles.cell, { width: inventoryColumnWidths.qty }]}>
                  {m.quantity != null ? String(m.quantity) : "-"}
                </Text>
                <Text style={[styles.cell, { width: inventoryColumnWidths.dimensions }]}>
                  {m.stock_dimensions || "-"}
                </Text>
                <Text style={[styles.cell, { width: inventoryColumnWidths.status }]}>
                  {statusText}
                </Text>
              </View>
            );
          })}
        </View>

        <Text style={styles.footer}>
          Generated by CMF Digitization Raw Materials module
        </Text>
      </Page>
    </Document>
  );
};

const groupLinkedMaterials = (linkedMaterials) => {
  const groupedMap = {};

  (linkedMaterials || []).forEach((item) => {
    if (!item) return;
    const materialId = item.raw_material_id ?? "no-material";
    const orderId = item.order_id ?? "no-order";
    const key = `${materialId}-${orderId}`;

    if (!groupedMap[key]) {
      groupedMap[key] = {
        id: `${materialId}-${orderId}`,
        raw_material_id: item.raw_material_id,
        order_id: item.order_id,
        sale_order_number: item.sale_order_number,
        project_name: item.project_name || item.product_name,
        material_name: item.material_name,
        quantity: item.order_quantity,
        mass: item.mass,
        material_status: item.material_status,
        part_numbers: [],
        part_names: [],
      };
    }

    if (item.part_number) {
      groupedMap[key].part_numbers.push(item.part_number);
    }
    if (item.part_name) {
      groupedMap[key].part_names.push(item.part_name);
    }
  });

  const groupedData = Object.values(groupedMap).sort((a, b) => {
    const aMat = a.raw_material_id ?? 0;
    const bMat = b.raw_material_id ?? 0;
    if (aMat !== bMat) return aMat - bMat;
    const aOrder = a.order_id ?? 0;
    const bOrder = b.order_id ?? 0;
    return aOrder - bOrder;
  });

  return groupedData;
};

const PartsWithRawMaterialsStatusPdfDocument = ({ linkedMaterials }) => {
  const generatedAt = new Date().toLocaleString();
  const groupedData = groupLinkedMaterials(linkedMaterials);
  const total = groupedData.length;

  const formatStatus = (status) => {
    if (!status) return "-";
    const value = String(status).toLowerCase();
    if (value === "available") return "AVAILABLE";
    if (value === "purchase order") return "PURCHASE ORDER";
    if (value === "purchase request") return "PURCHASE REQUEST";
    return status;
  };

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>
            CMF DIGITIZATION 
          </Text>
          <Text style={styles.subtitle}>
            Parts with Raw Materials Status Report
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>Total records: {total}</Text>
            <Text style={styles.metaText}>Generated on: {generatedAt}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, { width: statusColumnWidths.slNo }]}>
              SL NO
            </Text>
            <Text style={[styles.headerCell, { width: statusColumnWidths.projectNumber }]}>
              PROJECT NO
            </Text>
            <Text style={[styles.headerCell, { width: statusColumnWidths.projectName }]}>
              PROJECT NAME
            </Text>
            <Text style={[styles.headerCell, { width: statusColumnWidths.materialName }]}>
              MATERIAL NAME
            </Text>
            <Text style={[styles.headerCell, { width: statusColumnWidths.quantity }]}>
              QTY
            </Text>
            <Text style={[styles.headerCell, { width: statusColumnWidths.mass }]}>
              KG
            </Text>
            <Text style={[styles.headerCell, { width: statusColumnWidths.status }]}>
              STATUS
            </Text>
            <Text style={[styles.headerCell, { width: statusColumnWidths.partNumbers }]}>
              PART NUMBERS
            </Text>
            <Text style={[styles.headerCell, { width: statusColumnWidths.partNames }]}>
              PART NAMES
            </Text>
          </View>

          {groupedData.map((row, index) => (
            <View key={row.id || index} style={styles.row}>
              <Text style={[styles.cell, { width: statusColumnWidths.slNo }]}>
                {index + 1}
              </Text>
              <Text style={[styles.cell, { width: statusColumnWidths.projectNumber }]}>
                {row.sale_order_number || "-"}
              </Text>
              <Text style={[styles.cell, { width: statusColumnWidths.projectName }]}>
                {row.project_name || "-"}
              </Text>
              <Text style={[styles.cell, { width: statusColumnWidths.materialName }]}>
                {row.material_name || "-"}
              </Text>
              <Text style={[styles.cell, { width: statusColumnWidths.quantity }]}>
                {row.quantity != null ? String(row.quantity) : "-"}
              </Text>
              <Text style={[styles.cell, { width: statusColumnWidths.mass }]}>
                {row.mass != null ? String(row.mass) : "-"}
              </Text>
              <Text style={[styles.cell, { width: statusColumnWidths.status }]}>
                {formatStatus(row.material_status)}
              </Text>
              <Text style={[styles.cell, { width: statusColumnWidths.partNumbers }]}>
                {(row.part_numbers || []).join(", ") || "-"}
              </Text>
              <Text style={[styles.cell, { width: statusColumnWidths.partNames }]}>
                {(row.part_names || []).join(", ") || "-"}
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

export const RawMaterialsInventoryPdfDownload = ({
  rawMaterials,
  fileName = "raw-materials-inventory.pdf",
}) => {
  const [isModalVisible, setIsModalVisible] = useState(false);

  const handleDownloadExcel = () => {
    if (!rawMaterials || rawMaterials.length === 0) return;

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([]);

    // Add header information
    XLSX.utils.sheet_add_aoa(ws, [
      ["CMF DIGITIZATION"],
      ["Raw Materials Inventory Report"],
      [],
      [`Total Materials: ${rawMaterials.length}`],
      [`Generated on: ${new Date().toLocaleString()}`],
      []
    ], { origin: "A1" });

    // Add table headers
    const headers = [
      "SL NO",
      "MATERIAL NAME",
      "SPECIFICATION",
      "KG",
      "DENSITY",
      "VOLUME",
      "STOCK TYPE",
      "QTY",
      "DIMENSIONS",
      "STATUS"
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
    rawMaterials.forEach((m, index) => {
      const qty = m.quantity ?? 0;
      const statusText = qty > 0 ? "AVAILABLE" : "NOT AVAILABLE";
      const rowData = [
        index + 1,                                    // Column A: SL NO
        m.material_name || "-",                       // Column B: MATERIAL NAME
        m.material_specification || "-",              // Column C: SPECIFICATION
        m.mass != null ? m.mass : "-",                // Column D: KG
        m.density != null ? m.density : "-",          // Column E: DENSITY
        m.volume != null ? m.volume : "-",            // Column F: VOLUME
        m.stock_type || "-",                          // Column G: STOCK TYPE
        m.quantity != null ? m.quantity : "-",        // Column H: QTY
        m.stock_dimensions || "-",                    // Column I: DIMENSIONS
        statusText                                    // Column J: STATUS
      ];
      
      // Write each row individually to ensure proper alignment
      const rowNum = 8 + index; // Start from row 8 (after headers)
      XLSX.utils.sheet_add_aoa(ws, [rowData], { origin: `A${rowNum}` });
    });

    // Set column widths to match header order
    const colWidths = [
      { wch: 8 },   // SL NO
      { wch: 20 },  // MATERIAL NAME
      { wch: 25 },  // SPECIFICATION
      { wch: 10 },  // KG
      { wch: 12 },  // DENSITY
      { wch: 12 },  // VOLUME
      { wch: 15 },  // STOCK TYPE
      { wch: 8 },   // QTY
      { wch: 20 },  // DIMENSIONS
      { wch: 15 }   // STATUS
    ];
    ws['!cols'] = colWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, "Raw Materials Inventory");

    // Generate and download Excel file
    const excelFileName = fileName.replace('.pdf', '.xlsx');
    XLSX.writeFile(wb, excelFileName);
    
    setIsModalVisible(false);
  };

  if (!rawMaterials || rawMaterials.length === 0) {
    return (
      <Tooltip title="No raw materials available for export">
        <Button icon={<DownloadOutlined />} size="middle" disabled>
          Download Raw Materials
        </Button>
      </Tooltip>
    );
  }

  return (
    <>
      <Button 
        icon={<DownloadOutlined />} 
        size="middle"
        onClick={() => setIsModalVisible(true)}
      >
        Download Raw Materials
      </Button>

      <Modal
        title="Download Raw Materials Report"
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
              document={<RawMaterialsInventoryPdfDocument rawMaterials={rawMaterials} />}
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

export const PartsWithRawMaterialsStatusPdfDownload = ({
  linkedMaterials,
  fileName = "parts-with-raw-materials-status.pdf",
}) => {
  const [isModalVisible, setIsModalVisible] = useState(false);

  const handleDownloadExcel = () => {
    if (!linkedMaterials || linkedMaterials.length === 0) return;

    // Group linked materials like in the PDF document
    const groupedMap = {};
    (linkedMaterials || []).forEach((item) => {
      if (!item) return;
      const materialId = item.raw_material_id ?? "no-material";
      const orderId = item.order_id ?? "no-order";
      const key = `${materialId}-${orderId}`;

      if (!groupedMap[key]) {
        groupedMap[key] = {
          id: `${materialId}-${orderId}`,
          raw_material_id: item.raw_material_id,
          order_id: item.order_id,
          sale_order_number: item.sale_order_number,
          project_name: item.project_name || item.product_name,
          material_name: item.material_name,
          quantity: item.order_quantity,
          mass: item.mass,
          material_status: item.material_status,
          part_numbers: [],
          part_names: [],
        };
      }

      if (item.part_number) {
        groupedMap[key].part_numbers.push(item.part_number);
      }
      if (item.part_name) {
        groupedMap[key].part_names.push(item.part_name);
      }
    });

    const groupedData = Object.values(groupedMap).sort((a, b) => {
      const aMat = a.raw_material_id ?? 0;
      const bMat = b.raw_material_id ?? 0;
      if (aMat !== bMat) return aMat - bMat;
      const aOrder = a.order_id ?? 0;
      const bOrder = b.order_id ?? 0;
      return aOrder - bOrder;
    });

    const formatStatus = (status) => {
      if (!status) return "-";
      const value = String(status).toLowerCase();
      if (value === "available") return "AVAILABLE";
      if (value === "purchase order") return "PURCHASE ORDER";
      if (value === "purchase request") return "PURCHASE REQUEST";
      return status;
    };

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([]);

    // Add header information
    XLSX.utils.sheet_add_aoa(ws, [
      ["CMF DIGITIZATION"],
      ["Parts with Raw Materials Status Report"],
      [],
      [`Total Records: ${groupedData.length}`],
      [`Generated on: ${new Date().toLocaleString()}`],
      []
    ], { origin: "A1" });

    // Add table headers
    const headers = [
      "SL NO",
      "PROJECT NO",
      "PROJECT NAME",
      "MATERIAL NAME",
      "QTY",
      "KG",
      "STATUS",
      "PART NUMBERS",
      "PART NAMES"
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
    groupedData.forEach((row, index) => {
      const rowData = [
        index + 1,                                    // Column A: SL NO
        row.sale_order_number || "-",                 // Column B: PROJECT NO
        row.project_name || "-",                      // Column C: PROJECT NAME
        row.material_name || "-",                     // Column D: MATERIAL NAME
        row.quantity != null ? row.quantity : "-",     // Column E: QTY
        row.mass != null ? row.mass : "-",             // Column F: KG
        formatStatus(row.material_status),            // Column G: STATUS
        (row.part_numbers || []).join(", ") || "-",   // Column H: PART NUMBERS
        (row.part_names || []).join(", ") || "-"      // Column I: PART NAMES
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
      { wch: 20 },  // MATERIAL NAME
      { wch: 8 },   // QTY
      { wch: 10 },  // KG
      { wch: 20 },  // STATUS
      { wch: 25 },  // PART NUMBERS
      { wch: 25 }   // PART NAMES
    ];
    ws['!cols'] = colWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, "Parts with Raw Materials Status");

    // Generate and download Excel file
    const excelFileName = fileName.replace('.pdf', '.xlsx');
    XLSX.writeFile(wb, excelFileName);
    
    setIsModalVisible(false);
  };

  if (!linkedMaterials || linkedMaterials.length === 0) {
    return (
      <Tooltip title="No status records available for export">
        <Button icon={<DownloadOutlined />} size="middle" disabled>
          Download Parts Raw Material
        </Button>
      </Tooltip>
    );
  }

  return (
    <>
      <Button 
        icon={<DownloadOutlined />} 
        size="middle"
        onClick={() => setIsModalVisible(true)}
      >
        Download Parts Raw Material
      </Button>

      <Modal
        title="Download Status Report"
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
                <PartsWithRawMaterialsStatusPdfDocument linkedMaterials={linkedMaterials} />
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
