import { afterEach, describe, expect, it, vi } from "vitest";
import { askQuestion, lines, requestPlan } from "@/lib/client/api";
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

async function collectLines(...chunks: string[]) {
  const out: string[] = [];
  for await (const l of lines(
    (async function* () {
      yield* chunks;
    })(),
  ))
    out.push(l);
  return out;
}

describe("lines", () => {
  it("joins lines split across chunks", async () => {
    expect(await collectLines('{"a"', ":1}\n{", '"b":2}\n')).toEqual(['{"a":1}', '{"b":2}']);
  });

  it("skips blank lines and trims", async () => {
    expect(await collectLines("a\n\n  b  \n")).toEqual(["a", "b"]);
  });

  it("yields a last line that has no newline", async () => {
    expect(await collectLines("a\nb")).toEqual(["a", "b"]);
  });

  it("yields nothing for an empty stream", async () => {
    expect(await collectLines()).toEqual([]);
  });
});

describe("requestPlan", () => {
  const line = (kind: "draft" | "final", result = planResultFixture()) => `${JSON.stringify({ kind, result })}\n`;

  it("posts the profile as JSON and reports each event", async () => {
    const result = planResultFixture();
    fetchMock.mockResolvedValue(streamOf(line("draft"), line("final")));
    const profile = makeProfile();
    const controller = new AbortController();
    const onEvent = vi.fn();

    await requestPlan(profile, onEvent, controller.signal);

    expect(onEvent.mock.calls.map((c) => c[0].kind)).toEqual(["draft", "final"]);
    expect(onEvent.mock.calls[1][0].result).toEqual(JSON.parse(JSON.stringify(result)));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/plan");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ profile });
    expect(init.signal).toBe(controller.signal);
  });

  it("parses lines split across chunks, even mid-character", async () => {
    const text = line("draft") + line("final");
    const bytes = new TextEncoder().encode(text);
    const parts = [bytes.slice(0, 40), bytes.slice(40, 41), bytes.slice(41, 500), bytes.slice(500)];
    fetchMock.mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            for (const part of parts) controller.enqueue(part);
            controller.close();
          },
        }),
      ),
    );
    const onEvent = vi.fn();
    await requestPlan(makeProfile(), onEvent);
    expect(onEvent.mock.calls.map((c) => c[0].kind)).toEqual(["draft", "final"]);
  });

  it("reads a last line that has no trailing newline and skips blank lines", async () => {
    fetchMock.mockResolvedValue(streamOf("\n", line("draft"), "\n\n", line("final").trim()));
    const onEvent = vi.fn();
    await requestPlan(makeProfile(), onEvent);
    expect(onEvent).toHaveBeenCalledTimes(2);
  });

  it("accepts a single final event", async () => {
    fetchMock.mockResolvedValue(streamOf(line("final")));
    const onEvent = vi.fn();
    await requestPlan(makeProfile(), onEvent);
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it("throws when the stream ends without a final event, after reporting the draft", async () => {
    fetchMock.mockResolvedValue(streamOf(line("draft")));
    const onEvent = vi.fn();
    await expect(requestPlan(makeProfile(), onEvent)).rejects.toThrow("The plan was cut off. Please try again.");
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it("throws when the stream is empty", async () => {
    fetchMock.mockResolvedValue(streamOf());
    await expect(requestPlan(makeProfile(), vi.fn())).rejects.toThrow(/cut off/);
  });

  it("throws the error text from the response body", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: 'We could not find "Atlantis"' }, { status: 404 }));
    await expect(requestPlan(makeProfile(), vi.fn())).rejects.toThrow('We could not find "Atlantis"');
  });

  it("throws a generic message with the status when the body is not JSON", async () => {
    fetchMock.mockResolvedValue(new Response("<html>oops</html>", { status: 502 }));
    await expect(requestPlan(makeProfile(), vi.fn())).rejects.toThrow("Request failed (502)");
  });

  it("throws a generic message when the JSON has no error field", async () => {
    fetchMock.mockResolvedValue(Response.json({ nope: true }, { status: 500 }));
    await expect(requestPlan(makeProfile(), vi.fn())).rejects.toThrow("Request failed (500)");
  });

  it("passes network failures through", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(requestPlan(makeProfile(), vi.fn())).rejects.toThrow("Failed to fetch");
  });
});

describe("requestPlan with bad lines", () => {
  it("rejects a line that is valid JSON but not a plan event", async () => {
    fetchMock.mockResolvedValue(streamOf('{"hello":1}\n'));
    await expect(requestPlan(makeProfile(), () => {})).rejects.toThrow("The plan response was not understood.");
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
