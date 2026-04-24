import React, { useState, useEffect } from 'react';
import { Tabs, Card, message } from 'antd';
import { SafetyCertificateOutlined, CheckCircleOutlined, ScheduleOutlined } from '@ant-design/icons';
import PokaYokeChecklists from './PokaYokeChecklists';
import PokaYokeMachineAssignments from './PokaYokeMachineAssignments';
import PokaYokeCompletedLogs from './PokaYokeCompletedLogs';
import { API_BASE_URL } from '../Config/auth';

const { TabPane } = Tabs;

const PreventiveMaintenance = () => {
  const [activeTab, setActiveTab] = useState('checklists');
  const [machines, setMachines] = useState([]);
  const [machinesLoading, setMachinesLoading] = useState(false);

  const fetchMachines = async () => {
    setMachinesLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/machines/`);
      if (!res.ok) throw new Error('Failed to fetch machines');
      const data = await res.json();
      setMachines(Array.isArray(data) ? data : []);
    } catch (e) {
      message.error(e.message || 'Failed to load machines');
    } finally {
      setMachinesLoading(false);
    }
  };

  useEffect(() => {
    fetchMachines();
  }, []);

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
            <PokaYokeMachineAssignments
              machines={machines}
              fetchMachines={fetchMachines}
              machinesLoading={machinesLoading}
            />
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
            <PokaYokeCompletedLogs
              machines={machines}
              fetchMachines={fetchMachines}
              machinesLoading={machinesLoading}
            />
          </TabPane>
        </Tabs>
      </Card>
    </div>
  );
};

export default PreventiveMaintenance;
