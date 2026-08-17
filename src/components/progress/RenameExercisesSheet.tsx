import { CTAButton } from "@/components/GoldButton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "@/components/ui/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import type { WorkoutLog } from "@/hooks/useWorkoutLogs";
import {
  isPlaceholderName,
  placeholderNames,
  renameExercisesInLogs,
} from "@/lib/exerciseNames";
import { useMemo, useState } from "react";

/* ── Fix-it flow for imported placeholder names. Sessions saved from smart
     review without a name became "Exercise 1", "Exercise 2"… — meaningless
     rows that would poison Records and trends. This sheet lists each one
     with a free-text field; Save rewrites every affected log, after which
     the exercise joins records/trends like anything else. ── */

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  logs: WorkoutLog[];
  /** Called after a successful save so the parent can reload logs. */
  onRenamed: () => Promise<void> | void;
};

export const RenameExercisesSheet = ({ open, onOpenChange, logs, onRenamed }: Props) => {
  const isMobile = useIsMobile();
  const names = useMemo(() => placeholderNames(logs), [logs]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const valueOf = (n: string) => (values[n] ?? "").trim();
  // A "rename" to another placeholder-style name ("Exercise 3") wouldn't fix
  // anything — those inputs don't count and block saving with a visible hint.
  const filledCount = names.filter(
    (n) => valueOf(n) !== "" && !isPlaceholderName(valueOf(n)),
  ).length;
  const hasInvalid = names.some((n) => valueOf(n) !== "" && isPlaceholderName(valueOf(n)));

  const handleSave = async () => {
    if (saving || filledCount === 0 || hasInvalid) return;
    setSaving(true);
    try {
      const renames = new Map<string, string>();
      for (const n of names) {
        const v = valueOf(n);
        if (v && !isPlaceholderName(v)) renames.set(n, v);
      }
      const updated = await renameExercisesInLogs(renames);
      toast({
        title: `Renamed across ${updated} workout${updated === 1 ? "" : "s"}`,
        description: "Records and trends now include them.",
      });
      await onRenamed();
      setValues({});
      onOpenChange(false);
    } catch {
      // Some rows may have saved before the failure — resync so the screen
      // reflects exactly what persisted.
      void onRenamed();
      toast({
        title: "Couldn't save every name",
        description: "Any that saved are kept — try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={`border-border bg-background p-0 ${
          isMobile ? "max-h-[85vh] rounded-t-[1.5rem]" : "w-full sm:max-w-md"
        }`}
      >
        <div className="h-full overflow-y-auto px-5 pb-[calc(1.5rem+var(--safe-bottom))] pt-4 md:px-6 md:pt-5">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border md:hidden" />
          <SheetHeader className="text-left sm:text-left">
            <SheetTitle className="heading-md">Name your imported exercises</SheetTitle>
            <SheetDescription className="caption">
              These came in from imported sessions without names. Once named,
              they count toward your records and trends.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-5 space-y-4">
            {names.map((name) => {
              const invalid = valueOf(name) !== "" && isPlaceholderName(valueOf(name));
              return (
                <label key={name} className="block">
                  <span className="eyebrow mb-1.5 block !text-[10px]">{name}</span>
                  <input
                    type="text"
                    value={values[name] ?? ""}
                    placeholder="e.g. Bench Press"
                    maxLength={80}
                    onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
                    className={`h-11 w-full rounded-lg border bg-background px-3 text-[15px] font-medium text-fg outline-none transition focus:ring-2 ${
                      invalid
                        ? "border-destructive/60 focus:border-destructive focus:ring-destructive/20"
                        : "border-border focus:border-primary/60 focus:ring-primary/20"
                    }`}
                  />
                  {invalid && (
                    <span className="caption mt-1 block !text-destructive">
                      That's still a placeholder-style name — use the real exercise name.
                    </span>
                  )}
                </label>
              );
            })}
          </div>

          <CTAButton
            onClick={handleSave}
            disabled={saving || filledCount === 0 || hasInvalid}
            fullWidth
            className="mt-6"
          >
            {saving
              ? "Saving…"
              : filledCount === 0
                ? "Type a name to save"
                : `Save ${filledCount} name${filledCount === 1 ? "" : "s"}`}
          </CTAButton>
          <p className="caption mt-3 text-center !text-fg-faint">
            Leave any blank to name it later.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
};
