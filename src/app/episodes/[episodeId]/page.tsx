import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCloudStorage, publicUrl } from "@/lib/storage";
import { Header } from "@/components/Header";
import { EpisodeView, type SceneData } from "./EpisodeView";
import { DeleteEpisodeButton } from "./DeleteEpisodeButton";

export const dynamic = "force-dynamic";

function parseMark(raw: string | null) {
  if (!raw) return null;
  try {
    const m = JSON.parse(raw);
    if (m && typeof m.x === "number" && typeof m.y === "number") return m;
  } catch {
    // ignore malformed mark
  }
  return null;
}

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
      scenes: {
        orderBy: { order: "asc" },
        include: {
          comments: {
            where: { parentId: null },
            orderBy: [{ timecodeMs: "asc" }, { createdAt: "asc" }],
            include: {
              author: { select: { name: true } },
              replies: {
                orderBy: { createdAt: "asc" },
                include: { author: { select: { name: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!episode) notFound();

  const cloud = isCloudStorage();
  const scenes: SceneData[] = episode.scenes.map((s) => {
    const comments = s.comments.map((c) => ({
      id: c.id,
      body: c.body,
      timecodeMs: c.timecodeMs,
      resolved: c.resolved,
      authorName: c.author.name,
      createdAt: c.createdAt.toISOString(),
      hasFrame: Boolean(c.frameImage),
      generatedPrompt: c.generatedPrompt,
      mark: parseMark(c.mark),
      replies: c.replies.map((r) => ({
        id: r.id,
        body: r.body,
        authorName: r.author.name,
        createdAt: r.createdAt.toISOString(),
      })),
    }));
    return {
      id: s.id,
      title: s.title,
      hasVideo: Boolean(s.videoFile),
      videoSrc: s.videoFile
        ? cloud
          ? publicUrl(s.videoFile)
          : `/api/video/${s.id}`
        : null,
      openCount: comments.filter((c) => !c.resolved).length,
      comments,
    };
  });

  return (
    <div className="flex min-h-screen flex-col">
      <Header user={user} />
      <div className="border-b border-line bg-panel">
        <div className="mx-auto flex max-w-6xl items-start justify-between gap-4 px-6 py-3">
          <div>
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
          <DeleteEpisodeButton
            episodeId={episode.id}
            projectId={episode.project.id}
            title={episode.title}
          />
        </div>
      </div>

      <EpisodeView episodeId={episode.id} cloud={cloud} scenes={scenes} />
    </div>
  );
}
