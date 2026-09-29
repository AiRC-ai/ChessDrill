// Keys owned by Chess Studio. Keep this list in sync with persistent stores in
// main.js, analysis.js, and review.js when adding a new saved feature.
export const STUDY_STORAGE_KEYS = Object.freeze([
  'chessdrill-v1',
  'chessdrill-v2',
  'chess-studio-analysis-v1',
  'chess-studio-reviews-v1',
  'chess-studio-mistakes-v1',
]);

export function deleteLocalStudyData(storage) {
  for (const key of STUDY_STORAGE_KEYS) storage.removeItem(key);
}
