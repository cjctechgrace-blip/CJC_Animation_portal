"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toggleEpisodeApprovalAction } from "@/lib/actions";

export function ApprovalBar({
  episodeId,
  viewerApproved,
  approverNames,
  viewedCount,
  feedbackCount,
}: {
  episodeId: string;
  viewerApproved: boolean;
  approverNames: string[];
  viewedCount: number;
  feedbackCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    await toggleEpisodeApprovalAction({ episodeId });
    router.refresh();
    setBusy(false);
  }

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
      data-testid="approval-bar"
    >
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        data-testid="approval-toggle"
        className={`rounded-full px-3 py-1 font-semibold transition-colors ${
          viewerApproved
            ? "bg-good/15 text-good hover:bg-good/25"
            : "bg-line text-ink-soft hover:bg-reel-soft hover:text-reel"
        }`}
        title={
          viewerApproved
            ? "You approved this episode — click to undo"
            : "Give this episode your personal sign-off"
        }
      >
        {viewerApproved ? "✓ Approved by you" : "✓ Approve episode"}
      </button>

      <span className="text-ink-faint" data-testid="approval-stats">
        {approverNames.length > 0 ? (
          <>
            <span className="font-medium text-good">
              {approverNames.length} approved
            </span>{" "}
            ({approverNames.join(", ")}) ·{" "}
          </>
        ) : null}
        {viewedCount} viewed · {feedbackCount}{" "}
        {feedbackCount === 1 ? "note" : "notes"}
      </span>
    </div>
  );
}
