/**
 * retry-on-fail.js — retry wrapper that feeds validation failures back to Claude.
 *
 * Pattern:
 *   1. Call the generator with no feedback.
 *   2. If it throws ValidationError, capture the reason and retry up to
 *      MAX_VALIDATION_RETRIES times, feeding the reason back so Claude can fix it.
 *   3. If it throws RateLimitError (429), back off exponentially and retry up
 *      to MAX_RATE_RETRIES times. No model feedback — rate limits are infra.
 *   4. If it throws any other transient error (network, 502), retry up to
 *      MAX_TRANSIENT_RETRIES times.
 *   5. When any budget is exhausted, surface the last error.
 *
 * The budgets are tracked separately so a flaky network doesn't burn the
 * validation budget, and vice-versa.
 *
 * The retry loop deliberately does NOT bypass validation on the last attempt —
 * we'd rather show an error than render an invalid message.
 */

const MAX_VALIDATION_RETRIES = 2;
const MAX_TRANSIENT_RETRIES  = 1;
const MAX_RATE_RETRIES       = 2;

// Base delay for 429 backoff. Doubles on each retry: 8s → 16s.
const RATE_LIMIT_BASE_MS = 8_000;

export class RateLimitError extends Error {
  constructor() {
    super("Rate limited (429)");
    this.name = "RateLimitError";
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryWithFeedback(generatorFn) {
  let lastError        = null;
  let validationAttempts = 0;
  let transientAttempts  = 0;
  let rateAttempts       = 0;

  // Total upper bound — sum of all budgets + initial attempt.
  const hardCap = 1 + MAX_VALIDATION_RETRIES + MAX_TRANSIENT_RETRIES + MAX_RATE_RETRIES;

  for (let i = 0; i < hardCap; i++) {
    try {
      const feedback =
        lastError && lastError.name === "ValidationError" ? lastError.message : null;
      return await generatorFn(feedback);
    } catch (err) {
      lastError = err;
      if (err.name === "ValidationError") {
        validationAttempts++;
        if (validationAttempts > MAX_VALIDATION_RETRIES) throw err;
      } else if (err.name === "RateLimitError") {
        rateAttempts++;
        if (rateAttempts > MAX_RATE_RETRIES) throw err;
        await sleep(RATE_LIMIT_BASE_MS * Math.pow(2, rateAttempts - 1));
      } else {
        transientAttempts++;
        if (transientAttempts > MAX_TRANSIENT_RETRIES) throw err;
      }
    }
  }

  throw lastError;
}

export const __test__ = {
  MAX_VALIDATION_RETRIES,
  MAX_TRANSIENT_RETRIES,
  MAX_RATE_RETRIES,
  RATE_LIMIT_BASE_MS,
  RateLimitError,
};
