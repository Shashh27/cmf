/**
 * Comparison Analysis tab wrapper for Intelligent Scheduler.
 */
import React from 'react';
import UnitWiseComparisonAnalysis from '../unitWiseCompare/index.jsx';

export default function ComparisonTab({
  compare,
  compareLoading,
  partOptions,
  selectedPartId,
  onPartChange,
  onRefresh,
}) {
  return (
    <UnitWiseComparisonAnalysis
      compare={compare}
      compareLoading={compareLoading}
      partOptions={partOptions}
      selectedPartId={selectedPartId}
      onPartChange={onPartChange}
      onRefresh={onRefresh}
    />
  );
}
