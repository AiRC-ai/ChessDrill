export function remainingSeconds(limit, startedAt, now = Date.now()) {
  if (!limit) return null;
  return Math.max(0, Math.ceil((limit * 1000 - (now - startedAt)) / 1000));
}

export function clockExpired(limit, startedAt, now = Date.now()) {
  return limit > 0 && now - startedAt >= limit * 1000;
}
