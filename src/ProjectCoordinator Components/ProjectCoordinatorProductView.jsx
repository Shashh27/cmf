import React, { useState, useEffect } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import { Layout, Drawer, Button } from "antd";
import { MenuOutlined, ArrowLeftOutlined } from "@ant-design/icons";
import BillOfMaterials from "./PDM Components/BillOfMaterials";
import ProductDetails from "./PDM Components/ProductDetails";
import ProductSummary from "./PDM Components/ProductSummary";
import DocumentsPanel from "./PDM Components/DocumentsPanel";
import AssemblyDocumentsPanel from "./PDM Components/AssemblyDocumentsPanel";

const { Sider, Content } = Layout;

/**
 * Single-product PDM view for Project Coordinator.
 * Opened from OMS when clicking a Project Name (no "Create product"; full view/edit/delete for that product).
 */
const ProjectCoordinatorProductView = () => {
  const { productId } = useParams();
  const location = useLocation();
  const { projectName, projectNumber } = location.state || {};
  const [selectedItem, setSelectedItem] = useState(null);
  const [partDocuments, setPartDocuments] = useState([]);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [productHierarchies, setProductHierarchies] = useState({});

  React.useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setMobileDrawerOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    // Prevent body scrolling entirely for this view
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
    if (isMobile) setMobileDrawerOpen(false);
  };

  const handleHierarchyLoaded = (pid, hierarchy) => {
    setProductHierarchies((prev) => ({ ...prev, [pid]: hierarchy }));
    // Auto-select product when opening from OMS link so ProductSummary shows
    if (String(pid) === String(productId)) {
      setSelectedItem({ itemType: "product", id: parseInt(productId, 10) });
    }
  };

  const isProductSelected = selectedItem?.itemType === "product";

  const bomSidebar = (
    <div className="flex flex-col h-full overflow-hidden">
      <BillOfMaterials
        singleProductId={productId ? parseInt(productId, 10) : null}
        onItemSelected={handleItemSelected}
        onHierarchyLoaded={handleHierarchyLoaded}
        projectName={projectName}
        projectNumber={projectNumber}
      />
    </div>
  );

  if (!productId) {
    return (
      <div className="p-4">
        <Link to="/project_coordinator/oms/orders" className="text-blue-600 hover:underline">
          ← Back to Orders
        </Link>
        <p className="mt-2 text-gray-500">No product selected.</p>
      </div>
    );
  }

  return (
    <>
      <style>{`
        * {
          box-sizing: border-box;
        }
        @media (max-width: 768px) {
          .pdm-mobile-toggle {
            position: fixed;
            top: 80px;
            left: 16px;
            z-index: 1001;
            background: white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            border-radius: 8px;
          }
        }
        /* Custom scrollbar for better UX within containers */
        ::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        ::-webkit-scrollbar-track {
          background: #f1f5f9;
        }
        ::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 3px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>

      <div style={{ paddingTop: 10, height: 'calc(100vh - 120px)', minHeight: 320, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '0 16px 10px 16px', display: 'flex', justifyContent: 'flex-start', alignItems: 'center' }}>
          <Link
            to="/project_coordinator/oms/orders"
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-800 text-xs font-semibold rounded-lg transition-colors border border-indigo-200"
          >
            <ArrowLeftOutlined />
            Back to Orders
          </Link>
        </div>
        <Layout style={{ height: "100%", flex: 1, overflow: "hidden", display: 'flex' }}>
          {isMobile && (
            <Button
              type="text"
              icon={<MenuOutlined />}
              onClick={() => setMobileDrawerOpen(true)}
              className="pdm-mobile-toggle"
            />
          )}

          {!isMobile && (
            <Sider
              width="33%"
              theme="light"
              style={{
                borderRight: "1px solid #f0f0f0",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                minWidth: 300,
                maxWidth: 500,
                height: '100%'
              }}
            >
              {bomSidebar}
            </Sider>
          )}

          {isMobile && (
            <Drawer
              placement="left"
              onClose={() => setMobileDrawerOpen(false)}
              open={mobileDrawerOpen}
              style={{ width: "85%" }}
              styles={{ body: { padding: 0 } }}
            >
              {bomSidebar}
            </Drawer>
          )}

          <Content
            style={{
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              backgroundColor: "#f8fafc",
              height: "100%",
              marginLeft: isMobile ? 0 : undefined,
            }}
          >
            {isProductSelected ? (
              <div style={{ flex: 1, minHeight: 0, overflow: "hidden", height: "100%" }}>
                <ProductSummary
                  productId={selectedItem?.id}
                  initialHierarchy={productHierarchies[selectedItem?.id]}
                />
              </div>
            ) : (
              <>
                {selectedItem?.itemType === "part" && (
                  <div style={{ flex: 1, minHeight: 0, overflow: "hidden", height: "100%" }}>
                    <ProductDetails selectedItem={selectedItem} partDocuments={partDocuments}>
                      <DocumentsPanel
                        selectedItem={selectedItem}
                        onDocumentsLoaded={setPartDocuments}
                      />
                    </ProductDetails>
                  </div>
                )}
                {selectedItem?.itemType === "assembly" && (
                  <div style={{ flex: 1, minHeight: 0, overflow: "hidden", height: "100%" }}>
                    <AssemblyDocumentsPanel selectedItem={selectedItem} />
                  </div>
                )}
                {selectedItem?.itemType !== "part" && selectedItem?.itemType !== "assembly" && (
                  <div style={{ flex: 1, minHeight: 0, overflow: "hidden", height: "100%" }}>
                    <DocumentsPanel
                      selectedItem={selectedItem}
                      onDocumentsLoaded={setPartDocuments}
                    />
                  </div>
                )}
              </>
            )}
          </Content>
        </Layout>
      </div>
    </>
  );
};

export default ProjectCoordinatorProductView;
