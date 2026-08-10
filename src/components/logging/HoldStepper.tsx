import { Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

/**
 * Weight increment for a single stepper tap. Metric plates move in 2.5 kg
 * steps; imperial in 5 lb. Holding the button doubles the step.
 */
export const weightStepFor = (isMetric: boolean, accelerated: boolean): number => {
  if (isMetric) return accelerated ? 5 : 2.5;
  return accelerated ? 10 : 5;
};

export const roundToStep = (value: number, step: number): number => {
  return Math.round(value / step) * step;
};

type HoldStepperProps = {
  direction: "up" | "down";
  isMetric: boolean;
  onStep: (delta: number) => void;
  ariaLabel: string;
};

/**
 * Press-and-hold accelerating stepper: a tap steps once; holding for 420 ms
 * switches to a doubled step auto-repeating every 110 ms until release.
 */
export const HoldStepper = ({ direction, isMetric, onStep, ariaLabel }: HoldStepperProps) => {
  const sign = direction === "up" ? 1 : -1;
  const heldRef = useRef(false);
  const holdTimerRef = useRef<number | null>(null);
  const repeatTimerRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (repeatTimerRef.current !== null) {
      window.clearInterval(repeatTimerRef.current);
      repeatTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const startHold = () => {
    heldRef.current = false;
    holdTimerRef.current = window.setTimeout(() => {
      heldRef.current = true;
      // Begin accelerated auto-repeat
      const fastStep = sign * weightStepFor(isMetric, true);
      onStep(fastStep);
      repeatTimerRef.current = window.setInterval(() => {
        onStep(fastStep);
      }, 110);
    }, 420);
  };

  const endHold = () => {
    const wasHeld = heldRef.current;
    clearTimers();
    if (!wasHeld) {
      // Regular tap → single increment
      onStep(sign * weightStepFor(isMetric, false));
    }
  };

  const cancelHold = () => {
    clearTimers();
  };

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      tabIndex={-1}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        startHold();
      }}
      onPointerUp={endHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      className="relative flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full border border-border bg-card text-fg-muted transition after:absolute after:-inset-1.5 after:content-[''] hover:border-primary/50 hover:text-primary active:bg-primary/15 active:text-primary focus:outline-none"
    >
      {direction === "up" ? <Plus size={13} strokeWidth={2.5} /> : <Minus size={13} strokeWidth={2.5} />}
    </button>
  );
};
