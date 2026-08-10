import { buildStravaAuthorizeUrl, stravaIsConfigured } from "@/lib/strava/auth";
import { toast } from "@/components/ui/use-toast";

type Props = {
  state?: string;
  className?: string;
  label?: string;
};

export const ConnectStravaButton = ({ state, className, label }: Props) => {
  const handleClick = (): void => {
    if (!stravaIsConfigured()) {
      toast({
        title: "Strava not configured",
        description: "VITE_STRAVA_CLIENT_ID is missing from this build.",
        variant: "destructive",
      });
      return;
    }
    window.location.href = buildStravaAuthorizeUrl(state);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={
        className ??
        "inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring/40"
      }
    >
      <StravaGlyph />
      {label ?? "Connect Strava"}
    </button>
  );
};

const StravaGlyph = () => (
  <svg
    aria-hidden
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="currentColor"
    className="shrink-0"
  >
    <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
  </svg>
);
