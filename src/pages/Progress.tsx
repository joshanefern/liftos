import { CTAButton } from "@/components/GoldButton";
import { LiftDetailSheet, type LiftRef } from "@/components/progress/LiftDetailSheet";
import { RenameExercisesSheet } from "@/components/progress/RenameExercisesSheet";
import { useUser } from "@/context/UserContext";
import { useWorkoutLogs } from "@/hooks/useWorkoutLogs";
import { isPlaceholderName, placeholderNames } from "@/lib/exerciseNames";
import { formatHold, inferTracking } from "@/lib/exerciseTracking";
import { allTimePRs, bestWeight, type WeightRecord } from "@/lib/prs";
import { fetchBodyMass, type BodyMassSample } from "@/lib/healthkit";
import { buildCoachContext, streamCoach } from "@/lib/coach";
import { buildProgressHero } from "@/lib/progressHero";
import {
  cacheInsight,
  INSIGHT_PROMPT,
  loadCachedInsight,
  parseInsight,
  recentChatExcerpts,
  type ProgressInsightData,
} from "@/lib/progressInsight";
import { sessionImprovement } from "@/lib/strengthTrend";
import { getTopLifts } from "@/lib/workoutStats";
import { ArrowRight, Dumbbell, PenLine } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

/* ── Progress — answers ONE question: "am I getting stronger?" — and reads
     top-to-bottom like a spoken summary (research round 2, Aug 2026):
     interpreted hero → Strength trends (beat-last-time + sparklines, never
     silently missing) → Your records (real names only, no invented maxes)
     → This week (neutral count, no quota grades, no gray-corpse body map)
     → total-weight chart demoted behind a tap. Every number is plain
     English with visible provenance; junk imported names surface only as
     one fix-it row. ── */

const DAY_MS = 86_400_000;
const PR_RECENT_DAYS = 7;
const RECORDS_VISIBLE = 3;

const CARD_CLASS =
  "rounded-[14px] bg-card p-4 shadow-[0_4px_12px_rgba(16,22,35,0.08)] " +
  "dark:shadow-[0_4px_14px_rgba(0,0,0,0.35)]";

const Progress = () => {
  const navigate = useNavigate();
  const { profile } = useUser();
  const { logs, reload } = useWorkoutLogs();
  const units = profile?.units ?? "lb";
  const [showAllRecords, setShowAllRecords] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [detailLift, setDetailLift] = useState<LiftRef | null>(null);

  // ── Data (placeholder "Exercise N" imports are excluded everywhere and
  //    surface only through the fix-it row) ──
  const junkNames = useMemo(() => placeholderNames(logs), [logs]);

  // Body weight (HealthKit) powers the Fat Loss hero — fetched only when
  // that's the goal; empty everywhere else and on web.
  const [weightSamples, setWeightSamples] = useState<BodyMassSample[]>([]);
  useEffect(() => {
    if (!(profile?.goal ?? "").toLowerCase().includes("fat loss")) return;
    let cancelled = false;
    void fetchBodyMass(90).then((samples) => {
      if (!cancelled) setWeightSamples(samples);
    });
    return () => {
      cancelled = true;
    };
  }, [profile?.goal]);
  const heroStat = useMemo(
    () => buildProgressHero(logs, profile?.goal ?? null, units, Date.now(), weightSamples),
    [logs, profile?.goal, units, weightSamples],
  );
  // The Improvement card is ONE number: this session vs the previous time
  // the same lifts were trained, averaged into a single signed %.
  const improvement = useMemo(() => sessionImprovement(logs), [logs]);

  // Records, most recently improved first — real names only.
  const prs = useMemo(
    () =>
      allTimePRs(logs)
        .filter((pr) => !isPlaceholderName(pr.exerciseName))
        .sort((a, b) => Date.parse(b.lastImproved) - Date.parse(a.lastImproved)),
    [logs],
  );
  const bestWeightRecords = useMemo(() => {
    const map = new Map<string, WeightRecord | null>();
    for (const pr of prs) map.set(pr.exerciseName, bestWeight(logs, pr.exerciseName));
    return map;
  }, [logs, prs]);
  const visibleRecords = showAllRecords ? prs : prs.slice(0, RECORDS_VISIBLE);
  const newPrCount = useMemo(
    () =>
      prs.filter((pr) => Date.now() - Date.parse(pr.lastImproved) < PR_RECENT_DAYS * DAY_MS)
        .length,
    [prs],
  );

  // ── Coach's read: the AI returns 2-3 label+value readings and one next
  // move as strict JSON, rendered like every other stat row on this page —
  // never prose. Daily-cached; a newly logged session invalidates. ──
  const [insight, setInsight] = useState<ProgressInsightData | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  useEffect(() => {
    if (logs.length === 0) return;
    const cached = loadCachedInsight(logs.length);
    if (cached) {
      setInsight(cached);
      return;
    }
    let cancelled = false;
    setInsight(null);
    setInsightLoading(true);
    const context = {
      ...buildCoachContext(logs, profile),
      recent_conversations: recentChatExcerpts(),
    } as ReturnType<typeof buildCoachContext>;
    streamCoach([{ role: "user", content: INSIGHT_PROMPT }], context, () => {})
      .then((full) => {
        if (cancelled) return;
        const parsed = parseInsight(full);
        if (parsed) {
          cacheInsight(logs.length, full);
          setInsight(parsed);
        }
      })
      .catch(() => {
        if (!cancelled) setInsight(null);
      })
      .finally(() => {
        if (!cancelled) setInsightLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [logs, profile]);

  // Hero fallback material: the best real (named) lift, preserved forever.
  // getTopLifts is uncapped here so a heavy junk import can't crowd out a
  // genuinely named best.
  const bestNamedLift = useMemo(
    () => getTopLifts(logs, Infinity).find((t) => !isPlaceholderName(t.name)) ?? null,
    [logs],
  );
  const bestNamedHold = useMemo(
    () => prs.find((pr) => pr.maxDuration !== null) ?? null,
    [prs],
  );
  const bestNamedReps = useMemo(
    () => prs.find((pr) => pr.maxReps !== null) ?? null,
    [prs],
  );

  // One timed-ness rule for rows AND the sheet they open: real hold data
  // wins; name inference only fills in when the data is silent (a "Glute
  // Bridge" logged with weight × reps is a weight lift, whatever the name
  // sounds like).
  const isTimedPr = (pr: { maxDuration: number | null; maxWeight: number | null }, name: string) =>
    pr.maxDuration !== null || (pr.maxWeight === null && inferTracking(name) === "time");

  const openDetail = (name: string) => {
    const pr = prs.find((p) => p.exerciseName === name);
    setDetailLift({ name, timed: pr ? isTimedPr(pr, name) : inferTracking(name) === "time" });
  };

  return (
    <div className="relative min-h-screen w-full max-w-7xl mx-auto p-6 md:p-10 lg:p-12">
      {/* ── Header ── */}
      <header className="animate-reveal-up">
        <p className="eyebrow !text-fg">Progress</p>
      </header>

      {/* ── HERO — one goal-angled, positively-framed overall number. The
          math never invents a gain: when nothing is genuinely up, it
          headlines consistency instead (lib/progressHero). ── */}
      <section className="mt-10 md:mt-14 animate-reveal-up" style={{ animationDelay: "60ms" }}>
        {heroStat ? (
          <>
            <p className="stat-hero !text-6xl md:!text-7xl whitespace-nowrap">
              {heroStat.value}
              <span className="ml-2.5 text-xl md:text-2xl font-light tracking-normal text-fg-muted">
                {heroStat.label}
              </span>
            </p>
            <p className="eyebrow mt-4">{heroStat.eyebrow}</p>
          </>
        ) : bestNamedLift || bestNamedHold || bestNamedReps ? (
          /* History exists but nothing has 2 recent sessions — welcome back
             with a preserved best. Bests never decay or reset for absence. */
          <>
            <p className="stat-hero !text-6xl md:!text-7xl whitespace-nowrap">
              {bestNamedLift ? (
                <>
                  {bestNamedLift.weight}
                  <span className="ml-2.5 text-xl md:text-2xl font-light tracking-normal text-fg-muted">
                    {units}
                  </span>
                </>
              ) : bestNamedHold ? (
                <>
                  {formatHold(bestNamedHold.maxDuration!)}
                  <span className="ml-2.5 text-xl md:text-2xl font-light tracking-normal text-fg-muted">
                    hold
                  </span>
                </>
              ) : (
                <>
                  {bestNamedReps!.maxReps}
                  <span className="ml-2.5 text-xl md:text-2xl font-light tracking-normal text-fg-muted">
                    reps
                  </span>
                </>
              )}
            </p>
            <p className="eyebrow mt-4">
              Your best ·{" "}
              {bestNamedLift
                ? bestNamedLift.name
                : bestNamedHold
                  ? bestNamedHold.exerciseName
                  : bestNamedReps!.exerciseName}
            </p>
          </>
        ) : junkNames.length > 0 ? (
          /* Only unnamed imports exist — the fix-it row below is the way in. */
          <>
            <p className="heading-lg max-w-sm">Your imported workouts need names.</p>
          </>
        ) : (
          <>
            <p className="stat-hero !text-6xl md:!text-7xl !text-fg-muted">0</p>
            <p className="eyebrow mt-4">Strength trend</p>
            <CTAButton to="/workouts" className="mt-7">
              <Dumbbell size={15} />
              Log your first workout
            </CTAButton>
          </>
        )}
      </section>

      {/* ── Card 1 · IMPROVEMENT — one number: this session vs the previous
          time the same lifts were trained. Signed and honest. ── */}
      {improvement && (
        <section className={`${CARD_CLASS} mt-10 animate-reveal-up`} style={{ animationDelay: "120ms" }}>
          <p className="eyebrow">Improvement</p>
          <p
            className={`mt-2 stat-scoreboard text-[34px] leading-10 tabular-nums ${
              improvement.pct > 0 ? "text-primary" : "text-fg"
            }`}
          >
            {improvement.pct > 0 ? "+" : ""}
            {improvement.pct}%
            <span className="ml-2 text-[13px] font-medium tracking-normal text-fg-muted">
              vs last session
            </span>
          </p>
        </section>
      )}

      {/* ── Card 2 · YOUR RECORDS ── */}
      {(prs.length > 0 || junkNames.length > 0) && (
        <section className={`${CARD_CLASS} mt-4 animate-reveal-up`} style={{ animationDelay: "180ms" }}>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <p className="eyebrow">Your records</p>
            {newPrCount > 0 && (
              <p className="caption">
                {newPrCount} new in the last 7 days
              </p>
            )}
          </div>
          <div className="divide-y divide-border">
            {visibleRecords.map((pr) => {
              const best = bestWeightRecords.get(pr.exerciseName) ?? null;
              // Holds never get an estimated single — Epley over a plank's
              // "reps" invents a lift that never happened.
              const timed = isTimedPr(pr, pr.exerciseName);
              const holdNamed = inferTracking(pr.exerciseName) === "time";
              const recentlyImproved =
                Date.now() - Date.parse(pr.lastImproved) < PR_RECENT_DAYS * DAY_MS;
              return (
                <button
                  key={pr.exerciseName}
                  type="button"
                  onClick={() => openDetail(pr.exerciseName)}
                  className="flex min-h-11 w-full items-center justify-between gap-4 py-3 text-left transition hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold text-fg">
                      {recentlyImproved && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                      )}
                      <span className="truncate">{pr.exerciseName}</span>
                    </p>
                  </div>
                  {/* One big stat per row, no sublines — every record shows
                      its number on the right, whatever kind it is. */}
                  {pr.maxDuration !== null ? (
                    <div className="shrink-0 text-right">
                      <p className="stat-scoreboard whitespace-nowrap text-[24px] leading-7 text-fg">
                        {formatHold(pr.maxDuration)}
                      </p>
                      <p className="caption !text-fg-muted">Hold</p>
                    </div>
                  ) : !timed && !holdNamed && pr.maxE1RM !== null ? (
                    <div className="shrink-0 text-right">
                      <p className="stat-scoreboard whitespace-nowrap text-[24px] leading-7 text-fg">
                        {Math.round(pr.maxE1RM)}
                        <span className="ml-1 text-[12px] font-medium text-fg-muted">{units}</span>
                      </p>
                      <p className="caption !text-fg-muted">Est. best single</p>
                    </div>
                  ) : best !== null ? (
                    <div className="shrink-0 text-right">
                      <p className="stat-scoreboard whitespace-nowrap text-[24px] leading-7 text-fg">
                        {best.weight}
                        <span className="ml-1 text-[12px] font-medium text-fg-muted">{units}</span>
                      </p>
                      <p className="caption !text-fg-muted">× {best.reps}</p>
                    </div>
                  ) : pr.maxReps !== null ? (
                    <div className="shrink-0 text-right">
                      <p className="stat-scoreboard whitespace-nowrap text-[24px] leading-7 text-fg">
                        {pr.maxReps}
                      </p>
                      <p className="caption !text-fg-muted">reps</p>
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
          {prs.length > RECORDS_VISIBLE && (
            <button
              type="button"
              onClick={() => setShowAllRecords((v) => !v)}
              className="caption flex min-h-11 w-full items-center !text-fg-muted transition hover:!text-fg"
            >
              {showAllRecords ? "Show fewer" : `All records (${prs.length})`}
            </button>
          )}

          {/* Fix-it row — the only acknowledgment of messy imports */}
          {junkNames.length > 0 && (
            <button
              type="button"
              onClick={() => setRenameOpen(true)}
              className="mt-1 flex min-h-11 w-full items-center gap-2 rule-hairline pt-2 text-left transition hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <PenLine size={13} className="shrink-0 text-fg-muted" />
              <span className="caption !text-fg-soft">
                {junkNames.length} imported exercise{junkNames.length === 1 ? "" : "s"} need
                {junkNames.length === 1 ? "s" : ""} a name — tap to name{" "}
                {junkNames.length === 1 ? "it" : "them"}
              </span>
            </button>
          )}
        </section>
      )}

      {/* ── Card 3 · COACH INSIGHT — the AI reads your training (and your
          recent coach chats) and says what's working and what to push next.
          Cached for the day; refreshes when a new session lands. ── */}
      {logs.length > 0 && (
        <section className={`${CARD_CLASS} mt-4 animate-reveal-up`} style={{ animationDelay: "240ms" }}>
          <p className="eyebrow">Coach insight</p>
          {insightLoading ? (
            /* Skeleton bullets while the read computes. */
            <div className="mt-3 space-y-2.5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/[0.12]" />
                  <span className="h-3.5 w-48 animate-pulse rounded bg-foreground/[0.08]" />
                </div>
              ))}
            </div>
          ) : insight ? (
            <ul className="mt-3 space-y-2.5">
              {insight.bullets.map((bullet) => (
                <li key={bullet} className="flex items-start gap-2.5">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                  <span className="min-w-0 text-sm leading-5 text-fg">{bullet}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {/* One small way in — seeded with the coach's next move when it
              has one, a plain chat otherwise. */}
          <button
            type="button"
            onClick={() =>
              navigate(
                "/coach",
                insight?.next ? { state: { draft: insight.next.prompt } } : undefined,
              )
            }
            className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition hover:opacity-90 active:scale-[0.98]"
          >
            Ask the Coach
            <ArrowRight size={13} />
          </button>
        </section>
      )}

      {/* ── Sheets ── */}
      <LiftDetailSheet
        lift={detailLift}
        onClose={() => setDetailLift(null)}
        logs={logs}
        units={units}
      />
      <RenameExercisesSheet
        open={renameOpen}
        onOpenChange={setRenameOpen}
        logs={logs}
        onRenamed={reload}
      />
    </div>
  );
};

export default Progress;
