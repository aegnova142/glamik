// ==========================================
// OUTBOUND HTTP
//
// One place that owns how Glamirk talks to a third-party API: timeouts,
// retries, and the distinction between "this will never work" and "try again
// in a moment".
//
// Node's global fetch has no default timeout. Without one, a payment gateway
// that accepts a connection and then stalls holds a checkout request open
// until the client gives up — the customer sees a spinner forever and the
// server leaks a socket per attempt. Every call here is bounded.
// ==========================================

export interface HttpResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  /** Operator-facing detail. Never shown to a customer verbatim. */
  error?: string;
  /** True when the failure is worth retrying (timeout, network, 5xx, 429). */
  retryable?: boolean;
}

export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  /** Total attempts including the first. 1 disables retrying. */
  attempts?: number;
  /** Base delay for exponential backoff between attempts. */
  retryDelayMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 400;

/** 4xx means we sent something wrong — retrying sends the same wrong thing.
 * 429 and 5xx are the server's problem and may clear on their own. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 408 || (status >= 500 && status < 600);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Performs one JSON request with a bounded timeout and bounded retries.
 *
 * Never throws: a transport failure is returned as `{ ok: false }` with a
 * retryable flag, so callers handle one shape instead of mixing try/catch with
 * status checks. That matters most on the checkout path, where an unhandled
 * throw from a gateway call would surface as a generic 500 on an order the
 * customer may actually have paid for.
 */
export async function httpJson<T = any>(url: string, options: HttpRequestOptions = {}): Promise<HttpResult<T>> {
  const {
    method = 'GET',
    headers = {},
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    attempts = DEFAULT_ATTEMPTS,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  } = options;

  let lastError = 'Request failed';
  let lastStatus = 0;

  for (let attempt = 1; attempt <= Math.max(1, attempts); attempt++) {
    // A fresh controller per attempt — an aborted signal stays aborted, so
    // reusing one would make every retry fail instantly.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        // A string body is already encoded and is passed through untouched.
        // JSON.stringify would wrap it in quotes, which silently corrupts any
        // form-encoded payload — Delhivery's create.json takes
        // `format=json&data=<json>` as x-www-form-urlencoded, and a quoted
        // body means the provider never sees the `format` parameter at all.
        // Callers sending an object still get it serialised as JSON.
        body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      lastStatus = response.status;

      const raw = await response.text();
      let parsed: any = undefined;
      if (raw) {
        try {
          parsed = JSON.parse(raw);
        } catch {
          // A gateway returning an HTML error page is a real failure mode
          // (maintenance pages, WAF blocks). Treat it as an invalid response
          // rather than letting a JSON.parse throw escape.
          if (response.ok) {
            return { ok: false, status: response.status, error: 'Upstream returned a non-JSON response.', retryable: true };
          }
        }
      }

      if (response.ok) return { ok: true, status: response.status, data: parsed as T };

      // Prefer the provider's own message; most return { message } or { error: { description } }.
      const message =
        parsed?.error?.description || parsed?.message || parsed?.error || `Upstream responded ${response.status}`;
      const retryable = isRetryableStatus(response.status);
      if (!retryable || attempt === attempts) {
        return { ok: false, status: response.status, error: String(message), retryable, data: parsed as T };
      }
      lastError = String(message);
    } catch (err: any) {
      clearTimeout(timer);
      // AbortError is our own timeout firing; everything else here is DNS,
      // TLS or a dropped connection. All are worth another attempt.
      lastError = err?.name === 'AbortError' ? `Request timed out after ${timeoutMs}ms` : err?.message || 'Network error';
      if (attempt === attempts) {
        return { ok: false, status: 0, error: lastError, retryable: true };
      }
    }

    // Exponential backoff with jitter. Without jitter, several requests that
    // failed together retry together and hit the recovering service as one
    // synchronised burst.
    const delay = retryDelayMs * 2 ** (attempt - 1);
    await sleep(delay + Math.random() * retryDelayMs);
  }

  return { ok: false, status: lastStatus, error: lastError, retryable: true };
}
