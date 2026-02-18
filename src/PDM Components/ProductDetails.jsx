import React, { useState, useEffect } from "react";
import { CodepenOutlined, ExperimentOutlined, InfoCircleOutlined } from "@ant-design/icons";
import { Card, Tag, Typography, Empty, Tabs, Table, Select, Spin } from "antd";
import ModelViewer3D from "./ModelViewer3D";

const { Text } = Typography;

const ProductDetails = ({ selectedItem, partDocuments }) => {
  const [rawMaterials, setRawMaterials] = useState([]);
  const [threeDDocuments, setThreeDDocuments] = useState([]);
  const [selectedThreeDDocumentId, setSelectedThreeDDocumentId] = useState(null);
  const [loadingThreeD, setLoadingThreeD] = useState(false);

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
    }
  }, [selectedItem]);

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

  const items = [
    {
      key: 'info',
      label: <span className="flex items-center gap-1 text-xs"><InfoCircleOutlined /> Info</span>,
      children: (
        <div className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-1 text-xs">
          <Text type="secondary">Type</Text>
          <div className="flex items-center gap-2">
            <span className="capitalize font-medium">{itemType || 'Unknown'}</span>
            {item?.type_name && (
              <Tag color={item.type_name.toLowerCase() === 'make' ? 'green' : 'blue'} className="text-[10px] m-0">
                {item.type_name.toUpperCase()}
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
      label: <span className="flex items-center gap-1 text-xs"><ExperimentOutlined /> Raw Materials ({rawMaterials.length})</span>,
      children: rawMaterials.length > 0 ? (
        <Table dataSource={rawMaterials} columns={materialColumns} rowKey="id" size="small" pagination={false} scroll={{ y: 120 }} bordered />
      ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No raw materials" className="py-2" />
    }
  ];

  return (
    <div className="flex flex-col bg-white border-b border-slate-200 h-full overflow-hidden">
      <Card variant="borderless" className="shadow-none rounded-none flex flex-col" styles={{ body: { padding: '8px 12px', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } }}>
        <div className="flex items-center gap-2 shrink-0 mb-1">
          <span className="text-base font-semibold text-slate-800 truncate">{itemName || 'Unknown Item'}</span>
        </div>
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 min-h-0">
            <div className="overflow-y-auto pr-1 min-h-0">
              <Tabs defaultActiveKey="info" items={items} size="small" className="product-details-tabs" />
            </div>
            <div className="bg-slate-50/80 rounded-lg p-1.5 flex flex-col border border-slate-200 min-h-[120px]">
              <div className="flex items-center justify-between shrink-0 mb-1">
                <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                  <CodepenOutlined className="text-slate-500" /> 3D Model Viewer
                </span>
                {threeDDocuments.length > 0 && (
                  <Select
                    size="small"
                    value={selectedThreeDDocumentId}
                    onChange={setSelectedThreeDDocumentId}
                    style={{ minWidth: 140, fontSize: '11px' }}
                    options={threeDDocuments.map(doc => ({
                      value: doc.id,
                      label: `${doc.document_name || "3D Model"}${doc.document_version ? ` (v${doc.document_version})` : ""}`,
                    }))}
                  />
                )}
              </div>
              <div className="flex-1 min-h-0">
                {loadingThreeD ? (
                  <div className="w-full h-full flex items-center justify-center"><Spin size="small" tip="Loading..." /></div>
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
    </div>
  );
};

export default ProductDetails;
