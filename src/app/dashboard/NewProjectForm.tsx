"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createProjectAction } from "@/lib/actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Creating…" : "Create project"}
    </button>
  );
}

export function NewProjectForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState(createProjectAction, {});

  if (!open) {
    return (
      <button
        type="button"
        className="btn-primary"
        onClick={() => setOpen(true)}
        data-testid="new-project-toggle"
      >
        + New project
      </button>
    );
  }

  return (
    <form action={formAction} className="card w-full max-w-lg p-5">
      <h2 className="mb-3 font-semibold">New project</h2>
      <div className="mb-3">
        <label className="label" htmlFor="name">
          Project name
        </label>
        <input
          id="name"
          name="name"
          className="field"
          placeholder="e.g. Genesis — Season 1"
          required
          autoFocus
        />
      </div>
      <div className="mb-4">
        <label className="label" htmlFor="description">
          Description (optional)
        </label>
        <textarea
          id="description"
          name="description"
          className="field"
          rows={2}
          placeholder="What is this project?"
        />
      </div>
      {state?.error ? (
        <p role="alert" className="mb-3 text-sm font-medium text-red-600">
          {state.error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Submit />
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
