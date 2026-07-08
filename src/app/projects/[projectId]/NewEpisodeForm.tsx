"use client";

import { useState } from "react";

export function NewEpisodeForm({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
    <form
      action={`/api/projects/${projectId}/episodes`}
      method="post"
      encType="multipart/form-data"
      onSubmit={() => setSubmitting(true)}
      className="card w-full max-w-lg p-5"
    >
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
          className="field file:mr-3 file:rounded file:border-0 file:bg-reel-soft file:px-3 file:py-1 file:text-reel"
        />
        <p className="mt-1 text-xs text-ink-faint">
          MP4 or WebM works best. You can also add the episode now and upload
          later.
        </p>
      </div>
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Uploading…" : "Create episode"}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setOpen(false)}
          disabled={submitting}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
