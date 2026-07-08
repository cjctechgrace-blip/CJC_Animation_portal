"use client";

import { useState } from "react";
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
  const [selectedId, setSelectedId] = useState<string | null>(
    scenes[0]?.id ?? null
  );
  const selected = scenes.find((s) => s.id === selectedId) ?? scenes[0] ?? null;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-6">
      {/* scene strip */}
      <div className="mb-3 flex items-start gap-3">
        <div className="flex flex-1 gap-2 overflow-x-auto pb-1" data-testid="scene-strip">
          {scenes.map((s, i) => {
            const active = s.id === selected?.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedId(s.id)}
                data-testid="scene-tab"
                className={`flex min-w-[130px] flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors ${
                  active
                    ? "border-reel bg-reel-soft"
                    : "border-line bg-panel hover:bg-paper"
                }`}
              >
                <span className="flex items-center gap-1.5 text-xs font-mono text-ink-faint">
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
              </button>
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
