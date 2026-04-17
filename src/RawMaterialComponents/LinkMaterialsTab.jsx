import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth";
import { Button, Card, InputNumber, Spin, Typography, App, Select, Tree, Modal } from "antd";
import { 
  AppstoreOutlined,
  EyeOutlined
} from "@ant-design/icons";

const { Text } = Typography;
const { Option } = Select;

const LinkMaterialsTab = ({ rawMaterials: propRawMaterials, onDataChanged }) => {
  const { message } = App.useApp();
  // Add custom CSS to force vendor dropdown downward
  React.useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .vendor-dropdown-downward .ant-select-dropdown {
        top: auto !important;
        bottom: auto !important;
        transform: translateY(0) !important;
      }
      .vendor-dropdown-downward .ant-select-dropdown-placement-bottomLeft {
        top: auto !important;
        bottom: auto !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const [orders, setOrders] = useState([]);
  const [rawMaterials, setRawMaterials] = useState(propRawMaterials || []);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersFetched, setOrdersFetched] = useState(false);
  const [vendors, setVendors] = useState([]);
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [vendorsFetched, setVendorsFetched] = useState(false);
  
  // Add Stock mode state
  const [newStockForm, setNewStockForm] = useState({
    material_id: null,
    form_type: 'Round',
    diameter: '',
    length: '',
    breadth: '',
    height: '',
    inner_diameter: '',
    outer_diameter: '',
    quantity: 1,
    order_id: null,
    part_id: null, // Will store comma-separated IDs like "1,2,3,4"
    vendor_ids: [], // Multiple vendors for enquiry phase
    selected_vendor_id: null, // Final selected vendor for purchase
    order_status: 'enquiry'  // Default to enquiry for multiple vendor workflow
  });
  const [addStockLoading, setAddStockLoading] = useState(false);
  const [selectedOrderForStock, setSelectedOrderForStock] = useState(null);
  const [orderPartsForStock, setOrderPartsForStock] = useState([]);
  const [loadingOrderParts, setLoadingOrderParts] = useState(false);
  const [enquiryMode, setEnquiryMode] = useState(true); // Start with enquiry mode
  const [hierarchicalData, setHierarchicalData] = useState(null); // Store full hierarchical data
  const [treeData, setTreeData] = useState([]); // Tree data for the component
  const [selectedPartIds, setSelectedPartIds] = useState([]); // Selected part IDs
  const [documentPreviewModal, setDocumentPreviewModal] = useState({ visible: false, documentUrl: null, documentName: '', documents: [] }); // Document preview modal state with documents array for version selection

  const fetchingOrders = useRef(false);
  const initializedRef = useRef(false);

  const getCurrentUserId = () => {
    try {
      const stored = localStorage.getItem("user");
      if (!stored) return null;
      const user = JSON.parse(stored);
      return user?.user_id || user?.id || null;
    } catch (error) {
      // Error getting user ID
      // console.error("Error getting user ID:", error);
      return null;
    }
  };

  const formatPartDisplay = (part) => {
    let displayText = `${part.part_number} | ${part.part_name}`;
    
    // Check if extracted data exists and display all entries
    if (part.extracted_data && part.extracted_data.length > 0) {
      part.extracted_data.forEach((extracted, index) => {
        const material = extracted.material;
        const stockSize = extracted.stock_size;
        
        if (material || stockSize) {
          if (index === 0) {
            displayText += ' |';
          }
          if (material) {
            displayText += ` Material: ${material}`;
          }
          if (stockSize) {
            displayText += ` Stock Size: ${stockSize}`;
          }
        }
      });
    }
    
    return displayText;
  };

  // Handle view document click
  const handleViewDocument = (documents) => {
    if (!documents || documents.length === 0) {
      message.warning('No documents available for this part');
      return;
    }

    // Filter for 2D documents
    const partDocuments = documents.filter(
      doc => doc.document_type === '2D'
    );

    if (partDocuments.length === 0) {
      message.warning('No 2D documents available for this part');
      return;
    }

    // Open the first 2D document in the modal
    const firstDoc = partDocuments[0];
    setDocumentPreviewModal({
      visible: true,
      documentUrl: firstDoc.document_url,
      documentName: firstDoc.document_name,
      documents: partDocuments
    });
  };

  // Handle document version selection
  const handleDocumentVersionChange = (documentId) => {
    const selectedDoc = documentPreviewModal.documents.find(doc => doc.id === documentId);
    if (selectedDoc) {
      setDocumentPreviewModal({
        ...documentPreviewModal,
        documentUrl: selectedDoc.document_url,
        documentName: selectedDoc.document_name
      });
    }
  };

  // Build tree data from hierarchical structure
  const buildTreeData = (hierarchyData) => {
    const tree = [];
    
    if (!hierarchyData) return tree;

    // Process assemblies
    if (hierarchyData.assemblies && hierarchyData.assemblies.length > 0) {
      hierarchyData.assemblies.forEach((assembly, asmIndex) => {
        const assemblyNode = {
          title: `📁 ${assembly.assembly.assembly_number} - ${assembly.assembly.assembly_name}`,
          key: `assembly-${assembly.assembly.id}`,
          selectable: false,
          children: []
        };

        // Add parts under this assembly
        if (assembly.parts && assembly.parts.length > 0) {
          assembly.parts.forEach((partItem, partIndex) => {
            if (partItem.part && partItem.part.type_name !== "Out-Source") {
              const partId = partItem.part.id;
              // Check if this part has 2D documents (documents are nested under partItem.documents)
              const has2DDocuments = partItem.documents && partItem.documents.some(
                doc => doc.document_type === '2D'
              );
              
              const partNode = {
                title: (
                  <div className="flex items-center justify-between w-full">
                    <span>{formatPartDisplay({
                      ...partItem.part,
                      extracted_data: partItem.extracted_data || []
                    })}</span>
                    {has2DDocuments && (
                      <Button
                        type="link"
                        size="small"
                        icon={<EyeOutlined />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewDocument(partItem.documents);
                        }}
                        style={{ padding: '0 4px', marginLeft: '8px' }}
                      >
                        View
                      </Button>
                    )}
                  </div>
                ),
                key: `part-${partItem.part.id}`,
                partId: partItem.part.id,
                isLeaf: true,
                partData: partItem.part,
                documents: partItem.documents // Store documents in the node
              };
              assemblyNode.children.push(partNode);
            }
          });
        }

        // Add subassemblies recursively
        if (assembly.subassemblies && assembly.subassemblies.length > 0) {
          const subAssemblyNodes = processSubAssemblies(assembly.subassemblies);
          assemblyNode.children.push(...subAssemblyNodes);
        }

        // Only add assembly if it has children
        if (assemblyNode.children.length > 0) {
          tree.push(assemblyNode);
        }
      });
    }

    // Process direct parts (not in any assembly)
    if (hierarchyData.direct_parts && hierarchyData.direct_parts.length > 0) {
      const directPartsNode = {
        title: '📄 Direct Parts',
        key: 'direct-parts',
        selectable: false,
        children: []
      };

      hierarchyData.direct_parts.forEach((partItem) => {
        if (partItem.part && partItem.part.type_name !== "Out-Source") {
          const partId = partItem.part.id;
          // Check if this part has 2D documents (documents are nested under partItem.documents)
          const has2DDocuments = partItem.documents && partItem.documents.some(
            doc => doc.document_type === '2D'
          );
          
          const partNode = {
            title: (
              <div className="flex items-center justify-between w-full">
                <span>{formatPartDisplay({
                  ...partItem.part,
                  extracted_data: partItem.extracted_data || []
                })}</span>
                {has2DDocuments && (
                  <Button
                    type="link"
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleViewDocument(partItem.documents);
                    }}
                    style={{ padding: '0 4px', marginLeft: '8px' }}
                  >
                    View
                  </Button>
                )}
              </div>
            ),
            key: `part-${partItem.part.id}`,
            partId: partItem.part.id,
            isLeaf: true,
            partData: partItem.part,
            documents: partItem.documents // Store documents in the node
          };
          directPartsNode.children.push(partNode);
        }
      });

      if (directPartsNode.children.length > 0) {
        tree.push(directPartsNode);
      }
    }

    return tree;
  };

  // Process subassemblies recursively
  const processSubAssemblies = (subassemblies) => {
    const nodes = [];
    
    subassemblies.forEach((subAsm) => {
      const subNode = {
        title: `📂 ${subAsm.assembly.assembly_number} - ${subAsm.assembly.assembly_name}`,
        key: `subassembly-${subAsm.assembly.id}`,
        selectable: false,
        children: []
      };

      // Add parts under this subassembly
      if (subAsm.parts && subAsm.parts.length > 0) {
        subAsm.parts.forEach((partItem) => {
          if (partItem.part && partItem.part.type_name !== "Out-Source") {
            const partId = partItem.part.id;
            // Check if this part has 2D documents (documents are nested under partItem.documents)
            const has2DDocuments = partItem.documents && partItem.documents.some(
              doc => doc.document_type === '2D'
            );
            
            const partNode = {
              title: (
                <div className="flex items-center justify-between w-full">
                  <span>{formatPartDisplay({
                    ...partItem.part,
                    extracted_data: partItem.extracted_data || []
                  })}</span>
                  {has2DDocuments && (
                    <Button
                      type="link"
                      size="small"
                      icon={<EyeOutlined />}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewDocument(partItem.documents);
                      }}
                      style={{ padding: '0 4px', marginLeft: '8px' }}
                    >
                      View
                    </Button>
                  )}
                </div>
              ),
              key: `part-${partItem.part.id}`,
              partId: partItem.part.id,
              isLeaf: true,
              partData: partItem.part,
              documents: partItem.documents // Store documents in the node
            };
            subNode.children.push(partNode);
          }
        });
      }

      // Recursively process nested subassemblies
      if (subAsm.subassemblies && subAsm.subassemblies.length > 0) {
        const nestedNodes = processSubAssemblies(subAsm.subassemblies);
        subNode.children.push(...nestedNodes);
      }

      if (subNode.children.length > 0) {
        nodes.push(subNode);
      }
    });

    return nodes;
  };

  // Handle tree selection change
  const handleTreeCheck = (checkedKeys, info) => {
    // Extract part IDs from checked keys (only leaf nodes with part- prefix)
    const partIds = checkedKeys
      .filter(key => key.startsWith('part-'))
      .map(key => parseInt(key.replace('part-', '')));
    
    setSelectedPartIds(partIds);
    setNewStockForm(prev => ({ 
      ...prev, 
      part_id: partIds.length > 0 ? partIds.join(',') : null 
    }));
  };

  const fetchOrders = async () => {
    if (ordersFetched) return; // Don't fetch if already fetched
    if (fetchingOrders.current) return;
    fetchingOrders.current = true;
    setOrdersLoading(true);
    try {
      const uid = getCurrentUserId();
      const response = await axios.get(`${API_BASE_URL}/orders/`, {
        params: uid != null ? { admin_id: uid } : undefined,
      });
      // Filter out orders that already have raw materials linked
      const availableOrders = (response.data || []).filter(order => !order.has_raw_materials);
      setOrders(availableOrders);
      setOrdersFetched(true);
    } catch (error) {
      // Error fetching orders
      // console.error("Error fetching orders:", error);
      setOrders([]);
    } finally {
      setOrdersLoading(false);
      fetchingOrders.current = false;
    }
  };

  const fetchVendors = async () => {
    if (vendorsFetched) return; // Don't fetch if already fetched
    setVendorsLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/rawmaterials/vendors`);
      setVendors(response.data || []);
      setVendorsFetched(true);
    } catch (error) {
      // Error fetching vendors
      // console.error("Error fetching vendors:", error);
      setVendors([]);
    } finally {
      setVendorsLoading(false);
    }
  };

  // New functions for Add Stock mode
  const handleOrderSelectionForStock = async (orderId) => {
    setSelectedOrderForStock(orderId);
    setNewStockForm(prev => ({ ...prev, order_id: orderId, part_id: null }));
    
    if (!orderId) {
      setOrderPartsForStock([]);
      return;
    }

    setLoadingOrderParts(true);
    try {
      // Use existing order data instead of making redundant API call
      const existingOrder = orders.find(order => order.id === orderId);
      
      if (!existingOrder) {
        message.error('Order not found in loaded data');
        setOrderPartsForStock([]);
        return;
      }

      const productId = existingOrder.product_id;
      
      if (!productId) {
        message.error('Order has no product associated');
        setOrderPartsForStock([]);
        return;
      }

      // Only make one API call for product hierarchy
      const hierarchyResponse = await axios.get(`${API_BASE_URL}/products/${productId}/hierarchical`);
      if (hierarchyResponse.data) {
        // Store full hierarchical data
        setHierarchicalData(hierarchyResponse.data);
        
        // Build tree data for the Tree component
        const tree = buildTreeData(hierarchyResponse.data);
        setTreeData(tree);
        
        // Extract all parts for quantities section
        const allParts = [];
        const extractParts = (items) => {
          items.forEach(item => {
            // Handle direct parts (have a 'part' property)
            if (item.part && item.part.type_name !== "Out-Source") {
              const partWithExtractedData = {
                ...item.part,
                extracted_data: item.extracted_data || []
              };
              allParts.push(partWithExtractedData);
            }
            // Handle subassemblies (have an 'assembly' property and 'parts' array)
            if (item.assembly && item.parts && item.parts.length > 0) {
              extractParts(item.parts);
            }
            // Recursively process nested subassemblies
            if (item.subassemblies && item.subassemblies.length > 0) {
              extractParts(item.subassemblies);
            }
          });
        };
        
        // Extract parts from assemblies and direct parts
        if (hierarchyResponse.data.assemblies) {
          hierarchyResponse.data.assemblies.forEach(assembly => {
            // Extract parts directly under the assembly
            if (assembly.parts && assembly.parts.length > 0) {
              extractParts(assembly.parts);
            }
            // Extract parts from subassemblies
            if (assembly.subassemblies && assembly.subassemblies.length > 0) {
              extractParts(assembly.subassemblies);
            }
          });
        }
        
        if (hierarchyResponse.data.direct_parts) {
          extractParts(hierarchyResponse.data.direct_parts);
        }
        
        setOrderPartsForStock(allParts);
      }
    } catch (error) {
      // Error loading order parts
      // console.error('Error loading order parts:', error);
      message.error('Failed to load order parts');
      setOrderPartsForStock([]);
    } finally {
      setLoadingOrderParts(false);
    }
  };

  const handleVendorEnquiry = async () => {
    if (newStockForm.vendor_ids.length === 0) {
      message.error('Please select at least one vendor for enquiry');
      return;
    }

    if (!newStockForm.order_id) {
      message.error('Please select an order for enquiry');
      return;
    }

    if (!newStockForm.material_id) {
      message.error('Please select a material for enquiry');
      return;
    }

    // Validate that total quantity >= sum of all part quantities
    if (newStockForm.part_id) {
      const partIds = newStockForm.part_id.split(',');
      let totalPartQuantity = 0;
      
      for (const partId of partIds) {
        const partQty = newStockForm[`part_quantity_${partId}`] || 1;
        totalPartQuantity += parseFloat(partQty) || 0;
      }
      
      if (totalPartQuantity > newStockForm.quantity) {
        message.error(`Total quantity (${newStockForm.quantity}) must be >= sum of part quantities (${totalPartQuantity})`);
        return;
      }
    }

    setAddStockLoading(true);
    try {
      const userId = getCurrentUserId();
      
      // Create stock record with enquiry status and multiple vendors
      const stockData = {
        material_id: newStockForm.material_id,
        form_type: newStockForm.form_type,
        diameter: newStockForm.diameter,
        length: newStockForm.length,
        breadth: newStockForm.breadth,
        height: newStockForm.height,
        inner_diameter: newStockForm.inner_diameter,
        outer_diameter: newStockForm.outer_diameter,
        quantity: newStockForm.quantity,
        order_id: newStockForm.order_id,
        part_id: newStockForm.part_id,
        vendor_id: newStockForm.vendor_ids.join(','), // Store as comma-separated
        user_id: userId,
        source_type: 'order',
        source_order_id: newStockForm.order_id,
        order_status: 'enquiry' // Default to enquiry
      };

      // Remove empty fields
      Object.keys(stockData).forEach(key => {
        if (stockData[key] === '' || stockData[key] === null) {
          if (!(key === 'source_order_id' && stockData.source_type === 'order')) {
            delete stockData[key];
          }
        }
      });
      delete stockData.order_id; // Remove original order_id

      const response = await axios.post(`${API_BASE_URL}/rawmaterials/stock/`, stockData);
      
      if (response.data) {
        const createdStock = response.data;
        
        // Automatically allocate materials to parts if parts are selected
        if (newStockForm.part_id && newStockForm.part_id.split(',').length > 0) {
          const partIds = newStockForm.part_id.split(',');
          
          // Prepare bulk allocation data
          const allocationData = partIds.map(partId => ({
            part_id: parseInt(partId),
            stock_id: createdStock.id,
            required_quantity: newStockForm[`part_quantity_${partId}`] || 1,
            user_id: userId
          }));
          
          try {
            const bulkAllocationResponse = await axios.post(
              `${API_BASE_URL}/rawmaterials/tracking/allocate/bulk`,
              allocationData
            );
            
            if (bulkAllocationResponse.data.success) {
              message.success(`Enquiry sent to ${newStockForm.vendor_ids.length} vendor(s) and materials allocated to ${bulkAllocationResponse.data.successful_allocations} parts!`);
            } else {
              message.warning(`Enquiry sent to ${newStockForm.vendor_ids.length} vendor(s) but ${bulkAllocationResponse.data.failed_allocations} allocations failed. Please allocate manually.`);
            }
          } catch (allocationError) {
            message.warning(`Enquiry sent to ${newStockForm.vendor_ids.length} vendor(s) but allocation failed. Please allocate manually.`);
          }
        } else {
          message.success(`Enquiry sent to ${newStockForm.vendor_ids.length} vendor(s) and stock created!`);
        }
        
        // Reset form
        setNewStockForm({
          material_id: null,
          form_type: 'Round',
          diameter: '',
          length: '',
          breadth: '',
          height: '',
          inner_diameter: '',
          outer_diameter: '',
          quantity: 1,
          order_id: null,
          part_id: null, // This will be null, not empty string
          vendor_ids: [], // Multiple vendors for enquiry phase
          selected_vendor_id: null, // Final selected vendor for purchase
          order_status: 'enquiry'  // Default to enquiry for multiple vendor workflow
        });
        setEnquiryMode(true);
        setSelectedOrderForStock(null);
        setOrderPartsForStock([]);
        
        // Refresh raw materials list
        if (onDataChanged) {
          onDataChanged();
        }
      }
    } catch (error) {
      message.error('Failed to send enquiry: ' + (error.response?.data?.detail || error.message));
    } finally {
      setAddStockLoading(false);
    }
  };

  const handleAddStock = async () => {
    const userId = getCurrentUserId();
    if (!userId) {
      message.error('User not authenticated');
      return;
    }

    // In enquiry mode, call handleVendorEnquiry instead
    if (enquiryMode) {
      if (!newStockForm.order_id) {
        message.error('Please select an order for enquiry');
        return;
      }
      if (newStockForm.vendor_ids.length === 0) {
        message.error('Please select at least one vendor for enquiry');
        return;
      }
      if (!newStockForm.material_id) {
        message.error('Please select a material for enquiry');
        return;
      }
      await handleVendorEnquiry();
      return;
    }

    // For actual stock creation, require all details
    if (!newStockForm.material_id) {
      message.error('Please select a material');
      return;
    }

    if (!newStockForm.order_id) {
      message.error('Please select an order - this tab is for order-linked stock only');
      return;
    }

    if (!newStockForm.quantity || newStockForm.quantity <= 0) {
      message.error('Please enter a valid quantity');
      return;
    }

    // Validate that total quantity >= sum of all part quantities
    if (newStockForm.part_id) {
      const partIds = newStockForm.part_id.split(',');
      let totalPartQuantity = 0;
      
      for (const partId of partIds) {
        const partQty = newStockForm[`part_quantity_${partId}`] || 1;
        totalPartQuantity += parseFloat(partQty) || 0;
      }
      
      if (totalPartQuantity > newStockForm.quantity) {
        message.error(`Total quantity (${newStockForm.quantity}) must be >= sum of part quantities (${totalPartQuantity})`);
        return;
      }
    }

    setAddStockLoading(true);
    try {
      const stockData = {
        ...newStockForm,
        user_id: userId,
        source_type: 'order' // Always order type in this tab
      };

      // Map order_id to source_order_id for backend
      stockData.source_order_id = newStockForm.order_id;
      
      // Handle vendor data correctly
      if (newStockForm.vendor_ids && newStockForm.vendor_ids.length > 0) {
        // Always store comma-separated vendor IDs in vendor_id field for enquiry tracking
        stockData.vendor_id = newStockForm.vendor_ids.join(',');
        stockData.received_vendor_id = null; // Default to null for enquiry
      }
      
      // Use selected_vendor_id for received_vendor_id if in purchase mode (not enquiry)
      if (newStockForm.selected_vendor_id && !enquiryMode) {
        stockData.received_vendor_id = newStockForm.selected_vendor_id;
        // Keep vendor_id as comma-separated string to preserve original enquiry vendors
        // Don't set vendor_id to null - keep the enquiry vendor list
      }
      
      // Remove vendor_ids and selected_vendor_id from final payload
      delete stockData.vendor_ids;
      delete stockData.selected_vendor_id;

      // Remove empty fields but keep source_order_id if source_type is 'order'
      Object.keys(stockData).forEach(key => {
        if (stockData[key] === '' || stockData[key] === null) {
          // Don't remove source_order_id if source_type is 'order'
          if (!(key === 'source_order_id' && stockData.source_type === 'order')) {
            delete stockData[key];
          }
        }
      });

      // Remove the original order_id field as backend expects source_order_id
      delete stockData.order_id;

      const response = await axios.post(`${API_BASE_URL}/rawmaterials/stock/`, stockData);
      
      if (response.data) {
        const createdStock = response.data;
        
        // Automatically allocate materials to parts if parts are selected
        if (newStockForm.part_id && newStockForm.part_id.split(',').length > 0) {
          const partIds = newStockForm.part_id.split(',');
          
          // Prepare bulk allocation data
          const allocationData = partIds.map(partId => ({
            part_id: parseInt(partId),
            stock_id: createdStock.id,
            required_quantity: newStockForm[`part_quantity_${partId}`] || 1,
            user_id: userId
          }));
          
          try {
            const bulkAllocationResponse = await axios.post(
              `${API_BASE_URL}/rawmaterials/tracking/allocate/bulk`,
              allocationData
            );
            
            if (bulkAllocationResponse.data.success) {
              message.success(`Stock created and materials allocated to ${bulkAllocationResponse.data.successful_allocations} parts!`);
            } else {
              message.warning(`Stock created but ${bulkAllocationResponse.data.failed_allocations} allocations failed. Please allocate manually.`);
            }
          } catch (allocationError) {
            message.warning(`Stock created but allocation failed. Please allocate manually.`);
          }
        } else {
          message.success('Stock created successfully!');
        }
        // Reset form
        setNewStockForm({
          material_id: null,
          form_type: 'Round',
          diameter: '',
          length: '',
          breadth: '',
          height: '',
          inner_diameter: '',
          outer_diameter: '',
          quantity: 1,
          order_id: null,
          part_id: null, // This will be null, not empty string
          vendor_ids: [], // Multiple vendors for enquiry phase
          selected_vendor_id: null, // Final selected vendor for purchase
          order_status: 'enquiry'  // Default to enquiry for multiple vendor workflow
        });
        setEnquiryMode(true);
        setSelectedOrderForStock(null);
        setOrderPartsForStock([]);
        
        // Refresh raw materials list
        if (onDataChanged) {
          onDataChanged();
        }
      }
    } catch (error) {
      // Error adding stock
      // console.error('Error adding stock:', error);
      message.error('Failed to add stock: ' + (error.response?.data?.detail || error.message));
    } finally {
      setAddStockLoading(false);
    }
  };

  // Update rawMaterials when prop changes
  useEffect(() => {
    setRawMaterials(propRawMaterials || []);
  }, [propRawMaterials]);

  return (
    <div className="mt-4">
      {/* Add Stock Form */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <AppstoreOutlined className="text-blue-600" />
            <span>Add Order-Linked Stock</span>
          </div>
        }
        className="shadow-sm rounded-lg border border-gray-100"
      >
        <div className="space-y-4">
          {/* First Row: Material, Form Type, Order */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Material <span className="text-red-500">*</span></label>
              <Select
                style={{ width: '100%' }}
                placeholder="Select Material"
                value={newStockForm.material_id}
                onChange={(value) => setNewStockForm(prev => ({ ...prev, material_id: value }))}
                showSearch
                filterOption={(input, option) =>
                  option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
                }
              >
                {rawMaterials.map(material => (
                  <Option key={material.id} value={material.id}>
                    {material.material_name}
                  </Option>
                ))}
              </Select>
              {newStockForm.material_id && (
                <div className="mt-1 text-xs text-gray-600">
                  Cost: {rawMaterials.find(m => m.id === newStockForm.material_id)?.cost_per_kg || 'N/A'} per kg
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Form Type <span className="text-red-500">*</span></label>
              <Select
                style={{ width: '100%' }}
                value={newStockForm.form_type}
                onChange={(value) => setNewStockForm(prev => ({ ...prev, form_type: value }))}
              >
                <Option value="Round">Round</Option>
                <Option value="Square">Square</Option>
                <Option value="Pipe">Pipe</Option>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Order <span className="text-red-500">*</span></label>
              <Select
                style={{ width: '100%' }}
                placeholder="Select Order (Required)"
                value={newStockForm.order_id}
                onChange={handleOrderSelectionForStock}
                onOpenChange={(open) => {
                  if (open) fetchOrders();
                }}
                showSearch
                filterOption={(input, option) =>
                  option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
                }
              >
                {orders.map(order => (
                  <Option key={order.id} value={order.id}>
                    {order.sale_order_number}
                  </Option>
                ))}
              </Select>
            </div>
          </div>

          {/* Second Row: Parts Hierarchy and Quantities */}
          {newStockForm.order_id && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Parts Hierarchy - Left Side */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Parts Hierarchy
                </label>
                <div className="border border-gray-300 rounded-md p-2 max-h-80 overflow-y-auto bg-white">
                  {loadingOrderParts ? (
                    <div className="flex justify-center py-4">
                      <Spin size="small" />
                    </div>
                  ) : treeData.length > 0 ? (
                    <Tree
                      checkable
                      defaultExpandAll
                      onCheck={handleTreeCheck}
                      checkedKeys={selectedPartIds.map(id => `part-${id}`)}
                      treeData={treeData}
                      selectable={false}
                      showLine={{ showLeafIcon: false }}
                      showIcon={false}
                    />
                  ) : (
                    <div className="text-gray-500 text-center py-4">
                      No parts available for this order
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  💡 Select an assembly to auto-select all its parts. Subassemblies are shown nested.
                </p>
              </div>

              {/* Part Quantities - Right Side */}
              {newStockForm.part_id && newStockForm.part_id.split(',').length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Part Required Quantities</label>
                  <div className="border border-gray-300 rounded-md p-2 max-h-80 overflow-y-auto bg-white">
                    <div className="space-y-2">
                      {orderPartsForStock
                        .filter(part => newStockForm.part_id.split(',').includes(part.id.toString()))
                        .map(part => (
                          <div key={part.id} className="flex items-center space-x-2">
                            <span className="text-sm flex-1">{part.part_number} - {part.part_name}</span>
                            <InputNumber
                              placeholder="Qty"
                              min={0}
                              step={1}
                              precision={0}
                              style={{ width: '100px' }}
                              value={newStockForm[`part_quantity_${part.id}`] || 1}
                              onChange={(value) => {
                                // Only allow positive integers
                                if (value === null || value === undefined || value === '') {
                                  setNewStockForm(prev => ({ 
                                    ...prev, 
                                    [`part_quantity_${part.id}`]: 1 
                                  }));
                                } else if (Number.isInteger(value) && value >= 0) {
                                  setNewStockForm(prev => ({ 
                                    ...prev, 
                                    [`part_quantity_${part.id}`]: value 
                                  }));
                                }
                              }}
                              onBlur={(e) => {
                                // Ensure integer value on blur
                                const value = parseInt(e.target.value);
                                if (isNaN(value) || value < 0) {
                                  setNewStockForm(prev => ({ 
                                    ...prev, 
                                    [`part_quantity_${part.id}`]: 1 
                                  }));
                                } else {
                                  setNewStockForm(prev => ({ 
                                    ...prev, 
                                    [`part_quantity_${part.id}`]: value 
                                  }));
                                }
                              }}
                              onKeyPress={(e) => {
                                // Block all non-digit keys except backspace, delete, tab, enter
                                const char = String.fromCharCode(e.which);
                                if (!/[0-9]/.test(char) && 
                                    e.which !== 8 && // backspace
                                    e.which !== 46 && // delete
                                    e.which !== 9 && // tab
                                    e.which !== 13 && // enter
                                    e.which !== 37 && // left arrow
                                    e.which !== 39 && // right arrow
                                    e.which !== 36 && // home
                                    e.which !== 35) { // end
                                  e.preventDefault();
                                }
                              }}
                              onKeyDown={(e) => {
                                // Block decimal point and other special characters
                                if (e.key === '.' || e.key === ',' || e.key === '-' || e.key === '+') {
                                  e.preventDefault();
                                }
                              }}
                              parser={(value) => {
                                // Parse only integers, reject decimals and special chars
                                const parsed = parseInt(value, 10);
                                return isNaN(parsed) ? null : parsed;
                              }}
                              formatter={(value) => {
                                // Display only integers
                                return value ? value.toString() : '';
                              }}
                            />
                          </div>
                        ))
                      }
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Third Row: Diameter and Length */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {newStockForm.form_type === 'Round' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Diameter (mm) <span className="text-red-500">*</span></label>
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder="Diameter"
                  value={newStockForm.diameter}
                  onChange={(value) => {
                    // Only allow valid numbers, reject everything else
                    if (value === null || value === undefined || value === '') {
                      setNewStockForm(prev => ({ ...prev, diameter: '' }));
                    } else if (!isNaN(value) && value >= 0) {
                      setNewStockForm(prev => ({ ...prev, diameter: value }));
                    } else {
                      // Reject invalid values by setting back to empty or last valid value
                      setNewStockForm(prev => ({ ...prev, diameter: '' }));
                    }
                  }}
                  onBeforeInput={(e) => {
                    // Block input before it reaches the field
                    const char = e.data;
                    if (char && !/[0-9.]/.test(char)) {
                      e.preventDefault();
                      return false;
                    }
                  }}
                  onKeyPress={(e) => {
                    // Block all non-digit and non-decimal keys except navigation keys
                    const char = String.fromCharCode(e.which);
                    if (!/[0-9.]/.test(char) && 
                        e.which !== 8 && // backspace
                        e.which !== 46 && // delete
                        e.which !== 9 && // tab
                        e.which !== 13 && // enter
                        e.which !== 37 && // left arrow
                        e.which !== 39 && // right arrow
                        e.which !== 36 && // home
                        e.which !== 35) { // end
                      e.preventDefault();
                      return false;
                    }
                  }}
                  onKeyDown={(e) => {
                    // Block multiple decimal points and special characters
                    const value = e.target.value;
                    if (e.key === '.' && value && value.includes('.')) {
                      e.preventDefault();
                      return false;
                    }
                    if (e.key === ',' || e.key === '-' || e.key === '+') {
                      e.preventDefault();
                      return false;
                    }
                  }}
                  onInput={(e) => {
                    // Immediate cleanup of any invalid characters
                    if (!e.target || !e.target.value) return;
                    const value = e.target.value;
                    const validValue = value.replace(/[^0-9.]/g, '');
                    if (value !== validValue) {
                      e.target.value = validValue;
                      setNewStockForm(prev => ({ ...prev, diameter: validValue }));
                    }
                  }}
                  onPaste={(e) => {
                    // Prevent paste of invalid content
                    e.preventDefault();
                    const pasteData = e.clipboardData.getData('text');
                    const cleanData = pasteData.replace(/[^0-9.]/g, '');
                    if (cleanData) {
                      const currentValue = e.target.value || '';
                      const newValue = currentValue + cleanData;
                      setNewStockForm(prev => ({ ...prev, diameter: newValue }));
                    }
                    return false;
                  }}
                  onBlur={(e) => {
                    // Clean up any invalid characters on blur
                    const value = e.target.value;
                    const cleanValue = value.replace(/[^0-9.]/g, '');
                    if (value !== cleanValue) {
                      setNewStockForm(prev => ({ ...prev, diameter: cleanValue }));
                    }
                  }}
                  min={0}
                  step={0.01}
                  parser={(value) => {
                    // Parse only numbers and decimal
                    const cleanValue = value.replace(/[^0-9.]/g, '');
                    const parsed = parseFloat(cleanValue);
                    return isNaN(parsed) ? null : parsed;
                  }}
                  formatter={(value) => {
                    // Display only valid numbers
                    return value !== null && value !== undefined ? value.toString() : '';
                  }}
                />
              </div>
            )}

            {newStockForm.form_type === 'Square' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Breadth (mm) <span className="text-red-500">*</span></label>
                  <InputNumber
                    style={{ width: '100%' }}
                    placeholder="Breadth"
                    value={newStockForm.breadth}
                    onChange={(value) => {
                      // Only allow valid numbers, reject everything else
                      if (value === null || value === undefined || value === '') {
                        setNewStockForm(prev => ({ ...prev, breadth: '' }));
                      } else if (!isNaN(value) && value >= 0) {
                        setNewStockForm(prev => ({ ...prev, breadth: value }));
                      } else {
                        // Reject invalid values by setting back to empty or last valid value
                        setNewStockForm(prev => ({ ...prev, breadth: '' }));
                      }
                    }}
                    onBeforeInput={(e) => {
                      // Block input before it reaches the field
                      const char = e.data;
                      if (char && !/[0-9.]/.test(char)) {
                        e.preventDefault();
                        return false;
                      }
                    }}
                    onKeyPress={(e) => {
                      // Block all non-digit and non-decimal keys except navigation keys
                      const char = String.fromCharCode(e.which);
                      if (!/[0-9.]/.test(char) && 
                          e.which !== 8 && // backspace
                          e.which !== 46 && // delete
                          e.which !== 9 && // tab
                          e.which !== 13 && // enter
                          e.which !== 37 && // left arrow
                          e.which !== 39 && // right arrow
                          e.which !== 36 && // home
                          e.which !== 35) { // end
                        e.preventDefault();
                        return false;
                      }
                    }}
                    onKeyDown={(e) => {
                      // Block multiple decimal points and special characters
                      const value = e.target.value;
                      if (e.key === '.' && value && value.includes('.')) {
                        e.preventDefault();
                        return false;
                      }
                      if (e.key === ',' || e.key === '-' || e.key === '+') {
                        e.preventDefault();
                        return false;
                      }
                    }}
                    onInput={(e) => {
                      // Immediate cleanup of any invalid characters
                      const value = e.target.value;
                      const validValue = value.replace(/[^0-9.]/g, '');
                      if (value !== validValue) {
                        e.target.value = validValue;
                        setNewStockForm(prev => ({ ...prev, breadth: validValue }));
                      }
                    }}
                    onPaste={(e) => {
                      // Prevent paste of invalid content
                      e.preventDefault();
                      const pasteData = e.clipboardData.getData('text');
                      const cleanData = pasteData.replace(/[^0-9.]/g, '');
                      if (cleanData) {
                        const currentValue = e.target.value || '';
                        const newValue = currentValue + cleanData;
                        setNewStockForm(prev => ({ ...prev, breadth: newValue }));
                      }
                      return false;
                    }}
                    onBlur={(e) => {
                      // Clean up any invalid characters on blur
                      const value = e.target.value;
                      const cleanValue = value.replace(/[^0-9.]/g, '');
                      if (value !== cleanValue) {
                        setNewStockForm(prev => ({ ...prev, breadth: cleanValue }));
                      }
                    }}
                    min={0}
                    step={0.01}
                    parser={(value) => {
                      // Parse only numbers and decimal
                      const cleanValue = value.replace(/[^0-9.]/g, '');
                      const parsed = parseFloat(cleanValue);
                      return isNaN(parsed) ? null : parsed;
                    }}
                    formatter={(value) => {
                      // Display only valid numbers
                      return value !== null && value !== undefined ? value.toString() : '';
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Height (mm) <span className="text-red-500">*</span></label>
                  <InputNumber
                    style={{ width: '100%' }}
                    placeholder="Height"
                    value={newStockForm.height}
                    onChange={(value) => {
                      // Only allow valid numbers, reject everything else
                      if (value === null || value === undefined || value === '') {
                        setNewStockForm(prev => ({ ...prev, height: '' }));
                      } else if (!isNaN(value) && value >= 0) {
                        setNewStockForm(prev => ({ ...prev, height: value }));
                      } else {
                        // Reject invalid values by setting back to empty or last valid value
                        setNewStockForm(prev => ({ ...prev, height: '' }));
                      }
                    }}
                    onBeforeInput={(e) => {
                      // Block input before it reaches the field
                      const char = e.data;
                      if (char && !/[0-9.]/.test(char)) {
                        e.preventDefault();
                        return false;
                      }
                    }}
                    onKeyPress={(e) => {
                      // Block all non-digit and non-decimal keys except navigation keys
                      const char = String.fromCharCode(e.which);
                      if (!/[0-9.]/.test(char) && 
                          e.which !== 8 && // backspace
                          e.which !== 46 && // delete
                          e.which !== 9 && // tab
                          e.which !== 13 && // enter
                          e.which !== 37 && // left arrow
                          e.which !== 39 && // right arrow
                          e.which !== 36 && // home
                          e.which !== 35) { // end
                        e.preventDefault();
                        return false;
                      }
                    }}
                    onKeyDown={(e) => {
                      // Block multiple decimal points and special characters
                      const value = e.target.value;
                      if (e.key === '.' && value && value.includes('.')) {
                        e.preventDefault();
                        return false;
                      }
                      if (e.key === ',' || e.key === '-' || e.key === '+') {
                        e.preventDefault();
                        return false;
                      }
                    }}
                    onInput={(e) => {
                      // Immediate cleanup of any invalid characters
                      const value = e.target.value;
                      const validValue = value.replace(/[^0-9.]/g, '');
                      if (value !== validValue) {
                        e.target.value = validValue;
                        setNewStockForm(prev => ({ ...prev, height: validValue }));
                      }
                    }}
                    onPaste={(e) => {
                      // Prevent paste of invalid content
                      e.preventDefault();
                      const pasteData = e.clipboardData.getData('text');
                      const cleanData = pasteData.replace(/[^0-9.]/g, '');
                      if (cleanData) {
                        const currentValue = e.target.value || '';
                        const newValue = currentValue + cleanData;
                        setNewStockForm(prev => ({ ...prev, height: newValue }));
                      }
                      return false;
                    }}
                    onBlur={(e) => {
                      // Clean up any invalid characters on blur
                      const value = e.target.value;
                      const cleanValue = value.replace(/[^0-9.]/g, '');
                      if (value !== cleanValue) {
                        setNewStockForm(prev => ({ ...prev, height: cleanValue }));
                      }
                    }}
                    min={0}
                    step={0.01}
                    parser={(value) => {
                      // Parse only numbers and decimal
                      const cleanValue = value.replace(/[^0-9.]/g, '');
                      const parsed = parseFloat(cleanValue);
                      return isNaN(parsed) ? null : parsed;
                    }}
                    formatter={(value) => {
                      // Display only valid numbers
                      return value !== null && value !== undefined ? value.toString() : '';
                    }}
                  />
                </div>
              </>
            )}

            {newStockForm.form_type === 'Pipe' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Outer Diameter (mm) <span className="text-red-500">*</span></label>
                  <InputNumber
                    style={{ width: '100%' }}
                    placeholder="Outer Diameter"
                    value={newStockForm.outer_diameter}
                    onChange={(value) => {
                      // Only allow valid numbers, reject everything else
                      if (value === null || value === undefined || value === '') {
                        setNewStockForm(prev => ({ ...prev, outer_diameter: '' }));
                      } else if (!isNaN(value) && value >= 0) {
                        setNewStockForm(prev => ({ ...prev, outer_diameter: value }));
                      } else {
                        // Reject invalid values by setting back to empty or last valid value
                        setNewStockForm(prev => ({ ...prev, outer_diameter: '' }));
                      }
                    }}
                    onBeforeInput={(e) => {
                      // Block input before it reaches the field
                      const char = e.data;
                      if (char && !/[0-9.]/.test(char)) {
                        e.preventDefault();
                        return false;
                      }
                    }}
                    onKeyPress={(e) => {
                      // Block all non-digit and non-decimal keys except navigation keys
                      const char = String.fromCharCode(e.which);
                      if (!/[0-9.]/.test(char) && 
                          e.which !== 8 && // backspace
                          e.which !== 46 && // delete
                          e.which !== 9 && // tab
                          e.which !== 13 && // enter
                          e.which !== 37 && // left arrow
                          e.which !== 39 && // right arrow
                          e.which !== 36 && // home
                          e.which !== 35) { // end
                        e.preventDefault();
                        return false;
                      }
                    }}
                    onKeyDown={(e) => {
                      // Block multiple decimal points and special characters
                      const value = e.target.value;
                      if (e.key === '.' && value && value.includes('.')) {
                        e.preventDefault();
                        return false;
                      }
                      if (e.key === ',' || e.key === '-' || e.key === '+') {
                        e.preventDefault();
                        return false;
                      }
                    }}
                    onInput={(e) => {
                      // Immediate cleanup of any invalid characters
                      const value = e.target.value;
                      const validValue = value.replace(/[^0-9.]/g, '');
                      if (value !== validValue) {
                        e.target.value = validValue;
                        setNewStockForm(prev => ({ ...prev, outer_diameter: validValue }));
                      }
                    }}
                    onPaste={(e) => {
                      // Prevent paste of invalid content
                      e.preventDefault();
                      const pasteData = e.clipboardData.getData('text');
                      const cleanData = pasteData.replace(/[^0-9.]/g, '');
                      if (cleanData) {
                        const currentValue = e.target.value || '';
                        const newValue = currentValue + cleanData;
                        setNewStockForm(prev => ({ ...prev, outer_diameter: newValue }));
                      }
                      return false;
                    }}
                    onBlur={(e) => {
                      // Clean up any invalid characters on blur
                      const value = e.target.value;
                      const cleanValue = value.replace(/[^0-9.]/g, '');
                      if (value !== cleanValue) {
                        setNewStockForm(prev => ({ ...prev, outer_diameter: cleanValue }));
                      }
                    }}
                    min={0}
                    step={0.01}
                    parser={(value) => {
                      // Parse only numbers and decimal
                      const cleanValue = value.replace(/[^0-9.]/g, '');
                      const parsed = parseFloat(cleanValue);
                      return isNaN(parsed) ? null : parsed;
                    }}
                    formatter={(value) => {
                      // Display only valid numbers
                      return value !== null && value !== undefined ? value.toString() : '';
                    }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Inner Diameter (mm) <span className="text-red-500">*</span></label>
                  <InputNumber
                    style={{ width: '100%' }}
                    placeholder="Inner Diameter"
                    value={newStockForm.inner_diameter}
                    onChange={(value) => {
                      // Only allow valid numbers, reject everything else
                      if (value === null || value === undefined || value === '') {
                        setNewStockForm(prev => ({ ...prev, inner_diameter: '' }));
                      } else if (!isNaN(value) && value >= 0) {
                        setNewStockForm(prev => ({ ...prev, inner_diameter: value }));
                      } else {
                        // Reject invalid values by setting back to empty or last valid value
                        setNewStockForm(prev => ({ ...prev, inner_diameter: '' }));
                      }
                    }}
                    onBeforeInput={(e) => {
                      // Block input before it reaches the field
                      const char = e.data;
                      if (char && !/[0-9.]/.test(char)) {
                        e.preventDefault();
                        return false;
                      }
                    }}
                    onKeyPress={(e) => {
                      // Block all non-digit and non-decimal keys except navigation keys
                      const char = String.fromCharCode(e.which);
                      if (!/[0-9.]/.test(char) && 
                          e.which !== 8 && // backspace
                          e.which !== 46 && // delete
                          e.which !== 9 && // tab
                          e.which !== 13 && // enter
                          e.which !== 37 && // left arrow
                          e.which !== 39 && // right arrow
                          e.which !== 36 && // home
                          e.which !== 35) { // end
                        e.preventDefault();
                        return false;
                      }
                    }}
                    onKeyDown={(e) => {
                      // Block multiple decimal points and special characters
                      const value = e.target.value;
                      if (e.key === '.' && value && value.includes('.')) {
                        e.preventDefault();
                        return false;
                      }
                      if (e.key === ',' || e.key === '-' || e.key === '+') {
                        e.preventDefault();
                        return false;
                      }
                    }}
                    onInput={(e) => {
                      // Immediate cleanup of any invalid characters
                      const value = e.target.value;
                      const validValue = value.replace(/[^0-9.]/g, '');
                      if (value !== validValue) {
                        e.target.value = validValue;
                        setNewStockForm(prev => ({ ...prev, inner_diameter: validValue }));
                      }
                    }}
                    onPaste={(e) => {
                      // Prevent paste of invalid content
                      e.preventDefault();
                      const pasteData = e.clipboardData.getData('text');
                      const cleanData = pasteData.replace(/[^0-9.]/g, '');
                      if (cleanData) {
                        const currentValue = e.target.value || '';
                        const newValue = currentValue + cleanData;
                        setNewStockForm(prev => ({ ...prev, inner_diameter: newValue }));
                      }
                      return false;
                    }}
                    onBlur={(e) => {
                      // Clean up any invalid characters on blur
                      const value = e.target.value;
                      const cleanValue = value.replace(/[^0-9.]/g, '');
                      if (value !== cleanValue) {
                        setNewStockForm(prev => ({ ...prev, inner_diameter: cleanValue }));
                      }
                    }}
                    min={0}
                    step={0.01}
                    parser={(value) => {
                      // Parse only numbers and decimal
                      const cleanValue = value.replace(/[^0-9.]/g, '');
                      const parsed = parseFloat(cleanValue);
                      return isNaN(parsed) ? null : parsed;
                    }}
                    formatter={(value) => {
                      // Display only valid numbers
                      return value !== null && value !== undefined ? value.toString() : '';
                    }}
                  />
                </div>
              </>
            )}

            {/* Length field - always shown */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Length (mm) <span className="text-red-500">*</span></label>
              <InputNumber
                style={{ width: '100%' }}
                placeholder="Length"
                value={newStockForm.length}
                onChange={(value) => {
                  // Only allow valid numbers
                  if (value === null || value === undefined || value === '') {
                    setNewStockForm(prev => ({ ...prev, length: '' }));
                  } else if (!isNaN(value) && value >= 0) {
                    setNewStockForm(prev => ({ ...prev, length: value }));
                  }
                }}
                onBeforeInput={(e) => {
                  // Block input before it reaches the field
                  const char = e.data;
                  if (char && !/[0-9.]/.test(char)) {
                    e.preventDefault();
                    return false;
                  }
                }}
                onKeyPress={(e) => {
                  // Block all non-digit and non-decimal keys except navigation keys
                  const char = String.fromCharCode(e.which);
                  if (!/[0-9.]/.test(char) && 
                      e.which !== 8 && // backspace
                      e.which !== 46 && // delete
                      e.which !== 9 && // tab
                      e.which !== 13 && // enter
                      e.which !== 37 && // left arrow
                      e.which !== 39 && // right arrow
                      e.which !== 36 && // home
                      e.which !== 35) { // end
                    e.preventDefault();
                    return false;
                  }
                }}
                onKeyDown={(e) => {
                  // Block multiple decimal points and special characters
                  const value = e.target.value;
                  if (e.key === '.' && value && value.includes('.')) {
                    e.preventDefault();
                    return false;
                  }
                  if (e.key === ',' || e.key === '-' || e.key === '+') {
                    e.preventDefault();
                  }
                }}
                onInput={(e) => {
                  // Immediate cleanup of any invalid characters
                  if (!e.target || !e.target.value) return;
                  const value = e.target.value;
                  const validValue = value.replace(/[^0-9.]/g, '');
                  if (value !== validValue) {
                    e.target.value = validValue;
                    setNewStockForm(prev => ({ ...prev, length: validValue }));
                  }
                }}
                onPaste={(e) => {
                  // Prevent paste of invalid content
                  e.preventDefault();
                  const pasteData = e.clipboardData.getData('text');
                  const cleanData = pasteData.replace(/[^0-9.]/g, '');
                  if (cleanData) {
                    const currentValue = e.target.value || '';
                    const newValue = currentValue + cleanData;
                    setNewStockForm(prev => ({ ...prev, length: newValue }));
                  }
                  return false;
                }}
                onBlur={(e) => {
                  // Clean up any invalid characters on blur
                  const value = e.target.value;
                  const cleanValue = value.replace(/[^0-9.]/g, '');
                  if (value !== cleanValue) {
                    setNewStockForm(prev => ({ ...prev, length: cleanValue }));
                  }
                }}
                min={0}
                step={0.01}
                parser={(value) => {
                  // Parse only numbers and decimal
                  const cleanValue = value.replace(/[^0-9.]/g, '');
                  const parsed = parseFloat(cleanValue);
                  return isNaN(parsed) ? null : parsed;
                }}
                formatter={(value) => {
                  // Display only valid numbers
                  return value !== null && value !== undefined ? value.toString() : '';
                }}
              />
            </div>
          </div>

          {/* Fourth Row: Quantity and Vendors */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity <span className="text-red-500">*</span></label>
              <InputNumber
                style={{ width: '100%' }}
                placeholder="Quantity"
                value={newStockForm.quantity}
                onChange={(value) => {
                  // Only allow positive integers
                  if (value === null || value === undefined || value === '') {
                    setNewStockForm(prev => ({ ...prev, quantity: 1 }));
                  } else if (Number.isInteger(value) && value >= 1) {
                    setNewStockForm(prev => ({ ...prev, quantity: value }));
                  }
                }}
                onBlur={(e) => {
                  // Ensure integer value on blur
                  const value = parseInt(e.target.value);
                  if (isNaN(value) || value < 1) {
                    setNewStockForm(prev => ({ ...prev, quantity: 1 }));
                  } else {
                    setNewStockForm(prev => ({ ...prev, quantity: value }));
                  }
                }}
                onBeforeInput={(e) => {
                  const char = e.data;
                  const currentValue = e.target.value || '';
                  // Block non-digits
                  if (char && !/[0-9]/.test(char)) {
                    e.preventDefault();
                    return false;
                  }
                  // Block 0 as first digit
                  if (char === '0' && currentValue === '') {
                    e.preventDefault();
                    return false;
                  }
                }}
                onKeyPress={(e) => {
                  // Block all non-digit keys except backspace, delete, tab, enter
                  const char = String.fromCharCode(e.which);
                  const currentValue = e.target.value || '';
                  if (!/[0-9]/.test(char) && 
                      e.which !== 8 && // backspace
                      e.which !== 46 && // delete
                      e.which !== 9 && // tab
                      e.which !== 13 && // enter
                      e.which !== 37 && // left arrow
                      e.which !== 39 && // right arrow
                      e.which !== 36 && // home
                      e.which !== 35) { // end
                    e.preventDefault();
                  }
                  // Block 0 as first digit
                  if (char === '0' && currentValue === '') {
                    e.preventDefault();
                  }
                }}
                onKeyDown={(e) => {
                  // Block decimal point and other special characters
                  if (e.key === '.' || e.key === ',' || e.key === '-' || e.key === '+') {
                    e.preventDefault();
                  }
                }}
                min={1}
                step={1}
                precision={0}
                parser={(value) => {
                  // Parse only integers, reject decimals and special chars
                  const parsed = parseInt(value, 10);
                  return isNaN(parsed) ? null : parsed;
                }}
                formatter={(value) => {
                  // Display only integers
                  return value ? value.toString() : '';
                }}
              />
            </div>

            {enquiryMode ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vendors for Enquiry <span className="text-red-500">*</span></label>
                <Select
                  mode="multiple"
                  style={{ width: '100%' }}
                  placeholder="Select vendors to send enquiry"
                  value={newStockForm.vendor_ids}
                  onChange={(value) => setNewStockForm(prev => ({ ...prev, vendor_ids: value }))}
                  onOpenChange={(open) => {
                    if (open) fetchVendors();
                  }}
                  showSearch
                  placement="bottomLeft"
                  getPopupContainer={() => document.body}
                  styles={{ popup: { root: { position: 'fixed', zIndex: 9999 } } }}
                  className="vendor-dropdown-downward"
                  filterOption={(input, option) =>
                    option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
                  }
                >
                  {vendors.map(vendor => (
                    <Option key={vendor.id} value={vendor.id}>
                      {vendor.company_name}
                    </Option>
                  ))}
                </Select>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Selected Vendor</label>
                <Select
                  style={{ width: '100%' }}
                  placeholder="Vendor"
                  value={newStockForm.selected_vendor_id}
                  onChange={(value) => setNewStockForm(prev => ({ ...prev, selected_vendor_id: value }))}
                  disabled
                >
                  {vendors.map(vendor => (
                    <Option key={vendor.id} value={vendor.id}>
                      {vendor.company_name}
                    </Option>
                  ))}
                </Select>
                <Button
                  type="link"
                  onClick={() => setEnquiryMode(true)}
                  style={{ padding: 0, height: 'auto' }}
                >
                  ← Back to Vendor Enquiry
                </Button>
              </div>
            )}
          </div>

        <div className="flex justify-end pt-4">
            <Button
              type="primary"
              onClick={handleAddStock}
              loading={addStockLoading}
              size="large"
              style={{ backgroundColor: '#2563eb' }}
              className="border-none shadow-md px-8"
            >
              {enquiryMode ? 'Send Enquiry' : 'Add Order-Linked Stock'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Document Preview Modal */}
      <Modal
        title="Document Preview"
        open={documentPreviewModal.visible}
        onCancel={() => setDocumentPreviewModal({ visible: false, documentUrl: null, documentName: '', documents: [] })}
        footer={[
          <Button key="close" onClick={() => setDocumentPreviewModal({ visible: false, documentUrl: null, documentName: '', documents: [] })}>
            Close
          </Button>,
          <Button key="open" type="primary" onClick={() => window.open(documentPreviewModal.documentUrl, '_blank')}>
            Open in New Tab
          </Button>
        ]}
        width={1000}
      >
        {documentPreviewModal.documents && documentPreviewModal.documents.length > 1 && (
          <div style={{ marginBottom: '16px' }}>
            <Text strong>Select Version: </Text>
            <Select
              style={{ width: 200, marginLeft: '8px' }}
              value={documentPreviewModal.documents.find(doc => doc.document_url === documentPreviewModal.documentUrl)?.id}
              onChange={handleDocumentVersionChange}
            >
              {documentPreviewModal.documents.map(doc => (
                <Option key={doc.id} value={doc.id}>
                  {doc.document_name} ({doc.document_version})
                </Option>
              ))}
            </Select>
          </div>
        )}
        <iframe
          src={documentPreviewModal.documentUrl}
          style={{ width: '100%', height: '600px', border: 'none' }}
          title="Document Preview"
        />
      </Modal>
    </div>
  );
};

export default LinkMaterialsTab;
