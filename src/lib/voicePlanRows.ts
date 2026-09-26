/* ── Live dictation → stable rows.
   While the lifter is still talking, the plan is re-interpreted every
   second or so and the voice rows are replaced. Same-named exercises keep
   their row ids across replacements, so React keeps the same elements —
   a row that was already on screen never blinks, and a removed one just
   leaves. Names are matched loosely (case, punctuation) and consumed once
   each, so two "Bench Press" rows map in order. ── */

const norm = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export const reuseRowIds = (
  previous: { id: string; name: string }[],
  names: string[],
): (string | null)[] => {
  const pool = new Map<string, string[]>();
  for (const row of previous) {
    const key = norm(row.name);
    pool.set(key, [...(pool.get(key) ?? []), row.id]);
  }
  return names.map((name) => {
    const ids = pool.get(norm(name));
    return ids && ids.length > 0 ? (ids.shift() as string) : null;
  });
};
