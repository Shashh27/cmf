import React, { useEffect } from 'react';
import { Form, Input, InputNumber, Modal, Select } from 'antd';

const DIM_TYPES = ['Length', 'Diameter', 'GDT-Flatness', 'GDT-Position', 'Angular', 'Radius', 'Other'];

const INSTRUMENTS = ['default'];

const StampCharacteristicModal = ({ open, onCancel, onOk, confirmLoading, defaultInstrument = 'default' }) => {
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        nominal: '',
        uppertol: 0,
        lowertol: 0,
        dimension_type: 'Length',
        measured_instrument: defaultInstrument,
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
      width={440}
    >
      <p style={{ marginBottom: 12, color: '#64748b', fontSize: 13 }}>
        Enter nominal and tolerances for the region you selected on the drawing.
      </p>
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="nominal" label="Nominal" rules={[{ required: true, message: 'Enter nominal' }]}>
          <Input placeholder="e.g. 10.5 or Ø12" autoComplete="off" />
        </Form.Item>
        <Form.Item name="dimension_type" label="Dimension type" rules={[{ required: true }]}>
          <Select options={DIM_TYPES.map((t) => ({ value: t, label: t }))} />
        </Form.Item>
        <Form.Item name="measured_instrument" label="Instrument" rules={[{ required: true }]}>
          <Select options={INSTRUMENTS.map((t) => ({ value: t, label: t }))} />
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
