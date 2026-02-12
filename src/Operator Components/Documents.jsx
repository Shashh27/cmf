import React from 'react';
import { Card, List, Typography, Button } from 'antd';
import { FileOutlined } from '@ant-design/icons';

const { Title } = Typography;

const Documents = () => {
  const data = [
    { title: 'Safety Manual.pdf', type: 'PDF' },
    { title: 'Machine Operation Guide.docx', type: 'DOCX' },
  ];

  return (
    <Card title={<Title level={4}>Documents</Title>}>
      <List
        itemLayout="horizontal"
        dataSource={data}
        renderItem={item => (
          <List.Item
            actions={[<Button type="link">View</Button>]}
          >
            <List.Item.Meta
              avatar={<FileOutlined style={{ fontSize: '24px' }} />}
              title={item.title}
              description={item.type}
            />
          </List.Item>
        )}
      />
    </Card>
  );
};

export default Documents;
