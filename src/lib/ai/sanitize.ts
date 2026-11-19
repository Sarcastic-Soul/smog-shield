/**
 * Cleans free text before it goes into a prompt: folds look-alike characters,
 * drops invisible control and formatting characters (zero-width, bidi), strips
 * `<` `>` so our tags cannot be faked, removes fake section labels and
 * collapses long runs of punctuation.
 */
export function sanitizeUserText(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/[<>]/g, "")
    .replace(/\b(FACTS|SYSTEM|RULES|INSTRUCTIONS?)\s*:/gi, "")
    .replace(/([!?.,*#=_-])\1{3,}/g, "$1$1$1")
    .replace(/\s+/g, " ")
    .trim();
}
