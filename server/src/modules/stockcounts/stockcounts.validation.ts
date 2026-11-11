import { z } from "zod";

export const stockCountItemInputSchema = z.object({
  productId: z.string().uuid("Invalid product ID"),
  batchId: z.string().uuid("Invalid batch ID"),
  countedQuantity: z
    .number()
    .nonnegative("Counted quantity cannot be negative")
    .multipleOf(0.0001, "Quantity must have at most 4 decimal places"),
});

export const createStockCountSchema = z
  .object({
    warehouseId: z.string().uuid("Invalid warehouse ID"),
    referenceNo: z.string().trim().max(100).optional(),
    description: z.string().trim().max(500).optional(),
    countedAt: z.string().datetime().optional(),
    items: z
      .array(stockCountItemInputSchema)
      .min(1, "At least one counted item is required"),
    idempotencyKey: z.string().uuid().optional(),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    data.items.forEach((item, index) => {
      if (seen.has(item.batchId)) {
        ctx.addIssue({
          code: "custom",
          path: ["items", index, "batchId"],
          message: `Duplicate counted batch: each batch may appear only once per stock count (batch ${item.batchId})`,
        });
      }
      seen.add(item.batchId);
    });
  });

export const updateStockCountSchema = z
  .object({
    referenceNo: z.string().trim().max(100).optional(),
    description: z.string().trim().max(500).optional(),
    countedAt: z.string().datetime().optional(),
    items: z.array(stockCountItemInputSchema).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.items) {
      const seen = new Set<string>();
      data.items.forEach((item, index) => {
        if (seen.has(item.batchId)) {
          ctx.addIssue({
            code: "custom",
            path: ["items", index, "batchId"],
            message: `Duplicate counted batch: each batch may appear only once per stock count (batch ${item.batchId})`,
          });
        }
        seen.add(item.batchId);
      });
    }
  });

export const stockCountQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.enum(["createdAt", "countedAt", "status", "referenceNo"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  warehouseId: z.string().uuid().optional(),
  status: z.enum(["PENDING", "SUBMITTED", "APPROVED", "REJECTED"]).optional(),
});

export type StockCountItemInput = z.infer<typeof stockCountItemInputSchema>;
export type CreateStockCountInput = z.infer<typeof createStockCountSchema>;
export type UpdateStockCountInput = z.infer<typeof updateStockCountSchema>;
export type StockCountQuery = z.infer<typeof stockCountQuerySchema>;
