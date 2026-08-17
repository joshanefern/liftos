import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createContext, lazy, Suspense, useContext, useState } from "react";
import { UserProvider } from "@/context/UserContext";
import { HealthKitAutoSync } from "@/hooks/useHealthKitAutoSync";
import { StravaAutoSync } from "@/hooks/useStravaAutoSync";
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
const StravaCallback = lazy(() => import("@/pages/auth/StravaCallback"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const Terms = lazy(() => import("@/pages/Terms"));

/* Shown for the instant a lazy chunk loads — branded, never a jarring flash.
   bg-background follows the champagne/espresso theme set pre-hydration. */
const BootSplash = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <p className="animate-pulse text-[13px] font-semibold tracking-[0.28em] text-foreground/80">
      LIFT<span className="text-gold">OS</span>
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
   the iOS status bar (pt-safe) and the tab bar + home indicator on mobile. */
const AppShell = ({ children }: { children: React.ReactNode }) => {
  const { collapsed } = useSidebarState();
  // The live logging screen stays maximally quiet: not even the grain
  // texture (dark-gym legibility at arm's length, zero distraction).
  const isActiveWorkout = useLocation().pathname === "/workouts/active";
  return (
    <div className="relative flex min-h-screen w-full bg-background" style={{ isolation: "isolate", zIndex: 0 }}>
      {!isActiveWorkout && <FitnessBackground />}
      {/* iOS overlays the status bar on the webview: without a mask, scrolled
          content collides with the clock. This strip fades content out behind
          it like a native app — zero-height on web where --safe-top is 0.
          Mid-workout it flips dark with the scoreboard (Split Shift). */}
      <div
        className={`pointer-events-none fixed inset-x-0 top-0 z-30 h-[var(--safe-top)] bg-background/90 backdrop-blur-[10px] ${
          isActiveWorkout ? "dark" : ""
        }`}
      />
      <AppSidebar />
      <MobileTabBar />
      <main
        className={`flex-1 transition-all duration-300 ease-out pt-safe pb-[calc(4rem+var(--safe-bottom))] md:pb-0 ${
          collapsed ? "md:ml-[68px]" : "md:ml-[220px]"
        }`}
      >
        {children}
      </main>
    </div>
  );
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
        <Sonner />
        {/* Mount-once: HealthKit observer + catch-up sync (iOS native only). */}
        <HealthKitAutoSync />
        {/* Mount-once: throttled Strava catch-up sync on app open/foreground. */}
        <StravaAutoSync />
        <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
          <BrowserRouter>
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
                element={<RequireAuth><AppShell><ActiveWorkout /></AppShell></RequireAuth>}
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
              <Route path="/auth/strava/callback" element={<StravaCallback />} />
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
