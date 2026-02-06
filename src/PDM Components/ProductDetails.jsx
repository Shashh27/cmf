import React from "react";
import { CodepenOutlined } from "@ant-design/icons";
import { Card, Tag, Typography, Empty } from "antd";

const { Title, Text } = Typography;

const ProductDetails = ({ selectedItem }) => {
  if (!selectedItem) {
    return (
      <div className="flex-1 flex flex-col bg-gray-50 h-full">
        <Card 
            bordered={false} 
            className="h-full flex items-center justify-center shadow-none rounded-none bg-transparent"
            bodyStyle={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}
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
    }
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

  return (
    <div className="flex-1 flex flex-col bg-gray-50 h-full">
      <Card bordered={false} className="shadow-none rounded-none h-full" bodyStyle={{ padding: '16px' }}>
          <div className="grid grid-cols-2 gap-6 h-full">
            <div className="space-y-4">
              <div>
                <Title level={4} style={{ marginBottom: 4 }}>{itemName || 'Unknown Item'}</Title>
                <div className="flex items-center gap-2 text-gray-500">
                  <Text type="secondary">{itemNumber || 'N/A'}</Text>
                  {item?.product_version && (
                      <>
                        <span className="text-gray-300">•</span>
                        <Tag>Rev {item.product_version}</Tag>
                      </>
                  )}
                </div>
              </div>
              
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
                
                <Text type="secondary">ID</Text>
                <Text code>{item?.id || 'N/A'}</Text>
              </div>
            </div>

            <div className="bg-gray-50 rounded p-6 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 h-full min-h-[150px]">
              <CodepenOutlined style={{ fontSize: '48px', color: '#ccc', marginBottom: '8px' }} />
              <Text strong className="text-gray-500 text-xs mb-1">3D Model Viewer</Text>
              <Text type="secondary" className="text-[10px] text-center">STEP file viewer will be displayed here</Text>
              <Text type="secondary" className="text-[10px] mt-2 font-mono">{itemNumber || 'N/A'}</Text>
            </div>
          </div>
      </Card>
    </div>
  );
};

export default ProductDetails;