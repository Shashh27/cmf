import React, { useState, useEffect, useRef } from "react";
import { CodepenOutlined, InfoCircleOutlined, EyeOutlined, FileTextOutlined, DeleteOutlined, UpOutlined, DownOutlined, LeftOutlined, RightOutlined, ExpandOutlined } from "@ant-design/icons";
import { Card, Tag, Typography, Empty, Tabs, Table, Select, Spin, Modal, Tooltip, Button, message, Space } from "antd";
import ModelViewer3D from "./ModelViewer3D";
import axios from "axios";
import { API_BASE_URL } from "../../Config/auth";

const { Text } = Typography;

const ProductDetails = ({ selectedItem, partDocuments }) => {
  const [rawMaterials, setRawMaterials] = useState([]);
  const [extractedMaterials, setExtractedMaterials] = useState([]);
  const [threeDDocuments, setThreeDDocuments] = useState([]);
  const [selectedThreeDDocumentId, setSelectedThreeDDocumentId] = useState(null);
  const [loadingThreeD, setLoadingThreeD] = useState(false);
  const [viewerModalOpen, setViewerModalOpen] = useState(false);
  const [selectedView, setSelectedView] = useState('default');
  const extractedDocsSigRef = useRef("");
  const extractedPartIdRef = useRef(null);

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
    const sorted = [...filtered].sort((a, b) => {
      // Sort by ID in FIFO order (ascending)
      return (a.id || 0) - (b.id || 0);
    });
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

  const baseMaterialColumns = [
    { title: 'Material', dataIndex: 'material_name', key: 'name', ellipsis: true },
  ];

  const materialColumns =
    itemType === "part"
      ? [
          ...baseMaterialColumns,
          {
            title: 'Actions',
            key: 'actions',
            width: 80,
            render: (_, record) => (
              <Tooltip title="Remove from part">
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleClearRawMaterial(record)}
                />
              </Tooltip>
            ),
          },
        ]
      : baseMaterialColumns;

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
    
    return (
      <Space size={spacing} className="bg-white/90 backdrop-blur-sm rounded-lg p-2 shadow-md">
        <Button 
          size={buttonSize}
          onClick={() => onOpenModal('front')}
          title="Front View"
        >
          Front
        </Button>
        <Button 
          size={buttonSize}
          onClick={() => onOpenModal('isometric')}
          title="Isometric View"
        >
          Isometric
        </Button>
        <Button 
          size={buttonSize}
          onClick={() => onOpenModal('top')}
          title="Top View"
        >
          Top
        </Button>
        <Button 
          size={buttonSize}
          onClick={() => onOpenModal('bottom')}
          title="Bottom View"
        >
          Bottom
        </Button>
      </Space>
    );
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
      title: 'Version',
      dataIndex: 'document_version',
      key: 'document_version',
      width: 70,
      align: 'center',
      onHeaderCell: headerNoWrap,
      render: (text, row) => {
        const variants = Array.isArray(row?._variants) ? row._variants : [];
        const v = text || '1.0';
        if (variants.length <= 1) {
          const label = String(v).startsWith('v') ? v : `v${v}`;
          return (
            <Select
              size="small"
              value={row.document_id}
              disabled
              suffixIcon={null}
              style={{ width: 74 }}
              options={[{ value: row.document_id, label }]}
            />
          );
        }
        return (
          <Select
            size="small"
            value={row.document_id}
            style={{ width: 74 }}
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
            options={variants.map((vv) => {
              const raw = vv.document_version || '1.0';
              const label = String(raw).startsWith('v') ? raw : `v${raw}`;
              return { value: vv.document_id, label };
            })}
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
      title: 'Stocksize KG',
      dataIndex: 'stocksize_kg',
      key: 'stocksize_kg',
      width: 95,
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
      render: (text) => text ? <Tooltip title={text}><span className="text-xs block truncate">{text}</span></Tooltip> : <Text type="secondary" italic>N/A</Text>
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
  ];

  const items = [
    {
      key: 'materials',
      label: <span className="text-sm">Raw Materials ({rawMaterials.length})</span>,
      children: (
        <div className="space-y-3">
          {rawMaterials.length > 0 ? (
            <div>
              <Text type="secondary" className="text-xs mb-1 block">Assigned Materials</Text>
              <Table 
                dataSource={rawMaterials} 
                columns={materialColumns} 
                rowKey="id" 
                size="small" 
                pagination={false} 
                scroll={{ y: 120 }} 
                bordered 
              />
            </div>
          ) : (
            <div className="py-6 text-center border border-dashed border-gray-300 rounded-md bg-gray-50">
              <Text className="text-sm font-medium text-gray-500">No raw materials assigned to this part</Text>
            </div>
          )}
          
          {itemType === 'part' && (
            <div>
              <div className="flex items-center gap-1 mb-1 flex-wrap">
                <FileTextOutlined className="text-blue-500 text-xs shrink-0" />
                <Text type="secondary" className="text-xs">Extracted from 2D Files</Text>
                <span className="text-[10px] text-slate-400 ml-1 sm:hidden">— scroll →</span>
              </div>
              {extractedMaterials.length > 0 ? (
                <div className="w-full overflow-x-auto overflow-y-hidden -mx-px">
                  <Table 
                    dataSource={extractedMaterials} 
                    columns={extractedMaterialColumns} 
                    rowKey="_rootId" 
                    size="small" 
                    pagination={false} 
                    scroll={{ x: 'max-content', y: 120 }} 
                    bordered 
                    className="extracted-materials-table"
                  />
                </div>
              ) : (
                <div className="py-6 text-center border border-dashed border-gray-300 rounded-md bg-gray-50">
                  <Text className="text-sm font-medium text-gray-500">No material data extracted from 2D files</Text>
                </div>
              )}
            </div>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="flex flex-col bg-white border-b border-slate-200 h-full overflow-hidden">
      <Card variant="borderless" className="shadow-none rounded-none flex flex-col" styles={{ body: { padding: 'clamp(6px, 1.5vw, 12px)', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } }}>
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
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 min-h-0">
            <div className="overflow-auto pr-1 min-h-0">
              <Tabs defaultActiveKey="info" items={items} size="small" className="product-details-tabs" />
            </div>
            <div className="bg-slate-50/80 rounded-lg p-1.5 flex flex-col border border-slate-200 min-h-[100px] sm:min-h-[120px]">
              <div className="flex items-center justify-between shrink-0 mb-1 flex-wrap gap-1">
                <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                  <CodepenOutlined className="text-slate-500" />
                  <span className="hidden sm:inline">3D Model Viewer</span>
                  <span className="sm:hidden">3D</span>
                </span>
                {threeDDocuments.length > 0 && (
                  <div className="flex items-center gap-1 sm:gap-2">
                    <Tooltip title="Open 3D viewer">
                      <Button
                        type="text"
                        size="small"
                        icon={<EyeOutlined />}
                        onClick={() => openViewModal()}
                      />
                    </Tooltip>
                    <Select
                      size="small"
                      value={selectedThreeDDocumentId}
                      onChange={setSelectedThreeDDocumentId}
                      style={{ minWidth: 'clamp(100px, 20vw, 140px)', fontSize: '11px' }}
                      options={threeDDocuments.map(doc => {
                        const v = doc.document_version;
                        const vStr = v ? (v.startsWith('v') ? v : `v${v}`) : "";
                        return {
                          value: doc.id,
                          label: `${doc.document_name || "3D Model"}${vStr ? ` (${vStr})` : ""}`,
                        };
                      })}
                    />
                  </div>
                )}
              </div>
              <div className="flex-1 min-h-0">
                {loadingThreeD ? (
                  <Spin size="small" tip="Loading...">
                    <div className="w-full min-h-[100px]" />
                  </Spin>
                ) : threeDDocuments.length === 0 || !selectedThreeDDocumentId ? (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 text-[10px]">
                    <span>No 3D models</span>
                    <span className="font-mono mt-0.5">{itemNumber || "N/A"}</span>
                  </div>
                ) : (
                  <ModelViewer3D documentId={selectedThreeDDocumentId} showEdgeButton={false} />
                )}
              </div>
            </div>
          </div>
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
            <div className="flex justify-end mb-2">
              <ViewControls onOpenModal={openViewModal} size="middle" />
            </div>
            <div style={{ height: 'clamp(280px, 50vh, 420px)' }}>
              <ModelViewer3D documentId={selectedThreeDDocumentId} height={400} showControls initialView={selectedView} showEdgeButton={true} restrictZoom={false} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ProductDetails;
