"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { renameEpisodeAction, renameProjectAction } from "@/lib/actions";

/** Inline ✏️ rename for a project or an episode. */
export function RenameButton({
  kind,
  id,
  currentName,
  currentDescription,
}: {
  kind: "project" | "episode";
  id: string;
  currentName: string;
  currentDescription: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [description, setDescription] = useState(currentDescription);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res =
        kind === "project"
          ? await renameProjectAction({ projectId: id, name, description })
          : await renameEpisodeAction({ episodeId: id, title: name, description });
      if (!res.ok) throw new Error(res.error || "Could not rename.");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setName(currentName);
          setDescription(currentDescription);
          setOpen(true);
        }}
        data-testid={`rename-${kind}`}
        title={`Rename this ${kind}`}
        className="btn-ghost px-2 py-1 text-xs"
      >
        ✏️ Rename
      </button>
    );
  }

  return (
    <form onSubmit={save} className="card w-full max-w-md p-4">
      <label className="label" htmlFor={`rename-name-${id}`}>
        {kind === "project" ? "Project name" : "Episode title"}
      </label>
      <input
        id={`rename-name-${id}`}
        className="field"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        autoFocus
        data-testid="rename-input"
      />
      <label className="label mt-2" htmlFor={`rename-desc-${id}`}>
        Description (optional)
      </label>
      <textarea
        id={`rename-desc-${id}`}
        className="field"
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      {error ? (
        <p role="alert" className="mt-2 text-xs font-medium text-red-600">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          className="btn-primary px-3 py-1.5 text-xs"
          disabled={busy}
          data-testid="rename-save"
        >
          {busy ? "Saving…" : "Save"}
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
