import React, { useState } from 'react';
import { Tabs } from 'antd';
import { BarChart3, Timeline } from 'lucide-react';
import ProductionSchedule from './ProductionSchedule';
import PlannedVsActualTable from './PlannedVsActualTable';

const { TabPane } = Tabs;

const PlannedVsActual = () => {
  const [activeTab, setActiveTab] = useState('gantt');

  return (
    <div style={{ padding: '24px' }}>
      <Tabs 
        activeKey={activeTab} 
        onChange={setActiveTab}
        size="large"
        style={{ background: '#fff', padding: '16px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
      >
        <TabPane 
          tab={
            <span>
              <Timeline size={16} style={{ marginRight: '8px' }} />
              Gantt Chart View
            </span>
          } 
          key="gantt"
        >
          <ProductionSchedule />
        </TabPane>
        <TabPane 
          tab={
            <span>
              <BarChart3 size={16} style={{ marginRight: '8px' }} />
              Table View
            </span>
          } 
          key="table"
        >
          <PlannedVsActualTable />
        </TabPane>
      </Tabs>
    </div>
  );
};

export default PlannedVsActual;
