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
  await prisma.product.deleteMany();
});

const validProduct = {
  name: "Fresh Cow Milk 1L",
  sku: "DAI-MILK-001",
  category: "Dairy",
  unit: "L",
  brand: "Amul",
};

describe("Authorization rules", () => {
  it("rejects unauthenticated access", async () => {
    const res = await request(app).get("/api/v1/products");
    expect(res.status).toBe(401);
  });

  it("allows ADMIN to create products", async () => {
    const res = await request(app)
      .post("/api/v1/products")
      .set("Cookie", adminCookie)
      .send(validProduct);
    expect(res.status).toBe(201);
    expect(res.body.data.sku).toBe("DAI-MILK-001");
  });

  it("allows MANAGER to create products", async () => {
    const res = await request(app)
      .post("/api/v1/products")
      .set("Cookie", managerCookie)
      .send({ ...validProduct, sku: "DAI-MILK-002" });
    expect(res.status).toBe(201);
  });

  it("forbids OPERATOR from creating products", async () => {
    const res = await request(app)
      .post("/api/v1/products")
      .set("Cookie", operatorCookie)
      .send(validProduct);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("forbids OPERATOR from deleting products", async () => {
    const created = await request(app)
      .post("/api/v1/products")
      .set("Cookie", adminCookie)
      .send(validProduct);
    const res = await request(app)
      .delete(`/api/v1/products/${created.body.data.id}`)
      .set("Cookie", operatorCookie);
    expect(res.status).toBe(403);
  });
});

describe("Product CRUD", () => {
  it("creates, fetches, updates and deactivates a product", async () => {
    const created = await request(app)
      .post("/api/v1/products")
      .set("Cookie", adminCookie)
      .send(validProduct);
    const id = created.body.data.id;

    const fetched = await request(app).get(`/api/v1/products/${id}`).set("Cookie", operatorCookie);
    expect(fetched.status).toBe(200);
    expect(fetched.body.data.name).toBe("Fresh Cow Milk 1L");

    const updated = await request(app)
      .patch(`/api/v1/products/${id}`)
      .set("Cookie", managerCookie)
      .send({ brand: "Amul Gold" });
    expect(updated.status).toBe(200);
    expect(updated.body.data.brand).toBe("Amul Gold");

    const deactivated = await request(app)
      .delete(`/api/v1/products/${id}`)
      .set("Cookie", adminCookie);
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.data.isActive).toBe(false);

    // Deactivated products remain queryable (historical integrity).
    const stillThere = await request(app).get(`/api/v1/products/${id}`).set("Cookie", adminCookie);
    expect(stillThere.status).toBe(200);
  });

  it("returns 404 for an unknown but well-formed product id", async () => {
    const res = await request(app)
      .get("/api/v1/products/00000000-0000-4000-8000-000000000000")
      .set("Cookie", adminCookie);
    expect(res.status).toBe(404);
  });

  it("returns 400 for a malformed product id", async () => {
    const res = await request(app).get("/api/v1/products/not-a-uuid").set("Cookie", adminCookie);
    expect(res.status).toBe(400);
  });

  it("rejects duplicate SKUs with 409 (case-insensitive)", async () => {
    await request(app).post("/api/v1/products").set("Cookie", adminCookie).send(validProduct);
    const res = await request(app)
      .post("/api/v1/products")
      .set("Cookie", adminCookie)
      .send({ ...validProduct, name: "Another Milk" });
    expect(res.status).toBe(409);
  });

  it("uppercases SKUs on create", async () => {
    const res = await request(app)
      .post("/api/v1/products")
      .set("Cookie", adminCookie)
      .send({ ...validProduct, sku: "dai-milk-100" });
    expect(res.body.data.sku).toBe("DAI-MILK-100");
  });

  it("returns 422 with field details for invalid payloads", async () => {
    const res = await request(app)
      .post("/api/v1/products")
      .set("Cookie", adminCookie)
      .send({ name: "", sku: "bad sku!", category: "Dairy", unit: "L" });
    expect(res.status).toBe(422);
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toContain("name");
    expect(fields).toContain("sku");
  });
});

describe("Product listing (pagination, filter, sort)", () => {
  // Seeding happens per-test because the file-level beforeEach clears products.
  async function seedListingProducts(): Promise<void> {
    const products = [
      { name: "Almonds 500g", sku: "PKG-ALM-001", category: "Packaged Food", unit: "pack" },
      { name: "Butter 200g", sku: "DAI-BTR-001", category: "Dairy", unit: "g" },
      { name: "Cheddar Block", sku: "DAI-CHD-001", category: "Dairy", unit: "kg" },
      { name: "Whole Wheat Bread", sku: "BAK-BRD-001", category: "Bakery", unit: "unit" },
    ];
    for (const p of products) {
      await prisma.product.create({ data: p });
    }
  }

  it("paginates with meta", async () => {
    await seedListingProducts();
    const res = await request(app)
      .get("/api/v1/products?page=1&pageSize=2&sortBy=sku")
      .set("Cookie", operatorCookie);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toEqual({ page: 1, pageSize: 2, total: 4, totalPages: 2 });
    // Sorted by sku ascending: BAK < DAI
    expect(res.body.data[0].sku).toBe("BAK-BRD-001");
    expect(res.body.data[1].sku).toBe("DAI-BTR-001");
  });

  it("filters by category", async () => {
    await seedListingProducts();
    const res = await request(app)
      .get("/api/v1/products?category=Dairy")
      .set("Cookie", operatorCookie);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(2);
  });

  it("searches by name and sku case-insensitively", async () => {
    await seedListingProducts();
    const res = await request(app)
      .get("/api/v1/products?search=cheddar")
      .set("Cookie", operatorCookie);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].sku).toBe("DAI-CHD-001");
  });

  it("rejects unknown sort fields with a validation error", async () => {
    const res = await request(app)
      .get("/api/v1/products?sortBy=passwordHash")
      .set("Cookie", operatorCookie);
    expect(res.status).toBe(422);
  });
});

describe("Audit logging on mutations", () => {
  it("records product.created and product.deactivated actions", async () => {
    const created = await request(app)
      .post("/api/v1/products")
      .set("Cookie", adminCookie)
      .send(validProduct);
    await request(app)
      .delete(`/api/v1/products/${created.body.data.id}`)
      .set("Cookie", adminCookie);

    const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: "asc" } });
    const actions = logs.map((l) => l.action);
    expect(actions).toContain("product.created");
    expect(actions).toContain("product.deactivated");
    expect(logs.every((l) => l.userId !== null)).toBe(true);
  });
});
