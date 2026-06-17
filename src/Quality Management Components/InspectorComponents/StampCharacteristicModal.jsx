import React, { useEffect, useMemo, useState } from 'react';
import { Form, Input, InputNumber, Modal, Select, Spin } from 'antd';
import { TOOLS_API_BASE_URL } from '../../Config/qualityconfig';
import { DEFAULT_MEASURED_INSTRUMENT } from './inspectorConstants';

const INSTRUMENTS_API = `${TOOLS_API_BASE_URL}/tools-list/?category=${encodeURIComponent('Instruments')}`;

const STANDARD_DIM_TYPES = [
  { value: 'Length', label: 'Length' },
  { value: 'Diameter', label: 'Diameter' },
  { value: 'Radius', label: 'Radius' },
  { value: 'Angular', label: 'Angular' },
  { value: 'Chamfer', label: 'Chamfer' },
];

const GDT_DIM_TYPES = [
  { value: 'GDT-Flatness', label: 'Flatness' },
  { value: 'GDT-Position', label: 'Position' },
  { value: 'GDT-Parallelism', label: 'Parallelism' },
  { value: 'GDT-Perpendicularity', label: 'Perpendicularity' },
  { value: 'GDT-Angularity', label: 'Angularity' },
  { value: 'GDT-Straightness', label: 'Straightness' },
  { value: 'GDT-Circularity', label: 'Circularity (Roundness)' },
  { value: 'GDT-Cylindricity', label: 'Cylindricity' },
  { value: 'GDT-Profile of Surface', label: 'Profile of Surface' },
  { value: 'GDT-Profile of Line', label: 'Profile of Line' },
  { value: 'GDT-Concentricity', label: 'Concentricity' },
  { value: 'GDT-Symmetry', label: 'Symmetry' },
  { value: 'GDT-Runout', label: 'Runout' },
  { value: 'GDT-Total Runout', label: 'Total Runout' },
];

const ALL_DIM_VALUES = new Set([
  ...STANDARD_DIM_TYPES.map((o) => o.value),
  ...GDT_DIM_TYPES.map((o) => o.value),
]);

const StampCharacteristicModal = ({ open, onCancel, onOk, confirmLoading, defaultInstrument = DEFAULT_MEASURED_INSTRUMENT }) => {
  const [form] = Form.useForm();
  const [instrumentOptions, setInstrumentOptions] = useState([]);
  const [loadingInstruments, setLoadingInstruments] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const loadInstruments = async () => {
      setLoadingInstruments(true);
      try {
        const res = await fetch(INSTRUMENTS_API);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const seen = new Set();
        const subs = [];
        (Array.isArray(data) ? data : []).forEach((item) => {
          const sub = (item?.sub_category || '').trim();
          if (!sub || seen.has(sub)) return;
          seen.add(sub);
          subs.push(sub);
        });
        subs.sort((a, b) => a.localeCompare(b));
        if (!cancelled) setInstrumentOptions(subs);
      } catch (err) {
        console.warn('Failed to load instruments for stamp modal', err);
        if (!cancelled) setInstrumentOptions([]);
      } finally {
        if (!cancelled) setLoadingInstruments(false);
      }
    };

    void loadInstruments();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const instrumentSelectOptions = useMemo(() => {
    const seen = new Set();
    const merged = [];
    const push = (v) => {
      const t = (v || '').trim();
      if (!t || seen.has(t)) return;
      seen.add(t);
      merged.push({ value: t, label: t });
    };
    push(DEFAULT_MEASURED_INSTRUMENT);
    const def = (defaultInstrument || '').trim();
    if (def) push(def);
    instrumentOptions.forEach(push);
    return merged;
  }, [instrumentOptions, defaultInstrument]);

  useEffect(() => {
    if (open) {
      const inst = (defaultInstrument || '').trim() || DEFAULT_MEASURED_INSTRUMENT;
      form.setFieldsValue({
        nominal: '',
        uppertol: 0,
        lowertol: 0,
        dimension_type: 'Length',
        measured_instrument: inst,
      });
    }
  }, [open, form, defaultInstrument]);

  const handleOk = async () => {
    try {
      const v = await form.validateFields();
      await onOk?.(v);
    } catch {
      /* validation */
    }
  };

  return (
    <Modal
      title="Stamp characteristic"
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      okText="Save to Master BOC"
      confirmLoading={confirmLoading}
      destroyOnClose
      width={460}
    >
      <p style={{ marginBottom: 12, color: '#64748b', fontSize: 13 }}>
        Enter nominal and tolerances for the region you selected on the drawing.
      </p>
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="nominal" label="Nominal" rules={[{ required: true, message: 'Enter nominal' }]}>
          <Input placeholder="e.g. 10.5 or Ø12" autoComplete="off" />
        </Form.Item>
        <Form.Item
          name="dimension_type"
          label="Dimension type"
          rules={[
            { required: true, message: 'Select dimension type' },
            {
              validator: (_, value) =>
                !value || ALL_DIM_VALUES.has(value)
                  ? Promise.resolve()
                  : Promise.reject(new Error('Select a valid dimension type')),
            },
          ]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="Select dimension type"
            listHeight={320}
          >
            <Select.OptGroup label="Standard">
              {STANDARD_DIM_TYPES.map((opt) => (
                <Select.Option key={opt.value} value={opt.value} label={opt.label}>
                  {opt.label}
                </Select.Option>
              ))}
            </Select.OptGroup>
            <Select.OptGroup label="GD&T Controls">
              {GDT_DIM_TYPES.map((opt) => (
                <Select.Option key={opt.value} value={opt.value} label={opt.label}>
                  {opt.label}
                </Select.Option>
              ))}
            </Select.OptGroup>
          </Select>
        </Form.Item>
        <Form.Item name="measured_instrument" label="Instrument" rules={[{ required: true, message: 'Select instrument' }]}>
          <Spin spinning={loadingInstruments}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={loadingInstruments ? 'Loading instruments…' : 'Select instrument'}
              options={instrumentSelectOptions}
              notFoundContent={loadingInstruments ? 'Loading…' : 'No instruments found'}
            />
          </Spin>
        </Form.Item>
        <Form.Item name="uppertol" label="Upper tolerance">
          <InputNumber style={{ width: '100%' }} step={0.001} />
        </Form.Item>
        <Form.Item name="lowertol" label="Lower tolerance">
          <InputNumber style={{ width: '100%' }} step={0.001} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default StampCharacteristicModal;
