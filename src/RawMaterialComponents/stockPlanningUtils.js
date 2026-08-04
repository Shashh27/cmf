/**
 * Shared rules for stock recommendations and Assign General Stock modal.
 * Stock cross-section must be >= planned; units need remaining_length >= planned length.
 */

export const formTypesMatch = (stockFormType, plannedFormType) => {
  if (!plannedFormType) return true;
  if (!stockFormType) return true;
  return stockFormType.toLowerCase().trim() === plannedFormType.toLowerCase().trim();
};

export const stockMeetsPlannedCrossSection = (stock, plannedDims, plannedFormType) => {
  if (!plannedFormType || !plannedDims) return false;

  if (!formTypesMatch(stock.form_type, plannedFormType)) {
    return false;
  }

  if (plannedFormType === 'Round') {
    const plannedDia = plannedDims.diameter;
    if (!plannedDia) return false;
    return (stock.diameter || 0) >= plannedDia;
  }

  if (plannedFormType === 'Square') {
    const plannedBreadth = plannedDims.breadth;
    const plannedHeight = plannedDims.height;
    if (!plannedBreadth || !plannedHeight) return false;
    return (stock.breadth || 0) >= plannedBreadth && (stock.height || 0) >= plannedHeight;
  }

  if (plannedFormType === 'Pipe') {
    const plannedOuter = plannedDims.outer_diameter;
    const plannedInner = plannedDims.inner_diameter;
    if (!plannedOuter || !plannedInner) return false;
    return (
      (stock.outer_diameter || 0) >= plannedOuter
      && (stock.inner_diameter || 0) >= plannedInner
    );
  }

  return false;
};

export const getNearestFitDistance = (stock, plannedDims, plannedFormType) => {
  if (!stockMeetsPlannedCrossSection(stock, plannedDims, plannedFormType)) {
    return Number.POSITIVE_INFINITY;
  }

  if (plannedFormType === 'Round') {
    return (stock.diameter || 0) - plannedDims.diameter;
  }

  if (plannedFormType === 'Square') {
    return Math.max(
      (stock.breadth || 0) - plannedDims.breadth,
      (stock.height || 0) - plannedDims.height,
    );
  }

  if (plannedFormType === 'Pipe') {
    return Math.max(
      (stock.outer_diameter || 0) - plannedDims.outer_diameter,
      (stock.inner_diameter || 0) - plannedDims.inner_diameter,
    );
  }

  return Number.POSITIVE_INFINITY;
};

export const filterUnitsForPlanned = (units, plannedLength, linkedUnitId = null) => {
  return (units || []).filter((unit) => {
    if (linkedUnitId && linkedUnitId === unit.id) return true;
    if (unit.status === 'exhausted') return false;
    if (plannedLength && (unit.remaining_length || 0) < plannedLength) return false;
    return true;
  });
};

export const sortStocksByNearestFit = (stocks, plannedDims, plannedFormType) => {
  return [...(stocks || [])]
    .map((stock) => ({
      stock,
      nearestFit: getNearestFitDistance(stock, plannedDims, plannedFormType),
      stockLength: stock.length || 0,
    }))
    .filter(({ nearestFit }) => Number.isFinite(nearestFit))
    .sort((a, b) => {
      // Nearest cross-section first (e.g. 40 before 50 before 85 for planned 35)
      if (a.nearestFit !== b.nearestFit) return a.nearestFit - b.nearestFit;
      // Then shorter stock length (less waste when cutting planned length)
      if (a.stockLength !== b.stockLength) return a.stockLength - b.stockLength;
      return (a.stock.id || 0) - (b.stock.id || 0);
    })
    .map(({ stock }) => stock);
};

export const getEligibleGeneralStocks = (stocks, stockUnits, plannedDims, plannedFormType, plannedLength, linkedUnitId = null) => {
  // Sort nearest → farthest, then keep only stocks with usable units
  return sortStocksByNearestFit(stocks, plannedDims, plannedFormType).filter((stock) => {
    const units = filterUnitsForPlanned(stockUnits[stock.id], plannedLength, linkedUnitId);
    return units.length > 0;
  });
};
