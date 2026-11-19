import { beforeEach, describe, expect, it, vi } from "vitest";
import { AirDataError, getJson } from "@/lib/air/fetch-json";

const url = new URL("https://example.test/data");

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("getJson", () => {
  it("returns the parsed body of a good response", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ ok: 1 }));
    await expect(getJson(url, fetcher)).resolves.toEqual({ ok: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("passes an abort signal so a slow server cannot hang the request", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({}));
    await getJson(url, fetcher);
    expect(fetcher.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("retries once after a dropped connection", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("socket hang up"))
      .mockResolvedValueOnce(Response.json({ ok: 1 }));
    await expect(getJson(url, fetcher)).resolves.toEqual({ ok: 1 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("retries once after a 5xx, then reports the status", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({}, { status: 503 }));
    const error = await getJson(url, fetcher).catch((e) => e);
    expect(error).toBeInstanceOf(AirDataError);
    expect(error).toMatchObject({ kind: "upstream", message: "Air quality service returned 503" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 4xx", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({}, { status: 429 }));
    await expect(getJson(url, fetcher)).rejects.toMatchObject({ kind: "upstream" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("fails with a clear message after two dropped connections", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("socket hang up"));
    await expect(getJson(url, fetcher)).rejects.toMatchObject({
      kind: "upstream",
      message: "Air quality service did not respond",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("AirDataError", () => {
  it("carries its kind and name", () => {
    const error = new AirDataError("nope", "not_found");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("AirDataError");
    expect(error.kind).toBe("not_found");
  });
});
