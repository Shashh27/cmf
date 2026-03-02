import React, { useState, useEffect } from "react";
import { CodepenOutlined, ExperimentOutlined, InfoCircleOutlined, EyeOutlined, FileTextOutlined } from "@ant-design/icons";
import { Card, Tag, Typography, Empty, Tabs, Table, Select, Spin, Modal, Tooltip, Button } from "antd";
import ModelViewer3D from "./ModelViewer3D";
import { API_BASE_URL } from "../Config/auth";

const { Text } = Typography;

const ProductDetails = ({ selectedItem, partDocuments }) => {
  const [rawMaterials, setRawMaterials] = useState([]);
  const [extractedMaterials, setExtractedMaterials] = useState([]);
  const [loadingExtracted, setLoadingExtracted] = useState(false);
  const [threeDDocuments, setThreeDDocuments] = useState([]);
  const [selectedThreeDDocumentId, setSelectedThreeDDocumentId] = useState(null);
  const [loadingThreeD, setLoadingThreeD] = useState(false);
  const [viewerModalOpen, setViewerModalOpen] = useState(false);

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

      // 2. Fetch extracted materials from 2D files
      if (selectedItem.itemType === "part" && selectedItem.id) {
        fetchExtractedMaterials(selectedItem.id);
      } else {
        setExtractedMaterials([]);
      }
    }
  }, [selectedItem]);

  const fetchExtractedMaterials = async (partId) => {
    setLoadingExtracted(true);
    try {
      const response = await fetch(`${API_BASE_URL}/documents/part/${partId}/extracted-data`);
      if (response.ok) {
        const data = await response.json();
        setExtractedMaterials(data);
      } else {
        setExtractedMaterials([]);
      }
    } catch (error) {
      console.error("Error fetching extracted materials:", error);
      setExtractedMaterials([]);
    } finally {
      setLoadingExtracted(false);
    }
  };

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
      const type = (doc.document_type || "").toString().toUpperCase();
      const target = url || name;
      const byExt = [".stl", ".step", ".stp"].some(ext => target.endsWith(ext));
      const byType = type === "3D";
      return byExt || byType;
    });
    const sorted = [...filtered].sort((a, b) => {
      const av = parseFloat(a.document_version || "0") || 0;
      const bv = parseFloat(b.document_version || "0") || 0;
      return bv - av;
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
      case 'product': return item?.product_number || item?.id;
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

  const materialColumns = [
    { title: 'Material', dataIndex: 'material_name', key: 'name', ellipsis: true },
  ];

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
      render: (text) => <Tag className="text-[10px] m-0" color="blue">v{text || '1.0'}</Tag>
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
      title: 'Material',
      dataIndex: 'material',
      key: 'material',
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
  ];

  const items = [
    {
      key: 'info',
      label: <span className="flex items-center gap-1 text-sm"><InfoCircleOutlined /> Info</span>,
      children: (
        <div className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-1 text-xs">
          <Text type="secondary">Type</Text>
          <div className="flex items-center gap-2">
            <span className="capitalize font-medium">{itemType || 'Unknown'}</span>
            {typeTagLabel && (
              <Tag color={typeTagColor} className="text-[10px] m-0">
                {typeTagLabel}
              </Tag>
            )}
          </div>
          {item?.product_version && (
            <>
              <Text type="secondary">Version</Text>
              <Tag className="text-[10px] m-0">Rev {item.product_version}</Tag>
            </>
          )}
        </div>
      ),
    },
    {
      key: 'materials',
      label: <span className="flex items-center gap-1 text-sm"><ExperimentOutlined /> Raw Materials ({rawMaterials.length})</span>,
      children: (
        <div className="space-y-3">
          {rawMaterials.length > 0 ? (
            <>
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
            </>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No assigned materials" className="py-2" />
          )}
          
          {itemType === 'part' && (
            <div>
              <div className="flex items-center gap-1 mb-1 flex-wrap">
                <FileTextOutlined className="text-blue-500 text-xs shrink-0" />
                <Text type="secondary" className="text-xs">Extracted from 2D Files ({extractedMaterials.length})</Text>
                <span className="text-[10px] text-slate-400 ml-1 sm:hidden">— scroll →</span>
              </div>
              {loadingExtracted ? (
                <div className="py-4 text-center">
                  <Spin size="small" tip="Loading extracted data...">
                    <div className="py-4 min-h-[60px]" />
                  </Spin>
                </div>
              ) : extractedMaterials.length > 0 ? (
                <div className="w-full overflow-x-auto -mx-px">
                  <Table 
                    dataSource={extractedMaterials} 
                    columns={extractedMaterialColumns} 
                    rowKey="id" 
                    size="small" 
                    pagination={false} 
                    scroll={{ x: 777, y: 120 }} 
                    bordered 
                    className="extracted-materials-table"
                  />
                </div>
              ) : (
                <Empty 
                  image={Empty.PRESENTED_IMAGE_SIMPLE} 
                  description="No data extracted from 2D files" 
                  className="py-2" 
                />
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
        <div className="flex items-center gap-2 shrink-0 mb-1">
          <span className="font-semibold text-slate-800 truncate" style={{ fontSize: 'clamp(12px, 2.5vw, 14px)' }}>{itemName || 'Unknown Item'}</span>
        </div>
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 min-h-0">
            <div className="overflow-y-auto pr-1 min-h-0">
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
                        onClick={() => setViewerModalOpen(true)}
                      />
                    </Tooltip>
                    <Select
                      size="small"
                      value={selectedThreeDDocumentId}
                      onChange={setSelectedThreeDDocumentId}
                      style={{ minWidth: 'clamp(100px, 20vw, 140px)', fontSize: '11px' }}
                      options={threeDDocuments.map(doc => ({
                        value: doc.id,
                        label: `${doc.document_name || "3D Model"}${doc.document_version ? ` (v${doc.document_version})` : ""}`,
                      }))}
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
                  <ModelViewer3D documentId={selectedThreeDDocumentId} />
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>
      <Modal
        title="3D Model Viewer"
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
          <div style={{ height: 'clamp(280px, 50vh, 420px)' }}>
            <ModelViewer3D documentId={selectedThreeDDocumentId} height={400} showControls />
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ProductDetails;
