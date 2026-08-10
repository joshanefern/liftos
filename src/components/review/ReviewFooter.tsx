import { CTAButton } from "@/components/GoldButton";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

type Props = {
  label: string;
  labelOptions: string[];
  labelIsAuto: boolean;
  onLabelChange: (label: string) => void;
  onSave: () => void;
  onDraft: () => void;
  onDismiss: () => void;
  saving: boolean;
  canSave: boolean;
  mode: "captured" | "log";
};

export const ReviewFooter = ({
  label,
  labelOptions,
  labelIsAuto,
  onLabelChange,
  onSave,
  onDraft,
  onDismiss,
  saving,
  canSave,
  mode,
}: Props) => {
  return (
    <section className="rule-heavy pt-4 animate-reveal-up">
      <p className="eyebrow mb-2">Workout label</p>
      <input
        list="review-label-history"
        value={label}
        onChange={(e) => onLabelChange(e.target.value)}
        onFocus={labelIsAuto ? (e) => e.currentTarget.select() : undefined}
        placeholder="Chest day, leg day, easy run…"
        className={cn(
          "h-11 w-full rounded-lg border border-border bg-transparent px-3 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20",
          labelIsAuto && "text-fg-faint",
        )}
      />
      <datalist id="review-label-history">
        {labelOptions.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2 sm:order-2 sm:justify-end">
          <button
            type="button"
            onClick={onDraft}
            disabled={saving}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[14px] border border-border px-4 py-2.5 text-sm text-fg-muted transition hover:border-foreground/30 hover:text-fg focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
          >
            {mode === "captured" ? "Save as draft" : "Cancel"}
          </button>
          <CTAButton onClick={onSave} disabled={saving || !canSave} className="flex-1 sm:flex-none">
            <Check size={15} />
            {saving ? "Saving…" : "Save workout"}
          </CTAButton>
        </div>

        {mode === "captured" ? (
          <button
            type="button"
            onClick={onDismiss}
            disabled={saving}
            className="caption min-h-11 self-center !text-fg-faint underline-offset-4 transition hover:!text-fg-muted hover:underline disabled:cursor-not-allowed sm:order-1 sm:self-auto"
          >
            Dismiss this session
          </button>
        ) : (
          <span className="hidden sm:order-1 sm:block" />
        )}
      </div>
    </section>
  );
};
