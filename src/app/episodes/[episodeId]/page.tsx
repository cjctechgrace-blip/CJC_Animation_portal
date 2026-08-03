import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCloudStorage, publicUrl } from "@/lib/storage";
import {
  isBunnyStorage,
  isBunnyKey,
  bunnyVideoIdFromKey,
  getBunnyVideoState,
  type BunnyVideoState,
} from "@/lib/bunny";
import type { UploadMode } from "@/lib/uploadScenes";
import { Header } from "@/components/Header";
import { EpisodeView, type SceneData } from "./EpisodeView";
import { DeleteEpisodeButton } from "./DeleteEpisodeButton";
import type { DiscussionPost } from "./EpisodeDiscussion";
import { ActivityFeed, buildActivity } from "./ActivityFeed";
import { ApprovalBar } from "./ApprovalBar";

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
      approvals: {
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true } } },
      },
      _count: { select: { visits: true } },
      scenes: {
        orderBy: { order: "asc" },
        include: {
          createdBy: { select: { name: true } },
          edits: {
            select: {
              id: true,
              name: true,
              data: true,
              createdAt: true,
              createdBy: { select: { name: true } },
            },
            orderBy: { createdAt: "asc" },
          },
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

  // record that this user opened the episode (feeds the "N viewed" count)
  await db.episodeVisit.upsert({
    where: {
      episodeId_userId: { episodeId: episode.id, userId: user.id },
    },
    create: { episodeId: episode.id, userId: user.id },
    update: { lastAt: new Date() },
  });

  const cloud = isCloudStorage();
  const uploadMode: UploadMode = isBunnyStorage()
    ? "bunny"
    : cloud
    ? "supabase"
    : "local";

  // Bunny-hosted clips: resolve encoding state + best MP4 rendition up front.
  const bunnyStates = new Map<string, BunnyVideoState>();
  await Promise.all(
    episode.scenes
      .filter((s) => s.videoFile && isBunnyKey(s.videoFile))
      .map(async (s) => {
        bunnyStates.set(
          s.id,
          await getBunnyVideoState(bunnyVideoIdFromKey(s.videoFile as string))
        );
      })
  );

  const scenes: SceneData[] = episode.scenes.map((s) => {
    const comments = s.comments.map((c) => ({
      id: c.id,
      body: c.body,
      timecodeMs: c.timecodeMs,
      resolved: c.resolved,
      authorId: c.authorId,
      authorName: c.author.name,
      createdAt: c.createdAt.toISOString(),
      hasFrame: Boolean(c.frameImage),
      generatedPrompt: c.generatedPrompt,
      mark: parseMark(c.mark),
      replies: c.replies.map((r) => ({
        id: r.id,
        body: r.body,
        authorId: r.authorId,
        authorName: r.author.name,
        createdAt: r.createdAt.toISOString(),
      })),
    }));
    return {
      id: s.id,
      title: s.title,
      createdById: s.createdById,
      hasVideo: Boolean(s.videoFile),
      videoSrc: s.videoFile
        ? isBunnyKey(s.videoFile)
          ? bunnyStates.get(s.id)?.mp4Url ?? null // null while Bunny encodes
          : cloud
          ? publicUrl(s.videoFile)
          : `/api/video/${s.id}`
        : null,
      openCount: comments.filter((c) => !c.resolved).length,
      comments,
      edits: s.edits.map((e) => ({ id: e.id, name: e.name, data: e.data })),
    };
  });

  // Episode-level discussion posts (threaded, with votes + annotation refs).
  const refInclude = {
    include: {
      comment: {
        select: {
          id: true,
          timecodeMs: true,
          body: true,
          scene: { select: { id: true, order: true } },
        },
      },
    },
  };
  const base = {
    author: { select: { name: true } },
    votes: { select: { userId: true } },
    refs: refInclude,
  };
  const rawPosts = await db.post.findMany({
    where: { episodeId: params.episodeId, parentId: null },
    orderBy: { createdAt: "asc" },
    include: {
      ...base,
      replies: {
        orderBy: { createdAt: "asc" },
        include: {
          ...base,
          replies: { orderBy: { createdAt: "asc" }, include: base },
        },
      },
    },
  });

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const serializePost = (p: any): DiscussionPost => ({
    id: p.id,
    body: p.body,
    authorName: p.author.name,
    createdAt: p.createdAt.toISOString(),
    score: p.votes.length,
    votedByMe: p.votes.some((v: any) => v.userId === user.id),
    refs: p.refs.map((r: any) => ({
      commentId: r.comment.id,
      sceneId: r.comment.scene.id,
      sceneNumber: r.comment.scene.order + 1,
      timecodeMs: r.comment.timecodeMs,
      snippet: (r.comment.body as string).slice(0, 60),
    })),
    replies: (p.replies ?? []).map(serializePost),
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const posts = rawPosts
    .map(serializePost)
    .sort((a, b) => b.score - a.score || (a.createdAt < b.createdAt ? 1 : -1));

  // flatten posts + replies for the activity feed
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const flatPosts: { id: string; createdAt: Date; author: { name: string } }[] = [];
  const walkPosts = (list: any[]) => {
    for (const p of list) {
      flatPosts.push({ id: p.id, createdAt: p.createdAt, author: p.author });
      if (p.replies?.length) walkPosts(p.replies);
    }
  };
  walkPosts(rawPosts);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const activity = buildActivity({ scenes: episode.scenes, posts: flatPosts });

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
            <h1 className="text-xl font-bold tracking-tight">
              {episode.title}
            </h1>
            {episode.description ? (
              <p className="text-sm text-ink-soft">{episode.description}</p>
            ) : null}
            <div className="mt-2">
              <ApprovalBar
                episodeId={episode.id}
                viewerApproved={episode.approvals.some((a) => a.user.id === user.id)}
                approverNames={episode.approvals.map((a) => a.user.name)}
                viewedCount={episode._count.visits}
                feedbackCount={episode.scenes.reduce(
                  (n, s) => n + s.comments.length,
                  0
                )}
                round={episode.reviewRound}
                canStartRound={user.role === "admin" || user.role === "editor"}
              />
            </div>
          </div>
          {user.role === "admin" ||
          user.role === "editor" ||
          episode.createdById === user.id ? (
            <DeleteEpisodeButton
              episodeId={episode.id}
              projectId={episode.project.id}
              title={episode.title}
            />
          ) : null}
        </div>
      </div>

      <ActivityFeed events={activity} />

      <EpisodeView
        episodeId={episode.id}
        uploadMode={uploadMode}
        scenes={scenes}
        posts={posts}
        viewer={{
          id: user.id,
          isAdmin: user.role === "admin",
          isEditor: user.role === "editor",
        }}
      />
    </div>
  );
}
