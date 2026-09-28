/* ── When the live workout screen moves the page, and where to.

     The page is the lifter's. It scrolls by itself only as a consequence
     of something they just did — a set logged, an exercise picked, a set
     added or removed. Two decisions, kept here so the screen cannot drift
     from them:

       follow   after the focus card re-lays itself out, does the page
                follow the current set? Yes when the current set changed,
                or a rest opened under its button (the card grew). Never
                when the rest block LEAVES: a rest runs out on its own,
                quite possibly while the lifter is reading the exercise
                list further down, and a shorter card puts nothing out of
                reach.
       reveal   where the page lands when the focus is re-pointed (an
                exercise picked or added, "Continue to …"). The card's top
                goes to the top of the screen — unless the card is taller
                than the room above the session bar. Then the current set
                wins: the page stops where that set is clear of the bar,
                and the card's top is what gets cut off. ── */

/** What the follow decision looks at, as of one render. */
export type FollowState = {
  /** The current set's id; null when the card has no open set. */
  setId: string | null;
  /** Whether the rest block is in the card. */
  restShown: boolean;
};

/** Should the page follow the current set, given the card as it was the
    last time this was asked (`was`, null the first time) and as it is? */
export const followsCurrentSet = (was: FollowState | null, now: FollowState): boolean => {
  if (now.setId === null) return false;
  if (was === null) return true;
  if (was.setId !== now.setId) return true;
  return !was.restShown && now.restShown;
};

/** Measurements for a reveal, in CSS pixels. Tops and bottoms are relative
    to the viewport, as getBoundingClientRect reports them. */
export type RevealMeasure = {
  scrollY: number;
  viewportHeight: number;
  /** Top edge of the focus card. */
  cardTop: number;
  /** Room kept above whatever is brought to the top (status bar + gap). */
  topMargin: number;
  /** The current set — its row, "Complete set" and a rest under it — or
      null when the card has no open set. */
  current: {
    top: number;
    bottom: number;
    /** Room kept under it: the session bar's footprint. */
    bottomMargin: number;
  } | null;
};

/** The scroll offset a reveal lands on. */
export const revealScrollTop = ({
  scrollY,
  viewportHeight,
  cardTop,
  topMargin,
  current,
}: RevealMeasure): number => {
  const cardAtTop = scrollY + cardTop - topMargin;
  if (current === null) return Math.max(0, cardAtTop);
  // The least scroll that lifts the current set clear of the bar…
  const setClear = scrollY + current.bottom + current.bottomMargin - viewportHeight;
  // …and the most that still keeps its first row on screen: on a screen
  // too short for the whole set, the row and its button outrank the rest.
  const setAtTop = scrollY + current.top - topMargin;
  return Math.max(0, Math.min(Math.max(cardAtTop, setClear), setAtTop));
};
