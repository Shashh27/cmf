import React, { useState, useEffect, useRef } from "react";
import { SearchOutlined, PartitionOutlined, ToolOutlined, FileTextOutlined, EditOutlined, DeleteOutlined, DeploymentUnitOutlined, ClusterOutlined, CaretDownOutlined, CaretRightOutlined, CodepenOutlined, BlockOutlined, CodeSandboxOutlined, AppstoreOutlined } from "@ant-design/icons";
import axios from "axios";
import { QUALITY_API_BASE_URL } from "../Config/qualityconfig";
import { Input, Button, App, Tooltip, Empty, Spin, Tag, Typography } from "antd";

const { Text } = Typography;
import ProductToolsViewer from "../PDM Components/ProductToolsViewer";

const QualityManagementBOM = ({ 
  onItemSelected, 
  onHierarchyLoaded, 
  initialProductId = null,
  selectedItemId = null,
  selectedItemType = null
}) => {
  const { message } = App.useApp();
  const [products, setProducts] = useState([]);
  const [expandedItems, setExpandedItems] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [hierarchicalData, setHierarchicalData] = useState({});
  const [originalHierarchicalData, setOriginalHierarchicalData] = useState({});
  const [activeItemId, setActiveItemId] = useState(selectedItemId);
  const [activeItemType, setActiveItemType] = useState(selectedItemType);
  const [showToolsModal, setShowToolsModal] = useState(false);
  const [selectedProductForTools, setSelectedProductForTools] = useState(null);
  const hasFetchedData = useRef(false);

  const getExpandKey = (type, id) => `${type}-${id}`;

  const getTypeIcon = (type, level = 0) => {
    const normalized = (type || "").toString().toLowerCase();
    if (normalized === "product") return <DeploymentUnitOutlined className="text-purple-600" />;
    if (normalized === "assembly" && level <= 1) return <ClusterOutlined className="text-blue-500" />;
    if (normalized === "assembly" && level > 1) return <BlockOutlined className="text-indigo-600" />;
    const inHouseTypes = ["make", "in-house", "in house", "inhouse"];
    if (inHouseTypes.includes(normalized)) return <CodeSandboxOutlined className="text-emerald-600" />;
    const outSourceTypes = ["buy", "out-source", "out source", "outsourced", "outsourcing"];
    if (outSourceTypes.includes(normalized)) return <CodepenOutlined className="text-amber-600" />;
    return <FileTextOutlined className="text-gray-500" />;
  };

  useEffect(() => {
    if (!hasFetchedData.current) {
      hasFetchedData.current = true;
      const pid = initialProductId != null ? Number(initialProductId) : null;
      if (pid) {
        (async () => {
          try {
            const data = await fetchProductHierarchy(pid);
            if (data?.product) setProducts([data.product]);
          } finally {
            setLoading(false);
          }
        })();
      } else {
        setLoading(false);
      }
    }
  }, []);

  // Sync internal active state with props from QualityManagement
  useEffect(() => {
    if (selectedItemId !== activeItemId) setActiveItemId(selectedItemId);
    if (selectedItemType !== activeItemType) setActiveItemType(selectedItemType);

    // Auto-expand parents to make the selected item visible
    if (selectedItemId && selectedItemType && !loading && Object.keys(hierarchicalData).length > 0) {
      const keysToExpand = {};
      
      const trace = (node, type, path) => {
        if (!node) return false;
        const currentKey = getExpandKey(type, node.id);
        
        if (node.id === selectedItemId && type === selectedItemType) {
          path.forEach(k => { keysToExpand[k] = true; });
          return true;
        }

        const subAsm = node.child_assemblies || node.subassemblies || node.assemblies || [];
        const subParts = node.parts || node.direct_parts || [];

        for (const a of subAsm) {
          if (trace(a, 'assembly', [...path, currentKey])) return true;
        }
        for (const p of subParts) {
          if (trace(p, 'part', [...path, currentKey])) return true;
        }
        return false;
      };

      Object.keys(hierarchicalData).forEach(pid => {
        const h = hierarchicalData[pid];
        if (h.product) {
          const productKey = getExpandKey('product', h.product.id);
          // If the product itself is selected, we don't need to expand anything below it
          if (h.product.id === selectedItemId && selectedItemType === 'product') return;

          // Otherwise, search children
          const rootAsm = h.assemblies || [];
          const rootParts = h.parts || h.direct_parts || [];

          for (const a of rootAsm) {
            if (trace(a, 'assembly', [productKey])) break;
          }
          for (const p of rootParts) {
            if (trace(p, 'part', [productKey])) break;
          }
        }
      });

      if (Object.keys(keysToExpand).length > 0) {
        setExpandedItems(prev => ({ ...prev, ...keysToExpand }));
      }
    }
  }, [selectedItemId, selectedItemType, loading, hierarchicalData]);

  useEffect(() => {
    const pid = initialProductId != null ? Number(initialProductId) : null;
    const urlParams = new URLSearchParams(window.location.search);
    const hasSavedSelection = urlParams.get('partId') || selectedItemId;
    
    if (!pid || loading || hasSavedSelection) return;
    
    const product = hierarchicalData[pid]?.product || products.find(p => Number(p.id) === pid);
    if (!product) return;
    setActiveItemId(pid);
    if (onItemSelected) {
      onItemSelected({ ...product, itemType: 'product', productId: pid });
    }
  }, [initialProductId, loading, products, hierarchicalData, selectedItemId]);

  const fetchProductHierarchy = async (productId) => {
    if (hierarchicalData[productId]) return hierarchicalData[productId];
    try {
      const response = await axios.get(`${QUALITY_API_BASE_URL}/products/${productId}/hierarchical`);
      if (response.status >= 200 && response.status < 300) {
        const data = response.data;
        setOriginalHierarchicalData(prev => ({ ...prev, [productId]: data }));

        const transformedData = {
          ...data,
          parts: (data.direct_parts || []).map(item => ({
            ...item.part,
            extracted_data: item.extracted_data || [],
            documents: item.documents || []
          })),
          assemblies: (data.assemblies || []).map(assembly => ({
            ...assembly.assembly,
            parts: (assembly.parts || []).map(part => ({
              ...part.part,
              extracted_data: part.extracted_data || [],
              documents: part.documents || []
            })),
            child_assemblies: transformSubassemblies(assembly.subassemblies || [])
          }))
        };

        setHierarchicalData(prev => ({ ...prev, [productId]: transformedData }));
        if (onHierarchyLoaded) onHierarchyLoaded(productId, data);
        return transformedData;
      }
    } catch (error) {
      console.error("Error fetching product hierarchy:", error);
      message.error("Error fetching product hierarchy");
    }
  };

  const transformSubassemblies = (subassemblies) => {
    return (subassemblies || []).map(sub => ({
      ...sub.assembly,
      parts: (sub.parts || []).map(part => ({
        ...part.part,
        extracted_data: part.extracted_data || [],
        documents: part.documents || []
      })),
      child_assemblies: transformSubassemblies(sub.subassemblies || [])
    }));
  };

  const toggleExpand = (key) => setExpandedItems(prev => ({ ...prev, [key]: !prev[key] }));

  const handleExpandProduct = async (product) => {
    if (!hierarchicalData[product.id]) await fetchProductHierarchy(product.id);
    toggleExpand(getExpandKey('product', product.id));
  };

  const handleViewAllTools = (product) => {
    setSelectedProductForTools(product);
    setShowToolsModal(true);
  };

  const handleItemClick = async (item, type, productId = null) => {
    setActiveItemId(item.id);
    setActiveItemType(type);
    if (type === 'product' && !hierarchicalData[item.id]) await fetchProductHierarchy(item.id);
    toggleExpand(getExpandKey(type, item.id));
    if (onItemSelected) {
      onItemSelected({ ...item, itemType: type, productId: productId || (type === 'product' ? item.id : null) });
    }
  };

  const findProductIdForItem = (itemId) => {
    for (const productId in hierarchicalData) {
      const product = hierarchicalData[productId];
      if (product.parts?.some(p => p.id === itemId)) return productId;
      const checkAssemblies = (assemblies) => {
        for (const assembly of assemblies) {
          if (assembly.id === itemId || assembly.parts?.some(p => p.id === itemId)) return productId;
          if (assembly.child_assemblies) {
            const found = checkAssemblies(assembly.child_assemblies);
            if (found) return found;
          }
        }
        return null;
      };
      const found = checkAssemblies(product.assemblies || []);
      if (found) return found;
    }
    return null;
  };

  const getNestedAssemblies = (assemblyId) => {
    for (const productId in hierarchicalData) {
      const findNested = (assemblies) => {
        for (const assembly of assemblies) {
          if (assembly.id === assemblyId) return assembly.child_assemblies || [];
          if (assembly.child_assemblies) {
            const result = findNested(assembly.child_assemblies);
            if (result.length > 0) return result;
          }
        }
        return [];
      };
      const result = findNested(hierarchicalData[productId].assemblies || []);
      if (result.length > 0) return result;
    }
    return [];
  };

  const getPartsForAssembly = (assemblyId) => {
    for (const productId in hierarchicalData) {
      const product = hierarchicalData[productId];
      const findInNested = (assemblies) => {
        for (const assembly of assemblies) {
          if (assembly.id === assemblyId) return assembly.parts || [];
          if (assembly.child_assemblies) {
            const result = findInNested(assembly.child_assemblies);
            if (result.length > 0) return result;
          }
        }
        return [];
      };
      const parts = findInNested(product.assemblies || []);
      if (parts.length > 0) return parts;
    }
    return [];
  };

  const getRawMaterialStatusTag = (status) => {
    const s = (status || "N/A").toString().toLowerCase();
    if (s === "available") return <Tag className="m-0 text-[10px] shrink-0" color="success">Available</Tag>;
    if (s === "not available") return <Tag className="m-0 text-[10px] shrink-0" color="error">Not Available</Tag>;
    return <Tag className="m-0 text-[10px] shrink-0">N/A</Tag>;
  };

  const renderPartInTree = (part, level = 0, productId = null) => {
    const isSelected = activeItemId === part.id && activeItemType === 'part';
    const typeLabel = (part.type_name || "PART").toUpperCase();
    return (
      <div
        key={`part-${part.id}`}
        className={`flex items-center justify-between px-2 py-1 rounded-md cursor-pointer transition-colors mb-0.5 border-l-2 ${isSelected ? 'bg-indigo-50 border-indigo-500 text-indigo-800' : 'hover:bg-slate-100 border-transparent'}`}
        style={{ marginLeft: `${level * 14}px` }}
        onClick={() => handleItemClick(part, 'part', productId || findProductIdForItem(part.id))}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="w-5 flex justify-center text-sm">{getTypeIcon(part.type_name || 'part')}</span>
          <Text className={`text-sm font-medium truncate ${isSelected ? 'text-indigo-800' : 'text-slate-700'}`}>{part.part_name}</Text>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Tag className="text-[10px] leading-[14px] px-1 h-auto m-0" color={part.type_name?.toLowerCase().includes('out') ? 'orange' : 'green'}>{typeLabel}</Tag>
          {getRawMaterialStatusTag(part.raw_material_status)}
        </div>
      </div>
    );
  };

  const renderAssemblyTree = (assembly, level = 0, productId = null) => {
    const childAssemblies = getNestedAssemblies(assembly.id);
    const assemblyParts = getPartsForAssembly(assembly.id);
    const combinedChildren = [...assemblyParts.map(p => ({ ...p, __childType: 'part' })), ...childAssemblies.map(a => ({ ...a, __childType: 'assembly' }))].sort((a, b) => (a.id || 0) - (b.id || 0));
    const isExpanded = expandedItems[getExpandKey('assembly', assembly.id)];
    const hasChildren = combinedChildren.length > 0;
    const isSelected = activeItemId === assembly.id && activeItemType === 'assembly';

    return (
      <div key={`assembly-${assembly.id}`} className="select-none">
        <div
          className={`flex items-center justify-between px-2 py-1 rounded-md cursor-pointer transition-colors mb-0.5 border-l-2 ${isSelected ? 'bg-indigo-50 border-indigo-500 text-indigo-800' : 'hover:bg-slate-100 border-transparent'}`}
          style={{ marginLeft: `${level * 14}px` }}
          onClick={() => handleItemClick(assembly, 'assembly', productId || findProductIdForItem(assembly.id))}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex-shrink-0 w-5 flex justify-center">
              {hasChildren ? (
                <Button type="text" size="small" icon={isExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
                  onClick={(e) => { e.stopPropagation(); toggleExpand(getExpandKey('assembly', assembly.id)); }}
                  className="w-5 h-5 flex items-center justify-center p-0 text-slate-500 hover:bg-slate-200 rounded" />
              ) : <div className="w-5" />}
            </div>
            <span className="flex-shrink-0 text-sm">{getTypeIcon('assembly', level)}</span>
            <Text className={`text-sm font-medium truncate ${isSelected ? 'text-indigo-800' : 'text-slate-700'}`}>{assembly.assembly_name}</Text>
          </div>
          <Tag className="text-[10px] leading-[14px] px-1 h-auto m-0" color="blue">{level > 1 ? 'SUB-ASSEMBLY' : 'ASSEMBLY'}</Tag>
        </div>
        {isExpanded && hasChildren && (
          <div className="mt-0.5">
            {combinedChildren.map(child => child.__childType === 'part' ? renderPartInTree(child, level + 1, productId) : renderAssemblyTree(child, level + 1, productId))}
          </div>
        )}
      </div>
    );
  };

  const renderProductTree = (product) => {
    const productHierarchy = hierarchicalData[product.id];
    const childAssemblies = productHierarchy?.assemblies || [];
    const directParts = productHierarchy?.parts || [];
    const combinedChildren = [...directParts.map(p => ({ ...p, __childType: 'part' })), ...childAssemblies.map(a => ({ ...a, __childType: 'assembly' }))].sort((a, b) => (a.id || 0) - (b.id || 0));
    const isExpanded = expandedItems[getExpandKey('product', product.id)];
    const hasChildren = combinedChildren.length > 0;
    const isSelected = activeItemId === product.id && activeItemType === 'product';

    return (
      <div key={product.id} className="select-none mb-1">
        <div
          className={`flex items-center justify-between px-2 py-1 rounded-md cursor-pointer transition-colors mb-0.5 border-l-2 ${isSelected ? 'bg-indigo-50 border-indigo-500 text-indigo-800' : 'hover:bg-slate-100 border-transparent'}`}
          onClick={() => handleItemClick(product, 'product')}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex-shrink-0 w-5 flex justify-center">
              <Button type="text" size="small" icon={isExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
                onClick={(e) => { e.stopPropagation(); handleExpandProduct(product); }}
                className="w-5 h-5 flex items-center justify-center p-0 text-slate-500 hover:bg-slate-200 rounded" />
            </div>
            <span className="flex-shrink-0 text-sm">{getTypeIcon('product')}</span>
            <Text className={`text-sm font-semibold truncate ${isSelected ? 'text-indigo-800' : 'text-slate-800'}`}>{product.product_name}</Text>
          </div>
          <Tag className="text-[10px] leading-[14px] px-1 h-auto m-0" color="purple">PRODUCT</Tag>
        </div>
        {isExpanded && hasChildren && (
          <div className="mt-0.5 ml-2 border-l border-slate-200 pl-1">
            {combinedChildren.map(child => child.__childType === 'part' ? renderPartInTree(child, 1, product.id) : renderAssemblyTree(child, 1, product.id))}
          </div>
        )}
      </div>
    );
  };

  const initialPid = initialProductId != null ? Number(initialProductId) : null;
  const filteredProducts = initialPid ? products.filter(p => Number(p.id) === initialPid) : products.filter(product => (product.product_name || '').toLowerCase().includes(searchTerm.toLowerCase()));

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><Spin size="large" /></div>;

  return (
    <>
      <div className="flex flex-col h-full bg-slate-50/50">
        <div className="p-2 sm:p-3 border-b border-slate-200 bg-white shrink-0">
          <div className="flex justify-between items-center gap-2 mb-2 sm:mb-3">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <div className="p-1 sm:p-1.5 bg-indigo-100 rounded-lg shrink-0">
                <AppstoreOutlined className="text-indigo-600 text-sm sm:text-base" />
              </div>
              <h2 className="text-xs sm:text-sm font-semibold text-slate-800 m-0 truncate">Bill of Materials</h2>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {filteredProducts.length === 1 && (
                <Button type="default" size="small" icon={<ToolOutlined />} onClick={() => handleViewAllTools(filteredProducts[0])} className="bg-blue-50 text-blue-700 border-blue-200 text-xs font-medium px-3 py-1 rounded-md shadow-sm">View Tools</Button>
              )}
            </div>
          </div>
          {!initialPid && (
            <Input prefix={<SearchOutlined className="text-slate-400" />} placeholder="Search products..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="rounded-md text-sm border-slate-200" allowClear />
          )}
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 bom-scroll min-h-0">
          {filteredProducts.length > 0 ? filteredProducts.map(product => renderProductTree(product)) : (
            <div className="flex flex-col items-center justify-center min-h-[200px] text-slate-400">
              <Empty description={searchTerm ? 'No matches' : 'No products'} image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </div>
          )}
        </div>
      </div>
      <ProductToolsViewer
        visible={showToolsModal}
        onClose={() => { setShowToolsModal(false); setSelectedProductForTools(null); }}
        product={selectedProductForTools}
        hierarchicalData={selectedProductForTools ? originalHierarchicalData[selectedProductForTools.id] : null}
      />
    </>
  );
};

export default QualityManagementBOM;
