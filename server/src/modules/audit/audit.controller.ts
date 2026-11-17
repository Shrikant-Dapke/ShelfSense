import type { RequestHandler } from "express";
import { sendPaginated } from "../../utils/api-response.js";
import { listAuditLogs } from "./audit.service.js";
import type { AuditLogsQuery } from "./audit.validation.js";

export const listAuditLogsHandler: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      // validate() has already replaced req.query with the parsed query.
      const { items, meta } = await listAuditLogs(req.query as unknown as AuditLogsQuery);
      sendPaginated(res, items, meta);
    } catch (err) {
      next(err);
    }
  })();
};
