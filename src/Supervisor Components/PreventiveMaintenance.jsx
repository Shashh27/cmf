import React, { useState } from 'react';
import { Tabs, Card } from 'antd';
import { SafetyCertificateOutlined, CheckCircleOutlined, ScheduleOutlined } from '@ant-design/icons';
import PokaYokeChecklists from './PokaYokeChecklists';
import PokaYokeMachineAssignments from './PokaYokeMachineAssignments';
import PokaYokeCompletedLogs from './PokaYokeCompletedLogs';

const { TabPane } = Tabs;

const PreventiveMaintenance = () => {
  const [activeTab, setActiveTab] = useState('checklists');

  return (
    <div style={{ padding: '24px', background: '#f5f5f5', minHeight: '100vh' }}>
      <Card
        bordered={false}
        style={{
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
        }}
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          type="card"
          size="large"
        >
          <TabPane
            tab={
              <span>
                <SafetyCertificateOutlined />
                Checklists
              </span>
            }
            key="checklists"
          >
            <PokaYokeChecklists />
          </TabPane>
          <TabPane
            tab={
              <span>
                <ScheduleOutlined />
                Machine Assignments
              </span>
            }
            key="assignments"
          >
            <PokaYokeMachineAssignments />
          </TabPane>
          <TabPane
            tab={
              <span>
                <CheckCircleOutlined />
                Completed Logs
              </span>
            }
            key="completed"
          >
            <PokaYokeCompletedLogs />
          </TabPane>
        </Tabs>
      </Card>
    </div>
  );
};

export default PreventiveMaintenance;
