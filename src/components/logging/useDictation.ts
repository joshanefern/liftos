import { useEffect, useRef, useState } from "react";
import type { PluginListenerHandle } from "@capacitor/core";
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
import { chooseTranscript, longerOf } from "@/lib/voiceTranscript";

/* ── Reusable tap-to-dictate.
   The same native session the logger's pill uses — live partials, a
   silence endpoint, the truncated-final guard — packaged so any screen
   (the workout builder, notes, the coach) can take a transcript without
   owning the voice UI. The caller decides what the words mean. ── */

const SILENCE_STOP_MS = 2200; // plans are longer sentences — a beat more patience
const EMPTY_CANCEL_MS = 8000;
const HARD_CAP_MS = 45_000;

export type DictationState =
  | { at: "idle" }
  | { at: "starting" }
  | { at: "listening"; partial: string }
  | { at: "blocked"; reason: string };

export const useDictation = (onTranscript: (transcript: string) => void) => {
  const [state, setState] = useState<DictationState>({ at: "idle" });
  const active = useRef(false);
  const partialRef = useRef<PluginListenerHandle | null>(null);
  const errorRef = useRef<PluginListenerHandle | null>(null);
  const watchdog = useRef(0);
  const last = useRef("");
  const longest = useRef("");
  const lastChangeAt = useRef(0);
  const startedAt = useRef(0);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(
    () => () => {
      partialRef.current?.remove();
      errorRef.current?.remove();
      window.clearInterval(watchdog.current);
      void cancelListening().catch(() => {});
    },
    [],
  );

  const teardownListeners = (): void => {
    window.clearInterval(watchdog.current);
    partialRef.current?.remove();
    partialRef.current = null;
    errorRef.current?.remove();
    errorRef.current = null;
  };

  const finish = async (): Promise<void> => {
    if (!active.current) return;
    active.current = false;
    let transcript = "";
    try {
      transcript = (await stopListening()).transcript.trim();
    } catch {
      /* the longest partial still counts */
    }
    teardownListeners();
    transcript = chooseTranscript(transcript, longerOf(last.current, longest.current));
    voiceDiag(`dictation: transcript (${transcript.length} chars)`);
    setState({ at: "idle" });
    if (transcript.length >= 3) onTranscriptRef.current(transcript);
  };

  const cancel = (): void => {
    active.current = false;
    teardownListeners();
    void cancelListening().catch(() => {});
    setState({ at: "idle" });
  };

  const start = async (): Promise<void> => {
    if (active.current) {
      void finish();
      return;
    }
    active.current = true;
    setState({ at: "starting" });
    voiceDiag("dictation: begin");
    const granted = await ensureSpeechPermissions();
    if (!granted) {
      active.current = false;
      setState({
        at: "blocked",
        reason: "Microphone or Speech Recognition is off for LiftOS — allow both in iOS Settings.",
      });
      return;
    }
    last.current = "";
    longest.current = "";
    startedAt.current = Date.now();
    lastChangeAt.current = Date.now();
    setState({ at: "listening", partial: "" });
    partialRef.current = await onSpeechPartial((t) => {
      if (t !== last.current) {
        last.current = t;
        longest.current = longerOf(t, longest.current);
        lastChangeAt.current = Date.now();
      }
      setState((cur) => (cur.at === "listening" ? { at: "listening", partial: t } : cur));
    });
    errorRef.current = await onSpeechError(() => {
      if (!active.current) return;
      if (last.current.trim().length >= 3) void finish();
      else cancel();
    });
    watchdog.current = window.setInterval(() => {
      if (!active.current) return;
      const idle = Date.now() - lastChangeAt.current;
      const total = Date.now() - startedAt.current;
      const heard = last.current.trim().length >= 3;
      if ((heard && idle >= SILENCE_STOP_MS) || total >= HARD_CAP_MS) void finish();
      else if (!heard && total >= EMPTY_CANCEL_MS) cancel();
    }, 250);
    try {
      await startListening([]);
    } catch (err) {
      active.current = false;
      teardownListeners();
      setState({
        at: "blocked",
        reason: `Voice couldn’t start (${err instanceof Error ? err.message : String(err)}).`,
      });
    }
  };

  return { state, start, cancel, supported: speechSupported() };
};
