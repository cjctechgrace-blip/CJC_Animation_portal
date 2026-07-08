import "server-only";
import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { storagePathFor } from "./storage";
import { formatTimecode } from "./format";

// Default to Opus 4.8 (most capable). To cut cost, set ANTHROPIC_MODEL=claude-haiku-4-5.
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

const SYSTEM = `You are a prompt engineer for Higgsfield, an AI video generation tool that animates a still start-frame into a short video clip.

A reviewer has left feedback on a frame of an animated episode. Turn that feedback into ONE production-ready Higgsfield generation prompt that, applied to the attached start-frame, would produce the requested change.

Guidelines:
- Write 2-4 vivid sentences describing the motion, action, and visual change requested — in the present tense, as a director would.
- Preserve the established character design, colours, and lighting visible in the frame unless the feedback asks to change them.
- Describe camera movement and pacing where it helps (e.g. "slow push-in", "handheld sway").
- Assume the attached frame is the start-frame; do not restate that.
- Respond with ONLY the prompt text — no preamble, no headings, no quotes, no explanation.`;

type PromptInput = {
  note: string;
  episodeTitle: string;
  episodeDescription: string;
  timecodeMs: number | null;
  frameImage: string | null;
};

/** Deterministic fallback used when no ANTHROPIC_API_KEY is set (local dev / tests). */
function mockPrompt(input: PromptInput): string {
  const at =
    input.timecodeMs != null ? ` at ${formatTimecode(input.timecodeMs)}` : "";
  return `Animated scene from "${input.episodeTitle}"${at}. ${input.note} Keep the existing character design, colour palette, and lighting from the start-frame consistent while making this change. Smooth, natural motion with a gentle camera push-in; high detail; cohesive animated style.`;
}

export async function generateHiggsfieldPrompt(
  input: PromptInput
): Promise<{ prompt: string; usedAI: boolean }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  // No key configured → return a solid templated prompt so the feature is
  // fully usable (and testable) at zero cost. Set ANTHROPIC_API_KEY to enable Claude.
  if (!apiKey) {
    return { prompt: mockPrompt(input), usedAI: false };
  }

  const client = new Anthropic({ apiKey });

  const userBlocks: Anthropic.ContentBlockParam[] = [];

  // Attach the pinned frame so Claude can actually see what the note refers to.
  if (input.frameImage) {
    try {
      const bytes = fs.readFileSync(storagePathFor(input.frameImage));
      userBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: bytes.toString("base64"),
        },
      });
    } catch {
      // frame missing on disk — proceed with text only
    }
  }

  const at =
    input.timecodeMs != null
      ? ` (at timecode ${formatTimecode(input.timecodeMs)})`
      : "";
  userBlocks.push({
    type: "text",
    text: `Episode: ${input.episodeTitle}\n${
      input.episodeDescription ? `Context: ${input.episodeDescription}\n` : ""
    }Reviewer feedback${at}: "${input.note}"\n\nWrite the Higgsfield prompt.`,
  });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    messages: [{ role: "user", content: userBlocks }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  return { prompt: text || mockPrompt(input), usedAI: true };
}
