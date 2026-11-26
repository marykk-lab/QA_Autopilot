"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"in" | "up" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    await run("in", async (supabase) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // The session lands in a cookie the server has to re-read, so this is a
      // full navigation rather than a client-side route change.
      router.refresh();
      router.replace(next);
    });
  }

  async function signUp() {
    await run("up", async (supabase) => {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      if (data.session) {
        router.refresh();
        router.replace(next);
        return;
      }
      // Hosted projects confirm by email; the local stack has confirmations off,
      // so this branch only shows up against a real project.
      setMessage("Account created. Check your email for the confirmation link, then sign in.");
    });
  }

  async function run(which: "in" | "up", action: (supabase: ReturnType<typeof createClient>) => Promise<void>) {
    setBusy(which);
    setError(null);
    setMessage(null);
    try {
      await action(createClient());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={6}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      <div className="auth-actions">
        <button className="primary" type="submit" disabled={busy !== null}>
          {busy === "in" ? "Signing in…" : "Sign in"}
        </button>
        <button className="ghost" type="button" onClick={signUp} disabled={busy !== null}>
          {busy === "up" ? "Creating…" : "Create account"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {message && <p className="message">{message}</p>}
    </form>
  );
}
