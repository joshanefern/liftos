import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, Sparkles } from "lucide-react";
import { FitnessBackground } from "@/components/FitnessBackground";

/* ───────── scroll-reveal hook ───────── */
const useReveal = (threshold = 0.15) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => e.isIntersecting && setVisible(true),
      { threshold }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
};

/* ───────── mini sparkline SVG ───────── */
const Sparkline = () => (
  <svg viewBox="0 0 120 40" className="w-full h-10" preserveAspectRatio="none">
    <defs>
      <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="hsl(43 56% 52%)" stopOpacity="0.18" />
        <stop offset="100%" stopColor="hsl(43 56% 52%)" stopOpacity="0" />
      </linearGradient>
    </defs>
    <polygon
      points="0,35 15,30 30,32 45,22 60,18 75,24 90,12 105,8 120,14 120,40 0,40"
      fill="url(#spark-fill)"
    />
    <polyline
      points="0,35 15,30 30,32 45,22 60,18 75,24 90,12 105,8 120,14"
      fill="none"
      stroke="hsl(43 56% 52%)"
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
  <nav className="fixed top-0 inset-x-0 z-50 px-8 md:px-14">
    <div className="flex h-16 items-center justify-between">
      <span className="text-[12px] font-semibold tracking-[0.28em] text-foreground">
        LIFTOS
      </span>
      <Link
        to="/sign-in"
        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-1.5 text-[11px] tracking-[0.12em] text-foreground/70 transition-all duration-200 hover:border-gold/25 hover:bg-gold/[0.08] hover:text-foreground"
      >
        Sign In
        <ArrowRight size={11} />
      </Link>
    </div>
  </nav>
);

/* ═══════════════ LANDING ═══════════════ */
const Landing = () => {
  const hero = useReveal(0.1);
  const metrics = useReveal(0.2);
  const features = useReveal(0.2);
  const cta = useReveal(0.25);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#07080d] text-foreground" style={{ isolation: "isolate", zIndex: 0 }}>
      <FitnessBackground />
      <LandingNav />

      {/* ── HERO ── */}
      <section
        ref={hero.ref}
        className="relative overflow-visible px-6 pt-44 pb-48 md:px-12 md:pt-56 md:pb-60"
      >
        <div className="landing-hero-radiance pointer-events-none absolute inset-x-0 top-0 h-[42rem]" />
        <div className="max-w-6xl mx-auto min-h-[70vh]">
          <div
            className={`relative flex min-h-[70vh] flex-col items-center justify-start pt-0 transition-all duration-1000 ease-out md:pt-2 ${
              hero.visible
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-10"
            }`}
          >
            <div className="relative mx-auto max-w-4xl text-center">

              {/* eyebrow pill */}
              <div className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-gold/20 bg-gold/[0.07] px-4 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse" />
                <span className="text-[11px] font-medium tracking-[0.18em] text-gold/80 uppercase">
                  Precision training intelligence
                </span>
              </div>

              <h1 className="text-[2.65rem] font-semibold leading-[0.9] tracking-[-0.06em] text-foreground sm:text-[3.7rem] md:text-[4.65rem]">
                Track the work.
                <br />
                Witness the{" "}
                <span className="relative inline-block px-2 pb-1">
                  <span className="absolute inset-x-0 bottom-1.5 top-[54%] rounded-full bg-gold/8" />
                  <span className="relative text-gold">growth.</span>
                </span>
              </h1>

              <p className="mx-auto mt-7 max-w-sm text-[13px] leading-6 text-muted-foreground md:text-[14px]">
                Every rep logged. Every set tracked. Your progress, finally visible.
              </p>

              <div className="mt-11 flex justify-center">
                <div className="group relative inline-flex items-center overflow-hidden rounded-full border border-gold/20 bg-[linear-gradient(135deg,rgba(255,255,255,0.04),rgba(184,147,66,0.05))] p-1.5 shadow-[0_8px_20px_rgba(0,0,0,0.12)]">
                  <span className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(184,147,66,0.14),transparent_68%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <span className="pointer-events-none absolute -left-1/4 top-0 h-full w-1/3 skew-x-[-20deg] bg-white/12 opacity-0 blur-md transition-all duration-700 group-hover:left-[105%] group-hover:opacity-100" />
                  <Link
                    to="/sign-in"
                    className="group inline-flex items-center gap-2.5 rounded-full bg-[linear-gradient(135deg,rgba(215,181,99,1),rgba(184,147,66,1))] px-6 py-3 text-[13px] font-medium text-background transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_28px_rgba(184,147,66,0.22)] active:scale-[0.97]"
                  >
                    Open LiftOS
                    <ArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </div>
            </div>

            <div className="pointer-events-none absolute inset-x-0 -bottom-[22rem] flex justify-center px-4 md:-bottom-[28rem] md:px-8">
              <div className="relative h-80 w-full max-w-[78rem]">

                {/* ── AI Coach panel ── */}
                <div className="absolute -bottom-[50px] left-[-20%] hidden h-[33rem] w-[44rem] overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] shadow-[0_24px_64px_rgba(0,0,0,0.32)] backdrop-blur-2xl 2xl:block">
                  <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent)]" />
                  <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-gold/65" />
                      <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                      <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                    </div>
                    <span className="text-[11px] uppercase tracking-[0.22em] text-foreground/30">
                      AI Coach
                    </span>
                  </div>
                  <div className="space-y-4 p-5">
                    <div className="rounded-[1.25rem] border border-white/8 bg-white/[0.04] p-4">
                      <div className="mb-3 flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs uppercase tracking-[0.24em] text-foreground/30">Conversation</p>
                          <p className="mt-2 text-lg font-semibold text-foreground">LiftOS Coach</p>
                        </div>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/20 bg-gold/10 px-2.5 py-1 text-[10px] font-semibold text-gold">
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
                                ? "border-white/8 bg-white/[0.04] text-foreground/60"
                                : "ml-8 border-gold/20 bg-gold/[0.08] text-foreground"
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
                        <div key={item.label} className="rounded-[1.1rem] border border-white/8 bg-white/[0.04] p-3">
                          <p className="text-[10px] uppercase tracking-[0.22em] text-foreground/30">{item.label}</p>
                          <p className="mt-2.5 text-xl font-semibold text-foreground">{item.value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-[1.25rem] border border-white/8 bg-white/[0.04] p-4">
                      <p className="text-xs uppercase tracking-[0.24em] text-foreground/30">Suggested prompts</p>
                    </div>
                  </div>
                </div>

                {/* ── Calendar panel ── */}
                <div className="absolute -bottom-[50px] right-[-20%] hidden h-[33rem] w-[44rem] overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] shadow-[0_24px_64px_rgba(0,0,0,0.32)] backdrop-blur-2xl 2xl:block">
                  <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent)]" />
                  <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-gold/65" />
                      <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                      <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                    </div>
                    <span className="text-[11px] uppercase tracking-[0.22em] text-foreground/30">
                      Calendar
                    </span>
                  </div>
                  <div className="space-y-4 p-5">
                    <div className="rounded-[1.25rem] border border-white/8 bg-white/[0.04] p-4">
                      <div className="mb-3 flex items-end justify-between gap-4">
                        <div>
                          <p className="text-xs uppercase tracking-[0.24em] text-foreground/30">Performance Ledger</p>
                          <p className="mt-2 text-3xl font-semibold text-foreground">April 2026</p>
                        </div>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/20 bg-gold/10 px-2.5 py-1 text-[10px] font-semibold text-gold">
                          <CalendarDays size={11} />
                          22 days
                        </span>
                      </div>
                      <p className="text-sm text-foreground/45">A month-view training ledger for volume, adherence, and recovery rhythm.</p>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: "Volume", value: "101.9k" },
                        { label: "Green Days", value: "14" },
                        { label: "Hit Rate", value: "82%" },
                      ].map((item) => (
                        <div key={item.label} className="rounded-[1.1rem] border border-white/8 bg-white/[0.04] p-3">
                          <p className="text-[10px] uppercase tracking-[0.22em] text-foreground/30">{item.label}</p>
                          <p className="mt-2.5 text-xl font-semibold text-foreground">{item.value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-[1.25rem] border border-white/8 bg-white/[0.04] p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-xs uppercase tracking-[0.24em] text-foreground/30">Monthly Grid</p>
                        <span className="text-[10px] font-semibold text-gold">Upward</span>
                      </div>
                      <div className="rounded-[1rem] border border-white/8 bg-white/[0.03] p-3.5">
                        <div className="grid grid-cols-[auto_1fr] items-center gap-4">
                          <div className="relative h-24 w-24 shrink-0">
                            <div
                              className="h-full w-full rounded-full border border-gold/10"
                              style={{
                                background:
                                  "conic-gradient(rgba(184,147,66,0.92) 0deg 228deg, rgba(184,147,66,0.56) 228deg 312deg, rgba(184,147,66,0.22) 312deg 360deg)",
                              }}
                            />
                            <div className="absolute inset-[18%] rounded-full border border-white/8 bg-[rgba(7,8,13,0.8)]" />
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <span className="text-lg font-semibold tracking-tight text-foreground">82%</span>
                              <span className="text-[9px] uppercase tracking-[0.22em] text-foreground/30">
                                Hit Rate
                              </span>
                            </div>
                          </div>
                          <div className="space-y-2.5">
                            {[
                              { label: "Beat plan", value: "14 days", tone: "bg-gold/90" },
                              { label: "On plan", value: "8 days", tone: "bg-gold/55" },
                              { label: "Rest days", value: "8 days", tone: "bg-gold/25" },
                            ].map((item) => (
                              <div
                                key={item.label}
                                className="flex items-center justify-between rounded-[0.95rem] border border-white/8 bg-white/[0.03] px-3 py-2"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className={`h-2.5 w-2.5 rounded-full ${item.tone}`} />
                                  <span className="text-sm text-foreground/55">{item.label}</span>
                                </div>
                                <span className="text-xs font-medium text-foreground">{item.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-[1.25rem] border border-white/8 bg-white/[0.04] p-4">
                      <p className="text-xs uppercase tracking-[0.24em] text-foreground/30">What the month is saying</p>
                      <div className="mt-3 space-y-2">
                        {[
                          "Monday and Wednesday are carrying the month.",
                          "Weekend sessions stay lighter and shorter.",
                          "Midweek consistency is driving adherence.",
                        ].map((note) => (
                          <div
                            key={note}
                            className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-foreground/45"
                          >
                            {note}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Dashboard panel ── */}
                <div className="absolute bottom-0 left-1/2 w-[99%] -translate-x-1/2 overflow-hidden rounded-[2.1rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] shadow-[0_24px_80px_rgba(0,0,0,0.36)] backdrop-blur-2xl md:w-[84%]">
                  <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent)]" />
                  <div className="absolute inset-x-[18%] -top-6 h-10 rounded-full bg-[rgba(184,147,66,0.06)] blur-2xl" />
                  <div className="flex items-center justify-between border-b border-white/8 px-5 py-4 md:px-7">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-gold/65" />
                      <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                      <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                    </div>
                    <span className="text-[11px] uppercase tracking-[0.22em] text-foreground/30">
                      LiftOS Dashboard
                    </span>
                  </div>

                  <div className="grid gap-5 p-5 md:grid-cols-[1.18fr_0.82fr] md:p-7">
                    <div className="rounded-[1.55rem] border border-gold/20 bg-[linear-gradient(135deg,rgba(184,147,66,0.07),rgba(184,147,66,0.03))] p-5 md:p-6">
                      <div className="mb-5 flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs uppercase tracking-[0.24em] text-foreground/30">Training readout</p>
                          <p className="mt-2 text-xl font-semibold tracking-tight text-foreground">5 sessions logged</p>
                        </div>
                        <span className="rounded-full bg-gold/10 px-3 py-1 text-[11px] font-semibold text-gold">Tuesday</span>
                      </div>
                      <p className="text-sm leading-6 text-foreground/50">
                        Today is about keeping momentum high without burying recovery. Your week is balanced and the next best move is clear.
                      </p>
                      <div className="mt-5 grid gap-4 sm:grid-cols-3">
                        {dashboardPreviewStats.map((item) => (
                          <div
                            key={item.label}
                            className="rounded-[1.25rem] border border-white/8 bg-white/[0.04] p-4"
                          >
                            <p className="text-[11px] uppercase tracking-[0.22em] text-foreground/30">
                              {item.label}
                            </p>
                            <p className="mt-3 text-2xl font-semibold tracking-tight text-gold">
                              {item.value}
                            </p>
                            <p className="mt-2 text-sm text-foreground/45">{item.detail}</p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-5 rounded-[1.35rem] border border-gold/16 bg-gold/[0.05] p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <span className="text-xs uppercase tracking-[0.24em] text-foreground/30">Weekly trend</span>
                          <span className="text-xs font-semibold text-gold">Stable ↑</span>
                        </div>
                        <Sparkline />
                      </div>
                    </div>

                    <div className="grid gap-4">
                      <div className="rounded-[1.55rem] border border-white/8 bg-white/[0.04] p-5">
                        <p className="text-xs uppercase tracking-[0.24em] text-foreground/30">Recent workouts</p>
                        <div className="mt-4 space-y-2.5">
                          {[
                            "Upper Power · chest + shoulders",
                            "Lower Strength · squat focus",
                            "Pull Hypertrophy · back + rear delts",
                          ].map((cue) => (
                            <div
                              key={cue}
                              className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-foreground/50"
                            >
                              {cue}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-[1.55rem] border border-white/8 bg-white/[0.04] p-5">
                        <div className="mb-3 flex items-center justify-between">
                          <div>
                            <p className="text-xs uppercase tracking-[0.24em] text-foreground/30">Daily summary</p>
                            <p className="mt-2 text-lg font-semibold text-foreground">Good morning, Josh</p>
                          </div>
                          <span className="text-xs font-semibold text-gold">Clear</span>
                        </div>
                        <p className="text-sm leading-6 text-foreground/50">
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
      <section ref={metrics.ref} className="relative px-6 pt-[30rem] pb-20 md:px-12 md:pt-[38rem] md:pb-28">
        <div className="max-w-6xl mx-auto">
          <div
            className={`transition-all duration-700 ease-out ${
              metrics.visible
                ? "opacity-100 translate-y-0 blur-0"
                : "opacity-0 translate-y-6 blur-[4px]"
            }`}
          >
            <div className="grid gap-8 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:items-end md:gap-14">
              <div className="max-w-2xl">
                <p className="label-xs mb-4">What the platform surfaces</p>
                <h2 className="max-w-xl text-[2.15rem] font-semibold leading-[1.04] tracking-tight md:text-[3rem]">
                  A cleaner view of what to do next.
                </h2>
              </div>
              <p className="max-w-md text-sm leading-7 text-foreground/45 md:justify-self-end md:text-base">
                Your week stays legible at a glance — workload, priorities, and the next session.
              </p>
            </div>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-12 sm:grid-cols-3 sm:gap-10 md:mt-20 md:gap-16">
            {[
              {
                metric: "8.4",
                unit: "/ 10",
                title: "Weekly strain",
                desc: "Know how hard the week is trending before it gets messy.",
              },
              {
                metric: "247",
                unit: "min",
                title: "Planned volume",
                desc: "See how the block is distributed without opening five views.",
              },
              {
                metric: "3",
                unit: " cues",
                title: "Session priorities",
                desc: "Start each lift with the few details that actually matter.",
              },
            ].map((item, i) => (
              <div
                key={item.title}
                className={`relative transition-all duration-700 ease-out ${
                  metrics.visible
                    ? "opacity-100 translate-y-0 blur-0"
                    : "opacity-0 translate-y-6 blur-[4px]"
                }`}
                style={{ transitionDelay: `${i * 100 + 150}ms` }}
              >
                <div className="mb-6 flex items-baseline gap-1.5">
                  <span className="text-[2.75rem] font-semibold tracking-tight tabular-nums text-gold md:text-[3.5rem]">
                    {item.metric}
                  </span>
                  <span className="text-sm text-foreground/35">{item.unit}</span>
                </div>
                <p className="mb-3 text-sm font-medium tracking-[0.01em] text-foreground">{item.title}</p>
                <p className="max-w-[15rem] text-sm leading-7 text-foreground/45">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section ref={features.ref} className="relative py-32 md:py-44 px-6 md:px-12">
        <div className="max-w-6xl mx-auto">
          <div
            className={`transition-all duration-700 ease-out ${
              features.visible
                ? "opacity-100 translate-y-0 blur-0"
                : "opacity-0 translate-y-6 blur-[4px]"
            }`}
          >
            <p className="label-xs mb-6">How it works</p>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight leading-[1.1] mb-20 max-w-lg">
              Built around how
              <br />
              you actually train.
            </h2>
          </div>

          <div className="space-y-20 md:space-y-28">
            {[
              {
                num: "01",
                title: "Log your sessions",
                body: "Quick input — exercise, weight, reps. Everything auto-calculates volume and intensity.",
              },
              {
                num: "02",
                title: "Track recovery",
                body: "Sleep quality, HRV, and subjective readiness scored daily. Know when to push and when to rest.",
              },
              {
                num: "03",
                title: "See the pattern",
                body: "Weekly and monthly trends surface what's working. Clean charts, no dashboard overload.",
              },
            ].map((f, i) => (
              <div
                key={f.num}
                className={`flex gap-6 md:gap-10 items-start max-w-2xl transition-all duration-700 ease-out ${
                  features.visible
                    ? "opacity-100 translate-x-0 blur-0"
                    : "opacity-0 -translate-x-4 blur-[4px]"
                }`}
                style={{ transitionDelay: `${i * 120 + 200}ms` }}
              >
                <span className={`mono text-sm pt-1 shrink-0 ${i === 0 ? "text-sky-300" : i === 1 ? "text-gold" : "text-emerald-300"}`}>{f.num}</span>
                <div className="rounded-[1.25rem] border border-white/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] px-5 py-4 backdrop-blur-sm transition-all duration-300 hover:border-gold/20 hover:bg-gold/[0.04]">
                  <p className="text-lg font-medium mb-2">{f.title}</p>
                  <p className="text-sm text-foreground/45 leading-relaxed max-w-md">
                    {f.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section ref={cta.ref} className="relative py-32 md:py-48 px-6 md:px-12">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center">
          <div className="h-64 w-[36rem] rounded-full bg-[radial-gradient(ellipse,rgba(184,147,66,0.09),transparent_70%)] blur-3xl" />
        </div>
        <div
          className={`relative max-w-6xl mx-auto text-center transition-all duration-700 ease-out ${
            cta.visible
              ? "opacity-100 translate-y-0 blur-0"
              : "opacity-0 translate-y-6 blur-[4px]"
          }`}
        >
          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight leading-[1.05] mb-6">
            Your training.
            <br />
            <span className="text-gold">Elevated.</span>
          </h2>
          <p className="text-foreground/45 text-sm md:text-base max-w-sm mx-auto mb-10 leading-relaxed">
            No account required. Open the dashboard and see what structured training looks like.
          </p>
          <Link
            to="/sign-in"
            className="group inline-flex items-center gap-2.5 rounded-full bg-[linear-gradient(135deg,rgba(215,181,99,1),rgba(184,147,66,1))] px-8 py-3.5 text-[13px] font-semibold text-background shadow-[0_0_40px_rgba(184,147,66,0.18)] transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_48px_rgba(184,147,66,0.28)] active:scale-[0.97]"
          >
            Open LiftOS
            <ArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="relative py-12 px-6 md:px-12 border-t border-white/8">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(184,147,66,0.22),transparent)]" />
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <span className="text-xs font-semibold tracking-[0.2em] text-foreground/40">LIFTOS</span>
          <span className="text-xs text-foreground/25">
            © {new Date().getFullYear()}
          </span>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
