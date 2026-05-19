import React, { useState, useEffect } from "react";
import dayjs from "dayjs";
import Lottie from "lottie-react";
import warningAnimation from "../assets/warning.json";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";

dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

import { SCHEDULING_API_BASE_URL } from "../Config/schedulingconfig.js";
import config from "../Config/config.js";
import {
  Card, Row, Col, message, Spin, Button, Modal, Form, Radio, Space, Alert,
  Checkbox, Calendar, Tag, Table, Select, List, Upload, DatePicker,
  Tooltip, Popconfirm, Input
} from "antd";
import {
  CheckCircleOutlined, InfoCircleOutlined, ReloadOutlined,
  ExclamationCircleOutlined, UploadOutlined, EyeOutlined, SearchOutlined,
  LeftOutlined, DownloadOutlined, DeleteOutlined
} from "@ant-design/icons";

const { Dragger } = Upload;

// Shift option definitions — drives rendering via .map(), no repetition
const WORKING_DAY_SHIFTS = [
  { code: "GENERAL", label: "General (8:30 AM - 5:00 PM)",    desc: "Standard working hours",                color: "#1890ff", bg: "#e6f7ff", border: "#1890ff" },
  { code: "NEXT",    label: "5:00 PM - 9:00 PM",              desc: "Extended hours",                       color: "#fa8c16", bg: "#fff7e6", border: "#fa8c16" },
  { code: "HALF",    label: "Half Shift (8:30 AM - 1:00 PM)", desc: "Shortened hours (cannot combine)",     color: "#52c41a", bg: "#f6ffed", border: "#52c41a" },
  { code: "CUSTOM",  label: "Custom Shift",                    desc: "Define your own shift timings",        color: "#722ed1", bg: "#f9f0ff", border: "#722ed1" },
];

const NON_WORKING_DAY_SHIFTS = [
  { code: "GENERAL",     label: "General (8:30 AM - 5:00 PM)",         desc: "Full day option",                     color: "#1890ff", bg: "#e6f7ff", border: "#1890ff" },
  { code: "NEXT",        label: "5:00 PM - 9:00 PM",                   desc: "Extended hours",                      color: "#fa8c16", bg: "#fff7e6", border: "#fa8c16" },
  { code: "NON_WORKING", label: "Non-Working Day (8:30 AM - 1:00 PM)", desc: "Shortened hours for non-working days", color: "#52c41a", bg: "#f6ffed", border: "#52c41a" },
  { code: "CUSTOM",      label: "Custom Shift",                         desc: "Define your own shift timings",        color: "#722ed1", bg: "#f9f0ff", border: "#722ed1" },
];

const ShiftOption = ({ option, selected, onChange }) => (
  <div
    style={{
      padding: "12px 16px", borderRadius: "8px", cursor: "pointer", transition: "all 0.3s",
      background: selected ? option.bg : "#fff",
      border: `${selected ? 2 : 1}px solid ${selected ? option.border : "#d9d9d9"}`,
    }}
    onClick={() => onChange(option.code, !selected)}
  >
    <Space align="start">
      <Checkbox checked={selected} onChange={(e) => onChange(option.code, e.target.checked)} onClick={(e) => e.stopPropagation()} />
      <div>
        <div style={{ fontWeight: 600, color: option.color }}>{option.label}</div>
        <div style={{ fontSize: "12px", color: "#666" }}>{option.desc}</div>
      </div>
    </Space>
  </div>
);

const MaintenanceSection = ({ activeTab, machineData }) => {
  // Breakdown Logs state
  const [downtimeLogs, setDowntimeLogs] = useState([]);
  const [downtimeLoading, setDowntimeLoading] = useState(false);
  const [logSearchText, setLogSearchText] = useState(null);
  const [logWcSearchText, setLogWcSearchText] = useState(null);
  const [logPageSize, setLogPageSize] = useState(10);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileList, setFileList] = useState([]);
  const [selectedLog, setSelectedLog] = useState(null);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [machineDocuments, setMachineDocuments] = useState([]);
  const [selectedPreviewDoc, setSelectedPreviewDoc] = useState(null);

  // Shift Hours state
  const [shiftConfigs, setShiftConfigs] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [currentConfig, setCurrentConfig] = useState(null);
  const [shiftLoading, setShiftLoading] = useState(false);
  const [shiftForm] = Form.useForm();
  const [isWorkingDay, setIsWorkingDay] = useState(true);
  const [selectedShifts, setSelectedShifts] = useState(["GENERAL"]);
  const [otModalVisible, setOtModalVisible] = useState(false);
  const [pendingFormValues, setPendingFormValues] = useState(null);
  const [validationError, setValidationError] = useState(null);
  const [calendarDowntimes, setCalendarDowntimes] = useState([]);
  const [selectedDateDowntimes, setSelectedDateDowntimes] = useState([]);

  // Leave Logs state
  const [leaveLogs, setLeaveLogs] = useState([]);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [leavePageSize, setLeavePageSize] = useState(10);
  const [acknowledgingId, setAcknowledgingId] = useState(null);
  const [statusFilter, setStatusFilter] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [dateRange, setDateRange] = useState([]);

  useEffect(() => {
    if (activeTab === "downtime-logs") fetchDowntimeLogs();
    else if (activeTab === "shift-hours") { fetchShiftConfigs(); fetchCurrentBreakdowns(); }
    else if (activeTab === "leave-logs") fetchLeaveLogs();
  }, [activeTab]);

  // ── Breakdown Logs ──────────────────────────────────────────────────────
  const fetchDowntimeLogs = async () => {
    try {
      setDowntimeLoading(true);
      const res = await fetch(`${SCHEDULING_API_BASE_URL}/machine-status/machine-downtime/`);
      if (res.ok) {
        const data = await res.json();
        setDowntimeLogs((data || []).map((log, idx) => ({ ...log, tempId: log.id || `${log.machine_id}-${idx}` })));
      } else message.error("Failed to fetch downtime logs");
    } catch { message.error("Error fetching downtime logs"); }
    finally { setDowntimeLoading(false); }
  };

  const getCurrentUserId = () => {
    try { const u = JSON.parse(localStorage.getItem("user")); return u?.id || null; }
    catch { return null; }
  };

  const handleOpenUploadModal = (record) => { setSelectedLog(record); setUploadModalVisible(true); };
  const handleCloseUploadModal = () => { setUploadModalVisible(false); setFileList([]); setSelectedLog(null); };

  const handleOpenPreviewModal = async (record) => {
    setSelectedLog(record); setPreviewModalVisible(true); setPreviewLoading(true);
    try {
      const res = await fetch(`${config.API_BASE_URL}/machine-documents/machines/${record.machine_id}/documents`);
      if (res.ok) setMachineDocuments(await res.json());
      else message.error("Failed to fetch documents for this machine.");
    } catch { message.error("Error fetching machine documents."); }
    finally { setPreviewLoading(false); }
  };

  const handleClosePreviewModal = () => {
    setPreviewModalVisible(false); setMachineDocuments([]);
    setSelectedPreviewDoc(null); setSelectedLog(null);
  };

  const handleUpload = async () => {
    if (!fileList.length) { message.error("Please upload a file"); return; }
    const userId = getCurrentUserId();
    if (!userId) { message.error("Could not identify the current user. Please log in again."); return; }
    const formData = new FormData();
    fileList.forEach((f) => formData.append("files", f));
    formData.append("machine_id", selectedLog.machine_id);
    formData.append("user_id", userId);
    formData.append("document_type", "maintenance");
    try {
      setUploading(true);
      const res = await fetch(`${config.API_BASE_URL}/machine-documents/upload`, { method: "POST", body: formData });
      if (res.ok) { message.success("Uploaded successfully"); handleCloseUploadModal(); fetchDowntimeLogs(); }
      else { const e = await res.json(); message.error(e.detail || "File upload failed"); }
    } catch { message.error("Error uploading file"); }
    finally { setUploading(false); }
  };

  const handleDeleteDocument = (documentId) => {
    Modal.confirm({
      title: "Are you sure you want to delete this document?",
      content: "This action cannot be undone.",
      okText: "Yes, Delete", okType: "danger", cancelText: "No",
      onOk: async () => {
        try {
          const res = await fetch(`${config.API_BASE_URL}/machine-documents/documents/${documentId}`, { method: "DELETE" });
          if (res.ok) { message.success("Document deleted successfully"); if (selectedLog) handleOpenPreviewModal(selectedLog); }
          else message.error("Failed to delete document");
        } catch { message.error("Error deleting document"); }
      },
    });
  };

  const getMachineOptions = () => [...new Set((machineData?.statuses || []).map(i => i.machine_make))].map(n => ({ label: n, value: n }));
  const getWcOptions = () => [...new Set((machineData?.statuses || []).map(i => i.work_center_name))].map(w => ({ label: w, value: w }));

  // Leave Logs API functions
  const fetchLeaveLogs = async () => {
    try {
      setLeaveLoading(true);
      const res = await fetch(`${SCHEDULING_API_BASE_URL}/operator-leaves/`);
      if (res.ok) {
        const data = await res.json();
        setLeaveLogs(data || []);
      } else {
        message.error("Failed to fetch leave logs");
      }
    } catch (error) {
      console.error("Error fetching leave logs:", error);
      message.error("Error fetching leave logs");
    } finally {
      setLeaveLoading(false);
    }
  };

  const handleAcknowledgeLeave = async (leaveId) => {
    try {
      setAcknowledgingId(leaveId);
      const res = await fetch(`${SCHEDULING_API_BASE_URL}/operator-leaves/${leaveId}/approve`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'acknowledged' }),
      });

      if (res.ok) {
        message.success('Leave acknowledged successfully');
        // Refresh the leave logs
        fetchLeaveLogs();
      } else {
        const errorData = await res.json();
        message.error(errorData.detail || 'Failed to acknowledge leave');
      }
    } catch (error) {
      console.error('Error acknowledging leave:', error);
      message.error('Error acknowledging leave');
    } finally {
      setAcknowledgingId(null);
    }
  };

  const handleSearch = (value) => {
    setSearchText(value);
  };

  const handleDateRangeChange = (dates) => {
    setDateRange(dates || []);
  };

  const getFilteredLeaveLogs = () => {
    let filtered = leaveLogs;
    
    // Filter by operator name
    if (searchText) {
      filtered = filtered.filter(log => 
        log.operator_name?.toLowerCase().includes(searchText.toLowerCase())
      );
    }
    
    // Filter by date range
    if (dateRange && dateRange.length === 2) {
      const [startDate, endDate] = dateRange;
      filtered = filtered.filter(log => {
        const logDate = dayjs(log.from_date);
        return logDate.isAfter(startDate.startOf('day')) && logDate.isBefore(endDate.endOf('day'));
      });
    }
    
    return filtered;
  };

  const downtimeColumns = [
    { title: "Machine Name", dataIndex: "machine_name", key: "machine_name", sorter: (a, b) => a.machine_name.localeCompare(b.machine_name) },
    {
      title: "Status", dataIndex: "status_name", key: "status_name",
      render: (s) => {
        const l = s?.toLowerCase();
        const color = (l === "on" || l?.includes("active")) ? "green" : (l === "off" || l?.includes("inactive")) ? "red" : l?.includes("maintenance") ? "orange" : "default";
        return <Tag color={color}>{s}</Tag>;
      },
    },
    { title: "Description", dataIndex: "description", key: "description", ellipsis: true },
    { title: "Start Time", dataIndex: "start_time", key: "start_time", render: (d) => d ? new Date(d).toLocaleString() : "N/A", sorter: (a, b) => new Date(a.start_time) - new Date(b.start_time) },
    {
      title: "End Time", dataIndex: "end_time", key: "end_time", render: (d) => d ? new Date(d).toLocaleString() : "N/A",
      sorter: (a, b) => { if (!a.end_time && !b.end_time) return 0; if (!a.end_time) return 1; if (!b.end_time) return -1; return new Date(a.end_time) - new Date(b.end_time); },
    },
    {
      title: "Actions", key: "actions",
      render: (_, record) => (
        <Space>
          <Tooltip title="Upload document"><Button type="primary" size="small" icon={<UploadOutlined />} onClick={() => handleOpenUploadModal(record)}>Upload</Button></Tooltip>
          <Tooltip title="Preview documents"><Button type="default" size="small" icon={<EyeOutlined />} onClick={() => handleOpenPreviewModal(record)}>Preview</Button></Tooltip>
        </Space>
      ),
    },
  ];

  const leaveLogsColumns = [
    { 
      title: "Operator Name", 
      dataIndex: "operator_name", 
      key: "operator_name",
      sorter: (a, b) => a.operator_name?.localeCompare(b.operator_name || '')
    },
    { 
      title: "From Date", 
      dataIndex: "from_date", 
      key: "from_date",
      render: (date) => {
        if (!date) return "N/A";
        const d = new Date(date);
        return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
      },
      sorter: (a, b) => new Date(a.from_date) - new Date(b.from_date)
    },
    { 
      title: "To Date", 
      dataIndex: "to_date", 
      key: "to_date",
      render: (date) => {
        if (!date) return "N/A";
        const d = new Date(date);
        return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
      },
      sorter: (a, b) => new Date(a.to_date) - new Date(b.to_date)
    },
    { 
      title: "Days", 
      dataIndex: "days", 
      key: "days",
      render: (_, record) => {
        if (!record.from_date || !record.to_date) return "N/A";
        const fromDate = new Date(record.from_date);
        const toDate = new Date(record.to_date);
        const diffTime = Math.abs(toDate - fromDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // Include both days
        return diffDays;
      },
      sorter: (a, b) => {
        const getDays = (record) => {
          if (!record.from_date || !record.to_date) return 0;
          const fromDate = new Date(record.from_date);
          const toDate = new Date(record.to_date);
          const diffTime = Math.abs(toDate - fromDate);
          return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        };
        return getDays(a) - getDays(b);
      }
    },
    { 
      title: "Reason", 
      dataIndex: "reason", 
      key: "reason",
      render: (text) => text || '-',
      ellipsis: true
    },
    { 
      title: "Status", 
      dataIndex: "status", 
      key: "status",
      render: (status) => {
        let color = "default";
        if (status?.toLowerCase() === "pending") color = "orange";
        // else if (status?.toLowerCase() === "approved") color = "green";
        else if (status?.toLowerCase() === "acknowledged") color = "blue";
        // else if (status?.toLowerCase() === "rejected") color = "red";
        return <Tag color={color}>{status || "Unknown"}</Tag>;
      },
      filters: [
        { text: "Pending", value: "pending" },
        { text: "Acknowledged", value: "acknowledged" },
      ],
      onFilter: (value, record) => record.status?.toLowerCase() === value,
    },
    {
      title: "Action",
      key: "action",
      render: (_, record) => (
        <Button
          type="primary"
          size="small"
          onClick={() => handleAcknowledgeLeave(record.id)}
          loading={acknowledgingId === record.id}
          disabled={record.status?.toLowerCase() !== "pending"}
        >
          Acknowledge
        </Button>
      ),
    },
  ];

  // ── Shift Hours ─────────────────────────────────────────────────────────
  const fetchShiftConfigs = async () => {
    try {
      setShiftLoading(true);
      const res = await fetch(`${SCHEDULING_API_BASE_URL}/shift-hours/`);
      if (res.ok) setShiftConfigs(await res.json());
      else message.error("Failed to fetch shift configurations");
    } catch { message.error("Error fetching shift configurations"); }
    finally { setShiftLoading(false); }
  };

  const fetchCurrentBreakdowns = async () => {
    try {
      const res = await fetch(`${SCHEDULING_API_BASE_URL}/machine-status/machine-status/`);
      const data = await res.json();
      setCalendarDowntimes(data.statuses.filter(m => m.status_id === 2));
    } catch (err) { console.error("breakdown fetch error", err); }
  };

  const getDowntimesForDate = (date) =>
    calendarDowntimes.filter(m => {
      if (m.status_id !== 2) return false;
      const start = dayjs(m.available_from).startOf("day");
      const end = m.available_to ? dayjs(m.available_to).endOf("day") : dayjs().endOf("day");
      return date.isSameOrAfter(start) && date.isSameOrBefore(end);
    });

  const handleDateSelect = (date) => {
    const dateStr = date.format("YYYY-MM-DD");
    setSelectedDate(date);
    setSelectedDateDowntimes(getDowntimesForDate(date));
    const existing = shiftConfigs.find(c => dayjs(c.date).format("YYYY-MM-DD") === dateStr);
    if (existing) {
      setCurrentConfig(existing);
      setIsWorkingDay(existing.working_day);
      setSelectedShifts(existing.selected_shifts || ["GENERAL"]);
      const custom = existing.shift_timings?.find(t => t.shift_code === "CUSTOM");
      shiftForm.setFieldsValue({
        working_day: existing.working_day,
        custom_start: custom?.custom_start ? dayjs(custom.custom_start, "HH:mm:ss") : null,
        custom_end: custom?.custom_end ? dayjs(custom.custom_end, "HH:mm:ss") : null,
      });
    } else {
      setCurrentConfig(null); setIsWorkingDay(true); setSelectedShifts(["GENERAL"]);
      shiftForm.resetFields();
      shiftForm.setFieldsValue({ working_day: true, custom_start: null, custom_end: null });
    }
  };

  const handleSaveShiftConfig = async (values) => {
    if (!selectedDate) { message.error("Please select a date first"); return; }
    const isOT = isWorkingDay && selectedShifts.includes("GENERAL") && selectedShifts.includes("NEXT");
    if (isOT && !otModalVisible) { setPendingFormValues(values); setOtModalVisible(true); return; }
    try {
      setShiftLoading(true);
      const dateStr = selectedDate.format("YYYY-MM-DD");
      const existing = shiftConfigs.find(c => dayjs(c.date).format("YYYY-MM-DD") === dateStr);
      const configToUpdate = currentConfig?.id ? currentConfig : existing?.id ? existing : null;
      const payload = { date: dateStr, working_day: values.working_day, selected_shifts: selectedShifts };
      if (selectedShifts.includes("CUSTOM")) {
        if (!values.custom_start || !values.custom_end) { message.error("Please provide both custom start and end times"); setShiftLoading(false); return; }
        payload.custom_start = values.custom_start.format("HH:mm:ss");
        payload.custom_end = values.custom_end.format("HH:mm:ss");
      }
      const url = configToUpdate ? `${SCHEDULING_API_BASE_URL}/shift-hours/${configToUpdate.id}` : `${SCHEDULING_API_BASE_URL}/shift-hours/`;
      const res = await fetch(url, { method: configToUpdate ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.ok) {
        const saved = await res.json();
        message.success("Shift configuration saved successfully");
        setShiftConfigs(prev => configToUpdate ? prev.map(c => c.id === configToUpdate.id ? saved : c) : [...prev, saved]);
        setCurrentConfig(saved); setOtModalVisible(false); setPendingFormValues(null);
      } else { const e = await res.json(); message.error(e.detail || "Failed to save shift configuration"); }
    } catch { message.error("Error saving shift configuration"); }
    finally { setShiftLoading(false); }
  };

  const handleShiftCheckboxChange = (shiftCode, checked) => {
    setValidationError(null);
    if (checked) {
      if (shiftCode === "NON_WORKING" && selectedShifts.length > 0) { setValidationError("Non-Working shift cannot be combined with other shifts"); return; }
      if (selectedShifts.includes("NON_WORKING")) { setValidationError("Non-Working shift cannot be combined with other shifts"); return; }
      if (shiftCode === "HALF" && selectedShifts.length > 0) { setValidationError("Half shift cannot be combined with other shifts"); return; }
      if (selectedShifts.includes("HALF")) { setValidationError("Half shift cannot be combined with other shifts"); return; }
      setSelectedShifts(prev => [...prev, shiftCode]);
    } else {
      setSelectedShifts(prev => prev.filter(s => s !== shiftCode));
      if (shiftCode === "CUSTOM") shiftForm.setFieldsValue({ custom_start: null, custom_end: null });
    }
  };

  const handleWorkingDayChange = (e) => {
    const isWorking = e.target.value;
    setIsWorkingDay(isWorking); setValidationError(null);
    setSelectedShifts(isWorking ? ["GENERAL"] : ["NON_WORKING"]);
    shiftForm.setFieldsValue({ custom_start: null, custom_end: null });
  };

  const handleOTConfirm = () => { if (pendingFormValues) handleSaveShiftConfig(pendingFormValues); };
  const handleOTCancel = () => { setOtModalVisible(false); setPendingFormValues(null); setSelectedShifts(prev => prev.filter(s => s !== "NEXT")); };

  const handleClearConfig = () => {
    shiftForm.resetFields(); shiftForm.setFieldsValue({ working_day: true, custom_start: null, custom_end: null });
    setCurrentConfig(null); setIsWorkingDay(true); setSelectedShifts(["GENERAL"]); setValidationError(null);
  };

  const handleCancelShift = async () => {
    if (!currentConfig?.id) { message.info("No shift configuration to cancel"); return; }
    try {
      setShiftLoading(true);
      const res = await fetch(`${SCHEDULING_API_BASE_URL}/shift-hours/${currentConfig.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ working_day: false, selected_shifts: [] }),
      });
      if (res.ok) {
        const updated = await res.json();
        message.success("Shift configuration cancelled - set to 0 shifts");
        setShiftConfigs(prev => prev.map(c => c.id === currentConfig.id ? updated : c));
        setCurrentConfig(updated); setIsWorkingDay(false); setSelectedShifts([]);
      } else { const e = await res.json(); message.error(e.detail || "Failed to cancel shift configuration"); }
    } catch { message.error("Error cancelling shift configuration"); }
    finally { setShiftLoading(false); }
  };

  const dateCellRender = (value) => {
    const cfg = shiftConfigs.find(c => dayjs(c.date).format("YYYY-MM-DD") === value.format("YYYY-MM-DD"));
    const downtimes = getDowntimesForDate(value);
    const isSelected = selectedDate && value.isSame(selectedDate, "day");
    return (
      <div style={{ position: "relative", textAlign: "center", background: isSelected ? "#e6f7ff" : "transparent", borderRadius: "4px", padding: "2px", overflow: "hidden" }}>
        {downtimes.length > 0 && (
          <div style={{ position: "absolute", top: 0, left: 0, zIndex: 2 }}>
            <Lottie animationData={warningAnimation} loop autoplay style={{ width: 28, height: 28 }} speed={3.0} />
          </div>
        )}
        {cfg && (
          <div style={{ fontSize: "11px", lineHeight: 1.4 }}>
            <div style={{ color: cfg.working_day ? "#1890ff" : "#fa8c16", fontWeight: 600 }}>{cfg.working_day ? "Work" : "Off"}</div>
            <div style={{ color: "#666" }}>{cfg.number_of_shifts} shift{cfg.number_of_shifts !== 1 ? "s" : ""}</div>
          </div>
        )}
      </div>
    );
  };

  // ── Breakdown Logs Tab ──────────────────────────────────────────────────
  if (activeTab === "downtime-logs") {
    return (
      <div style={{ padding: "24px 0" }}>
        {downtimeLoading ? (
          <div style={{ textAlign: "center", padding: "50px" }}><Spin size="large" /><p>Loading downtime logs...</p></div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: 16, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 500 }}>Machine Name:</span>
              <Select placeholder={<span><SearchOutlined /> All Machines</span>} allowClear showSearch style={{ width: 250 }} value={logSearchText} onChange={setLogSearchText} options={getMachineOptions()} />
              <span style={{ fontWeight: 500, marginLeft: 16 }}>Work Center:</span>
              <Select placeholder={<span><SearchOutlined /> All Work Centers</span>} allowClear showSearch style={{ width: 250 }} value={logWcSearchText} onChange={setLogWcSearchText} options={getWcOptions()} />
            </div>

            <Table
              columns={downtimeColumns}
              dataSource={downtimeLogs.filter(i =>
                (!logSearchText || i.machine_name === logSearchText) &&
                (!logWcSearchText || i.work_center_name === logWcSearchText) &&
                (i.status_name?.toLowerCase() === "off" || i.status_id === 2)
              )}
              rowKey="tempId" scroll={{ x: 800 }}
              pagination={{ pageSize: logPageSize, showSizeChanger: true, showQuickJumper: true, pageSizeOptions: ["10","20","50","100"], onShowSizeChange: (_, size) => setLogPageSize(size), showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items` }}
              className="custom-table"
            />

            {/* Upload Modal */}
            <Modal title={`Upload File for ${selectedLog?.machine_name}`} open={uploadModalVisible} onCancel={handleCloseUploadModal}
              footer={[
                <Button key="back" onClick={handleCloseUploadModal}>Cancel</Button>,
                <Button key="submit" type="primary" loading={uploading} onClick={handleUpload}>{uploading ? "Uploading..." : "Upload"}</Button>,
              ]}>
              <Dragger multiple beforeUpload={(f) => { setFileList(p => [...p, f]); return false; }} onRemove={(f) => setFileList(p => p.filter(x => x !== f))} fileList={fileList}>
                <p className="ant-upload-drag-icon"><UploadOutlined /></p>
                <p className="ant-upload-text">Click or drag file to this area to upload</p>
                <p className="ant-upload-hint">Only PDF files and Images are allowed.</p>
              </Dragger>
            </Modal>

            {/* Preview Modal */}
            <Modal
              title={
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {selectedPreviewDoc && <Tooltip title="Back to list"><Button type="text" icon={<LeftOutlined />} onClick={() => setSelectedPreviewDoc(null)} /></Tooltip>}
                  <span>{selectedPreviewDoc ? selectedPreviewDoc.document_name : `Documents for ${selectedLog?.machine_name}`}</span>
                </div>
              }
              open={previewModalVisible} onCancel={handleClosePreviewModal} width={1000} centered
              bodyStyle={{ height: "70vh", padding: 0, overflow: "hidden" }}
              footer={[
                selectedPreviewDoc && <Tooltip key="back" title="Back"><Button icon={<LeftOutlined />} onClick={() => setSelectedPreviewDoc(null)}>Back to List</Button></Tooltip>,
                selectedPreviewDoc && <Tooltip key="del" title="Delete"><Button danger icon={<DeleteOutlined />} onClick={() => { handleDeleteDocument(selectedPreviewDoc.id); setSelectedPreviewDoc(null); }}>Delete</Button></Tooltip>,
                selectedPreviewDoc && <Tooltip key="dl" title="Download"><Button icon={<DownloadOutlined />} onClick={() => { const a = document.createElement("a"); a.href = selectedPreviewDoc.document_url; a.download = selectedPreviewDoc.document_name; document.body.appendChild(a); a.click(); document.body.removeChild(a); }}>Download</Button></Tooltip>,
                <Button key="close" type="primary" onClick={handleClosePreviewModal}>Close</Button>,
              ]}
            >
              {previewLoading ? (
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}><Spin size="large" /></div>
              ) : selectedPreviewDoc ? (
                <iframe src={selectedPreviewDoc.document_url} style={{ width: "100%", height: "100%", border: "none" }} title="Document Preview" />
              ) : machineDocuments.length > 0 ? (
                <List itemLayout="horizontal" dataSource={machineDocuments} style={{ padding: 24 }}
                  renderItem={(doc) => (
                    <List.Item actions={[
                      <Tooltip title="Preview"><Button type="link" icon={<EyeOutlined />} onClick={() => setSelectedPreviewDoc(doc)} /></Tooltip>,
                      <Tooltip title="Download"><Button type="link" icon={<DownloadOutlined />} href={doc.document_url} target="_blank" download /></Tooltip>,
                      <Tooltip title="Delete"><Button type="link" danger icon={<DeleteOutlined />} onClick={() => handleDeleteDocument(doc.id)} /></Tooltip>,
                    ]}>
                      <List.Item.Meta title={doc.document_name} description={`Uploaded on: ${new Date(doc.created_at).toLocaleString()}`} />
                    </List.Item>
                  )}
                />
              ) : (
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}><p>No documents found for this machine.</p></div>
              )}
            </Modal>
          </>
        )}
      </div>
    );
  }

  // ── Shift Hours Tab ─────────────────────────────────────────────────────
  if (activeTab === "shift-hours") {
    const isMobile = window.innerWidth < 768;
    const shiftOptions = isWorkingDay ? WORKING_DAY_SHIFTS : NON_WORKING_DAY_SHIFTS;

    return (
      <div style={{ padding: isMobile ? "10px" : "20px" }}>
        <Row gutter={[24, 24]}>
          {/* Calendar */}
          <Col xs={24} lg={16}>
            <Card title="Shift Calendar" extra={<Button icon={<ReloadOutlined />} onClick={fetchShiftConfigs} loading={shiftLoading} size={isMobile ? "small" : "middle"}>{isMobile ? "" : "Refresh Data"}</Button>}>
              {shiftLoading
                ? <div style={{ textAlign: "center", padding: 50 }}><Spin size="large" /><p>Loading shift configurations...</p></div>
                : <Calendar key={JSON.stringify(shiftConfigs)} onSelect={handleDateSelect} dateCellRender={dateCellRender} />}
            </Card>
          </Col>

          {/* Config Panel */}
          <Col xs={24} lg={8}>
            <Card title={selectedDate ? `Configure: ${selectedDate.format("DD MMM YYYY")}` : "Configure: Select Date"}>
              {selectedDate ? (
                <>
                  <Form form={shiftForm} layout="vertical" onFinish={handleSaveShiftConfig} initialValues={{ working_day: true, custom_start: null, custom_end: null }}>
                    <Form.Item label="Day Type" name="working_day" rules={[{ required: true }]}>
                      <Radio.Group onChange={handleWorkingDayChange} size={isMobile ? "small" : "middle"}>
                        <Radio.Button value={true}><CheckCircleOutlined style={{ color: "#52c41a", marginRight: 8 }} />Working Day</Radio.Button>
                        <Radio.Button value={false}><InfoCircleOutlined style={{ color: "#fa8c16", marginRight: 8 }} />Non-Working Day</Radio.Button>
                      </Radio.Group>
                    </Form.Item>

                    <Form.Item label="Shift Selection" required help={validationError && <span style={{ color: "#ff4d4f" }}>{validationError}</span>}>
                      <Card size="small" style={{ background: "#fafafa", border: validationError ? "1px solid #ff4d4f" : undefined }}>
                        <Space direction="vertical" style={{ width: "100%" }}>
                          {shiftOptions.map(opt => (
                            <ShiftOption key={opt.code} option={opt} selected={selectedShifts.includes(opt.code)} onChange={handleShiftCheckboxChange} />
                          ))}
                          {isWorkingDay && selectedShifts.includes("GENERAL") && selectedShifts.includes("NEXT") && (
                            <Alert message="Overtime (OT) Selected" description="Both General and Extended shifts selected. This will be marked as OT." type="warning" showIcon />
                          )}
                        </Space>
                      </Card>
                    </Form.Item>

                    {selectedShifts.includes("CUSTOM") && (
                      <>
                        <Form.Item label="Custom Start Time" name="custom_start" rules={[{ required: true, message: "Please select start time" }]}>
                          <DatePicker picker="time" format="HH:mm" style={{ width: "100%" }} placeholder="Select start time" />
                        </Form.Item>
                        <Form.Item label="Custom End Time" name="custom_end" rules={[{ required: true, message: "Please select end time" }]}>
                          <DatePicker picker="time" format="HH:mm" style={{ width: "100%" }} placeholder="Select end time" />
                        </Form.Item>
                      </>
                    )}

                    <Form.Item style={{ marginBottom: 0 }}>
                      <Space direction={isMobile ? "vertical" : "horizontal"} style={{ width: "100%" }}>
                        <Button type="primary" htmlType="submit" loading={shiftLoading} block={isMobile}>Save Changes</Button>
                        {currentConfig && (
                          <Popconfirm title="Cancel Shift Configuration?" description="This will set this date to 0 shifts." onConfirm={handleCancelShift} okText="Yes, Cancel" cancelText="No">
                            <Button danger loading={shiftLoading} block={isMobile} icon={<DeleteOutlined />}>Cancel Shift</Button>
                          </Popconfirm>
                        )}
                        <Button onClick={handleClearConfig} block={isMobile}>Clear</Button>
                      </Space>
                    </Form.Item>
                  </Form>

                  <Modal title="Overtime Confirmation" open={otModalVisible} onOk={handleOTConfirm} onCancel={handleOTCancel} okText="Yes, Confirm OT" cancelText="No, Cancel" centered>
                    <div style={{ textAlign: "center", padding: "20px 0" }}>
                      <ExclamationCircleOutlined style={{ fontSize: 48, color: "#fa8c16", marginBottom: 16 }} />
                      <p style={{ fontSize: 16, marginBottom: 8 }}>Are you sure you want to do <strong>Overtime (OT)</strong>?</p>
                      <p style={{ color: "#666" }}>You have selected both General (8:30 AM - 5:00 PM) and Extended (5:00 PM - 9:00 PM) shifts.</p>
                    </div>
                  </Modal>
                </>
              ) : (
                <div style={{ textAlign: "center", padding: "40px 0", color: "#999" }}>
                  <p>Please select a date from the calendar to configure shifts.</p>
                </div>
              )}
            </Card>

            {selectedDateDowntimes.length > 0 && (
              <Card title="Machine Breakdown" style={{ marginTop: 16, borderColor: "#ff4d4f" }}>
                {selectedDateDowntimes.map((m, idx) => (
                  <Card key={idx} size="small" style={{ marginBottom: 10, background: "#fff1f0", borderColor: "#ffccc7" }}>
                    <b>{m.machine_make}</b>
                    <p>Status: {m.status_name}</p>
                    <p>{m.description}</p>
                    <p><b>Start:</b> {dayjs(m.available_from).format("DD MMM YYYY HH:mm")}</p>
                    <p><b>End:</b> {m.available_to ? dayjs(m.available_to).format("DD MMM YYYY HH:mm") : "Ongoing"}</p>
                  </Card>
                ))}
              </Card>
            )}
          </Col>
        </Row>
      </div>
    );
  }

  // Leave Logs Tab
  if (activeTab === "leave-logs") {
    return (
      <div style={{ padding: "24px 0" }}>
        <div style={{ marginBottom: "24px" }}>
          <Row justify="space-between" align="middle">
            <Col>
              <h2 style={{ 
                margin: 0, 
                fontSize: "24px", 
                fontWeight: "bold",
                textTransform: "uppercase"
              }}>
                Operator Leave Logs
              </h2>
            </Col>
            <Col>
              <Space>
                <Input.Search
                  placeholder="Search by operator name"
                  allowClear
                  onSearch={handleSearch}
                  onChange={(e) => !e.target.value && setSearchText('')}
                  style={{ width: 200 }}
                />
                <DatePicker.RangePicker
                  onChange={handleDateRangeChange}
                  style={{ width: 250 }}
                  placeholder={['From date', 'To date']}
                  format="DD-MM-YYYY"
                />
                <Button
                  icon={<ReloadOutlined />}
                  onClick={fetchLeaveLogs}
                  loading={leaveLoading}
                  size="small"
                  title="Refresh Leave Logs"
                />
              </Space>
            </Col>
          </Row>
        </div>
        {leaveLoading ? (
          <div style={{ textAlign: "center", padding: "50px" }}>
            <Spin size="large" />
            <p>Loading leave logs...</p>
          </div>
        ) : (
          <Table
            columns={leaveLogsColumns}
            dataSource={getFilteredLeaveLogs()}
            rowKey="id"
            scroll={{ x: 800 }}
            pagination={{
              pageSize: leavePageSize,
              showSizeChanger: true,
              showQuickJumper: true,
              pageSizeOptions: ["10", "20", "50", "100"],
              onShowSizeChange: (_, size) => setLeavePageSize(size),
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
              simple: window.innerWidth < 768,
            }}
            className="custom-table"
          />
        )}
      </div>
    );
  }

  return null;
};
export default MaintenanceSection;