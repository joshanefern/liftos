import { supabase } from "@/lib/supabase";

export type AuthUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
};

export type RegisterInput = {
  firstName?: string;
  lastName?: string;
  email: string;
  password: string;
};

export type SignInInput = {
  email: string;
  password: string;
};

export const register = async ({
  firstName,
  lastName,
  email,
  password,
}: RegisterInput): Promise<AuthUser> => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { first_name: firstName ?? null, last_name: lastName ?? null },
    },
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("rate limit") || msg.includes("email rate")) {
      throw new Error("Too many sign-up attempts with this email. Please wait a few minutes or try a different email address.");
    }
    if (msg.includes("already registered") || msg.includes("already been registered")) {
      throw new Error("An account with this email already exists. Try signing in instead.");
    }
    throw new Error(error.message);
  }
  if (!data.user) throw new Error("Registration failed.");

  return {
    id: data.user.id,
    email: data.user.email!,
    firstName: firstName ?? null,
    lastName: lastName ?? null,
  };
};

export const signIn = async ({ email, password }: SignInInput): Promise<AuthUser> => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("invalid login") || msg.includes("invalid credentials")) {
      throw new Error("Incorrect email or password.");
    }
    if (msg.includes("email not confirmed")) {
      throw new Error("Please confirm your email before signing in, or ask your admin to disable email confirmation.");
    }
    throw new Error(error.message);
  }
  if (!data.user) throw new Error("Sign in failed.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", data.user.id)
    .single();

  return {
    id: data.user.id,
    email: data.user.email!,
    firstName: profile?.first_name ?? null,
    lastName: profile?.last_name ?? null,
  };
};

export const signOut = async () => {
  await supabase.auth.signOut();
};

export const getSession = () => supabase.auth.getSession();

/* Password recovery — Supabase emails a magic link that lands the user back
   in the app with a recovery session; updatePassword finishes the job. */
export const requestPasswordReset = async (email: string): Promise<void> => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("rate limit") || msg.includes("email rate")) {
      throw new Error("Too many reset requests. Please wait a few minutes and try again.");
    }
    throw new Error(error.message);
  }
};

export const updatePassword = async (password: string): Promise<void> => {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(error.message);
};
