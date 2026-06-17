import React, { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Table, Card, Typography, message, Spin, InputNumber, Button, Space, Tag, Empty, Modal, Input, Select } from "antd";
import { ExclamationCircleOutlined } from "@ant-design/icons";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import axios from "axios";
import { API_BASE_URL } from "../../Config/auth";
import { 
  OrderedListOutlined, 
  ArrowUpOutlined, 
  ArrowDownOutlined,
  SaveOutlined,
  HolderOutlined
} from "@ant-design/icons";
import { PartWisePriorityPdfDownload } from "../../DownloadReports/PartsPriorityPdfDownload";

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
  const [searchParams] = useSearchParams();
  const [partData, setPartData] = useState([]);
  const [partLoading, setPartLoading] = useState(false);
  const [partPagination, setPartPagination] = useState({ current: 1, pageSize: 20 });
  const [messageApi, contextHolder] = message.useMessage();
  const [editingId, setEditingId] = useState(null);
  const [editPriorityValue, setEditPriorityValue] = useState(null);
  const hasFetchedPartWise = useRef(false);
  const [partSearchText, setPartSearchText] = useState("");
  const [filterProject, setFilterProject] = useState(null);
  const [filterPartNumber, setFilterPartNumber] = useState(null);

  const getCurrentUserId = () => {
    try {
      const stored = localStorage.getItem("user");
      if (!stored) return null;
      const u = JSON.parse(stored);
      if (u?.id == null) return null;
      return u.id;
    } catch {
      return null;
    }
  };


  const sensors = useSensors(
    useSensor(PointerSensor, {
        activationConstraint: {
            distance: 1,
        },
    })
  );

  const fetchPartPriorities = async () => {
    setPartLoading(true);
    try {
      const uid = getCurrentUserId();
      const response = await axios.get(`${API_BASE_URL}/orders/part-priorities/all`, {
        // For manufacturing coordinator view, filter by manufacturing_coordinator_id instead of admin_id
        params: uid != null ? { manufacturing_coordinator_id: uid } : undefined,
      });
      const result = response.data;
      const filtered = result.filter(
        (item) =>
          item.part_type_name &&
          item.part_type_name.toLowerCase() === "in-house"
      );
      setPartData(filtered);
    } catch (error) {
      console.error("Error fetching data:", error);
      messageApi.error("Error connecting to server");
    } finally {
      setPartLoading(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      if (!hasFetchedPartWise.current) {
        await fetchPartPriorities();
        hasFetchedPartWise.current = true;
      }
    };
    loadData();
  }, []);

  const handlePartSearch = (value) => {
    const filteredValue = (value || '').replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 20);
    setPartSearchText(filteredValue);
  };

  const projectOptions = [...new Set(partData.map(r => r.sale_order_number).filter(Boolean))].sort();
  const partNumberOptions = filterProject
    ? [...new Set(partData.filter(r => r.sale_order_number === filterProject).map(r => r.part_number).filter(Boolean))].sort()
    : [];

  const filteredPartData = partData.filter((row, index) => {
    if (filterProject && row.sale_order_number !== filterProject) return false;
    if (filterPartNumber && row.part_number !== filterPartNumber) return false;
    if (!partSearchText) return true;
    const q = partSearchText.toLowerCase();
    
    // SL NO (index + 1)
    const slNo = String(index + 1);
    
    // Project Name & Number
    const pn = String(row.project_name || "").toLowerCase();
    const so = String(row.sale_order_number || "").toLowerCase();
    
    // Product Name & Number
    const prod = String(row.product_name || "").toLowerCase();
    
    // Part Name & Number
    const part = String(row.part_name || "").toLowerCase();
    const partNum = String(row.part_number || "").toLowerCase();
    
    // Priority
    const priority = String(row.priority || "");
    
    return (
      slNo.includes(q) ||
      pn.includes(q) ||
      so.includes(q) ||
      prod.includes(q) ||
      part.includes(q) ||
      partNum.includes(q) ||
      priority.includes(q)
    );
  });


  const handleUpdatePriority = async (id, newPriority) => {
    if (!newPriority || newPriority < 1) return;
    
    try {
      const uid = getCurrentUserId();
      await axios.put(
        `${API_BASE_URL}/orders/part-priorities/update-global`,
        {
          id: id,
          priority: newPriority,
          // Track who updated using manufacturing_coordinator_id in this view
          manufacturing_coordinator_id: uid,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      messageApi.success("Priority updated successfully");
      fetchPartPriorities();
      setEditingId(null);
    } catch (error) {
      console.error("Error updating priority:", error);
      const detail =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        "Failed to update priority";
      messageApi.error(detail);
      fetchPartPriorities();
    }
  };

  const onPartDragEnd = ({ active, over }) => {
    if (active.id !== over?.id) {
        const activeIndex = partData.findIndex((i) => i.id === active.id);
        const overIndex = partData.findIndex((i) => i.id === over?.id);
        
        const sourceItem = partData[activeIndex];
        const targetItem = partData[overIndex];
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
                setPartData((previous) => {
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
    const currentItem = partData[index];
    let newPriority;

    if (direction === 'up' && index > 0) {
        newPriority = currentItem.priority - 1;
    } else if (direction === 'down' && index < partData.length - 1) {
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
      render: (_, __, index) => {
        const { current, pageSize } = partPagination;
        return <span className="text-gray-500 font-mono">{(current - 1) * pageSize + index + 1}</span>;
      },
    },
    {
      title: <span className="font-semibold text-gray-700">Project Number</span>,
      dataIndex: "sale_order_number",
      key: "sale_order_number",
      render: (text) => <span className="font-medium text-gray-800">{text || "-"}</span>,
    },
   
    {
      title: <span className="font-semibold text-gray-700">Project Name</span>,
      dataIndex: "product_name",
      key: "product_name",
      ellipsis: true,
      render: (text) => <span className="text-blue-600 font-medium">{text || "-"}</span>,
    },
     {
      title: <span className="font-semibold text-gray-700">Due Date</span>,
      dataIndex: "due_date",
      key: "due_date",
      width: 120,
      render: (text) => { if (!text) return <span className="text-gray-400">-</span>; const d = new Date(text); const dd = String(d.getDate()).padStart(2,'0'); const mm = String(d.getMonth()+1).padStart(2,'0'); const yyyy = d.getFullYear(); return <Tag color="orange">{`${dd}-${mm}-${yyyy}`}</Tag>; },
    },
    {
      title: <span className="font-semibold text-gray-700">Part Name</span>,
      dataIndex: "part_name",
      key: "part_name",
      ellipsis: true,
      render: (text) => <span className="text-gray-700">{text || "-"}</span>,
    },
    {
      title: <span className="font-semibold text-gray-700">Part Number</span>,
      dataIndex: "part_number",
      key: "part_number",
      ellipsis: true,
      render: (text) => <span className="text-gray-600 font-medium">{text || "-"}</span>,
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
                        disabled={index === partData.length - 1}
                        onClick={() => moveRow(index, 'down')}
                        title="Move Down"
                    />
                </div>
            </div>
        );
      },
    },
  ];




  const renderPartWiseContent = () => {
    if (partLoading) {
      return (
        <div className="p-12 flex justify-center">
          <Spin size="large" />
        </div>
      );
    }

    return (
      <div className="p-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-2 sm:px-3 pt-0 pb-1 gap-2">
          <Typography.Text className="font-semibold text-gray-700 text-sm sm:text-base">
            Part Wise Priority
          </Typography.Text>
          <Space className="w-full sm:w-auto flex-col sm:flex-row gap-2" wrap>
            <Input.Search
              placeholder="Search..."
              allowClear
              size="middle"
              className="w-full sm:w-64"
              onSearch={handlePartSearch}
              onChange={(e) => handlePartSearch(e.target.value)}
              value={partSearchText}
              maxLength={20}
            />
            <Select
              placeholder="Project Number"
              allowClear
              showSearch
              size="middle"
              style={{ minWidth: 160 }}
              value={filterProject}
              onChange={(val) => { setFilterProject(val || null); setFilterPartNumber(null); }}
            >
              {projectOptions.map(p => <Select.Option key={p} value={p}>{p}</Select.Option>)}
            </Select>
            <Select
              placeholder="Part Number"
              allowClear
              showSearch
              size="middle"
              style={{ minWidth: 160 }}
              value={filterPartNumber}
              disabled={!filterProject}
              onChange={(val) => setFilterPartNumber(val || null)}
            >
              {partNumberOptions.map(p => <Select.Option key={p} value={p}>{p}</Select.Option>)}
            </Select>
            <PartWisePriorityPdfDownload data={partData} />
          </Space>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onPartDragEnd}>
          <SortableContext items={partData.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <Table
              components={{
                body: {
                  row: Row,
                },
              }}
              columns={columns}
              dataSource={filteredPartData}
              rowKey="id"
              pagination={{
                current: partPagination.current,
                pageSize: partPagination.pageSize,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
                pageSizeOptions: ['10', '20', '50', '100'],
                placement: 'bottom',
                responsive: true,
              }}
              onChange={(paginationConfig) => {
                setPartPagination({
                  current: paginationConfig.current,
                  pageSize: paginationConfig.pageSize,
                });
              }}
              size="small"
              bordered
              className="modern-table"
              locale={{ emptyText: <Empty description={partSearchText ? "No parts found matching your search" : "No parts priority data found"} /> }}
              scroll={{ x: 1200 }}
            />
          </SortableContext>
        </DndContext>
      </div>
    );
  };



  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-2 sm:p-4 lg:p-6">
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
        @media (max-width: 768px) {
          .ant-table {
            font-size: 12px;
          }
          .ant-table-thead > tr > th,
          .ant-table-tbody > tr > td {
            padding: 8px 4px;
          }
        }
      `}</style>

      {contextHolder}

      <div className="bg-white rounded-lg lg:rounded-xl shadow-sm border border-gray-100 p-3 sm:p-4 mb-4 lg:mb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="w-full sm:w-auto">
                <Typography.Title 
                  level={2} 
                  style={{ margin: 0, fontSize: 'clamp(18px, 4vw, 24px)' }} 
                  className="flex items-center gap-2 sm:gap-3 text-gray-800"
                >
                    <OrderedListOutlined className="text-blue-600" />
                    <span className="hidden sm:inline">Parts Priority Management</span>
                    <span className="sm:hidden">Parts Priority</span>
                </Typography.Title>
                <Typography.Text className="text-gray-500 mt-1 block text-xs sm:text-sm">
                    Manage and reorder manufacturing priorities for all parts across projects
                </Typography.Text>
            </div>
        </div>
      </div>

      <Card className="shadow-sm rounded-lg lg:rounded-xl border border-gray-100" styles={{ body: { padding: 0 } }}>
        {renderPartWiseContent()}
      </Card>
    </div>
  );
};

export default PartsPriority;
