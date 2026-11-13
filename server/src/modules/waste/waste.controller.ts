import type { RequestHandler } from "express";
import { sendPaginated, sendSuccess } from "../../utils/api-response.js";
import { ApiError } from "../../utils/api-error.js";
import { buildPageMeta } from "../../utils/pagination.js";
import { wasteService } from "./waste.service.js";

const uuidSchema = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

function parseId(req: Parameters<RequestHandler>[0]): string {
  const id = req.params.id;
  if (typeof id !== "string" || !uuidSchema.test(id)) {
    throw ApiError.badRequest("Invalid ID format");
  }
  return id;
}

export const listWaste: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const query = req.query as any;
      const { items, total } = await wasteService.getWasteRecords(query);
      sendPaginated(res, items, buildPageMeta(total, query));
    } catch (err) {
      next(err);
    }
  })();
};

export const getWasteRecord: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const id = parseId(req);
      const record = await wasteService.getWasteRecordById(id);
      sendSuccess(res, record);
    } catch (err) {
      next(err);
    }
  })();
};

export const createWaste: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const record = await wasteService.recordWaste(req.body, req);
      sendSuccess(res, record, { status: 201 });
    } catch (err) {
      next(err);
    }
  })();
};

export const getWasteSummary: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const query = req.query as any;
      const summary = await wasteService.getWasteSummary(query);
      sendSuccess(res, summary);
    } catch (err) {
      next(err);
    }
  })();
};
