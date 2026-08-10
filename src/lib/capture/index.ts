export type {
  CapturedSession,
  CaptureProvider,
  DetectedExerciseGroup,
  DetectedSet,
  ExerciseHistoryEntry,
  HRSample,
  MotionSample,
  SessionAggregates,
} from "./types";

export { DETECTION_THRESHOLDS, detectSets } from "./detectSets";
export { GROUPING_THRESHOLDS, groupSetsIntoExercises } from "./groupExercises";

export {
  cardioRunSession,
  cleanLiftingSession,
  mixedSession,
  noisyHRSession,
  singleSetSession,
  tooShortSession,
  withoutMotion,
} from "./syntheticData";
