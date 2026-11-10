/**
 * Typed fetch wrapper for the ShelfSense API.
 * Uses relative /api/v1 paths — Next.js rewrites proxy them to the backend,
 * keeping the httpOnly session cookie same-origin.
 */

export interface ApiEnvelope<T> {
  success: true;
  data: T;
  meta?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Array<{ field: string; message: string }>;
  };
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Array<{ field: string; message: string }>;

  constructor(status: number, body: ApiErrorBody["error"]) {
    super(body.message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = body.code;
    this.details = body.details;
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<ApiEnvelope<T>> {
  const { method = "GET", body, signal } = options;

  const res = await fetch(`/api/v1${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
    signal,
  });

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    // Non-JSON response (proxy error, empty body)
  }

  if (!res.ok) {
    const errorBody = payload as ApiErrorBody | null;
    throw new ApiClientError(
      res.status,
      errorBody?.error ?? { code: "UNKNOWN", message: `Request failed with status ${res.status}` },
    );
  }

  return payload as ApiEnvelope<T>;
}
