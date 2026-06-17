import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  PlusOutlined, DownloadOutlined, FileTextOutlined, EyeOutlined,
  SyncOutlined, ToolOutlined, ClockCircleOutlined, EnvironmentOutlined,
  DeleteOutlined, InboxOutlined, FilePdfOutlined, UploadOutlined, EditOutlined,
  CheckCircleOutlined, CloseCircleOutlined
} from "@ant-design/icons";
import axios from "axios";
import { API_BASE_URL } from "../../Config/auth";
import { Tabs, Button, Badge, Table, Select, Empty, Spin, message, Tooltip, Tag, Modal, Popconfirm, Typography, Upload, Input, Form } from "antd";
import { normalizeVersion, fetchInto } from "./operationUtils.js";
import PartActionModal from "./PartActionModal";
import EditOperationModal from "./EditOperationModal";
import OperationImportModal from "./OperationImportModal";
import PartDocumentReport from "../../DownloadReports/PartDocumentReport";
import ModelViewer3D from "./ModelViewer3D";

const { Text } = Typography;
const { Dragger } = Upload;

// ── OperationDocumentsList ──────────────────────────────────────────────────
const OperationDocumentsList = ({ operationId, onPreview }) => {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      if (!operationId || !alive) return;
      setLoading(true);
      try {
        const r = await axios.get(
          `${API_BASE_URL}/operation-documents/operation/${operationId}`,
          { signal: ctrl.signal }
        );
        if (alive) setDocs(r.data);
      } catch (e) {
        if (e.name !== 'CanceledError' && e.name !== 'AbortError') console.error(e);
      }
      finally { if (alive && !ctrl.signal.aborted) setLoading(false); }
    }, 100);
    return () => { alive = false; clearTimeout(t); ctrl.abort(); };
  }, [operationId]);

  const parseV = (v) => parseFloat(String(v).replace(/^v/i, ''));

  if (loading) return <div className="p-4 flex justify-center"><Spin size="small"><span className="text-xs text-gray-600">Loading documents...</span></Spin></div>;
  if (!docs.length) return (
    <div className="p-6 text-center border border-dashed border-gray-300 rounded-lg bg-gray-50">
      <FileTextOutlined className="text-2xl text-gray-300 mb-2" />
      <p className="text-sm text-gray-500">No documents attached to this operation</p>
    </div>
  );

  const grouped = docs.reduce((acc, d) => { const r = d.parent_id || d.id; (acc[r] = acc[r] || []).push(d); return acc; }, {});
  const latest = Object.values(grouped).map(g => [...g].sort((a, b) => b.id - a.id)[0]);

  const columns = [
    { title: 'Type', dataIndex: 'document_type', width: 120, render: t => <Tag color="blue" variant="filled" className="mr-0">{t || 'DOC'}</Tag> },
    { title: 'Document Name', dataIndex: 'document_name', ellipsis: true, render: t => <span className="font-medium text-gray-800">{t}</span> },
    { title: 'Version', dataIndex: 'document_version', width: 100, render: t => { const v = t || '1.0'; return <span className="text-blue-600 font-bold text-xs">{v}</span>; } },
    {
      title: 'Actions', key: 'actions', width: 80, align: 'center', render: (_, doc) => (
        <div className="flex gap-1 justify-center">
          <Button size="small" type="text" className="text-blue-500 hover:bg-blue-50" icon={<EyeOutlined />} onClick={() => onPreview(doc)} />
          <Button size="small" type="text" className="text-green-500 hover:bg-green-50" icon={<DownloadOutlined />}
            onClick={() => { const a = document.createElement('a'); a.href = `${API_BASE_URL}/operation-documents/${doc.id}/download`; a.setAttribute('download', doc.document_name); document.body.appendChild(a); a.click(); a.remove(); }} />
        </div>
      )
    },
  ];

  return (
    <Table dataSource={latest} columns={columns} rowKey="id" pagination={false} size="small" bordered className="bg-white" scroll={{ x: 'max-content' }}
      expandable={{
        rowExpandable: r => (grouped[r.parent_id || r.id] || []).length > 1,
        expandedRowRender: r => {
          const versions = [...(grouped[r.parent_id || r.id] || [])].sort((a, b) => parseV(b.document_version) - parseV(a.document_version));
          return (
            <div className="bg-gray-50 p-3 rounded">
              <p className="text-xs font-medium text-gray-600 mb-2">Version History:</p>
              <div className="flex flex-col gap-2">
                {versions.map(ver => (
                  <div key={ver.id} className="flex justify-between items-center bg-white px-3 py-2 rounded border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-3 min-w-0">
                      <Tag color="blue" variant="filled" className="text-[10px] m-0 px-2">{ver.document_version || ''}</Tag>
                      <span className="text-xs text-gray-700 truncate">{ver.document_name}</span>
                    </div>
                    <div className="flex gap-2">
                      <Tooltip title="Preview"><Button size="small" type="text" icon={<EyeOutlined />} onClick={() => onPreview(ver)} className="text-blue-500 hover:bg-blue-50" /></Tooltip>
                      <Tooltip title="Download"><Button size="small" type="text" icon={<DownloadOutlined />} onClick={() => window.open(`${API_BASE_URL}/operation-documents/${ver.id}/download`, '_blank')} className="text-green-500 hover:bg-green-50" /></Tooltip>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        },
      }}
    />
  );
};

// ── FitTable ────────────────────────────────────────────────────────────────
const FitTable = ({ columns, dataSource, scrollX = 'max-content', ...props }) => {
  const ref = useRef(null);
  const [scrollY, setScrollY] = useState(400);

  useEffect(() => {
    const update = () => {
      if (!ref.current) return;
      const h = ref.current.clientHeight || 0;
      setScrollY(Math.max(h - 40, 150));
    };
    const ro = new ResizeObserver(() => window.requestAnimationFrame(update));
    if (ref.current) ro.observe(ref.current);
    update();
    window.addEventListener('resize', update);
    return () => { ro.disconnect(); window.removeEventListener('resize', update); };
  }, []);

  return (
    <div className="flex-1 min-h-0 overflow-hidden w-full relative" ref={ref} style={{ height: '100%' }}>
      <Table
        columns={columns}
        dataSource={dataSource}
        pagination={false}
        scroll={{ y: scrollY, x: scrollX }}
        size="small"
        {...props}
        className={`${props.className || ''} custom-fit-table`}
      />
    </div>
  );
};

// ── DocumentsPanel ──────────────────────────────────────────────────────────
const DocumentsPanel = ({ selectedItem, onDocumentsLoaded }) => {
  const [documents, setDocuments] = useState([]);
  const [operations, setOperations] = useState([]);
  const [activeTab, setActiveTab] = useState('mbom');
  const [loading, setLoading] = useState(false);

  // Preview
  const [previewDoc, setPreviewDoc] = useState(null);

  // Modals
  const [showPartActionModal, setShowPartActionModal] = useState(false);
  const [partActionType, setPartActionType] = useState('');
  const [selectedOperation, setSelectedOperation] = useState(null);
  const [isOperationModalOpen, setIsOperationModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [viewOperation, setViewOperation] = useState(null);
  const [viewOperationTools, setViewOperationTools] = useState([]);
  const [loadingViewTools, setLoadingViewTools] = useState(false);
  const [modalTab, setModalTab] = useState('details');
  const [showAddToolForm, setShowAddToolForm] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importOperations, setImportOperations] = useState([]);
  const [showReportModal, setShowReportModal] = useState(false);

  // eBOM version selection
  const [selectedVersions, setSelectedVersions] = useState({});

  // Upload state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFileList, setSelectedFileList] = useState([]);
  const [uploadDocType, setUploadDocType] = useState('2D');
  const [uploadDocTypeOther, setUploadDocTypeOther] = useState('');
  const [uploadParentId, setUploadParentId] = useState(null);
  const [uploadVersion, setUploadVersion] = useState('');

  // ── Dual upload state ─────────────────────────────────────────────────────
  // For revision updates, both 2D and 3D must be uploaded together
  const [isDualUploadMode, setIsDualUploadMode] = useState(false);
  const [dualUploadFiles, setDualUploadFiles] = useState({ '2D': null, '3D': null });

  // Edit doc
  const [isEditDocModalOpen, setIsEditDocModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null);
  const [editForm] = Form.useForm();
  const watchedDocType = Form.useWatch('document_type', editForm);

  useEffect(() => {
    if (editingDoc) {
      const isOther = !['2D', '3D'].includes(editingDoc.document_type);
      editForm.setFieldsValue({
        document_name: editingDoc.document_name,
        document_type: isOther ? 'Other' : editingDoc.document_type,
        custom_type: isOther ? editingDoc.document_type : ''
      });
    } else { editForm.resetFields(); }
  }, [editingDoc, editForm]);

  const parseV = (v) => parseFloat(String(v).replace(/^v/i, ''));

  const groupedPartDocs = useMemo(() =>
    documents.reduce((acc, d) => { const r = d.parent_id || d.id; (acc[r] = acc[r] || []).push(d); return acc; }, {}),
    [documents]);

  const latestPartDocs = useMemo(() =>
    Object.values(groupedPartDocs).map(g => [...g].sort((a, b) => b.id - a.id)[0]),
    [groupedPartDocs]);

  useEffect(() => {
    const next = { ...selectedVersions };
    let changed = false;
    latestPartDocs.forEach(doc => {
      const r = doc.parent_id || doc.id;
      if (!next[r] || !groupedPartDocs[r]?.find(d => d.id === next[r].id)) { next[r] = doc; changed = true; }
    });
    if (changed) setSelectedVersions(next);
  }, [latestPartDocs, groupedPartDocs]);

  useEffect(() => {
    if (!selectedItem) { setDocuments([]); setOperations([]); if (onDocumentsLoaded) onDocumentsLoaded([]); return; }
    if (selectedItem.itemType === 'part') fetchDocuments();
    else { setDocuments([]); setOperations([]); if (onDocumentsLoaded) onDocumentsLoaded([]); }
  }, [selectedItem]);

  useEffect(() => {
    if (viewOperation && isViewModalOpen) {
      const fetchTools = async () => {
        setLoadingViewTools(true);
        try {
          const r = await axios.get(`${API_BASE_URL}/tools/operation/${viewOperation.id}`);
          setViewOperationTools(r.data);
        } catch (e) { console.error(e); setViewOperationTools([]); }
        finally { setLoadingViewTools(false); }
      };
      fetchTools();
    } else { setViewOperationTools([]); }
  }, [viewOperation, isViewModalOpen]);

  const getCurrentUserId = () => {
    try {
      const stored = localStorage.getItem("user");
      if (!stored) return null;
      const u = JSON.parse(stored);
      if (u?.id == null) return null;
      return u.id;
    } catch { return null; }
  };

  // ── fetchDocuments returns the fresh doc list directly (avoids stale closure) ──
  const fetchDocuments = async () => {
    if (!selectedItem || selectedItem.itemType !== 'part') {
      setDocuments([]); setOperations([]);
      if (onDocumentsLoaded) onDocumentsLoaded([]);
      return [];
    }
    setLoading(true);
    try {
      const [dR, oR] = await Promise.all([
        axios.get(`${API_BASE_URL}/documents/part/${selectedItem.id}`),
        axios.get(`${API_BASE_URL}/operations/part/${selectedItem.id}`),
      ]);
      const docs = dR.data;
      const ops = oR.data;
      setDocuments(docs); setOperations(ops);
      if (onDocumentsLoaded) onDocumentsLoaded(docs);
      return docs; // ← return fresh docs to caller
    } catch (e) { console.error(e); return []; }
    finally { setLoading(false); }
  };

  const handleDownload = (id) => {
    const a = document.createElement('a');
    a.href = `${API_BASE_URL}/documents/${id}/download`;
    a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
  };

  const handlePreview = (doc) => {
    if (!doc.document_url) { message.error("Document URL not found"); return; }
    setPreviewDoc(doc);
  };

  const getPreviewType = (name) => {
    const ext = (name || '').split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(ext)) return 'image';
    if (ext === 'pdf') return 'pdf';
    if (['stl', 'step', 'stp', 'obj', '3ds', 'fbx', 'gltf', 'glb'].includes(ext)) return '3d';
    return 'other';
  };

  // ── Helper: compute next version string ────────────────────────────────
  const computeNextVersion = (currentVer) => {
    let next = String(currentVer || "");
    const match = next.match(/(\d+)$/);
    if (match) {
      const numStr = match[1];
      const num = parseInt(numStr, 10);
      const nextNumStr = String(num + 1).padStart(numStr.length, '0');
      next = next.substring(0, match.index) + nextNumStr;
    } else {
      next = next ? next + "-01" : "01";
    }
    return next;
  };

  // ── Helper: get latest docs grouped by type from a raw docs array ──────
  const getLatestByType = (docsArray) => {
    const grouped = docsArray.reduce((acc, d) => {
      const r = d.parent_id || d.id;
      (acc[r] = acc[r] || []).push(d);
      return acc;
    }, {});
    const latest = Object.values(grouped).map(g =>
      [...g].sort((a, b) => parseV(b.document_version) - parseV(a.document_version))[0]
    );
    // Build a map: document_type → latest doc  (e.g. '2D' → doc, '3D' → doc)
    return latest.reduce((acc, d) => { acc[d.document_type] = d; return acc; }, {});
  };

  // ── Reset all upload + dual upload state ────────────────────────────────
  const resetAll = () => {
    setSelectedFileList([]);
    setUploadParentId(null);
    setUploadVersion('');
    setUploadDocType('2D');
    setUploadDocTypeOther('');
    setIsDualUploadMode(false);
    setDualUploadFiles({ '2D': null, '3D': null });
  };

  // ── initiateNewVersion: called when user clicks the Update Revision icon ─
  const initiateNewVersion = (doc, latestVer) => {
    const nextVer = computeNextVersion(latestVer);
    const docType = doc.document_type || '2D';
    resetAll();
    setUploadParentId(doc.parent_id || doc.id);
    setUploadVersion(nextVer);
    setUploadDocType(docType);

    // For 2D or 3D revisions, enable dual upload mode (both files together)
    if (docType === '2D' || docType === '3D') {
      setIsDualUploadMode(true);
    }

    setIsUploadModalOpen(true);
  };

  // ── Core upload handler (handles single and dual file uploads) ───────────
  const handleUpload = async () => {
    if (!uploadVersion || !uploadVersion.trim()) { message.warning('Please enter a revision'); return; }

    // Dual upload mode: both 2D and 3D files required
    if (isDualUploadMode) {
      const has2D = dualUploadFiles['2D'] != null;
      const has3D = dualUploadFiles['3D'] != null;

      if (!has2D || !has3D) {
        message.warning('Both 2D and 3D files are required for revision updates');
        return;
      }

      // Duplicate revision check for both parent_ids
      const freshDocs = await fetchDocuments();
      const latestByType = getLatestByType(freshDocs);

      const doc2D = latestByType['2D'];
      const doc3D = latestByType['3D'];

      const parentId2D = doc2D ? (doc2D.parent_id || doc2D.id) : null;
      const parentId3D = doc3D ? (doc3D.parent_id || doc3D.id) : null;

      // Check revision for 2D
      if (parentId2D) {
        const existing2D = freshDocs.filter(d => (d.parent_id || d.id) === parentId2D);
        if (existing2D.some(v => String(v.document_version).trim() === uploadVersion.trim())) {
          message.error('This revision already exists for 2D document');
          return;
        }
      }

      // Check revision for 3D
      if (parentId3D) {
        const existing3D = freshDocs.filter(d => (d.parent_id || d.id) === parentId3D);
        if (existing3D.some(v => String(v.document_version).trim() === uploadVersion.trim())) {
          message.error('This revision already exists for 3D document');
          return;
        }
      }

      setUploading(true);
      try {
        // Upload both files
        const uploads = [];

        // Upload 2D
        if (dualUploadFiles['2D']) {
          const fd2D = new FormData();
          fd2D.append('file', dualUploadFiles['2D']);
          fd2D.append('document_name', dualUploadFiles['2D'].name.split('.')[0]);
          fd2D.append('document_type', '2D');
          fd2D.append('document_version', uploadVersion);
          if (selectedItem?.itemType === 'assembly') fd2D.append('assembly_id', selectedItem.id.toString());
          else if (selectedItem) fd2D.append('part_id', selectedItem.id.toString());
          if (parentId2D) fd2D.append('parent_id', parentId2D.toString());
          const uid = getCurrentUserId();
          if (uid != null) fd2D.append('user_id', String(uid));
          uploads.push(axios.post(`${API_BASE_URL}/documents/`, fd2D));
        }

        // Upload 3D
        if (dualUploadFiles['3D']) {
          const fd3D = new FormData();
          fd3D.append('file', dualUploadFiles['3D']);
          fd3D.append('document_name', dualUploadFiles['3D'].name.split('.')[0]);
          fd3D.append('document_type', '3D');
          fd3D.append('document_version', uploadVersion);
          if (selectedItem?.itemType === 'assembly') fd3D.append('assembly_id', selectedItem.id.toString());
          else if (selectedItem) fd3D.append('part_id', selectedItem.id.toString());
          if (parentId3D) fd3D.append('parent_id', parentId3D.toString());
          const uid = getCurrentUserId();
          if (uid != null) fd3D.append('user_id', String(uid));
          uploads.push(axios.post(`${API_BASE_URL}/documents/`, fd3D));
        }

        await Promise.all(uploads);
        message.success(`Both 2D and 3D updated to revision ${uploadVersion} ✓`);
        resetAll();
        setIsUploadModalOpen(false);
        await fetchDocuments();
      } catch (e) {
        console.error(e);
        message.error(e?.response?.data?.detail || e?.response?.data?.message || 'Failed to upload documents');
      } finally {
        setUploading(false);
      }
      return;
    }

    // Single file upload mode (new document or non-2D/3D revision)
    if (!selectedFileList.length) { message.warning('Please select a file first'); return; }
    if (uploadDocType === 'Other' && !uploadDocTypeOther.trim()) { message.warning('Please enter document type'); return; }

    // Duplicate revision check
    if (uploadParentId) {
      const existingVersions = documents.filter(d => (d.parent_id || d.id) === uploadParentId);
      const versionExists = existingVersions.some(v => String(v.document_version).trim() === uploadVersion.trim());
      if (versionExists) {
        message.error('This revision already exists for this document. Please enter a different revision.');
        return;
      }
    }

    const file = selectedFileList[0];
    const fd = new FormData();
    fd.append('file', file);
    fd.append('document_name', file.name.split('.')[0]);
    fd.append('document_type', uploadDocType === 'Other' ? uploadDocTypeOther.trim() : uploadDocType);
    fd.append('document_version', uploadVersion);
    if (selectedItem?.itemType === 'assembly') fd.append('assembly_id', selectedItem.id.toString());
    else if (selectedItem) fd.append('part_id', selectedItem.id.toString());
    if (uploadParentId) fd.append('parent_id', uploadParentId.toString());
    const uid = getCurrentUserId();
    if (uid != null) fd.append('user_id', String(uid));

    setUploading(true);
    try {
      await axios.post(`${API_BASE_URL}/documents/`, fd);
      message.success('Document uploaded successfully');
      resetAll();
      setIsUploadModalOpen(false);
      await fetchDocuments();
    } catch (e) {
      console.error(e);
      message.error(e?.response?.data?.detail || e?.response?.data?.message || 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  // ── Modal close handler ───────────────────────────────────────────────
  const handleModalClose = () => {
    resetAll();
    setIsUploadModalOpen(false);
  };

  const handleDeleteDocument = async (id) => {
    try {
      await axios.delete(`${API_BASE_URL}/documents/${id}`);
      message.success('Document deleted successfully');
      await fetchDocuments();
    } catch (e) {
      console.error(e);
      message.error(e?.response?.data?.detail || e?.response?.data?.message || 'Failed to delete document');
    }
  };

  const handleEditDocument = async (values) => {
    try {
      const type = values.document_type === 'Other' && values.custom_type ? values.custom_type : values.document_type;
      await axios.put(
        `${API_BASE_URL}/documents/${editingDoc.id}`,
        { document_name: values.document_name, document_type: type },
        { headers: { 'Content-Type': 'application/json' } }
      );
      message.success('Document updated successfully');
      setIsEditDocModalOpen(false);
      setEditingDoc(null);
      await fetchDocuments();
    } catch (e) {
      console.error(e);
      message.error(e?.response?.data?.detail || e?.response?.data?.message || 'Failed to update document');
    }
  };

  const handleAcknowledgeDocument = async (docId, currentStatus) => {
    try {
      await axios.put(`${API_BASE_URL}/documents/${docId}/acknowledge`, null, {
        params: { is_acknowledged: !currentStatus }
      });
      message.success('Document acknowledged successfully');
      setDocuments(prevDocs =>
        prevDocs.map(doc => doc.id === docId ? { ...doc, is_acknowledged: true } : doc)
      );
      setSelectedVersions(prevVersions => {
        const updated = { ...prevVersions };
        for (const key in updated) {
          if (updated[key]?.id === docId) updated[key] = { ...updated[key], is_acknowledged: true };
        }
        return updated;
      });
      await fetchDocuments();
    } catch (e) {
      console.error(e);
      message.error(e?.response?.data?.detail || e?.response?.data?.message || 'Failed to update acknowledgment status');
    }
  };

  const handleDeleteOperation = async (opId) => {
    try {
      await axios.delete(`${API_BASE_URL}/operations/${opId}`);
      message.success("Operation deleted successfully");
      fetchDocuments();
    } catch (e) {
      console.error(e);
      message.error(e?.response?.data?.detail || e?.response?.data?.message || "Failed to delete operation");
    }
  };

  const openPartActionModal = (type) => {
    if (!selectedItem || selectedItem.itemType !== 'part') {
      message.warning("Please select a part to add operations/documents"); return;
    }
    setPartActionType(type); setShowPartActionModal(true);
  };

  const handleActionCreated = async (newItem, type) => {
    message.success(type === 'operation'
      ? `Operation "${newItem.operation_name}" created successfully!`
      : `Document "${newItem.document_name}" created successfully!`);
    await fetchDocuments(); setImportOperations([]);
  };

  // ── operations table columns ─────────────────────────────────────────────
  const operationsColumns = [
    {
      title: 'Op #', dataIndex: 'operation_number', key: 'op', width: 70,
      render: (t, _, i) => <Tag color="cyan" className="font-mono text-sm font-medium m-0 px-1.5 py-0.5">{String(t || i + 1).padStart(2, '0')}</Tag>
    },
    {
      title: <span className="font-semibold text-slate-700">Operation Name</span>, dataIndex: 'operation_name', key: 'name', ellipsis: true, minWidth: 150,
      render: n => <span className="text-sm font-medium text-slate-900">{n || '—'}</span>
    },
    {
      title: <span><ClockCircleOutlined className="mr-0.5" />Setup</span>, dataIndex: 'setup_time', key: 'setup', width: 100,
      render: t => <Tag color="orange" className="text-sm font-medium m-0 px-1.5 py-0.5">{t || '00:00:00'}</Tag>
    },
    {
      title: <span><ClockCircleOutlined className="mr-0.5" />Cycle</span>, dataIndex: 'cycle_time', key: 'cycle', width: 100,
      render: t => <Tag color="green" className="text-sm font-medium m-0 px-1.5 py-0.5">{t || '00:00:00'}</Tag>
    },
    {
      title: <span><EnvironmentOutlined className="mr-0.5" />Workcenter</span>, dataIndex: 'workcenter_id', key: 'wc',
      render: (id, r) => <Tag color="purple" className="text-sm font-medium m-0 px-1.5 py-0.5 whitespace-normal">{r.work_center_name || id || 'N/A'}</Tag>
    },
    {
      title: <span className="font-semibold text-slate-700">Machine</span>, dataIndex: 'machine_id', key: 'mc',
      render: (id, r) => <Tag color="geekblue" className="text-sm font-medium m-0 px-1.5 py-0.5 whitespace-normal">{r.machine_name || id || 'N/A'}</Tag>
    },
    {
      title: <span className="font-semibold text-slate-700">Op Type</span>, dataIndex: 'part_type_id', key: 'type',
      render: (_, r) => <Tag color={r.part_type_name === 'Out-Source' ? 'orange' : 'blue'} className="m-0 px-1.5 py-0.5 text-xs">{r.part_type_name || 'IN-House'}</Tag>
    },
    {
      title: <span className="font-semibold text-slate-700">From Date</span>, dataIndex: 'from_date', key: 'from',
      render: v => v ? <span className="text-sm text-slate-700">{new Date(v).toLocaleDateString()}</span> : <span className="text-slate-500">—</span>
    },
    {
      title: <span className="font-semibold text-slate-700">To Date</span>, dataIndex: 'to_date', key: 'to',
      render: v => v ? <span className="text-sm text-slate-700">{new Date(v).toLocaleDateString()}</span> : <span className="text-slate-500">—</span>
    },
  ];

  const getDocumentDisplayName = (doc) => {
    if (!doc) return '';
    if (doc.document_url) {
      const segment = doc.document_url.split('/').filter(Boolean).pop();
      if (segment) {
        let cleanName = segment.replace(/^\d{8}_\d{6}_/, '');
        const uuidMatch = cleanName.match(/^([a-zA-Z0-9]{8,})_/);
        if (uuidMatch) cleanName = cleanName.replace(/^([a-zA-Z0-9]{8,})_/, '');
        return cleanName || doc.document_name || '';
      }
    }
    return doc.document_name || '';
  };

  // ── eBOM table columns ───────────────────────────────────────────────────
  const eBomColumns = [
    {
      title: <span className="text-xs font-semibold">DOCUMENT NAME</span>, key: 'name',
      render: (_, r) => {
        const cur = selectedVersions[r.parent_id || r.id] || r;
        const displayName = getDocumentDisplayName(cur);
        return (
          <div className="flex items-center gap-3 py-1">
            <div className="p-2 bg-blue-50 rounded"><FilePdfOutlined className="text-blue-500" /></div>
            <Text strong className="text-sm truncate max-w-[300px]">{displayName || cur.document_name}</Text>
          </div>
        );
      }
    },
    {
      title: <span className="text-xs font-semibold">TYPE</span>, key: 'type', width: 120,
      render: (_, r) => {
        const cur = selectedVersions[r.parent_id || r.id] || r;
        return <Tag color="blue" className="m-0 text-xs px-1 leading-4 uppercase border-none bg-blue-100 text-blue-700">{cur.document_type || '2D'}</Tag>;
      }
    },
    
    {
      title: <span className="text-xs font-semibold">REVISION</span>, key: 'ver', width: 150,
      render: (_, r) => {
        const rootId = r.parent_id || r.id;
        const group = groupedPartDocs[rootId] || [];
        const cur = selectedVersions[rootId] || r;
        const fmtV = (v) => String(v);
        return (
          <Select size="small" value={cur.id} variant="filled" className="w-full"
            onChange={val => { const s = group.find(d => d.id === val); setSelectedVersions(p => ({ ...p, [rootId]: s })); }}
            styles={{ popup: { root: { minWidth: 180, padding: 4 } } }}
            labelRender={({ value }) => {
              const v = group.find(d => d.id === value);
              const ver = v?.document_version || '1.0';
              return (
                <div className="flex items-center gap-2">
                  <span className="font-bold text-blue-600">{fmtV(ver)}</span>
                  <span className="text-[10px] text-gray-400">{new Date(v?.created_at || Date.now()).toLocaleDateString()}</span>
                </div>
              );
            }}
          >
            {[...group].sort((a, b) => b.id - a.id).map(ver => (
              <Select.Option key={ver.id} value={ver.id}>
                <div className="flex justify-between items-center w-full py-1">
                  <div className="flex items-center gap-2">
                    <Badge status={ver.id === r.id ? 'success' : 'default'} />
                    <span className={`font-bold ${ver.id === cur.id ? 'text-blue-600' : 'text-gray-600'}`}>{fmtV(ver.document_version || '1.0')}</span>
                  </div>
                  <span className="text-[10px] text-gray-400 bg-gray-50 px-1 rounded">{new Date(ver.created_at || Date.now()).toLocaleDateString()}</span>
                </div>
              </Select.Option>
            ))}
          </Select>
        );
      }
    },
    {
      title: <span className="text-xs font-semibold">UPLOADED BY</span>, key: 'uploaded_by', width: 150,
      render: (_, r) => {
        const cur = selectedVersions[r.parent_id || r.id] || r;
        return <span className="text-xs text-slate-600">{cur.user_name || 'Unknown'}</span>;
      }
    },
    {
      title: <span className="text-xs font-semibold">ACKNOWLEDGED</span>, key: 'acknowledged', width: 150, align: 'center',
      render: (_, r) => {
        const cur = selectedVersions[r.parent_id || r.id] || r;
        if (cur.is_acknowledged) {
          return <Tag color="green" icon={<CheckCircleOutlined />} className="m-0 text-xs">Acknowledged</Tag>;
        }
        return (
          <Popconfirm
            title="Acknowledge Document"
            description="Are you sure you want to acknowledge this document?"
            onConfirm={() => handleAcknowledgeDocument(cur.id, cur.is_acknowledged)}
            okText="Yes" cancelText="No"
          >
            <Button size="small" type="primary" icon={<CheckCircleOutlined />} className="text-xs">
              Acknowledge
            </Button>
          </Popconfirm>
        );
      }
    },
    {
      title: <span className="text-xs font-semibold text-center block">ACTIONS</span>, key: 'actions', width: 200, align: 'center',
      render: (_, r) => {
        const cur = selectedVersions[r.parent_id || r.id] || r;
        return (
          <div className="flex gap-1 justify-center">
            <Tooltip title="Preview">
              <Button size="small" type="text" icon={<EyeOutlined />} onClick={() => handlePreview(cur)} className="hover:text-blue-500 hover:bg-blue-50" />
            </Tooltip>
            <Tooltip title="Update Revision">
              <Button size="small" type="text" className="text-orange-500 hover:bg-orange-50" icon={<SyncOutlined />}
                onClick={() => initiateNewVersion(r, r.document_version)} />
            </Tooltip>
            <Tooltip title="Edit Details">
              <Button size="small" type="text" className="text-blue-500 hover:bg-blue-50" icon={<EditOutlined />}
                onClick={() => { setEditingDoc(cur); setIsEditDocModalOpen(true); }} />
            </Tooltip>
            <Tooltip title="Download">
              <Button size="small" type="text" className="text-green-500 hover:bg-green-50" icon={<DownloadOutlined />}
                onClick={() => handleDownload(cur.id)} />
            </Tooltip>
            <Popconfirm title="Delete Document" description="Delete this version? This cannot be undone."
              onConfirm={() => handleDeleteDocument(cur.id)} okText="Yes" cancelText="No">
              <Button size="small" type="text" danger icon={<DeleteOutlined />} className="hover:bg-red-50" />
            </Popconfirm>
          </div>
        );
      }
    },
  ];

  if (!selectedItem) return <div className="flex-1 bg-gray-50" />;
  const isPart = selectedItem.itemType === 'part';

  // ── Upload Modal title ──────────────────────────────────────────────────
  const uploadModalTitle = isDualUploadMode
    ? (
      <div className="flex items-center gap-2">
        <SyncOutlined className="text-orange-500" />
        <span>Update Revision (Both 2D & 3D)</span>
      </div>
    ) : (
      <div className="flex items-center gap-2">
        <PlusOutlined className="text-blue-500" />
        <span>{uploadParentId ? 'Upload New Revision' : 'Add New Document'}</span>
      </div>
    );

  const tabItems = [
    ...(isPart ? [{
      key: 'mbom', label: <span className="font-medium">Process Plan</span>,
      children: (
        <div className="h-full flex flex-col min-h-0">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-1.5 shrink-0 gap-2">
            <span className="text-xs text-slate-500">Click row to view</span>
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <Button size="small" icon={<DownloadOutlined />} onClick={() => setShowReportModal(true)} disabled={!isPart || loading} className="primary-btn-sm flex-1 sm:flex-initial">
                <span className="hidden sm:inline">Download Report</span><span className="sm:hidden">Report</span>
              </Button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <FitTable
              dataSource={operations}
              columns={operationsColumns}
              rowKey="id"
              className="docs-ops-table"
              locale={{ emptyText: <Empty description="No operations" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
              onRow={(record) => ({
                onClick: () => { setViewOperation(record); setIsViewModalOpen(true); },
                style: { cursor: 'pointer' }
              })}
            />
          </div>
        </div>
      ),
    }] : []),
    {
      key: 'ebom', label: <span className="font-medium">{isPart ? 'Part Documents' : 'Documents'}</span>,
      children: (
        <div className="h-full flex flex-col min-h-0 overflow-hidden">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2 shrink-0 gap-2">
            <span className="text-xs text-slate-500">Documents & Revisions</span>
            <Button type="primary" size="small" icon={<PlusOutlined />} className="primary-btn-sm w-full sm:w-auto"
              onClick={() => { if (isPart) { openPartActionModal('document'); } else { resetAll(); setIsUploadModalOpen(true); } }}>
              Add Document
            </Button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden w-full">
            <FitTable
              dataSource={latestPartDocs}
              rowKey="id"
              size="small"
              pagination={false}
              className="docs-ebom-table"
              scrollX={600}
              columns={eBomColumns}
            />
          </div>

          {/* ── Upload / Wizard Modal ──────────────────────────────────── */}
          <Modal
            title={uploadModalTitle}
            open={isUploadModalOpen}
            onCancel={handleModalClose}
            footer={null}
            destroyOnHidden
            width="95%"
            style={{ maxWidth: 450 }}
          >
            <div className="space-y-4 mt-4">

              {/* ── Dual upload mode: 2D & 3D cards ───────────────────────── */}
              {isDualUploadMode && (
                <>
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-start gap-2">
                    <SyncOutlined className="text-orange-500 mt-0.5 shrink-0" spin />
                    <div>
                      <p className="text-sm font-semibold text-orange-700">Both files required</p>
                      <p className="text-xs text-orange-600 mt-0.5">
                        Upload both 2D and 3D files with the same revision number to keep them in sync.
                      </p>
                    </div>
                  </div>

                  {/* 2D / 3D Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {['2D', '3D'].map((type) => {
                      const file = dualUploadFiles[type];
                      const hasFile = file != null;
                      const color = type === '2D' ? '#2563eb' : '#7c3aed';
                      const bg = type === '2D' ? '#eff6ff' : '#f5f3ff';

                      return (
                        <div
                          key={type}
                          onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = type === '2D' ? '.pdf,.png,.jpg,.jpeg' : '.stl,.step,.stp,.obj';
                            input.onchange = (e) => {
                              const f = e.target.files?.[0];
                              if (f) setDualUploadFiles(prev => ({ ...prev, [type]: f }));
                            };
                            input.click();
                          }}
                          style={{
                            border: `2px dashed ${hasFile ? color : '#d9d9d9'}`,
                            borderRadius: 10,
                            padding: '18px 8px',
                            textAlign: 'center',
                            cursor: 'pointer',
                            background: hasFile ? bg : '#fafafa',
                            minHeight: 90,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 3,
                            position: 'relative',
                          }}
                        >
                          {hasFile && (
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                setDualUploadFiles(prev => ({ ...prev, [type]: null }));
                              }}
                              style={{
                                position: 'absolute',
                                top: 5,
                                right: 5,
                                width: 20,
                                height: 20,
                                borderRadius: '50%',
                                background: '#ef4444',
                                color: 'white',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 12,
                                zIndex: 10,
                              }}
                            >
                              ×
                            </div>
                          )}
                          {hasFile ? (
                            <>
                              <span style={{ fontSize: 22 }}>📄</span>
                              <span style={{ fontSize: 10, fontWeight: 600, color, wordBreak: 'break-all', maxWidth: '100%', padding: '0 2px' }}>{file.name}</span>
                              <span style={{ fontSize: 9, color: '#9ca3af' }}>{type} Document</span>
                            </>
                          ) : (
                            <>
                              <span style={{ fontSize: 26, fontWeight: 800, color }}>{type}</span>
                              <span style={{ fontSize: 10, color, fontWeight: 600 }}>{type === '2D' ? '2D Drawing' : '3D Model'}</span>
                              <span style={{ fontSize: 9, color: '#d1d5db' }}>click to upload</span>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* ── Single upload mode: document type selector ───────────── */}
              {!isDualUploadMode && (
                <div>
                  <Text type="secondary" className="text-xs block mb-1">* Document Type</Text>
                  <Select
                    className="w-full"
                    value={uploadDocType}
                    onChange={setUploadDocType}
                  >
                    {['2D', '3D', 'Other'].map(t => (
                      <Select.Option key={t} value={t}>
                        {t === '2D' ? '2D Drawing' : t === '3D' ? '3D Model (STL/STEP)' : 'Other'}
                      </Select.Option>
                    ))}
                  </Select>
                  {uploadDocType === 'Other' && (
                    <Input className="mt-2" placeholder="Enter custom document type"
                      value={uploadDocTypeOther} onChange={e => setUploadDocTypeOther(e.target.value)} />
                  )}
                </div>
              )}

              {/* ── Revision input ─────────────────────────────────────── */}
              <div>
                <Text type="secondary" className="text-[11px] block font-medium">* Revision</Text>
                <Input
                  value={uploadVersion}
                  onChange={e => setUploadVersion(e.target.value.replace(/[^a-zA-Z0-9.-]/g, ''))}
                  placeholder="e.g. 00, 01"
                />
                {isDualUploadMode && (
                  <Text className="text-[10px] mt-1 block text-green-700">
                    ✓ Revision shared between 2D and 3D
                  </Text>
                )}
                {!isDualUploadMode && uploadParentId && (
                  <Text type="warning" className="text-[10px] mt-1 block">
                    Creating a new revision for an existing document.
                  </Text>
                )}
              </div>

              {/* ── File dragger (single mode only) ───────────────────────────── */}
              {!isDualUploadMode && (
                <Dragger
                  multiple={false}
                  fileList={selectedFileList}
                  beforeUpload={f => { setSelectedFileList([f]); return false; }}
                  onRemove={() => setSelectedFileList([])}
                className="bg-gray-50 border-dashed border-2 py-8"
              >
                <p className="ant-upload-drag-icon">
                  <InboxOutlined className="text-3xl text-blue-400" />
                </p>
                <p className="ant-upload-text">Click or drag file here</p>
                <p className="ant-upload-hint text-xs text-gray-400">
                  Supports PDF, STL, STEP, Images...
                </p>
              </Dragger>
              )}

              {/* ── Action buttons ─────────────────────────────────────── */}
              <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
                <Button onClick={() => { resetAll(); setIsUploadModalOpen(false); }} className="w-full sm:w-auto">
                  Cancel
                </Button>
                <Button
                  type="primary"
                  icon={isDualUploadMode ? <SyncOutlined /> : <UploadOutlined />}
                  loading={uploading}
                  disabled={isDualUploadMode ? (!dualUploadFiles['2D'] || !dualUploadFiles['3D']) : !selectedFileList.length}
                  onClick={handleUpload}
                  className="no-hover-btn w-full sm:w-auto"
                >
                  {isDualUploadMode
                    ? 'Upload Both Files'
                    : uploadParentId ? 'Upload New Revision' : 'Upload Document'}
                </Button>
              </div>
            </div>
          </Modal>

          {/* ── Edit Document Modal ────────────────────────────────────── */}
          <Modal
            title={<div className="flex items-center gap-2"><EditOutlined className="text-blue-500" /><span>Edit Document Details</span></div>}
            open={isEditDocModalOpen}
            onCancel={() => { setIsEditDocModalOpen(false); setEditingDoc(null); }}
            footer={null} destroyOnHidden width="95%" style={{ maxWidth: 450 }}
          >
            <Form form={editForm} layout="vertical" onFinish={handleEditDocument} className="mt-4">
              <Form.Item label="Document Name" name="document_name" rules={[{ required: true, message: 'Please enter document name' }]}>
                <Input placeholder="Enter document name" />
              </Form.Item>
              <Form.Item label="Document Type" name="document_type" rules={[{ required: true, message: 'Please select document type' }]}>
                <Select placeholder="Select type">
                  {['2D', '3D', 'Other'].map(t => (
                    <Select.Option key={t} value={t}>
                      {t === '2D' ? '2D Drawing' : t === '3D' ? '3D Model (STL/STEP)' : 'Other'}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
              {watchedDocType === 'Other' && (
                <Form.Item label="Custom Document Type" name="custom_type" rules={[{ required: true, message: 'Please enter custom document type' }]}>
                  <Input placeholder="Enter custom type" />
                </Form.Item>
              )}
              <div className="flex flex-col sm:flex-row justify-end gap-2 mt-6">
                <Button onClick={() => setIsEditDocModalOpen(false)} className="w-full sm:w-auto">Cancel</Button>
                <Button type="primary" htmlType="submit" className="no-hover-btn w-full sm:w-auto">Save Changes</Button>
              </div>
            </Form>
          </Modal>
        </div>
      ),
    },
  ];

  return (
    <div className="flex-1 bg-white overflow-hidden flex flex-col h-full" style={{ height: '100%' }}>
      <style>{`
        .primary-btn-sm,.no-hover-btn,.primary-btn-sm:hover,.no-hover-btn:hover{background-color:#2563eb!important;color:#fff!important;border:none!important;}
        .docs-ops-table .ant-table-tbody>tr>td,.docs-ops-table .ant-table-thead>tr>th{padding:8px 10px!important;}
        .docs-ops-table .ant-table-thead>tr>th{font-weight:600;color:#334155!important;}
        .custom-fit-table .ant-table-header{position:sticky;top:0;z-index:10;}
        .custom-fit-table .ant-table-body{overflow-y:auto!important;}
        @media(max-width:640px){
          .docs-ops-table .ant-table-tbody>tr>td,.docs-ops-table .ant-table-thead>tr>th,
          .docs-ebom-table .ant-table-tbody>tr>td,.docs-ebom-table .ant-table-thead>tr>th{padding:5px 6px!important;font-size:11px!important;}
        }
        .pdm-tabs-full.ant-tabs{display:flex;flex-direction:column;height:100%;}
        .pdm-tabs-full .ant-tabs-content,.pdm-tabs-full .ant-tabs-tabpane,.pdm-tabs-full .ant-tabs-content-holder,.pdm-tabs-full .ant-tabs-body{flex:1;min-height:0;overflow:hidden;height:100%;}
      `}</style>

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden px-3 pt-2 pb-3" style={{ height: '100%' }}>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems}
          className="flex-1 flex flex-col min-h-0 overflow-hidden pdm-tabs-full" style={{ height: '100%' }} />
      </div>

      {/* ── Preview Modal ──────────────────────────────────────────────── */}
      {previewDoc && (
        <Modal
          title={previewDoc.document_name || "Document Preview"}
          open onCancel={() => setPreviewDoc(null)}
          width="95%" style={{ maxWidth: 1000, top: 20 }}
          footer={null} destroyOnHidden
          styles={{ body: { height: '75vh', padding: 0, overflow: 'hidden' } }}
        >
          {getPreviewType(getDocumentDisplayName(previewDoc) || previewDoc.document_name) === 'image' ? (
            <div className="flex items-center justify-center h-full bg-gray-100 overflow-auto">
              <img src={previewDoc.document_url} alt={getDocumentDisplayName(previewDoc)} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            </div>
          ) : getPreviewType(getDocumentDisplayName(previewDoc) || previewDoc.document_name) === 'pdf' ? (
            <iframe src={`${previewDoc.document_url}#toolbar=0`} title={getDocumentDisplayName(previewDoc)} width="100%" height="100%" style={{ border: 'none' }} />
          ) : getPreviewType(getDocumentDisplayName(previewDoc) || previewDoc.document_name) === '3d' ? (
            <div className="w-full h-full">
              <ModelViewer3D documentId={previewDoc.id} height={500} showControls={true} />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-gray-50">
              <FileTextOutlined className="text-4xl text-gray-300 mb-3" />
              <Text type="secondary">Preview not available for this file type</Text>
            </div>
          )}
        </Modal>
      )}

      <OperationImportModal open={showImportModal} onCancel={() => setShowImportModal(false)} existingOperations={operations}
        onUseOperations={ops => { setImportOperations(ops); setShowImportModal(false); openPartActionModal('operation'); }} />
      <PartActionModal open={showPartActionModal} onCancel={() => setShowPartActionModal(false)} actionType={partActionType}
        selectedPart={selectedItem} onActionCreated={handleActionCreated} initialOperations={importOperations} existingOperations={operations} />
      <EditOperationModal open={isOperationModalOpen} onCancel={() => { setIsOperationModalOpen(false); setSelectedOperation(null); }}
        operation={selectedOperation} defaultTab={modalTab} showAddToolForm={showAddToolForm} onUpdate={async () => { await fetchDocuments(); }} />
      <PartDocumentReport
        partData={{ operations, documents, rawMaterials: selectedItem?.raw_material_status ? [{ material_name: selectedItem.raw_material_name || selectedItem.part_name, material_status: selectedItem.raw_material_status }] : [], partName: selectedItem?.part_name, partNumber: selectedItem?.part_number }}
        open={showReportModal} onCancel={() => setShowReportModal(false)} />

      {/* ── Operation View Modal ───────────────────────────────────────── */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <ToolOutlined className="text-blue-500" />
            <span className="text-sm sm:text-base truncate font-bold">Operation Details: {viewOperation?.operation_name}</span>
          </div>
        }
        open={isViewModalOpen} onCancel={() => setIsViewModalOpen(false)}
        width="95%" style={{ maxWidth: 800 }} footer={null} destroyOnHidden
      >
        {viewOperation && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-3 sm:p-4 rounded-lg border border-blue-200 space-y-3 sm:space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-1">Work Instructions:</p>
                <div className="bg-white p-2 sm:p-3 rounded border text-xs sm:text-sm whitespace-pre-wrap shadow-sm max-h-40 overflow-y-auto min-h-[60px]">
                  {viewOperation.work_instructions || 'No instructions available'}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-1">Notes:</p>
                <div className="bg-white p-2 sm:p-3 rounded border text-xs sm:text-sm whitespace-pre-wrap shadow-sm max-h-40 overflow-y-auto min-h-[60px]">
                  {viewOperation.notes || 'None specified'}
                </div>
              </div>
            </div>

            {(viewOperationTools.length > 0 || loadingViewTools) && (
              <div className="bg-white p-2 sm:p-3 rounded-lg border border-gray-200 shadow-sm overflow-x-auto">
                <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
                  <ToolOutlined /> Tools Required:
                </p>
                {loadingViewTools ? (
                  <div className="flex justify-center p-4"><Spin size="small" /></div>
                ) : (
                  <Table
                    dataSource={viewOperationTools} rowKey="id" pagination={false} size="small" bordered scroll={{ x: 600 }}
                    columns={[
                      { title: 'Tool Name', dataIndex: ['tool', 'item_description'], key: 'name', render: (text) => <span className="font-medium text-xs sm:text-sm">{text}</span> },
                      { title: 'Code', dataIndex: ['tool', 'identification_code'], key: 'code', render: (text) => <Tag className="text-xs">{text}</Tag> },
                      { title: 'Make', dataIndex: ['tool', 'make'], key: 'make', render: (text) => <span className="text-xs sm:text-sm">{text}</span> },
                      { title: 'Specification', dataIndex: ['tool', 'range'], key: 'range', render: (text) => <span className="text-xs sm:text-sm">{text}</span> },
                    ]}
                  />
                )}
              </div>
            )}

            <div className="bg-white p-2 sm:p-3 rounded-lg border border-gray-200 shadow-sm">
              <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
                <FileTextOutlined /> Operation Documents:
              </p>
              <OperationDocumentsList operationId={viewOperation.id} onPreview={(doc) => setPreviewDoc(doc)} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default DocumentsPanel;