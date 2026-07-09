"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reorderScenesAction, deleteSceneAction } from "@/lib/actions";
import { SceneReview, type SceneComment } from "./SceneReview";
import { AddScenesForm } from "./AddScenesForm";
import {
  EpisodeDiscussion,
  type DiscussionPost,
} from "./EpisodeDiscussion";
import type { EditRecord } from "./SceneEditor";

export type SceneData = {
  id: string;
  title: string;
  hasVideo: boolean;
  videoSrc: string | null;
  openCount: number;
  comments: SceneComment[];
  edits: EditRecord[];
};

export function EpisodeView({
  episodeId,
  cloud,
  scenes,
  posts,
}: {
  episodeId: string;
  cloud: boolean;
  scenes: SceneData[];
  posts: DiscussionPost[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<SceneData[]>(scenes);
  const [selectedId, setSelectedId] = useState<string | null>(
    scenes[0]?.id ?? null
  );
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const dragIndex = useRef<number | null>(null);
  const [, startReorder] = useTransition();
  const reviewRef = useRef<HTMLDivElement>(null);
  const [activateReq, setActivateReq] = useState<{
    commentId: string;
    nonce: number;
  } | null>(null);

  function openAnnotation(sceneId: string, commentId: string) {
    setSelectedId(sceneId);
    setActivateReq({ commentId, nonce: activateReq ? activateReq.nonce + 1 : 1 });
    requestAnimationFrame(() =>
      reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  }

  // Re-sync when the server sends new data (reorder, add/delete/resolve notes,
  // edits changed, etc.) — the signature captures comment + edit changes too.
  const sig = JSON.stringify(
    scenes.map((s) => [
      s.id,
      s.comments.map((c) => [
        c.id,
        c.resolved,
        c.replies.length,
        c.hasFrame,
        c.generatedPrompt ? 1 : 0,
      ]),
      s.edits.map((e) => [e.id, e.data.length]),
    ])
  );
  useEffect(() => {
    setItems(scenes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  // Live updates: quietly re-fetch every 10s (when the tab is visible) so notes,
  // replies, and discussion posts from teammates show up without a reload.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 10000);
    return () => clearInterval(id);
  }, [router]);

  const selected =
    items.find((s) => s.id === selectedId) ?? items[0] ?? null;
  const episodeScenes = items.map((s, i) => ({
    id: s.id,
    number: i + 1,
    title: s.title,
    videoSrc: s.videoSrc,
  }));

  function drop(target: number) {
    const from = dragIndex.current;
    dragIndex.current = null;
    setOverIndex(null);
    if (from == null || from === target) return;

    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(target, 0, moved);
    setItems(next); // optimistic

    startReorder(async () => {
      await reorderScenesAction({ episodeId, orderedIds: next.map((s) => s.id) });
      router.refresh();
    });
  }

  function deleteScene(id: string, title: string) {
    if (
      !window.confirm(
        `Delete "${title}"? This permanently removes its clip and all its feedback, and frees the storage space.`
      )
    )
      return;
    const next = items.filter((s) => s.id !== id);
    setItems(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
    startReorder(async () => {
      await deleteSceneAction({ sceneId: id });
      router.refresh();
    });
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-6">
      {/* scene strip (drag to reorder) */}
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs text-ink-faint">
          {items.length > 1 ? "Drag scenes to reorder" : "Scenes"}
        </span>
      </div>
      <div className="mb-3 flex items-start gap-3">
        <div className="flex flex-1 gap-2 overflow-x-auto pb-1" data-testid="scene-strip">
          {items.map((s, i) => {
            const active = s.id === selected?.id;
            const isOver = overIndex === i;
            return (
              <div
                key={s.id}
                draggable
                onDragStart={(e) => {
                  dragIndex.current = i;
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (overIndex !== i) setOverIndex(i);
                }}
                onDrop={() => drop(i)}
                onDragEnd={() => {
                  dragIndex.current = null;
                  setOverIndex(null);
                }}
                data-testid="scene-tab"
                onClick={() => setSelectedId(s.id)}
                className={`relative flex min-w-[150px] cursor-pointer flex-col items-start rounded-lg border px-3 py-2 pr-7 text-left transition-colors ${
                  active
                    ? "border-reel bg-reel-soft"
                    : "border-line bg-panel hover:bg-paper"
                } ${isOver ? "ring-2 ring-accent" : ""}`}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteScene(s.id, s.title);
                  }}
                  data-testid="delete-scene"
                  title="Delete scene"
                  className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded text-ink-faint hover:bg-red-50 hover:text-red-600"
                >
                  ×
                </button>
                <span className="flex w-full items-center gap-1.5 text-xs font-mono text-ink-faint">
                  <span
                    className="cursor-grab select-none text-ink-faint/70"
                    title="Drag to reorder"
                    aria-hidden
                  >
                    ⠿
                  </span>
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${
                      s.hasVideo ? "bg-good" : "bg-line"
                    }`}
                  />
                  Scene {i + 1}
                </span>
                <span className="mt-0.5 line-clamp-1 text-sm font-medium">
                  {s.title}
                </span>
                <span className="mt-1 text-[11px] text-ink-faint">
                  {s.openCount > 0
                    ? `${s.openCount} open`
                    : s.comments.length > 0
                    ? "all resolved"
                    : "no notes"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mb-5">
        <AddScenesForm episodeId={episodeId} cloud={cloud} />
      </div>

      <div ref={reviewRef} className="scroll-mt-4">
        {selected ? (
          <SceneReview
            key={selected.id}
            sceneId={selected.id}
            hasVideo={selected.hasVideo}
            videoSrc={selected.videoSrc}
            initialComments={selected.comments}
            activateCommentId={activateReq?.commentId ?? null}
            activateNonce={activateReq?.nonce ?? 0}
            episodeScenes={episodeScenes}
            edits={selected.edits}
          />
        ) : (
          <div className="card grid place-items-center px-6 py-16 text-center">
            <p className="text-ink-soft">
              No scenes yet. Add your scene clips to start reviewing.
            </p>
          </div>
        )}
      </div>

      <EpisodeDiscussion
        episodeId={episodeId}
        scenes={items}
        posts={posts}
        onOpenAnnotation={openAnnotation}
      />
    </div>
  );
}
