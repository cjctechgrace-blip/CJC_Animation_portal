"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addScenesAction } from "@/lib/actions";
import { uploadScenesToStorage } from "@/lib/uploadScenes";

export function AddScenesForm({
  episodeId,
  cloud,
}: {
  episodeId: string;
  cloud: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [pct, setPct] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!files.length) {
      setError("Pick at least one clip.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const scenes = await uploadScenesToStorage(files, (s) => {
        setStatus(
          s.phase === "compress"
            ? `Compressing clip ${s.index + 1} of ${s.total}${
                s.note ? ` — ${s.note}` : "…"
              }`
            : `Uploading clip ${s.index + 1} of ${s.total}…`
        );
        setPct(s.pct);
      });
      setStatus("Saving…");
      const res = await addScenesAction({ episodeId, scenes });
      if (!res.ok) throw new Error(res.error || "Could not add scenes.");
      setFiles([]);
      setOpen(false);
      setBusy(false);
      setStatus("");
      setPct(0);
      router.refresh();
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
        className="btn-ghost text-sm"
        onClick={() => setOpen(true)}
        data-testid="add-scenes-toggle"
      >
        + Add scenes
      </button>
    );
  }

  const formProps = cloud
    ? { onSubmit: handleSubmit }
    : {
        action: `/api/episodes/${episodeId}/scenes`,
        method: "post",
        encType: "multipart/form-data",
        onSubmit: () => setBusy(true),
      };

  return (
    <form {...formProps} className="card w-full p-4">
      <h3 className="mb-2 text-sm font-semibold">Add scene clips</h3>
      <input
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
        className="field text-sm file:mr-3 file:rounded file:border-0 file:bg-reel-soft file:px-3 file:py-1 file:text-reel"
      />
      <p className="mt-1 text-xs text-ink-faint">
        {files.length > 0 ? `${files.length} clip(s) selected.` : "Select one or more clips."}
      </p>

      {busy && status ? (
        <div className="mt-2">
          <p className="text-xs text-ink-soft">{status}</p>
          {/^(Uploading|Compressing)/.test(status) ? (
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-line">
              <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-xs font-medium text-red-600">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex gap-2">
        <button type="submit" className="btn-primary px-3 py-1.5 text-xs" disabled={busy}>
          {busy ? "Working…" : "Upload clips"}
        </button>
        <button
          type="button"
          className="btn-ghost px-3 py-1.5 text-xs"
          onClick={() => setOpen(false)}
          disabled={busy}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
