import { sanitizeUserText } from "@/lib/ai/sanitize";

/**
 * User prompts: the server-built FACTS block plus the user's own text, which
 * is cleaned and fenced in tags the system instructions treat as data.
 */

export function buildPlanPrompt(facts: string, notes: string): string {
  const safeNotes = sanitizeUserText(notes);
  return `FACTS:\n${facts}\n\n<household_notes>${safeNotes || "none"}</household_notes>\n\nWrite the plan for the next 24 hours for this family as JSON.`;
}

export function buildAskPrompt(facts: string, question: string): string {
  return `FACTS:\n${facts}\n\n<question>${sanitizeUserText(question)}</question>`;
}
