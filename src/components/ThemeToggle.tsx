import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

/* Two states only: light ⇄ dark (owner's call — the Auto stop confused the
   cycle). A legacy stored "system" preference just resolves to whatever it
   currently looks like and flips from there. */
export const ThemeToggle = ({ compact = false }: { compact?: boolean }) => {
  const { preference, isDark, setPreference } = useTheme();
  const effectiveDark = preference === "system" ? isDark : preference === "dark";
  const Icon = effectiveDark ? Moon : Sun;
  const label = effectiveDark ? "Dark" : "Light";
  const next = effectiveDark ? "light" : "dark";

  return (
    <button
      onClick={() => setPreference(next)}
      aria-label={`Theme: ${label} — switch to ${next === "dark" ? "Dark" : "Light"}`}
      className={`relative flex items-center justify-center gap-2 rounded-[0.875rem] text-fg-muted transition-colors duration-200 after:absolute after:-inset-1 after:content-[''] hover:bg-secondary hover:text-fg ${
        compact ? "h-9 w-9" : "px-3 py-2 text-xs"
      }`}
    >
      <Icon size={14} />
      {!compact && <span>{label}</span>}
    </button>
  );
};
