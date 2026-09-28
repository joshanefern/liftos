/* vaul 0.9.9 re-seats a sheet only when IT decides the sheet stays open (a
   short, slow drag). When a swipe is long or fast enough to close and the
   owner of a controlled `open` refuses, vaul has already let go: the sheet
   stays wherever the finger left it and the scrim stays as faded as the
   drag made it. This puts both back, with vaul's own curve and duration so
   it reads as the sheet springing back. */
const SPRING = "0.5s cubic-bezier(0.32, 0.72, 0, 1)";

export const reseatSheet = (sheet: HTMLElement | null): void => {
  if (!sheet) return;
  sheet.style.transition = `transform ${SPRING}`;
  sheet.style.transform = "translate3d(0, 0, 0)";
  // DrawerContent renders the scrim immediately before the sheet, in the
  // same portal.
  const scrim = sheet.previousElementSibling;
  if (scrim instanceof HTMLElement && scrim.hasAttribute("data-vaul-overlay")) {
    scrim.style.transition = `opacity ${SPRING}`;
    scrim.style.opacity = "1";
  }
};
