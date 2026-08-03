"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  startReviewRoundAction,
  toggleEpisodeApprovalAction,
} from "@/lib/actions";

export function ApprovalBar({
  episodeId,
  viewerApproved,
  approverNames,
  viewedCount,
  feedbackCount,
  round,
  canStartRound,
}: {
  episodeId: string;
  viewerApproved: boolean;
  approverNames: string[];
  viewedCount: number;
  feedbackCount: number;
  round: number;
  canStartRound: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    await toggleEpisodeApprovalAction({ episodeId });
    router.refresh();
    setBusy(false);
  }

  async function nextRound() {
    if (
      !window.confirm(
        `Start review round ${round + 1}? Everyone's approvals reset and the team is notified to re-review.`
      )
    )
      return;
    setBusy(true);
    await startReviewRoundAction({ episodeId });
    router.refresh();
    setBusy(false);
  }

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
      data-testid="approval-bar"
    >
      <span
        className="rounded-full bg-reel-soft px-2.5 py-1 font-semibold text-reel"
        data-testid="review-round"
        title="Which review cycle this episode is on"
      >
        Round {round}
      </span>
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

      {canStartRound ? (
        <button
          type="button"
          onClick={nextRound}
          disabled={busy}
          data-testid="start-round"
          className="font-medium text-reel hover:underline"
          title="After re-editing, reset approvals and ask the team to review again"
        >
          ↻ Start round {round + 1}
        </button>
      ) : null}
    </div>
  );
}
