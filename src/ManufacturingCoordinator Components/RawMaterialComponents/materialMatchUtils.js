/**
 * Canonical raw material name matcher — keep in sync with
 * backend/services/stock_recommendation_service.py
 *
 * Algorithm (used everywhere):
 * 1. Normalize: regex strip non-alphanumeric, lowercase
 * 2. Match: exact → extracted-in-db → db-in-extracted (ranked)
 */

export const normalizeMaterialName = (name) => {
  if (!name) return '';
  return name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
};

const materialMatchRank = (extractedNormalized, dbNormalized) => {
  if (!extractedNormalized || !dbNormalized) return null;
  if (extractedNormalized === dbNormalized) return 0;
  if (dbNormalized.includes(extractedNormalized)) return 1;
  if (extractedNormalized.includes(dbNormalized)) return 2;
  return null;
};

export const findMatchingMaterials = (extractedName, rawMaterialsList = [], maxRecommendations = 10) => {
  if (!extractedName || !rawMaterialsList?.length) return [];

  const extractedNormalized = normalizeMaterialName(extractedName);
  if (!extractedNormalized) return [];

  const matches = rawMaterialsList
    .filter((rm) => rm?.material_name)
    .map((rm) => {
      const dbNormalized = normalizeMaterialName(rm.material_name);
      const rank = materialMatchRank(extractedNormalized, dbNormalized);
      if (rank === null) return null;
      const suffixLen = rank === 1 ? dbNormalized.length - extractedNormalized.length : 0;
      return {
        id: rm.id,
        material_name: rm.material_name,
        match_type: rank === 0 ? 'exact' : 'partial',
        match_rank: rank,
        suffix_length: suffixLen,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.match_rank !== b.match_rank) return a.match_rank - b.match_rank;
      const aDisplayExact = a.material_name.trim().toLowerCase() === extractedName.trim().toLowerCase() ? 0 : 1;
      const bDisplayExact = b.material_name.trim().toLowerCase() === extractedName.trim().toLowerCase() ? 0 : 1;
      if (aDisplayExact !== bDisplayExact) return aDisplayExact - bDisplayExact;
      if (a.suffix_length !== b.suffix_length) return a.suffix_length - b.suffix_length;
      return a.material_name.length - b.material_name.length;
    });

  return matches.slice(0, maxRecommendations);
};

export const formatMaterialMatchLabel = (materialName, matchType) => {
  if (!materialName) return '';
  if (matchType === 'exact') return `${materialName} (exact match)`;
  if (matchType === 'partial') return `${materialName} (suggested)`;
  return materialName;
};

export const stripMaterialMatchLabel = (label) => {
  if (!label) return label;
  return label.replace(/\s*\((exact match|suggested|planned)\)\s*$/i, '').trim();
};

export const getMaterialMatchInfo = (extractedName, rawMaterialsList = [], selectedMaterialId = null) => {
  const recommendations = findMatchingMaterials(extractedName, rawMaterialsList);
  const exactMatch = recommendations.find((m) => m.match_type === 'exact') || null;
  const defaultMatch = exactMatch || recommendations[0] || null;

  const selectedMaterial = selectedMaterialId
    ? rawMaterialsList.find((rm) => Number(rm.id) === Number(selectedMaterialId))
      || recommendations.find((m) => Number(m.id) === Number(selectedMaterialId))
    : null;

  const bestMatch = selectedMaterial
    ? {
        id: selectedMaterial.id,
        material_name: selectedMaterial.material_name,
        match_type: recommendations.find((m) => Number(m.id) === Number(selectedMaterial.id))?.match_type
          || (exactMatch && Number(exactMatch.id) === Number(selectedMaterial.id) ? 'exact' : 'partial'),
      }
    : defaultMatch;

  return {
    recommendations,
    exactMatch,
    bestMatch,
    materialExists: recommendations.length > 0,
    resolvedMaterialId: bestMatch?.id || null,
    resolvedMaterialName: bestMatch?.material_name || null,
    isPartialMatch: bestMatch?.match_type === 'partial',
  };
};
