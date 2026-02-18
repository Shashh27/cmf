import React, { useState, useEffect, useRef } from "react";
import { Table, Card, Typography, message, Spin, InputNumber, Button, Space, Tag, Empty, Modal } from "antd";
import { ExclamationCircleOutlined } from "@ant-design/icons";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { API_BASE_URL } from "../Config/auth";
import { 
  OrderedListOutlined, 
  ArrowUpOutlined, 
  ArrowDownOutlined,
  SaveOutlined,
  HolderOutlined
} from "@ant-design/icons";

const Row = (props) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: props['data-row-key'],
    });

    const style = {
        ...props.style,
        transform: CSS.Transform.toString(transform && { ...transform, scaleY: 1 }),
        transition,
        cursor: 'move',
        ...(isDragging ? { position: 'relative', zIndex: 9999 } : {}),
    };

    return <tr {...props} ref={setNodeRef} style={style} {...attributes} {...listeners} />;
};

const PartsPriority = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [messageApi, contextHolder] = message.useMessage();
  const [editingId, setEditingId] = useState(null);
  const [editPriorityValue, setEditPriorityValue] = useState(null);
  const hasFetched = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
        activationConstraint: {
            distance: 1,
        },
    })
  );

  useEffect(() => {
    if (!hasFetched.current) {
        fetchData();
        hasFetched.current = true;
    }
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/orders/part-priorities/all`);
      if (response.ok) {
        const result = await response.json();
        setData(result);
      } else {
        messageApi.error("Failed to fetch priority data");
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      messageApi.error("Error connecting to server");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePriority = async (id, newPriority) => {
    if (!newPriority || newPriority < 1) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/orders/part-priorities/update-global`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: id,
          priority: newPriority
        }),
      });

      if (response.ok) {
        messageApi.success("Priority updated successfully");
        fetchData(); // Refresh data to get the new order
        setEditingId(null);
      } else {
        const errorData = await response.json();
        messageApi.error(errorData.detail || "Failed to update priority");
        fetchData(); // Revert changes if failed
      }
    } catch (error) {
      console.error("Error updating priority:", error);
      messageApi.error("Error connecting to server");
      fetchData(); // Revert changes if failed
    }
  };

  const onDragEnd = ({ active, over }) => {
    if (active.id !== over?.id) {
        const activeIndex = data.findIndex((i) => i.id === active.id);
        const overIndex = data.findIndex((i) => i.id === over?.id);
        
        const sourceItem = data[activeIndex];
        const targetItem = data[overIndex];
        const newPriority = targetItem.priority;

        Modal.confirm({
            title: 'Confirm Reorder',
            icon: <ExclamationCircleOutlined />,
            content: (
                <div>
                    <p>Are you sure you want to change the priority for <strong>{sourceItem.part_name}</strong>?</p>
                    <p>Current Priority: <strong>{sourceItem.priority}</strong></p>
                    <p>New Priority: <strong>{newPriority}</strong></p>
                </div>
            ),
            okText: 'Yes, Move',
            cancelText: 'Cancel',
            onOk: () => {
                // Optimistic UI update
                setData((previous) => {
                    const newItems = arrayMove(previous, activeIndex, overIndex);
                    return newItems.map((item, index) => ({
                        ...item,
                        priority: index + 1
                    }));
                });

                handleUpdatePriority(active.id, newPriority);
            },
        });
    }
  };

  const moveRow = (index, direction) => {
    const currentItem = data[index];
    let newPriority;

    if (direction === 'up' && index > 0) {
        newPriority = currentItem.priority - 1;
    } else if (direction === 'down' && index < data.length - 1) {
        newPriority = currentItem.priority + 1;
    } else {
        return;
    }

    Modal.confirm({
        title: 'Confirm Priority Change',
        icon: <ExclamationCircleOutlined />,
        content: (
            <div>
                <p>Are you sure you want to move <strong>{currentItem.part_name}</strong> {direction}?</p>
                <p>Current Priority: <strong>{currentItem.priority}</strong></p>
                <p>New Priority: <strong>{newPriority}</strong></p>
            </div>
        ),
        okText: 'Yes, Move',
        cancelText: 'Cancel',
        onOk: () => {
            handleUpdatePriority(currentItem.id, newPriority);
        },
    });
  };

  const columns = [
    {
        key: 'sort',
        width: 30,
        render: () => <HolderOutlined style={{ cursor: 'grab', color: '#999' }} />,
    },
    {
      title: <span className="font-semibold text-gray-700">SL NO</span>,
      key: "index",
      width: 80,
      render: (_, __, index) => <span className="text-gray-500 font-mono">{index + 1}</span>,
    },
    {
      title: <span className="font-semibold text-gray-700">Project Number</span>,
      dataIndex: "sale_order_number",
      key: "sale_order_number",
      render: (text) => <span className="font-medium text-gray-800">{text || "-"}</span>,
    },
    {
      title: <span className="font-semibold text-gray-700">Project Name</span>,
      dataIndex: "project_name",
      key: "project_name",
      render: (text) => <span className="text-gray-600">{text || "-"}</span>,
    },
    {
      title: <span className="font-semibold text-gray-700">Product Name</span>,
      dataIndex: "product_name",
      key: "product_name",
      render: (text) => <span className="text-blue-600 font-medium">{text || "-"}</span>,
    },
    {
      title: <span className="font-semibold text-gray-700">Part Name</span>,
      dataIndex: "part_name",
      key: "part_name",
      render: (text) => <span className="text-gray-700">{text || "-"}</span>,
    },
    {
      title: <span className="font-semibold text-gray-700">Priority</span>,
      dataIndex: "priority",
      key: "priority",
      width: 150,
      render: (priority, record, index) => {
        if (editingId === record.id) {
            return (
                <Space.Compact>
                    <InputNumber 
                        min={1} 
                        value={editPriorityValue} 
                        onChange={setEditPriorityValue}
                        size="small"
                        style={{ width: 80 }}
                    />
                    <Button 
                        type="primary" 
                        size="small" 
                        icon={<SaveOutlined />} 
                        onClick={() => {
                            Modal.confirm({
                                title: 'Confirm Priority Change',
                                icon: <ExclamationCircleOutlined />,
                                content: (
                                    <div>
                                        <p>Are you sure you want to change the priority for <strong>{record.part_name}</strong>?</p>
                                        <p>Current Priority: <strong>{record.priority}</strong></p>
                                        <p>New Priority: <strong>{editPriorityValue}</strong></p>
                                    </div>
                                ),
                                okText: 'Yes, Save',
                                cancelText: 'Cancel',
                                onOk: () => {
                                    handleUpdatePriority(record.id, editPriorityValue);
                                },
                            });
                        }}
                    />
                    <Button 
                        size="small" 
                        onClick={() => setEditingId(null)}
                    >X</Button>
                </Space.Compact>
            );
        }
        return (
            <div className="flex items-center gap-2 group">
                <Tag color="blue" className="min-w-[40px] text-center text-sm font-semibold m-0">
                    {priority}
                </Tag>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <Button 
                        type="text" 
                        size="small" 
                        icon={<OrderedListOutlined />} 
                        onClick={() => {
                            setEditingId(record.id);
                            setEditPriorityValue(priority);
                        }}
                        title="Set specific priority"
                    />
                    <Button 
                        type="text" 
                        size="small" 
                        icon={<ArrowUpOutlined />} 
                        disabled={index === 0}
                        onClick={() => moveRow(index, 'up')}
                        title="Move Up"
                    />
                    <Button 
                        type="text" 
                        size="small" 
                        icon={<ArrowDownOutlined />} 
                        disabled={index === data.length - 1}
                        onClick={() => moveRow(index, 'down')}
                        title="Move Down"
                    />
                </div>
            </div>
        );
      },
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      <style>{`
        .modern-table .ant-table-thead > tr > th {
          background: linear-gradient(to bottom, #f0f5ff, #e6f0ff);
          font-weight: 600;
          border-bottom: 2px solid #1890ff;
        }
        .modern-table .ant-table-tbody > tr:hover > td {
          background: #f0f8ff !important;
        }
        .modern-table .ant-table-tbody > tr > td {
          border-bottom: 1px solid #f0f0f0;
        }
      `}</style>

      {contextHolder}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="flex items-center justify-between">
            <div>
                <Typography.Title level={2} style={{ margin: 0, fontSize: '24px' }} className="flex items-center gap-3 text-gray-800">
                    <OrderedListOutlined className="text-blue-600" />
                    Global Parts Priority
                </Typography.Title>
                <Typography.Text className="text-gray-500 mt-1 block">
                    Manage and reorder manufacturing priorities for all parts across projects
                </Typography.Text>
            </div>
        </div>
      </div>

      <Card className="shadow-sm rounded-xl border border-gray-100" bodyStyle={{ padding: 0 }}>
        {loading ? (
           <div className="p-12 flex justify-center">
             <Spin size="large" />
           </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={data.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <Table
                components={{
                    body: {
                        row: Row,
                    },
                }}
                columns={columns}
                dataSource={data}
                rowKey="id"
                pagination={{
                    pageSize: 20,
                    showSizeChanger: true,
                    showQuickJumper: true,
                    showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
                }}
                size="small"
                bordered
                className="modern-table"
                locale={{ emptyText: <Empty description="No parts priority data found" /> }}
                scroll={{ x: 'max-content' }}
              />
            </SortableContext>
          </DndContext>
        )}
      </Card>
    </div>
  );
};

export default PartsPriority;
