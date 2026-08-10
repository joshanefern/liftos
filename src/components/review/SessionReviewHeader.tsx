type Props = {
  startedAt: string;
  endedAt: string;
  activityType: string | null;
  avgHr?: number;
  totalVolumeEstimate: number;
  unitsLabel: string;
};

const formatDateLine = (iso: string): string => {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} · ${time}`;
};

const formatDuration = (startISO: string, endISO: string): string => {
  const minutes = Math.max(
    0,
    Math.round((new Date(endISO).getTime() - new Date(startISO).getTime()) / 60_000),
  );
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

export const SessionReviewHeader = ({
  startedAt,
  endedAt,
  activityType,
  avgHr,
  totalVolumeEstimate,
  unitsLabel,
}: Props) => {
  const sourceLabel = activityType
    ? `via Strava · ${activityType}`
    : "via Strava";

  return (
    <div className="rule-heavy pt-3 animate-reveal-up">
      <div className="mb-1 flex items-center justify-between">
        <p className="eyebrow !text-gold">Smart review</p>
        <span className="caption">{sourceLabel}</span>
      </div>
      <h1 className="heading-lg mt-1">{formatDateLine(startedAt)}</h1>
      <div className="mt-3 grid grid-cols-3 gap-3 rule-hairline pt-3">
        <Stat label="Duration" value={formatDuration(startedAt, endedAt)} />
        <Stat
          label="Avg HR"
          value={avgHr !== undefined && avgHr > 0 ? `${Math.round(avgHr)} bpm` : "—"}
        />
        <Stat
          label="Volume est."
          value={
            totalVolumeEstimate > 0
              ? `${totalVolumeEstimate.toLocaleString()} ${unitsLabel}`
              : "—"
          }
        />
      </div>
    </div>
  );
};

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0">
    <p className="eyebrow truncate !text-[10px]">{label}</p>
    <p className="stat-lg mt-0.5">{value}</p>
  </div>
);
