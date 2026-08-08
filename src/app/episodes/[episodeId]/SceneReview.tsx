"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addCommentAction,
  addReplyAction,
  toggleResolvedAction,
  generatePromptAction,
  deleteCommentAction,
  replaceSceneVideoAction,
  setCommentPriorityAction,
} from "@/lib/actions";
import { uploadScenesToStorage, type UploadMode } from "@/lib/uploadScenes";
import { formatTimecode, formatWhen, initialsOf } from "@/lib/format";
import {
  SceneEditor,
  type EpisodeSceneRef,
  type EditRecord,
} from "./SceneEditor";

type Reply = {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: string;
};

export type Viewer = { id: string; isAdmin: boolean; isEditor: boolean };

export type Mark =
  | { type: "rect" | "point"; x: number; y: number; w: number; h: number }
  | { type: "path"; points: { x: number; y: number }[] };

export type SceneVersionRef = { versionNo: number };

export type SceneComment = {
  id: string;
  body: string;
  timecodeMs: number | null;
  resolved: boolean;
  priority: number | null;
  authorId: string;
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
  if (mark.type === "path") {
    return (
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        data-testid="mark-shape"
      >
        <polyline
          points={mark.points.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")}
          fill="none"
          stroke={kind === "active" ? "#f59e0b" : "#d8742e"}
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          style={{ strokeWidth: 4 }}
        />
      </svg>
    );
  }
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

/** Shared look for the 1-5 "how big a deal?" score. */
function priorityClasses(p: number) {
  if (p >= 4) return "bg-red-50 text-red-600";
  if (p === 3) return "bg-accent/10 text-accent-ink";
  return "bg-paper text-ink-faint";
}

function priorityWord(p: number) {
  return p >= 4 ? "must fix" : p === 3 ? "should fix" : "nice to have";
}

/** Row of 1-5 buttons used by the composer and the note card. */
function PriorityPicker({
  value,
  onPick,
  size = "md",
}: {
  value: number | null;
  onPick: (p: number | null) => void;
  size?: "sm" | "md";
}) {
  const box = size === "sm" ? "h-5 w-5 text-[11px]" : "h-6 w-6 text-xs";
  return (
    <span className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          data-testid={`priority-${n}`}
          title={`${n} — ${priorityWord(n)}`}
          onClick={() => onPick(value === n ? null : n)}
          className={`grid place-items-center rounded-md border font-semibold ${box} ${
            value === n
              ? "border-reel bg-reel-soft text-reel"
              : "border-line text-ink-faint hover:bg-paper"
          }`}
        >
          {n}
        </button>
      ))}
    </span>
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
  viewer,
  uploadMode,
  canReplace,
  versions,
}: {
  sceneId: string;
  hasVideo: boolean;
  videoSrc: string | null;
  initialComments: SceneComment[];
  activateCommentId?: string | null;
  activateNonce?: number;
  episodeScenes: EpisodeSceneRef[];
  edits: EditRecord[];
  viewer: Viewer;
  uploadMode: UploadMode;
  canReplace: boolean;
  versions: SceneVersionRef[];
}) {
  const [mode, setMode] = useState<"original" | "edit">("original");
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [currentMs, setCurrentMs] = useState(0);
  const [draft, setDraft] = useState("");
  const [draftPriority, setDraftPriority] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<"time" | "priority">("time");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [replaceStatus, setReplaceStatus] = useState<string | null>(null);

  async function handleReplaceFile(file: File | undefined) {
    if (!file || !file.type.startsWith("video/")) return;
    if (
      !window.confirm(
        "Upload the improved clip? The current one is kept as a version so everyone can compare before/after; all notes stay."
      )
    )
      return;
    try {
      const [uploaded] = await uploadScenesToStorage(
        [file],
        (s) =>
          setReplaceStatus(
            s.phase === "compress"
              ? `Compressing… ${s.pct}%`
              : `Uploading… ${s.pct}%`
          ),
        uploadMode
      );
      setReplaceStatus("Saving…");
      const res = await replaceSceneVideoAction({
        sceneId,
        videoKey: uploaded.videoKey,
        mimeType: uploaded.mimeType,
      });
      if (!res.ok) throw new Error(res.error || "Could not replace the clip.");
      setReplaceStatus(null);
      router.refresh();
    } catch (e) {
      setReplaceStatus(
        e instanceof Error ? e.message : "Something went wrong."
      );
    }
  }

  // marking state
  const [marking, setMarking] = useState(false);
  const [markTool, setMarkTool] = useState<"shape" | "pen">("shape");
  // which clip version is playing: null = current, otherwise a prior versionNo
  const [viewVersion, setViewVersion] = useState<number | null>(null);
  const pathRef = useRef<{ x: number; y: number }[]>([]);
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

  function startMarking(tool: "shape" | "pen" = "shape") {
    videoRef.current?.pause();
    setActiveId(null);
    setPendingMark(null);
    setDraft2(null);
    setError(null);
    setMarkTool(tool);
    setMarking(true);
  }

  function beginDraw(e: React.MouseEvent) {
    if (!marking) return;
    e.preventDefault();

    if (markTool === "pen") {
      const s = normFromClient(e.clientX, e.clientY);
      pathRef.current = [s];
      setDraft2({ type: "path", points: [s] });
      const move = (ev: MouseEvent) => {
        const pt = normFromClient(ev.clientX, ev.clientY);
        const last = pathRef.current[pathRef.current.length - 1];
        // skip micro-movements to keep the stored path light
        if (Math.hypot(pt.x - last.x, pt.y - last.y) < 0.004) return;
        pathRef.current = [...pathRef.current, pt];
        setDraft2({ type: "path", points: pathRef.current });
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        const pts = pathRef.current;
        pathRef.current = [];
        setDraft2(null);
        if (pts.length >= 3) {
          setPendingMark({ type: "path", points: pts });
          setMarking(false);
        }
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
      return;
    }

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
      if (mark.type === "path") {
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.beginPath();
        mark.points.forEach((pt, i) => {
          const px = pt.x * canvas.width;
          const py = pt.y * canvas.height;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
      } else if (mark.type === "rect") {
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
        priority: draftPriority,
      });
      if (!res.ok) {
        setError(res.error ?? "Could not save the note.");
        return;
      }
      setDraft("");
      setDraftPriority(null);
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

          {versions.length > 0 && mode === "original" ? (
            <span className="ml-auto flex items-center gap-2 text-xs">
              <select
                className="field w-auto px-2 py-1 text-xs"
                value={viewVersion === null ? "current" : String(viewVersion)}
                onChange={(e) =>
                  setViewVersion(
                    e.target.value === "current" ? null : parseInt(e.target.value, 10)
                  )
                }
                data-testid="version-select"
                title="This scene has been re-uploaded — compare versions"
              >
                <option value="current">
                  Improvement {versions.length} (current)
                </option>
                {[...versions]
                  .sort((a, b) => b.versionNo - a.versionNo)
                  .map((v) => (
                    <option key={v.versionNo} value={String(v.versionNo)}>
                      {v.versionNo === 0 ? "Original" : `Improvement ${v.versionNo}`}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                data-testid="before-after"
                className="btn-ghost px-2 py-1 text-xs"
                title="Flip between the newest clip and the one before it"
                onClick={() =>
                  setViewVersion(viewVersion === null ? versions.length - 1 : null)
                }
              >
                {viewVersion === null ? "◀ Before" : "After ▶"}
              </button>
            </span>
          ) : null}
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
              key={viewVersion === null ? "current" : `v${viewVersion}`}
              src={
                viewVersion === null
                  ? videoSrc
                  : `/api/video/${sceneId}?v=${viewVersion}`
              }
              controls={!marking}
              crossOrigin="anonymous"
              data-testid="scene-video"
              className="aspect-video w-full bg-black"
              onTimeUpdate={(e) =>
                setCurrentMs(Math.round(e.currentTarget.currentTime * 1000))
              }
            />
          ) : hasVideo ? (
            <div
              className="grid aspect-video w-full place-items-center bg-ink text-center text-sm text-white/70"
              data-testid="video-processing"
            >
              <div>
                <p className="text-base">⏳ Processing video…</p>
                <p className="mt-1 text-xs text-white/50">
                  Bunny is preparing this clip for streaming. It appears here
                  automatically — usually under a minute.
                </p>
              </div>
            </div>
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
                  {markTool === "pen"
                    ? "Draw on the frame with the marker — release to finish."
                    : "Drag a region, or click a spot — then write your note."}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {viewVersion !== null ? (
          <div
            className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-medium text-accent-ink"
            data-testid="viewing-old-version"
          >
            Viewing {viewVersion === 0 ? "the Original" : `Improvement ${viewVersion}`}{" "}
            (read-only) — switch back to the current clip to leave notes.
          </div>
        ) : null}

        <div className={`card p-4 ${viewVersion !== null ? "hidden" : ""}`}>
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
                    ◈{" "}
                    {pendingMark.type === "path"
                      ? "Drawing"
                      : pendingMark.type === "point"
                      ? "Spot"
                      : "Region"}{" "}
                    marked
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
                    onClick={() =>
                      startMarking(pendingMark.type === "path" ? "pen" : "shape")
                    }
                    className="text-xs text-reel hover:underline"
                  >
                    redo
                  </button>
                </span>
              ) : (
                <span className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => startMarking("shape")}
                    data-testid="mark-toggle"
                    className="font-medium text-reel hover:underline"
                  >
                    ◈ Mark a spot / region
                  </button>
                  <button
                    type="button"
                    onClick={() => startMarking("pen")}
                    data-testid="draw-toggle"
                    className="font-medium text-reel hover:underline"
                  >
                    ✏️ Draw
                  </button>
                </span>
              )}
              {canReplace ? (
                <label
                  className="ml-auto cursor-pointer font-medium text-ink-soft hover:text-ink"
                  data-testid="replace-clip"
                  title="Upload a new version of this clip (for the next review round)"
                >
                  ↻ Replace clip
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => handleReplaceFile(e.target.files?.[0])}
                  />
                </label>
              ) : null}
              <button
                type="button"
                onClick={saveFrame}
                data-testid="save-frame"
                className={`${canReplace ? "" : "ml-auto "}font-medium text-ink-soft hover:text-ink`}
              >
                📷 Save frame
              </button>
            </div>
          ) : null}

          <div className="mt-2 flex items-center gap-2 text-xs">
            <span
              className="text-ink-faint"
              title="Rate every note so the team knows what to fix first — 4-5 get fixed, 1-2 are parked."
            >
              How big a deal?
            </span>
            <PriorityPicker value={draftPriority} onPick={setDraftPriority} />
            <span className="text-ink-faint/70" data-testid="priority-word">
              {draftPriority ? priorityWord(draftPriority) : "optional"}
            </span>
          </div>

          {replaceStatus ? (
            <p className="mt-2 text-xs font-medium text-reel" data-testid="replace-status">
              {replaceStatus}
            </p>
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
          <div className="flex items-center gap-2 text-xs">
            {initialComments.length > 1 ? (
              <button
                type="button"
                data-testid="sort-toggle"
                onClick={() =>
                  setSortBy(sortBy === "time" ? "priority" : "time")
                }
                title="Flip between newest-first and biggest-deal-first"
                className="font-medium text-reel hover:underline"
              >
                {sortBy === "time" ? "↕ by priority" : "↕ by time"}
              </button>
            ) : null}
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
            {(sortBy === "priority"
              ? [...initialComments].sort(
                  (a, b) =>
                    Number(a.resolved) - Number(b.resolved) ||
                    (b.priority ?? 0) - (a.priority ?? 0)
                )
              : initialComments
            ).map((c) => (
              <CommentCard
                key={c.id}
                comment={c}
                viewer={viewer}
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
  viewer,
  active,
  onSelect,
  onChanged,
}: {
  comment: SceneComment;
  viewer: Viewer;
  active: boolean;
  onSelect: () => void;
  onChanged: () => void;
}) {
  const canDelete = viewer.isAdmin || comment.authorId === viewer.id;
  const canRate =
    viewer.isAdmin || viewer.isEditor || comment.authorId === viewer.id;
  const [rateOpen, setRateOpen] = useState(false);
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

  function setPriority(p: number | null) {
    startTransition(async () => {
      await setCommentPriorityAction({ commentId: comment.id, priority: p });
      setRateOpen(false);
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
        {comment.priority != null ? (
          <button
            type="button"
            data-testid="priority-badge"
            title={
              canRate
                ? `Priority ${comment.priority} — ${priorityWord(comment.priority)}. Click to change.`
                : `Priority ${comment.priority} — ${priorityWord(comment.priority)}`
            }
            onClick={() => canRate && setRateOpen((v) => !v)}
            className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${priorityClasses(
              comment.priority
            )} ${canRate ? "hover:ring-1 hover:ring-line" : "cursor-default"}`}
          >
            P{comment.priority}
          </button>
        ) : null}
        <span
          suppressHydrationWarning
          className="ml-auto text-[11px] text-ink-faint"
        >
          {formatWhen(comment.createdAt)}
        </span>
      </div>

      {rateOpen ? (
        <div className="mb-1.5 flex items-center gap-2 text-[11px] text-ink-faint">
          How big a deal?
          <PriorityPicker
            value={comment.priority}
            onPick={(p) => setPriority(p)}
            size="sm"
          />
          {comment.priority != null ? (
            <button
              type="button"
              onClick={() => setPriority(null)}
              className="hover:text-ink hover:underline"
            >
              clear
            </button>
          ) : null}
        </div>
      ) : null}

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
              {viewer.isAdmin || r.authorId === viewer.id ? (
                <button
                  type="button"
                  onClick={() => deleteReply(r.id)}
                  disabled={isPending}
                  data-testid="delete-reply"
                  className="ml-2 text-[11px] font-medium text-red-500 opacity-0 hover:underline group-hover:opacity-100"
                >
                  delete
                </button>
              ) : null}
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
        {canRate && comment.priority == null ? (
          <button
            type="button"
            onClick={() => setRateOpen((v) => !v)}
            data-testid="rate-toggle"
            className="font-medium text-ink-faint hover:text-ink hover:underline"
            title="Score this note 1-5 so the team knows how urgent it is"
          >
            ☆ Rate 1–5
          </button>
        ) : null}
        <button
          type="button"
          onClick={makePrompt}
          disabled={genPending}
          data-testid="make-prompt"
          className="font-medium text-accent-ink hover:underline"
        >
          {genPending ? "Generating…" : prompt ? "↻ Regenerate prompt" : "✨ Make prompt"}
        </button>
        {canDelete ? (
          <button
            type="button"
            onClick={deleteThis}
            disabled={isPending}
            data-testid="delete-comment"
            className="ml-auto font-medium text-red-500 hover:underline"
          >
            Delete
          </button>
        ) : null}
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
