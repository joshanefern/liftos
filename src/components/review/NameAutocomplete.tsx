import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";

type Props = {
  value: string;
  options: string[];
  placeholder: string;
  onChange: (v: string) => void;
  className?: string;
  maxSuggestions?: number;
};

/**
 * Custom name autocomplete. Replaces native <datalist> because the browser-
 * rendered dropdown chevron isn't reliably stylable across Chrome / Safari /
 * Firefox. Renders a small floating suggestion list anchored to the input.
 */
export const NameAutocomplete = ({
  value,
  options,
  placeholder,
  onChange,
  className,
  maxSuggestions = 6,
}: Props) => {
  const [focused, setFocused] = useState(false);

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return options.slice(0, maxSuggestions);
    return options
      .filter((n) => n.toLowerCase().includes(q) && n.toLowerCase() !== q)
      .slice(0, maxSuggestions);
  }, [value, options, maxSuggestions]);

  const showSuggestions = focused && suggestions.length > 0;

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        autoComplete="off"
        className={cn(
          "w-full bg-transparent text-base font-semibold outline-none placeholder:text-fg-faint",
          className,
        )}
      />
      {showSuggestions && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-auto rounded-lg border border-border bg-popover py-1 shadow-lg">
          {suggestions.map((name) => (
            <button
              key={name}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(name);
                setFocused(false);
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-fg-muted transition hover:bg-secondary hover:text-fg"
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
