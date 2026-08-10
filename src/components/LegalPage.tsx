import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { FitnessBackground } from "@/components/FitnessBackground";

export type LegalSection = {
  title: string;
  body: ReactNode;
};

type LegalPageProps = {
  eyebrow: string;
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
  crossLink: { to: string; label: string };
};

/* Shared scaffold for the legal pages (Privacy / Terms). Standalone route —
   no AppShell — matching the Landing/Auth aesthetic: champagne canvas,
   terracotta accents, eyebrow header, hairline-divided prose sections. */
const LegalPage = ({ eyebrow, title, updated, intro, sections, crossLink }: LegalPageProps) => (
  <div
    className="relative min-h-screen overflow-x-hidden bg-background text-foreground"
    style={{ isolation: "isolate", zIndex: 0 }}
  >
    <FitnessBackground />

    <nav className="fixed top-0 inset-x-0 z-50 border-b border-border bg-background/85 backdrop-blur-md px-8 md:px-14">
      <div className="flex h-16 items-center justify-between">
        <Link to="/" className="text-[12px] font-semibold tracking-[0.28em] text-foreground">
          LIFT<span className="text-gold">OS</span>
        </Link>
        <Link
          to="/"
          className="relative inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-[11px] tracking-[0.12em] text-fg transition-colors duration-200 before:absolute before:-inset-2 before:content-[''] hover:border-primary"
        >
          <ArrowLeft size={11} />
          Home
        </Link>
      </div>
    </nav>

    <main className="relative mx-auto max-w-3xl px-6 pt-28 pb-16 md:px-8 md:pt-36 md:pb-20">
      <header className="animate-fade-in">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight leading-[1.05] md:text-5xl">
          {title}
        </h1>
        <p className="mono mt-4 text-xs text-fg-muted">Last updated {updated}</p>
        <p className="mt-5 max-w-xl text-sm leading-6 text-fg-soft">{intro}</p>
      </header>

      <div className="mt-10 rule-heavy divide-y divide-border border-b border-border md:mt-12">
        {sections.map((section, i) => (
          <section key={section.title} className="grid gap-2 py-6 md:grid-cols-[7rem_1fr] md:gap-10 md:py-8">
            <div>
              <p className="mono text-xl font-semibold tabular-nums text-gold">
                {String(i + 1).padStart(2, "0")}
              </p>
            </div>
            <div>
              <h2 className="text-lg font-medium text-fg">{section.title}</h2>
              <div className="mt-2 space-y-2.5 text-sm leading-6 text-fg-soft md:mt-3">{section.body}</div>
            </div>
          </section>
        ))}
      </div>

      <footer className="mt-10 flex items-center justify-between">
        <span className="text-xs font-semibold tracking-[0.2em] text-fg-muted">LIFTOS</span>
        <div className="flex items-center gap-6">
          <Link
            to={crossLink.to}
            className="inline-flex min-h-11 items-center text-xs text-fg-muted transition-colors duration-200 hover:text-gold"
          >
            {crossLink.label}
          </Link>
          <span className="mono text-xs text-fg-faint">© {new Date().getFullYear()}</span>
        </div>
      </footer>
    </main>
  </div>
);

export default LegalPage;
