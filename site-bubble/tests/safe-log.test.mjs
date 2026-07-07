import { test } from "node:test";
import assert from "node:assert/strict";

// Mirror of site-bubble/worker/src/worker.ts safeLog — a Supabase chat-log/
// lead write is incidental to the chat reply, not the point of the request
// (weekly audit 2026-07-06, #301, reliability P1). It must never surface as
// an uncaught 500 to a user who already got a good model reply.
async function safeLog(label, op) {
  try {
    await op;
  } catch (err) {
    return { logged: true, label, message: err instanceof Error ? err.message : String(err) };
  }
  return { logged: false };
}

test("a rejecting write is swallowed, not thrown", async () => {
  await assert.doesNotReject(() => safeLog("logChat(user)", Promise.reject(new Error("Supabase penny_site_chats insert failed (500): boom"))));
});

test("a rejecting write is reported for observability, not silently dropped", async () => {
  const result = await safeLog("logLead(email)", Promise.reject(new Error("Supabase penny_site_leads insert failed (503): unavailable")));
  assert.equal(result.logged, true);
  assert.equal(result.label, "logLead(email)");
  assert.match(result.message, /503/);
});

test("a successful write resolves normally with no error surfaced", async () => {
  const result = await safeLog("logChat(penny)", Promise.resolve());
  assert.deepEqual(result, { logged: false });
});
