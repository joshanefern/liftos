import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { SESSION_BAR_BOTTOM, SESSION_BAR_HEIGHT } from "@/components/logging/sessionBarLayout";

type Props = {
  onMinimize: () => void;
  onAddExercise: () => void;
  /** The voice pill. Renders nothing where speech is unavailable, and the
      bar simply closes up around the two remaining controls. */
  children?: ReactNode;
};

const sideButtonClass =
  "flex h-full w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-full text-fg-muted transition-colors hover:text-fg active:bg-foreground/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

/**
 * The live workout's floating bar: Minimize · voice · Exercise, one tight
 * group in a pill that hugs its content.
 *
 * Portalled to <body> and centered by a full-width flex row rather than a
 * translate: a transform on the bar (or on any ancestor mid-animation, like
 * the logger's reveal) would become the containing block for position:fixed
 * and un-anchor it from the viewport. The row ignores touches; only the
 * pill takes them, so the page stays scrollable on either side of it.
 */
export const SessionBar = ({ onMinimize, onAddExercise, children }: Props) =>
  createPortal(
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4",
        SESSION_BAR_BOTTOM,
      )}
    >
      <div
        role="toolbar"
        aria-label="Workout controls"
        className={cn(
          "pointer-events-auto flex max-w-full items-center gap-1 rounded-full border border-border bg-card p-1.5 shadow-[0_10px_30px_rgba(16,22,35,0.14)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.5)]",
          SESSION_BAR_HEIGHT,
        )}
      >
        <button
          type="button"
          onClick={onMinimize}
          aria-label="Minimize workout"
          className={sideButtonClass}
        >
          <ChevronDown size={18} />
          <span className="text-[10px] font-semibold leading-none tracking-wide">Minimize</span>
        </button>
        {children}
        <button
          type="button"
          onClick={onAddExercise}
          aria-label="Add exercise"
          className={sideButtonClass}
        >
          <Plus size={18} />
          <span className="text-[10px] font-semibold leading-none tracking-wide">Exercise</span>
        </button>
      </div>
    </div>,
    document.body,
  );
