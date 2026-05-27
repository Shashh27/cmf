import React from 'react';
import { Select, Badge } from 'antd';
import { 
  FilterOutlined,
  AppstoreOutlined, 
  CodeSandboxOutlined, 
  CodepenOutlined, 
  SafetyCertificateOutlined,
  LinkOutlined,
  DisconnectOutlined
} from '@ant-design/icons';

const { Option } = Select;

const BOMFilters = ({ stats, activeFilter, onFilterChange }) => {
  const options = [
    { key: 'all', label: 'All Parts', count: stats.total, icon: <AppstoreOutlined />, color: 'blue' },
    { key: 'inhouse', label: 'In-house', count: stats.inhouse, icon: <CodeSandboxOutlined />, color: 'emerald' },
    { key: 'outsource', label: 'Outsource', count: stats.outsource, icon: <CodepenOutlined />, color: 'amber' },
    { key: 'standard', label: 'Standard', count: stats.standard, icon: <SafetyCertificateOutlined />, color: 'indigo' },
    { key: 'linked', label: 'RM Linked Part', count: stats.linked, icon: <LinkOutlined />, color: 'cyan' },
    { key: 'unlinked', label: 'RM Not Linked Part', count: stats.unlinked, icon: <DisconnectOutlined />, color: 'rose' },
  ];

  const selectedOption = options.find(opt => opt.key === activeFilter) || options[0];

  return (
    <div className="flex items-center gap-2 w-full">
      <Select
        value={activeFilter}
        onChange={onFilterChange}
        className="flex-1"
        size="small"
        placeholder="Filter parts"
        classNames={{ popup: { root: 'bom-filter-dropdown' } }}
        style={{ minWidth: '160px' }}
        suffixIcon={<FilterOutlined className="text-indigo-500" />}
      >
        {options.map(opt => (
          <Option key={opt.key} value={opt.key}>
            <div className="flex items-center justify-between gap-3 py-0.5">
              <div className="flex items-center gap-2">
                <span className={`flex items-center text-sm ${activeFilter === opt.key ? 'text-indigo-600' : 'text-slate-400'}`}>
                  {opt.icon}
                </span>
                <span className={`text-[11px] font-medium ${activeFilter === opt.key ? 'text-indigo-700' : 'text-slate-600'}`}>
                  {opt.label}
                </span>
              </div>
              <Badge 
                count={opt.count} 
                showZero 
                overflowCount={9999}
                style={{ 
                  backgroundColor: activeFilter === opt.key ? '#e0e7ff' : '#f1f5f9', 
                  color: activeFilter === opt.key ? '#4338ca' : '#64748b', 
                  fontSize: '9px',
                  boxShadow: 'none',
                  border: activeFilter === opt.key ? '1px solid #c7d2fe' : 'none'
                }}
              />
            </div>
          </Option>
        ))}
      </Select>
    </div>
  );
};

export default BOMFilters;
