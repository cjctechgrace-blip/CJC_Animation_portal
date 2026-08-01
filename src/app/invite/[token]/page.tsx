import Link from "next/link";
import { db } from "@/lib/db";
import { AcceptInviteForm } from "./AcceptInviteForm";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: { token: string };
}) {
  const invite = await db.invite.findUnique({
    where: { token: params.token },
    select: {
      email: true,
      name: true,
      kind: true,
      usedAt: true,
      expiresAt: true,
      createdBy: { select: { name: true } },
    },
  });

  const valid = invite && !invite.usedAt && invite.expiresAt > new Date();

  return (
    <main className="grid min-h-screen place-items-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-reel text-lg font-bold text-white shadow-sm">
            ▶
          </span>
          <h1 className="text-2xl font-bold tracking-tight">
            CJC Animation Portal
          </h1>
        </div>

        {!valid ? (
          <div className="card p-6 text-center">
            <p className="font-medium">This link is invalid or has expired.</p>
            <p className="mt-1 text-sm text-ink-soft">
              Ask your admin to send you a fresh one.
            </p>
            <Link href="/login" className="btn-ghost mt-4 inline-block px-4 py-2 text-sm">
              Go to sign in
            </Link>
          </div>
        ) : (
          <AcceptInviteForm
            token={params.token}
            email={invite.email}
            defaultName={invite.name}
            kind={invite.kind}
            invitedBy={invite.createdBy.name}
          />
        )}
      </div>
    </main>
  );
}
