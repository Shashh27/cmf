import dayjs from "dayjs";

export const isPlaceholderEnd = (raw) => {
  if (!raw) return true;
  const d = dayjs(raw);
  if (d.year() <= 1970) return true;
  if (d.format("YYYY-MM-DD") === "2026-01-01" && d.hour() === 0 && d.minute() === 0 && d.second() === 0) {
    return true;
  }
  return false;
};

export const getDowntimeStart = (record) => record?.start_time || record?.available_from;

export const getDowntimeEnd = (record) => {
  const raw = record?.end_time || record?.available_to;
  if (!raw || isPlaceholderEnd(raw)) return null;
  return raw;
};

export const isBreakdownStatus = (record) => {
  const statusName = (record?.status_name || "").toLowerCase().trim();
  if (record?.status_id === 1 || statusName === "on") return false;
  if (statusName.includes("on") && !statusName.includes("off")) return false;
  return record?.status_id === 2 || statusName.includes("off");
};

/** True when the machine is OFF/breakdown on the given calendar date. */
export const isMachineInBreakdownOnDate = (machine, date) => {
  if (!machine || !date) return false;
  if (!isBreakdownStatus(machine)) return false;

  const day = dayjs(date).startOf("day");
  const startRaw = getDowntimeStart(machine);
  if (!startRaw) return true;

  const start = dayjs(startRaw).startOf("day");
  if (day.isBefore(start, "day")) return false;

  const endRaw = getDowntimeEnd(machine);
  if (!endRaw) {
    return !day.isAfter(dayjs(), "day");
  }

  return !day.isAfter(dayjs(endRaw).endOf("day"));
};

export const isMachineAvailableForAssignmentOnDate = (machine, date) =>
  !isMachineInBreakdownOnDate(machine, date);
