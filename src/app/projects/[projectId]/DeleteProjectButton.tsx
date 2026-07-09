"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteProjectAction } from "@/lib/actions";

export function DeleteProjectButton({
  projectId,
  name,
}: {
  projectId: string;
  name: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onDelete() {
    if (
      !window.confirm(
        `Delete the project "${name}" and everything in it — all episodes, scenes, notes, and clips? This can't be undone.`
      )
    )
      return;
    start(async () => {
      await deleteProjectAction({ projectId });
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={pending}
      data-testid="delete-project"
      className="btn-ghost shrink-0 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
    >
      {pending ? "Deleting…" : "Delete project"}
    </button>
  );
}
