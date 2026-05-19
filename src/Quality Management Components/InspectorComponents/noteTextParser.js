export function parseNotesFromExtractedText(extractedText) {
  if (!extractedText || typeof extractedText !== 'string') return [];
  const trimmed = extractedText.trim();
  if (!trimmed) return [];

  const parts = trimmed.split(/(?=\d+\.\s)/).map((p) => p.trim()).filter(Boolean);
  if (parts.length) {
    const merged = [];
    for (const part of parts) {
      const m = part.match(/^(\d+)\.\s*(.*)/s);
      if (!m) {
        merged.push({ n: null, text: part });
        continue;
      }
      const num = m[1];
      const text = (m[2] || '').trim();
      if (merged.length && merged[merged.length - 1].n === num) {
        merged[merged.length - 1].text += ` ${text}`;
      } else {
        merged.push({ n: num, text });
      }
    }
    const out = merged.map((x) => x.text.trim()).filter(Boolean);
    if (out.length) return out;
  }

  return [trimmed.replace(/^\d+\.\s*/, '').trim() || trimmed];
}

