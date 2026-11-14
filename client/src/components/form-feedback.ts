import { ApiClientError } from "@/lib/api-client";

/**
 * Helpers for surfacing backend validation errors on forms. The backend
 * returns `error.details: Array<{ field, message }>` on validation failures;
 * map that to per-field messages and pick a headline message in one place
 * instead of every dialog re-implementing the logic.
 */

/** Map ApiClientError.details into a `Record<field, message>` for forms. */
export function fieldErrors(err: unknown): Record<string, string> {
  if (err instanceof ApiClientError && err.details?.length) {
    return Object.fromEntries(err.details.map((d) => [d.field, d.message]));
  }
  return {};
}

/** Best user-facing headline message for any thrown value. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiClientError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/** True when the error carries per-field validation details. */
export function hasFieldErrors(err: unknown): err is ApiClientError {
  return err instanceof ApiClientError && Boolean(err.details?.length);
}
