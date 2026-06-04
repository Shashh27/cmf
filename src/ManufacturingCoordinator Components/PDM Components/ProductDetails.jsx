import React, { useState, useEffect, useRef } from "react";
import { CodepenOutlined, InfoCircleOutlined, EyeOutlined, FileTextOutlined, DeleteOutlined, UpOutlined, DownOutlined, LeftOutlined, RightOutlined, ExpandOutlined, DownloadOutlined, EditOutlined } from "@ant-design/icons";
import { Card, Tag, Typography, Empty, Tabs, Table, Select, Spin, Modal, Tooltip, Button, message, Space, Form, Input } from "antd";
import ModelViewer3D from "./ModelViewer3D";
import DocumentsPanel from "./DocumentsPanel";
import axios from "axios";
import { API_BASE_URL } from "../../Config/auth";

const { Text } = Typography;

const ProductDetails = ({ selectedItem }) => {
  const [rawMaterials, setRawMaterials] = useState([]);
  const [extractedMaterials, setExtractedMaterials] = useState([]);
  const [threeDDocuments, setThreeDDocuments] = useState([]);
  const [selectedThreeDDocumentId, setSelectedThreeDDocumentId] = useState(null);
  const [loadingThreeD, setLoadingThreeD] = useState(false);
  const [viewerModalOpen, setViewerModalOpen] = useState(false);
  const [selectedView, setSelectedView] = useState('default');
  const [partDocuments, setPartDocuments] = useState([]);
  const [activeTab, setActiveTab] = useState('mbom');
  const extractedDocsSigRef = useRef("");
  const extractedPartIdRef = useRef(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);

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
      // 1. Extract Raw Materials
      let materials = [];

      // Check for array format (existing logic)
      if (selectedItem.raw_materials && Array.isArray(selectedItem.raw_materials) && selectedItem.raw_materials.length > 0) {
          materials = [...selectedItem.raw_materials];
      }
      // Check for single raw material field (from user snippet)
      else if (selectedItem.raw_material_name) {
          materials = [{
              id: selectedItem.raw_material_id || 'N/A',
              material_name: selectedItem.raw_material_name,
              stock_dimensions: selectedItem.stock_dimensions || null,
          }];
      }

      setRawMaterials(materials);

      // 2. Extracted raw materials from 2D files (refresh from backend so ADD reflects immediately)
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
            // FIFO by document id (oldest first)
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
      setPartDocuments([]);
      return;
    }
  }, [selectedItem]);

  // Update 3D documents when partDocuments are loaded from DocumentsPanel
  useEffect(() => {
    if (!partDocuments.length) {
      setThreeDDocuments([]);
      setSelectedThreeDDocumentId(null);
      return;
    }

    // Filter and sort 3D documents from the documents already fetched by DocumentsPanel
    const filtered = partDocuments.filter(doc => {
      const url = (doc.document_url || "").toLowerCase();
      const name = (doc.document_name || "").toLowerCase();
      const target = url || name;
      return [".stl", ".step", ".stp"].some(ext => target.endsWith(ext));
    });
    const sorted = [...filtered].sort((a, b) => {
      return (a.id || 0) - (b.id || 0);
    });
    setThreeDDocuments(sorted);
    setSelectedThreeDDocumentId(sorted[0]?.id || null);
  }, [partDocuments]);

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
  const typeTagColor = isInHouse ? "green" : isOutSource ? "orange" : "default";
  const typeTagLabel = typeNameRaw ? typeNameRaw.toUpperCase() : "";
  
  const getItemNumber = () => {
    switch(itemType) {
      case 'product': return item?.id;
      case 'assembly': return item?.assembly_number || item?.id;
      case 'part': return item?.part_number || item?.id;
      default: return item?.id;
    };
  };
  
  const getItemName = () => {
    switch(itemType) {
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

  const handleEditExtractedMaterial = (record) => {
    setEditingRecord({
      ...record,
      id: record.id, // Explicitly preserve the id field
    });
    setEditModalVisible(true);
  };

  const handleSaveExtractedMaterial = async () => {
    if (!editingRecord || !editingRecord.id) return;

    try {
      const payload = {
        material: editingRecord.material,
        stock_size: editingRecord.stock_size,
        stocksize_kg: editingRecord.stocksize_kg,
        net_wt_kg: editingRecord.net_wt_kg,
        title: editingRecord.title,
        note: editingRecord.note,
      };

      await axios.put(
        `${API_BASE_URL}/documents/extracted-data/${editingRecord.id}`,
        payload,
        { headers: { "Content-Type": "application/json" } }
      );

      message.success("Material data updated successfully");
      setEditModalVisible(false);
      setEditingRecord(null);

      // Update the specific row in place to preserve order
      setExtractedMaterials(prevMaterials =>
        prevMaterials.map(item =>
          item.id === editingRecord.id
            ? {
                ...item,
                ...payload,
              }
            : item
        )
      );
    } catch (error) {
      console.error("Error updating extracted material:", error);
      const detail =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        error?.message ||
        "Error updating material data";
      message.error(detail);
    }
  };

  const handleEditModalCancel = () => {
    setEditModalVisible(false);
    setEditingRecord(null);
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
      setSelectedView('reset'); // Temporarily set to a different value to force re-render
      setTimeout(() => setSelectedView(viewType), 0); // Then set back to trigger view change
    } else {
      setSelectedView(viewType);
    }
  };

  const ViewControls = ({ onOpenModal, size = 'small' }) => {
    const buttonSize = size === 'small' ? 'small' : 'middle';
    const spacing = size === 'small' ? 'compact' : 'default';
    
    const viewButtons = [
      
    ];
    
    return (
      <Space size={spacing} className="bg-white/90 backdrop-blur-sm rounded-lg p-2 shadow-md">
        {viewButtons.map(({ key, label }) => (
          <Button 
            key={key}
            size={buttonSize}
            type={selectedView === key ? 'primary' : 'default'}
            onClick={() => onOpenModal(key)}
            title={`${label} View`}
          >
            {label}
          </Button>
        ))}
      </Space>
    );
  };

  return (
    <div className="flex flex-col bg-white border-b border-slate-200 h-full overflow-hidden">
      <Card 
        variant="borderless"
        className="flex-1 shadow-none rounded-none bg-transparent"
        styles={{ body: { padding: '8px', height: '100%', display: 'flex', flexDirection: 'column' } }}
      >
        <div className="flex items-baseline gap-2 shrink-0 mb-1 flex-wrap">
          <span className="font-semibold text-slate-800 truncate" style={{ fontSize: 'clamp(12px, 2.5vw, 14px)' }}>{itemName || 'Unknown Item'}</span>
          <span className="font-mono text-xs text-slate-500 truncate">({itemNumber || 'N/A'})</span>
          {itemType === 'part' && item?.size && (
            <Tag color="cyan" className="text-xs m-0">{item.size}</Tag>
          )}
          {itemType === 'part' && item?.qty != null && (
            <Tag color="blue" className="text-xs m-0">Qty: {item.qty}</Tag>
          )}
          {partDetailLabel != null && <Tag color="blue" className="text-xs m-0">{partDetailLabel}</Tag>}
        </div>
        
        <div className="flex-1 min-h-0 flex flex-col" style={{ flex: 1, height: '100%' }}>
          {/* Top section: Process Plan and Part Documents tabs - Full height when bottom is hidden, 68% when visible */}
          <div style={{ flex: activeTab === 'mbom' ? 0.68 : 1, minHeight: 0, marginBottom: activeTab === 'mbom' ? '2px' : 0 }}>
            <DocumentsPanel 
              selectedItem={selectedItem} 
              onDocumentsLoaded={(docs) => setPartDocuments(docs)} 
              compactMode={true} 
              onTabChange={setActiveTab} 
              externalActiveTab={activeTab} 
            />
          </div>
          
          {/* Bottom section: Single container with 2 sub-sections side-by-side - Only show for Process Plan tab */}
          {activeTab === 'mbom' && (
            <div style={{ flex: 0.32, minHeight: 0, display: 'flex', gap: '8px' }}>
              {/* Sub-section 1: Raw Materials */}
            <div style={{ flex: 0.6, minWidth: 0, overflow: 'hidden' }}>
              <div className="bg-slate-50/80 rounded-lg p-2 border border-slate-200 h-full">
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-2">
                  <FileTextOutlined className="text-slate-500" />
                  <span>Assigned Raw Material ({rawMaterials.length})</span>
                </div>
                <div style={{ height: 'calc(100% - 24px)', overflow: 'auto' }}>
                  {rawMaterials.length > 0 ? (
                    <div className="flex flex-col gap-2">
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
                    <div className="py-4 text-center border border-dashed border-gray-300 rounded-md bg-gray-50 h-full flex items-center justify-center">
                      <Text className="text-sm font-medium text-gray-500">No raw materials assigned</Text>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Sub-section 2: Extracted from 2D Files - Expanded */}
            {itemType === 'part' && (
              <div style={{ flex: 2, minWidth: 0, overflow: 'hidden' }}>
                <div className="bg-slate-50/80 rounded-lg p-2 border border-slate-200 h-full">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1 flex-wrap">
                      <FileTextOutlined className="text-blue-500 text-xs shrink-0" />
                      <Text className="text-xs font-medium text-slate-600">Extracted from 2D Files ({extractedMaterials.length})</Text>
                    </div>
                    {threeDDocuments.length > 0 && (
                      <Button
                        type="primary"
                        size="small"
                        icon={<EyeOutlined />}
                        onClick={() => openViewModal()}
                      >
                        3D Viewer
                      </Button>
                    )}
                  </div>
                  <div style={{ height: 'calc(100% - 32px)', overflow: 'auto' }}>
                    {extractedMaterials.length > 0 ? (
                      <Table 
                        dataSource={extractedMaterials} 
                        columns={[
                          {
                            title: 'Document',
                            dataIndex: 'document_name',
                            key: 'document_name',
                            width: 120,
                            ellipsis: { showTitle: false },
                            render: (text) => cellWithTooltip(text, 'N/A')
                          },
                          {
                            title: 'Version',
                            dataIndex: 'document_version',
                            key: 'document_version',
                            width: 80,
                            render: (text) => cellWithTooltip(text, 'N/A')
                          },
                          {
                            title: 'Material',
                            dataIndex: 'material',
                            key: 'material',
                            width: 100,
                            render: (text) => cellWithTooltip(text, 'N/A')
                          },
                          {
                            title: 'Stock Size',
                            dataIndex: 'stock_size',
                            key: 'stock_size',
                            width: 100,
                            render: (text) => cellWithTooltip(text, 'N/A')
                          },
                          {
                            title: 'Stock Size Kg',
                            dataIndex: 'stocksize_kg',
                            key: 'stocksize_kg',
                            width: 120,
                            render: (text) => cellWithTooltip(text, 'N/A')
                          },
                          {
                            title: 'Net Wt Kg',
                            dataIndex: 'net_wt_kg',
                            key: 'net_wt_kg',
                            width: 90,
                            render: (text) => cellWithTooltip(text, 'N/A')
                          },
                          {
                            title: 'Note',
                            dataIndex: 'note',
                            key: 'note',
                            width: 120,
                            ellipsis: { showTitle: false },
                            render: (text) => cellWithTooltip(text, 'N/A')
                          },
                          {
                            title: 'Title',
                            dataIndex: 'title',
                            key: 'title',
                            width: 120,
                            ellipsis: { showTitle: false },
                            render: (text) => cellWithTooltip(text, 'N/A')
                          },
                          {
                            title: 'Actions',
                            key: 'actions',
                            width: 60,
                            fixed: 'right',
                            render: (_, record) => (
                              <Tooltip title="Edit">
                                <Button
                                  type="text"
                                  size="small"
                                  icon={<EditOutlined />}
                                  onClick={() => handleEditExtractedMaterial(record)}
                                />
                              </Tooltip>
                            ),
                          },
                        ]}
                        rowKey="_rootId" 
                        size="small" 
                        pagination={false} 
                        scroll={{ x: 'max-content', y: 'calc(100% - 20px)' }} 
                        bordered 
                      />
                    ) : (
                      <div className="py-4 text-center border border-dashed border-gray-300 rounded-md bg-gray-50 h-full flex items-center justify-center">
                        <Text className="text-sm font-medium text-gray-500">No material data extracted from 2D files</Text>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
          )}
        </div>
      </Card>
      <Modal
        title={`3D Model Viewer${selectedView && selectedView !== 'default' ? ` - ${selectedView.charAt(0).toUpperCase() + selectedView.slice(1)} View` : ''}`}
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
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2">
                <Text className="text-sm font-medium text-slate-700">Select 3D Model:</Text>
                <Select
                  size="small"
                  value={selectedThreeDDocumentId}
                  onChange={setSelectedThreeDDocumentId}
                  style={{ width: '200px' }}
                  options={threeDDocuments.map(doc => {
                    const v = doc.document_version;
                    const vStr = v ? (v.startsWith('v') ? v : `v${v}`) : "v1.0";
                    return {
                      value: doc.id,
                      label: `${doc.document_name || 'Unnamed'} - ${vStr}`,
                    };
                  })}
                />
              </div>
              <ViewControls onOpenModal={openViewModal} size="middle" />
            </div>
            <div style={{ height: 'clamp(280px, 50vh, 420px)' }}>
              <ModelViewer3D documentId={selectedThreeDDocumentId} height={400} showControls initialView={selectedView} showEdgeButton={true} restrictZoom={false} />
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Extracted Material Modal */}
      <Modal
        title="Edit Material Data"
        open={editModalVisible}
        onCancel={handleEditModalCancel}
        footer={[
          <Button key="cancel" onClick={handleEditModalCancel}>
            Cancel
          </Button>,
          <Button key="save" type="primary" onClick={handleSaveExtractedMaterial}>
            Save
          </Button>,
        ]}
        width="600px"
        destroyOnHidden
      >
        {editingRecord && (
          <Form
            layout="vertical"
            initialValues={editingRecord}
            onValuesChange={(changedValues, allValues) => {
              setEditingRecord(allValues);
            }}
          >
            {/* Hidden field to preserve the id */}
            <Form.Item name="id" style={{ display: 'none' }}>
              <Input />
            </Form.Item>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Form.Item
                label="Material"
                name="material"
              >
                <Input placeholder="Enter material" />
              </Form.Item>

              <Form.Item
                label="Stock Size"
                name="stock_size"
              >
                <Input placeholder="Enter stock size" />
              </Form.Item>

              <Form.Item
                label="Stock Size Kg"
                name="stocksize_kg"
              >
                <Input type="number" placeholder="Enter stock size in kg" />
              </Form.Item>

              <Form.Item
                label="Net Wt Kg"
                name="net_wt_kg"
              >
                <Input type="number" placeholder="Enter net weight in kg" />
              </Form.Item>

              <Form.Item
                label="Title"
                name="title"
                className="md:col-span-2"
              >
                <Input placeholder="Enter title" />
              </Form.Item>

              <Form.Item
                label="Note"
                name="note"
                className="md:col-span-2"
              >
                <Input.TextArea
                  placeholder="Enter note"
                  rows={3}
                />
              </Form.Item>
            </div>
          </Form>
        )}
      </Modal>
    </div>
  );
};

export default ProductDetails;
