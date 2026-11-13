import type { RequestHandler } from "express";
import { sendSuccess } from "../../utils/api-response.js";
import { analyticsService } from "./analytics.service.js";

export const getAnalyticsSummary: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const summary = await analyticsService.getSummary(req.query as any);
      sendSuccess(res, summary);
    } catch (err) {
      next(err);
    }
  })();
};
