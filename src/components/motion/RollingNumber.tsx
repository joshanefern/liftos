import { useEffect, useRef, useState } from "react";

/* ── Odometer numerals — digits roll vertically when a stat changes
     (research: rolling numbers are one of the four signature motion
     moments that read as premium). Non-digit characters render static,
     so "12:45", "3d", "1,500" and even "Today" all pass through safely.
     Honors prefers-reduced-motion via the CSS transition (declared in
     index.css inside a no-preference media query). ── */

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

const DigitColumn = ({ digit }: { digit: string }) => (
  <span className="roll-digit" aria-hidden>
    <span
      className="roll-strip"
      style={{ transform: `translateY(-${Number(digit)}em)` }}
    >
      {DIGITS.map((d) => (
        <span key={d} className="roll-cell">
          {d}
        </span>
      ))}
    </span>
  </span>
);

type Props = {
  value: string | number;
  className?: string;
  /** Animate from 0 up to the value on first mount (finish-recap moment). */
  countUp?: boolean;
  countUpMs?: number;
};

export const RollingNumber = ({ value, className, countUp = false, countUpMs = 700 }: Props) => {
  const target = String(value);
  const [shown, setShown] = useState(() => (countUp ? target.replace(/\d/g, "0") : target));
  const raf = useRef(0);

  useEffect(() => {
    if (!countUp) {
      setShown(target);
      return;
    }
    const numericTarget = Number(target.replace(/[^\d]/g, "")) || 0;
    if (
      numericTarget === 0 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setShown(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / countUpMs);
      const eased = 1 - (1 - p) ** 3;
      const current = Math.round(numericTarget * eased);
      // Re-format into the target's shape (commas/colons preserved by
      // replaying digits right-to-left).
      let digitsLeft = String(current);
      let out = "";
      for (let i = target.length - 1; i >= 0; i--) {
        const ch = target[i];
        if (/\d/.test(ch)) {
          out = (digitsLeft.length ? digitsLeft.slice(-1) : "0") + out;
          digitsLeft = digitsLeft.slice(0, -1);
        } else {
          out = ch + out;
        }
      }
      setShown(out);
      if (p < 1) raf.current = window.requestAnimationFrame(tick);
    };
    raf.current = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, countUp, countUpMs]);

  return (
    <span className={className} aria-label={target} role="text">
      {shown.split("").map((ch, i) =>
        /\d/.test(ch) ? (
          <DigitColumn key={`${i}`} digit={ch} />
        ) : (
          <span key={`${i}`} aria-hidden>
            {ch}
          </span>
        ),
      )}
    </span>
  );
};
