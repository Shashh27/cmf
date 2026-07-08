export function cleanAnswerText(text) {
  if (!text) return '';
  return text
    .replace(/\n\*Full data table shown below\.\*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function getAnswerSummary(text, dataLength) {
  const cleaned = cleanAnswerText(text)
    .replace(/\*\*\d+\*\*\s+results?\.?/gi, '')
    .replace(/Found\s+\*\*\d+\*\*\s+records?\.?/gi, '')
    .trim();
  if (!cleaned) return dataLength ? `${dataLength} results` : '';

  const lines = cleaned.split('\n').filter(Boolean);
  const summary = [];
  for (const line of lines) {
    if (/^\d+\.\s+\*\*/.test(line)) break;
    if (line.startsWith('- **') && dataLength > 20) {
      summary.push(line);
      continue;
    }
    if (!/^\d+\./.test(line)) summary.push(line);
    if (summary.length >= 1) break;
  }
  return summary.join('\n').trim() || cleaned.split('\n')[0];
}
