"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { scheduleEpisodeAction, setEpisodeStatusAction } from "@/lib/actions";

export type BoardEpisode = {
  id: string;
  title: string;
  project: string;
  status: string;
  publishAt: string | null;
  youtubeVideoId: string | null;
  sceneCount: number;
  clipCount: number;
  approvals: number;
  viewed: number;
  feedback: number;
};

export function BoardCard({
  episode,
  youtubeReady,
}: {
  episode: BoardEpisode;
  youtubeReady: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [when, setWhen] = useState("");

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) throw new Error(res.error || "Something went wrong.");
      setScheduling(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const canYouTube = youtubeReady && episode.clipCount === 1;

  return (
    <li className="card p-3" data-testid="board-card" data-episode={episode.title}>
      <Link
        href={`/episodes/${episode.id}`}
        className="text-sm font-semibold leading-snug hover:text-reel"
      >
        {episode.title}
      </Link>
      <p className="mt-0.5 text-[11px] text-ink-faint">
        {episode.project} · {episode.sceneCount}{" "}
        {episode.sceneCount === 1 ? "scene" : "scenes"}
      </p>
      <p className="mt-1 text-[11px] text-ink-soft" data-testid="card-stats">
        👀 {episode.viewed} viewed ·{" "}
        <span className={episode.approvals > 0 ? "font-semibold text-good" : ""}>
          ✓ {episode.approvals} approved
        </span>{" "}
        · 💬 {episode.feedback}
      </p>

      {episode.publishAt ? (
        <p
          className="mt-1.5 rounded-md bg-accent/10 px-2 py-1 text-[11px] font-medium text-accent-ink"
          suppressHydrationWarning
        >
          🗓{" "}
          {new Date(episode.publishAt).toLocaleString([], {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      ) : null}

      {episode.youtubeVideoId ? (
        <p className="mt-1.5 text-[11px] font-medium text-red-600">
          ▶ Queued on YouTube (made for kids)
        </p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {episode.status === "review" ? (
          <button
            type="button"
            className="btn-primary px-2.5 py-1 text-xs"
            disabled={busy}
            data-testid="approve-episode"
            onClick={() =>
              run(() =>
                setEpisodeStatusAction({ episodeId: episode.id, status: "approved" })
              )
            }
          >
            ✓ Approve
          </button>
        ) : null}

        {episode.status === "approved" ? (
          <>
            {!scheduling ? (
              <button
                type="button"
                className="btn-primary px-2.5 py-1 text-xs"
                onClick={() => setScheduling(true)}
                data-testid="schedule-toggle"
              >
                🗓 Schedule
              </button>
            ) : null}
            <button
              type="button"
              className="btn-ghost px-2.5 py-1 text-xs"
              disabled={busy}
              onClick={() =>
                run(() =>
                  setEpisodeStatusAction({ episodeId: episode.id, status: "review" })
                )
              }
            >
              Back to review
            </button>
          </>
        ) : null}

        {episode.status === "scheduled" ? (
          <button
            type="button"
            className="btn-ghost px-2.5 py-1 text-xs"
            disabled={busy}
            data-testid="unschedule"
            onClick={() =>
              run(() =>
                setEpisodeStatusAction({ episodeId: episode.id, status: "approved" })
              )
            }
          >
            Unschedule
          </button>
        ) : null}
      </div>

      {scheduling ? (
        <div className="mt-2 rounded-lg border border-line bg-panel p-2">
          <label className="label" htmlFor={`when-${episode.id}`}>
            Publish date &amp; time
          </label>
          <input
            id={`when-${episode.id}`}
            type="datetime-local"
            className="field text-xs"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            data-testid="publish-when"
          />
          <p className="mt-1 text-[10px] text-ink-faint">
            {canYouTube
              ? "Uploads to YouTube now (private, made for kids) and goes public at this time."
              : youtubeReady
              ? "Multi-scene episode: add a single final-cut clip to auto-post to YouTube, or schedule for manual posting."
              : "YouTube isn't connected yet — this schedules the release for manual posting."}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="btn-primary px-2.5 py-1 text-xs"
              disabled={busy || !when}
              data-testid="confirm-schedule"
              onClick={() =>
                run(() =>
                  scheduleEpisodeAction({
                    episodeId: episode.id,
                    publishAtISO: new Date(when).toISOString(),
                  })
                )
              }
            >
              {busy ? "Scheduling…" : "Confirm"}
            </button>
            <button
              type="button"
              className="btn-ghost px-2.5 py-1 text-xs"
              onClick={() => setScheduling(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-[11px] font-medium text-red-600">
          {error}
        </p>
      ) : null}
    </li>
  );
}
