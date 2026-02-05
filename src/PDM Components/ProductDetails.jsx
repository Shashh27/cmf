import React from "react";
import { Box } from "lucide-react";
import { Card, CardContent, CardTitle } from "../components/ui/card";
import { cn } from "../lib/utils";

const ProductDetails = ({ selectedItem }) => {
  if (!selectedItem) {
    return (
      <div className="flex-1 flex flex-col bg-muted/20">
        <Card className="border-0 rounded-none shadow-none h-full flex items-center justify-center">
          <CardContent className="text-center text-sm text-muted-foreground">
            Select an item to view details
          </CardContent>
        </Card>
      </div>
    );
  }

  const { itemType } = selectedItem;
  const item = selectedItem;
  
  const getItemNumber = () => {
    switch(itemType) {
      case 'product': return item?.product_number || item?.id;
      case 'assembly': return item?.assembly_number || item?.id;
      case 'part': return item?.part_number || item?.id;
      default: return item?.id;
    }
  };
  
  const getItemName = () => {
    switch(itemType) {
      case 'product': return item?.product_name || item?.name;
      case 'assembly': return item?.assembly_name || item?.name;
      case 'part': return item?.part_name || item?.name;
      default: return item?.name;
    }
  };

  const itemNumber = getItemNumber();
  const itemName = getItemName();

  return (
    <div className="flex-1 flex flex-col bg-muted/20">
      <Card className="border-0 rounded-none shadow-none">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <div>
                <CardTitle className="text-lg font-medium mb-1">{itemName || 'Unknown Item'}</CardTitle>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{itemNumber || 'N/A'}</span>
                  {item?.product_version && <span>• Rev {item.product_version}</span>}
                </div>
              </div>
              
              <div className="grid grid-cols-[60px_1fr] gap-x-3 gap-y-1.5 text-sm">
                <div className="text-muted-foreground">Type</div>
                <div className="flex items-center gap-2">
                  <span className="font-medium capitalize">{itemType || 'Unknown'}</span>
                  {item?.type_name && (
                    <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-semibold', item.type_name.toLowerCase() === 'make' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700')}>
                      {item.type_name.toUpperCase()}
                    </span>
                  )}
                </div>
                
                <div className="text-muted-foreground">ID</div>
                <div className="font-mono text-xs">{item?.id || 'N/A'}</div>
              </div>
            </div>

            <div className="bg-muted/50 rounded p-6 flex flex-col items-center justify-center border-2 border-dashed border-border">
              <Box className="h-12 w-12 text-muted-foreground mb-2" strokeWidth={1.5} />
              <p className="text-xs font-medium text-muted-foreground mb-1">3D Model Viewer</p>
              <p className="text-[10px] text-muted-foreground text-center">STEP file viewer will be displayed here</p>
              <p className="text-[10px] text-muted-foreground mt-2 font-mono">{itemNumber || 'N/A'}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProductDetails;