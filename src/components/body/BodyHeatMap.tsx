import { useEffect, useMemo, useRef } from "react";
import { useTheme } from "@/context/ThemeContext";
import { getBodyFigure, type BodyGender, type BodyView } from "@/lib/bodyAssets";
import type { Muscle } from "@/lib/muscleMap";

/* Segmented anatomy-chart renderer. The base webps carry a baked AO +
   studio-key-light pass (scripts/bake_body_light.py) so the sculpt reads
   deep in both themes: light draws the baked render as-is, dark remaps it
   onto an espresso clay ramp by luminance.

   Heat is GRADIENT-MAPPED, not tinted: a 256-entry LUT per theme runs
   deep raspberry → raspberry → orange → near-white, indexed by the base's
   own shade times the muscle's heat — crevices stay deep, bellies burn
   toward a hot core, so muscles read lit-from-within. Two tiers: primary
   heat (≥0.75) gets the full ramp plus bloom; secondary heat renders
   dimmer and slightly cooler with no bloom.

   Bloom is a bright-passed 3-level mip chain (only pixels above ~60% ramp
   intensity enter the buffer, downsampled ×2/×4/×8 and re-accumulated) so
   only hot cores halo. A precomputed rim-light crescent (offset-mask
   subtraction, cool white, drawn "lighter") keys the top-left silhouette.

   All pixel work happens once per (figure, theme, heat-signature) — the
   on-screen canvas only blits cached buffers, DPR-aware. The living layer:
   heat IGNITES with an ease-out ramp when it changes and the bloom flares
   mid-ignition; both honor prefers-reduced-motion (static full-heat draw,
   steady glow). composeFigure below still returns the flat single-canvas
   composite for share cards, with the same treatments baked in. */

export type FigureHeat = Partial<Record<Muscle, number>>;

export type ParsedFigure = {
  width: number;
  height: number;
  /** clay base RGBA at natural size */
  base: Uint8ClampedArray;
  /** 0 = backdrop, 255 = figure, soft values on the 1px boundary band */
  alpha: Uint8Array;
  /** per-pixel luminance / backdrop luminance (~1 = highlight) */
  shade: Float32Array;
  /** pixel indices per muscle, from exact id-map colors */
  muscles: Map<Muscle, Uint32Array>;
};

// The base webp is lossy, so the flat backdrop wobbles a few counts — flood
// fill tolerates that; figure edges (much farther from the backdrop) stop it.
const BG_FLOOD_TOLERANCE = 14;
const EDGE_ALPHA_DIST = 80;

const DARK_SHADOW: [number, number, number] = [40, 30, 21];
const DARK_HIGH: [number, number, number] = [186, 148, 116];

const TINT_MAX = 0.85; // full-heat coverage of the ramp over the sculpt

/* ── Treatment: gradient-mapped heat ────────────────────────── */

/* Theme heat ramps, deep → hot core. Indexed by shade × heat so the baked
   sculpt lighting survives under the color. */
export const DARK_HEAT_RAMP = ["#7A1030", "#FF2D6E", "#FF7A45", "#FFE8DC"] as const;
export const LIGHT_HEAT_RAMP = ["#6E0F2E", "#B01E52", "#D95A3A", "#FFF2EA"] as const;
export const HEAT_RAMP_STOPS = [0, 0.42, 0.74, 1] as const;

/* Figure shade (lum/backdrop-lum) spans roughly 0.44..0.95 after the bake —
   this window maps it onto the full ramp. */
const SHADE_FLOOR = 0.42;
const SHADE_CEIL = 0.98;

/* Two-tier emissive: at or above the threshold a muscle is "primary" (full
   ramp + bloom); below it renders dimmer + cooler with no bloom. */
export const PRIMARY_TIER = 0.75;
const SECONDARY_COOL_MIX = 0.3;
const DARK_COOL: [number, number, number] = [172, 92, 156];
const LIGHT_COOL: [number, number, number] = [116, 52, 98];

/* Bright-pass: only ramp intensity above this enters the bloom buffer. */
const BLOOM_BRIGHT_PASS = 0.6;

export const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
};

/** 256-entry RGB LUT (768 bytes), piecewise-linear across the ramp stops. */
export const buildHeatLut = (
  colors: readonly string[],
  stops: readonly number[],
): Uint8ClampedArray => {
  const rgb = colors.map(hexToRgb);
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    let s = 0;
    while (s < stops.length - 2 && x > stops[s + 1]) s++;
    const span = stops[s + 1] - stops[s] || 1;
    const t = Math.min(1, Math.max(0, (x - stops[s]) / span));
    for (let c = 0; c < 3; c++) {
      lut[i * 3 + c] = rgb[s][c] + (rgb[s + 1][c] - rgb[s][c]) * t;
    }
  }
  return lut;
};

const DARK_LUT = buildHeatLut(DARK_HEAT_RAMP, HEAT_RAMP_STOPS);
const LIGHT_LUT = buildHeatLut(LIGHT_HEAT_RAMP, HEAT_RAMP_STOPS);

/** Normalized ramp position for a base-shade value (0 = deep, 1 = hot). */
export const shadeToRamp = (shade: number): number =>
  Math.min(1, Math.max(0, (shade - SHADE_FLOOR) / (SHADE_CEIL - SHADE_FLOOR)));

export const parseFigure = (
  base: ImageData,
  ids: ImageData,
  idColors: Partial<Record<Muscle, [number, number, number]>>,
): ParsedFigure => {
  const { width, height } = base;
  const px = base.data;
  const n = width * height;

  // Backdrop = flood fill from the borders over near-backdrop pixels, so the
  // champagne highlights *inside* the figure never get keyed out.
  const bgR = px[0];
  const bgG = px[1];
  const bgB = px[2];
  const bgDist = (i: number) =>
    Math.abs(px[i * 4] - bgR) + Math.abs(px[i * 4 + 1] - bgG) + Math.abs(px[i * 4 + 2] - bgB);
  const isBg = new Uint8Array(n);
  const stack: number[] = [];
  const visit = (i: number) => {
    if (!isBg[i] && bgDist(i) <= BG_FLOOD_TOLERANCE) {
      isBg[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < width; x++) {
    visit(x);
    visit(n - width + x);
  }
  for (let y = 0; y < height; y++) {
    visit(y * width);
    visit(y * width + width - 1);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % width;
    if (x > 0) visit(i - 1);
    if (x < width - 1) visit(i + 1);
    if (i >= width) visit(i - width);
    if (i < n - width) visit(i + width);
  }

  // Despeckle: the lossy encoder rings the flat backdrop along the
  // high-contrast silhouette, leaving isolated pixels just past the flood
  // tolerance — they'd theme into bright dust around the figure. Absorb
  // near-backdrop pixels that are mostly surrounded by backdrop; genuine
  // figure edges sit far from the backdrop color and never qualify.
  const DESPECKLE_DIST = 48;
  for (let pass = 0; pass < 2; pass++) {
    const flip: number[] = [];
    for (let i = 0; i < n; i++) {
      if (isBg[i] || bgDist(i) > DESPECKLE_DIST) continue;
      const x = i % width;
      let bgNeighbors = 0;
      if (x === 0 || isBg[i - 1]) bgNeighbors++;
      if (x === width - 1 || isBg[i + 1]) bgNeighbors++;
      if (i < width || isBg[i - width]) bgNeighbors++;
      if (i >= n - width || isBg[i + width]) bgNeighbors++;
      if (bgNeighbors >= 3) flip.push(i);
    }
    if (flip.length === 0) break;
    for (const i of flip) isBg[i] = 1;
  }

  const bgLum = 0.2126 * bgR + 0.7152 * bgG + 0.0722 * bgB;
  const alpha = new Uint8Array(n);
  const shade = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    shade[i] =
      (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / bgLum;
    if (isBg[i]) continue;
    const x = i % width;
    const onEdge =
      (x > 0 && isBg[i - 1]) ||
      (x < width - 1 && isBg[i + 1]) ||
      (i >= width && isBg[i - width]) ||
      (i < n - width && isBg[i + width]);
    alpha[i] = onEdge ? Math.min(255, Math.round((bgDist(i) * 255) / EDGE_ALPHA_DIST)) : 255;
  }

  // Exact-color lookup: every id pixel is either black or a manifest color.
  const key = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;
  const byKey = new Map<number, Muscle>();
  for (const [muscle, c] of Object.entries(idColors) as [Muscle, [number, number, number]][]) {
    byKey.set(key(c[0], c[1], c[2]), muscle);
  }
  const lists = new Map<Muscle, number[]>();
  const idPx = ids.data;
  for (let i = 0; i < n; i++) {
    const muscle = byKey.get(key(idPx[i * 4], idPx[i * 4 + 1], idPx[i * 4 + 2]));
    if (!muscle) continue;
    let list = lists.get(muscle);
    if (!list) lists.set(muscle, (list = []));
    list.push(i);
  }
  const muscles = new Map<Muscle, Uint32Array>();
  for (const [muscle, list] of lists) muscles.set(muscle, Uint32Array.from(list));

  return { width, height, base: px, alpha, shade, muscles };
};

/* ── Pure pixel passes (unit-tested without a canvas) ───────── */

/** Themed base pixels: light = the baked render as-is; dark = the render
    remapped onto the espresso clay ramp by luminance. */
export const computeBasePixels = (fig: ParsedFigure, dark: boolean): Uint8ClampedArray => {
  const { width, height, base, alpha, shade } = fig;
  const n = width * height;
  const data = new Uint8ClampedArray(n * 4);
  if (dark) {
    const [sr, sg, sb] = DARK_SHADOW;
    const [hr, hg, hb] = DARK_HIGH;
    for (let i = 0; i < n; i++) {
      const a = alpha[i];
      if (!a) continue;
      const t = Math.pow(Math.min(shade[i], 1), 1.25);
      data[i * 4] = sr + (hr - sr) * t;
      data[i * 4 + 1] = sg + (hg - sg) * t;
      data[i * 4 + 2] = sb + (hb - sb) * t;
      data[i * 4 + 3] = a;
    }
  } else {
    for (let i = 0; i < n; i++) {
      const a = alpha[i];
      if (!a) continue;
      data[i * 4] = base[i * 4];
      data[i * 4 + 1] = base[i * 4 + 1];
      data[i * 4 + 2] = base[i * 4 + 2];
      data[i * 4 + 3] = a;
    }
  }
  return data;
};

export type HeatBuffers = {
  /** gradient-mapped heat overlay, straight alpha */
  heat: Uint8ClampedArray;
  /** bright-passed emissive seed for the bloom mip chain */
  seed: Uint8ClampedArray;
  /** false when no primary-tier pixel cleared the bright pass */
  seeded: boolean;
};

/** Gradient-map the heat: LUT position = shade × heat, so the baked sculpt
    lighting survives under the color. Primary-tier pixels above the bright
    pass also land in the bloom seed; secondaries are cooled and never do. */
export const computeHeatBuffers = (
  fig: ParsedFigure,
  heat: FigureHeat,
  dark: boolean,
): HeatBuffers => {
  const { width, height, alpha, shade, muscles } = fig;
  const n = width * height;
  const heatData = new Uint8ClampedArray(n * 4);
  const seedData = new Uint8ClampedArray(n * 4);
  let seeded = false;

  const lut = dark ? DARK_LUT : LIGHT_LUT;
  const cool = dark ? DARK_COOL : LIGHT_COOL;

  for (const [muscle, indices] of muscles) {
    const h = heat[muscle];
    if (!h || h <= 0) continue;
    const hv = Math.min(h, 1);
    const primary = hv >= PRIMARY_TIER;
    const coolMix = primary ? 0 : SECONDARY_COOL_MIX;
    const t = TINT_MAX * hv;
    for (let k = 0; k < indices.length; k++) {
      const i = indices[k];
      const a = alpha[i];
      if (!a) continue;
      const x = shadeToRamp(shade[i]) * hv;
      const j = Math.round(x * 255) * 3;
      let r = lut[j];
      let g = lut[j + 1];
      let b = lut[j + 2];
      if (coolMix > 0) {
        r += (cool[0] - r) * coolMix;
        g += (cool[1] - g) * coolMix;
        b += (cool[2] - b) * coolMix;
      }
      heatData[i * 4] = r;
      heatData[i * 4 + 1] = g;
      heatData[i * 4 + 2] = b;
      heatData[i * 4 + 3] = t * a;
      if (primary && x >= BLOOM_BRIGHT_PASS) {
        const e = (x - BLOOM_BRIGHT_PASS) / (1 - BLOOM_BRIGHT_PASS);
        seedData[i * 4] = r;
        seedData[i * 4 + 1] = g;
        seedData[i * 4 + 2] = b;
        seedData[i * 4 + 3] = e * t * a;
        seeded = true;
      }
    }
  }
  return { heat: heatData, seed: seedData, seeded };
};

/* ── Canvas layers ──────────────────────────────────────────── */

const pixelCanvas = (data: Uint8ClampedArray, width: number, height: number): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("body heat map: 2d context unavailable");
  ctx.putImageData(new ImageData(data, width, height), 0, 0);
  return canvas;
};

/** Progressive bloom: 3-level down/upsample mip chain over the bright-passed
    seed. Returns a half-resolution buffer to draw additively ("lighter"). */
const composeBloom = (seed: HTMLCanvasElement): HTMLCanvasElement | null => {
  const mips: HTMLCanvasElement[] = [];
  let src: HTMLCanvasElement = seed;
  for (const div of [2, 2, 2]) {
    const mip = document.createElement("canvas");
    mip.width = Math.max(1, Math.round(src.width / div));
    mip.height = Math.max(1, Math.round(src.height / div));
    const ctx = mip.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, mip.width, mip.height);
    mips.push(mip);
    src = mip;
  }
  // Accumulate wide-to-tight into the half-res buffer: the ×8 mip carries the
  // broad halo, ×4 the mid falloff, ×2 the hot core.
  const out = document.createElement("canvas");
  out.width = mips[0].width;
  out.height = mips[0].height;
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.globalCompositeOperation = "lighter";
  const weights = [0.3, 0.42, 0.55];
  mips.forEach((mip, level) => {
    ctx.globalAlpha = weights[level];
    ctx.drawImage(mip, 0, 0, out.width, out.height);
  });
  return out;
};

type HeatLayers = { heat: HTMLCanvasElement; bloom: HTMLCanvasElement | null };

const composeHeatLayers = (fig: ParsedFigure, heat: FigureHeat, dark: boolean): HeatLayers => {
  const buffers = computeHeatBuffers(fig, heat, dark);
  const heatCanvas = pixelCanvas(buffers.heat, fig.width, fig.height);
  const bloom = buffers.seeded
    ? composeBloom(pixelCanvas(buffers.seed, fig.width, fig.height))
    : null;
  return { heat: heatCanvas, bloom };
};

/* ── Treatment: rim light ───────────────────────────────────── */

const RIM_OFFSET: [number, number] = [-1, -2];
const RIM_INNER_OFFSET: [number, number] = [2, 3];
const RIM_COLOR = { dark: "rgba(206, 224, 255, 0.30)", light: "rgba(255, 255, 255, 0.55)" };
const RIM_INNER_ALPHA = 0.6; // inner crescent relative to the outer

/* Hard (binarized) silhouette — the soft antialias band must not enter the
   crescent subtraction or a low-alpha veil survives around the whole figure
   instead of a clean top-left rim. */
const figureMask = (fig: ParsedFigure): HTMLCanvasElement => {
  const { width, height, alpha } = fig;
  const n = width * height;
  const data = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    if (alpha[i] < 140) continue;
    data[i * 4] = 255;
    data[i * 4 + 1] = 255;
    data[i * 4 + 2] = 255;
    data[i * 4 + 3] = 255;
  }
  return pixelCanvas(data, width, height);
};

/** mask shifted by (dx,dy) minus mask at (sx,sy), filled with `color`. */
const crescent = (
  mask: HTMLCanvasElement,
  [dx, dy]: [number, number],
  [sx, sy]: [number, number],
  color: string,
): HTMLCanvasElement | null => {
  const out = document.createElement("canvas");
  out.width = mask.width;
  out.height = mask.height;
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(mask, dx, dy);
  ctx.globalCompositeOperation = "destination-out";
  ctx.drawImage(mask, sx, sy);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, out.width, out.height);
  return out;
};

/* Static per-figure-per-theme silhouette rim: the alpha mask offset up-left
   and source-outed against itself leaves a top-left crescent along the
   silhouette; a thinner inner crescent lets the rim read on the porcelain
   light theme too. Drawn with "lighter". */
const rimCache = new WeakMap<ParsedFigure, Partial<Record<"light" | "dark", HTMLCanvasElement>>>();

const rimLayer = (fig: ParsedFigure, dark: boolean): HTMLCanvasElement | null => {
  const themeKey = dark ? "dark" : "light";
  let perTheme = rimCache.get(fig);
  const cached = perTheme?.[themeKey];
  if (cached) return cached;
  const mask = figureMask(fig);
  const color = RIM_COLOR[themeKey];
  const outer = crescent(mask, RIM_OFFSET, [0, 0], color);
  const inner = crescent(mask, [0, 0], RIM_INNER_OFFSET, color);
  if (!outer || !inner) return null;
  const ctx = outer.getContext("2d");
  if (!ctx) return null;
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = RIM_INNER_ALPHA;
  ctx.drawImage(inner, 0, 0);
  ctx.globalAlpha = 1;
  if (!perTheme) rimCache.set(fig, (perTheme = {}));
  perTheme[themeKey] = outer;
  return outer;
};

/* ── Flat composite (share-card path) ───────────────────────── */

// Steady glow strengths for the additive bloom pass; ignition flares brighter.
const BLOOM_STEADY = { light: 0.35, dark: 0.55 };
const BLOOM_FLARE = { light: 0.32, dark: 0.5 };

/** Compose the themed figure + heat + rim + bloom into a natural-size
    canvas — the flat composite the share card draws. */
export const composeFigure = (
  fig: ParsedFigure,
  heat: FigureHeat,
  dark: boolean,
  out?: HTMLCanvasElement,
): HTMLCanvasElement => {
  const { width, height } = fig;
  const canvas = out ?? document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("body heat map: 2d context unavailable");
  ctx.putImageData(new ImageData(computeBasePixels(fig, dark), width, height), 0, 0);

  const hasHeat = Object.values(heat).some((h) => (h ?? 0) > 0);
  let bloom: HTMLCanvasElement | null = null;
  if (hasHeat) {
    const layers = composeHeatLayers(fig, heat, dark);
    ctx.drawImage(layers.heat, 0, 0);
    bloom = layers.bloom;
  }
  const rim = rimLayer(fig, dark);
  ctx.globalCompositeOperation = "lighter";
  if (rim) ctx.drawImage(rim, 0, 0);
  if (bloom) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.globalAlpha = dark ? BLOOM_STEADY.dark : BLOOM_STEADY.light;
    ctx.drawImage(bloom, 0, 0, width, height);
    ctx.globalAlpha = 1;
  }
  ctx.globalCompositeOperation = "source-over";
  return canvas;
};

/* ── Figure loading — parsed once per figure, module-global ─── */

const parsedCache = new Map<string, Promise<ParsedFigure>>();

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`body heat map: image failed to load: ${src}`));
    img.src = src;
  });

const readPixels = (img: HTMLImageElement, width: number, height: number): ImageData => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("body heat map: 2d context unavailable");
  ctx.imageSmoothingEnabled = false; // id colors must stay exact
  ctx.drawImage(img, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
};

export const loadFigure = (gender: BodyGender, view: BodyView): Promise<ParsedFigure> => {
  const cacheKey = `${gender}-${view}`;
  let parsed = parsedCache.get(cacheKey);
  if (!parsed) {
    const { base, ids, idColors } = getBodyFigure(gender, view);
    parsed = Promise.all([loadImage(base), loadImage(ids)]).then(([baseImg, idsImg]) =>
      parseFigure(
        readPixels(baseImg, baseImg.naturalWidth, baseImg.naturalHeight),
        readPixels(idsImg, baseImg.naturalWidth, baseImg.naturalHeight),
        idColors,
      ),
    );
    parsed.catch(() => parsedCache.delete(cacheKey));
    parsedCache.set(cacheKey, parsed);
  }
  return parsed;
};

/* ── Component ──────────────────────────────────────────────── */

type Props = {
  gender: BodyGender;
  view: BodyView;
  /** Per-muscle heat 0..1 (see activationHeat in @/lib/bodyAssets). */
  heat: FigureHeat;
  className?: string;
};

// Plain (heat-free, rim-free) themed bases, composed once per figure per theme.
const baseCache = new Map<string, HTMLCanvasElement>();
const themedBase = (
  fig: ParsedFigure,
  gender: BodyGender,
  view: BodyView,
  dark: boolean,
): HTMLCanvasElement => {
  const key = `${gender}-${view}-${dark ? "dark" : "light"}`;
  let base = baseCache.get(key);
  if (!base) {
    base = pixelCanvas(computeBasePixels(fig, dark), fig.width, fig.height);
    baseCache.set(key, base);
  }
  return base;
};

// Heat + bloom layers cached per (figure, theme, heat-signature) so theme
// flips and remounts never redo pixel work. Small FIFO keeps memory flat.
const heatLayerCache = new Map<string, HeatLayers>();
const HEAT_CACHE_MAX = 12;
const cachedHeatLayers = (
  fig: ParsedFigure,
  heat: FigureHeat,
  dark: boolean,
  key: string,
): HeatLayers => {
  let layers = heatLayerCache.get(key);
  if (!layers) {
    layers = composeHeatLayers(fig, heat, dark);
    heatLayerCache.set(key, layers);
    if (heatLayerCache.size > HEAT_CACHE_MAX) {
      const oldest = heatLayerCache.keys().next().value;
      if (oldest !== undefined) heatLayerCache.delete(oldest);
    }
  }
  return layers;
};

const IGNITE_MS = 650;

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

export const BodyHeatMap = ({ gender, view, heat, className }: Props) => {
  const { isDark } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layersRef = useRef<{
    base: HTMLCanvasElement;
    heat: HTMLCanvasElement | null;
    rim: HTMLCanvasElement | null;
    bloom: HTMLCanvasElement | null;
  } | null>(null);
  // Last-drawn alphas so resize redraws mid- or post-animation state.
  const drawnRef = useRef({ heatAlpha: 1, bloomAlpha: 0 });
  const rafRef = useRef(0);
  const heatKeyRef = useRef<string | null>(null);

  const draw = (heatAlpha: number, bloomAlpha: number) => {
    const canvas = canvasRef.current;
    const layers = layersRef.current;
    if (!canvas || !layers) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (w <= 0 || h <= 0) return;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(layers.base, 0, 0, w, h);
    if (layers.heat && heatAlpha > 0) {
      ctx.globalAlpha = heatAlpha;
      ctx.drawImage(layers.heat, 0, 0, w, h);
    }
    ctx.globalCompositeOperation = "lighter";
    if (layers.rim) {
      ctx.globalAlpha = 1;
      ctx.drawImage(layers.rim, 0, 0, w, h);
    }
    if (layers.bloom && bloomAlpha > 0) {
      ctx.globalAlpha = Math.min(1, bloomAlpha);
      ctx.drawImage(layers.bloom, 0, 0, w, h);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    drawnRef.current = { heatAlpha, bloomAlpha };
  };

  // Serialized heat content — the ignite effect keys on VALUE, not object
  // identity: consumers rebuild the heat object every render, and letting
  // that identity into the deps cancelled mid-flight ignitions (the re-run
  // sees an unchanged key, skips igniting, and snaps to the end state).
  const heatSignature = useMemo(
    () =>
      JSON.stringify(
        Object.entries(heat)
          .filter(([, h]) => (h ?? 0) > 0)
          .sort(([a], [b]) => (a < b ? -1 : 1)),
      ),
    [heat],
  );

  useEffect(() => {
    let cancelled = false;
    void loadFigure(gender, view)
      .then((fig) => {
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        // CSS aspect ratio comes from the image, so consumers can size
        // either axis and the other follows.
        canvas.style.aspectRatio = `${fig.width} / ${fig.height}`;

        // Re-ignite only when the heat itself changes — theme flips and
        // resizes redraw statically.
        const heatKey = `${gender}-${view}:${heatSignature}`;

        const hasHeat = heatSignature !== "[]";
        const layers = hasHeat
          ? cachedHeatLayers(fig, heat, isDark, `${heatKey}:${isDark ? "dark" : "light"}`)
          : null;
        layersRef.current = {
          base: themedBase(fig, gender, view, isDark),
          heat: layers?.heat ?? null,
          rim: rimLayer(fig, isDark),
          bloom: layers?.bloom ?? null,
        };

        const steady = isDark ? BLOOM_STEADY.dark : BLOOM_STEADY.light;
        const flare = isDark ? BLOOM_FLARE.dark : BLOOM_FLARE.light;

        const shouldIgnite =
          hasHeat && heatKey !== heatKeyRef.current && !prefersReducedMotion();
        heatKeyRef.current = heatKey;

        window.cancelAnimationFrame(rafRef.current);
        if (!shouldIgnite) {
          draw(1, hasHeat ? steady : 0);
          return;
        }
        const start = performance.now();
        const tick = (now: number) => {
          if (cancelled) return;
          const p = Math.min(1, (now - start) / IGNITE_MS);
          const ease = 1 - (1 - p) ** 3;
          // Flare peaks mid-ignition, settles onto the steady ember.
          draw(ease, steady * ease + flare * Math.sin(p * Math.PI));
          if (p < 1) rafRef.current = window.requestAnimationFrame(tick);
        };
        rafRef.current = window.requestAnimationFrame(tick);
      })
      .catch(() => {
        /* figure assets unavailable — canvas stays empty */
      });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafRef.current);
    };
    // `heat` is read via closure; heatSignature stands in for it by value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gender, view, heatSignature, isDark]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      const { heatAlpha, bloomAlpha } = drawnRef.current;
      if (layersRef.current) draw(heatAlpha, bloomAlpha);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const label = useMemo(() => {
    const lit = (Object.entries(heat) as [Muscle, number][])
      .filter(([, h]) => h > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([muscle]) => muscle.replace(/-/g, " "));
    const side = view === "front" ? "Front" : "Back";
    return lit.length > 0
      ? `${side} of body — worked muscles: ${lit.join(", ")}`
      : `${side} of body — no muscles highlighted`;
  }, [heat, view]);

  return <canvas ref={canvasRef} role="img" aria-label={label} className={className} />;
};
