/**
 * retry-on-fail.js — retry wrapper that feeds validation failures back to Claude.
 *
 * Pattern:
 *   1. Call the generator with no feedback.
 *   2. If it throws ValidationError, capture the reason and retry up to
 *      MAX_VALIDATION_RETRIES times, feeding the reason back so Claude can fix it.
 *   3. If it throws any other error (network, parse), retry up to
 *      MAX_TRANSIENT_RETRIES times. These don't get feedback — there's
 *      nothing for the model to correct from a 502.
 *   4. When either budget is exhausted, surface the last error.
 *
 * The two budgets are tracked separately. A flaky network shouldn't burn
 * the validation budget, and a stubborn validation failure shouldn't get
 * extra attempts because earlier ones happened to be transient.
 *
 * The retry loop deliberately does NOT bypass validation on the last attempt —
 * we'd rather show an error than render an invalid message.
 */

const MAX_VALIDATION_RETRIES = 2;
const MAX_TRANSIENT_RETRIES = 1;

export async function retryWithFeedback(generatorFn) {
  let lastError = null;
  let validationAttempts = 0;
  let transientAttempts = 0;

  // Total upper bound is the sum of the two budgets plus the initial attempt.
  const hardCap = 1 + MAX_VALIDATION_RETRIES + MAX_TRANSIENT_RETRIES;

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
      } else {
        transientAttempts++;
        if (transientAttempts > MAX_TRANSIENT_RETRIES) throw err;
      }
    }
  }

  throw lastError;
}

export const __test__ = { MAX_VALIDATION_RETRIES, MAX_TRANSIENT_RETRIES };
