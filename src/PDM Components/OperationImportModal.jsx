import React, { useState, useEffect } from "react";
import { Modal, Upload, Button, Table, Tag, message } from "antd";
import { InboxOutlined, FileTextOutlined } from "@ant-design/icons";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth";

const { Dragger } = Upload;

const OperationImportModal = ({ open, onCancel, existingOperations = [], onUseOperations }) => {
  const [fileList, setFileList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [operations, setOperations] = useState([]);
  const [hasExtracted, setHasExtracted] = useState(false);

  // Calculate next operation number based on existing operations
  const calculateNextOpNumber = (index) => {
    if (existingOperations?.length > 0) {
      // Extract existing operation numbers and find the max
      const existingNumbers = existingOperations
        .map(op => {
          const num = parseInt(String(op.operation_number).trim());
          return isNaN(num) ? 0 : num;
        })
        .filter(num => num > 0);
      
      const maxNumber = Math.max(...existingNumbers, 0);
      return maxNumber + (index + 1) * 10;
    }
    // Default for new parts without existing operations
    return (index + 1) * 10;
  };

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setFileList([]);
      setOperations([]);
      setHasExtracted(false);
    }
  }, [open]);

  const handleBeforeUpload = (file) => {
    setFileList([file]);
    setOperations([]);
    setHasExtracted(false);
    // Automatically extract operations as soon as file is selected
    handleExtract(file);
    return false;
  };

  const handleRemove = () => {
    setFileList([]);
    setOperations([]);
    setHasExtracted(false);
  };

  const handleExtract = async (fileArg) => {
    const fileToUse = fileArg || fileList[0];
    if (!fileToUse) {
      message.warning("Select a file to upload");
      return;
    }
    setLoading(true);
    const formData = new FormData();
    formData.append("file", fileToUse);
    try {
      const response = await axios.post(
        `${API_BASE_URL}/operations/parse-mpp`,
        formData
      );
      const data = response.data;
      // Generate proper sequential operation numbers, ignoring file operation numbers
      const opsWithKeys = (data || []).map((op, idx) => ({
        ...op,
        operation_number: String(calculateNextOpNumber(idx)), // Override with proper sequence
        tempId: op.operation_number || `op-${idx}-${Date.now()}`
      }));
      setOperations(opsWithKeys);
      setHasExtracted(true);
      message.success(`Extracted ${data.length} operations`);
    } catch (error) {
      console.error("Error parsing MPP file:", error);
      message.error(error.message || "Error parsing file");
      setOperations([]);
    } finally {
      setLoading(false);
    }
  };

  const handleUseOperations = () => {
    if (!operations || operations.length === 0) {
      message.warning("No operations to use");
      return;
    }
    onUseOperations(operations);
    // Reset state after using
    setFileList([]);
    setOperations([]);
    setHasExtracted(false);
  };

  const handleClose = () => {
    setFileList([]);
    setOperations([]);
    setHasExtracted(false);
    onCancel();
  };

  const columns = [
    {
      title: "Op #",
      dataIndex: "operation_number",
      key: "operation_number",
      width: 80,
      render: (text, _, index) => (
        <Tag color="cyan" className="font-mono m-0 px-2 py-0.5">
          {text || String(index + 1).padStart(2, "0")}
        </Tag>
      )
    },
    {
      title: "Operation Name",
      dataIndex: "operation_name",
      key: "operation_name"
    },
    {
      title: "Setup Time",
      dataIndex: "setup_time",
      key: "setup_time",
      width: 120
    },
    {
      title: "Cycle Time",
      dataIndex: "cycle_time",
      key: "cycle_time",
      width: 120
    },
    {
      title: "Work Instructions",
      dataIndex: "work_instructions",
      key: "work_instructions"
    },
    {
      title: "Notes",
      dataIndex: "notes",
      key: "notes"
    }
  ];

  return (
    <Modal
      title={
        <div className="flex items-center gap-2">
          <FileTextOutlined className="text-blue-500" />
          <span>Upload MPP / Operation Sheet</span>
        </div>
      }
      open={open}
      onCancel={handleClose}
      footer={
        <div className="flex flex-col sm:flex-row justify-end gap-2 w-full">
          <Button onClick={handleClose} className="w-full sm:w-auto">Cancel</Button>
          <Button
            type="primary"
            onClick={handleUseOperations}
            disabled={!operations || operations.length === 0}
            className="w-full sm:w-auto"
          >
            Use In Operation Form
          </Button>
        </div>
      }
      destroyOnHidden
      width="95%"
      style={{ maxWidth: 900, top: 20 }}
      styles={{ body: { maxHeight: "70vh", overflowY: "auto", overflowX: "hidden" } }}
    >
      <div className="space-y-3 mt-2">
        <span className="text-xs text-slate-500 block">
          Step 1: Select file (operations will be extracted automatically). Step 2: Send to operation form.
        </span>
        <Dragger
          multiple={false}
          fileList={fileList}
          beforeUpload={handleBeforeUpload}
          onRemove={handleRemove}
          accept=".pdf,.docx,.csv,.xlsx,.xls"
          className="bg-gray-50 border-dashed border-2 py-5"
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined className="text-3xl text-blue-400" />
          </p>
          <p className="ant-upload-text">Click or drag DOCX / CSV / PDF / Excel here</p>
          <p className="ant-upload-hint text-xs text-gray-400">
            File should contain table with Op Number, Operation Name, times, instructions and notes
          </p>
        </Dragger>

        {operations && operations.length > 0 && (
          <div className="mt-2">
            <span className="text-xs font-semibold text-slate-600 mb-2 block">
              Preview ({operations.length} operations)
            </span>
            <Table
              size="small"
              dataSource={operations}
              columns={columns}
              rowKey="tempId"
              pagination={false}
              scroll={{ x: 600, y: 220 }}
            />
          </div>
        )}
      </div>
    </Modal>
  );
};

export default OperationImportModal;
