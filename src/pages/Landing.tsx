import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

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

const heroStats = [
  { label: "Strength grade", value: "89", detail: "On track" },
  { label: "Planned volume", value: "247 min", detail: "Week total" },
  { label: "Next session", value: "Push day", detail: "3 cues ready" },
];

/* ───────── Nav ───────── */
const LandingNav = () => (
  <nav className="fixed top-0 inset-x-0 z-50 px-6 md:px-12">
    <div className="max-w-6xl mx-auto flex h-16 items-center justify-between">
      <span className="text-[12px] font-medium tracking-[0.22em] text-foreground/88">
        LIFTOS
      </span>
      <Link
        to="/dashboard"
        className="text-[11px] tracking-[0.2em] text-[hsl(var(--text-secondary))] transition-colors duration-200 hover:text-foreground"
      >
        Open App →
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
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <LandingNav />

      {/* ── HERO ── */}
      <section
        ref={hero.ref}
        className="relative overflow-visible px-6 pt-44 pb-48 md:px-12 md:pt-56 md:pb-64"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(circle_at_50%_14%,rgba(184,147,66,0.11),transparent_64%)]" />
        <div className="max-w-6xl mx-auto min-h-[74vh]">
          <div
            className={`relative flex min-h-[74vh] flex-col items-center justify-start pt-0 transition-all duration-1000 ease-out md:pt-2 ${
              hero.visible
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-10"
            }`}
          >
            <div className="relative mx-auto max-w-4xl text-center">
              <p className="mb-8 text-[10px] font-medium uppercase tracking-[0.26em] text-[hsl(var(--text-secondary))]">
                Built for structured lifting
              </p>
              <h1 className="text-[2.65rem] font-semibold leading-[0.9] tracking-[-0.06em] text-foreground sm:text-[3.7rem] md:text-[4.65rem]">
                See your{" "}
                <span className="relative inline-block px-2 pb-1">
                  <span className="absolute inset-x-0 bottom-1.5 top-[54%] rounded-full bg-gold/5" />
                  <span className="relative">next training week</span>
                  <span className="absolute -right-6 -top-8 rounded-full border border-gold/20 bg-[rgba(184,147,66,0.84)] px-3 py-1 text-[10px] font-semibold tracking-[0.04em] text-background shadow-[0_6px_16px_rgba(0,0,0,0.14)] md:-right-10 md:-top-5">
                    LiftOS
                  </span>
                </span>
                <br />
                before it starts.
              </h1>
              <p className="mx-auto mt-7 max-w-sm text-[13px] leading-6 text-muted-foreground md:text-[14px]">
                Plan, workload, and session focus in one premium dashboard for lifters who want clarity without clutter.
              </p>

              <div className="mt-11 flex justify-center">
                <div className="group relative inline-flex items-center overflow-hidden rounded-full border border-border/25 bg-[hsl(var(--surface-1))/0.68] p-1.5 shadow-[0_8px_20px_rgba(0,0,0,0.12)]">
                  <span className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(184,147,66,0.14),transparent_68%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <span className="pointer-events-none absolute -left-1/4 top-0 h-full w-1/3 skew-x-[-20deg] bg-white/12 opacity-0 blur-md transition-all duration-700 group-hover:left-[105%] group-hover:opacity-100" />
                  <Link
                    to="/dashboard"
                    className="group inline-flex items-center gap-2.5 rounded-full bg-gold px-6 py-3 text-[13px] font-medium text-background transition-all duration-200 hover:opacity-90 active:scale-[0.97]"
                  >
                    Open Dashboard
                    <ArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </div>
            </div>

            <div className="pointer-events-none absolute inset-x-0 -bottom-72 flex justify-center px-4 md:-bottom-80 md:px-8">
              <div className="relative h-80 w-full max-w-[78rem]">
                <div className="absolute -bottom-[50px] left-[-20%] hidden h-[33rem] w-[44rem] overflow-hidden rounded-[2rem] border border-border/55 bg-[hsl(var(--surface-1))] shadow-[0_24px_64px_rgba(0,0,0,0.22)] 2xl:block">
                  <div className="absolute inset-x-[8%] top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(184,147,66,0.18),transparent)]" />
                  <div className="flex items-center justify-between border-b border-border/20 px-5 py-4">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-gold/65" />
                      <span className="h-2.5 w-2.5 rounded-full bg-border/80" />
                      <span className="h-2.5 w-2.5 rounded-full bg-border/80" />
                    </div>
                    <span className="text-[11px] uppercase tracking-[0.22em] text-[hsl(var(--text-tertiary))]">
                      Session Card
                    </span>
                  </div>
                  <div className="space-y-5 p-5">
                    <div className="rounded-[1.25rem] border border-border/20 bg-[hsl(var(--surface-1))] p-4">
                      <div className="mb-3 flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs uppercase tracking-[0.24em] text-[hsl(var(--text-tertiary))]">Workout</p>
                          <p className="mt-2 text-lg font-semibold text-foreground">Upper Power</p>
                        </div>
                        <span className="rounded-full bg-gold/10 px-2.5 py-1 text-[10px] font-semibold text-gold">Today</span>
                      </div>
                      <p className="text-sm text-muted-foreground">Bench, incline press, controlled accessories.</p>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-[1.1rem] border border-border/20 bg-[hsl(var(--surface-2))/0.58] p-3">
                        <p className="text-[10px] uppercase tracking-[0.22em] text-[hsl(var(--text-tertiary))]">Sets</p>
                        <p className="mt-2.5 text-xl font-semibold text-foreground">18</p>
                      </div>
                      <div className="rounded-[1.1rem] border border-border/20 bg-[hsl(var(--surface-2))/0.58] p-3">
                        <p className="text-[10px] uppercase tracking-[0.22em] text-[hsl(var(--text-tertiary))]">Focus</p>
                        <p className="mt-2.5 text-xl font-semibold text-foreground">Tempo</p>
                      </div>
                      <div className="rounded-[1.1rem] border border-border/20 bg-[hsl(var(--surface-2))/0.58] p-3">
                        <p className="text-[10px] uppercase tracking-[0.22em] text-[hsl(var(--text-tertiary))]">Load</p>
                        <p className="mt-2.5 text-xl font-semibold text-foreground">7.8</p>
                      </div>
                    </div>
                    <div className="rounded-[1.25rem] border border-border/20 bg-[hsl(var(--surface-2))/0.5] p-4">
                      <p className="text-xs uppercase tracking-[0.24em] text-[hsl(var(--text-tertiary))]">Cue stack</p>
                      <div className="mt-3 space-y-2">
                        {[
                          "Control the eccentric on bench",
                          "Pause briefly at the bottom",
                          "Keep upper-back tension through every rep",
                        ].map((cue) => (
                          <div
                            key={cue}
                            className="rounded-[1rem] border border-border/20 bg-[hsl(var(--surface-2))/0.52] px-3 py-2 text-sm text-muted-foreground"
                          >
                            {cue}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="absolute -bottom-[50px] right-[-20%] hidden h-[33rem] w-[44rem] overflow-hidden rounded-[2rem] border border-border/55 bg-[hsl(var(--surface-1))] shadow-[0_24px_64px_rgba(0,0,0,0.22)] 2xl:block">
                  <div className="absolute inset-x-[8%] top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(184,147,66,0.18),transparent)]" />
                  <div className="flex items-center justify-between border-b border-border/20 px-5 py-4">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-gold/65" />
                      <span className="h-2.5 w-2.5 rounded-full bg-border/80" />
                      <span className="h-2.5 w-2.5 rounded-full bg-border/80" />
                    </div>
                    <span className="text-[11px] uppercase tracking-[0.22em] text-[hsl(var(--text-tertiary))]">
                      Readiness Panel
                    </span>
                  </div>
                  <div className="space-y-5 p-5">
                    <div className="rounded-[1.25rem] border border-border/20 bg-[hsl(var(--surface-1))] p-4">
                      <div className="mb-3 flex items-end justify-between gap-4">
                        <div>
                          <p className="text-xs uppercase tracking-[0.24em] text-[hsl(var(--text-tertiary))]">Readiness</p>
                          <p className="mt-2 text-3xl font-semibold text-foreground">91%</p>
                        </div>
                        <span className="rounded-full bg-gold/10 px-2.5 py-1 text-[10px] font-semibold text-gold">Recovered</span>
                      </div>
                      <p className="text-sm text-muted-foreground">Enough headroom to push top sets without guesswork.</p>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-[1.1rem] border border-border/20 bg-[hsl(var(--surface-2))/0.58] p-3">
                        <p className="text-[10px] uppercase tracking-[0.22em] text-[hsl(var(--text-tertiary))]">HRV</p>
                        <p className="mt-2.5 text-xl font-semibold text-foreground">74</p>
                      </div>
                      <div className="rounded-[1.1rem] border border-border/20 bg-[hsl(var(--surface-2))/0.58] p-3">
                        <p className="text-[10px] uppercase tracking-[0.22em] text-[hsl(var(--text-tertiary))]">Sleep</p>
                        <p className="mt-2.5 text-xl font-semibold text-foreground">8.1h</p>
                      </div>
                      <div className="rounded-[1.1rem] border border-border/20 bg-[hsl(var(--surface-2))/0.58] p-3">
                        <p className="text-[10px] uppercase tracking-[0.22em] text-[hsl(var(--text-tertiary))]">Cues</p>
                        <p className="mt-2.5 text-xl font-semibold text-foreground">3</p>
                      </div>
                    </div>
                    <div className="rounded-[1.25rem] border border-border/20 bg-[hsl(var(--surface-2))/0.5] p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-xs uppercase tracking-[0.24em] text-[hsl(var(--text-tertiary))]">Recovery trend</p>
                        <span className="text-[10px] font-semibold text-gold">Upward</span>
                      </div>
                      <div className="rounded-[1rem] border border-border/15 bg-[hsl(var(--surface-1))/0.45] p-3.5">
                        <div className="grid grid-cols-[auto_1fr] items-center gap-4">
                          <div className="relative h-24 w-24 shrink-0">
                            <div
                              className="h-full w-full rounded-full border border-gold/10"
                              style={{
                                background:
                                  "conic-gradient(rgba(184,147,66,0.92) 0deg 198deg, rgba(184,147,66,0.56) 198deg 302deg, rgba(184,147,66,0.22) 302deg 360deg)",
                              }}
                            />
                            <div className="absolute inset-[18%] rounded-full border border-border/20 bg-[hsl(var(--surface-1))]" />
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <span className="text-lg font-semibold tracking-tight text-foreground">91%</span>
                              <span className="text-[9px] uppercase tracking-[0.22em] text-[hsl(var(--text-tertiary))]">
                                Ready
                              </span>
                            </div>
                          </div>

                          <div className="space-y-2.5">
                            {[
                              { label: "Recovered", value: "55%", tone: "bg-gold/90" },
                              { label: "Stable", value: "29%", tone: "bg-gold/55" },
                              { label: "Monitor", value: "16%", tone: "bg-gold/25" },
                            ].map((item) => (
                              <div
                                key={item.label}
                                className="flex items-center justify-between rounded-[0.95rem] border border-border/10 bg-[hsl(var(--surface-2))/0.38] px-3 py-2"
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className={`h-2.5 w-2.5 rounded-full ${item.tone}`} />
                                  <span className="text-sm text-muted-foreground">{item.label}</span>
                                </div>
                                <span className="text-xs font-medium text-foreground">{item.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-[1.25rem] border border-border/20 bg-[hsl(var(--surface-2))/0.5] p-4">
                      <p className="text-xs uppercase tracking-[0.24em] text-[hsl(var(--text-tertiary))]">Recovery notes</p>
                      <div className="mt-3 space-y-2">
                        {[
                          "Resting heart rate back to baseline",
                          "Upper body soreness minimal",
                          "Heavy work approved for today",
                        ].map((note) => (
                          <div
                            key={note}
                            className="rounded-[1rem] border border-border/20 bg-[hsl(var(--surface-2))/0.52] px-3 py-2 text-sm text-muted-foreground"
                          >
                            {note}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-[1.25rem] border border-border/20 bg-[hsl(var(--surface-2))/0.5] p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-xs uppercase tracking-[0.24em] text-[hsl(var(--text-tertiary))]">Coach clearance</p>
                        <span className="text-[10px] font-semibold text-gold">Approved</span>
                      </div>
                      <div className="space-y-2">
                        {[
                          "Heavy pressing cleared",
                          "Accessory volume unchanged",
                          "No fatigue flag for upper body",
                        ].map((item) => (
                          <div
                            key={item}
                            className="rounded-[1rem] border border-border/20 bg-[hsl(var(--surface-1))/0.8] px-3 py-2 text-sm text-muted-foreground"
                          >
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="absolute bottom-0 left-1/2 w-[99%] -translate-x-1/2 overflow-hidden rounded-[2.1rem] border border-border/55 bg-[hsl(var(--surface-1))] shadow-[0_24px_64px_rgba(0,0,0,0.22)] md:w-[84%]">
                  <div className="absolute inset-x-[8%] top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(184,147,66,0.18),transparent)]" />
                  <div className="absolute inset-x-[18%] -top-6 h-10 rounded-full bg-[rgba(184,147,66,0.05)] blur-2xl" />
                  <div className="flex items-center justify-between border-b border-border/20 px-5 py-4 md:px-7">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-gold/65" />
                      <span className="h-2.5 w-2.5 rounded-full bg-border/80" />
                      <span className="h-2.5 w-2.5 rounded-full bg-border/80" />
                    </div>
                    <span className="text-[11px] uppercase tracking-[0.22em] text-[hsl(var(--text-tertiary))]">
                      LiftOS Dashboard
                    </span>
                  </div>

                  <div className="grid gap-5 p-5 md:grid-cols-[1.18fr_0.82fr] md:p-7">
                    <div className="rounded-[1.55rem] border border-border/20 bg-[hsl(var(--surface-1))] p-5 md:p-6">
                      <div className="mb-5 flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs uppercase tracking-[0.24em] text-[hsl(var(--text-tertiary))]">Weekly overview</p>
                          <p className="mt-2 text-xl font-semibold tracking-tight text-foreground">Upper strength emphasis</p>
                        </div>
                        <span className="rounded-full bg-gold/10 px-3 py-1 text-[11px] font-semibold text-gold">Week 06</span>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-3">
                        {heroStats.map((item) => (
                          <div
                            key={item.label}
                            className="rounded-[1.25rem] border border-border/20 bg-[hsl(var(--surface-2))/0.58] p-4"
                          >
                            <p className="text-[11px] uppercase tracking-[0.22em] text-[hsl(var(--text-tertiary))]">
                              {item.label}
                            </p>
                            <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                              {item.value}
                            </p>
                            <p className="mt-2 text-sm text-muted-foreground">{item.detail}</p>
                          </div>
                        ))}
                      </div>

                      <div className="mt-5 rounded-[1.35rem] border border-border/20 bg-[hsl(var(--surface-2))/0.5] p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <span className="text-xs uppercase tracking-[0.24em] text-[hsl(var(--text-tertiary))]">Progression trend</span>
                          <span className="text-xs font-semibold text-gold">Stable</span>
                        </div>
                        <Sparkline />
                      </div>
                    </div>

                    <div className="grid gap-5">
                      <div className="rounded-[1.55rem] border border-border/20 bg-[hsl(var(--surface-1))] p-5">
                        <p className="text-xs uppercase tracking-[0.24em] text-[hsl(var(--text-tertiary))]">Session cues</p>
                        <div className="mt-4 space-y-3">
                          {[
                            "Tempo controlled on barbell work",
                            "Rest discipline between top sets",
                            "Keep upper back tension through lockout",
                          ].map((cue) => (
                            <div
                              key={cue}
                              className="rounded-[1rem] border border-border/20 bg-[hsl(var(--surface-2))/0.52] px-4 py-3 text-sm text-muted-foreground"
                            >
                              {cue}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-[1.55rem] border border-border/20 bg-[hsl(var(--surface-1))] p-5">
                        <div className="mb-3 flex items-center justify-between">
                          <div>
                            <p className="text-xs uppercase tracking-[0.24em] text-[hsl(var(--text-tertiary))]">Training block</p>
                            <p className="mt-2 text-lg font-semibold text-foreground">4 sessions aligned</p>
                          </div>
                          <span className="text-xs font-semibold text-gold">Ready</span>
                        </div>
                        <p className="text-sm leading-6 text-muted-foreground">
                          Programming, weekly load, and next-session execution live in one focused place.
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
      <section ref={metrics.ref} className="px-6 py-40 md:px-12 md:py-48">
        <div className="max-w-6xl mx-auto">
          <div
            className={`transition-all duration-700 ease-out ${
              metrics.visible
                ? "opacity-100 translate-y-0 blur-0"
                : "opacity-0 translate-y-6 blur-[4px]"
            }`}
          >
            <div className="grid gap-8 border-t border-border/30 pt-10 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:items-end md:gap-14 md:pt-14">
              <div className="max-w-2xl">
                <p className="label-xs mb-4">What the platform surfaces</p>
                <h2 className="max-w-xl text-[2.15rem] font-semibold leading-[1.04] tracking-tight md:text-[3rem]">
                  A cleaner view of what to do next.
                </h2>
              </div>
              <p className="max-w-md text-sm leading-7 text-muted-foreground md:justify-self-end md:text-base">
                Your week stays legible at a glance: workload, priorities, and the next session.
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
                  <span className="text-[2.75rem] font-semibold tracking-tight tabular-nums text-foreground md:text-[3.5rem]">
                    {item.metric}
                  </span>
                  <span className="text-sm text-muted-foreground">{item.unit}</span>
                </div>
                <p className="mb-3 text-sm font-medium tracking-[0.01em] text-foreground">{item.title}</p>
                <p className="max-w-[15rem] text-sm leading-7 text-muted-foreground">
                  {item.desc}
                </p>
                {i < 2 ? (
                  <div className="mt-8 hidden h-px w-full bg-border/30 sm:block" />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES (no cards) ── */}
      <section ref={features.ref} className="py-32 md:py-44 px-6 md:px-12">
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
              Train smarter,
              <br />
              not harder.
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
                <span className="text-gold mono text-sm pt-1 shrink-0">{f.num}</span>
                <div>
                  <p className="text-lg font-medium mb-2">{f.title}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
                    {f.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section ref={cta.ref} className="py-32 md:py-48 px-6 md:px-12">
        <div
          className={`max-w-6xl mx-auto text-center transition-all duration-700 ease-out ${
            cta.visible
              ? "opacity-100 translate-y-0 blur-0"
              : "opacity-0 translate-y-6 blur-[4px]"
          }`}
        >
          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight leading-[1.05] mb-6">
            Start lifting
            <br />
            with intention.
          </h2>
          <p className="text-muted-foreground text-sm md:text-base max-w-sm mx-auto mb-10 leading-relaxed">
            No account required. Open the dashboard and see what structured training looks like.
          </p>
          <Link
            to="/dashboard"
            className="group inline-flex items-center gap-3 bg-gold text-background px-8 py-4 rounded-full text-sm font-medium hover:opacity-90 transition-all duration-200 active:scale-[0.97]"
          >
            Open LiftOS
            <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="py-12 px-6 md:px-12 border-t border-border/30">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <span className="text-xs tracking-[0.15em] text-muted-foreground">LIFTOS</span>
          <span className="text-xs text-muted-foreground">
            © {new Date().getFullYear()}
          </span>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
