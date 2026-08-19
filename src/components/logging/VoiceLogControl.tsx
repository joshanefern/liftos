import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PluginListenerHandle } from "@capacitor/core";
import { Mic, Undo2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import {
  cancelListening,
  ensureSpeechPermissions,
  onSpeechPartial,
  speechSupported,
  startListening,
  stopListening,
} from "@/lib/speech";
import { interpretUtterance } from "@/lib/voice";
import { tapHaptic, successHaptic } from "@/lib/haptics";
import {
  applyVoiceIntent,
  type VoiceApplyResult,
  type VoiceLoggedExercise,
} from "@/lib/voiceApply";
import { cn } from "@/lib/utils";

/* ── Hold-to-talk voice logging.
   Hold the pill → live transcript streams into the overlay. Release →
   interpret → apply → confirmation card with Undo (8s). Slide-away or a
   sub-2-char transcript cancels quietly. All row mutations run through
   lib/voiceApply — the model never touches state directly. ── */

type Props = {
  exercises: VoiceLoggedExercise[];
  units: string;
  onApply: (result: VoiceApplyResult) => void;
  onUndo: () => void;
};

const SILENCE_STOP_MS = 1700; // pause after speech → auto-log
const EMPTY_CANCEL_MS = 8000; // heard nothing at all → quiet cancel
const HARD_CAP_MS = 30_000;

type Phase =
  | { at: "idle" }
  | { at: "listening"; partial: string }
  | { at: "thinking"; transcript: string }
  | { at: "applied"; result: VoiceApplyResult }
  | { at: "missed"; transcript: string };

export const VoiceLogControl = ({ exercises, units, onApply, onUndo }: Props) => {
  const [phase, setPhase] = useState<Phase>({ at: "idle" });
  const activeRef = useRef(false);
  const listenerRef = useRef<PluginListenerHandle | null>(null);
  const dismissTimer = useRef<number>(0);
  const watchdog = useRef<number>(0);
  const lastChangeAt = useRef(0);
  const startedAt = useRef(0);
  const lastTranscript = useRef("");
  // The freshest exercises without re-binding handlers every render.
  const exercisesRef = useRef(exercises);
  exercisesRef.current = exercises;

  useEffect(
    () => () => {
      listenerRef.current?.remove();
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
    window.clearTimeout(dismissTimer.current);
    tapHaptic();
    const granted = await ensureSpeechPermissions();
    if (!granted) {
      activeRef.current = false;
      setPhase({ at: "idle" });
      toast({
        title: "Microphone is off",
        description: "Allow the mic and speech in iOS Settings → LiftOS.",
        variant: "destructive",
      });
      return;
    }
    if (!activeRef.current) return;
    setPhase({ at: "listening", partial: "" });
    lastTranscript.current = "";
    startedAt.current = Date.now();
    lastChangeAt.current = Date.now();
    listenerRef.current?.remove();
    listenerRef.current = await onSpeechPartial((transcript) => {
      if (transcript !== lastTranscript.current) {
        lastTranscript.current = transcript;
        lastChangeAt.current = Date.now();
      }
      setPhase((current) =>
        current.at === "listening" ? { at: "listening", partial: transcript } : current,
      );
    });
    // Hands-free endpoint: a pause after speech logs it; dead air cancels.
    window.clearInterval(watchdog.current);
    watchdog.current = window.setInterval(() => {
      if (!activeRef.current) return;
      const idle = Date.now() - lastChangeAt.current;
      const total = Date.now() - startedAt.current;
      const heard = lastTranscript.current.trim().length >= 3;
      if ((heard && idle >= SILENCE_STOP_MS) || total >= HARD_CAP_MS) {
        void finish();
      } else if (!heard && total >= EMPTY_CANCEL_MS) {
        cancel();
      }
    }, 250);
    try {
      await startListening(exercisesRef.current.map((e) => e.name).slice(0, 60));
    } catch {
      activeRef.current = false;
      window.clearInterval(watchdog.current);
      setPhase({ at: "idle" });
      toast({ title: "Couldn't start listening", variant: "destructive" });
    }
  };

  const finish = async (): Promise<void> => {
    if (!activeRef.current) return;
    activeRef.current = false;
    window.clearInterval(watchdog.current);
    let transcript = "";
    try {
      transcript = (await stopListening()).transcript.trim();
    } catch {
      /* fell through — treated as empty */
    }
    listenerRef.current?.remove();
    listenerRef.current = null;

    if (transcript.length < 3) {
      setPhase({ at: "idle" });
      return;
    }
    setPhase({ at: "thinking", transcript });
    try {
      const intent = await interpretUtterance(
        transcript,
        exercisesRef.current.map((e) => ({
          name: e.name,
          tracking: (e.tracking ?? "reps") as "reps" | "time",
        })),
        units,
      );
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
    } catch {
      setPhase({ at: "missed", transcript });
      scheduleDismiss(6000);
    }
  };

  const cancel = (): void => {
    if (!activeRef.current) return;
    activeRef.current = false;
    window.clearInterval(watchdog.current);
    void cancelListening().catch(() => {});
    listenerRef.current?.remove();
    listenerRef.current = null;
    setPhase({ at: "idle" });
  };

  const scheduleDismiss = (ms: number): void => {
    window.clearTimeout(dismissTimer.current);
    dismissTimer.current = window.setTimeout(() => setPhase({ at: "idle" }), ms);
  };

  const listening = phase.at === "listening";

  return createPortal(
    <>
      {/* Live transcript / result layer, above the pill */}
      {phase.at !== "idle" && (
        <div className="pointer-events-none fixed inset-x-4 bottom-[calc(4rem+var(--safe-bottom)+4.5rem)] z-40 flex justify-center">
          <div className="pointer-events-auto w-full max-w-md rounded-[16px] border border-border bg-card p-4 shadow-[0_12px_32px_rgba(0,0,0,0.45)]">
            {listening && (
              <>
                <p className="eyebrow !text-primary">Listening…</p>
                <p className="mt-1.5 min-h-5 text-sm leading-5 text-fg">
                  {phase.partial || "Say it like you'd say it to a friend."}
                </p>
                <p className="mt-1 text-[11px] leading-4 text-fg-muted">
                  Pausing logs it automatically.
                </p>
              </>
            )}
            {phase.at === "thinking" && (
              <>
                <p className="eyebrow animate-pulse !text-primary">Logging…</p>
                <p className="mt-1.5 text-sm leading-5 text-fg-soft">“{phase.transcript}”</p>
              </>
            )}
            {phase.at === "applied" && (
              <>
                <div className="flex items-center justify-between gap-3">
                  <p className="eyebrow !text-primary">Logged</p>
                  <button
                    type="button"
                    onClick={() => {
                      onUndo();
                      setPhase({ at: "idle" });
                    }}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border px-3 text-[12px] font-semibold text-fg transition hover:border-fg-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    <Undo2 size={12} />
                    Undo
                  </button>
                </div>
                <div className="mt-1.5 space-y-0.5">
                  {phase.result.summary.map((line) => (
                    <p key={line} className="text-sm leading-5 text-fg">
                      {line}
                    </p>
                  ))}
                </div>
              </>
            )}
            {phase.at === "missed" && (
              <>
                <p className="eyebrow !text-fg-muted">Didn't catch that</p>
                <p className="mt-1.5 text-sm leading-5 text-fg-soft">“{phase.transcript}”</p>
                <p className="mt-1 text-[12px] leading-4 text-fg-muted">
                  Try “3 sets of 8 at 185 on bench” or “note: shoulder felt tight”.
                </p>
              </>
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
