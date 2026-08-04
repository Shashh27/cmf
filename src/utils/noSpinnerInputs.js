const ARROW_KEYS = new Set(['ArrowUp', 'ArrowDown']);

function isSpinnerNumericInput(el) {
  if (!el || el.tagName !== 'INPUT') return false;
  if (el.type === 'number') return true;
  return Boolean(el.closest('.ant-input-number'));
}

export function initNoSpinnerInputs() {
  document.addEventListener(
    'keydown',
    (e) => {
      if (!ARROW_KEYS.has(e.key)) return;
      if (!isSpinnerNumericInput(e.target)) return;
      e.preventDefault();
    },
    true,
  );
}
