export function filterFavoriteOpenings(openings, favoriteOpenings, favoriteLines) {
  return openings.flatMap(opening => {
    if (favoriteOpenings.has(opening.id)) return [opening];
    const lines = opening.lines.filter(line => favoriteLines.has(line.id));
    return lines.length ? [{...opening,lines}] : [];
  });
}
