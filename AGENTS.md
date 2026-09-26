# LiftOS — agent guide

Strength-training iPhone app. Vite + React 18 + TypeScript + Tailwind, wrapped
with Capacitor 8 for iOS; Supabase (Postgres + edge functions) for auth,
storage and the AI coach/voice interpreters. Owner: Joshane Fernando.

## Commands that must stay green

```bash
npx tsc -p tsconfig.app.json --noEmit   # types (fast, but NOT sufficient — see gotchas)
npx vitest run                          # ~390 unit tests, all pure lib logic
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
on port 8085 with `VITE_QA_MOCK_AUTH=1` — a fixture user, no network writes.
Seed an active session with `localStorage.liftos_active_workout_session` to
reach the logger; `localStorage.liftos-voice-dev="1"` renders the voice pill
in a browser, `liftos-voice-dev-phase="applied"` mounts the receipt card.

## Active session (src/components/ActiveWorkoutLogger.tsx)

The session follows the selected theme (no forced dark). The tab bar is
hidden on `/workouts/active`; a fixed session toolbar (Minimize · voice
pill · Exercise) takes its 4rem + safe-bottom footprint, so anything
fixed above it (rest bar, receipt) offsets from that. The "Now" block at
the top shares SetInputRow and state with the list — never duplicate
set logic in it. Finish is secondary; Discard lives in the ⋯ sheet.

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
