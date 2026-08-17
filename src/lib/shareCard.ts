import type { WorkoutLog } from "@/hooks/useWorkoutLogs";
import type { Muscle, MuscleActivation } from "@/lib/muscleMap";

/* 1080x1920 story-format share card in the champagne/ink editorial system.
   All layout numbers are in card pixels (~3x the app's 13px type scale). */

export type Units = "lb" | "kg";

export type ShareCardSession = Pick<
  WorkoutLog,
  | "name"
  | "exercises"
  | "finished_at"
  | "duration_minutes"
  | "total_sets"
  | "completed_sets"
  | "total_volume"
>;

export type ShareCardOptions = {
  log: ShareCardSession;
  activations?: MuscleActivation[];
  prCount?: number;
  dark: boolean;
  units?: Units;
};

const W = 1080;
const H = 1920;
const M = 96;

type Theme = { canvas: string; ink: string; accent: string };

const THEMES: Record<"light" | "dark", Theme> = {
  light: { canvas: "#F4F5F7", ink: "#17191E", accent: "#D9295C" },
  dark: { canvas: "#0E1420", ink: "#F2F4F8", accent: "#FF5B85" },
};

const FONT_STACK = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
const font = (weight: number, size: number) => `${weight} ${size}px ${FONT_STACK}`;

/* ── Pure helpers (unit-tested) ─────────────────────────────── */

export const hexWithAlpha = (hex: string, alpha: number): string => {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const formatNumber = (n: number): string => n.toLocaleString("en-US");

export const formatDateLabel = (iso: string): string => {
  const d = new Date(iso);
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  const rest = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${weekday} — ${rest}`.toUpperCase();
};

/* Meta-column volume: keep it short enough for a quarter-width column. */
export const formatCompactVolume = (n: number): string => {
  if (n < 10_000) return formatNumber(n);
  const k = Math.round(n / 100) / 10;
  return k >= 100 ? `${Math.round(k)}k` : `${k}k`;
};

export type HeroSegment = { text: string; bold: boolean };

/* Mockup .num / .num b pattern: ultra-light numeral with the trailing
   digit group emphasized ("1:" + b"24", "12," + b"450"). */
export const splitHeroValue = (value: string): HeroSegment[] => {
  const m = value.match(/^(.*[^0-9])([0-9]+)$/);
  if (!m || !m[1]) return [{ text: value, bold: false }];
  return [
    { text: m[1], bold: false },
    { text: m[2], bold: true },
  ];
};

export type HeroStat = { value: string; segments: HeroSegment[]; unit: string; label: string };

export const heroStat = (log: ShareCardSession, units: Units = "lb"): HeroStat => {
  const mins = log.duration_minutes;
  if (mins != null && mins > 0) {
    const value =
      mins >= 60
        ? `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`
        : String(mins);
    return { value, segments: splitHeroValue(value), unit: mins >= 60 ? "hrs" : "min", label: "duration" };
  }
  if (log.total_volume > 0) {
    const value = formatNumber(log.total_volume);
    return { value, segments: splitHeroValue(value), unit: units, label: "total volume" };
  }
  const value = String(log.completed_sets);
  return { value, segments: splitHeroValue(value), unit: "sets", label: "completed" };
};

export type MetaColumn = { label: string; value: string };

export const metaColumns = (
  log: ShareCardSession,
  units: Units = "lb",
  prCount?: number,
): MetaColumn[] => {
  const cols: MetaColumn[] = [
    { label: "sets", value: `${log.completed_sets}/${log.total_sets}` },
    { label: `volume · ${units}`, value: formatCompactVolume(log.total_volume) },
    { label: "exercises", value: String(log.exercises.length) },
  ];
  if (prCount != null) cols.push({ label: "prs", value: String(prCount) });
  return cols;
};

/* Primary hit = 1, secondary = 0.5, summed across sessions then
   normalized so the hardest-hit muscle scores 1. */
export const muscleIntensity = (activations: MuscleActivation[]): Map<Muscle, number> => {
  const scores = new Map<Muscle, number>();
  for (const a of activations) {
    for (const m of a.primary) scores.set(m, (scores.get(m) ?? 0) + 1);
    for (const m of a.secondary) {
      if (a.primary.has(m)) continue;
      scores.set(m, (scores.get(m) ?? 0) + 0.5);
    }
  }
  const max = Math.max(0, ...scores.values());
  if (max > 0) for (const [m, v] of scores) scores.set(m, v / max);
  return scores;
};

export type TopMuscle = { muscle: Muscle; score: number };

export const topMuscles = (activations: MuscleActivation[], limit = 5): TopMuscle[] =>
  [...muscleIntensity(activations)]
    .map(([muscle, score]) => ({ muscle, score }))
    .sort((a, b) => b.score - a.score || a.muscle.localeCompare(b.muscle))
    .slice(0, limit);

const MUSCLE_LABELS: Partial<Record<Muscle, string>> = {
  "front-deltoids": "front delts",
  "back-deltoids": "rear delts",
  "upper-back": "upper back",
  "lower-back": "lower back",
  gluteal: "glutes",
  quadriceps: "quads",
  hamstring: "hamstrings",
};

export const muscleLabel = (m: Muscle): string => MUSCLE_LABELS[m] ?? m.replace(/-/g, " ");

/* Greedy word wrap against an injected measure fn so it stays testable
   without a canvas. Last line gets an ellipsis when maxLines truncates. */
export const wrapText = (
  text: string,
  maxWidth: number,
  measure: (s: string) => number,
  maxLines = Infinity,
): string[] => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= maxWidth || !line) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last && measure(`${last}…`) > maxWidth) last = last.slice(0, -1).trimEnd();
  kept[maxLines - 1] = `${last}…`;
  return kept;
};

/* ── Canvas text primitives ─────────────────────────────────── */

type Ctx = CanvasRenderingContext2D;

/* Manual letter tracking — canvas letterSpacing isn't universal in
   WKWebView. Returns the pen x including trailing tracking. */
const drawTracked = (ctx: Ctx, text: string, x: number, y: number, tracking: number): number => {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + tracking;
  }
  return cx;
};

const measureTracked = (ctx: Ctx, text: string, tracking: number): number => {
  let w = 0;
  let count = 0;
  for (const ch of text) {
    w += ctx.measureText(ch).width + tracking;
    count++;
  }
  return count > 0 ? w - tracking : 0;
};

type EyebrowOpts = { size?: number; color?: string; align?: "left" | "right" | "center" };

const drawEyebrow = (ctx: Ctx, text: string, x: number, y: number, theme: Theme, opts: EyebrowOpts = {}) => {
  const size = opts.size ?? 24;
  const tracking = size * 0.18;
  ctx.font = font(600, size);
  ctx.fillStyle = opts.color ?? hexWithAlpha(theme.ink, 0.55);
  const t = text.toUpperCase();
  let startX = x;
  if (opts.align === "right") startX = x - measureTracked(ctx, t, tracking);
  if (opts.align === "center") startX = x - measureTracked(ctx, t, tracking) / 2;
  drawTracked(ctx, t, startX, y, tracking);
};

const drawRule = (ctx: Ctx, y: number, theme: Theme, weight: number, alpha = 1) => {
  ctx.fillStyle = hexWithAlpha(theme.ink, alpha);
  ctx.fillRect(M, y, W - 2 * M, weight);
};

/* ── Muscle figure rendering ────────────────────────────────── */

/* ── Section renderers ──────────────────────────────────────── */


const drawMuscleBars = (ctx: Ctx, top5: TopMuscle[], top: number, theme: Theme) => {
  const rowH = 92;
  const trackX = M + 340;
  const trackW = W - M - trackX;
  top5.forEach(({ muscle, score }, i) => {
    const baseline = top + i * rowH + 30;
    drawEyebrow(ctx, muscleLabel(muscle), M, baseline, theme, { size: 26, color: hexWithAlpha(theme.ink, 0.72) });
    ctx.fillStyle = hexWithAlpha(theme.ink, 0.1);
    ctx.fillRect(trackX, baseline - 18, trackW, 10);
    ctx.fillStyle = theme.accent;
    ctx.fillRect(trackX, baseline - 18, Math.max(10, trackW * score), 10);
  });
};

const drawExerciseList = (ctx: Ctx, log: ShareCardSession, top: number, theme: Theme) => {
  log.exercises.slice(0, 6).forEach((ex, i) => {
    drawEyebrow(ctx, ex.name, M, top + i * 78, theme, { size: 26, color: hexWithAlpha(theme.ink, 0.72) });
  });
};

const loadFonts = async () => {
  try {
    const fonts = document.fonts;
    if (!fonts) return;
    const faces = ["200 260px Inter", "300 68px Inter", "600 74px Inter", "600 24px Inter", "700 40px Inter"];
    await Promise.all(faces.map((f) => fonts.load(f).catch(() => [])));
    await fonts.ready;
  } catch {
    /* Inter unavailable — system stack still renders */
  }
};

/* ── Main entry ─────────────────────────────────────────────── */

export const renderShareCard = async (opts: ShareCardOptions): Promise<Blob> => {
  const { log, activations = [], prCount, dark, units = "lb" } = opts;
  const theme = dark ? THEMES.dark : THEMES.light;

  await loadFonts();

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("share card: 2d context unavailable");

  ctx.fillStyle = theme.canvas;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "alphabetic";

  // Wordmark + date eyebrow on one baseline
  const markY = 172;
  ctx.font = font(700, 40);
  ctx.fillStyle = theme.ink;
  const afterLift = drawTracked(ctx, "LIFT", M, markY, 10);
  ctx.fillStyle = theme.accent;
  drawTracked(ctx, "OS", afterLift, markY, 10);
  drawEyebrow(ctx, formatDateLabel(log.finished_at), W - M, markY - 6, theme, { align: "right" });

  drawRule(ctx, 224, theme, 4);

  // Session name, up to two lines
  ctx.font = font(600, 74);
  const nameLines = wrapText(log.name, W - 2 * M, (s) => measureTracked(ctx, s, -1.5), 2);
  let y = 356;
  ctx.fillStyle = theme.ink;
  for (const line of nameLines) {
    ctx.font = font(600, 74);
    drawTracked(ctx, line, M, y, -1.5);
    y += 90;
  }

  // Hero stat
  const hero = heroStat(log, units);
  y += 76;
  drawEyebrow(ctx, hero.label, M, y, theme);
  y += 236;
  let heroSize = 260;
  const heroTracking = () => -heroSize * 0.03;
  const heroWidth = () => {
    let w = 0;
    for (const seg of hero.segments) {
      ctx.font = font(seg.bold ? 600 : 200, heroSize);
      w += measureTracked(ctx, seg.text, heroTracking()) + heroTracking();
    }
    return w - heroTracking();
  };
  const unitGap = 28;
  ctx.font = font(600, 30);
  const unitWidth = measureTracked(ctx, hero.unit.toUpperCase(), 30 * 0.18);
  const available = W - 2 * M - unitGap - unitWidth;
  const measured = heroWidth();
  if (measured > available) heroSize = Math.floor(heroSize * (available / measured));
  ctx.fillStyle = theme.ink;
  let hx = M;
  for (const seg of hero.segments) {
    ctx.font = font(seg.bold ? 600 : 200, heroSize);
    hx = drawTracked(ctx, seg.text, hx, y, heroTracking());
  }
  drawEyebrow(ctx, hero.unit, hx - heroTracking() + unitGap, y - 8, theme, { size: 30 });

  // Meta columns between hairlines
  y += 84;
  drawRule(ctx, y, theme, 2, 0.16);
  const cols = metaColumns(log, units, prCount);
  const colW = (W - 2 * M) / cols.length;
  const labelY = y + 74;
  const valueY = y + 176;
  cols.forEach((col, i) => {
    const colX = M + i * colW;
    if (i > 0) {
      ctx.fillStyle = hexWithAlpha(theme.ink, 0.16);
      ctx.fillRect(colX - 24, y + 36, 2, 164);
    }
    drawEyebrow(ctx, col.label, colX, labelY, theme, { size: 21 });
    ctx.font = font(300, 66);
    ctx.fillStyle = theme.ink;
    drawTracked(ctx, col.value, colX, valueY, -1);
  });
  y += 240;
  drawRule(ctx, y, theme, 2, 0.16);

  // Muscle section
  y += 92;
  const intensity = muscleIntensity(activations);
  drawEyebrow(ctx, intensity.size > 0 ? "muscles worked" : "exercises", M, y, theme);
  y += 64;
  if (intensity.size > 0) {
    // Anatomy figures retired app-wide (owner's call) — the bar list IS the
    // muscle section now.
    drawMuscleBars(ctx, topMuscles(activations), y + 28, theme);
  } else {
    drawExerciseList(ctx, log, y + 28, theme);
  }

  // Footer echo
  ctx.font = font(700, 26);
  ctx.fillStyle = hexWithAlpha(theme.ink, 0.4);
  const footY = H - 84;
  ctx.font = font(700, 26);
  const footW = measureTracked(ctx, "LIFTOS", 7);
  const footX = (W - footW) / 2;
  const afterFootLift = drawTracked(ctx, "LIFT", footX, footY, 7);
  ctx.fillStyle = hexWithAlpha(theme.accent, 0.8);
  drawTracked(ctx, "OS", afterFootLift, footY, 7);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("share card: toBlob returned null"))),
      "image/png",
    );
  });
};
