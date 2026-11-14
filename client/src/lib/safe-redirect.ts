/**
 * Whitelist-style validation for `?next=`-style redirect targets, used by the
 * login page. Only same-app absolute paths are allowed; anything that could
 * send the user off-site is replaced by the fallback.
 *
 * Note: `URLSearchParams.get` already percent-decodes once, so this also
 * decodes once more — a deliberate defense-in-depth that catches values a
 * caller double-encoded. Rejected shapes:
 * - external URLs            `https://evil.com/x`
 * - protocol-relative URLs   `//evil.com/x`   (browser treats as external)
 * - backslash variants       `/\evil.com` `\\evil.com` (Windows-style UNC)
 * - encoded smuggles         `%2F%2Fevil.com` (decodes to protocol-relative)
 * - malformed encodings      `%zz` (decodeURIComponent throws)
 * - control characters       newline/header-injection attempts
 */
const DEFAULT_FALLBACK = "/dashboard";

function isSafeInternalPath(path: string): boolean {
  if (!path.startsWith("/")) return false;
  // Protocol-relative "//host" and backslash variants are external targets.
  if (path.startsWith("//") || path.startsWith("/\\") || path.startsWith("\\")) return false;
  // Control characters (incl. newline) must never reach the router.
  if (/[\u0000-\u001f\u007f]/.test(path)) return false;
  return true;
}

export function resolveInternalPath(
  raw: string | null | undefined,
  fallback: string = DEFAULT_FALLBACK,
): string {
  if (!raw) return fallback;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return fallback;
  }

  // Validating the decoded form is sufficient: any encoded `//evil.com`
  // smuggle becomes `//evil.com` here, and a value that is already decoded
  // (the normal case via URLSearchParams) is unchanged by this step.
  if (!isSafeInternalPath(decoded)) return fallback;

  return decoded;
}
