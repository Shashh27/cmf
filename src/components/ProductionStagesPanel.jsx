import React, { useMemo } from 'react';
import { Table, Typography } from 'antd';
import {
  buildProductionStageTree,
  getLatestSnapshotLog,
  getVisibleStageLogs,
  getRejectedForStageRow,
} from '../utils/productionLogDisplay';

const { Text } = Typography;

const formatStageTime = (log) => {
  const t = (v) => (v ? String(v).slice(0, 5) : '');
  const from = t(log.from_time);
  const to = t(log.to_time);
  if (from && to) return `${from} – ${to}`;
  return from || log.from_date || '-';
};

const Qty = ({ value, color, dash }) => {
  if (dash) return <Text type="secondary">—</Text>;
  const n = value || 0;
  return (
    <Text strong={!!n} style={{ color: n ? color : '#d9d9d9', fontSize: 12 }}>
      {n}
    </Text>
  );
};

const buildTableData = (tree) =>
  tree.map((group) => {
    const row = {
      key: group.key,
      stageLabel: `Stage ${group.stageNumber}`,
      isChild: false,
      produced: group.log.produced_quantity || 0,
      approved: group.displayApproved ?? group.log.approved_quantity ?? 0,
      rework: group.log.rework_quantity || 0,
      rejected: group.log.rejected_quantity || 0,
      time: formatStageTime(group.log),
    };

    if (group.reworkOutcomes.length > 0) {
      row.children = group.reworkOutcomes.map((outcome, idx) => ({
        key: outcome.key,
        stageLabel: `Rework ${idx + 1}`,
        isChild: true,
        produced: null,
        approved: outcome.approvedQty ?? outcome.log.approved_quantity ?? 0,
        rework: null,
        rejected: getRejectedForStageRow(outcome.log, true),
        time: formatStageTime(outcome.log),
      }));
    }

    return row;
  });

const columns = [
  {
    title: 'Stage',
    dataIndex: 'stageLabel',
    key: 'stageLabel',
    width: 100,
    render: (text, record) => (
      <Text
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: record.isChild ? '#595959' : '#262626',
        }}
      >
        {text}
      </Text>
    ),
  },
  {
    title: 'Produced',
    dataIndex: 'produced',
    key: 'produced',
    width: 72,
    align: 'center',
    render: (v, record) => (
      <Qty value={v} color="#1677ff" dash={record.isChild} />
    ),
  },
  {
    title: 'Approved',
    dataIndex: 'approved',
    key: 'approved',
    width: 72,
    align: 'center',
    render: (v) => <Qty value={v} color="#52c41a" />,
  },
  {
    title: 'Rework',
    dataIndex: 'rework',
    key: 'rework',
    width: 64,
    align: 'center',
    render: (v, record) => (
      <Qty value={v} color="#fa8c16" dash={record.isChild} />
    ),
  },
  {
    title: 'Rejected',
    dataIndex: 'rejected',
    key: 'rejected',
    width: 72,
    align: 'center',
    render: (v, record) => (
      <Qty value={v} color="#ff4d4f" dash={record.isChild && (v === null || v === undefined)} />
    ),
  },
  {
    title: 'Time',
    dataIndex: 'time',
    key: 'time',
    width: 100,
    render: (t) => (
      <Text type="secondary" style={{ fontSize: 11 }}>
        {t}
      </Text>
    ),
  },
];

const ProductionStagesPanel = ({ logs = [] }) => {
  const visible = getVisibleStageLogs(logs);
  const tableData = useMemo(
    () => buildTableData(buildProductionStageTree(logs)),
    [logs],
  );

  if (!tableData.length) return null;

  const snapshot = getLatestSnapshotLog(visible);
  const remaining =
    snapshot.remaining_quantity_to_be_produced ?? snapshot.remaining_to_close ?? 0;

  return (
    <div className="ot-stages-panel">
      <Table
        className="ot-stages-tree-table"
        columns={columns}
        dataSource={tableData}
        size="small"
        pagination={false}
        defaultExpandAllRows
        expandable={{ defaultExpandAllRows: true, indentSize: 20 }}
        scroll={{ x: 500 }}
      />
      {remaining > 0 && (
        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
          Remaining to produce: {remaining}
        </Text>
      )}
      <style>{`
        .ot-stages-panel {
          padding: 4px 6px;
          background: #fafafa;
          min-width: 0;
        }
        .ot-stages-tree-table .ant-table {
          background: #fff;
          border-radius: 4px;
        }
        .ot-stages-tree-table .ant-table-thead > tr > th {
          padding: 4px 8px !important;
          font-size: 11px;
          font-weight: 600;
          background: #f5f5f5 !important;
        }
        .ot-stages-tree-table .ant-table-tbody > tr > td {
          padding: 4px 8px !important;
        }
        .ot-stages-tree-table .ant-table-row-level-1 td {
          background: #fafafa;
        }
        .ot-stages-tree-table .ant-table-row-level-1 .ant-table-cell-with-append {
          border-left: 2px solid #fa8c16;
        }
      `}</style>
    </div>
  );
};

export default ProductionStagesPanel;
