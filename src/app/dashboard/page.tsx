import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Header } from "@/components/Header";
import { formatWhen } from "@/lib/format";
import { NewProjectForm } from "./NewProjectForm";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();

  const projects = await db.project.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { name: true } },
      _count: { select: { episodes: true } },
    },
  });

  return (
    <div className="min-h-screen">
      <Header user={user} />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
            <p className="mt-0.5 text-sm text-ink-soft">
              Pick a project to review its episodes and leave feedback.
            </p>
          </div>
          <NewProjectForm />
        </div>

        {projects.length === 0 ? (
          <div className="card grid place-items-center px-6 py-16 text-center">
            <p className="text-ink-soft">
              No projects yet. Create your first one to get started.
            </p>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.id}`}
                  className="card block h-full p-5 transition-all hover:-translate-y-0.5 hover:border-reel/40 hover:shadow-md"
                  data-testid="project-card"
                >
                  <h3 className="text-base font-bold tracking-tight">{p.name}</h3>
                  {p.description ? (
                    <p className="mt-1 line-clamp-2 text-sm text-ink-soft">
                      {p.description}
                    </p>
                  ) : null}
                  <div className="mt-4 flex items-center justify-between text-xs text-ink-faint">
                    <span>
                      {p._count.episodes}{" "}
                      {p._count.episodes === 1 ? "episode" : "episodes"}
                    </span>
                    <span>{formatWhen(p.createdAt)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
