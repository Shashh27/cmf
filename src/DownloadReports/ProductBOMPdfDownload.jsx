import React, { useMemo } from "react";
import { Button, Tooltip } from "antd";
import { FilePdfOutlined } from "@ant-design/icons";
import {
  PDFDownloadLink,
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";

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
  document: 150,
  version: 40,
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
    (bomExport.parts && bomExport.parts.length > 0) ||
    (bomExport.operations && bomExport.operations.length > 0) ||
    (bomExport.documents && bomExport.documents.length > 0);

  if (!hasContent) {
    return (
      <Tooltip title="No BOM data available for this product">
        <Button icon={<FilePdfOutlined />} size="small" disabled />
      </Tooltip>
    );
  }

  const documentNode = useMemo(
    () => <ProductBOMPdfDocument product={product} bomExport={bomExport} />,
    [product, bomExport]
  );

  return (
    <PDFDownloadLink
      document={documentNode}
      fileName={safeFileName}
      style={{ textDecoration: "none" }}
    >
      {() => (
        <Tooltip title="Download full BOM report">
          <Button
            icon={<FilePdfOutlined />}
            size="small"
            type="text"
            style={{ padding: 4, minWidth: 24, height: 24 }}
          />
        </Tooltip>
      )}
    </PDFDownloadLink>
  );
};

export default React.memo(ProductBOMPdfDownload);
