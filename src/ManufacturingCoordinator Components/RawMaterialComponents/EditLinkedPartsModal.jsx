import React, { useState, useEffect } from 'react';
import { Modal, Button, Typography, Select, InputNumber, Tree, Input, Spin, Empty, Tag, message } from 'antd';
import { EditOutlined } from '@ant-design/icons';

const { Text } = Typography;
const { Option } = Select;

const EditLinkedPartsModal = ({
  open,
  onCancel,
  onSave,
  statusEditRecord,
  statusEditOrderQty,
  setStatusEditOrderQty,
  statusEditDimensions,
  setStatusEditDimensions,
  statusEditCurrentLinkages,
  statusEditPartQuantities,
  setStatusEditPartQuantities,
  statusEditPartRequiredLengths,
  setStatusEditPartRequiredLengths,
  statusEditPartRawMaterialUnits,
  setStatusEditPartRawMaterialUnits,
  availableUnits,
  loadingUnits,
  orderHierarchyMap,
  statusEditReceivedVendorId,
  setStatusEditReceivedVendorId,
  pendingUnlinks,
  setPendingUnlinks,
  loading,
  handleInputKeyDown,
  handleLinkPart,
  vendors
}) => {
  // Parts management state
  const [partSearchText, setPartSearchText] = useState('');
  const [viewMode, setViewMode] = useState('tree');
  const [linkFilter, setLinkFilter] = useState('all');
  const [flatPage, setFlatPage] = useState(1);
  const [flatPageSize] = useState(20);

  // Reset page when search or filter changes
  useEffect(() => {
    setFlatPage(1);
  }, [partSearchText, linkFilter]);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setPartSearchText('');
      setViewMode('tree');
      setLinkFilter('all');
      setFlatPage(1);
    }
  }, [open]);

  // Helper function to get latest extracted data
  const getLatestExtractedData = (extractedDataArray) => {
    if (!extractedDataArray || !Array.isArray(extractedDataArray) || extractedDataArray.length === 0) {
      return null;
    }
    const sorted = [...extractedDataArray].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return sorted[0];
  };

  // Get all parts as flat list
  const getAllPartsFlat = (hierarchy) => {
    if (!hierarchy || !hierarchy.product_hierarchy) return [];
    
    const { assemblies = [], direct_parts = [] } = hierarchy.product_hierarchy;
    const allParts = [];
    
    const processParts = (partsList, assemblyName = '') => {
      (partsList || []).forEach(partDetail => {
        if (partDetail.part && partDetail.part.id) {
          const part = partDetail.part;
          const sourceType = part.raw_material_source_type || part.raw_material_unit_details?.source_type;
          const isAlreadyLinked = part.raw_material_unit_id !== null && part.raw_material_unit_id !== undefined;
          const isLinkedToGeneralStock = sourceType === 'general' && isAlreadyLinked;
          const isLinkedToOrderStock = sourceType === 'order' && isAlreadyLinked;
          
          const latestExtractedData = getLatestExtractedData(partDetail.extracted_data);
          
          if (part.type_name === "STANDARD" || 
              (part.type_name === "Out-Source" && part.part_detail === "WITHOUT_RAW_MATERIAL")) {
            return;
          }
          
          allParts.push({
            title: `${part.part_number} - ${part.part_name}`,
            key: `part-${part.id}`,
            type: 'part',
            part: part,
            isAlreadyLinked: isAlreadyLinked,
            isLinkedToGeneralStock: isLinkedToGeneralStock,
            isLinkedToOrderStock: isLinkedToOrderStock,
            sourceType: sourceType,
            extractedData: latestExtractedData,
            assemblyName: assemblyName
          });
        }
      });
    };
    
    assemblies.forEach(assembly => {
      processParts(assembly.parts, assembly.assembly?.assembly_name);
      
      if (assembly.subassemblies) {
        assembly.subassemblies.forEach(subassembly => {
          processParts(subassembly.parts, subassembly.assembly?.assembly_name);
        });
      }
    });
    
    processParts(direct_parts, 'Direct Parts');
    
    return allParts;
  };

  // Filter parts based on search and link status
  const filterParts = (partsList) => {
    if (!partsList) return [];
    
    return partsList.filter(partNode => {
      if (partNode.type !== 'part') return true;
      
      const part = partNode.part;
      const searchTerm = partSearchText.toLowerCase();
      
      if (searchTerm) {
        const matchesSearch = 
          (part.part_number && part.part_number.toLowerCase().includes(searchTerm)) ||
          (part.part_name && part.part_name.toLowerCase().includes(searchTerm)) ||
          (partNode.extractedData?.material && partNode.extractedData.material.toLowerCase().includes(searchTerm));
        
        if (!matchesSearch) return false;
      }
      
      if (linkFilter === 'unlinked') {
        const isLinked = partNode.isLinkedToGeneralStock || partNode.isLinkedToOrderStock;
        if (isLinked) return false;
      } else if (linkFilter === 'linked') {
        const isLinked = partNode.isLinkedToGeneralStock || partNode.isLinkedToOrderStock;
        if (!isLinked) return false;
      }
      
      return true;
    });
  };

  // Build tree data for hierarchy
  const buildTreeData = (hierarchy) => {
    if (!hierarchy || !hierarchy.product_hierarchy) return [];
    
    const { assemblies = [], direct_parts = [] } = hierarchy.product_hierarchy;
    const treeData = [];
    
    assemblies.forEach(assembly => {
      const assemblyNode = {
        title: assembly.assembly?.assembly_name || 'Unknown Assembly',
        key: `assembly-${assembly.assembly?.id}`,
        type: 'assembly',
        children: []
      };
      
      if (assembly.parts && Array.isArray(assembly.parts)) {
        assembly.parts.forEach(partDetail => {
          if (partDetail.part && partDetail.part.id) {
            const part = partDetail.part;
            const sourceType = part.raw_material_source_type || part.raw_material_unit_details?.source_type;
            const isAlreadyLinked = part.raw_material_unit_id !== null && part.raw_material_unit_id !== undefined;
            const isLinkedToGeneralStock = sourceType === 'general' && isAlreadyLinked;
            const isLinkedToOrderStock = sourceType === 'order' && isAlreadyLinked;
            
            const latestExtractedData = getLatestExtractedData(partDetail.extracted_data);
            
            if (part.type_name === "STANDARD" || 
                (part.type_name === "Out-Source" && part.part_detail === "WITHOUT_RAW_MATERIAL")) {
              return;
            }
            
            const partNode = {
              title: `${part.part_number} - ${part.part_name}`,
              key: `part-${part.id}`,
              type: 'part',
              part: part,
              isAlreadyLinked: isAlreadyLinked,
              isLinkedToGeneralStock: isLinkedToGeneralStock,
              isLinkedToOrderStock: isLinkedToOrderStock,
              sourceType: sourceType,
              extractedData: latestExtractedData
            };
            
            const searchTerm = partSearchText.toLowerCase();
            const matchesSearch = !searchTerm || 
              (part.part_number && part.part_number.toLowerCase().includes(searchTerm)) ||
              (part.part_name && part.part_name.toLowerCase().includes(searchTerm)) ||
              (latestExtractedData?.material && latestExtractedData.material.toLowerCase().includes(searchTerm));
            
            let passesLinkFilter = true;
            if (linkFilter === 'unlinked') {
              passesLinkFilter = !isLinkedToGeneralStock && !isLinkedToOrderStock;
            } else if (linkFilter === 'linked') {
              passesLinkFilter = isLinkedToGeneralStock || isLinkedToOrderStock;
            }
            
            if (matchesSearch && passesLinkFilter) {
              assemblyNode.children.push(partNode);
            }
          }
        });
      }
      
      if (assembly.subassemblies && Array.isArray(assembly.subassemblies)) {
        assembly.subassemblies.forEach(subassembly => {
          const subNode = {
            title: subassembly.assembly?.assembly_name || 'Unknown Subassembly',
            key: `subassembly-${subassembly.assembly?.id}`,
            type: 'assembly',
            children: []
          };
          
          if (subassembly.parts && Array.isArray(subassembly.parts)) {
            subassembly.parts.forEach(partDetail => {
              if (partDetail.part && partDetail.part.id) {
                const part = partDetail.part;
                const sourceType = part.raw_material_source_type || part.raw_material_unit_details?.source_type;
                const isAlreadyLinked = part.raw_material_unit_id !== null && part.raw_material_unit_id !== undefined;
                const isLinkedToGeneralStock = sourceType === 'general' && isAlreadyLinked;
                const isLinkedToOrderStock = sourceType === 'order' && isAlreadyLinked;
                
                const latestExtractedData = getLatestExtractedData(partDetail.extracted_data);
                
                if (part.type_name === "STANDARD" || 
                    (part.type_name === "Out-Source" && part.part_detail === "WITHOUT_RAW_MATERIAL")) {
                  return;
                }
                
                const partNode = {
                  title: `${part.part_number} - ${part.part_name}`,
                  key: `part-${part.id}`,
                  type: 'part',
                  part: part,
                  isAlreadyLinked: isAlreadyLinked,
                  isLinkedToGeneralStock: isLinkedToGeneralStock,
                  isLinkedToOrderStock: isLinkedToOrderStock,
                  sourceType: sourceType,
                  extractedData: latestExtractedData
                };
                
                const searchTerm = partSearchText.toLowerCase();
                const matchesSearch = !searchTerm || 
                  (part.part_number && part.part_number.toLowerCase().includes(searchTerm)) ||
                  (part.part_name && part.part_name.toLowerCase().includes(searchTerm)) ||
                  (latestExtractedData?.material && latestExtractedData.material.toLowerCase().includes(searchTerm));
                
                let passesLinkFilter = true;
                if (linkFilter === 'unlinked') {
                  passesLinkFilter = !isLinkedToGeneralStock && !isLinkedToOrderStock;
                } else if (linkFilter === 'linked') {
                  passesLinkFilter = isLinkedToGeneralStock || isLinkedToOrderStock;
                }
                
                if (matchesSearch && passesLinkFilter) {
                  subNode.children.push(partNode);
                }
              }
            });
          }
          
          if (subNode.children.length > 0) {
            assemblyNode.children.push(subNode);
          }
        });
      }
      
      if (assemblyNode.children.length > 0) {
        treeData.push(assemblyNode);
      }
    });
    
    if (direct_parts && Array.isArray(direct_parts)) {
      const directNode = {
        title: 'Direct Parts',
        key: 'direct-parts',
        type: 'assembly',
        children: []
      };
      
      direct_parts.forEach(partDetail => {
        if (partDetail.part && partDetail.part.id) {
          const part = partDetail.part;
          const sourceType = part.raw_material_source_type || part.raw_material_unit_details?.source_type;
          const isAlreadyLinked = part.raw_material_unit_id !== null && part.raw_material_unit_id !== undefined;
          const isLinkedToGeneralStock = sourceType === 'general' && isAlreadyLinked;
          const isLinkedToOrderStock = sourceType === 'order' && isAlreadyLinked;
          
          const latestExtractedData = getLatestExtractedData(partDetail.extracted_data);
          
          if (part.type_name === "STANDARD" || 
              (part.type_name === "Out-Source" && part.part_detail === "WITHOUT_RAW_MATERIAL")) {
            return;
          }
          
          const partNode = {
            title: `${part.part_number} - ${part.part_name}`,
            key: `part-${part.id}`,
            type: 'part',
            part: part,
            isAlreadyLinked: isAlreadyLinked,
            isLinkedToGeneralStock: isLinkedToGeneralStock,
            isLinkedToOrderStock: isLinkedToOrderStock,
            sourceType: sourceType,
            extractedData: latestExtractedData
          };
          
          const searchTerm = partSearchText.toLowerCase();
          const matchesSearch = !searchTerm || 
            (part.part_number && part.part_number.toLowerCase().includes(searchTerm)) ||
            (part.part_name && part.part_name.toLowerCase().includes(searchTerm)) ||
            (latestExtractedData?.material && latestExtractedData.material.toLowerCase().includes(searchTerm));
          
          let passesLinkFilter = true;
          if (linkFilter === 'unlinked') {
            passesLinkFilter = !isLinkedToGeneralStock && !isLinkedToOrderStock;
          } else if (linkFilter === 'linked') {
            passesLinkFilter = isLinkedToGeneralStock || isLinkedToOrderStock;
          }
          
          if (matchesSearch && passesLinkFilter) {
            directNode.children.push(partNode);
          }
        }
      });
      
      if (directNode.children.length > 0) {
        treeData.push(directNode);
      }
    }
    
    return treeData;
  };

  // Render tree node
  const renderTreeNode = (nodeData) => {
    if (nodeData.type === 'part') {
      const { part, isAlreadyLinked, isLinkedToGeneralStock, isLinkedToOrderStock, sourceType, extractedData, assemblyName } = nodeData;
      const isLinkedToCurrentStock = statusEditCurrentLinkages.some(l => l.part_id === part.id);
      const hasUnitAndLength = statusEditPartRawMaterialUnits[part.id] && statusEditPartRequiredLengths[part.id];
      const isPendingUnlink = pendingUnlinks.has(part.id);
      
      return (
        <div className="flex items-center justify-between w-full pr-4 py-2 border-b border-gray-100 hover:bg-gray-50">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="font-semibold text-sm text-gray-800 whitespace-nowrap">{part.part_number}</span>
              <span className="text-xs text-gray-400">-</span>
              <span className="text-xs text-gray-600 truncate">{part.part_name}</span>
              {assemblyName && viewMode === 'flat' && (
                <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded whitespace-nowrap">{assemblyName}</span>
              )}
            </div>
            
            {extractedData && (extractedData.material || extractedData.stock_size) ? (
              <div className="flex items-center gap-2 ml-3 whitespace-nowrap">
                <span className="text-xs text-gray-500">Extracted:</span>
                {extractedData.material && (
                  <span className="text-xs text-gray-700 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
                    {extractedData.material}
                  </span>
                )}
                {extractedData.stock_size && (
                  <span className="text-xs text-gray-700 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
                    {extractedData.stock_size}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 ml-3 whitespace-nowrap">
                <span className="text-xs text-gray-400 italic">No extracted data</span>
              </div>
            )}
            
            {(isLinkedToGeneralStock || isLinkedToOrderStock) && (
              <div className="flex items-center gap-2 ml-3 whitespace-nowrap">
                <span className="text-xs text-gray-500">Current Link:</span>
                <span className="text-xs text-gray-700 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
                  {part.raw_material_stock_dimensions || part.raw_material_unit_details?.stock_dimensions || '—'}
                </span>
                <span className="text-xs text-gray-600">
                  ({part.required_length}mm)
                </span>
              </div>
            )}
          </div>

          {isLinkedToGeneralStock && (
            <div className="ml-4">
              <Tag color="green" className="text-xs">
                Linked to General Stock
              </Tag>
            </div>
          )}

          {(isLinkedToOrderStock && !isLinkedToGeneralStock && isLinkedToCurrentStock) && (
            <Button
              type="primary"
              size="small"
              danger
              disabled={isPendingUnlink}
              onClick={(e) => {
                e.stopPropagation();
                setPendingUnlinks(prev => new Set([...prev, part.id]));
              }}
              className="ml-4"
            >
              {isPendingUnlink ? '...' : 'Unlink'}
            </Button>
          )}
          {!isLinkedToGeneralStock && !isLinkedToOrderStock && (
            <div className="flex items-center gap-3 ml-4">
              <span className="text-xs text-gray-500">Link to:</span>
              <Select
                size="small"
                placeholder="Unit"
                value={statusEditPartRawMaterialUnits[part.id] || null}
                allowClear
                getPopupContainer={(triggerNode) => triggerNode.parentNode}
                onChange={(value) => {
                  const currentLength = statusEditPartRequiredLengths[part.id];
                  
                  if (currentLength && value) {
                    const selectedUnit = availableUnits.find(u => u.id === value);
                    if (selectedUnit && parseFloat(currentLength) > selectedUnit.remaining_length) {
                      message.error(`Required length (${currentLength}mm) exceeds available length of selected unit (${selectedUnit.remaining_length}mm)`);
                      return;
                    }
                  }
                  
                  setStatusEditPartRawMaterialUnits(prev => ({ ...prev, [part.id]: value }));
                  if (!isLinkedToCurrentStock) {
                    handleLinkPart(part);
                  }
                }}
                style={{ width: '200px' }}
                onClick={(e) => e.stopPropagation()}
              >
                {availableUnits.map(unit => {
                    // Build dimensions string if stock is available
                    let dimensions = `Unit #${unit.id}`;
                    if (unit.stock) {
                      if (unit.stock.form_type === 'Round') {
                        dimensions = `Ø${unit.stock.diameter} × ${unit.stock.length}mm`;
                      } else if (unit.stock.form_type === 'Square') {
                        dimensions = `${unit.stock.breadth} × ${unit.stock.height} × ${unit.stock.length}mm`;
                      } else if (unit.stock.form_type === 'Pipe') {
                        dimensions = `Ø${unit.stock.outer_diameter}/${unit.stock.inner_diameter} × ${unit.stock.length}mm`;
                      }
                    }
                    return (
                      <Option key={unit.id} value={unit.id} disabled={unit.status === 'exhausted'}>
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold">{dimensions}</span>
                          <span className="text-[10px] text-gray-600">Total: {unit.total_length}mm | Remaining: {unit.remaining_length}mm</span>
                          {unit.status === 'exhausted' && (
                            <span className="text-[10px] text-red-500">Exhausted</span>
                          )}
                        </div>
                      </Option>
                    );
                  })}
              </Select>
              <InputNumber
                size="small"
                placeholder="Length"
                value={statusEditPartRequiredLengths[part.id] || null}
                min={1}
                precision={0}
                controls={false}
                onKeyDown={handleInputKeyDown}
                onChange={(value) => {
                  const selectedUnitId = statusEditPartRawMaterialUnits[part.id];

                  // Always update the state so the value remains in the input field
                  setStatusEditPartRequiredLengths(prev => ({ ...prev, [part.id]: value }));

                  if (!isLinkedToCurrentStock) {
                    handleLinkPart(part);
                  }

                  // Validate length against available unit length (only show warning, don't block input)
                  if (value && selectedUnitId) {
                    const selectedUnit = availableUnits.find(u => u.id === selectedUnitId);
                    if (selectedUnit) {
                      if (value > selectedUnit.remaining_length) {
                        message.warning(`Required length (${value}mm) exceeds available length (${selectedUnit.remaining_length}mm). Save will be blocked.`);
                        return;
                      }

                      let totalForUnit = value;
                      Object.entries(statusEditPartRawMaterialUnits).forEach(([partId, unitId]) => {
                        if (unitId === selectedUnitId && partId !== part.id.toString()) {
                          totalForUnit += (parseFloat(statusEditPartRequiredLengths[partId]) || 0);
                        }
                      });

                      if (statusEditRecord && statusEditRecord.id === selectedUnit.stock_id) {
                        statusEditCurrentLinkages.forEach(linkage => {
                          if (linkage.raw_material_unit_id === selectedUnitId && linkage.part_id !== part.id) {
                            totalForUnit += (parseFloat(linkage.required_length) || 0);
                          }
                        });
                      }

                      if (totalForUnit > selectedUnit.remaining_length) {
                        message.warning(`Total required length (${totalForUnit}mm) exceeds available unit length (${selectedUnit.remaining_length}mm). Save will be blocked.`);
                        return;
                      }
                    }
                  }
                }}
                style={{ width: '80px' }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
        </div>
      );
    }
    return <span className="flex items-center gap-2"><span className="text-sm">📁</span>{nodeData.title}</span>;
  };

  return (
    <Modal 
      open={open} 
      onCancel={onCancel} 
      title={
        <div className="flex items-center gap-2">
          <EditOutlined className="text-blue-500" />
          <span className="font-bold text-gray-800 text-sm sm:text-base">Edit Linked Parts & Status</span>
        </div>
      } 
      width={{ xs: '98%', sm: '95%', md: 1200, lg: 1400 }} 
      centered 
      footer={[
        <Button key="cancel" onClick={onCancel} className="w-full sm:w-auto">Cancel</Button>, 
        <Button key="save" type="primary" style={{ backgroundColor: '#2563eb' }} onClick={onSave} className="w-full sm:w-auto">Save Changes</Button>
      ]}
    >
      <div className="py-2 space-y-3" style={{ maxHeight: '80vh', overflowY: 'auto' }}>
        {/* Material, Process Type, Form Type - Single Row */}
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Material</Text>
            <Input
              value={statusEditRecord?.material_name || ''}
              disabled
              size="small"
              className="rounded-md"
            />
          </div>

          <div className="space-y-1">
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Process Type</Text>
            <Input
              value={statusEditRecord?.process_type || ''}
              disabled
              size="small"
              className="rounded-md"
            />
          </div>

          <div className="space-y-1">
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Form Type</Text>
            <Select
              style={{ width: '100%' }}
              placeholder="Form Type"
              value={statusEditRecord?.form_type}
              disabled
              size="small"
              className="rounded-md"
            >
              <Option value="Round">Round</Option>
              <Option value="Square">Square</Option>
              <Option value="Pipe">Pipe</Option>
            </Select>
          </div>
        </div>

        {/* Costs - 2 columns */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Est. Cost (₹)</Text>
            <Input
              value={statusEditRecord?.estimated_cost ? `₹${statusEditRecord.estimated_cost.toFixed(2)}` : ''}
              disabled
              size="small"
              className="rounded-md"
            />
          </div>

          <div className="space-y-1">
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Final Cost (₹)</Text>
            <Input
              value={statusEditRecord?.final_cost ? `₹${statusEditRecord.final_cost.toFixed(2)}` : ''}
              disabled
              size="small"
              className="rounded-md"
            />
          </div>
        </div>

        {/* Dimensions - Compact Horizontal Layout */}
        {statusEditRecord?.form_type === 'Round' && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Diameter (mm)</Text>
              <InputNumber
                style={{ width: '100%' }}
                placeholder="Diameter"
                value={statusEditDimensions.diameter}
                onChange={(value) => {
                  if (value !== null && value >= 0) {
                    setStatusEditDimensions(prev => ({ ...prev, diameter: value }));
                  }
                }}
                min={0}
                precision={0}
                controls={false}
                onKeyDown={handleInputKeyDown}
                size="small"
                className="rounded-md"
              />
            </div>
            <div className="space-y-1">
              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Length (mm)</Text>
              <InputNumber
                style={{ width: '100%' }}
                placeholder="Length"
                value={statusEditDimensions.length}
                onChange={(value) => {
                  if (value !== null && value >= 0) {
                    setStatusEditDimensions(prev => ({ ...prev, length: value }));
                  }
                }}
                min={0}
                precision={0}
                controls={false}
                onKeyDown={handleInputKeyDown}
                size="small"
                className="rounded-md"
              />
            </div>
          </div>
        )}

        {statusEditRecord?.form_type === 'Square' && (
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Breadth (mm)</Text>
              <InputNumber
                style={{ width: '100%' }}
                placeholder="Breadth"
                value={statusEditDimensions.breadth}
                onChange={(value) => {
                  if (value !== null && value >= 0) {
                    setStatusEditDimensions(prev => ({ ...prev, breadth: value }));
                  }
                }}
                min={0}
                precision={0}
                controls={false}
                onKeyDown={handleInputKeyDown}
                size="small"
                className="rounded-md"
              />
            </div>
            <div className="space-y-1">
              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Height (mm)</Text>
              <InputNumber
                style={{ width: '100%' }}
                placeholder="Height"
                value={statusEditDimensions.height}
                onChange={(value) => {
                  if (value !== null && value >= 0) {
                    setStatusEditDimensions(prev => ({ ...prev, height: value }));
                  }
                }}
                min={0}
                precision={0}
                controls={false}
                onKeyDown={handleInputKeyDown}
                size="small"
                className="rounded-md"
              />
            </div>
            <div className="space-y-1">
              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Length (mm)</Text>
              <InputNumber
                style={{ width: '100%' }}
                placeholder="Length"
                value={statusEditDimensions.length}
                onChange={(value) => {
                  if (value !== null && value >= 0) {
                    setStatusEditDimensions(prev => ({ ...prev, length: value }));
                  }
                }}
                min={0}
                precision={0}
                controls={false}
                onKeyDown={handleInputKeyDown}
                size="small"
                className="rounded-md"
              />
            </div>
          </div>
        )}

        {statusEditRecord?.form_type === 'Pipe' && (
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Inner Dia (mm)</Text>
              <InputNumber
                style={{ width: '100%' }}
                placeholder="Inner Diameter"
                value={statusEditDimensions.inner_diameter}
                onChange={(value) => {
                  if (value !== null && value >= 0) {
                    setStatusEditDimensions(prev => ({ ...prev, inner_diameter: value }));
                  }
                }}
                min={0}
                precision={0}
                controls={false}
                onKeyDown={handleInputKeyDown}
                size="small"
                className="rounded-md"
              />
            </div>
            <div className="space-y-1">
              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Outer Dia (mm)</Text>
              <InputNumber
                style={{ width: '100%' }}
                placeholder="Outer Diameter"
                value={statusEditDimensions.outer_diameter}
                onChange={(value) => {
                  if (value !== null && value >= 0) {
                    setStatusEditDimensions(prev => ({ ...prev, outer_diameter: value }));
                  }
                }}
                min={0}
                precision={0}
                controls={false}
                onKeyDown={handleInputKeyDown}
                size="small"
                className="rounded-md"
              />
            </div>
            <div className="space-y-1">
              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Length (mm)</Text>
              <InputNumber
                style={{ width: '100%' }}
                placeholder="Length"
                value={statusEditDimensions.length}
                onChange={(value) => {
                  if (value !== null && value >= 0) {
                    setStatusEditDimensions(prev => ({ ...prev, length: value }));
                  }
                }}
                min={0}
                precision={0}
                controls={false}
                onKeyDown={handleInputKeyDown}
                size="small"
                className="rounded-md"
              />
            </div>
          </div>
        )}

        {/* Quantity */}
        <div className="space-y-1">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Quantity</Text>
          <InputNumber
            min={1}
            precision={0}
            controls={false}
            onKeyDown={handleInputKeyDown}
            style={{ width: '100%' }}
            value={statusEditOrderQty}
            onChange={(value) => {
              if (value !== null && value >= 1) {
                setStatusEditOrderQty(value);
              }
            }}
            size="small"
            className="rounded-md"
          />
        </div>

        {/* Parts Management */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <Text className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Parts Management</Text>
            <div className="flex items-center gap-2 flex-wrap">
              <Input.Search
                placeholder="Search parts..."
                value={partSearchText}
                onChange={(e) => setPartSearchText(e.target.value)}
                allowClear
                size="small"
                style={{ width: 180 }}
              />
              <Select
                value={viewMode}
                onChange={setViewMode}
                size="small"
                style={{ width: 100 }}
              >
                <Option value="tree">Tree View</Option>
                <Option value="flat">Flat List</Option>
              </Select>
              <Select
                value={linkFilter}
                onChange={setLinkFilter}
                size="small"
                style={{ width: 130 }}
              >
                <Option value="all">All Parts</Option>
                <Option value="linked">RM Linked</Option>
                <Option value="unlinked">RM Not Linked</Option>
                
              </Select>
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200" style={{ maxHeight: '500px', overflowY: 'auto' }}>
            {loading ? (
              <div className="flex justify-center py-12">
                <Spin size="large" />
              </div>
            ) : orderHierarchyMap[statusEditRecord?.source_order_id || statusEditRecord?.order_id] ? (
              viewMode === 'tree' ? (
                <Tree
                  showLine={{ showLeafIcon: false }}
                  treeData={buildTreeData(orderHierarchyMap[statusEditRecord?.source_order_id || statusEditRecord?.order_id])}
                  titleRender={(nodeData) => renderTreeNode(nodeData)}
                  className="custom-tree"
                />
              ) : (
                <>
                  <div className="space-y-1">
                    {(() => {
                      const allParts = filterParts(getAllPartsFlat(orderHierarchyMap[statusEditRecord?.source_order_id || statusEditRecord?.order_id]));
                      const totalPages = Math.ceil(allParts.length / flatPageSize);
                      const startIndex = (flatPage - 1) * flatPageSize;
                      const endIndex = startIndex + flatPageSize;
                      const currentParts = allParts.slice(startIndex, endIndex);
                      
                      return currentParts.length > 0 ? (
                        <>
                          {currentParts.map((partNode) => renderTreeNode(partNode))}
                          {totalPages > 1 && (
                            <div className="flex items-center justify-between pt-4 mt-4 border-t border-gray-200">
                              <span className="text-xs text-gray-500">
                                Showing {startIndex + 1}-{Math.min(endIndex, allParts.length)} of {allParts.length} parts
                              </span>
                              <div className="flex items-center gap-2">
                                <Button
                                  size="small"
                                  disabled={flatPage === 1}
                                  onClick={() => setFlatPage(flatPage - 1)}
                                >
                                  Previous
                                </Button>
                                <span className="text-xs text-gray-600">
                                  Page {flatPage} of {totalPages}
                                </span>
                                <Button
                                  size="small"
                                  disabled={flatPage === totalPages}
                                  onClick={() => setFlatPage(flatPage + 1)}
                                >
                                  Next
                                </Button>
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <Empty description="No parts found matching your criteria" />
                      );
                    })()}
                  </div>
                </>
              )
            ) : (
              <Empty description="No hierarchy available" />
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default EditLinkedPartsModal;
