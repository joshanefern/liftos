import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import * as React from "react";

import { SCRIM_CLASS, SHEET_CLOSE_CLASS } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

/* ── Radix side sheet. The bottom variant is dressed as the same object as
   the vaul Drawer (26px corners, grabber, hairline top highlight, blurred
   scrim, 36px X, safe-area bottom) and gets a grabber-drag-to-dismiss so
   swipe-down works here too. It is capped at 88dvh: content must scroll
   inside (min-h-0 flex-1 overflow-y-auto) — a sheet taller than the screen
   with no scroll is exactly how someone gets stuck in one. ── */

const Sheet = SheetPrimitive.Root;

const SheetTrigger = SheetPrimitive.Trigger;

const SheetClose = SheetPrimitive.Close;

const SheetPortal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      SCRIM_CLASS,
      "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:duration-200 data-[state=open]:duration-300",
      className,
    )}
    {...props}
    ref={ref}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

const sheetVariants = cva(
  // Motion is keyframe-driven (animate-in/out) — no `transition` here, so a
  // drag transform never fights a CSS transition. Apple's sheet curve.
  "fixed z-50 gap-4 bg-background p-6 text-fg shadow-lg focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-[250ms] data-[state=open]:duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          // p-0 + pb-safe: the sheet pads the home indicator by default; a
          // call site that passes its own pb-* takes over. Capped height +
          // flex column so a child scroller can shrink.
          "inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-[26px] border-0 p-0 pb-[var(--safe-bottom)] shadow-[0_-1px_0_0_hsl(var(--foreground)/0.07),0_-24px_48px_-24px_hsl(30_8%_5%/0.35)] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right:
          "inset-y-0 right-0 h-full w-3/4  border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "right",
    },
  },
);

/* Swipe-down on the grabber strip. Radix has no drag model, so this moves
   the sheet with the finger and, past a distance or a flick, clicks the
   hidden-in-plain-sight Close; otherwise it springs back. The exit keyframe
   picks up from wherever the finger left it. */
const DISMISS_DISTANCE = 72;
const DISMISS_VELOCITY = 0.5; // px per ms

type GrabberProps = {
  contentRef: React.RefObject<HTMLDivElement | null>;
  closeRef: React.RefObject<HTMLButtonElement | null>;
};

const SheetGrabber = ({ contentRef, closeRef }: GrabberProps) => {
  const start = React.useRef<{ y: number; t: number } | null>(null);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    start.current = { y: event.clientY, t: event.timeStamp };
    // Keep the drag even when the finger leaves the strip.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const el = contentRef.current;
    if (el) el.style.transition = "none";
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const dy = event.clientY - start.current.y;
    const el = contentRef.current;
    if (!el) return;
    // Downward follows 1:1; upward is damped so the sheet feels anchored.
    el.style.transform = `translate3d(0, ${dy > 0 ? dy : dy * 0.2}px, 0)`;
  };

  const finish = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const dy = event.clientY - start.current.y;
    const dt = Math.max(1, event.timeStamp - start.current.t);
    start.current = null;
    const el = contentRef.current;
    if (!el) return;
    if (dy > DISMISS_DISTANCE || (dy > 24 && dy / dt > DISMISS_VELOCITY)) {
      closeRef.current?.click();
      return;
    }
    el.style.transition = "transform 320ms cubic-bezier(0.32, 0.72, 0, 1)";
    el.style.transform = "";
    const clear = () => {
      el.style.transition = "";
      el.removeEventListener("transitionend", clear);
    };
    el.addEventListener("transitionend", clear);
  };

  return (
    <div
      aria-hidden
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      className="flex shrink-0 cursor-grab touch-none justify-center pb-2 pt-3 active:cursor-grabbing"
    >
      <div className="h-[5px] w-9 rounded-full bg-foreground/[0.28]" />
    </div>
  );
};

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

const SheetContent = React.forwardRef<React.ElementRef<typeof SheetPrimitive.Content>, SheetContentProps>(
  ({ side = "right", className, children, ...props }, ref) => {
    const contentRef = React.useRef<HTMLDivElement | null>(null);
    const closeRef = React.useRef<HTMLButtonElement | null>(null);
    const setRefs = React.useCallback(
      (node: HTMLDivElement | null) => {
        contentRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      },
      [ref],
    );

    return (
      <SheetPortal>
        <SheetOverlay />
        <SheetPrimitive.Content ref={setRefs} className={cn(sheetVariants({ side }), className)} {...props}>
          {side === "bottom" && <SheetGrabber contentRef={contentRef} closeRef={closeRef} />}
          {children}
          <SheetPrimitive.Close ref={closeRef} aria-label="Close" className={SHEET_CLOSE_CLASS}>
            <X size={18} strokeWidth={2.25} />
          </SheetPrimitive.Close>
        </SheetPrimitive.Content>
      </SheetPortal>
    );
  },
);
SheetContent.displayName = SheetPrimitive.Content.displayName;

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />
);
SheetHeader.displayName = "SheetHeader";

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);
SheetFooter.displayName = "SheetFooter";

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title ref={ref} className={cn("text-lg font-semibold text-foreground", className)} {...props} />
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
};
