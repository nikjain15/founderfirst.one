import { describe, it, expect } from "vitest";
import { slog, timed, withObservability, type StructuredEvent } from "../src/observability.ts";

function capture() {
  const lines: string[] = [];
  const sink = (l: string) => lines.push(l);
  const events = (): StructuredEvent[] => lines.map((l) => JSON.parse(l));
  return { sink, events };
}

describe("observability helper (additive, structured JSON)", () => {
  it("slog emits one parseable JSON line with the required fields", () => {
    const { sink, events } = capture();
    slog("plaid-sync", "cursor.advanced", "info", { org: "o1", pages: 3 }, sink);
    const [e] = events();
    expect(e.fn).toBe("plaid-sync");
    expect(e.event).toBe("cursor.advanced");
    expect(e.level).toBe("info");
    expect(e.org).toBe("o1");
    expect(e.pages).toBe(3);
    expect(typeof e.ts).toBe("string");
  });

  it("timed emits an .ok event with duration and returns the value", async () => {
    const { sink, events } = capture();
    const r = await timed("ledger-entries", "post", async () => 42, { org: "o1" }, sink);
    expect(r).toBe(42);
    const [e] = events();
    expect(e.event).toBe("post.ok");
    expect(e.ok).toBe(true);
    expect(typeof e.duration_ms).toBe("number");
  });

  it("timed emits an .err event and re-throws (control flow unchanged)", async () => {
    const { sink, events } = capture();
    await expect(
      timed("ledger-entries", "post", async () => {
        throw new Error("boom");
      }, {}, sink),
    ).rejects.toThrow("boom");
    const [e] = events();
    expect(e.event).toBe("post.err");
    expect(e.level).toBe("error");
    expect(e.ok).toBe(false);
  });

  it("withObservability wraps a handler and logs start + end with status", async () => {
    const { sink, events } = capture();
    const handler = withObservability<{ n: number }, { status: number; body: number }>(
      "demo-fn",
      async (req) => ({ status: 200, body: req.n * 2 }),
      (r) => r.status,
      sink,
    );
    const res = await handler({ n: 21 });
    expect(res.body).toBe(42);
    const evs = events();
    expect(evs.map((e) => e.event)).toEqual(["request.start", "request.end"]);
    expect(evs[1].status).toBe(200);
  });

  it("withObservability logs a 5xx end as error level", async () => {
    const { sink, events } = capture();
    const handler = withObservability<unknown, { status: number }>(
      "demo-fn",
      async () => ({ status: 502 }),
      (r) => r.status,
      sink,
    );
    await handler({});
    const end = events()[1];
    expect(end.status).toBe(502);
    expect(end.level).toBe("error");
  });
});
