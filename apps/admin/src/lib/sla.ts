/**
 * SLA buckets for support tickets.
 *
 * MVP: bucket by age of the ticket itself. For `open` tickets the user has
 * been waiting since `created_at`. For `in_progress` we use `updated_at` as
 * a proxy for last activity. Resolved/closed tickets are not part of SLA.
 *
 * Buckets:
 *   fresh   < 4h
 *   aging   4h – 24h
 *   stale   > 24h
 *
 * Thresholds intentionally tight for a small founder-led queue. Loosen later
 * once volume justifies it.
 */

export type SlaBucket = "fresh" | "aging" | "stale" | "na";

const HOUR = 60 * 60 * 1000;
export const SLA_AGING_MS = 4 * HOUR;
export const SLA_STALE_MS = 24 * HOUR;

export function ageMs(iso: string, now: number = Date.now()): number {
  return Math.max(0, now - new Date(iso).getTime());
}

export function slaBucket(iso: string, now: number = Date.now()): Exclude<SlaBucket, "na"> {
  const age = ageMs(iso, now);
  if (age >= SLA_STALE_MS) return "stale";
  if (age >= SLA_AGING_MS) return "aging";
  return "fresh";
}

export function slaForTicket(
  ticket: { status: string; created_at: string; updated_at: string },
  now: number = Date.now(),
): SlaBucket {
  if (ticket.status === "resolved" || ticket.status === "closed") return "na";
  // For open tickets the SLA clock runs from creation (user waiting on first
  // response). For in_progress, use updated_at as the freshness signal.
  const ref = ticket.status === "open" ? ticket.created_at : ticket.updated_at;
  return slaBucket(ref, now);
}

/** Sort: stale → aging → fresh → na. Stable within bucket (preserves caller order). */
export function bySlaUrgency<T extends { status: string; created_at: string; updated_at: string }>(
  tickets: T[],
  now: number = Date.now(),
): T[] {
  const rank: Record<SlaBucket, number> = { stale: 0, aging: 1, fresh: 2, na: 3 };
  return [...tickets]
    .map((t, i) => ({ t, i, b: slaForTicket(t, now) }))
    .sort((a, b) => (rank[a.b] - rank[b.b]) || (a.i - b.i))
    .map((x) => x.t);
}

export function slaLabel(b: SlaBucket): string {
  if (b === "stale") return "overdue";
  if (b === "aging") return "aging";
  if (b === "fresh") return "fresh";
  return "—";
}
