"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createInviteAction } from "@/lib/actions";

export function InviteForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("reviewer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await createInviteAction({ email, name, role });
      if (!res.ok || !res.token) throw new Error(res.error || "Could not create the invite.");
      setLink(`${window.location.origin}/invite/${res.token}`);
      setEmail("");
      setName("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn-primary"
        onClick={() => setOpen(true)}
        data-testid="invite-toggle"
      >
        + Invite teammate
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card w-full max-w-lg p-5">
      <h2 className="mb-1 font-semibold">Invite a teammate</h2>
      <p className="mb-3 text-xs text-ink-faint">
        You&apos;ll get a one-time link to send them — they choose their own
        password. Links expire after 7 days.
      </p>

      {link ? (
        <div className="mb-3 rounded-lg border border-good/40 bg-good/5 p-3">
          <p className="mb-2 text-xs font-medium text-good">
            Invite created — send this link:
          </p>
          <div className="flex items-center gap-2">
            <code
              className="min-w-0 flex-1 truncate rounded bg-panel px-2 py-1 text-xs"
              data-testid="invite-link"
            >
              {link}
            </code>
            <button
              type="button"
              onClick={copyLink}
              className="btn-ghost px-2 py-1 text-xs"
              data-testid="copy-invite-link"
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="mb-3">
        <label className="label" htmlFor="invite-email">
          Email
        </label>
        <input
          id="invite-email"
          type="email"
          className="field"
          placeholder="teammate@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
      </div>
      <div className="mb-3">
        <label className="label" htmlFor="invite-name">
          Name (optional)
        </label>
        <input
          id="invite-name"
          className="field"
          placeholder="e.g. Daniel"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="mb-4">
        <label className="label" htmlFor="invite-role">
          Role
        </label>
        <select
          id="invite-role"
          className="field"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="reviewer">Reviewer — watch, annotate, discuss</option>
          <option value="editor">Video editor — also sees the publishing board & schedule</option>
          <option value="admin">Admin — also manages the team</option>
        </select>
      </div>

      {error ? (
        <p role="alert" className="mb-3 text-sm font-medium text-red-600">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={busy} data-testid="create-invite">
          {busy ? "Creating…" : "Create invite link"}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            setOpen(false);
            setLink(null);
          }}
          disabled={busy}
        >
          Close
        </button>
      </div>
    </form>
  );
}
