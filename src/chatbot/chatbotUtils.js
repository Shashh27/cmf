export function cleanAnswerText(text) {
  if (!text) return '';
  return text
    .replace(/\n\*Full data table shown below\.\*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * One short NL summary above the table.
 * When rows exist, strip markdown tables / long bullet dumps so we don't
 * show "two answers" (prose list + DataTable).
 */
export function getAnswerSummary(text, dataLength) {
  const cleaned = cleanAnswerText(text)
    .replace(/\*\*\d+\*\*\s+results?\.?/gi, '')
    .replace(/Found\s+\*\*\d+\*\*\s+records?\.?/gi, '')
    .trim();

  if (dataLength > 0) {
    if (!cleaned) return `${dataLength} result${dataLength === 1 ? '' : 's'}`;
    // Drop markdown tables and long row lists — table UI shows the data
    const withoutTable = cleaned
      .split('\n')
      .filter((line) => {
        const t = line.trim();
        if (t.startsWith('|')) return false;
        if (/^\|?[-:| ]+\|?$/.test(t)) return false;
        if (/^[-*]\s+\*\*/.test(t)) return false;
        if (/^\d+\.\s+/.test(t)) return false;
        return true;
      })
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const first = withoutTable.split(/(?<=[.!?])\s+/)[0] || withoutTable;
    return first.slice(0, 280) || `${dataLength} result${dataLength === 1 ? '' : 's'}`;
  }

  if (!cleaned) return '';
  const lines = cleaned.split('\n').filter(Boolean);
  return (lines[0] || cleaned).slice(0, 400);
}
