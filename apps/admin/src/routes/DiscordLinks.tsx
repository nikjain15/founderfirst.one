import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  listDiscordLinks,
  revokeDiscordLink,
  logAudit,
  type DiscordLinkRow,
} from "../lib/supabase";
import { IconAlert, IconCheck } from "../lib/icons";

interface DiscordLinksProps { embedded?: boolean }

export function DiscordLinks({ embedded = false }: DiscordLinksProps = {}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");      // live input text
  const [query, setQuery] = useState<string>(""); // committed search that drives the fetch
  const [status, setStatus] = useState<{ kind: "idle" | "ok" | "err"; msg?: string }>({ kind: "idle" });

  // Discord links — cached per committed search; refetches automatically on change.
  const { data: rows = [], isPending: loading, error } = useQuery({
    queryKey: ["discordLinks", query],
    queryFn: () => listDiscordLinks(query || undefined),
  });

  // Surface fetch failures through the same status banner the actions use.
  const fetchError = error ? (error as Error).message : null;

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setQuery(search);
  }

  const revoke = useMutation({
    mutationFn: async (row: DiscordLinkRow) => {
      const n = await revokeDiscordLink({
        discord_user_id: row.discord_user_id,
        email: row.discord_user_id ? null : row.email_normalized,
      });
      await logAudit("discord_link.revoke", "discord_link", row.id, {
        email: row.email_normalized,
        discord_user_id: row.discord_user_id,
      });
      return n;
    },
    onSuccess: (n) => {
      setStatus({ kind: "ok", msg: `Revoked ${n} link${n === 1 ? "" : "s"}.` });
      qc.invalidateQueries({ queryKey: ["discordLinks"] });
    },
    onError: (err) => {
      setStatus({ kind: "err", msg: (err as Error).message });
    },
  });

  function onRevoke(row: DiscordLinkRow) {
    const who = row.discord_username || row.discord_user_id || row.email_normalized;
    if (!confirm(`Disconnect ${who} from FounderFirst? The bot will lose access on the next message.`)) return;
    revoke.mutate(row);
  }

  const confirmedCount = rows.filter((r) => r.status === "confirmed").length;

  return (
    <div>
      {!embedded && (
        <>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Admin · channels</div>
          <h1 className="page-title">Connected Discord users.</h1>
          <p className="page-sub">
            Each row is a person who's linked their Discord to their FounderFirst email.
            Revoke to make the bot forget them on the next message.
          </p>
        </>
      )}

      <form onSubmit={onSearch} className="toolbar" style={{ gap: 8 }}>
        <div className="field" style={{ flex: "1 1 260px", margin: 0 }}>
          <label htmlFor="discord-search">Search email, username, or Discord id</label>
          <input
            id="discord-search"
            type="search"
            placeholder="riddhi@gmail.com"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="btn" type="submit">Search</button>
        {search && (
          <button type="button" className="btn btn-ghost" onClick={() => { setSearch(""); setQuery(""); }}>
            Clear
          </button>
        )}
      </form>

      {fetchError && (
        <div className="login-status err" style={{ marginTop: 12 }}>
          <IconAlert size={14} />
          {fetchError}
        </div>
      )}

      {status.msg && (
        <div className={`login-status ${status.kind === "err" ? "err" : "ok"}`} style={{ marginTop: 12 }}>
          {status.kind === "ok" ? <IconCheck size={14} /> : <IconAlert size={14} />}
          {status.msg}
        </div>
      )}

      <p className="page-sub" style={{ marginTop: 18, marginBottom: 8 }}>
        {loading ? "Loading…" : `${confirmedCount} active · ${rows.length} total`}
      </p>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Discord</th>
              <th>Status</th>
              <th>Started</th>
              <th>Confirmed</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6}>No Discord links yet.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id}>
                <td><span className="admin-email">{r.email_normalized || "—"}</span></td>
                <td>
                  {r.discord_username ?? <span className="muted">unknown</span>}
                  {r.discord_user_id && (
                    <div style={{ fontSize: 11, color: "var(--ink-muted, #6b6657)" }}>
                      id: {r.discord_user_id}
                    </div>
                  )}
                </td>
                <td>
                  <span className={`chip chip-${r.status}`}>{r.status}</span>
                  <div style={{ fontSize: 11, color: "var(--ink-muted, #6b6657)", marginTop: 2 }}>
                    from {r.initiated_from}
                  </div>
                </td>
                <td>{new Date(r.created_at).toLocaleDateString()}</td>
                <td>{r.confirmed_at ? new Date(r.confirmed_at).toLocaleDateString() : "—"}</td>
                <td className="row-actions">
                  {r.status === "confirmed" && (
                    <button type="button" className="link-danger" onClick={() => onRevoke(r)} disabled={revoke.isPending}>
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
