import type { RequestHandler } from "express";
import { sendPaginated, sendSuccess } from "../../utils/api-response.js";
import { ApiError } from "../../utils/api-error.js";
import { buildPageMeta } from "../../utils/pagination.js";
import { stockCountsService } from "./stockcounts.service.js";

const uuidSchema = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

function parseId(req: Parameters<RequestHandler>[0]): string {
  const id = req.params.id;
  if (typeof id !== "string" || !uuidSchema.test(id)) {
    throw ApiError.badRequest("Invalid ID format");
  }
  return id;
}

export const listStockCounts: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const query = req.query as any;
      const { items, total } = await stockCountsService.getStockCounts(query);
      sendPaginated(res, items, buildPageMeta(total, query));
    } catch (err) {
      next(err);
    }
  })();
};

export const getStockCount: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const id = parseId(req);
      const count = await stockCountsService.getStockCountById(id);
      sendSuccess(res, count);
    } catch (err) {
      next(err);
    }
  })();
};

export const createStockCount: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const count = await stockCountsService.createStockCount(req.body, req);
      sendSuccess(res, count, { status: 201 });
    } catch (err) {
      next(err);
    }
  })();
};

export const updateStockCount: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const id = parseId(req);
      const count = await stockCountsService.updateStockCount(id, req.body, req);
      sendSuccess(res, count);
    } catch (err) {
      next(err);
    }
  })();
};

export const submitStockCount: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const id = parseId(req);
      const count = await stockCountsService.submitStockCount(id, req);
      sendSuccess(res, count);
    } catch (err) {
      next(err);
    }
  })();
};

export const approveStockCount: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const id = parseId(req);
      const count = await stockCountsService.approveStockCount(id, req);
      sendSuccess(res, count);
    } catch (err) {
      next(err);
    }
  })();
};

export const postStockCount: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const id = parseId(req);
      const count = await stockCountsService.postStockCount(id, req);
      sendSuccess(res, count);
    } catch (err) {
      next(err);
    }
  })();
};
