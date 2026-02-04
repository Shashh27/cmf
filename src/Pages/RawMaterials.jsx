import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "../Config/auth";
import { cn } from "../lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  ChevronDown,
  ChevronRight,
  Package,
  Box,
  Wrench,
  Pencil,
  Trash2,
  Plus,
} from "lucide-react";

const RawMaterials = () => {
  const [orders, setOrders] = useState([]);
  const [orderBomMap, setOrderBomMap] = useState({});
  const [rawMaterials, setRawMaterials] = useState([]);
  const [loading, setLoading] = useState(true); // used for initial load; UI no longer shows blank page
  const [bomLoadingMap, setBomLoadingMap] = useState({});
  const [expandedOrders, setExpandedOrders] = useState({});
  const [expandedAssemblies, setExpandedAssemblies] = useState({});
  const [selectedPartsByOrder, setSelectedPartsByOrder] = useState({});
  const [selectedRawMaterialIds, setSelectedRawMaterialIds] = useState({});
  const [rawMaterialModalOpen, setRawMaterialModalOpen] = useState(false);
  const [editingRawMaterial, setEditingRawMaterial] = useState(null);
  const [rawMaterialForm, setRawMaterialForm] = useState({
    material_name: "",
    material_specification: "",
    mass: "",
    density: "",
    volume: "",
    stock_type: "",
    quantity: "",
    stock_dimensions: "",
    status: "",
  });
  const [savingRawMaterial, setSavingRawMaterial] = useState(false);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    fetchOrders();
    fetchRawMaterials();
  }, []);

  const fetchOrders = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/orders/`);
      if (response.ok) {
        const data = await response.json();
        setOrders(data);
      } else {
        setOrders([]);
      }
    } catch (error) {
      console.error("Error fetching orders:", error);
      setOrders([]);
    }
  };

  const fetchRawMaterials = async () => {
    setLoading(true);
    
    // Try the exact endpoint from your curl command first
    try {
      const response = await fetch(`${API_BASE_URL}/rawmaterials/?skip=0&limit=100`);
      
      if (response.ok) {
        const data = await response.json();
        
        // The data is directly an array based on your API response
        if (Array.isArray(data)) {
          setRawMaterials(data);
          setLoading(false);
          return;
        }
      }
    } catch (error) {
      console.error('Error fetching raw materials:', error);
    }
    
    // Fallback: Try other possible endpoints
    const endpoints = ["rawmaterials/", "raw-materials/", "raw_materials/"];
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${API_BASE_URL}/${endpoint}`);
        if (response.ok) {
          const data = await response.json();
          let materials = [];
          if (Array.isArray(data)) {
            materials = data;
          } else if (data?.results) {
            materials = data.results;
          } else if (data?.data) {
            materials = Array.isArray(data.data) ? data.data : [];
          } else if (data?.raw_materials) {
            materials = data.raw_materials;
          } else if (data?.id) {
            materials = [data];
          }
          setRawMaterials(materials);
          setLoading(false);
          return;
        }
      } catch (error) {
        console.error(`Error fetching raw materials from ${endpoint}:`, error);
      }
    }
    
    setRawMaterials([]);
    setLoading(false);
  };

  const openCreateRawMaterial = () => {
    setEditingRawMaterial(null);
    setRawMaterialForm({
      material_name: "",
      material_specification: "",
      mass: "",
      density: "",
      volume: "",
      stock_type: "",
      quantity: "",
      stock_dimensions: "",
      status: "",
    });
    setRawMaterialModalOpen(true);
  };

  const openEditRawMaterial = (material) => {
    setEditingRawMaterial(material);
    setRawMaterialForm({
      material_name: material.material_name || "",
      material_specification: material.material_specification || "",
      mass: material.mass ?? "",
      density: material.density ?? "",
      volume: material.volume ?? "",
      stock_type: material.stock_type || "",
      quantity: material.quantity ?? "",
      stock_dimensions: material.stock_dimensions || "",
      status: material.status || "",
    });
    setRawMaterialModalOpen(true);
  };

  const closeRawMaterialModal = () => {
    setRawMaterialModalOpen(false);
    setEditingRawMaterial(null);
  };

  const handleRawMaterialChange = (field, value) => {
    setRawMaterialForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSaveRawMaterial = async (e) => {
    e.preventDefault();
    setSavingRawMaterial(true);

    try {
      const isEdit = !!editingRawMaterial?.id;
      const url = isEdit
        ? `${API_BASE_URL}/rawmaterials/${editingRawMaterial.id}`
        : `${API_BASE_URL}/rawmaterials/`;
      const method = isEdit ? "PUT" : "POST";

      const payload = {
        material_name: rawMaterialForm.material_name,
        material_specification: rawMaterialForm.material_specification,
        mass:
          rawMaterialForm.mass === "" ? 0 : Number(rawMaterialForm.mass) || 0,
        density:
          rawMaterialForm.density === ""
            ? 0
            : Number(rawMaterialForm.density) || 0,
        volume:
          rawMaterialForm.volume === ""
            ? 0
            : Number(rawMaterialForm.volume) || 0,
        stock_type: rawMaterialForm.stock_type,
        quantity:
          rawMaterialForm.quantity === ""
            ? 0
            : Number(rawMaterialForm.quantity) || 0,
        stock_dimensions: rawMaterialForm.stock_dimensions,
        status: rawMaterialForm.status,
      };

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        await fetchRawMaterials();
        window.alert(
          isEdit ? "Raw material updated successfully" : "Raw material created successfully"
        );
        closeRawMaterialModal();
      } else {
        window.alert("Failed to save raw material");
      }
    } catch (error) {
      console.error("Error saving raw material:", error);
      window.alert("Error saving raw material");
    } finally {
      setSavingRawMaterial(false);
    }
  };

  const handleDeleteRawMaterial = async (material) => {
    if (
      !window.confirm(
        `Are you sure you want to delete raw material "${material.material_name}"?`
      )
    ) {
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/rawmaterials/${material.id}`,
        {
          method: "DELETE",
        }
      );
      if (response.ok) {
        await fetchRawMaterials();
        window.alert("Raw material deleted successfully");
      } else {
        window.alert("Failed to delete raw material");
      }
    } catch (error) {
      console.error("Error deleting raw material:", error);
      window.alert("Error deleting raw material");
    }
  };

  const fetchOrderBom = async (orderId, productId) => {
    setBomLoadingMap((prev) => ({ ...prev, [orderId]: true }));
    try {
      const response = await fetch(`${API_BASE_URL}/products/${productId}/hierarchical`);
      if (response.ok) {
        const data = await response.json();
        setOrderBomMap((prev) => ({ ...prev, [orderId]: data }));
        setExpandedAssemblies((prev) => {
          const next = { ...prev };
          (data.assemblies || []).forEach((a) => {
            const assembly = a.assembly || a;
            if (assembly?.id) next[assembly.id] = true;
          });
          return next;
        });
      } else {
        setOrderBomMap((prev) => ({ ...prev, [orderId]: null }));
      }
    } catch (error) {
      console.error("Error fetching BOM:", error);
      setOrderBomMap((prev) => ({ ...prev, [orderId]: null }));
    } finally {
      setBomLoadingMap((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  const toggleOrderExpand = (order) => {
    const isExpanded = expandedOrders[order.id];
    setExpandedOrders((prev) => ({ ...prev, [order.id]: !prev[order.id] }));
    if (!isExpanded && order.product_id && !orderBomMap[order.id]) {
      fetchOrderBom(order.id, order.product_id);
    }
  };

  const toggleAssemblyExpand = (assemblyId) => {
    setExpandedAssemblies((prev) => ({ ...prev, [assemblyId]: !prev[assemblyId] }));
  };

  const togglePartSelection = (orderId, partId) => {
    setSelectedPartsByOrder((prev) => {
      const current = prev[orderId] || {};
      return {
        ...prev,
        [orderId]: {
          ...current,
          [partId]: !current[partId],
        },
      };
    });
  };

  const renderPart = (partDetails, level = 0, orderId) => {
    const part = partDetails.part || partDetails;
    if (!part || !part.id) return null;
    const isSelected = selectedPartsByOrder[orderId]?.[part.id];
    return (
      <div
        key={part.id}
        className="flex items-center py-1.5 hover:bg-gray-50 rounded px-2"
        style={{ marginLeft: `${level * 20}px` }}
      >
        <input
          type="checkbox"
          checked={!!isSelected}
          onChange={() => togglePartSelection(orderId, part.id)}
          className="h-4 w-4 rounded border-gray-300 mr-2 flex-shrink-0 cursor-pointer"
        />
        <Wrench className="h-4 w-4 text-gray-500 mr-2 flex-shrink-0" />
        <span className="text-sm font-medium">{part.part_number}</span>
        <span className="text-gray-600 text-sm ml-2">{part.part_name}</span>
      </div>
    );
  };

  const renderAssembly = (assemblyDetails, level = 0, orderId) => {
    const assembly = assemblyDetails.assembly || assemblyDetails;
    if (!assembly || !assembly.id) return null;
    const parts = assemblyDetails.parts || [];
    const subassemblies = assemblyDetails.subassemblies || [];
    const hasChildren = parts.length > 0 || subassemblies.length > 0;
    const isExpanded = expandedAssemblies[assembly.id];

    return (
      <div key={assembly.id} className="mb-1">
        <div
          className="flex items-center py-1.5 hover:bg-blue-50 rounded px-2 cursor-pointer"
          style={{ marginLeft: `${level * 20}px` }}
          onClick={() => hasChildren && toggleAssemblyExpand(assembly.id)}
        >
          {hasChildren ? (
            <span className="mr-1 text-blue-600">
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </span>
          ) : (
            <span className="w-4 mr-1" />
          )}
          <span className="w-4 mr-1" />
          <Box className="h-4 w-4 text-blue-600 mr-2 flex-shrink-0" />
          <span className="text-sm font-medium">{assembly.assembly_number}</span>
          <span className="text-gray-600 text-sm ml-2">{assembly.assembly_name}</span>
        </div>
        {isExpanded && (
          <div className="mt-0.5">
            {parts.map((p) => renderPart(p, level + 1, orderId))}
            {subassemblies.map((s) => renderAssembly(s, level + 1, orderId))}
          </div>
        )}
      </div>
    );
  };

  const renderOrderBom = (order) => {
    const bomData = orderBomMap[order.id];
    const isLoading = bomLoadingMap[order.id];

    if (isLoading) {
      return (
        <div className="py-4 px-4 text-sm text-gray-500" style={{ marginLeft: "20px" }}>
          Loading BOM...
        </div>
      );
    }
    if (!bomData) {
      return (
        <div className="py-4 px-4 text-sm text-gray-500" style={{ marginLeft: "20px" }}>
          No BOM data available
        </div>
      );
    }

    const product = bomData.product;
    const assemblies = bomData.assemblies || [];
    const directParts = bomData.direct_parts || [];

    return (
      <div className="pl-4 border-l-2 border-gray-200 ml-4 mt-1 mb-2">
        {product && (
          <div className="flex items-center py-2 border-b border-gray-100 mb-2">
            <Package className="h-4 w-4 text-indigo-600 mr-2 flex-shrink-0" />
            <span className="text-sm font-semibold">{product.product_number}</span>
            <span className="text-gray-600 text-sm ml-2">{product.product_name}</span>
          </div>
        )}
        {assemblies.map((a) => renderAssembly(a, 0, order.id))}
        {directParts.map((p) => renderPart(p, 0, order.id))}
      </div>
    );
  };

  const renderOrderTree = () => {
    return (
      <div className="p-4 space-y-0">
        {orders.map((order) => {
          const isExpanded = expandedOrders[order.id];
          const hasProduct = !!order.product_id;

          return (
            <div key={order.id} className="mb-1">
              <div
                className={cn(
                  "flex items-center py-2 px-3 rounded-lg cursor-pointer transition-colors",
                  isExpanded ? "bg-gray-100" : "hover:bg-gray-50"
                )}
                onClick={() => toggleOrderExpand(order)}
              >
                {hasProduct ? (
                  <span className="mr-1 text-gray-600">
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </span>
                ) : (
                  <span className="w-4 mr-1" />
                )}
                <div className="w-3 h-3 bg-gray-600 rounded-full mr-2 flex-shrink-0" />
                <span className="font-medium text-gray-900">{order.sale_order_number}</span>
              </div>
              {isExpanded && renderOrderBom(order)}
            </div>
          );
        })}
        {orders.length === 0 && !loading && (
          <div className="py-12 text-center text-gray-500">No orders found</div>
        )}
        {loading && (
          <div className="py-6 text-center text-gray-500 text-sm">Loading orders...</div>
        )}
      </div>
    );
  };

  const handleSubmitLinks = async () => {
    // collect selected parts grouped by order
    const activeOrderIds = Object.keys(selectedPartsByOrder).filter((orderId) => {
      const map = selectedPartsByOrder[orderId];
      return map && Object.values(map).some(Boolean);
    });

    if (activeOrderIds.length === 0) {
      window.alert("Please select at least one part.");
      return;
    }

    if (activeOrderIds.length > 1) {
      window.alert("Please select parts from only one order at a time.");
      return;
    }

    const orderId = Number(activeOrderIds[0]);
    const partMap = selectedPartsByOrder[orderId] || {};
    const partIds = Object.keys(partMap)
      .filter((id) => partMap[id])
      .map((id) => Number(id));

    const rawMaterialIds = Object.keys(selectedRawMaterialIds)
      .filter((id) => selectedRawMaterialIds[id])
      .map((id) => Number(id));

    if (partIds.length === 0) {
      window.alert("Please select at least one part.");
      return;
    }

    if (rawMaterialIds.length === 0) {
      window.alert("Please select at least one raw material.");
      return;
    }

    // Allowed: 1:1, 1:n, n:1; Not allowed: n:n (both > 1)
    const isManyParts = partIds.length > 1;
    const isManyMaterials = rawMaterialIds.length > 1;

    if (isManyParts && isManyMaterials) {
      window.alert(
        "Adding many parts to many raw materials is not allowed."
      );
      return;
    }

    setLinking(true);
    try {
      const response = await fetch(
        `${API_BASE_URL}/order-parts-raw-material-linked/bulk`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            raw_material_ids: rawMaterialIds,
            part_ids: partIds,
            order_id: orderId,
          }),
        }
      );

      if (response.ok) {
        window.alert("Raw Materials added Successfully.");
      } else {
        window.alert("Adding failed. Please check your selections and try again.");
      }
    } catch (error) {
      console.error("Error Adding parts and raw materials:", error);
      window.alert("Error while Adding. Please try again.");
    } finally {
      setLinking(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Raw Materials</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left side - Orders tree */}
        <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Orders</h2>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 280px)" }}>
            {renderOrderTree()}
          </div>
        </div>

        {/* Right side - Raw Materials table */}
        <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Raw Materials</h2>
            <Button
              size="sm"
              onClick={openCreateRawMaterial}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Raw Material
            </Button>
          </div>
          <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 280px)" }}>
            <Table>
              <TableHeader>
                <TableRow className="border-b border-gray-300">
                  <TableHead className="font-semibold text-gray-900 bg-gray-50 border-r border-gray-300 text-center whitespace-nowrap px-4 py-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                      checked={
                        rawMaterials.length > 0 &&
                        rawMaterials.every((m) => selectedRawMaterialIds[m.id])
                      }
                      onChange={(e) => {
                        const checked = e.target.checked;
                        const next = {};
                        if (checked) {
                          rawMaterials.forEach((m) => {
                            next[m.id] = true;
                          });
                        }
                        setSelectedRawMaterialIds(next);
                      }}
                    />
                  </TableHead>
                  <TableHead className="font-semibold text-gray-900 bg-gray-50 border-r border-gray-300 text-center whitespace-nowrap px-4 py-3">SL NO</TableHead>
                  <TableHead className="font-semibold text-gray-900 bg-gray-50 border-r border-gray-300 text-center whitespace-nowrap px-4 py-3">MATERIAL NAME</TableHead>
                  <TableHead className="font-semibold text-gray-900 bg-gray-50 border-r border-gray-300 text-center whitespace-nowrap px-4 py-3">SPECIFICATION</TableHead>
                  <TableHead className="font-semibold text-gray-900 bg-gray-50 border-r border-gray-300 text-center whitespace-nowrap px-4 py-3">MASS</TableHead>
                  <TableHead className="font-semibold text-gray-900 bg-gray-50 border-r border-gray-300 text-center whitespace-nowrap px-4 py-3">DENSITY</TableHead>
                  <TableHead className="font-semibold text-gray-900 bg-gray-50 border-r border-gray-300 text-center whitespace-nowrap px-4 py-3">VOLUME</TableHead>
                  <TableHead className="font-semibold text-gray-900 bg-gray-50 border-r border-gray-300 text-center whitespace-nowrap px-4 py-3">STOCK TYPE</TableHead>
                  <TableHead className="font-semibold text-gray-900 bg-gray-50 border-r border-gray-300 text-center whitespace-nowrap px-4 py-3">QUANTITY</TableHead>
                  <TableHead className="font-semibold text-gray-900 bg-gray-50 border-r border-gray-300 text-center whitespace-nowrap px-4 py-3">DIMENSIONS</TableHead>
                  <TableHead className="font-semibold text-gray-900 bg-gray-50 border-r border-gray-300 text-center whitespace-nowrap px-4 py-3">STATUS</TableHead>
                  <TableHead className="font-semibold text-gray-900 bg-gray-50 text-center whitespace-nowrap px-4 py-3">ACTIONS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rawMaterials.length > 0 ? (
                  rawMaterials.map((material, index) => (
                    <TableRow
                      key={material.id ?? index}
                      className="border-b border-gray-300 hover:bg-gray-50 transition-colors"
                    >
                      <TableCell className="border-r border-gray-300 text-center px-4 py-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                          checked={!!selectedRawMaterialIds[material.id]}
                          onChange={() =>
                            setSelectedRawMaterialIds((prev) => ({
                              ...prev,
                              [material.id]: !prev[material.id],
                            }))
                          }
                        />
                      </TableCell>
                      <TableCell className="border-r border-gray-300 text-center font-medium px-4 py-3">{index + 1}</TableCell>
                      <TableCell className="border-r border-gray-300 text-center px-4 py-3">{material.material_name || "-"}</TableCell>
                      <TableCell className="border-r border-gray-300 text-center px-4 py-3">{material.material_specification || "-"}</TableCell>
                      <TableCell className="border-r border-gray-300 text-center px-4 py-3">{material.mass || "-"}</TableCell>
                      <TableCell className="border-r border-gray-300 text-center px-4 py-3">{material.density || "-"}</TableCell>
                      <TableCell className="border-r border-gray-300 text-center px-4 py-3">{material.volume || "-"}</TableCell>
                      <TableCell className="border-r border-gray-300 text-center px-4 py-3">{material.stock_type || "-"}</TableCell>
                      <TableCell className="border-r border-gray-300 text-center px-4 py-3">{material.quantity || "-"}</TableCell>
                      <TableCell className="border-r border-gray-300 text-center px-4 py-3">{material.stock_dimensions || "-"}</TableCell>
                      <TableCell className="border-r border-gray-300 text-center px-4 py-3">
                        <Badge variant={material.status ? "secondary" : "outline"}>
                          {material.status || "-"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditRawMaterial(material)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteRawMaterial(material)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={12} className="py-12 text-center text-gray-500">
                      No raw materials found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSubmitLinks} className="mt-2" disabled={linking}>
          {linking ? "Submitting..." : "Submit"}
        </Button>
      </div>

      {/* Raw Material Modal */}
      <Dialog
        open={rawMaterialModalOpen}
        onOpenChange={(open) => {
          if (!open) closeRawMaterialModal();
        }}
      >
        <DialogContent
          className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto"
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-gray-900">
              {editingRawMaterial ? "Edit Raw Material" : "Add Raw Material"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveRawMaterial}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">
                  Material Name *
                </label>
                <Input
                  value={rawMaterialForm.material_name}
                  onChange={(e) =>
                    handleRawMaterialChange("material_name", e.target.value)
                  }
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">
                  Specification
                </label>
                <Input
                  value={rawMaterialForm.material_specification}
                  onChange={(e) =>
                    handleRawMaterialChange(
                      "material_specification",
                      e.target.value
                    )
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">
                  Mass
                </label>
                <Input
                  type="number"
                  step="any"
                  value={rawMaterialForm.mass}
                  onChange={(e) =>
                    handleRawMaterialChange("mass", e.target.value)
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">
                  Density
                </label>
                <Input
                  type="number"
                  step="any"
                  value={rawMaterialForm.density}
                  onChange={(e) =>
                    handleRawMaterialChange("density", e.target.value)
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">
                  Volume
                </label>
                <Input
                  type="number"
                  step="any"
                  value={rawMaterialForm.volume}
                  onChange={(e) =>
                    handleRawMaterialChange("volume", e.target.value)
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">
                  Stock Type
                </label>
                <Input
                  value={rawMaterialForm.stock_type}
                  onChange={(e) =>
                    handleRawMaterialChange("stock_type", e.target.value)
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">
                  Quantity
                </label>
                <Input
                  type="number"
                  value={rawMaterialForm.quantity}
                  onChange={(e) =>
                    handleRawMaterialChange("quantity", e.target.value)
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">
                  Dimensions
                </label>
                <Input
                  value={rawMaterialForm.stock_dimensions}
                  onChange={(e) =>
                    handleRawMaterialChange("stock_dimensions", e.target.value)
                  }
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-sm font-medium text-gray-700">
                  Status
                </label>
                <Select
                  value={rawMaterialForm.status}
                  onValueChange={(value) =>
                    handleRawMaterialChange("status", value)
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="purchase request">
                      Purchase Request
                    </SelectItem>
                    <SelectItem value="purchase order">
                      Purchase Order
                    </SelectItem>
                    <SelectItem value="available">Available</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={closeRawMaterialModal}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={savingRawMaterial}>
                {savingRawMaterial
                  ? "Saving..."
                  : editingRawMaterial
                  ? "Update"
                  : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RawMaterials;