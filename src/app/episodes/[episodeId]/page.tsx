import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Header } from "@/components/Header";
import { EpisodeReview } from "./EpisodeReview";

export const dynamic = "force-dynamic";

export default async function EpisodePage({
  params,
}: {
  params: { episodeId: string };
}) {
  const user = await requireUser();

  const episode = await db.episode.findUnique({
    where: { id: params.episodeId },
    include: {
      project: { select: { id: true, name: true } },
      comments: {
        where: { parentId: null },
        orderBy: [{ timecodeMs: "asc" }, { createdAt: "asc" }],
        include: {
          author: { select: { id: true, name: true } },
          replies: {
            orderBy: { createdAt: "asc" },
            include: { author: { select: { id: true, name: true } } },
          },
        },
      },
    },
  });

  if (!episode) notFound();

  const comments = episode.comments.map((c) => ({
    id: c.id,
    body: c.body,
    timecodeMs: c.timecodeMs,
    resolved: c.resolved,
    authorName: c.author.name,
    createdAt: c.createdAt.toISOString(),
    hasFrame: Boolean(c.frameImage),
    generatedPrompt: c.generatedPrompt,
    replies: c.replies.map((r) => ({
      id: r.id,
      body: r.body,
      authorName: r.author.name,
      createdAt: r.createdAt.toISOString(),
    })),
  }));

  return (
    <div className="flex min-h-screen flex-col">
      <Header user={user} />
      <div className="border-b border-line bg-panel">
        <div className="mx-auto max-w-6xl px-6 py-3">
          <Link
            href={`/projects/${episode.project.id}`}
            className="text-sm text-ink-faint hover:text-ink"
          >
            ← {episode.project.name}
          </Link>
          <h1 className="text-lg font-semibold tracking-tight">
            {episode.title}
          </h1>
          {episode.description ? (
            <p className="text-sm text-ink-soft">{episode.description}</p>
          ) : null}
        </div>
      </div>

      <EpisodeReview
        episodeId={episode.id}
        hasVideo={Boolean(episode.videoFile)}
        videoSrc={episode.videoFile ? `/api/video/${episode.id}` : null}
        initialComments={comments}
      />
    </div>
  );
}
