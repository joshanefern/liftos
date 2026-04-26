const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export const AUTH_TOKEN_STORAGE_KEY = "liftos_auth_token";
export const AUTH_USER_STORAGE_KEY = "liftos_auth_user";

type AuthPayload = {
  token: string;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    createdAt: string;
  };
};

type RegisterInput = {
  firstName?: string;
  lastName?: string;
  email: string;
  password: string;
};

type SignInInput = {
  email: string;
  password: string;
};

const request = async <T>(path: string, init: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    ...init,
  });

  const payload = (await response.json().catch(() => null)) as { error?: string } | null;

  if (!response.ok) {
    throw new Error(payload?.error || "Something went wrong.");
  }

  return payload as T;
};

export const register = (input: RegisterInput) =>
  request<AuthPayload>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const signIn = (input: SignInInput) =>
  request<AuthPayload>("/api/auth/sign-in", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const persistAuth = (payload: AuthPayload) => {
  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, payload.token);
  window.localStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(payload.user));
};
