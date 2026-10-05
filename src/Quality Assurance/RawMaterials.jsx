import React, { useState, useEffect, useRef } from "react";
import { DatabaseOutlined } from "@ant-design/icons";
import { App as AntApp, Typography } from "antd";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client.js";
import RawMaterialInventoryTab from "./RawMaterialComponents/RawMaterialInventoryTab";

const { Title, Text } = Typography;

const RawMaterialsContent = () => {
  const [searchParams] = useSearchParams();
  const highlightStockId = searchParams.get("highlightStockId");
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
      const response = await api.get(`/rawmaterials/`);
      const data = response.data;
      setSharedRawMaterials(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching shared raw materials:", error);
      setSharedRawMaterials([]);
    } finally {
      setRawMaterialsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-2 sm:p-4 lg:p-6">
      <div className="mb-4 flex items-center gap-2">
        <DatabaseOutlined style={{ fontSize: 20, color: "#2563eb" }} />
        <div>
          <Title level={4} style={{ margin: 0 }}>
            Raw Material Inventory
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            View stock units, quality documents, and exhausted materials
          </Text>
        </div>
      </div>
      {!rawMaterialsLoading && (
        <RawMaterialInventoryTab
          rawMaterials={sharedRawMaterials}
          highlightStockId={highlightStockId}
        />
      )}
    </div>
  );
};

const RawMaterials = () => (
  <AntApp>
    <RawMaterialsContent />
  </AntApp>
);

export default RawMaterials;
