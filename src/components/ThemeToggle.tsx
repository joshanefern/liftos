import { Moon, Sun, MonitorSmartphone } from "lucide-react";
import { useTheme, type ThemePreference } from "@/context/ThemeContext";

const ORDER: ThemePreference[] = ["light", "dark", "system"];

const LABEL: Record<ThemePreference, string> = {
  light: "Light",
  dark: "Dark",
  system: "Auto",
};

const ICON: Record<ThemePreference, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: MonitorSmartphone,
};

/* Cycles light → dark → system. `compact` renders icon-only for tight
   spots (collapsed sidebar, mobile page headers). */
export const ThemeToggle = ({ compact = false }: { compact?: boolean }) => {
  const { preference, setPreference } = useTheme();
  const Icon = ICON[preference];
  const next = ORDER[(ORDER.indexOf(preference) + 1) % ORDER.length];

  return (
    <button
      onClick={() => setPreference(next)}
      aria-label={`Theme: ${LABEL[preference]} — switch to ${LABEL[next]}`}
      className={`relative flex items-center justify-center gap-2 rounded-[0.875rem] text-fg-muted transition-colors duration-200 after:absolute after:-inset-1 after:content-[''] hover:bg-secondary hover:text-fg ${
        compact ? "h-9 w-9" : "px-3 py-2 text-xs"
      }`}
    >
      <Icon size={14} />
      {!compact && <span>{LABEL[preference]}</span>}
    </button>
  );
};
