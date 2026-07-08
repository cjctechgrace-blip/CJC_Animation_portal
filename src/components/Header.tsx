import Link from "next/link";
import { logoutAction } from "@/lib/actions";
import type { SessionUser } from "@/lib/auth";
import { initialsOf } from "@/lib/format";

export function Header({ user }: { user: SessionUser }) {
  return (
    <header className="border-b border-line bg-panel">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-8 w-8 place-items-center rounded-lg bg-reel text-sm font-bold text-white"
          >
            ▶
          </span>
          <span className="font-semibold tracking-tight">
            CJC Animation Portal
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span
              className="grid h-7 w-7 place-items-center rounded-full bg-reel-soft text-xs font-bold text-reel"
              title={user.email}
            >
              {initialsOf(user.name)}
            </span>
            <span className="hidden text-ink-soft sm:inline">{user.name}</span>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="btn-ghost px-3 py-1.5 text-xs">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
