import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createContext, lazy, Suspense, useContext, useEffect, useMemo, useRef, useState } from "react";
import { UserProvider } from "@/context/UserContext";
import { HealthKitAutoSync } from "@/hooks/useHealthKitAutoSync";
import { ThemeProvider } from "@/context/ThemeContext";
import {
  CapturedSessionsProvider,
  MockCapturedSessionsProvider,
} from "@/context/CapturedSessionsProvider";
import { WorkoutLogsProvider } from "@/hooks/useWorkoutLogs";
import { WorkoutTemplatesProvider } from "@/hooks/useWorkoutTemplates";
import AppSidebar from "@/components/AppSidebar";
import MobileTabBar from "@/components/MobileTabBar";
import { FitnessBackground } from "@/components/FitnessBackground";
import { ACTIVE_WORKOUT_STORAGE_KEY } from "@/lib/startSession";
import Landing from "@/pages/Landing";
import RequireAuth from "@/components/RequireAuth";

/* Route-level code splitting: each screen ships as its own chunk so the
   first paint (Landing / sign-in) stays light on gym wifi. */
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Workouts = lazy(() => import("@/pages/Workouts"));
const ActiveWorkout = lazy(() => import("@/pages/ActiveWorkout"));
const Calendar = lazy(() => import("@/pages/Calendar"));
const Progress = lazy(() => import("@/pages/Progress"));
const Coach = lazy(() => import("@/pages/Coach"));
const SessionReview = lazy(() => import("@/pages/SessionReview"));
const SignIn = lazy(() => import("@/pages/auth/SignIn"));
const CreateAccount = lazy(() => import("@/pages/auth/CreateAccount"));
const ForgotPassword = lazy(() => import("@/pages/auth/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/auth/ResetPassword"));
const Onboarding = lazy(() => import("@/pages/auth/Onboarding"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const Terms = lazy(() => import("@/pages/Terms"));

/* Shown for the instant a lazy chunk loads — branded, never a jarring flash.
   bg-background follows the champagne/espresso theme set pre-hydration. */
const BootSplash = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <p className="animate-pulse text-[13px] font-semibold tracking-[0.28em] text-foreground/80">
      LIFT<span className="text-primary">OS</span>
    </p>
  </div>
);

// VITE_MOCK_CAPTURED_SESSIONS=true in .env.local swaps the live Supabase-backed
// provider for synthetic-data fixtures. Defaults to live; opt-in dev mode only.
const CaptureProviderForApp =
  import.meta.env.VITE_MOCK_CAPTURED_SESSIONS === "true"
    ? MockCapturedSessionsProvider
    : CapturedSessionsProvider;

const queryClient = new QueryClient();

export const SidebarContext = createContext<{
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}>({ collapsed: false, setCollapsed: () => {} });

export const useSidebarState = () => useContext(SidebarContext);

/* App shell: sidebar on desktop, bottom tab bar on phones. Content clears
   the iOS status bar (pt-safe) and the tab bar + home indicator on mobile.

   Every screen enters the same way: the page-enter wrapper (keyed on the
   path, so it remounts per navigation) plays one 260ms fade + 10px rise.
   The lazy chunk resolves INSIDE that wrapper, so the tab bar and sidebar
   stay put while a screen loads — a route switch never flashes back to
   the full-screen boot splash — and the entrance plays exactly once, not
   again when the chunk lands. */
const AppShell = ({ children }: { children: React.ReactNode }) => {
  const { collapsed } = useSidebarState();
  const { pathname } = useLocation();
  // The live logging screen stays maximally quiet: not even the grain
  // texture (dark-gym legibility at arm's length, zero distraction). It
  // also skips the page-enter wrapper: the logger owns its own scoreboard
  // reveal, and anything position:fixed inside it (the PR banner) would
  // anchor to a wrapper mid-transform instead of the viewport.
  const isActiveWorkout = pathname === "/workouts/active";
  const page = <Suspense fallback={<BootSplash />}>{children}</Suspense>;
  return (
    <div className="relative flex min-h-screen w-full bg-background" style={{ isolation: "isolate", zIndex: 0 }}>
      {!isActiveWorkout && <FitnessBackground />}
      <AppSidebar />
      <MobileTabBar />
      {/* min-w-0: a flex item will not shrink below its content's width by
          default, so one long unbroken line (a workout name) would lay the
          whole page out wider than the phone instead of truncating. */}
      <main
        className={`min-w-0 flex-1 transition-all duration-300 ease-out pt-safe pb-[calc(4rem+var(--safe-bottom))] md:pb-0 ${
          collapsed ? "md:ml-[68px]" : "md:ml-[220px]"
        }`}
      >
        {isActiveWorkout ? (
          page
        ) : (
          <div key={pathname} className="page-enter">
            {page}
          </div>
        )}
      </main>
    </div>
  );
};

/** Start time of the session waiting in storage — what tells one session
    from the next. Null when nothing is waiting. */
const storedSessionStart = (): string | null => {
  try {
    const saved = window.localStorage.getItem(ACTIVE_WORKOUT_STORAGE_KEY);
    if (!saved) return null;
    const { startedAt } = JSON.parse(saved) as { startedAt?: unknown };
    return typeof startedAt === "string" ? startedAt : null;
  } catch {
    return null; // storage unavailable or unreadable — treat as no session
  }
};

/* /workouts/active is one route for every session. Starting a workout from
   a screen that is already on it (Quick start from the recap, or from "No
   active session") navigates to the path being shown, and React would keep
   the old screen. The page is keyed on the stored session's start time, so
   it remounts for a NEW session and for nothing else: a repeat navigation
   mid-workout keeps the logger's state, and once Finish has cleared the
   seed the key holds its last value.

   The element is memoized per session because the page reads its seed from
   storage as it renders. Rendered again under the recap, where the seed is
   already cleared, it would find no session and swap the recap for "No
   active session" — and anything that re-renders the routes does that
   (collapsing the sidebar, a second history entry on this path). */
const ActiveWorkoutRoute = () => {
  useLocation(); // re-render on every navigation, this same path included
  const stored = storedSessionStart();
  const [sessionKey, setSessionKey] = useState(stored);
  if (stored !== null && stored !== sessionKey) setSessionKey(stored);
  // ScrollToTop follows the path, which did not change: without this a
  // session started from a scrolled recap opens with its header off-screen.
  // Only for a session that REPLACES one on screen — on first mount (opening
  // or resuming a workout) ScrollToTop has already run, and this effect fires
  // after the logger's own, so scrolling here would undo the scroll that
  // keeps the current set clear of the session bar.
  const replaced = useRef(false);
  useEffect(() => {
    if (!replaced.current) {
      replaced.current = true;
      return;
    }
    window.scrollTo(0, 0);
  }, [sessionKey]);
  return useMemo(() => <ActiveWorkout key={sessionKey ?? "none"} />, [sessionKey]);
};

/* WKWebView keeps the window's scroll offset across route swaps, so a page
   opened from a scrolled screen started mid-scroll instead of at the top.
   Native apps open every screen at the top — match that. */
const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
};

/* On the native iOS app, boot into the product, not the marketing site. */
const isNative = Capacitor.isNativePlatform();

const App = () => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
      <UserProvider>
      <WorkoutLogsProvider>
      <WorkoutTemplatesProvider>
      <CaptureProviderForApp>
      <TooltipProvider>
        <Toaster />
        {/* Mount-once: HealthKit observer + catch-up sync (iOS native only). */}
        <HealthKitAutoSync />
        <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
          <BrowserRouter>
            <ScrollToTop />
            <Suspense fallback={<BootSplash />}>
            <Routes>
              <Route
                path="/"
                element={isNative ? <Navigate to="/dashboard" replace /> : <Landing />}
              />
              <Route
                path="/dashboard"
                element={<RequireAuth><AppShell><Dashboard /></AppShell></RequireAuth>}
              />
              <Route
                path="/workouts"
                element={<RequireAuth><AppShell><Workouts /></AppShell></RequireAuth>}
              />
              <Route
                path="/workouts/active"
                element={<RequireAuth><AppShell><ActiveWorkoutRoute /></AppShell></RequireAuth>}
              />
              <Route
                path="/workouts/review/:id"
                element={<RequireAuth><AppShell><SessionReview /></AppShell></RequireAuth>}
              />
              <Route
                path="/calendar"
                element={<RequireAuth><AppShell><Calendar /></AppShell></RequireAuth>}
              />
              <Route path="/calander" element={<Navigate to="/calendar" replace />} />
              <Route
                path="/progress"
                element={<RequireAuth><AppShell><Progress /></AppShell></RequireAuth>}
              />
              <Route
                path="/coach"
                element={<RequireAuth><AppShell><Coach /></AppShell></RequireAuth>}
              />
              <Route path="/sign-in" element={<SignIn />} />
              <Route path="/signin" element={<Navigate to="/sign-in" replace />} />
              <Route path="/createaccount" element={<Navigate to="/create-account" replace />} />
              <Route path="/create-account" element={<CreateAccount />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
          </BrowserRouter>
        </SidebarContext.Provider>
      </TooltipProvider>
      </CaptureProviderForApp>
      </WorkoutTemplatesProvider>
      </WorkoutLogsProvider>
      </UserProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
