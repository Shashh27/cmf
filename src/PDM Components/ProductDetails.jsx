import React from "react";
import { Box } from "lucide-react";
import { Card, CardContent, CardTitle } from "../components/ui/card";
import { cn } from "../lib/utils";

const ProductDetails = ({ selectedItem }) => {

  if (!selectedItem) {
    return (
      <div className="flex-1 flex flex-col bg-muted/30">
        <Card className="border-0 rounded-none shadow-none">
          <CardContent className="p-6">
            <div className="text-center text-muted-foreground">
              Select an item to view details
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const item = selectedItem;
  const itemNumber = selectedItem.itemType === 'product' ? (item?.product_number || item?.id) : 
                    selectedItem.itemType === 'assembly' ? (item?.assembly_number || item?.id) : 
                    selectedItem.itemType === 'part' ? (item?.part_number || item?.id) : 
                    item?.id;
  const itemName = selectedItem.itemType === 'product' ? (item?.product_name || item?.name) : 
                   selectedItem.itemType === 'assembly' ? (item?.assembly_name || item?.name) : 
                   selectedItem.itemType === 'part' ? (item?.part_name || item?.name) : 
                   item?.name;

  return (
    <div className="flex-1 flex flex-col bg-muted/30">
      {/* Top Part - Item Details */}
      <Card className="border-0 rounded-none shadow-none">
        <CardContent className="p-6 pt-10">
          <div className="grid grid-cols-2 gap-8">
            {/* Left Column - Part Details */}
            <div className="space-y-4">
              <div>
                <CardTitle className="text-2xl mb-2">{itemName || 'Unknown Item'}</CardTitle>
                <div className="flex items-center space-x-4">
                  <span className="text-sm font-medium text-muted-foreground">{itemNumber || 'N/A'}</span>
                  {item?.product_version && (
                    <span className="text-sm text-muted-foreground">Rev {item.product_version}</span>
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-y-2 text-sm">
                <div className="font-medium text-muted-foreground">Type</div>
                <div className="flex items-center space-x-2">
                  <span className="text-foreground capitalize">
                    {selectedItem?.itemType || 'Unknown'}
                    {item?.type_name && (
                      <span 
                        className={cn(
                          'ml-2 text-xs px-2 py-0.5 rounded-full',
                          item.type_name.toLowerCase() === 'make' 
                            ? 'bg-green-100 text-green-800' 
                            : item.type_name.toLowerCase() === 'buy' 
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-800'
                        )}
                      >
                        {item.type_name}
                      </span>
                    )}
                  </span>
                </div>
                
                <div className="font-medium text-muted-foreground">ID</div>
                <div className="text-foreground">{item?.id || 'N/A'}</div>
              </div>
            </div>

            {/* 3D Model Placeholder */}
            <div className="bg-muted/50 rounded-lg p-4 flex flex-col items-center justify-center border-2 border-dashed border-border">
              <Box className="h-16 w-16 text-muted-foreground mb-3" />
              <p className="text-sm font-medium text-muted-foreground mb-1">3D Model Viewer</p>
              <p className="text-xs text-muted-foreground text-center">STEP file viewer will be displayed here</p>
              <p className="text-xs text-muted-foreground mt-2">{itemNumber || 'N/A'}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProductDetails;
