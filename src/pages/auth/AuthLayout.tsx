import { FitnessBackground } from "@/components/FitnessBackground";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

const AuthLayout = ({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) => (
  <div className="relative min-h-screen bg-[#0a0c15] overflow-x-hidden" style={{ isolation: "isolate", zIndex: 0 }}>
    <FitnessBackground />
    <div className="landing-hero-radiance pointer-events-none absolute inset-x-0 top-0 h-[42rem]" />

    <nav className="fixed top-0 inset-x-0 z-50 px-8 md:px-14">
      <div className="flex h-16 items-center justify-between">
        <Link to="/" className="text-[12px] font-semibold tracking-[0.28em] text-foreground">
          LIFT<span className="text-gold">OS</span>
        </Link>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-1.5 text-[11px] tracking-[0.12em] text-foreground/70 transition-all duration-200 hover:border-gold/25 hover:bg-gold/[0.08] hover:text-foreground"
        >
          Demo app
          <ArrowRight size={11} />
        </Link>
      </div>
    </nav>

    <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-6 pt-16 pb-8">
      <main className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="hidden lg:block">
          <p className="label-xs mb-4">{eyebrow}</p>
          <h1 className="max-w-xl text-5xl font-semibold tracking-tight leading-[1.05]">{title}</h1>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-foreground/50">
            Premium workout logging, progress tracking, and coaching guidance for serious lifters.
          </p>
          <div className="mt-8 grid max-w-md grid-cols-2 gap-3">
            {["Fast logging", "Charted progress", "Coaching context", "Real auth"].map((item) => (
              <div key={item} className="rounded-[1rem] bg-white/[0.04] border border-white/10 p-4 text-sm text-foreground/50">
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="relative mx-auto w-full max-w-md overflow-hidden rounded-[1.5rem] bg-white/[0.04] border border-white/10 p-6 md:p-8 glow-gold">
          <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(184,147,66,0.22),transparent)]" />
          {children}
        </section>
      </main>
    </div>
  </div>
);

export default AuthLayout;
