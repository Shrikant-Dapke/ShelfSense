import { ApiError } from "../../utils/api-error.js";
import { writeAudit } from "../../services/audit.service.js";
import { warehousesRepository } from "./warehouses.repository.js";
import type { CreateWarehouseInput, UpdateWarehouseInput, WarehouseQuery } from "./warehouses.validation.js";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware.js";
import type { Request } from "express";

function auditContext(req: Request) {
  const user = (req as AuthenticatedRequest).user;
  return { userId: user?.id, actorEmail: user?.email, ip: req.ip };
}

export const warehousesService = {
  async list(query: WarehouseQuery) {
    return warehousesRepository.findMany(query);
  },

  async getById(id: string) {
    const warehouse = await warehousesRepository.findById(id);
    if (!warehouse) {
      throw ApiError.notFound("Warehouse not found");
    }
    return warehouse;
  },

  async create(input: CreateWarehouseInput, req: Request) {
    const existing = await warehousesRepository.findByCode(input.code);
    if (existing) {
      throw ApiError.conflict(`A warehouse with code "${input.code}" already exists`);
    }
    const warehouse = await warehousesRepository.create(input);
    await writeAudit({
      ...auditContext(req),
      action: "warehouse.created",
      entityType: "warehouse",
      entityId: warehouse.id,
      metadata: { code: warehouse.code, name: warehouse.name },
    });
    return warehouse;
  },

  async update(id: string, input: UpdateWarehouseInput, req: Request) {
    const warehouse = await warehousesRepository.findById(id);
    if (!warehouse) {
      throw ApiError.notFound("Warehouse not found");
    }
    if (input.code && input.code !== warehouse.code) {
      const existing = await warehousesRepository.findByCode(input.code);
      if (existing) {
        throw ApiError.conflict(`A warehouse with code "${input.code}" already exists`);
      }
    }
    const updated = await warehousesRepository.update(id, input);
    await writeAudit({
      ...auditContext(req),
      action: "warehouse.updated",
      entityType: "warehouse",
      entityId: id,
      metadata: { changes: Object.keys(input) },
    });
    return updated;
  },

  async deactivate(id: string, req: Request) {
    const warehouse = await warehousesRepository.findById(id);
    if (!warehouse) {
      throw ApiError.notFound("Warehouse not found");
    }
    const updated = await warehousesRepository.softDelete(id);
    await writeAudit({
      ...auditContext(req),
      action: "warehouse.deactivated",
      entityType: "warehouse",
      entityId: id,
    });
    return updated;
  },
};
