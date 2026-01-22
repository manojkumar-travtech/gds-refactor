export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retry<T>(
  fn: () => Promise<T>,
  options?: {
    retries?: number;
    delayMs?: number;
    shouldRetry?: (error: unknown) => boolean;
  },
): Promise<T> {
  const {
    retries = 3,
    delayMs = 1000,
    shouldRetry = () => true,
  } = options || {};

  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt >= retries || !shouldRetry(error)) {
        break;
      }

      await sleep(delayMs * attempt);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Retry failed with unknown error");
}
