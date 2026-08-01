import Link from "next/link";
import { requireEditor } from "@/lib/auth";
import { db } from "@/lib/db";
import { sweepPublishedEpisodes } from "@/lib/actions";
import { Header } from "@/components/Header";
import { isYouTubeConfigured } from "@/lib/youtube";
import { BoardCard, type BoardEpisode } from "./BoardCard";

export const dynamic = "force-dynamic";

const COLUMNS: { key: string; title: string; hint: string }[] = [
  { key: "review", title: "In review", hint: "Being watched & annotated" },
  { key: "approved", title: "Approved", hint: "Ready — pick a publish date" },
  { key: "scheduled", title: "Scheduled", hint: "Queued for release" },
  { key: "published", title: "Published", hint: "Live on the channel" },
];

export default async function BoardPage() {
  const user = await requireEditor();
  await sweepPublishedEpisodes();

  const episodes = await db.episode.findMany({
    orderBy: [{ publishAt: "asc" }, { createdAt: "desc" }],
    include: {
      project: { select: { name: true } },
      scenes: { select: { id: true, videoFile: true } },
      _count: { select: { posts: true } },
    },
  });

  const cards: BoardEpisode[] = episodes.map((e) => ({
    id: e.id,
    title: e.title,
    project: e.project.name,
    status: e.status,
    publishAt: e.publishAt ? e.publishAt.toISOString() : null,
    youtubeVideoId: e.youtubeVideoId,
    sceneCount: e.scenes.length,
    clipCount: e.scenes.filter((s) => s.videoFile).length,
  }));

  const upcoming = cards
    .filter((c) => c.status === "scheduled" && c.publishAt)
    .sort((a, b) => (a.publishAt as string).localeCompare(b.publishAt as string));

  const youtubeReady = isYouTubeConfigured();

  return (
    <div className="min-h-screen">
      <Header user={user} />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Publishing board</h1>
            <p className="mt-0.5 text-sm text-ink-soft">
              Approve episodes, give them a release date, and they go out on the
              YouTube channel automatically{youtubeReady ? "" : " (YouTube not connected yet — see SETUP-YOUTUBE.md)"}.
            </p>
          </div>
          {upcoming.length > 0 ? (
            <div className="card px-4 py-3" data-testid="upcoming-schedule">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                📅 Upcoming releases
              </p>
              <ul className="flex flex-col gap-0.5 text-xs text-ink-soft">
                {upcoming.slice(0, 4).map((c) => (
                  <li key={c.id} suppressHydrationWarning>
                    <span className="font-medium text-ink">{c.title}</span> —{" "}
                    {new Date(c.publishAt as string).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const items = cards.filter((c) => c.status === col.key);
            return (
              <section
                key={col.key}
                className="rounded-xl border border-line bg-panel/60 p-3"
                data-testid={`column-${col.key}`}
              >
                <div className="mb-3 flex items-baseline justify-between px-1">
                  <h2 className="text-sm font-bold tracking-tight">
                    {col.title}
                  </h2>
                  <span className="rounded-full bg-line px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
                    {items.length}
                  </span>
                </div>
                <p className="mb-3 px-1 text-[11px] text-ink-faint">{col.hint}</p>
                <ul className="flex flex-col gap-2">
                  {items.map((c) => (
                    <BoardCard key={c.id} episode={c} youtubeReady={youtubeReady} />
                  ))}
                  {items.length === 0 ? (
                    <li className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-ink-faint">
                      Nothing here yet
                    </li>
                  ) : null}
                </ul>
              </section>
            );
          })}
        </div>

        <p className="mt-6 text-xs text-ink-faint">
          Reviewers don&apos;t see this board — only admins and video editors.{" "}
          <Link href="/team" className="text-reel hover:underline">
            Manage roles →
          </Link>
        </p>
      </main>
    </div>
  );
}
