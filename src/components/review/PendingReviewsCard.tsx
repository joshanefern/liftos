import { usePendingReviews } from "@/hooks/usePendingReviews";
import { type CapturedSessionRow } from "@/context/CapturedSessionsProvider";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

const formatDuration = (row: CapturedSessionRow): string => {
  const seconds =
    row.aggregates?.duration_s ??
    Math.max(
      0,
      (new Date(row.ended_at).getTime() - new Date(row.started_at).getTime()) /
        1000,
    );
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

const hasHeartRate = (row: CapturedSessionRow): boolean =>
  (row.hr_samples?.length ?? 0) > 0 || (row.aggregates?.avg_hr ?? 0) > 0;

/**
 * Dashboard row card surfacing captured sessions awaiting smart review.
 * The whole card links to the newest pending session's review screen.
 * Renders nothing when the queue is empty.
 */
export const PendingReviewsCard = ({ className }: { className?: string }) => {
  const { pendingCount, pendingSessions } = usePendingReviews();

  const newest = pendingSessions[0];
  if (pendingCount === 0 || !newest) return null;

  return (
    <Link
      to={`/workouts/review/${newest.id}`}
      className={cn(
        "group flex items-center gap-4 rounded-[14px] border border-border bg-card px-4 py-3.5 animate-reveal-up",
        "transition-all duration-200 hover:bg-secondary active:scale-[0.995]",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="eyebrow !text-gold">Smart review</p>
        <p className="mt-1 text-base font-medium text-fg">
          <span className="mono text-xl font-semibold text-gold">
            {pendingCount}
          </span>{" "}
          session{pendingCount === 1 ? "" : "s"} waiting for review
        </p>
        <p className="caption mt-1 truncate">
          <span className="mono">
            {formatDate(newest.started_at)} · {formatDuration(newest)}
          </span>
          {hasHeartRate(newest) && <span> · HR available</span>}
        </p>
      </div>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-gold transition-all duration-200 group-hover:translate-x-0.5">
        <ChevronRight size={16} strokeWidth={2} />
      </span>
    </Link>
  );
};
