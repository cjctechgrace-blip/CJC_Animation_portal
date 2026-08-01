"use client";

import { useState } from "react";
import { acceptInviteAction } from "@/lib/actions";

export function AcceptInviteForm({
  token,
  email,
  defaultName,
  kind,
  invitedBy,
}: {
  token: string;
  email: string;
  defaultName: string;
  kind: string;
  invitedBy: string;
}) {
  const [name, setName] = useState(defaultName);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReset = kind === "reset";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("The passwords don't match.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      // On success the action creates a session and redirects to /dashboard.
      const res = await acceptInviteAction({ token, name, password });
      if (res && !res.ok) throw new Error(res.error || "Something went wrong.");
    } catch (err) {
      // Next.js redirect() throws — let it through
      if (err && typeof err === "object" && "digest" in err) throw err;
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card p-6">
      <h2 className="mb-1 font-semibold">
        {isReset ? "Set a new password" : `${invitedBy} invited you`}
      </h2>
      <p className="mb-4 text-sm text-ink-soft">
        {isReset
          ? `Choose a new password for ${email}.`
          : `Create your account for ${email} and start reviewing.`}
      </p>

      {!isReset ? (
        <div className="mb-3">
          <label className="label" htmlFor="accept-name">
            Your name
          </label>
          <input
            id="accept-name"
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="How teammates will see you"
            required
            autoFocus
          />
        </div>
      ) : null}

      <div className="mb-3">
        <label className="label" htmlFor="accept-password">
          {isReset ? "New password" : "Choose a password"}
        </label>
        <input
          id="accept-password"
          type="password"
          className="field"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          minLength={8}
          required
        />
      </div>
      <div className="mb-4">
        <label className="label" htmlFor="accept-confirm">
          Repeat password
        </label>
        <input
          id="accept-confirm"
          type="password"
          className="field"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
      </div>

      {error ? (
        <p role="alert" className="mb-3 text-sm font-medium text-red-600">
          {error}
        </p>
      ) : null}

      <button type="submit" className="btn-primary w-full" disabled={busy} data-testid="accept-invite">
        {busy
          ? "Working…"
          : isReset
          ? "Set password & sign in"
          : "Create account & sign in"}
      </button>
    </form>
  );
}
