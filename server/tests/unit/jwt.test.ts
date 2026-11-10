import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import { signSessionToken, verifySessionToken } from "../../src/utils/jwt.js";

const payload = { sub: "user-1", email: "a@b.c", role: "ADMIN" as const };

describe("session token signing", () => {
  it("signs and verifies a payload round-trip", () => {
    const { token } = signSessionToken(payload);
    const decoded = verifySessionToken(token);
    expect(decoded.sub).toBe("user-1");
    expect(decoded.email).toBe("a@b.c");
    expect(decoded.role).toBe("ADMIN");
    // Expiry must be present.
    expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("rejects a token signed with a different secret", () => {
    const { token } = signSessionToken(payload);
    const forged = jwt.sign({ ...payload, sub: "user-2" }, "totally-different-secret-value");
    expect(() => verifySessionToken(forged)).toThrow(/invalid|signature/i);
    expect(() => verifySessionToken(`${token.slice(0, -3)}abc`)).toThrow();
  });

  it("rejects garbage tokens", () => {
    expect(() => verifySessionToken("not-a-token")).toThrow();
  });
});
