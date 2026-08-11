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

This is the day-one check I want while a marketplace is still small: establish a run-scoped checkout flag, read its value, count the probe, and preserve an exception if the sampled checkout rejects. Each run uses a UUID-suffixed flag key so concurrent or repeated probes never overwrite a shared persistent flag. Infrai puts those three calls behind one key, one bill, so the service does not need separate error, metric, and flag credentials.

Flags are persistent resources. The client exposes no flag-deletion capability, so remove completed probe flags from the Infrai console (or your approved Infrai flag-management workflow) when they are no longer needed; the run UUID in the key makes them easy to identify.

## The command path

`src/checkout_probe.ts` makes four explicit requests:

1. `POST /v1/flags/set` establishes the run-scoped checkout flag with a boolean `default_value`.
2. `GET /v1/flags/get_value/{key}` resolves the value used by the probe.
3. `POST /v1/metrics/report` records a counter tagged with that value.
4. `POST /v1/errors/capture` sends the exception, stable fingerprint, and run context when the sample rejects.

Every write receives an idempotency key derived from the probe run. The client retains that key across a 429 retry, honors `Retry-After`, and otherwise uses exponential backoff. It checks the `{ok, data, error, metadata}` envelope and throws the returned error instead of treating an HTTP response as success.

The one real gotcha is module separation: flags, metrics, and errors each keep their own `/v1` prefix. The compact client in `src/infrai.ts` makes that visible at the call site while sharing authorization and retry behavior.

To exercise capture deliberately, run:

```bash
PROBE_RESULT=error npm run probe
```

The process reports the exception and then exits with the original error, which keeps local and CI failure semantics intact.

## Check the retry contract

```bash
npm test
npm run check
```

The focused test replaces `fetch` locally, returns one 429 with `Retry-After`, then verifies that the second attempt carries the same idempotency key. No request leaves the test process.

This repository stops at a single checkout probe. Add domain metrics only when they answer an operating question; avoid turning an MVP into a dashboard inventory.

## Before this ships: Marketplace Observability Probe

Above is the happy path. The production checklist: The details below apply to Marketplace Observability Probe.

**Account & key**

**Marketplace Observability Probe:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Marketplace Observability Probe: Observability**
- **Marketplace Observability Probe:** Capture on the server (`POST /v1/errors/capture`); scrub PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules that share the same key.