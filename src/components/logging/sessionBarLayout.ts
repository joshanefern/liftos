/* ── The floating session bar's footprint, in one place.

   The bar is 3.75rem tall and floats 0.75rem above the home indicator, so
   its top edge sits at safe-bottom + 4.5rem. Everything that has to stay
   clear of it derives from that number — change the bar and these change
   with it. Each value is a complete class name: Tailwind only emits the
   classes it can read whole in the source. ── */

export const SESSION_BAR_BOTTOM = "bottom-[calc(var(--safe-bottom)+0.75rem)]";

export const SESSION_BAR_HEIGHT = "h-[3.75rem]";

/** Fixed surfaces that ride above the bar (the voice receipt): the bar's
    top edge plus a 0.625rem gap. */
export const ABOVE_SESSION_BAR = "bottom-[calc(var(--safe-bottom)+5.125rem)]";

/** Marks the voice receipt's fixed box (present only while it is up), so
    the page can keep the finish card clear of it as well as of the bar:
    a Finish under the receipt is a tap on its Edit. */
export const VOICE_RECEIPT_ATTR = "data-voice-receipt";

/** Scroll margin for anything that must stay tappable mid-page (the
    current set and its "Complete set"): scrolled into view, it stops
    1.5rem above the bar's top edge instead of underneath the bar. */
export const CLEAR_OF_SESSION_BAR = "scroll-mb-[calc(var(--safe-bottom)+6rem)]";

/** Bottom padding for the workout page, so its last control scrolls 1.5rem
    clear of the bar's top edge (safe-bottom + 6rem in all). On phones
    AppShell's <main> already pads 4rem + safe-bottom — the tab bar's slot,
    still reserved while the tab bar is hidden — so the page adds only the
    remaining 2rem. From md up <main> pads nothing. The lg value repeats
    because the page's own lg:p-* would otherwise win at that width. */
export const SESSION_PAGE_CLEARANCE =
  "pb-8 md:pb-[calc(var(--safe-bottom)+6rem)] lg:pb-[calc(var(--safe-bottom)+6rem)]";
