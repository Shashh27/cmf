import React, { useEffect, useMemo, useState } from "react";
import {
  PlusOutlined,
  DownloadOutlined,
  EyeOutlined,
  SyncOutlined,
  InboxOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  DeleteOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  Badge,
  Button,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Select,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from "antd";
import axios from "axios";
import { API_BASE_URL } from "../../Config/auth";
import AssemblyPartsUploadPanel from "./AssemblyPartsUploadPanel";

const { Text } = Typography;
const { Dragger } = Upload;

const sanitizeDeleteError = (e) => {
  const raw =
    e?.response?.data?.detail ||
    e?.response?.data?.message ||
    e?.message ||
    "";
  const msg = String(raw || "");
  if (!msg) return "Failed to delete document";
  if (msg.toLowerCase().includes("foreignkeyviolation") || msg.toLowerCase().includes("violates foreign key")) {
    return "Cannot delete this document because it has versions (child documents). Delete the versions first.";
  }
  return msg.length > 160 ? `${msg.slice(0, 160)}...` : msg;
};

const AssemblyDocumentsPanel = ({ selectedItem, partTypes = [], onPartsCreated }) => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);

  const [previewDocument, setPreviewDocument] = useState(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadParentId, setUploadParentId] = useState(null);

  // New state for multiple document rows
  const initialUploadRow = {
    id: Date.now(),
    fileList: [],
    docName: "",
    docType: "2D",
    docTypeOther: "",
    version: "v1.0"
  };
  const [uploadRows, setUploadRows] = useState([initialUploadRow]);

  useEffect(() => {
    if (selectedItem?.itemType === "assembly") {
      fetchDocuments();
    } else {
      setDocuments([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItem?.id, selectedItem?.itemType]);

  const resetUploadState = () => {
    setUploadParentId(null);
    setUploadRows([{ ...initialUploadRow, id: Date.now() }]);
  };

  const addUploadRow = () => {
    if (uploadParentId) return; // Only 1 row for new version
    setUploadRows(prev => [...prev, { ...initialUploadRow, id: Date.now() }]);
  };

  const removeUploadRow = (id) => {
    if (uploadRows.length > 1) {
      setUploadRows(prev => prev.filter(row => row.id !== id));
    }
  };

  const updateUploadRow = (id, field, value) => {
    setUploadRows(prev => prev.map(row => 
      row.id === id ? { ...row, [field]: value } : row
    ));
  };

  const handleVersionChangeInRow = (id, value) => {
    // Always start with 'v' if not present
    if (value && !value.startsWith('v')) {
      value = 'v' + value;
    }
    
    // Remove invalid characters but keep v, digits, dots, and alphanumeric
    value = value.replace(/[^v0-9.a-zA-Z]/g, '');
    
    // Ensure only one 'v' at the beginning
    if (value.startsWith('v')) {
      value = 'v' + value.substring(1).replace(/v/g, '');
    }
    
    // Ensure only one dot
    const parts = value.split('.');
    if (parts.length > 2) {
      value = parts[0] + '.' + parts.slice(1).join('');
    }
    
    // Limit to exactly 3 characters before decimal (including 'v'), and max 3 characters after decimal
    const match = value.match(/^(v\d{0,2})(?:\.(\d{0,3}[a-zA-Z0-9]{0,3}))?$/);
    if (match) {
      let major = match[1] || 'v';
      let afterDecimal = match[2] || '';

      value = major;
      // Always include decimal point
      value += '.';
      // Add after decimal content (max 3 characters)
      if (afterDecimal) {
        afterDecimal = afterDecimal.substring(0, 3);
        value += afterDecimal;
      }
    } else {
      // Fallback for initial 'v' or 'v12' (max 3 chars total)
      const initialMatch = value.match(/^(v\d{0,2})/);
      if (initialMatch) {
        value = initialMatch[1] + '.';
      }
    }
    
    updateUploadRow(id, 'version', value);
  };

  const fetchDocuments = async () => {
    if (!selectedItem || selectedItem.itemType !== "assembly") {
      setDocuments([]);
      return;
    }

    setLoading(true);
    try {
      const res = await axios.get(
        `${API_BASE_URL}/documents/assembly/${selectedItem.id}`
      );
      setDocuments(res.data || []);
    } catch (e) {
      console.error("Error loading assembly documents", e);
      message.error("Failed to load assembly documents");
    } finally {
      setLoading(false);
    }
  };

  const groupedDocs = useMemo(() => {
    return documents.reduce((acc, doc) => {
      const rootId = doc.parent_id || doc.id;
      if (!acc[rootId]) acc[rootId] = [];
      acc[rootId].push(doc);
      return acc;
    }, {});
  }, [documents]);

  const latestDocs = useMemo(() => {
    return Object.values(groupedDocs).map((group) =>
      [...group].sort((a, b) => a.id - b.id)[0]
    );
  }, [groupedDocs]);

  const [selectedVersions, setSelectedVersions] = useState({});

  useEffect(() => {
    const parseV = (v) => parseFloat(String(v || "").replace(/^v/i, "")) || 0;
    setSelectedVersions((prev) => {
      const next = {};
      for (const [rootId, group] of Object.entries(groupedDocs)) {
        const sorted = [...group].sort((a, b) => a.id - b.id);
        const current = prev[rootId];
        const exists = current && group.some((d) => d.id === current.id);
        next[rootId] = exists ? current : sorted[0];
      }
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length !== nextKeys.length) return next;
      for (const k of nextKeys) {
        if (prev[k]?.id !== next[k]?.id) return next;
      }
      return prev;
    });
  }, [groupedDocs]);

  const getDocumentDisplayName = (doc) => {
    if (!doc) return "";
    if (doc.document_url) {
      const segment = doc.document_url.split("/").filter(Boolean).pop();
      if (segment) return segment.replace(/^\d{8}_\d{6}_[a-zA-Z0-9]+_/, ""); // strip timestamp and unique ID e.g. 20260330_094250_ab0e25a8_
    }
    return doc.document_name || "";
  };

  const getPreviewType = (name) => {
    const ext = (name || "").split(".").pop().toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "svg"].includes(ext)) return "image";
    if (ext === "pdf") return "pdf";
    return "other";
  };

  const handlePreview = (doc) => {
    setPreviewDocument(doc);
    setIsPreviewModalOpen(true);
  };

  const handleDownload = (documentId) => {
    const url = `${API_BASE_URL}/documents/${documentId}/download`;
    const link = document.createElement("a");
    link.href = url;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDelete = async (documentId) => {
    try {
      await axios.delete(`${API_BASE_URL}/documents/${documentId}`);
      message.success("Document deleted");
      // Optimistic UI update so it disappears immediately
      setDocuments((prev) => prev.filter((d) => d.id !== documentId));
      fetchDocuments();
    } catch (e) {
      console.error("Error deleting document", e);
      message.error(sanitizeDeleteError(e));
    }
  };

  const handleVersionChange = (e) => {
    // This is kept for compatibility if needed elsewhere, 
    // but handleVersionChangeInRow is preferred now
  };

  const initiateNewVersion = (doc, latestVer) => {
    const nextVer =
      "v" + (parseFloat(String(latestVer).replace(/^v/i, "")) + 1.0).toFixed(1);
    
    setUploadParentId(doc.parent_id || doc.id);
    setUploadRows([{
      id: Date.now(),
      fileList: [],
      // For new versions: leave empty until user selects file
      docName: "",
      docType: doc.document_type || "2D",
      docTypeOther: "",
      version: nextVer
    }]);
    setIsUploadModalOpen(true);
  };

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

  const handleUpload = async () => {
    if (!selectedItem || selectedItem.itemType !== "assembly") return;
    
    for (const row of uploadRows) {
      if (row.fileList.length === 0) {
        message.warning(`Please select a file for document: ${row.docName || 'New'}`);
        return;
      }
      if (!row.docName.trim()) {
        message.warning("Please enter document name for all rows");
        return;
      }
      if (row.docType === "Other" && !row.docTypeOther.trim()) {
        message.warning(`Please enter custom document type for ${row.docName}`);
        return;
      }
    }

    setUploading(true);

    try {
      // Bulk upload: one request for all upload rows
      const formData = new FormData();
      formData.append("assembly_id", String(selectedItem.id));

      const uid = getCurrentUserId();
      if (uid != null) formData.append("user_id", String(uid));

      for (const row of uploadRows) {
        const file = row.fileList?.[0];
        if (!file) continue;

        formData.append("files", file);
        formData.append("document_name", row.docName.trim());

        const effectiveType = row.docType === "Other" ? row.docTypeOther.trim() : row.docType;
        formData.append("document_type", effectiveType);
        formData.append("document_version", row.version || "v1.0");

        // For new version upload, backend expects parent_id aligned per file
        if (uploadParentId) formData.append("parent_id", String(uploadParentId));
      }

      const resp = await axios.post(`${API_BASE_URL}/documents/bulk`, formData);
      const created = Array.isArray(resp.data) ? resp.data : [];
      message.success(`${created.length} document(s) uploaded successfully`);

      resetUploadState();
      setIsUploadModalOpen(false);
      fetchDocuments();
    } catch (e) {
      console.error("Error uploading documents", e);
      message.error("Error uploading documents");
    } finally {
      setUploading(false);
    }
  };

  const columns = [
    {
      title: <span className="text-xs font-semibold whitespace-nowrap">DOCUMENT NAME</span>,
      key: "document_name",
      width: "35%",
      render: (_, record) => {
        const rootId = record.parent_id || record.id;
        const currentDoc = selectedVersions[rootId] || record;
        const isLatest = currentDoc.id === record.id;
        return (
          <div className="flex items-center gap-3 py-1">
            <div className="p-2 bg-blue-50 rounded flex-shrink-0">
              <FilePdfOutlined className="text-blue-500" />
            </div>
            <div className="flex flex-col min-w-0">
              <Text strong className="text-sm truncate">
                {getDocumentDisplayName(currentDoc) || currentDoc.document_name}
              </Text>
              {!isLatest && (
                <span className="text-[10px] text-gray-400">
                  Showing older version
                </span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      title: <span className="text-xs font-semibold whitespace-nowrap">DOCUMENT TYPE</span>,
      key: "document_type",
      width: "25%",
      render: (_, record) => {
        const rootId = record.parent_id || record.id;
        const currentDoc = selectedVersions[rootId] || record;
        return (
          <Tag className="m-0 text-xs px-2 py-1 leading-4 uppercase bg-blue-100 text-blue-700 border-none whitespace-nowrap">
            {currentDoc.document_type || "2D"}
          </Tag>
        );
      },
    },
    {
      title: <span className="text-xs font-semibold whitespace-nowrap">VERSION</span>,
      key: "version",
      width: "20%",
      render: (_, record) => {
        const rootId = record.parent_id || record.id;
        const group = groupedDocs[rootId] || [];
        const currentDoc = selectedVersions[rootId] || record;
        const versionWidth = "100%";
        const fmtV = (v) => (String(v || "1.0").startsWith("v") ? String(v || "1.0") : `v${v || "1.0"}`);

        if (group.length <= 1) {
          const ver = currentDoc.document_version || "1.0";
          return (
            <Select
              size="small"
              value={currentDoc.id}
              disabled
              suffixIcon={null}
              variant="filled"
              style={{ width: versionWidth }}
              options={[{ value: currentDoc.id, label: fmtV(ver) }]}
            />
          );
        }

        return (
          <Select
            size="small"
            value={currentDoc.id}
            labelInValue={false}
            optionLabelProp="label"
            onChange={(val) => {
              const selected = group.find((d) => d.id === val);
              if (selected) {
                setSelectedVersions((prev) => ({ ...prev, [rootId]: selected }));
              }
            }}
            variant="filled"
            style={{ width: versionWidth }}
            popupMatchSelectWidth={false}
            styles={{ popup: { root: { minWidth: 120, padding: 4 } } }}
          >
            {[...group]
              .sort((a, b) => a.id - b.id)
              .map((ver) => {
                const verLabel = fmtV(ver.document_version || "1.0");
                return (
                  <Select.Option key={ver.id} value={ver.id} label={verLabel}>
                    <span className={`font-bold ${ver.id === currentDoc.id ? "text-blue-600" : "text-gray-600"}`}>
                      {verLabel}
                    </span>
                  </Select.Option>
                );
              })}
          </Select>
        );
      },
    },
    {
      title: <span className="text-xs font-semibold whitespace-nowrap text-center block">ACTIONS</span>,
      key: "actions",
      width: "20%",
      align: "center",
      render: (_, record) => {
        const rootId = record.parent_id || record.id;
        const currentDoc = selectedVersions[rootId] || record;
        const latestDoc = record;
        return (
          <div className="flex gap-1 justify-center">
            <Button
              size="small"
              type="text"
              icon={<EyeOutlined />}
              onClick={() => handlePreview(currentDoc)}
              className="hover:text-blue-500 hover:bg-blue-50"
            />
            <Button
              size="small"
              type="text"
              icon={<DownloadOutlined />}
              onClick={() => handleDownload(currentDoc.id)}
              className="hover:text-green-500 hover:bg-green-50"
            />
            <Button
              size="small"
              type="text"
              icon={<SyncOutlined />}
              className="text-orange-500 hover:bg-orange-50"
              onClick={() =>
                initiateNewVersion(latestDoc, latestDoc.document_version)
              }
            />
            <Popconfirm
              title="Delete Document"
              description="Delete this version? This cannot be undone."
              onConfirm={() => handleDelete(currentDoc.id)}
              okText="Yes"
              cancelText="No"
            >
              <Button
                size="small"
                type="text"
                danger
                icon={<DeleteOutlined />}
                className="hover:bg-red-50"
              />
            </Popconfirm>
          </div>
        );
      },
    },
  ];

  if (!selectedItem || selectedItem.itemType !== "assembly") {
    return <div className="flex-1 bg-gray-50" />;
  }

  return (
    <div className="flex-1 bg-white overflow-hidden flex flex-col h-full">
      <style>
        {`
          .assembly-upload-modal .ant-modal-body {
            padding: 12px 12px;
          }
          @media (min-width: 640px) {
            .assembly-upload-modal .ant-modal-body {
              padding: 18px 20px;
            }
          }
          .assembly-upload-modal .ant-upload {
            width: 100%;
          }
        `}
      </style>
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 px-3 pt-3 pb-2 border-b border-slate-100">
        <div>
          <div className="text-sm font-semibold text-slate-800">
            Assembly Documents
          </div>
          <div className="text-xs text-slate-500">
            Manage documents for this assembly / sub-assembly
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <AssemblyPartsUploadPanel
            selectedItem={selectedItem}
            partTypes={partTypes}
            onPartsCreated={onPartsCreated}
          />
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => {
            resetUploadState();
            setIsUploadModalOpen(true);
          }}
          >
            Add Document
          </Button>
        </div>
    </div>

    <div className="flex-1 min-h-0 overflow-hidden px-3 pb-3">
      <Table
        loading={loading}
        dataSource={latestDocs}
        rowKey="id"
        size="small"
        pagination={false}
        columns={columns}
        className="docs-ebom-table border border-slate-100 rounded-lg overflow-hidden"
        locale={{
          emptyText: (
            <Empty
              description="No documents added for this assembly"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ),
        }}
        scroll={{ x: true, y: "calc(100vh - 260px)" }}
      />
    </div>

    <Modal
      className="assembly-upload-modal"
      title={
        <div className="flex items-center gap-2">
          <PlusOutlined className="text-blue-500" />
          <span>{uploadParentId ? "Upload New Version" : "Add New Document(s)"}</span>
        </div>
      }
      open={isUploadModalOpen}
      onCancel={() => {
        setIsUploadModalOpen(false);
        resetUploadState();
      }}
      footer={null}
      destroyOnHidden
      width="95%"
      style={{ maxWidth: 1000 }}
    >
      <div className="mt-1 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
        {/* Header chip with assembly name */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-[11px] px-2 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
              For Assembly: <span className="font-semibold">{selectedItem?.label || selectedItem?.name}</span>
            </span>
          </div>
          <Text type="secondary" className="text-[10px]">
            {uploadRows.length} Document(s) to upload
          </Text>
        </div>

        <div className="space-y-4">
          {uploadRows.map((row, index) => (
            <div key={row.id} className="relative border border-slate-100 rounded-lg bg-slate-50/60 p-4 shadow-sm transition-all hover:border-blue-200">
              {uploadRows.length > 1 && !uploadParentId && (
                <Button 
                  type="text" 
                  danger 
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => removeUploadRow(row.id)}
                  className="absolute -top-2 -right-2 bg-white shadow-sm border border-red-100 rounded-full hover:bg-red-50"
                />
              )}
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
                {/* Upload file */}
                <div className="flex flex-col gap-1">
                  <Text type="secondary" className="text-[11px] block font-medium">
                    * Select File
                  </Text>
                  <Upload
                    multiple={false}
                    fileList={row.fileList}
                    beforeUpload={(file) => {
                      updateUploadRow(row.id, 'fileList', [file]);
                      // Same behavior as DocumentsPanel: always derive document name from selected file
                      const base = file.name.includes(".")
                        ? file.name.slice(0, file.name.lastIndexOf("."))
                        : file.name;
                      updateUploadRow(row.id, 'docName', base);
                      return false;
                    }}
                    onRemove={() => updateUploadRow(row.id, 'fileList', [])}
                    maxCount={1}
                    showUploadList={{ showRemoveIcon: true }}
                  >
                    <Button 
                      icon={<InboxOutlined />} 
                      size="middle" 
                      className={`w-full justify-center ${row.fileList.length > 0 ? 'border-green-500 text-green-600 bg-green-50' : 'border-blue-400 text-blue-500'}`}
                    >
                      {row.fileList.length > 0 ? 'File Selected' : 'Choose File'}
                    </Button>
                  </Upload>
                </div>

                {/* Document name */}
                <div className="flex flex-col gap-1">
                  <Text type="secondary" className="text-[11px] block font-medium">
                    * Document Name
                  </Text>
                  <Input
                    placeholder="Enter document name"
                    value={row.docName}
                    onChange={(e) => updateUploadRow(row.id, 'docName', e.target.value)}
                    className="bg-white"
                  />
                </div>

                {/* Document type */}
                <div className="flex flex-col gap-1">
                  <Text type="secondary" className="text-[11px] block font-medium">
                    * Document Type
                  </Text>
                  <div className="flex flex-col gap-2">
                    <Select
                      className="w-full bg-white"
                      value={row.docType}
                      onChange={(val) => updateUploadRow(row.id, 'docType', val)}
                      size="middle"
                    >
                      <Select.Option value="2D">2D Drawing</Select.Option>
                      <Select.Option value="3D">3D Model (STL/STEP)</Select.Option>
                      <Select.Option value="Other">Other</Select.Option>
                    </Select>
                    {row.docType === "Other" && (
                      <Input
                        size="small"
                        placeholder="Enter custom type"
                        value={row.docTypeOther}
                        onChange={(e) => updateUploadRow(row.id, 'docTypeOther', e.target.value)}
                        className="bg-white border-blue-200"
                      />
                    )}
                  </div>
                </div>

                {/* Version */}
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <Text type="secondary" className="text-[11px] block font-medium">
                      * Version
                    </Text>
                  </div>
                  <Input
                    value={row.version}
                    onChange={(e) => handleVersionChangeInRow(row.id, e.target.value)}
                    className="bg-gray-50 font-mono"
                    disabled={!uploadParentId}
                    title={!uploadParentId ? "Initial version is fixed at v1.0" : "Edit version format (e.g. v1.1, v2.0)"}
                  />
                </div>
              </div>

              {uploadParentId && (
                <div className="mt-3 p-2 bg-amber-50 border border-amber-100 rounded">
                  <Text type="warning" className="text-[11px] flex items-center gap-1">
                    <SyncOutlined spin={uploading} /> Creating a new version for an existing document.
                  </Text>
                </div>
              )}
            </div>
          ))}
        </div>

        {!uploadParentId && (
          <div className="mt-4 flex justify-center">
            <Button 
              type="dashed" 
              size="middle" 
              icon={<PlusOutlined />}
              onClick={addUploadRow}
              className="text-blue-600 border-blue-200 hover:border-blue-400 w-full max-w-xs bg-blue-50/30"
            >
              Add Another Document
            </Button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row justify-end gap-2 pt-6 sticky bottom-0 bg-white py-3 border-t border-slate-100 mt-4">
          <Button
            onClick={() => {
              setIsUploadModalOpen(false);
              resetUploadState();
            }}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            type="primary"
            icon={<UploadOutlined />}
            loading={uploading}
            disabled={uploadRows.some(r => r.fileList.length === 0)}
            onClick={handleUpload}
            className="w-full sm:w-auto min-w-[140px]"
          >
            {uploadParentId ? "Upload New Version" : `Upload ${uploadRows.length} Document(s)`}
          </Button>
        </div>
      </div>
    </Modal>

      <Modal
        title={getDocumentDisplayName(previewDocument) || previewDocument?.document_name || "Document Preview"}
        open={isPreviewModalOpen}
        onCancel={() => {
          setIsPreviewModalOpen(false);
          setPreviewDocument(null);
        }}
        width="95%"
        style={{ maxWidth: 1000, top: 20 }}
        destroyOnHidden
        styles={{ body: { height: "75vh", padding: 0, minHeight: 200 } }}
        footer={[
          <Button key="dl" icon={<DownloadOutlined />} onClick={() => { if (previewDocument?.id) { const a = document.createElement("a"); a.href = `${API_BASE_URL}/documents/${previewDocument.id}/download`; a.setAttribute("download", previewDocument.document_name); document.body.appendChild(a); a.click(); a.remove(); } setIsPreviewModalOpen(false); setPreviewDocument(null); }}>Download</Button>,
          <Button key="cl" type="primary" onClick={() => { setIsPreviewModalOpen(false); setPreviewDocument(null); }}>Close</Button>
        ]}
      >
        {previewDocument && (() => {
          const previewUrl = `${API_BASE_URL}/documents/${previewDocument.id}/preview`;
          const displayName = getDocumentDisplayName(previewDocument) || previewDocument.document_name;
          const type = getPreviewType(displayName);
          if (type === "image") {
            return (
              <div className="flex items-center justify-center h-full bg-gray-100 overflow-auto">
                <img src={previewUrl} alt={displayName} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
              </div>
            );
          }
          if (type === "pdf") {
            return <iframe src={`${previewUrl}#toolbar=0`} title={displayName} width="100%" height="100%" style={{ border: "none" }} />;
          }
          return (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-gray-50">
              <FileTextOutlined className="text-5xl text-gray-400 mb-4" />
              <p className="text-gray-700 font-medium mb-2">Preview is not available for this file type.</p>
              <p className="text-gray-500">Please download the file to view it.</p>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
};

export default AssemblyDocumentsPanel;

