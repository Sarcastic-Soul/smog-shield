import type { Profile } from "../domain/profile";
import type { PlanResult } from "../server/plan-service";

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // Fall through to the generic message.
  }
  return `Request failed (${response.status})`;
}

export async function requestPlan(profile: Profile, signal?: AbortSignal): Promise<PlanResult> {
  const response = await fetch("/api/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile }),
    signal,
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return (await response.json()) as PlanResult;
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
