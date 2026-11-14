import { describe, expect, it } from "vitest";
import { resolveInternalPath } from "./safe-redirect";

// The login page honors `?next=` only when it points at a safe internal app
// path. Everything else must fall back to the dashboard — including encoded
// and backslash-based smuggles that look internal to a naive startsWith("/").

describe("resolveInternalPath", () => {
  it("falls back when there is no next value", () => {
    expect(resolveInternalPath(null)).toBe("/dashboard");
    expect(resolveInternalPath(undefined)).toBe("/dashboard");
    expect(resolveInternalPath("")).toBe("/dashboard");
  });

  it("allows ordinary internal paths", () => {
    expect(resolveInternalPath("/products")).toBe("/products");
    expect(resolveInternalPath("/inventory")).toBe("/inventory");
  });

  it("allows internal paths with query strings", () => {
    expect(resolveInternalPath("/products?page=2")).toBe("/products?page=2");
  });

  it("rejects non-path values", () => {
    expect(resolveInternalPath("dashboard")).toBe("/dashboard");
    expect(resolveInternalPath("products")).toBe("/dashboard");
  });

  it("rejects absolute external URLs", () => {
    expect(resolveInternalPath("https://evil.com/phish")).toBe("/dashboard");
    expect(resolveInternalPath("http://evil.com")).toBe("/dashboard");
  });

  it("rejects protocol-relative URLs", () => {
    expect(resolveInternalPath("//evil.com")).toBe("/dashboard");
    expect(resolveInternalPath("//evil.com/phish")).toBe("/dashboard");
  });

  it("rejects backslash / mixed-separator variants", () => {
    expect(resolveInternalPath("\\\\evil.com")).toBe("/dashboard");
    expect(resolveInternalPath("/\\evil.com")).toBe("/dashboard");
  });

  it("rejects encoded protocol-relative smuggles", () => {
    expect(resolveInternalPath("%2F%2Fevil.com")).toBe("/dashboard");
    expect(resolveInternalPath("%2f%2fevil.com")).toBe("/dashboard");
  });

  it("rejects malformed encodings", () => {
    expect(resolveInternalPath("%zz")).toBe("/dashboard");
  });

  it("rejects control characters", () => {
    expect(resolveInternalPath("/products\r\nSet-Cookie: x")).toBe("/dashboard");
  });

  it("supports a custom fallback", () => {
    expect(resolveInternalPath("//evil.com", "/login")).toBe("/login");
  });

  it("decodes and returns valid encoded internal paths", () => {
    expect(resolveInternalPath("%2Fproducts")).toBe("/products");
  });
});
