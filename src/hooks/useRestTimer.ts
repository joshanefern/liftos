import { Capacitor } from "@capacitor/core";
import { Haptics } from "@capacitor/haptics";
import { warnHaptic } from "@/lib/haptics";
import { restoredRest, type RestWindow } from "@/lib/sessionResume";
import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_REST_SECONDS = 120;

/** Brief buzz when the rest period ends. Native haptics on iOS, Vibration API elsewhere. */
const buzzOnFinish = async (): Promise<void> => {
  try {
    if (Capacitor.isNativePlatform()) {
      await Haptics.vibrate({ duration: 200 });
    } else {
      navigator.vibrate?.(200);
    }
  } catch {
    // Haptics unavailable — the countdown reaching zero is signal enough.
  }
};

/**
 * Between-set rest countdown. Remaining time derives from an end timestamp
 * (Date.now()), never tick-counting, so throttled tabs and backgrounded apps
 * stay accurate — the interval only refreshes the display.
 *
 * `start()` while already running restarts the countdown from full.
 * `resume(rest)` picks a countdown up part-way, from its end time.
 * `onFinish` fires once when the countdown reaches zero (not on skip).
 *
 * `initial` is a rest that was running when the screen was last unmounted
 * (read once, on mount). Only one that is still running is taken up — an
 * ended one would fire `onFinish` and the buzz the moment the screen opens.
 */
export const useRestTimer = (
  defaultSeconds: number = DEFAULT_REST_SECONDS,
  onFinish?: () => void,
  initial?: RestWindow | null,
) => {
  const [restored] = useState(() => restoredRest(initial, Date.now()));
  /** Epoch ms when the current rest ends; null = not running. */
  const [endsAt, setEndsAt] = useState<number | null>(restored?.endsAt ?? null);
  const [totalSeconds, setTotalSeconds] = useState(restored?.totalSeconds ?? defaultSeconds);
  const [remaining, setRemaining] = useState(() =>
    restored ? Math.ceil((restored.endsAt - Date.now()) / 1000) : defaultSeconds,
  );
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const start = useCallback(() => {
    setTotalSeconds(defaultSeconds);
    setRemaining(defaultSeconds);
    setEndsAt(Date.now() + defaultSeconds * 1000);
  }, [defaultSeconds]);

  const resume = useCallback((rest: RestWindow) => {
    setTotalSeconds(rest.totalSeconds);
    setRemaining(Math.max(0, Math.ceil((rest.endsAt - Date.now()) / 1000)));
    setEndsAt(rest.endsAt);
  }, []);

  const extend = useCallback((seconds: number) => {
    setTotalSeconds((t) => t + seconds);
    setEndsAt((curr) => (curr === null ? null : curr + seconds * 1000));
  }, []);

  const skip = useCallback(() => {
    setEndsAt(null);
  }, []);

  useEffect(() => {
    if (endsAt === null) return;
    let fired = false;
    let warned = false;
    const update = () => {
      const secs = Math.ceil((endsAt - Date.now()) / 1000);
      if (secs <= 0) {
        if (!fired) {
          fired = true;
          setRemaining(0);
          setEndsAt(null);
          void buzzOnFinish();
          onFinishRef.current?.();
        }
        return;
      }
      // One quiet nudge at 10s — eyes off the phone, back to the bar.
      if (secs <= 10 && !warned) {
        warned = true;
        warnHaptic();
      }
      setRemaining(secs);
    };
    update();
    const id = window.setInterval(update, 250);
    return () => window.clearInterval(id);
  }, [endsAt]);

  return {
    running: endsAt !== null,
    /** Epoch ms when the rest ends (null = not running) — what a caller
        saves to bring the countdown back later. */
    endsAt,
    remaining,
    totalSeconds,
    /** 0..1 fraction of the rest period still left (for progress bars). */
    progress: totalSeconds > 0 ? remaining / totalSeconds : 0,
    start,
    resume,
    extend,
    skip,
  };
};
