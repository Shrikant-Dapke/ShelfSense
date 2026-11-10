import type { PageMeta } from "./api-response.js";
import { ApiError } from "./api-error.js";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface ListQuery {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder: "asc" | "desc";
  search?: string;
}

export interface ParseListQueryOptions {
  /** Whitelist of sortable field names; anything else is rejected. */
  sortableFields: string[];
  searchable?: boolean;
  defaultSortBy?: string;
}

/**
 * Normalizes and validates pagination / sorting query parameters.
 * Sorting uses a whitelist so arbitrary column names can never reach Prisma.
 */
export function parseListQuery(
  raw: Record<string, unknown>,
  options: ParseListQueryOptions,
): ListQuery {
  const page = parsePositiveInt(raw.page, "page") ?? 1;
  const pageSizeRaw = parsePositiveInt(raw.pageSize, "pageSize") ?? DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(pageSizeRaw, MAX_PAGE_SIZE);

  const sortByRaw = typeof raw.sortBy === "string" && raw.sortBy.trim() !== "" ? raw.sortBy.trim() : options.defaultSortBy;
  if (sortByRaw && !options.sortableFields.includes(sortByRaw)) {
    throw ApiError.badRequest(
      `Cannot sort by "${sortByRaw}". Allowed fields: ${options.sortableFields.join(", ")}`,
    );
  }

  const sortOrder = raw.sortOrder === "desc" ? "desc" : "asc";
  const search =
    options.searchable && typeof raw.search === "string" && raw.search.trim() !== ""
      ? raw.search.trim()
      : undefined;

  return { page, pageSize, sortBy: sortByRaw, sortOrder, search };
}

export function buildPageMeta(total: number, query: Pick<ListQuery, "page" | "pageSize">): PageMeta {
  return {
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export function parsePositiveInt(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw ApiError.badRequest(`"${field}" must be a positive integer`);
  }
  return n;
}
