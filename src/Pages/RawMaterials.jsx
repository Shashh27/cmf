import React, { useState, useEffect, useRef, useCallback } from "react";

import { useSearchParams } from "react-router-dom";

import { Tabs, App as AntApp } from "antd";

import { ExperimentOutlined, LinkOutlined, SafetyCertificateOutlined, HistoryOutlined } from "@ant-design/icons";

import axios from "axios";

import { API_BASE_URL } from "../Config/auth";


// Import split components

import RawMaterialsTab from "../RawMaterialComponents/RawMaterialsTab";

import PartsWithRawMaterialStatusTab from "../RawMaterialComponents/PartsWithRawMaterialStatusTab";

import RawMaterialHistoryTab from "../RawMaterialComponents/RawMaterialHistoryTab";

import OrderRMHierarchyTable from "../RawMaterialComponents/OrderRMHierarchyTable";




const RawMaterialsContent = () => {

  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = searchParams.get("tab") || "raw-materials";

  const [sharedRawMaterials, setSharedRawMaterials] = useState([]);

  const [rawMaterialsLoading, setRawMaterialsLoading] = useState(true);

  const initializedRef = useRef(false);

  // Per-tab refresh triggers — increment to tell a tab to refetch
  const [triggers, setTriggers] = useState({ 'order-rm-hierarchy': 0, 'order-status': 0 });

  // Which tabs need a refresh next time they become active
  const dirtyTabsRef = useRef(new Set());



  useEffect(() => {

    if (initializedRef.current) return;

    initializedRef.current = true;

    fetchSharedRawMaterials();

  }, []);



  const fetchSharedRawMaterials = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/rawmaterials/`);
      const data = response.data;
      setSharedRawMaterials(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching shared raw materials:", error);
    } finally {
      setRawMaterialsLoading(false);
    }
  };



  const refreshRawMaterials = () => {

    fetchSharedRawMaterials();

  };

  // When any mutation happens, mark all tabs except the currently active one as dirty
  useEffect(() => {
    const handleRMChanged = () => {
      const otherTabs = ['order-rm-hierarchy', 'order-status'].filter(t => t !== activeTab);
      otherTabs.forEach(t => dirtyTabsRef.current.add(t));
    };
    window.addEventListener('rawMaterialChanged', handleRMChanged);
    return () => window.removeEventListener('rawMaterialChanged', handleRMChanged);
  }, [activeTab]);

  // When tab changes, if that tab is dirty — increment its trigger to force a refetch
  const handleTabChange = useCallback((key) => {
    setSearchParams({ tab: key });
    if (dirtyTabsRef.current.has(key)) {
      dirtyTabsRef.current.delete(key);
      setTriggers(prev => ({ ...prev, [key]: prev[key] + 1 }));
    }
  }, [setSearchParams]);



  const tabItems = [

    {

      key: 'raw-materials',

      label: <span className="flex items-center gap-2 px-2"><ExperimentOutlined /> Raw Materials</span>,

      children: <RawMaterialsTab rawMaterials={sharedRawMaterials} onRawMaterialsChange={setSharedRawMaterials} onRefresh={refreshRawMaterials} />

    },

    {

      key: 'order-rm-hierarchy',

      label: <span className="flex items-center gap-2 px-2"><LinkOutlined /> Plan & Procure RM</span>,

      children: <OrderRMHierarchyTable rawMaterials={sharedRawMaterials} refreshTrigger={triggers['order-rm-hierarchy']} />

    },

    {

      key: 'order-status',

      label: <span className="flex items-center gap-2 px-2"><SafetyCertificateOutlined /> Procure Raw Material</span>,

      children: <PartsWithRawMaterialStatusTab onDataChanged={refreshRawMaterials} rawMaterials={sharedRawMaterials} refreshTrigger={triggers['order-status']} />

    },

    {

      key: 'history',

      label: <span className="flex items-center gap-2 px-2"><HistoryOutlined /> History</span>,

      children: <RawMaterialHistoryTab materials={sharedRawMaterials} />

    },

   
  ];



  return (

    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-2 sm:p-4 lg:p-6">

      <style>{`

        .no-hover-btn, .no-hover-btn:hover, .no-hover-btn:focus, .no-hover-btn:active {

          background-color: #2563eb !important;

          color: white !important;

          opacity: 1 !important;

          border: none !important;

          box-shadow: none !important;

        }

        .modern-table .ant-table-thead > tr > th {

          background: linear-gradient(to bottom, #f0f5ff, #e6f0ff);

          font-weight: 600;

          border-bottom: 2px solid #1890ff;

        }

        .modern-table .ant-table-tbody > tr:hover > td {

          background: #f0f8ff !important;

        }

        .modern-table .ant-table-tbody > tr > td {

          border-bottom: 1px solid #f0f0f0;

        }

        .ant-tabs-nav { margin-bottom: 0 !important; }

        .ant-card-head { border-bottom: 1px solid #f0f0f0; min-height: 56px; }

        @media (max-width: 768px) {

          .ant-table { font-size: 12px; }

          .ant-table-thead > tr > th, .ant-table-tbody > tr > td { padding: 8px 4px; }

        }

      `}</style>



      <div className="bg-white rounded-lg lg:rounded-xl shadow-lg border border-gray-100 p-1 sm:p-2">

        <Tabs 

            activeKey={activeTab} 

            onChange={handleTabChange} 

            items={tabItems}

            type="card"

            className="custom-tabs"

            tabBarStyle={{ margin: 0, padding: '4px 4px 0 4px' }}

        />

      </div>

    </div>

  );

};



const RawMaterials = () => (

  <AntApp>

    <RawMaterialsContent />

  </AntApp>

);



export default RawMaterials;





