/* ── What a live workout brings back when the logger mounts again after
     Minimize, a reload, or iOS dropping the web view. Both values come
     out of localStorage, so both are checked before they are trusted. ── */

/** A rest countdown as an end time, so it survives being unmounted. */
export type RestWindow = {
  /** Epoch ms when the rest ends. */
  endsAt: number;
  /** The full length of the rest, "+30 sec" included — the ring's 100%. */
  totalSeconds: number;
};

/** The saved rest, if it is still running. One that has already ended is
    dropped: re-arming it would buzz "Rest complete" the moment the lifter
    comes back, however long ago it really ended. A rest with more time
    left than its own length means the clock moved — dropped too. */
export const restoredRest = (raw: unknown, now: number): RestWindow | null => {
  if (typeof raw !== "object" || raw === null) return null;
  const { endsAt, totalSeconds } = raw as Partial<RestWindow>;
  if (typeof endsAt !== "number" || !Number.isFinite(endsAt)) return null;
  if (typeof totalSeconds !== "number" || !Number.isFinite(totalSeconds)) return null;
  if (totalSeconds <= 0 || endsAt <= now) return null;
  if (endsAt - now > totalSeconds * 1000) return null;
  return { endsAt, totalSeconds };
};

/** The saved order sets were logged in, most recent first — what tells a
    spoken "scratch that" which set came last. */
export const restoredRecentSetIds = (raw: unknown, cap: number): string[] =>
  Array.isArray(raw)
    ? raw.filter((id): id is string => typeof id === "string" && id !== "").slice(0, Math.max(0, cap))
    : [];
