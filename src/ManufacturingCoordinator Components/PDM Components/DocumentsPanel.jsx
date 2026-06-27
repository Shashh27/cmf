import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  PlusOutlined, DownloadOutlined, FileTextOutlined, EyeOutlined,
  SyncOutlined, ToolOutlined, ClockCircleOutlined, EnvironmentOutlined,
  DeleteOutlined, InboxOutlined, FilePdfOutlined, UploadOutlined, EditOutlined,
  HolderOutlined, ExclamationCircleOutlined, CheckCircleOutlined, CloseCircleOutlined,
  CheckSquareOutlined, UnorderedListOutlined, PlusCircleOutlined
} from "@ant-design/icons";
import axios from "axios";
import { API_BASE_URL } from "../../Config/auth";
import { Tabs, Button, Badge, Table, Select, Empty, Spin, Tooltip, Tag, Modal, Popconfirm, Typography, Upload, Input, Form, App } from "antd";
import { normalizeVersion, fetchInto } from "./operationUtils.js";
import PartActionModal from "./PartActionModal";
import EditOperationModal from "./EditOperationModal";
import OperationImportModal from "./OperationImportModal";
import PartDocumentReport from "../../DownloadReports/PartDocumentReport";
import ModelViewer3D from "./ModelViewer3D";
import OperationChecklistsModal from "./OperationChecklistsModal";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const { Text } = Typography;
const { Dragger } = Upload;

// Custom sortable row component for drag-and-drop
const SortableRow = (props) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props['data-row-key'],
  });

  const style = {
    ...props.style,
    transform: CSS.Transform.toString(transform && { x: 0, y: transform.y, scaleX: 1, scaleY: 1 }),
    transition,
    ...(isDragging ? { position: 'relative', zIndex: 9999, opacity: 0.8 } : {}),
  };

  return <tr {...props} ref={setNodeRef} style={style} {...attributes} {...listeners} />;
};

// ── OperationDocumentsList ──────────────────────────────────────────────────
const OperationDocumentsList = ({ docs = [], loading = false, onPreview }) => {
  if (loading) return <div className="p-4 flex justify-center"><Spin size="small"><span className="text-xs text-gray-600">Loading documents...</span></Spin></div>;
  if (!docs || !docs.length) return (
    <div className="p-6 text-center border border-dashed border-gray-300 rounded-lg bg-gray-50">
      <FileTextOutlined className="text-2xl text-gray-300 mb-2" />
      <p className="text-sm text-gray-500">No documents attached to this operation</p>
    </div>
  );

  const grouped = docs.reduce((acc, d) => { const r = d.parent_id || d.id; (acc[r] = acc[r] || []).push(d); return acc; }, {});
  const latest  = Object.values(grouped).map(g => [...g].sort((a, b) => b.id - a.id)[0]);

  const columns = [
    { title: 'Type', dataIndex: 'document_type', width: 120, render: t => <Tag color="blue" variant="filled" className="mr-0">{t || 'DOC'}</Tag> },
    { title: 'Document Name', dataIndex: 'document_name', ellipsis: true, render: t => <span className="font-medium text-gray-800">{t}</span> },
    { title: 'Revision', dataIndex: 'document_version', width: 100, render: t => <span className="text-blue-600 font-bold text-xs">{t || 'N/A'}</span> },
    { title: 'Actions', key: 'actions', width: 80, align: 'center', render: (_, doc) => (
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
          const versions = [...(grouped[r.parent_id || r.id] || [])].sort((a, b) => a.id - b.id);
          return (
            <div className="bg-gray-50 p-3 rounded">
              <p className="text-xs font-medium text-gray-600 mb-2">Revision History:</p>
              <div className="flex flex-col gap-2">
                {versions.map(ver => (
                  <div key={ver.id} className="flex justify-between items-center bg-white px-3 py-2 rounded border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-3 min-w-0">
                      <Tag color="blue" variant="filled" className="text-[10px] m-0 px-2">{ver.document_version || 'N/A'}</Tag>
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
    // Use the container's own height so the table always gets an internal scroll area
    // even when this panel sits inside another fixed-height/overflow-hidden layout (PDM).
    const update = () => {
      if (!ref.current) return;
      const h = ref.current.clientHeight || 0;
      // Reduced header space calculation to allow more room for operations
      // (Header is typically ~30-40px with reduced padding, plus minimal breathing room)
      setScrollY(Math.max(h - 40, 200));
    };
    const ro = new ResizeObserver(() => window.requestAnimationFrame(update));
    if (ref.current) ro.observe(ref.current);
    update();
    window.addEventListener('resize', update);
    return () => { ro.disconnect(); window.removeEventListener('resize', update); };
  }, []);

  return (
    <div className="flex-1 min-h-0 overflow-hidden w-full relative" ref={ref} style={{ height: '100%' }}>
      <Table columns={columns} dataSource={dataSource} pagination={false} scroll={{ y: scrollY, x: scrollX }} size="small" {...props} className={`${props.className || ''} custom-fit-table`} />
    </div>
  );
};

// ── DocumentsPanel ──────────────────────────────────────────────────────────
const DocumentsPanel = ({ selectedItem, onDocumentsLoaded, compactMode = false, onTabChange, externalActiveTab }) => {
  const { message } = App.useApp();
  const [documents, setDocuments]   = useState([]);
  const [operations, setOperations] = useState([]);
  const [activeTab, setActiveTab]   = useState('mbom');
  const [loading, setLoading]       = useState(false);

  // Preview
  const [previewDoc, setPreviewDoc]         = useState(null);

  // Modals
  const [showPartActionModal, setShowPartActionModal] = useState(false);
  const [partActionType, setPartActionType]           = useState('');
  const [selectedOperation, setSelectedOperation]     = useState(null);
  const [viewOperation, setViewOperation]             = useState(null);
  const [isOperationModalOpen, setIsOperationModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen]         = useState(false);
  const [modalTab, setModalTab]                       = useState('details');
  const [showAddToolForm, setShowAddToolForm]         = useState(false);
  const [showImportModal, setShowImportModal]       = useState(false);
  const [importOperations, setImportOperations]       = useState([]);
  const [showReportModal, setShowReportModal] = useState(false);

  // Checklists state
  const [showChecklistsModal, setShowChecklistsModal] = useState(false);
  const [selectedOperationForChecklists, setSelectedOperationForChecklists] = useState(null);

  // eBOM version selection
  const [selectedVersions, setSelectedVersions] = useState({});

  // Upload state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploading, setUploading]                 = useState(false);
  const [selectedFileList, setSelectedFileList]   = useState([]);
  const [uploadDocType, setUploadDocType]         = useState('2D');
  const [uploadDocTypeOther, setUploadDocTypeOther] = useState('');
  const [uploadParentId, setUploadParentId]       = useState(null);
  const [uploadVersion, setUploadVersion]         = useState('');

  // Edit doc
  const [isEditDocModalOpen, setIsEditDocModalOpen] = useState(false);
  const [editingDoc, setEditingDoc]                 = useState(null);
  const [editForm] = Form.useForm();
  const watchedDocType = Form.useWatch('document_type', editForm);

  useEffect(() => {
    if (editingDoc) {
      const isOther = !['2D','3D'].includes(editingDoc.document_type);
      editForm.setFieldsValue({ document_name: editingDoc.document_name, document_type: isOther ? 'Other' : editingDoc.document_type, custom_type: isOther ? editingDoc.document_type : '' });
    } else { editForm.resetFields(); }
  }, [editingDoc, editForm]);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const parseV = (v) => parseFloat(String(v).replace(/^v/i, ''));

  const groupedPartDocs = useMemo(() =>
    documents.reduce((acc, d) => { const r = d.parent_id || d.id; (acc[r] = acc[r] || []).push(d); return acc; }, []),
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
    if (externalActiveTab !== undefined && externalActiveTab !== activeTab) {
      setActiveTab(externalActiveTab);
    }
  }, [externalActiveTab, activeTab]);

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

  const getCurrentUserRole = () => {
    try {
      const stored = localStorage.getItem("user");
      if (!stored) return null;
      const u = JSON.parse(stored);
      return u?.role || null;
    } catch {
      return null;
    }
  };

  const fetchDocuments = async () => {
    if (!selectedItem || selectedItem.itemType !== 'part') { setDocuments([]); setOperations([]); if (onDocumentsLoaded) onDocumentsLoaded([]); return; }
    setLoading(true);
    try {
      // Get current user role
      const currentUserRole = getCurrentUserRole();
      
      const [dR, oR] = await Promise.all([
        axios.get(`${API_BASE_URL}/documents/part/${selectedItem.id}`),
        axios.get(`${API_BASE_URL}/operations/part/${selectedItem.id}`),
      ]);
      const docs = dR.data;
      const ops = oR.data;
      
      // Filter documents: PC uploads require acknowledgment, admin/MC uploads visible to all
      const filteredDocs = docs.filter(doc => {
        const uploaderRole = doc.user_role;
        // If uploaded by PC, require acknowledgment and not rejected
        if (uploaderRole === 'project_coordinator') return doc.is_acknowledged && !doc.mc_is_rejected;
        // Admin/MC uploads are visible to everyone without acknowledgment
        return true;
      });
      
      setDocuments(filteredDocs); setOperations(ops.sort((a, b) => a.operation_number - b.operation_number));
      if (onDocumentsLoaded) onDocumentsLoaded(filteredDocs);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleDownload = (id) => { const a = document.createElement('a'); a.href = `${API_BASE_URL}/documents/${id}/download`; a.style.display = 'none'; document.body.appendChild(a); a.click(); a.remove(); };
  const handlePreview  = (doc) => { setPreviewDoc({ doc, source: 'part' }); };
  const getPreviewType = (name) => {
    const ext = (name || '').split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(ext)) return 'image';
    if (ext === 'pdf') return 'pdf';
    if (['stl', 'step', 'stp', 'obj', '3ds', 'fbx', 'gltf', 'glb'].includes(ext)) return '3d';
    return 'other';
  };
  const previewPreviewUrl = previewDoc && (previewDoc.source === 'part' ? `${API_BASE_URL}/documents/${previewDoc.doc.id}/preview` : `${API_BASE_URL}/operation-documents/${previewDoc.doc.id}/preview`);
  const previewDownload = () => {
    if (!previewDoc) return;
    const url = previewDoc.source === 'part' ? `${API_BASE_URL}/documents/${previewDoc.doc.id}/download` : `${API_BASE_URL}/operation-documents/${previewDoc.doc.id}/download`;
    const a = document.createElement('a'); a.href = url; a.setAttribute('download', previewDoc.doc.document_name); document.body.appendChild(a); a.click(); a.remove();
    setPreviewDoc(null);
  };

  const handleUpload = async () => {
    if (!selectedFileList.length) { message.warning('Please select a file first'); return; }
    if (uploadDocType === 'Other' && !uploadDocTypeOther.trim()) { message.warning('Please enter document type'); return; }
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
      resetUploadState();
      setIsUploadModalOpen(false);
      await fetchDocuments();
    } catch (e) {
      console.error(e);
      const detail =
        e?.response?.data?.detail ||
        e?.response?.data?.message ||
        'Failed to upload document';
      message.error(detail);
    }
    finally { setUploading(false); }
  };

  const resetUploadState = () => { setSelectedFileList([]); setUploadParentId(null); setUploadVersion(''); setUploadDocType('2D'); setUploadDocTypeOther(''); };

  const handleDeleteDocument = async (id) => {
    try {
      await axios.delete(`${API_BASE_URL}/documents/${id}`);
      message.success('Document deleted successfully');
      await fetchDocuments();
    } catch (e) {
      console.error(e);
      const raw =
        e?.response?.data?.detail ||
        e?.response?.data?.message ||
        e?.message ||
        '';
      const msg = String(raw || '');
      if (msg.toLowerCase().includes('foreignkeyviolation') || msg.toLowerCase().includes('violates foreign key')) {
        message.error('Cannot delete this document because it has versions (child documents). Delete the versions first.');
      } else {
        message.error(msg.length > 160 ? `${msg.slice(0, 160)}...` : (msg || 'Failed to delete document'));
      }
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
      const detail =
        e?.response?.data?.detail ||
        e?.response?.data?.message ||
        'Failed to update document';
      message.error(detail);
    }
  };

  const handleAcknowledgeDocument = async (docId, currentStatus) => {
    try {
      await axios.put(`${API_BASE_URL}/documents/${docId}/acknowledge`, null, {
        params: { is_acknowledged: !currentStatus }
      });
      message.success('Document acknowledged successfully');
      // Optimistically update the local state
      setDocuments(prevDocs => 
        prevDocs.map(doc => 
          doc.id === docId ? { ...doc, is_acknowledged: true } : doc
        )
      );
      // Also update selectedVersions to reflect the change immediately
      setSelectedVersions(prevVersions => {
        const updated = { ...prevVersions };
        for (const key in updated) {
          if (updated[key]?.id === docId) {
            updated[key] = { ...updated[key], is_acknowledged: true };
          }
        }
        return updated;
      });
      // Then fetch to ensure consistency
      await fetchDocuments();
    } catch (e) {
      console.error(e);
      const detail =
        e?.response?.data?.detail ||
        e?.response?.data?.message ||
        'Failed to update acknowledgment status';
      message.error(detail);
    }
  };

  const initiateNewVersion = (doc, latestVer) => {
    setUploadParentId(doc.parent_id || doc.id);
    setUploadVersion('');
    setUploadDocType(doc.document_type || '2D');
    setIsUploadModalOpen(true);
  };

  const handleDeleteOperation = async (opId) => {
    try {
      await axios.delete(`${API_BASE_URL}/operations/${opId}`);
      message.success("Operation deleted successfully");
      fetchDocuments();
    } catch (e) {
      console.error(e);
      const detail =
        e?.response?.data?.detail ||
        e?.response?.data?.message ||
        "Failed to delete operation";
      message.error(detail);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/operations/template/download`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'Operations_Template.docx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      message.success('Template downloaded successfully');
    } catch (e) {
      console.error(e);
      const detail =
        e?.response?.data?.detail ||
        e?.response?.data?.message ||
        'Failed to download template';
      message.error(detail);
    }
  };


  const openPartActionModal = (type) => {
    if (!selectedItem || selectedItem.itemType !== 'part') { message.warning("Please select a part to add operations/documents"); return; }
    setPartActionType(type); setShowPartActionModal(true);
  };

  const handleActionCreated = async (newItem, type) => {
    message.success(type === 'operation' ? `Operation "${newItem.operation_name}" created successfully!` : `Document "${newItem.document_name}" created successfully!`);
    await fetchDocuments(); setImportOperations([]);
  };

  const onOperationDragEnd = async ({ active, over }) => {
    if (active.id !== over?.id) {
      const activeIndex = operations.findIndex((i) => i.id === active.id);
      const overIndex = operations.findIndex((i) => i.id === over?.id);
      
      const sourceOp = operations[activeIndex];
      const targetOp = operations[overIndex];
      const sourceOpNumber = sourceOp.operation_number;
      const targetOpNumber = targetOp.operation_number;

      Modal.confirm({
        title: 'Confirm Reorder',
        icon: <ExclamationCircleOutlined />,
        content: (
          <div>
            <p>Are you sure you want to swap these operations?</p>
            <p><strong>{sourceOp.operation_name}</strong> (Op #{sourceOpNumber})</p>
            <p>↔</p>
            <p><strong>{targetOp.operation_name}</strong> (Op #{targetOpNumber})</p>
          </div>
        ),
        okText: 'Yes, Swap',
        cancelText: 'Cancel',
        onOk: async () => {
          try {
            // Use the dedicated swap endpoint
            await axios.post(`${API_BASE_URL}/operations/swap`, null, {
              params: {
                op1_id: sourceOp.id,
                op2_id: targetOp.id
              }
            });
            
            message.success('Operations swapped successfully');
            await fetchDocuments();
          } catch (error) {
            console.error('Error swapping operations:', error);
            message.error(error?.response?.data?.detail || 'Failed to swap operations');
            await fetchDocuments();
          }
        },
      });
    }
  };

  // ── operations table columns ───────────────────────────────────────────────
  const operationsColumns = [
    { key: 'sort', width: 30, render: () => <HolderOutlined style={{ cursor: 'grab', color: '#999' }} /> },
    { title: 'Op #', dataIndex: 'operation_number', key: 'op', width: 70,
      render: (t, _, i) => <Tag color="cyan" className="font-mono text-sm font-medium m-0 px-1.5 py-0.5">{String(t || i + 1).padStart(2, '0')}</Tag> },
    { title: <span className="font-semibold text-slate-700">Operation Name</span>, dataIndex: 'operation_name', key: 'name', ellipsis: true, minWidth: 150,
      render: n => <span className="text-sm font-medium text-slate-900">{n || '—'}</span> },
    { title: <span><ClockCircleOutlined className="mr-0.5" />Setup</span>, dataIndex: 'setup_time', key: 'setup', width: 100,
      render: t => <Tag color="orange" className="text-sm font-medium m-0 px-1.5 py-0.5">{t || '00:00:00'}</Tag> },
    { title: <span><ClockCircleOutlined className="mr-0.5" />Cycle</span>, dataIndex: 'cycle_time', key: 'cycle', width: 100,
      render: t => <Tag color="green" className="text-sm font-medium m-0 px-1.5 py-0.5">{t || '00:00:00'}</Tag> },
    { title: <span><EnvironmentOutlined className="mr-0.5" />Workcenter</span>, dataIndex: 'workcenter_id', key: 'wc',
      render: (id, r) => <Tag color="purple" className="text-sm font-medium m-0 px-1.5 py-0.5 whitespace-normal">{r.work_center_name || id || 'N/A'}</Tag> },
    { title: <span className="font-semibold text-slate-700">Machine</span>, dataIndex: 'machine_id', key: 'mc',
      render: (id, r) => <Tag color="geekblue" className="text-sm font-medium m-0 px-1.5 py-0.5 whitespace-normal">{r.machine_name || id || 'N/A'}</Tag> },
    { title: <span className="font-semibold text-slate-700">Op Type</span>, dataIndex: 'part_type_id', key: 'type',
      render: (_, r) => <Tag color={r.part_type_name === 'Out-Source' ? 'orange' : 'blue'} className="m-0 px-1.5 py-0.5 text-xs">{r.part_type_name || 'IN-House'}</Tag> },
    { title: <span className="font-semibold text-slate-700">From Date</span>, dataIndex: 'from_date', key: 'from', width: 120,
      render: v => v ? <span className="text-sm text-slate-700 font-medium">{new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span> : <span className="text-slate-500">—</span> },
    { title: <span className="font-semibold text-slate-700">To Date</span>, dataIndex: 'to_date', key: 'to', width: 120,
      render: v => v ? <span className="text-sm text-slate-700 font-medium">{new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span> : <span className="text-slate-500">—</span> },
    { title: <span className="font-semibold text-slate-700 text-center block">Actions</span>, key: 'actions', align: 'center', width: 150, fixed: 'right',
      render: (_, r) => {
        const isOut = r.part_type_name === 'Out-Source' || r.part_type_id === 2;
        return (
          <div className="flex gap-0.5 justify-center" onClick={e => e.stopPropagation()}>
            <Tooltip title="View"><Button size="small" icon={<EyeOutlined />} onClick={() => { setViewOperation(r); setIsViewModalOpen(true); }} className="text-green-500 hover:bg-green-50" /></Tooltip>
            <Tooltip title="Edit"><Button size="small" icon={<EditOutlined />} onClick={() => { setSelectedOperation(r); setModalTab('details'); setShowAddToolForm(false); setIsOperationModalOpen(true); }} className="text-blue-500 hover:bg-blue-50" /></Tooltip>
            {!isOut && <Tooltip title="Add Tool"><Button size="small" icon={<ToolOutlined />} onClick={() => { setSelectedOperation(r); setModalTab('tools'); setShowAddToolForm(true); setIsOperationModalOpen(true); }} className="text-orange-500 hover:bg-orange-50" /></Tooltip>}
            <Tooltip title="Checklists"><Button size="small" icon={<UnorderedListOutlined />} onClick={() => { setSelectedOperationForChecklists(r); setShowChecklistsModal(true); }} className="text-purple-500 hover:bg-purple-50" /></Tooltip>
            <Popconfirm title="Delete operation?" onConfirm={() => handleDeleteOperation(r.id)} okText="Yes" cancelText="No">
              <Button size="small" danger icon={<DeleteOutlined />} className="hover:bg-red-50" />
            </Popconfirm>
          </div>
        );
      }
    },
  ];

  const getDocumentDisplayName = (doc) => {
    if (!doc) return '';
    if (doc.document_url) {
      const segment = doc.document_url.split('/').filter(Boolean).pop();
      if (segment) {
        // Remove timestamp (YYYYMMDD_HHMMSS_) from the beginning
        let cleanName = segment.replace(/^\d{8}_\d{6}_/, '');
        
        // Check if what remains starts with a UUID pattern (8+ alphanumeric chars followed by underscore)
        const uuidMatch = cleanName.match(/^([a-zA-Z0-9]{8,})_/);
        if (uuidMatch) {
          // Remove the UUID and underscore
          cleanName = cleanName.replace(/^([a-zA-Z0-9]{8,})_/, '');
        }
        
        return cleanName || doc.document_name || '';
      }
    }
    // Fallback: return document_name as is
    return doc.document_name || '';
  };

  // ── eBOM table columns ─────────────────────────────────────────────────────
  const eBomColumns = [
    { title: <span className="text-xs font-semibold">DOCUMENT NAME</span>, key: 'name',
      render: (_, r) => { const cur = selectedVersions[r.parent_id || r.id] || r; const displayName = getDocumentDisplayName(cur); return <div className="flex items-center gap-3 py-1"><div className="p-2 bg-blue-50 rounded"><FilePdfOutlined className="text-blue-500" /></div><Text strong className="text-sm truncate max-w-[300px]">{displayName || cur.document_name}</Text></div>; }
    },
    { title: <span className="text-xs font-semibold">TYPE</span>, key: 'type', width: 120,
      render: (_, r) => { const cur = selectedVersions[r.parent_id || r.id] || r; return <Tag color="blue" className="m-0 text-xs px-1 leading-4 uppercase border-none bg-blue-100 text-blue-700">{cur.document_type || '2D'}</Tag>; }
    },
    { title: <span className="text-xs font-semibold">REVISION</span>, key: 'ver', width: 150,
      render: (_, r) => {
        const rootId = r.parent_id || r.id;
        const group  = groupedPartDocs[rootId] || [];
        const cur    = selectedVersions[rootId] || r;
        const versionWidth = 88;
        if (group.length <= 1) {
          const ver = cur?.document_version || '1.0';
          return (
            <Select
              size="small"
              value={cur.id}
              disabled
              suffixIcon={null}
              variant="filled"
              style={{ width: versionWidth }}
              options={[{ value: cur.id, label: ver }]}
            />
          );
        }
        return (
          <Select
            size="small"
            value={cur.id}
            variant="filled"
            style={{ width: versionWidth }}
            onChange={val => { const s = group.find(d => d.id === val); setSelectedVersions(p => ({ ...p, [rootId]: s })); }}
            popupMatchSelectWidth={false}
            styles={{ popup: { root: { minWidth: 120, padding: 4 } } }}
            labelRender={({ value }) => {
              const v = group.find(d => d.id === value);
              const ver = v?.document_version || '1.0';
              return <span className="font-bold text-blue-600">{ver}</span>;
            }}
            options={[...group]
              .sort((a, b) => b.id - a.id)
              .map((ver) => ({ value: ver.id, label: ver.document_version || '1.0' }))
            }
          />
        );
      }
    },
    { title: <span className="text-xs font-semibold">UPLOADED BY</span>, key: 'uploaded_by', width: 150,
      render: (_, r) => {
        const cur = selectedVersions[r.parent_id || r.id] || r;
        return <span className="text-xs text-slate-600">{cur.user_name || 'Unknown'}</span>;
      }
    },
    { title: <span className="text-xs font-semibold">DATE</span>, key: 'date', width: 120,
      render: (_, r) => {
        const cur = selectedVersions[r.parent_id || r.id] || r;
        return cur.created_at ? <span className="text-xs text-slate-700 font-medium">{new Date(cur.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span> : <span className="text-xs text-slate-400">—</span>;
      }
    },
    { title: <span className="text-xs font-semibold">ACKNOWLEDGED</span>, key: 'acknowledged', width: 150, align: 'center',
      render: (_, r) => {
        const cur = selectedVersions[r.parent_id || r.id] || r;
        
        // Check if MC has handled this document (acknowledged or rejected)
        if (cur.mc_is_rejected) {
          return (
            <Tooltip title={cur.mc_reject_remarks || 'Rejected by MC'}>
              <Tag color="red" icon={<CloseCircleOutlined />} className="m-0 text-xs">Rejected</Tag>
            </Tooltip>
          );
        } else if (cur.is_acknowledged) {
          return (
            <Tooltip title={cur.mc_ack_remarks || 'Acknowledged by MC'}>
              <Tag color="green" icon={<CheckCircleOutlined />} className="m-0 text-xs">Acknowledged</Tag>
            </Tooltip>
          );
        } else {
          return <span className="text-xs text-gray-400">-</span>;
        }
      }
    },
    { title: <span className="text-xs font-semibold text-center block">ACTIONS</span>, key: 'actions', width: 220, align: 'center', fixed: 'right',
      render: (_, r) => {
        const cur = selectedVersions[r.parent_id || r.id] || r;
        return (
          <div className="flex gap-1 justify-center">
            <Tooltip title="Preview"><Button size="small" type="text" icon={<EyeOutlined />} onClick={() => handlePreview(cur)} className="hover:text-blue-500 hover:bg-blue-50" /></Tooltip>
            <Tooltip title="Update Revision"><Button size="small" type="text" className="text-orange-500 hover:bg-orange-50" icon={<SyncOutlined />} onClick={() => initiateNewVersion(r, r.document_version)} /></Tooltip>
            <Tooltip title="Edit Details"><Button size="small" type="text" className="text-blue-500 hover:bg-blue-50" icon={<EditOutlined />} onClick={() => { setEditingDoc(cur); setIsEditDocModalOpen(true); }} /></Tooltip>
            <Tooltip title="Download"><Button size="small" type="text" className="text-green-500 hover:bg-green-50" icon={<DownloadOutlined />} onClick={() => handleDownload(cur.id)} /></Tooltip>
            <Popconfirm title="Delete Document" description="Delete this revision? This cannot be undone." onConfirm={() => handleDeleteDocument(cur.id)} okText="Yes" cancelText="No">
              <Button size="small" type="text" danger icon={<DeleteOutlined />} className="hover:bg-red-50" />
            </Popconfirm>
          </div>
        );
      }
    },
  ];

  if (!selectedItem) return <div className="flex-1 bg-gray-50" />;
  const isPart = selectedItem.itemType === 'part';

  const tabItems = [
    ...(isPart ? [{
      key: 'mbom', label: <span className="font-medium">Process Plan</span>,
      children: (
        <div className="h-full flex flex-col min-h-0">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-1.5 shrink-0 gap-2">
            <span className="text-xs text-slate-500">Drag rows to reorder operations</span>
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <Button size="small" icon={<DownloadOutlined />} onClick={handleDownloadTemplate} disabled={!isPart} className="primary-btn-sm flex-1 sm:flex-initial">
                <span className="hidden sm:inline">Download Template</span><span className="sm:hidden">Template</span>
              </Button>
              <Button size="small" icon={<UploadOutlined />} onClick={() => setShowImportModal(true)} disabled={!isPart} className="primary-btn-sm flex-1 sm:flex-initial">
                <span className="hidden sm:inline">Upload MPP</span><span className="sm:hidden">MPP</span>
              </Button>
              <Button size="small" icon={<DownloadOutlined />} onClick={() => setShowReportModal(true)} disabled={!isPart || loading} className="primary-btn-sm flex-1 sm:flex-initial">
                <span className="hidden sm:inline">Download Report</span><span className="sm:hidden">Report</span>
              </Button>
             
              <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => { setImportOperations([]); openPartActionModal('operation'); }} disabled={!isPart} className="primary-btn-sm flex-1 sm:flex-initial">
                <span className="hidden sm:inline">Add Operation</span><span className="sm:hidden">Add Op</span>
              </Button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onOperationDragEnd}>
              <SortableContext items={operations.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                <FitTable 
                  dataSource={operations} 
                  columns={operationsColumns} 
                  rowKey="id" 
                  className="docs-ops-table" 
                  locale={{ emptyText: <Empty description="No operations" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                  components={{
                    body: {
                      row: SortableRow,
                    },
                  }}
                />
              </SortableContext>
            </DndContext>
          </div>
          {/* Small separation line between operations and bottom sections */}
          <div className="border-t border-slate-200 my-1"></div>
        </div>
      ),
    }] : []),
    {
      key: 'ebom', label: <span className="font-medium">{isPart ? 'Part Documents' : 'Documents'}</span>,
      children: (
        <div className="h-full flex flex-col min-h-0 overflow-hidden">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2 shrink-0 gap-2">
            <span className="text-xs text-slate-500">Documents & revisions</span>
            <Button type="primary" size="small" icon={<PlusOutlined />} className="primary-btn-sm w-full sm:w-auto"
              onClick={() => { if (isPart) { openPartActionModal('document'); } else { resetUploadState(); setIsUploadModalOpen(true); } }}>
              Add Document
            </Button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden w-full">
            <FitTable dataSource={latestPartDocs} rowKey="id" size="small" pagination={false} className="docs-ebom-table border border-slate-100 rounded-lg overflow-hidden" scrollX="max-content" columns={eBomColumns} />
          </div>

          {/* Upload Modal */}
          <Modal title={<div className="flex items-center gap-2"><PlusOutlined className="text-blue-500" /><span>{uploadParentId ? 'Upload New Revision' : 'Add New Document'}</span></div>}
            open={isUploadModalOpen} onCancel={() => { setIsUploadModalOpen(false); resetUploadState(); }} footer={null} destroyOnHidden width="95%" style={{ maxWidth: 450 }}>
            <div className="space-y-4 mt-4">
              <div>
                <Text type="secondary" className="text-xs block mb-1">Document Type</Text>
                <Select className="w-full" value={uploadDocType} onChange={setUploadDocType}>
                  {['2D','3D','Other'].map(t => <Select.Option key={t} value={t}>{t === '2D' ? '2D Drawing' : t === '3D' ? '3D Model (STL/STEP)' : 'Other'}</Select.Option>)}
                </Select>
                {uploadDocType === 'Other' && <Input className="mt-2" placeholder="Enter custom document type" value={uploadDocTypeOther} onChange={e => setUploadDocTypeOther(e.target.value)} />}
              </div>
              <div>
                <Text type="secondary" className="text-xs block mb-1">Revision <span className="text-red-500">*</span></Text>
                <Input value={uploadVersion} onChange={e => setUploadVersion(normalizeVersion(e.target.value))} placeholder="00" className="bg-white" />
                {uploadParentId && <Text type="warning" className="text-[10px] mt-1 block">Creating a new revision for an existing document.</Text>}
              </div>
              <Dragger 
                showUploadList={false}
                multiple={false} 
                fileList={selectedFileList} 
                beforeUpload={f => { setSelectedFileList([f]); return false; }} 
                className="bg-gray-50 border-dashed border-2"
                style={{ padding: '12px 0' }}
              >
                <p className="ant-upload-drag-icon mb-1"><InboxOutlined className="text-xl text-blue-400" /></p>
                <p className="ant-upload-text text-[11px] font-medium">Click or drag file here</p>
                <p className="ant-upload-hint text-[10px] text-gray-400">PDF, STL, STEP, Images...</p>
              </Dragger>
              {selectedFileList.length > 0 && (
                <div className="mt-2 p-2 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileTextOutlined className="text-blue-500 shrink-0" />
                    <span className="text-[11px] text-gray-700 truncate font-medium">{selectedFileList[0].name}</span>
                  </div>
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => setSelectedFileList([])} className="h-6 w-6 flex items-center justify-center p-0" />
                </div>
              )}
              <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
                <Button onClick={() => setIsUploadModalOpen(false)} className="w-full sm:w-auto">Cancel</Button>
                <Button type="primary" icon={<UploadOutlined />} loading={uploading} disabled={!selectedFileList.length || !uploadVersion.trim()} onClick={handleUpload} className="no-hover-btn w-full sm:w-auto">
                  {uploadParentId ? 'Upload New Revision' : 'Upload Document'}
                </Button>
              </div>
            </div>
          </Modal>

          {/* Edit Document Modal */}
          <Modal title={<div className="flex items-center gap-2"><EditOutlined className="text-blue-500" /><span>Edit Document Details</span></div>}
            open={isEditDocModalOpen} onCancel={() => { setIsEditDocModalOpen(false); setEditingDoc(null); }} footer={null} destroyOnHidden width="95%" style={{ maxWidth: 450 }}>
            <Form form={editForm} layout="vertical" onFinish={handleEditDocument} className="mt-4">
              <Form.Item label="Document Name" name="document_name" rules={[{ required: true, message: 'Please enter document name' }]}>
                <Input placeholder="Enter document name" />
              </Form.Item>
              <Form.Item label="Document Type" name="document_type" rules={[{ required: true, message: 'Please select document type' }]}>
                <Select placeholder="Select type">
                  {['2D','3D','Other'].map(t => <Select.Option key={t} value={t}>{t === '2D' ? '2D Drawing' : t === '3D' ? '3D Model (STL/STEP)' : 'Other'}</Select.Option>)}
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
        .docs-ops-table .ant-table-tbody>tr>td,.docs-ops-table .ant-table-thead>tr>th{padding:${compactMode ? '4px 6px' : '6px 8px'}!important;}
        .docs-ops-table .ant-table-thead>tr>th{font-weight:600;color:#334155!important;}
        .custom-fit-table .ant-table-header{position:sticky;top:0;z-index:10;}
        .custom-fit-table .ant-table-body{overflow-y:auto!important;}
        /* Blur operations table when modal is open */
        .ant-modal-mask + * .docs-ops-table,
        .ant-modal-mask + * .custom-fit-table,
        .ant-modal-mask + * .docs-ops-table .ant-table-placeholder,
        .ant-modal-mask + * .docs-ops-table .ant-empty,
        body:has(.ant-modal-mask) .docs-ops-table,
        body:has(.ant-modal-mask) .custom-fit-table,
        body:has(.ant-modal-mask) .docs-ops-table .ant-table-placeholder,
        body:has(.ant-modal-mask) .docs-ops-table .ant-empty {
          filter: blur(2px);
          pointer-events: none;
        }
        @media(max-width:640px){
          .docs-ops-table .ant-table-tbody>tr>td,.docs-ops-table .ant-table-thead>tr>th,
          .docs-ebom-table .ant-table-tbody>tr>td,.docs-ebom-table .ant-table-thead>tr>th{padding:${compactMode ? '4px 6px' : '6px 8px'}!important;}
        }
        .pdm-tabs-full.ant-tabs{display:flex;flex-direction:column;height:100%;}
        .pdm-tabs-full .ant-tabs-content,.pdm-tabs-full .ant-tabs-tabpane,.pdm-tabs-full .ant-tabs-content-holder,.pdm-tabs-full .ant-tabs-body{flex:1;min-height:0;overflow:hidden;height:100%;}
        .compact-mode .ant-tabs-nav{margin-bottom: ${compactMode ? '8px' : '16px'}!important;}
        .compact-mode .ant-tabs-tab{padding: ${compactMode ? '4px 8px' : '8px 16px'}!important;font-size: ${compactMode ? '12px' : '14px'}!important;}
      `}</style>

      <div className={`flex-1 flex flex-col min-h-0 overflow-hidden ${compactMode ? 'px-2 pt-1 pb-2' : 'px-3 pt-2 pb-3'}`} style={{ height: '100%' }}>
        <Tabs activeKey={activeTab} onChange={(key) => { setActiveTab(key); if (onTabChange) onTabChange(key); }} items={tabItems} className={`flex-1 flex flex-col min-h-0 overflow-hidden pdm-tabs-full ${compactMode ? 'compact-mode' : ''}`} style={{ height: '100%' }} />
      </div>

      {/* Preview Modal */}
      {previewDoc && (
        <Modal
          title={getDocumentDisplayName(previewDoc.doc) || previewDoc.doc.document_name || "Document Preview"}
          open
          onCancel={() => setPreviewDoc(null)}
          width="95%"
          style={{ maxWidth: 1000, top: 20 }}
          destroyOnHidden
          styles={{ body: { height: '75vh', padding: 0, minHeight: 200 } }}
          footer={[
            <Button key="dl" icon={<DownloadOutlined />} onClick={previewDownload}>Download</Button>,
            <Button key="cl" type="primary" onClick={() => setPreviewDoc(null)}>Close</Button>
          ]}
        >
          {getPreviewType(getDocumentDisplayName(previewDoc.doc) || previewDoc.doc.document_name) === 'image' ? (
            <div className="flex items-center justify-center h-full bg-gray-100 overflow-auto">
              <img src={previewPreviewUrl} alt={getDocumentDisplayName(previewDoc.doc)} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            </div>
          ) : getPreviewType(getDocumentDisplayName(previewDoc.doc) || previewDoc.doc.document_name) === 'pdf' ? (
            <iframe src={`${previewPreviewUrl}#toolbar=0`} title={getDocumentDisplayName(previewDoc.doc)} width="100%" height="100%" style={{ border: 'none' }} />
          ) : getPreviewType(getDocumentDisplayName(previewDoc.doc) || previewDoc.doc.document_name) === '3d' ? (
            <div className="w-full h-full">
              <ModelViewer3D documentId={previewDoc.doc.id} height={500} showControls={true} />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-gray-50">
              <FileTextOutlined className="text-5xl text-gray-400 mb-4" />
              <p className="text-gray-700 font-medium mb-2">Preview is not available for this file type.</p>
              <p className="text-gray-500">Please download the file to view it.</p>
            </div>
          )}
        </Modal>
      )}

      <OperationImportModal open={showImportModal} onCancel={() => setShowImportModal(false)} existingOperations={operations} onUseOperations={ops => { setImportOperations(ops); setShowImportModal(false); openPartActionModal('operation'); }} />
      <PartActionModal open={showPartActionModal} onCancel={() => setShowPartActionModal(false)} actionType={partActionType} selectedPart={selectedItem} onActionCreated={handleActionCreated} initialOperations={importOperations} existingOperations={operations} />
      <EditOperationModal open={isOperationModalOpen} onCancel={() => { setIsOperationModalOpen(false); setSelectedOperation(null); }} operation={selectedOperation} defaultTab={modalTab} showAddToolForm={showAddToolForm} onUpdate={async () => { await fetchDocuments(); }} />
      <PartDocumentReport partData={{ operations, documents, rawMaterials: selectedItem?.raw_material_status ? [{ material_name: selectedItem.raw_material_name || selectedItem.part_name, material_status: selectedItem.raw_material_status }] : [], partName: selectedItem?.part_name, partNumber: selectedItem?.part_number }} open={showReportModal} onCancel={() => setShowReportModal(false)} />

      {/* Operation View Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <ToolOutlined className="text-blue-500" />
            <span className="text-sm sm:text-base truncate font-bold">Operation Details: {viewOperation?.operation_name}</span>
          </div>
        }
        open={isViewModalOpen}
        onCancel={() => setIsViewModalOpen(false)}
        width="95%"
        style={{ maxWidth: 800 }}
        footer={null}
        destroyOnHidden
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

            {((viewOperation.tools && viewOperation.tools.length > 0)) && (
              <div className="bg-white p-2 sm:p-3 rounded-lg border border-gray-200 shadow-sm overflow-x-auto">
                <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
                  <ToolOutlined /> Tools Required:
                </p>
                <Table
                  dataSource={[...viewOperation.tools].sort((a, b) => a.id - b.id)}
                  rowKey="id"
                  pagination={false}
                  size="small"
                  bordered
                  scroll={{ x: 600 }}
                  columns={[
                    { title: 'Tool Name', dataIndex: ['tool', 'item_description'], key: 'name', render: (text) => <span className="font-medium text-xs sm:text-sm">{text}</span> },
                    { title: 'Code', dataIndex: ['tool', 'identification_code'], key: 'code', render: (text) => <Tag className="text-xs">{text}</Tag> },
                    { title: 'Make', dataIndex: ['tool', 'make'], key: 'make', render: (text) => <span className="text-xs sm:text-sm">{text}</span> },
                    { title: 'Specification', dataIndex: ['tool', 'range'], key: 'range', render: (text) => <span className="text-xs sm:text-sm">{text}</span> },
                  ]}
                />
              </div>
            )}

            <div className="bg-white p-2 sm:p-3 rounded-lg border border-gray-200 shadow-sm">
              <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
                <FileTextOutlined /> Operation Documents:
              </p>
              <OperationDocumentsList docs={viewOperation.operation_documents} onPreview={(doc) => setPreviewDoc({ doc, source: 'operation' })} />
            </div>
          </div>
        )}
      </Modal>
      <OperationChecklistsModal
        visible={showChecklistsModal}
        onClose={() => {
          setShowChecklistsModal(false);
          setSelectedOperationForChecklists(null);
        }}
        operation={selectedOperationForChecklists}
      />
    </div>
  );
};

export default DocumentsPanel;



