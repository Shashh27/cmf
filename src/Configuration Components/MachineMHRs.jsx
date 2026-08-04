import React, { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback } from "react";
import { message, Button, Input, Card, Spin } from "antd";
import { SaveOutlined } from "@ant-design/icons";
import MachineMHRsMatrixExport from "../DownloadReports/MachineMHRsMatrixExport";
import { api } from "../api/client.js";

const handleInputKeyDown = (e) => {
  if ([8, 9, 27, 13, 37, 39].includes(e.keyCode)) return;
  if (e.ctrlKey && [65, 67, 86, 88].includes(e.keyCode)) return;
  if (e.key === ".") return;
  if (e.key && !/^\d$/.test(e.key)) e.preventDefault();
};

function fmt(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function machineLabel(m) {
  const parts = [m.make, m.model].filter(Boolean);
  return parts.length ? parts.join(" ") : m.type || `M${m.id}`;
}

const MachineMHRs = ({ userId }) => {
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [editedValues, setEditedValues] = useState({});
  const [editedRecommendedMhr, setEditedRecommendedMhr] = useState({});
  const [saving, setSaving] = useState(false);
  const tableRef = useRef(null);
  const scrollRef = useRef(null);

  const syncStickyOffsets = useCallback(() => {
    const table = tableRef.current;
    const scroll = scrollRef.current;
    if (!table || !scroll) return;

    const header = table.querySelector("thead tr");
    if (!header) return;

    const cols = header.querySelectorAll(":scope > th");
    if (cols.length < 4) return;

    const [sl, name, code] = cols;
    const slW = sl.getBoundingClientRect().width;
    const nameW = name.getBoundingClientRect().width;
    const codeW = code.getBoundingClientRect().width;

    scroll.style.setProperty("--mhr-name-left", `${slW}px`);
    scroll.style.setProperty("--mhr-code-left", `${slW + nameW}px`);
    scroll.style.setProperty("--mhr-formula-left", `${slW + nameW + codeW}px`);
  }, []);

  useEffect(() => {
    fetchMachinesWithMHR();
  }, []);

  const fetchMachinesWithMHR = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/machines/with-mhr`);
      setMachines(response.data || []);
      setEditedValues({});
      setEditedRecommendedMhr({});
    } catch (error) {
      console.error("Error fetching machines with MHR:", error);
      message.error("Failed to load machine MHR data");
      setMachines([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredMachines = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return machines;
    return machines.filter((m) =>
      [m.work_center_name, m.type, m.make, m.model, String(m.mhr ?? ""), String(m.recommended_mhr ?? "")]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [machines, searchText]);

  const particulars = useMemo(() => {
    const map = new Map();
    machines.forEach((m) => {
      (m.mhr_particulars || []).forEach((p, idx) => {
        if (!map.has(p.code)) {
          map.set(p.code, {
            code: p.code,
            name: p.name,
            formula: p.formula,
            unit: p.unit,
            is_input: p.is_input,
            sequence: p.sequence_override ?? idx,
            particular_id: p.particular_id,
          });
        }
      });
    });
    return Array.from(map.values()).sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  }, [machines]);

  const valueLookup = useMemo(() => {
    const byMachine = {};
    machines.forEach((m) => {
      const byCode = {};
      (m.mhr_particulars || []).forEach((p) => {
        byCode[p.code] = p;
      });
      byMachine[m.id] = byCode;
    });
    return byMachine;
  }, [machines]);

  useLayoutEffect(() => {
    if (loading || filteredMachines.length === 0) return undefined;

    syncStickyOffsets();
    const table = tableRef.current;
    if (!table) return undefined;

    const ro = new ResizeObserver(() => syncStickyOffsets());
    ro.observe(table);
    window.addEventListener("resize", syncStickyOffsets);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", syncStickyOffsets);
    };
  }, [loading, filteredMachines, particulars, editedValues, editedRecommendedMhr, syncStickyOffsets]);

  const pendingChangeCount =
    Object.keys(editedValues).length + Object.keys(editedRecommendedMhr).length;

  const handleInputChange = (machineId, particularId, newValue) => {
    setEditedValues((prev) => ({
      ...prev,
      [`${machineId}-${particularId}`]: newValue,
    }));
  };

  const handleRecommendedMhrChange = (machineId, newValue) => {
    setEditedRecommendedMhr((prev) => ({ ...prev, [machineId]: newValue }));
  };

  const getCell = (machineId, particular) => {
    const rec = valueLookup[machineId]?.[particular.code];
    if (!rec) return { value: null, particularId: null, isInput: particular.is_input, dirty: false };
    const key = `${machineId}-${rec.particular_id}`;
    if (rec.is_input) {
      const edited = editedValues[key];
      return {
        value: edited !== undefined ? edited : rec.input_value,
        particularId: rec.particular_id,
        isInput: true,
        dirty: edited !== undefined,
      };
    }
    return {
      value: rec.computed_value,
      particularId: rec.particular_id,
      isInput: false,
      dirty: false,
    };
  };

  const saveAllChanges = async () => {
    if (pendingChangeCount === 0) {
      message.info("No changes to save");
      return;
    }

    const byMachine = {};
    Object.entries(editedValues).forEach(([key, value]) => {
      const [machineIdStr, particularIdStr] = key.split("-");
      const machineId = Number(machineIdStr);
      if (!byMachine[machineId]) byMachine[machineId] = [];
      byMachine[machineId].push({
        particular_id: Number(particularIdStr),
        value,
      });
    });

    setSaving(true);
    try {
      for (const [machineId, updates] of Object.entries(byMachine)) {
        await api.put(`/machines/${machineId}/mhr/values`, updates);
      }
      for (const [machineId, recommended] of Object.entries(editedRecommendedMhr)) {
        await api.put(`/machines/${machineId}/mhr/recommended-mhr`, null, {
          params: { recommended_mhr: recommended },
        });
      }
      message.success("All MHR changes saved");
      await fetchMachinesWithMHR();
    } catch (error) {
      console.error("Error saving MHR matrix:", error);
      message.error(error?.response?.data?.detail || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const renderValueCell = (machine, particular) => {
    const cell = getCell(machine.id, particular);
    if (cell.isInput) {
      return (
        <input
          type="text"
          inputMode="decimal"
          className={`mhr-cell-input${cell.dirty ? " mhr-cell-input--dirty" : ""}`}
          value={cell.value !== null && cell.value !== undefined ? String(cell.value) : ""}
          onChange={(e) => {
            const val = e.target.value;
            if (val === "" || /^\d*\.?\d*$/.test(val)) {
              handleInputChange(machine.id, cell.particularId, val === "" ? null : parseFloat(val));
            }
          }}
          disabled={saving || !cell.particularId}
          onKeyDown={handleInputKeyDown}
        />
      );
    }
    return <span className="mhr-cell-num">{fmt(cell.value)}</span>;
  };

  const renderParticularName = (p) => (
    <span className="mhr-name">
      {p.name}
      {p.unit ? <span className="mhr-unit"> ({p.unit})</span> : null}
    </span>
  );

  const renderFormulaCell = (p) =>
    p.is_input ? (
      <span className="mhr-formula mhr-formula--input">Manual input</span>
    ) : (
      <span className="mhr-formula">{p.formula || "—"}</span>
    );

  return (
    <Card
      title={<span className="mhr-title">Machine Hour Rates</span>}
      extra={
        <div className="mhr-toolbar">
          <span className="mhr-meta">
            {filteredMachines.length} machine{filteredMachines.length !== 1 ? "s" : ""}
            {searchText.trim() && machines.length !== filteredMachines.length
              ? ` / ${machines.length}`
              : ""}
          </span>
          <Input.Search
            className="mhr-search"
            placeholder="Filter machines..."
            allowClear
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={saveAllChanges}
            loading={saving}
            disabled={pendingChangeCount === 0}
            className="mhr-save-btn"
          >
            <span className="mhr-save-label">
              Save{pendingChangeCount > 0 ? ` (${pendingChangeCount})` : ""}
            </span>
          </Button>
          <MachineMHRsMatrixExport
            particulars={particulars}
            machines={filteredMachines}
            valueLookup={valueLookup}
            editedValues={editedValues}
            editedRecommendedMhr={editedRecommendedMhr}
          />
        </div>
      }
      variant="borderless"
      className="shadow-sm mhr-sheet-card"
      styles={{ header: { padding: 0 }, body: { padding: 0 } }}
    >
      <style>{`
        .mhr-sheet-card {
          width: 100%;
          max-width: 100%;
          min-width: 0;
        }

        .mhr-body-inner {
          width: 100%;
          min-width: 0;
          padding: 0 4px 8px;
        }

        /* Prevent tab pane from stretching to full table width on mobile */
        .ant-tabs-tabpane:has(.mhr-sheet-card) {
          min-width: 0;
          overflow: hidden;
        }

        .mhr-sheet-card .ant-card-head {
          flex-wrap: wrap;
          align-items: flex-start;
          gap: 8px;
          padding: 10px 12px !important;
          min-height: unset;
        }

        .mhr-sheet-card .ant-card-head-wrapper {
          flex-wrap: wrap;
          width: 100%;
          gap: 8px;
        }

        .mhr-sheet-card .ant-card-extra {
          margin-inline-start: 0 !important;
          width: 100%;
          max-width: 100%;
        }

        .mhr-sheet-card .ant-card-body {
          padding: 0 8px 8px !important;
        }

        @media (min-width: 768px) {
          .mhr-sheet-card .ant-card-head { padding: 10px 16px !important; }
          .mhr-sheet-card .ant-card-body { padding: 0 12px 12px !important; }
          .mhr-sheet-card .ant-card-extra { width: auto; margin-inline-start: auto !important; }
          .mhr-sheet-card .ant-card-head-wrapper { flex-wrap: nowrap; }
        }

        .mhr-title { font-size: clamp(14px, 2.5vw, 16px); font-weight: 600; }

        .mhr-toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          width: 100%;
        }

        @media (min-width: 768px) {
          .mhr-toolbar { flex-wrap: nowrap; justify-content: flex-end; width: auto; }
        }

        .mhr-meta { font-size: 12px; color: #8c8c8c; white-space: nowrap; flex: 0 0 auto; }
        .mhr-search { flex: 1 1 140px; min-width: 0; max-width: 100%; }

        @media (min-width: 480px) {
          .mhr-search { flex: 0 1 200px; max-width: 220px; }
        }

        .mhr-save-btn { flex: 0 0 auto; }
        .mhr-save-label { white-space: nowrap; }

        .mhr-scroll-wrap {
          width: 100%;
          max-width: 100%;
          min-width: 0;
          overflow: hidden;
        }

        .mhr-scroll {
          display: block;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          overflow-x: auto;
          overflow-y: hidden;
          border: 1px solid #d9d9d9;
          border-radius: 4px;
          background: #fff;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior-x: contain;

          --mhr-name-left: 40px;
          --mhr-code-left: 180px;
          --mhr-formula-left: 230px;
        }

        .mhr-sheet {
          border-collapse: separate;
          border-spacing: 0;
          font-size: 12px;
          table-layout: auto;
          width: max-content;
          min-width: 100%;
        }

        .mhr-th {
          position: sticky;
          top: 0;
          z-index: 2;
          background: #f0f5ff;
          color: #003a8c;
          font-weight: 600;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.2px;
          padding: 8px 10px;
          border-bottom: 2px solid #1890ff;
          border-right: 1px solid #d6e4ff;
          text-align: center;
          vertical-align: bottom;
          white-space: nowrap;
        }

        .mhr-th--sticky { z-index: 4; background: #f0f5ff; }
        .mhr-th--formula { text-align: left; white-space: normal; }

        .mhr-col-sl {
          left: 0;
          min-width: 2.2em;
        }

        .mhr-col-name {
          left: var(--mhr-name-left);
          text-align: left;
          white-space: normal;
          word-break: break-word;
        }

        .mhr-col-code {
          left: var(--mhr-code-left);
        }

        .mhr-col-formula {
          left: var(--mhr-formula-left);
          text-align: left;
          white-space: normal;
          word-break: break-word;
          box-shadow: 4px 0 6px -3px rgba(0, 0, 0, 0.1);
        }

        .mhr-td.mhr-col-formula {
          box-shadow: 4px 0 6px -3px rgba(0, 0, 0, 0.1);
        }

        .mhr-th--machine {
          padding: 6px 8px;
          line-height: 1.2;
          white-space: normal;
          word-break: break-word;
          min-width: max-content;
        }

        .mhr-th-wc {
          display: block;
          font-size: 10px;
          font-weight: 500;
          color: #597ef7;
          margin-bottom: 2px;
          white-space: normal;
          word-break: break-word;
        }

        .mhr-th-name {
          display: block;
          font-size: 11px;
          font-weight: 600;
          color: #003a8c;
          white-space: normal;
          word-break: break-word;
        }

        .mhr-td {
          padding: 6px 10px;
          border-bottom: 1px solid #f0f0f0;
          border-right: 1px solid #f0f0f0;
          vertical-align: middle;
          background: #fff;
        }

        .mhr-td--sticky {
          position: sticky;
          z-index: 1;
          background: #fff;
        }

        .mhr-tr--even .mhr-td { background: #fafafa; }
        .mhr-tr--even .mhr-td--sticky { background: #fafafa; }

        .mhr-tr--summary .mhr-td {
          background: #e6f4ff !important;
          border-top: 2px solid #91caff;
          font-weight: 600;
        }

        .mhr-tr--rec .mhr-td {
          background: #fffbe6 !important;
          border-top: 1px solid #ffe58f;
        }

        .mhr-sl { text-align: center; color: #595959; font-weight: 500; white-space: nowrap; }
        .mhr-name { font-weight: 500; color: #262626; line-height: 1.3; white-space: normal; word-break: break-word; }
        .mhr-unit { color: #8c8c8c; font-weight: 400; }
        .mhr-code {
          text-align: center;
          font-family: Consolas, Monaco, monospace;
          font-size: 11px;
          font-weight: 600;
          color: #0958d9;
          white-space: nowrap;
        }
        .mhr-formula {
          font-size: 11px;
          color: #595959;
          line-height: 1.35;
          white-space: normal;
          word-break: break-word;
        }
        .mhr-formula--input { color: #8c8c8c; font-style: italic; }

        .mhr-td--val {
          text-align: right;
          white-space: nowrap;
          min-width: 4.5rem;
        }

        .mhr-cell-num,
        .mhr-cell-mhr {
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
        }
        .mhr-cell-num { color: #262626; }
        .mhr-cell-mhr { font-weight: 700; color: #0958d9; }

        .mhr-cell-input {
          width: auto;
          min-width: 3.5em;
          max-width: 9em;
          box-sizing: border-box;
          border: 1px solid #d9d9d9;
          border-radius: 2px;
          padding: 3px 6px;
          font-size: 12px;
          text-align: right;
          font-variant-numeric: tabular-nums;
          background: #fff;
        }

        .mhr-cell-input:focus {
          outline: none;
          border-color: #4096ff;
          box-shadow: 0 0 0 2px rgba(5, 145, 255, 0.1);
        }

        .mhr-cell-input--dirty { border-color: #4096ff; background: #f0f8ff; }
        .mhr-cell-input:disabled { background: #f5f5f5; color: #bfbfbf; cursor: not-allowed; }

        .mhr-empty {
          padding: 48px 16px;
          text-align: center;
          color: #8c8c8c;
          font-size: 13px;
        }

        @media (max-width: 767px) {
          .mhr-col-sl {
            width: 1.8rem;
            min-width: 1.8rem;
            max-width: 1.8rem;
          }

          .mhr-col-name {
            width: 5.5rem;
            min-width: 5.5rem;
            max-width: 5.5rem;
          }

          .mhr-col-code {
            width: 2.2rem;
            min-width: 2.2rem;
            max-width: 2.2rem;
          }

          .mhr-col-formula {
            width: 5rem;
            min-width: 5rem;
            max-width: 5rem;
          }

          .mhr-th, .mhr-td {
            padding: 5px 4px;
          }

          .mhr-th--machine,
          .mhr-td--val {
            min-width: 3.75rem;
          }

          .mhr-formula, .mhr-name {
            font-size: 10px;
            line-height: 1.25;
          }

          .mhr-code { font-size: 9px; }
        }

        @media (max-width: 479px) {
          .mhr-save-label { display: none; }
          .mhr-save-btn .anticon { margin-inline-end: 0 !important; }
          .mhr-sheet { font-size: 11px; }

          .mhr-col-name {
            width: 4.75rem;
            min-width: 4.75rem;
            max-width: 4.75rem;
          }

          .mhr-col-formula {
            width: 4.25rem;
            min-width: 4.25rem;
            max-width: 4.25rem;
          }
        }
      `}</style>

      <div className="mhr-body-inner">
        <Spin spinning={loading}>
          {!loading && filteredMachines.length === 0 ? (
            <div className="mhr-empty">No machine MHR data found</div>
          ) : (
            <div className="mhr-scroll-wrap">
              <div className="mhr-scroll" ref={scrollRef}>
                <table className="mhr-sheet" ref={tableRef}>
                  <thead>
                    <tr>
                      <th className="mhr-th mhr-th--sticky mhr-col-sl">Sl</th>
                      <th className="mhr-th mhr-th--sticky mhr-col-name">Particulars</th>
                      <th className="mhr-th mhr-th--sticky mhr-col-code">Code</th>
                      <th className="mhr-th mhr-th--sticky mhr-col-formula mhr-th--formula">
                        Calculation
                      </th>
                      {filteredMachines.map((m) => (
                        <th
                          key={m.id}
                          className="mhr-th mhr-th--machine"
                          title={`${m.work_center_name || ""} — ${machineLabel(m)}`}
                        >
                          <span className="mhr-th-wc">{m.work_center_name || "—"}</span>
                          <span className="mhr-th-name">{machineLabel(m)}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {particulars.map((p, idx) => (
                      <tr key={p.code} className={idx % 2 === 1 ? "mhr-tr--even" : ""}>
                        <td className="mhr-td mhr-td--sticky mhr-col-sl">
                          <span className="mhr-sl">{idx + 1}</span>
                        </td>
                        <td className="mhr-td mhr-td--sticky mhr-col-name">
                          {renderParticularName(p)}
                        </td>
                        <td className="mhr-td mhr-td--sticky mhr-col-code">
                          <span className="mhr-code">{p.code}</span>
                        </td>
                        <td className="mhr-td mhr-td--sticky mhr-col-formula">
                          {renderFormulaCell(p)}
                        </td>
                        {filteredMachines.map((m) => (
                          <td key={m.id} className="mhr-td mhr-td--val">
                            {renderValueCell(m, p)}
                          </td>
                        ))}
                      </tr>
                    ))}

                    <tr className="mhr-tr--summary">
                      <td className="mhr-td mhr-td--sticky mhr-col-sl" />
                      <td className="mhr-td mhr-td--sticky mhr-col-name">
                        <span className="mhr-name">Calculated MHR</span>
                      </td>
                      <td className="mhr-td mhr-td--sticky mhr-col-code">
                        <span className="mhr-code">MHR*</span>
                      </td>
                      <td className="mhr-td mhr-td--sticky mhr-col-formula">
                        <span className="mhr-formula">—</span>
                      </td>
                      {filteredMachines.map((m) => (
                        <td key={m.id} className="mhr-td mhr-td--val">
                          <span className="mhr-cell-mhr">
                            {m.mhr != null ? fmt(m.mhr) : "—"}
                          </span>
                        </td>
                      ))}
                    </tr>

                    <tr className="mhr-tr--rec">
                      <td className="mhr-td mhr-td--sticky mhr-col-sl" />
                      <td className="mhr-td mhr-td--sticky mhr-col-name">
                        <span className="mhr-name">Recommended MHR</span>
                      </td>
                      <td className="mhr-td mhr-td--sticky mhr-col-code">
                        <span className="mhr-code">REC</span>
                      </td>
                      <td className="mhr-td mhr-td--sticky mhr-col-formula">
                        <span className="mhr-formula">—</span>
                      </td>
                      {filteredMachines.map((m) => {
                        const dirty = editedRecommendedMhr[m.id] !== undefined;
                        const val = dirty ? editedRecommendedMhr[m.id] : m.recommended_mhr;
                        return (
                          <td key={m.id} className="mhr-td mhr-td--val">
                            <input
                              type="text"
                              inputMode="decimal"
                              className={`mhr-cell-input${dirty ? " mhr-cell-input--dirty" : ""}`}
                              value={val !== null && val !== undefined ? String(val) : ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === "" || /^\d*\.?\d*$/.test(v)) {
                                  handleRecommendedMhrChange(
                                    m.id,
                                    v === "" ? null : parseFloat(v)
                                  );
                                }
                              }}
                              disabled={saving}
                              onKeyDown={handleInputKeyDown}
                              placeholder="—"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Spin>
      </div>
    </Card>
  );
};

export default MachineMHRs;
