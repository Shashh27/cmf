import React, { useEffect, useMemo, useState } from 'react';
import { Form, Input, InputNumber, Modal, Select, Spin } from 'antd';
import { DEFAULT_MEASURED_INSTRUMENT } from './inspectorConstants';
import { buildInstrumentSelectOptions, fetchInstrumentSubCategories } from './instrumentOptions';

const STANDARD_DIM_TYPES = [
  { value: 'Linear', label: 'Linear' },
  { value: 'Length', label: 'Length' },
  { value: 'Diameter', label: 'Diameter' },
  { value: 'Radius', label: 'Radius' },
  { value: 'Angular', label: 'Angular' },
  { value: 'Chamfer', label: 'Chamfer' },
  { value: 'Thread', label: 'Thread' },
  { value: 'Basic', label: 'Basic' },
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

const EditCharacteristicModal = ({ open, record, onCancel, onOk, confirmLoading = false }) => {
  const [form] = Form.useForm();
  const [instrumentOptions, setInstrumentOptions] = useState([]);
  const [loadingInstruments, setLoadingInstruments] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const loadInstruments = async () => {
      setLoadingInstruments(true);
      try {
        const subs = await fetchInstrumentSubCategories();
        if (!cancelled) setInstrumentOptions(subs);
      } catch (err) {
        console.warn('Failed to load instruments for edit modal', err);
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

  const currentDimType = (record?.dimType || '').trim();
  const dimTypeOptions = useMemo(() => {
    const standard = [...STANDARD_DIM_TYPES];
    if (currentDimType && !standard.some((o) => o.value === currentDimType)
      && !GDT_DIM_TYPES.some((o) => o.value === currentDimType)) {
      standard.unshift({ value: currentDimType, label: currentDimType });
    }
    return { standard, gdt: GDT_DIM_TYPES };
  }, [currentDimType]);

  const instrumentSelectOptions = useMemo(
    () => buildInstrumentSelectOptions(instrumentOptions, [record?.instrument]),
    [instrumentOptions, record?.instrument],
  );
  useEffect(() => {
    if (!open || !record) return;
    const ut = typeof record.uppertolNum === 'number'
      ? record.uppertolNum
      : parseFloat(String(record.tolPlus ?? '').replace(/^\+/, '')) || 0;
    const lt = typeof record.lowertolNum === 'number'
      ? record.lowertolNum
      : parseFloat(String(record.tolMinus ?? '').replace(/^\+/, '')) || 0;
    form.setFieldsValue({
      nominal: record.nominal === '—' ? '' : (record.nominal ?? ''),
      dimension_type: currentDimType || 'Linear',
      zone: record.zone || '',
      measured_instrument: (record.instrument || '').trim() || DEFAULT_MEASURED_INSTRUMENT,
      uppertol: ut,
      lowertol: lt,
    });
  }, [open, record, form, currentDimType]);

  const handleOk = async () => {
    try {
      const v = await form.validateFields();
      await onOk?.({
        nominal: String(v.nominal).trim(),
        dimension_type: v.dimension_type,
        zone: String(v.zone || '').trim() || 'A1',
        measured_instrument: (v.measured_instrument || '').trim() || DEFAULT_MEASURED_INSTRUMENT,
        uppertol: Number(v.uppertol) || 0,
        lowertol: Number(v.lowertol) || 0,
      });
    } catch {
      /* validation */
    }
  };

  const balloonLabel = record?.balloonNo != null ? `#${record.balloonNo}` : '';

  return (
    <Modal
      title={balloonLabel ? `Edit characteristic ${balloonLabel}` : 'Edit characteristic'}
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      okText="Save"
      confirmLoading={confirmLoading}
      destroyOnClose
      width={460}
    >
      <Form form={form} layout="vertical" requiredMark={false} style={{ marginTop: 8 }}>
        <Form.Item name="nominal" label="Nominal" rules={[{ required: true, message: 'Enter nominal' }]}>
          <Input placeholder="e.g. 11.5" autoComplete="off" />
        </Form.Item>
        <Form.Item name="dimension_type" label="Dimension type" rules={[{ required: true, message: 'Select dimension type' }]}>
          <Select showSearch optionFilterProp="label" placeholder="Select dimension type" listHeight={320}>
            <Select.OptGroup label="Standard">
              {dimTypeOptions.standard.map((opt) => (
                <Select.Option key={opt.value} value={opt.value} label={opt.label}>
                  {opt.label}
                </Select.Option>
              ))}
            </Select.OptGroup>
            <Select.OptGroup label="GD&T Controls">
              {dimTypeOptions.gdt.map((opt) => (
                <Select.Option key={opt.value} value={opt.value} label={opt.label}>
                  {opt.label}
                </Select.Option>
              ))}
            </Select.OptGroup>
          </Select>
        </Form.Item>
        <Form.Item name="zone" label="Zone" rules={[{ required: true, message: 'Enter zone' }]}>
          <Input placeholder="e.g. D3" autoComplete="off" style={{ maxWidth: 120 }} />
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

export default EditCharacteristicModal;
