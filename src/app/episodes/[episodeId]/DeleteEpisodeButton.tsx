"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteEpisodeAction } from "@/lib/actions";

export function DeleteEpisodeButton({
  episodeId,
  projectId,
  title,
}: {
  episodeId: string;
  projectId: string;
  title: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onDelete() {
    if (
      !window.confirm(
        `Delete the whole episode "${title}"? This permanently removes every scene, clip, and note in it, and frees the storage space.`
      )
    )
      return;
    start(async () => {
      const res = await deleteEpisodeAction({ episodeId });
      router.push(`/projects/${res.projectId ?? projectId}`);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={pending}
      data-testid="delete-episode"
      className="btn-ghost shrink-0 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
    >
      {pending ? "Deleting…" : "Delete episode"}
    </button>
  );
}
