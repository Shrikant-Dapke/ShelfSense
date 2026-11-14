import { describe, it, expect } from "vitest";
import { fieldErrors, apiErrorMessage, hasFieldErrors } from "./form-feedback";
import { ApiClientError } from "@/lib/api-client";

describe("form-feedback", () => {
  it("maps ApiClientError.details into a per-field record", () => {
    const err = new ApiClientError(400, {
      code: "VALIDATION_ERROR",
      message: "Validation failed",
      details: [
        { field: "name", message: "Name is required" },
        { field: "sku", message: "SKU must be unique" },
      ],
    });

    expect(fieldErrors(err)).toEqual({
      name: "Name is required",
      sku: "SKU must be unique",
    });
    expect(hasFieldErrors(err)).toBe(true);
  });

  it("returns an empty record for errors without field details", () => {
    const err = new ApiClientError(409, { code: "CONFLICT", message: "SKU already exists" });

    expect(fieldErrors(err)).toEqual({});
    expect(hasFieldErrors(err)).toBe(false);
  });

  it("returns an empty record for non-API errors", () => {
    expect(fieldErrors(new Error("boom"))).toEqual({});
    expect(fieldErrors(undefined)).toEqual({});
  });

  it("picks the best headline message with a fallback", () => {
    expect(apiErrorMessage(new ApiClientError(409, { code: "CONFLICT", message: "SKU taken" }), "fallback")).toBe("SKU taken");
    expect(apiErrorMessage(new Error("boom"), "fallback")).toBe("boom");
    expect(apiErrorMessage(null, "fallback")).toBe("fallback");
  });
});
