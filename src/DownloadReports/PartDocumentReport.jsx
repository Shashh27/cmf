
import React from 'react';
import { Button, Modal, Space } from 'antd';
import { FilePdfOutlined, FileExcelOutlined } from '@ant-design/icons';
import { PDFDownloadLink, Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import * as XLSX from 'xlsx';

Font.registerHyphenationCallback(word => [word]);

const styles = StyleSheet.create({
  page: { paddingTop: 32, paddingBottom: 32, paddingHorizontal: 24, fontSize: 9, fontFamily: 'Helvetica' },
  header: { marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#d1d5db', paddingBottom: 8, alignItems: 'center' },
  title: { fontSize: 16, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', textAlign: 'center' },
  subtitle: { fontSize: 10, color: '#6b7280', textAlign: 'center' },
  metaRow: { marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  metaText: { fontSize: 8, color: '#4b5563' },
  sectionTitle: { fontSize: 12, fontWeight: 700, marginTop: 16, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingBottom: 4 },
  table: { borderWidth: 1, borderColor: '#e5e7eb', width: '100%', marginBottom: 10 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f3f4f6', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', alignItems: 'center', minHeight: 24 },
  headerCell: { padding: 5, fontWeight: 'bold', borderRightWidth: 1, borderRightColor: '#e5e7eb', textAlign: 'center', height: '100%' },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', alignItems: 'flex-start', minHeight: 20 },
  cell: { padding: 4, borderRightWidth: 1, borderRightColor: '#f3f4f6', textAlign: 'left', height: '100%' },
  textCell: { padding: 4, borderRightWidth: 1, borderRightColor: '#f3f4f6', textAlign: 'left', height: '100%', flexWrap: 'wrap' },
  footer: { position: 'absolute', bottom: 32, left: 24, right: 24, fontSize: 7, color: '#9ca3af', textAlign: 'right' },
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
          <Text style={styles.title}>CMF DIGITIZATION - CMTI</Text>
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
          <TableHeader
            headers={[
              { label: 'Material Name', width: '50%' },
              { label: 'Status', width: '50%' },
            ]}
          />
          {partData.rawMaterials?.map((item, i) => (
            <View key={i} style={styles.row}>
              <View style={[styles.cell, { width: '50%' }]}><Text>{item.material_name || '-'}</Text></View>
              <View style={[styles.cell, { width: '50%' }]}><Text>{item.material_status || '-'}</Text></View>
            </View>
          ))}
          {(!partData.rawMaterials || partData.rawMaterials.length === 0) && (
            <View style={styles.row}>
              <View style={[styles.cell, { width: '100%' }]}><Text>No raw materials linked</Text></View>
            </View>
          )}
        </View>

        <Text style={styles.sectionTitle}>Process Plan (Operations)</Text>
        <View style={styles.table}>
          <TableHeader
            headers={[
              { label: 'Op #', width: '5%' },
              { label: 'Operation Name', width: '12%' },
              { label: 'Setup Time', width: '8%' },
              { label: 'Cycle Time', width: '8%' },
              { label: 'Workcenter', width: '10%' },
              { label: 'Machine', width: '10%' },
              { label: 'Op Type', width: '8%' },
              { label: 'From Date', width: '8%' },
              { label: 'To Date', width: '8%' },
              { label: 'Work Instructions', width: '16%' },
              { label: 'Notes', width: '17%' },
            ]}
          />
          {partData.operations?.map((item, i) => (
            <View key={i} style={styles.row}>
              <View style={[styles.cell, { width: '5%' }]}><Text>{item.operation_number}</Text></View>
              <View style={[styles.cell, { width: '12%' }]}><Text>{item.operation_name}</Text></View>
              <View style={[styles.cell, { width: '8%' }]}><Text>{item.setup_time}</Text></View>
              <View style={[styles.cell, { width: '8%' }]}><Text>{item.cycle_time}</Text></View>
              <View style={[styles.cell, { width: '10%' }]}><Text>{item.work_center_name || item.workcenter_id || '-'}</Text></View>
              <View style={[styles.cell, { width: '10%' }]}><Text>{item.machine_name || item.machine_id || '-'}</Text></View>
              <View style={[styles.cell, { width: '8%' }]}><Text>{item.part_type_name || 'IN-House'}</Text></View>
              <View style={[styles.cell, { width: '8%' }]}><Text>{item.from_date ? new Date(item.from_date).toLocaleDateString() : '-'}</Text></View>
              <View style={[styles.cell, { width: '8%' }]}><Text>{item.to_date ? new Date(item.to_date).toLocaleDateString() : '-'}</Text></View>
              <View style={[styles.textCell, { width: '16%' }]}><Text>{truncateText(item.work_instructions)}</Text></View>
              <View style={[styles.textCell, { width: '17%' }]}><Text>{truncateText(item.notes)}</Text></View>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Part Documents</Text>
        <View style={styles.table}>
          <TableHeader
            headers={[
              { label: 'Document Name', width: '35%' },
              { label: 'Type', width: '15%' },
              { label: 'Version', width: '10%' },
              { label: 'Document URL', width: '40%' },
            ]}
          />
          {partData.documents?.map((item, i) => (
            <View key={i} style={styles.row}>
              <View style={[styles.cell, { width: '35%' }]}><Text>{item.document_name}</Text></View>
              <View style={[styles.cell, { width: '15%' }]}><Text>{item.document_type}</Text></View>
              <View style={[styles.cell, { width: '10%' }]}><Text>{item.document_version}</Text></View>
              <View style={[styles.cell, { width: '40%' }]}><Text>{item.document_url || '-'}</Text></View>
            </View>
          ))}
        </View>
        
        <Text style={styles.sectionTitle}>Tools Required</Text>
        <View style={styles.table}>
          <TableHeader
            headers={[
              { label: 'Op Name', width: '20%' },
              { label: 'Tool Name', width: '30%' },
              { label: 'Code', width: '15%' },
              { label: 'Make', width: '15%' },
              { label: 'Specification', width: '20%' },
            ]}
          />
          {allTools.map((item, i) => {
            const toolInfo = item.tool || item;
            return (
              <View key={i} style={styles.row}>
                <View style={[styles.cell, { width: '20%' }]}><Text>{item.opName}</Text></View>
                <View style={[styles.cell, { width: '30%' }]}><Text>{toolInfo.item_description || '-'}</Text></View>
                <View style={[styles.cell, { width: '15%' }]}><Text>{toolInfo.identification_code || '-'}</Text></View>
                <View style={[styles.cell, { width: '15%' }]}><Text>{toolInfo.make || '-'}</Text></View>
                <View style={[styles.cell, { width: '20%' }]}><Text>{toolInfo.range || '-'}</Text></View>
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

  const handleDownloadExcel = () => {
    const wb = XLSX.utils.book_new();

    // Map Operations to clean format
    const mappedOps = (partData.operations || []).map(op => ({
      "Op #": op.operation_number,
      "Operation Name": op.operation_name,
      "Setup Time": op.setup_time,
      "Cycle Time": op.cycle_time,
      "Workcenter": op.work_center_name || op.workcenter_name || op.workcenter_id || '-',
      "Machine": op.machine_name || op.machine_id || '-',
      "Op Type": op.part_type_name || 'IN-House',
      "From Date": op.from_date ? new Date(op.from_date).toLocaleDateString() : '-',
      "To Date": op.to_date ? new Date(op.to_date).toLocaleDateString() : '-',
      "Work Instructions": op.work_instructions || '-',
      "Notes": op.notes || '-'
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
