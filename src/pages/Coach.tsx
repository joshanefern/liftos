import { MessageCircle, Sparkles, Send, User, Bolt } from "lucide-react";

const promptChips = [
  "Build a 4-week strength split",
  "Prep the next session for power and recovery",
  "Set a high-impact goal for the week",
  "Flag technique focus areas",
];

const Coach = () => (
  <div className="min-h-screen p-6 md:p-10 lg:p-12 max-w-5xl">
    <div className="mb-10 animate-reveal-up">
      <p className="label-xs mb-2">Guidance</p>
      <h1 className="heading-lg">AI Coach</h1>
      <p className="max-w-2xl text-sm text-[hsl(var(--text-secondary))] leading-relaxed">
        Get tailored training cues, session planning, and actionable adjustments with a premium coaching experience
        built around real training strategy.
      </p>
    </div>

    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <section className="rounded-3xl surface-2 border border-border/20 p-6 md:p-8 shadow-sm">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="label-xs text-[hsl(var(--text-tertiary))] mb-2">Chat</p>
            <h2 className="text-xl font-semibold">Coach conversation</h2>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border/20 bg-background px-3 py-2 text-xs text-[hsl(var(--text-secondary))]">
            <Sparkles size={14} />
            Premium
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl bg-background p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[hsl(var(--surface-2))]">
                <User size={18} className="text-gold" />
              </div>
              <div>
                <p className="text-sm font-semibold">Coach</p>
                <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--text-secondary))]">
                  I’ll keep your plan practical and progress-focused. Ask for session pacing, form reminders,
                  or a smart microcycle recommendation.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-border/20 bg-[hsl(var(--surface))] p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(var(--surface-2))]">
              <MessageCircle size={20} className="text-gold" />
            </div>
            <p className="text-sm font-semibold text-foreground">No active conversation yet</p>
            <p className="mt-2 text-sm text-[hsl(var(--text-secondary))]">
              Start with a prompt below or ask your coach a question.
            </p>
          </div>
        </div>

        <div className="mt-8">
          <p className="label-xs mb-4 text-[hsl(var(--text-tertiary))]">Suggested prompts</p>
          <div className="flex flex-wrap gap-3">
            {promptChips.map((chip) => (
              <button
                key={chip}
                type="button"
                className="rounded-full border border-border/20 bg-[hsl(var(--surface-2))] px-4 py-2 text-sm text-[hsl(var(--text-secondary))] transition hover:border-gold hover:text-foreground"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 rounded-3xl border border-border/20 bg-background p-4 md:p-5">
          <label htmlFor="coach-input" className="text-xs font-medium uppercase tracking-[0.3em] text-[hsl(var(--text-tertiary))]">
            Ask your coach
          </label>
          <div className="flex items-center gap-3 rounded-2xl border border-border/20 bg-[hsl(var(--surface))] p-3">
            <input
              id="coach-input"
              placeholder="How should I structure tomorrow’s workout?"
              className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-[hsl(var(--text-tertiary))]"
            />
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-full bg-gold px-4 text-sm font-semibold text-[#101010] transition hover:brightness-110"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </section>

      <aside className="space-y-6">
        <div className="rounded-3xl surface-2 border border-border/20 p-6 md:p-7">
          <p className="label-xs mb-4 text-[hsl(var(--text-tertiary))]">How the coach helps</p>
          <ul className="space-y-4 text-sm text-[hsl(var(--text-secondary))]">
            <li className="rounded-2xl border border-border/20 bg-[hsl(var(--surface))] p-4">
              Plan sessions with a sensible blend of intensity and recovery.
            </li>
            <li className="rounded-2xl border border-border/20 bg-[hsl(var(--surface))] p-4">
              Keep goals realistic with guidance rooted in training design.
            </li>
            <li className="rounded-2xl border border-border/20 bg-[hsl(var(--surface))] p-4">
              Replace vague metrics with practical checkpoints and next steps.
            </li>
          </ul>
        </div>

        <div className="rounded-3xl surface-2 border border-border/20 p-6 md:p-7">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-[hsl(var(--surface-2))]">
              <Bolt size={20} className="text-gold" />
            </div>
            <div>
              <p className="text-sm font-semibold">Premium mindset</p>
              <p className="mt-2 text-sm text-[hsl(var(--text-secondary))] leading-relaxed">
                Guidance focused on performance quality, training structure, and real athlete habits.
              </p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </div>
);

export default Coach;
