"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { revokeInviteAction } from "@/lib/actions";

type Invite = {
  id: string;
  email: string;
  name: string;
  role: string;
  kind: string;
  token: string;
  expiresAt: string;
};

export function PendingInviteRow({ invite }: { invite: Invite }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const link =
    typeof window === "undefined"
      ? `/invite/${invite.token}`
      : `${window.location.origin}/invite/${invite.token}`;

  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function revoke() {
    setBusy(true);
    await revokeInviteAction({ inviteId: invite.id });
    router.refresh();
  }

  return (
    <li className="card flex flex-wrap items-center gap-3 p-3" data-testid="pending-invite">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {invite.email}
          <span className="ml-2 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent-ink">
            {invite.kind === "reset" ? "password reset" : `invite · ${invite.role}`}
          </span>
        </p>
        <p className="text-xs text-ink-faint" suppressHydrationWarning>
          expires {new Date(invite.expiresAt).toLocaleDateString()}
        </p>
      </div>
      <button type="button" onClick={copy} className="btn-ghost px-2 py-1 text-xs">
        {copied ? "Copied ✓" : "Copy link"}
      </button>
      <button
        type="button"
        onClick={revoke}
        disabled={busy}
        className="px-2 py-1 text-xs font-medium text-red-600 hover:text-red-700"
      >
        Revoke
      </button>
    </li>
  );
}
