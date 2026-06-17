import React, { useState, useEffect } from "react";
import { BellOutlined, CheckOutlined, FilterOutlined, ReloadOutlined, DeleteOutlined, FileTextFilled, ToolFilled, AppstoreFilled, ShoppingFilled, CalendarOutlined, SearchOutlined, FolderFilled, SettingFilled, BuildFilled } from "@ant-design/icons";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth";
import { Card, Badge, Button, App, message, Typography, Tag, Empty, Spin, Space, Drawer, Tooltip, Row, Col, Statistic, DatePicker, Select, Input } from "antd";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;
const { Search } = Input;
const PCNotifications = () => {
  const { message: antMessage } = App.useApp();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [entityFilter, setEntityFilter] = useState("all"); // all, order, part, operation, document
  const [dateRange, setDateRange] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState(null); // For order-wise filtering
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [drawerVisible, setDrawerVisible] = useState(false);

  const getCurrentUser = () => {
    try {
      const stored = localStorage.getItem("user");
      if (!stored) return null;
      const user = JSON.parse(stored);
      return user;
    } catch {
      return null;
    }
  };

  const fetchNotifications = async (unreadOnly = false) => {
    setLoading(true);
    try {
      const user = getCurrentUser();
      if (!user || !user.id) {
        antMessage.error("User not found");
        return;
      }

      const params = new URLSearchParams();
      params.append("limit", "50");
      if (unreadOnly) {
        params.append("unread_only", "true");
      }

      const response = await axios.get(
        `${API_BASE_URL}/pc-notifications/${user.id}?${params.toString()}`
      );
      setNotifications(response.data || []);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      antMessage.error("Failed to fetch notifications");
    } finally {
      setLoading(false);
    }
  };

  const fetchUnreadCount = async () => {
    try {
      const user = getCurrentUser();
      if (!user || !user.id) return;

      const response = await axios.get(
        `${API_BASE_URL}/pc-notifications/${user.id}/unread-count`
      );
      setUnreadCount(response.data.unread_count || 0);
    } catch (error) {
      console.error("Error fetching unread count:", error);
    }
  };

  const markAsRead = async (notificationId) => {
    try {
      await axios.put(`${API_BASE_URL}/pc-notifications/${notificationId}/read`);
      // Update local state
      setNotifications(prev =>
        prev.map(notif =>
          notif.id === notificationId ? { ...notif, is_read: true, read_at: new Date() } : notif
        )
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
      antMessage.success("Notification marked as read");
    } catch (error) {
      console.error("Error marking as read:", error);
      antMessage.error("Failed to mark as read");
    }
  };

  const markAllAsRead = async () => {
    try {
      const user = getCurrentUser();
      if (!user || !user.id) return;

      await axios.put(`${API_BASE_URL}/pc-notifications/${user.id}/read-all`);
      setNotifications(prev =>
        prev.map(notif => ({ ...notif, is_read: true, read_at: new Date() }))
      );
      setUnreadCount(0);
      antMessage.success("All notifications marked as read");
    } catch (error) {
      console.error("Error marking all as read:", error);
      antMessage.error("Failed to mark all as read");
    }
  };

  const getActionColor = (action) => {
    const colors = {
      created: "green",
      updated: "blue",
      deleted: "red",
      soft_deleted: "orange",
      restored: "cyan",
      schedule_activated: "purple",
      order_approved: "green",
      order_rejected: "red",
    };
    return colors[action] || "default";
  };

  const getActionLabel = (action) => {
    const labels = {
      created: "Created",
      updated: "Updated",
      deleted: "Deleted",
      soft_deleted: "Moved to Recycle Bin",
      restored: "Restored",
      schedule_activated: "Schedule Activated",
      order_approved: "Order Approved",
      order_rejected: "Order Rejected",
    };
    return labels[action] || action;
  };

  const getEntityTypeLabel = (entityType) => {
    const labels = {
      part: "Part",
      operation: "Operation",
      document: "Document",
      assembly: "Assembly",
      order: "Order",
      order_document: "Order Document",
    };
    return labels[entityType] || entityType;
  };

  const getEntityTypeIcon = (entityType) => {
    const icons = {
      part: <AppstoreFilled />,
      operation: <BuildFilled />,
      document: <FileTextFilled />,
      order: <ShoppingFilled />,
      order_document: <FolderFilled />,
      assembly: <SettingFilled />,
    };
    return icons[entityType] || <BellOutlined />;
  };

  const getUniqueOrders = () => {
    const orders = new Map();
    notifications.forEach(n => {
      if (n.sale_order_number && n.order_id) {
        orders.set(n.order_id, {
          order_id: n.order_id,
          sale_order_number: n.sale_order_number,
          product_name: n.product_name
        });
      }
    });
    return Array.from(orders.values());
  };

  const getFilteredNotifications = () => {
    let filtered = notifications;
    
    // Filter by selected order (order-wise filtering)
    if (selectedOrderId) {
      filtered = filtered.filter(n => n.order_id === selectedOrderId);
    }
    
    // Filter by entity type
    if (entityFilter === "order") {
      filtered = filtered.filter(n => n.sale_order_number);
    } else if (entityFilter !== "all") {
      filtered = filtered.filter(n => n.entity_type === entityFilter);
    }
    
    // Filter by date range
    if (dateRange && dateRange.length === 2) {
      const [startDate, endDate] = dateRange;
      filtered = filtered.filter(n => {
        const timestamp = dayjs(n.timestamp);
        return timestamp.isAfter(startDate) && timestamp.isBefore(endDate);
      });
    }
    
    // Filter by search term (order number, part number, entity name, etc.)
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(n => {
        return (
          (n.sale_order_number && n.sale_order_number.toLowerCase().includes(searchLower)) ||
          (n.entity_name && n.entity_name.toLowerCase().includes(searchLower)) ||
          (n.product_name && n.product_name.toLowerCase().includes(searchLower)) ||
          (n.user_name && n.user_name.toLowerCase().includes(searchLower)) ||
          (n.entity_id && n.entity_id.toString().includes(searchLower))
        );
      });
    }
    
    return filtered;
  };

  const getEntityDisplayName = (notif) => {
    // First try entity_name
    if (notif.entity_name) {
      return notif.entity_name;
    }
    
    // Then try to get from details
    if (notif.details) {
      if (notif.details.part_name) return notif.details.part_name;
      if (notif.details.part_number) return notif.details.part_number;
      if (notif.details.operation_name) return notif.details.operation_name;
      if (notif.details.operation_number) return notif.details.operation_number;
      if (notif.details.document_name) return notif.details.document_name;
    }
    
    // Last resort: show nothing instead of ID
    return null;
  };

  const getCountByType = (type) => {
    if (type === "all") return notifications.length;
    if (type === "order") return notifications.filter(n => n.sale_order_number).length;
    return notifications.filter(n => n.entity_type === type).length;
  };

  useEffect(() => {
    fetchNotifications();
    fetchUnreadCount();

    return () => {};
  }, []);

  return (
    <div style={{ padding: "16px", background: "#f0f2f5", minHeight: "100vh" }}>
      <Row gutter={[16, 16]} style={{ marginBottom: "16px" }}>
        <Col xs={12} sm={12} md={6} lg={6}>
          <Card>
            <Statistic
              title="Total"
              value={notifications.length}
              prefix={<BellOutlined />}
              styles={{ content: { color: "#1890ff" } }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6} lg={6}>
          <Card>
            <Statistic
              title="Unread"
              value={unreadCount}
              prefix={<CheckOutlined />}
              styles={{ content: { color: "#52c41a" } }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6} lg={6}>
          <Card>
            <Statistic
              title="Orders"
              value={getCountByType("order")}
              prefix={<ShoppingFilled />}
              styles={{ content: { color: "#722ed1" } }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6} lg={6}>
          <Card>
            <Statistic
              title="Parts"
              value={getCountByType("part")}
              prefix={<AppstoreFilled />}
              styles={{ content: { color: "#fa8c16" } }}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title={
          <Space>
            <BellOutlined />
            <span>Notifications</span>
            <Badge count={unreadCount} offset={[10, 0]} />
          </Space>
        }
        extra={
          <Space wrap>
            <Select
              value={selectedOrderId}
              onChange={setSelectedOrderId}
              style={{ width: 180 }}
              placeholder="Select Order"
              allowClear
              showSearch
              optionFilterProp="children"
            >
              {getUniqueOrders().map(order => (
                <Option key={order.order_id} value={order.order_id}>
                  {order.sale_order_number} - {order.product_name || "No Product"}
                </Option>
              ))}
            </Select>
            <Select
              value={entityFilter}
              onChange={setEntityFilter}
              style={{ width: 120 }}
              placeholder="Type"
            >
              <Option value="all">All</Option>
              <Option value="order">Order</Option>
              <Option value="part">Part</Option>
              <Option value="operation">Operation</Option>
              <Option value="document">Document</Option>
            </Select>
            <Search
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: 150 }}
              allowClear
              prefix={<SearchOutlined />}
            />
            <RangePicker
              value={dateRange}
              onChange={setDateRange}
              format="YYYY-MM-DD"
              placeholder={["Start", "End"]}
              style={{ width: 200 }}
            />
            <Button icon={<CalendarOutlined />} onClick={() => setDateRange(null)} size="small">
              Clear Date
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => fetchNotifications()} size="small">
              Refresh
            </Button>
            {unreadCount > 0 && (
              <Button icon={<CheckOutlined />} onClick={markAllAsRead} size="small">
                Mark All Read
              </Button>
            )}
          </Space>
        }
      >
        {loading ? (
          <div style={{ textAlign: "center", padding: "48px" }}>
            <Spin size="large" />
          </div>
        ) : getFilteredNotifications().length === 0 ? (
          <Empty
            description="No notifications found"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <div>
            {getFilteredNotifications().map((notif) => (
              <div
                key={notif.id}
                style={{
                  background: notif.is_read ? "white" : "#e6f7ff",
                  padding: "16px",
                  marginBottom: "12px",
                  borderRadius: "12px",
                  border: notif.is_read ? "1px solid #d9d9d9" : "2px solid #1890ff",
                  boxShadow: notif.is_read ? "none" : "0 2px 8px rgba(24, 144, 255, 0.15)",
                  transition: "all 0.3s ease",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <div style={{ display: "flex", gap: "16px", flex: 1 }}>
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "10px",
                      background: notif.is_read ? "#f0f0f0" : "#1890ff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: notif.is_read ? "#999" : "white",
                      fontSize: "18px",
                      flexShrink: 0,
                    }}
                  >
                    {getEntityTypeIcon(notif.entity_type)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div>
                      <Space size="small" wrap>
                        <Text strong style={{ fontSize: "14px" }}>
                          {getEntityTypeLabel(notif.entity_type)}
                        </Text>
                        <Tag color={getActionColor(notif.action)} style={{ fontSize: "11px" }}>
                          {getActionLabel(notif.action)}
                        </Tag>
                        {notif.sale_order_number && (
                          <Tag color="purple" style={{ fontSize: "11px" }}>
                            Order: {notif.sale_order_number}
                          </Tag>
                        )}
                      </Space>
                      {notif.product_name && (
                        <div style={{ marginTop: "6px" }}>
                          <Tag color="orange" style={{ fontSize: "12px", fontWeight: 500 }}>
                            Product: {notif.product_name}
                          </Tag>
                        </div>
                      )}
                      {getEntityDisplayName(notif) && (
                        <div style={{ marginTop: "4px" }}>
                          <Text style={{ fontSize: "13px" }}>
                            {getEntityDisplayName(notif)}
                          </Text>
                        </div>
                      )}
                      {notif.part_name && (
                        <div style={{ marginTop: "4px" }}>
                          <Text type="secondary" style={{ fontSize: "12px" }}>
                            Part: {notif.part_name}
                          </Text>
                          {notif.part_number && (
                            <Text type="secondary" style={{ fontSize: "12px", marginLeft: "8px" }}>
                              ({notif.part_number})
                            </Text>
                          )}
                        </div>
                      )}
                      {notif.document_version && (
                        <div style={{ marginTop: "4px" }}>
                          <Tag color="cyan" style={{ fontSize: "11px" }}>
                            Revision: {notif.document_version}
                          </Tag>
                        </div>
                      )}
                    </div>
                    <div style={{ marginTop: "8px" }}>
                      <Space size="small" wrap style={{ marginTop: "4px" }}>
                        <Text type="secondary" style={{ fontSize: "12px" }}>
                          By {notif.user_name}
                        </Text>
                        <Tag color="blue" style={{ fontSize: "10px" }}>
                          {notif.user_role}
                        </Tag>
                        <Text type="secondary" style={{ fontSize: "12px" }}>
                          • {dayjs(notif.timestamp).fromNow()}
                        </Text>
                      </Space>
                      {notif.details && Object.keys(notif.details).length > 0 && (
                        <Button
                          type="link"
                          size="small"
                          onClick={() => {
                            setSelectedNotification(notif);
                            setDrawerVisible(true);
                          }}
                          style={{ padding: 0, marginTop: "4px" }}
                        >
                          View Details →
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                {!notif.is_read && (
                  <Button
                    type="primary"
                    size="small"
                    icon={<CheckOutlined />}
                    onClick={() => markAsRead(notif.id)}
                    style={{ flexShrink: 0 }}
                  >
                    Mark Read
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Drawer
        title="Notification Details"
        placement="right"
        size="large"
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
      >
        {selectedNotification && (
          <Space orientation="vertical" size="large" style={{ width: "100%" }}>
            <div style={{ padding: "16px", background: "#f5f5f5", borderRadius: "8px" }}>
              <Text strong style={{ fontSize: "16px" }}>
                {getEntityTypeLabel(selectedNotification.entity_type)}
              </Text>
              <br />
              {getEntityDisplayName(selectedNotification) && (
                <Text style={{ fontSize: "14px", marginTop: "8px" }}>
                  {getEntityDisplayName(selectedNotification)}
                </Text>
              )}
            </div>
            
            <div>
              <Text strong>Action:</Text>
              <br />
              <Tag color={getActionColor(selectedNotification.action)} style={{ fontSize: "14px" }}>
                {getActionLabel(selectedNotification.action)}
              </Tag>
            </div>
            
            {selectedNotification.sale_order_number && (
              <div>
                <Text strong>Order:</Text>
                <br />
                <Tag color="purple" style={{ fontSize: "14px" }}>
                  {selectedNotification.sale_order_number}
                </Tag>
              </div>
            )}
            
            {selectedNotification.product_name && (
              <div>
                <Text strong>Product:</Text>
                <br />
                <Text>{selectedNotification.product_name}</Text>
              </div>
            )}
            
            {selectedNotification.part_name && (
              <div>
                <Text strong>Part:</Text>
                <br />
                <Text>{selectedNotification.part_name}</Text>
                {selectedNotification.part_number && (
                  <Text type="secondary" style={{ marginLeft: "8px" }}>
                    ({selectedNotification.part_number})
                  </Text>
                )}
              </div>
            )}
            
            {selectedNotification.document_version && (
              <div>
                <Text strong>Document Version:</Text>
                <br />
                <Tag color="cyan" style={{ fontSize: "14px" }}>
                  Revision: {selectedNotification.document_version}
                </Tag>
              </div>
            )}
            
            <div>
              <Text strong>Changed By:</Text>
              <br />
              <Space>
                <Text>{selectedNotification.user_name}</Text>
                <Tag color="blue">{selectedNotification.user_role}</Tag>
              </Space>
            </div>
            
            <div>
              <Text strong>Time:</Text>
              <br />
              <Text>{dayjs(selectedNotification.timestamp).format("YYYY-MM-DD HH:mm:ss")}</Text>
            </div>
            
            {selectedNotification.details && (
              <div>
                <Text strong>Details:</Text>
                <br />
                {selectedNotification.details.changes ? (
                  <div style={{ marginTop: "12px" }}>
                    {Object.entries(selectedNotification.details.changes)
                      .filter(([field, values]) => values.old !== values.new) // Only show changed fields
                      .map(([field, values]) => (
                      <div key={field} style={{ marginBottom: "12px", padding: "12px", background: "#f9f9f9", borderRadius: "8px" }}>
                        <Text strong style={{ fontSize: "13px", textTransform: "capitalize" }}>
                          {field.replace(/_/g, " ")}
                        </Text>
                        <div style={{ marginTop: "8px", display: "flex", gap: "16px" }}>
                          <div style={{ flex: 1 }}>
                            <Text type="secondary" style={{ fontSize: "12px" }}>Old:</Text>
                            <div style={{ 
                              padding: "6px 10px", 
                              background: "#ffebee", 
                              borderRadius: "4px",
                              fontSize: "13px",
                              wordBreak: "break-word"
                            }}>
                              {values.old || "None"}
                            </div>
                          </div>
                          <div style={{ flex: 1 }}>
                            <Text type="secondary" style={{ fontSize: "12px" }}>New:</Text>
                            <div style={{ 
                              padding: "6px 10px", 
                              background: "#e8f5e9", 
                              borderRadius: "4px",
                              fontSize: "13px",
                              fontWeight: 500,
                              color: "#2e7d32",
                              wordBreak: "break-word"
                            }}>
                              {values.new || "None"}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ marginTop: "12px" }}>
                    {Object.entries(selectedNotification.details)
                      .filter(([key, value]) => key !== "changes" && value !== null && value !== undefined)
                      .map(([key, value]) => (
                      <div key={key} style={{ marginBottom: "8px", padding: "10px", background: "#f0f7ff", borderRadius: "6px" }}>
                        <Text strong style={{ fontSize: "13px", textTransform: "capitalize", color: "#1890ff" }}>
                          {key.replace(/_/g, " ")}:
                        </Text>
                        <div style={{ marginTop: "4px", fontSize: "13px", wordBreak: "break-word" }}>
                          {typeof value === "object" ? JSON.stringify(value, null, 2) : String(value)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Space>
        )}
      </Drawer>
    </div>
  );
};

export default PCNotifications;
