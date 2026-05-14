import axios from 'axios';
import { QUALITY_API_BASE_URL } from '../Config/qualityconfig';

export const getDrawingInfo = async (pdfId) => {
  try {
    const res = await axios.get(`${QUALITY_API_BASE_URL}/pdf-annotation/info/${pdfId}`);
    return res.data;
  } catch (err) {
    console.error('getDrawingInfo failed:', err);
    throw err;
  }
};

export const getDrawingPageImage = async (pdfId, page, x, y, width, height, scale, isScanned, returnBase64) => {
  try {
    const res = await axios.post(`${QUALITY_API_BASE_URL}/pdf-annotation/render-page`, {
      pdf_id: String(pdfId),
      page,
      x,
      y,
      width,
      height,
      scale,
      is_scanned: isScanned,
      return_base64: returnBase64
    });
    return res.data;
  } catch (err) {
    console.error('getDrawingPageImage failed:', err);
    throw err;
  }
};
