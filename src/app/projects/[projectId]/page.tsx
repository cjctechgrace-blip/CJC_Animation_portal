import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Header } from "@/components/Header";
import { formatWhen } from "@/lib/format";
import { isCloudStorage } from "@/lib/storage";
import { NewEpisodeForm } from "./NewEpisodeForm";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: { projectId: string };
}) {
  const user = await requireUser();

  const project = await db.project.findUnique({
    where: { id: params.projectId },
    include: {
      episodes: {
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { comments: true } } },
      },
    },
  });

  if (!project) notFound();

  return (
    <div className="min-h-screen">
      <Header user={user} />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Link
          href="/dashboard"
          className="text-sm text-ink-faint hover:text-ink"
        >
          ← All projects
        </Link>

        <div className="mb-6 mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {project.name}
            </h1>
            {project.description ? (
              <p className="max-w-2xl text-sm text-ink-soft">
                {project.description}
              </p>
            ) : null}
          </div>
          <NewEpisodeForm projectId={project.id} cloud={isCloudStorage()} />
        </div>

        {project.episodes.length === 0 ? (
          <div className="card grid place-items-center px-6 py-16 text-center">
            <p className="text-ink-soft">
              No episodes yet. Add the first one to start collecting feedback.
            </p>
          </div>
        ) : (
          <ul className="grid gap-3">
            {project.episodes.map((ep) => (
              <li key={ep.id}>
                <Link
                  href={`/episodes/${ep.id}`}
                  className="card flex items-center justify-between gap-4 p-4 transition-shadow hover:shadow-md"
                  data-testid="episode-row"
                >
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className={`grid h-10 w-14 place-items-center rounded-md text-xs font-semibold ${
                        ep.videoFile
                          ? "bg-ink text-white"
                          : "border border-dashed border-line text-ink-faint"
                      }`}
                    >
                      {ep.videoFile ? "▶" : "no clip"}
                    </span>
                    <div>
                      <h3 className="font-medium">{ep.title}</h3>
                      <p className="text-xs text-ink-faint">
                        {ep._count.comments}{" "}
                        {ep._count.comments === 1 ? "note" : "notes"} ·{" "}
                        {formatWhen(ep.createdAt)}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm text-reel">Open →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
