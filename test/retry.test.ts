import assert from "node:assert/strict";
import test from "node:test";
import { request } from "../src/infrai.js";

test("retries a rate-limited write with the same idempotency key", async () => {
  process.env.INFRAI_API_KEY = "test-key";
  const seenKeys: string[] = [];
  let calls = 0;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (_input, init) => {
    calls += 1;
    const headers = new Headers(init?.headers);
    seenKeys.push(headers.get("Idempotency-Key") ?? "");
    if (calls === 1) {
      return new Response(JSON.stringify({ ok: false, error: { message: "retry" } }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": "0" },
      });
    }
    return new Response(JSON.stringify({ ok: true, data: { accepted: true }, metadata: {} }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await request<{ accepted: boolean }>(
      "POST",
      "/v1/metrics/report",
      { type: "counter", name: "marketplace.test", value: 1 },
      { idempotencyKey: "metric:test-run" },
    );
    assert.deepEqual(result, { accepted: true });
    assert.equal(calls, 2);
    assert.deepEqual(seenKeys, ["metric:test-run", "metric:test-run"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
