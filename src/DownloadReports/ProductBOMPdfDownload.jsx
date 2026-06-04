import React, { useMemo, useState } from "react";
import { Button, Tooltip, Spin, Modal, Space } from "antd";
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
import axios from "axios";
import { API_BASE_URL } from "../Config/auth";
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
  sectionTitle: {
    marginTop: 12,
    marginBottom: 4,
    fontSize: 9,
    fontWeight: 700,
    textTransform: "uppercase",
  },
  table: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderStyle: "solid",
    marginBottom: 8,
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
    paddingVertical: 4,
    paddingHorizontal: 3,
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
    paddingVertical: 3,
    paddingHorizontal: 3,
    borderRightWidth: 1,
    borderRightColor: "#f3f4f6",
    borderRightStyle: "solid",
  },
  footer: {
    marginTop: 10,
    fontSize: 7,
    color: "#9ca3af",
    textAlign: "right",
  },
});

const assembliesColumnWidths = {
  slNo: 24,
  number: 75,
  name: 150,
  parent: 150,
};

const partsColumnWidths = {
  slNo: 24,
  number: 75,
  name: 150,
  type: 55,
  parentAssembly: 110,
};

const operationsColumnWidths = {
  slNo: 20,
  partNumber: 50,
  partName: 75,
  opNumber: 25,
  opName: 75,
  type: 45,
  machine: 60,
  setup: 40,
  cycle: 40,
  workcenter: 60,
};

const opNotesColumnWidths = {
  slNo: 20,
  partNumber: 50,
  partName: 75,
  opNumber: 25,
  opName: 75,
  type: 45,
  instructions: 100,
  notes: 100,
};

const documentsColumnWidths = {
  slNo: 24,
  partNumber: 65,
  partName: 120,
  type: 60,
  document: 120,
  version: 40,
  url: 150,
};

const ProductBOMPdfDocument = ({ product, bomExport }) => {
  const generatedAt = new Date().toLocaleString();
  const assemblies = bomExport?.assemblies || [];
  const parts = bomExport?.parts || [];
  const operations = bomExport?.operations || [];
  const documents = bomExport?.documents || [];

  return (
    <Document>
      <Page size="A4" orientation="portrait" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>
            CMF DIGITIZATION - PRODUCT BOM
          </Text>
          <Text style={styles.subtitle}>
            Bill of Materials Report – Product Level
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>
              Product: {product?.product_name || (product?.id != null ? `Product ${product.id}` : "-")}
            </Text>
            <Text style={styles.metaText}>Generated on: {generatedAt}</Text>
          </View>
        </View>

        {assemblies.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>
              Assemblies ({assemblies.length})
            </Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.headerCell, { width: assembliesColumnWidths.slNo }]}>
                  #
                </Text>
                <Text style={[styles.headerCell, { width: assembliesColumnWidths.number }]}>
                  Assembly No
                </Text>
                <Text style={[styles.headerCell, { width: assembliesColumnWidths.name }]}>
                  Assembly Name
                </Text>
                <Text style={[styles.headerCell, { width: assembliesColumnWidths.parent }]}>
                  Parent Assembly
                </Text>
              </View>
              {assemblies.map((asm, index) => (
                <View key={asm.id || index} style={styles.row}>
                  <Text style={[styles.cell, { width: assembliesColumnWidths.slNo }]}>
                    {index + 1}
                  </Text>
                  <Text style={[styles.cell, { width: assembliesColumnWidths.number }]}>
                    {asm.assembly_number || "-"}
                  </Text>
                  <Text style={[styles.cell, { width: assembliesColumnWidths.name }]}>
                    {asm.assembly_name || "-"}
                  </Text>
                  <Text style={[styles.cell, { width: assembliesColumnWidths.parent }]}>
                    {asm.parent_assembly_number
                      ? `${asm.parent_assembly_number} - ${asm.parent_assembly_name || ""}`
                      : "-"}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {parts.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>
              Parts ({parts.length})
            </Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.headerCell, { width: partsColumnWidths.slNo }]}>
                  #
                </Text>
                <Text style={[styles.headerCell, { width: partsColumnWidths.number }]}>
                  Part No
                </Text>
                <Text style={[styles.headerCell, { width: partsColumnWidths.name }]}>
                  Part Name
                </Text>
                <Text style={[styles.headerCell, { width: partsColumnWidths.type }]}>
                  Type
                </Text>
                <Text style={[styles.headerCell, { width: partsColumnWidths.parentAssembly }]}>
                  Parent Assembly
                </Text>
              </View>
              {parts.map((part, index) => (
                <View key={part.id || index} style={styles.row}>
                  <Text style={[styles.cell, { width: partsColumnWidths.slNo }]}>
                    {index + 1}
                  </Text>
                  <Text style={[styles.cell, { width: partsColumnWidths.number }]}>
                    {part.part_number || "-"}
                  </Text>
                  <Text style={[styles.cell, { width: partsColumnWidths.name }]}>
                    {part.part_name || "-"}
                  </Text>
                  <Text style={[styles.cell, { width: partsColumnWidths.type }]}>
                    {part.type_name || "-"}
                  </Text>
                  <Text style={[styles.cell, { width: partsColumnWidths.parentAssembly }]}>
                    {part.parent_assembly_number
                      ? `${part.parent_assembly_number} - ${part.parent_assembly_name || ""}`
                      : "-"}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {operations.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>
              Operations ({operations.length})
            </Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.headerCell, { width: operationsColumnWidths.slNo }]}>
                  #
                </Text>
                <Text style={[styles.headerCell, { width: operationsColumnWidths.partNumber }]}>
                  Part No
                </Text>
                <Text style={[styles.headerCell, { width: operationsColumnWidths.partName }]}>
                  Part Name
                </Text>
                <Text style={[styles.headerCell, { width: operationsColumnWidths.opNumber }]}>
                  OP
                </Text>
                <Text style={[styles.headerCell, { width: operationsColumnWidths.opName }]}>
                  Operation
                </Text>
                <Text style={[styles.headerCell, { width: operationsColumnWidths.type }]}>
                  Type
                </Text>
                <Text style={[styles.headerCell, { width: operationsColumnWidths.machine }]}>
                  Machine
                </Text>
                <Text style={[styles.headerCell, { width: operationsColumnWidths.setup }]}>
                  Setup
                </Text>
                <Text style={[styles.headerCell, { width: operationsColumnWidths.cycle }]}>
                  Cycle
                </Text>
                <Text style={[styles.headerCell, { width: operationsColumnWidths.workcenter }]}>
                  Workcenter
                </Text>
              </View>
              {operations.map((op, index) => (
                <View key={op.id || index} style={styles.row}>
                  <Text style={[styles.cell, { width: operationsColumnWidths.slNo }]}>
                    {index + 1}
                  </Text>
                  <Text style={[styles.cell, { width: operationsColumnWidths.partNumber }]}>
                    {op.part_number || "-"}
                  </Text>
                  <Text style={[styles.cell, { width: operationsColumnWidths.partName }]}>
                    {op.part_name || "-"}
                  </Text>
                  <Text style={[styles.cell, { width: operationsColumnWidths.opNumber }]}>
                    {op.operation_number || "-"}
                  </Text>
                  <Text style={[styles.cell, { width: operationsColumnWidths.opName }]}>
                    {op.operation_name || "-"}
                  </Text>
                  <Text style={[styles.cell, { width: operationsColumnWidths.type }]}>
                    {op.part_type_name || "IN-House"}
                  </Text>
                  <Text style={[styles.cell, { width: operationsColumnWidths.machine }]}>
                    {op.machine_name || op.machine_id || "-"}
                  </Text>
                  <Text style={[styles.cell, { width: operationsColumnWidths.setup }]}>
                    {op.setup_time || "00:00:00"}
                  </Text>
                  <Text style={[styles.cell, { width: operationsColumnWidths.cycle }]}>
                    {op.cycle_time || "00:00:00"}
                  </Text>
                  <Text style={[styles.cell, { width: operationsColumnWidths.workcenter }]}>
                    {op.work_center_name || op.workcenter_id || "-"}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={styles.sectionTitle}>
              Operation Instructions & Notes
            </Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.headerCell, { width: opNotesColumnWidths.slNo }]}>
                  #
                </Text>
                <Text style={[styles.headerCell, { width: opNotesColumnWidths.partNumber }]}>
                  Part No
                </Text>
                <Text style={[styles.headerCell, { width: opNotesColumnWidths.partName }]}>
                  Part Name
                </Text>
                <Text style={[styles.headerCell, { width: opNotesColumnWidths.opNumber }]}>
                  OP
                </Text>
                <Text style={[styles.headerCell, { width: opNotesColumnWidths.opName }]}>
                  Operation
                </Text>
                <Text style={[styles.headerCell, { width: opNotesColumnWidths.type }]}>
                  Type
                </Text>
                <Text style={[styles.headerCell, { width: opNotesColumnWidths.instructions }]}>
                  Instructions
                </Text>
                <Text style={[styles.headerCell, { width: opNotesColumnWidths.notes }]}>
                  Notes
                </Text>
              </View>
              {operations.map((op, index) => (
                <View key={(op.id || index) + "-notes"} style={styles.row}>
                  <Text style={[styles.cell, { width: opNotesColumnWidths.slNo }]}>
                    {index + 1}
                  </Text>
                  <Text style={[styles.cell, { width: opNotesColumnWidths.partNumber }]}>
                    {op.part_number || "-"}
                  </Text>
                  <Text style={[styles.cell, { width: opNotesColumnWidths.partName }]}>
                    {op.part_name || "-"}
                  </Text>
                  <Text style={[styles.cell, { width: opNotesColumnWidths.opNumber }]}>
                    {op.operation_number || "-"}
                  </Text>
                  <Text style={[styles.cell, { width: opNotesColumnWidths.opName }]}>
                    {op.operation_name || "-"}
                  </Text>
                  <Text style={[styles.cell, { width: opNotesColumnWidths.type }]}>
                    {op.part_type_name || "IN-House"}
                  </Text>
                  <Text style={[styles.cell, { width: opNotesColumnWidths.instructions }]}>
                    {op.work_instructions || "-"}
                  </Text>
                  <Text style={[styles.cell, { width: opNotesColumnWidths.notes }]}>
                    {op.notes || "-"}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {documents.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>
              Documents ({documents.length})
            </Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.headerCell, { width: documentsColumnWidths.slNo }]}>
                  #
                </Text>
                <Text style={[styles.headerCell, { width: documentsColumnWidths.partNumber }]}>
                  Part No
                </Text>
                <Text style={[styles.headerCell, { width: documentsColumnWidths.partName }]}>
                  Part Name
                </Text>
                <Text style={[styles.headerCell, { width: documentsColumnWidths.type }]}>
                  Type
                </Text>
                <Text style={[styles.headerCell, { width: documentsColumnWidths.document }]}>
                  Document
                </Text>
                <Text style={[styles.headerCell, { width: documentsColumnWidths.version }]}>
                  Version
                </Text>
                <Text style={[styles.headerCell, { width: documentsColumnWidths.url }]}>
                  URL
                </Text>
              </View>
              {documents.map((doc, index) => (
                <View key={doc.id || index} style={styles.row}>
                  <Text style={[styles.cell, { width: documentsColumnWidths.slNo }]}>
                    {index + 1}
                  </Text>
                  <Text style={[styles.cell, { width: documentsColumnWidths.partNumber }]}>
                    {doc.part_number || "-"}
                  </Text>
                  <Text style={[styles.cell, { width: documentsColumnWidths.partName }]}>
                    {doc.part_name || "-"}
                  </Text>
                  <Text style={[styles.cell, { width: documentsColumnWidths.type }]}>
                    {doc.document_type || "-"}
                  </Text>
                  <Text style={[styles.cell, { width: documentsColumnWidths.document }]}>
                    {doc.document_name || "-"}
                  </Text>
                  <Text style={[styles.cell, { width: documentsColumnWidths.version }]}>
                    {doc.document_version ? (doc.document_version.startsWith('v') ? doc.document_version : `v${doc.document_version}`) : "v1.0"}
                  </Text>
                  <Text style={[styles.cell, { width: documentsColumnWidths.url }]}>
                    {doc.document_url || "-"}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        <Text style={styles.footer}>
          Generated by CMF Digitization Product BOM module
        </Text>
      </Page>
    </Document>
  );
};

const ProductBOMPdfDownload = ({
  product,
  bomExport,
  fileName,
}) => {
  const [loading, setLoading] = useState(false);
  const [fullHierarchicalData, setFullHierarchicalData] = useState(null);
  const [downloadModalVisible, setDownloadModalVisible] = useState(false);

  if (!bomExport) {
    return (
      <Tooltip title="Expand product to load BOM before export">
        <Button icon={<FilePdfOutlined />} size="small" disabled />
      </Tooltip>
    );
  }

  const safeFileName =
    fileName ||
    `product-bom-${product?.product_name || product?.id || "report"}.pdf`;

  const hasContent =
    (bomExport.assemblies && bomExport.assemblies.length > 0) ||
    (bomExport.parts && bomExport.parts.length > 0);

  if (!hasContent) {
    return (
      <Tooltip title="No BOM data available for this product">
        <Button icon={<FilePdfOutlined />} size="small" disabled />
      </Tooltip>
    );
  }

  // Flatten hierarchical data to match PDF component expectations
  const flattenHierarchicalData = (hierarchicalData) => {
    const assemblies = [];
    const parts = [];
    const operations = [];
    const documents = [];

    const processAssembly = (assembly, parentPath = [], parentAssembly = null) => {
      const currentPath = [...parentPath, assembly.assembly.assembly_name];
      
      assemblies.push({
        id: assembly.assembly.id,
        assembly_number: assembly.assembly.assembly_number,
        assembly_name: assembly.assembly.assembly_name,
        parent_assembly_number: parentAssembly?.assembly_number || null,
        parent_assembly_name: parentAssembly?.assembly_name || null,
      });

      // Process parts in this assembly
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

        // Add operations for this part
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

        // Add documents for this part
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

      // Process subassemblies recursively
      assembly.subassemblies.forEach(subAssembly => {
        processAssembly(subAssembly, currentPath, assembly.assembly);
      });
    };

    // Process root assemblies
    hierarchicalData.assemblies.forEach(assembly => {
      processAssembly(assembly);
    });

    // Process direct parts (not in any assembly)
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

      // Add operations for this part
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

      // Add documents for this part
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

  // Excel generation function with multiple sheets
  const generateExcel = (dataForExport) => {
    const { assemblies, parts, operations, documents } = dataForExport;
    const wb = XLSX.utils.book_new();

    // Product Details Sheet
    const productData = [
      { Field: "Product Name", Value: product?.product_name || "N/A" },
      { Field: "Product ID", Value: product?.id || "N/A" },
      { Field: "Generated On", Value: new Date().toLocaleString() },
      { Field: "Total Assemblies", Value: assemblies.length },
      { Field: "Total Parts", Value: parts.length },
      { Field: "Total Operations", Value: operations.length },
      { Field: "Total Documents", Value: documents.length },
    ];
    const productWs = XLSX.utils.json_to_sheet(productData);
    XLSX.utils.book_append_sheet(wb, productWs, "Product Details");

    // Assemblies Sheet
    if (assemblies.length > 0) {
      const assembliesData = assemblies.map((asm, index) => ({
        "S.No": index + 1,
        "Assembly Number": asm.assembly_number || "-",
        "Assembly Name": asm.assembly_name || "-",
        "Parent Assembly": asm.parent_assembly_number
          ? `${asm.parent_assembly_number} - ${asm.parent_assembly_name || ""}`
          : "-",
      }));
      const assembliesWs = XLSX.utils.json_to_sheet(assembliesData);
      assembliesWs['!cols'] = [
        { wch: 6 },
        { wch: 15 },
        { wch: 30 },
        { wch: 30 },
      ];
      XLSX.utils.book_append_sheet(wb, assembliesWs, "Assemblies");
    }

    // Parts Sheet
    if (parts.length > 0) {
      const partsData = parts.map((part, index) => ({
        "S.No": index + 1,
        "Part Number": part.part_number || "-",
        "Part Name": part.part_name || "-",
        "Type": part.type_name || "-",
        "Parent Assembly": part.parent_assembly_number
          ? `${part.parent_assembly_number} - ${part.parent_assembly_name || ""}`
          : "-",
      }));
      const partsWs = XLSX.utils.json_to_sheet(partsData);
      partsWs['!cols'] = [
        { wch: 6 },
        { wch: 15 },
        { wch: 30 },
        { wch: 10 },
        { wch: 30 },
      ];
      XLSX.utils.book_append_sheet(wb, partsWs, "Parts");
    }

    // Operations Sheet
    if (operations.length > 0) {
      const operationsData = operations.map((op, index) => ({
        "S.No": index + 1,
        "Part Number": op.part_number || "-",
        "Part Name": op.part_name || "-",
        "Operation Number": op.operation_number || "-",
        "Operation Name": op.operation_name || "-",
        "Type": op.part_type_name || "IN-House",
        "Machine": op.machine_name || op.machine_id || "-",
        "Setup Time": op.setup_time || "00:00:00",
        "Cycle Time": op.cycle_time || "00:00:00",
        "Workcenter": op.work_center_name || op.workcenter_id || "-",
        "Work Instructions": op.work_instructions || "-",
        "Notes": op.notes || "-",
      }));
      const operationsWs = XLSX.utils.json_to_sheet(operationsData);
      operationsWs['!cols'] = [
        { wch: 6 },
        { wch: 15 },
        { wch: 25 },
        { wch: 8 },
        { wch: 25 },
        { wch: 10 },
        { wch: 15 },
        { wch: 12 },
        { wch: 12 },
        { wch: 15 },
        { wch: 30 },
        { wch: 30 },
      ];
      XLSX.utils.book_append_sheet(wb, operationsWs, "Operations");
    }

    // Documents Sheet
    if (documents.length > 0) {
      const documentsData = documents.map((doc, index) => ({
        "S.No": index + 1,
        "Part Number": doc.part_number || "-",
        "Part Name": doc.part_name || "-",
        "Document Type": doc.document_type || "-",
        "Document Name": doc.document_name || "-",
        "Version": doc.document_version ? (doc.document_version.startsWith('v') ? doc.document_version : `v${doc.document_version}`) : "v1.0",
        "URL": doc.document_url || "-",
      }));
      const documentsWs = XLSX.utils.json_to_sheet(documentsData);
      documentsWs['!cols'] = [
        { wch: 6 },
        { wch: 15 },
        { wch: 25 },
        { wch: 15 },
        { wch: 30 },
        { wch: 10 },
        { wch: 50 },
      ];
      XLSX.utils.book_append_sheet(wb, documentsWs, "Documents");
    }

    // Generate filename and download
    const fileName = `${product?.product_name || "Product"}_BOM_${new Date()
      .toISOString()
      .slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const handlePrepareDownload = async () => {
    setLoading(true);
    try {
      // Fetch full hierarchical data with operations and documents for BOM download
      // This uses the hierarchical endpoint ONLY for this download report
      const response = await axios.get(`${API_BASE_URL}/products/${product.id}/hierarchical`);
      setFullHierarchicalData(response.data);
      setDownloadModalVisible(true);
    } catch (error) {
      console.error("Error fetching full hierarchical data for BOM download:", error);
    } finally {
      setLoading(false);
    }
  };

  // Use full hierarchical data if available (for download), otherwise use lightweight data
  const dataForExport = fullHierarchicalData 
    ? flattenHierarchicalData(fullHierarchicalData)
    : {
        assemblies: bomExport.assemblies || [],
        parts: bomExport.parts || [],
        operations: [],
        documents: [],
      };

  const documentNode = useMemo(
    () => <ProductBOMPdfDocument product={product} bomExport={dataForExport} />,
    [product, dataForExport]
  );

  if (loading) {
    return (
      <Tooltip title="Preparing BOM data...">
        <Button icon={<Spin size="small" />} size="small" disabled />
      </Tooltip>
    );
  }

  // Download modal
  const downloadModal = (
    <Modal
      title="Download BOM Report"
      open={downloadModalVisible}
      onCancel={() => setDownloadModalVisible(false)}
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
            document={documentNode}
            fileName={safeFileName}
            style={{ textDecoration: "none", width: "100%" }}
          >
            {({ loading: pdfLoading }) => (
              <Button
                icon={<FilePdfOutlined />}
                loading={pdfLoading}
                block
                size="large"
                style={{ height: "50px" }}
                type="default"
                onClick={() => setDownloadModalVisible(false)}
              >
                {pdfLoading ? "Preparing PDF..." : "Download PDF"}
              </Button>
            )}
          </PDFDownloadLink>
          <Button
            icon={<FileExcelOutlined />}
            block
            size="large"
            style={{ height: "50px" }}
            type="default"
            onClick={() => {
              generateExcel(dataForExport);
              setDownloadModalVisible(false);
            }}
          >
            Download Excel
          </Button>
        </Space>
      </div>
    </Modal>
  );

  // Show download icon button
  return (
    <>
      {downloadModal}
      <Tooltip title="Download full BOM report">
        <Button
          icon={<DownloadOutlined />}
          size="small"
          type="text"
          style={{ padding: 4, minWidth: 24, height: 24 }}
          onClick={handlePrepareDownload}
        />
      </Tooltip>
    </>
  );
};

export default React.memo(ProductBOMPdfDownload);
