/** Default instrument persisted on master_boc and shown in UI when DB value missing */
export const DEFAULT_MEASURED_INSTRUMENT = 'default';

/** Category / sub-category labels after inventory migrated to category_id FKs. */
export function getToolCategoryName(item) {
  return (item?.category_name || item?.category || '').trim();
}

export function getToolSubCategoryName(item) {
  return (item?.sub_category_name || item?.sub_category || '').trim();
}
