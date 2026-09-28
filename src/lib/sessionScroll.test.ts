import { describe, expect, it } from "vitest";
import { followsCurrentSet, revealScrollTop, type RevealMeasure } from "./sessionScroll";

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

describe("revealScrollTop", () => {
  // iPhone SE: 667 tall, status bar 20 + 16 gap above, bar footprint 96 below.
  const se = (over: Partial<RevealMeasure>): RevealMeasure => ({
    scrollY: 0,
    viewportHeight: 667,
    cardTop: 140,
    topMargin: 36,
    current: null,
    ...over,
  });

  it("brings a short card's top to the top", () => {
    expect(
      revealScrollTop(
        se({ scrollY: 300, cardTop: -160, current: { top: -40, bottom: 80, bottomMargin: 96 } }),
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
      current: { top: 621, bottom: 758, bottomMargin: 96 },
    });
    const top = revealScrollTop(measure);
    expect(top).toBe(758 + 96 - 667);
    // Where things sit after that scroll:
    expect(measure.current!.bottom - top).toBe(667 - 96); // clear of the bar, to the pixel
    expect(measure.cardTop - top).toBeLessThan(36); // the card's top gave way
  });

  it("leaves the card's top at the top when the current set just fits", () => {
    const fits = se({ cardTop: 140, current: { top: 500, bottom: 675, bottomMargin: 96 } });
    // Card at the top = scroll 104; the set then ends at 571 = 667 - 96.
    expect(revealScrollTop(fits)).toBe(104);
    const over = se({ cardTop: 140, current: { top: 501, bottom: 676, bottomMargin: 96 } });
    expect(revealScrollTop(over)).toBe(105);
  });

  it("counts a rest under the button as part of the current set", () => {
    const resting = se({ cardTop: 140, current: { top: 480, bottom: 760, bottomMargin: 96 } });
    expect(revealScrollTop(resting)).toBe(760 + 96 - 667);
  });

  it("never scrolls the set's own row off the top of a very short screen", () => {
    const tiny: RevealMeasure = {
      scrollY: 0,
      viewportHeight: 320,
      cardTop: 100,
      topMargin: 36,
      current: { top: 400, bottom: 680, bottomMargin: 96 },
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
          current: { top: 621 - scrollY, bottom: 758 - scrollY, bottomMargin: 96 },
        }),
      );
    expect(from(0)).toBe(187);
    expect(from(520)).toBe(187);
    expect(from(1200)).toBe(187);
  });

  it("never asks for a negative offset", () => {
    expect(revealScrollTop(se({ scrollY: 0, cardTop: 20 }))).toBe(0);
    expect(
      revealScrollTop(se({ cardTop: 20, current: { top: 60, bottom: 200, bottomMargin: 96 } })),
    ).toBe(0);
  });
});
