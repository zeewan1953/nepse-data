/**
 * Retry utility with exponential backoff.
 * Use for all external I/O: HTTP requests, DB writes, file operations.
 */

export type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
  retryableStatuses?: number[];
  shouldRetry?: (error: unknown) => boolean;
};

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  attempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  timeoutMs: 10_000,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
  shouldRetry: () => true,
};

export async function retry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const options = { ...DEFAULT_OPTIONS, ...opts };
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.attempts; attempt++) {
    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${options.timeoutMs}ms`)), options.timeoutMs),
        ),
      ]);
      return result;
    } catch (err) {
      lastError = err;
      const isLast = attempt === options.attempts;

      const retryable = options.retryableStatuses.some((status) => {
        const msg = (err as Error)?.message ?? "";
        return msg.includes(`HTTP ${status}`);
      });

      if (!retryable || !options.shouldRetry(err)) {
        throw err;
      }

      if (isLast) break;

      const delay = Math.min(options.baseDelayMs * 2 ** (attempt - 1), options.maxDelayMs);
      const jitter = Math.random() * 0.3 * delay;
      await new Promise((r) => setTimeout(r, delay + jitter));
    }
  }

  throw lastError;
}

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const timeout = init?.timeoutMs ?? 10_000;
  const headers = init?.headers instanceof Headers
    ? init.headers
    : new Headers(init?.headers as Record<string, string> | undefined);

  return retry(
    async () => {
      const res = await fetch(input, { ...init, headers, signal: AbortSignal.timeout(timeout) });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      return res;
    },
    { timeoutMs: timeout + 5000 },
  );
}
