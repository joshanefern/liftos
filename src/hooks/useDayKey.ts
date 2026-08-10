import { useEffect, useState } from "react";

/** Local calendar date as "YYYY-MM-DD" — the app's one day convention
    (matches the suggestion engine's local-midnight rest boundary; never
    toISOString, which rolls over at UTC midnight). */
export const localDayKey = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

/**
 * The current local day, re-checked every minute and on tab focus /
 * visibility — so anything derived from "today" (the engine's pick, the
 * header date, the daily insight) recomputes when a long-lived mount
 * crosses midnight or the iOS webview resumes the next morning.
 */
export const useDayKey = (): string => {
  const [key, setKey] = useState(localDayKey);

  useEffect(() => {
    const check = () => setKey((prev) => (localDayKey() === prev ? prev : localDayKey()));
    const id = setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);

  return key;
};
