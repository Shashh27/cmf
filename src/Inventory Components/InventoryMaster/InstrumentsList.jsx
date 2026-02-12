import React, { useState, useEffect } from 'react';
import { Table, Button, Space, message, Empty } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';

const InstrumentsList = ({ onEdit, onDelete, onCreateNew }) => {
  const [instruments, setInstruments] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchInstruments();
  }, []);

  const fetchInstruments = async () => {
    setLoading(true);
    try {
      // TODO: Replace with actual API call
      // const response = await fetch('/api/inventory/instruments');
      // const data = await response.json();
      
      // Currently empty as per requirements
      setInstruments([]);
    } catch (error) {
      message.error('Failed to fetch instruments');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 60,
    },
    {
      title: 'Instrument Name',
      dataIndex: 'instrument_name',
      key: 'instrument_name',
      width: 150,
    },
    {
      title: 'Model',
      dataIndex: 'model',
      key: 'model',
      width: 120,
    },
    {
      title: 'Serial Number',
      dataIndex: 'serial_number',
      key: 'serial_number',
      width: 140,
    },
    {
      title: 'Manufacturer',
      dataIndex: 'manufacturer',
      key: 'manufacturer',
      width: 120,
    },
    {
      title: 'Calibration Date',
      dataIndex: 'calibration_date',
      key: 'calibration_date',
      width: 120,
    },
    {
      title: 'Next Calibration',
      dataIndex: 'next_calibration',
      key: 'next_calibration',
      width: 120,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
    },
    {
      title: 'Location',
      dataIndex: 'location',
      key: 'location',
      width: 120,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      fixed: 'right',
      render: (text, record) => (
        <Space size="small">
          <Button 
            type="primary" 
            icon={<EditOutlined />} 
            size="small"
            onClick={() => onEdit(record)}
            title="Edit"
          />
          <Button 
            type="danger" 
            icon={<DeleteOutlined />} 
            size="small"
            onClick={() => onDelete(record)}
            title="Delete"
          />
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'flex-end' }}>
        <Button 
          type="primary" 
          icon={<PlusOutlined />}
          onClick={onCreateNew}
        >
          Create New Instrument
        </Button>
      </div>
      
      {instruments.length === 0 ? (
        <Empty
          description="No instruments found"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ padding: '40px' }}
        />
      ) : (
        <Table
          columns={columns}
          dataSource={instruments}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
          }}
          size="small"
        />
      )}
    </div>
  );
};

export default InstrumentsList;
