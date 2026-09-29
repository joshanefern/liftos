import { useEffect, useRef, type RefObject } from "react";

/** A tap on something that takes no click (a blank stretch of page on
    iOS) still folds the row, this long after the finger lifts. Long
    enough for the click of a real control to arrive first. */
const NO_CLICK_FOLD_MS = 450;
/** A blur this soon after a touch INSIDE the row is that touch landing on
    a part of the row that takes no focus (its set number), not leaving. */
const INSIDE_TOUCH_MS = 800;

/**
 * Tell the logger when the lifter is done with a logged set they opened
 * to fix: a tap anywhere outside it, or focus moving somewhere outside it
 * (another field, the keyboard dismissed). Scrolling the page is not
 * leaving — a pan cancels its pointer and folds nothing.
 *
 * The row folds only AFTER the tap has done its job. Folding makes the
 * card shorter; done on touch-down, every control below the row would
 * jump up under the finger before its click arrived.
 */
export const useFoldOnLeave = (
  ref: RefObject<HTMLElement | null>,
  /** The open row's set id; null when nothing is open. */
  openId: string | null,
  /** Called with the id that was open when the lifter left it — by then
      another row may have been opened, and that one stays open. */
  onLeave: (id: string) => void,
): void => {
  const onLeaveRef = useRef(onLeave);
  onLeaveRef.current = onLeave;

  useEffect(() => {
    if (openId === null) return;
    const id = openId;
    const inside = (target: EventTarget | null): boolean =>
      target instanceof Node && ref.current !== null && ref.current.contains(target);
    // A tap that went down outside the row and has not yet folded it.
    let tapOutside = false;
    let insideTouchAt = Number.NEGATIVE_INFINITY;
    let noClickFold: number | undefined;
    const leave = (): void => {
      tapOutside = false;
      window.clearTimeout(noClickFold);
      onLeaveRef.current(id);
    };
    const onPointerDown = (e: PointerEvent): void => {
      tapOutside = !inside(e.target);
      if (!tapOutside) insideTouchAt = performance.now();
    };
    const onPointerCancel = (): void => {
      tapOutside = false;
    };
    const onPointerUp = (): void => {
      if (!tapOutside) return;
      window.clearTimeout(noClickFold);
      noClickFold = window.setTimeout(leave, NO_CLICK_FOLD_MS);
    };
    // Bubble phase on document: React's own handler for the control that
    // was tapped (at the app root) has already run.
    const onClick = (e: MouseEvent): void => {
      if (!inside(e.target)) leave();
    };
    const onFocusOut = (e: FocusEvent): void => {
      if (!inside(e.target) || inside(e.relatedTarget)) return;
      // A tap outside moves focus on its way down; its click folds the row.
      if (tapOutside) return;
      if (e.relatedTarget === null && performance.now() - insideTouchAt < INSIDE_TOUCH_MS) return;
      leave();
    };
    // Registered a tick late: the tap that opened the row is still being
    // dispatched, and its click — on a control that has since unmounted —
    // must not read as a tap outside.
    const arm = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointerDown, true);
      document.addEventListener("pointercancel", onPointerCancel, true);
      document.addEventListener("pointerup", onPointerUp, true);
      document.addEventListener("click", onClick);
      document.addEventListener("focusout", onFocusOut, true);
    }, 0);
    return () => {
      window.clearTimeout(arm);
      window.clearTimeout(noClickFold);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointercancel", onPointerCancel, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("click", onClick);
      document.removeEventListener("focusout", onFocusOut, true);
    };
  }, [openId, ref]);
};
