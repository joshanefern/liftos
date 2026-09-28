import { useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/* ── The two ways out of the builder that the sheet itself never sees.

   Closing or reloading the tab: the browser's own "Leave site?" prompt,
   armed only while there is unsaved work. Its wording belongs to the
   browser; a page cannot show its own dialog there.

   The browser's Back button: BrowserRouter has no blocker, and a Back press
   cannot be refused, only answered. So while the builder is open it sits on
   a history entry of its own — same URL, marked in state. Back pops that
   entry instead of the page, the page underneath never unmounts, and the
   press is handed to `onBack` to be treated like a tap on the X. Every
   other way of closing calls `release`, which pops the entry so it never
   lingers as a Back press that does nothing.

   Forward is never a way out of an open builder: opening always pushes,
   and a push drops every entry that lay ahead. What stays behind is the
   closed builder's own entry — history entries cannot be deleted — so
   after a close Forward is a press that changes nothing on screen.

   What this cannot catch: a jump of several entries at once (long-press on
   Back, then an older page). The router's own popstate listener runs first
   and React renders the other page before this one is reached, so the
   builder is already unmounted. ── */

const BUILDER_ENTRY = { liftosBuilder: true } as const;

/** True on an entry a builder pushed. React Router 6 keeps the state given
    to navigate() under `usr`; if that ever moves this reads false, and the
    only cost is a Back press that lands on the same page once. */
const onBuilderEntry = (): boolean => {
  const state: unknown = window.history.state;
  if (typeof state !== "object" || state === null) return false;
  const usr: unknown = (state as { usr?: unknown }).usr;
  return typeof usr === "object" && usr !== null && (usr as { liftosBuilder?: unknown }).liftosBuilder === true;
};

type LeaveGuardOptions = {
  /** The builder is open and closing it would lose something. */
  unsaved: boolean;
  /** Back was pressed while the builder was open. The builder's history
      entry is already gone: keep the builder open by calling `hold` again,
      or close it without calling `release`. */
  onBack: () => void;
};

export const useLeaveGuard = ({ unsaved, onBack }: LeaveGuardOptions) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const latest = useRef({ navigate, pathname, onBack });
  latest.current = { navigate, pathname, onBack };
  // True while the builder's entry is the current history entry.
  const held = useRef(false);
  // The page the builder opened on — a Back press has already moved the
  // address bar by the time it is answered.
  const page = useRef(pathname);

  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      // Safari, and Chrome before 119, prompt only when returnValue is set.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  useEffect(() => {
    const onPop = (): void => {
      if (!held.current) return;
      held.current = false;
      latest.current.onBack();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // The page loaded on an entry an earlier builder left behind (a reload
  // with the builder open, Back from another page) and there is no builder
  // to show. The page's own entry is the one underneath: step down to it,
  // so the next Back leaves the page instead of landing on its twin. Once
  // per mount: the step is asynchronous, and an effect run twice (React's
  // strict mode) would read the same entry again and step down two.
  const steppedDown = useRef(false);
  useEffect(() => {
    if (steppedDown.current || held.current || !onBuilderEntry()) return;
    steppedDown.current = true;
    latest.current.navigate(-1);
  }, []);

  /** The builder is opening, or is staying open after a Back press. */
  const hold = useCallback((opening = false): void => {
    if (held.current) return;
    held.current = true;
    if (opening) page.current = latest.current.pathname;
    // Always a push, even when the current entry is one an earlier builder
    // left behind: that entry may have pages ahead of it, and sitting on
    // it would let Forward carry the builder away without a question.
    latest.current.navigate({ pathname: page.current }, { state: BUILDER_ENTRY });
  }, []);

  /** The builder closed by any way other than Back. */
  const release = useCallback((): void => {
    if (!held.current) return;
    held.current = false;
    latest.current.navigate(-1);
  }, []);

  return { hold, release };
};
