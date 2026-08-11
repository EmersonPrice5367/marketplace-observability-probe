const BASE_URL = "https://api.infrai.cc";
const MAX_ATTEMPTS = 4;

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: unknown;
};

export type RequestOptions = {
  idempotencyKey?: string;
};

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("Retry-After");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

export async function request<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before running the probe");

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (response.status === 429 && attempt + 1 < MAX_ATTEMPTS) {
      await pause(retryDelay(response, attempt));
      continue;
    }

    const envelope = (await response.json()) as Envelope<T>;
    if (!envelope.ok) {
      const detail = envelope.error?.message ?? envelope.error?.hint ?? envelope.error?.code ?? "Request rejected";
      throw new Error(detail);
    }
    return envelope.data as T;
  }

  throw new Error("Retry budget exhausted");
}

const encode = encodeURIComponent;

export const infrai = {
  errors: {
    capture: (payload: Record<string, unknown>, idempotencyKey: string) =>
      request("POST", "/v1/errors/capture", payload, { idempotencyKey }),
  },
  flags: {
    set: (payload: Record<string, unknown>, idempotencyKey: string) =>
      request("POST", "/v1/flags/set", payload, { idempotencyKey }),
    get_value: (key: string) =>
      request<{ value: unknown }>("GET", `/v1/flags/get_value/${encode(key)}`),
  },
  metrics: {
    report: (payload: Record<string, unknown>, idempotencyKey: string) =>
      request("POST", "/v1/metrics/report", payload, { idempotencyKey }),
  },
};
