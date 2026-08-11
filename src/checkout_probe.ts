import { randomUUID } from "node:crypto";
import { infrai } from "./infrai.js";

async function runCheckoutProbe(): Promise<void> {
  const runId = randomUUID();
  const flagKey = `marketplace-checkout-probe-${runId}`;

  await infrai.flags.set(
    { key: flagKey, type: "bool", default_value: true, enabled: true },
    `checkout-probe:${runId}:flag`,
  );

  const flag = await infrai.flags.get_value(flagKey);
  await infrai.metrics.report(
    {
      type: "counter",
      name: "marketplace.checkout.probe",
      value: 1,
      tags: { enabled: String(flag.value) },
    },
    `checkout-probe:${runId}:metric`,
  );

  try {
    if (process.env.PROBE_RESULT === "error") {
      throw new Error("Checkout probe rejected the sample order");
    }
    console.log(JSON.stringify({ runId, checkoutEnabled: flag.value, metricReported: true }));
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    await infrai.errors.capture(
      {
        message: error.message,
        level: "error",
        fingerprint: ["marketplace", "checkout-probe"],
        exception: error.stack ?? error.message,
        context: { run_id: runId, flag_key: flagKey },
      },
      `checkout-probe:${runId}:error`,
    );
    throw error;
  }
}

await runCheckoutProbe();
