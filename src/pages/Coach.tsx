import CoachMessage from "@/components/CoachMessage";
import { useCapturedSessions } from "@/context/CapturedSessionsProvider";
import { useUser } from "@/context/UserContext";
import { starterPrograms } from "@/data/starterPrograms";
import { useDayKey } from "@/hooks/useDayKey";
import { useWorkoutLogs } from "@/hooks/useWorkoutLogs";
import { useWorkoutTemplates } from "@/hooks/useWorkoutTemplates";
import { suggestNextWorkout } from "@/lib/suggestion";
import {
  buildCoachContext,
  CoachOfflineError,
  streamCoach,
  type ChatMessage,
  type CoachContext,
} from "@/lib/coach";
import type { Muscle } from "@/lib/muscleMap";
import {
  Activity,
  ArrowUp,
  BarChart3,
  CloudOff,
  Sparkles,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

const MUSCLE_LABELS: Partial<Record<Muscle, string>> = {
  "back-deltoids": "rear delts",
  "front-deltoids": "front delts",
  "upper-back": "upper back",
  "lower-back": "lower back",
  gluteal: "glutes",
  quadriceps: "quads",
  hamstring: "hamstrings",
  trapezius: "traps",
  abs: "abs",
};

const muscleLabel = (muscle: Muscle): string =>
  MUSCLE_LABELS[muscle] ?? muscle.replace(/-/g, " ");

/* Compact numeral for the context chip — "12.4k", never "12,400". */
const compactNum = (n: number): string =>
  n >= 10_000
    ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`
    : n.toLocaleString();

/** Data-aware suggestion chips generated from the live context. */
const buildSuggestions = (context: CoachContext): string[] => {
  const out: string[] = [];
  // The engine's pick leads — tapping it makes the coach argue for the same
  // workout the Dashboard CTA names.
  const pick = context.today_suggestion;
  if (pick && pick.kind !== "rest") {
    out.push(`Why ${pick.title} today?`);
  }
  const topLift = context.top_lifts[0];
  if (topLift) out.push(`Why did my ${topLift.name.toLowerCase()} stall?`);
  const behind = context.muscles_behind[0];
  if (behind) {
    out.push(`Plan a session to catch up on ${muscleLabel(behind.muscle)}`);
  }
  if (context.hr_sessions.some((s) => s.set_count > 0)) {
    out.push("How was my rest between sets last session?");
  }
  out.push("What should I train tomorrow?");
  if (out.length < 2) out.push("Build me a training week from my data");
  return out.slice(0, 2);
};

/** Honest empty state — shown instead of any fabricated reply. */
const OfflineNotice = () => (
  <div className="w-full rule-hairline pt-4 animate-fade-in">
    <div className="mb-2 flex items-center gap-2.5">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border">
        <CloudOff size={11} className="text-gold" />
      </div>
      <span className="eyebrow !text-[10px]">
        Coach offline
      </span>
    </div>
    <p className="text-sm leading-6 text-fg-soft">Coach isn't connected yet.</p>
    <p className="mt-1 text-xs leading-5 text-fg-muted">
      Deploy the <span className="mono text-gold">coach</span> Edge Function
      and set <span className="mono text-gold">ANTHROPIC_API_KEY</span> to
      bring it online.
    </p>
  </div>
);

const Coach = () => {
  const { profile } = useUser();
  const { logs } = useWorkoutLogs();
  const { templates } = useWorkoutTemplates();
  // Full rows for the newest HR-bearing sessions — the provider's list is
  // summary-only (no hr_samples), so the coach context reads these instead.
  const { hrDetailSessions } = useCapturedSessions();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [started, setStarted] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [offline, setOffline] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const units = profile?.units ?? "lb";

  // Same engine pick the Dashboard names — the coach must never contradict
  // the CTA the athlete just saw.
  const dayKey = useDayKey();
  const suggestion = useMemo(
    () => suggestNextWorkout({ logs, templates, starters: starterPrograms, profile }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [logs, templates, profile, dayKey],
  );

  const context = useMemo(
    () => buildCoachContext(logs, profile, hrDetailSessions, suggestion),
    [logs, profile, hrDetailSessions, suggestion],
  );

  const suggestions = useMemo(() => buildSuggestions(context), [context]);

  useEffect(() => {
    if (started) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, started, offline]);

  const sendPrompt = async (prompt: string) => {
    if (streaming) return;
    const history: ChatMessage[] = [...messages, { role: "user", content: prompt }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setStarted(true);
    setStreaming(true);
    setOffline(false);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      await streamCoach(history, context, (delta) => {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, content: last.content + delta };
          return next;
        });
      });
    } catch (err) {
      // Never fake a reply — drop the empty assistant bubble and show the
      // honest offline state. A partial reply (stream died mid-flight) stays.
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last.content.length === 0) {
          return prev.slice(0, -1);
        }
        return prev;
      });
      setOffline(true);
      if (!(err instanceof CoachOfflineError)) {
        console.error("coach stream failed", err);
      }
    } finally {
      setStreaming(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendPrompt(input.trim());
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
  };

  /* ── What the coach sees — collapsed to one quiet row of chips.
       w-0 + min-w-full zeroes the row's intrinsic width so long chips
       scroll inside the strip instead of stretching the page; `safe
       center` keeps it centered whenever it fits. ── */
  const contextStrip = (
    <div className="mb-3 flex justify-center">
      <div className="flex w-0 min-w-full flex-nowrap gap-2 overflow-x-auto [justify-content:safe_center]">
        <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border px-3 py-1.5 text-[11px] text-fg-soft">
          <BarChart3 size={11} className="text-gold" />
          <span className="mono">{context.week_stats.sessions}</span>
          <span className="text-fg-muted">
            session{context.week_stats.sessions === 1 ? "" : "s"} ·
          </span>
          <span className="mono">{compactNum(context.week_stats.total_volume)}</span>
          <span className="text-fg-muted">
            {units}
            <span className="hidden md:inline"> this week</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border px-3 py-1.5 text-[11px] text-fg-soft">
          <Activity size={11} className="text-gold" />
          {context.muscles_behind.length > 0 ? (
            <>
              <span className="mono">{context.muscles_behind.length}</span>
              <span className="text-fg-muted">
                muscle{context.muscles_behind.length === 1 ? "" : "s"} behind
              </span>
            </>
          ) : (
            <span className="text-fg-muted">all muscles current</span>
          )}
        </span>
      </div>
    </div>
  );

  const composer = (placeholder: string, rows = 1) => (
    <form
      onSubmit={onSubmit}
      className="rounded-[14px] border border-border bg-card px-4 pt-3 pb-2.5 transition-colors focus-within:border-primary/50"
    >
      <textarea
        ref={textareaRef}
        value={input}
        onChange={handleInput}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (input.trim() && !streaming) sendPrompt(input.trim());
          }
        }}
        rows={rows}
        placeholder={placeholder}
        className="max-h-[200px] w-full resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-fg-faint"
      />
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles size={13} className="text-gold" />
          <span className="text-[11px] tracking-wide text-fg-muted">
            LiftOS Coach
          </span>
        </div>
        <button
          type="submit"
          disabled={!input.trim() || streaming}
          aria-label="Send"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ArrowUp size={15} strokeWidth={2.5} />
        </button>
      </div>
    </form>
  );

  return (
    <div className="flex h-[calc(100dvh-4rem-var(--safe-bottom))] flex-col md:h-[100dvh]">
      {/* ── Initial landing state ── */}
      {!started && (
        <div className="flex flex-1 flex-col items-center justify-start px-6 pt-10 md:justify-center md:px-10 md:pt-0">
          <div className="mx-auto w-full max-w-2xl">
            <div className="mb-6 text-center animate-reveal-up md:mb-9">
              <p className="eyebrow mb-3">AI Coach</p>
              <h1 className="text-4xl font-extralight tracking-[-0.04em] text-fg md:text-5xl">
                What shall we train?
              </h1>
            </div>

            {contextStrip}

            {composer("Ask about your training — grounded in your real numbers", 2)}

            {/* Data-aware suggestion chips */}
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {suggestions.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={streaming}
                  onClick={() => sendPrompt(prompt)}
                  className="min-h-11 rounded-full border border-border px-4 py-2 text-xs text-fg-muted transition hover:border-primary/50 hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Active chat state ── */}
      {started && (
        <>
          <div className="flex-1 overflow-y-auto py-6 md:py-10">
            <div className="mx-auto w-full max-w-4xl space-y-6 px-6 md:space-y-8 md:px-10 lg:px-12">
              {messages.map((message, index) => (
                <CoachMessage
                  key={index}
                  role={message.role}
                  content={message.content}
                  streaming={
                    streaming &&
                    index === messages.length - 1 &&
                    message.role === "assistant"
                  }
                />
              ))}
              {offline && <OfflineNotice />}
              <div ref={bottomRef} />
            </div>
          </div>

          <div className="shrink-0 px-6 pb-3 pt-2 md:px-10 md:pb-6 lg:px-12">
            <div className="mx-auto w-full max-w-4xl">
              {/* Context chips stay on desktop; on phones the chat itself
                  owns the viewport and the strip returns on the landing state. */}
              <div className="hidden md:block">{contextStrip}</div>
              {composer("Message LiftOS Coach...")}
              <p className="mt-2 text-center text-[11px] text-fg-faint">
                LiftOS Coach can make mistakes. Verify important training
                decisions.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Coach;
