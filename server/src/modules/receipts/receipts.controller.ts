import type { RequestHandler } from "express";
import { sendPaginated, sendSuccess } from "../../utils/api-response.js";
import { ApiError } from "../../utils/api-error.js";
import { buildPageMeta } from "../../utils/pagination.js";
import { receiptsService } from "./receipts.service.js";

const uuidSchema = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

function parseId(req: Parameters<RequestHandler>[0]): string {
  const id = req.params.id;
  if (typeof id !== "string" || !uuidSchema.test(id)) {
    throw ApiError.badRequest("Invalid ID format");
  }
  return id;
}

export const listReceipts: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const query = req.query as any;
      const { items, total } = await receiptsService.getReceipts(query);
      sendPaginated(res, items, buildPageMeta(total, query));
    } catch (err) {
      next(err);
    }
  })();
};

export const getReceipt: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const id = parseId(req);
      const receipt = await receiptsService.getReceiptById(id);
      sendSuccess(res, receipt);
    } catch (err) {
      next(err);
    }
  })();
};

export const createReceipt: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const receipt = await receiptsService.createReceipt(req.body, req);
      sendSuccess(res, receipt, { status: 201 });
    } catch (err) {
      next(err);
    }
  })();
};

