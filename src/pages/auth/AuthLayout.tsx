import { FitnessBackground } from "@/components/FitnessBackground";
import { Link } from "react-router-dom";

const AuthLayout = ({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) => (
  <div className="relative min-h-screen bg-[#0a0c15] px-6 py-8 overflow-x-hidden">
    <FitnessBackground />
    <div className="pointer-events-none absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(circle_at_50%_14%,rgba(184,147,66,0.09),transparent_64%)]" />

    <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col">
      <header className="flex items-center justify-between">
        <Link to="/" className="text-[12px] font-medium tracking-[0.22em] text-foreground/88">
          LIFT<span className="text-gold">OS</span>
        </Link>
        <Link to="/dashboard" className="text-[11px] tracking-[0.2em] text-foreground/40 transition hover:text-foreground">
          Demo app →
        </Link>
      </header>

      <main className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="hidden lg:block">
          <p className="label-xs mb-4">{eyebrow}</p>
          <h1 className="max-w-xl text-5xl font-semibold tracking-tight leading-[1.05]">{title}</h1>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-foreground/50">
            Premium workout logging, progress tracking, and coaching guidance for serious lifters. This auth flow is
            now wired for real account creation and sign-in.
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
