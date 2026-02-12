import React from 'react';
import { Card, Table, Typography } from 'antd';

const { Title } = Typography;

const InspectionResults = () => {
  const columns = [
    { title: 'Job ID', dataIndex: 'jobId', key: 'jobId' },
    { title: 'Inspection Date', dataIndex: 'date', key: 'date' },
    { title: 'Status', dataIndex: 'status', key: 'status' },
    { title: 'Remarks', dataIndex: 'remarks', key: 'remarks' },
  ];

  const data = [
    { key: '1', jobId: 'JOB-001', date: '2025-02-09', status: 'Passed', remarks: 'All clear' },
  ];

  return (
    <Card title={<Title level={4}>Inspection Results</Title>}>
      <Table columns={columns} dataSource={data} />
    </Card>
  );
};

export default InspectionResults;
