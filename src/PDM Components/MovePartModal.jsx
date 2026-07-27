import React, { useState } from "react";
import { Modal, Typography, App } from "antd";
import {
  ArrowDownOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import { api } from "../api/client.js";
 

const { Text } = Typography;

const LocationCard = ({ tone, title, children }) => {
  const isUpcoming = tone === "upcoming";
  return (
    <div
      style={{
        border: `1px solid ${isUpcoming ? "#1677ff" : "#d9d9d9"}`,
        background: isUpcoming ? "#ECF8F0" : "#fafafa",
        padding: "10px 12px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: isUpcoming ? "#0958d9" : "rgba(0,0,0,0.45)",
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: isUpcoming ? "#0958d9" : "#2F2F2F", lineHeight: 1.35 }}>
        {children}
      </div>
    </div>
  );
};

const MovePartModal = ({
  open,
  part,
  currentLabel: currentLabelProp = "",
  upcomingLabel: upcomingLabelProp = "",
  targetAssemblyId: targetAssemblyIdProp = null,
  onCancel,
  onMoved,
}) => {
  const { message } = App.useApp();
  const [submitting, setSubmitting] = useState(false);
  const currentLabel = currentLabelProp || "—";
  const upcomingLabel = upcomingLabelProp || "—";

  const handleOk = async () => {
    if (!part) return;

    setSubmitting(true);
    try {
      const response = await api.put(`/parts/${part.id}/move`, {
        assembly_id: targetAssemblyIdProp,
      });
      message.success(
        `Part "${part.part_name}" moved successfully. Operations, documents, and tools were kept.`
      );
      onMoved?.(
        response.data || {
          ...part,
          assembly_id: targetAssemblyIdProp,
        }
      );
    } catch (error) {
      const detail =
        error?.response?.data?.detail ||
        error?.message ||
        "Failed to move part";
      message.error(detail);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={
        <span className="inline-flex items-center gap-2">
          <SwapOutlined />
          Confirm Move Part
        </span>
      }
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      okText="Confirm Move"
      cancelText="Cancel"
      confirmLoading={submitting}
      destroyOnClose
      okButtonProps={{
        id: part ? `move-part-ok-${part.id}` : "move-part-ok",
      }}
      width={520}
    >
      {part && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div
            style={{
              paddingBottom: 8,
              borderBottom: "1px solid #E8E4D8",
            }}
          >
            <div>
              <Text type="secondary" style={{ fontSize: 11 }}>
                Part
              </Text>
              <div style={{ fontWeight: 700, fontSize: 15 }}>
                {part.part_name}
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {part.part_number}
              </Text>
            </div>
          </div>

          <LocationCard tone="current" title="From (Current)">
            {currentLabel || "—"}
          </LocationCard>

          <div style={{ textAlign: "center", color: "#1677ff", lineHeight: 1 }}>
            <ArrowDownOutlined />
          </div>

          <LocationCard tone="upcoming" title="To (Upcoming)">
            {upcomingLabel || "—"}
          </LocationCard>

          <Text type="secondary" style={{ fontSize: 12 }}>
            This move was selected by drag and drop. Nothing changes until you
            click Confirm Move.
          </Text>
        </div>
      )}
    </Modal>
  );
};

export default MovePartModal;
