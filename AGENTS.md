# LiftOS — agent guide

Strength-training iPhone app. Vite + React 18 + TypeScript + Tailwind, wrapped
with Capacitor 8 for iOS; Supabase (Postgres + edge functions) for auth,
storage and the AI coach/voice interpreters. Owner: Joshane Fernando.

## Commands that must stay green

```bash
npx tsc -p tsconfig.app.json --noEmit   # types (fast, but NOT sufficient — see gotchas)
npx vitest run                          # ~660 unit tests, all pure lib logic
npm run build                           # Vite/SWC production build — the real gate
npx eslint src                          # 1 known react-hooks warning in Dashboard.tsx is accepted
```

Every change to `src/lib/**` ships with a vitest next to it. UI-only changes
still need `npm run build` — `tsc` passing does not mean the bundler accepts
the JSX (SWC rejects bare `{/* */}` comments as direct children of a ternary).

## iOS

Web bundle → native shell: `npm run build && npx cap copy ios`. Verify the
copy landed: `md5 -q dist/index.html` must equal
`md5 -q ios/App/App/public/index.html`.

Device build/install (personal team; profile expires every 7 days):

```bash
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -destination 'platform=iOS,id=00008150-00150880118A401C' \
  -derivedDataPath ~/.liftos-build -allowProvisioningUpdates build
xcrun devicectl device install app --device C883EB18-6C25-5B27-8324-120B7B8BC19B \
  ~/.liftos-build/Build/Products/Debug-iphoneos/App.app
xcrun devicectl device process launch --device C883EB18-6C25-5B27-8324-120B7B8BC19B com.joshanefernando.liftos
```

Simulator builds use the same `-derivedDataPath ~/.liftos-build` with
`-destination 'platform=iOS Simulator,id=<udid>'`. Do not use `ios/App/build`
(stale SPM artifacts from an old path).

The app is **portrait-only** (owner's call): `Info.plist` lists Portrait
alone for iPhone, Portrait + upside-down for iPad, and sets
`UIRequiresFullScreen` (an iPad app that locks orientation must opt out of
Split View). Do not add landscape back.

Native code lives in `ios/App/App/*.swift`. Plugins (`SpeechPlugin`,
`HealthKitPlugin`) are registered by `LiftOSBridgeViewController` — the
storyboard's view controller must stay `LiftOSBridgeViewController`, or the
plugins silently don't exist. The sign-in screen shows `voice ✓ · health ✓`
as a heartbeat.

## Voice diagnostics (device bugs: read the log, don't guess)

The Speech plugin appends every native step and every JS breadcrumb
(`voiceDiag()` in `src/lib/speech.ts`) to `Documents/voice-diag.log`:

```bash
xcrun devicectl device copy from --device C883EB18-6C25-5B27-8324-120B7B8BC19B \
  --source Documents/voice-diag.log --destination /tmp/voice-diag.log \
  --domain-type appDataContainer --domain-identifier com.joshanefernando.liftos
```

Console streaming from a physical iPhone is unreliable; the file is not.

## Supabase

Edge functions in `supabase/functions/*` (`coach`, `voice-log`, …).
**Deploys and `db push` are run by the owner, never by an agent** — say so
and hand over the command (`npx supabase functions deploy voice-log`).
`npx supabase functions list` shows what's live. The `voice-log` function
has two modes: `log` (live set logging) and `plan` (dictating a workout into
the builder); the client detects an un-deployed plan mode and says so.

## Browser QA

`.claude/launch.json` (repo root of the parent workspace) defines `liftos-qa`
on port 8085 (`vite --mode qa`, `.env.qa` sets `VITE_MOCK_AUTH=true`) — a
fixture user with no history, no network writes. `localStorage
liftos-qa-profile` (JSON) overrides fixture profile fields per browser,
e.g. `{"experience":"Beginner"}`. For a lifter WITH history, Playwright
scripts use `scripts/screenshot-fixtures.mjs`: it answers every Supabase
request from memory, so Finish, the recap, Progress and Coach all work.
`node scripts/screenshots.mjs` re-shoots `docs/screenshots` (delete the
folder first).
Seed an active session with `localStorage.liftos_active_workout_session` to
reach the logger; `localStorage.liftos-voice-dev="1"` renders the voice pill
in a browser, `liftos-voice-dev-phase="applied"` mounts the receipt card.

## Active session (src/components/ActiveWorkoutLogger.tsx)

The session follows the selected theme (no forced dark). There is exactly
ONE place to log a set:

- **Focus card** — the exercise being worked: the current set is the open
  row with a single filled "Complete set", later sets are quieter but
  editable (never tickable out of order). When the last open set is
  logged the card STAYS on that exercise (Finish workout + Add set), so
  one more set is one tap away.
- **Logged sets** fold to one-line rows (`CompletedSetRow`) that are two
  controls. The CHECK un-marks the set in one tap — no confirm, numbers
  kept, it is an open set again and the focus rules decide what is
  current (a finished exercise stops being finished). The NUMBERS open
  the set's cells in place: edits save as typed, the set stays logged
  with its check (which still un-marks it), and the row folds back when
  the lifter leaves it — a tap elsewhere, focus moving on, Enter on its
  last field, or a pick (`useFoldOnLeave`, which folds only AFTER the tap
  landed, so nothing jumps under the finger). There is no Save and no
  "Mark not done". A value emptied while fixing a set stays empty: the
  set stays logged and reads whatever is left ("135 lb", or "Done"), the
  same as a set logged without numbers — and while it is open the cell
  shows "—" ("BW"), never a hint. Un-marking a set drops it from the voice
  recency list, so "that was 12" / "scratch that" never reach it. A set
  that stops being logged while open (voice scratch/Undo) is not open any
  more: logged again, it comes back folded.
- **Rest** is the lifter's choice: the rest timer setting
  (`src/lib/restTimerPrefs.ts`, localStorage `liftos-rest-timer`) is OFF
  until they add it, with 2:00 ready as the length. It is set in the rest
  timer sheet (`RestTimerSheet`): a switch, preset lengths and a ±15 s
  stepper (0:15–10:00). Changes apply at once and are remembered; there
  is no Save. Reached from the ⋯ sheet's first row ("Rest timer · Off" /
  "2:00 after each set") or by tapping a running "Rest · m:ss". Turning
  it off ends a running rest quietly; a new length is for the NEXT rest.
  The sheet keeps one height: with the timer off the length controls stay,
  dimmed and inert, so the switch never moves out from under the thumb.
- **A rest belongs to the exercise whose set started it** (`RestOwner`,
  rules in `src/lib/sessionFocus.ts` "Rest"). Logging ANY set (button,
  Enter, warm-up tick, "Complete remaining sets", voice — a voice
  correction is not a new set, and a voice log that replaces an earlier
  one is judged against the session with that one taken back:
  `voiceLoggedSet`) first ends whatever rest is running —
  quietly, no buzz, no pulse — and a new one starts only if the timer is
  on AND that exercise still has an open working set. So there is never a
  rest after an exercise's last set, and nothing is "owed" for later. A
  running rest also ends when its exercise is finished some other way or
  the set that started it is un-marked (tap, "scratch that", voice Undo);
  un-marking any other set, or picking another exercise to look at,
  leaves it running. It lives INSIDE the card, directly UNDER "Complete
  set" (`RestBlock`: countdown, "Next: …" = the owning exercise's next
  set, +30 sec, Skip rest) — nothing the rest does may move that button.
  In another exercise's card (picked to look at) it is named by its owner
  instead ("Bench Press rest · 1:58", no "Next:").
  There is no separate rest bar, and logging during rest must just work.
  A rest running at Minimize comes back as it was (length and owner),
  whatever the setting says by then.
- **All exercises · N** — a compact switcher under the card. Tapping a row
  re-points the focus card (a finished one too — that is how a finished
  exercise is gone back into); it never opens a second set of inputs. A
  finished exercise keeps its check here as a status marker.
- **⋯ sheet** — the rare actions: Rest timer (first), "Remove set N" for
  an open set (never the only set; rules in `src/lib/sessionSets.ts`),
  and Discard.

Touch and scroll rules on this screen (each exists because a tap once
landed on the wrong thing):

- The card AND the exercise list ignore touches for 400ms after the card's
  layout changes — a set logged (by hand or by voice) or un-marked, a set
  being fixed folding back, a rest skipped or ending, a set added/removed,
  the card re-pointed by a pick or "Continue to …" — so a double tap
  cannot land on whatever slid under the finger (a double tap on
  "Complete set" never reaches the new check and un-marks the set it just
  logged). Opening a logged set to fix it is deliberately NOT guarded: a
  second tap would pass through the sitting-out card to the page and
  fold the row it had just opened.
- The card's "Finish workout" sits out 1000ms after the workout's LAST open
  set is logged (`src/lib/finishGuard.ts`): it has just taken the place of
  "Complete set". It looks identical while held. The header's Finish is
  elsewhere and unaffected.
- The page follows the current set only after something the lifter did. A
  rest ending on its own never moves the scroll (`followsCurrentSet` in
  `src/lib/sessionScroll.ts`). When the card moves on to another exercise,
  or is re-pointed, it is revealed with its name on screen — unless that
  would leave the current set under the session bar, in which case the set
  wins (`revealScrollTop`).

Cardio is ALWAYS timed: `trackingFor` returns "time" for `kind: "cardio"`
whatever the name or tracking field says. Voice Undo is a three-way merge
(`src/lib/voiceRevert.ts`) — it reverts only what voice changed and the
lifter has not touched since. Speech that resumes in the grace window
replaces the first log only once it has been UNDERSTOOD
(`src/lib/voiceSupersede.ts`); a bare "scratch that" / "that was 12" amends
the log it follows and never reaches past it to a hand-logged set.

Which exercise/set is current, what is "next", and their labels are pure
decisions in `src/lib/sessionFocus.ts` (tests are the spec). Voice, Edit
and "add exercise" re-point the focus instead of scrolling to a card.

The tab bar is hidden while a session is live. The controls (Minimize ·
voice pill · Exercise) sit on a FLOATING pill, `SessionBar`, portalled to
body. Its footprint lives in `src/components/logging/sessionBarLayout.ts`
— page padding and anything fixed above the bar (voice receipt) derive
from those constants, never from hand-written offsets. Phone padding also
leans on `<main>`'s `pb-[calc(4rem+var(--safe-bottom))]` in `App.tsx`;
change one and you change the other. Finish is secondary; Discard lives in
the ⋯ sheet.

## Workout builder (src/pages/Workouts.tsx)

Leaving the builder with unsaved work always asks first ("Discard this
workout?" — Keep editing / Discard): tap outside, X, Escape, swipe-down,
browser Back, tab close. With nothing entered it closes instantly. "Unsaved
work" is `hasUnsavedWork` in `src/lib/builderDraft.ts`. A refused swipe is
re-seated by `src/components/workouts/reseatSheet.ts`, which reaches into
vaul 0.9.9's inline styles — re-test it after any vaul upgrade. A window
resized across 768px (web only — the iOS app is portrait-only) swaps
drawer ⇄ dialog and withdraws an open question; the next way out asks
again. At the saved-workout cap (`MAX_TEMPLATES`) "New workout" is refused
up front with the limit notice
(`src/lib/templateLimit.ts`) — never after the lifter has built something.

## Copy rules

- "Workout" is one session. "Program"/"plan" only spans several days.
- Missing data is never a failure: no "0 of 8 weeks", no "Rest" for a day
  that simply has no log, no percentage against a window the account did
  not exist for (`historyCovers`, `weeksTrained` in `src/lib/consistency.ts`).
- A button says what it does. "Quick start" is the one name for an empty
  workout, app-wide.

## Design system (do not drift)

Warm charcoal / porcelain surfaces, raspberry primary, **no gold**. Every
color is a token (`bg-card`, `text-fg`, `text-fg-muted`, `hsl(var(--primary))`)
— both themes must mirror; the light/dark toggle is two-state. Sheets are
vaul drawers with a grabber, a built-in X, blurred backdrop, and
tap-outside-to-close. Toasts are iOS-style banners below the Dynamic Island
(`src/components/ui/toast.tsx`). Numbers are `mono`/`stat-scoreboard`.

## Voice model (the part most likely to bite)

- Native `SpeechPlugin` chains recognition segments (iOS ends tasks on its
  own; the on-device recognizer can silently reset its transcript mid-task —
  a collapse to a few chars is a reset, and gets banked, not lost).
- The final transcript is chosen by `src/lib/voiceTranscript.ts`
  (`chooseTranscript`): a "final" shorter than half the longest partial is a
  truncation. Same rule in Swift (`chosenTranscript`). Keep them identical.
- Endpointing is Jarvis-style: short pause fires, mic stays open, continued
  speech supersedes (logger: undo + re-apply; builder: rows replaced).
- Receipt lines are "<Exercise> · <detail>" (units spelled out); the UI splits
  on the first " · ". `correct`/`undo` actions rewrite or scratch the LAST
  logged set and never add one. `touched[]` tells the UI which row to focus.
- All hallucination guards live client-side in `src/lib/voiceApply.ts` and
  `src/lib/voiceUnilateral.ts` ("each arm" = one set). Tests are the spec.

## Conventions

- Comments explain constraints the code can't show; no changelog comments.
- Commit per feature with a plain-English subject. Push to
  `origin/backend/app-completion` unless told otherwise.
- Don't add dependencies for things `src/lib` already does.
