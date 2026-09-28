/* ── The saved-workout cap, as the lifter meets it.
   The count taken by the save itself is the authority — another device can
   change the library at any time. What lives here is what the screen can
   know beforehand from the library already in memory, so a full library is
   said BEFORE a workout is built, not after. ── */

export type TemplateLimitNotice = { title: string; description: string };

/** The one wording for a full library, built from the cap itself. */
export const templateLimitNotice = (max: number): TemplateLimitNotice => ({
  title: "Workout limit reached",
  description: `You have ${max} saved workouts — the max. Delete one in Workouts to make room.`,
});

/** True when a NEW saved workout has no room. While the library is still
    loading the count is not known, and not known is not full: the builder
    opens, and the answer arrives with the library. */
export const libraryIsFull = ({
  saved,
  loading,
  max,
}: {
  saved: number;
  loading: boolean;
  max: number;
}): boolean => !loading && saved >= max;
