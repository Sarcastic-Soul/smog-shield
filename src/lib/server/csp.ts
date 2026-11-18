/**
 * Content Security Policy for pages. Scripts need a per-request nonce, so no
 * inline script can run unless Next.js rendered it. Styles keep
 * 'unsafe-inline' because React `style` props (chart bar heights, band
 * colours) are inline style attributes, which nonces cannot cover.
 */
export function buildCsp(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${isDev ? " ws:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/** API responses are JSON or text and never need to load anything. */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'";
