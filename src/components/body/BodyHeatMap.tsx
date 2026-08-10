import { useEffect, useMemo, useRef } from "react";
import { useTheme } from "@/context/ThemeContext";
import { getBodyFigure, type BodyGender, type BodyView } from "@/lib/bodyAssets";
import type { Muscle } from "@/lib/muscleMap";

/* Segmented anatomy-chart renderer. The clay base is drawn as-is in the
   light theme and remapped onto an espresso clay ramp in the dark theme;
   per-muscle terracotta heat is composited by matching the id map's exact
   colors, shaded by the base's own luminance so the sculpt reads through.
   All pixel work happens once per figure at natural size — the on-screen
   canvas only blits the composed buffer, DPR-aware. */

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

const LIGHT_HOT: [number, number, number] = [200, 80, 46]; // #C8502E
const DARK_HOT: [number, number, number] = [224, 106, 64]; // #E06A40
const DARK_SHADOW: [number, number, number] = [40, 30, 21];
const DARK_HIGH: [number, number, number] = [186, 148, 116];

const TINT_MAX = 0.85; // full-heat blend toward terracotta (clay demo value)
const DARK_GLOW = 0.16; // emissive-style lift so heat stays vivid on espresso
const SHADE_REF = 0.85; // muscle luminance that maps to the pure hot color

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

/** Compose the themed figure + heat overlay into a natural-size canvas. */
export const composeFigure = (
  fig: ParsedFigure,
  heat: FigureHeat,
  dark: boolean,
  out?: HTMLCanvasElement,
): HTMLCanvasElement => {
  const { width, height, base, alpha, shade, muscles } = fig;
  const n = width * height;
  const data = new Uint8ClampedArray(n * 4);

  if (dark) {
    // Remap the champagne render onto the espresso clay ramp by luminance.
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

  const hot = dark ? DARK_HOT : LIGHT_HOT;
  for (const [muscle, indices] of muscles) {
    const h = heat[muscle];
    if (!h || h <= 0) continue;
    const t = TINT_MAX * Math.min(h, 1);
    const glow = dark ? DARK_GLOW * Math.min(h, 1) : 0;
    for (let k = 0; k < indices.length; k++) {
      const i = indices[k];
      if (!alpha[i]) continue;
      // Modulate the hot color by the sculpt's shading so striations survive.
      const sf = Math.min(shade[i] / SHADE_REF, 1.15);
      for (let c = 0; c < 3; c++) {
        const idx = i * 4 + c;
        data[idx] = data[idx] * (1 - t) + hot[c] * sf * t + hot[c] * glow;
      }
    }
  }

  const canvas = out ?? document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("body heat map: 2d context unavailable");
  ctx.putImageData(new ImageData(data, width, height), 0, 0);
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

const blit = (canvas: HTMLCanvasElement, buffer: HTMLCanvasElement) => {
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
  ctx.drawImage(buffer, 0, 0, w, h);
};

export const BodyHeatMap = ({ gender, view, heat, className }: Props) => {
  const { isDark } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bufferRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadFigure(gender, view)
      .then((fig) => {
        const canvas = canvasRef.current;
        if (cancelled || !canvas) return;
        // CSS aspect ratio comes from the image, so consumers can size
        // either axis and the other follows.
        canvas.style.aspectRatio = `${fig.width} / ${fig.height}`;
        bufferRef.current = composeFigure(fig, heat, isDark, bufferRef.current ?? undefined);
        blit(canvas, bufferRef.current);
      })
      .catch(() => {
        /* figure assets unavailable — canvas stays empty */
      });
    return () => {
      cancelled = true;
    };
  }, [gender, view, heat, isDark]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      if (bufferRef.current) blit(canvas, bufferRef.current);
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
