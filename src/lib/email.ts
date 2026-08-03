import "server-only";
import { db } from "./db";

// Team email notifications via Resend (https://resend.com — free tier is
// plenty). No-ops silently until RESEND_API_KEY is set, so the app works
// without it. EMAIL_FROM must be a verified sender/domain in Resend.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || "CJC Portal <onboarding@resend.dev>";
const APP_URL = (process.env.APP_URL || "https://cjc-animation-portal.vercel.app").replace(/\/$/, "");

export function isEmailConfigured(): boolean {
  return Boolean(RESEND_API_KEY);
}

export function appLink(path: string): string {
  return `${APP_URL}${path}`;
}

/** Send one email (best effort — never throws, never blocks the caller's flow). */
export async function sendEmail(input: {
  to: string[];
  subject: string;
  html: string;
}): Promise<void> {
  if (!isEmailConfigured() || input.to.length === 0) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(5000),
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: input.to,
        subject: input.subject,
        html: input.html,
      }),
    });
  } catch {
    // email must never break the action that triggered it
  }
}

/**
 * Email a set of active team members (by role), excluding the person who
 * triggered the event.
 */
export async function notifyTeam(input: {
  roles: string[] | "all";
  excludeUserId?: string;
  subject: string;
  html: string;
}): Promise<void> {
  if (!isEmailConfigured()) return;
  const users = await db.user.findMany({
    where: {
      active: true,
      ...(input.roles === "all" ? {} : { role: { in: input.roles } }),
      ...(input.excludeUserId ? { NOT: { id: input.excludeUserId } } : {}),
    },
    select: { email: true },
  });
  await sendEmail({
    to: users.map((u) => u.email),
    subject: input.subject,
    html: input.html,
  });
}
