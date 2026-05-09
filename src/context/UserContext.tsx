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

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string, userMeta?: Record<string, string>) => {
    const { data } = await supabase
      .from("profiles")
      .select("first_name, last_name, goal, experience, equipment, frequency, split, units")
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
    });
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id, user.user_metadata);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id, session.user.user_metadata).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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
