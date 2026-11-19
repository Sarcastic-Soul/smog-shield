import type { Profile } from "../domain/profile-options";
import { isPlanEvent, type PlanEvent } from "../domain/result";

/** The server's `{ error }` message, or a generic one with the status code. */
async function errorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") {
      return body.error;
    }
  } catch {
    // Not JSON: fall through to the generic message.
  }
  return `Request failed (${response.status})`;
}

/** POSTs JSON and returns the streamed response body, or throws the server's message. */
async function postForStream(url: string, payload: unknown, signal?: AbortSignal) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok || !response.body) throw new Error(await errorMessage(response));
  return response.body;
}

/** Decodes a byte stream into text chunks as they arrive. */
async function* textChunks(body: ReadableStream<Uint8Array<ArrayBuffer>>): AsyncGenerator<string> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    yield value;
  }
}

/** Splits a text stream into complete, non-empty lines. */
export async function* lines(chunks: AsyncIterable<string>): AsyncGenerator<string> {
  let buffer = "";
  for await (const chunk of chunks) {
    buffer += chunk;
    const parts = buffer.split("\n");
    buffer = parts.pop() ?? "";
    for (const line of parts) if (line.trim()) yield line.trim();
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
  const body = await postForStream("/api/plan", { profile }, signal);
  let gotFinal = false;
  for await (const line of lines(textChunks(body))) {
    const event: unknown = JSON.parse(line);
    if (!isPlanEvent(event)) throw new Error("The plan response was not understood.");
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
  const body = await postForStream("/api/ask", { profile, question }, signal);
  let text = "";
  for await (const chunk of textChunks(body)) {
    text += chunk;
    onText(text);
  }
}
