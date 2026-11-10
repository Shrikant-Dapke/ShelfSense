import type { RequestHandler } from "express";
import { sendPaginated, sendSuccess } from "../../utils/api-response.js";
import { ApiError } from "../../utils/api-error.js";
import { buildPageMeta } from "../../utils/pagination.js";
import { requireAuth, requireRoles } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { productsService } from "./products.service.js";
import {
  createProductSchema,
  productQuerySchema,
  updateProductSchema,
  type ProductQuery,
} from "./products.validation.js";

const uuidSchema = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

function parseId(req: Parameters<RequestHandler>[0]): string {
  const id = req.params.id;
  if (typeof id !== "string" || !uuidSchema.test(id)) {
    throw ApiError.badRequest("Invalid product id format");
  }
  return id;
}

export const listProducts: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      // req.query has already been parsed/transformed by validate(productQuerySchema).
      const query = req.query as unknown as ProductQuery;
      const { items, total } = await productsService.list(query);
      sendPaginated(res, items, buildPageMeta(total, query));
    } catch (err) {
      next(err);
    }
  })();
};

export const getProduct: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const product = await productsService.getById(parseId(req));
      sendSuccess(res, product);
    } catch (err) {
      next(err);
    }
  })();
};

export const createProduct: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const product = await productsService.create(req.body, req);
      sendSuccess(res, product, { status: 201 });
    } catch (err) {
      next(err);
    }
  })();
};

export const updateProduct: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const product = await productsService.update(parseId(req), req.body, req);
      sendSuccess(res, product);
    } catch (err) {
      next(err);
    }
  })();
};

export const deactivateProduct: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const product = await productsService.deactivate(parseId(req), req);
      sendSuccess(res, product);
    } catch (err) {
      next(err);
    }
  })();
};
