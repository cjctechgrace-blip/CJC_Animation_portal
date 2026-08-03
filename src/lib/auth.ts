import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "./db";

const COOKIE = "cjc_session";
const SESSION_DAYS = 7;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

/**
 * Bootstrap admin from env: when ADMIN_EMAIL + ADMIN_PASSWORD are set and no
 * account with that email exists yet, create it as an active admin. Runs on
 * login attempts, so setting the two env vars is all it takes to get the first
 * admin — even in production. Existing accounts are never overwritten (change
 * a password with a reset link from /team, not by editing env).
 */
async function ensureBootstrapAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 8) return;

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return;

  await db.user.create({
    data: {
      email,
      name: email.split("@")[0],
      role: "admin",
      active: true,
      passwordHash: await bcrypt.hash(password, 10),
    },
  });
}

/**
 * Verify email + password. Returns the user, "inactive" for a correct password
 * on an account awaiting clearance (or deactivated), or null.
 */
export async function verifyCredentials(
  email: string,
  password: string
): Promise<SessionUser | "inactive" | null> {
  await ensureBootstrapAdmin();
  const normalized = email.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email: normalized } });
  if (!user) return null;

  let ok = await bcrypt.compare(password, user.passwordHash);

  // Self-heal for the env-bootstrapped admin: ADMIN_PASSWORD in env re-syncs a
  // drifted hash — but ONLY for an account that is still an active admin.
  // Deactivation and demotion on /team always win; the heal can never
  // reactivate or re-promote an account.
  if (
    !ok &&
    user.active &&
    user.role === "admin" &&
    normalized === process.env.ADMIN_EMAIL?.trim().toLowerCase() &&
    password === process.env.ADMIN_PASSWORD &&
    password.length >= 8
  ) {
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(password, 10) },
    });
    ok = true;
  }

  if (!ok) return null;
  if (!user.active) return "inactive";
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export async function createSession(userId: string): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const session = await db.session.create({ data: { userId, expiresAt } });
  cookies().set(COOKIE, session.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function destroySession(): Promise<void> {
  const token = cookies().get(COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { id: token } });
  }
  cookies().delete(COOKIE);
}

/** Read the current user from the session cookie, or null if not signed in. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { id: token },
    include: { user: true },
  });
  if (!session) return null;

  if (session.expiresAt < new Date()) {
    await db.session.deleteMany({ where: { id: token } });
    return null;
  }

  const u = session.user;
  if (!u.active) {
    // deactivated mid-session: kill the session immediately
    await db.session.deleteMany({ where: { id: token } });
    return null;
  }
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}

/** Server-side guard for protected pages. Redirects to /login when signed out. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Guard for admin-only pages/actions. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}

/**
 * Roles: "admin" (manages team) > "editor" (sees the publishing board,
 * schedules releases) > "reviewer" (reviews and comments only). Legacy
 * "member" rows are treated as reviewers.
 */
export function isEditorRole(role: string): boolean {
  return role === "admin" || role === "editor";
}

/** Guard for pages/actions reserved for admins + video editors. */
export async function requireEditor(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isEditorRole(user.role)) redirect("/dashboard");
  return user;
}
