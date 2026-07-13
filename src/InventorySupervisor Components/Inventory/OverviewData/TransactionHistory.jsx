import React, { useState, useEffect, useMemo } from 'react';
import { Table, Space, Tag, Alert, Input, Button, Row, Col, DatePicker, Select } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { API_BASE_URL } from '../../../Config/auth';
import { getInventoryOverviewTableProps, InventoryOverviewTableStyles } from './inventoryOverviewTable.jsx';
import { disableFutureDates, normalizeDateRange } from './inventoryDateUtils.js';
import InventoryDownloadButton from './InventoryDownloadButton.jsx';
import { buildTransactionHistoryReportConfig } from './inventoryReportDownload.js';

const { RangePicker } = DatePicker;

const TransactionHistory = () => {
  const [allTransactionsLoading, setAllTransactionsLoading] = useState(false);
  const [allTransactionsData, setAllTransactionsData] = useState(null);
  const [error, setError] = useState(null);
  const [searchProjectNumber, setSearchProjectNumber] = useState('');
  const [dateRange, setDateRange] = useState([null, null]);
  const [typeFilter, setTypeFilter] = useState('all');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });

  useEffect(() => {
    fetchAllTransactions();
  }, []);

  useEffect(() => {
    setPagination((prev) => ({ ...prev, current: 1 }));
  }, [searchProjectNumber, dateRange, typeFilter]);

  const handleRefresh = () => {
    fetchAllTransactions();
  };

  const handleClear = () => {
    setDateRange([null, null]);
    setTypeFilter('all');
    setSearchProjectNumber('');
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const fetchAllTransactions = async () => {
    setAllTransactionsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/transaction-history/all`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setAllTransactionsData(data);
    } catch (err) {
      console.error('Failed to fetch all transactions:', err);
      setError('Failed to fetch all transactions: ' + err.message);
      setAllTransactionsData(null);
    } finally {
      setAllTransactionsLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'approved':
      case 'collected':
        return 'success';
      case 'pending':
        return 'processing';
      case 'rejected':
        return 'error';
      default:
        return 'default';
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  };

  const combinedTransactionColumns = [
    {
      title: 'Sl no',
      key: 'sl_no',
      align: 'center',
      render: (_, __, index) => (pagination.current - 1) * pagination.pageSize + index + 1,
    },
    {
      title: 'Tool Name',
      dataIndex: 'tool_name',
      key: 'tool_name',
      render: (text) => text || '-',
    },
    {
      title: 'Tool Range',
      dataIndex: 'tool_range',
      key: 'tool_range',
      render: (text) => text || '-',
    },
    {
      title: 'ID Code',
      dataIndex: 'identification_code',
      key: 'identification_code',
      render: (text) => text || '-',
    },
    {
      title: 'Project',
      key: 'project',
      sortValue: (r) => `${r.project_name || ''} ${r.product_name || ''}`,
      render: (_, record) => {
        const projName = record.project_name || '-';
        const productName = record.product_name || '';
        return (
          <div>
            <div>{projName}</div>
            {productName && <div style={{ fontSize: '12px', color: '#8c8c8c' }}>{productName}</div>}
          </div>
        );
      },
    },
    {
      title: 'Part',
      key: 'part',
      sortValue: (r) => `${r.part_name || ''} ${r.part_number || ''}`,
      render: (_, record) => {
        const partName = record.part_name || '-';
        const partNum = record.part_number || '';
        return (
          <div>
            <div>{partName}</div>
            {partNum && <div style={{ fontSize: '12px', color: '#8c8c8c' }}>{partNum}</div>}
          </div>
        );
      },
    },
    {
      title: 'Operation',
      key: 'operation',
      sortValue: (r) => `${r.operation_name || ''} ${r.operation_number || ''}`,
      render: (_, record) => {
        const opName = record.operation_name || '-';
        const opNum = record.operation_number || '';
        return (
          <div>
            <div>{opName}</div>
            {opNum && <div style={{ fontSize: '12px', color: '#8c8c8c' }}>#{opNum}</div>}
          </div>
        );
      },
    },
    {
      title: 'Requested Qty',
      dataIndex: 'requested_qty',
      key: 'requested_qty',
      align: 'center',
      render: (text) => text || '-',
    },
    {
      title: 'Requested By',
      dataIndex: 'requested_by',
      key: 'requested_by',
      render: (text) => text || '-',
    },
    {
      title: 'Requested At',
      dataIndex: 'request_created_at',
      key: 'request_created_at',
      align: 'center',
      render: (v) => formatDateTime(v),
    },
    {
      title: 'Approved By',
      dataIndex: 'approved_by',
      key: 'approved_by',
      render: (text) => text || '-',
    },
    {
      title: 'Approved At',
      key: 'approved_at',
      align: 'center',
      sortValue: (r) =>
        (r.request_status && r.request_status.toLowerCase() !== 'pending' ? r.request_updated_at : ''),
      render: (_, record) =>
        record.request_status && record.request_status.toLowerCase() !== 'pending'
          ? formatDateTime(record.request_updated_at)
          : '-',
    },
    {
      title: 'Request Status',
      dataIndex: 'request_status',
      key: 'request_status',
      align: 'center',
      render: (status) => (
        <Tag color={getStatusColor(status)}>
          {status?.toUpperCase() || '-'}
        </Tag>
      ),
    },
    {
      title: 'Returned Qty',
      dataIndex: 'returned_qty',
      key: 'returned_qty',
      align: 'center',
      render: (text) => text || '-',
    },
    {
      title: 'Collected By',
      dataIndex: 'collected_by',
      key: 'collected_by',
      render: (text) => text || '-',
    },
    {
      title: 'Returned At',
      dataIndex: 'return_created_at',
      key: 'return_created_at',
      align: 'center',
      render: (v) => (v ? formatDateTime(v) : '-'),
    },
    {
      title: 'Collected At',
      key: 'collected_at',
      align: 'center',
      sortValue: (r) =>
        (r.return_status && r.return_status.toLowerCase() === 'collected' ? r.return_updated_at : ''),
      render: (_, record) =>
        record.return_status && record.return_status.toLowerCase() === 'collected'
          ? formatDateTime(record.return_updated_at)
          : '-',
    },
    {
      title: 'Return Status',
      dataIndex: 'return_status',
      key: 'return_status',
      align: 'center',
      render: (status) => (status ? (
        <Tag color={getStatusColor(status)}>
          {status?.toUpperCase()}
        </Tag>
      ) : (
        <Tag color="default">NO RETURNS</Tag>
      )),
    },
  ];

  const getCombinedTableData = () => {
    if (!allTransactionsData?.transactions) return [];

    let allRows = [];

    allTransactionsData.transactions.forEach((transaction) => {
      const inventoryRequest = transaction.inventory_request;
      const hasReturns = transaction.return_requests && transaction.return_requests.length > 0;

      if (!hasReturns) {
        allRows.push({
          key: `request_${inventoryRequest.id}`,
          tool_name: inventoryRequest.tool_name || '-',
          tool_range: inventoryRequest.tool_range || '-',
          identification_code: inventoryRequest.identification_code || '-',
          project_name: inventoryRequest.project_name || '-',
          product_name: inventoryRequest.product_name || '-',
          part_name: inventoryRequest.part_name || '-',
          part_number: inventoryRequest.part_number || '-',
          operation_name: inventoryRequest.operation_name || '-',
          operation_number: inventoryRequest.operation_number || '-',
          requested_qty: inventoryRequest.quantity || '-',
          requested_by: inventoryRequest.operator_name || '-',
          request_created_at: inventoryRequest.created_at,
          approved_by: inventoryRequest.inventory_supervisor_name || '-',
          request_status: inventoryRequest.status || '-',
          request_updated_at: inventoryRequest.updated_at,
          returned_qty: '-',
          return_created_at: null,
          collected_by: '-',
          return_status: null,
          return_updated_at: null,
        });
      }

      if (hasReturns) {
        transaction.return_requests.forEach((returnRequest) => {
          allRows.push({
            key: `return_${returnRequest.id}`,
            tool_name: inventoryRequest.tool_name || '-',
            tool_range: inventoryRequest.tool_range || '-',
            identification_code: inventoryRequest.identification_code || '-',
            project_name: inventoryRequest.project_name || '-',
            product_name: inventoryRequest.product_name || '-',
            part_name: inventoryRequest.part_name || '-',
            part_number: inventoryRequest.part_number || '-',
            operation_name: inventoryRequest.operation_name || '-',
            operation_number: inventoryRequest.operation_number || '-',
            requested_qty: inventoryRequest.quantity || '-',
            requested_by: inventoryRequest.operator_name || '-',
            request_created_at: inventoryRequest.created_at,
            approved_by: inventoryRequest.inventory_supervisor_name || '-',
            request_status: inventoryRequest.status || '-',
            request_updated_at: inventoryRequest.updated_at,
            returned_qty: returnRequest.returned_qty || '-',
            return_created_at: returnRequest.created_at,
            collected_by: returnRequest.inventory_supervisor_name || '-',
            return_status: returnRequest.status || '-',
            return_updated_at: returnRequest.updated_at,
          });
        });
      }
    });

    if (searchProjectNumber.trim()) {
      const s = searchProjectNumber.toLowerCase();
      allRows = allRows.filter((row) =>
        Object.values(row).some((val) => val != null && String(val).toLowerCase().includes(s)),
      );
    }

    if (typeFilter === 'requests') {
      allRows = allRows.filter((r) => !r.return_status);
    } else if (typeFilter === 'returns') {
      allRows = allRows.filter((r) => !!r.return_status);
    }

    const [start, end] = dateRange || [];
    if (start && end) {
      const s = start.startOf('day').toDate();
      const e = end.endOf('day').toDate();
      allRows = allRows.filter((r) => {
        const d = r.return_status ? r.return_created_at : r.request_created_at;
        if (!d) return false;
        const dt = new Date(d);
        return dt >= s && dt <= e;
      });
    }

    return allRows;
  };

  const tableData = useMemo(
    () => getCombinedTableData(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allTransactionsData, searchProjectNumber, dateRange, typeFilter],
  );

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} sm={12} md={10} lg={8} xl={6}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Date Range</span>
              <RangePicker
                style={{ width: '100%' }}
                value={dateRange}
                onChange={(vals) => setDateRange(normalizeDateRange(vals))}
                disabledDate={disableFutureDates}
                allowClear
                inputReadOnly
              />
            </div>
          </Col>
          <Col xs={24} sm={12} md={6} lg={6} xl={4}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Type</span>
              <Select
                value={typeFilter}
                onChange={setTypeFilter}
                style={{ width: '100%' }}
                options={[
                  { value: 'all', label: 'All Types' },
                  { value: 'requests', label: 'Requests' },
                  { value: 'returns', label: 'Returns' },
                ]}
              />
            </div>
          </Col>
          <Col xs={24} sm={24} md={8} lg={8} xl={8}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Search</span>
              <Input.Search
                placeholder="Search transactions by any field..."
                value={searchProjectNumber}
                onChange={(e) => setSearchProjectNumber(e.target.value)}
                maxLength={20}
                prefix={<SearchOutlined />}
                allowClear
              />
            </div>
          </Col>
          <Col xs="auto">
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>&nbsp;</span>
              <Space>
                <InventoryDownloadButton
                  getReportConfig={() => {
                    const meta = [];
                    if (dateRange?.[0] && dateRange?.[1]) {
                      meta.push(`Date range: ${dateRange[0].format('DD/MM/YYYY')} – ${dateRange[1].format('DD/MM/YYYY')}`);
                    }
                    if (typeFilter !== 'all') meta.push(`Type filter: ${typeFilter}`);
                    if (searchProjectNumber.trim()) meta.push(`Search: ${searchProjectNumber.trim()}`);
                    return buildTransactionHistoryReportConfig(tableData, meta);
                  }}
                  disabled={!tableData.length}
                />
                <Button onClick={handleRefresh}>Refresh</Button>
                <Button onClick={handleClear}>Clear</Button>
              </Space>
            </div>
          </Col>
        </Row>
      </div>

      {error && (
        <Alert
          message="Error"
          description={error}
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
        />
      )}

      <InventoryOverviewTableStyles />
      <div style={{ width: '100%', overflowX: 'auto' }}>
      <Table
        {...getInventoryOverviewTableProps({
          columns: combinedTransactionColumns,
          dataSource: tableData,
          rowKey: 'key',
          loading: allTransactionsLoading,
          compact: true,
          pagination: {
            current: pagination.current,
            pageSize: pagination.pageSize,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
            pageSizeOptions: ['10', '20', '50', '100'],
            onChange: (page, pageSize) => {
              setPagination({
                current: page,
                pageSize: pageSize || pagination.pageSize,
              });
            },
            onShowSizeChange: (current, size) => {
              setPagination({
                current: 1,
                pageSize: size,
              });
            },
          },
        })}
      />
      </div>
    </div>
  );
};

export default TransactionHistory;
