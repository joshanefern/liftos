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

/* ── One workout at a time. Starting anything while a workout is running
   would overwrite its saved progress, and quietly opening the running one
   instead makes a button labelled "Start Legs" open Push Day. So every
   start on Home stops here and says what is going on, in the same words as
   the stop on the Workouts page. ── */

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The running workout's name, when it has one. */
  runningName?: string | null;
  onResume: () => void;
};

export const WorkoutRunningDialog = ({ open, onOpenChange, runningName, onResume }: Props) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent className="w-[calc(100%-2.5rem)] max-w-sm rounded-[18px] border-border bg-card p-6 text-fg">
      <AlertDialogHeader className="space-y-2 text-left sm:text-left">
        <AlertDialogTitle className="text-[20px] font-semibold tracking-[-0.01em] text-fg">
          A workout is already running
        </AlertDialogTitle>
        <AlertDialogDescription className="text-[14px] leading-5 text-fg-soft">
          {runningName ? `“${runningName}” is live.` : "Your workout is live."} Finish or discard
          it before starting another — its progress would be lost otherwise.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter className="mt-5 flex-col gap-2 sm:flex-col sm:space-x-0">
        <AlertDialogAction
          onClick={onResume}
          className="h-12 w-full rounded-full border-0 bg-primary text-[14.5px] font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Back to workout
        </AlertDialogAction>
        <AlertDialogCancel className="mt-0 h-12 w-full rounded-full border border-border bg-transparent text-[14.5px] font-semibold text-fg-soft">
          Cancel
        </AlertDialogCancel>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
