"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  finishReviewSessionAction,
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
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function doneReviewing() {
    setBusy(true);
    try {
      const res = await finishReviewSessionAction({ episodeId });
      setDoneMsg(
        res.ok
          ? `✓ Editors notified (${res.noteCount} note${res.noteCount === 1 ? "" : "s"})`
          : res.error ?? "Something went wrong."
      );
    } catch {
      setDoneMsg("Couldn't notify the editors — check your connection and try again.");
    }
    setBusy(false);
    setTimeout(() => setDoneMsg(null), 6000);
  }

  async function toggle() {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await toggleEpisodeApprovalAction({ episodeId });
      if (!res.ok) {
        setErrorMsg(res.error ?? "Couldn't save your approval — please try again.");
      } else {
        router.refresh();
      }
    } catch {
      setErrorMsg(
        "Couldn't save your approval — check your connection and try again. If it keeps failing, tell an admin."
      );
    }
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
    setErrorMsg(null);
    try {
      await startReviewRoundAction({ episodeId });
      router.refresh();
    } catch {
      setErrorMsg("Couldn't start the next round — please try again.");
    }
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

      <button
        type="button"
        onClick={doneReviewing}
        disabled={busy}
        data-testid="done-reviewing"
        className="font-medium text-ink-soft hover:text-ink hover:underline"
        title="Send the editors ONE summary email of the notes you left this session"
      >
        📨 Done reviewing — notify editors
      </button>
      {doneMsg ? (
        <span className="text-ink-faint" data-testid="done-reviewing-msg">
          {doneMsg}
        </span>
      ) : null}
      {errorMsg ? (
        <span
          role="alert"
          className="font-medium text-red-600"
          data-testid="approval-error"
        >
          {errorMsg}
        </span>
      ) : null}

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
