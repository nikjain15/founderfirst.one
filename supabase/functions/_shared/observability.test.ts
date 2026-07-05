// CI-safe unit test for the additive observability helper (RV2-E).
// Pure, network-free — captures emitted lines via an injected sink.
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { slog, timed } from "./observability.ts";

function capture() {
  const lines: string[] = [];
  return { sink: (l: string) => lines.push(l), lines };
}

Deno.test("slog emits one JSON line with fn/event/level and fields", () => {
  const { sink, lines } = capture();
  slog("plaid-sync", "cursor.advanced", "info", { org: "o1", pages: 3 }, sink);
  assertEquals(lines.length, 1);
  const e = JSON.parse(lines[0]);
  assertEquals(e.fn, "plaid-sync");
  assertEquals(e.event, "cursor.advanced");
  assertEquals(e.level, "info");
  assertEquals(e.pages, 3);
});

Deno.test("timed emits .ok and returns the value", async () => {
  const { sink, lines } = capture();
  const r = await timed("ledger-entries", "post", async () => 7, { org: "o1" }, sink);
  assertEquals(r, 7);
  const e = JSON.parse(lines[0]);
  assertEquals(e.event, "post.ok");
  assertEquals(e.ok, true);
});

Deno.test("timed emits .err and re-throws", async () => {
  const { sink, lines } = capture();
  let threw = false;
  try {
    await timed("ledger-entries", "post", async () => {
      throw new Error("boom");
    }, {}, sink);
  } catch (_e) {
    threw = true;
  }
  assertEquals(threw, true);
  const e = JSON.parse(lines[0]);
  assertEquals(e.event, "post.err");
  assertEquals(e.level, "error");
  assertStringIncludes(e.error, "boom");
});
