import React, { useCallback, useMemo, useState } from 'react';

function readStoredWidths(storageKey) {
  if (!storageKey || typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStoredWidths(storageKey, widths) {
  if (!storageKey || typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(widths));
  } catch {
    // ignore quota / private mode errors
  }
}

/**
 * Makes Ant Design table columns manually resizable.
 * Expects CSS helpers: .ot-col-title, .ot-col-title-text, .ot-col-resizer
 */
export function useResizableColumns(baseColumns = [], options = {}) {
  const { storageKey, minWidth = 56 } = options;
  const [widths, setWidths] = useState(() => readStoredWidths(storageKey));

  const handleResize = useCallback(
    (key) => (nextWidth) => {
      setWidths((prev) => {
        const updated = { ...prev, [key]: nextWidth };
        writeStoredWidths(storageKey, updated);
        return updated;
      });
    },
    [storageKey],
  );

  const columns = useMemo(() => {
    return (baseColumns || []).map((col, index) => {
      const key = String(col.key ?? col.dataIndex ?? index);
      const width = widths[key] ?? col.width;
      const titleNode =
        typeof col.title === 'string' || typeof col.title === 'number' ? (
          <span className="ot-col-title-text">{col.title}</span>
        ) : (
          col.title
        );

      return {
        ...col,
        width,
        title: (
          <div className="ot-col-title">
            {titleNode}
            <span
              className="ot-col-resizer"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const startX = e.clientX;
                const startWidth = Number(width) || minWidth;

                const onMove = (ev) => {
                  const next = Math.max(minWidth, startWidth + (ev.clientX - startX));
                  handleResize(key)(next);
                };
                const onUp = () => {
                  document.removeEventListener('mousemove', onMove);
                  document.removeEventListener('mouseup', onUp);
                };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
              }}
            />
          </div>
        ),
        onHeaderCell: (...args) => {
          const base = typeof col.onHeaderCell === 'function' ? col.onHeaderCell(...args) : {};
          return {
            ...base,
            style: {
              ...(base?.style || {}),
              width,
              minWidth,
            },
          };
        },
      };
    });
  }, [baseColumns, widths, minWidth, handleResize]);

  const scrollX = useMemo(() => {
    const total = columns.reduce((sum, col) => sum + (Number(col.width) || minWidth), 0);
    return Math.max(total, 600);
  }, [columns, minWidth]);

  return { columns, scrollX, widths, setWidths };
}

export default useResizableColumns;
