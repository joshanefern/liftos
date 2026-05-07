import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, Sparkles } from "lucide-react";
import { FitnessBackground } from "@/components/FitnessBackground";
import { GoldButton } from "@/components/GoldButton";

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
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="text-[12px] font-semibold tracking-[0.28em] text-foreground cursor-pointer"
      >
        LIFT<span className="text-gold">OS</span>
      </button>
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
  const [heroVisible, setHeroVisible] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => setHeroVisible(true))
    );
    return () => cancelAnimationFrame(id);
  }, []);

  const metrics = useReveal(0.2, true, "-180px");
  const features = useReveal(0.2, true);
  const cta = useReveal(0.25, true);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#0a0c15] text-foreground" style={{ isolation: "isolate", zIndex: 0 }}>
      <FitnessBackground />
      <LandingNav />

      {/* ── HERO ── */}
      <section
        className="relative overflow-visible px-6 pt-44 pb-48 md:px-12 md:pt-56 md:pb-60"
      >
        <div className="landing-hero-radiance pointer-events-none absolute inset-x-0 top-0 h-[42rem]" />
        <div className="max-w-6xl mx-auto min-h-[70vh]">
          <div
            style={{ transform: heroVisible ? "translateY(0)" : "translateY(4rem)", transition: "transform 1.5s ease-out" }}
            className="relative flex min-h-[70vh] flex-col items-center justify-start pt-0 opacity-100 md:pt-2"
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
                <GoldButton to="/sign-in">
                  Open LiftOS
                  <ArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                </GoldButton>
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
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-300/20 bg-sky-300/10 px-2.5 py-1 text-[10px] font-semibold text-sky-300">
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
                                : "ml-8 border-sky-300/20 bg-sky-300/[0.08] text-foreground"
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
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-300">
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
                        <span className="text-[10px] font-semibold text-emerald-300">Upward</span>
                      </div>
                      <div className="rounded-[1rem] border border-white/8 bg-white/[0.03] p-3.5">
                        <div className="grid grid-cols-[auto_1fr] items-center gap-4">
                          <div className="relative h-24 w-24 shrink-0">
                            <div
                              className="h-full w-full rounded-full border border-gold/10"
                              style={{
                                background:
                                  "conic-gradient(rgba(110,231,183,0.92) 0deg 228deg, rgba(110,231,183,0.56) 228deg 312deg, rgba(110,231,183,0.22) 312deg 360deg)",
                              }}
                            />
                            <div className="absolute inset-[18%] rounded-full border border-white/8 bg-[rgba(12,15,26,0.8)]" />
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <span className="text-lg font-semibold tracking-tight text-foreground">82%</span>
                              <span className="text-[9px] uppercase tracking-[0.22em] text-foreground/30">
                                Hit Rate
                              </span>
                            </div>
                          </div>
                          <div className="space-y-2.5">
                            {[
                              { label: "Beat plan", value: "14 days", tone: "bg-emerald-300/90" },
                              { label: "On plan", value: "8 days", tone: "bg-emerald-300/55" },
                              { label: "Rest days", value: "8 days", tone: "bg-emerald-300/25" },
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
      <section className="relative px-6 pt-[30rem] pb-20 md:px-12 md:pt-[38rem] md:pb-28">
        <div className="max-w-6xl mx-auto">
          <div
            ref={metrics.ref}
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
                  A clear picture of where you stand.
                </h2>
              </div>
              <p className="max-w-md text-sm leading-7 text-foreground/45 md:justify-self-end md:text-base">
                Volume, consistency, and personal records — all in one place, updated every session.
              </p>
            </div>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-12 sm:grid-cols-3 sm:gap-10 md:mt-20 md:gap-16">
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
                className={`relative transition-all duration-700 ease-out ${
                  metrics.visible
                    ? "opacity-100 translate-y-0 blur-0"
                    : "opacity-0 translate-y-6 blur-[4px]"
                }`}
                style={{ transitionDelay: `${i * 100 + 150}ms` }}
              >
                <div className="mb-6 flex items-baseline gap-1.5">
                  <span className={`text-[2.75rem] font-semibold tracking-tight tabular-nums md:text-[3.5rem] ${i === 0 ? "text-sky-300" : i === 1 ? "text-gold" : "text-emerald-300"}`}>
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

          <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
            {[
              { num: "01", tag: "Logging",   title: "Log your sessions",  body: "Quick input — exercise, weight, reps. Everything auto-calculates volume and intensity." },
              { num: "02", tag: "AI Coach",  title: "Get coached",        body: "Your AI coach analyzes your sessions and surfaces personalized recommendations to keep you progressing." },
              { num: "03", tag: "Analytics", title: "See the pattern",    body: "Weekly and monthly trends surface what's working. Clean charts, no dashboard overload." },
            ].map((f, i) => (
              <div
                key={f.num}
                className={`group flex items-center gap-8 py-8 md:gap-14 md:py-10 transition-all duration-700 ease-out ${
                  features.visible ? "opacity-100 translate-y-0 blur-0" : "opacity-0 translate-y-4 blur-[4px]"
                }`}
                style={{ transitionDelay: `${i * 120 + 200}ms` }}
              >
                {/* Step number + label */}
                <div className="w-28 shrink-0 md:w-36">
                  <p className={`mono text-2xl font-semibold tabular-nums md:text-3xl ${
                    i === 0 ? "text-sky-300" : i === 1 ? "text-gold" : "text-emerald-300"
                  }`}>{f.num}</p>
                  <p className={`mt-1 text-[10px] uppercase tracking-[0.2em] ${
                    i === 0 ? "text-sky-300/50" : i === 1 ? "text-gold/50" : "text-emerald-300/50"
                  }`}>{f.tag}</p>
                </div>

                {/* Vertical divider */}
                <div className={`h-10 w-px shrink-0 ${
                  i === 0 ? "bg-sky-300/20" : i === 1 ? "bg-gold/20" : "bg-emerald-300/20"
                }`} />

                {/* Content */}
                <div className="flex-1">
                  <p className={`text-xl font-medium mb-2 transition-colors duration-200 ${
                    i === 0 ? "text-sky-300" : i === 1 ? "text-gold" : "text-emerald-300"
                  }`}>{f.title}</p>
                  <p className="max-w-lg text-sm leading-7 text-foreground/45">{f.body}</p>
                </div>

                {/* Step glow on hover */}
                <div className={`hidden md:block h-8 w-8 shrink-0 rounded-full opacity-0 transition-opacity duration-300 group-hover:opacity-100 ${
                  i === 0 ? "bg-sky-300/10 shadow-[0_0_16px_4px_rgba(125,211,252,0.12)]"
                  : i === 1 ? "bg-gold/10 shadow-[0_0_16px_4px_rgba(184,147,66,0.12)]"
                  : "bg-emerald-300/10 shadow-[0_0_16px_4px_rgba(110,231,183,0.12)]"
                }`} />
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
            Built for lifters who take their training seriously.<br />Because progress deserves to be seen.
          </p>
          <GoldButton to="/sign-in">
            Open LiftOS
            <ArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </GoldButton>
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
