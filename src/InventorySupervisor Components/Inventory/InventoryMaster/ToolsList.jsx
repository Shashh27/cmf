import React, { useState, useEffect, useRef } from 'react';
import {
  Table, Button, Space, message, Input, Tag, Breadcrumb, Spin, Badge, Popconfirm, Tooltip, Modal, Dropdown,
  Form, DatePicker, Select, InputNumber, Skeleton
} from 'antd';
import dayjs from 'dayjs';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, RefreshCw, Upload, Download, Pencil, Trash2, Folder, Wrench, FlaskConical,
  ChevronRight, ChevronDown, ChevronLeft, Inbox, FileText, MoreHorizontal, Loader2
} from 'lucide-react';
import { API_BASE_URL } from '../../../Config/auth';
import ToolsHistory from './ToolsHistory';
import ToolsBulkUpload from './ToolsBulkUpload';
import CategorySubCategoryModal from './CategorySubCategoryModal';
import CustomColumnModal from './CustomColumnModal';
import * as XLSX from 'xlsx';

const { Search: AntSearch } = Input;

/* ═══════════════════════════════════════════════════════════
   SIDEBAR — 2-level tree with modern styling
═══════════════════════════════════════════════════════════ */
function SidebarTree({ tree, selected, onSelect, loading, expandedCats, toggleCat, searchText, onCreateCategory, onCreateSubCategory, onContextMenu }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
      </div>
    );
  }

  const sidebarFontStack = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

  // Dynamic icon mapping based on category name
  const getCategoryIcon = (category) => {
    const lowerCategory = category.toLowerCase();
    
    if (lowerCategory === 'tools') {
      return <Wrench className="w-5 h-5" />;
    } else if (lowerCategory === 'instruments') {
      return <FlaskConical className="w-5 h-5" />;
    }
    
    return <Folder className="w-5 h-5" />;
  };

  const getCategoryColor = (category) => {
    const lowerCategory = category.toLowerCase();
    
    if (lowerCategory === 'tools') {
      return { color: '#1677ff', bg: '#e6f4ff', hoverBg: '#bae0ff' };
    } else if (lowerCategory === 'instruments') {
      return { color: '#52c41a', bg: '#f6ffed', hoverBg: '#d9f7be' };
    }
    
    return { color: '#722ed1', bg: '#f9f0ff', hoverBg: '#efdbff' };
  };

  const highlightSubText = (text, query) => {
    if (!query) return text;
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);
    if (index === -1) return text;

    return (
      <>
        {text.substring(0, index)}
        <span className="bg-yellow-200 text-black px-0.5 rounded">{text.substring(index, index + query.length)}</span>
        {text.substring(index + query.length)}
      </>
    );
  };

  return (
    <div className="px-1 pb-2" style={{ fontFamily: sidebarFontStack }}>
      {tree.map(catNode => {
        const catExpanded = !!expandedCats[catNode.category];
        const isCatSelected = selected?.category === catNode.category && !selected?.sub_category;

        return (
          <motion.div 
            key={catNode.category} 
            className="mb-1"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* ── LEVEL 1: Category ── */}
            <motion.div
              onClick={() => {
                toggleCat(catNode.category);
                onSelect({ category: catNode.category, sub_category: null });
              }}
              onContextMenu={(e) => onContextMenu(e, 'category', { category: catNode.category })}
              className={`
                flex items-center gap-1.5 px-2 py-1.5 rounded cursor-pointer select-none
                transition-all duration-200 ease-in-out
                ${isCatSelected 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'text-slate-900 hover:bg-slate-100 hover:text-slate-900'
                }
              `}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
            >
              <motion.div 
                className="w-3 h-3 flex items-center justify-center text-slate-400"
                animate={{ rotate: catExpanded ? 90 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronRight className="w-3 h-3" />
              </motion.div>

              <div 
                className={`
                  w-5 h-5 flex-shrink-0 rounded flex items-center justify-center
                  transition-colors duration-200
                  ${isCatSelected ? 'text-blue-600' : 'text-slate-500'}
                `}
              >
                <Folder className="w-3.5 h-3.5" />
              </div>

              <span className="flex-1 text-sm font-medium">
                {catNode.category}
              </span>

              <Badge
                count={catNode.sub_categories.length}
                overflowCount={9999}
                style={{
                  backgroundColor: '#3b82f6',
                  fontSize: '10px',
                  height: '18px',
                  minWidth: '18px',
                  lineHeight: '18px',
                  borderRadius: '3px',
                  boxShadow: 'none',
                  fontWeight: 600
                }}
                showZero
              />
            </motion.div>

            {/* ── LEVEL 2: Sub-categories ── */}
            <AnimatePresence>
              {catExpanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="ml-5 mt-1 space-y-1"
                >
                  {catNode.sub_categories.map((subNode, index) => {
                    const subActive = selected?.category === catNode.category && selected?.sub_category === subNode.sub_category;
                    const isLast = index === catNode.sub_categories.length - 1;
                    return (
                      <motion.div
                        key={subNode.sub_category}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.15, delay: index * 0.05 }}
                        onClick={() => onSelect({ category: catNode.category, sub_category: subNode.sub_category })}
                        onContextMenu={(e) => onContextMenu(e, 'sub_category', { category: catNode.category, sub_category: subNode.sub_category })}
                        className={`
                          flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer select-none
                          transition-all duration-200 ease-in-out
                          ${subActive 
                            ? 'bg-blue-100 text-blue-700' 
                            : 'text-slate-900 hover:bg-slate-100 hover:text-slate-900'
                          }
                        `}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        style={{ position: 'relative', paddingLeft: '32px' }}
                      >
                        {/* Vertical connector line (above horizontal) */}
                        <div 
                          className="absolute left-0 border-l-2 border-slate-300"
                          style={{ 
                            left: '12px',
                            top: '0',
                            height: '50%'
                          }}
                        />
                        {/* Vertical connector line (below horizontal, only for non-last) */}
                        {!isLast && (
                          <div 
                            className="absolute left-0 border-l-2 border-slate-300"
                            style={{ 
                              left: '12px',
                              top: '50%',
                              height: '50%'
                            }}
                          />
                        )}
                        {/* Horizontal connector line */}
                        <div className="absolute left-0 border-t-2 border-slate-300" style={{ left: '12px', top: '50%', width: '16px' }} />
                        
                        <div className={`w-5 h-5 flex-shrink-0 rounded flex items-center justify-center z-10 ${subActive ? 'text-blue-600' : 'text-slate-500'}`}>
                          <FileText className="w-3.5 h-3.5" />
                        </div>
                        <span className="flex-1 text-sm font-medium pl-1.5">
                          {subNode.sub_category}
                        </span>
                        <Badge
                          count={subNode.count}
                          overflowCount={9999}
                          style={{
                            backgroundColor: '#22c55e',
                            fontSize: '10px',
                            height: '18px',
                            minWidth: '18px',
                            lineHeight: '18px',
                            borderRadius: '3px',
                            boxShadow: 'none',
                            fontWeight: 600
                          }}
                          showZero
                        />
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   CALIBRATION MODAL COMPONENT
═══════════════════════════════════════════════════════════ */
const CalibrationModal = ({ visible, onCancel, onSuccess, tool }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [frequencyUnit, setFrequencyUnit] = useState(null);

  useEffect(() => {
    if (visible && tool) {
      const formValues = {};
      
      if (tool.calibration_date) {
        formValues.calibration_date = dayjs(tool.calibration_date);
      }
      
      if (tool.calibration_frequency) {
        const freqParts = tool.calibration_frequency.split(' ');
        if (freqParts.length === 2) {
          formValues.calibration_frequency_value = parseInt(freqParts[0]);
          formValues.calibration_frequency_unit = freqParts[1];
          setFrequencyUnit(freqParts[1]);
        }
      }
      
      if (tool.calibration_due_date) {
        formValues.calibration_due_date = tool.calibration_due_date;
      }
      
      form.setFieldsValue(formValues);
    } else if (!visible) {
      form.resetFields();
      setFrequencyUnit(null);
    }
  }, [visible, tool, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      
      const updateData = {};
      
      if (values.calibration_date) {
        updateData.calibration_date = values.calibration_date.format('YYYY-MM-DD');
      }
      
      if (values.calibration_frequency_value && values.calibration_frequency_unit) {
        updateData.calibration_frequency = `${values.calibration_frequency_value} ${values.calibration_frequency_unit}`;
      }
      
      const hasChanges = 
        (updateData.calibration_date && updateData.calibration_date !== tool.calibration_date) ||
        (updateData.calibration_frequency && updateData.calibration_frequency !== tool.calibration_frequency);
      
      if (!hasChanges) {
        message.info('No changes made to calibration details');
        setLoading(false);
        return;
      }
      
      const response = await fetch(`${API_BASE_URL}/tools-list/${tool.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to update calibration');
      }
      
      message.success('Calibration updated successfully');
      onSuccess();
    } catch (error) {
      if (error.errorFields) {
        return;
      }
      console.error('Failed to update calibration:', error);
      message.error('Failed to update calibration: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const { Option } = Select;

  return (
    <Modal
      title={tool?.calibration_date ? 'Update Calibration' : 'Add Calibration'}
      open={visible}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel} className="rounded-xl h-10 px-6">
          Cancel
        </Button>,
        <Button key="submit" type="primary" loading={loading} onClick={handleSubmit} className="rounded-xl h-10 px-6">
          {tool?.calibration_date ? 'Update' : 'Add'}
        </Button>,
      ]}
      width={600}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="calibration_date"
          label="Calibration Date"
        >
          <DatePicker 
            style={{ width: '100%', borderRadius: '8px' }}
            format="YYYY-MM-DD"
            placeholder="Select calibration date"
          />
        </Form.Item>
        
        <Form.Item
          name="calibration_frequency"
          label="Calibration Frequency"
          tooltip="Frequency for calibration (e.g., every 6 months, 1 year)"
        >
          <div style={{ display: 'flex', gap: '8px' }}>
            <Form.Item
              name="calibration_frequency_value"
              noStyle
            >
              <Input
                type="text"
                style={{ width: '100%', borderRadius: '8px' }}
                placeholder="Enter value"
                disabled={!frequencyUnit}
                maxLength={frequencyUnit === 'days' ? 3 : 2}
                onChange={(e) => {
                  const value = e.target.value;
                  if (!/^\d*$/.test(value)) {
                    e.target.value = value.replace(/\D/g, '');
                    form.setFieldsValue({ calibration_frequency_value: e.target.value });
                    return;
                  }
                  if (value) {
                    const numValue = Number(value);
                    const maxValue = frequencyUnit === 'days' ? 365 : frequencyUnit === 'months' ? 24 : 10;
                    if (numValue > maxValue) {
                      form.setFieldsValue({ calibration_frequency_value: maxValue });
                    }
                  }
                }}
              />
            </Form.Item>
            <Form.Item
              name="calibration_frequency_unit"
              noStyle
            >
              <Select
                style={{ width: '120px', borderRadius: '8px' }}
                placeholder="Unit"
                onChange={(value) => {
                  setFrequencyUnit(value);
                  form.setFieldsValue({ calibration_frequency_value: null });
                }}
              >
                <Option value="days">Days</Option>
                <Option value="months">Months</Option>
                <Option value="years">Years</Option>
              </Select>
            </Form.Item>
          </div>
          <div style={{ fontSize: '12px', color: '#8c8c8c', marginTop: '4px' }}>
            {frequencyUnit === 'days' && 'Valid range: 1-365 days'}
            {frequencyUnit === 'months' && 'Valid range: 1-24 months'}
            {frequencyUnit === 'years' && 'Valid range: 1-10 years'}
          </div>
        </Form.Item>

        <Form.Item name="calibration_due_date" label="Calibration Due Date">
          <Input 
            placeholder="Auto-calculated by backend" 
            disabled
            style={{ backgroundColor: '#f5f5f5', borderRadius: '8px' }}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════ */
const ToolsList = ({ onEdit, onDelete, onCreateNew }) => {
  const [tree,         setTree]         = useState([]);
  const [treeLoading,  setTreeLoading]  = useState(false);
  const [expandedCats, setExpandedCats] = useState({});
  const [selected,     setSelected]     = useState(null);
  const [tools,        setTools]        = useState([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [searchText,   setSearchText]   = useState('');
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    type: null, // 'category' or 'sub_category'
    data: null // { category, sub_category }
  });
  
  // Edit modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editModalData, setEditModalData] = useState({ type: null, oldName: '', categoryName: '' });
  const [editModalValue, setEditModalValue] = useState('');
  const [treeSearchText, setTreeSearchText] = useState('');
  const [filteredData, setFilteredData] = useState([]);
  const [pagination,   setPagination]   = useState({ current: 1, pageSize: 10 });
  const [collapsed,    setCollapsed]    = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [historyTool,    setHistoryTool]    = useState(null);
  const [bulkUploadVisible, setBulkUploadVisible] = useState(false);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [categoryModalMode, setCategoryModalMode] = useState('category');
  const [parentCategoryForSub, setParentCategoryForSub] = useState(null);
  const [calibrationModalVisible, setCalibrationModalVisible] = useState(false);
  const [calibrationTool, setCalibrationTool] = useState(null);
  const [customColumnModalVisible, setCustomColumnModalVisible] = useState(false);
  const [customColumnMode, setCustomColumnMode] = useState(null); // 'category' or 'sub_category'
  const [customColumnTarget, setCustomColumnTarget] = useState(null); // { category, sub_category, category_id, sub_category_id }
  const [customColumns, setCustomColumns] = useState([]); // Custom columns for current view

  const fetchingTree  = useRef(false);
  const fetchingTable = useRef(false);

  useEffect(() => { fetchTree(); }, []);

  const displayTree = tree;

  // Filter tree based on sidebar search
  const filteredTree = React.useMemo(() => {
    if (!treeSearchText.trim()) return displayTree;
    const lowerSearch = treeSearchText.toLowerCase();

    return displayTree.map(catNode => {
      // Search within sub-categories OR search within the items (leaf nodes) inside those sub-categories
      const filteredSubCats = catNode.sub_categories.map(sub => {
        const subMatches = sub.sub_category.toLowerCase().includes(lowerSearch);
        const matchingItems = sub.items?.filter(item =>
          item.item_description.toLowerCase().includes(lowerSearch)
        ) || [];

        if (subMatches || matchingItems.length > 0) {
          return {
            ...sub,
            hasItemMatch: matchingItems.length > 0,
            itemMatches: matchingItems
          };
        }
        return null;
      }).filter(Boolean);

      if (filteredSubCats.length > 0) {
        return {
          ...catNode,
          sub_categories: filteredSubCats,
          hasSubMatch: true
        };
      }
      return null;
    }).filter(Boolean);
  }, [displayTree, treeSearchText]);

  // Auto-expand categories that have matching sub-categories
  useEffect(() => {
    if (treeSearchText.trim()) {
      const newExpanded = { ...expandedCats };
      filteredTree.forEach(catNode => {
        if (catNode.hasSubMatch) {
          newExpanded[catNode.category] = true;
        }
      });
      setExpandedCats(newExpanded);
    }
  }, [treeSearchText]);

  useEffect(() => {
    if (selected?.sub_category && selected?.category) {
      fetchBySubCategory(selected.category, selected.sub_category);
    } else if (selected?.category) {
      // Don't fetch tools for category-only selection
      // Tools are only added to sub-categories
      setTools([]);
      setFilteredData([]);
    } else {
      setTools([]);
      setFilteredData([]);
    }
  }, [selected]);

  useEffect(() => {
    if (!searchText.trim()) { setFilteredData(tools); return; }
    const lower = searchText.toLowerCase();
    setFilteredData(
      tools.filter(t =>
        Object.values(t).some(v =>
          v != null && String(v).toLowerCase().includes(lower)
        )
      )
    );
    setPagination(p => ({ ...p, current: 1 }));
  }, [searchText, tools]);

  const fetchTree = async () => {
    if (fetchingTree.current) return;
    fetchingTree.current = true;
    setTreeLoading(true);
    try {
      const res  = await fetch(`${API_BASE_URL}/tools-list/categories/tree`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTree(data);
    } catch (e) {
      message.error('Failed to load categories: ' + e.message);
    } finally {
      setTreeLoading(false);
      fetchingTree.current = false;
    }
  };

  const fetchByCategory = async (category) => {
    if (fetchingTable.current) return;
    fetchingTable.current = true;
    setTableLoading(true);
    setTools([]);
    setFilteredData([]);
    try {
      const url = `${API_BASE_URL}/tools-list/?category=${encodeURIComponent(category)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const sorted = Array.isArray(data)
        ? [...data].sort((a, b) => (a.id || 0) - (b.id || 0))
        : [];
      setTools(sorted);
      setFilteredData(sorted);
      setPagination(p => ({ ...p, current: 1 }));
    } catch (e) {
      message.error('Failed to load category tools: ' + e.message);
    } finally {
      setTableLoading(false);
      fetchingTable.current = false;
    }
  };

  const fetchBySubCategory = async (category, sub_category) => {
    if (fetchingTable.current) return;
    fetchingTable.current = true;
    setTableLoading(true);
    setTools([]);
    setFilteredData([]);
    try {
      const url = `${API_BASE_URL}/tools-list/category/${encodeURIComponent(category)}/sub/${encodeURIComponent(sub_category)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const sorted = Array.isArray(data)
        ? [...data].sort((a, b) => (a.id || 0) - (b.id || 0))
        : [];
      setTools(sorted);
      setFilteredData(sorted);
      setPagination(p => ({ ...p, current: 1 }));

      // Fetch custom columns for this sub-category
      fetchCustomColumnsForView(category, sub_category);
    } catch (e) {
      message.error('Failed to load sub-category tools: ' + e.message);
    } finally {
      setTableLoading(false);
      fetchingTable.current = false;
    }
  };

  const fetchCustomColumnsForView = async (category, sub_category) => {
    try {
      // Fetch all custom columns
      const response = await fetch(`${API_BASE_URL}/tools-list/custom-columns`);
      if (!response.ok) {
        setCustomColumns([]);
        return;
      }

      const responseData = await response.json();
      const allColumns = responseData.data || [];

      // Get category and sub-category IDs from tree
      const catNode = tree.find(c => c.category === category);
      if (!catNode) {
        setCustomColumns([]);
        return;
      }

      let categoryId = catNode.id;
      let subCategoryId = null;

      if (sub_category) {
        const subNode = catNode.sub_categories.find(s => s.sub_category === sub_category);
        if (subNode) {
          subCategoryId = subNode.id;
        }
      }

      // Filter columns based on category/sub-category
      const filteredColumns = allColumns.filter(col => {
        if (subCategoryId) {
          // Include columns for this sub-category OR for the parent category
          return col.sub_category_id === subCategoryId || col.category_id === categoryId;
        } else if (categoryId) {
          // Only category is selected, include columns for this category
          return col.category_id === categoryId;
        }
        return false;
      });

      // Deduplicate columns by column_name (sub-category columns take precedence)
      const uniqueColumns = [];
      const seenNames = new Set();
      for (const col of filteredColumns) {
        const colNameLower = col.column_name.toLowerCase().trim();
        if (!seenNames.has(colNameLower)) {
          seenNames.add(colNameLower);
          uniqueColumns.push(col);
        }
      }

      setCustomColumns(uniqueColumns);
    } catch (error) {
      console.error('Failed to fetch custom columns:', error);
      setCustomColumns([]);
    }
  };

  const handleBulkUpload = () => {
    setBulkUploadVisible(true);
  };

  const handleBulkUploadSuccess = () => {
    fetchTree();
    if (selected?.sub_category) {
      fetchBySubCategory(selected.category, selected.sub_category);
    } else {
      // Don't fetch for category-only selection
      setTools([]);
      setFilteredData([]);
    }
  };

  const handleCreateCategory = () => {
    setCategoryModalMode('category');
    setParentCategoryForSub(null);
    setCategoryModalVisible(true);
  };

  const handleCreateSubCategory = (parentCategory) => {
    setCategoryModalMode('sub_category');
    setParentCategoryForSub(parentCategory);
    setCategoryModalVisible(true);
  };

  // Context menu handlers
  const handleContextMenu = (e, type, data) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      type,
      data
    });
  };

  const hideContextMenu = () => {
    setContextMenu({ ...contextMenu, visible: false });
  };

  // Hide context menu on click outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu.visible) {
        hideContextMenu();
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [contextMenu.visible]);

  const handleEditCategory = () => {
    const { category } = contextMenu.data;
    setEditModalData({ type: 'category', oldName: category, categoryName: category });
    setEditModalValue(category);
    setEditModalVisible(true);
    hideContextMenu();
  };

  const handleEditSubCategory = () => {
    const { category, sub_category } = contextMenu.data;
    setEditModalData({ type: 'sub_category', oldName: sub_category, categoryName: category });
    setEditModalValue(sub_category);
    setEditModalVisible(true);
    hideContextMenu();
  };

  const handleEditModalOk = async () => {
    if (!editModalValue || editModalValue.trim() === '') {
      message.error('Name cannot be empty');
      return;
    }
    
    try {
      if (editModalData.type === 'category') {
        const res = await fetch(`${API_BASE_URL}/tools-list/categories`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ old_name: editModalData.oldName, new_name: editModalValue.trim() })
        });
        if (!res.ok) throw new Error((await res.json()).detail || 'Failed to update category');
        message.success('Category updated successfully');
      } else {
        const res = await fetch(`${API_BASE_URL}/tools-list/sub-categories`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            category: editModalData.categoryName, 
            old_name: editModalData.oldName, 
            new_name: editModalValue.trim() 
          })
        });
        if (!res.ok) throw new Error((await res.json()).detail || 'Failed to update sub-category');
        message.success('Sub-category updated successfully');
        // Update selected if it was this sub-category
        if (selected?.category === editModalData.categoryName && selected?.sub_category === editModalData.oldName) {
          setSelected({ category: editModalData.categoryName, sub_category: editModalValue.trim() });
        }
      }
      fetchTree();
      setEditModalVisible(false);
    } catch (err) {
      message.error('Failed to update: ' + err.message);
    }
  };

  const handleDeleteCategory = () => {
    const { category } = contextMenu.data;
    Modal.confirm({
      title: 'Delete Category',
      content: `Are you sure you want to delete "${category}"? This will delete the category, all its sub-categories, and all tools under them. This action cannot be undone.`,
      okText: 'Delete',
      okType: 'danger',
      onOk: async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/tools-list/categories/${encodeURIComponent(category)}`, {
            method: 'DELETE'
          });
          if (!res.ok) throw new Error((await res.json()).detail || 'Failed to delete category');
          message.success('Category deleted successfully');
          fetchTree();
          setSelected(null);
          setTools([]);
          setFilteredData([]);
        } catch (err) {
          message.error('Failed to delete category: ' + err.message);
        }
      }
    });
    hideContextMenu();
  };

  const handleDeleteSubCategory = () => {
    const { category, sub_category } = contextMenu.data;
    Modal.confirm({
      title: 'Delete Sub-Category',
      content: `Are you sure you want to delete "${sub_category}"? This will delete the sub-category and all tools under it. This action cannot be undone.`,
      okText: 'Delete',
      okType: 'danger',
      onOk: async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/tools-list/sub-categories/${encodeURIComponent(category)}/${encodeURIComponent(sub_category)}`, {
            method: 'DELETE'
          });
          if (!res.ok) throw new Error((await res.json()).detail || 'Failed to delete sub-category');
          message.success('Sub-category deleted successfully');
          fetchTree();
          setSelected(null);
          setTools([]);
          setFilteredData([]);
        } catch (err) {
          message.error('Failed to delete sub-category: ' + err.message);
        }
      }
    });
    hideContextMenu();
  };

  const handleAddSubCategoryFromMenu = () => {
    const { category } = contextMenu.data;
    handleCreateSubCategory(category);
    hideContextMenu();
  };

  const handleCategoryModalSuccess = () => {
    fetchTree();
    setCategoryModalVisible(false);
  };

  const handleAddCustomColumn = () => {
    // If called from context menu, use contextMenu.data
    // If called from button, use selected
    const source = contextMenu.data || selected;
    const { category, sub_category } = source;
    
    // Find category_id and sub_category_id from tree
    let category_id = null;
    let sub_category_id = null;
    
    const catNode = tree.find(c => c.category === category);
    if (catNode) {
      category_id = catNode.id;
      if (sub_category) {
        const subNode = catNode.sub_categories.find(s => s.sub_category === sub_category);
        if (subNode) {
          sub_category_id = subNode.id;
        }
      }
    }
    
    setCustomColumnMode(sub_category ? 'sub_category' : 'category');
    setCustomColumnTarget({
      category,
      sub_category,
      category_id,
      sub_category_id
    });
    setCustomColumnModalVisible(true);
    
    // Hide context menu if it was called from context menu
    if (contextMenu.visible) {
      hideContextMenu();
    }
  };

  const handleCustomColumnModalSuccess = () => {
    // Refresh the tools table to show new columns
    if (selected?.sub_category) {
      fetchBySubCategory(selected.category, selected.sub_category);
    } else if (selected?.category) {
      // If only category is selected, fetch custom columns for the category
      fetchCustomColumnsForView(selected.category, null);
    }
    setCustomColumnModalVisible(false);
  };


  const handleExportExcel = () => {
    if (!tools || tools.length === 0) {
      message.warning('No data to export');
      return;
    }
    const exportData = tools.map((t, index) => ({
      'SL No': index + 1,
      'Item Description': t.item_description || '',
      'Range / Size': t.range || '',
      'ID Code': t.identification_code || '',
      'Make': t.make || '',
      'Total Qty': t.total_quantity ?? t.quantity ?? 0,
      'Available': t.quantity ?? 0,
      'Issued': t.issues_qty ?? 0,
      'Location': t.location || '',
      'Gauge': t.gauge || '',
      'Remarks': t.remarks || '',
      'Amount': t.amount != null ? `₹${Number(t.amount).toFixed(2)}` : '',
      'Type': t.type || '',
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tools List');
    XLSX.writeFile(wb, 'Inventory_Master_Data.xlsx');
    message.success('Exported successfully');
  };

  const toggleCat = (cat) => setExpandedCats(p => ({ ...p, [cat]: !p[cat] }));
  const expandAll = () => {
    const newCats = {};
    tree.forEach(catNode => { newCats[catNode.category] = true; });
    setExpandedCats(newCats);
  };
  const collapseAll = () => setExpandedCats({});

  // Build columns array dynamically based on selected category
  const columns = React.useMemo(() => {
    const baseColumns = [
      {
        title: 'SL No', key: 'sl_no', width: 90, fixed: 'left', align: 'center',
        render: (_, __, i) => <span style={{ color: '#8c8c8c', fontSize: 11, fontWeight: 500 }}>{(pagination.current - 1) * pagination.pageSize + i + 1}</span>,
      },
      {
        title: 'Item Description', dataIndex: 'item_description', key: 'item_description', fixed: 'left', ellipsis: true, align: 'center', sorter: (a, b) => (a.item_description || '').localeCompare(b.item_description || ''),
        render: (text, record) => (
          <Button
            type="link"
            style={{ padding: 0, fontSize: 13, fontWeight: 600, color: '#1677ff', height: 'auto', textAlign: 'center', width: '100%' }}
            onClick={() => { setHistoryTool(record); setHistoryVisible(true); }}
          >
            {text}
          </Button>
        ),
      },
      { title: 'Range / Size', dataIndex: 'range', key: 'range', ellipsis: true, align: 'center', sorter: (a, b) => (a.range || '').localeCompare(b.range || ''), render: v => <span style={{ fontSize: 12 }}>{v || <span style={{ color: '#bfbfbf' }}>—</span>}</span> },
      { title: 'ID Code', dataIndex: 'identification_code', key: 'identification_code', ellipsis: true, align: 'center', sorter: (a, b) => (a.identification_code || '').localeCompare(b.identification_code || ''), render: v => <code style={{ fontSize: 12, background: '#f5f5f5', padding: '2px 4px', borderRadius: 4, color: '#595959' }}>{v || '—'}</code> },
      { title: 'Make', dataIndex: 'make', key: 'make', ellipsis: true, align: 'center', sorter: (a, b) => (a.make || '').localeCompare(b.make || ''), render: v => <span style={{ fontSize: 12 }}>{v || <span style={{ color: '#bfbfbf' }}>—</span>}</span> },
      { title: 'Total Qty', dataIndex: 'total_quantity', key: 'total_quantity', align: 'center', sorter: (a, b) => (a.total_quantity ?? a.quantity ?? 0) - (b.total_quantity ?? b.quantity ?? 0), render: (v, r) => <span style={{ fontWeight: 600, fontSize: 13 }}>{v ?? r.quantity ?? 0}</span> },
      {
        title: 'Available', dataIndex: 'quantity', key: 'quantity', align: 'center', sorter: (a, b) => (a.quantity ?? 0) - (b.quantity ?? 0),
        render: (v) => <span style={{ fontSize: 13, fontWeight: 600, color: '#595959' }}>{v ?? 0}</span>,
      },
      { title: 'Issues', dataIndex: 'issues_qty', key: 'issues_qty', align: 'center', sorter: (a, b) => (a.issues_qty ?? 0) - (b.issues_qty ?? 0), render: v => <span style={{ color: '#8c8c8c', fontSize: 12 }}>{v ?? 0}</span> },
      {
        title: 'Location', dataIndex: 'location', key: 'location', ellipsis: true, align: 'center', sorter: (a, b) => (a.location || '').localeCompare(b.location || ''),
        render: v => v ? <Tag color="blue" style={{ borderRadius: 4, fontSize: 11, margin: 0 }}>{v}</Tag> : <span style={{ color: '#bfbfbf' }}>—</span>
      },
      { title: 'Gauge', dataIndex: 'gauge', key: 'gauge', ellipsis: true, align: 'center', sorter: (a, b) => (a.gauge || '').localeCompare(b.gauge || ''), render: v => <span style={{ fontSize: 12 }}>{v || <span style={{ color: '#bfbfbf' }}>—</span>}</span> },
      { title: 'Remarks', dataIndex: 'remarks', key: 'remarks', ellipsis: true, align: 'center', sorter: (a, b) => (a.remarks || '').localeCompare(b.remarks || ''), render: v => <span style={{ fontSize: 12, color: '#8c8c8c' }}>{v || <span style={{ color: '#d9d9d9' }}>—</span>}</span> },
      { title: 'Amount', dataIndex: 'amount', key: 'amount', align: 'center', sorter: (a, b) => (a.amount ?? 0) - (b.amount ?? 0), render: v => v != null ? <span style={{ fontWeight: 600, color: '#389e0d', fontSize: 13 }}>₹{Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span> : <span style={{ color: '#bfbfbf' }}>—</span> },
      {
        title: 'Type', dataIndex: 'type', key: 'type', align: 'center', sorter: (a, b) => (a.type || '').localeCompare(b.type || ''),
        render: v => {
          if (!v) return null;
          const isConsumable = v.toUpperCase() === 'CONSUMABLES';
          return (
            <Tag
              color={isConsumable ? 'cyan' : 'geekblue'}
              style={{ borderRadius: 12, padding: '0 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}
            >
              {v}
            </Tag>
          );
        }
      },
    ];

    // Add custom columns dynamically
    customColumns.forEach(col => {
      baseColumns.push({
        title: col.column_name,
        key: col.column_key,
        ellipsis: true,
        align: 'center',
        sorter: (a, b) => {
          const aVal = a.custom_fields?.[col.column_key] || '';
          const bVal = b.custom_fields?.[col.column_key] || '';
          return String(aVal).localeCompare(String(bVal));
        },
        render: (_, record) => {
          const value = record.custom_fields?.[col.column_key];
          if (value === undefined || value === null || value === '') {
            return <span style={{ color: '#bfbfbf' }}>—</span>;
          }
          if (col.data_type === 'boolean') {
            return value ? <Tag color="green" style={{ borderRadius: 4, fontSize: 11 }}>Yes</Tag> : <Tag color="red" style={{ borderRadius: 4, fontSize: 11 }}>No</Tag>;
          }
          if (col.data_type === 'date') {
            return <span style={{ fontSize: 12 }}>{value}</span>;
          }
          return <span style={{ fontSize: 12 }}>{value}</span>;
        },
      });
    });

    // Add Calibration column only for Instruments category
    const isInstrumentsCategory = selected?.category?.toLowerCase() === 'instruments';
    if (isInstrumentsCategory) {
      baseColumns.splice(baseColumns.length, 0, {
        title: 'Calibration', key: 'calibration', width: 130, align: 'center',
        render: (_, record) => (
          <Button
            type="primary"
            size="small"
            onClick={() => {
              setCalibrationTool(record);
              setCalibrationModalVisible(true);
            }}
            style={{ 
              background: record.calibration_date ? '#52c41a' : '#1677ff',
              borderColor: record.calibration_date ? '#52c41a' : '#1677ff',
              borderRadius: 6,
              fontSize: 11
            }}
          >
            Calibration
          </Button>
        ),
      });
    }

    baseColumns.push({
      title: 'Actions', key: 'actions', width: 120, fixed: 'right', align: 'center',
      render: (_, record) => (
        <Space size={6}>
          <Tooltip title="Edit Record">
            <Button
              type="text"
              size="small"
              icon={<Pencil className="w-4 h-4" />}
              className="rounded-lg text-blue-600 bg-blue-50 hover:bg-blue-100"
              onClick={() => onEdit(record)}
            />
          </Tooltip>
          <Popconfirm
            title="Delete this record?"
            description="Are you sure you want to delete this tool?"
            onConfirm={() => onDelete(record)}
            okText="Delete"
            cancelText="Cancel"
            okButtonProps={{ danger: true, size: 'small', className: 'rounded-lg' }}
            cancelButtonProps={{ size: 'small', className: 'rounded-lg' }}
          >
            <Tooltip title="Delete Record">
              <Button
                type="text"
                size="small"
                icon={<Trash2 className="w-4 h-4" />}
                className="rounded-lg text-red-600 bg-red-50 hover:bg-red-100"
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    });

    return baseColumns;
  }, [selected?.category, pagination.current, pagination.pageSize, onEdit, onDelete, customColumns]);

  const breadcrumbItems = [
    { title: 'Inventory' },
    selected?.category     ? { title: selected.category }     : null,
    selected?.sub_category ? { title: selected.sub_category } : null,
  ].filter(Boolean);

  const mainFontStack = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

  return (
    <div className="flex overflow-hidden p-2 sm:p-4 gap-2 sm:gap-4 h-[calc(100vh-60px)] sm:h-[calc(100vh-80px)] lg:h-[calc(100vh-100px)]" style={{ fontFamily: mainFontStack }}>
      {/* ── SIDEBAR ── */}
      <AnimatePresence>
        {!collapsed && (
          <>
            {/* Mobile Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black z-20 sm:hidden"
              onClick={() => setCollapsed(true)}
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className={`
                fixed sm:relative sm:static
                w-72 sm:w-72 lg:w-80 min-w-[280px]
                bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-slate-200 
                flex flex-col overflow-hidden z-30 sm:z-10 shrink-0
                top-0 left-0 h-full sm:h-auto
              `}
            >
        {/* Sticky Header */}
        <div className="p-2.5 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-slate-800 tracking-tight">Categories</h2>
            <Space size={2}>
              <Button 
                type="text" 
                size="small" 
                icon={<ChevronLeft className="w-3.5 h-3.5" />} 
                onClick={() => setCollapsed(true)} 
                className="sm:hidden text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded"
              />
              <Tooltip title="Expand All">
                <Button 
                  type="text" 
                  size="small" 
                  icon={<ChevronDown className="w-3.5 h-3.5" />} 
                  onClick={expandAll} 
                  className="text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded"
                />
              </Tooltip>
              <Tooltip title="Collapse All">
                <Button 
                  type="text" 
                  size="small" 
                  icon={<ChevronRight className="w-3.5 h-3.5" />} 
                  onClick={collapseAll} 
                  className="text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded"
                />
              </Tooltip>
              <Button 
                type="text" 
                size="small" 
                icon={<ChevronLeft className="w-3.5 h-3.5" />} 
                onClick={() => setCollapsed(true)} 
                className="hidden sm:block text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded"
              />
            </Space>
          </div>
        </div>

        {/* Scrollable Tree */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <SidebarTree 
            tree={filteredTree} 
            selected={selected} 
            onSelect={(node) => { setSelected(node); setSearchText(''); }} 
            loading={treeLoading} 
            expandedCats={expandedCats} 
            toggleCat={toggleCat} 
            searchText={treeSearchText}
            onCreateCategory={handleCreateCategory}
            onCreateSubCategory={handleCreateSubCategory}
            onContextMenu={handleContextMenu}
          />
        </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── CONTENT ── */}
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
        className="flex-1 flex flex-col overflow-hidden relative bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-slate-200"
      >
        {/* Mobile Header with Menu Toggle */}
        <div className="sm:hidden p-3 border-b border-slate-100 flex items-center justify-between">
          <Button
            type="text"
            icon={collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
            onClick={() => setCollapsed(!collapsed)}
            className="text-slate-600"
          />
          <h2 className="text-sm font-bold text-slate-800">Inventory</h2>
          <div className="w-8"></div>
        </div>

        {/* Header Bar - Always Visible */}
            <div className="bg-white px-3 sm:px-6 py-2 sm:py-3 flex items-center justify-between border-b border-slate-200">
              <div className="flex items-center gap-2 sm:gap-4">
                {collapsed && (
                  <Button
                    type="primary"
                    shape="circle"
                    size="small"
                    icon={<ChevronLeft className="w-4 h-4" />}
                    onClick={() => setCollapsed(false)}
                    className="flex items-center justify-center"
                  />
                )}
                <Breadcrumb
                  items={breadcrumbItems}
                  separator={<ChevronRight className="w-3 h-3 text-slate-300" />}
                  className="text-xs sm:text-sm font-medium hidden sm:block"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="primary"
                  size="small"
                  icon={<Plus className="w-4 h-4" />}
                  onClick={handleCreateCategory}
                  className="rounded-lg h-8 px-3 text-xs sm:text-sm"
                >
                  Create Category
                </Button>
                {selected && (
                  <Input
                    placeholder="Search..."
                    prefix={<Search className="w-4 h-4 text-slate-400" />}
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                    allowClear
                    className="w-32 sm:w-48 h-8 rounded-lg border-slate-300"
                    size="small"
                  />
                )}
              </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 p-3 sm:p-6 overflow-y-auto flex flex-col">
              {!selected ? (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="flex-1 flex flex-col items-center justify-center p-8 sm:p-16"
                >
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.1 }}
                    className="w-16 h-16 sm:w-24 sm:h-24 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center mb-4 sm:mb-6 shadow-lg"
                  >
                    <Inbox className="w-8 h-8 sm:w-12 sm:h-12 text-blue-600" />
                  </motion.div>
                  <motion.h3 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.2 }}
                    className="text-base sm:text-lg font-semibold text-slate-700 mb-2"
                  >
                    No Category Selected
                  </motion.h3>
                  <motion.p 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.3 }}
                    className="text-xs sm:text-sm text-slate-500 text-center max-w-md leading-relaxed px-4"
                  >
                    Select a category or sub-category from the tree to view inventory records.
                  </motion.p>
                </motion.div>
              ) : selected.category && !selected.sub_category ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex-1 flex flex-col items-center justify-center p-8 sm:p-16"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="w-16 h-16 sm:w-24 sm:h-24 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-orange-50 to-orange-100 flex items-center justify-center mb-4 sm:mb-6 shadow-lg"
            >
              <Wrench className="w-8 h-8 sm:w-12 sm:h-12 text-orange-600" />
            </motion.div>
            <motion.h3 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="text-base sm:text-lg font-semibold text-slate-700 mb-2"
            >
              Category Selected
            </motion.h3>
            <motion.p 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
              className="text-xs sm:text-sm text-slate-500 text-center max-w-md leading-relaxed px-4"
            >
              Tools are only added to sub-categories. Please select a sub-category from the sidebar to view tools.
            </motion.p>
          </motion.div>
        ) : (
          <div className="flex flex-col gap-4 sm:gap-6">
            {/* Title & Actions Row */}
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex items-end justify-between flex-wrap gap-3 sm:gap-4"
            >
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight mb-1">
                    {selected?.sub_category || selected?.category}
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-500 font-medium">
                    {selected.category} {selected.sub_category && <span className="opacity-50 mx-1">/</span>} {selected.sub_category}
                  </p>
                </div>
                <Space size={6} sm={8} className="flex-wrap">
                  <Button
                    type="primary"
                    icon={<Plus className="w-3.5 h-3.5" />}
                    size="small"
                    onClick={() => onCreateNew(selected)}
                    className="rounded font-medium h-8 px-3 text-xs"
                  >
                    <span className="hidden sm:inline">Add Row</span>
                    <span className="sm:hidden">Add</span>
                  </Button>
                  {selected?.sub_category && (
                    <Button
                      icon={<Folder className="w-3.5 h-3.5" />}
                      size="small"
                      onClick={handleAddCustomColumn}
                      className="rounded font-medium h-8 px-3 text-xs"
                    >
                      <span className="hidden sm:inline">Add Column</span>
                      <span className="sm:hidden">Column</span>
                    </Button>
                  )}
                  <div className="flex gap-1 sm:gap-1.5">
                    <Tooltip title="Import">
                      <Button 
                        icon={<Upload className="w-3.5 h-3.5" />} 
                        size="small" 
                        onClick={handleBulkUpload} 
                        className="rounded font-medium h-8 w-8 flex items-center justify-center" 
                      />
                    </Tooltip>
                    <Tooltip title="Export">
                      <Button 
                        icon={<Download className="w-3.5 h-3.5" />} 
                        size="small" 
                        onClick={handleExportExcel} 
                        className="rounded font-medium h-8 w-8 flex items-center justify-center" 
                      />
                    </Tooltip>
                    <Tooltip title="Refresh">
                      <Button
                        icon={<RefreshCw className="w-3.5 h-3.5" />}
                        size="small"
                        onClick={() => {
                          fetchTree();
                          if (selected?.sub_category) {
                            fetchBySubCategory(selected.category, selected.sub_category);
                          } else {
                            setTools([]);
                            setFilteredData([]);
                          }
                        }}
                        className="rounded h-8 w-8 flex items-center justify-center hover:bg-slate-100"
                      />
                    </Tooltip>
                  </div>
                </Space>
              </motion.div>

              {/* Table Container */}
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 }}
                className="bg-white border border-slate-200 overflow-hidden flex-1 flex flex-col shadow-sm"
              >
                <Table
                  columns={columns}
                  dataSource={filteredData}
                  rowKey="id"
                  loading={tableLoading}
                  size="middle"
                  scroll={{ x: 'max-content', y: 'calc(100vh - 400px)' }}
                  pagination={{
                    current: pagination.current,
                    pageSize: pagination.pageSize,
                    showSizeChanger: true,
                    pageSizeOptions: ['10', '20', '50', '100'],
                    showTotal: (total, range) => (
                      <span className="text-xs sm:text-sm text-slate-500">
                        Showing <b className="text-slate-700">{range[0]}-{range[1]}</b> of <b className="text-slate-700">{total}</b> items
                      </span>
                    ),
                    className: 'px-4 sm:px-6 py-3 sm:py-4 m-0 border-t border-slate-200',
                    onChange: (page, size) => setPagination({ current: page, pageSize: size }),
                  }}
                  className="ag-grid-style"
                />
              </motion.div>
            </div>
          )}
        </div>
      </motion.div>
      <ToolsHistory tool={historyTool} visible={historyVisible} onClose={() => { setHistoryVisible(false); setHistoryTool(null); }} />
      <ToolsBulkUpload 
        visible={bulkUploadVisible} 
        onCancel={() => setBulkUploadVisible(false)} 
        onSuccess={handleBulkUploadSuccess}
        selectedCategory={selected?.category}
        selectedSubCategory={selected?.sub_category}
      />
      <CategorySubCategoryModal
        visible={categoryModalVisible}
        onCancel={() => setCategoryModalVisible(false)}
        onSuccess={handleCategoryModalSuccess}
        mode={categoryModalMode}
        parentCategory={parentCategoryForSub}
      />
      
      {/* Custom Column Modal */}
      <CustomColumnModal
        visible={customColumnModalVisible}
        onCancel={() => setCustomColumnModalVisible(false)}
        onSuccess={handleCustomColumnModalSuccess}
        mode={customColumnMode}
        target={customColumnTarget}
      />

      {/* Calibration Modal */}
      <CalibrationModal
        visible={calibrationModalVisible}
        onCancel={() => {
          setCalibrationModalVisible(false);
          setCalibrationTool(null);
        }}
        onSuccess={() => {
          setCalibrationModalVisible(false);
          setCalibrationTool(null);
          // Refresh the tools list
          if (selected?.sub_category) {
            fetchBySubCategory(selected.category, selected.sub_category);
          }
        }}
        tool={calibrationTool}
      />
      
      {/* Edit Modal */}
      <Modal
        title={editModalData.type === 'category' ? 'Edit Category Name' : 'Edit Sub-Category Name'}
        open={editModalVisible}
        onOk={handleEditModalOk}
        onCancel={() => setEditModalVisible(false)}
        okText="Save"
        okButtonProps={{ className: 'rounded-xl h-10 px-6' }}
        cancelButtonProps={{ className: 'rounded-xl h-10 px-6' }}
        className="rounded-2xl"
      >
        <Input
          value={editModalValue}
          onChange={(e) => setEditModalValue(e.target.value)}
          placeholder="Enter new name"
          onPressEnter={handleEditModalOk}
          autoFocus
          className="rounded-xl h-11"
        />
      </Modal>
      
      {/* Context Menu */}
      <Dropdown
        open={contextMenu.visible}
        onOpenChange={(visible) => !visible && hideContextMenu()}
        trigger={[]}
        menu={{
          items: contextMenu.type === 'category' ? [
            {
              key: 'add_sub',
              label: <span className="flex items-center gap-2"><Plus className="w-4 h-4" /> Add Sub-Category</span>,
              onClick: handleAddSubCategoryFromMenu
            },
            {
              key: 'add_column',
              label: <span className="flex items-center gap-2"><Folder className="w-4 h-4" /> Add Column</span>,
              onClick: handleAddCustomColumn
            },
            {
              key: 'edit',
              label: <span className="flex items-center gap-2"><Pencil className="w-4 h-4" /> Edit Name</span>,
              onClick: handleEditCategory
            },
            {
              key: 'delete',
              label: <span className="flex items-center gap-2 text-red-600"><Trash2 className="w-4 h-4" /> Delete</span>,
              onClick: handleDeleteCategory
            }
          ] : [
            {
              key: 'add_column',
              label: <span className="flex items-center gap-2"><Folder className="w-4 h-4" /> Add Column</span>,
              onClick: handleAddCustomColumn
            },
            {
              key: 'edit',
              label: <span className="flex items-center gap-2"><Pencil className="w-4 h-4" /> Edit Name</span>,
              onClick: handleEditSubCategory
            },
            {
              key: 'delete',
              label: <span className="flex items-center gap-2 text-red-600"><Trash2 className="w-4 h-4" /> Delete</span>,
              onClick: handleDeleteSubCategory
            }
          ]
        }}
      >
        <div
          className="fixed left-0 top-0 pointer-events-none"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            width: 1,
            height: 1
          }}
        />
      </Dropdown>
      <style>{`
        /* AgGrid style table */
        .ag-grid-style .ant-table {
          border: 1px solid #d1d5db;
          border-radius: 0;
          border-collapse: collapse !important;
        }
        .ag-grid-style .ant-table-thead {
          margin: 0 !important;
          padding: 0 !important;
        }
        .ag-grid-style .ant-table-tbody {
          margin: 0 !important;
          padding: 0 !important;
        }
        .ag-grid-style .ant-table-tbody > tr:first-child > td {
          border-top: 0 !important;
        }
        .ag-grid-style .ant-table-thead > tr > th { 
          background: #f3f4f6 !important; 
          color: #1f2937 !important; 
          font-weight: 600 !important;
          font-size: 12px !important;
          border-bottom: 1px solid #d1d5db !important;
          border-right: 1px solid #d1d5db !important;
          padding: 8px 8px !important;
          border-radius: 0 !important;
        }
        .ag-grid-style .ant-table-tbody > tr:first-child > td {
          border-top: 0 !important;
        }
        .ag-grid-style .ant-table-tbody > tr > td {
          padding: 4px 8px !important;
          border-bottom: 1px solid #e5e7eb !important;
          border-right: 1px solid #e5e7eb !important;
          color: #374151 !important;
          font-size: 12px !important;
          border-radius: 0 !important;
        }
        .ag-grid-style .ant-table-tbody > tr:hover > td {
          background: #f9fafb !important;
        }
        .ag-grid-style .ant-table-thead > tr > th::before { display: none !important; }
        .ag-grid-style .ant-table-placeholder .ant-empty-normal { margin: 60px 0 !important; }
        .ag-grid-style .ant-table-cell { border-radius: 0 !important; }
        .ag-grid-style .ant-table-thead > tr > th:last-child { border-right: 1px solid #d1d5db !important; }
        .ag-grid-style .ant-table-tbody > tr > td:last-child { border-right: 1px solid #e5e7eb !important; }
        
        /* Custom scrollbar */
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
    </div>
  );
};

export default ToolsList;
