import React, { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, Typography, App as AntApp } from "antd";
import { 
  ExperimentOutlined, 
  LinkOutlined, 
  SafetyCertificateOutlined
} from "@ant-design/icons";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth";

// Import split components
import RawMaterialsTab from "./RawMaterialComponents/RawMaterialsTab";
import LinkMaterialsTab from "./RawMaterialComponents/LinkMaterialsTab";
import PartsWithRawMaterialStatusTab from "./RawMaterialComponents/PartsWithRawMaterialStatusTab";

const { Title, Text } = Typography;

const RawMaterialsContent = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "raw-materials";
  const [sharedRawMaterials, setSharedRawMaterials] = useState([]);
  const [rawMaterialsLoading, setRawMaterialsLoading] = useState(true);
  const initializedRef = useRef(false);

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

  const tabItems = [
    {
      key: 'raw-materials',
      label: <span className="flex items-center gap-2 px-2"><ExperimentOutlined /> Raw Materials</span>,
      children: <RawMaterialsTab rawMaterials={sharedRawMaterials} onRawMaterialsChange={setSharedRawMaterials} onRefresh={refreshRawMaterials} />
    },
    {
      key: 'linking',
      label: <span className="flex items-center gap-2 px-2"><LinkOutlined /> Link Materials</span>,
      children: <LinkMaterialsTab rawMaterials={sharedRawMaterials} onDataChanged={refreshRawMaterials} />
    },
    {
      key: 'order-status',
      label: <span className="flex items-center gap-2 px-2"><SafetyCertificateOutlined /> Parts with Raw Materials Status</span>,
      children: <PartsWithRawMaterialStatusTab onDataChanged={refreshRawMaterials} />
    }
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

      {/* Header */}
      <div className="bg-white rounded-lg lg:rounded-xl shadow-sm border border-gray-100 p-3 sm:p-4 mb-4 lg:mb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="w-full sm:w-auto">
                <Title level={2} style={{ margin: 0, fontSize: 'clamp(18px, 4vw, 24px)' }} className="flex items-center gap-2 sm:gap-3 text-gray-800">
                    <ExperimentOutlined className="text-blue-600" />
                    <span>Raw Materials Management</span>
                </Title>
                <Text className="text-gray-500 mt-1 block text-xs sm:text-sm">Manage raw materials, inventory, and order linking</Text>
            </div>
        </div>
      </div>

      <div className="bg-white rounded-lg lg:rounded-xl shadow-lg border border-gray-100 p-1 sm:p-2">
        <Tabs 
            activeKey={activeTab} 
            onChange={(key) => setSearchParams({ tab: key })} 
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
