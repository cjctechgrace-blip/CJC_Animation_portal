"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createInviteAction,
  setUserActiveAction,
  setUserRoleAction,
} from "@/lib/actions";
import { initialsOf } from "@/lib/format";

type Member = {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  joined: string;
  contributions: number;
};

export function MemberRow({ member, isSelf }: { member: Member; isSelf: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) throw new Error(res.error || "Something went wrong.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function makeResetLink() {
    setError(null);
    setBusy(true);
    try {
      const res = await createInviteAction({ email: member.email, kind: "reset" });
      if (!res.ok || !res.token) throw new Error(res.error || "Could not create the link.");
      setResetLink(`${window.location.origin}/invite/${res.token}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function copyReset() {
    if (!resetLink) return;
    await navigator.clipboard.writeText(resetLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <li
      className={`card p-4 ${member.active ? "" : "opacity-60"}`}
      data-testid="member-row"
      data-email={member.email}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-reel-soft text-xs font-bold text-reel">
          {initialsOf(member.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {member.name}
            {isSelf ? <span className="ml-1 text-xs font-normal text-ink-faint">(you)</span> : null}
            {!member.active ? (
              <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
                deactivated
              </span>
            ) : null}
          </p>
          <p className="truncate text-xs text-ink-faint">
            {member.email} · joined {member.joined} · {member.contributions}{" "}
            contribution{member.contributions === 1 ? "" : "s"}
          </p>
        </div>

        <select
          className="field w-auto px-2 py-1 text-xs"
          value={["admin", "editor", "reviewer"].includes(member.role) ? member.role : "reviewer"}
          disabled={busy}
          onChange={(e) =>
            run(() => setUserRoleAction({ userId: member.id, role: e.target.value }))
          }
          data-testid="role-select"
          title="admin: manages the team · editor: sees the publishing board · reviewer: reviews only"
        >
          <option value="admin">admin</option>
          <option value="editor">editor</option>
          <option value="reviewer">reviewer</option>
        </select>

        <div className="flex items-center gap-1 text-xs">
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-xs"
            disabled={busy}
            onClick={makeResetLink}
            data-testid="reset-password"
          >
            Reset password
          </button>
          {!isSelf ? (
            <button
              type="button"
              className={`px-2 py-1 text-xs font-medium ${
                member.active
                  ? "text-red-600 hover:text-red-700"
                  : "text-good hover:underline"
              }`}
              disabled={busy}
              onClick={() =>
                run(() =>
                  setUserActiveAction({ userId: member.id, active: !member.active })
                )
              }
              data-testid="toggle-active"
            >
              {member.active ? "Deactivate" : "Reactivate"}
            </button>
          ) : null}
        </div>
      </div>

      {resetLink ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-panel p-2">
          <code className="min-w-0 flex-1 truncate text-xs" data-testid="reset-link">
            {resetLink}
          </code>
          <button type="button" onClick={copyReset} className="btn-ghost px-2 py-1 text-xs">
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-xs font-medium text-red-600">
          {error}
        </p>
      ) : null}
    </li>
  );
}
