"use client";

import { useState } from "react";
import Link from "next/link";
import { signupAction } from "@/lib/actions";

export function SignupForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await signupAction({ name, email, password });
      if (!res.ok) throw new Error(res.error || "Something went wrong.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="text-center" data-testid="signup-done">
        <p className="text-2xl">🎬</p>
        <p className="mt-2 font-semibold">Request sent!</p>
        <p className="mt-1 text-sm text-ink-soft">
          An admin has been notified. Once they clear your account you can{" "}
          <Link href="/login" className="text-reel hover:underline">
            sign in
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-3">
        <label className="label" htmlFor="signup-name">
          Your name
        </label>
        <input
          id="signup-name"
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="How teammates will see you"
          required
          autoFocus
        />
      </div>
      <div className="mb-3">
        <label className="label" htmlFor="signup-email">
          Email
        </label>
        <input
          id="signup-email"
          type="email"
          className="field"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />
      </div>
      <div className="mb-4">
        <label className="label" htmlFor="signup-password">
          Password
        </label>
        <input
          id="signup-password"
          type="password"
          className="field"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          minLength={8}
          required
        />
      </div>

      {error ? (
        <p role="alert" className="mb-3 text-sm font-medium text-red-600">
          {error}
        </p>
      ) : null}

      <button type="submit" className="btn-primary w-full" disabled={busy} data-testid="signup-submit">
        {busy ? "Sending…" : "Request access"}
      </button>
    </form>
  );
}
