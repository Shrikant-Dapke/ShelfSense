import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../../src/utils/password.js";

describe("password hashing", () => {
  it("hashes a password and verifies the correct password", async () => {
    const hash = await hashPassword("S3cure-Pass!");
    expect(hash).not.toContain("S3cure-Pass!");
    await expect(verifyPassword("S3cure-Pass!", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("S3cure-Pass!");
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("produces different hashes for the same password (salted)", async () => {
    const [a, b] = await Promise.all([hashPassword("same-password"), hashPassword("same-password")]);
    expect(a).not.toBe(b);
  });
});
