import type { Profile } from "../domain/profile";
import type { PlanEvent } from "../domain/result";

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // Fall through to the generic message.
  }
  return `Request failed (${response.status})`;
}

/** Splits a text stream into complete lines. */
async function* lines(body: ReadableStream<Uint8Array<ArrayBuffer>>): AsyncGenerator<string> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) yield line;
      newline = buffer.indexOf("\n");
    }
  }
  if (buffer.trim()) yield buffer.trim();
}

/**
 * Requests a plan and calls `onEvent` for each streamed event: usually a
 * rule-based draft, then the final plan.
 */
export async function requestPlan(
  profile: Profile,
  onEvent: (event: PlanEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch("/api/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile }),
    signal,
  });
  if (!response.ok || !response.body) throw new Error(await errorMessage(response));
  let gotFinal = false;
  for await (const line of lines(response.body)) {
    const event = JSON.parse(line) as PlanEvent;
    gotFinal ||= event.kind === "final";
    onEvent(event);
  }
  if (!gotFinal) throw new Error("The plan was cut off. Please try again.");
}

/** Streams the answer, calling `onText` with the full text so far. */
export async function askQuestion(
  profile: Profile,
  question: string,
  onText: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile, question }),
    signal,
  });
  if (!response.ok || !response.body) throw new Error(await errorMessage(response));

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += value;
    onText(text);
  }
}
