import { FitnessBackground } from "@/components/FitnessBackground";
import { Mic, Sparkles, Target } from "lucide-react";
import { Link } from "react-router-dom";

/* ── The reason to join, in one line and three beats. Shown on the
   account screens (sign in / create account) where a stranger decides;
   every other screen here is already a task and opts out. ── */
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

/** What surrounds the card.
    - "pitch": the benefit line and three-beat preview — sign in and create
      account, where a stranger is still deciding.
    - "onboarding": no pitch on phones, the product summary beside the card
      on desktop, and a card that holds one size for the whole flow.
    - "minimal": the card alone, on every screen size — password recovery,
      where the person came to do one thing. */
export type AuthVariant = "pitch" | "onboarding" | "minimal";

/* On a screen tall enough to hold it, the onboarding card never grows past
   the space the page gives it: the page does not scroll and the card's own
   options region gives way instead. The subtracted rems are this layout's
   fixed chrome: the 4rem top bar, the 1.5rem bottom padding, and main's
   vertical padding (2rem on phones, 5rem at lg).

   The cap only exists from the height where it costs part of one option at
   most (40rem on phones, 44rem at lg, where the chrome is taller). Shorter
   than that — a phone on its side, a short browser window — it would
   squeeze the options into a slit or cut them off between two rows with
   nothing to say more exist, so the card keeps its full height there and
   the page scrolls. */
const ONBOARDING_CARD =
  "flex flex-col max-lg:[@media(min-height:40rem)]:max-h-[calc(100dvh-var(--safe-top)-7.5rem)] lg:[@media(min-height:44rem)]:max-h-[calc(100dvh-var(--safe-top)-10.5rem)]";

const AuthLayout = ({
  eyebrow,
  title,
  children,
  variant = "pitch",
}: {
  /** Desktop side column only; the minimal variant has no side column. */
  eyebrow?: string;
  title?: string;
  children: React.ReactNode;
  variant?: AuthVariant;
}) => {
  const sideColumn = variant !== "minimal";
  return (
    <div className="relative min-h-screen bg-background overflow-x-hidden" style={{ isolation: "isolate", zIndex: 0 }}>
      <FitnessBackground />

      <nav className="fixed top-0 inset-x-0 z-50 px-8 pt-safe md:px-14">
        <div className="flex h-16 items-center">
          <Link to="/" className="text-[12px] font-semibold tracking-[0.28em] text-foreground">
            LIFT<span className="text-primary">OS</span>
          </Link>
        </div>
      </nav>

      <div
        className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-6 pb-6"
        style={{ paddingTop: "calc(4rem + var(--safe-top))" }}
      >
        <main
          className={`grid flex-1 items-center gap-8 py-4 lg:py-10 ${
            sideColumn ? "lg:grid-cols-[0.9fr_1.1fr] lg:gap-10" : ""
          }`}
        >
          {sideColumn && (
            <section className="hidden lg:block">
              <p className="label-xs mb-4">{eyebrow}</p>
              <h1 className="max-w-xl text-5xl font-semibold tracking-tight leading-[1.05]">{title}</h1>
              {variant === "pitch" ? (
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
          )}

          <div className="mx-auto w-full max-w-md">
            {/* Phones: the preview sits under the logo, above the form card —
                the pitch before the ask. Hidden at lg where the left column
                carries it. */}
            {variant === "pitch" && (
              <div className="mb-5 lg:hidden">
                <ProductPreview compact />
              </div>
            )}
            <section
              className={`relative w-full rounded-[14px] border border-border bg-card p-5 md:p-8 ${
                variant === "onboarding" ? ONBOARDING_CARD : ""
              }`}
            >
              {children}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
};

export default AuthLayout;
