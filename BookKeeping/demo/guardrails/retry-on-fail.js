/**
 * retry-on-fail.js — retry wrapper that feeds validation failures back to Claude.
 *
 * Pattern:
 *   1. Call the generator with no feedback.
 *   2. If it throws ValidationError, capture the reason.
 *   3. Retry, passing the reason so Claude can correct.
 *   4. After MAX_RETRIES, surface the last error.
 *
 * The retry loop deliberately does NOT bypass validation on the last attempt —
 * we'd rather show an error than render an invalid message.
 */

const MAX_RETRIES = 2;

export async function retryWithFeedback(generatorFn) {
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const feedback = lastError?.message;
      return await generatorFn(feedback);
    } catch (err) {
      lastError = err;
      if (err.name !== "ValidationError") {
        // Non-validation error (network, parse) — don't retry indefinitely.
        if (attempt >= 1) throw err;
      }
      // Otherwise loop to retry.
    }
  }

  throw lastError;
}
