import React, { useState, useEffect, useMemo } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import { Layout, Drawer, Button, Tabs, Tooltip } from "antd";
import { MenuOutlined, ArrowLeftOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from "@ant-design/icons";
import BillOfMaterials from "./PDM Components/BillOfMaterials";
import ProductDetails from "./PDM Components/ProductDetails";
import DocumentsPanel from "./PDM Components/DocumentsPanel";
import OrderTracking from "./Product Monitoring Components/OrderTracking";
import AssemblyDocumentsPanel from "./PDM Components/AssemblyDocumentsPanel";
import PPS from "./PPS";
import ProductionMonitoring from "./ProductionMonitoring";
import Recyclebin from "./Recyclebin";

const { Sider, Content } = Layout;

const BOM_SIDER_COLLAPSED = 48;

function getBomWidth(viewportWidth) {
  if (viewportWidth >= 1600) return Math.min(520, Math.round(viewportWidth * 0.28));
  if (viewportWidth >= 1400) return Math.min(460, Math.round(viewportWidth * 0.3));
  if (viewportWidth >= 1200) return Math.min(420, Math.round(viewportWidth * 0.32));
  if (viewportWidth >= 992) return Math.min(360, Math.round(viewportWidth * 0.34));
  return Math.min(320, Math.round(viewportWidth * 0.42));
}

/**
 * Single-product PDM view for Project Coordinator.
 * Opened from OMS when clicking a Project Name (no "Create product"; full view/edit/delete for that product).
 */
const ProjectCoordinatorProductView = () => {
  const { productId } = useParams();
  const location = useLocation();
  const { projectName, projectNumber, initialPartId } = location.state || {};
  const [selectedItem, setSelectedItem] = useState(null);
  const [partDocuments, setPartDocuments] = useState([]);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1280
  );
  const [productHierarchies, setProductHierarchies] = useState({});
  const [activeTab, setActiveTab] = useState("bom");
  const [bomCollapsed, setBomCollapsed] = useState(false);

  useEffect(() => {
    if (initialPartId != null) {
      setActiveTab("bom");
      setBomCollapsed(false);
      if (typeof window !== "undefined" && window.innerWidth < 992) {
        setMobileDrawerOpen(true);
      }
    }
  }, [initialPartId]);

  const path = location.pathname;
  const useBomDrawer = viewportWidth < 992;
  const bomWidth = useMemo(() => getBomWidth(viewportWidth), [viewportWidth]);

  const renderContent = () => {
    if (path.includes("/pps/")) return <PPS />;
    if (path.includes("/product-monitoring/")) return <ProductionMonitoring />;
    return null;
  };

  const isModuleView = path.includes("/pps/") || path.includes("/product-monitoring/");

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      setViewportWidth(w);
      if (w >= 992) setMobileDrawerOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "auto";
      document.documentElement.style.overflow = "auto";
    };
  }, []);

  const handleItemSelected = (item) => {
    setSelectedItem(item);
    setPartDocuments([]);
    if (useBomDrawer) setMobileDrawerOpen(false);
  };

  const handleHierarchyLoaded = (pid, hierarchy) => {
    setProductHierarchies((prev) => ({ ...prev, [pid]: hierarchy }));
  };

  const bomSidebar = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, minWidth: 0, overflow: "hidden" }}>
      <BillOfMaterials
        singleProductId={productId ? parseInt(productId, 10) : null}
        initialPartId={initialPartId != null ? Number(initialPartId) : null}
        onItemSelected={handleItemSelected}
        onHierarchyLoaded={handleHierarchyLoaded}
        projectName={projectName}
        projectNumber={projectNumber}
      />
    </div>
  );

  if (!productId && !isModuleView) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-3 mb-2">
          <Link to="/project_coordinator/oms/orders" className="text-blue-600 hover:underline">
            ← Back to Projects
          </Link>
          {(projectName || projectNumber) && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-700">{projectName}</span>
              {projectNumber && <span className="text-sm text-slate-500">({projectNumber})</span>}
            </div>
          )}
        </div>
        <p className="mt-2 text-gray-500">No product selected.</p>
      </div>
    );
  }

  if (isModuleView) {
    return renderContent();
  }

  return (
    <>
      <style>{`
        .pc-pdm-shell {
          height: 100%;
          width: 100%;
          min-width: 0;
          min-height: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .pc-pdm-main {
          flex: 1;
          min-height: 0;
          min-width: 0;
          width: 100%;
          overflow: hidden;
          display: flex !important;
          height: 100%;
        }
        .pc-pdm-bom-sider.ant-layout-sider {
          flex: 0 0 auto !important;
          max-width: none !important;
          min-width: 0 !important;
          height: 100% !important;
        }
        .pc-pdm-bom-sider .ant-layout-sider-children {
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 0;
          min-width: 0;
          overflow: hidden;
        }
        .pc-pdm-detail {
          flex: 1 1 auto !important;
          min-width: 0 !important;
        }
        .pc-pdm-bom-toggle {
          position: fixed;
          top: 12px;
          left: 12px;
          z-index: 1001;
          background: #fff;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
        @media (min-width: 768px) and (max-width: 991px) {
          .pc-pdm-bom-toggle { left: 96px; }
        }
        .pc-pdm-top-bar {
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 0;
          padding: 8px 12px 0;
          border-bottom: 1px solid #f0f0f0;
          background: #fff;
        }
        .pc-pdm-top-bar-row {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
          min-width: 0;
          padding-bottom: 8px;
        }
        .pc-pdm-top-bar .ant-tabs {
          width: 100%;
          min-width: 0;
        }
        .pc-pdm-top-bar .ant-tabs-nav {
          margin-bottom: 0 !important;
        }
      `}</style>

      <div className="pc-pdm-shell" style={{ height: "100vh", maxHeight: "100vh", flex: 1, minHeight: 0 }}>
        <div className="pc-pdm-top-bar">
          <div className="pc-pdm-top-bar-row">
            <Link
              to="/project_coordinator/oms/orders"
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg transition-colors border border-blue-200"
            >
              <ArrowLeftOutlined />
              {viewportWidth < 900 ? "Back" : "Back to Projects"}
            </Link>
            {(projectName || projectNumber) && (
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-semibold text-slate-700 truncate" title={projectName}>
                  {projectName}
                </span>
                {projectNumber && (
                  <span className="text-sm text-slate-500 shrink-0">({projectNumber})</span>
                )}
              </div>
            )}
          </div>
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            size={viewportWidth < 1100 ? "small" : "middle"}
            items={[
              { key: "bom", label: "PDM" },
              { key: "order", label: viewportWidth < 1100 ? "Tracking" : "Project Tracking" },
              { key: "recycle-bin", label: viewportWidth < 1100 ? "Recycle" : "Recycle Bin" },
            ]}
          />
        </div>

        {activeTab === "bom" ? (
          <Layout className="pc-pdm-main">
            {useBomDrawer && (
              <Button
                type="default"
                icon={<MenuOutlined />}
                onClick={() => setMobileDrawerOpen(true)}
                className="pc-pdm-bom-toggle"
              >
                BOM
              </Button>
            )}

            {!useBomDrawer && (
              <Sider
                className="pc-pdm-bom-sider"
                width={bomWidth}
                collapsedWidth={BOM_SIDER_COLLAPSED}
                collapsed={bomCollapsed}
                collapsible
                trigger={null}
                theme="light"
                style={{
                  borderRight: "1px solid #f0f0f0",
                  overflow: "hidden",
                  height: "100%",
                  transition: "all 0.2s",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: bomCollapsed ? "center" : "space-between",
                    padding: bomCollapsed ? "8px 0" : "6px 10px",
                    borderBottom: "1px solid #f0f0f0",
                    flexShrink: 0,
                    background: "#fafafa",
                  }}
                >
                  {!bomCollapsed && (
                    <span style={{ fontSize: 12, color: "rgba(0,0,0,0.45)" }}>BOM panel</span>
                  )}
                  <Tooltip
                    title={bomCollapsed ? "Expand Bill of Materials" : "Minimise Bill of Materials"}
                    placement="right"
                  >
                    <Button
                      type="text"
                      size="small"
                      icon={bomCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                      onClick={() => setBomCollapsed((c) => !c)}
                    />
                  </Tooltip>
                </div>
                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    minWidth: 0,
                    overflow: "hidden",
                    display: bomCollapsed ? "none" : "flex",
                    flexDirection: "column",
                    position: "relative",
                  }}
                >
                  {bomSidebar}
                </div>
              </Sider>
            )}

            <Drawer
              title="Bill of Materials"
              placement="left"
              onClose={() => setMobileDrawerOpen(false)}
              open={useBomDrawer && mobileDrawerOpen}
              size={Math.min(420, Math.round(viewportWidth * 0.92))}
              styles={{ body: { padding: 0, height: "100%", overflow: "hidden" } }}
              destroyOnClose={false}
            >
              {bomSidebar}
            </Drawer>

            <Content
              className="pc-pdm-detail"
              style={{
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                backgroundColor: "#f8fafc",
                height: "100%",
                margin: 0,
                padding: useBomDrawer ? "48px 8px 8px" : 0,
                minWidth: 0,
              }}
            >
              {selectedItem?.itemType === "part" && (
                <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }}>
                  <ProductDetails selectedItem={selectedItem} partDocuments={partDocuments}>
                    <DocumentsPanel
                      selectedItem={selectedItem}
                      onDocumentsLoaded={setPartDocuments}
                    />
                  </ProductDetails>
                </div>
              )}
              {selectedItem?.itemType === "assembly" && (
                <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }}>
                  <AssemblyDocumentsPanel selectedItem={selectedItem} />
                </div>
              )}
              {selectedItem &&
                selectedItem.itemType !== "part" &&
                selectedItem.itemType !== "assembly" &&
                selectedItem.itemType !== "product" && (
                  <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }}>
                    <DocumentsPanel
                      selectedItem={selectedItem}
                      onDocumentsLoaded={setPartDocuments}
                    />
                  </div>
                )}
            </Content>
          </Layout>
        ) : activeTab === "order" ? (
          <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "0 8px 8px" }}>
            <OrderTracking productId={productId} />
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden", height: "100%" }}>
            <Recyclebin
              productId={productId ? parseInt(productId, 10) : null}
              projectName={projectName}
              projectNumber={projectNumber}
            />
          </div>
        )}
      </div>
    </>
  );
};

export default ProjectCoordinatorProductView;
