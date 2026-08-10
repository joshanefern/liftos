import type { Muscle, MuscleActivation } from "@/lib/muscleMap";
import manifest from "@/assets/body/manifest.json";

import maleFrontBase from "@/assets/body/male-front-base.webp";
import maleFrontIds from "@/assets/body/male-front-ids.png";
import maleBackBase from "@/assets/body/male-back-base.webp";
import maleBackIds from "@/assets/body/male-back-ids.png";
import femaleFrontBase from "@/assets/body/female-front-base.webp";
import femaleFrontIds from "@/assets/body/female-front-ids.png";
import femaleBackBase from "@/assets/body/female-back-base.webp";
import femaleBackIds from "@/assets/body/female-back-ids.png";

/* The segmented anatomy charts (one clay-shaded base + one flat ID-color
   map per figure). Every pixel of the ID map is either black (no muscle)
   or the exact RGB listed in the manifest for that figure's muscle —
   compare with equality, never tolerance. */

export type BodyGender = "male" | "female";
export type BodyView = "front" | "back";

export type BodyFigure = {
  base: string;
  ids: string;
  /** muscle -> exact [r, g, b] in the ids image */
  idColors: Partial<Record<Muscle, [number, number, number]>>;
};

const figureAssets: Record<BodyGender, Record<BodyView, { base: string; ids: string }>> = {
  male: {
    front: { base: maleFrontBase, ids: maleFrontIds },
    back: { base: maleBackBase, ids: maleBackIds },
  },
  female: {
    front: { base: femaleFrontBase, ids: femaleFrontIds },
    back: { base: femaleBackBase, ids: femaleBackIds },
  },
};

export const getBodyFigure = (gender: BodyGender, view: BodyView): BodyFigure => ({
  ...figureAssets[gender][view],
  // JSON imports type color triples as number[], so the tuple cast must go
  // through unknown.
  idColors: (manifest as unknown as Record<
    string,
    Partial<Record<Muscle, [number, number, number]>>
  >)[`${gender}-${view}`] ?? {},
});

/** Flatten MuscleActivation(s) into per-muscle heat 0..1. Primary muscles
    carry full intensity, secondaries half — same weighting the old 2D map
    used, so heat reads consistently across the app. */
export const activationHeat = (
  activations: MuscleActivation[] | undefined,
): Partial<Record<Muscle, number>> => {
  const heat: Partial<Record<Muscle, number>> = {};
  if (!activations?.length) return heat;
  for (const a of activations) {
    for (const m of a.secondary) heat[m] = Math.max(heat[m] ?? 0, 0.45);
    for (const m of a.primary) heat[m] = 1;
  }
  return heat;
};

