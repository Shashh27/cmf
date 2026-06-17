import React, { useState, useEffect, useRef } from "react";
import { CodepenOutlined, InfoCircleOutlined, EyeOutlined, FileTextOutlined, DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { Card, Tag, Typography, Empty, Table, Select, Spin, Modal, Tooltip, Button, message, Form, Input } from "antd";
import ModelViewer3D from "./ModelViewer3D";
import axios from "axios";
import { API_BASE_URL } from "../../Config/auth";
import { getLatestRevision } from "./operationUtils";

const { Text } = Typography;

const ProductDetails = ({ selectedItem, partDocuments, children }) => {
  const [rawMaterials, setRawMaterials] = useState([]);
  const [extractedMaterials, setExtractedMaterials] = useState([]);
  const [threeDDocuments, setThreeDDocuments] = useState([]);
  const [selectedThreeDDocumentId, setSelectedThreeDDocumentId] = useState(null);
  const [loadingThreeD, setLoadingThreeD] = useState(false);
  const [viewerModalOpen, setViewerModalOpen] = useState(false);
  const [selectedView, setSelectedView] = useState('default');
  const extractedDocsSigRef = useRef("");
  const extractedPartIdRef = useRef(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedExtractedMaterial, setSelectedExtractedMaterial] = useState(null);
  const [editedMaterial, setEditedMaterial] = useState({});

  const handleExtractedMaterialClick = (record) => {
    setSelectedExtractedMaterial(record);
    setEditedMaterial({
      document_name: record.document_name || '',
      document_version: record.document_version || '',
      material: record.material || '',
      stock_size: record.stock_size || '',
      stocksize_kg: record.stocksize_kg || '',
      net_wt_kg: record.net_wt_kg || '',
      note: record.note || '',
      title: record.title || ''
    });
    setEditModalVisible(true);
  };

  const handleSaveExtractedMaterial = async () => {
    if (!selectedExtractedMaterial) return;
    try {
      const response = await axios.put(
        `${API_BASE_URL}/documents/extracted-data/${selectedExtractedMaterial.id}`,
        editedMaterial,
        { headers: { 'Content-Type': 'application/json' } }
      );
      if (response.status >= 200 && response.status < 300) {
        setExtractedMaterials(prev =>
          prev.map(item =>
            item.id === selectedExtractedMaterial.id
              ? { ...item, ...editedMaterial, ...response.data }
              : item
          )
        );
        message.success('Material data updated successfully!');
        setEditModalVisible(false);
        setSelectedExtractedMaterial(null);
        setEditedMaterial({});
      } else {
        throw new Error('Failed to update material data');
      }
    } catch (error) {
      console.error('Error updating extracted material:', error);
      setExtractedMaterials(prev =>
        prev.map(item =>
          item.id === selectedExtractedMaterial.id
            ? { ...item, ...editedMaterial }
            : item
        )
      );
      message.warning('Material data updated locally. Changes may not persist after refresh.');
      setEditModalVisible(false);
      setSelectedExtractedMaterial(null);
      setEditedMaterial({});
    }
  };

  const handleCancelEdit = () => {
    setEditModalVisible(false);
    setSelectedExtractedMaterial(null);
    setEditedMaterial({});
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

  useEffect(() => {
    if (selectedItem) {
      let materials = [];
      if (selectedItem.raw_materials && Array.isArray(selectedItem.raw_materials) && selectedItem.raw_materials.length > 0) {
        materials = [...selectedItem.raw_materials];
      } else if (selectedItem.raw_material_name) {
        materials = [{ id: selectedItem.raw_material_id || 'N/A', material_name: selectedItem.raw_material_name, stock_dimensions: selectedItem.stock_dimensions || null }];
      }
      setRawMaterials(materials);

      if (selectedItem.itemType !== "part") {
        setExtractedMaterials([]);
      } else {
        const parseV = (v) => parseFloat(String(v || "").replace(/^v/i, "")) || 0;
        const docsSource = (Array.isArray(partDocuments) && partDocuments.length > 0)
          ? partDocuments
          : (selectedItem.documents || []);
        const docById = new Map(docsSource.map((d) => [d.id, d]));
        const docsSig = (docsSource || [])
          .map((d) => `${d?.id ?? ""}:${d?.document_version ?? ""}`)
          .join("|");

        const buildRows = (extractedList) => {
          const grouped = new Map();
          (extractedList || []).forEach((ex) => {
            const doc = docById.get(ex.document_id);
            if (!doc) return;
            const rootId = doc.parent_id || doc.id || ex.document_id;
            const versionNum = parseV(doc.document_version);
            const entry = grouped.get(rootId) || { rootId, variants: [] };
            entry.variants.push({ ex, doc, versionNum });
            grouped.set(rootId, entry);
          });
          return Array.from(grouped.values()).map(({ rootId, variants }) => {
            const sorted = [...variants].sort((a, b) => (a.doc?.id || 0) - (b.doc?.id || 0));
            const chosen = sorted[0];
            return {
              ...chosen.ex,
              _rootId: rootId,
              _variants: sorted.map((v) => ({
                document_id: v.ex.document_id,
                document_name: v.doc?.document_name || "N/A",
                document_version: v.doc?.document_version || "1.0",
                ex: v.ex,
              })),
              document_name: chosen.doc?.document_name || "N/A",
              document_version: chosen.doc?.document_version || "1.0",
            };
          });
        };

        const partId = selectedItem.id;
        const isNewPart = extractedPartIdRef.current !== partId;
        if (isNewPart) {
          extractedPartIdRef.current = partId;
          extractedDocsSigRef.current = docsSig;
          setExtractedMaterials(buildRows(selectedItem.extracted_data || []));
          return;
        }

        if (docsSig === extractedDocsSigRef.current) {
          setExtractedMaterials(buildRows(selectedItem.extracted_data || []));
          return;
        }
        extractedDocsSigRef.current = docsSig;

        const controller = new AbortController();
        (async () => {
          try {
            const res = await axios.get(`${API_BASE_URL}/documents/part/${partId}/extracted-data`, { signal: controller.signal });
            setExtractedMaterials(buildRows(res.data || []));
          } catch {
            setExtractedMaterials(buildRows(selectedItem.extracted_data || []));
          }
        })();
        return () => controller.abort();
      }
    }
  }, [selectedItem, partDocuments]);

  useEffect(() => {
    if (!selectedItem || selectedItem.itemType !== "part") {
      setThreeDDocuments([]);
      setSelectedThreeDDocumentId(null);
      return;
    }
    setLoadingThreeD(true);
    const source = Array.isArray(partDocuments) ? partDocuments : [];
    const filtered = source.filter(doc => {
      const url = (doc.document_url || "").toLowerCase();
      const name = (doc.document_name || "").toLowerCase();
      const target = url || name;
      return [".stl", ".step", ".stp"].some(ext => target.endsWith(ext));
    });
    const sorted = [...filtered].sort((a, b) => (a.id || 0) - (b.id || 0));
    setThreeDDocuments(sorted);
    setSelectedThreeDDocumentId(sorted[0]?.id || null);
    setLoadingThreeD(false);
  }, [selectedItem, partDocuments]);

  if (!selectedItem) {
    return (
      <div className="flex-1 flex flex-col bg-gray-50 h-full">
        <Card
          variant="borderless"
          className="h-full flex items-center justify-center shadow-none rounded-none bg-transparent"
          styles={{ body: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' } }}
        >
          <Empty description="Select an item to view details" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </Card>
      </div>
    );
  }

  const { itemType } = selectedItem;
  const item = selectedItem;
  const typeNameRaw = (item?.type_name || "").toString();
  const typeNameKey = typeNameRaw.toLowerCase();
  const inHouseTypes = ["make", "in-house", "in house", "inhouse"];
  const outSourceTypes = ["buy", "out-source", "out source", "outsourced", "outsourcing"];
  const isInHouse = inHouseTypes.includes(typeNameKey);
  const isOutSource = outSourceTypes.includes(typeNameKey);

  const getItemNumber = () => {
    switch (itemType) {
      case 'product': return item?.id;
      case 'assembly': {
        const num = item?.assembly_number || item?.id;
        const rev = getLatestRevision(item?.documents);
        return rev ? `${num} (${rev})` : num;
      }
      case 'part': {
        const num = item?.part_number || item?.id;
        const rev = getLatestRevision(partDocuments?.length > 0 ? partDocuments : item?.documents);
        return rev ? `${num} (${rev})` : num;
      }
      default: return item?.id;
    }
  };

  const getItemName = () => {
    switch (itemType) {
      case 'product': return item?.product_name || item?.name;
      case 'assembly': return item?.assembly_name || item?.name;
      case 'part': return item?.part_name || item?.name;
      default: return item?.name;
    }
  };

  const itemNumber = getItemNumber();
  const itemName = getItemName();
  const partDetailLabel = itemType === 'part' && item?.part_detail
    ? (item.part_detail === 'WITH_RAW_MATERIAL' ? 'With raw material' : item.part_detail === 'WITHOUT_RAW_MATERIAL' ? 'Without raw material' : null)
    : null;

  const handleClearRawMaterial = (material) => {
    if (itemType !== "part" || !item?.id || !material) return;
    Modal.confirm({
      title: "Remove Raw Material",
      content: `Are you sure you want to remove raw material "${material.material_name}" from this part?`,
      okText: "Remove",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        try {
          const uid = getCurrentUserId();
          await axios.put(
            `${API_BASE_URL}/parts/${item.id}`,
            { raw_material_id: null, user_id: uid },
            { headers: { "Content-Type": "application/json" } }
          );
          message.success("Raw material removed from part");
          setRawMaterials([]);
        } catch (error) {
          console.error("Error removing raw material from part:", error);
          const detail =
            error?.response?.data?.detail ||
            error?.response?.data?.message ||
            error?.message ||
            "Error removing raw material from part";
          message.error(detail);
        }
      },
    });
  };

  const headerNoWrap = () => ({ style: { whiteSpace: 'nowrap' } });

  const cellWithTooltip = (text, fallback = 'N/A') => {
    const val = text ?? fallback;
    const str = String(val);
    if (!str || str === 'N/A') return <Text type="secondary" italic>N/A</Text>;
    return (
      <Tooltip title={str}>
        <span className="text-xs block truncate">{str}</span>
      </Tooltip>
    );
  };

  const openViewModal = (viewType) => {
    setViewerModalOpen(true);
    if (viewType === selectedView) {
      setSelectedView('reset');
      setTimeout(() => setSelectedView(viewType), 0);
    } else {
      setSelectedView(viewType || 'default');
    }
  };

  const extractedMaterialColumns = [
    {
      title: 'Document',
      dataIndex: 'document_name',
      key: 'document_name',
      width: 120,
      ellipsis: { showTitle: false },
      onHeaderCell: headerNoWrap,
      render: (text) => cellWithTooltip(text, 'N/A')
    },
    {
      title: 'Revision',
      dataIndex: 'document_version',
      key: 'document_version',
      width: 90,
      align: 'center',
      onHeaderCell: headerNoWrap,
      render: (text, row) => {
        const variants = Array.isArray(row?._variants) ? row._variants : [];
        const v = text || '1.0';
        if (variants.length <= 1) {
          return (
            <Select
              size="small"
              value={row.document_id}
              disabled
              suffixIcon={null}
              style={{ width: 82 }}
              options={[{ value: row.document_id, label: String(v) }]}
            />
          );
        }
        return (
          <Select
            size="small"
            value={row.document_id}
            style={{ width: 82 }}
            onChange={(nextDocId) => {
              setExtractedMaterials((prev) =>
                prev.map((r) => {
                  if (r._rootId !== row._rootId) return r;
                  const next = (r._variants || []).find((vv) => vv.document_id === nextDocId);
                  if (!next) return r;
                  return {
                    ...r,
                    ...next.ex,
                    document_id: next.document_id,
                    document_name: next.document_name,
                    document_version: next.document_version,
                  };
                })
              );
            }}
            options={variants.map((vv) => ({
              value: vv.document_id,
              label: String(vv.document_version || '1.0'),
            }))}
          />
        );
      }
    },
    {
      title: 'Material',
      dataIndex: 'material',
      key: 'material',
      width: 95,
      ellipsis: { showTitle: false },
      onHeaderCell: headerNoWrap,
      render: (text) => cellWithTooltip(text, 'N/A')
    },
    {
      title: 'Stock Size',
      dataIndex: 'stock_size',
      key: 'stock_size',
      width: 95,
      ellipsis: { showTitle: false },
      onHeaderCell: headerNoWrap,
      render: (text) => cellWithTooltip(text, 'N/A')
    },
    {
      title: 'Stock Size KG',
      dataIndex: 'stocksize_kg',
      key: 'stocksize_kg',
      width: 100,
      onHeaderCell: headerNoWrap,
      render: (text) => cellWithTooltip(text, 'N/A')
    },
    {
      title: 'Net WT KG',
      dataIndex: 'net_wt_kg',
      key: 'net_wt_kg',
      width: 92,
      onHeaderCell: headerNoWrap,
      render: (text) => cellWithTooltip(text, 'N/A')
    },
    {
      title: 'Note',
      dataIndex: 'note',
      key: 'note',
      width: 130,
      ellipsis: { showTitle: false },
      onHeaderCell: headerNoWrap,
      render: (text) =>
        text
          ? <Tooltip title={text}><span className="text-xs block truncate">{text}</span></Tooltip>
          : <Text type="secondary" italic>N/A</Text>
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      width: 90,
      ellipsis: { showTitle: false },
      onHeaderCell: headerNoWrap,
      render: (text) => cellWithTooltip(text, 'N/A')
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 70,
      align: 'center',
      fixed: 'right',
      onHeaderCell: headerNoWrap,
      render: (_, record) => (
      <Tooltip title="Edit extracted data">
        <Button
          type="text"
          size="small"
          icon={<EditOutlined style={{ fontSize: 14, color: '#2563eb' }} />}
          onClick={(e) => { e.stopPropagation(); handleExtractedMaterialClick(record); }}/>
      </Tooltip>
      ),
    },
  ];

  return (
    <div className="flex flex-col bg-white border-b border-slate-200 overflow-hidden" style={{ height: '100%' }}>
      {/* ── Header bar ── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 shrink-0 flex-wrap bg-white">
        <span className="font-semibold text-slate-800 truncate" style={{ fontSize: 'clamp(12px, 2.5vw, 14px)' }}>
          {itemName || 'Unknown Item'}
        </span>
        <span className="font-mono text-xs text-slate-500 truncate">({itemNumber || 'N/A'})</span>
        {itemType === 'part' && item?.size && (
          <Tag color="cyan" className="text-xs m-0">{item.size}</Tag>
        )}
        {itemType === 'part' && item?.qty != null && (
          <Tag color="blue" className="text-xs m-0">Qty: {item.qty}</Tag>
        )}
        {partDetailLabel != null && <Tag color="blue" className="text-xs m-0">{partDetailLabel}</Tag>}

        {/* 3D Viewer button — top-right, matches admin style */}
        {itemType === 'part' && (
          <div className="ml-auto flex items-center gap-2">
            <Tooltip title="Open 3D Viewer">
              <Button
                size="small"
                type="primary"
                icon={<EyeOutlined />}
                onClick={() => openViewModal('default')}
                disabled={threeDDocuments.length === 0}
                style={{ 
                  background: '#2563eb', 
                  border: 'none',
                  color: 'white',
                  opacity: threeDDocuments.length === 0 ? 0.6 : 1
                }}
              >
                <span className="hidden sm:inline ml-1">3D Viewer</span>
              </Button>
            </Tooltip>
          </div>
        )}
      </div>

      {children && (
        <div style={{ flex: '1', minHeight: 0, overflow: 'hidden' }} className="bg-white">
          {children}
        </div>
      )}

      {/* ── Raw Materials + Extracted from 2D Files (bottom panel) ── */}
      {itemType === 'part' && (
        <div 
          className="p-3 border-t border-slate-200 bg-slate-50 overflow-y-auto" 
          style={{ height: '32%', minHeight: '180px', shrink: 0 }}
        >
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] xl:grid-cols-[300px_1fr] gap-4">
            {/* Assigned Raw Materials */}
            <Card
              size="small"
              className="shadow-sm border-slate-200 rounded-lg overflow-hidden"
              title={
                <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <FileTextOutlined className="text-slate-400" />
                  Assigned Raw Material ({rawMaterials.length})
                </span>
              }
              styles={{ body: { padding: '8px' } }}
            >
              {rawMaterials.length > 0 ? (
                <div className="flex flex-col gap-2 max-h-40 overflow-y-auto">
                  {rawMaterials.map((material) => (
                    <div key={material.id} className="bg-white border border-slate-200 rounded p-2">
                      <div className="flex flex-col gap-2">
                        <div className="border-b border-slate-200 pb-2">
                          <div className="flex items-center gap-2">
                            <Text className="text-xs font-medium text-slate-600">Material:</Text>
                            <Tooltip title={material.material_name}>
                              <Tag color="blue" style={{ margin: 0, fontSize: '11px', fontWeight: 500 }}>
                                {material.material_name}
                              </Tag>
                            </Tooltip>
                          </div>
                        </div>
                        {material.stock_dimensions && (
                          <div className="pt-1">
                            <div className="flex items-center gap-2">
                              <Text className="text-xs font-medium text-slate-600">Stock Dimensions:</Text>
                              <Tooltip title={material.stock_dimensions}>
                                <Tag color="cyan" style={{ margin: 0, fontSize: '11px', fontWeight: 500 }}>
                                  {material.stock_dimensions}
                                </Tag>
                              </Tooltip>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center">
                  <Text className="text-xs text-gray-400">No raw materials assigned</Text>
                </div>
              )}
            </Card>

            {/* Extracted from 2D Files */}
            <Card
              size="small"
              className="shadow-sm border-slate-200 rounded-lg overflow-hidden"
              title={
                <div className="flex items-center gap-1.5 flex-wrap">
                  <FileTextOutlined className="text-blue-500" />
                  <span className="text-xs font-semibold text-slate-700">
                    Extracted from 2D Files ({extractedMaterials.length})
                  </span>
                </div>
              }
              styles={{ body: { padding: 0 } }}
            >
              {extractedMaterials.length > 0 ? (
                <div className="w-full overflow-x-auto">
                  <Table
                    dataSource={extractedMaterials}
                    columns={extractedMaterialColumns}
                    rowKey="_rootId"
                    size="small"
                    pagination={false}
                    scroll={{ x: 'max-content', y: 150 }}
                    className="border-none extracted-materials-table"
                  />
                </div>
              ) : (
                <div className="py-6 text-center">
                  <Text className="text-xs text-gray-400">No material data extracted from 2D files</Text>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* ── 3D Viewer Modal ── */}
      <Modal
        title={`3D Model Viewer${selectedView && selectedView !== 'default' ? ` — ${selectedView.charAt(0).toUpperCase() + selectedView.slice(1)} View` : ''}`}
        open={viewerModalOpen}
        onCancel={() => setViewerModalOpen(false)}
        footer={null}
        width="95%"
        style={{ maxWidth: 900 }}
        destroyOnHidden
        styles={{ body: { padding: 8 } }}
      >
        {threeDDocuments.length === 0 || !selectedThreeDDocumentId ? (
          <div className="w-full flex flex-col items-center justify-center text-slate-400 text-xs" style={{ height: 'clamp(280px, 50vh, 420px)' }}>
            <span>No 3D models</span>
            <span className="font-mono mt-0.5">{itemNumber || "N/A"}</span>
          </div>
        ) : (
          <div>
            <div className="flex justify-between items-center mb-2 px-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-700">Select 3D Model:</span>
                <Select
                  value={selectedThreeDDocumentId}
                  onChange={setSelectedThreeDDocumentId}
                  style={{ minWidth: '200px' }}
                  options={threeDDocuments.map(doc => {
                    const v = doc.document_version;
                    const vStr = v ? String(v) : "";
                    return {
                      value: doc.id,
                      label: `${doc.document_name || "3D Model"}${vStr ? ` - v${vStr}` : ""}`,
                    };
                  })}
                />
              </div>
            </div>
            <div style={{ height: 'clamp(280px, 50vh, 420px)' }}>
              <ModelViewer3D
                documentId={selectedThreeDDocumentId}
                height={400}
                showControls
                initialView={selectedView}
                showEdgeButton={true}
                restrictZoom={false}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* ── Edit Extracted Material Modal ── */}
      <Modal
        title="Edit Extracted Material"
        open={editModalVisible}
        onCancel={handleCancelEdit}
        footer={[
          <Button key="cancel" onClick={handleCancelEdit}>Cancel</Button>,
          <Button key="save" type="primary" onClick={handleSaveExtractedMaterial}>Save</Button>
        ]}
        width={600}
      >
        <Form layout="vertical">
          <div className="grid grid-cols-2 gap-4">
            <Form.Item label="Document Name">
              <Input value={editedMaterial.document_name} disabled className="bg-gray-50" placeholder="Document name" />
            </Form.Item>
            <Form.Item label="Revision">
              <Input value={editedMaterial.document_version} disabled className="bg-gray-50" placeholder="Revision" />
            </Form.Item>
            <Form.Item label="Material">
              <Input value={editedMaterial.material} onChange={(e) => setEditedMaterial(prev => ({ ...prev, material: e.target.value }))} placeholder="Enter material" />
            </Form.Item>
            <Form.Item label="Stock Size">
              <Input value={editedMaterial.stock_size} onChange={(e) => setEditedMaterial(prev => ({ ...prev, stock_size: e.target.value }))} placeholder="Enter stock size" />
            </Form.Item>
            <Form.Item label="Stock Size KG">
              <Input value={editedMaterial.stocksize_kg} onChange={(e) => setEditedMaterial(prev => ({ ...prev, stocksize_kg: e.target.value }))} placeholder="Enter stock size kg" />
            </Form.Item>
            <Form.Item label="Net WT KG">
              <Input value={editedMaterial.net_wt_kg} onChange={(e) => setEditedMaterial(prev => ({ ...prev, net_wt_kg: e.target.value }))} placeholder="Enter net weight kg" />
            </Form.Item>
            <Form.Item label="Title" className="col-span-2">
              <Input value={editedMaterial.title} onChange={(e) => setEditedMaterial(prev => ({ ...prev, title: e.target.value }))} placeholder="Enter title" />
            </Form.Item>
            <Form.Item label="Note" className="col-span-2">
              <Input.TextArea value={editedMaterial.note} onChange={(e) => setEditedMaterial(prev => ({ ...prev, note: e.target.value }))} placeholder="Enter note" rows={3} />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default ProductDetails;