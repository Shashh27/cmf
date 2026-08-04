import React, { useMemo, useRef, useState } from 'react';
import { Typography, Button, Table, Space, Row, Col, Card, Empty, message } from 'antd';
import { PrinterOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useLocation } from 'react-router-dom';
import moment from 'moment';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import cmtiImage from '../assets/cmtis.png';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';

const { Title, Text } = Typography;

const fmtKwh = (v) => Number(v || 0).toFixed(2);
const fmtInr = (v) => `₹${Number(v || 0).toFixed(2)}`;
/** jsPDF Helvetica cannot render ₹ — use ASCII for PDF cells */
const fmtPdfInr = (v) => `Rs. ${Number(v || 0).toFixed(2)}`;

const Report = ({
  date: propDate,
  machineData: propMachineData,
  returnPath: propReturnPath,
  fromDate: propFromDate,
  toDate: propToDate,
}) => {
  const location = useLocation();
  const state = location.state || {};

  const machineData = state.machineData ?? propMachineData ?? [];
  const fromDate = state.fromDate ?? propFromDate;
  const toDate = state.toDate ?? propToDate;
  const date = state.date ?? propDate;

  const chartCaptureRef = useRef(null);
  const [exporting, setExporting] = useState(false);

  const rows = useMemo(
    () =>
      [...(machineData || [])]
        .map((m, idx) => ({
          key: m.id ?? m.machine_id ?? idx,
          machine_name: m.machine_name || `Machine ${m.id ?? idx + 1}`,
          first_shift: Number(m.first_shift || 0),
          second_shift: Number(m.second_shift || 0),
          third_shift: Number(m.third_shift || 0),
          energy: Number(m.energy || m.total_energy || 0),
          cost: Number(m.cost || 0),
        }))
        .sort((a, b) => b.energy - a.energy),
    [machineData]
  );

  const showThirdShift = rows.some((r) => r.third_shift > 0);

  const totals = useMemo(() => {
    const first = rows.reduce((s, r) => s + r.first_shift, 0);
    const second = rows.reduce((s, r) => s + r.second_shift, 0);
    const third = rows.reduce((s, r) => s + r.third_shift, 0);
    const energy = rows.reduce((s, r) => s + r.energy, 0);
    const cost = rows.reduce((s, r) => s + r.cost, 0);
    return { first, second, third, energy, cost };
  }, [rows]);

  const periodLabel = useMemo(() => {
    if (fromDate && toDate && fromDate !== toDate) {
      return `${moment(fromDate).format('DD MMM YYYY')} – ${moment(toDate).format('DD MMM YYYY')}`;
    }
    const d = fromDate || toDate || date;
    return d ? moment(d).format('DD MMM YYYY') : moment().format('DD MMM YYYY');
  }, [fromDate, toDate, date]);

  const generatedAt = moment().format('DD MMM YYYY, hh:mm A');

  const columns = [
    {
      title: '#',
      key: 'idx',
      width: 50,
      align: 'center',
      render: (_, __, index) => index + 1,
    },
    {
      title: 'Machine',
      dataIndex: 'machine_name',
      key: 'machine_name',
      ellipsis: true,
    },
    {
      title: 'Shift 1 (kWh)',
      dataIndex: 'first_shift',
      key: 'first_shift',
      align: 'right',
      render: (v) => fmtKwh(v),
    },
    {
      title: 'Shift 2 (kWh)',
      dataIndex: 'second_shift',
      key: 'second_shift',
      align: 'right',
      render: (v) => fmtKwh(v),
    },
    ...(showThirdShift
      ? [
          {
            title: 'Shift 3 (kWh)',
            dataIndex: 'third_shift',
            key: 'third_shift',
            align: 'right',
            render: (v) => fmtKwh(v),
          },
        ]
      : []),
    {
      title: 'Total (kWh)',
      dataIndex: 'energy',
      key: 'energy',
      align: 'right',
      render: (v) => <Text strong>{fmtKwh(v)}</Text>,
    },
    {
      title: '% of Total',
      key: 'pct',
      align: 'right',
      width: 90,
      render: (_, row) =>
        totals.energy > 0 ? `${((row.energy / totals.energy) * 100).toFixed(1)}%` : '0%',
    },
    {
      title: 'Cost (₹)',
      dataIndex: 'cost',
      key: 'cost',
      align: 'right',
      render: (v) => fmtInr(v),
    },
  ];

  const chartOptions = useMemo(() => {
    const chartRows = rows;
    const series = [
      {
        name: 'Shift 1',
        data: chartRows.map((r) => r.first_shift),
        color: '#1677ff',
      },
      {
        name: 'Shift 2',
        data: chartRows.map((r) => r.second_shift),
        color: '#13c2c2',
      },
    ];
    if (showThirdShift) {
      series.push({
        name: 'Shift 3',
        data: chartRows.map((r) => r.third_shift),
        color: '#faad14',
      });
    }

    return {
      chart: {
        type: 'bar',
        height: Math.max(280, Math.min(chartRows.length * 28 + 90, 520)),
        backgroundColor: '#ffffff',
        spacing: [8, 12, 8, 8],
        style: { fontFamily: 'Segoe UI, Arial, sans-serif' },
      },
      title: {
        text: 'Energy by Machine & Shift',
        align: 'left',
        margin: 8,
        style: { fontSize: '13px', fontWeight: '600', color: '#1f1f1f' },
      },
      subtitle: {
        text: periodLabel,
        align: 'left',
        style: { fontSize: '11px', color: '#8c8c8c' },
      },
      xAxis: {
        categories: chartRows.map((r) => r.machine_name),
        title: { text: null },
        labels: { style: { fontSize: '11px', color: '#595959' } },
        lineColor: '#f0f0f0',
        tickLength: 0,
      },
      yAxis: {
        min: 0,
        title: { text: 'kWh', style: { color: '#8c8c8c' } },
        gridLineColor: '#f5f5f5',
        stackLabels: {
          enabled: true,
          style: { fontWeight: '600', color: '#595959', textOutline: 'none', fontSize: '10px' },
          formatter() {
            return this.total > 0 ? this.total.toFixed(1) : '';
          },
        },
      },
      legend: {
        align: 'right',
        verticalAlign: 'top',
        layout: 'horizontal',
        itemStyle: { fontWeight: '500', fontSize: '12px' },
      },
      tooltip: {
        shared: true,
        headerFormat: '<b>{point.key}</b><br/>',
        pointFormat: '{series.name}: <b>{point.y:.2f} kWh</b><br/>',
      },
      plotOptions: {
        series: {
          stacking: 'normal',
          borderWidth: 0,
          dataLabels: { enabled: false },
        },
        bar: {
          borderRadius: 2,
          pointPadding: 0.08,
          groupPadding: 0.12,
        },
      },
      credits: { enabled: false },
      exporting: { enabled: false },
      series,
    };
  }, [rows, showThirdShift, periodLabel]);

  const handleExportPdf = async () => {
    if (!rows.length) {
      message.warning('No machine data to export');
      return;
    }

    setExporting(true);
    try {
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 12;
      const usable = pageW - margin * 2;

      pdf.setFillColor(22, 119, 255);
      pdf.rect(margin, 8, usable, 10, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.text('CMF ENERGY CONSUMPTION REPORT', pageW / 2, 14.5, { align: 'center' });

      // Line 1: period left, generated right — never overlap
      pdf.setTextColor(70, 70, 70);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.text('Period: ' + periodLabel, margin, 23);
      pdf.text('Generated: ' + generatedAt, pageW - margin, 23, { align: 'right' });

      // Line 2: KPIs only
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      const kpiParts = [
        'Machines: ' + rows.length,
        'Total: ' + fmtKwh(totals.energy) + ' kWh',
        'Shift 1: ' + fmtKwh(totals.first),
        'Shift 2: ' + fmtKwh(totals.second),
      ];
      if (showThirdShift) kpiParts.push('Shift 3: ' + fmtKwh(totals.third));
      kpiParts.push('Cost: ' + fmtPdfInr(totals.cost));
      pdf.text(kpiParts.join('   |   '), pageW / 2, 28.5, { align: 'center', maxWidth: usable });

      pdf.setDrawColor(22, 119, 255);
      pdf.setLineWidth(0.35);
      pdf.line(margin, 31, pageW - margin, 31);

      const headRow = showThirdShift
        ? ['#', 'Machine', 'Shift 1', 'Shift 2', 'Shift 3', 'Total', '%', 'Cost (Rs.)']
        : ['#', 'Machine', 'Shift 1', 'Shift 2', 'Total', '%', 'Cost (Rs.)'];

      const body = rows.map((r, i) => {
        const pct = totals.energy > 0 ? ((r.energy / totals.energy) * 100).toFixed(1) + '%' : '0%';
        const row = [String(i + 1), r.machine_name, fmtKwh(r.first_shift), fmtKwh(r.second_shift)];
        if (showThirdShift) row.push(fmtKwh(r.third_shift));
        row.push(fmtKwh(r.energy), pct, fmtPdfInr(r.cost));
        return row;
      });

      const totalRow = showThirdShift
        ? ['', 'TOTAL', fmtKwh(totals.first), fmtKwh(totals.second), fmtKwh(totals.third), fmtKwh(totals.energy), '100%', fmtPdfInr(totals.cost)]
        : ['', 'TOTAL', fmtKwh(totals.first), fmtKwh(totals.second), fmtKwh(totals.energy), '100%', fmtPdfInr(totals.cost)];

      // Content-based widths, then scale to fit page exactly (no right-edge clip)
      const padMm = 3.5;
      const measure = (text, bold) => {
        pdf.setFont('helvetica', bold ? 'bold' : 'normal');
        pdf.setFontSize(8);
        return pdf.getTextWidth(String(text == null ? '' : text)) + padMm;
      };

      const colCount = headRow.length;
      const widths = Array.from({ length: colCount }, () => 0);
      const sampleRows = [headRow].concat(body, [totalRow]);
      sampleRows.forEach((row, rowIdx) => {
        const bold = rowIdx === 0 || rowIdx === sampleRows.length - 1;
        row.forEach((cell, colIdx) => {
          widths[colIdx] = Math.max(widths[colIdx], measure(cell, bold));
        });
      });

      const mins = showThirdShift
        ? [8, 36, 22, 22, 22, 22, 12, 28]
        : [8, 40, 22, 22, 22, 12, 28];
      for (let i = 0; i < colCount; i += 1) {
        widths[i] = Math.max(widths[i], mins[i]);
      }

      let totalW = widths.reduce((a, b) => a + b, 0);
      const scale = usable / totalW;
      for (let i = 0; i < colCount; i += 1) {
        widths[i] = Math.floor(widths[i] * scale * 100) / 100;
      }
      totalW = widths.reduce((a, b) => a + b, 0);
      widths[1] += usable - totalW;

      const columnStyles = {};
      widths.forEach((w, i) => {
        columnStyles[i] = {
          cellWidth: w,
          halign: i === 0 ? 'center' : i === 1 ? 'left' : 'right',
          overflow: 'ellipsize',
        };
      });

      autoTable(pdf, {
        startY: 33,
        head: [headRow],
        body: body.concat([totalRow]),
        theme: 'grid',
        tableWidth: usable,
        margin: { left: margin, right: margin, bottom: 12 },
        styles: {
          font: 'helvetica',
          fontSize: 8,
          cellPadding: { top: 2.2, bottom: 2.2, left: 1.8, right: 1.8 },
          valign: 'middle',
          overflow: 'ellipsize',
          lineColor: [200, 200, 200],
          lineWidth: 0.2,
          textColor: [30, 30, 30],
          minCellHeight: 6,
        },
        headStyles: {
          fillColor: [22, 119, 255],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8,
          halign: 'center',
          valign: 'middle',
          cellPadding: { top: 2.5, bottom: 2.5, left: 1.8, right: 1.8 },
        },
        alternateRowStyles: { fillColor: [245, 248, 255] },
        columnStyles: columnStyles,
        didParseCell(data) {
          if (data.section === 'body' && data.row.index === body.length) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [232, 232, 232];
          }
          if (data.section === 'head') data.cell.styles.halign = 'center';
        },
        didDrawPage(data) {
          pdf.setFontSize(7);
          pdf.setTextColor(140, 140, 140);
          pdf.setFont('helvetica', 'normal');
          pdf.text('CMF Digitization · Energy Monitoring  |  Values in kWh / Rs.', margin, pageH - 6);
          pdf.text('Page ' + data.pageNumber, pageW - margin, pageH - 6, { align: 'right' });
        },
      });

      if (chartCaptureRef.current) {
        const canvas = await html2canvas(chartCaptureRef.current, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
        });
        const img = canvas.toDataURL('image/jpeg', 0.92);
        const imgW = usable;
        const imgH = (canvas.height * imgW) / canvas.width;
        const maxH = pageH - 34;

        pdf.addPage('a4', 'landscape');
        pdf.setFillColor(22, 119, 255);
        pdf.rect(margin, 8, usable, 10, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(12);
        pdf.text('ENERGY BY MACHINE & SHIFT', pageW / 2, 14.5, { align: 'center' });
        pdf.setTextColor(70, 70, 70);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.text('Period: ' + periodLabel, margin, 24);
        pdf.text('Generated: ' + generatedAt, pageW - margin, 24, { align: 'right' });
        pdf.setDrawColor(22, 119, 255);
        pdf.setLineWidth(0.35);
        pdf.line(margin, 26.5, pageW - margin, 26.5);
        pdf.addImage(img, 'JPEG', margin, 28.5, imgW, Math.min(imgH, maxH));
        pdf.setFontSize(7);
        pdf.setTextColor(140, 140, 140);
        pdf.text('CMF Digitization · Energy Monitoring', margin, pageH - 6);
        pdf.text('Page 2', pageW - margin, pageH - 6, { align: 'right' });
      }

      const fileDate = String(fromDate || date || moment().format('YYYY-MM-DD')).replace(/[/\\:]/g, '-');
      pdf.save('CMF-Energy-Report-' + fileDate + '.pdf');
      message.success('PDF downloaded');
    } catch (err) {
      console.error(err);
      message.error('Failed to generate PDF');
    } finally {
      setExporting(false);
    }
  };

  const kpiCards = [
    { label: 'Total Energy', value: fmtKwh(totals.energy) + ' kWh', color: '#1677ff' },
    { label: 'Shift 1', value: fmtKwh(totals.first) + ' kWh', color: '#1677ff' },
    { label: 'Shift 2', value: fmtKwh(totals.second) + ' kWh', color: '#13c2c2' },
    { label: 'Total Cost', value: fmtInr(totals.cost), color: '#52c41a' },
  ];

  return (
    <div style={{ padding: 12, background: '#f5f5f5', minHeight: '100%' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 12,
          background: '#fff',
          padding: '10px 14px',
          borderRadius: 6,
          border: '1px solid #f0f0f0',
        }}
      >
        <div>
          <Title level={4} style={{ margin: 0 }}>
            Energy Consumption Report
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {periodLabel}
          </Text>
        </div>
        <Button
          type="primary"
          icon={<PrinterOutlined />}
          loading={exporting}
          onClick={handleExportPdf}
          disabled={!rows.length}
        >
          Export PDF
        </Button>
      </div>

      {!rows.length ? (
        <Card>
          <Empty description="No machine energy data for the selected period" />
        </Card>
      ) : (
        <div
          style={{
            background: '#fff',
            borderRadius: 8,
            border: '1px solid #f0f0f0',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 16,
              padding: '16px 20px',
              borderBottom: '1px solid #f0f0f0',
              background: 'linear-gradient(180deg, #fafafa 0%, #fff 100%)',
              flexWrap: 'wrap',
            }}
          >
            <Space align="center" size={12}>
              <img src={cmtiImage} alt="CMTI" style={{ height: 44 }} />
              <div>
                <Text strong style={{ display: 'block', fontSize: 16 }}>
                  CMF Digitization
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Energy Monitoring System · CMTI Bengaluru
                </Text>
              </div>
            </Space>
            <div style={{ textAlign: 'right' }}>
              <Text strong style={{ display: 'block' }}>
                Report Period
              </Text>
              <Text style={{ display: 'block' }}>{periodLabel}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Generated {generatedAt}
              </Text>
            </div>
          </div>

          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
            <Row gutter={[12, 12]}>
              {kpiCards.map((kpi) => (
                <Col xs={12} sm={12} md={6} key={kpi.label}>
                  <div
                    style={{
                      padding: '12px 14px',
                      borderRadius: 8,
                      border: '1px solid #f0f0f0',
                      borderLeft: '3px solid ' + kpi.color,
                      background: '#fafafa',
                      height: '100%',
                    }}
                  >
                    <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                      {kpi.label}
                    </Text>
                    <Text strong style={{ fontSize: 18, color: '#1f1f1f' }}>
                      {kpi.value}
                    </Text>
                  </div>
                </Col>
              ))}
            </Row>
          </div>

          <div style={{ padding: '12px 16px' }}>
            <Space style={{ marginBottom: 12 }}>
              <ThunderboltOutlined style={{ color: '#1677ff' }} />
              <Text strong>Machine-wise Energy Breakdown</Text>
              <Text type="secondary">({rows.length} machines)</Text>
            </Space>
            <Table
              columns={columns}
              dataSource={rows}
              pagination={false}
              size="small"
              bordered
              scroll={{ x: true }}
              summary={() => (
                <Table.Summary.Row style={{ background: '#fafafa' }}>
                  <Table.Summary.Cell index={0} />
                  <Table.Summary.Cell index={1}>
                    <Text strong>Total</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="right">
                    <Text strong>{fmtKwh(totals.first)}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right">
                    <Text strong>{fmtKwh(totals.second)}</Text>
                  </Table.Summary.Cell>
                  {showThirdShift && (
                    <Table.Summary.Cell index={4} align="right">
                      <Text strong>{fmtKwh(totals.third)}</Text>
                    </Table.Summary.Cell>
                  )}
                  <Table.Summary.Cell index={showThirdShift ? 5 : 4} align="right">
                    <Text strong>{fmtKwh(totals.energy)} kWh</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={showThirdShift ? 6 : 5} align="right">
                    <Text strong>100%</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={showThirdShift ? 7 : 6} align="right">
                    <Text strong>{fmtInr(totals.cost)}</Text>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
          </div>

          <div style={{ padding: '0 16px 16px' }}>
            <div
              ref={chartCaptureRef}
              style={{
                border: '1px solid #f0f0f0',
                borderRadius: 6,
                padding: 4,
                background: '#fff',
                lineHeight: 0,
              }}
            >
              <HighchartsReact highcharts={Highcharts} options={chartOptions} />
            </div>
          </div>

          <div
            style={{
              padding: '10px 20px',
              borderTop: '1px solid #f0f0f0',
              display: 'flex',
              justifyContent: 'space-between',
              color: '#8c8c8c',
              fontSize: 12,
            }}
          >
            <span>CMF Energy Monitoring System</span>
            <span>Cost rate applied where provided · Values in kWh / INR</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default Report;
