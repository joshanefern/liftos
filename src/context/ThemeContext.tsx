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

// v2: the dark instrument IS the identity (research: dark-first is where
// premium lives; the light sandstone is the reading theme). New key so
// existing "system/light" habits don't hide the redesign — one toggle
// brings sandstone back.
const STORAGE_KEY = "liftos-theme-v2";

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
  return "dark";
};

/* iOS status bar text must flip with the canvas: dark glyphs over
   porcelain, light glyphs over slate. */
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

/* ── Forced-dark scope (Split Shift) — the active-workout screen is a black
   scoreboard in every theme. Wraps its subtree in the .dark token class and
   overrides useTheme so canvas consumers (muscle figures) composite for the
   dark ground. The iOS status bar flips for the visit and restores on exit. ── */
export const ForceDarkScope = ({ children }: { children: ReactNode }) => {
  const outer = useTheme();

  useEffect(() => {
    void syncStatusBar(true);
    return () => {
      void syncStatusBar(resolveIsDark(outer.preference));
    };
  }, [outer.preference]);

  return (
    <ThemeContext.Provider value={{ ...outer, isDark: true }}>
      {/* text-fg re-resolves the inherited text color inside the scope —
          without it, unstyled elements inherit the light body ink. isolate
          creates a stacking context so the page's z-[-1] canvas layer paints
          above the light body background (otherwise a light strip shows
          behind the status bar). */}
      <div className="dark isolate text-fg">{children}</div>
    </ThemeContext.Provider>
  );
};
