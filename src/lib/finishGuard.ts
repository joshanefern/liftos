/* ── "Finish workout", right after the last set.

     Logging the workout's last open set takes "Complete set" away: the
     set folds to a line, the exercise card shrinks, and the finish card
     under it — "Every set is logged" with a filled "Finish workout" —
     comes up, with the page following it into view. That button lands
     close to where the lifter's finger just was. The cards' short touch
     guard covers a double tap. It does not cover a slow one — and here
     the second tap would not repeat the first, it would END THE WORKOUT.
     So for a fixed moment after that set is logged, the finish card's
     button sits out.

     It looks the same throughout: a button that greys out and comes back
     reads as broken. The header's Finish is elsewhere on screen and takes
     no part in this. ── */

/** How long the finish card's "Finish workout" ignores taps after the
    last open set was logged. Longer than a slow double tap, shorter than
    reading the button and deciding to press it. */
export const FINISH_GUARD_MS = 1000;

/** True while the finish card's "Finish workout" must not respond. Both
    times come from the same clock; `loggedAt` is null until a last set
    has been logged on this screen. A clock that ran backwards holds
    nothing — the button must never stay dead. */
export const finishGuarded = (loggedAt: number | null, now: number): boolean => {
  if (loggedAt === null) return false;
  const since = now - loggedAt;
  return since >= 0 && since < FINISH_GUARD_MS;
};
