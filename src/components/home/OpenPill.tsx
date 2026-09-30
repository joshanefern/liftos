import { ChevronsRight } from "lucide-react";

/* The tappable affordance on Home's cards — a small filled pill with a verb,
   not a lone arrow glyph. Purely visual (the whole card or row is the
   link). */
export const OpenPill = ({ label = "Open" }: { label?: string }) => (
  <span className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-primary px-3 text-[12px] font-semibold text-primary-foreground">
    {label}
    <ChevronsRight size={13} />
  </span>
);
