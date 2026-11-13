import type { RequestHandler } from "express";
import { sendSuccess } from "../../utils/api-response.js";
import { expiryService } from "./expiry.service.js";

export const getExpiryMonitor: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const monitor = await expiryService.getMonitor(req.query as any);
      sendSuccess(res, monitor);
    } catch (err) {
      next(err);
    }
  })();
};

export const getExpiryTrends: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const trends = await expiryService.getTrends(req.query as any);
      sendSuccess(res, trends);
    } catch (err) {
      next(err);
    }
  })();
};
