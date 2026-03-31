import React, { useState, useEffect } from "react";
import dayjs from "dayjs";
import Lottie from "lottie-react";
import warningAnimation from "../assets/warning.json";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";

dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

import { SCHEDULING_API_BASE_URL } from "../Config/schedulingconfig.js";
import { Card, Row, Col, message, Spin, Button, Modal, Form, Radio, Space, Alert, Checkbox, Calendar, Tag, Table, Select, Input, List, Upload, DatePicker, Tooltip } from "antd";
import { CheckCircleOutlined, InfoCircleOutlined, ReloadOutlined, ExclamationCircleOutlined, UploadOutlined, EyeOutlined, SearchOutlined, FilterOutlined, LeftOutlined, DownloadOutlined, DeleteOutlined } from "@ant-design/icons";

const { Dragger } = Upload;
const { TextArea } = Input;

const SHIFT_CODE_TO_LABEL = {
  GENERAL: "General (8:30 AM - 5:00 PM)",
  NEXT: "Next (5:00 PM - 9:00 PM)",
  NON_WORKING: "Non-Working (8:30 AM - 1:00 PM)",
  CUSTOM: "Custom",
};

const MaintenanceSection = ({ activeTab, machineData }) => {
  // Common states
  const [loading, setLoading] = useState(false);

  // --- Breakdown Logs State ---
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

  // --- Shift Hours State ---
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

  useEffect(() => {
    if (activeTab === "downtime-logs") {
      fetchDowntimeLogs();
    } else if (activeTab === "shift-hours") {
      fetchShiftConfigs();
      fetchCurrentBreakdowns();
    }
  }, [activeTab]);

  // --- Breakdown Logs Logic ---
  const fetchDowntimeLogs = async () => {
    try {
      setDowntimeLoading(true);
      const response = await fetch(`${SCHEDULING_API_BASE_URL}/machine-status/machine-downtime/`);
      if (response.ok) {
        const data = await response.json();
        const logsWithKeys = (data || []).map((log, idx) => ({
          ...log,
          tempId: log.id || `${log.machine_id}-${idx}-${Date.now()}`
        }));
        setDowntimeLogs(logsWithKeys);
      } else {
        message.error("Failed to fetch downtime logs");
      }
    } catch (error) {
      message.error("Error fetching downtime logs");
    } finally {
      setDowntimeLoading(false);
    }
  };

  const getCurrentUserId = () => {
    try {
      const stored = localStorage.getItem("user");
      if (!stored) return null;
      const u = JSON.parse(stored);
      return u?.id || null;
    } catch {
      return null;
    }
  };

  const handleOpenUploadModal = (record) => {
    setSelectedLog(record);
    setUploadModalVisible(true);
  };

  const handleCloseUploadModal = () => {
    setUploadModalVisible(false);
    setFileList([]);
    setSelectedLog(null);
  };

  const handleOpenPreviewModal = async (record) => {
    setSelectedLog(record);
    setPreviewModalVisible(true);
    setPreviewLoading(true);
    try {
      const response = await fetch(`http://172.18.100.76:8000/machine-documents/machines/${record.machine_id}/documents`);
      if (response.ok) {
        const data = await response.json();
        setMachineDocuments(data);
      } else {
        message.error("Failed to fetch documents for this machine.");
      }
    } catch (error) {
      message.error("Error fetching machine documents.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleClosePreviewModal = () => {
    setPreviewModalVisible(false);
    setMachineDocuments([]);
    setSelectedPreviewDoc(null);
    setSelectedLog(null);
  };

  const handleUpload = async () => {
    if (fileList.length === 0) {
      message.error("please upload the file");
      return;
    }
    const userId = getCurrentUserId();
    if (!userId) {
      message.error("Could not identify the current user. Please log in again.");
      return;
    }
    const formData = new FormData();
    fileList.forEach((file) => formData.append("files", file));
    formData.append("machine_id", selectedLog.machine_id);
    formData.append("user_id", userId);
    formData.append("document_type", "maintenance");
    setUploading(true);
    try {
      const response = await fetch(`http://172.18.100.76:8000/machine-documents/upload`, {
        method: 'POST',
        body: formData,
      });
      if (response.ok) {
        message.success("uploaded successfully");
        handleCloseUploadModal();
        fetchDowntimeLogs();
      } else {
        const errorData = await response.json();
        message.error(errorData.detail || "File upload failed");
      }
    } catch (error) {
      message.error("Error uploading file");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDocument = async (documentId) => {
    Modal.confirm({
      title: 'Are you sure you want to delete this document?',
      content: 'This action cannot be undone.',
      okText: 'Yes, Delete',
      okType: 'danger',
      cancelText: 'No',
      onOk: async () => {
        try {
          const response = await fetch(`http://172.18.100.76:8000/machine-documents/documents/${documentId}`, {
            method: 'DELETE',
          });
          if (response.ok) {
            message.success("Document deleted successfully");
            if (selectedLog) handleOpenPreviewModal(selectedLog);
          } else {
            message.error("Failed to delete document");
          }
        } catch (error) {
          message.error("Error deleting document");
        }
      }
    });
  };

  const getMachineOptions = () => {
    if (!machineData?.statuses) return [];
    const uniqueNames = [...new Set(machineData.statuses.map(item => item.machine_make))];
    return uniqueNames.map(name => ({ label: name, value: name }));
  };

  const getWcOptions = () => {
    if (!machineData?.statuses) return [];
    const uniqueWcs = [...new Set(machineData.statuses.map(item => item.work_center_name))];
    return uniqueWcs.map(wc => ({ label: wc, value: wc }));
  };

  const downtimeColumns = [
    { title: "Machine Name", dataIndex: "machine_name", key: "machine_name", sorter: (a, b) => a.machine_name.localeCompare(b.machine_name) },
    {
      title: "Status Name", dataIndex: "status_name", key: "status_name",
      render: (status) => {
        let color = "default";
        if (status?.toLowerCase() === 'on' || status?.toLowerCase().includes('active')) color = "green";
        else if (status?.toLowerCase() === 'off' || status?.toLowerCase().includes('inactive')) color = "red";
        else if (status?.toLowerCase().includes('maintenance')) color = "orange";
        return <Tag color={color}>{status}</Tag>;
      },
    },
    { title: "Description", dataIndex: "description", key: "description", ellipsis: true },
    { title: "Start Time", dataIndex: "start_time", key: "start_time", render: (date) => date ? new Date(date).toLocaleString() : "N/A", sorter: (a, b) => new Date(a.start_time) - new Date(b.start_time) },
    { title: "End Time", dataIndex: "end_time", key: "end_time", render: (date) => date ? new Date(date).toLocaleString() : "N/A", sorter: (a, b) => {
      if (!a.end_time && !b.end_time) return 0;
      if (!a.end_time) return 1;
      if (!b.end_time) return -1;
      return new Date(a.end_time) - new Date(b.end_time);
    }},
    { title: "Actions", key: "actions", render: (_, record) => (
      <Space>
        <Tooltip title="Upload document">
          <Button type="primary" size="small" icon={<UploadOutlined />} onClick={() => handleOpenUploadModal(record)}>Upload</Button>
        </Tooltip>
        <Tooltip title="Preview documents">
          <Button type="default" size="small" icon={<EyeOutlined />} onClick={() => handleOpenPreviewModal(record)}>Preview</Button>
        </Tooltip>
      </Space>
    )},
  ];

  // --- Shift Hours Logic ---
  const fetchShiftConfigs = async () => {
    try {
      setShiftLoading(true);
      const response = await fetch(`${SCHEDULING_API_BASE_URL}/shift-hours/`);
      if (response.ok) {
        const data = await response.json();
        setShiftConfigs(data);
      } else {
        message.error("Failed to fetch shift configurations");
      }
    } catch (error) {
      message.error("Error fetching shift configurations");
    } finally {
      setShiftLoading(false);
    }
  };

  const fetchCurrentBreakdowns = async () => {
    try {
      const res = await fetch(`${SCHEDULING_API_BASE_URL}/machine-status/machine-status/`);
      const data = await res.json();
      const breakdowns = data.statuses.filter(m => m.status_id === 2);
      setCalendarDowntimes(breakdowns);
    } catch (err) {
      console.error("breakdown fetch error", err);
    }
  };

  const handleDateSelect = (date) => {
    const dateStr = date.format('YYYY-MM-DD');
    setSelectedDate(date);
    const machines = getDowntimesForDate(date);
    setSelectedDateDowntimes(machines);
    const existingConfig = shiftConfigs.find(config => dayjs(config.date).format('YYYY-MM-DD') === dateStr);
    if (existingConfig) {
      setCurrentConfig(existingConfig);
      setIsWorkingDay(existingConfig.working_day);
      setSelectedShifts(existingConfig.selected_shifts || ["GENERAL"]);
      shiftForm.setFieldsValue({
        working_day: existingConfig.working_day,
        custom_start: existingConfig.shift_timings?.[0]?.custom_start ? dayjs(existingConfig.shift_timings[0].custom_start, 'HH:mm:ss') : null,
        custom_end: existingConfig.shift_timings?.[0]?.custom_end ? dayjs(existingConfig.shift_timings[0].custom_end, 'HH:mm:ss') : null,
      });
    } else {
      setCurrentConfig(null);
      setIsWorkingDay(true);
      setSelectedShifts(["GENERAL"]);
      shiftForm.resetFields();
      shiftForm.setFieldsValue({ working_day: true, custom_start: null, custom_end: null });
    }
  };

  const getDowntimesForDate = (date) => {
    return calendarDowntimes.filter(m => {
      if (m.status_id !== 2) return false;
      const start = dayjs(m.available_from).startOf("day");
      const end = m.available_to ? dayjs(m.available_to).endOf("day") : dayjs().endOf("day");
      return date.isSameOrAfter(start) && date.isSameOrBefore(end);
    });
  };

  const handleSaveShiftConfig = async (values) => {
    if (!selectedDate) {
      message.error('Please select a date first');
      return;
    }
    if (selectedShifts.includes("NEXT") && !selectedShifts.includes("GENERAL")) {
      message.error('5:00 PM - 9:00 PM shift requires General shift to be selected first (continuity requirement)');
      return;
    }
    const isOT = isWorkingDay && selectedShifts.includes("GENERAL") && selectedShifts.includes("NEXT");
    if (isOT && !otModalVisible) {
      setPendingFormValues(values);
      setOtModalVisible(true);
      return;
    }
    try {
      setShiftLoading(true);
      const dateStr = selectedDate.format('YYYY-MM-DD');
      const payload = { date: dateStr, working_day: values.working_day, selected_shifts: selectedShifts };
      if (selectedShifts.includes("CUSTOM")) {
        if (!values.custom_start || !values.custom_end) {
          message.error('Please provide both custom start and end times');
          setShiftLoading(false);
          return;
        }
        payload.custom_start = values.custom_start.format('HH:mm:ss');
        payload.custom_end = values.custom_end.format('HH:mm:ss');
      }
      let response;
      if (currentConfig) {
        response = await fetch(`${SCHEDULING_API_BASE_URL}/shift-hours/${currentConfig.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      } else {
        response = await fetch(`${SCHEDULING_API_BASE_URL}/shift-hours/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      }
      if (response.ok) {
        const savedConfig = await response.json();
        message.success('Shift configuration saved successfully');
        if (currentConfig) setShiftConfigs(prev => prev.map(config => config.id === currentConfig.id ? savedConfig : config));
        else setShiftConfigs(prev => [...prev, savedConfig]);
        setCurrentConfig(savedConfig);
        setOtModalVisible(false);
        setPendingFormValues(null);
      } else {
        const errorData = await response.json();
        message.error(errorData.detail || 'Failed to save shift configuration');
      }
    } catch (error) {
      message.error('Error saving shift configuration');
    } finally {
      setShiftLoading(false);
    }
  };

  const handleShiftCheckboxChange = (shiftCode, checked) => {
    setValidationError(null);
    if (!isWorkingDay) {
      if (checked) {
        setSelectedShifts([shiftCode]);
      } else {
        // At least one must be selected? 
        // Based on image, it looks like radio-like behavior.
        // If they uncheck the only one, we might want to keep it or let it be empty.
        // Usually, in such UIs, one should stay selected.
        // Let's allow it to be empty if they really want, but typically one is selected.
        setSelectedShifts(prev => prev.filter(s => s !== shiftCode));
      }
      return;
    }
    
    if (checked) {
      if (shiftCode === "NEXT" && !selectedShifts.includes("GENERAL")) {
        setValidationError("5:00 PM - 9:00 PM shift requires General shift to be selected first (continuity requirement)");
        return;
      }
      setSelectedShifts(prev => [...prev, shiftCode]);
    } else {
      setSelectedShifts(prev => prev.filter(s => s !== shiftCode));
    }
  };

  const handleOTConfirm = () => { if (pendingFormValues) handleSaveShiftConfig(pendingFormValues); };
  const handleOTCancel = () => { setOtModalVisible(false); setPendingFormValues(null); setSelectedShifts(prev => prev.filter(s => s !== "NEXT")); };
  const handleClearConfig = () => { shiftForm.resetFields(); shiftForm.setFieldsValue({ working_day: true, custom_start: null, custom_end: null }); setCurrentConfig(null); setIsWorkingDay(true); setSelectedShifts(["GENERAL"]); setValidationError(null); };
  const handleRefresh = () => fetchShiftConfigs();
  const getDateCellData = (date) => {
    const dateStr = date.format('YYYY-MM-DD');
    return shiftConfigs.find(config => dayjs(config.date).format('YYYY-MM-DD') === dateStr);
  };

  const dateCellRender = (value) => {
    const config = getDateCellData(value);
    const downtimes = getDowntimesForDate(value);
    const isSelected = selectedDate && value.isSame(selectedDate, 'day');
    
    return (
      <div style={{ 
        position: "relative", 
        textAlign: "center", 
        minHeight: 60,
        background: isSelected ? "#e6f7ff" : "transparent",
        borderRadius: "4px",
        padding: "4px",
        transition: "all 0.3s"
      }}>
        {downtimes.length > 0 && (
          <div style={{ position: "absolute", top: 2, left: 2, zIndex: 2 }}>
            <Lottie animationData={warningAnimation} loop autoplay style={{ width: 35, height: 35}} speed={3.0} />
          </div>
        )}
        {config && (
          <div style={{ fontSize: "12px" }}>
            <div style={{ color: config.working_day ? "#1890ff" : "#fa8c16", fontWeight: "bold" }}>{config.working_day ? "Work" : "Off"}</div>
            <div style={{ color: "#666" }}>
              {config.number_of_shifts} shift{config.number_of_shifts !== 1 ? "s" : ""}
            </div>
          </div>
        )}
      </div>
    );
  };

  const handleWorkingDayChange = (e) => {
    const isWorking = e.target.value;
    setIsWorkingDay(isWorking);
    setValidationError(null);
    if (!isWorking) { setSelectedShifts(["NON_WORKING"]); shiftForm.setFieldsValue({ custom_start: null, custom_end: null }); }
    else { setSelectedShifts(["GENERAL"]); shiftForm.setFieldsValue({ custom_start: null, custom_end: null }); }
  };

  if (activeTab === "downtime-logs") {
    return (
      <div style={{ padding: '24px 0' }}>
        {downtimeLoading ? (
          <div style={{ textAlign: 'center', padding: '50px' }}><Spin size="large" /><p>Loading downtime logs...</p></div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 500 }}>Machine Name:</span>
                <Select placeholder={<span><SearchOutlined /> All Machines</span>} allowClear showSearch style={{ width: 250 }} value={logSearchText} onChange={value => setLogSearchText(value)} options={getMachineOptions()} />
                <span style={{ fontWeight: 500, marginLeft: '16px' }}>Work Center:</span>
                <Select placeholder={<span><SearchOutlined /> All Work Centers</span>} allowClear showSearch style={{ width: 250 }} value={logWcSearchText} onChange={value => setLogWcSearchText(value)} options={getWcOptions()} />
              </div>
            </div>
            <Table
              columns={downtimeColumns}
              dataSource={downtimeLogs.filter(item => 
                (!logSearchText || item.machine_name === logSearchText) &&
                (!logWcSearchText || item.work_center_name === logWcSearchText) &&
                (item.status_name?.toLowerCase() === 'off' || item.status_id === 2)
              )}
              rowKey="tempId"
              scroll={{ x: 800 }}
              pagination={{ pageSize: logPageSize, showSizeChanger: true, showQuickJumper: true, pageSizeOptions: ['10', '20', '50', '100'], onShowSizeChange: (current, size) => setLogPageSize(size), showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items` }}
              className="custom-table"
            />

            {/* Upload Modal */}
            <Modal title={`Upload File for ${selectedLog?.machine_name}`} open={uploadModalVisible} onCancel={handleCloseUploadModal} footer={[<Button key="back" onClick={handleCloseUploadModal}>Cancel</Button>, <Button key="submit" type="primary" loading={uploading} onClick={handleUpload}>{uploading ? "Uploading..." : "Upload"}</Button>]}>
              <Dragger multiple={true} beforeUpload={(file) => { setFileList(prev => [...prev, file]); return false; }} onRemove={(file) => { setFileList(prev => { const index = prev.indexOf(file); const newFileList = prev.slice(); newFileList.splice(index, 1); return newFileList; }); }} fileList={fileList}>
                <p className="ant-upload-drag-icon"><UploadOutlined /></p>
                <p className="ant-upload-text">Click or drag file to this area to upload</p>
                <p className="ant-upload-hint">Support for a single or bulk upload. Only PDF files and Images are allowed.</p>
              </Dragger>
            </Modal>

            {/* Preview Modal */}
            <Modal 
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {selectedPreviewDoc && (
                    <Tooltip title="Back to list">
                      <Button type="text" icon={<LeftOutlined />} onClick={() => setSelectedPreviewDoc(null)} />
                    </Tooltip>
                  )}
                  <span>{selectedPreviewDoc ? selectedPreviewDoc.document_name : `Documents for ${selectedLog?.machine_name}`}</span>
                </div>
              } 
              open={previewModalVisible} 
              onCancel={handleClosePreviewModal} 
              footer={[
                selectedPreviewDoc && (
                  <Tooltip key="back" title="Back to list">
                    <Button icon={<LeftOutlined />} onClick={() => setSelectedPreviewDoc(null)}>Back to List</Button>
                  </Tooltip>
                ), 
                selectedPreviewDoc && (
                  <Tooltip key="delete" title="Delete document">
                    <Button danger icon={<DeleteOutlined />} onClick={() => { handleDeleteDocument(selectedPreviewDoc.id); setSelectedPreviewDoc(null); }}>Delete</Button>
                  </Tooltip>
                ), 
                selectedPreviewDoc && (
                  <Tooltip key="download" title="Download document">
                    <Button icon={<DownloadOutlined />} onClick={() => { const link = document.createElement('a'); link.href = selectedPreviewDoc.document_url; link.download = selectedPreviewDoc.document_name; document.body.appendChild(link); link.click(); document.body.removeChild(link); }}>Download</Button>
                  </Tooltip>
                ), 
                <Button key="close" type="primary" onClick={handleClosePreviewModal}>Close</Button>
              ]} 
              width={1000} 
              centered 
              bodyStyle={{ height: '70vh', padding: 0, overflow: 'hidden' }}
            >
              {previewLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><div style={{ textAlign: 'center' }}><Spin size="large" /><p style={{ marginTop: 16 }}>Loading documents...</p></div></div>
              ) : selectedPreviewDoc ? (
                <iframe src={selectedPreviewDoc.document_url} style={{ width: '100%', height: '100%', border: 'none' }} title="Document Preview" />
              ) : machineDocuments.length > 0 ? (
                <List 
                  itemLayout="horizontal" 
                  dataSource={machineDocuments} 
                  style={{ padding: '24px' }} 
                  renderItem={(doc) => (
                    <List.Item actions={[
                      <Tooltip title="Preview">
                        <Button type="link" icon={<EyeOutlined />} onClick={() => setSelectedPreviewDoc(doc)} />
                      </Tooltip>, 
                      <Tooltip title="Download">
                        <Button type="link" icon={<DownloadOutlined />} href={doc.document_url} target="_blank" download />
                      </Tooltip>, 
                      <Tooltip title="Delete">
                        <Button type="link" danger icon={<DeleteOutlined />} onClick={() => handleDeleteDocument(doc.id)} />
                      </Tooltip>
                    ]}>
                      <List.Item.Meta title={doc.document_name} description={`Uploaded on: ${new Date(doc.created_at).toLocaleString()}`} />
                    </List.Item>
                  )} 
                />
              ) : (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><p>No documents found for this machine.</p></div>
              )}
            </Modal>
          </>
        )}
      </div>
    );
  }

  if (activeTab === "shift-hours") {
    return (
      <div style={{ padding: window.innerWidth < 768 ? '10px' : '20px' }}>
        <Row gutter={[24, 24]}>
          <Col xs={24} lg={16}>
            <Card title="Shift Calendar" extra={<Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={shiftLoading} size={window.innerWidth < 768 ? 'small' : 'middle'}>{window.innerWidth < 768 ? '' : 'Refresh Data'}</Button>}>
              {shiftLoading ? (
                <div style={{ textAlign: 'center', padding: '50px' }}><Spin size="large" /><p>Loading shift configurations...</p></div>
              ) : (
                <Calendar key={JSON.stringify(shiftConfigs)} onSelect={handleDateSelect} dateCellRender={dateCellRender} />
              )}
            </Card>
          </Col>
          <Col xs={24} lg={8}>
            <Card title={selectedDate ? `Configure: ${selectedDate.format('DD MMM YYYY')}` : 'Configure: Select Date'}>
              {selectedDate ? (
                <>
                  <Form form={shiftForm} layout="vertical" onFinish={handleSaveShiftConfig} initialValues={{ working_day: true, custom_start: null, custom_end: null }}>
                    <Form.Item label="Day Type" name="working_day" rules={[{ required: true, message: 'Please select day type' }]}><Radio.Group onChange={handleWorkingDayChange} size={window.innerWidth < 768 ? 'small' : 'middle'}><Radio.Button value={true}><CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />Working Day</Radio.Button><Radio.Button value={false}><InfoCircleOutlined style={{ color: '#fa8c16', marginRight: 8 }} />Non-Working Day</Radio.Button></Radio.Group></Form.Item>
                    <Form.Item label="Shift Selection" required help={validationError && <span style={{ color: '#ff4d4f' }}>{validationError}</span>}><Card size="small" style={{ background: '#fafafa', border: validationError ? '1px solid #ff4d4f' : undefined }}>
                      {isWorkingDay ? (
                        <Space direction="vertical" style={{ width: '100%' }}>
                          <div style={{ padding: '12px 16px', borderRadius: '8px', background: selectedShifts.includes("GENERAL") ? '#e6f7ff' : '#fff', border: selectedShifts.includes("GENERAL") ? '2px solid #1890ff' : '1px solid #d9d9d9', cursor: 'pointer', transition: 'all 0.3s' }} onClick={() => handleShiftCheckboxChange("GENERAL", !selectedShifts.includes("GENERAL"))}><Space align="start"><Checkbox checked={selectedShifts.includes("GENERAL")} onChange={(e) => handleShiftCheckboxChange("GENERAL", e.target.checked)} onClick={(e) => e.stopPropagation()} /><div><div style={{ fontWeight: 600, color: '#1890ff' }}>General (8:30 AM - 5:00 PM)</div><div style={{ fontSize: '12px', color: '#666' }}>Standard working hours</div></div></Space></div>
                          <div style={{ padding: '12px 16px', borderRadius: '8px', background: selectedShifts.includes("NEXT") ? '#fff7e6' : '#fff', border: selectedShifts.includes("NEXT") ? '2px solid #fa8c16' : '1px solid #d9d9d9', cursor: selectedShifts.includes("GENERAL") ? 'pointer' : 'not-allowed', opacity: selectedShifts.includes("GENERAL") ? 1 : 0.5, transition: 'all 0.3s' }} onClick={() => selectedShifts.includes("GENERAL") && handleShiftCheckboxChange("NEXT", !selectedShifts.includes("NEXT"))}><Space align="start"><Checkbox checked={selectedShifts.includes("NEXT")} disabled={!selectedShifts.includes("GENERAL")} onChange={(e) => selectedShifts.includes("GENERAL") && handleShiftCheckboxChange("NEXT", e.target.checked)} onClick={(e) => e.stopPropagation()} /><div><div style={{ fontWeight: 600, color: '#fa8c16' }}>5:00 PM - 9:00 PM</div><div style={{ fontSize: '12px', color: '#666' }}>Extended hours (requires General shift) {selectedShifts.includes("NEXT") && selectedShifts.includes("GENERAL") && <Tag color="orange" size="small">OT</Tag>}</div></div></Space></div>
                          {selectedShifts.includes("GENERAL") && selectedShifts.includes("NEXT") && <Alert message="Overtime (OT) Selected" description="You have selected both General and Extended shifts. This will be marked as OT." type="warning" showIcon style={{ marginTop: 8 }} />}
                        </Space>
                      ) : (
                        <Space direction="vertical" style={{ width: '100%' }}>
                          <div style={{ padding: '12px 16px', borderRadius: '8px', background: selectedShifts.includes("GENERAL") ? '#e6f7ff' : '#fff', border: selectedShifts.includes("GENERAL") ? '2px solid #1890ff' : '1px solid #d9d9d9', cursor: 'pointer', transition: 'all 0.3s' }} onClick={() => handleShiftCheckboxChange("GENERAL", !selectedShifts.includes("GENERAL"))}><Space align="start"><Checkbox checked={selectedShifts.includes("GENERAL")} onChange={(e) => handleShiftCheckboxChange("GENERAL", e.target.checked)} onClick={(e) => e.stopPropagation()} /><div><div style={{ fontWeight: 600, color: '#1890ff' }}>General (8:30 AM - 5:00 PM)</div><div style={{ fontSize: '12px', color: '#666' }}>Full day option</div></div></Space></div>
                          <div style={{ padding: '12px 16px', borderRadius: '8px', background: selectedShifts.includes("NON_WORKING") ? '#f6ffed' : '#fff', border: selectedShifts.includes("NON_WORKING") ? '2px solid #52c41a' : '1px solid #d9d9d9', cursor: 'pointer', transition: 'all 0.3s' }} onClick={() => handleShiftCheckboxChange("NON_WORKING", !selectedShifts.includes("NON_WORKING"))}><Space align="start"><Checkbox checked={selectedShifts.includes("NON_WORKING")} onChange={(e) => handleShiftCheckboxChange("NON_WORKING", e.target.checked)} onClick={(e) => e.stopPropagation()} /><div><div style={{ fontWeight: 600, color: '#52c41a' }}>Non-Working Day (8:30 AM - 1:00 PM)</div><div style={{ fontSize: '12px', color: '#666' }}>Shortened hours for non-working days</div></div></Space></div>
                          <div style={{ padding: '12px 16px', borderRadius: '8px', background: selectedShifts.includes("CUSTOM") ? '#f9f0ff' : '#fff', border: selectedShifts.includes("CUSTOM") ? '2px solid #722ed1' : '1px solid #d9d9d9', cursor: 'pointer', transition: 'all 0.3s' }} onClick={() => handleShiftCheckboxChange("CUSTOM", !selectedShifts.includes("CUSTOM"))}><Space align="start"><Checkbox checked={selectedShifts.includes("CUSTOM")} onChange={(e) => handleShiftCheckboxChange("CUSTOM", e.target.checked)} onClick={(e) => e.stopPropagation()} /><div><div style={{ fontWeight: 600, color: '#722ed1' }}>Custom Shift</div><div style={{ fontSize: '12px', color: '#666' }}>Define your own shift timings</div></div></Space></div>
                        </Space>
                      )}
                    </Card></Form.Item>
                    {selectedShifts.includes("CUSTOM") && (<><Form.Item label="Custom Start Time" name="custom_start" rules={[{ required: true, message: 'Please select start time' }]}><DatePicker picker="time" format="HH:mm" style={{ width: '100%' }} placeholder="Select start time" /></Form.Item><Form.Item label="Custom End Time" name="custom_end" rules={[{ required: true, message: 'Please select end time' }]}><DatePicker picker="time" format="HH:mm" style={{ width: '100%' }} placeholder="Select end time" /></Form.Item></>)}
                    <Form.Item style={{ marginBottom: 0 }}><Space direction={window.innerWidth < 768 ? 'vertical' : 'horizontal'} style={{ width: '100%' }}><Button type="primary" htmlType="submit" loading={shiftLoading} block={window.innerWidth < 768}>Save Changes</Button><Button onClick={handleClearConfig} block={window.innerWidth < 768}>Clear</Button></Space></Form.Item>
                  </Form>
                  <Modal title="Overtime Confirmation" open={otModalVisible} onOk={handleOTConfirm} onCancel={handleOTCancel} okText="Yes, Confirm OT" cancelText="No, Cancel" centered><div style={{ textAlign: 'center', padding: '20px 0' }}><ExclamationCircleOutlined style={{ fontSize: 48, color: '#fa8c16', marginBottom: 16 }} /><p style={{ fontSize: 16, marginBottom: 8 }}>Are you sure you want to do <strong>Overtime (OT)</strong>?</p><p style={{ color: '#666' }}>You have selected both General (8:30 AM - 5:00 PM) and Extended (5:00 PM - 9:00 PM) shifts.</p></div></Modal>
                </>
              ) : (<div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}><p>Please select a date from the calendar to configure shifts.</p></div>)}
            </Card>
            {selectedDateDowntimes.length > 0 && (
              <Card title="Machine Breakdown" style={{ marginTop: 16, borderColor: "#ff4d4f" }}>{selectedDateDowntimes.map((m, idx) => (<Card key={idx} size="small" style={{ marginBottom: 10, background: "#fff1f0", borderColor: "#ffccc7" }}><b>{m.machine_make}</b><p>Status: {m.status_name}</p><p>{m.description}</p><p><b>Start:</b> {dayjs(m.available_from).format("DD MMM YYYY HH:mm")}</p><p><b>End:</b> {m.available_to ? dayjs(m.available_to).format("DD MMM YYYY HH:mm") : "Ongoing"}</p></Card>))}</Card>
            )}
          </Col>
        </Row>
      </div>
    );
  }

  return null;
};

export default MaintenanceSection;
