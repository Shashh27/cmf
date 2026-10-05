import React, { useEffect, useState } from "react";
import { Input, Space } from "antd";

export const MAX_CYCLE_HOURS = 100;
export const MAX_MINUTES = 59;

const BLOCKED_KEYS = new Set([
  "e", "E", "+", "-", ".", ",", " ",
  "ArrowUp", "ArrowDown",
]);

function digitsOnly(val) {
  return String(val ?? "").replace(/\D/g, "");
}

function toSafeInt(val, min, max) {
  const digits = digitsOnly(val);
  if (digits === "") return null;
  const n = parseInt(digits, 10);
  if (Number.isNaN(n) || n < min) return min;
  if (n > max) return max;
  return n;
}

function parseTypedInt(raw, max) {
  const digits = digitsOnly(raw);
  if (digits === "") return { empty: true };
  const n = parseInt(digits, 10);
  if (Number.isNaN(n) || n < 0 || n > max) return { reject: true };
  return { n };
}

function blockInvalidKeys(e) {
  if (BLOCKED_KEYS.has(e.key)) e.preventDefault();
}

function displayFromNumber(n) {
  if (n == null || Number.isNaN(n) || n === 0) return "";
  return String(n);
}

export function parseDurationHms(value) {
  if (value == null || value === "") return { h: null, m: null };
  if (typeof value === "object" && typeof value.format === "function") {
    value = value.format("HH:mm:ss");
  }
  const text = String(value).trim();
  if (/[^\d:]/.test(text) || text.includes("-")) {
    return { h: NaN, m: NaN };
  }
  const match = text.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (match) {
    return {
      h: parseInt(match[1], 10),
      m: parseInt(match[2], 10),
    };
  }
  return { h: NaN, m: NaN };
}

export function formatDurationHms(h, m, maxHours = MAX_CYCLE_HOURS) {
  let hh = toSafeInt(h, 0, maxHours) ?? 0;
  let mm = toSafeInt(m, 0, MAX_MINUTES) ?? 0;
  if (hh >= maxHours) {
    hh = maxHours;
    mm = 0;
  }
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
}

function formatFromTexts(hText, mText, maxHours = MAX_CYCLE_HOURS) {
  if (hText === "" && mText === "") return null;
  return formatDurationHms(hText === "" ? 0 : hText, mText === "" ? 0 : mText, maxHours);
}

export function toDurationHms(value) {
  if (!value) return null;
  const { h, m } = parseDurationHms(value);
  if ([h, m].some((n) => n == null || Number.isNaN(n))) return null;
  if (h < 0 || m < 0) return null;
  return formatDurationHms(h, m);
}

export const durationHmsRules = (label, { maxHours = MAX_CYCLE_HOURS } = {}) => [
  {
    validator: (_, value) => {
      if (!value) return Promise.reject(new Error(`${label} is required`));
      if (typeof value === "string" && /[^\d:]/.test(value)) {
        return Promise.reject(new Error(`${label} can only contain numbers`));
      }
      const { h, m } = parseDurationHms(value);
      if ([h, m].some((n) => n == null || Number.isNaN(n))) {
        return Promise.reject(new Error(`${label} must be HH:MM`));
      }
      if (h < 0 || m < 0) {
        return Promise.reject(new Error(`${label} cannot be negative`));
      }
      if (m > MAX_MINUTES) {
        return Promise.reject(new Error(`${label} minutes cannot exceed 59`));
      }
      if (h > maxHours || (h === maxHours && m > 0)) {
        return Promise.reject(new Error(`${label} cannot exceed ${maxHours} hours`));
      }
      if (h === 0 && m === 0) {
        return Promise.reject(new Error(`${label} must be greater than 0`));
      }
      return Promise.resolve();
    },
  },
];

const DigitBox = ({ value, max, disabled, placeholder, onAccept }) => {
  const handleChange = (e) => {
    const parsed = parseTypedInt(e.target.value, max);
    if (parsed.reject) return;
    if (parsed.empty) {
      onAccept("");
      return;
    }
    onAccept(String(parsed.n));
  };

  const handlePaste = (e) => {
    const text = e.clipboardData?.getData("text") ?? "";
    e.preventDefault();
    const parsed = parseTypedInt(text, max);
    if (parsed.reject || parsed.empty) return;
    onAccept(String(parsed.n));
  };

  return (
    <Input
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={String(max).length}
      onChange={handleChange}
      onPaste={handlePaste}
      onKeyDown={blockInvalidKeys}
      style={{ width: "100%", textAlign: "center" }}
    />
  );
};

const DurationHmsInput = ({ value, onChange, disabled, maxHours = MAX_CYCLE_HOURS }) => {
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");

  useEffect(() => {
    const incoming = value || null;
    const fromLocal = formatFromTexts(hours, minutes, maxHours);
    if (incoming === fromLocal) return;
    if (!incoming) {
      setHours("");
      setMinutes("");
      return;
    }
    const { h, m } = parseDurationHms(incoming);
    if (h == null || Number.isNaN(h)) {
      setHours("");
      setMinutes("");
      return;
    }
    setHours(displayFromNumber(h));
    setMinutes(h >= maxHours ? "" : displayFromNumber(m));
  }, [value, maxHours]);

  const emit = (hText, mText) => {
    let nextHours = hText;
    let nextMinutes = mText;
    const hoursNum = hText === "" ? 0 : parseInt(hText, 10);
    if (hoursNum >= maxHours) {
      nextHours = String(maxHours);
      nextMinutes = "";
    }
    setHours(nextHours);
    setMinutes(nextMinutes);
    onChange?.(formatFromTexts(nextHours, nextMinutes, maxHours));
  };

  return (
    <Space.Compact style={{ width: "100%" }} title={`Hours : Minutes (max ${maxHours}h)`}>
      <DigitBox
        value={hours}
        max={maxHours}
        disabled={disabled}
        placeholder="HH"
        onAccept={(v) => emit(v, minutes)}
      />
      <DigitBox
        value={minutes}
        max={MAX_MINUTES}
        disabled={disabled || parseInt(hours || "0", 10) >= maxHours}
        placeholder="MM"
        onAccept={(v) => emit(hours, v)}
      />
    </Space.Compact>
  );
};

export default DurationHmsInput;
