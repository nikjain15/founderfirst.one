// Constant-time bearer-secret comparison for compose-server's shared-secret
// auth header. A plain `!==` string compare short-circuits on the first
// differing byte, leaking the secret's correct-prefix length through
// response timing. Hash both sides to a fixed-length digest first so
// `timingSafeEqual` never sees (or leaks) the candidate's raw length.
import { createHash, timingSafeEqual } from "node:crypto";

export function secretMatches(candidate, expected) {
  if (typeof candidate !== "string" || typeof expected !== "string" || !expected) return false;
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
