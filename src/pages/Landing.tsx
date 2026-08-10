import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, Sparkles } from "lucide-react";
import { FitnessBackground } from "@/components/FitnessBackground";
import { CTAButton } from "@/components/GoldButton";

/* ───────── scroll-reveal hook ───────── */
const useReveal = (threshold = 0.15, scrollOnly = false, rootMargin = "0px") => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let hasScrolled = false;
    const onScroll = () => { hasScrolled = true; };
    if (scrollOnly) window.addEventListener("scroll", onScroll, { passive: true, once: true });

    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && (!scrollOnly || hasScrolled)) setVisible(true);
      },
      { threshold, rootMargin }
    );
    if (ref.current) obs.observe(ref.current);
    return () => {
      obs.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [threshold, scrollOnly, rootMargin]);
  return { ref, visible };
};

/* ───────── mini sparkline SVG ───────── */
const Sparkline = () => (
  <svg viewBox="0 0 120 40" className="w-full h-10" preserveAspectRatio="none">
    <polygon
      points="0,35 15,30 30,32 45,22 60,18 75,24 90,12 105,8 120,14 120,40 0,40"
      fill="hsl(var(--primary) / 0.1)"
    />
    <polyline
      points="0,35 15,30 30,32 45,22 60,18 75,24 90,12 105,8 120,14"
      fill="none"
      stroke="hsl(var(--chart-line))"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="animate-draw-line"
    />
  </svg>
);

const dashboardPreviewStats = [
  { label: "Weekly volume", value: "92.4k", detail: "+2.2%" },
  { label: "Frequency", value: "5 / 5", detail: "On plan" },
  { label: "Avg session", value: "56 min", detail: "Efficient" },
];

const coachMessages = [
  { role: "assistant", body: "Bench volume is recovering well. Keep one top set at RPE 8 and let accessories stay controlled." },
  { role: "user", body: "What should tomorrow look like?" },
  { role: "assistant", body: "Upper push. Start with bench, add incline dumbbells, then triceps. Total target: 16 hard sets." },
];


/* ───────── Nav ───────── */
const LandingNav = () => (
  <nav className="fixed top-0 inset-x-0 z-50 border-b border-border bg-background/85 backdrop-blur-md px-8 md:px-14">
    <div className="flex h-16 items-center justify-between">
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="text-[12px] font-semibold tracking-[0.28em] text-foreground cursor-pointer"
      >
        LIFT<span className="text-gold">OS</span>
      </button>
      <Link
        to="/sign-in"
        className="relative inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-[11px] tracking-[0.12em] text-fg transition-colors duration-200 before:absolute before:-inset-2 before:content-[''] hover:border-primary"
      >
        Sign In
        <ArrowRight size={11} />
      </Link>
    </div>
  </nav>
);

/* ═══════════════ LANDING ═══════════════ */
const Landing = () => {
  const [heroVisible, setHeroVisible] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => setHeroVisible(true))
    );
    return () => cancelAnimationFrame(id);
  }, []);

  /* Vertical-only margin: a bare "-180px" also shrinks the root 180px on the
     left/right, leaving a 15px-wide root at 375px — the 0.2 threshold could
     then never be met and the section stayed invisible on phones. */
  const metrics = useReveal(0.2, true, "-180px 0px");
  const features = useReveal(0.2, true);
  const cta = useReveal(0.25, true);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground" style={{ isolation: "isolate", zIndex: 0 }}>
      <FitnessBackground />
      <LandingNav />

      {/* ── HERO ── */}
      <section
        className="relative overflow-visible px-6 pt-28 md:px-12 md:pt-44"
      >
        <div className="max-w-6xl mx-auto">
          <div
            style={{ transform: heroVisible ? "translateY(0)" : "translateY(4rem)", transition: "transform 1.5s ease-out" }}
            className="relative flex flex-col items-center justify-start pt-0 opacity-100 md:pt-2"
          >
            <div className="relative mx-auto max-w-4xl text-center">

              {/* eyebrow pill */}
              <div className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-border px-4 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                <span className="text-[11px] font-medium tracking-[0.18em] text-fg-muted uppercase">
                  Precision training intelligence
                </span>
              </div>

              <h1 className="text-[2.65rem] font-semibold leading-[0.9] tracking-[-0.06em] text-foreground sm:text-[3.7rem] md:text-[4.65rem]">
                Track the work.
                <br />
                Witness the{" "}
                <span className="text-gold">growth.</span>
              </h1>

              <p className="mx-auto mt-5 max-w-sm text-[13px] leading-6 text-muted-foreground md:text-[14px]">
                Every rep logged, every set tracked — your progress, finally visible.
              </p>

              <div className="mt-8 flex justify-center">
                <CTAButton to="/sign-in">
                  Open LiftOS
                  <ArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                </CTAButton>
              </div>
            </div>

            <div className="pointer-events-none relative mt-12 flex w-full justify-center md:mt-16 md:px-8">
              <div className="relative w-full max-w-[78rem]">

                {/* ── AI Coach panel ── */}
                <div className="absolute -bottom-[50px] left-[-20%] hidden h-[33rem] w-[44rem] overflow-hidden rounded-[2rem] border border-border bg-card 2xl:block">
                  <div className="flex items-center justify-between border-b border-border px-5 py-4">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                      <span className="h-2.5 w-2.5 rounded-full bg-border" />
                      <span className="h-2.5 w-2.5 rounded-full bg-border" />
                    </div>
                    <span className="text-[11px] uppercase tracking-[0.22em] text-fg-muted">
                      AI Coach
                    </span>
                  </div>
                  <div className="space-y-4 p-5">
                    <div className="rounded-[1.25rem] border border-border bg-background p-4">
                      <div className="mb-3 flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs uppercase tracking-[0.24em] text-fg-muted">Conversation</p>
                          <p className="mt-2 text-lg font-semibold text-fg">LiftOS Coach</p>
                        </div>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">
                          <Sparkles size={11} />
                          AI
                        </span>
                      </div>
                      <div className="space-y-2">
                        {coachMessages.map((message) => (
                          <div
                            key={message.body}
                            className={`rounded-[1rem] border px-3 py-2 text-sm ${
                              message.role === "assistant"
                                ? "border-border bg-card text-fg-soft"
                                : "ml-8 border-primary/25 bg-primary/10 text-fg"
                            }`}
                          >
                            {message.body}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: "Split", value: "4 day" },
                        { label: "Focus", value: "Bench" },
                        { label: "Goal", value: "16 sets" },
                      ].map((item) => (
                        <div key={item.label} className="rounded-[1.1rem] border border-border bg-background p-3">
                          <p className="text-[10px] uppercase tracking-[0.22em] text-fg-muted">{item.label}</p>
                          <p className="mt-2.5 text-xl font-semibold text-fg">{item.value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-[1.25rem] border border-border bg-background p-4">
                      <p className="text-xs uppercase tracking-[0.24em] text-fg-muted">Suggested prompts</p>
                    </div>
                  </div>
                </div>

                {/* ── Calendar panel ── */}
                <div className="absolute -bottom-[50px] right-[-20%] hidden h-[33rem] w-[44rem] overflow-hidden rounded-[2rem] border border-border bg-card 2xl:block">
                  <div className="flex items-center justify-between border-b border-border px-5 py-4">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                      <span className="h-2.5 w-2.5 rounded-full bg-border" />
                      <span className="h-2.5 w-2.5 rounded-full bg-border" />
                    </div>
                    <span className="text-[11px] uppercase tracking-[0.22em] text-fg-muted">
                      Calendar
                    </span>
                  </div>
                  <div className="space-y-4 p-5">
                    <div className="rounded-[1.25rem] border border-border bg-background p-4">
                      <div className="mb-3 flex items-end justify-between gap-4">
                        <div>
                          <p className="text-xs uppercase tracking-[0.24em] text-fg-muted">Performance Ledger</p>
                          <p className="mt-2 text-3xl font-light tracking-tight text-fg">April 2026</p>
                        </div>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">
                          <CalendarDays size={11} />
                          22 days
                        </span>
                      </div>
                      <p className="text-sm text-fg-muted">A month-view training ledger for volume, adherence, and recovery rhythm.</p>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: "Volume", value: "101.9k" },
                        { label: "Green Days", value: "14" },
                        { label: "Hit Rate", value: "82%" },
                      ].map((item) => (
                        <div key={item.label} className="rounded-[1.1rem] border border-border bg-background p-3">
                          <p className="text-[10px] uppercase tracking-[0.22em] text-fg-muted">{item.label}</p>
                          <p className="mt-2.5 text-xl font-semibold text-fg">{item.value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-[1.25rem] border border-border bg-background p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-xs uppercase tracking-[0.24em] text-fg-muted">Monthly Grid</p>
                        <span className="text-[10px] font-semibold text-primary">Upward</span>
                      </div>
                      <div className="rounded-[1rem] border border-border bg-card p-3.5">
                        <div className="grid grid-cols-[auto_1fr] items-center gap-4">
                          <div className="relative h-24 w-24 shrink-0">
                            <div
                              className="h-full w-full rounded-full"
                              style={{
                                background:
                                  "conic-gradient(hsl(var(--primary)) 0deg 228deg, hsl(var(--primary) / 0.45) 228deg 312deg, hsl(var(--border)) 312deg 360deg)",
                              }}
                            />
                            <div className="absolute inset-[18%] rounded-full border border-border bg-card" />
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <span className="text-lg font-semibold tracking-tight text-fg">82%</span>
                              <span className="text-[9px] uppercase tracking-[0.22em] text-fg-muted">
                                Hit Rate
                              </span>
                            </div>
                          </div>
                          <div className="space-y-2.5">
                            {[
                              { label: "Beat plan", value: "14 days", tone: "bg-primary" },
                              { label: "On plan", value: "8 days", tone: "bg-primary/45" },
                              { label: "Rest days", value: "8 days", tone: "bg-primary/15" },
                            ].map((item) => (
                              <div
                                key={item.label}
                                className="flex items-center justify-between rounded-[0.95rem] border border-border bg-background px-3 py-2"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className={`h-2.5 w-2.5 rounded-full ${item.tone}`} />
                                  <span className="text-sm text-fg-soft">{item.label}</span>
                                </div>
                                <span className="text-xs font-medium text-fg">{item.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-[1.25rem] border border-border bg-background p-4">
                      <p className="text-xs uppercase tracking-[0.24em] text-fg-muted">What the month is saying</p>
                      <div className="mt-3 space-y-2">
                        {[
                          "Monday and Wednesday are carrying the month.",
                          "Weekend sessions stay lighter and shorter.",
                          "Midweek consistency is driving adherence.",
                        ].map((note) => (
                          <div
                            key={note}
                            className="rounded-[1rem] border border-border bg-card px-3 py-2 text-sm text-fg-muted"
                          >
                            {note}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Dashboard panel ── */}
                <div className="relative mx-auto w-full overflow-hidden rounded-[2.1rem] border border-border bg-card md:w-[84%]">
                  <div className="flex items-center justify-between border-b border-border px-5 py-4 md:px-7">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                      <span className="h-2.5 w-2.5 rounded-full bg-border" />
                      <span className="h-2.5 w-2.5 rounded-full bg-border" />
                    </div>
                    <span className="text-[11px] uppercase tracking-[0.22em] text-fg-muted">
                      LiftOS Dashboard
                    </span>
                  </div>

                  <div className="grid gap-5 p-5 md:grid-cols-[1.18fr_0.82fr] md:p-7">
                    <div className="rounded-[1.55rem] border border-border bg-background p-5 md:p-6">
                      <div className="mb-5 flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs uppercase tracking-[0.24em] text-fg-muted">Training readout</p>
                          <p className="mt-2 text-xl font-semibold tracking-tight text-fg">5 sessions logged</p>
                        </div>
                        <span className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary">Tuesday</span>
                      </div>
                      <p className="text-sm leading-6 text-fg-soft">
                        Today is about keeping momentum high without burying recovery. Your week is balanced and the next best move is clear.
                      </p>
                      <div className="mt-5 grid gap-4 sm:grid-cols-3">
                        {dashboardPreviewStats.map((item) => (
                          <div
                            key={item.label}
                            className="rounded-[1.25rem] border border-border bg-card p-4"
                          >
                            <p className="text-[11px] uppercase tracking-[0.22em] text-fg-muted">
                              {item.label}
                            </p>
                            <p className="mt-3 stat-lg">
                              <b>{item.value}</b>
                            </p>
                            <p className="mt-2 text-sm text-fg-muted">{item.detail}</p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-5 rounded-[1.35rem] border border-border bg-card p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <span className="text-xs uppercase tracking-[0.24em] text-fg-muted">Weekly trend</span>
                          <span className="text-xs font-semibold text-primary">Stable ↑</span>
                        </div>
                        <Sparkline />
                      </div>
                    </div>

                    <div className="grid gap-4">
                      <div className="rounded-[1.55rem] border border-border bg-background p-5">
                        <p className="text-xs uppercase tracking-[0.24em] text-fg-muted">Recent workouts</p>
                        <div className="mt-4 space-y-2.5">
                          {[
                            "Upper Power · chest + shoulders",
                            "Lower Strength · squat focus",
                            "Pull Hypertrophy · back + rear delts",
                          ].map((cue) => (
                            <div
                              key={cue}
                              className="rounded-[1rem] border border-border bg-card px-4 py-3 text-sm text-fg-soft"
                            >
                              {cue}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-[1.55rem] border border-border bg-background p-5">
                        <div className="mb-3 flex items-center justify-between">
                          <div>
                            <p className="text-xs uppercase tracking-[0.24em] text-fg-muted">Daily summary</p>
                            <p className="mt-2 text-lg font-semibold text-fg">Good morning, Josh</p>
                          </div>
                          <span className="text-xs font-semibold text-primary">Clear</span>
                        </div>
                        <p className="text-sm leading-6 text-fg-soft">
                          Start workout, check the week, and move into the next session with the plan already surfaced.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── METRICS ── */}
      <section className="relative px-6 pt-20 pb-16 md:px-12 md:pt-28 md:pb-24">
        <div className="max-w-6xl mx-auto">
          <div
            ref={metrics.ref}
            className={`transition-all duration-700 ease-out ${
              metrics.visible
                ? "opacity-100 translate-y-0 blur-0"
                : "opacity-0 translate-y-6 blur-[4px]"
            }`}
          >
            <div className="rule-heavy grid gap-5 pt-6 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:items-end md:gap-14 md:pt-8">
              <div className="max-w-2xl">
                <p className="label-xs mb-3">What the platform surfaces</p>
                <h2 className="max-w-xl text-[2.15rem] font-semibold leading-[1.04] tracking-tight md:text-[3rem]">
                  A clear picture of where you stand.
                </h2>
              </div>
              <p className="max-w-md text-sm leading-7 text-fg-soft md:justify-self-end md:text-base">
                Volume, consistency, and personal records — all in one place, updated every session.
              </p>
            </div>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-10 md:mt-14 md:gap-16">
            {[
              {
                metric: "92",
                unit: "%",
                title: "Consistency",
                desc: "See your weekly plan hit rate at a glance — no digging through logs.",
              },
              {
                metric: "92.4k",
                unit: " lb",
                title: "Weekly volume",
                desc: "Total pounds moved this week, calculated automatically as you log.",
              },
              {
                metric: "+18",
                unit: "%",
                title: "Progressive overload",
                desc: "Track how much stronger you get on each lift, week over week.",
              },
            ].map((item, i) => (
              <div
                key={item.title}
                className={`relative rule-hairline pt-6 transition-all duration-700 ease-out ${
                  metrics.visible
                    ? "opacity-100 translate-y-0 blur-0"
                    : "opacity-0 translate-y-6 blur-[4px]"
                }`}
                style={{ transitionDelay: `${i * 100 + 150}ms` }}
              >
                <div className="mb-3 flex items-baseline gap-1.5">
                  <span className="stat-xl">
                    <b>{item.metric}</b>
                  </span>
                  <span className="text-sm text-fg-faint">{item.unit}</span>
                </div>
                <p className="mb-1.5 text-sm font-medium tracking-[0.01em] text-fg">{item.title}</p>
                <p className="max-w-[15rem] text-sm leading-6 text-fg-muted">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section ref={features.ref} className="relative py-20 md:py-28 px-6 md:px-12">
        <div className="max-w-6xl mx-auto">
          <div
            className={`transition-all duration-700 ease-out ${
              features.visible
                ? "opacity-100 translate-y-0 blur-0"
                : "opacity-0 translate-y-6 blur-[4px]"
            }`}
          >
            <p className="label-xs mb-3">How it works</p>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight leading-[1.1] mb-10 max-w-lg">
              Built around how
              <br />
              you actually train.
            </h2>
          </div>

          <div className="divide-y divide-border rule-heavy border-b border-border">
            {[
              { num: "01", tag: "Logging",   title: "Log your sessions",  body: "Quick input — exercise, weight, reps. Everything auto-calculates volume and intensity." },
              { num: "02", tag: "AI Coach",  title: "Get coached",        body: "Your AI coach analyzes your sessions and surfaces personalized recommendations to keep you progressing." },
              { num: "03", tag: "Analytics", title: "See the pattern",    body: "Weekly and monthly trends surface what's working. Clean charts, no dashboard overload." },
            ].map((f, i) => (
              <div
                key={f.num}
                className={`group flex items-center gap-5 py-6 md:gap-14 md:py-8 transition-all duration-700 ease-out ${
                  features.visible ? "opacity-100 translate-y-0 blur-0" : "opacity-0 translate-y-4 blur-[4px]"
                }`}
                style={{ transitionDelay: `${i * 120 + 200}ms` }}
              >
                {/* Step number + label */}
                <div className="w-20 shrink-0 md:w-36">
                  <p className="mono text-xl font-light tabular-nums text-fg-faint md:text-3xl">{f.num}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-primary">{f.tag}</p>
                </div>

                {/* Vertical divider */}
                <div className="h-10 w-px shrink-0 bg-border" />

                {/* Content */}
                <div className="flex-1">
                  <p className="text-lg md:text-xl font-medium mb-1.5 text-fg transition-colors duration-200 group-hover:text-primary">{f.title}</p>
                  <p className="max-w-lg text-sm leading-6 text-fg-muted">{f.body}</p>
                </div>

                {/* Step marker on hover */}
                <div className="hidden md:block h-1.5 w-1.5 shrink-0 rounded-full bg-primary opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section ref={cta.ref} className="relative py-20 md:py-32 px-6 md:px-12">
        <div
          className={`relative max-w-6xl mx-auto text-center transition-all duration-700 ease-out ${
            cta.visible
              ? "opacity-100 translate-y-0 blur-0"
              : "opacity-0 translate-y-6 blur-[4px]"
          }`}
        >
          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight leading-[1.05] mb-5">
            Your training.
            <br />
            <span className="text-gold">Elevated.</span>
          </h2>
          <p className="text-fg-muted text-sm md:text-base max-w-sm mx-auto mb-8 leading-relaxed">
            Built for lifters who take their training seriously.<br />Because progress deserves to be seen.
          </p>
          <CTAButton to="/sign-in">
            Open LiftOS
            <ArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </CTAButton>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="relative py-8 px-6 md:px-12 border-t border-border">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <span className="text-xs font-semibold tracking-[0.2em] text-fg-muted">LIFTOS</span>
          <div className="flex items-center gap-6">
            <Link to="/privacy" className="inline-flex min-h-11 items-center text-xs text-fg-muted transition-colors duration-200 hover:text-gold">
              Privacy
            </Link>
            <Link to="/terms" className="inline-flex min-h-11 items-center text-xs text-fg-muted transition-colors duration-200 hover:text-gold">
              Terms
            </Link>
            <span className="text-xs text-fg-faint">
              © {new Date().getFullYear()}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
