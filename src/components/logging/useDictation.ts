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

// Jarvis-style: a short pause hands the caller EVERYTHING said so far (the
// cumulative transcript), the mic stays open, and the next pause hands over
// the longer version — the caller supersedes what it built from the last
// one. Cumulative, not chunked: recognizers revise earlier words, so
// diffing "what's new" produced duplicate rows on a real iPhone. The
// session closes on its own once a longer silence passes.
const SILENCE_FIRE_MS = 2000; // pause → emit, keep listening
// Live mode: emit while still talking — at a word boundary (a beat of
// silence) and no more often than once a second. Rows appear as you speak.
const LIVE_IDLE_MS = 500;
const LIVE_MIN_INTERVAL_MS = 1100;
const LATE_GRACE_MS = 8000; // no more speech for this long → close the mic
const EMPTY_CANCEL_MS = 8000;
const HARD_CAP_MS = 180_000; // native chains segments; this is the safety net

export type DictationState =
  | { at: "idle" }
  | { at: "starting" }
  | { at: "listening"; partial: string }
  | { at: "blocked"; reason: string };

export const useDictation = (
  onTranscript: (transcript: string, sessionId: number) => void,
  options: {
    /** Words to bias the recognizer toward — exercise names, split names.
        "chest day" came back as "chain day" without them. */
    vocabulary?: string[];
    /** Emit while still talking (throttled) instead of only on pauses. */
    live?: boolean;
  } = {},
) => {
  const live = options.live ?? false;
  const lastEmitAt = useRef(0);
  const vocabularyRef = useRef(options.vocabulary ?? []);
  vocabularyRef.current = options.vocabulary ?? [];
  const [state, setState] = useState<DictationState>({ at: "idle" });
  const active = useRef(false);
  const partialRef = useRef<PluginListenerHandle | null>(null);
  const errorRef = useRef<PluginListenerHandle | null>(null);
  const watchdog = useRef(0);
  const last = useRef("");
  const longest = useRef("");
  const lastChangeAt = useRef(0);
  const startedAt = useRef(0);
  const startRun = useRef(0);
  // The transcript last handed to the caller; only a changed one re-emits.
  const emitted = useRef("");
  // Bumped per tap-to-start so the caller can tell a new dictation from a
  // revision of the current one.
  const sessionId = useRef(0);
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

  /** Hand the caller the whole transcript so far. */
  const emit = (transcript: string): void => {
    const text = transcript.trim();
    if (text === emitted.current) return;
    emitted.current = text;
    lastEmitAt.current = Date.now();
    voiceDiag(`dictation: emit #${sessionId.current} (${text.length} chars)`);
    if (text.length >= 3) onTranscriptRef.current(text, sessionId.current);
  };

  const finish = async (): Promise<void> => {
    if (!active.current) return;
    active.current = false;
    // A second tap while start() is still opening the mic lands here: mark
    // that run stale so it closes what it opens instead of leaving the mic
    // live with no watchdog.
    startRun.current += 1;
    let transcript = "";
    try {
      transcript = (await stopListening()).transcript.trim();
    } catch {
      /* the longest partial still counts */
    }
    teardownListeners();
    transcript = chooseTranscript(transcript, longerOf(last.current, longest.current));
    setState({ at: "idle" });
    emit(transcript);
  };

  /** Safe to call at any time, from any render's closure: it reads refs. */
  const cancel = (): void => {
    // Nothing of this hook's is open or opening (start() holds `active`
    // from its first line). The recognizer is one native session shared
    // with the logger's voice pill, so a cancel with nothing to cancel
    // stays off the bridge; only a leftover "blocked" message is cleared.
    if (!active.current) {
      setState((cur) => (cur.at === "idle" ? cur : { at: "idle" }));
      return;
    }
    active.current = false;
    startRun.current += 1;
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
    // start() awaits four times before the mic is open, and the builder can
    // close during any of them. cancel() bumps startRun, so each await
    // re-checks that this run is still the live one; what a stale run
    // opened it closes itself, by its own handle, and never touches the
    // refs a newer run may already own.
    const run = (startRun.current += 1);
    const stale = () => run !== startRun.current;
    setState({ at: "starting" });
    voiceDiag("dictation: begin");
    const granted = await ensureSpeechPermissions();
    if (stale()) return;
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
    emitted.current = "";
    sessionId.current += 1;
    startedAt.current = Date.now();
    lastChangeAt.current = Date.now();
    setState({ at: "listening", partial: "" });
    const partial = await onSpeechPartial((t) => {
      if (stale()) return;
      if (t !== last.current) {
        last.current = t;
        longest.current = longerOf(t, longest.current);
        lastChangeAt.current = Date.now();
      }
      setState((cur) => (cur.at === "listening" ? { at: "listening", partial: t } : cur));
    });
    if (stale()) {
      partial.remove();
      return;
    }
    partialRef.current = partial;
    const failure = await onSpeechError(() => {
      if (stale() || !active.current) return;
      if (last.current.trim().length >= 3) void finish();
      else cancel();
    });
    if (stale()) {
      failure.remove();
      return;
    }
    errorRef.current = failure;
    watchdog.current = window.setInterval(() => {
      if (!active.current) return;
      const idle = Date.now() - lastChangeAt.current;
      const total = Date.now() - startedAt.current;
      const current = longerOf(last.current, longest.current).trim();
      const heard = current.length >= 3;
      const unemitted = current !== emitted.current;
      const liveDue =
        live && idle >= LIVE_IDLE_MS && Date.now() - lastEmitAt.current >= LIVE_MIN_INTERVAL_MS;
      if (total >= HARD_CAP_MS) void finish();
      else if (heard && unemitted && (idle >= SILENCE_FIRE_MS || liveDue)) emit(current);
      else if (heard && !unemitted && idle >= SILENCE_FIRE_MS + LATE_GRACE_MS) void finish();
      else if (!heard && total >= EMPTY_CANCEL_MS) cancel();
    }, 250);
    try {
      // Server-based recognition for long free-form dictation — accuracy over
      // latency; segment chaining covers Apple's per-task limit.
      await startListening(vocabularyRef.current.slice(0, 100), { preferServer: true });
    } catch (err) {
      if (stale()) return;
      active.current = false;
      teardownListeners();
      setState({
        at: "blocked",
        reason: `Voice couldn’t start (${err instanceof Error ? err.message : String(err)}).`,
      });
      return;
    }
    // Cancelled while the recognizer was opening: the cancel ran before
    // there was a session to close, so close the one that just opened —
    // unless a newer run is already listening on it.
    if (stale() && !active.current) void cancelListening().catch(() => {});
  };

  return { state, start, cancel, supported: speechSupported() };
};
