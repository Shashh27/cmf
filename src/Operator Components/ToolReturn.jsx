import React, { useState, useEffect } from 'react';
import { Table, Tag, Input, Button } from 'antd';
import { API_BASE_URL } from '../Config/auth';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';

const ToolReturn = () => {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [filters, setFilters] = useState({});           // ← NEW: track filter state
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
  });

  useEffect(() => {
    fetchReturns();
  }, []);

  const getCurrentOperatorId = () => {
    try {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        const user = JSON.parse(storedUser);
        if (user && user.id != null) return parseInt(user.id);
      }
    } catch (e) {}
    const fallback = localStorage.getItem('operator_id');
    return fallback ? parseInt(fallback) : null;
  };

  const handleTableChange = (newPagination, newFilters) => {
    setPagination(newPagination);
    setFilters(newFilters);
  };

  const fetchReturns = async () => {
    setLoading(true);
    try {
      const currentOpId = getCurrentOperatorId();
      let url = `${API_BASE_URL}/inventory-return-requests/`;
      if (currentOpId != null) {
        url = `${API_BASE_URL}/inventory-return-requests/by-operator/${currentOpId}`;
      }
      const response = await fetch(url);

      if (response.ok) {
        let returnsData = await response.json();
        returnsData = Array.isArray(returnsData) ? returnsData : [];

        // Flatten the nested details for the table
        returnsData = returnsData.map(ret => {
          const details = ret.inventory_request_details || {};
          return {
            ...ret,
            tool_name: details.tool_name || '-',
            project_name: details.project_name || '-',
            product_name: details.product_name || '',
            part_number: details.part_number || '',
            part_name: details.part_name || '-',
            tool_range: details.tool_range || '-',
            identification_code: details.identification_code || '-',
            operation_name: details.operation_name || '-',
            operation_number: details.operation_number || '-',
          };
        });

        const sortedFiltered = returnsData.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setReturns(sortedFiltered);
      } else {
        console.warn('Inventory returns endpoint not found');
        const savedReturns = localStorage.getItem('inventory_returns');
        if (savedReturns) {
          setReturns(JSON.parse(savedReturns));
        }
      }
    } catch (error) {
      console.error('Failed to fetch returns:', error);
      const savedReturns = localStorage.getItem('inventory_returns');
      if (savedReturns) {
        setReturns(JSON.parse(savedReturns));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchReturns();
  };

  const columns = [
    {
      title: 'Sl No',
      key: 'sno',
      width: 50,
      fixed: 'left',
      render: (_, __, index) => {
        const { current, pageSize } = pagination;
        return (current - 1) * pageSize + index + 1;
      },
    },
    {
      title: 'Tool Name',
      dataIndex: 'tool_name',
      key: 'tool_name',
      width: 120,
      filteredValue: [searchText],
      onFilter: (value, record) => {
        return (
          String(record.tool_name || '').toLowerCase().includes(value.toLowerCase()) ||
          String(record.project_name || '').toLowerCase().includes(value.toLowerCase())
        );
      },
      sorter: (a, b) => (a.tool_name || '').localeCompare(b.tool_name || ''),
    },
    {
      title: 'Range',
      dataIndex: 'tool_range',
      key: 'tool_range',
      width: 80,
      render: (text) => text || '-',
    },
    {
      title: 'ID Code',
      dataIndex: 'identification_code',
      key: 'identification_code',
      width: 100,
      render: (text) => text || '-',
    },
    {
      title: 'Project',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 120,
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
      dataIndex: 'part_name',
      key: 'part_name',
      width: 100,
      render: (_, record) => {
        const partName = record.part_name || '-';
        const partNum = record.part_number || '';
        return (
          <div>
            <div>{partName}</div>
            {partNum && <div style={{ fontSize: '12px', color: '#8c8c8c' }}>#{partNum}</div>}
          </div>
        );
      },
    },
    {
      title: 'Operation',
      key: 'operation',
      width: 120,
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
      title: 'Quantity',
      dataIndex: 'returned_qty',
      key: 'returned_qty',
      width: 80,
    },
    {
      title: 'Returned At',
      dataIndex: 'return_date',
      key: 'return_date',
      width: 120,
      render: (text, record) => {
        const date = text || record.created_at || record.updated_at;
        if (!date) return '-';
        const d = new Date(date);
        const dateStr = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
        const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
        return `${dateStr}, ${time}`;
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      filteredValue: filters.status || null,
      render: (status) => {
        let color = 'blue';
        if (status === 'Collected' || status === 'collected') color = 'green';
        if (status === 'Not Collected' || status === 'not_collected') color = 'orange';
        return <Tag color={color}>{status ? status.toUpperCase().replace('_', ' ') : 'UNKNOWN'}</Tag>;
      },
      filters: [
        { text: 'Pending', value: 'pending' },
        { text: 'Collected', value: 'collected' },
      ],
      onFilter: (value, record) => record.status?.toLowerCase() === value,
    },
    {
      title: 'Collected At',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 120,
      render: (text) => {
        if (!text) return '-';
        const d = new Date(text);
        const dateStr = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
        const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
        return `${dateStr}, ${time}`;
      },
    },
    {
      title: 'Collected By',
      dataIndex: 'collected_by',
      key: 'collected_by',
      width: 80,
      render: (text, record) => text || record.inventory_supervisor_name || record.admin_name || '-',
    },
  ];

  return (
    <div style={{ background: '#fff', padding: '24px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Input
          placeholder="Search returned tools..."
          allowClear
          prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
          size="middle"
          style={{ width: 300 }}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <Button
          type="default"
          icon={<ReloadOutlined />}
          onClick={handleRefresh}
          loading={refreshing}
        >
          Refresh
        </Button>
      </div>
      <Table
        columns={columns}
        dataSource={returns}
        rowKey="id"
        loading={loading}
        scroll={{ x: 'max-content' }}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
          position: ['bottomCenter'],
        }}
        onChange={handleTableChange}   // ← now correctly captures filters too
        components={{
          header: {
            cell: (props) => (
              <th {...props} style={{ ...props.style, background: 'linear-gradient(to bottom, #f0f5ff, #e6f0ff)', fontWeight: 'bold', borderBottom: '2px solid #1890ff' }}>
                {props.children}
              </th>
            ),
          },
        }}
      />
    </div>
  );
};

export default ToolReturn;