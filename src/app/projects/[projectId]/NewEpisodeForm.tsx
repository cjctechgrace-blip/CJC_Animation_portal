"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSignedUploadAction, createEpisodeAction } from "@/lib/actions";

function putWithProgress(
  url: string,
  file: File,
  contentType: string,
  onPct: (n: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onPct(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else if (xhr.status === 413)
        reject(
          new Error(
            "This file is over the 50 MB limit on the current Supabase plan. Compress the clip, or upgrade Supabase storage for full episodes."
          )
        );
      else reject(new Error(`Upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Upload failed — check your connection."));
    xhr.send(file);
  });
}

export function NewEpisodeForm({
  projectId,
  cloud,
}: {
  projectId: string;
  cloud: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
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
      let videoKey: string | null = null;
      let mimeType: string | null = null;

      if (file) {
        mimeType = file.type || "video/mp4";
        setStatus("Preparing upload…");
        const up = await createSignedUploadAction({
          filename: file.name,
          contentType: mimeType,
        });
        if (!up.ok || !up.uploadUrl || !up.key) {
          throw new Error(up.error || "Could not start upload.");
        }
        setStatus("Uploading video…");
        await putWithProgress(up.uploadUrl, file, mimeType, setPct);
        videoKey = up.key;
      }

      setStatus("Saving episode…");
      const ep = await createEpisodeAction({
        projectId,
        title,
        description,
        videoKey,
        mimeType,
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

  // Local dev (no cloud storage): fall back to a native form post to the route.
  const formProps = cloud
    ? { onSubmit: handleSubmit }
    : {
        action: `/api/projects/${projectId}/episodes`,
        method: "post",
        encType: "multipart/form-data",
        onSubmit: () => setBusy(true),
      };

  return (
    <form {...formProps} className="card w-full max-w-lg p-5">
      <h2 className="mb-3 font-semibold">Add episode</h2>
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
          Video file
        </label>
        <input
          id="video"
          name="video"
          type="file"
          accept="video/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="field file:mr-3 file:rounded file:border-0 file:bg-reel-soft file:px-3 file:py-1 file:text-reel"
        />
        <p className="mt-1 text-xs text-ink-faint">
          Uploads straight to storage — large clips are fine. You can also add
          the episode now and upload later.
        </p>
      </div>

      {busy && status ? (
        <div className="mb-3" data-testid="upload-status">
          <p className="text-sm text-ink-soft">{status}</p>
          {status.startsWith("Uploading") ? (
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
