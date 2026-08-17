import { BodyHeatMap, type FigureHeat } from "@/components/body/BodyHeatMap";
import type { BodyGender, BodyView } from "@/lib/bodyAssets";
import type { Muscle } from "@/lib/muscleMap";
import { cn } from "@/lib/utils";
import { useState } from "react";

type Gender = BodyGender;

// The legend gradient can't resolve var() inside canvas-adjacent consumers —
// token colors are sampled off :root at render time.
const tokenHsl = (name: string, alpha = 1): string => {
  if (typeof document === "undefined") return "transparent";
  const triplet = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!triplet) return "transparent";
  return alpha >= 1 ? `hsl(${triplet})` : `hsl(${triplet} / ${alpha})`;
};

/** Terracotta heat ramp: one light set tints faintly, a hammered muscle
    reads full accent — primary at 15% → 100%. */
const INTENSITY_ALPHAS = [0.15, 0.35, 0.55, 0.75, 1];

export const colorForIntensity = (intensity: number): string => {
  const clamped = Math.min(1, Math.max(0, intensity));
  const idx = Math.min(INTENSITY_ALPHAS.length - 1, Math.floor(clamped * INTENSITY_ALPHAS.length));
  return tokenHsl("--primary", INTENSITY_ALPHAS[idx]);
};

type Props = {
  /** Per-muscle activation, 0..1 (0 = untouched, 1 = fully cooked). */
  intensities: Partial<Record<Muscle, number>>;
  /**
   * Bump this counter whenever a set lands to replay a one-time activity
   * pulse over the figures (CSS opacity animation keyed on change).
   */
  pulseKey?: number;
  /** Height in px applied to each body figure. Width auto-scales by aspect ratio. */
  bodyHeight?: number;
  /** Show the male/female figure toggle. */
  showGenderToggle?: boolean;
  className?: string;
};

/**
 * Live in-workout body map. Renders the session's graded terracotta heat on
 * the clay anatomy charts and pulses briefly when a new set lands.
 * (BodyHeatMap re-composites on theme flips internally — isDark is in its
 * effect deps — so the figures never lag a theme change.)
 */
export const LiveMuscleMap = ({
  intensities,
  pulseKey = 0,
  bodyHeight = 200,
  showGenderToggle = true,
  className,
}: Props) => {
  const [gender, setGender] = useState<Gender>("male");

  return (
    <div className={cn("flex w-full flex-col items-center gap-3", className)}>
      <style>{`
        @keyframes lmm-activity-pulse {
          0% { opacity: 1; }
          35% { opacity: 0.45; }
          100% { opacity: 1; }
        }
      `}</style>
      <div
        key={pulseKey}
        className="flex w-full items-center justify-center gap-3"
        style={pulseKey > 0 ? { animation: "lmm-activity-pulse 700ms ease-out 1" } : undefined}
      >
        <Figure gender={gender} view="front" heat={intensities} label="Front" height={bodyHeight} />
        <Figure gender={gender} view="back" heat={intensities} label="Back" height={bodyHeight} />
      </div>

      {showGenderToggle && (
        <div className="inline-flex rounded-full border border-border bg-secondary p-0.5">
          {(["male", "female"] as Gender[]).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGender(g)}
              className={cn(
                "caption rounded-full px-3 py-1 capitalize transition",
                gender === g ? "bg-primary/15 !text-primary" : "!text-fg-muted hover:!text-fg-soft",
              )}
            >
              {g}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/* Atmosphere — three cached gradients (no CSS blur filters: they freeze
   browser-pane screenshots on this machine). Raspberry aura behind the
   torso, vignette toward the page background, soft floor ellipse. */
const AURA_BG =
  "radial-gradient(58% 40% at 50% 32%, hsl(var(--primary) / 0.06), transparent 72%)";
const VIGNETTE_BG =
  "radial-gradient(125% 100% at 50% 46%, transparent 56%, hsl(var(--background) / 0.65) 100%)";
const FLOOR_BG =
  "radial-gradient(50% 50% at 50% 50%, hsl(var(--foreground) / 0.22), hsl(var(--foreground) / 0.07) 55%, transparent 78%)";

const Figure = ({
  gender,
  view,
  heat,
  label,
  height,
}: {
  gender: Gender;
  view: BodyView;
  heat: FigureHeat;
  label: string;
  height: number;
}) => {
  const lit = Object.values(heat).some((h) => (h ?? 0) > 0);
  return (
    <div className="flex flex-col items-center">
      <div className="relative flex items-center justify-center" style={{ height }}>
        {/* The figure stands in a lit studio rather than floating; the
            aura breathes on once training starts. */}
        <div
          aria-hidden
          className="absolute -inset-x-4 inset-y-0 transition-opacity duration-700"
          style={{ opacity: lit ? 1 : 0.45, background: AURA_BG }}
        />
        <div aria-hidden className="absolute -inset-x-4 inset-y-0" style={{ background: VIGNETTE_BG }} />
        <div
          aria-hidden
          className="absolute bottom-0 left-1/2 h-3 w-2/3 -translate-x-1/2"
          style={{ background: FLOOR_BG }}
        />
        <BodyHeatMap
          gender={gender}
          view={view}
          heat={heat}
          className="relative h-full w-auto"
        />
      </div>
      <span className="eyebrow mt-1.5 !text-[10px]">{label}</span>
    </div>
  );
};
