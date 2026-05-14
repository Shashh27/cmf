import React, { useMemo, useState } from 'react';
import { Button, Empty, Input, Popconfirm, Space, Table, Typography } from 'antd';

const { Text } = Typography;

const InspectorNotesTable = ({
  notes = [],
  loading = false,
  readOnly = false,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onDeleteAll,
  onNoteSelect,
  selectedNoteId = null,
}) => {
  const [newNoteText, setNewNoteText] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState('');

  const data = useMemo(
    () =>
      notes.map((n, i) => ({
        key: n.id,
        id: n.id,
        index: i + 1,
        text: n.note_text || '',
      })),
    [notes],
  );

  const cols = useMemo(() => {
    const baseCols = [
      { title: '#', dataIndex: 'index', key: 'index', width: 46, align: 'center' },
      {
        title: 'NOTE',
        dataIndex: 'text',
        key: 'text',
        render: (text, row) =>
          editingId === row.id ? (
            <Input.TextArea value={editingText} autoSize={{ minRows: 2, maxRows: 4 }} onChange={(e) => setEditingText(e.target.value)} />
          ) : (
            <Text style={{ fontSize: 12 }}>{text || '—'}</Text>
          ),
      },
    ];

    if (readOnly) return baseCols;

    return [
      ...baseCols,
      {
        title: 'ACTIONS',
        key: 'actions',
        width: 140,
        align: 'center',
        render: (_, row) =>
          editingId === row.id ? (
            <Space size={4}>
              <Button
                size="small"
                type="primary"
                onClick={() => {
                  onUpdateNote?.(row.id, editingText);
                  setEditingId(null);
                  setEditingText('');
                }}
              >
                Save
              </Button>
              <Button size="small" onClick={() => setEditingId(null)}>
                Cancel
              </Button>
            </Space>
          ) : (
            <Space size={4}>
              <Button
                size="small"
                onClick={() => {
                  setEditingId(row.id);
                  setEditingText(row.text || '');
                }}
              >
                Edit
              </Button>
              {onDeleteNote && (
                <Popconfirm title="Delete this note?" onConfirm={() => onDeleteNote?.(row.id)}>
                  <Button size="small" danger>
                    Delete
                  </Button>
                </Popconfirm>
              )}
            </Space>
          ),
      },
    ];
  }, [editingId, editingText, onUpdateNote, onDeleteNote, readOnly]);

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#fff' }}>
      {!readOnly && (
        <div style={{ padding: '6px 8px', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <Space.Compact style={{ flex: 1, minWidth: 160 }}>
              <Input
                placeholder="Add note..."
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                onPressEnter={() => {
                  const t = (newNoteText || '').trim();
                  if (!t) return;
                  onAddNote?.(t);
                  setNewNoteText('');
                }}
              />
              <Button
                type="primary"
                onClick={() => {
                  const t = (newNoteText || '').trim();
                  if (!t) return;
                  onAddNote?.(t);
                  setNewNoteText('');
                }}
              >
                Add
              </Button>
            </Space.Compact>
            {onDeleteAll && (
              <Popconfirm title={`Delete all ${notes.length} notes?`} onConfirm={() => onDeleteAll?.()} disabled={!notes.length}>
                <Button size="small" danger disabled={!notes.length}>
                  Delete all
                </Button>
              </Popconfirm>
            )}
          </div>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {data.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={readOnly ? "No notes from supervisor" : "No notes yet. Use Notes tool to draw and extract notes."} style={{ marginTop: 24 }} />
        ) : (
          <Table 
            columns={cols} 
            dataSource={data} 
            size="small" 
            bordered 
            pagination={false} 
            loading={loading}
            onRow={(row) => ({
              onClick: () => onNoteSelect?.(row.id),
              style: { cursor: 'pointer', background: selectedNoteId === row.id ? '#fffbe6' : 'inherit' }
            })}
          />
        )}
      </div>
    </div>
  );
};

export default InspectorNotesTable;

