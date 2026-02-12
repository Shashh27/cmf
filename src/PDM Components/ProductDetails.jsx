import React, { useState, useEffect } from "react";
import { CodepenOutlined, ToolOutlined, ExperimentOutlined, InfoCircleOutlined } from "@ant-design/icons";
import { Card, Tag, Typography, Empty, Tabs, Table, List } from "antd";

const { Title, Text } = Typography;

const ProductDetails = ({ selectedItem }) => {
  const [tools, setTools] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);

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

  const toolColumns = [
    { title: 'Tool Name', dataIndex: ['tool', 'item_description'], key: 'name', ellipsis: true },
    { title: 'Operation', dataIndex: 'operation_name', key: 'operation', ellipsis: true, render: text => <span className="text-gray-500">{text || '-'}</span> },
    { title: 'Code', dataIndex: ['tool', 'identification_code'], key: 'code', width: 100, render: text => <Tag>{text}</Tag> },
    { title: 'Spec', dataIndex: ['tool', 'range'], key: 'spec', ellipsis: true },
  ];

  const materialColumns = [
    { title: 'Material', dataIndex: 'material_name', key: 'name', ellipsis: true },

  ];

  const items = [
    {
      key: 'info',
      label: <span className="flex items-center gap-1"><InfoCircleOutlined /> Info</span>,
      children: (
        <div className="space-y-4">
           <div className="grid grid-cols-[80px_1fr] gap-x-4 gap-y-2 text-sm">
            <Text type="secondary">Type</Text>
            <div className="flex items-center gap-2">
              <span className="capitalize font-medium">{itemType || 'Unknown'}</span>
              {item?.type_name && (
                <Tag color={item.type_name.toLowerCase() === 'make' ? 'green' : 'blue'}>
                  {item.type_name.toUpperCase()}
                </Tag>
              )}
            </div>
            
            {item?.product_version && (
                <>
                    <Text type="secondary">Version</Text>
                    <Tag>Rev {item.product_version}</Tag>
                </>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'materials',
      label: <span className="flex items-center gap-1"><ExperimentOutlined /> Raw Materials ({rawMaterials.length})</span>,
      children: rawMaterials.length > 0 ? (
        <Table 
            dataSource={rawMaterials} 
            columns={materialColumns} 
            rowKey="id" 
            size="small" 
            pagination={false} 
            scroll={{ y: 200 }}
            bordered
        />
      ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No raw materials assigned" />
    }
  ];

  return (
    <div className="flex-1 flex flex-col bg-gray-50 h-full overflow-hidden">
      <Card variant="borderless" className="shadow-none rounded-none h-full flex flex-col" styles={{ body: { padding: '16px', height: '100%', display: 'flex', flexDirection: 'column' } }}>
          <div className="mb-4 shrink-0">
            <Title level={4} style={{ marginBottom: 0 }}>{itemName || 'Unknown Item'}</Title>
          </div>

          <div className="flex-1 overflow-hidden flex flex-col">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
                <div className="overflow-y-auto pr-2">
                    <Tabs defaultActiveKey="info" items={items} size="small" />
                </div>

                <div className="bg-gray-50 rounded p-4 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 h-full min-h-[200px]">
                  <CodepenOutlined style={{ fontSize: '48px', color: '#ccc', marginBottom: '8px' }} />
                  <Text strong className="text-gray-500 text-xs mb-1">3D Model Viewer</Text>
                  <Text type="secondary" className="text-[10px] text-center">STEP file viewer will be displayed here</Text>
                  <Text type="secondary" className="text-[10px] mt-2 font-mono">{itemNumber || 'N/A'}</Text>
                </div>
             </div>
          </div>
      </Card>
    </div>
  );
};

export default ProductDetails;