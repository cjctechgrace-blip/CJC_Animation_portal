import { formatTimecode, formatWhen, initialsOf } from "@/lib/format";

export type ActivityEvent = {
  id: string;
  when: Date;
  who: string;
  what: string;
};

/** Compact who-did-what strip for an episode, newest first. */
export function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) return null;
  return (
    <details className="border-b border-line bg-panel/60">
      <summary
        className="mx-auto max-w-6xl cursor-pointer list-none px-6 py-2 text-xs font-medium text-ink-faint hover:text-ink"
        data-testid="activity-toggle"
      >
        ⏱ Activity — latest: {events[0].who} {events[0].what}{" "}
        <span suppressHydrationWarning>({formatWhen(events[0].when)})</span>
      </summary>
      <ul
        className="mx-auto max-w-6xl columns-1 gap-6 px-6 pb-3 sm:columns-2"
        data-testid="activity-feed"
      >
        {events.map((e) => (
          <li key={e.id} className="mb-1.5 flex items-center gap-2 text-xs">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-reel-soft text-[9px] font-bold text-reel">
              {initialsOf(e.who)}
            </span>
            <span className="min-w-0 truncate text-ink-soft">
              <span className="font-semibold text-ink">{e.who}</span> {e.what}
            </span>
            <span className="ml-auto shrink-0 text-ink-faint" suppressHydrationWarning>
              {formatWhen(e.when)}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Build the merged event list from an episode's existing records. */
export function buildActivity(episode: {
  scenes: Array<{
    id: string;
    title: string;
    order: number;
    createdAt: Date;
    createdBy: { name: string };
    comments: Array<{
      id: string;
      timecodeMs: number | null;
      resolved: boolean;
      createdAt: Date;
      author: { name: string };
      replies: Array<{ id: string; createdAt: Date; author: { name: string } }>;
    }>;
    edits: Array<{ id: string; name: string; createdAt: Date; createdBy: { name: string } }>;
  }>;
  posts: Array<{ id: string; createdAt: Date; author: { name: string } }>;
}): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  for (const s of episode.scenes) {
    const label = `scene ${s.order + 1} (“${s.title}”)`;
    events.push({
      id: `scene-${s.id}`,
      when: s.createdAt,
      who: s.createdBy.name,
      what: `added ${label}`,
    });
    for (const c of s.comments) {
      events.push({
        id: `comment-${c.id}`,
        when: c.createdAt,
        who: c.author.name,
        what:
          c.timecodeMs != null
            ? `pinned a note at ${formatTimecode(c.timecodeMs)} on ${label}`
            : `left a note on ${label}`,
      });
      for (const r of c.replies) {
        events.push({
          id: `reply-${r.id}`,
          when: r.createdAt,
          who: r.author.name,
          what: `replied on ${label}`,
        });
      }
    }
    for (const e of s.edits) {
      events.push({
        id: `edit-${e.id}`,
        when: e.createdAt,
        who: e.createdBy.name,
        what: `created edit “${e.name}” on ${label}`,
      });
    }
  }

  for (const p of episode.posts) {
    events.push({
      id: `post-${p.id}`,
      when: p.createdAt,
      who: p.author.name,
      what: "posted in the discussion",
    });
  }

  return events
    .sort((a, b) => b.when.getTime() - a.when.getTime())
    .slice(0, 14);
}
