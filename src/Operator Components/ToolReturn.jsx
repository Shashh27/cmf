import React, { useState, useEffect } from 'react';
import { Table, Tag, Input } from 'antd';
import { API_BASE_URL } from '../Config/auth';
import { SearchOutlined } from '@ant-design/icons';

const ToolReturn = () => {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
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
    } catch (e) {
      
    }
    const fallback = localStorage.getItem('operator_id');
    return fallback ? parseInt(fallback) : null;
  };

  const handleTableChange = (newPagination) => {
    setPagination(newPagination);
  };

  const fetchReturns = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/inventory-return-requests/`);

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
            };
        });
        
        const currentOpId = getCurrentOperatorId();
        const filtered = currentOpId != null
          ? returnsData.filter(ret => {
              const top = ret.operator_id ?? ret.operatorId ?? ret.operator_id_fk;
              const nested = ret.inventory_request_details?.operator_id ?? ret.inventory_request_details?.operator?.id;
              const oid = top != null ? top : nested;
              return oid == null ? true : parseInt(oid) === currentOpId;
            })
          : returnsData;
        
        setReturns(filtered);
      } else {
        // Fallback for demo/development if endpoint doesn't exist yet
        console.warn('Inventory returns endpoint not found');
        const savedReturns = localStorage.getItem('inventory_returns');
        if (savedReturns) {
            setReturns(JSON.parse(savedReturns));
        }
      }
    } catch (error) {
      console.error('Failed to fetch returns:', error);
      // Still try local storage on network error
      const savedReturns = localStorage.getItem('inventory_returns');
      if (savedReturns) {
          setReturns(JSON.parse(savedReturns));
      }
    } finally {
        setLoading(false);
    }
  };

  const columns = [
    {
      title: 'Tool Name',
      dataIndex: 'tool_name',
      key: 'tool_name',
      width: 150,
      ellipsis: true,
      filteredValue: [searchText],
      onFilter: (value, record) => {
        return (
          String(record.tool_name || '').toLowerCase().includes(value.toLowerCase()) ||
          String(record.project_name || '').toLowerCase().includes(value.toLowerCase())
        );
      },
    },
    {
      title: 'Quantity',
      dataIndex: 'returned_qty',
      key: 'returned_qty',
      width: 100,
    },
    {
      title: 'Return Date',
      dataIndex: 'return_date',
      key: 'return_date',
      width: 120,
      render: (text, record) => {
        const date =
          text ||
          record.created_at ||
          record.updated_at;
        return date ? new Date(date).toLocaleDateString() : '-';
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status) => {
        let color = 'blue';
        if (status === 'Collected' || status === 'collected') color = 'green';
        if (status === 'Not Collected' || status === 'not_collected') color = 'orange';
        return <Tag color={color}>{status ? status.toUpperCase().replace('_', ' ') : 'UNKNOWN'}</Tag>;
      }
    },
    {
      title: 'Collected By',
      dataIndex: 'collected_by',
      key: 'collected_by',
      width: 150,
      ellipsis: true,
      render: (text, record) => text || record.inventory_supervisor_name || record.admin_name || '-',
    },
    {
      title: 'Details',
      key: 'details',
      width: 200,
      ellipsis: true,
      render: (_, record) => (
        <span>Returned from {record.project_name || 'Project'}</span>
      )
    }
  ];

  return (
    <div style={{ background: '#fff', padding: '24px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
         <Input
            placeholder="Search returned tools..."
            allowClear
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            size="middle"
            style={{ width: 300 }}
            onChange={(e) => setSearchText(e.target.value)}
          />
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
            position: ['bottomCenter']
        }}
        onChange={handleTableChange}
      />
    </div>
  );
};

export default ToolReturn;
