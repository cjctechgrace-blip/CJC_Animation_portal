import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Header } from "@/components/Header";
import { formatWhen } from "@/lib/format";
import { InviteForm } from "./InviteForm";
import { MemberRow } from "./MemberRow";
import { PendingInviteRow } from "./PendingInviteRow";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const admin = await requireAdmin();

  const [members, pendingInvites] = await Promise.all([
    db.user.findMany({
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        createdAt: true,
        _count: { select: { comments: true, scenes: true, posts: true } },
      },
    }),
    db.invite.findMany({
      where: { usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        kind: true,
        token: true,
        expiresAt: true,
      },
    }),
  ]);

  return (
    <div className="min-h-screen">
      <Header user={admin} />
      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Team</h1>
          <p className="mt-0.5 text-sm text-ink-soft">
            Invite teammates, manage roles, and deactivate accounts. Everyone
            signs in with their own credentials, so every note and upload shows
            who did it.
          </p>
        </div>

        <InviteForm />

        {pendingInvites.length > 0 ? (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold text-ink-soft">
              Pending invites
            </h2>
            <ul className="flex flex-col gap-2" data-testid="pending-invites">
              {pendingInvites.map((inv) => (
                <PendingInviteRow
                  key={inv.id}
                  invite={{
                    ...inv,
                    expiresAt: inv.expiresAt.toISOString(),
                  }}
                />
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-ink-soft">
            Members ({members.length})
          </h2>
          <ul className="flex flex-col gap-2" data-testid="member-list">
            {members.map((m) => (
              <MemberRow
                key={m.id}
                member={{
                  id: m.id,
                  email: m.email,
                  name: m.name,
                  role: m.role,
                  active: m.active,
                  joined: formatWhen(m.createdAt),
                  contributions:
                    m._count.comments + m._count.scenes + m._count.posts,
                }}
                isSelf={m.id === admin.id}
              />
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
