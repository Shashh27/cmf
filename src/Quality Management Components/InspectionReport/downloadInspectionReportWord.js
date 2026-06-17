import axios from 'axios';
import { QUALITY_API_BASE_URL } from '../../Config/qualityconfig';

async function readBlobErrorDetail(data) {
  if (!(data instanceof Blob)) return null;
  try {
    const text = await data.text();
    const parsed = JSON.parse(text);
    if (typeof parsed?.detail === 'string') return parsed.detail;
    if (Array.isArray(parsed?.detail)) {
      return parsed.detail.map((d) => d.msg || String(d)).join(', ');
    }
    return parsed?.message || null;
  } catch {
    return null;
  }
}

/**
 * Download inspection report as Word (.docx) without opening the report designer.
 */
export async function downloadInspectionReportWord({
  partNumber,
  orderId,
  opNo,
  quantityNo = 1,
  consolidated = false,
}) {
  const params = {
    part_number: partNumber,
    sales_order_id: orderId,
    op_no: opNo,
    quantity_no: quantityNo,
    consolidated,
  };

  let res;
  try {
    res = await axios.get(`${QUALITY_API_BASE_URL}/reports/inspection-report/docx`, {
      params,
      responseType: 'blob',
    });
  } catch (err) {
    const detail = await readBlobErrorDetail(err.response?.data);
    throw new Error(detail || err.message || 'Word download failed');
  }

  const contentType = res.headers?.['content-type'] || '';
  if (contentType.includes('application/json') || res.data?.type?.includes('json')) {
    const detail = await readBlobErrorDetail(res.data);
    throw new Error(detail || 'Word download failed');
  }

  const blob = new Blob([res.data], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Inspection_Report_${partNumber}_OP${opNo}.docx`;
  link.click();
  URL.revokeObjectURL(url);
}
