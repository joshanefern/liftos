import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

export type UserProfile = {
  first_name: string | null;
  last_name: string | null;
  goal: string | null;
  experience: string | null;
  equipment: string | null;
  frequency: string | null;
  split: string | null;
  units: string;
  wearable_connected: boolean;
  healthkit_connected: boolean;
};

type UserContextValue = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
};

const UserContext = createContext<UserContextValue>({
  user: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
});

export const useUser = () => useContext(UserContext);

/* Dev-only fixture auth (VITE_MOCK_AUTH=true, e.g. `vite --mode qa` with
   .env.qa). Renders the authed shell with a synthetic user so UI can be
   QA'd without a Supabase session — no real account or data is involved.
   Double-locked behind import.meta.env.DEV so production builds can never
   activate it. */
const MOCK_AUTH = import.meta.env.DEV && import.meta.env.VITE_MOCK_AUTH === "true";

const mockUser = { id: "qa-mock-user", email: "qa@liftos.local", user_metadata: { first_name: "QA" } } as unknown as User;

const mockProfile: UserProfile = {
  first_name: "QA",
  last_name: null,
  goal: "Lean hypertrophy",
  experience: "Intermediate",
  equipment: null,
  frequency: "4",
  split: null,
  units: "lb",
  wearable_connected: false,
  healthkit_connected: false,
};

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(MOCK_AUTH ? mockUser : null);
  const [profile, setProfile] = useState<UserProfile | null>(MOCK_AUTH ? mockProfile : null);
  const [loading, setLoading] = useState(!MOCK_AUTH);

  const fetchProfile = async (userId: string, userMeta?: Record<string, string>) => {
    const { data } = await supabase
      .from("profiles")
      .select("first_name, last_name, goal, experience, equipment, frequency, split, units, wearable_connected, healthkit_connected")
      .eq("id", userId)
      .single();

    // Fall back to auth metadata if the profile row has no name yet
    setProfile({
      first_name: data?.first_name ?? userMeta?.first_name ?? null,
      last_name: data?.last_name ?? userMeta?.last_name ?? null,
      goal: data?.goal ?? null,
      experience: data?.experience ?? null,
      equipment: data?.equipment ?? null,
      frequency: data?.frequency ?? null,
      split: data?.split ?? null,
      units: data?.units ?? "lb",
      wearable_connected: data?.wearable_connected ?? false,
      healthkit_connected: data?.healthkit_connected ?? false,
    });
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id, user.user_metadata);
  };

  useEffect(() => {
    if (MOCK_AUTH) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id, session.user.user_metadata).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Recovery links can land on any route (Supabase falls back to the Site
      // URL) — always finish the flow on the reset screen.
      if (event === "PASSWORD_RECOVERY" && window.location.pathname !== "/reset-password") {
        window.location.assign("/reset-password");
        return;
      }
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id, session.user.user_metadata);
      else setProfile(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <UserContext.Provider value={{ user, profile, loading, refreshProfile }}>
      {children}
    </UserContext.Provider>
  );
};
