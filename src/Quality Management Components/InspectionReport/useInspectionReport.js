import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { message } from 'antd';
import { QUALITY_API_BASE_URL } from '../../Config/qualityconfig';
import { buildReportPayload, buildReportRows } from './reportDocumentBuilder';
import { applySavedEditsToPayload } from './reportEdits';

function reportScopeParams(target, reportQty) {
  const consolidated = reportQty === 'consolidated';
  return {
    part_number: target.partNumber,
    sales_order_id: target.orderId,
    op_no: target.opNo,
    quantity_no: consolidated ? 1 : reportQty,
    consolidated,
  };
}

async function fetchSavedEdits(target, reportQty) {
  try {
    const res = await axios.get(`${QUALITY_API_BASE_URL}/reports/inspection-report/saved`, {
      params: reportScopeParams(target, reportQty),
    });
    return res.data?.saved ? res.data : null;
  } catch {
    return null;
  }
}

async function fetchReportPayload(target, reportQty, qtyMax, projectName, assemblyName) {
  const { partPk, partNumber, orderId, opNo, partName } = target;
  const masterRes = await axios.get(`${QUALITY_API_BASE_URL}/quality/master-boc`, {
    params: { part_id: partNumber, sales_order_id: orderId, op_no: opNo },
  });
  const chars = masterRes.data || [];
  const consolidated = reportQty === 'consolidated';

  let outcomes;
  if (consolidated) {
    const allQtys = Array.from({ length: qtyMax }, (_, i) => i + 1);
    outcomes = await Promise.all(
      allQtys.map(async (q) => {
        try {
          const res = await axios.get(`${QUALITY_API_BASE_URL}/quality/stage-inspection`, {
            params: { part_id: partPk, sale_order_id: orderId, op_no: opNo, quantity_no: q },
          });
          return { qty: q, data: res.data || [] };
        } catch {
          return { qty: q, data: [] };
        }
      }),
    );
  } else {
    try {
      const res = await axios.get(`${QUALITY_API_BASE_URL}/quality/stage-inspection`, {
        params: {
          part_id: partPk,
          sale_order_id: orderId,
          op_no: opNo,
          quantity_no: reportQty,
        },
      });
      outcomes = [{ qty: reportQty, data: res.data || [] }];
    } catch {
      outcomes = [{ qty: reportQty, data: [] }];
    }
  }

  const rows = buildReportRows({ chars, outcomes, consolidated });
  const base = buildReportPayload({
    reportRows: rows,
    reportQty,
    partName,
    partNumber,
    orderId,
    opNo,
    projectName,
    assembly: assemblyName,
    qtyMax,
  });

  const saved = await fetchSavedEdits(target, reportQty);
  return applySavedEditsToPayload(base, saved ? { saved: true, ...saved } : null);
}

export function useInspectionReport({ target, projectName, assemblyName, enabled }) {
  const [loading, setLoading] = useState(false);
  const [reportQty, setReportQty] = useState(1);
  const [qtyOptions, setQtyOptions] = useState([{ value: 1, label: 'Qty 1' }]);
  const [payload, setPayload] = useState(null);
  const [qtyMax, setQtyMax] = useState(1);

  useEffect(() => {
    if (!enabled || !target) {
      setPayload(null);
      setReportQty(1);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        let max = 1;
        try {
          const p = await axios.get(`${QUALITY_API_BASE_URL}/parts/${target.partPk}`);
          const q = Number(p.data?.qty);
          if (Number.isFinite(q) && q >= 1) max = Math.min(999, Math.floor(q));
        } catch {
          max = 1;
        }
        if (cancelled) return;
        setQtyMax(max);
        const opts = Array.from({ length: max }, (_, i) => ({
          value: i + 1,
          label: `Qty ${i + 1}`,
        }));
        opts.push({ value: 'consolidated', label: 'Consolidated' });
        setQtyOptions(opts);

        const next = await fetchReportPayload(target, reportQty, max, projectName, assemblyName);
        if (!cancelled) setPayload(next);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          message.error('Failed to load inspection report.');
          setPayload(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, target, reportQty, projectName, assemblyName]);

  const reload = useCallback(async () => {
    if (!target) return null;
    setLoading(true);
    try {
      const next = await fetchReportPayload(target, reportQty, qtyMax, projectName, assemblyName);
      setPayload(next);
      return next;
    } catch (err) {
      console.error(err);
      message.error('Failed to reload report.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [target, reportQty, qtyMax, projectName, assemblyName]);

  const saveEdits = useCallback(async (savedPayload, savedByUsername) => {
    if (!target || !savedPayload) return null;
    const res = await axios.put(
      `${QUALITY_API_BASE_URL}/reports/inspection-report/saved`,
      savedPayload,
      {
        params: {
          ...reportScopeParams(target, reportQty),
          ...(savedByUsername ? { saved_by_username: savedByUsername } : {}),
        },
      },
    );
    const saved = res.data;
    let next = null;
    setPayload((prev) => {
      next = applySavedEditsToPayload(prev, { saved: true, ...saved });
      return next;
    });
    return next || applySavedEditsToPayload(savedPayload, { saved: true, ...saved });
  }, [target, reportQty]);

  const downloadDocx = useCallback(async (data, { useSavedEdits = false } = {}) => {
    const p = data || payload;
    if (!target || !p) return;

    const params = reportScopeParams(target, reportQty);

    let res;
    if (useSavedEdits && p.savedAt) {
      res = await axios.post(`${QUALITY_API_BASE_URL}/reports/inspection-report/docx`, p, {
        params,
        responseType: 'blob',
      });
    } else {
      res = await axios.get(`${QUALITY_API_BASE_URL}/reports/inspection-report/docx`, {
        params,
        responseType: 'blob',
      });
    }

    const blob = new Blob([res.data], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Inspection_Report_${p.reportNo}.docx`;
    link.click();
    URL.revokeObjectURL(url);
  }, [target, payload, reportQty]);

  return {
    loading,
    payload,
    reportQty,
    setReportQty,
    qtyOptions,
    downloadDocx,
    saveEdits,
    reload,
  };
}
