import { Capacitor } from "@capacitor/core";
import { Haptics } from "@capacitor/haptics";
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
 * `onFinish` fires once when the countdown reaches zero (not on skip).
 */
export const useRestTimer = (
  defaultSeconds: number = DEFAULT_REST_SECONDS,
  onFinish?: () => void,
) => {
  /** Epoch ms when the current rest ends; null = not running. */
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [totalSeconds, setTotalSeconds] = useState(defaultSeconds);
  const [remaining, setRemaining] = useState(defaultSeconds);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const start = useCallback(() => {
    setTotalSeconds(defaultSeconds);
    setRemaining(defaultSeconds);
    setEndsAt(Date.now() + defaultSeconds * 1000);
  }, [defaultSeconds]);

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
      setRemaining(secs);
    };
    update();
    const id = window.setInterval(update, 250);
    return () => window.clearInterval(id);
  }, [endsAt]);

  return {
    running: endsAt !== null,
    remaining,
    totalSeconds,
    /** 0..1 fraction of the rest period still left (for progress bars). */
    progress: totalSeconds > 0 ? remaining / totalSeconds : 0,
    start,
    extend,
    skip,
  };
};
