// Returning-lifter fixtures for the screenshot sweep. The QA build has a
// fixture user with no history; these intercept every Supabase call in the
// browser and answer from memory, so populated screens (Home, Progress,
// Calendar, recap, Coach) can be captured without an account and without a
// single request reaching the real project.
//
// Nothing here is imported by the app — Playwright only.
import { readFileSync } from "node:fs";

const USER_ID = "qa-mock-user";
const DAY = 86_400_000;

/** VITE_SUPABASE_URL from the env files vite itself reads for `--mode qa`. */
export const supabaseUrl = () => {
  for (const file of [".env.qa", ".env.local", ".env"]) {
    try {
      const match = readFileSync(file, "utf8").match(/^VITE_SUPABASE_URL=(.+)$/m);
      if (match) return match[1].trim().replace(/^["']|["']$/g, "");
    } catch {
      /* file absent — try the next one */
    }
  }
  throw new Error("VITE_SUPABASE_URL not found in .env.qa / .env.local / .env");
};

const b64url = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

/** localStorage seed that makes supabase-js hand back a session without a
    network round-trip — the logger's Finish needs one to reach its insert
    (which the routes below answer). The token is unsigned and only ever
    travels to the interceptor. */
export const sessionSeed = (url) => {
  const ref = new URL(url).hostname.split(".")[0];
  const expiresAt = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
  const user = {
    id: USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: "qa@liftos.local",
    app_metadata: { provider: "email" },
    user_metadata: { first_name: "QA" },
    created_at: new Date(Date.now() - 60 * DAY).toISOString(),
  };
  const accessToken = [
    b64url({ alg: "none", typ: "JWT" }),
    b64url({ sub: USER_ID, role: "authenticated", aud: "authenticated", exp: expiresAt }),
    "fixture",
  ].join(".");
  return {
    [`sb-${ref}-auth-token`]: JSON.stringify({
      access_token: accessToken,
      refresh_token: "fixture-refresh",
      token_type: "bearer",
      expires_in: 365 * 24 * 3600,
      expires_at: expiresAt,
      user,
    }),
  };
};

/* ── The training history ─────────────────────────────────────────────
   Six weeks of Push / Pull / Legs on Mon / Wed / Fri with small weekly
   jumps, so every populated surface has something true to say: records,
   an improvement %, a consistency count, calendar dots, a last workout. */

const PLAN = {
  "Push Day": [
    { name: "Bench Press", sets: 3, reps: 8, start: 175, step: 5 },
    { name: "Overhead Press", sets: 3, reps: 8, start: 90, step: 2.5 },
    { name: "Incline Dumbbell Press", sets: 3, reps: 10, start: 55, step: 2.5 },
    { name: "Triceps Pushdown", sets: 3, reps: 12, start: 50, step: 2.5 },
  ],
  "Pull Day": [
    { name: "Deadlift", sets: 3, reps: 5, start: 275, step: 10 },
    { name: "Barbell Row", sets: 3, reps: 8, start: 135, step: 5 },
    { name: "Lat Pulldown", sets: 3, reps: 10, start: 120, step: 5 },
    { name: "Dumbbell Curl", sets: 3, reps: 12, start: 25, step: 2.5 },
  ],
  "Leg Day": [
    { name: "Back Squat", sets: 3, reps: 6, start: 235, step: 10 },
    { name: "Romanian Deadlift", sets: 3, reps: 8, start: 165, step: 5 },
    { name: "Leg Press", sets: 3, reps: 10, start: 290, step: 10 },
    { name: "Plank", sets: 2, hold: 50, holdStep: 10 },
  ],
};

// Weight moves every second week — a believable pace, and it keeps the
// record counters from reading like every session was a lifetime best.
const stepsAt = (week) => Math.floor(week / 2);

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const templateId = (name) => `tpl-${slug(name)}`;

const exercisesFor = (dayName, week, { completed }) =>
  PLAN[dayName].map((lift) => {
    const timed = lift.hold !== undefined;
    const weight = timed ? undefined : lift.start + lift.step * stepsAt(week);
    const seconds = timed ? lift.hold + lift.holdStep * stepsAt(week) : undefined;
    return {
      id: `${slug(dayName)}-${slug(lift.name)}`,
      name: lift.name,
      ...(timed ? { tracking: "time" } : {}),
      category: "",
      target: timed ? `${lift.sets} × ${seconds}s` : `${lift.sets} × ${lift.reps}`,
      sets: Array.from({ length: lift.sets }, (_, i) => ({
        id: `${slug(dayName)}-${slug(lift.name)}-${i + 1}`,
        ...(timed ? { reps: 0, duration_seconds: seconds } : { reps: lift.reps, weight }),
        ...(completed ? { completed: true } : {}),
      })),
    };
  });

const volumeOf = (exercises) =>
  exercises.reduce(
    (sum, exercise) =>
      sum + exercise.sets.reduce((s, set) => s + (set.reps ?? 0) * (set.weight ?? 0), 0),
    0,
  );

/** Monday 00:00 local of the week containing `date`. */
const mondayOf = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
};

export const buildReturningFixture = (now = new Date()) => {
  const WEEKS = 6;
  const days = [
    { name: "Push Day", offset: 0 },
    { name: "Pull Day", offset: 2 },
    { name: "Leg Day", offset: 4 },
  ];
  const thisMonday = mondayOf(now);
  const logs = [];
  for (let week = 0; week < WEEKS; week += 1) {
    const monday = new Date(thisMonday.getTime() - (WEEKS - 1 - week) * 7 * DAY);
    for (const day of days) {
      const started = new Date(monday);
      started.setDate(started.getDate() + day.offset);
      started.setHours(18, 5, 0, 0);
      const minutes = 52 + ((week + day.offset) % 3) * 4;
      const finished = new Date(started.getTime() + minutes * 60_000);
      // Only sessions that have already happened — never a log from the future.
      if (finished.getTime() > now.getTime() - 3 * 3600_000) continue;
      const exercises = exercisesFor(day.name, week, { completed: true });
      const sets = exercises.reduce((n, e) => n + e.sets.length, 0);
      logs.push({
        id: `log-${week}-${slug(day.name)}`,
        user_id: USER_ID,
        template_id: templateId(day.name),
        name: day.name,
        exercises,
        notes: null,
        started_at: started.toISOString(),
        finished_at: finished.toISOString(),
        duration_minutes: minutes,
        total_sets: sets,
        completed_sets: sets,
        total_volume: volumeOf(exercises),
        source: "manual",
        captured_session_id: null,
        created_at: finished.toISOString(),
      });
    }
  }
  logs.sort((a, b) => b.finished_at.localeCompare(a.finished_at));

  // Templates carry next week's targets — what the lifter is aiming at.
  const templates = days.map((day, i) => ({
    id: templateId(day.name),
    user_id: USER_ID,
    name: day.name,
    exercises: exercisesFor(day.name, WEEKS, { completed: false }),
    created_at: new Date(now.getTime() - (50 - i) * DAY).toISOString(),
  }));

  return { logs, templates };
};

/** A session seed for the logger built from a fixture template. */
export const sessionFromTemplate = (template, minutesIn = 41) =>
  JSON.stringify({
    name: template.name,
    templateId: template.id,
    startedAt: new Date(Date.now() - minutesIn * 60_000).toISOString(),
    exercises: template.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => ({
        id: set.id,
        reps: set.reps ?? "",
        weight: set.weight ?? "",
        ...(set.duration_seconds ? { duration_seconds: set.duration_seconds } : {}),
      })),
    })),
  });

/* ── Coach replies ────────────────────────────────────────────────────
   Canned text pushed through the app's real streaming + markdown path.
   It shows how a reply RENDERS; it is not model output. */

export const COACH_REPLY = [
  "**Keep Push Day, trim it to the three lifts that matter.**",
  "",
  "- **Bench Press** 3 × 8 at 190 lb — you hit 185 × 8 twice, so take the 5 lb.",
  "- **Overhead Press** 3 × 8 at 97.5 lb.",
  "- **Incline Dumbbell Press** 2 × 10 at 62.5 lb.",
  "",
  "Skip the pushdowns today. Rest 2 minutes on bench, 90 seconds on the rest — that lands near 30 minutes.",
].join("\n");

export const insightReply = (logCount) =>
  JSON.stringify({
    bullets: [
      "Bench up 10 lb in six weeks",
      `${logCount} workouts logged since you started`,
      "Squat moved 235 to 255",
      "Plank holds now 70 seconds",
    ],
    next: {
      label: "Plan a deload",
      prompt: "I've trained six weeks without a break — should next week be a deload, and what would it look like?",
    },
  });

const sse = (text) => {
  const words = text.split(/(?<=\s)/);
  const events = words.map(
    (chunk) =>
      `event: content_block_delta\ndata: ${JSON.stringify({
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: chunk },
      })}\n\n`,
  );
  return `${events.join("")}event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`;
};

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "access-control-expose-headers": "content-range",
};

const json = (route, body, status = 200) =>
  route.fulfill({
    status,
    headers: { ...CORS, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

/** Answer every Supabase request from the fixture. `state.saved` collects
    whatever the app inserts, so a finished workout shows up afterwards. */
export const installFixtureRoutes = async (context, fixture, url = supabaseUrl()) => {
  const state = { logs: [...fixture.logs], templates: [...fixture.templates], unhandled: [] };

  await context.route(`${url}/**`, async (route) => {
    const request = route.request();
    const method = request.method();
    const { pathname } = new URL(request.url());
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });

    if (pathname.startsWith("/rest/v1/")) {
      const table = pathname.slice("/rest/v1/".length);
      const wantsObject = (request.headers().accept ?? "").includes("vnd.pgrst.object");
      if (method === "HEAD") {
        const count = table === "workout_templates" ? state.templates.length : 0;
        return route.fulfill({ status: 200, headers: { ...CORS, "content-range": `0-0/${count}` } });
      }
      if (method === "GET") {
        if (table === "workout_logs") {
          const id = new URL(request.url()).searchParams.get("id")?.replace(/^eq\./, "");
          const rows = id ? state.logs.filter((log) => log.id === id) : state.logs;
          return json(route, wantsObject ? rows[0] ?? null : rows);
        }
        if (table === "workout_templates") return json(route, state.templates);
        if (table === "profiles") return json(route, wantsObject ? null : []);
        return json(route, []);
      }
      if (method === "POST" && table === "workout_logs") {
        const body = request.postDataJSON();
        const row = {
          ...(Array.isArray(body) ? body[0] : body),
          id: `log-saved-${state.logs.length}`,
          created_at: new Date().toISOString(),
        };
        state.logs = [row, ...state.logs];
        return json(route, wantsObject ? row : [row], 201);
      }
      if (method === "POST" && table === "workout_templates") {
        const body = request.postDataJSON();
        const row = {
          ...(Array.isArray(body) ? body[0] : body),
          id: `tpl-saved-${state.templates.length}`,
          created_at: new Date().toISOString(),
        };
        state.templates = [row, ...state.templates];
        return json(route, wantsObject ? row : [row], 201);
      }
      // Any other write is acknowledged and dropped — fixtures never persist.
      return json(route, wantsObject ? {} : []);
    }

    if (pathname === "/functions/v1/coach") {
      let body = {};
      try {
        body = request.postDataJSON() ?? {};
      } catch {
        /* not JSON — treated as a plain chat */
      }
      if (body.mode === "insight") return json(route, { insight: "" }, 503);
      const last = body.messages?.[body.messages.length - 1]?.content ?? "";
      const reply = /STRICT JSON/i.test(String(last)) ? insightReply(state.logs.length) : COACH_REPLY;
      return route.fulfill({
        status: 200,
        headers: { ...CORS, "content-type": "text/event-stream" },
        body: sse(reply),
      });
    }

    state.unhandled.push(`${method} ${pathname}`);
    return json(route, {}, 200);
  });

  return state;
};
