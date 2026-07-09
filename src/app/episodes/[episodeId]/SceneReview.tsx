"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addCommentAction,
  addReplyAction,
  toggleResolvedAction,
  generatePromptAction,
  deleteCommentAction,
} from "@/lib/actions";
import { formatTimecode, formatWhen, initialsOf } from "@/lib/format";
import {
  SceneEditor,
  type EpisodeSceneRef,
  type EditRecord,
} from "./SceneEditor";

type Reply = {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
};

export type Mark = {
  type: "rect" | "point";
  x: number;
  y: number;
  w: number;
  h: number;
};

export type SceneComment = {
  id: string;
  body: string;
  timecodeMs: number | null;
  resolved: boolean;
  authorName: string;
  createdAt: string;
  hasFrame: boolean;
  generatedPrompt: string | null;
  mark: Mark | null;
  replies: Reply[];
};

/** The highlight shape drawn over the video. */
function MarkShape({ mark, kind }: { mark: Mark; kind: "draft" | "active" }) {
  const ring =
    kind === "active"
      ? "border-accent bg-accent/20 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
      : "border-reel bg-reel/20";
  if (mark.type === "point") {
    return (
      <div
        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
        style={{ left: `${mark.x * 100}%`, top: `${mark.y * 100}%` }}
        data-testid="mark-shape"
      >
        <span
          className={`block h-6 w-6 rounded-full border-2 ${ring} ${
            kind === "active" ? "animate-pulse" : ""
          }`}
        />
      </div>
    );
  }
  return (
    <div
      className={`pointer-events-none absolute rounded-sm border-2 ${ring}`}
      style={{
        left: `${mark.x * 100}%`,
        top: `${mark.y * 100}%`,
        width: `${mark.w * 100}%`,
        height: `${mark.h * 100}%`,
      }}
      data-testid="mark-shape"
    />
  );
}

export function SceneReview({
  sceneId,
  hasVideo,
  videoSrc,
  initialComments,
  activateCommentId,
  activateNonce,
  episodeScenes,
  edits,
}: {
  sceneId: string;
  hasVideo: boolean;
  videoSrc: string | null;
  initialComments: SceneComment[];
  activateCommentId?: string | null;
  activateNonce?: number;
  episodeScenes: EpisodeSceneRef[];
  edits: EditRecord[];
}) {
  const [mode, setMode] = useState<"original" | "edit">("original");
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [currentMs, setCurrentMs] = useState(0);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // marking state
  const [marking, setMarking] = useState(false);
  const [pendingMark, setPendingMark] = useState<Mark | null>(null);
  const [draftMark, setDraftMark] = useState<Mark | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const draftRef = useRef<Mark | null>(null);
  // which comment's mark is currently revealed on the video
  const [activeId, setActiveId] = useState<string | null>(null);

  const openCount = initialComments.filter((c) => !c.resolved).length;
  const resolvedCount = initialComments.length - openCount;
  const activeComment = initialComments.find((c) => c.id === activeId) ?? null;

  const shownMark = draftMark ?? pendingMark ?? (marking ? null : activeComment?.mark ?? null);
  const shownKind: "draft" | "active" = draftMark || pendingMark ? "draft" : "active";

  // Activate an annotation on request (e.g. clicked from the discussion).
  useEffect(() => {
    if (!activateCommentId) return;
    const c = initialComments.find((x) => x.id === activateCommentId);
    if (!c) return;
    setMarking(false);
    setPendingMark(null);
    setActiveId(c.id);
    if (c.timecodeMs != null && videoRef.current) {
      videoRef.current.currentTime = c.timecodeMs / 1000;
      videoRef.current.pause();
      setCurrentMs(c.timecodeMs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activateNonce, activateCommentId]);

  function normFromClient(clientX: number, clientY: number) {
    const rect = overlayRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  }

  function setDraft2(m: Mark | null) {
    draftRef.current = m;
    setDraftMark(m);
  }

  function startMarking() {
    videoRef.current?.pause();
    setActiveId(null);
    setPendingMark(null);
    setDraft2(null);
    setError(null);
    setMarking(true);
  }

  function beginDraw(e: React.MouseEvent) {
    if (!marking) return;
    e.preventDefault();
    const s = normFromClient(e.clientX, e.clientY);
    startRef.current = s;
    setDraft2({ type: "point", x: s.x, y: s.y, w: 0, h: 0 });

    const move = (ev: MouseEvent) => {
      const st = startRef.current;
      if (!st) return;
      const p = normFromClient(ev.clientX, ev.clientY);
      setDraft2({
        type: "rect",
        x: Math.min(st.x, p.x),
        y: Math.min(st.y, p.y),
        w: Math.abs(p.x - st.x),
        h: Math.abs(p.y - st.y),
      });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      const d = draftRef.current;
      startRef.current = null;
      setDraft2(null);
      if (!d) return;
      const final: Mark =
        d.type === "rect" && (d.w < 0.02 || d.h < 0.02)
          ? { type: "point", x: d.x, y: d.y, w: 0, h: 0 }
          : d;
      setPendingMark(final);
      setMarking(false);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  /** Capture the current frame with the mark drawn on it (best effort). */
  function captureFrameWithMark(mark: Mark): string | null {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) return null;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#d8742e";
      ctx.lineWidth = Math.max(3, canvas.width * 0.005);
      if (mark.type === "rect") {
        ctx.strokeRect(
          mark.x * canvas.width,
          mark.y * canvas.height,
          mark.w * canvas.width,
          mark.h * canvas.height
        );
      } else {
        ctx.beginPath();
        ctx.arc(mark.x * canvas.width, mark.y * canvas.height, canvas.width * 0.02, 0, Math.PI * 2);
        ctx.stroke();
      }
      return canvas.toDataURL("image/png");
    } catch {
      return null; // cross-origin taint or decode issue — mark still saves
    }
  }

  function selectComment(c: SceneComment) {
    setMarking(false);
    setPendingMark(null);
    setDraftMark(null);
    setActiveId(c.id);
    if (c.timecodeMs != null && videoRef.current) {
      videoRef.current.currentTime = c.timecodeMs / 1000;
      videoRef.current.pause();
      setCurrentMs(c.timecodeMs);
    }
  }

  function saveFrame() {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) {
      setError("Let the clip load a moment, then try again.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `frame-${formatTimecode(
          Math.round(video.currentTime * 1000)
        ).replace(/[:.]/g, "-")}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, "image/png");
      setError(null);
    } catch {
      setError("Couldn't capture this frame (video still loading).");
    }
  }

  function submitNote() {
    const body = draft.trim();
    if (!body) {
      setError("Write your note first.");
      return;
    }
    const ms = videoRef.current ? Math.round(videoRef.current.currentTime * 1000) : 0;
    setError(null);
    const mark = pendingMark;
    const frameDataUrl = mark ? captureFrameWithMark(mark) : null;
    startTransition(async () => {
      const res = await addCommentAction({
        sceneId,
        body,
        timecodeMs: ms,
        frameDataUrl,
        mark: mark ? JSON.stringify(mark) : null,
      });
      if (!res.ok) {
        setError(res.error ?? "Could not save the note.");
        return;
      }
      setDraft("");
      setPendingMark(null);
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMode("original")}
            data-testid="mode-original"
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              mode === "original"
                ? "bg-reel-soft text-reel"
                : "text-ink-faint hover:bg-paper"
            }`}
          >
            ▶ Original
          </button>
          <button
            type="button"
            onClick={() => setMode("edit")}
            data-testid="mode-edit"
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              mode === "edit"
                ? "bg-reel-soft text-reel"
                : "text-ink-faint hover:bg-paper"
            }`}
          >
            ✂ Edit{edits.length > 0 ? ` (${edits.length})` : ""}
          </button>
        </div>

        {mode === "edit" ? (
          <SceneEditor
            sceneId={sceneId}
            originalSrc={videoSrc}
            episodeScenes={episodeScenes}
            edits={edits}
          />
        ) : (
          <>
        <div className="relative overflow-hidden rounded-xl border border-line bg-black">
          {hasVideo && videoSrc ? (
            <video
              ref={videoRef}
              src={videoSrc}
              controls={!marking}
              crossOrigin="anonymous"
              data-testid="scene-video"
              className="aspect-video w-full bg-black"
              onTimeUpdate={(e) =>
                setCurrentMs(Math.round(e.currentTarget.currentTime * 1000))
              }
            />
          ) : (
            <div className="grid aspect-video w-full place-items-center bg-ink text-center text-sm text-white/70">
              No clip uploaded for this scene yet.
            </div>
          )}

          {/* marking + display overlay */}
          {hasVideo ? (
            <div
              ref={overlayRef}
              data-testid="video-overlay"
              onMouseDown={beginDraw}
              className={`absolute inset-0 ${
                marking ? "cursor-crosshair" : "pointer-events-none"
              }`}
            >
              {shownMark ? <MarkShape mark={shownMark} kind={shownKind} /> : null}
              {marking ? (
                <div className="pointer-events-none absolute inset-x-0 top-0 bg-black/60 px-3 py-1.5 text-center text-xs font-medium text-white">
                  Drag a region, or click a spot — then write your note.
                </div>
              ) : null}
            </div>
          ) : null}
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
                : "Add a general note for this scene…"
            }
          />

          {hasVideo ? (
            <div className="mt-2 flex items-center gap-3 text-sm">
              {marking ? (
                <button
                  type="button"
                  onClick={() => {
                    setMarking(false);
                    setDraftMark(null);
                    startRef.current = null;
                  }}
                  className="font-medium text-ink-faint hover:text-ink"
                >
                  Cancel marking
                </button>
              ) : pendingMark ? (
                <span className="flex items-center gap-2 text-reel">
                  <span data-testid="mark-attached" className="font-medium">
                    ◈ {pendingMark.type === "point" ? "Spot" : "Region"} marked
                  </span>
                  <button
                    type="button"
                    onClick={() => setPendingMark(null)}
                    className="text-xs text-ink-faint hover:text-ink"
                  >
                    clear
                  </button>
                  <button
                    type="button"
                    onClick={startMarking}
                    className="text-xs text-reel hover:underline"
                  >
                    redo
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={startMarking}
                  data-testid="mark-toggle"
                  className="font-medium text-reel hover:underline"
                >
                  ◈ Mark a spot / region
                </button>
              )}
              <button
                type="button"
                onClick={saveFrame}
                data-testid="save-frame"
                className="ml-auto font-medium text-ink-soft hover:text-ink"
              >
                📷 Save frame
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
              {pendingMark
                ? "Your highlight attaches to this note."
                : hasVideo
                ? "Your note pins to the frame showing now."
                : "Upload a clip to pin notes to exact moments."}
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
          </>
        )}
      </section>

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
            No feedback on this scene yet. Be the first to leave a note.
          </div>
        ) : (
          <ul className="flex flex-col gap-3" data-testid="comment-list">
            {initialComments.map((c) => (
              <CommentCard
                key={c.id}
                comment={c}
                active={c.id === activeId}
                onSelect={() => selectComment(c)}
                onChanged={() => router.refresh()}
              />
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

function CommentCard({
  comment,
  active,
  onSelect,
  onChanged,
}: {
  comment: SceneComment;
  active: boolean;
  onSelect: () => void;
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
      if (res.ok && res.prompt) setPrompt(res.prompt);
      else setPromptError(res.error ?? "Could not generate a prompt.");
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

  function deleteThis() {
    if (!window.confirm("Delete this note and its replies? This can't be undone."))
      return;
    startTransition(async () => {
      await deleteCommentAction({ commentId: comment.id });
      onChanged();
    });
  }

  function deleteReply(id: string) {
    if (!window.confirm("Delete this reply?")) return;
    startTransition(async () => {
      await deleteCommentAction({ commentId: id });
      onChanged();
    });
  }

  return (
    <li
      className={`card p-3 ${comment.resolved ? "opacity-70" : ""} ${
        active ? "ring-2 ring-accent" : ""
      }`}
      data-testid="comment-item"
      data-resolved={comment.resolved ? "true" : "false"}
    >
      <div className="mb-1.5 flex items-center gap-2">
        {comment.timecodeMs != null ? (
          <button
            type="button"
            onClick={onSelect}
            data-testid="comment-timecode"
            className="flex items-center gap-1 rounded-md bg-ink px-2 py-0.5 font-mono text-xs font-semibold text-white hover:bg-reel"
            title={comment.mark ? "Jump to this moment & show highlight" : "Jump to this moment"}
          >
            {comment.mark ? <span aria-hidden>◈</span> : null}
            {formatTimecode(comment.timecodeMs)}
          </button>
        ) : null}
        <span className="grid h-6 w-6 place-items-center rounded-full bg-reel-soft text-[10px] font-bold text-reel">
          {initialsOf(comment.authorName)}
        </span>
        <span className="text-sm font-medium">{comment.authorName}</span>
        <span
          suppressHydrationWarning
          className="ml-auto text-[11px] text-ink-faint"
        >
          {formatWhen(comment.createdAt)}
        </span>
      </div>

      <p className="whitespace-pre-wrap text-sm text-ink">{comment.body}</p>

      {comment.mark ? (
        <button
          type="button"
          onClick={onSelect}
          data-testid="show-mark"
          className={`mt-1 text-xs font-medium ${
            active ? "text-accent-ink" : "text-reel hover:underline"
          }`}
        >
          {active ? "◈ highlight shown on video" : "◈ show highlight on video"}
        </button>
      ) : null}

      {comment.hasFrame ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/frame/${comment.id}`}
          alt="Highlighted frame"
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
            <li key={r.id} className="group text-sm">
              <span className="font-medium">{r.authorName}</span>{" "}
              <span suppressHydrationWarning className="text-[11px] text-ink-faint">
                {formatWhen(r.createdAt)}
              </span>
              <button
                type="button"
                onClick={() => deleteReply(r.id)}
                disabled={isPending}
                data-testid="delete-reply"
                className="ml-2 text-[11px] font-medium text-red-500 opacity-0 hover:underline group-hover:opacity-100"
              >
                delete
              </button>
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
        <button
          type="button"
          onClick={deleteThis}
          disabled={isPending}
          data-testid="delete-comment"
          className="ml-auto font-medium text-red-500 hover:underline"
        >
          Delete
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
