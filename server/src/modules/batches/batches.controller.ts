import type { RequestHandler } from "express";
import { sendPaginated, sendSuccess } from "../../utils/api-response.js";
import { ApiError } from "../../utils/api-error.js";
import { buildPageMeta } from "../../utils/pagination.js";
import { batchesService } from "./batches.service.js";

const uuidSchema = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

function parseId(req: Parameters<RequestHandler>[0]): string {
  const id = req.params.id;
  if (typeof id !== "string" || !uuidSchema.test(id)) {
    throw ApiError.badRequest("Invalid ID format");
  }
  return id;
}

export const listBatches: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const query = req.query as any;
      const { items, total } = await batchesService.getBatches(query);
      sendPaginated(res, items, buildPageMeta(total, query));
    } catch (err) {
      next(err);
    }
  })();
};

export const getBatch: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const id = parseId(req);
      const batch = await batchesService.getBatchById(id);
      sendSuccess(res, batch);
    } catch (err) {
      next(err);
    }
  })();
};

export const createBatch: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const batch = await batchesService.createBatch(req.body, req);
      sendSuccess(res, batch, { status: 201 });
    } catch (err) {
      next(err);
    }
  })();
};

export const updateBatch: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const id = parseId(req);
      const updated = await batchesService.updateBatch(id, req.body, req);
      sendSuccess(res, updated);
    } catch (err) {
      next(err);
    }
  })();
};

export const createBatchAlias: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const batchId = parseId(req);
      const alias = await batchesService.createBatchAlias(batchId, req.body, req);
      sendSuccess(res, alias, { status: 201 });
    } catch (err) {
      next(err);
    }
  })();
};

