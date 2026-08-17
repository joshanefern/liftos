import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import type { WorkoutLog } from "@/hooks/useWorkoutLogs";
import { formatHold, formatHoldDelta } from "@/lib/exerciseTracking";
import { liftSessionSeries } from "@/lib/strengthTrend";
import { useMemo, useRef, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/* ── Per-lift detail — the destination behind each Strength row. One chart
     with an on-card metric switcher (research: lifters trust actual weight
     first and demand toggles on the stats page itself), a plain-English
     verdict, the best set with provenance, and recent history. ── */

type Metric = "weight" | "e1rm" | "reps" | "hold";

const METRIC_LABELS: Record<Metric, string> = {
  weight: "Heaviest",
  e1rm: "Est. single",
  reps: "Reps",
  hold: "Hold",
};

/** Which lift to show — records rows and trend rows both open this sheet,
    so all it needs is the name and whether the lift is time-tracked. */
export type LiftRef = { name: string; timed: boolean };

type Props = {
  lift: LiftRef | null;
  onClose: () => void;
  logs: WorkoutLog[];
  units: string;
};

export const LiftDetailSheet = ({ lift, onClose, logs, units }: Props) => {
  const isMobile = useIsMobile();
  // The sheet stays mounted through the close animation — hold the last
  // shown lift so content doesn't blank mid-slide-out.
  const lastLiftRef = useRef<LiftRef | null>(null);
  if (lift !== null) lastLiftRef.current = lift;
  const shown = lift ?? lastLiftRef.current;

  const timed = shown?.timed === true;
  const [metric, setMetric] = useState<Metric>("weight");
  // Opening a different lift resets the switcher (render-time adjustment —
  // no effect, no flash).
  const [prevName, setPrevName] = useState<string | undefined>(shown?.name);
  if (shown && shown.name !== prevName) {
    setPrevName(shown.name);
    setMetric("weight");
  }

  const series = useMemo(
    () => (shown ? liftSessionSeries(logs, shown.name) : []),
    [logs, shown],
  );
  const hasWeight = series.some((p) => p.weight > 0);
  const hasHolds = series.some((p) => p.duration > 0);
  // Bodyweight lifts (push-ups) have nothing to chart in lb — reps is their
  // honest metric; lifts with hold data get a Hold tab alongside.
  const activeMetric: Metric = timed
    ? "hold"
    : !hasWeight && series.length > 0
      ? metric === "hold" && hasHolds
        ? "hold"
        : "reps"
      : metric;
  const metricTabs: Metric[] = !hasWeight && series.length > 0
    ? hasHolds
      ? ["reps", "hold"]
      : []
    : hasHolds
      ? ["weight", "e1rm", "reps", "hold"]
      : ["weight", "e1rm", "reps"];

  const valueOf = (p: (typeof series)[number]): number =>
    activeMetric === "hold"
      ? p.duration
      : activeMetric === "reps"
        ? p.reps
        : activeMetric === "e1rm"
          ? Math.round(p.e1rm ?? 0)
          : p.weight;

  const points = series
    .map((p) => ({ label: p.label, value: valueOf(p) }))
    .filter((p) => p.value > 0);

  const fmt = (v: number): string =>
    activeMetric === "hold" ? formatHold(v) : activeMetric === "reps" ? `${v} reps` : `${v} ${units}`;

  // Plain-English verdict — first vs last visible point, no chart-reading
  // required. Zero points and one point are different stories.
  const verdict = (() => {
    if (points.length === 0) {
      if (series.length === 0)
        return "Not trained in the last 12 weeks — this record is from further back.";
      return activeMetric === "e1rm"
        ? "No sets of ten reps or fewer in this window — nothing to estimate yet."
        : "No sessions in this window recorded this measure yet.";
    }
    if (points.length === 1)
      return "One session in the last 12 weeks — log another to compare.";
    const delta = points[points.length - 1].value - points[0].value;
    const span = `across ${points.length} sessions`;
    if (delta > 0)
      return `Up ${activeMetric === "hold" ? formatHold(delta) : fmt(delta)} ${span}.`;
    if (delta === 0) return `Holding steady ${span} — try adding a set next time.`;
    return `Down ${activeMetric === "hold" ? formatHold(Math.abs(delta)) : fmt(Math.abs(delta))} ${span} — worth asking the coach.`;
  })();

  // Best session in the window, with the date it happened — every number
  // shows where it came from.
  const best = points.length
    ? series.reduce((a, b) => (valueOf(b) > valueOf(a) ? b : a))
    : null;

  // History rows show the measure being viewed — never a "0 lb" filler row.
  const recent = series
    .filter((p) =>
      activeMetric === "hold" ? p.duration > 0 : p.weight > 0 || p.reps > 0,
    )
    .slice(-5)
    .reverse();

  const setLine = (p: (typeof series)[number]): string =>
    activeMetric === "hold"
      ? formatHold(p.duration)
      : p.weight > 0
        ? `${p.weight} ${units} × ${p.reps}`
        : `${p.reps} reps`;

  return (
    <Sheet open={lift !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={`border-border bg-background p-0 ${
          isMobile ? "max-h-[85vh] rounded-t-[1.5rem]" : "w-full sm:max-w-md"
        }`}
      >
        <div className="h-full overflow-y-auto px-5 pb-[calc(1.5rem+var(--safe-bottom))] pt-4 md:px-6 md:pt-5">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border md:hidden" />
          <SheetHeader className="text-left sm:text-left">
            <SheetTitle className="heading-md">{shown?.name}</SheetTitle>
            <SheetDescription className="caption">
              Best set per session · last 12 weeks
            </SheetDescription>
          </SheetHeader>

          {/* Metric switcher — hidden for holds, which have one honest metric */}
          {!timed && metricTabs.length > 0 && (
            <div className="mt-4 inline-flex rounded-full border border-border bg-secondary p-0.5">
              {metricTabs.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={activeMetric === m}
                  onClick={() => setMetric(m)}
                  className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
                    activeMetric === m
                      ? "bg-primary/15 text-primary"
                      : "text-fg-muted hover:text-fg"
                  }`}
                >
                  {METRIC_LABELS[m]}
                </button>
              ))}
            </div>
          )}

          {activeMetric === "e1rm" && (
            <p className="caption mt-2">
              The most you could likely lift once — estimated from each
              session's best set of ten reps or fewer.
            </p>
          )}

          <div className="mt-4 h-[180px]">
            {points.length >= 2 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={points} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "hsl(var(--text-tertiary))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={["dataMin", "dataMax"]}
                    width={40}
                    tick={{ fontSize: 10, fill: "hsl(var(--text-tertiary))" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) =>
                      activeMetric === "hold" ? formatHold(v) : String(v)
                    }
                  />
                  <Tooltip
                    formatter={(v) => [fmt(Number(v)), METRIC_LABELS[activeMetric]]}
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 10,
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="hsl(var(--chart-line))"
                    strokeWidth={1.5}
                    fill="hsl(var(--chart-line) / 0.12)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border">
                <p className="caption">
                  {points.length === 1
                    ? "One more session draws the line."
                    : "Sessions logged here will draw the line."}
                </p>
              </div>
            )}
          </div>
          <p className="body-sm mt-3">{verdict}</p>

          {best && (
            <div className="rule-hairline mt-4 pt-4">
              <p className="eyebrow !text-[10px]">Best in this window</p>
              <p className="mt-1.5 text-base font-semibold text-fg">
                {setLine(best)}
                <span className="caption ml-2 !text-fg-muted">· {best.label}</span>
              </p>
            </div>
          )}

          {recent.length > 0 && (
            <div className="rule-hairline mt-4 pt-4">
              <p className="eyebrow mb-2 !text-[10px]">Recent sessions</p>
              <div className="divide-y divide-border">
                {recent.map((p) => (
                  <div key={p.t} className="flex items-center justify-between py-2">
                    <span className="caption">{p.label}</span>
                    <span className="text-sm font-medium tabular-nums text-fg">
                      {setLine(p)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {timed && points.length >= 2 && (
            <p className="caption mt-3 !text-fg-faint">
              Holds trend on duration — {formatHoldDelta(points[points.length - 1].value - points[0].value)} in this window.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
