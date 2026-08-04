"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createEpisodeWithScenesAction } from "@/lib/actions";
import { uploadScenesToStorage, type UploadMode } from "@/lib/uploadScenes";

export function NewEpisodeForm({
  projectId,
  uploadMode,
}: {
  projectId: string;
  uploadMode: UploadMode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [pct, setPct] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Give the episode a title.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      let scenes: { title: string; videoKey: string; mimeType: string }[] = [];
      if (files.length) {
        scenes = await uploadScenesToStorage(
          files,
          (s) => {
            const base =
              s.phase === "compress"
                ? `Compressing clip ${s.index + 1} of ${s.total}…`
                : `Uploading clip ${s.index + 1} of ${s.total}…`;
            setStatus(s.note ? `${base} ${s.note}` : base);
            setPct(s.pct);
          },
          uploadMode
        );
      }
      setStatus("Creating episode…");
      const ep = await createEpisodeWithScenesAction({
        projectId,
        title,
        description,
        scenes,
        notifyTeam: notify,
      });
      if (!ep.ok || !ep.episodeId) throw new Error(ep.error || "Could not save.");
      router.push(`/episodes/${ep.episodeId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
      setStatus("");
      setPct(0);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn-primary"
        onClick={() => setOpen(true)}
        data-testid="new-episode-toggle"
      >
        + Add episode
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card w-full max-w-lg p-5">
      <h2 className="mb-1 font-semibold">Add episode</h2>
      <p className="mb-3 text-xs text-ink-faint">
        An episode is a set of short scene clips. Add them all at once.
      </p>
      <div className="mb-3">
        <label className="label" htmlFor="title">
          Episode title
        </label>
        <input
          id="title"
          name="title"
          className="field"
          placeholder="e.g. Ep 1 — The Beginning"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          autoFocus
        />
      </div>
      <div className="mb-3">
        <label className="label" htmlFor="description">
          Notes for reviewers (optional)
        </label>
        <textarea
          id="description"
          name="description"
          className="field"
          rows={2}
          placeholder="Anything the team should know before watching."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="mb-4">
        <label className="label" htmlFor="video">
          Scene clips
        </label>
        <input
          id="video"
          name="video"
          type="file"
          accept="video/*"
          multiple
          onChange={(e) =>
            setFiles(
              Array.from(e.target.files ?? []).filter((f) =>
                f.type.startsWith("video/")
              )
            )
          }
          className="field file:mr-3 file:rounded file:border-0 file:bg-reel-soft file:px-3 file:py-1 file:text-reel"
        />
        <p className="mt-1 text-xs text-ink-faint">
          Select every clip in your scene folder (open the folder, then Ctrl+A).
          Big clips are compressed right in your browser before uploading.
          {files.length > 0 ? ` ${files.length} clip(s) selected.` : ""}
        </p>
      </div>

      <label className="mb-4 flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
        <input
          type="checkbox"
          checked={notify}
          onChange={(e) => setNotify(e.target.checked)}
          data-testid="notify-team"
          className="h-4 w-4 accent-reel"
        />
        📣 Email the team that this episode is ready for review
      </label>

      {busy && status ? (
        <div className="mb-3" data-testid="upload-status">
          <p className="text-sm text-ink-soft">{status}</p>
          {/^(Uploading|Compressing)/.test(status) ? (
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-line">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mb-3 text-sm font-medium text-red-600">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Working…" : "Create episode"}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setOpen(false)}
          disabled={busy}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
