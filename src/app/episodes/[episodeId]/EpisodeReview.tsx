"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addCommentAction,
  addReplyAction,
  toggleResolvedAction,
  generatePromptAction,
} from "@/lib/actions";
import { formatTimecode, formatWhen, initialsOf } from "@/lib/format";
import { FrameCanvas } from "./FrameCanvas";

type Reply = {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
};

type Comment = {
  id: string;
  body: string;
  timecodeMs: number | null;
  resolved: boolean;
  authorName: string;
  createdAt: string;
  hasFrame: boolean;
  generatedPrompt: string | null;
  replies: Reply[];
};

export function EpisodeReview({
  episodeId,
  hasVideo,
  videoSrc,
  initialComments,
}: {
  episodeId: string;
  hasVideo: boolean;
  videoSrc: string | null;
  initialComments: Comment[];
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentMs, setCurrentMs] = useState(0);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // draw-on-frame state
  const [captureBase, setCaptureBase] = useState<string | null>(null);
  const [frameDataUrl, setFrameDataUrl] = useState<string | null>(null);

  const openCount = initialComments.filter((c) => !c.resolved).length;
  const resolvedCount = initialComments.length - openCount;

  function seekTo(ms: number | null) {
    if (ms == null || !videoRef.current) return;
    videoRef.current.currentTime = ms / 1000;
    setCurrentMs(ms);
    videoRef.current.pause();
  }

  function captureFrame() {
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      setError("Let the video load a moment, then capture again.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    video.pause();
    setError(null);
    setCaptureBase(canvas.toDataURL("image/png"));
  }

  function submitNote() {
    const body = draft.trim();
    if (!body) {
      setError("Write your note first.");
      return;
    }
    const ms = videoRef.current
      ? Math.round(videoRef.current.currentTime * 1000)
      : 0;
    setError(null);
    const frame = frameDataUrl;
    startTransition(async () => {
      const res = await addCommentAction({
        episodeId,
        body,
        timecodeMs: ms,
        frameDataUrl: frame,
      });
      if (!res.ok) {
        setError(res.error ?? "Could not save the note.");
        return;
      }
      setDraft("");
      setFrameDataUrl(null);
      setCaptureBase(null);
      router.refresh();
    });
  }

  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-[1fr_400px]">
      {/* ---------------- player + composer ---------------- */}
      <section className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-xl border border-line bg-black">
          {hasVideo && videoSrc ? (
            <video
              ref={videoRef}
              src={videoSrc}
              controls
              data-testid="episode-video"
              className="aspect-video w-full bg-black"
              onTimeUpdate={(e) =>
                setCurrentMs(Math.round(e.currentTarget.currentTime * 1000))
              }
            />
          ) : (
            <div className="grid aspect-video w-full place-items-center bg-ink text-center text-sm text-white/70">
              No video uploaded for this episode yet.
            </div>
          )}
        </div>

        <div className="card p-4">
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="note" className="label mb-0">
              Leave a note
            </label>
            <span
              className="rounded-md bg-reel-soft px-2 py-1 font-mono text-xs font-semibold text-reel"
              data-testid="current-timecode"
            >
              {hasVideo ? `@ ${formatTimecode(currentMs)}` : "general"}
            </span>
          </div>
          <textarea
            id="note"
            data-testid="note-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="field"
            rows={2}
            placeholder={
              hasVideo
                ? "Pause at the moment, then describe what to change…"
                : "Add a general note for this episode…"
            }
          />

          {hasVideo && !captureBase && !frameDataUrl ? (
            <button
              type="button"
              onClick={captureFrame}
              data-testid="capture-frame"
              className="mt-2 text-sm font-medium text-reel hover:underline"
            >
              ✎ Draw on this frame
            </button>
          ) : null}

          {captureBase && !frameDataUrl ? (
            <FrameCanvas
              baseDataUrl={captureBase}
              onCommit={(url) => {
                setFrameDataUrl(url);
                setCaptureBase(null);
              }}
              onCancel={() => setCaptureBase(null)}
            />
          ) : null}

          {frameDataUrl ? (
            <div
              className="mt-2 flex items-center gap-3 rounded-lg border border-line bg-paper p-2"
              data-testid="frame-attached"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={frameDataUrl}
                alt="Annotated frame to attach"
                className="h-12 w-20 rounded object-cover"
              />
              <span className="text-xs text-ink-soft">
                Frame attached — becomes the AI start-frame.
              </span>
              <button
                type="button"
                onClick={() => setFrameDataUrl(null)}
                className="ml-auto text-xs font-medium text-ink-faint hover:text-ink"
              >
                Remove
              </button>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="mt-2 text-sm font-medium text-red-600">
              {error}
            </p>
          ) : null}
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-ink-faint">
              {hasVideo
                ? "Your note pins to the frame showing now."
                : "Upload a video to pin notes to exact moments."}
            </p>
            <button
              type="button"
              className="btn-primary"
              onClick={submitNote}
              disabled={isPending}
              data-testid="add-note"
            >
              {isPending
                ? "Saving…"
                : hasVideo
                ? `Pin note at ${formatTimecode(currentMs)}`
                : "Add note"}
            </button>
          </div>
        </div>
      </section>

      {/* ---------------- feedback sidebar ---------------- */}
      <aside className="flex flex-col">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold tracking-tight">Feedback</h2>
          <div className="flex gap-2 text-xs">
            <span className="rounded-full bg-accent/10 px-2 py-1 font-medium text-accent-ink">
              {openCount} open
            </span>
            <span className="rounded-full bg-good/10 px-2 py-1 font-medium text-good">
              {resolvedCount} resolved
            </span>
          </div>
        </div>

        {initialComments.length === 0 ? (
          <div className="card grid place-items-center px-4 py-12 text-center text-sm text-ink-soft">
            No feedback yet. Be the first to leave a note.
          </div>
        ) : (
          <ul className="flex flex-col gap-3" data-testid="comment-list">
            {initialComments.map((c) => (
              <CommentCard
                key={c.id}
                comment={c}
                onSeek={() => seekTo(c.timecodeMs)}
                onChanged={() => router.refresh()}
              />
            ))}
          </ul>
        )}
      </aside>
    </main>
  );
}

function CommentCard({
  comment,
  onSeek,
  onChanged,
}: {
  comment: Comment;
  onSeek: () => void;
  onChanged: () => void;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [isPending, startTransition] = useTransition();
  const [genPending, startGen] = useTransition();
  const [prompt, setPrompt] = useState<string | null>(comment.generatedPrompt);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function makePrompt() {
    setPromptError(null);
    startGen(async () => {
      const res = await generatePromptAction({ commentId: comment.id });
      if (res.ok && res.prompt) {
        setPrompt(res.prompt);
      } else {
        setPromptError(res.error ?? "Could not generate a prompt.");
      }
    });
  }

  async function copyPrompt() {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setPromptError("Copy failed — select the text manually.");
    }
  }

  function toggleResolved() {
    startTransition(async () => {
      await toggleResolvedAction({ commentId: comment.id });
      onChanged();
    });
  }

  function submitReply() {
    const body = reply.trim();
    if (!body) return;
    startTransition(async () => {
      const res = await addReplyAction({ parentId: comment.id, body });
      if (res.ok) {
        setReply("");
        setReplyOpen(false);
        onChanged();
      }
    });
  }

  return (
    <li
      className={`card p-3 ${comment.resolved ? "opacity-70" : ""}`}
      data-testid="comment-item"
      data-resolved={comment.resolved ? "true" : "false"}
    >
      <div className="mb-1.5 flex items-center gap-2">
        {comment.timecodeMs != null ? (
          <button
            type="button"
            onClick={onSeek}
            data-testid="comment-timecode"
            className="rounded-md bg-ink px-2 py-0.5 font-mono text-xs font-semibold text-white hover:bg-reel"
            title="Jump to this moment"
          >
            {formatTimecode(comment.timecodeMs)}
          </button>
        ) : null}
        <span className="grid h-6 w-6 place-items-center rounded-full bg-reel-soft text-[10px] font-bold text-reel">
          {initialsOf(comment.authorName)}
        </span>
        <span className="text-sm font-medium">{comment.authorName}</span>
        <span className="ml-auto text-[11px] text-ink-faint">
          {formatWhen(comment.createdAt)}
        </span>
      </div>

      <p className="whitespace-pre-wrap text-sm text-ink">{comment.body}</p>

      {comment.hasFrame ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/frame/${comment.id}`}
          alt="Pinned frame with markup"
          data-testid="comment-frame"
          className="mt-2 w-full max-w-[220px] rounded-md border border-line"
        />
      ) : null}

      {prompt ? (
        <div
          className="mt-2 rounded-lg border border-reel/30 bg-reel-soft p-2.5"
          data-testid="generated-prompt"
        >
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-reel">
              Higgsfield prompt
            </span>
            <button
              type="button"
              onClick={copyPrompt}
              data-testid="copy-prompt"
              className="text-[11px] font-medium text-reel hover:underline"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="whitespace-pre-wrap text-xs text-ink">{prompt}</p>
        </div>
      ) : null}

      {promptError ? (
        <p className="mt-1 text-xs font-medium text-red-600">{promptError}</p>
      ) : null}

      {comment.replies.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-2 border-l-2 border-line pl-3">
          {comment.replies.map((r) => (
            <li key={r.id} className="text-sm">
              <span className="font-medium">{r.authorName}</span>{" "}
              <span className="text-[11px] text-ink-faint">
                {formatWhen(r.createdAt)}
              </span>
              <p className="whitespace-pre-wrap text-ink-soft">{r.body}</p>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-2 flex items-center gap-3 text-xs">
        <button
          type="button"
          onClick={() => setReplyOpen((v) => !v)}
          className="font-medium text-reel hover:underline"
          data-testid="reply-toggle"
        >
          Reply
        </button>
        <button
          type="button"
          onClick={toggleResolved}
          disabled={isPending}
          data-testid="resolve-toggle"
          className={`font-medium hover:underline ${
            comment.resolved ? "text-ink-faint" : "text-good"
          }`}
        >
          {comment.resolved ? "Reopen" : "Mark resolved"}
        </button>
        <button
          type="button"
          onClick={makePrompt}
          disabled={genPending}
          data-testid="make-prompt"
          className="font-medium text-accent-ink hover:underline"
        >
          {genPending ? "Generating…" : prompt ? "↻ Regenerate prompt" : "✨ Make prompt"}
        </button>
      </div>

      {replyOpen ? (
        <div className="mt-2">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            className="field"
            rows={2}
            placeholder="Write a reply…"
            data-testid="reply-input"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="btn-primary px-3 py-1.5 text-xs"
              onClick={submitReply}
              disabled={isPending}
              data-testid="reply-submit"
            >
              Reply
            </button>
            <button
              type="button"
              className="btn-ghost px-3 py-1.5 text-xs"
              onClick={() => setReplyOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
