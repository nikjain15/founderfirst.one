/**
 * Topic vocabulary for support tickets.
 *
 * The DB column is free-form text so the bot can invent new topics if it
 * sees something new. The admin UI restricts to this list to keep things
 * consistent. Add a new entry here when a recurring theme starts appearing
 * as "other" too often.
 */

export const TOPICS = [
  "billing",
  "bug",
  "integration",
  "how-to",
  "feature-request",
  "account",
  "other",
] as const;

export type Topic = (typeof TOPICS)[number];

export function topicLabel(t: string | null | undefined): string {
  if (!t) return "untagged";
  return t;
}

export function isKnownTopic(t: string | null | undefined): t is Topic {
  return !!t && (TOPICS as readonly string[]).includes(t);
}
