import { Link } from "react-router-dom";

const AuthLayout = ({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) => (
  <div className="min-h-screen bg-background px-6 py-8">
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col">
      <header className="flex items-center justify-between">
        <Link to="/" className="text-lg font-semibold tracking-tight">
          Lift<span className="text-gold">OS</span>
        </Link>
        <Link to="/dashboard" className="text-sm text-[hsl(var(--text-secondary))] transition hover:text-gold">
          Demo app
        </Link>
      </header>

      <main className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="hidden lg:block">
          <p className="label-xs mb-4">{eyebrow}</p>
          <h1 className="max-w-xl text-5xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-[hsl(var(--text-secondary))]">
            Premium workout logging, progress tracking, and coaching guidance for serious lifters. This flow is UI-only
            and uses temporary front-end state.
          </p>
          <div className="mt-8 grid max-w-md grid-cols-2 gap-3">
            {["Fast logging", "Charted progress", "Coaching context", "Mock auth"].map((item) => (
              <div key={item} className="rounded-lg surface-2 border border-border/20 p-4 text-sm text-[hsl(var(--text-secondary))]">
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-md rounded-xl surface-2 border border-border/20 p-6 md:p-8 glow-gold">
          {children}
        </section>
      </main>
    </div>
  </div>
);

export default AuthLayout;
