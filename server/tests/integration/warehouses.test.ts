import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import { prisma } from "../../src/config/prisma.js";
import { app, resetDatabase, seedTestUsers, loginAs } from "../helpers.js";

let adminCookie: string;
let managerCookie: string;
let operatorCookie: string;

beforeAll(async () => {
  await resetDatabase();
  await seedTestUsers();
  adminCookie = await loginAs("admin");
  managerCookie = await loginAs("manager");
  operatorCookie = await loginAs("operator");
});

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.warehouse.deleteMany();
});

const validWarehouse = {
  name: "Pune Central Warehouse",
  code: "PUNE-CENTRAL",
  location: "Pune, Maharashtra, IN",
};

describe("Warehouse authorization", () => {
  it("allows authenticated users to list warehouses", async () => {
    const res = await request(app).get("/api/v1/warehouses").set("Cookie", operatorCookie);
    expect(res.status).toBe(200);
  });

  it("allows only ADMIN to create warehouses", async () => {
    const asManager = await request(app)
      .post("/api/v1/warehouses")
      .set("Cookie", managerCookie)
      .send(validWarehouse);
    expect(asManager.status).toBe(403);

    const asAdmin = await request(app)
      .post("/api/v1/warehouses")
      .set("Cookie", adminCookie)
      .send(validWarehouse);
    expect(asAdmin.status).toBe(201);
  });

  it("rejects unauthenticated listing", async () => {
    const res = await request(app).get("/api/v1/warehouses");
    expect(res.status).toBe(401);
  });
});

describe("Warehouse CRUD", () => {
  it("creates, updates and deactivates a warehouse", async () => {
    const created = await request(app)
      .post("/api/v1/warehouses")
      .set("Cookie", adminCookie)
      .send(validWarehouse);
    const id = created.body.data.id;
    expect(created.body.data.code).toBe("PUNE-CENTRAL");

    const updated = await request(app)
      .patch(`/api/v1/warehouses/${id}`)
      .set("Cookie", adminCookie)
      .send({ location: "Pune, MH" });
    expect(updated.body.data.location).toBe("Pune, MH");

    const deactivated = await request(app)
      .delete(`/api/v1/warehouses/${id}`)
      .set("Cookie", adminCookie);
    expect(deactivated.body.data.isActive).toBe(false);
  });

  it("normalizes codes to uppercase and rejects duplicates", async () => {
    await request(app)
      .post("/api/v1/warehouses")
      .set("Cookie", adminCookie)
      .send({ ...validWarehouse, code: "mumbai-dist" });
    const res = await request(app)
      .post("/api/v1/warehouses")
      .set("Cookie", adminCookie)
      .send({ ...validWarehouse, code: "MUMBAI-DIST" });
    expect(res.status).toBe(409);
  });

  it("returns 404 for unknown warehouse", async () => {
    const res = await request(app)
      .get("/api/v1/warehouses/00000000-0000-4000-8000-000000000000")
      .set("Cookie", adminCookie);
    expect(res.status).toBe(404);
  });
});

describe("Warehouse listing", () => {
  it("supports filtering by active status and search", async () => {
    await prisma.warehouse.create({ data: validWarehouse });
    await prisma.warehouse.create({
      data: { name: "Old Depot", code: "OLD-DEPOT", isActive: false },
    });

    const all = await request(app)
      .get("/api/v1/warehouses?isActive=true")
      .set("Cookie", operatorCookie);
    expect(all.body.meta.total).toBe(1);

    const search = await request(app)
      .get("/api/v1/warehouses?search=depot")
      .set("Cookie", operatorCookie);
    expect(search.body.meta.total).toBe(1);
    expect(search.body.data[0].code).toBe("OLD-DEPOT");
  });
});
