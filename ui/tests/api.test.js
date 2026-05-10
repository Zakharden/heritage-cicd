import { describe, expect, it, vi } from "vitest";

import { fetchHello, formatPayload } from "../src/api.js";

describe("formatPayload", () => {
  it("formats payload with indentation", () => {
    expect(formatPayload({ message: "ok" })).toBe('{\n  "message": "ok"\n}');
  });
});

describe("fetchHello", () => {
  it("returns parsed payload for successful response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ message: "Hello" }),
    });

    await expect(fetchHello(fetchMock)).resolves.toEqual({ message: "Hello" });
    expect(fetchMock).toHaveBeenCalledWith("/api/hello", {
      headers: {
        Accept: "application/json",
      },
    });
  });

  it("throws an HTTP error when response is not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    });

    await expect(fetchHello(fetchMock)).rejects.toThrow("HTTP 503");
  });
});
