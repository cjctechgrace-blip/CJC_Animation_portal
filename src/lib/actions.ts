"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "./db";
import { saveDataUrlPng } from "./storage";
import { generateHiggsfieldPrompt } from "./prompt";
import {
  createSession,
  destroySession,
  getCurrentUser,
  requireUser,
  verifyCredentials,
} from "./auth";

/* ----------------------------- auth ----------------------------- */

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const user = await verifyCredentials(email, password);
  if (!user) {
    return { error: "That email and password don't match. Try again." };
  }

  await createSession(user.id);
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

/* --------------------------- projects --------------------------- */

const projectSchema = z.object({
  name: z.string().trim().min(1, "Give the project a name.").max(120),
  description: z.string().trim().max(500).optional().default(""),
});

export async function createProjectAction(
  _prev: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const user = await requireUser();
  const parsed = projectSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const project = await db.project.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      createdById: user.id,
    },
  });

  revalidatePath("/dashboard");
  redirect(`/projects/${project.id}`);
}

/* --------------------------- comments --------------------------- */

export async function addCommentAction(input: {
  episodeId: string;
  body: string;
  timecodeMs: number;
  frameDataUrl?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const body = input.body.trim();
  if (!body) return { ok: false, error: "Write something first." };

  const episode = await db.episode.findUnique({
    where: { id: input.episodeId },
    select: { id: true },
  });
  if (!episode) return { ok: false, error: "Episode not found." };

  const created = await db.comment.create({
    data: {
      episodeId: input.episodeId,
      authorId: user.id,
      body,
      timecodeMs: Math.max(0, Math.round(input.timecodeMs)),
    },
  });

  // Persist the annotated frame (if the reviewer drew one) as this note's start-frame.
  if (input.frameDataUrl) {
    const frameImage = await saveDataUrlPng(input.frameDataUrl, `frame-${created.id}`);
    if (frameImage) {
      await db.comment.update({
        where: { id: created.id },
        data: { frameImage },
      });
    }
  }

  revalidatePath(`/episodes/${input.episodeId}`);
  return { ok: true };
}

export async function addReplyAction(input: {
  parentId: string;
  body: string;
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const body = input.body.trim();
  if (!body) return { ok: false, error: "Write a reply first." };

  const parent = await db.comment.findUnique({
    where: { id: input.parentId },
    select: { id: true, episodeId: true },
  });
  if (!parent) return { ok: false, error: "Comment not found." };

  await db.comment.create({
    data: {
      episodeId: parent.episodeId,
      authorId: user.id,
      body,
      parentId: parent.id,
      timecodeMs: null,
    },
  });

  revalidatePath(`/episodes/${parent.episodeId}`);
  return { ok: true };
}

export async function toggleResolvedAction(input: {
  commentId: string;
}): Promise<{ ok: boolean; resolved?: boolean; error?: string }> {
  await requireUser();
  const comment = await db.comment.findUnique({
    where: { id: input.commentId },
    select: { id: true, resolved: true, episodeId: true },
  });
  if (!comment) return { ok: false, error: "Comment not found." };

  const updated = await db.comment.update({
    where: { id: comment.id },
    data: { resolved: !comment.resolved },
  });

  revalidatePath(`/episodes/${comment.episodeId}`);
  return { ok: true, resolved: updated.resolved };
}

/* ------------------------ AI prompt (Higgsfield) ------------------------ */

export async function generatePromptAction(input: {
  commentId: string;
}): Promise<{ ok: boolean; prompt?: string; usedAI?: boolean; error?: string }> {
  await requireUser();

  const comment = await db.comment.findUnique({
    where: { id: input.commentId },
    include: {
      episode: { select: { title: true, description: true } },
    },
  });
  if (!comment) return { ok: false, error: "Note not found." };

  try {
    const { prompt, usedAI } = await generateHiggsfieldPrompt({
      note: comment.body,
      episodeTitle: comment.episode.title,
      episodeDescription: comment.episode.description,
      timecodeMs: comment.timecodeMs,
      frameImage: comment.frameImage,
    });

    await db.comment.update({
      where: { id: comment.id },
      data: { generatedPrompt: prompt },
    });

    revalidatePath(`/episodes/${comment.episodeId}`);
    return { ok: true, prompt, usedAI };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not generate a prompt.",
    };
  }
}

/* Ensure a caller is authenticated (used by route handlers indirectly). */
export async function currentUserOrNull() {
  return getCurrentUser();
}
