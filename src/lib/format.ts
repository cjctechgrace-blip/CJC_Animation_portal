/** Format milliseconds as a timecode, e.g. 92500 -> "1:32.5". */
export function formatTimecode(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return "--:--";
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const tenths = Math.floor((totalSeconds * 10) % 10);
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${tenths}`;
}

/** Short relative-ish date, e.g. "Jul 7, 8:42 PM". */
export function formatWhen(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
