import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
} from "react";

/**
 * Input that buffers user typing locally and only commits a parsed canonical
 * value on blur. Solves the "real-time mm:ss / km parsing eats the cursor"
 * problem — the user types raw digits or whatever shape they like, and we
 * normalize once when focus leaves.
 *
 *   canonical: stored value (e.g. "1800" seconds, "5000" meters)
 *   format:    canonical → display string (rendered when not actively typing)
 *   parse:     raw display string → canonical (null = invalid; snap back)
 *   onCommit:  fires on blur when parsed differs from current canonical
 */
type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "defaultValue" | "onChange"
> & {
  canonical: string;
  format: (canonical: string) => string;
  parse: (raw: string) => string | null;
  onCommit: (canonical: string) => void;
};

export const DeferredInput = forwardRef<HTMLInputElement, Props>(
  ({ canonical, format, parse, onCommit, onBlur, ...rest }, ref) => {
    const [text, setText] = useState(() => format(canonical));
    const lastCanonicalRef = useRef(canonical);

    // External canonical changes (initial load, parent reset) → re-sync display.
    // Skip when canonical hasn't moved so we don't stomp mid-typing edits.
    useEffect(() => {
      if (canonical !== lastCanonicalRef.current) {
        lastCanonicalRef.current = canonical;
        setText(format(canonical));
      }
    }, [canonical, format]);

    return (
      <input
        ref={ref}
        {...rest}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => {
          const parsed = parse(text);
          if (parsed === null) {
            // Unparseable — restore last known good value
            setText(format(canonical));
          } else {
            // Update ref BEFORE onCommit so the parent's re-render doesn't
            // re-trigger our useEffect to re-format what we just formatted.
            lastCanonicalRef.current = parsed;
            setText(format(parsed));
            if (parsed !== canonical) onCommit(parsed);
          }
          onBlur?.(e);
        }}
      />
    );
  },
);

DeferredInput.displayName = "DeferredInput";
