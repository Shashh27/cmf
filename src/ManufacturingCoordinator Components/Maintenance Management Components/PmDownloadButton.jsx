import React, { useState } from 'react';
import { Button, Modal, Space, message } from 'antd';
import { DownloadOutlined, FilePdfOutlined, FileExcelOutlined } from '@ant-design/icons';
import { downloadPmExcel, downloadPmPdf } from './pmReportDownload';
import { btnSharp } from './pmUtils';

const PmDownloadButton = ({ getReportConfig, disabled = false }) => {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = async (format) => {
    try {
      setExporting(true);
      const config = typeof getReportConfig === 'function' ? await getReportConfig() : getReportConfig;
      const hasRows = config?.sections?.some((s) => s.rows?.length);
      if (!hasRows) {
        message.warning('No data to export');
        return;
      }
      if (format === 'excel') {
        await downloadPmExcel(config);
      } else {
        downloadPmPdf(config);
      }
      message.success(`Report downloaded as ${format === 'excel' ? 'Excel' : 'PDF'}`);
      setOpen(false);
    } catch (e) {
      message.error(e.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Button
        icon={<DownloadOutlined />}
        style={btnSharp}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        Download
      </Button>
      <Modal
        title="Download Report"
        open={open}
        onCancel={() => !exporting && setOpen(false)}
        footer={null}
        destroyOnClose
        width={400}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Button
            block
            size="large"
            icon={<FilePdfOutlined />}
            loading={exporting}
            onClick={() => handleExport('pdf')}
          >
            Download PDF
          </Button>
          <Button
            block
            size="large"
            icon={<FileExcelOutlined />}
            loading={exporting}
            onClick={() => handleExport('excel')}
          >
            Download Excel
          </Button>
        </Space>
      </Modal>
    </>
  );
};

export default PmDownloadButton;
