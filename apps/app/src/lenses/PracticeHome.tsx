/**
 * CPA Practice home — the firm-level landing (APP_PRINCIPLES §3, card W1.4).
 * ONE ranked list of what needs the CPA across every client, plus a clients
 * section with per-client counts. Tapping a queue row (tap 1) switches the active
 * org to that client AND lands on the exact per-client tab that resolves it (the
 * client's books render with that surface open — tap 2 is the resolving action),
 * so every item is clearable in ≤2 taps.
 *
 * The queue is read-only. read_only engagements get NO mutate CTA — the row still
 * opens the client's books (to view), the resolving action is disabled there and
 * refused server-side (ARCHITECTURE §4.3). Ranking + access come from the RPCs,
 * never re-derived here.
 */
import { useMemo, useState } from "react";
import {
  ageLabel, useClientCounts, usePracticeQueue,
  type ClientCounts, type QueueItem,
} from "./practiceQueue";
import MonthEndClose from "./MonthEndClose";
import { COPY } from "../copy";

/** The firm landing has two modes, toggled in-page (no new top-level nav):
 *  the ranked cross-client work queue (W1.4), and the firm-level month-end close
 *  (RV2-C1). Both operate over the SAME firm client set. */
type Mode = "queue" | "close";

/** open(clientOrgId, surface) — switch to a client's books on a specific tab. */
export default function PracticeHome({
  firm, open,
}: {
  firm: { id: string; name: string };
  open: (clientOrgId: string, surface: QueueItem["surface"]) => void;
}) {
  const [mode, setMode] = useState<Mode>("queue");
  const queue = usePracticeQueue(firm.id);
  const counts = useClientCounts(firm.id);

  const loading = queue.isLoading || counts.isLoading;
  const error = queue.isError || counts.isError;

  const clients = counts.data ?? [];
  const items = queue.data ?? [];
  const active = useMemo(() => clients.filter((c) => c.total > 0), [clients]);
  const clear = useMemo(() => clients.filter((c) => c.total === 0), [clients]);

  return (
    <section className="lens practice">
      <header className="ledger-head">
        <p className="eyebrow lens-eyebrow">
          {mode === "close" ? COPY.monthEnd.eyebrow : COPY.practice.eyebrow}
        </p>
        <h1 className="page-title">
          {mode === "close" ? COPY.monthEnd.title : COPY.practice.title}
        </h1>
        {/* Mode toggle — nests month-end close under the firm home, no new nav. */}
        <div className="me-mode" role="tablist" aria-label={COPY.monthEnd.eyebrow}>
          <button
            type="button" role="tab" aria-selected={mode === "queue"}
            className={`me-mode-tab${mode === "queue" ? " is-active" : ""}`}
            onClick={() => setMode("queue")}
          >
            {COPY.monthEnd.modeQueue}
          </button>
          <button
            type="button" role="tab" aria-selected={mode === "close"}
            className={`me-mode-tab${mode === "close" ? " is-active" : ""}`}
            onClick={() => setMode("close")}
          >
            {COPY.monthEnd.modeClose}
          </button>
        </div>
      </header>

      {mode === "close" && <MonthEndClose firm={firm} open={open} />}

      {mode === "queue" && <>
      {error && <p className="error" role="alert">{COPY.practice.loadError}</p>}
      {loading && !error && <p className="muted">{COPY.practice.loading}</p>}

      {!loading && !error && clients.length === 0 && (
        <div className="ledger-empty">
          <h3>{COPY.practice.noClientsTitle}</h3>
          <p className="muted">{COPY.practice.noClientsBody}</p>
        </div>
      )}

      {!loading && !error && clients.length > 0 && (
        <>
          {/* ── The ranked cross-client queue ─────────────────────────────── */}
          {items.length === 0 ? (
            <div className="ledger-empty">
              <h3>{COPY.practice.allClearTitle}</h3>
              <p className="muted">{COPY.practice.allClearBody}</p>
            </div>
          ) : (
            <>
              <h2 className="section-h">{COPY.practice.queueHeading}</h2>
              <ul className="pq-list" aria-label={COPY.practice.queueAria}>
                {items.map((it) => (
                  <QueueRow key={`${it.kind}-${it.ref_id}`} item={it} onOpen={open} />
                ))}
              </ul>
            </>
          )}

          {/* ── Clients (with counts) — the switcher's list, in-page ───────── */}
          <h2 className="section-h pq-clients-h">{COPY.practice.clientsHeading}</h2>
          <ul className="pq-clients">
            {active.map((c) => (
              <ClientCard key={c.client_org_id} client={c} onOpen={open} />
            ))}
          </ul>

          {clear.length > 0 && (
            <details className="pq-archive">
              <summary>{COPY.practice.resolvedHeading(clear.length)}</summary>
              <ul className="pq-clients">
                {clear.map((c) => (
                  <ClientCard key={c.client_org_id} client={c} onOpen={open} clear />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      </>}
    </section>
  );
}

function QueueRow({
  item, onOpen,
}: {
  item: QueueItem;
  onOpen: (clientOrgId: string, surface: QueueItem["surface"]) => void;
}) {
  const canMutate = item.access === "full";
  const cta = canMutate ? COPY.practice.cta[item.kind] : COPY.practice.ctaReadonly;
  return (
    <li className="pq-row">
      <span className={`pq-dot k-${item.kind}`} aria-hidden="true" />
      <span className="pq-body">
        <span className="pq-client">{item.client_name}</span>
        <span className="pq-kind">{COPY.practice.kind[item.kind]}</span>
        {item.title && <span className="pq-title">{item.title}</span>}
      </span>
      <span className="pq-age">{ageLabel(item.occurred_at)}</span>
      <button
        type="button" className="ghost sm pq-cta"
        onClick={() => onOpen(item.client_org_id, item.surface)}
      >
        {cta}
      </button>
    </li>
  );
}

function ClientCard({
  client, onOpen, clear = false,
}: {
  client: ClientCounts;
  onOpen: (clientOrgId: string, surface: QueueItem["surface"]) => void;
  clear?: boolean;
}) {
  // Opening a client with no target item lands on their Journal (the CPA's
  // working surface, matching the lens default).
  return (
    <li>
      <button
        type="button" className="pq-client-card"
        aria-label={COPY.practice.openClientAria(client.client_name)}
        onClick={() => onOpen(client.client_org_id, "journal")}
      >
        <span className="pq-client-name">{client.client_name}</span>
        <span className={`pq-client-count${clear ? " clear" : ""}`}>
          {clear ? COPY.practice.allClearChip : COPY.practice.itemsCount(client.total)}
        </span>
      </button>
    </li>
  );
}
