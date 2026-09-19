import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PluginListenerHandle } from "@capacitor/core";
import { Check, Mic, MicOff, Undo2 } from "lucide-react";
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
   Tap the pill → live transcript streams into the overlay. A pause after
   speech (or a second tap) → interpret → apply → confirmation card with
   Undo (8s). Hearing nothing, or the recognizer dying mid-listen, always
   ends in a visible card — never a silent vanish. All row mutations run
   through lib/voiceApply — the model never touches state directly. ── */

type Props = {
  exercises: VoiceLoggedExercise[];
  units: string;
  onApply: (result: VoiceApplyResult) => void;
  onUndo: () => void;
};

const SILENCE_STOP_MS = 1700; // pause after speech → auto-log
const EMPTY_CANCEL_MS = 8000; // heard nothing at all → quiet cancel
const HARD_CAP_MS = 120_000; // native chains segments; this is the safety net

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

export const VoiceLogControl = ({ exercises, units, onApply, onUndo }: Props) => {
  // DEV preview: `localStorage.liftos-voice-dev-phase = "applied"` mounts
  // the receipt card in the browser so its design can be QA'd without a mic.
  const [phase, setPhase] = useState<Phase>(() => {
    if (import.meta.env.DEV && window.localStorage.getItem("liftos-voice-dev-phase") === "applied") {
      return {
        at: "applied",
        result: {
          exercises: [],
          summary: ["Bicep Curl — 25 × 10", "Goblet Squat — 3 sets done", "Note: “felt strong today”"],
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
  // The freshest exercises without re-binding handlers every render.
  const exercisesRef = useRef(exercises);
  exercisesRef.current = exercises;

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
    startedAt.current = Date.now();
    lastChangeAt.current = Date.now();
    listenerRef.current?.remove();
    listenerRef.current = await onSpeechPartial((transcript) => {
      if (transcript !== lastTranscript.current) {
        lastTranscript.current = transcript;
        longestTranscript.current = longerOf(transcript, longestTranscript.current);
        lastChangeAt.current = Date.now();
      }
      setPhase((current) =>
        current.at === "listening" ? { at: "listening", partial: transcript } : current,
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
      const heard = lastTranscript.current.trim().length >= 3;
      if ((heard && idle >= SILENCE_STOP_MS) || total >= HARD_CAP_MS) {
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

    if (transcript.length < 3) {
      // Never a silent reset — the only remaining quiet path was here.
      voiceDiag("finish: nothing usable heard → missed card");
      setPhase({ at: "missed", transcript: "" });
      scheduleDismiss(6000);
      return;
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
      if (gen !== sessionGen.current) return; // user re-tapped mid-interpret
      // Low-confidence interpretations don't auto-apply — a garbled
      // half-sentence writing sets into the log is worse than a re-ask.
      if ((intent.confidence ?? 1) < 0.5) {
        setPhase({ at: "missed", transcript });
        scheduleDismiss(6000);
        return;
      }
      voiceDiag(`intent kind=${intent.kind} confidence=${intent.confidence ?? "?"} actions=${intent.actions?.length ?? 0}`);
      const result = applyVoiceIntent(exercisesRef.current, intent);
      if (result.empty) {
        setPhase({ at: "missed", transcript });
        scheduleDismiss(6000);
        return;
      }
      onApply(result);
      successHaptic();
      setPhase({ at: "applied", result });
      scheduleDismiss(8000);
    } catch (err) {
      voiceDiag(`interpret FAILED: ${err instanceof Error ? err.message : String(err)}`);
      if (gen !== sessionGen.current) return;
      setPhase({ at: "missed", transcript });
      scheduleDismiss(6000);
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

  const listening = phase.at === "listening";

  return createPortal(
    <>
      {/* Voice receipt — one card for every phase, above the pill. A leading
          state mark, structured rows, and (after a log) an Undo whose window
          visibly drains. Slides up from the pill; never full-bleed. */}
      {phase.at !== "idle" && (
        <div className="pointer-events-none fixed inset-x-5 bottom-[calc(4rem+var(--safe-bottom)+4.5rem)] z-40 flex justify-center">
          <div
            key={phase.at}
            className="voice-card pointer-events-auto w-full max-w-md overflow-hidden rounded-[20px] border border-border bg-card/95 shadow-[0_14px_40px_rgba(16,22,35,0.18)] backdrop-blur-[14px] dark:shadow-[0_14px_40px_rgba(0,0,0,0.55)]"
          >
            <div className="flex items-start gap-3 px-4 pt-3.5 pb-3.5">
              {/* State mark */}
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  phase.at === "applied" && "bg-primary text-primary-foreground",
                  (phase.at === "listening" || phase.at === "starting" || phase.at === "thinking") &&
                    "bg-primary/[0.12] text-primary",
                  (phase.at === "missed" || phase.at === "blocked") &&
                    "bg-foreground/[0.06] text-fg-muted",
                )}
              >
                {phase.at === "applied" ? (
                  <Check size={15} strokeWidth={2.6} />
                ) : phase.at === "missed" || phase.at === "blocked" ? (
                  <MicOff size={14} />
                ) : (
                  <Mic size={14} className={listening ? "animate-pulse" : ""} />
                )}
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
                    <p className="text-[14px] font-semibold leading-5 text-fg">
                      {phase.partial ? "Listening" : "Listening…"}
                    </p>
                    <p
                      className={cn(
                        "mt-0.5 min-h-[18px] text-[13.5px] leading-[19px]",
                        phase.partial ? "text-fg-soft" : "text-fg-muted",
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
                      <button
                        type="button"
                        onClick={() => {
                          onUndo();
                          setPhase({ at: "idle" });
                        }}
                        className="-my-1 -mr-1 inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full bg-foreground/[0.06] px-3 text-[12.5px] font-semibold text-fg transition hover:bg-foreground/[0.1] active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      >
                        <Undo2 size={13} />
                        Undo
                      </button>
                    </div>
                    <div className="mt-1.5 space-y-1.5">
                      {phase.result.summary.map((line) => {
                        const split = line.indexOf(" — ");
                        const name = split >= 0 ? line.slice(0, split) : line;
                        const detail = split >= 0 ? line.slice(split + 3) : null;
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

            {/* The undo window, draining — nothing to read, just seen. */}
            {phase.at === "applied" && (
              <div className="h-[3px] w-full bg-foreground/[0.06]">
                <div className="voice-undo-bar h-full bg-primary" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* The pill — hold to talk */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+var(--safe-bottom)+0.75rem)] z-40 flex justify-center">
        <button
          type="button"
          onClick={() => (activeRef.current ? void finish() : void begin())}
          onContextMenu={(e) => e.preventDefault()}
          aria-label={listening ? "Stop and log" : "Log by voice"}
          className={cn(
            "inline-flex min-h-12 select-none items-center gap-2.5 rounded-full px-6 text-[14px] font-semibold shadow-[0_8px_24px_rgba(0,0,0,0.4)] transition-[transform,background-color] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            listening
              ? "scale-105 bg-primary text-primary-foreground"
              : "border border-border bg-card text-fg active:scale-[0.98]",
          )}
        >
          <Mic size={16} className={listening ? "animate-pulse" : "text-primary"} />
          {listening ? "Listening — tap when done" : "Tap to speak"}
        </button>
      </div>
    </>,
    document.body,
  );
};
