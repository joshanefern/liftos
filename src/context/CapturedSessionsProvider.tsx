import { supabase } from "@/lib/supabase";
import { useUser } from "@/context/UserContext";
import {
  cardioRunSession,
  cleanLiftingSession,
  mixedSession,
  noisyHRSession,
  type CapturedSession,
  type CaptureProvider,
  type HRSample,
  type MotionSample,
  type SessionAggregates,
} from "@/lib/capture";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type ReviewStatus = "pending" | "reviewed" | "dismissed";

/**
 * Shape of a row in the `captured_sessions` table. JSONB columns are typed as
 * the in-memory shapes they were serialized from (validation is trust-based,
 * matching the convention of the existing data providers).
 */
export type CapturedSessionRow = {
  id: string;
  user_id: string;
  provider: CaptureProvider;
  external_id: string;
  started_at: string;
  ended_at: string;
  raw_payload: unknown;
  hr_samples: HRSample[] | null;
  motion_samples: MotionSample[] | null;
  aggregates: SessionAggregates;
  review_status: ReviewStatus;
  created_at: string;
};

type CapturedSessionsContextValue = {
  sessions: CapturedSessionRow[];
  loading: boolean;
  pendingCount: number;
  refresh: () => Promise<void>;
  markReviewed: (id: string) => Promise<void>;
  markDismissed: (id: string) => Promise<void>;
};

const CapturedSessionsContext =
  createContext<CapturedSessionsContextValue | null>(null);

/**
 * Live provider — reads from Supabase, follows the same auth-gated reload
 * pattern as WorkoutLogsProvider / WorkoutTemplatesProvider.
 */
export const CapturedSessionsProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { user } = useUser();
  const [sessions, setSessions] = useState<CapturedSessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("captured_sessions")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(100);
    setSessions((data as CapturedSessionRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!user) {
      setSessions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    load();
  }, [user, load]);

  const markStatus = async (id: string, status: ReviewStatus): Promise<void> => {
    const { error } = await supabase
      .from("captured_sessions")
      .update({ review_status: status })
      .eq("id", id);
    if (error) throw error;
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, review_status: status } : s)),
    );
  };

  const pendingCount = useMemo(
    () => sessions.filter((s) => s.review_status === "pending").length,
    [sessions],
  );

  const value: CapturedSessionsContextValue = {
    sessions,
    loading,
    pendingCount,
    refresh: load,
    markReviewed: (id) => markStatus(id, "reviewed"),
    markDismissed: (id) => markStatus(id, "dismissed"),
  };

  return (
    <CapturedSessionsContext.Provider value={value}>
      {children}
    </CapturedSessionsContext.Provider>
  );
};

/**
 * Mock provider — exposes the same context shape backed by synthetic data so
 * milestone 4 UI work can proceed without Strava OAuth being live. Swap in
 * place of `CapturedSessionsProvider` to drive the review screen off fixtures.
 */
export const MockCapturedSessionsProvider = ({
  children,
  initialSessions,
}: {
  children: React.ReactNode;
  initialSessions?: CapturedSessionRow[];
}) => {
  const [sessions, setSessions] = useState<CapturedSessionRow[]>(
    () => initialSessions ?? defaultMockSessions(),
  );

  const markStatus = (id: string, status: ReviewStatus): Promise<void> => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, review_status: status } : s)),
    );
    return Promise.resolve();
  };

  const pendingCount = useMemo(
    () => sessions.filter((s) => s.review_status === "pending").length,
    [sessions],
  );

  const value: CapturedSessionsContextValue = {
    sessions,
    loading: false,
    pendingCount,
    refresh: () => Promise.resolve(),
    markReviewed: (id) => markStatus(id, "reviewed"),
    markDismissed: (id) => markStatus(id, "dismissed"),
  };

  return (
    <CapturedSessionsContext.Provider value={value}>
      {children}
    </CapturedSessionsContext.Provider>
  );
};

export const useCapturedSessions = (): CapturedSessionsContextValue => {
  const ctx = useContext(CapturedSessionsContext);
  if (!ctx) {
    throw new Error(
      "useCapturedSessions must be used within a CapturedSessionsProvider",
    );
  }
  return ctx;
};

/**
 * Read the provider-normalized activity type from a captured session row.
 * Prefers `aggregates.activity_type` (populated by the sync layer); falls back
 * to `raw_payload.type` (Strava's raw field) when the sync hasn't run yet.
 * Returns null when neither is available.
 */
export const getActivityType = (
  session: CapturedSessionRow,
): string | null => {
  const fromAggregates = session.aggregates?.activity_type;
  if (typeof fromAggregates === "string" && fromAggregates.length > 0) {
    return fromAggregates;
  }
  const raw = session.raw_payload as Record<string, unknown> | null;
  if (raw && typeof raw.type === "string" && raw.type.length > 0) {
    return raw.type;
  }
  return null;
};

export type ReviewMode = "lifting" | "cardio" | "mixed" | "empty";

/**
 * Strava-normalized activity types we treat as primarily cardio. A session of
 * one of these types is rendered as `cardio` mode regardless of whether
 * detection found discrete sets — interval bookends are false positives, not
 * real strength sets, in cardio context.
 */
const CARDIO_ACTIVITY_TYPES = new Set<string>([
  "Run",
  "TrailRun",
  "VirtualRun",
  "Ride",
  "VirtualRide",
  "EBikeRide",
  "MountainBikeRide",
  "GravelRide",
  "Walk",
  "Hike",
  "Swim",
  "Rowing",
  "Kayaking",
  "Canoeing",
  "StandUpPaddling",
  "Surfing",
  "AlpineSki",
  "BackcountrySki",
  "NordicSki",
  "Snowshoe",
  "IceSkate",
  "InlineSkate",
  "RollerSki",
  "Elliptical",
  "StairStepper",
]);

export const isCardioActivityType = (activityType: string | null): boolean =>
  activityType !== null && CARDIO_ACTIVITY_TYPES.has(activityType);

/**
 * Pick the review UI mode from two independent signals: the provider-reported
 * activity category (Strava `type`), and how many discrete sets the detection
 * module found.
 *
 * 5-row matrix:
 *   1. cardio activity type           → cardio   (regardless of detected sets)
 *   2. WeightTraining + sets > 0      → lifting
 *   3. WeightTraining + sets == 0     → empty    (detection missed; manual)
 *   4. Workout/Crossfit + distance>0  → mixed    (when sets > 0)
 *                       + sets > 0
 *   5. anything else                  → set-count fallback (sets > 0 → lifting,
 *                                       distance > 0 → cardio, else empty)
 */
export const inferReviewMode = (
  activityType: string | null,
  detectedSetCount: number,
  aggregates: SessionAggregates,
): ReviewMode => {
  // Row 1
  if (isCardioActivityType(activityType)) return "cardio";

  // Rows 2 & 3
  if (activityType === "WeightTraining") {
    return detectedSetCount > 0 ? "lifting" : "empty";
  }

  const hasCardioAggregates = (aggregates.distance_m ?? 0) > 0;

  // Row 4
  const isMixedCategory =
    activityType === "Workout" || activityType === "Crossfit";
  if (isMixedCategory && hasCardioAggregates && detectedSetCount > 0) {
    return "mixed";
  }
  if (isMixedCategory) {
    return detectedSetCount > 0 ? "lifting" : "empty";
  }

  // Row 5: fall back on signals
  if (hasCardioAggregates && detectedSetCount > 0) return "mixed";
  if (hasCardioAggregates) return "cardio";
  return detectedSetCount > 0 ? "lifting" : "empty";
};

/** Convert a synthetic CapturedSession into a row matching the DB shape. */
export const synthSessionToRow = (
  session: CapturedSession,
  overrides: Partial<CapturedSessionRow> = {},
): CapturedSessionRow => ({
  id: session.id,
  user_id: "mock-user",
  provider: session.provider,
  external_id: session.external_id,
  started_at: session.started_at,
  ended_at: session.ended_at,
  raw_payload: session.raw_payload,
  hr_samples: session.hr_samples,
  motion_samples: session.motion_samples,
  aggregates: session.aggregates,
  review_status: "pending",
  created_at: new Date().toISOString(),
  ...overrides,
});

const defaultMockSessions = (): CapturedSessionRow[] => [
  synthSessionToRow(cleanLiftingSession({ seed: 1 })),
  synthSessionToRow(noisyHRSession({ seed: 2 })),
  synthSessionToRow(cardioRunSession({ seed: 3 })),
  synthSessionToRow(mixedSession({ seed: 4 })),
];
