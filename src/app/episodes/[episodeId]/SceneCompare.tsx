"use client";

import { useRef } from "react";
import {
  EditPlayer,
  type EditPlayerHandle,
  type EditSegment,
} from "./EditPlayer";

export function SceneCompare({
  originalSrc,
  segments,
  srcById,
  editName,
}: {
  originalSrc: string | null;
  segments: EditSegment[];
  srcById: Record<string, string | null>;
  editName: string;
}) {
  const origRef = useRef<HTMLVideoElement>(null);
  const editRef = useRef<EditPlayerHandle>(null);

  function playBoth() {
    const o = origRef.current;
    if (o) {
      try {
        o.currentTime = 0;
      } catch {
        /* ignore */
      }
      o.play().catch(() => {});
    }
    editRef.current?.play();
  }
  function stopBoth() {
    origRef.current?.pause();
    editRef.current?.stop();
  }

  return (
    <div className="flex flex-col gap-3" data-testid="scene-compare">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={playBoth}
          data-testid="play-both"
          className="btn-primary px-3 py-1.5 text-sm"
        >
          ▶ Play both
        </button>
        <button
          type="button"
          onClick={stopBoth}
          className="btn-ghost px-3 py-1.5 text-sm"
        >
          ■ Stop
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Original
          </div>
          {originalSrc ? (
            <video
              ref={origRef}
              src={originalSrc}
              controls
              crossOrigin="anonymous"
              data-testid="compare-original"
              className="aspect-video w-full rounded-lg bg-black"
            />
          ) : (
            <div className="grid aspect-video w-full place-items-center rounded-lg bg-ink text-xs text-white/60">
              No clip
            </div>
          )}
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Edit · {editName}
          </div>
          <EditPlayer
            ref={editRef}
            segments={segments}
            srcById={srcById}
            showButton={false}
            testid="compare-edit"
          />
        </div>
      </div>
    </div>
  );
}
