"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createEditAction,
  updateEditAction,
  deleteEditAction,
} from "@/lib/actions";
import { formatTimecode } from "@/lib/format";
import { EditPlayer, type EditSegment } from "./EditPlayer";
import { SceneCompare } from "./SceneCompare";

export type EpisodeSceneRef = {
  id: string;
  number: number;
  title: string;
  videoSrc: string | null;
};
export type EditRecord = { id: string; name: string; data: string };

function parseSegments(data: string): EditSegment[] {
  try {
    const d = JSON.parse(data);
    if (Array.isArray(d?.segments)) return d.segments as EditSegment[];
  } catch {
    /* ignore */
  }
  return [];
}

export function SceneEditor({
  sceneId,
  originalSrc,
  episodeScenes,
  edits,
}: {
  sceneId: string;
  originalSrc: string | null;
  episodeScenes: EpisodeSceneRef[];
  edits: EditRecord[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [comparing, setComparing] = useState(false);
  const [list, setList] = useState<EditRecord[]>(edits);
  const [selectedId, setSelectedId] = useState<string | null>(edits[0]?.id ?? null);
  const [segments, setSegments] = useState<EditSegment[]>(
    edits[0] ? parseSegments(edits[0].data) : []
  );
  const [selSeg, setSelSeg] = useState(0);
  const [dirty, setDirty] = useState(false);
  const scrubRef = useRef<HTMLVideoElement>(null);

  const srcById = useMemo(() => {
    const m: Record<string, string | null> = {};
    for (const s of episodeScenes) m[s.id] = s.videoSrc;
    return m;
  }, [episodeScenes]);
  const numberById = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of episodeScenes) m[s.id] = s.number;
    return m;
  }, [episodeScenes]);

  function selectEdit(id: string) {
    const e = list.find((x) => x.id === id);
    setSelectedId(id);
    setSegments(e ? parseSegments(e.data) : []);
    setSelSeg(0);
    setDirty(false);
  }

  function newEdit() {
    const name = `Edit ${list.length + 1}`;
    start(async () => {
      const res = await createEditAction({ sceneId, name });
      if (res.ok && res.edit) {
        setList((l) => [...l, res.edit!]);
        setSelectedId(res.edit.id);
        setSegments(parseSegments(res.edit.data));
        setSelSeg(0);
        setDirty(false);
        router.refresh();
      }
    });
  }

  function deleteEdit(id: string) {
    if (!window.confirm("Delete this edit version?")) return;
    start(async () => {
      await deleteEditAction({ editId: id });
      const next = list.filter((e) => e.id !== id);
      setList(next);
      if (selectedId === id) {
        if (next[0]) selectEdit(next[0].id);
        else {
          setSelectedId(null);
          setSegments([]);
        }
      }
      router.refresh();
    });
  }

  function save() {
    if (!selectedId) return;
    start(async () => {
      await updateEditAction({ editId: selectedId, segments });
      setList((l) =>
        l.map((e) =>
          e.id === selectedId ? { ...e, data: JSON.stringify({ segments }) } : e
        )
      );
      setDirty(false);
    });
  }

  // segment ops
  const mutate = (fn: (s: EditSegment[]) => EditSegment[]) => {
    setSegments((prev) => fn([...prev]));
    setDirty(true);
  };
  const addClip = (srcId: string) =>
    mutate((s) => [...s, { sourceSceneId: srcId, inMs: 0, outMs: 0, muted: false }]);
  const removeSeg = (i: number) =>
    mutate((s) => s.filter((_, k) => k !== i));
  const move = (i: number, dir: -1 | 1) =>
    mutate((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      [s[i], s[j]] = [s[j], s[i]];
      return s;
    });
  const toggleMute = (i: number) =>
    mutate((s) => s.map((seg, k) => (k === i ? { ...seg, muted: !seg.muted } : seg)));
  const setIn = (i: number) =>
    mutate((s) =>
      s.map((seg, k) =>
        k === i ? { ...seg, inMs: Math.round((scrubRef.current?.currentTime ?? 0) * 1000) } : seg
      )
    );
  const setOut = (i: number) =>
    mutate((s) =>
      s.map((seg, k) =>
        k === i ? { ...seg, outMs: Math.round((scrubRef.current?.currentTime ?? 0) * 1000) } : seg
      )
    );

  const seg = segments[selSeg];
  const scrubSrc = seg ? srcById[seg.sourceSceneId] ?? null : null;

  return (
    <div className="flex flex-col gap-4" data-testid="scene-editor">
      {/* version bar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Edit version
        </span>
        {list.length > 0 ? (
          <select
            value={selectedId ?? ""}
            onChange={(e) => selectEdit(e.target.value)}
            data-testid="edit-select"
            className="field w-auto py-1 text-sm"
          >
            {list.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm text-ink-faint">No edits yet</span>
        )}
        <button
          type="button"
          onClick={newEdit}
          disabled={pending}
          data-testid="new-edit"
          className="btn-ghost px-2 py-1 text-xs"
        >
          ＋ New edit
        </button>
        {selectedId ? (
          <button
            type="button"
            onClick={() => deleteEdit(selectedId)}
            disabled={pending}
            data-testid="delete-edit"
            className="btn-ghost px-2 py-1 text-xs text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        ) : null}
        {selectedId ? (
          <button
            type="button"
            onClick={() => setComparing((v) => !v)}
            data-testid="compare-toggle"
            className={`px-2 py-1 text-xs font-medium ${
              comparing ? "text-accent-ink" : "text-reel hover:underline"
            }`}
          >
            ⇄ Compare
          </button>
        ) : null}
        {selectedId ? (
          <button
            type="button"
            onClick={save}
            disabled={pending || !dirty}
            data-testid="save-edit"
            className="btn-primary ml-auto px-3 py-1 text-xs"
          >
            {dirty ? "Save changes" : "Saved"}
          </button>
        ) : null}
      </div>

      {!selectedId ? (
        <div className="card grid place-items-center px-6 py-10 text-center text-sm text-ink-soft">
          Create an edit version to start trimming and rearranging clips.
        </div>
      ) : comparing ? (
        <SceneCompare
          originalSrc={originalSrc}
          segments={segments}
          srcById={srcById}
          editName={list.find((e) => e.id === selectedId)?.name ?? "Edit"}
        />
      ) : (
        <>
          {/* preview of the whole edit */}
          <EditPlayer segments={segments} srcById={srcById} testid="edit-preview" />

          {/* timeline */}
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Timeline
            </div>
            <div className="flex flex-wrap gap-2" data-testid="timeline">
              {segments.map((s, i) => {
                const dur = s.outMs > 0 ? s.outMs - s.inMs : null;
                return (
                  <div
                    key={i}
                    onClick={() => setSelSeg(i)}
                    data-testid="segment"
                    className={`cursor-pointer rounded-md border px-3 py-2 text-left text-xs ${
                      i === selSeg ? "border-reel bg-reel-soft" : "border-line bg-panel"
                    }`}
                  >
                    <div className="font-semibold">
                      Scene {numberById[s.sourceSceneId] ?? "?"} {s.muted ? "🔇" : "🔊"}
                    </div>
                    <div className="text-ink-faint">
                      {formatTimecode(s.inMs)} → {s.outMs > 0 ? formatTimecode(s.outMs) : "end"}
                      {dur != null ? ` (${formatTimecode(dur)})` : ""}
                    </div>
                    <div className="mt-1 flex gap-1 text-[11px]">
                      <button type="button" onClick={(e) => { e.stopPropagation(); move(i, -1); }} className="hover:text-reel">◀</button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); move(i, 1); }} className="hover:text-reel">▶</button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); toggleMute(i); }} className="hover:text-reel">{s.muted ? "unmute" : "mute"}</button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); removeSeg(i); }} data-testid="remove-segment" className="ml-1 text-red-500 hover:underline">×</button>
                    </div>
                  </div>
                );
              })}

              {/* add clip (merge) */}
              <select
                value=""
                onChange={(e) => e.target.value && addClip(e.target.value)}
                data-testid="add-clip"
                className="field w-auto self-start py-1 text-xs"
              >
                <option value="">＋ Add clip…</option>
                {episodeScenes.map((s) => (
                  <option key={s.id} value={s.id}>
                    Scene {s.number}
                    {s.videoSrc ? "" : " (no clip)"}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* trim the selected segment */}
          {seg ? (
            <div className="card p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                Trim Scene {numberById[seg.sourceSceneId] ?? "?"} — scrub, then set in/out
              </div>
              {scrubSrc ? (
                <video
                  ref={scrubRef}
                  src={scrubSrc}
                  controls
                  crossOrigin="anonymous"
                  data-testid="trim-scrubber"
                  className="aspect-video w-full max-w-md rounded-lg bg-black"
                />
              ) : (
                <p className="text-sm text-ink-faint">This scene has no clip to trim.</p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <button type="button" onClick={() => setIn(selSeg)} data-testid="set-in" className="btn-ghost px-2 py-1 text-xs">
                  ⟝ Set in @ playhead
                </button>
                <button type="button" onClick={() => setOut(selSeg)} data-testid="set-out" className="btn-ghost px-2 py-1 text-xs">
                  Set out @ playhead ⟞
                </button>
                <span className="font-mono text-xs text-ink-soft">
                  in {formatTimecode(seg.inMs)} · out {seg.outMs > 0 ? formatTimecode(seg.outMs) : "end"}
                </span>
                <button
                  type="button"
                  onClick={() => mutate((s) => s.map((x, k) => (k === selSeg ? { ...x, inMs: 0, outMs: 0 } : x)))}
                  className="text-xs text-ink-faint hover:text-ink"
                >
                  reset trim
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
