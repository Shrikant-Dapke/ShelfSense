import { describe, it, expect, vi, afterEach } from "vitest";
import { apiFetch, ApiClientError } from "./api-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  it("returns the response envelope on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: { id: "b1" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const res = await apiFetch<{ id: string }>("/products");
    expect(res.success).toBe(true);
    expect(res.data.id).toBe("b1");
  });

  it("maps a JSON error body into ApiClientError with code, message and details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Request is invalid",
              details: [{ field: "sku", message: "SKU is required" }],
            },
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const err = await apiFetch("/products").catch((e) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.status).toBe(400);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.message).toBe("Request is invalid");
    expect(err.details).toEqual([{ field: "sku", message: "SKU is required" }]);
  });

  it("falls back to an UNKNOWN error when the failure body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>Bad Gateway</html>", { status: 502 })),
    );

    const err = await apiFetch("/products").catch((e) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.status).toBe(502);
    expect(err.code).toBe("UNKNOWN");
    expect(err.message).toBe("Request failed with status 502");
  });

  it("sends a JSON body with the correct content type on mutations", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: {} }), { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/products", { method: "POST", body: { name: "Milk" } });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/products",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Milk" }),
      }),
    );
  });
});
