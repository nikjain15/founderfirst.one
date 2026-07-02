/**
 * [LOOP-1] loop-heartbeat auth unit tests — the shared-bearer compare.
 *
 * Guards the write-path gate: the constant-time comparison must accept only the
 * exact token and reject the empty string, a prefix, a superset, and a wrong-length
 * value. (Timing is not asserted here — that requires statistics — but the
 * byte-for-byte correctness that constant-time compare must preserve is.)
 *
 *   deno test supabase/functions/loop-heartbeat/index.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { safeEqual } from "./index.ts";

Deno.test("safeEqual: exact match", () => {
  assertEquals(safeEqual("s3cr3t-token", "s3cr3t-token"), true);
});

Deno.test("safeEqual: rejects empty presented", () => {
  assertEquals(safeEqual("", "s3cr3t-token"), false);
});

Deno.test("safeEqual: rejects empty expected (no silent allow-all)", () => {
  assertEquals(safeEqual("s3cr3t-token", ""), false);
});

Deno.test("safeEqual: rejects a correct prefix (early-exit would pass)", () => {
  assertEquals(safeEqual("s3cr3t", "s3cr3t-token"), false);
});

Deno.test("safeEqual: rejects a superset of the token", () => {
  assertEquals(safeEqual("s3cr3t-token-extra", "s3cr3t-token"), false);
});

Deno.test("safeEqual: rejects a single-byte difference", () => {
  assertEquals(safeEqual("s3cr3t-tokeX", "s3cr3t-token"), false);
});

Deno.test("safeEqual: multibyte-safe (compares encoded bytes)", () => {
  assertEquals(safeEqual("tökén-π", "tökén-π"), true);
  assertEquals(safeEqual("tökén-π", "token-p"), false);
});
