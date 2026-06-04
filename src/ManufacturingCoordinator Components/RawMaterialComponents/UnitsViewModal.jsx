import React, { useState } from "react";
import axios from "axios";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { API_BASE_URL } from "../../Config/auth";
import { Modal, Table, Empty, Tag, App, Button, Dropdown } from "antd";
import { AppstoreOutlined, DownloadOutlined, FilePdfOutlined, FileExcelOutlined } from "@ant-design/icons";

const UnitsViewModal = ({ open, onCancel, stock }) => {
  const { message } = App.useApp();
  const [unitsData, setUnitsData] = useState([]);
  const [unitsLoading, setUnitsLoading] = useState(false);

  React.useEffect(() => {
    if (open && stock) {
      fetchUnits();
    }
  }, [open, stock]);

  const fetchUnits = async () => {
    if (!stock) return;
    setUnitsLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/rawmaterials/stock/${stock.id}/units`);
      const units = response.data || [];
      
      setUnitsData(units);
    } catch (error) {
      console.error('Error fetching units:', error);
      message.error('Failed to fetch units');
      setUnitsData([]);
    } finally {
      setUnitsLoading(false);
    }
  };

  const handleDownloadExcel = () => {
    const dataToExport = unitsData.map(unit => ({
      'Unit ID': unit.id,
      'Status': unit.status,
      'Total Length (mm)': unit.total_length?.toFixed(2) || '-',
      'Remaining Length (mm)': unit.remaining_length?.toFixed(2) || '-',
      'Used Length (mm)': (unit.total_length - unit.remaining_length).toFixed(2),
      'Used For (Parts)': unit.usages?.map(u => `${u.part_number} (${u.used_length?.toFixed(2)}mm)`).join(', ') || '-',
      'Order': stock?.source_order_number || '-',
      'Created At': new Date(unit.created_at).toLocaleString()
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Units');
    XLSX.writeFile(workbook, `units-${stock?.process_type}-${stock?.form_type}.xlsx`);
  };

  const handleDownloadPdf = () => {
    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(16);
    doc.text(`Units for Stock: ${stock?.process_type} - ${stock?.form_type}`, 14, 20);
    
    // Prepare table data
    const tableData = unitsData.map(unit => [
      unit.id,
      unit.status,
      unit.total_length?.toFixed(2) || '-',
      unit.remaining_length?.toFixed(2) || '-',
      (unit.total_length - unit.remaining_length).toFixed(2),
      unit.usages?.map(u => `${u.part_number} (${u.used_length?.toFixed(2)}mm)`).join(', ') || '-',
      stock?.source_order_number || '-',
      new Date(unit.created_at).toLocaleString()
    ]);
    
    // Add table using autoTable
    autoTable(doc, {
      startY: 30,
      head: [['Unit ID', 'Status', 'Total Length (mm)', 'Remaining Length (mm)', 'Used Length (mm)', 'Used For (Parts)', 'Order', 'Created At']],
      body: tableData,
      styles: {
        fontSize: 8,
        cellPadding: 2,
      },
      headStyles: {
        fillColor: [66, 66, 66],
        textColor: 255,
        fontStyle: 'bold',
      },
    });
    
    // Save PDF
    doc.save(`units-${stock?.process_type}-${stock?.form_type}.pdf`);
  };

  const downloadMenuItems = [
    {
      key: 'pdf',
      label: 'Download PDF',
      icon: <FilePdfOutlined />,
      onClick: handleDownloadPdf,
    },
    {
      key: 'excel',
      label: 'Download Excel',
      icon: <FileExcelOutlined />,
      onClick: handleDownloadExcel,
    },
  ];


  return (
    <Modal
      open={open}
      onCancel={onCancel}
      width="95%"
      style={{ maxWidth: 1200 }}
      title={
        <div className="flex items-center gap-2">
          <AppstoreOutlined className="text-blue-500" />
          <span className="font-bold text-gray-800 text-sm sm:text-base">Units for Stock</span>
          <span className="text-xs text-gray-500 font-medium">
            {stock?.process_type} - {stock?.form_type}
          </span>
        </div>
      }
      footer={null}
      className="rounded-xl overflow-hidden"
    >
      {/* Download Section */}
      <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex justify-end">
          <Dropdown menu={{ items: downloadMenuItems }} trigger={['click']}>
            <Button
              size="small"
              type="primary"
              icon={<DownloadOutlined />}
            >
              Download
            </Button>
          </Dropdown>
        </div>
      </div>

      {unitsLoading ? (
        <div className="text-center py-8">Loading units...</div>
      ) : unitsData.length > 0 ? (
        <Table
          dataSource={unitsData}
          rowKey="id"
          size="small"
          bordered
          scroll={{ x: 'max-content' }}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
          }}
          columns={[
            { title: 'Unit ID', dataIndex: 'id', key: 'id' },
            { title: 'Status', dataIndex: 'status', key: 'status', render: (s) => (
              <Tag color={s === 'available' ? 'green' : s === 'partially_used' ? 'orange' : 'red'}>{s}</Tag>
            )},
            { title: 'Total Length (mm)', dataIndex: 'total_length', key: 'total_length', render: (l) => l?.toFixed(2) || '-' },
            { title: 'Remaining Length (mm)', dataIndex: 'remaining_length', key: 'remaining_length', render: (l) => l?.toFixed(2) || '-' },
            { title: 'Used Length (mm)', key: 'used_length', render: (_, record) => {
              const used = record.total_length - record.remaining_length;
              return used > 0 ? used.toFixed(2) : '0.00';
            }},
            { title: 'Used For (Parts)', key: 'used_for', render: (_, record) => {
              if (!record.usages || record.usages.length === 0) return '-';
              const partsWithLength = record.usages
                .map(u => {
                  const partNum = u.part_number;
                  const usedLen = u.used_length;
                  return partNum && usedLen ? `${partNum} (${usedLen.toFixed(2)}mm)` : null;
                })
                .filter(Boolean);
              return partsWithLength.length > 0 ? partsWithLength.join(', ') : '-';
            }},
            { title: 'Order', key: 'order', render: (_, record) => {
              // Use the stock's source_order_number from the selected stock
              return stock?.source_order_number || '-';
            }},
            { title: 'Created At', dataIndex: 'created_at', key: 'created_at', render: (date) => 
              new Date(date).toLocaleString()
            },
          ]}
        />
      ) : (
        <Empty description="No units found for this stock" />
      )}
    </Modal>
  );
};

export default UnitsViewModal;
