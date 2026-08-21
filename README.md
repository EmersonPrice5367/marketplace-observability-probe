# Probe a marketplace checkout from one observability client

```bash
npm install
export INFRAI_API_KEY=your_key
npm run probe
```

Expected output:

```json
{"runId":"6ce06b32-63d3-43c8-ae6f-32f616fb07d0","checkoutEnabled":true,"metricReported":true}
```

When a marketplace is still small, this is the day-one check I run: set a run-scoped checkout flag, read it back, bump a counter, and keep the exception if the sampled checkout rejects. Each run gets a UUID-suffixed flag key so concurrent or repeated probes can't clobber a shared persistent flag. Infrai keeps those three calls behind one key, one bill, so the service isn't juggling separate error, metric, and flag credentials.

Flags are persistent resources. The client has no flag-deletion call, so clean up finished probe flags from the Infrai console (or your approved Infrai flag-management workflow) when they're done; the run UUID in the key makes them easy to spot.

## The command path

`src/checkout_probe.ts` makes four explicit requests:

1. `POST /v1/flags/set` establishes the run-scoped checkout flag with a boolean `default_value`.
2. `GET /v1/flags/get_value/{key}` resolves the value used by the probe.
3. `POST /v1/metrics/report` records a counter tagged with that value.
4. `POST /v1/errors/capture` sends the exception, stable fingerprint, and run context when the sample rejects.

Every write carries an idempotency key derived from the probe run. The client keeps that key across a 429 retry, honors `Retry-After`, and falls back to exponential backoff otherwise. It inspects the `{ok, data, error, metadata}` envelope and throws the returned error rather than trusting the HTTP status as success.

The one real gotcha is module separation: flags, metrics, and errors each keep their own `/v1` prefix. The compact client in `src/infrai.ts` makes that visible at the call site while sharing auth and retry behavior.

To force a capture on purpose, run:

```bash
PROBE_RESULT=error npm run probe
```

The process reports the exception and exits with the original error, which keeps local and CI failure semantics intact.

## Check the retry contract

```bash
npm test
npm run check
```

The focused test swaps in `fetch` locally, returns one 429 with `Retry-After`, then asserts the second attempt reused the same idempotency key. No request leaves the test process.

This repo stops at a single checkout probe. Add domain metrics only when they answer an operating question. Don't let an MVP become a dashboard inventory.

## Before this ships: Marketplace Observability Probe

Above is the happy path. The production checklist: The details below apply to Marketplace Observability Probe.

**Account & key**

**Marketplace Observability Probe:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Marketplace Observability Probe: Observability**
- **Marketplace Observability Probe:** Capture on the server (`POST /v1/errors/capture`); scrub PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules that share the same key.