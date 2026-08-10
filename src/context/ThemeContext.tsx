import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Capacitor } from "@capacitor/core";

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "liftos-theme";

const systemPrefersDark = () =>
  window.matchMedia("(prefers-color-scheme: dark)").matches;

const resolveIsDark = (pref: ThemePreference) =>
  pref === "dark" || (pref === "system" && systemPrefersDark());

/* index.html applies the .dark class pre-hydration from the same storage
   key, so React only has to keep it in sync from here on. */
const readStoredPreference = (): ThemePreference => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* storage unavailable — fall through */
  }
  return "system";
};

/* iOS status bar text must flip with the canvas: dark glyphs over
   champagne, light glyphs over espresso. */
const syncStatusBar = async (isDark: boolean) => {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
  } catch {
    /* plugin unavailable (e.g. web build) — ignore */
  }
};

const ThemeContext = createContext<{
  preference: ThemePreference;
  isDark: boolean;
  setPreference: (p: ThemePreference) => void;
}>({ preference: "system", isDark: false, setPreference: () => {} });

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [preference, setPreferenceState] =
    useState<ThemePreference>(readStoredPreference);
  const [isDark, setIsDark] = useState(() => resolveIsDark(preference));

  const apply = useCallback((pref: ThemePreference) => {
    const dark = resolveIsDark(pref);
    document.documentElement.classList.toggle("dark", dark);
    setIsDark(dark);
    void syncStatusBar(dark);
  }, []);

  const setPreference = useCallback(
    (pref: ThemePreference) => {
      setPreferenceState(pref);
      try {
        localStorage.setItem(STORAGE_KEY, pref);
      } catch {
        /* private mode — theme just won't persist */
      }
      apply(pref);
    },
    [apply],
  );

  useEffect(() => {
    apply(preference);
    if (preference !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [preference, apply]);

  return (
    <ThemeContext.Provider value={{ preference, isDark, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => useContext(ThemeContext);
