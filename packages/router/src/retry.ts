export class RetryExhaustedError extends Error {
  constructor(
    public readonly attempts: number,
    public readonly lastError: unknown
  ) {
    super(`All ${attempts} retry attempts failed`);
  }
}

/** Exponential backoff retry. Throws RetryExhaustedError after maxAttempts. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 500
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** (attempt - 1)));
      }
    }
  }
  throw new RetryExhaustedError(maxAttempts, lastError);
}

type CircuitState = "closed" | "open" | "half-open";

/** Opens after `threshold` consecutive failures. Resets after `resetMs`. */
export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failures = 0;
  private openedAt = 0;

  constructor(
    private readonly threshold = 3,
    private readonly resetMs = 30_000
  ) {}

  get isOpen(): boolean {
    if (this.state === "open") {
      if (Date.now() - this.openedAt > this.resetMs) {
        this.state = "half-open";
        return false;
      }
      return true;
    }
    return false;
  }

  onSuccess(): void {
    this.failures = 0;
    this.state = "closed";
  }

  onFailure(): void {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.state = "open";
      this.openedAt = Date.now();
    }
  }
}
