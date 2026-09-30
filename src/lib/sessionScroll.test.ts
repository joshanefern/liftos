import { describe, expect, it } from "vitest";
import {
  RECEIPT_GAP,
  finishClearance,
  followsCurrentSet,
  followsFinish,
  nearestScrollTop,
  revealScrollTop,
  type RevealMeasure,
} from "./sessionScroll";

describe("followsCurrentSet", () => {
  it("follows when the screen opens on a set", () => {
    expect(followsCurrentSet(null, { setId: "s1", restShown: false })).toBe(true);
    // Resumed mid-rest.
    expect(followsCurrentSet(null, { setId: "s1", restShown: true })).toBe(true);
  });

  it("follows a set that was just logged (the next one becomes current)", () => {
    expect(
      followsCurrentSet({ setId: "s1", restShown: false }, { setId: "s2", restShown: true }),
    ).toBe(true);
    // Logged during a rest: the rest restarts, the block never left.
    expect(
      followsCurrentSet({ setId: "s2", restShown: true }, { setId: "s3", restShown: true }),
    ).toBe(true);
  });

  it("follows a pick, and a set added to a finished exercise", () => {
    expect(
      followsCurrentSet({ setId: "bench-3", restShown: false }, { setId: "press-1", restShown: false }),
    ).toBe(true);
    expect(
      followsCurrentSet({ setId: null, restShown: false }, { setId: "new", restShown: false }),
    ).toBe(true);
  });

  it("follows a rest that opens under the button — the card grew", () => {
    expect(
      followsCurrentSet({ setId: "new", restShown: false }, { setId: "new", restShown: true }),
    ).toBe(true);
  });

  it("NEVER moves the page when the rest block leaves", () => {
    // Ran out on its own, or was skipped: same set, block gone.
    expect(
      followsCurrentSet({ setId: "s2", restShown: true }, { setId: "s2", restShown: false }),
    ).toBe(false);
  });

  it("does nothing when nothing changed", () => {
    expect(
      followsCurrentSet({ setId: "s2", restShown: true }, { setId: "s2", restShown: true }),
    ).toBe(false);
    expect(
      followsCurrentSet({ setId: "s2", restShown: false }, { setId: "s2", restShown: false }),
    ).toBe(false);
  });

  it("has nothing to follow when the card has no open set", () => {
    expect(followsCurrentSet(null, { setId: null, restShown: false })).toBe(false);
    expect(
      followsCurrentSet({ setId: "last", restShown: true }, { setId: null, restShown: false }),
    ).toBe(false);
  });
});

describe("followsFinish", () => {
  it("brings the finish card into view the moment it appears", () => {
    // The last open set logged (or removed): the card shrank, and the
    // finish card under it may be under the bar or below the fold.
    expect(followsFinish(false, true)).toBe(true);
  });

  it("brings it into view when the screen opens on it", () => {
    // A resumed workout with every set logged.
    expect(followsFinish(null, true)).toBe(true);
  });

  it("leaves the page alone while it simply stays", () => {
    // A logged set fixed, a finished exercise picked, the list read back.
    expect(followsFinish(true, true)).toBe(false);
  });

  it("has nothing to follow when there is no finish card", () => {
    expect(followsFinish(null, false)).toBe(false);
    expect(followsFinish(false, false)).toBe(false);
    // A set un-marked or added: the card goes away, the page stays put.
    expect(followsFinish(true, false)).toBe(false);
  });
});

describe("revealScrollTop", () => {
  // iPhone SE: 667 tall, status bar 20 + 16 gap above, bar footprint 96 below.
  const se = (over: Partial<RevealMeasure>): RevealMeasure => ({
    scrollY: 0,
    viewportHeight: 667,
    cardTop: 140,
    topMargin: 36,
    keepClear: null,
    ...over,
  });

  it("brings a short card's top to the top", () => {
    expect(
      revealScrollTop(
        se({ scrollY: 300, cardTop: -160, keepClear: { top: -40, bottom: 80, bottomMargin: 96 } }),
      ),
    ).toBe(300 - 160 - 36);
  });

  it("brings the card's top to the top when it has no open set", () => {
    expect(revealScrollTop(se({ scrollY: 200, cardTop: 90 }))).toBe(200 + 90 - 36);
  });

  it("lets the current set win over the card's top when the card is too tall", () => {
    // 4 warm-ups + 5 sets, 4 logged: with the card's top at the top (36)
    // the current set would end at 654 — under the bar (595).
    const measure = se({
      scrollY: 0,
      cardTop: 140,
      keepClear: { top: 621, bottom: 758, bottomMargin: 96 },
    });
    const top = revealScrollTop(measure);
    expect(top).toBe(758 + 96 - 667);
    // Where things sit after that scroll:
    expect(measure.keepClear!.bottom - top).toBe(667 - 96); // clear of the bar, to the pixel
    expect(measure.cardTop - top).toBeLessThan(36); // the card's top gave way
  });

  it("leaves the card's top at the top when the current set just fits", () => {
    const fits = se({ cardTop: 140, keepClear: { top: 500, bottom: 675, bottomMargin: 96 } });
    // Card at the top = scroll 104; the set then ends at 571 = 667 - 96.
    expect(revealScrollTop(fits)).toBe(104);
    const over = se({ cardTop: 140, keepClear: { top: 501, bottom: 676, bottomMargin: 96 } });
    expect(revealScrollTop(over)).toBe(105);
  });

  it("counts a rest under the button as part of the current set", () => {
    const resting = se({ cardTop: 140, keepClear: { top: 480, bottom: 760, bottomMargin: 96 } });
    expect(revealScrollTop(resting)).toBe(760 + 96 - 667);
  });

  it("keeps the finish card clear of the bar when every set is logged", () => {
    // A finished exercise picked while nothing is left: five logged rows,
    // then the finish card (130 tall) under the card.
    const done = se({ cardTop: 140, keepClear: { top: 600, bottom: 730, bottomMargin: 96 } });
    const top = revealScrollTop(done);
    expect(top).toBe(730 + 96 - 667);
    expect(done.keepClear!.bottom - top).toBe(667 - 96); // its button is tappable
    expect(done.cardTop - top).toBeLessThan(36); // the card's top gave way
    // A short card with the finish card already clear: the card's top wins.
    const short = se({ cardTop: 140, keepClear: { top: 360, bottom: 490, bottomMargin: 96 } });
    expect(revealScrollTop(short)).toBe(140 - 36);
  });

  it("never scrolls the set's own row off the top of a very short screen", () => {
    const tiny: RevealMeasure = {
      scrollY: 0,
      viewportHeight: 320,
      cardTop: 100,
      topMargin: 36,
      keepClear: { top: 400, bottom: 680, bottomMargin: 96 },
    };
    // Clearing the bar would need 456; the row is kept at the top instead.
    expect(revealScrollTop(tiny)).toBe(400 - 36);
  });

  it("works from any scroll position", () => {
    const from = (scrollY: number): number =>
      revealScrollTop(
        se({
          scrollY,
          cardTop: 140 - scrollY,
          keepClear: { top: 621 - scrollY, bottom: 758 - scrollY, bottomMargin: 96 },
        }),
      );
    expect(from(0)).toBe(187);
    expect(from(520)).toBe(187);
    expect(from(1200)).toBe(187);
  });

  it("never asks for a negative offset", () => {
    expect(revealScrollTop(se({ scrollY: 0, cardTop: 20 }))).toBe(0);
    expect(
      revealScrollTop(se({ cardTop: 20, keepClear: { top: 60, bottom: 200, bottomMargin: 96 } })),
    ).toBe(0);
  });
});

describe("finishClearance", () => {
  // iPhone SE 2 (320 × 568, no home indicator): the bar's margin is 96.
  it("is the session bar's footprint when there is no voice receipt", () => {
    expect(finishClearance(96, 568, null)).toBe(96);
  });

  it("keeps the finish card above a voice receipt that is up", () => {
    // The expanded "Logged" receipt: 398–486 above a bar at 496.
    const room = finishClearance(96, 568, 398);
    expect(room).toBe(568 - 398 + RECEIPT_GAP);
    // Where the finish card's bottom may sit: above the receipt's top.
    expect(568 - room).toBe(398 - RECEIPT_GAP);
  });

  it("never gives the finish card less room than the bar needs", () => {
    // A receipt that somehow sits lower than the bar's margin.
    expect(finishClearance(96, 568, 520)).toBe(96);
  });
});

describe("nearestScrollTop", () => {
  // A 568-tall viewport: status bar 20 + 16 gap on top, and the finish
  // card kept above a receipt at 398 (386 with the gap).
  const band = { from: 36, to: 386 };

  it("leaves a box that is already inside alone", () => {
    expect(nearestScrollTop({ scrollTop: 300, top: 108, bottom: 253, ...band })).toBe(300);
    expect(nearestScrollTop({ scrollTop: 300, top: 36, bottom: 386, ...band })).toBe(300);
  });

  it("lifts a box whose bottom is under the band's bottom edge, no further", () => {
    // The finish card came up under the receipt (button 404–455 = Edit).
    const top = nearestScrollTop({ scrollTop: 133, top: 327, bottom: 472, ...band });
    expect(top).toBe(133 + (472 - 386));
    expect(472 - (top - 133)).toBe(386); // its bottom now sits on the band's edge
  });

  it("brings a box above the band down to its top edge — the status bar stays clear", () => {
    // Followed from below: the card's title must not land under the clock.
    const top = nearestScrollTop({ scrollTop: 469, top: -66, bottom: 79, ...band });
    expect(top).toBe(469 - 66 - 36);
    expect(-66 - (top - 469)).toBe(36);
  });

  it("keeps the top of a box taller than the band in view", () => {
    expect(nearestScrollTop({ scrollTop: 0, top: 200, bottom: 700, ...band })).toBe(200 - 36);
  });

  it("never asks for a negative offset", () => {
    expect(nearestScrollTop({ scrollTop: 10, top: 0, bottom: 100, ...band })).toBe(0);
  });

  it("works for any scroller: a sheet's list with a checked row below its fold", () => {
    // Rest timer list, 257 tall from 156; "5:00" at 420–464 is out of view.
    expect(nearestScrollTop({ scrollTop: 0, top: 420, bottom: 464, from: 156, to: 413 })).toBe(51);
    // "Custom" with its stepper under it (464–581): both brought in.
    expect(nearestScrollTop({ scrollTop: 0, top: 464, bottom: 581, from: 156, to: 413 })).toBe(168);
  });
});
