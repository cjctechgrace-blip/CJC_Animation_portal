"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import {
  saveDataUrlPng,
  createSignedUpload,
  extensionFor,
  isCloudStorage,
  deleteObjects,
} from "./storage";
import { generateHiggsfieldPrompt } from "./prompt";
import { isThrottled, recordFailure, clearFailures } from "./rateLimit";
import {
  createSession,
  destroySession,
  getCurrentUser,
  requireAdmin,
  requireEditor,
  requireUser,
  verifyCredentials,
  type SessionUser,
} from "./auth";
import bcrypt from "bcryptjs";

/** Notes/replies: admins can manage anything; others only what they authored. */
function canManage(user: SessionUser, ownerId: string): boolean {
  return user.role === "admin" || user.id === ownerId;
}

/** Content (projects/episodes/scenes/edits): admins AND video editors can
 * manage anything; reviewers only what they created themselves. */
function canManageContent(user: SessionUser, ownerId: string): boolean {
  return user.role === "admin" || user.role === "editor" || user.id === ownerId;
}

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

  const throttleKey = email.trim().toLowerCase();
  if (isThrottled(throttleKey)) {
    return {
      error: "Too many failed attempts. Wait 15 minutes, then try again.",
    };
  }

  const user = await verifyCredentials(email, password);
  if (!user) {
    recordFailure(throttleKey);
    return { error: "That email and password don't match. Try again." };
  }
  if (user === "inactive") {
    return {
      error:
        "This account doesn't have clearance yet — an admin needs to activate it on the Team page.",
    };
  }

  clearFailures(throttleKey);
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

/** Delete a project and everything in it (episodes, scenes, notes, edits,
 * discussion), purging all its stored clips + frames. */
export async function deleteProjectAction(input: {
  projectId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const project = await db.project.findUnique({
    where: { id: input.projectId },
    select: {
      id: true,
      createdById: true,
      episodes: {
        select: {
          scenes: {
            select: {
              videoFile: true,
              comments: { select: { frameImage: true } },
              versions: { select: { videoFile: true } },
            },
          },
        },
      },
    },
  });
  if (!project) return { ok: false, error: "Project not found." };
  if (!canManageContent(user, project.createdById)) {
    return { ok: false, error: "Only an editor, an admin, or the project's creator can delete it." };
  }

  const keys: (string | null)[] = [];
  for (const ep of project.episodes) {
    for (const s of ep.scenes) {
      keys.push(s.videoFile);
      for (const c of s.comments) keys.push(c.frameImage);
      for (const v of s.versions) keys.push(v.videoFile);
    }
  }
  await deleteObjects(keys);
  await db.project.delete({ where: { id: project.id } });

  revalidatePath("/dashboard");
  return { ok: true };
}

/* --------------------------- episodes --------------------------- */

/** Hand the browser a one-time signed URL so it can upload the video directly
 * to Supabase Storage (bypasses Vercel's 4.5MB serverless body limit). */
export async function createSignedUploadAction(input: {
  filename: string;
  contentType: string;
}): Promise<{ ok: boolean; uploadUrl?: string; key?: string; error?: string }> {
  await requireUser();
  if (!isCloudStorage()) {
    return { ok: false, error: "Direct upload is only available in the hosted app." };
  }
  try {
    const ext = extensionFor(input.contentType || "video/mp4", input.filename);
    const { uploadUrl, key } = await createSignedUpload(
      "videos",
      `${randomUUID()}.${ext}`
    );
    return { ok: true, uploadUrl, key };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not start upload." };
  }
}

/** Create a Bunny Stream video + signed TUS ticket for a direct browser upload. */
export async function createBunnyUploadAction(input: {
  filename: string;
}): Promise<{
  ok: boolean;
  videoId?: string;
  libraryId?: string;
  signature?: string;
  expiration?: number;
  error?: string;
}> {
  await requireUser();
  const { isBunnyStorage, createBunnyUpload } = await import("./bunny");
  if (!isBunnyStorage()) {
    return { ok: false, error: "Bunny Stream is not configured." };
  }
  try {
    const ticket = await createBunnyUpload(input.filename);
    return { ok: true, ...ticket };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not start upload." };
  }
}

type SceneInput = { title: string; videoKey?: string | null; mimeType?: string | null };

/** Create an episode plus its ordered scene clips (uploaded by the browser). */
export async function createEpisodeWithScenesAction(input: {
  projectId: string;
  title: string;
  description?: string;
  scenes: SceneInput[];
  notifyTeam?: boolean;
}): Promise<{ ok: boolean; episodeId?: string; error?: string }> {
  const user = await requireUser();
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Give the episode a title." };

  const project = await db.project.findUnique({
    where: { id: input.projectId },
    select: { id: true },
  });
  if (!project) return { ok: false, error: "Project not found." };

  const episode = await db.episode.create({
    data: {
      projectId: input.projectId,
      title,
      description: (input.description ?? "").trim(),
      createdById: user.id,
    },
  });

  if (input.scenes?.length) {
    await db.scene.createMany({
      data: input.scenes.map((s, i) => ({
        episodeId: episode.id,
        title: s.title?.trim() || `Scene ${i + 1}`,
        order: i,
        videoFile: s.videoKey ?? null,
        mimeType: s.mimeType ?? null,
        createdById: user.id,
      })),
    });
  }

  // email the team only when the uploader asked for it (checkbox on the form)
  if (input.notifyTeam) {
    const { notifyTeam, appLink } = await import("./email");
    await notifyTeam({
      roles: "all",
      excludeUserId: user.id,
      subject: `New episode to review: ${title}`,
      html: `<p><strong>${user.name}</strong> uploaded <strong>${title}</strong> — it's ready for review (round 1).</p><p><a href="${appLink(`/episodes/${episode.id}`)}">Start reviewing →</a></p>`,
    });
  }

  revalidatePath(`/projects/${input.projectId}`);
  return { ok: true, episodeId: episode.id };
}

/** Append more scene clips to an existing episode. */
export async function addScenesAction(input: {
  episodeId: string;
  scenes: SceneInput[];
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const episode = await db.episode.findUnique({
    where: { id: input.episodeId },
    select: { id: true, _count: { select: { scenes: true } } },
  });
  if (!episode) return { ok: false, error: "Episode not found." };
  const base = episode._count.scenes;

  if (input.scenes?.length) {
    await db.scene.createMany({
      data: input.scenes.map((s, i) => ({
        episodeId: input.episodeId,
        title: s.title?.trim() || `Scene ${base + i + 1}`,
        order: base + i,
        videoFile: s.videoKey ?? null,
        mimeType: s.mimeType ?? null,
        createdById: user.id,
      })),
    });
  }

  revalidatePath(`/episodes/${input.episodeId}`);
  return { ok: true };
}

/** Delete a scene: its clip + frames from storage, then the row (comments cascade). */
export async function deleteSceneAction(input: {
  sceneId: string;
}): Promise<{ ok: boolean; episodeId?: string; error?: string }> {
  const user = await requireUser();
  const scene = await db.scene.findUnique({
    where: { id: input.sceneId },
    select: {
      id: true,
      episodeId: true,
      videoFile: true,
      createdById: true,
      comments: { select: { frameImage: true } },
      versions: { select: { videoFile: true } },
    },
  });
  if (!scene) return { ok: false, error: "Scene not found." };
  if (!canManageContent(user, scene.createdById)) {
    return { ok: false, error: "Only an editor, an admin, or the scene's uploader can delete it." };
  }

  await deleteObjects([
    scene.videoFile,
    ...scene.comments.map((c) => c.frameImage),
    ...scene.versions.map((v) => v.videoFile),
  ]);
  await db.scene.delete({ where: { id: scene.id } });

  revalidatePath(`/episodes/${scene.episodeId}`);
  return { ok: true, episodeId: scene.episodeId };
}

/** Delete an episode: every scene's clip + frames from storage, then the row (cascades). */
export async function deleteEpisodeAction(input: {
  episodeId: string;
}): Promise<{ ok: boolean; projectId?: string; error?: string }> {
  const user = await requireUser();
  const episode = await db.episode.findUnique({
    where: { id: input.episodeId },
    select: {
      id: true,
      projectId: true,
      createdById: true,
      scenes: {
        select: {
          videoFile: true,
          comments: { select: { frameImage: true } },
          versions: { select: { videoFile: true } },
        },
      },
    },
  });
  if (!episode) return { ok: false, error: "Episode not found." };
  if (!canManageContent(user, episode.createdById)) {
    return { ok: false, error: "Only an editor, an admin, or the episode's creator can delete it." };
  }

  const keys: (string | null)[] = [];
  for (const s of episode.scenes) {
    keys.push(s.videoFile);
    for (const c of s.comments) keys.push(c.frameImage);
    for (const v of s.versions) keys.push(v.videoFile);
  }
  await deleteObjects(keys);
  await db.episode.delete({ where: { id: episode.id } });

  revalidatePath(`/projects/${episode.projectId}`);
  return { ok: true, projectId: episode.projectId };
}

/** Persist a new scene order for an episode. */
export async function reorderScenesAction(input: {
  episodeId: string;
  orderedIds: string[];
}): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  const episode = await db.episode.findUnique({
    where: { id: input.episodeId },
    select: { id: true, scenes: { select: { id: true } } },
  });
  if (!episode) return { ok: false, error: "Episode not found." };

  const valid = new Set(episode.scenes.map((s) => s.id));
  const ordered = input.orderedIds.filter((id) => valid.has(id));

  await db.$transaction(
    ordered.map((id, i) =>
      db.scene.update({ where: { id }, data: { order: i } })
    )
  );

  revalidatePath(`/episodes/${input.episodeId}`);
  return { ok: true };
}

/* --------------------------- comments --------------------------- */

/** Clamp a note priority to the agreed 1–5 scale (null = not rated). */
function cleanPriority(p: number | null | undefined): number | null {
  if (p == null || !Number.isFinite(p)) return null;
  return Math.min(5, Math.max(1, Math.round(p)));
}

export async function addCommentAction(input: {
  sceneId: string;
  body: string;
  timecodeMs: number;
  frameDataUrl?: string | null;
  mark?: string | null;
  priority?: number | null;
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const body = input.body.trim();
  if (!body) return { ok: false, error: "Write something first." };

  const scene = await db.scene.findUnique({
    where: { id: input.sceneId },
    select: {
      id: true,
      episodeId: true,
      title: true,
      episode: { select: { title: true, reviewRound: true } },
    },
  });
  if (!scene) return { ok: false, error: "Scene not found." };

  const created = await db.comment.create({
    data: {
      sceneId: input.sceneId,
      authorId: user.id,
      body,
      timecodeMs: Math.max(0, Math.round(input.timecodeMs)),
      mark: input.mark ?? null,
      priority: cleanPriority(input.priority),
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

  revalidatePath(`/episodes/${scene.episodeId}`);
  return { ok: true };
}

/** Change a note's 1–5 priority. Author, editor, or admin only. */
export async function setCommentPriorityAction(input: {
  commentId: string;
  priority: number | null;
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const comment = await db.comment.findUnique({
    where: { id: input.commentId },
    select: {
      id: true,
      authorId: true,
      parentId: true,
      scene: { select: { episodeId: true } },
    },
  });
  if (!comment || comment.parentId) return { ok: false, error: "Note not found." };
  const allowed =
    user.role === "admin" || user.role === "editor" || comment.authorId === user.id;
  if (!allowed) return { ok: false, error: "Only the note's author or an editor can change its priority." };

  await db.comment.update({
    where: { id: comment.id },
    data: { priority: cleanPriority(input.priority) },
  });
  revalidatePath(`/episodes/${comment.scene.episodeId}`);
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
    select: { id: true, sceneId: true, scene: { select: { episodeId: true } } },
  });
  if (!parent) return { ok: false, error: "Comment not found." };

  await db.comment.create({
    data: {
      sceneId: parent.sceneId,
      authorId: user.id,
      body,
      parentId: parent.id,
      timecodeMs: null,
    },
  });

  revalidatePath(`/episodes/${parent.scene.episodeId}`);
  return { ok: true };
}

export async function toggleResolvedAction(input: {
  commentId: string;
}): Promise<{ ok: boolean; resolved?: boolean; error?: string }> {
  await requireUser();
  const comment = await db.comment.findUnique({
    where: { id: input.commentId },
    select: {
      id: true,
      resolved: true,
      scene: { select: { episodeId: true } },
    },
  });
  if (!comment) return { ok: false, error: "Comment not found." };

  const updated = await db.comment.update({
    where: { id: comment.id },
    data: { resolved: !comment.resolved },
  });

  revalidatePath(`/episodes/${comment.scene.episodeId}`);
  return { ok: true, resolved: updated.resolved };
}

/** Delete a comment/annotation (or a reply). Cascades its replies + discussion
 * references, and purges its frame image from storage. */
export async function deleteCommentAction(input: {
  commentId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const comment = await db.comment.findUnique({
    where: { id: input.commentId },
    select: {
      id: true,
      frameImage: true,
      authorId: true,
      scene: { select: { episodeId: true } },
      replies: { select: { frameImage: true } },
    },
  });
  if (!comment) return { ok: false, error: "Note not found." };
  if (!canManage(user, comment.authorId)) {
    return { ok: false, error: "Only an admin or the note's author can delete it." };
  }

  await deleteObjects([
    comment.frameImage,
    ...comment.replies.map((r) => r.frameImage),
  ]);
  await db.comment.delete({ where: { id: comment.id } });

  revalidatePath(`/episodes/${comment.scene.episodeId}`);
  return { ok: true };
}

/* ------------------------ AI prompt (Higgsfield) ------------------------ */

export async function generatePromptAction(input: {
  commentId: string;
}): Promise<{ ok: boolean; prompt?: string; usedAI?: boolean; error?: string }> {
  await requireUser();

  const comment = await db.comment.findUnique({
    where: { id: input.commentId },
    include: {
      scene: {
        select: {
          episodeId: true,
          title: true,
          episode: { select: { title: true, description: true } },
        },
      },
    },
  });
  if (!comment) return { ok: false, error: "Note not found." };

  try {
    const { prompt, usedAI } = await generateHiggsfieldPrompt({
      note: comment.body,
      episodeTitle: `${comment.scene.episode.title} — ${comment.scene.title}`,
      episodeDescription: comment.scene.episode.description,
      timecodeMs: comment.timecodeMs,
      frameImage: comment.frameImage,
    });

    await db.comment.update({
      where: { id: comment.id },
      data: { generatedPrompt: prompt },
    });

    revalidatePath(`/episodes/${comment.scene.episodeId}`);
    return { ok: true, prompt, usedAI };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not generate a prompt.",
    };
  }
}

/* --------------------------- edits (video editor) --------------------------- */

type EditSegment = {
  sourceSceneId: string;
  inMs: number;
  outMs: number;
  muted: boolean;
};

export async function createEditAction(input: {
  sceneId: string;
  name: string;
}): Promise<{
  ok: boolean;
  edit?: { id: string; name: string; data: string };
  error?: string;
}> {
  const user = await requireUser();
  const scene = await db.scene.findUnique({
    where: { id: input.sceneId },
    select: { id: true, episodeId: true },
  });
  if (!scene) return { ok: false, error: "Scene not found." };

  const name = input.name.trim() || "Edit";
  const data = JSON.stringify({
    segments: [{ sourceSceneId: scene.id, inMs: 0, outMs: 0, muted: false }],
  });
  const edit = await db.edit.create({
    data: { sceneId: scene.id, name, data, createdById: user.id },
  });

  revalidatePath(`/episodes/${scene.episodeId}`);
  return { ok: true, edit: { id: edit.id, name: edit.name, data: edit.data } };
}

export async function updateEditAction(input: {
  editId: string;
  name?: string;
  segments: EditSegment[];
}): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  const edit = await db.edit.findUnique({
    where: { id: input.editId },
    select: { id: true, scene: { select: { episodeId: true } } },
  });
  if (!edit) return { ok: false, error: "Edit not found." };

  const segments = (input.segments ?? []).map((s) => ({
    sourceSceneId: String(s.sourceSceneId),
    inMs: Math.max(0, Math.round(s.inMs || 0)),
    outMs: Math.max(0, Math.round(s.outMs || 0)),
    muted: Boolean(s.muted),
  }));
  await db.edit.update({
    where: { id: input.editId },
    data: {
      ...(input.name != null ? { name: input.name.trim() || "Edit" } : {}),
      data: JSON.stringify({ segments }),
    },
  });

  revalidatePath(`/episodes/${edit.scene.episodeId}`);
  return { ok: true };
}

export async function deleteEditAction(input: {
  editId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const edit = await db.edit.findUnique({
    where: { id: input.editId },
    select: { id: true, createdById: true, scene: { select: { episodeId: true } } },
  });
  if (!edit) return { ok: false, error: "Edit not found." };
  if (!canManageContent(user, edit.createdById)) {
    return { ok: false, error: "Only an editor, an admin, or the edit's creator can delete it." };
  }
  await db.edit.delete({ where: { id: input.editId } });
  revalidatePath(`/episodes/${edit.scene.episodeId}`);
  return { ok: true };
}

/* ------------------------ episode discussion ------------------------ */

export async function createPostAction(input: {
  episodeId: string;
  body: string;
  parentId?: string | null;
  refCommentIds?: string[];
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const body = input.body.trim();
  if (!body) return { ok: false, error: "Write something first." };

  const episode = await db.episode.findUnique({
    where: { id: input.episodeId },
    select: { id: true },
  });
  if (!episode) return { ok: false, error: "Episode not found." };

  let parentId: string | null = null;
  if (input.parentId) {
    const parent = await db.post.findUnique({
      where: { id: input.parentId },
      select: { id: true, episodeId: true },
    });
    if (parent && parent.episodeId === input.episodeId) parentId = parent.id;
  }

  const post = await db.post.create({
    data: { episodeId: input.episodeId, authorId: user.id, body, parentId },
  });

  const refIds = Array.from(new Set(input.refCommentIds ?? [])).slice(0, 10);
  if (refIds.length) {
    const valid = await db.comment.findMany({
      where: { id: { in: refIds }, scene: { episodeId: input.episodeId } },
      select: { id: true },
    });
    if (valid.length) {
      await db.postRef.createMany({
        data: valid.map((v) => ({ postId: post.id, commentId: v.id })),
      });
    }
  }

  revalidatePath(`/episodes/${input.episodeId}`);
  return { ok: true };
}

export async function togglePostVoteAction(input: {
  postId: string;
}): Promise<{ ok: boolean; score?: number; voted?: boolean; error?: string }> {
  const user = await requireUser();
  const post = await db.post.findUnique({
    where: { id: input.postId },
    select: { id: true, episodeId: true },
  });
  if (!post) return { ok: false, error: "Post not found." };

  const existing = await db.postVote.findUnique({
    where: { postId_userId: { postId: post.id, userId: user.id } },
  });
  let voted: boolean;
  if (existing) {
    await db.postVote.delete({ where: { id: existing.id } });
    voted = false;
  } else {
    await db.postVote.create({ data: { postId: post.id, userId: user.id } });
    voted = true;
  }
  const score = await db.postVote.count({ where: { postId: post.id } });

  revalidatePath(`/episodes/${post.episodeId}`);
  return { ok: true, score, voted };
}

/* Ensure a caller is authenticated (used by route handlers indirectly). */
export async function currentUserOrNull() {
  return getCurrentUser();
}

/* --------------------------- team management --------------------------- */

const INVITE_DAYS = 7;
const MIN_PASSWORD = 8;

/** Admin: create a one-time invite (new teammate) or password-reset link. */
export async function createInviteAction(input: {
  email: string;
  name?: string;
  role?: string;
  kind?: "invite" | "reset";
}): Promise<{ ok: boolean; token?: string; emailed?: boolean; error?: string }> {
  const admin = await requireAdmin();
  const email = input.email.trim().toLowerCase();
  const kind = input.kind === "reset" ? "reset" : "invite";
  const role = ["admin", "editor", "reviewer"].includes(input.role ?? "")
    ? (input.role as string)
    : "reviewer";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (kind === "invite" && existing) {
    return { ok: false, error: "That email already has an account. Use a password reset instead." };
  }
  if (kind === "reset" && !existing) {
    return { ok: false, error: "No account with that email. Send an invite instead." };
  }

  const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  await db.invite.create({
    data: {
      email,
      name: (input.name ?? "").trim(),
      role,
      kind,
      token,
      createdById: admin.id,
      expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  // email the person their link directly (the admin still gets a copyable
  // link as backup — and as the only path when email isn't configured)
  const { sendEmail, appLink } = await import("./email");
  const link = appLink(`/invite/${token}`);
  const emailed = await sendEmail({
    to: [email],
    subject:
      kind === "reset"
        ? "Reset your CJC Animation Portal password"
        : `${admin.name} invited you to the CJC Animation Portal`,
    html:
      kind === "reset"
        ? `<p>An admin created a password-reset link for your account:</p><p><a href="${link}">Set a new password →</a></p><p>The link works once and expires in ${INVITE_DAYS} days.</p>`
        : `<p><strong>${admin.name}</strong> invited you to join the CJC Animation Portal as a <strong>${role}</strong>.</p><p><a href="${link}">Create your account →</a></p><p>You'll pick your own password. The link works once and expires in ${INVITE_DAYS} days.</p>`,
  });

  revalidatePath("/team");
  return { ok: true, token, emailed };
}

/** Admin: revoke a pending invite/reset link. */
export async function revokeInviteAction(input: {
  inviteId: string;
}): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  await db.invite.deleteMany({ where: { id: input.inviteId } });
  revalidatePath("/team");
  return { ok: true };
}

/** Public: accept an invite / reset a password via its one-time token. */
export async function acceptInviteAction(input: {
  token: string;
  name: string;
  password: string;
}): Promise<{ ok: boolean; error?: string }> {
  const invite = await db.invite.findUnique({ where: { token: input.token } });
  if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
    return { ok: false, error: "This link is invalid or has expired. Ask your admin for a new one." };
  }

  const password = input.password;
  if (password.length < MIN_PASSWORD) {
    return { ok: false, error: `Choose a password of at least ${MIN_PASSWORD} characters.` };
  }
  const name = input.name.trim() || invite.name || invite.email.split("@")[0];
  const passwordHash = await bcrypt.hash(password, 10);

  let userId: string;
  if (invite.kind === "reset") {
    const user = await db.user.findUnique({ where: { email: invite.email } });
    if (!user) return { ok: false, error: "That account no longer exists." };
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash, active: true },
    });
    // a reset invalidates every existing session for the account
    await db.session.deleteMany({ where: { userId: user.id } });
    userId = user.id;
  } else {
    const existing = await db.user.findUnique({ where: { email: invite.email } });
    if (existing) return { ok: false, error: "This account was already created. Sign in instead." };
    const user = await db.user.create({
      data: {
        email: invite.email,
        name,
        role: invite.role,
        passwordHash,
      },
    });
    userId = user.id;
  }

  await db.invite.update({
    where: { id: invite.id },
    data: { usedAt: new Date() },
  });

  await createSession(userId);
  redirect("/dashboard");
}

/** Admin: deactivate (or re-activate) a member. Deactivation kills their sessions. */
export async function setUserActiveAction(input: {
  userId: string;
  active: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdmin();
  if (input.userId === admin.id) {
    return { ok: false, error: "You can't deactivate your own account." };
  }
  const user = await db.user.findUnique({ where: { id: input.userId } });
  if (!user) return { ok: false, error: "User not found." };

  await db.user.update({
    where: { id: user.id },
    data: { active: input.active },
  });
  if (!input.active) {
    await db.session.deleteMany({ where: { userId: user.id } });
  }
  revalidatePath("/team");
  return { ok: true };
}

/** Admin: change a member's role. The last active admin can't demote themself. */
export async function setUserRoleAction(input: {
  userId: string;
  role: string;
}): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdmin();
  const role = ["admin", "editor", "reviewer"].includes(input.role)
    ? input.role
    : "reviewer";

  if (input.userId === admin.id && role !== "admin") {
    const otherAdmins = await db.user.count({
      where: { role: "admin", active: true, NOT: { id: admin.id } },
    });
    if (otherAdmins === 0) {
      return { ok: false, error: "You're the only admin — promote someone else first." };
    }
  }

  await db.user.update({ where: { id: input.userId }, data: { role } });
  revalidatePath("/team");
  return { ok: true };
}

/* --------------------------- publishing board --------------------------- */
// Kanban pipeline: review → approved → scheduled → published.
// Board + these actions are for admins and video editors only — reviewers
// never see scheduling.

/** Editor/admin: approve an episode, or send it back to review. */
export async function setEpisodeStatusAction(input: {
  episodeId: string;
  status: "review" | "approved";
}): Promise<{ ok: boolean; error?: string }> {
  await requireEditor();
  const episode = await db.episode.findUnique({
    where: { id: input.episodeId },
    select: { id: true, status: true, youtubeVideoId: true },
  });
  if (!episode) return { ok: false, error: "Episode not found." };
  if (episode.status === "scheduled" && episode.youtubeVideoId) {
    return {
      ok: false,
      error:
        "This episode is already queued on YouTube — manage it in YouTube Studio first.",
    };
  }

  await db.episode.update({
    where: { id: episode.id },
    data: { status: input.status, publishAt: null },
  });
  revalidatePath("/board");
  return { ok: true };
}

/** Editor/admin: schedule an approved episode for publishing. If YouTube is
 * connected and the episode has exactly one clip, it uploads now (private,
 * made-for-kids) and YouTube flips it public at the scheduled time. */
export async function scheduleEpisodeAction(input: {
  episodeId: string;
  publishAtISO: string;
}): Promise<{ ok: boolean; youtube?: boolean; error?: string }> {
  await requireEditor();

  const publishAt = new Date(input.publishAtISO);
  if (Number.isNaN(publishAt.getTime())) {
    return { ok: false, error: "Pick a valid date and time." };
  }
  if (publishAt.getTime() < Date.now() + 5 * 60 * 1000) {
    return { ok: false, error: "Pick a time at least 5 minutes from now." };
  }

  const episode = await db.episode.findUnique({
    where: { id: input.episodeId },
    include: {
      project: { select: { name: true } },
      scenes: {
        where: { videoFile: { not: null } },
        orderBy: { order: "asc" },
        select: { id: true, videoFile: true },
      },
    },
  });
  if (!episode) return { ok: false, error: "Episode not found." };
  if (episode.status !== "approved" && episode.status !== "scheduled") {
    return { ok: false, error: "Approve the episode before scheduling it." };
  }

  // Try YouTube when it's configured, not already uploaded, and the episode is
  // a single finished clip (multi-scene episodes need a final cut first).
  let youtubeVideoId = episode.youtubeVideoId;
  let uploadedNow = false;
  if (!youtubeVideoId) {
    const { isYouTubeConfigured, scheduleYouTubeUpload } = await import("./youtube");
    if (isYouTubeConfigured() && episode.scenes.length === 1) {
      const key = episode.scenes[0].videoFile as string;
      let sourceUrl: string | null = null;
      if (key.startsWith("bunny:")) {
        const { getBunnyVideoState, bunnyVideoIdFromKey } = await import("./bunny");
        const state = await getBunnyVideoState(bunnyVideoIdFromKey(key));
        sourceUrl = state.mp4Url; // null while still encoding
      } else if (isCloudStorage()) {
        const { publicUrl } = await import("./storage");
        sourceUrl = publicUrl(key);
      }
      if (sourceUrl) {
        try {
          youtubeVideoId = await scheduleYouTubeUpload({
            title: episode.title,
            description: `${episode.project.name} — ${episode.description || episode.title}`,
            sourceUrl,
            publishAt,
          });
          uploadedNow = true;
        } catch (e) {
          return {
            ok: false,
            error: e instanceof Error ? e.message : "YouTube upload failed.",
          };
        }
      }
    }
  }

  await db.episode.update({
    where: { id: episode.id },
    data: { status: "scheduled", publishAt, youtubeVideoId },
  });
  revalidatePath("/board");
  return { ok: true, youtube: uploadedNow || Boolean(youtubeVideoId) };
}

/** Mark past-due scheduled episodes as published (called on board load). */
export async function sweepPublishedEpisodes(): Promise<void> {
  await db.episode.updateMany({
    where: { status: "scheduled", publishAt: { lte: new Date() } },
    data: { status: "published" },
  });
}

/* ------------------------- reviewer approvals ------------------------- */

/** Toggle the signed-in user's personal approval of an episode. */
export async function toggleEpisodeApprovalAction(input: {
  episodeId: string;
}): Promise<{ ok: boolean; approved?: boolean; error?: string }> {
  const user = await requireUser();
  const episode = await db.episode.findUnique({
    where: { id: input.episodeId },
    select: { id: true },
  });
  if (!episode) return { ok: false, error: "Episode not found." };

  let approved: boolean;
  try {
    const existing = await db.episodeApproval.findUnique({
      where: { episodeId_userId: { episodeId: episode.id, userId: user.id } },
    });
    if (existing) {
      await db.episodeApproval.delete({ where: { id: existing.id } });
      approved = false;
    } else {
      try {
        await db.episodeApproval.create({
          data: { episodeId: episode.id, userId: user.id },
        });
      } catch {
        // unique-index race (double-click / second tab): already approved
        revalidatePath(`/episodes/${episode.id}`);
        return { ok: true, approved: true };
      }
      approved = true;
    }
  } catch (e) {
    console.error("toggleEpisodeApprovalAction failed", e);
    return {
      ok: false,
      error:
        "Couldn't save your approval — the database may be missing the approvals update (run prisma/migration_approvals.sql). Tell an admin.",
    };
  }

  if (approved) {
    // Notify editors, but never let email trouble block the approval itself.
    try {
      const full = await db.episode.findUnique({
        where: { id: episode.id },
        select: {
          title: true,
          reviewRound: true,
          _count: { select: { approvals: true } },
        },
      });
      const { notifyTeam, appLink } = await import("./email");
      await notifyTeam({
        roles: ["admin", "editor"],
        excludeUserId: user.id,
        subject: `${user.name} approved ${full?.title ?? "an episode"}`,
        html: `<p><strong>${user.name}</strong> approved <strong>${full?.title}</strong> (round ${full?.reviewRound}) — ${full?._count.approvals} approval${full?._count.approvals === 1 ? "" : "s"} so far.</p><p><a href="${appLink(`/episodes/${episode.id}`)}">See the episode →</a></p>`,
      });
    } catch (e) {
      console.error("approval email failed (approval was saved)", e);
    }
  }
  revalidatePath(`/episodes/${episode.id}`);
  revalidatePath("/board");
  return { ok: true, approved };
}

/* ----------------------- public signup (needs clearance) ----------------------- */

/** Anyone can request an account; it stays inactive until an admin activates
 * it on /team (or they come in via an invite link instead). */
export async function signupAction(input: {
  name: string;
  email: string;
  password: string;
}): Promise<{ ok: boolean; error?: string }> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (!name) return { ok: false, error: "Tell us your name." };
  if (input.password.length < 8) {
    return { ok: false, error: "Choose a password of at least 8 characters." };
  }
  // per-email AND global caps: a signup flood can't mass-create pending
  // accounts or spam admins with notification emails
  const throttleKey = `signup:${email}`;
  if (isThrottled(throttleKey) || isThrottled("signup:*global*")) {
    return { ok: false, error: "Too many attempts. Try again later." };
  }
  recordFailure(throttleKey);
  recordFailure("signup:*global*");

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return { ok: false, error: "That email already has an account. Sign in instead." };
  }

  await db.user.create({
    data: {
      email,
      name,
      role: "reviewer",
      active: false, // awaiting admin clearance
      passwordHash: await bcrypt.hash(input.password, 10),
    },
  });

  const { notifyTeam, appLink } = await import("./email");
  await notifyTeam({
    roles: ["admin"],
    subject: `${name} requested access to the portal`,
    html: `<p><strong>${name}</strong> (${email}) signed up and is awaiting clearance.</p><p><a href="${appLink("/team")}">Review on the Team page →</a></p>`,
  });

  return { ok: true };
}

/* --------------------------- review rounds --------------------------- */

/** Editor/admin: start the next review round — resets everyone's approvals,
 * moves the episode back to "In review", and emails the team. */
export async function startReviewRoundAction(input: {
  episodeId: string;
}): Promise<{ ok: boolean; round?: number; error?: string }> {
  const actor = await requireEditor();
  const episode = await db.episode.findUnique({
    where: { id: input.episodeId },
    select: { id: true, title: true, reviewRound: true },
  });
  if (!episode) return { ok: false, error: "Episode not found." };

  const round = episode.reviewRound + 1;
  await db.$transaction([
    db.episodeApproval.deleteMany({ where: { episodeId: episode.id } }),
    db.episode.update({
      where: { id: episode.id },
      data: { reviewRound: round, status: "review", publishAt: null },
    }),
  ]);

  const { notifyTeam, appLink } = await import("./email");
  await notifyTeam({
    roles: "all",
    excludeUserId: actor.id,
    subject: `Round ${round} review requested: ${episode.title}`,
    html: `<p>The team updated <strong>${episode.title}</strong> — it's ready for review round ${round}. Previous approvals were reset.</p><p><a href="${appLink(`/episodes/${episode.id}`)}">Open the episode →</a></p>`,
  });

  revalidatePath(`/episodes/${episode.id}`);
  revalidatePath("/board");
  return { ok: true, round };
}

/* --------------------------- replace a scene's clip --------------------------- */

/** Swap a scene's video for a new upload (purges the old file). Notes stay. */
export async function replaceSceneVideoAction(input: {
  sceneId: string;
  videoKey: string;
  mimeType?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const scene = await db.scene.findUnique({
    where: { id: input.sceneId },
    select: {
      id: true,
      videoFile: true,
      mimeType: true,
      createdById: true,
      episodeId: true,
      title: true,
    },
  });
  if (!scene) return { ok: false, error: "Scene not found." };
  if (!canManageContent(user, scene.createdById)) {
    return { ok: false, error: "Only an editor, an admin, or the scene's uploader can replace its clip." };
  }

  // keep the outgoing clip as a version so the team can compare before/after
  const priorVersions = await db.sceneVersion.count({ where: { sceneId: scene.id } });
  await db.$transaction([
    ...(scene.videoFile
      ? [
          db.sceneVersion.create({
            data: {
              sceneId: scene.id,
              versionNo: priorVersions, // 0 = Original, 1 = Improvement 1, ...
              videoFile: scene.videoFile,
              mimeType: scene.mimeType,
              createdById: user.id,
            },
          }),
        ]
      : []),
    db.scene.update({
      where: { id: scene.id },
      data: { videoFile: input.videoKey, mimeType: input.mimeType ?? "video/mp4" },
    }),
  ]);

  revalidatePath(`/episodes/${scene.episodeId}`);
  return { ok: true };
}

/* --------------------------- archive & purge --------------------------- */

const RETENTION_DAYS = Number(process.env.ARCHIVE_RETENTION_DAYS ?? "14");

/** Editor/admin: archive a published episode (or restore it). Archived
 * episodes are permanently purged after the retention window. */
export async function setEpisodeArchivedAction(input: {
  episodeId: string;
  archived: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  await requireEditor();
  const episode = await db.episode.findUnique({
    where: { id: input.episodeId },
    select: { id: true, status: true },
  });
  if (!episode) return { ok: false, error: "Episode not found." };
  if (input.archived && episode.status !== "published") {
    return { ok: false, error: "Only published episodes can be archived." };
  }
  await db.episode.update({
    where: { id: episode.id },
    data: { archivedAt: input.archived ? new Date() : null },
  });
  revalidatePath("/board");
  return { ok: true };
}

/** Hard-delete episodes whose archive retention has lapsed, freeing all their
 * storage (Bunny/Supabase/local). Runs on board loads. */
export async function sweepArchivedEpisodes(): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const due = await db.episode.findMany({
    where: { archivedAt: { not: null, lte: cutoff } },
    select: {
      id: true,
      scenes: {
        select: {
          videoFile: true,
          comments: { select: { frameImage: true } },
          versions: { select: { videoFile: true } },
        },
      },
    },
  });
  for (const episode of due) {
    const keys: (string | null)[] = [];
    for (const s of episode.scenes) {
      keys.push(s.videoFile);
      for (const c of s.comments) keys.push(c.frameImage);
      for (const v of s.versions) keys.push(v.videoFile);
    }
    try {
      await deleteObjects(keys);
    } catch {
      continue; // storage backend unhappy — keep the row, retry next sweep
    }
    await db.episode.delete({ where: { id: episode.id } });
  }
}

/* --------------------------- renaming --------------------------- */

/** Rename a project (editors/admins, or its creator). */
export async function renameProjectAction(input: {
  projectId: string;
  name: string;
  description?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Give the project a name." };
  const project = await db.project.findUnique({
    where: { id: input.projectId },
    select: { id: true, createdById: true },
  });
  if (!project) return { ok: false, error: "Project not found." };
  if (!canManageContent(user, project.createdById)) {
    return { ok: false, error: "Only an editor, an admin, or the creator can rename it." };
  }
  await db.project.update({
    where: { id: project.id },
    data: {
      name: name.slice(0, 120),
      ...(input.description !== undefined
        ? { description: input.description.trim().slice(0, 500) }
        : {}),
    },
  });
  revalidatePath(`/projects/${project.id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Rename an episode (editors/admins, or its creator). */
export async function renameEpisodeAction(input: {
  episodeId: string;
  title: string;
  description?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Give the episode a title." };
  const episode = await db.episode.findUnique({
    where: { id: input.episodeId },
    select: { id: true, createdById: true, projectId: true },
  });
  if (!episode) return { ok: false, error: "Episode not found." };
  if (!canManageContent(user, episode.createdById)) {
    return { ok: false, error: "Only an editor, an admin, or the creator can rename it." };
  }
  await db.episode.update({
    where: { id: episode.id },
    data: {
      title: title.slice(0, 160),
      ...(input.description !== undefined
        ? { description: input.description.trim().slice(0, 500) }
        : {}),
    },
  });
  revalidatePath(`/episodes/${episode.id}`);
  revalidatePath(`/projects/${episode.projectId}`);
  revalidatePath("/board");
  return { ok: true };
}

/** Reviewer finished a review pass: email editors+admins ONE summary of the
 * notes they left on this episode (instead of an email per comment). */
export async function finishReviewSessionAction(input: {
  episodeId: string;
}): Promise<{ ok: boolean; noteCount?: number; error?: string }> {
  const user = await requireUser();
  const episode = await db.episode.findUnique({
    where: { id: input.episodeId },
    select: { id: true, title: true, reviewRound: true },
  });
  if (!episode) return { ok: false, error: "Episode not found." };

  // "this session" = the notes they left in the last 12 hours
  const since = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const notes = await db.comment.findMany({
    where: {
      authorId: user.id,
      createdAt: { gte: since },
      scene: { episodeId: episode.id },
    },
    orderBy: { createdAt: "asc" },
    select: {
      body: true,
      timecodeMs: true,
      scene: { select: { title: true, order: true } },
    },
  });
  if (notes.length === 0) {
    return {
      ok: false,
      error: "No notes from you in this session yet — pin some feedback first.",
    };
  }

  const { notifyTeam, appLink } = await import("./email");
  const items = notes
    .slice(0, 8)
    .map(
      (n) =>
        `<li><strong>Scene ${n.scene.order + 1}</strong>: ${n.body.slice(0, 160)}</li>`
    )
    .join("");
  await notifyTeam({
    roles: ["admin", "editor"],
    excludeUserId: user.id,
    subject: `${user.name} finished reviewing ${episode.title} — ${notes.length} note${notes.length === 1 ? "" : "s"}`,
    html: `<p><strong>${user.name}</strong> wrapped up a review pass on <strong>${episode.title}</strong> (round ${episode.reviewRound}) with ${notes.length} note${notes.length === 1 ? "" : "s"}:</p><ul>${items}</ul>${notes.length > 8 ? `<p>…and ${notes.length - 8} more.</p>` : ""}<p><a href="${appLink(`/episodes/${episode.id}`)}">See all the feedback →</a></p>`,
  });

  return { ok: true, noteCount: notes.length };
}
