import type { RequestHandler } from "express";
import { sendPaginated, sendSuccess } from "../../utils/api-response.js";
import { ApiError } from "../../utils/api-error.js";
import { buildPageMeta } from "../../utils/pagination.js";
import { dispatchesService } from "./dispatches.service.js";

const uuidSchema = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

function parseId(req: Parameters<RequestHandler>[0]): string {
  const id = req.params.id;
  if (typeof id !== "string" || !uuidSchema.test(id)) {
    throw ApiError.badRequest("Invalid ID format");
  }
  return id;
}

export const listDispatches: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const query = req.query as any;
      const { items, total } = await dispatchesService.getDispatches(query);
      sendPaginated(res, items, buildPageMeta(total, query));
    } catch (err) {
      next(err);
    }
  })();
};

export const getDispatch: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const id = parseId(req);
      const dispatch = await dispatchesService.getDispatchById(id);
      sendSuccess(res, dispatch);
    } catch (err) {
      next(err);
    }
  })();
};

export const createDispatch: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const dispatch = await dispatchesService.createDispatch(req.body, req);
      sendSuccess(res, dispatch, { status: 201 });
    } catch (err) {
      next(err);
    }
  })();
};

export const getDispatchRecommendation: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const recommendation = await dispatchesService.getFefoRecommendation(req.query as any);
      sendSuccess(res, recommendation);
    } catch (err) {
      next(err);
    }
  })();
};
