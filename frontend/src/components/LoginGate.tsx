"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import { AuthContext } from "@/lib/auth-context";

type LoginGateProps = {
  children: ReactNode;
};

const STORAGE_KEY = "pm-auth-logged-in";
const STORAGE_USERNAME_KEY = "pm-auth-username";

type Mode = "login" | "register";

export const LoginGate = ({ children }: LoginGateProps) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loggedInUsername, setLoggedInUsername] = useState("");
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "true") {
      setIsLoggedIn(true);
      setLoggedInUsername(window.localStorage.getItem(STORAGE_USERNAME_KEY) ?? "");
    }
    setHasHydrated(true);
  }, []);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });

      if (response.status === 401) {
        setError("Invalid username or password.");
        return;
      }
      if (!response.ok) {
        setError("Unable to sign in. Please try again.");
        return;
      }

      const meRes = await fetch("/api/me", { credentials: "include" });
      const me = meRes.ok ? ((await meRes.json()) as { username: string }) : null;
      const resolvedUsername = me?.username ?? username;

      setIsLoggedIn(true);
      setLoggedInUsername(resolvedUsername);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, "true");
        window.localStorage.setItem(STORAGE_USERNAME_KEY, resolvedUsername);
      }
    } catch {
      setError("Unable to sign in. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });

      if (response.status === 409) {
        setError("Username already taken. Choose a different one.");
        return;
      }
      if (response.status === 422) {
        const body = (await response.json()) as { detail?: string };
        setError(body.detail ?? "Invalid username or password format.");
        return;
      }
      if (!response.ok) {
        setError("Registration failed. Please try again.");
        return;
      }

      setIsLoggedIn(true);
      setLoggedInUsername(username);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, "true");
        window.localStorage.setItem(STORAGE_USERNAME_KEY, username);
      }
    } catch {
      setError("Unable to register. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    setIsLoggedIn(false);
    setLoggedInUsername("");
    setUsername("");
    setPassword("");
    setConfirmPassword("");
    setError(null);
    setMode("login");
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(STORAGE_USERNAME_KEY);
    }
    try {
      await fetch("/api/logout", { method: "POST", credentials: "include" });
    } catch {
      // ignore
    }
  };

  if (!hasHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface)]">
        <div className="rounded-3xl border border-[var(--stroke)] bg-white/80 px-8 py-6 shadow-[var(--shadow)]">
          <p className="text-sm text-[var(--gray-text)]">Loading workspace…</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface)] px-4">
        <div className="w-full max-w-sm space-y-6 rounded-3xl border border-[var(--stroke)] bg-white/90 p-8 shadow-[var(--shadow)]">
          <header className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--gray-text)]">
              Kanban Studio
            </p>
            <h1 className="font-display text-2xl font-semibold text-[var(--navy-dark)]">
              {mode === "login" ? "Sign in to your workspace" : "Create an account"}
            </h1>
          </header>

          {/* Mode toggle */}
          <div className="flex rounded-xl border border-[var(--stroke)] bg-[var(--surface)] p-1">
            {(["login", "register"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(null); }}
                className={`flex-1 rounded-lg py-1.5 text-xs font-semibold uppercase tracking-[0.15em] transition ${
                  mode === m
                    ? "bg-white text-[var(--navy-dark)] shadow-sm"
                    : "text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
                }`}
              >
                {m === "login" ? "Sign in" : "Register"}
              </button>
            ))}
          </div>

          {mode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4" aria-label="Login form">
              <Field
                id="username"
                label="Username"
                value={username}
                onChange={setUsername}
                autoComplete="username"
              />
              <Field
                id="password"
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
              />
              {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
              <SubmitButton label="Sign in" loadingLabel="Signing in…" loading={isSubmitting} />
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4" aria-label="Register form">
              <Field
                id="reg-username"
                label="Username"
                hint="3–32 characters, letters/digits/_ or -"
                value={username}
                onChange={setUsername}
                autoComplete="username"
              />
              <Field
                id="reg-password"
                label="Password"
                hint="At least 8 characters"
                type="password"
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
              />
              <Field
                id="reg-confirm"
                label="Confirm password"
                type="password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                autoComplete="new-password"
              />
              {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
              <SubmitButton label="Create account" loadingLabel="Creating…" loading={isSubmitting} />
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ username: loggedInUsername, onUnauthenticated: handleLogout }}>
      <div className="min-h-screen bg-[var(--surface)]">
        <header className="border-b border-[var(--stroke)] bg-white/80 px-6 py-3 shadow-[0_10px_20px_rgba(3,33,71,0.04)] backdrop-blur">
          <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--primary-blue)] text-xs font-semibold text-white">
                {loggedInUsername.slice(0, 1).toUpperCase()}
              </span>
              <div className="leading-tight">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
                  Signed in
                </p>
                <p className="text-sm font-medium text-[var(--navy-dark)]">{loggedInUsername}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)] transition hover:border-[var(--primary-blue)] hover:text-[var(--navy-dark)]"
            >
              Log out
            </button>
          </div>
        </header>
        {children}
      </div>
    </AuthContext.Provider>
  );
};

type FieldProps = {
  id: string;
  label: string;
  hint?: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
};

const Field = ({ id, label, hint, type = "text", value, onChange, autoComplete }: FieldProps) => (
  <div className="space-y-1">
    <label
      htmlFor={id}
      className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]"
    >
      {label}
    </label>
    {hint && <p className="text-[11px] text-[var(--gray-text)]">{hint}</p>}
    <input
      id={id}
      name={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
      autoComplete={autoComplete}
      required
    />
  </div>
);

type SubmitButtonProps = { label: string; loadingLabel: string; loading: boolean };

const SubmitButton = ({ label, loadingLabel, loading }: SubmitButtonProps) => (
  <button
    type="submit"
    disabled={loading}
    className="flex w-full items-center justify-center rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:brightness-110 disabled:opacity-60"
  >
    {loading ? loadingLabel : label}
  </button>
);
