import { FitnessBackground } from "@/components/FitnessBackground";
import { Link } from "react-router-dom";

const AuthLayout = ({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) => (
  <div className="relative min-h-screen bg-background overflow-x-hidden" style={{ isolation: "isolate", zIndex: 0 }}>
    <FitnessBackground />

    <nav className="fixed top-0 inset-x-0 z-50 px-8 pt-safe md:px-14">
      <div className="flex h-16 items-center">
        <Link to="/" className="text-[12px] font-semibold tracking-[0.28em] text-foreground">
          LIFT<span className="text-gold">OS</span>
        </Link>
      </div>
    </nav>

    <div
      className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-6 pb-6"
      style={{ paddingTop: "calc(4rem + var(--safe-top))" }}
    >
      <main className="grid flex-1 items-center gap-8 py-4 lg:grid-cols-[0.9fr_1.1fr] lg:gap-10 lg:py-10">
        <section className="hidden lg:block">
          <p className="label-xs mb-4">{eyebrow}</p>
          <h1 className="max-w-xl text-5xl font-semibold tracking-tight leading-[1.05]">{title}</h1>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-fg-soft">
            Premium workout logging, progress tracking, and coaching guidance for serious lifters.
          </p>
          <div className="mt-8 grid max-w-md grid-cols-2 gap-3">
            {["Fast logging", "Charted progress", "AI coaching", "Synced across devices"].map((item) => (
              <div key={item} className="rounded-[14px] border border-border bg-card p-4 text-sm text-fg-soft">
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="relative mx-auto w-full max-w-md rounded-[14px] border border-border bg-card p-5 md:p-8">
          {children}
        </section>
      </main>
    </div>
  </div>
);

export default AuthLayout;
