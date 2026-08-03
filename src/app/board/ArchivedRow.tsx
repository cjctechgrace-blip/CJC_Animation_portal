"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setEpisodeArchivedAction } from "@/lib/actions";

export function ArchivedRow({
  episode,
}: {
  episode: {
    id: string;
    title: string;
    project: string;
    archivedAt: string;
    purgeAt: string;
  };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(episode.purgeAt).getTime() - Date.now()) / 86_400_000)
  );

  async function restore() {
    setBusy(true);
    await setEpisodeArchivedAction({ episodeId: episode.id, archived: false });
    router.refresh();
    setBusy(false);
  }

  return (
    <li
      className="card flex flex-wrap items-center gap-3 p-3 opacity-80"
      data-testid="archived-row"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{episode.title}</p>
        <p className="text-xs text-ink-faint">{episode.project}</p>
      </div>
      <span
        className={`rounded-full px-2 py-1 text-[11px] font-medium ${
          daysLeft <= 3 ? "bg-red-100 text-red-700" : "bg-line text-ink-soft"
        }`}
        suppressHydrationWarning
      >
        deletes in {daysLeft} day{daysLeft === 1 ? "" : "s"}
      </span>
      <button
        type="button"
        onClick={restore}
        disabled={busy}
        data-testid="restore-episode"
        className="btn-ghost px-2 py-1 text-xs"
      >
        Restore
      </button>
    </li>
  );
}
