"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPostAction, togglePostVoteAction } from "@/lib/actions";
import { formatTimecode, formatWhen, initialsOf } from "@/lib/format";

export type DiscussionRef = {
  commentId: string;
  sceneId: string;
  sceneNumber: number;
  timecodeMs: number | null;
  snippet: string;
};

export type DiscussionPost = {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
  score: number;
  votedByMe: boolean;
  refs: DiscussionRef[];
  replies: DiscussionPost[];
};

type SceneForPicker = {
  id: string;
  comments: { id: string; timecodeMs: number | null; body: string }[];
};

export function EpisodeDiscussion({
  episodeId,
  scenes,
  posts,
  onOpenAnnotation,
}: {
  episodeId: string;
  scenes: SceneForPicker[];
  posts: DiscussionPost[];
  onOpenAnnotation: (sceneId: string, commentId: string) => void;
}) {
  return (
    <section className="mt-10 border-t border-line pt-6" data-testid="discussion">
      <h2 className="text-lg font-semibold tracking-tight">Episode discussion</h2>
      <p className="mb-4 text-sm text-ink-soft">
        Talk through the whole episode as a team. Type{" "}
        <span className="font-mono text-reel">@</span> and a scene number (e.g.{" "}
        <span className="font-mono text-reel">@2</span>) to reference its
        annotations.
      </p>

      <PostComposer episodeId={episodeId} scenes={scenes} />

      {posts.length === 0 ? (
        <p className="mt-4 text-sm text-ink-faint">
          No posts yet — start the conversation.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3" data-testid="post-list">
          {posts.map((p) => (
            <PostItem
              key={p.id}
              post={p}
              depth={0}
              episodeId={episodeId}
              scenes={scenes}
              onOpenAnnotation={onOpenAnnotation}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

type PendingRef = {
  commentId: string;
  sceneNumber: number;
  timecodeMs: number | null;
  snippet: string;
};

function PostComposer({
  episodeId,
  scenes,
  parentId,
  onDone,
}: {
  episodeId: string;
  scenes: SceneForPicker[];
  parentId?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState("");
  const [refs, setRefs] = useState<PendingRef[]>([]);
  const [pickerScene, setPickerScene] = useState<number | null>(null); // 0-based
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setBody(v);
    const m = v.match(/@(\d+)\s*$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 1 && n <= scenes.length) {
        setPickerScene(n - 1);
        return;
      }
    }
    setPickerScene(null);
  }

  function attach(commentIds: string[]) {
    if (pickerScene == null) return;
    const scene = scenes[pickerScene];
    const additions = scene.comments
      .filter((c) => commentIds.includes(c.id))
      .map((c) => ({
        commentId: c.id,
        sceneNumber: pickerScene + 1,
        timecodeMs: c.timecodeMs,
        snippet: c.body.slice(0, 50),
      }));
    setRefs((prev) => {
      const seen = new Set(prev.map((r) => r.commentId));
      return [...prev, ...additions.filter((a) => !seen.has(a.commentId))];
    });
    setBody((b) => b.replace(/@(\d+)\s*$/, "").replace(/\s+$/, "") + " ");
    setPickerScene(null);
    taRef.current?.focus();
  }

  function submit() {
    const b = body.trim();
    if (!b) {
      setError("Write something first.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await createPostAction({
        episodeId,
        body: b,
        parentId: parentId ?? null,
        refCommentIds: refs.map((r) => r.commentId),
      });
      if (!res.ok) {
        setError(res.error ?? "Could not post.");
        return;
      }
      setBody("");
      setRefs([]);
      onDone?.();
      router.refresh();
    });
  }

  return (
    <div className="relative">
      <textarea
        ref={taRef}
        value={body}
        onChange={onChange}
        rows={parentId ? 2 : 3}
        data-testid="post-input"
        className="field"
        placeholder={
          parentId ? "Write a reply…" : "Start a discussion about this episode…"
        }
      />

      {pickerScene != null ? (
        <AnnotationPicker
          scene={scenes[pickerScene]}
          sceneNumber={pickerScene + 1}
          onAttach={attach}
          onClose={() => setPickerScene(null)}
        />
      ) : null}

      {refs.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5" data-testid="pending-refs">
          {refs.map((r) => (
            <span
              key={r.commentId}
              className="inline-flex items-center gap-1 rounded-full border border-reel/30 bg-reel-soft px-2 py-0.5 text-xs text-reel"
            >
              ◈ Scene {r.sceneNumber}
              {r.timecodeMs != null ? ` · ${formatTimecode(r.timecodeMs)}` : ""}
              <button
                type="button"
                onClick={() =>
                  setRefs((prev) => prev.filter((x) => x.commentId !== r.commentId))
                }
                className="text-ink-faint hover:text-ink"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-1 text-sm font-medium text-red-600">
          {error}
        </p>
      ) : null}

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          data-testid="post-submit"
          className="btn-primary px-4 py-1.5 text-sm"
        >
          {pending ? "Posting…" : parentId ? "Reply" : "Post"}
        </button>
        {parentId ? (
          <button
            type="button"
            onClick={() => onDone?.()}
            className="btn-ghost px-3 py-1.5 text-sm"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}

function AnnotationPicker({
  scene,
  sceneNumber,
  onAttach,
  onClose,
}: {
  scene: SceneForPicker;
  sceneNumber: number;
  onAttach: (commentIds: string[]) => void;
  onClose: () => void;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div
      className="absolute z-20 mt-1 w-full max-w-md rounded-lg border border-line bg-panel p-3 shadow-lg"
      data-testid="annotation-picker"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Reference annotations · Scene {sceneNumber}
        </span>
        <button type="button" onClick={onClose} className="text-xs text-ink-faint hover:text-ink">
          close
        </button>
      </div>
      {scene.comments.length === 0 ? (
        <p className="text-sm text-ink-faint">No annotations in this scene yet.</p>
      ) : (
        <ul className="flex max-h-52 flex-col gap-1 overflow-y-auto">
          {scene.comments.map((c) => (
            <li key={c.id}>
              <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-paper">
                <input
                  type="checkbox"
                  checked={sel.has(c.id)}
                  onChange={() => toggle(c.id)}
                  data-testid="picker-option"
                  className="mt-1"
                />
                <span className="text-sm">
                  {c.timecodeMs != null ? (
                    <span className="mr-1 font-mono text-xs text-reel">
                      {formatTimecode(c.timecodeMs)}
                    </span>
                  ) : null}
                  {c.body.slice(0, 80)}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={() => onAttach([...sel])}
          disabled={sel.size === 0}
          data-testid="picker-attach"
          className="btn-primary px-3 py-1 text-xs"
        >
          Attach {sel.size > 0 ? `(${sel.size})` : ""}
        </button>
      </div>
    </div>
  );
}

function PostItem({
  post,
  depth,
  episodeId,
  scenes,
  onOpenAnnotation,
}: {
  post: DiscussionPost;
  depth: number;
  episodeId: string;
  scenes: SceneForPicker[];
  onOpenAnnotation: (sceneId: string, commentId: string) => void;
}) {
  const [score, setScore] = useState(post.score);
  const [voted, setVoted] = useState(post.votedByMe);
  const [replyOpen, setReplyOpen] = useState(false);
  const [, startVote] = useTransition();

  function vote() {
    const nextVoted = !voted;
    setVoted(nextVoted);
    setScore((s) => s + (nextVoted ? 1 : -1));
    startVote(async () => {
      const res = await togglePostVoteAction({ postId: post.id });
      if (res.ok) {
        setScore(res.score ?? 0);
        setVoted(Boolean(res.voted));
      }
    });
  }

  return (
    <li className="card p-3" data-testid="post-item">
      <div className="flex gap-3">
        <button
          type="button"
          onClick={vote}
          data-testid="post-vote"
          className={`flex h-fit flex-col items-center rounded-md px-2 py-1 text-xs font-semibold ${
            voted ? "bg-accent/15 text-accent-ink" : "text-ink-faint hover:bg-paper"
          }`}
          title="Upvote"
        >
          <span aria-hidden>▲</span>
          <span data-testid="post-score">{score}</span>
        </button>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-reel-soft text-[10px] font-bold text-reel">
              {initialsOf(post.authorName)}
            </span>
            <span className="text-sm font-medium">{post.authorName}</span>
            <span className="text-[11px] text-ink-faint">
              {formatWhen(post.createdAt)}
            </span>
          </div>

          <p className="whitespace-pre-wrap text-sm text-ink">{post.body}</p>

          {post.refs.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {post.refs.map((r) => (
                <button
                  key={r.commentId}
                  type="button"
                  onClick={() => onOpenAnnotation(r.sceneId, r.commentId)}
                  data-testid="ref-chip"
                  className="inline-flex items-center gap-1 rounded-full border border-reel/30 bg-reel-soft px-2 py-0.5 text-xs font-medium text-reel hover:bg-reel hover:text-white"
                  title="Open this annotation"
                >
                  ◈ Scene {r.sceneNumber}
                  {r.timecodeMs != null ? ` · ${formatTimecode(r.timecodeMs)}` : ""}
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-1.5 text-xs">
            {depth < 4 ? (
              <button
                type="button"
                onClick={() => setReplyOpen((v) => !v)}
                data-testid="post-reply-toggle"
                className="font-medium text-reel hover:underline"
              >
                Reply
              </button>
            ) : null}
          </div>

          {replyOpen ? (
            <div className="mt-2">
              <PostComposer
                episodeId={episodeId}
                scenes={scenes}
                parentId={post.id}
                onDone={() => setReplyOpen(false)}
              />
            </div>
          ) : null}

          {post.replies.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-2 border-l-2 border-line pl-3">
              {post.replies.map((r) => (
                <PostItem
                  key={r.id}
                  post={r}
                  depth={depth + 1}
                  episodeId={episodeId}
                  scenes={scenes}
                  onOpenAnnotation={onOpenAnnotation}
                />
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </li>
  );
}
