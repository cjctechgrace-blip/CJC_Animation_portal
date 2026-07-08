"use client";

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export type EditSegment = {
  sourceSceneId: string;
  inMs: number;
  outMs: number; // 0 = play to natural end of clip
  muted: boolean;
};

export type EditPlayerHandle = { play: () => void; stop: () => void };

/**
 * Plays an edit's segments back-to-back from the original clips (non-destructive).
 * Seeks each source clip to its in-point, plays to its out-point, then advances.
 */
export const EditPlayer = forwardRef<
  EditPlayerHandle,
  {
    segments: EditSegment[];
    srcById: Record<string, string | null>;
    testid?: string;
    showButton?: boolean;
  }
>(function EditPlayer({ segments, srcById, testid, showButton = true }, ref) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const idxRef = useRef(0);
  const playingRef = useRef(false);
  const curSrcRef = useRef<string | null>(null);
  const [playing, setPlaying] = useState(false);

  function stop() {
    playingRef.current = false;
    setPlaying(false);
    videoRef.current?.pause();
  }

  function playSegment(i: number) {
    const v = videoRef.current;
    if (!v) return;
    const seg = segments[i];
    if (!seg) {
      stop();
      return;
    }
    idxRef.current = i;
    const src = srcById[seg.sourceSceneId] ?? null;
    if (!src) {
      playSegment(i + 1);
      return;
    }
    const start = () => {
      v.muted = seg.muted;
      try {
        v.currentTime = seg.inMs / 1000;
      } catch {
        /* seek before ready — ignore */
      }
      v.play().catch(() => {});
    };
    if (curSrcRef.current !== src) {
      curSrcRef.current = src;
      v.src = src;
      const onMeta = () => {
        v.removeEventListener("loadedmetadata", onMeta);
        start();
      };
      v.addEventListener("loadedmetadata", onMeta);
      v.load();
    } else {
      start();
    }
  }

  function advance() {
    const next = idxRef.current + 1;
    if (next < segments.length) playSegment(next);
    else stop();
  }

  function onTimeUpdate() {
    if (!playingRef.current) return;
    const v = videoRef.current;
    const seg = segments[idxRef.current];
    if (!v || !seg) return;
    if (seg.outMs > 0 && v.currentTime * 1000 >= seg.outMs) advance();
  }

  function onEnded() {
    if (playingRef.current) advance();
  }

  function play() {
    if (!segments.length) return;
    curSrcRef.current = null; // force (re)load of the first segment
    playingRef.current = true;
    setPlaying(true);
    playSegment(0);
  }

  useImperativeHandle(ref, () => ({ play, stop }));

  return (
    <div>
      <video
        ref={videoRef}
        onTimeUpdate={onTimeUpdate}
        onEnded={onEnded}
        crossOrigin="anonymous"
        playsInline
        className="aspect-video w-full rounded-lg bg-black"
        data-testid={testid}
      />
      {showButton ? (
        <button
          type="button"
          onClick={playing ? stop : play}
          data-testid="play-edit"
          className="btn-primary mt-2 px-3 py-1.5 text-sm"
        >
          {playing ? "■ Stop" : "▶ Play edit"}
        </button>
      ) : null}
    </div>
  );
});
