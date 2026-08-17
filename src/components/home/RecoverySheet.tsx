import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { labelForMuscle } from "@/lib/muscleCoverage";
import type { Muscle } from "@/lib/muscleMap";
import type { MuscleFreshness, ReadinessAssessment } from "@/lib/recovery";

/* The recovery detail sheet — everything the one-line home annotation
   summarizes. Research rules: show the fired flags in raw numbers against
   the personal range (visible signal agreement is what earns trust),
   muscle freshness for today's targets only, and never a percent score. */

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assessment: ReadinessAssessment | null;
  freshness: MuscleFreshness[];
  targetMuscles: Muscle[];
};

const STATE_WORD: Record<string, string> = {
  primed: "Primed",
  steady: "Steady",
  run_down: "Run down",
};

export const RecoverySheet = ({
  open,
  onOpenChange,
  assessment,
  freshness,
  targetMuscles,
}: Props) => {
  const byMuscle = new Map(freshness.map((f) => [f.muscle, f.freshness]));
  const targets = targetMuscles.map((muscle) => {
    const value = byMuscle.get(muscle) ?? 1;
    return {
      muscle,
      label: labelForMuscle(muscle),
      text: value >= 0.85 ? "fresh" : `${Math.round(value * 100)}%`,
      fresh: value >= 0.85,
    };
  });

  const state = assessment?.state ?? null;
  const heading =
    state !== null
      ? STATE_WORD[state]
      : assessment?.baselineDaysRemaining != null
        ? "Learning your baseline"
        : "Recovery";

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="px-6 pb-8">
        <p className="eyebrow mt-4 !text-primary">Recovery</p>
        <DrawerTitle className="heading-md mt-2 text-fg">{heading}</DrawerTitle>

        {assessment?.summary && (
          <p className="body-md mt-2 text-fg-soft">{assessment.summary}</p>
        )}

        {/* Fired flags — raw numbers vs the personal range. */}
        {assessment && assessment.flags.length > 0 && (
          <div className="mt-4 space-y-2">
            {assessment.flags.map((flag) => (
              <div
                key={flag.metric}
                className="flex items-baseline justify-between gap-3 rounded-[11px] bg-foreground/[0.04] px-3.5 py-2.5"
              >
                <span className="text-sm font-semibold text-fg">{flag.label}</span>
                <span className="text-sm tabular-nums text-fg-soft">{flag.detail}</span>
              </div>
            ))}
          </div>
        )}
        {assessment && state !== null && assessment.flags.length === 0 && (
          <p className="body-md mt-2 text-fg-soft">
            Overnight signals are inside your normal range.
          </p>
        )}
        {assessment?.tier === 2 && (
          <p className="caption mt-2 !text-fg-muted">Partial data — HRV sparse.</p>
        )}

        {/* Today's targets — the muscles the suggested session hits. */}
        {targets.length > 0 && (
          <>
            <p className="eyebrow mt-5">Today's targets</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {targets.map((t) => (
                <span
                  key={t.muscle}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold ${
                    t.fresh
                      ? "bg-primary/10 text-primary"
                      : "bg-foreground/[0.06] text-fg-soft"
                  }`}
                >
                  {t.label}
                  <span className={t.fresh ? "" : "text-fg-muted"}>· {t.text}</span>
                </span>
              ))}
            </div>
            <p className="caption mt-2 !text-fg-muted">
              Freshness comes from your training history — assisting muscles count
              half.
            </p>
          </>
        )}

        {assessment && assessment.tier <= 2 && (
          <p className="mt-5 text-[11px] leading-4 text-fg-muted">
            HRV is SDNN from Apple Health. Apple measures HRV differently than
            Whoop or Oura, so the numbers won't match across devices.
          </p>
        )}
      </DrawerContent>
    </Drawer>
  );
};
