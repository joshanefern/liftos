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
       finish   when every set is logged, "Finish workout" is a card of its
                own under the focus card. Does the page bring it into
                view? Once, when it appears — the last open set logged or
                removed — so the lifter sees it without scrolling for it.
       reveal   where the page lands when the focus is re-pointed (an
                exercise picked or added, "Continue to …"). The card's top
                goes to the top of the screen — unless the card is taller
                than the room above the session bar. Then what the lifter
                does next wins (the current set, or the finish card): the
                page stops where that is clear of the bar, and the card's
                top is what gets cut off.

     "Clear of the bar" for the finish card also means clear of the voice
     receipt while it is up: it rides fixed just above the bar, and after
     a last set logged by voice it is there for seconds — a Finish under
     it is a tap on the receipt's Edit (finishClearance). ── */

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

/** Should the page bring the finish card into view? When it has just
    appeared (`wasShown` false), or the screen opened on it (`wasShown`
    null, asked for the first time) — never while it simply stays: the
    lifter may be reading back through the list, and a set fixed or a
    rest ending must not pull the page away. Whatever makes it appear is
    something the lifter did: it comes only with the last open set logged
    or removed. */
export const followsFinish = (wasShown: boolean | null, nowShown: boolean): boolean =>
  nowShown && wasShown !== true;

/** Measurements for a reveal, in CSS pixels. Tops and bottoms are relative
    to the viewport, as getBoundingClientRect reports them. */
export type RevealMeasure = {
  scrollY: number;
  viewportHeight: number;
  /** Top edge of the focus card. */
  cardTop: number;
  /** Room kept above whatever is brought to the top (status bar + gap). */
  topMargin: number;
  /** What the lifter taps next, which must end up clear of the session
      bar: the current set — its row, "Complete set" and a rest under it —
      or, with every set logged, the finish card under the focus card.
      null when there is neither. */
  keepClear: {
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
  keepClear,
}: RevealMeasure): number => {
  const cardAtTop = scrollY + cardTop - topMargin;
  if (keepClear === null) return Math.max(0, cardAtTop);
  // The least scroll that lifts it clear of the bar…
  const clear = scrollY + keepClear.bottom + keepClear.bottomMargin - viewportHeight;
  // …and the most that still keeps its top on screen: on a screen too
  // short for all of it, the set's row and its button outrank the rest.
  const atTop = scrollY + keepClear.top - topMargin;
  return Math.max(0, Math.min(Math.max(cardAtTop, clear), atTop));
};

/** The gap kept between the finish card and the voice receipt, in CSS
    pixels. */
export const RECEIPT_GAP = 12;

/** The room the finish card keeps under it, in CSS pixels: the session
    bar's footprint (`barMargin`, its scroll margin) — or, while the voice
    receipt is up (`receiptTop`, its top edge in the viewport; null when
    there is none), everything from the receipt's top down, plus a gap.
    A receipt that sits lower than the bar's margin changes nothing. */
export const finishClearance = (
  barMargin: number,
  viewportHeight: number,
  receiptTop: number | null,
): number =>
  receiptTop === null ? barMargin : Math.max(barMargin, viewportHeight - receiptTop + RECEIPT_GAP);

/** One scroller and a box inside it, in the frame getBoundingClientRect
    reports: the box's edges, and the band of the scroller it has to end
    up in (`from`..`to`, the scroller's edges less the room kept at each). */
export type NearestMeasure = {
  scrollTop: number;
  top: number;
  bottom: number;
  from: number;
  to: number;
};

/** The least scroll that brings the box inside the band — what
    scrollIntoView({ block: "nearest" }) does, with the band's edges
    chosen by the caller instead of read off scroll margins. A box already
    inside stays put; a box taller than the band keeps its top in view. */
export const nearestScrollTop = ({ scrollTop, top, bottom, from, to }: NearestMeasure): number => {
  if (top < from) return Math.max(0, scrollTop - (from - top));
  if (bottom > to) return scrollTop + Math.min(bottom - to, top - from);
  return scrollTop;
};
