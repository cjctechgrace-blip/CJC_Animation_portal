"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reorderScenesAction, deleteSceneAction } from "@/lib/actions";
import { SceneReview, type SceneComment } from "./SceneReview";
import { AddScenesForm } from "./AddScenesForm";

export type SceneData = {
  id: string;
  title: string;
  hasVideo: boolean;
  videoSrc: string | null;
  openCount: number;
  comments: SceneComment[];
};

export function EpisodeView({
  episodeId,
  cloud,
  scenes,
}: {
  episodeId: string;
  cloud: boolean;
  scenes: SceneData[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<SceneData[]>(scenes);
  const [selectedId, setSelectedId] = useState<string | null>(
    scenes[0]?.id ?? null
  );
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const dragIndex = useRef<number | null>(null);
  const [, startReorder] = useTransition();

  // Re-sync when the server sends a new order (e.g. after add/reorder/refresh).
  const sig = scenes.map((s) => s.id).join(",");
  useEffect(() => {
    setItems(scenes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const selected =
    items.find((s) => s.id === selectedId) ?? items[0] ?? null;

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

      {selected ? (
        <SceneReview
          key={selected.id}
          sceneId={selected.id}
          hasVideo={selected.hasVideo}
          videoSrc={selected.videoSrc}
          initialComments={selected.comments}
        />
      ) : (
        <div className="card grid place-items-center px-6 py-16 text-center">
          <p className="text-ink-soft">
            No scenes yet. Add your scene clips to start reviewing.
          </p>
        </div>
      )}
    </div>
  );
}
