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

/* ───────── Nav ───────── */
const LandingNav = () => (
  <nav className="fixed top-0 inset-x-0 z-50 px-6 md:px-12">
    <div className="max-w-6xl mx-auto h-16 flex items-center justify-between">
      <span className="text-sm font-semibold tracking-[0.2em] text-foreground">
        LIFTOS
      </span>
      <Link
        to="/dashboard"
        className="text-xs tracking-wider text-muted-foreground hover:text-foreground transition-colors duration-200"
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
        className="min-h-screen flex flex-col justify-center px-6 md:px-12"
      >
        <div className="max-w-6xl mx-auto w-full">
          <div
            className={`transition-all duration-700 ease-out ${
              hero.visible
                ? "opacity-100 translate-y-0 blur-0"
                : "opacity-0 translate-y-6 blur-[4px]"
            }`}
          >
            <p className="label-xs text-gold mb-8">Performance Training OS</p>

            <h1 className="text-5xl sm:text-7xl md:text-[5.5rem] font-semibold tracking-[-0.04em] leading-[0.92] mb-8 max-w-4xl">
              BE STRONGER
              <br />
              EVERY DAY.
            </h1>

            <p className="text-muted-foreground text-base md:text-lg max-w-md mb-12 leading-relaxed">
              Track strain, plan recovery, and train with precision.
              <br className="hidden md:block" />
              No noise — just progress.
            </p>

            <div className="flex items-center gap-6">
              <Link
                to="/dashboard"
                className="group inline-flex items-center gap-3 bg-gold text-background px-7 py-3.5 rounded-full text-sm font-medium hover:opacity-90 transition-all duration-200 active:scale-[0.97]"
              >
                Open Dashboard
                <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
              <span className="text-xs text-muted-foreground tracking-wide">
                Free to use
              </span>
            </div>
          </div>

          {/* Subtle UI preview element */}
          <div
            className={`mt-24 md:mt-32 transition-all duration-1000 delay-300 ease-out ${
              hero.visible
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-8"
            }`}
          >
            <div className="surface-2 rounded-2xl p-6 md:p-8 max-w-xl border border-border/30">
              <div className="flex items-baseline justify-between mb-4">
                <span className="label-xs">Weekly Strain</span>
                <span className="text-gold text-xs font-medium mono">+12.4%</span>
              </div>
              <Sparkline />
              <div className="flex gap-8 mt-5">
                {[
                  { label: "Avg strain", value: "7.2" },
                  { label: "Sessions", value: "5" },
                  { label: "Recovery", value: "84%" },
                ].map((s) => (
                  <div key={s.label}>
                    <p className="text-lg font-medium tabular-nums">{s.value}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── METRICS ── */}
      <section ref={metrics.ref} className="py-32 md:py-44 px-6 md:px-12">
        <div className="max-w-6xl mx-auto">
          <div
            className={`transition-all duration-700 ease-out ${
              metrics.visible
                ? "opacity-100 translate-y-0 blur-0"
                : "opacity-0 translate-y-6 blur-[4px]"
            }`}
          >
            <p className="label-xs mb-16">What you measure</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-16 md:gap-24">
            {[
              {
                metric: "8.4",
                unit: "/ 10",
                title: "Strain Score",
                desc: "Cumulative cardiovascular load measured across every session.",
              },
              {
                metric: "247",
                unit: "min",
                title: "Weekly Volume",
                desc: "Total training duration tracked with precision, not guesswork.",
              },
              {
                metric: "91",
                unit: "%",
                title: "Recovery Index",
                desc: "Sleep, HRV, and readiness distilled into a single metric.",
              },
            ].map((item, i) => (
              <div
                key={item.title}
                className={`transition-all duration-700 ease-out ${
                  metrics.visible
                    ? "opacity-100 translate-y-0 blur-0"
                    : "opacity-0 translate-y-6 blur-[4px]"
                }`}
                style={{ transitionDelay: `${i * 100 + 150}ms` }}
              >
                <div className="flex items-baseline gap-1.5 mb-4">
                  <span className="text-4xl md:text-5xl font-semibold tracking-tight tabular-nums">
                    {item.metric}
                  </span>
                  <span className="text-sm text-muted-foreground">{item.unit}</span>
                </div>
                <p className="text-sm font-medium mb-2">{item.title}</p>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
                  {item.desc}
                </p>
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
