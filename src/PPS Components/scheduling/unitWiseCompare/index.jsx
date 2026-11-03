/**
 * Unit-wise Comparison Analysis component (placeholder).
 * 
 * This component displays comparison data between batch and unit-wise scheduling.
 */
import React from 'react';
import { Spin, Alert, Table, Tag } from 'antd';

export default function UnitWiseComparisonAnalysis({
  compare,
  compareLoading,
  partOptions,
  selectedPartId,
  onPartChange,
  onRefresh,
}) {
  if (compareLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!compare) {
    return (
      <Alert
        message="No comparison data available"
        description="Select a part to view comparison analysis between batch and unit-wise scheduling."
        type="info"
        showIcon
        style={{ margin: 16 }}
      />
    );
  }

  // Display comparison data in a simple table format
  const columns = [
    { title: 'Metric', dataIndex: 'metric', key: 'metric' },
    { title: 'Batch Wise', dataIndex: 'batch', key: 'batch' },
    { title: 'Unit Wise', dataIndex: 'unit', key: 'unit' },
    { title: 'Improvement', dataIndex: 'improvement', key: 'improvement' },
  ];

  const dataSource = [
    {
      key: 'makespan',
      metric: 'Makespan (hours)',
      batch: compare.batch_makespan || '-',
      unit: compare.unit_makespan || '-',
      improvement: compare.makespan_improvement ? (
        <Tag color="green">{compare.makespan_improvement}</Tag>
      ) : '-',
    },
    {
      key: 'utilization',
      metric: 'Machine Utilization',
      batch: compare.batch_utilization || '-',
      unit: compare.unit_utilization || '-',
      improvement: compare.utilization_improvement ? (
        <Tag color="green">{compare.utilization_improvement}</Tag>
      ) : '-',
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <h3 style={{ marginBottom: 16 }}>Comparison Analysis</h3>
      <Table
        columns={columns}
        dataSource={dataSource}
        pagination={false}
        size="small"
      />
    </div>
  );
}
