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

/** Delete a project and everything in it (episodes, scenes, notes, edits,
 * discussion), purging all its stored clips + frames. */
export async function deleteProjectAction(input: {
  projectId: string;
}): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  const project = await db.project.findUnique({
    where: { id: input.projectId },
    select: {
      id: true,
      episodes: {
        select: {
          scenes: {
            select: {
              videoFile: true,
              comments: { select: { frameImage: true } },
            },
          },
        },
      },
    },
  });
  if (!project) return { ok: false, error: "Project not found." };

  const keys: (string | null)[] = [];
  for (const ep of project.episodes) {
    for (const s of ep.scenes) {
      keys.push(s.videoFile);
      for (const c of s.comments) keys.push(c.frameImage);
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

type SceneInput = { title: string; videoKey?: string | null; mimeType?: string | null };

/** Create an episode plus its ordered scene clips (uploaded by the browser). */
export async function createEpisodeWithScenesAction(input: {
  projectId: string;
  title: string;
  description?: string;
  scenes: SceneInput[];
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
  await requireUser();
  const scene = await db.scene.findUnique({
    where: { id: input.sceneId },
    select: {
      id: true,
      episodeId: true,
      videoFile: true,
      comments: { select: { frameImage: true } },
    },
  });
  if (!scene) return { ok: false, error: "Scene not found." };

  await deleteObjects([scene.videoFile, ...scene.comments.map((c) => c.frameImage)]);
  await db.scene.delete({ where: { id: scene.id } });

  revalidatePath(`/episodes/${scene.episodeId}`);
  return { ok: true, episodeId: scene.episodeId };
}

/** Delete an episode: every scene's clip + frames from storage, then the row (cascades). */
export async function deleteEpisodeAction(input: {
  episodeId: string;
}): Promise<{ ok: boolean; projectId?: string; error?: string }> {
  await requireUser();
  const episode = await db.episode.findUnique({
    where: { id: input.episodeId },
    select: {
      id: true,
      projectId: true,
      scenes: {
        select: { videoFile: true, comments: { select: { frameImage: true } } },
      },
    },
  });
  if (!episode) return { ok: false, error: "Episode not found." };

  const keys: (string | null)[] = [];
  for (const s of episode.scenes) {
    keys.push(s.videoFile);
    for (const c of s.comments) keys.push(c.frameImage);
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

export async function addCommentAction(input: {
  sceneId: string;
  body: string;
  timecodeMs: number;
  frameDataUrl?: string | null;
  mark?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const body = input.body.trim();
  if (!body) return { ok: false, error: "Write something first." };

  const scene = await db.scene.findUnique({
    where: { id: input.sceneId },
    select: { id: true, episodeId: true },
  });
  if (!scene) return { ok: false, error: "Scene not found." };

  const created = await db.comment.create({
    data: {
      sceneId: input.sceneId,
      authorId: user.id,
      body,
      timecodeMs: Math.max(0, Math.round(input.timecodeMs)),
      mark: input.mark ?? null,
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
  await requireUser();
  const comment = await db.comment.findUnique({
    where: { id: input.commentId },
    select: {
      id: true,
      frameImage: true,
      scene: { select: { episodeId: true } },
      replies: { select: { frameImage: true } },
    },
  });
  if (!comment) return { ok: false, error: "Note not found." };

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
  await requireUser();
  const edit = await db.edit.findUnique({
    where: { id: input.editId },
    select: { id: true, scene: { select: { episodeId: true } } },
  });
  if (!edit) return { ok: false, error: "Edit not found." };
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
