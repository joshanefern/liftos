import { useEffect, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import type { PluginListenerHandle } from "@capacitor/core";
import { Check, CircleHelp, Loader2, Mic, MicOff, Pencil, Undo2 } from "lucide-react";
import {
  cancelListening,
  ensureSpeechPermissions,
  onSpeechError,
  onSpeechPartial,
  speechSupported,
  startListening,
  stopListening,
  voiceDiag,
} from "@/lib/speech";
import { interpretUtterance } from "@/lib/voice";
import { chooseTranscript, longerOf } from "@/lib/voiceTranscript";
import { tapHaptic, successHaptic } from "@/lib/haptics";
import {
  applyVoiceIntent,
  type VoiceApplyResult,
  type VoiceLoggedExercise,
} from "@/lib/voiceApply";
import { cn } from "@/lib/utils";

/* ── Tap-to-speak voice logging.
   Tap the pill → live transcript streams into the receipt card. A pause
   after speech (or a second tap) → interpret → apply → "Logged" card with
   Edit + Undo (8s). Hearing nothing, or the recognizer dying mid-listen,
   always ends in a visible card — never a silent vanish. All row mutations
   run through lib/voiceApply — the model never touches state directly.

   The pill renders INLINE (the logger seats it in its session toolbar);
   only the receipt card is portalled, fixed above that toolbar. ── */

type Props = {
  exercises: VoiceLoggedExercise[];
  units: string;
  onApply: (result: VoiceApplyResult) => void;
  onUndo: () => void;
  /** "Edit" on the receipt: the card closes and the logger jumps to the
      first row the apply touched. */
  onEdit?: (result: VoiceApplyResult) => void;
  /** The rest bar is up in the slot above the toolbar — lift the card over it. */
  raised?: boolean;
  /** Set ids the lifter completed most recently, MOST RECENT FIRST, by any
      path — "that was 12" / "scratch that" rewrite the LAST logged set, and
      the rows carry no timestamps, so this is how lib/voiceApply finds it. */
  recentSetIds?: string[];
};

// Jarvis-style endpointing: a SHORT pause fires the log right away, but
// the mic stays open for a grace window — speech that resumes inside it is
// the same utterance ("3 sets of squats … [pause] … at 225"): the first
// apply is undone and the merged sentence is re-interpreted. Fast when
// you're done, forgiving when you're thinking.
const SILENCE_FIRE_MS = 1700; // pause after speech → log it (mic stays open)
const LATE_GRACE_MS = 6000; // more speech inside this window supersedes
const EMPTY_CANCEL_MS = 8000; // heard nothing at all → quiet cancel
const HARD_CAP_MS = 120_000; // native chains segments; this is the safety net
// A "Logged" card shows its rows for a beat, then folds to a one-line pill
// for the rest of the undo window — the workout stays visible underneath.
const COLLAPSE_MS = 2500;

type Phase =
  | { at: "idle" }
  | { at: "starting" }
  | { at: "blocked"; reason: string }
  | { at: "listening"; partial: string }
  | { at: "thinking"; transcript: string }
  | { at: "applied"; result: VoiceApplyResult }
  | { at: "missed"; transcript: string };

/** Native start failures, named on screen — a dead tap taught us that any
    silent failure path reads as "voice is broken". */
const blockedReason = (message: string): string => {
  if (message.includes("speech_not_authorized")) {
    return "Speech Recognition is off for LiftOS. iOS Settings → LiftOS → turn on Speech Recognition and Microphone.";
  }
  if (message.includes("recognizer_unavailable")) {
    return "Speech recognition isn't available on this iPhone right now — check Settings → Siri (dictation must be enabled), then try again.";
  }
  if (
    message.includes("audio_session_failed") ||
    message.includes("audio_engine_failed") ||
    message.includes("no_input_device")
  ) {
    return "The microphone couldn't start — close any other app using the mic and try again.";
  }
  return `Voice couldn't start (${message || "unknown error"}). Try again in a moment.`;
};

/** Summary lines arrive as "Bicep Curl · 25 lb × 10 reps" — split on the
    FIRST separator only (a detail may carry its own " · "). Older " — "
    lines still split, so a stale receipt never renders as one blob. */
const splitSummaryLine = (line: string): { name: string; detail: string | null } => {
  for (const sep of [" · ", " — "]) {
    const at = line.indexOf(sep);
    if (at >= 0) return { name: line.slice(0, at), detail: line.slice(at + sep.length) };
  }
  return { name: line, detail: null };
};

/** One mark per state — a glance tells listening from logging from logged
    from "say that again". */
const markFor = (
  at: Phase["at"],
): { className: string; icon: ReactElement } => {
  switch (at) {
    case "applied":
      return {
        className: "bg-primary text-primary-foreground",
        icon: <Check size={15} strokeWidth={2.6} />,
      };
    case "listening":
      return {
        className: "bg-primary/[0.12] text-primary ring-[3px] ring-primary/20",
        icon: <Mic size={14} className="animate-pulse" />,
      };
    case "thinking":
      return {
        className: "bg-foreground/[0.06] text-fg",
        icon: <Loader2 size={15} className="animate-spin" />,
      };
    case "missed":
      return {
        className: "bg-[hsl(var(--warning)/0.16)] text-[hsl(var(--warning))]",
        icon: <CircleHelp size={16} />,
      };
    case "blocked":
      return {
        className: "bg-destructive/10 text-destructive",
        icon: <MicOff size={14} />,
      };
    default:
      // "starting" (and the never-rendered idle) — the mic, not yet live.
      return {
        className: "bg-foreground/[0.06] text-fg-muted",
        icon: <Mic size={14} />,
      };
  }
};

export const VoiceLogControl = ({
  exercises,
  units,
  onApply,
  onUndo,
  onEdit,
  raised = false,
  recentSetIds,
}: Props) => {
  // DEV preview: `localStorage.liftos-voice-dev-phase = "applied"` mounts
  // the receipt card in the browser so its design can be QA'd without a mic.
  const [phase, setPhase] = useState<Phase>(() => {
    if (import.meta.env.DEV && window.localStorage.getItem("liftos-voice-dev-phase") === "applied") {
      return {
        at: "applied",
        result: {
          exercises: [],
          summary: ["Bicep Curl · 25 lb × 10 reps", "Goblet Squat · 3 sets done", "Note: “felt strong today”"],
          touched: [],
          setsLogged: 4,
          addedExercises: [],
          note: null,
          empty: false,
        },
      };
    }
    return { at: "idle" };
  });
  const activeRef = useRef(false);
  // Bumped on every begin/cancel: a finish() that awaited a slow interpret
  // call checks it afterwards and drops its result if a newer session
  // started — otherwise the stale card clobbers the live listening UI and
  // background chatter gets auto-logged.
  const sessionGen = useRef(0);
  const listenerRef = useRef<PluginListenerHandle | null>(null);
  const errorListenerRef = useRef<PluginListenerHandle | null>(null);
  const dismissTimer = useRef<number>(0);
  const watchdog = useRef<number>(0);
  const lastChangeAt = useRef(0);
  const startedAt = useRef(0);
  const lastTranscript = useRef("");
  // Longest partial this session — the truth when iOS ends with a fragment.
  const longestTranscript = useRef("");
  // Fire bookkeeping: what was last interpreted, when, and which fire's
  // result is currently applied (undoable) — the grace window supersedes it.
  const firedTranscript = useRef("");
  const firedAt = useRef(0);
  const fireSeq = useRef(0);
  const appliedFire = useRef<number | null>(null);
  // The freshest exercises (and recency list) without re-binding handlers
  // every render — the watchdog's closure is the one that fires.
  const exercisesRef = useRef(exercises);
  exercisesRef.current = exercises;
  const recentSetIdsRef = useRef(recentSetIds);
  recentSetIdsRef.current = recentSetIds;

  // Fold the "Logged" card to one line after a beat. Keyed on the result
  // object so a superseding apply (grace-window merge) re-expands.
  const appliedResult = phase.at === "applied" ? phase.result : null;
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(false);
    if (!appliedResult) return;
    const id = window.setTimeout(() => setCollapsed(true), COLLAPSE_MS);
    return () => window.clearTimeout(id);
  }, [appliedResult]);

  useEffect(
    () => () => {
      listenerRef.current?.remove();
      errorListenerRef.current?.remove();
      window.clearTimeout(dismissTimer.current);
      window.clearInterval(watchdog.current);
      void cancelListening().catch(() => {});
    },
    [],
  );

  if (!speechSupported()) return null;

  const begin = async (): Promise<void> => {
    if (activeRef.current) return;
    activeRef.current = true;
    sessionGen.current += 1;
    window.clearTimeout(dismissTimer.current);
    tapHaptic();
    voiceDiag(`tap: begin (exercises=${exercisesRef.current.length})`);
    // Visible from the FIRST millisecond — a hung permission call or a
    // denied mic must never read as a dead tap.
    setPhase({ at: "starting" });
    const granted = await ensureSpeechPermissions();
    if (!granted) {
      voiceDiag("blocked: permissions not granted");
      activeRef.current = false;
      setPhase({
        at: "blocked",
        reason:
          "Microphone or Speech Recognition is off for LiftOS. iOS Settings → LiftOS → allow both, then try again.",
      });
      scheduleDismiss(30_000);
      return;
    }
    if (!activeRef.current) return;
    setPhase({ at: "listening", partial: "" });
    lastTranscript.current = "";
    longestTranscript.current = "";
    firedTranscript.current = "";
    firedAt.current = 0;
    appliedFire.current = null;
    startedAt.current = Date.now();
    lastChangeAt.current = Date.now();
    listenerRef.current?.remove();
    listenerRef.current = await onSpeechPartial((transcript) => {
      if (transcript !== lastTranscript.current) {
        lastTranscript.current = transcript;
        longestTranscript.current = longerOf(transcript, longestTranscript.current);
        lastChangeAt.current = Date.now();
      }
      // New words after a fire pull the card back to "Listening" — the
      // merged sentence will supersede what was logged.
      setPhase((current) =>
        current.at === "listening" || (firedAt.current > 0 && transcript.length > firedTranscript.current.length)
          ? { at: "listening", partial: transcript }
          : current,
      );
    });
    // Recognizer died mid-listen (native emits instead of going silent):
    // keep whatever was heard, otherwise say so and reset.
    errorListenerRef.current?.remove();
    errorListenerRef.current = await onSpeechError((message) => {
      voiceDiag(`speechError event: ${message} heard=${lastTranscript.current.length}`);
      if (!activeRef.current) return;
      if (lastTranscript.current.trim().length >= 3) {
        void finish();
      } else {
        cancel();
        setPhase({ at: "missed", transcript: "" });
        scheduleDismiss(6000);
      }
    });
    // Hands-free endpoint: a pause after speech logs it; dead air ends in
    // a visible "didn't hear anything" card, never a quiet vanish.
    window.clearInterval(watchdog.current);
    watchdog.current = window.setInterval(() => {
      if (!activeRef.current) return;
      const idle = Date.now() - lastChangeAt.current;
      const total = Date.now() - startedAt.current;
      const current = longerOf(lastTranscript.current, longestTranscript.current);
      const heard = current.trim().length >= 3;
      const unfired = current.trim() !== firedTranscript.current;
      if (total >= HARD_CAP_MS) {
        void finish();
      } else if (heard && unfired && idle >= SILENCE_FIRE_MS) {
        // Pause → log it now, mic stays open for the grace window.
        void fire(current.trim());
      } else if (heard && !unfired && idle >= SILENCE_FIRE_MS + LATE_GRACE_MS) {
        // Grace expired with nothing new — close the mic, keep the card.
        void finish();
      } else if (!heard && total >= EMPTY_CANCEL_MS) {
        voiceDiag("watchdog: heard nothing in 8s → missed");
        cancel();
        setPhase({ at: "missed", transcript: "" });
        scheduleDismiss(6000);
      }
    }, 250);
    try {
      await startListening(exercisesRef.current.map((e) => e.name).slice(0, 60));
      voiceDiag("listening started");
    } catch (err) {
      voiceDiag(`startListening FAILED: ${err instanceof Error ? err.message : String(err)}`);
      activeRef.current = false;
      window.clearInterval(watchdog.current);
      setPhase({
        at: "blocked",
        reason: blockedReason(err instanceof Error ? err.message : String(err)),
      });
      scheduleDismiss(30_000);
    }
  };

  /** Close the mic. Anything heard since the last fire is interpreted;
      otherwise the card that's already up stands. */
  const finish = async (): Promise<void> => {
    if (!activeRef.current) return;
    activeRef.current = false;
    const gen = sessionGen.current;
    window.clearInterval(watchdog.current);
    let transcript = "";
    try {
      transcript = (await stopListening()).transcript.trim();
    } catch {
      /* fell through — the last partial below still counts */
    }
    // Belt and braces (same rule as the native plugin): a final that is a
    // fragment of what the partials carried is a truncation, not the
    // answer — the longest transcript this session heard wins.
    const longest = longerOf(lastTranscript.current, longestTranscript.current);
    transcript = chooseTranscript(transcript, longest);
    voiceDiag(`transcript (${transcript.length} chars, longest seen ${longest.length})`);
    if (gen !== sessionGen.current) return; // a newer session took over
    listenerRef.current?.remove();
    listenerRef.current = null;
    errorListenerRef.current?.remove();
    errorListenerRef.current = null;

    if (transcript === firedTranscript.current && firedAt.current > 0) {
      // Nothing new since the fire — the card is already up; let it rest.
      scheduleDismiss(phase.at === "applied" ? 6000 : 5000);
      return;
    }
    if (transcript.length < 3) {
      // Never a silent reset — the only remaining quiet path was here.
      voiceDiag("finish: nothing usable heard → missed card");
      setPhase({ at: "missed", transcript: "" });
      scheduleDismiss(6000);
      return;
    }
    await fire(transcript, gen);
  };

  /** Interpret + apply one transcript. A fire that follows an applied one
      inside the grace window undoes it first — the merged sentence is the
      truth, never two half-logs. Stale results (a newer fire started) are
      dropped. */
  const fire = async (transcript: string, gen = sessionGen.current): Promise<void> => {
    const seq = ++fireSeq.current;
    firedTranscript.current = transcript;
    firedAt.current = Date.now();
    if (appliedFire.current !== null) {
      voiceDiag(`fire #${seq}: superseding fire #${appliedFire.current} (undo)`);
      onUndo();
      appliedFire.current = null;
    }
    setPhase({ at: "thinking", transcript });
    try {
      // Hard ceiling so "Logging…" always resolves to a visible card even
      // when the edge function hangs.
      const intent = await Promise.race([
        interpretUtterance(
          transcript,
          exercisesRef.current.map((e) => ({
            name: e.name,
            tracking: (e.tracking ?? "reps") as "reps" | "time",
          })),
          units,
        ),
        new Promise<never>((_, reject) =>
          window.setTimeout(() => reject(new Error("voice interpret timeout")), 15_000),
        ),
      ]);
      if (gen !== sessionGen.current || seq !== fireSeq.current) return; // superseded
      // Low-confidence interpretations don't auto-apply — a garbled
      // half-sentence writing sets into the log is worse than a re-ask.
      if ((intent.confidence ?? 1) < 0.5) {
        setPhase({ at: "missed", transcript });
        if (!activeRef.current) scheduleDismiss(6000);
        return;
      }
      voiceDiag(`intent kind=${intent.kind} confidence=${intent.confidence ?? "?"} actions=${intent.actions?.length ?? 0}`);
      // Receipt lines spell the lifter's unit ("kg" must never read "lb"),
      // and corrections need to know which row was logged last. Passed as
      // a variable, not a literal: an option key lib/voiceApply hasn't
      // adopted yet is then harmless rather than a type error.
      const applyOptions = { units, recentSetIds: recentSetIdsRef.current ?? [] };
      const result = applyVoiceIntent(exercisesRef.current, intent, applyOptions);
      if (result.empty) {
        setPhase({ at: "missed", transcript });
        if (!activeRef.current) scheduleDismiss(6000);
        return;
      }
      onApply(result);
      appliedFire.current = seq;
      successHaptic();
      setPhase({ at: "applied", result });
      // While the mic is still open the card stays for the grace window;
      // once closed it lives its usual 8s.
      if (!activeRef.current) scheduleDismiss(8000);
    } catch (err) {
      voiceDiag(`interpret FAILED: ${err instanceof Error ? err.message : String(err)}`);
      if (gen !== sessionGen.current || seq !== fireSeq.current) return;
      setPhase({ at: "missed", transcript });
      if (!activeRef.current) scheduleDismiss(6000);
    }
  };

  const cancel = (): void => {
    if (!activeRef.current) return;
    activeRef.current = false;
    sessionGen.current += 1;
    window.clearInterval(watchdog.current);
    void cancelListening().catch(() => {});
    listenerRef.current?.remove();
    listenerRef.current = null;
    errorListenerRef.current?.remove();
    errorListenerRef.current = null;
    setPhase({ at: "idle" });
  };

  const scheduleDismiss = (ms: number): void => {
    window.clearTimeout(dismissTimer.current);
    dismissTimer.current = window.setTimeout(() => setPhase({ at: "idle" }), ms);
  };

  /** Edit and Undo end the session outright. Inside the grace window the
      mic is still open — left that way, the next pill tap reads as
      "finish" (a dead tap), and speech that resumes re-fires over the
      manual edit, undoing it. Nothing applied may be superseded after
      the lifter has taken over. */
  const closeReceipt = (): void => {
    window.clearTimeout(dismissTimer.current);
    cancel();
    // A finish() may still be awaiting the native stop with activeRef
    // already false: bump the generation so its late result drops, and
    // drop the listeners it would have removed.
    sessionGen.current += 1;
    listenerRef.current?.remove();
    listenerRef.current = null;
    errorListenerRef.current?.remove();
    errorListenerRef.current = null;
    appliedFire.current = null;
    setPhase({ at: "idle" });
  };

  const undoNow = (): void => {
    closeReceipt();
    onUndo();
  };

  const editNow = (result: VoiceApplyResult): void => {
    closeReceipt();
    onEdit?.(result);
  };

  const listening = phase.at === "listening";
  const compact = phase.at === "applied" && collapsed;
  const mark = markFor(phase.at);
  // The one-line fold: "Logged · Bicep Curl +2".
  const compactLabel = (() => {
    if (phase.at !== "applied") return "";
    const lines = phase.result.summary;
    if (lines.length === 0) return "Logged";
    const extra = lines.length > 1 ? ` +${lines.length - 1}` : "";
    return `Logged · ${splitSummaryLine(lines[0]).name}${extra}`;
  })();

  const smallActionClass =
    "relative inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold transition after:absolute after:-inset-1.5 after:content-[''] active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

  return (
    <>
      {createPortal(
        // Voice receipt — one card for every phase, fixed in the slot above
        // the session toolbar (over the rest bar when that's up). A leading
        // state mark, structured rows, and (after a log) Edit + Undo with a
        // window that visibly drains. Never full-bleed.
        phase.at !== "idle" ? (
          <div
            className={cn(
              "pointer-events-none fixed inset-x-5 z-40 flex justify-center",
              raised
                ? "bottom-[calc(4rem+var(--safe-bottom)+6rem)] md:bottom-[11.5rem]"
                : "bottom-[calc(4rem+var(--safe-bottom)+0.75rem)] md:bottom-[6.25rem]",
            )}
          >
            <div
              key={phase.at}
              className={cn(
                "voice-card pointer-events-auto overflow-hidden border border-border bg-card/95 shadow-[0_14px_40px_rgba(16,22,35,0.18)] backdrop-blur-[14px] dark:shadow-[0_14px_40px_rgba(0,0,0,0.55)]",
                compact ? "w-auto max-w-full rounded-[16px]" : "w-full max-w-md rounded-[20px]",
              )}
            >
              {compact && phase.at === "applied" ? (
                <div className="flex items-center gap-2 py-1.5 pl-2 pr-1.5">
                  <span
                    aria-hidden
                    className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", mark.className)}
                  >
                    <Check size={13} strokeWidth={2.6} />
                  </span>
                  <p className="min-w-0 truncate pr-1 text-[13.5px] font-semibold text-fg">{compactLabel}</p>
                  {onEdit && (
                    <button
                      type="button"
                      onClick={() => editNow(phase.result)}
                      className={cn(smallActionClass, "bg-foreground/[0.06] text-fg hover:bg-foreground/[0.1]")}
                    >
                      <Pencil size={12} />
                      Edit
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={undoNow}
                    className={cn(smallActionClass, "bg-foreground/[0.06] text-fg hover:bg-foreground/[0.1]")}
                  >
                    <Undo2 size={13} />
                    Undo
                  </button>
                </div>
              ) : (
                <div className="flex items-start gap-3 px-4 pt-3.5 pb-3.5">
                  {/* State mark */}
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      mark.className,
                    )}
                  >
                    {mark.icon}
                  </span>

                  <div className="min-w-0 flex-1">
                    {phase.at === "starting" && (
                      <>
                        <p className="text-[14px] font-semibold leading-5 text-fg">Opening the mic…</p>
                        <p className="mt-0.5 text-[12.5px] leading-[18px] text-fg-muted">
                          First time, iOS asks for mic and speech permission.
                        </p>
                      </>
                    )}
                    {phase.at === "blocked" && (
                      <>
                        <p className="text-[14px] font-semibold leading-5 text-fg">Voice can’t start</p>
                        <p className="mt-0.5 text-[12.5px] leading-[18px] text-fg-muted">{phase.reason}</p>
                      </>
                    )}
                    {listening && (
                      <>
                        <p className="text-[14px] font-semibold leading-5 text-primary">
                          {phase.partial ? "Listening" : "Listening…"}
                        </p>
                        <p
                          className={cn(
                            "mt-0.5 min-h-[18px] text-[13.5px] leading-[19px]",
                            phase.partial ? "text-fg" : "text-fg-muted",
                          )}
                        >
                          {phase.partial || "Say it like you’d say it to a friend — pausing logs it."}
                        </p>
                      </>
                    )}
                    {phase.at === "thinking" && (
                      <>
                        <p className="text-[14px] font-semibold leading-5 text-fg">
                          Logging
                          <span className="voice-dots" aria-hidden />
                        </p>
                        <p className="mt-0.5 text-[13px] leading-[18px] text-fg-muted">“{phase.transcript}”</p>
                      </>
                    )}
                    {phase.at === "applied" && (
                      <>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[14px] font-semibold leading-5 text-fg">Logged</p>
                          <div className="-my-1 -mr-1 flex items-center gap-1.5">
                            {onEdit && (
                              <button
                                type="button"
                                onClick={() => editNow(phase.result)}
                                className={cn(smallActionClass, "bg-foreground/[0.06] text-fg hover:bg-foreground/[0.1]")}
                              >
                                <Pencil size={12} />
                                Edit
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={undoNow}
                              className={cn(smallActionClass, "bg-foreground/[0.06] text-fg hover:bg-foreground/[0.1]")}
                            >
                              <Undo2 size={13} />
                              Undo
                            </button>
                          </div>
                        </div>
                        <div className="mt-1.5 space-y-1.5">
                          {phase.result.summary.map((line) => {
                            const { name, detail } = splitSummaryLine(line);
                            return (
                              <div key={line} className="flex items-baseline justify-between gap-3">
                                <span className="min-w-0 truncate text-[13.5px] font-medium text-fg">{name}</span>
                                {detail && (
                                  <span className="mono shrink-0 text-[12.5px] text-fg-soft">{detail}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                    {phase.at === "missed" && (
                      <>
                        <p className="text-[14px] font-semibold leading-5 text-fg">
                          {phase.transcript ? "Didn’t catch that" : "Didn’t hear anything"}
                        </p>
                        <p className="mt-0.5 text-[12.5px] leading-[18px] text-fg-muted">
                          {phase.transcript
                            ? `“${phase.transcript}” — try “3 sets of 8 at 185 on bench” or “note: shoulder felt tight”.`
                            : "Check the mic is on, then tap and try again."}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* The undo window, draining — nothing to read, just seen. Same
                  element in both layouts, so the fold never restarts it. */}
              {phase.at === "applied" && (
                <div className="h-[3px] w-full bg-foreground/[0.06]">
                  <div className="voice-undo-bar h-full bg-primary" />
                </div>
              )}
            </div>
          </div>
        ) : null,
        document.body,
      )}

      {/* The pill — tap to talk. Inline: the toolbar owns its position. */}
      <button
        type="button"
        onClick={() => (activeRef.current ? void finish() : void begin())}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={listening ? "Stop and log" : "Log by voice"}
        className={cn(
          "inline-flex min-h-12 w-full min-w-0 select-none items-center justify-center gap-2 rounded-full px-4 text-[14px] font-semibold transition-[transform,background-color] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          listening
            ? "bg-primary text-primary-foreground"
            : "border border-border bg-card text-fg active:scale-[0.98]",
        )}
      >
        <Mic size={16} className={listening ? "shrink-0 animate-pulse" : "shrink-0 text-primary"} />
        <span className="truncate">{listening ? "Tap when done" : "Tap to speak"}</span>
      </button>
    </>
  );
};
