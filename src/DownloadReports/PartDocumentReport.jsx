
import React from 'react';
import { Button, Modal, Space } from 'antd';
import { FilePdfOutlined, FileExcelOutlined } from '@ant-design/icons';
import { PDFDownloadLink, Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import * as XLSX from 'xlsx';

Font.registerHyphenationCallback(word => { 
  // Break long words, especially URLs
  if (word.length > 25) {
    const chunks = [];
    for (let i = 0; i < word.length; i += 25) {
      chunks.push(word.slice(i, i + 25));
    }
    return chunks;
  }
  return [word];
});

const styles = StyleSheet.create({
  page: { paddingTop: 20, paddingBottom: 20, paddingHorizontal: 15, fontSize: 8, fontFamily: 'Helvetica' },
  header: { marginBottom: 12, borderBottomWidth: 2, borderBottomColor: '#1E40AF', paddingBottom: 8, alignItems: 'center' },
  title: { fontSize: 14, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', textAlign: 'center', color: '#1E40AF' },
  subtitle: { fontSize: 9, color: '#6b7280', textAlign: 'center' },
  metaRow: { marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  metaText: { fontSize: 7, color: '#4b5563' },
  sectionTitle: { fontSize: 10, fontWeight: 700, marginTop: 12, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: '#1E40AF', paddingBottom: 3, color: '#1E40AF' },
  table: { display: 'flex', flexDirection: 'column', width: '100%', borderWidth: 1, borderColor: '#000000', marginBottom: 8 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#1E40AF', borderBottomWidth: 1, borderBottomColor: '#000000', alignItems: 'center', minHeight: 20 },
  headerCell: { padding: 4, fontWeight: 'bold', borderRightWidth: 1, borderRightColor: '#FFFFFF', textAlign: 'center', height: '100%', color: '#FFFFFF', fontSize: 8 },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#000000', alignItems: 'flex-start', minHeight: 18 },
  cell: { padding: 3, borderRightWidth: 1, borderRightColor: '#000000', textAlign: 'left', height: '100%', fontSize: 7 },
  cellCenter: { padding: 3, borderRightWidth: 1, borderRightColor: '#000000', textAlign: 'center', height: '100%', fontSize: 7 },
  textCell: { padding: 3, borderRightWidth: 1, borderRightColor: '#000000', textAlign: 'left', height: '100%', fontSize: 7 },
  footer: { position: 'absolute', bottom: 15, left: 15, right: 15, fontSize: 7, color: '#9ca3af', textAlign: 'center' },
});

const PartReportPdfDocument = ({ partData }) => {
  const generatedAt = new Date().toLocaleString();
  const allTools = partData.operations?.flatMap(op => 
    op.tools?.map(t => ({ ...t, opName: op.operation_name })) || []
  ) || [];

  // Helper function to truncate long text for PDF
  const truncateText = (text, maxLength = 200) => {
    if (!text || typeof text !== 'string') return '-';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const TableHeader = ({ headers }) => (
    <View style={styles.tableHeader}>
      {headers.map((header, i) => (
        <View key={i} style={[styles.headerCell, { width: header.width }]}>
          <Text>{header.label}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>CMF DIGITALIZATION - CMTI</Text>
          <Text style={styles.subtitle}>Part Document & Process Plan Report</Text>
          <View style={styles.metaRow}>
            <View>
              <Text style={styles.metaText}>Part Name: {partData.partName || '-'}</Text>
              <Text style={styles.metaText}>Part Number: {partData.partNumber || '-'}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.metaText}>Total Operations: {partData.operations?.length || 0}</Text>
              <Text style={styles.metaText}>Generated on: {generatedAt}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Raw Materials</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, { width: 200 }]}>Material Name</Text>
            <Text style={[styles.headerCell, { flex: 1 }]}>Status</Text>
          </View>
          {partData.rawMaterials?.map((item, i) => (
            <View key={i} style={styles.row}>
              <Text style={[styles.cell, { width: 200 }]}>{item.material_name || '-'}</Text>
              <Text style={[styles.cell, { flex: 1 }]}>{item.material_status || '-'}</Text>
            </View>
          ))}
          {(!partData.rawMaterials || partData.rawMaterials.length === 0) && (
            <View style={styles.row}>
              <Text style={[styles.cell, { width: '100%' }]}>No raw materials linked</Text>
            </View>
          )}
        </View>

        <Text style={styles.sectionTitle}>Process Plan (Operations)</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, { width: 30 }]}>Op #</Text>
            <Text style={[styles.headerCell, { width: 70 }]}>Operation Name</Text>
            <Text style={[styles.headerCell, { width: 50 }]}>Setup Time</Text>
            <Text style={[styles.headerCell, { width: 50 }]}>Cycle Time</Text>
            <Text style={[styles.headerCell, { width: 60 }]}>workcenter</Text>
            <Text style={[styles.headerCell, { width: 60 }]}>Machine</Text>
            <Text style={[styles.headerCell, { width: 50 }]}>Op Type</Text>
            <Text style={[styles.headerCell, { width: 50 }]}>From Date</Text>
            <Text style={[styles.headerCell, { width: 50 }]}>To Date</Text>
            <Text style={[styles.headerCell, { width: 100 }]}>Work Instructions</Text>
            <Text style={[styles.headerCell, { flex: 1 }]}>Notes</Text>
          </View>
          {partData.operations?.map((item, i) => (
            <View key={i} style={styles.row}>
              <Text style={[styles.cellCenter, { width: 30 }]}>{item.operation_number}</Text>
              <Text style={[styles.cell, { width: 70 }]}>{item.operation_name}</Text>
              <Text style={[styles.cellCenter, { width: 50 }]}>{item.setup_time}</Text>
              <Text style={[styles.cellCenter, { width: 50 }]}>{item.cycle_time}</Text>
              <Text style={[styles.cell, { width: 60 }]}>{item.work_center_name || item.workcenter_id || '-'}</Text>
              <Text style={[styles.cell, { width: 60 }]}>{item.machine_name || item.machine_id || '-'}</Text>
              <Text style={[styles.cell, { width: 50 }]}>{item.part_type_name || 'IN-House'}</Text>
              <Text style={[styles.cellCenter, { width: 50 }]}>{item.from_date ? new Date(item.from_date).toLocaleDateString() : '-'}</Text>
              <Text style={[styles.cellCenter, { width: 50 }]}>{item.to_date ? new Date(item.to_date).toLocaleDateString() : '-'}</Text>
              <Text style={[styles.textCell, { width: 100 }]}>{truncateText(item.work_instructions)}</Text>
              <Text style={[styles.textCell, { flex: 1 }]}>{truncateText(item.notes)}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Part Documents</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, { width: 150 }]}>Document Name</Text>
            <Text style={[styles.headerCell, { width: 80 }]}>Type</Text>
            <Text style={[styles.headerCell, { width: 50 }]}>Version</Text>
            <Text style={[styles.headerCell, { flex: 1 }]}>Document URL</Text>
          </View>
          {partData.documents?.map((item, i) => (
            <View key={i} style={styles.row}>
              <Text style={[styles.cell, { width: 150 }]}>{item.document_name}</Text>
              <Text style={[styles.cell, { width: 80 }]}>{item.document_type}</Text>
              <Text style={[styles.cellCenter, { width: 50 }]}>{item.document_version}</Text>
              <Text style={[styles.textCell, { flex: 1 }]}>{item.document_url || '-'}</Text>
            </View>
          ))}
        </View>
        
        <Text style={styles.sectionTitle}>Tools Required</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, { width: 80 }]}>Op Name</Text>
            <Text style={[styles.headerCell, { width: 120 }]}>Tool Name</Text>
            <Text style={[styles.headerCell, { width: 60 }]}>Code</Text>
            <Text style={[styles.headerCell, { width: 60 }]}>Make</Text>
            <Text style={[styles.headerCell, { flex: 1 }]}>Specification</Text>
          </View>
          {allTools.map((item, i) => {
            const toolInfo = item.tool || item;
            return (
              <View key={i} style={styles.row}>
                <Text style={[styles.cell, { width: 80 }]}>{item.opName}</Text>
                <Text style={[styles.cell, { width: 120 }]}>{toolInfo.item_description || '-'}</Text>
                <Text style={[styles.cell, { width: 60 }]}>{toolInfo.identification_code || '-'}</Text>
                <Text style={[styles.cell, { width: 60 }]}>{toolInfo.make || '-'}</Text>
                <Text style={[styles.cell, { flex: 1 }]}>{toolInfo.range || '-'}</Text>
              </View>
            );
          })}
        </View>

        <Text style={styles.footer}>Generated by CMF Digitization PDM module</Text>
      </Page>
    </Document>
  );
};

const PartDocumentReport = ({ partData, open, onCancel }) => {
  const hasData = partData && (
    (partData.operations && partData.operations.length > 0) || 
    (partData.documents && partData.documents.length > 0) ||
    (partData.rawMaterials && partData.rawMaterials.length > 0)
  );

  // Normalize line endings so re-uploaded Excel does not contain _x000d_ artifacts
  const normalizeMultiline = (text) => {
    if (!text || typeof text !== 'string') return text || '-';
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  };

  const handleDownloadExcel = () => {
    const wb = XLSX.utils.book_new();

    // Map Operations to clean format
    const mappedOps = (partData.operations || []).map(op => ({
      "Op #": op.operation_number,
      "Operation Name": op.operation_name,
      "Setup Time": op.setup_time,
      "Cycle Time": op.cycle_time,
      "workcenter": op.work_center_name || op.workcenter_name || op.workcenter_id || '-',
      "Machine": op.machine_name || op.machine_id || '-',
      "Op Type": op.part_type_name || 'IN-House',
      "From Date": op.from_date ? new Date(op.from_date).toLocaleDateString() : '-',
      "To Date": op.to_date ? new Date(op.to_date).toLocaleDateString() : '-',
      "Work Instructions": normalizeMultiline(op.work_instructions),
      "Notes": normalizeMultiline(op.notes)
    }));

    // Map Documents to clean format
    const mappedDocs = (partData.documents || []).map(doc => ({
      "Document Name": doc.document_name,
      "Document Type": doc.document_type,
      "Version": doc.document_version || 'v1.0',
      "Document URL": doc.document_url || '-'
    }));

    // Map Tools to clean format
    const mappedTools = partData.operations?.flatMap(op => 
      op.tools?.map(t => {
        const toolInfo = t.tool || t;
        return {
          "Operation": op.operation_name,
          "Tool Name": toolInfo.item_description || '-',
          "Code": toolInfo.identification_code || '-',
          "Make": toolInfo.make || '-',
          "Specification": toolInfo.range || '-',
        };
      }) || []
    ) || [];

    // Map Raw Materials to clean format
    const mappedRawMaterials = (partData.rawMaterials || []).map(rm => ({
      "Material Name": rm.material_name || '-',
      "Status": rm.material_status || '-'
    }));

    const addSheet = (data, sheetName) => {
      const ws = XLSX.utils.json_to_sheet(data);
      
      // Auto-size columns based on content length
      const range = XLSX.utils.decode_range(ws['!ref']);
      const colWidths = [];
      
      // Calculate maximum width for each column
      for (let C = range.s.c; C <= range.e.c; C++) {
        let maxWidth = 10; // minimum width
        const header = XLSX.utils.encode_cell({ r: range.s.r, c: C });
        const headerText = ws[header]?.v || '';
        maxWidth = Math.max(maxWidth, String(headerText).length + 2);
        
        for (let R = range.s.r + 1; R <= range.e.r; R++) {
          const cell = XLSX.utils.encode_cell({ r: R, c: C });
          const cellText = ws[cell]?.v || '';
          maxWidth = Math.max(maxWidth, String(cellText).length + 2);
        }
        
        // Set reasonable maximum width to prevent extremely wide columns
        colWidths.push({ wch: Math.min(maxWidth, 60) });
      }
      
      ws['!cols'] = colWidths;
      
      // Apply text wrapping to Work Instructions and Notes columns for Process Plan
      if (sheetName === 'Process Plan') {
        for (let R = range.s.r; R <= range.e.r; R++) {
          // Work Instructions column (index 9)
          const workInstrCell = XLSX.utils.encode_cell({ r: R, c: 9 });
          if (ws[workInstrCell]) {
            ws[workInstrCell].s = { alignment: { wrapText: true, vertical: 'top' } };
          }
          // Notes column (index 10)
          const notesCell = XLSX.utils.encode_cell({ r: R, c: 10 });
          if (ws[notesCell]) {
            ws[notesCell].s = { alignment: { wrapText: true, vertical: 'top' } };
          }
        }
      }
      
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    };

    // Add a summary sheet with part info
    const summaryData = [
      { "Field": "Part Name", "Value": partData.partName || '-' },
      { "Field": "Part Number", "Value": partData.partNumber || '-' },
      { "Field": "Generated At", "Value": new Date().toLocaleString() }
    ];
    addSheet(summaryData, 'Summary');

    addSheet(mappedRawMaterials, 'Raw Materials');
    addSheet(mappedOps, 'Process Plan');
    addSheet(mappedDocs, 'Part Documents');
    addSheet(mappedTools, 'Tools Required');

    XLSX.writeFile(wb, `Part_Report_${partData.partNumber || 'Export'}.xlsx`);
    onCancel();
  };
  
  const handlePdfDownload = () => {
    // Close modal after a very short delay to allow the download to start reliably
    setTimeout(() => {
      onCancel();
    }, 100);
  }

  return (
      <Modal
        title="Download Part Report"
        open={open}
        onCancel={onCancel}
        footer={null}
        centered
        width={400}
      >
        <div style={{ padding: '20px 0' }}>
          {hasData ? (
            <>
              <p style={{ marginBottom: '20px', textAlign: 'center', color: '#666' }}>Choose your preferred download format:</p>
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <PDFDownloadLink
                  document={<PartReportPdfDocument partData={partData} />}
                  fileName={`Part_Report_${partData.partNumber || 'Export'}.pdf`}
                  style={{ textDecoration: 'none', width: '100%' }}
                >
                  {({ loading }) => (
                    <Button icon={<FilePdfOutlined />} size="large" style={{ width: '100%', height: '50px' }} type="default" onClick={handlePdfDownload}>
                      {loading ? 'Preparing PDF...' : 'Download PDF'}
                    </Button>
                  )}
                </PDFDownloadLink>
                <Button icon={<FileExcelOutlined />} size="large" style={{ width: '100%', height: '50px' }} type="default" onClick={handleDownloadExcel}>
                  Download Excel
                </Button>
              </Space>
            </>
          ) : (
            <div style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
              No data available to generate report.
            </div>
          )}
        </div>
      </Modal>
  );
};

export default PartDocumentReport;
