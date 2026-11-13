import type { RequestHandler } from "express";
import { sendPaginated, sendSuccess } from "../../utils/api-response.js";
import { buildPageMeta } from "../../utils/pagination.js";
import { reconciliationService } from "./reconciliation.service.js";

export const getReconciliation: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const query = req.query as any;
      const { items, total } = await reconciliationService.getReconciliation(query);
      sendPaginated(res, items, buildPageMeta(total, query));
    } catch (err) {
      next(err);
    }
  })();
};

export const getReconciliationOverview: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const query = req.query as any;
      const overview = await reconciliationService.getOverview(query);
      sendSuccess(res, overview);
    } catch (err) {
      next(err);
    }
  })();
};
