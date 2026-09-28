import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type DiscardWorkoutDialogProps = {
  open: boolean;
  /** Editing a saved workout: only the changes are at stake, and the line
      under the title says the workout itself is safe. */
  editing: boolean;
  onKeep: () => void;
  onDiscard: () => void;
  /** The question has left the screen, whichever answer closed it. Radix
      would now send focus to the trigger that opened it; there is none, so
      the builder decides. Call preventDefault() after placing focus. */
  onClosed?: (event: Event) => void;
};

/* Asked before the builder throws anything away. "Keep editing" is the
   Cancel — Radix focuses it on open and Escape lands on it, so every
   accidental key or tap is the safe answer. */
export const DiscardWorkoutDialog = ({ open, editing, onKeep, onDiscard, onClosed }: DiscardWorkoutDialogProps) => (
  <AlertDialog
    open={open}
    onOpenChange={(next) => {
      if (!next) onKeep();
    }}
  >
    <AlertDialogContent
      onCloseAutoFocus={onClosed}
      className="w-[calc(100%-2.5rem)] max-w-sm rounded-[18px] border-border bg-card p-6 text-fg"
    >
      <AlertDialogHeader className="space-y-2 text-left sm:text-left">
        <AlertDialogTitle className="text-[20px] font-semibold tracking-[-0.01em] text-fg">
          Discard this workout?
        </AlertDialogTitle>
        <AlertDialogDescription className="text-[14px] leading-5 text-fg-soft">
          {editing
            ? "Your changes will be lost. The saved workout stays as it was."
            : "Everything you’ve added will be lost."}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter className="mt-5 flex-col gap-2 sm:flex-col sm:space-x-0">
        <AlertDialogCancel className="mt-0 h-12 w-full rounded-full border-0 bg-primary text-[14.5px] font-semibold text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground">
          Keep editing
        </AlertDialogCancel>
        <AlertDialogAction
          onClick={onDiscard}
          className="h-12 w-full rounded-full border border-border bg-transparent text-[14.5px] font-semibold text-destructive hover:bg-destructive/10"
        >
          Discard
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
