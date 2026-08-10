export type PlateUnit = "lb" | "kg";

export type PlateMathOptions = {
  unit: PlateUnit;
  barWeight?: number;
  availablePlates?: number[];
};

export type PlateMathResult = {
  perSide: number[];
  total: number;
  remainder: number;
  barWeight: number;
};

const DEFAULT_BARS: Record<PlateUnit, number> = { lb: 45, kg: 20 };

const DEFAULT_PLATES: Record<PlateUnit, number[]> = {
  lb: [45, 35, 25, 10, 5, 2.5],
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
};

// guards against float drift when summing 2.5 / 1.25 plates
const round2 = (n: number) => Math.round(n * 100) / 100;
const EPS = 1e-9;

export const plateBreakdown = (
  targetWeight: number,
  opts: PlateMathOptions,
): PlateMathResult => {
  const barWeight =
    Number.isFinite(opts.barWeight) && (opts.barWeight as number) > 0
      ? (opts.barWeight as number)
      : DEFAULT_BARS[opts.unit];

  if (!Number.isFinite(targetWeight) || targetWeight <= 0) {
    return { perSide: [], total: 0, remainder: 0, barWeight };
  }

  if (targetWeight <= barWeight) {
    return { perSide: [], total: barWeight, remainder: round2(targetWeight - barWeight), barWeight };
  }

  const plates = (opts.availablePlates ?? DEFAULT_PLATES[opts.unit])
    .filter((p) => Number.isFinite(p) && p > 0)
    .sort((a, b) => b - a);

  const perSide: number[] = [];
  let remaining = (targetWeight - barWeight) / 2;
  for (const plate of plates) {
    while (remaining >= plate - EPS) {
      perSide.push(plate);
      remaining = round2(remaining - plate);
    }
  }

  const total = round2(barWeight + 2 * perSide.reduce((s, p) => s + p, 0));
  return { perSide, total, remainder: round2(targetWeight - total), barWeight };
};

export const formatPerSide = (perSide: number[]): string =>
  perSide.map((p) => String(p)).join(" + ");

export const formatPlateMath = (result: PlateMathResult): string => {
  const { perSide, total, remainder, barWeight } = result;
  if (total <= 0) return "—";
  const base =
    perSide.length === 0 ? `Bar only (${barWeight})` : `${formatPerSide(perSide)} per side`;
  return remainder === 0 ? base : `${base} · closest: ${total}`;
};
