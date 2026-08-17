import { useMemo, useState } from "react";
import { BodyHeatMap, type FigureHeat } from "@/components/body/BodyHeatMap";
import { activationHeat, type BodyGender, type BodyView } from "@/lib/bodyAssets";
import type { MuscleActivation } from "@/lib/muscleMap";

type Gender = BodyGender;

type Props = {
  activation: MuscleActivation;
  className?: string;
  defaultGender?: Gender;
};

export const MuscleMap = ({
  activation,
  className,
  defaultGender = "male",
}: Props) => {
  const [gender, setGender] = useState<Gender>(defaultGender);
  const heat = useMemo(() => activationHeat([activation]), [activation]);

  return (
    <div className={`flex h-full w-full flex-col items-center justify-center gap-2.5 ${className ?? ""}`}>
      <div className="inline-flex rounded-full border border-border p-0.5">
        {(["male", "female"] as Gender[]).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGender(g)}
            className={`caption relative rounded-full px-3 py-1 capitalize transition before:absolute before:inset-x-0 before:-inset-y-2.5 before:content-[''] ${
              gender === g
                ? "bg-primary/10 !text-gold"
                : "!text-fg-muted hover:!text-fg-soft"
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      <div className="flex w-full items-start justify-center gap-3">
        <Figure gender={gender} view="front" heat={heat} label="Front" />
        <Figure gender={gender} view="back" heat={heat} label="Back" />
      </div>
    </div>
  );
};

/* Atmosphere — three cached gradients (no CSS blur filters: they freeze
   browser-pane screenshots on this machine). A raspberry aura behind the
   torso, a vignette that settles the pocket toward the page background,
   and a soft floor ellipse that grounds the feet. */
const AURA_BG =
  "radial-gradient(58% 40% at 50% 32%, hsl(var(--primary) / 0.06), transparent 72%)";
const VIGNETTE_BG =
  "radial-gradient(125% 100% at 50% 46%, transparent 56%, hsl(var(--background) / 0.65) 100%)";
const FLOOR_BG =
  "radial-gradient(50% 50% at 50% 50%, hsl(var(--foreground) / 0.22), hsl(var(--foreground) / 0.07) 55%, transparent 78%)";

/* Width-driven (aspect-ratio wrapper) so the figures scale with the card,
   phone → desktop. The wrapper's ratio matches the widest chart; narrower
   figures (back views) center inside it at the same height, keeping the
   front/back pair on one baseline. The canvas is absolutely positioned so
   its own size never feeds back into the aspect-ratio box. */
const Figure = ({
  gender,
  view,
  heat,
  label,
}: {
  gender: Gender;
  view: BodyView;
  heat: FigureHeat;
  label: string;
}) => {
  const lit = Object.values(heat).some((h) => (h ?? 0) > 0);
  return (
    <div className="flex min-w-0 flex-1 max-w-[180px] flex-col items-center">
      <div className="relative aspect-[0.43] w-full">
        <div
          aria-hidden
          className="absolute inset-0 transition-opacity duration-700"
          style={{ opacity: lit ? 1 : 0.45, background: AURA_BG }}
        />
        <div aria-hidden className="absolute inset-0" style={{ background: VIGNETTE_BG }} />
        <div
          aria-hidden
          className="absolute bottom-0 left-1/2 h-3 w-2/3 -translate-x-1/2"
          style={{ background: FLOOR_BG }}
        />
        <BodyHeatMap
          gender={gender}
          view={view}
          heat={heat}
          className="absolute inset-y-0 left-1/2 h-full w-auto -translate-x-1/2"
        />
      </div>
      <span className="eyebrow mt-1.5 !text-[10px]">{label}</span>
    </div>
  );
};
