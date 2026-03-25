import React, { useState } from "react";
import { useParams, Link } from "react-router-dom";
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
    <>
      <div className="p-2 border-b border-slate-200 bg-white shrink-0">
        <Link
          to="/project_coordinator/oms/orders"
          className="flex items-center gap-2 text-slate-600 hover:text-indigo-600 text-sm font-medium"
        >
          <ArrowLeftOutlined />
          Back to Orders
        </Link>
      </div>
      <BillOfMaterials
        singleProductId={productId ? parseInt(productId, 10) : null}
        onItemSelected={handleItemSelected}
        onHierarchyLoaded={handleHierarchyLoaded}
      />
    </>
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
      `}</style>

      <Layout style={{ height: "100vh", overflow: "hidden" }}>
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
              overflow: "auto",
              minWidth: 300,
              maxWidth: 500,
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
                <div
                  style={{
                    flexShrink: 0,
                    maxHeight: isMobile ? "30vh" : "38vh",
                    minHeight: 0,
                    overflow: "hidden",
                  }}
                >
                  <ProductDetails selectedItem={selectedItem} partDocuments={partDocuments} />
                </div>
              )}
              <div style={{ flex: 1, minHeight: 0, overflow: "hidden", height: "100%" }}>
                {selectedItem?.itemType === "assembly" ? (
                  <AssemblyDocumentsPanel selectedItem={selectedItem} />
                ) : (
                  <DocumentsPanel
                    selectedItem={selectedItem}
                    onDocumentsLoaded={setPartDocuments}
                  />
                )}
              </div>
            </>
          )}
        </Content>
      </Layout>
    </>
  );
};

export default ProjectCoordinatorProductView;
