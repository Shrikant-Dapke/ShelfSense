/**
 * Deterministically normalizes a batch code.
 *
 * Steps:
 * 1. Trim surrounding whitespace.
 * 2. Convert to uppercase.
 * 3. Replace spaces, underscores, slashes with single hyphen.
 * 4. Strip punctuation not in [A-Z0-9-].
 * 5. Collapse consecutive hyphens and strip leading/trailing hyphens.
 *
 * Example: "  lot_2026/01  " -> "LOT-2026-01"
 */
export function normalizeBatchCode(code: string): string {
  if (!code) return "";
  return code
    .trim()
    .toUpperCase()
    .replace(/[\s_/\\]+/g, "-")
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

