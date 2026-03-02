import React, { useState, useEffect } from 'react';
import {Table,Select,Typography,Card,Button,Space,Tag,Modal,message,} from 'antd';
import {ReloadOutlined,FileTextOutlined,CheckCircleOutlined,CloseCircleOutlined,} from '@ant-design/icons';
import config from '../Config/config';

const { Title, Text } = Typography;
const { Option } = Select;

const PokaYokeCompletedLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [machines, setMachines] = useState([]);
  const [checklists, setChecklists] = useState([]);
  const [orders, setOrders] = useState([]);
  const [parts, setParts] = useState([]);
  const [operators, setOperators] = useState([]);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });

  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);
  const [selectedLogDetails, setSelectedLogDetails] = useState(null);
  const [checklistItemsMap, setChecklistItemsMap] = useState({});

  useEffect(() => {
    fetchMetaData();
    fetchLogs();
  }, []);

  const fetchMetaData = async () => {
    try {
      const [machinesRes, checklistsRes, ordersRes, operatorsRes, partsRes] = await Promise.all([
        fetch(`${config.API_BASE_URL}/machines`),
        fetch(`${config.API_BASE_URL}/pokayoke-checklists`),
        fetch(`${config.API_BASE_URL}/orders`),
        fetch(`${config.API_BASE_URL}/access-users?skip=0&limit=1000`),
        fetch(`${config.API_BASE_URL}/parts?skip=0&limit=1000`),
      ]);

      if (!machinesRes.ok) throw new Error('Failed to fetch machines');
      if (!checklistsRes.ok) throw new Error('Failed to fetch checklists');
      if (!ordersRes.ok) throw new Error('Failed to fetch orders');
      if (!operatorsRes.ok) throw new Error('Failed to fetch operators');
      if (!partsRes.ok) throw new Error('Failed to fetch parts');

      const machinesData = await machinesRes.json();
      const checklistsData = await checklistsRes.json();
      const ordersData = await ordersRes.json();
      const operatorsData = await operatorsRes.json();
      const partsData = await partsRes.json();

      setMachines(machinesData || []);
      setChecklists(checklistsData || []);
      setOrders(ordersData || []);
      setOperators(operatorsData || []);
      setParts(partsData || []);
    } catch (error) {
      message.error(error.message || 'Failed to load reference data');
    }
  };

  const fetchLogs = async (machineId = null) => {
    try {
      setLoading(true);
      const url = machineId
        ? `${config.API_BASE_URL}/pokayoke-completed-logs/machines/${machineId}/logs`
        : `${config.API_BASE_URL}/pokayoke-completed-logs`;

      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch completion logs');
      const data = await response.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch (error) {
      message.error(error.message || 'Failed to load completion logs');
    } finally {
      setLoading(false);
    }
  };

  const handleMachineChange = (value) => {
    const newMachine = value || null;
    setSelectedMachine(newMachine);
    fetchLogs(newMachine);
  };

  const handleRefresh = () => {
    fetchLogs(selectedMachine);
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '-';

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;
    const hoursStr = String(hours).padStart(2, '0');

    return `${day}/${month}/${year}, ${hoursStr}:${minutes}:${seconds} ${ampm}`;
  };

  const getChecklistName = (id) => {
    const checklist = checklists.find((c) => c.id === id);
    return checklist ? checklist.name : '-';
  };

  const getMachineLabel = (id) => {
    const machine = machines.find((m) => m.id === id);
    if (!machine) return '-';
    if (machine.make && machine.model) {
      return `${machine.make} ${machine.model}`;
    }
    return machine.make || `Machine ${machine.id}`;
  };

  const getOperatorName = (id) => {
    const operator = operators.find((o) => o.id === id);
    return operator ? operator.user_name : '-';
  };

  const getOrderNumber = (id) => {
    const order = orders.find((o) => o.id === id);
    return order ? order.sale_order_number : '-';
  };

  const getPartName = (id) => {
    const part = parts.find((p) => p.id === id);
    return part ? part.part_name : '-';
  };

  const getStatusTag = (allItemsPassed) => {
    if (allItemsPassed) {
      return (
        <Tag color="green" style={{ borderRadius: '16px', padding: '0 12px' }}>
          ALL PASSED
        </Tag>
      );
    }
    return (
      <Tag color="red" style={{ borderRadius: '16px', padding: '0 12px' }}>
        HAS FAILURES
      </Tag>
    );
  };

  const handleViewDetails = async (log) => {
    setSelectedLog(log);
    setDetailModalVisible(true);
    setDetailLoading(true);
    setSelectedLogDetails(null);
    setChecklistItemsMap({});

    try {
      const [logRes, checklistRes] = await Promise.all([
        fetch(`${config.API_BASE_URL}/pokayoke-completed-logs/${log.id}`),
        fetch(`${config.API_BASE_URL}/pokayoke-checklists/${log.checklist_id}`),
      ]);

      if (!logRes.ok) throw new Error('Failed to fetch log details');
      if (!checklistRes.ok) throw new Error('Failed to fetch checklist details');

      const logData = await logRes.json();
      const checklistData = await checklistRes.json();

      setSelectedLogDetails(logData);

      if (checklistData && Array.isArray(checklistData.items)) {
        const map = {};
        checklistData.items.forEach((item) => {
          map[item.id] = item;
        });
        setChecklistItemsMap(map);
      }
    } catch (error) {
      message.error(error.message || 'Failed to load log details');
    } finally {
      setDetailLoading(false);
    }
  };

  const getItemText = (itemId) => {
    const item = checklistItemsMap[itemId];
    return item ? item.item_text : '-';
  };

  const getResponseStatusTag = (isConfirming) => {
    if (isConfirming) {
      return (
        <Tag color="green" style={{ borderRadius: '12px', padding: '0 10px' }}>
          PASSED
        </Tag>
      );
    }
    return (
      <Tag color="red" style={{ borderRadius: '12px', padding: '0 10px' }}>
        FAILED
      </Tag>
    );
  };

  const columns = [
    {
      title: 'ID',
      key: 'sl_no',
      width: 70,
      align: 'center',
      className: 'table-header-styled',
      render: (_, __, index) => index + 1,
    },
    {
      title: 'Checklist',
      dataIndex: 'checklist_id',
      key: 'checklist',
      width: 200,
      className: 'table-header-styled',
      render: (id) => <Text strong>{getChecklistName(id)}</Text>,
    },
    {
      title: 'Machine',
      dataIndex: 'machine_id',
      key: 'machine',
      width: 260,
      className: 'table-header-styled',
      render: (id) => (
        <div style={{ whiteSpace: 'normal' }}>
          <Text>{getMachineLabel(id)}</Text>
        </div>
      ),
    },
    {
      title: 'Operator',
      dataIndex: 'operator_id',
      key: 'operator',
      width: 160,
      className: 'table-header-styled',
      render: (id) => getOperatorName(id),
    },
    {
      title: 'Production Order',
      dataIndex: 'production_order_id',
      key: 'production_order',
      width: 160,
      className: 'table-header-styled',
      render: (id) => getOrderNumber(id),
    },
    {
      title: 'Completed At',
      dataIndex: 'completed_at',
      key: 'completed_at',
      width: 220,
      className: 'table-header-styled',
      sorter: (a, b) =>
        new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime(),
      render: (date) => formatDateTime(date),
    },
    {
      title: 'Status',
      dataIndex: 'all_items_passed',
      key: 'status',
      width: 140,
      align: 'center',
      className: 'table-header-styled',
      render: (value) => getStatusTag(value),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      align: 'center',
      className: 'table-header-styled',
      render: (_, record) => (
        <Button
          type="text"
          icon={<FileTextOutlined />}
          onClick={() => handleViewDetails(record)}
        />
      ),
    },
  ];

  const responseColumns = [
    {
      title: 'Checklist Item',
      dataIndex: 'item_id',
      key: 'item_id',
      width: 250,
      className: 'table-header-styled',
      render: (id) => getItemText(id),
    },
    {
      title: 'Response',
      dataIndex: 'response_value',
      key: 'response_value',
      width: 150,
      className: 'table-header-styled',
    },
    {
      title: 'Status',
      dataIndex: 'is_confirming',
      key: 'is_confirming',
      width: 120,
      align: 'center',
      className: 'table-header-styled',
      render: (value) => getResponseStatusTag(value),
    },
    {
      title: 'Timestamp',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 220,
      className: 'table-header-styled',
      render: (date) => formatDateTime(date),
    },
  ];

  return (
    <div>
      <div
        style={{
          marginBottom: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        <div>
          <Title level={4} style={{ margin: 0 }}>
            Checklist Completion Logs
          </Title>
          <Text type="secondary" style={{ fontSize: '14px' }}>
            View and analyze checklist completion data
          </Text>
        </div>
      </div>

      <Card
        style={{
          borderRadius: '12px',
          border: '1px solid #f0f0f0',
          boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
          marginBottom: '16px',
        }}
        bodyStyle={{ padding: '16px 20px' }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <div style={{ flex: '0 0 450px', maxWidth: '100%' }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              Machine
            </Text>
            <Select
              allowClear
              placeholder="Select Machine"
              style={{ width: '100%' }}
              value={selectedMachine}
              onChange={handleMachineChange}
              showSearch
              optionFilterProp="children"
            >
              {machines.map((machine) => (
                <Option key={machine.id} value={machine.id}>
                  {getMachineLabel(machine.id)}
                </Option>
              ))}
            </Select>
          </div>
          <Button
            icon={<ReloadOutlined />}
            onClick={handleRefresh}
            style={{
              borderRadius: '50%',
            }}
          />
        </div>
      </Card>

      <Table
        columns={columns}
        dataSource={logs}
        loading={loading}
        rowKey="id"
        size="small"
        scroll={{ x: 1100 }}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) =>
            `${range[0]}-${range[1]} of ${total} items`,
          pageSizeOptions: ['10', '20', '50', '100'],
          onChange: (page, pageSize) => {
            setPagination({ current: page, pageSize: pageSize });
            console.log('Page changed to:', page, 'Page size:', pageSize);
          },
          onShowSizeChange: (current, size) => {
            setPagination({ current: 1, pageSize: size });
            console.log('Page size changed to:', size);
          },
        }}
        style={{
          background: '#fff',
          borderRadius: '8px',
        }}
      />

      <Modal
        title={
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Checklist Completion Details</span>
              {selectedLogDetails && (
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 13,
                  }}
                >
                  {selectedLogDetails.all_items_passed ? (
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                  ) : (
                    <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                  )}
                  <span>
                    {selectedLogDetails.all_items_passed
                      ? 'All Items Passed'
                      : 'Has Failures'}
                  </span>
                </span>
              )}
            </div>
          </div>
        }
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={
          <Button onClick={() => setDetailModalVisible(false)}>Close</Button>
        }
        width={900}
      >
        {detailLoading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>Loading...</div>
        ) : (
          selectedLogDetails && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Card
                bordered={false}
                style={{ background: '#fafafa', borderRadius: 8 }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    rowGap: 8,
                    columnGap: 40,
                  }}
                >
                  <div>
                    <Text type="secondary">Checklist</Text>
                    <div style={{ fontWeight: 500 }}>
                      {getChecklistName(selectedLogDetails.checklist_id)}
                    </div>
                  </div>
                  <div>
                    <Text type="secondary">Machine</Text>
                    <div style={{ fontWeight: 500 }}>
                      {getMachineLabel(selectedLogDetails.machine_id)}
                    </div>
                  </div>
                  <div>
                    <Text type="secondary">Operator</Text>
                    <div style={{ fontWeight: 500 }}>
                      {getOperatorName(selectedLogDetails.operator_id)}
                    </div>
                  </div>
                  <div>
                    <Text type="secondary">Production Order</Text>
                    <div style={{ fontWeight: 500 }}>
                      {getOrderNumber(selectedLogDetails.production_order_id)}
                    </div>
                  </div>
                  <div>
                    <Text type="secondary">Completed At</Text>
                    <div style={{ fontWeight: 500 }}>
                      {formatDateTime(selectedLogDetails.completed_at)}
                    </div>
                  </div>
                  <div>
                    <Text type="secondary">Part</Text>
                    <div style={{ fontWeight: 500 }}>
                      {getPartName(selectedLogDetails.part_id)}
                    </div>
                  </div>
                </div>
              </Card>

              <Card
                bordered={false}
                style={{
                  background: '#f5f9ff',
                  borderRadius: 8,
                }}
              >
                <Text strong style={{ display: 'block', marginBottom: 8 }}>
                  Operator Comments
                </Text>
                <div style={{ minHeight: 40 }}>
                  {selectedLogDetails.comments || '-'}
                </div>
              </Card>

              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8,
                  }}
                >
                  <Text strong>Checklist Responses</Text>
                </div>
                <Table
                  columns={responseColumns}
                  dataSource={selectedLogDetails.item_responses || []}
                  rowKey="id"
                  pagination={false}
                  size="small"
                  scroll={{ x: 800 }}
                  style={{
                    background: '#fff',
                    borderRadius: 8,
                  }}
                />
              </div>
            </div>
          )
        )}
      </Modal>
    </div>
  );
};

export default PokaYokeCompletedLogs;
