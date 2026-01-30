import React, { useState } from "react";
import BillOfMaterials from "../PDM Components/BillOfMaterials";
import ProductDetails from "../PDM Components/ProductDetails";
import DocumentsPanel from "../PDM Components/DocumentsPanel";
import { cn } from "../lib/utils";

const PDM = () => {
  const [selectedItem, setSelectedItem] = useState(null);

  const handleItemSelected = (item) => {
    setSelectedItem(item);
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex overflow-hidden bg-background">
      {/* Bill of Materials - Left Sidebar */}
      <BillOfMaterials onItemSelected={handleItemSelected} />
      
      {/* Right Side Container */}
      <div className={cn(
        "flex-1 flex flex-col overflow-hidden",
        "bg-muted/30"
      )}>
        {/* ProductDetails - Top Right */}
        <div className="flex-shrink-0">
          <ProductDetails selectedItem={selectedItem} />
        </div>
        
        {/* DocumentsPanel - Bottom Right with scroll */}
        <div className="flex-1 overflow-hidden">
          <DocumentsPanel selectedItem={selectedItem} />
        </div>
      </div>
    </div>
  );
};

export default PDM;
