import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/* ── Bottom sheet (vaul 0.9.9). The chrome lives here so every sheet in the
   app is the same object: 26px top corners, a hairline top highlight instead
   of a border seam, a 36×5 grabber, a built-in 36px X (44px hit area), a
   warm blurred scrim, and a height cap so a tall sheet's header — grabber,
   X — can never slide above the screen. Three ways out, always: scrim tap,
   X, swipe-down. Call sites that scroll mark the scroller with
   `data-vaul-no-drag` so a scroll never turns into a half-dismiss. ── */

const Drawer = ({ shouldScaleBackground = true, ...props }: React.ComponentProps<typeof DrawerPrimitive.Root>) => (
  <DrawerPrimitive.Root shouldScaleBackground={shouldScaleBackground} {...props} />
);
Drawer.displayName = "Drawer";

const DrawerTrigger = DrawerPrimitive.Trigger;

const DrawerPortal = DrawerPrimitive.Portal;

const DrawerClose = DrawerPrimitive.Close;

/* Fixed warm near-black at 50% — reads as a dim in the sandstone theme and a
   deeper dim in charcoal; a foreground-token scrim would flip to white on
   dark. The blur is what makes it feel like a native material. */
export const SCRIM_CLASS = "fixed inset-0 z-50 bg-[hsl(30_8%_5%/0.5)] backdrop-blur-[6px]";

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay ref={ref} className={cn(SCRIM_CLASS, className)} {...props} />
));
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName;

/* The X — shared by drawer and sheet so the two primitives are visually one. */
export const SHEET_CLOSE_CLASS =
  "absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-foreground/[0.06] text-fg-soft transition-colors after:absolute after:-inset-1 after:content-[''] hover:bg-foreground/[0.1] hover:text-fg active:bg-foreground/[0.12] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none";

type DrawerContentProps = React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content> & {
  /** Skip the built-in X — for sheets that render their own in a header row. */
  hideClose?: boolean;
};

const DrawerContent = React.forwardRef<React.ElementRef<typeof DrawerPrimitive.Content>, DrawerContentProps>(
  ({ className, children, hideClose = false, ...props }, ref) => (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerPrimitive.Content
        ref={ref}
        className={cn(
          // Height cap: the sheet never grows past the screen, so the header
          // (grabber + X) stays reachable. Content taller than this must
          // scroll internally (min-h-0 flex-1 overflow-y-auto).
          "fixed inset-x-0 bottom-0 z-50 flex h-auto max-h-[calc(100dvh-var(--safe-top)-1.25rem)] flex-col rounded-t-[26px] border-0 bg-background text-fg focus:outline-none",
          // Bottom padding clears the home indicator by default; a call site
          // that passes its own pb-* takes over that responsibility.
          "pb-[var(--safe-bottom)]",
          // A 1px top highlight (ink on sand, off-white on charcoal) stands
          // in for the border seam, plus a soft lift off the scrim.
          "shadow-[0_-1px_0_0_hsl(var(--foreground)/0.07),0_-24px_48px_-24px_hsl(30_8%_5%/0.35)]",
          className,
        )}
        {...props}
      >
        {/* Grabber — the iOS 36×5 pill. Vaul drags from anywhere that isn't
            a scrolled region, so this is affordance, not the only handle. */}
        <div aria-hidden className="mx-auto mb-1 mt-3 h-[5px] w-9 shrink-0 rounded-full bg-foreground/[0.28]" />
        {!hideClose && (
          <DrawerPrimitive.Close aria-label="Close" className={SHEET_CLOSE_CLASS}>
            <X size={18} strokeWidth={2.25} />
          </DrawerPrimitive.Close>
        )}
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  ),
);
DrawerContent.displayName = "DrawerContent";

const DrawerHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("grid gap-1.5 p-4 text-center sm:text-left", className)} {...props} />
);
DrawerHeader.displayName = "DrawerHeader";

const DrawerFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("mt-auto flex flex-col gap-2 p-4", className)} {...props} />
);
DrawerFooter.displayName = "DrawerFooter";

const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DrawerTitle.displayName = DrawerPrimitive.Title.displayName;

const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DrawerDescription.displayName = DrawerPrimitive.Description.displayName;

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
