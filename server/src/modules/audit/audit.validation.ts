import { z } from "zod";

/**
 * Query schema for the ADMIN audit-log viewer. All filters are validated:
 * page/pageSize are coerced integers, `action`/`entityType` are exact
 * matches, `actorEmail` is a case-insensitive substring match, and the date
 * range uses plain YYYY-MM-DD dates (expanded to UTC day boundaries so a
 * `dateTo` includes the whole day).
 */
export const auditLogsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    action: z.string().trim().min(1).max(100).optional(),
    entityType: z.string().trim().min(1).max(50).optional(),
    actorEmail: z.string().trim().min(3).max(200).optional(),
    dateFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "dateFrom must be a YYYY-MM-DD date")
      .optional(),
    dateTo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "dateTo must be a YYYY-MM-DD date")
      .optional(),
  })
  .refine((q) => !q.dateFrom || !q.dateTo || q.dateFrom <= q.dateTo, {
    message: "dateFrom must not be after dateTo",
    path: ["dateFrom"],
  });

export type AuditLogsQuery = z.infer<typeof auditLogsQuerySchema>;
