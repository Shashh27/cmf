import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Select, Spin, Typography } from 'antd';
import { TOOLS_API_BASE_URL } from '../../Config/qualityconfig';
import { getToolSubCategoryName } from './inspectorConstants';

const { Text } = Typography;

const INSTRUMENTS_API = `${TOOLS_API_BASE_URL}/tools-list/?category=${encodeURIComponent('Instruments')}`;

const SetInstrumentModal = ({
  open,
  record,
  rowCount = 1,
  onCancel,
  onOk,
  confirmLoading = false,
}) => {
  const [value, setValue] = useState('');
  const [subCategories, setSubCategories] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const loadInstruments = async () => {
      setLoadingOptions(true);
      try {
        const res = await fetch(INSTRUMENTS_API);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const seen = new Set();
        const unique = [];
        (Array.isArray(data) ? data : []).forEach((item) => {
          const sub = getToolSubCategoryName(item);
          if (!sub || seen.has(sub)) return;
          seen.add(sub);
          unique.push(sub);
        });
        unique.sort((a, b) => a.localeCompare(b));
        if (!cancelled) setSubCategories(unique);
      } catch (err) {
        console.warn('Failed to load instruments list', err);
        if (!cancelled) setSubCategories([]);
      } finally {
        if (!cancelled) setLoadingOptions(false);
      }
    };

    void loadInstruments();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (open && record) {
      const current = (record.instrument || '').trim();
      setValue(current && current !== 'default' ? current : '');
    }
  }, [open, record]);

  const options = useMemo(() => {
    const seen = new Set(subCategories);
    const merged = [...subCategories];
    const current = (record?.instrument || '').trim();
    if (current && current !== 'default' && !seen.has(current)) {
      merged.unshift(current);
    }
    return merged.map((v) => ({ value: v, label: v }));
  }, [subCategories, record]);

  const handleOk = async () => {
    const next = (value || '').trim() || 'default';
    await onOk?.(next);
  };

  return (
    <Modal
      title={rowCount > 1 ? `Set instrument (${rowCount} rows)` : 'Set instrument'}
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      okText="Save"
      confirmLoading={confirmLoading}
      destroyOnClose
      width={420}
    >
      {record ? (
        <div>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
            {rowCount > 1
              ? `Apply the same instrument to ${rowCount} selected characteristics.`
              : `Characteristic #${record.balloonNo} · ${record.dimType} · ${record.nominal} · Zone ${record.zone}`}
          </Text>
          <Spin spinning={loadingOptions}>
            <Select
              style={{ width: '100%' }}
              value={value || undefined}
              onChange={setValue}
              options={options}
              showSearch
              allowClear
              placeholder="Select instrument sub-category"
              optionFilterProp="label"
              notFoundContent={loadingOptions ? 'Loading…' : 'No instruments found'}
            />
          </Spin>
        </div>
      ) : null}
    </Modal>
  );
};

export default SetInstrumentModal;
