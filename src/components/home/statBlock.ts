/* ── What Home's card index opens with. An empty history array means three
   different things — still loading, a new account, a load that failed — and
   only one of them may be shown as numbers. The decision lives here so the
   screen cannot print a failed load as the lifter's own zero. ── */

export type HomeStatBlock =
  /** No workouts logged yet, and a saved plan to preview. */
  | "plan"
  /** No workouts logged yet, nothing saved: one line about what comes. */
  | "first-workout"
  /** The history could not be loaded and there is nothing to show for it. */
  | "load-failed"
  /** The week and month numbers — or their skeletons while loading. */
  | "stats";

export const homeStatBlock = (args: {
  /** Both the history and the saved-workouts queries have settled. */
  dataReady: boolean;
  logsLoadFailed: boolean;
  logCount: number;
  templateCount: number;
}): HomeStatBlock => {
  const { dataReady, logsLoadFailed, logCount, templateCount } = args;
  if (!dataReady) return "stats";
  // A failed RELOAD keeps the history that was already loaded, and those
  // numbers are still true — only an empty list is unknown.
  if (logCount > 0) return "stats";
  if (logsLoadFailed) return "load-failed";
  // A failed saved-workouts query leaves templateCount at 0: the account
  // still has no history, and that much is known.
  return templateCount > 0 ? "plan" : "first-workout";
};
