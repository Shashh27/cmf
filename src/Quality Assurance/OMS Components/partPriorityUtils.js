/**
 * Live-queue parts only — completed parts stay in OMS with priority=0
 * but must not appear in the Parts Priority UI.
 */
export function isLiveQueuePart(item) {
    if (!item) return false;
    if (item.status === "completed") return false;
    if ((item.priority ?? 0) <= 0) return false;
    return true;
  }
  
  export function filterLiveInHouseParts(items) {
    return (items || []).filter(
      (item) =>
        item.part_type_name?.toLowerCase() === "in-house" && isLiveQueuePart(item)
    );
  }
  