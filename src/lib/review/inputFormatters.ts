const METERS_PER_MILE = 1609.344;

/**
 * Whether to render distances in km. We default to metric and only flip to
 * miles when the user explicitly chose "lb" in onboarding.
 */
export const isMetricUnits = (units: string | undefined): boolean =>
  (units ?? "kg") !== "lb";

// ── Duration (mm:ss) ─────────────────────────────────────────────────────────

/** Format canonical seconds string → display "mm:ss" (or "h:mm:ss"). */
export const formatDurationMmSs = (totalSecondsStr: string): string => {
  if (!totalSecondsStr) return "";
  const total = parseInt(totalSecondsStr, 10);
  if (!Number.isFinite(total) || total < 0) return "";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
};

/**
 * Parse user-typed duration → canonical seconds string. Returns:
 *   - "" for empty input (clear)
 *   - canonical seconds string for valid input
 *   - null for unparseable input (caller should snap back)
 *
 * Accepts:
 *   "30"       → 30 min          (1800s)
 *   "3000"     → 30:00           (1800s; bare digits read right-to-left as ss/mm/hh)
 *   "300"      → 3:00            (180s)
 *   "30000"    → 3:00:00         (10800s)
 *   "30:00"    → 30:00           (1800s)
 *   "1:30:00"  → 1:30:00         (5400s)
 *   "30:"      → 30:00           (1800s)
 */
export const parseDurationToSeconds = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (trimmed === "") return "";

  if (trimmed.includes(":")) {
    if (!/^[\d:]+$/.test(trimmed)) return null;
    const parts = trimmed
      .split(":")
      .map((p) => (p === "" ? 0 : parseInt(p, 10)));
    if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
    let total = 0;
    if (parts.length === 1) total = parts[0] * 60;
    else if (parts.length === 2) total = parts[0] * 60 + parts[1];
    else if (parts.length === 3) total = parts[0] * 3600 + parts[1] * 60 + parts[2];
    else return null;
    return total >= 0 ? String(total) : null;
  }

  if (!/^\d+$/.test(trimmed)) return null;
  const digits = trimmed;
  let total: number;
  if (digits.length <= 2) {
    // Bare 1-2 digits read as minutes ("30" → 30 min, not 30 sec)
    total = parseInt(digits, 10) * 60;
  } else {
    const sec = parseInt(digits.slice(-2), 10);
    const rest = digits.slice(0, -2);
    if (rest.length <= 2) {
      total = parseInt(rest, 10) * 60 + sec;
    } else {
      const hour = parseInt(rest.slice(0, -2), 10);
      const min = parseInt(rest.slice(-2), 10);
      total = hour * 3600 + min * 60 + sec;
    }
  }
  return total >= 0 ? String(total) : null;
};

// ── Distance (meters ↔ km/mi) ────────────────────────────────────────────────

/** Format canonical meters string → display value in km or mi. Trims "0.00" tails. */
export const formatDistance = (
  metersStr: string,
  isMetric: boolean,
): string => {
  if (!metersStr) return "";
  const meters = parseFloat(metersStr);
  if (!Number.isFinite(meters)) return "";
  const value = isMetric ? meters / 1000 : meters / METERS_PER_MILE;
  return value
    .toFixed(2)
    .replace(/\.?0+$/, "");
};

/** Parse user-typed distance in km/mi → canonical meters string (or null on bad input). */
export const parseDistanceToMeters = (
  raw: string,
  isMetric: boolean,
): string | null => {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  if (!/^[\d.]+$/.test(trimmed)) return null;
  const dots = (trimmed.match(/\./g) ?? []).length;
  if (dots > 1) return null;
  const value = parseFloat(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  const meters = isMetric ? value * 1000 : value * METERS_PER_MILE;
  return String(Math.round(meters));
};
