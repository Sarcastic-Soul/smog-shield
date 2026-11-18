import { afterEach, describe, expect, it, vi } from "vitest";
import { askQuestion, requestPlan } from "@/lib/client/api";
import { planResultFixture } from "../../fixtures/results";
import { makeProfile } from "../../fixtures/profiles";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

afterEach(() => fetchMock.mockReset());

const streamOf = (...parts: string[]) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        for (const part of parts) controller.enqueue(encoder.encode(part));
        controller.close();
      },
    }),
    { headers: { "content-type": "text/plain" } },
  );

describe("requestPlan", () => {
  it("posts the profile as JSON and returns the parsed result", async () => {
    const result = planResultFixture();
    fetchMock.mockResolvedValue(Response.json(result));
    const profile = makeProfile();
    const controller = new AbortController();

    await expect(requestPlan(profile, controller.signal)).resolves.toEqual(JSON.parse(JSON.stringify(result)));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/plan");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ profile });
    expect(init.signal).toBe(controller.signal);
  });

  it("throws the error text from the response body", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: 'We could not find "Atlantis"' }, { status: 404 }));
    await expect(requestPlan(makeProfile())).rejects.toThrow('We could not find "Atlantis"');
  });

  it("throws a generic message with the status when the body is not JSON", async () => {
    fetchMock.mockResolvedValue(new Response("<html>oops</html>", { status: 502 }));
    await expect(requestPlan(makeProfile())).rejects.toThrow("Request failed (502)");
  });

  it("throws a generic message when the JSON has no error field", async () => {
    fetchMock.mockResolvedValue(Response.json({ nope: true }, { status: 500 }));
    await expect(requestPlan(makeProfile())).rejects.toThrow("Request failed (500)");
  });

  it("passes network failures through", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(requestPlan(makeProfile())).rejects.toThrow("Failed to fetch");
  });
});

describe("askQuestion", () => {
  it("posts the profile and question", async () => {
    fetchMock.mockResolvedValue(streamOf("ok"));
    const profile = makeProfile();
    await askQuestion(profile, "Is it safe?", () => {});
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/ask");
    expect(JSON.parse(init.body)).toEqual({ profile, question: "Is it safe?" });
  });

  it("calls onText with the full text so far after each chunk", async () => {
    fetchMock.mockResolvedValue(streamOf("Keep ", "them ", "inside."));
    const seen: string[] = [];
    await askQuestion(makeProfile(), "q?", (text) => seen.push(text));
    expect(seen).toEqual(["Keep ", "Keep them ", "Keep them inside."]);
  });

  it("decodes a multi-byte character split across chunks", async () => {
    const bytes = new TextEncoder().encode("हवा");
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes.slice(0, 4));
          controller.enqueue(bytes.slice(4));
          controller.close();
        },
      }),
    );
    fetchMock.mockResolvedValue(response);
    let last = "";
    await askQuestion(makeProfile(), "q?", (text) => (last = text));
    expect(last).toBe("हवा");
  });

  it("throws the server's message on an error status", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "The assistant is offline right now." }, { status: 503 }));
    await expect(askQuestion(makeProfile(), "q?", () => {})).rejects.toThrow("The assistant is offline right now.");
  });

  it("throws a generic message when the error body is not JSON", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));
    await expect(askQuestion(makeProfile(), "q?", () => {})).rejects.toThrow("Request failed (500)");
  });

  it("throws when the response has no body", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    await expect(askQuestion(makeProfile(), "q?", () => {})).rejects.toThrow("Request failed (200)");
  });
});
