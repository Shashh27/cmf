/**
 * File: src/DownloadReports/OrderMaterialsPdfDownload.jsx
 *
 * Download component for Order Materials (Procured & Available Materials)
 * with PDF and Excel options and part number filter
 */

import React, { useState } from "react";
import { Button, Tooltip, Modal, Space, Select, Input } from "antd";
import { FilePdfOutlined, FileExcelOutlined, DownloadOutlined } from "@ant-design/icons";
import {
  PDFDownloadLink,
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import * as XLSX from "xlsx";

const { Option } = Select;

// PDF Styles
const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#ffffff",
    padding: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#1f2937",
  },
  subtitle: {
    fontSize: 12,
    marginBottom: 15,
    color: "#6b7280",
  },
  table: {
    width: "100%",
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  headerRow: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerCell: {
    padding: 8,
    fontSize: 10,
    fontWeight: "bold",
    color: "#374151",
    flex: 1,
  },
  cell: {
    padding: 8,
    fontSize: 9,
    color: "#1f2937",
    flex: 1,
  },
  footer: {
    marginTop: 20,
    fontSize: 8,
    color: "#9ca3af",
    textAlign: "center",
  },
});

// PDF Document
const OrderMaterialsPdfDocument = ({ materials, orderNumber, selectedMaterial = null }) => {
  // Use selected material if provided, otherwise use all materials
  const materialsToDownload = selectedMaterial ? [selectedMaterial] : materials;

  const columnWidths = {
    slNo: 30,
    materialName: 80,
    formType: 60,
    processType: 60,
    stockSize: 70,
    sourceType: 50,
    totalQty: 50,
    weightKg: 50,
    estimatedCost: 60,
    finalCost: 60,
    vendor: 70,
  };

  const partsColumnWidths = {
    slNo: 25,
    partNumber: 80,
    partName: 90,
    extractedMaterial: 80,
    extractedSize: 70,
    assignedMaterial: 80,
    formType: 60,
    assignedDimensions: 70,
    requiredLength: 55,
    status: 55,
  };

  return (
    <Document>
      {/* Materials Page */}
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>Order Materials - {orderNumber}</Text>
        <Text style={styles.subtitle}>
          {selectedMaterial ? `Selected Material: ${selectedMaterial.material_name}` : "Materials Summary"}
        </Text>

        {/* Materials Table Header */}
        <View style={styles.table}>
          <View style={styles.headerRow}>
            <Text style={[styles.headerCell, { width: columnWidths.slNo }]}>SL</Text>
            <Text style={[styles.headerCell, { width: columnWidths.materialName }]}>MATERIAL NAME</Text>
            <Text style={[styles.headerCell, { width: columnWidths.formType }]}>FORM TYPE</Text>
            <Text style={[styles.headerCell, { width: columnWidths.processType }]}>PROCESS TYPE</Text>
            <Text style={[styles.headerCell, { width: columnWidths.stockSize }]}>STOCK SIZE</Text>
            <Text style={[styles.headerCell, { width: columnWidths.sourceType }]}>SOURCE</Text>
            <Text style={[styles.headerCell, { width: columnWidths.totalQty }]}>TOTAL QTY</Text>
            <Text style={[styles.headerCell, { width: columnWidths.weightKg }]}>WEIGHT (KG)</Text>
            <Text style={[styles.headerCell, { width: columnWidths.estimatedCost }]}>EST COST</Text>
            <Text style={[styles.headerCell, { width: columnWidths.finalCost }]}>FINAL COST</Text>
            <Text style={[styles.headerCell, { width: columnWidths.vendor }]}>VENDOR</Text>
          </View>

          {/* Materials Table Rows */}
          {materialsToDownload.map((material, index) => (
            <View key={`${material.material_id}-${index}`} style={styles.row}>
              <Text style={[styles.cell, { width: columnWidths.slNo }]}>{index + 1}</Text>
              <Text style={[styles.cell, { width: columnWidths.materialName }]}>{material.material_name || "—"}</Text>
              <Text style={[styles.cell, { width: columnWidths.formType }]}>{material.form_type || "—"}</Text>
              <Text style={[styles.cell, { width: columnWidths.processType }]}>{material.process_type || "—"}</Text>
              <Text style={[styles.cell, { width: columnWidths.stockSize }]}>{material.stock_size || "—"}</Text>
              <Text style={[styles.cell, { width: columnWidths.sourceType }]}>{material.source_type || "—"}</Text>
              <Text style={[styles.cell, { width: columnWidths.totalQty }]}>{material.total_stock_qty || 0}</Text>
              <Text style={[styles.cell, { width: columnWidths.weightKg }]}>{material.stock_size_kg || "—"}</Text>
              <Text style={[styles.cell, { width: columnWidths.estimatedCost }]}>{material.estimated_cost || "—"}</Text>
              <Text style={[styles.cell, { width: columnWidths.finalCost }]}>{material.final_cost || "—"}</Text>
              <Text style={[styles.cell, { width: columnWidths.vendor }]}>{material.received_vendor_name || "—"}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.footer}>
          Generated by CMF Digitization Raw Materials module
        </Text>
      </Page>

      {/* Parts Page */}
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>Order Materials - {orderNumber}</Text>
        <Text style={styles.subtitle}>
          Parts Assigned to Materials
          {selectedMaterial ? ` - ${selectedMaterial.material_name}` : ""}
        </Text>

        {/* Parts Table Header */}
        <View style={styles.table}>
          <View style={styles.headerRow}>
            <Text style={[styles.headerCell, { width: partsColumnWidths.slNo }]}>SL</Text>
            <Text style={[styles.headerCell, { width: partsColumnWidths.partNumber }]}>PART #</Text>
            <Text style={[styles.headerCell, { width: partsColumnWidths.partName }]}>NAME</Text>
            <Text style={[styles.headerCell, { width: partsColumnWidths.extractedMaterial }]}>EXTRACTED MAT</Text>
            <Text style={[styles.headerCell, { width: partsColumnWidths.extractedSize }]}>EXTRACTED SIZE</Text>
            <Text style={[styles.headerCell, { width: partsColumnWidths.assignedMaterial }]}>ASSIGNED MAT</Text>
            <Text style={[styles.headerCell, { width: partsColumnWidths.formType }]}>FORM</Text>
            <Text style={[styles.headerCell, { width: partsColumnWidths.assignedDimensions }]}>DIM</Text>
            <Text style={[styles.headerCell, { width: partsColumnWidths.requiredLength }]}>REQ LEN</Text>
            <Text style={[styles.headerCell, { width: partsColumnWidths.status }]}>STATUS</Text>
          </View>

          {/* Parts Table Rows */}
          {materialsToDownload.flatMap((material, matIndex) =>
            (material.parts || []).map((part, partIndex) => (
              <View key={`${material.material_id}-${part.part_id}`} style={styles.row}>
                <Text style={[styles.cell, { width: partsColumnWidths.slNo }]}>
                  {materialsToDownload.slice(0, matIndex).reduce((sum, m) => sum + (m.parts?.length || 0), 0) + partIndex + 1}
                </Text>
                <Text style={[styles.cell, { width: partsColumnWidths.partNumber }]}>{part.part_number || "—"}</Text>
                <Text style={[styles.cell, { width: partsColumnWidths.partName }]}>{part.part_name || "—"}</Text>
                <Text style={[styles.cell, { width: partsColumnWidths.extractedMaterial }]}>{part.extracted_material || "—"}</Text>
                <Text style={[styles.cell, { width: partsColumnWidths.extractedSize }]}>{part.extracted_size || "—"}</Text>
                <Text style={[styles.cell, { width: partsColumnWidths.assignedMaterial }]}>{part.assigned_material_name || "—"}</Text>
                <Text style={[styles.cell, { width: partsColumnWidths.formType }]}>{part.assigned_form_type || "—"}</Text>
                <Text style={[styles.cell, { width: partsColumnWidths.assignedDimensions }]}>{part.assigned_dimensions || "—"}</Text>
                <Text style={[styles.cell, { width: partsColumnWidths.requiredLength }]}>{part.assigned_required_length || "—"}</Text>
                <Text style={[styles.cell, { width: partsColumnWidths.status }]}>{part.assigned_status || "—"}</Text>
              </View>
            ))
          )}
        </View>

        <Text style={styles.footer}>
          Generated by CMF Digitization Raw Materials module
        </Text>
      </Page>
    </Document>
  );
};

const OrderMaterialsPdfDownload = ({ materials, orderNumber, selectedMaterial = null }) => {
  const [isModalVisible, setIsModalVisible] = useState(false);

  const fileName = `materials-${orderNumber}.pdf`;

  // Use selected material if provided, otherwise use all materials
  const materialsToDownload = selectedMaterial ? [selectedMaterial] : materials;

  const handleDownloadExcel = () => {
    if (materialsToDownload.length === 0) {
      alert("No materials to download");
      return;
    }

    const wb = XLSX.utils.book_new();

    // Materials Sheet - Match table columns exactly
    const materialsData = materialsToDownload.map((m, idx) => ({
      "SL NO": idx + 1,
      "MATERIAL NAME": m.material_name,
      "FORM TYPE": m.form_type,
      "PROCESS TYPE": m.process_type,
      "STOCK SIZE": m.stock_size,
      "SOURCE": m.source_type,
      "TOTAL QTY": m.total_stock_qty,
      "WEIGHT (KG)": m.stock_size_kg,
      "EST COST": m.estimated_cost,
      "FINAL COST": m.final_cost,
      "VENDOR": m.received_vendor_name,
    }));

    const materialsWs = XLSX.utils.json_to_sheet(materialsData);
    XLSX.utils.book_append_sheet(wb, materialsWs, "Materials");

    // Parts Sheet - Only required columns
    const partsData = materialsToDownload.flatMap((material, matIndex) =>
      (material.parts || []).map((part, partIndex) => ({
        "SL NO": materialsToDownload.slice(0, matIndex).reduce((sum, m) => sum + (m.parts?.length || 0), 0) + partIndex + 1,
        "PART NUMBER": part.part_number,
        "PART NAME": part.part_name,
        "EXTRACTED MATERIAL": part.extracted_material,
        "EXTRACTED SIZE": part.extracted_size,
        "ASSIGNED MATERIAL": part.assigned_material_name,
        "FORM TYPE": part.assigned_form_type,
        "ASSIGNED DIMENSIONS": part.assigned_dimensions,
        "REQUIRED LENGTH": part.assigned_required_length,
        "STATUS": part.assigned_status,
      }))
    );

    const partsWs = XLSX.utils.json_to_sheet(partsData);
    XLSX.utils.book_append_sheet(wb, partsWs, "Parts");

    const excelFileName = fileName.replace('.pdf', '.xlsx');
    XLSX.writeFile(wb, excelFileName);

    setIsModalVisible(false);
  };

  if (!materials || materials.length === 0) {
    return (
      <Tooltip title="No materials available for export">
        <Button icon={<DownloadOutlined />} size="small" disabled>
          Download Materials
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
        Download Materials
      </Button>

      <Modal
        title="Download Order Materials"
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        footer={null}
        width={500}
        centered
      >
        <div style={{ display: "flex", gap: 12, flexDirection: "column" }}>
          <PDFDownloadLink
            document={<OrderMaterialsPdfDocument materials={materials} orderNumber={orderNumber} selectedMaterial={selectedMaterial} />}
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
        </div>
      </Modal>
    </>
  );
};

export default OrderMaterialsPdfDownload;
