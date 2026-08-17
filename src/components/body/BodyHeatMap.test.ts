import { describe, expect, it } from "vitest";
import {
  buildHeatLut,
  computeBasePixels,
  computeHeatBuffers,
  DARK_HEAT_RAMP,
  HEAT_RAMP_STOPS,
  hexToRgb,
  LIGHT_HEAT_RAMP,
  parseFigure,
  PRIMARY_TIER,
  shadeToRamp,
  type ParsedFigure,
} from "./BodyHeatMap";
import type { Muscle } from "@/lib/muscleMap";

const luminance = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

describe("hexToRgb", () => {
  it("parses hex triplets", () => {
    expect(hexToRgb("#FF2D6E")).toEqual([255, 45, 110]);
    expect(hexToRgb("#000000")).toEqual([0, 0, 0]);
  });
});

describe("buildHeatLut", () => {
  it("produces a 256-entry RGB table anchored at the ramp ends", () => {
    for (const ramp of [DARK_HEAT_RAMP, LIGHT_HEAT_RAMP]) {
      const lut = buildHeatLut(ramp, HEAT_RAMP_STOPS);
      expect(lut.length).toBe(256 * 3);
      expect([lut[0], lut[1], lut[2]]).toEqual(hexToRgb(ramp[0]));
      expect([lut[255 * 3], lut[255 * 3 + 1], lut[255 * 3 + 2]]).toEqual(
        hexToRgb(ramp[ramp.length - 1]),
      );
    }
  });

  it("runs monotonically brighter toward the hot core", () => {
    const lut = buildHeatLut(DARK_HEAT_RAMP, HEAT_RAMP_STOPS);
    let prev = -1;
    for (let i = 0; i < 256; i++) {
      const l = luminance(lut[i * 3], lut[i * 3 + 1], lut[i * 3 + 2]);
      expect(l).toBeGreaterThanOrEqual(prev - 0.75); // rounding slack
      prev = l;
    }
    // The full sweep spans deep-shadow to near-white.
    expect(luminance(lut[0], lut[1], lut[2])).toBeLessThan(60);
    expect(luminance(lut[765], lut[766], lut[767])).toBeGreaterThan(220);
  });
});

describe("shadeToRamp", () => {
  it("clamps to the sculpt's shade window", () => {
    expect(shadeToRamp(0)).toBe(0);
    expect(shadeToRamp(0.42)).toBe(0);
    expect(shadeToRamp(2)).toBe(1);
    const mid = shadeToRamp(0.7);
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.7);
  });
});

/* Tiny synthetic figure: one row of six pixels.
   px 0-2 → "chest" at shade 0.45 / 0.70 / 0.97, px 3-5 → "biceps" mirrored. */
const makeFig = (): ParsedFigure => {
  const width = 6;
  const height = 1;
  const shadeValues = [0.45, 0.7, 0.97, 0.45, 0.7, 0.97];
  const base = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width; i++) {
    const v = Math.round(shadeValues[i] * 226);
    base[i * 4] = v;
    base[i * 4 + 1] = v;
    base[i * 4 + 2] = v;
    base[i * 4 + 3] = 255;
  }
  return {
    width,
    height,
    base,
    alpha: Uint8Array.from([255, 255, 255, 255, 255, 0]),
    shade: Float32Array.from(shadeValues),
    muscles: new Map<Muscle, Uint32Array>([
      ["chest", Uint32Array.from([0, 1, 2])],
      ["biceps", Uint32Array.from([3, 4, 5])],
    ]),
  };
};

describe("computeHeatBuffers", () => {
  it("gradient-maps primary heat by shade — deep crevices, near-white cores", () => {
    const { heat, seed, seeded } = computeHeatBuffers(makeFig(), { chest: 1 }, true);
    // Low-shade pixel sits at the deep end of the ramp.
    const deep = luminance(heat[0], heat[1], heat[2]);
    const core = luminance(heat[8], heat[9], heat[10]);
    expect(deep).toBeLessThan(60);
    expect(core).toBeGreaterThan(200);
    // Coverage alpha = TINT_MAX × heat × pixel alpha.
    expect(heat[3]).toBe(Math.round(0.85 * 255));
    // Bright pass: only the hot core enters the bloom seed.
    expect(seeded).toBe(true);
    expect(seed[3]).toBe(0);
    expect(seed[7]).toBe(0);
    expect(seed[11]).toBeGreaterThan(0);
  });

  it("keeps secondary heat dim, cooler, and out of the bloom seed", () => {
    const fig = makeFig();
    const secondaryHeat = PRIMARY_TIER - 0.3;
    const { heat, seed, seeded } = computeHeatBuffers(fig, { biceps: secondaryHeat }, true);
    expect(seeded).toBe(false);
    expect(seed.every((v) => v === 0)).toBe(true);
    // Dimmer: coverage alpha scales with the lower heat value.
    expect(heat[3 * 4 + 3]).toBe(Math.round(0.85 * secondaryHeat * 255));
    // Cooler: differs from what the same pixel renders at primary tier
    // (cool mix pushes the hue off the pure ramp).
    const { heat: primary } = computeHeatBuffers(fig, { biceps: 1 }, true);
    expect(heat[3 * 4]).not.toBe(primary[3 * 4]);
    // Zero-alpha pixels never receive heat.
    expect(heat[5 * 4 + 3]).toBe(0);
  });

  it("skips muscles with no heat", () => {
    const { heat, seeded } = computeHeatBuffers(makeFig(), { chest: 0 }, false);
    expect(seeded).toBe(false);
    expect(heat.every((v) => v === 0)).toBe(true);
  });
});

describe("computeBasePixels", () => {
  it("passes the baked render through in light and remaps to espresso in dark", () => {
    const fig = makeFig();
    const light = computeBasePixels(fig, false);
    expect([light[0], light[1], light[2], light[3]]).toEqual([
      fig.base[0],
      fig.base[1],
      fig.base[2],
      255,
    ]);
    const dark = computeBasePixels(fig, true);
    // Dark ramp: higher shade → warmer/lighter clay, never the raw base gray.
    const low = luminance(dark[0], dark[1], dark[2]);
    const high = luminance(dark[8], dark[9], dark[10]);
    expect(high).toBeGreaterThan(low);
    expect(dark[0]).not.toBe(fig.base[0]);
    // Backdrop pixels stay fully transparent.
    expect(dark[5 * 4 + 3]).toBe(0);
  });
});

describe("parseFigure", () => {
  it("keys the flood-filled backdrop and indexes muscles by exact id color", () => {
    // 4×4: uniform backdrop (200,200,200) with a 2×2 dark figure block.
    const width = 4;
    const height = 4;
    const base = new Uint8ClampedArray(width * height * 4);
    const ids = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      base[i * 4] = 200;
      base[i * 4 + 1] = 200;
      base[i * 4 + 2] = 200;
      base[i * 4 + 3] = 255;
      ids[i * 4 + 3] = 255;
    }
    for (const i of [5, 6, 9, 10]) {
      base[i * 4] = 100;
      base[i * 4 + 1] = 100;
      base[i * 4 + 2] = 100;
      ids[i * 4] = 161;
      ids[i * 4 + 1] = 97;
      ids[i * 4 + 2] = 23; // chest id color
    }
    const asImageData = (data: Uint8ClampedArray) =>
      ({ width, height, data }) as unknown as ImageData;
    const fig = parseFigure(asImageData(base), asImageData(ids), {
      chest: [161, 97, 23],
    });
    expect(fig.alpha[0]).toBe(0); // backdrop keyed out
    expect(fig.alpha[5]).toBeGreaterThan(0); // figure kept
    expect([...(fig.muscles.get("chest") ?? [])]).toEqual([5, 6, 9, 10]);
    expect(fig.shade[5]).toBeCloseTo(100 / 200, 5);
  });
});
