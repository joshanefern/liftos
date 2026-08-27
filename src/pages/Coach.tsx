import CoachMessage from "@/components/CoachMessage";
import { useCapturedSessions } from "@/context/CapturedSessionsProvider";
import { useUser } from "@/context/UserContext";
import { starterPrograms } from "@/data/starterPrograms";
import { useDayKey } from "@/hooks/useDayKey";
import { useReadiness } from "@/hooks/useReadiness";
import { useWorkoutLogs } from "@/hooks/useWorkoutLogs";
import { useWorkoutTemplates } from "@/hooks/useWorkoutTemplates";
import { suggestNextWorkout } from "@/lib/suggestion";
import {
  buildCoachContext,
  COACH_TONES,
  CoachOfflineError,
  getCoachTone,
  setCoachTone,
  streamCoach,
  type ChatMessage,
  type CoachContext,
  type CoachTone,
} from "@/lib/coach";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Muscle } from "@/lib/muscleMap";
import {
  Activity,
  ArrowUp,
  BarChart3,
  Check,
  ChevronDown,
  CloudOff,
  History,
  Sparkles,
  SquarePen,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteConversation,
  listConversations,
  newConversationId,
  relativeStamp,
  saveConversation,
  type CoachConversation,
} from "@/lib/coachStore";

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

/** Honest failure state — user-facing, with a retry. The deploy hint is
    developer noise and only renders in dev builds. */
const OfflineNotice = ({ onRetry }: { onRetry?: () => void }) => (
  <div className="w-full rule-hairline pt-4 animate-fade-in">
    <div className="mb-2 flex items-center gap-2.5">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border">
        <CloudOff size={11} className="text-gold" />
      </div>
      <span className="eyebrow !text-[10px]">
        Coach unavailable
      </span>
    </div>
    <p className="text-sm leading-6 text-fg-soft">
      The coach couldn't respond just now — check your connection and try
      again.
    </p>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="mt-2.5 inline-flex min-h-11 items-center rounded-full border border-border px-4 text-[12.5px] font-semibold text-fg transition hover:border-primary/40 active:scale-[0.98]"
      >
        Try again
      </button>
    )}
    {import.meta.env.DEV && (
      <p className="mt-2 text-xs leading-5 text-fg-muted">
        Dev: deploy the <span className="mono text-gold">coach</span> Edge
        Function and set <span className="mono text-gold">ANTHROPIC_API_KEY</span>.
      </p>
    )}
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
  // ChatGPT/Claude organization: every chat is a resumable conversation.
  const [conversationId, setConversationId] = useState<string>(newConversationId);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Mirrors the persisted preference so the header pill re-renders on change.
  const [tone, setTone] = useState<CoachTone>(() => getCoachTone());
  const [history, setHistory] = useState<CoachConversation[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Persist after every settled exchange (never mid-stream).
  useEffect(() => {
    if (!streaming && messages.length > 0) {
      saveConversation(conversationId, messages);
    }
  }, [messages, streaming, conversationId]);

  const openHistory = (): void => {
    setHistory(listConversations());
    setHistoryOpen(true);
  };

  const startNewChat = (): void => {
    if (streaming) return;
    setMessages([]);
    setStarted(false);
    setOffline(false);
    setConversationId(newConversationId());
    setHistoryOpen(false);
  };

  const resumeConversation = (conversation: CoachConversation): void => {
    if (streaming) return;
    setMessages(conversation.messages);
    setConversationId(conversation.id);
    setStarted(true);
    setOffline(false);
    setHistoryOpen(false);
  };

  const units = profile?.units ?? "lb";

  // Same engine pick the Dashboard names — the coach must never contradict
  // the CTA the athlete just saw.
  const dayKey = useDayKey();
  const suggestion = useMemo(
    () => suggestNextWorkout({ logs, templates, starters: starterPrograms, profile }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [logs, templates, profile, dayKey],
  );

  const readiness = useReadiness();
  const context = useMemo(
    () => buildCoachContext(logs, profile, hrDetailSessions, suggestion, readiness),
    [logs, profile, hrDetailSessions, suggestion, readiness],
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
      const full = await streamCoach(history, context, (delta) => {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, content: last.content + delta };
          return next;
        });
      });
      // A clean stream with zero tokens (safety refusal) would otherwise
      // leave a permanent blank reply — drop the bubble and say so.
      if (full.trim().length === 0) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          const trimmed =
            last?.role === "assistant" && last.content.length === 0
              ? prev.slice(0, -1)
              : prev;
          return [
            ...trimmed,
            {
              role: "assistant",
              content:
                "I can't help with that one — ask me about your training and I'm all in.",
            },
          ];
        });
      }
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
          ) : context.week_stats.sessions === 0 && context.top_lifts.length === 0 ? (
            <span className="text-fg-muted">no training data yet</span>
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
        className="max-h-[200px] w-full resize-none bg-transparent text-sm leading-6 outline-none "
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
          className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-[opacity,transform] duration-150 after:absolute after:-inset-1.5 after:content-[''] hover:opacity-90 active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ArrowUp size={15} strokeWidth={2.5} />
        </button>
      </div>
    </form>
  );

  return (
    // Height must clear the tab bar AND the status-bar inset (AppShell's
    // pt-safe shifts us down by --safe-top on device).
    <div className="flex h-[calc(100dvh-4rem-var(--safe-bottom)-var(--safe-top))] flex-col md:h-[100dvh]">
      {/* ── Header bar — title left, history + new chat right (the
          ChatGPT/Claude chrome, sized for thumbs) ── */}
      <header className="flex shrink-0 items-center justify-between px-5 pt-3 pb-2 md:px-10 md:pt-6 lg:px-12">
        <p className="eyebrow !text-fg">Coach</p>
        <div className="flex items-center gap-1">
          {/* Tone picker — same coach, different voice. Applies from the
              next message; stored per device. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Coach tone"
                className="relative mr-1 flex h-9 items-center gap-1 rounded-full border border-border px-3 text-[12px] font-semibold text-fg-soft transition hover:border-fg-soft hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                {COACH_TONES.find((t) => t.value === tone)?.label}
                <ChevronDown size={12} className="text-fg-muted" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-[14px] border-border bg-card p-1.5">
              {COACH_TONES.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => {
                    setCoachTone(option.value);
                    setTone(option.value);
                  }}
                  className="flex items-start gap-2.5 rounded-[10px] px-2.5 py-2"
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center pt-0.5">
                    {tone === option.value && <Check size={13} className="text-fg" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-fg">{option.label}</span>
                    <span className="block text-[11.5px] leading-4 text-fg-muted">{option.blurb}</span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            onClick={openHistory}
            aria-label="Chat history"
            className="relative flex h-9 w-9 items-center justify-center rounded-full text-fg-muted transition after:absolute after:-inset-1 after:content-[''] hover:bg-secondary hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <History size={17} />
          </button>
          <button
            type="button"
            onClick={startNewChat}
            aria-label="New chat"
            className="relative flex h-9 w-9 items-center justify-center rounded-full text-fg-muted transition after:absolute after:-inset-1 after:content-[''] hover:bg-secondary hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <SquarePen size={17} />
          </button>
        </div>
      </header>

      {/* ── Body: greeting when empty, thread once started ── */}
      {!started ? (
        <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 md:px-10">
          <div className="w-full max-w-2xl text-center animate-reveal-up">
            <p className="eyebrow mb-3">AI Coach</p>
            <h1 className="text-4xl font-extralight tracking-[-0.04em] text-fg md:text-5xl">
              What shall we train?
            </h1>
            <div className="mt-6">{contextStrip}</div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto py-5 md:py-8">
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
            {offline && (
              <OfflineNotice
                onRetry={() => {
                  const last = [...messages].reverse().find((m) => m.role === "user");
                  if (last && !streaming) sendPrompt(last.content);
                }}
              />
            )}
            <div ref={bottomRef} />
          </div>
        </div>
      )}

      {/* ── Bottom dock — chips (fresh chat) + composer, always pinned ── */}
      <div className="shrink-0 px-6 pb-3 pt-2 md:px-10 md:pb-6 lg:px-12">
        <div className="mx-auto w-full max-w-4xl">
          {!started && (
            <div className="mb-3 flex flex-wrap justify-center gap-2">
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
          )}
          {composer(
            started ? "Message LiftOS Coach..." : "Ask about your training — grounded in your real numbers",
          )}
          {started && (
            <p className="mt-2 text-center text-[11px] text-fg-faint">
              LiftOS Coach can make mistakes. Verify important training
              decisions.
            </p>
          )}
        </div>
      </div>

      {/* ── History sheet ── */}
      {historyOpen && (
        <div className="fixed inset-0 z-50 flex" role="dialog" aria-label="Chat history">
          <button
            type="button"
            aria-label="Close history"
            onClick={() => setHistoryOpen(false)}
            className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px]"
          />
          <div className="relative ml-auto flex h-full w-[86%] max-w-sm flex-col bg-background pt-safe shadow-[-8px_0_32px_rgba(0,0,0,0.25)] animate-fade-in">
            <div className="flex items-center justify-between px-5 py-4">
              <p className="eyebrow !text-fg">Chats</p>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                aria-label="Close"
                className="relative flex h-9 w-9 items-center justify-center rounded-full text-fg-muted transition after:absolute after:-inset-1 after:content-[''] hover:bg-secondary hover:text-fg"
              >
                <X size={17} />
              </button>
            </div>
            <button
              type="button"
              onClick={startNewChat}
              className="mx-5 mb-2 flex min-h-11 items-center gap-2.5 rounded-[12px] border border-border px-4 text-sm font-semibold text-fg transition hover:border-primary/40 active:scale-[0.99]"
            >
              <SquarePen size={15} className="text-gold" />
              New chat
            </button>
            <div className="flex-1 overflow-y-auto px-5 pb-6">
              {history.length === 0 ? (
                <p className="caption mt-6 text-center">No past chats yet.</p>
              ) : (
                <div className="divide-y divide-border">
                  {history.map((conversation) => (
                    <div key={conversation.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => resumeConversation(conversation)}
                        className="min-w-0 flex-1 py-3 text-left transition hover:opacity-80"
                      >
                        <p className="truncate text-sm font-medium text-fg">
                          {conversation.title}
                        </p>
                        <p className="caption mt-0.5">
                          {relativeStamp(conversation.updatedAt)}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          deleteConversation(conversation.id);
                          setHistory(listConversations());
                        }}
                        aria-label={`Delete chat: ${conversation.title}`}
                        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-fg-muted transition after:absolute after:-inset-1 after:content-[''] hover:text-destructive"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Coach;
