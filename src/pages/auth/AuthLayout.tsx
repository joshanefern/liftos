import { FitnessBackground } from "@/components/FitnessBackground";
import { Mic, Sparkles, Target } from "lucide-react";
import { Link } from "react-router-dom";

/* ── The reason to join, in one line and three beats. Shown on the
   account screens (sign in / create account) where a stranger decides;
   the onboarding flow opts out because it's already a task. ── */
const BENEFIT = "Log your workout by voice. Know what to aim for next time.";

const PREVIEW = [
  { icon: Mic, text: "Say your sets out loud — they're logged." },
  { icon: Target, text: "See the number to beat next time." },
  { icon: Sparkles, text: "A week of workouts built around your goal." },
] as const;

const ProductPreview = ({ compact = false }: { compact?: boolean }) => (
  <div>
    <p
      className={
        compact
          ? "text-[15px] font-semibold leading-snug tracking-tight text-fg"
          : "max-w-md text-base leading-relaxed text-fg-soft"
      }
    >
      {BENEFIT}
    </p>
    <ul className={compact ? "mt-3 space-y-2" : "mt-6 max-w-md space-y-3"}>
      {PREVIEW.map(({ icon: Icon, text }) => (
        <li
          key={text}
          className={`flex items-center gap-2.5 ${compact ? "text-[13px] leading-5" : "text-sm leading-6"} text-fg-soft`}
        >
          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
          >
            <Icon size={14} />
          </span>
          {text}
        </li>
      ))}
    </ul>
  </div>
);

const AuthLayout = ({
  eyebrow,
  title,
  children,
  preview = true,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  /** The benefit line + three-beat product preview. On by default for the
      account screens; onboarding passes false. */
  preview?: boolean;
}) => (
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
          {preview ? (
            <div className="mt-6">
              <ProductPreview />
            </div>
          ) : (
            <>
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
            </>
          )}
        </section>

        <div className="mx-auto w-full max-w-md">
          {/* Phones: the preview sits under the logo, above the form card —
              the pitch before the ask. Hidden at lg where the left column
              carries it. */}
          {preview && (
            <div className="mb-5 lg:hidden">
              <ProductPreview compact />
            </div>
          )}
          <section className="relative w-full rounded-[14px] border border-border bg-card p-5 md:p-8">
            {children}
          </section>
        </div>
      </main>
    </div>
  </div>
);

export default AuthLayout;
