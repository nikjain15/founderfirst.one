import { useEffect, useState, type FormEvent } from "react";
import { listAdmins, inviteAdmin, removeAdmin, logAudit, type AdminRow } from "../lib/supabase";
import { SUPER_ADMIN_EMAIL } from "../lib/env";
import { IconAlert, IconCheck } from "../lib/icons";

interface Props {
  currentEmail: string;
}

export function Admins({ currentEmail }: Props) {
  const isSuper = currentEmail.toLowerCase() === SUPER_ADMIN_EMAIL;
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<{ kind: "idle" | "ok" | "err"; msg?: string }>({ kind: "idle" });

  async function refresh() {
    setLoading(true);
    try {
      setRows(await listAdmins());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    try {
      await inviteAdmin(trimmed);
      await logAudit("admin.invite", "admin", trimmed, {});
      setEmail("");
      setStatus({ kind: "ok", msg: `Added ${trimmed}.` });
      await refresh();
    } catch (err) {
      setStatus({ kind: "err", msg: (err as Error).message });
    }
  }

  async function onRemove(target: string) {
    if (target === SUPER_ADMIN_EMAIL) return;
    if (!confirm(`Remove ${target} from admins?`)) return;
    try {
      await removeAdmin(target);
      await logAudit("admin.remove", "admin", target, {});
      await refresh();
    } catch (err) {
      setStatus({ kind: "err", msg: (err as Error).message });
    }
  }

  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 10 }}>Admin · access</div>
      <h1 className="page-title">Admins.</h1>
      <p className="page-sub">Who can sign in to this admin app.</p>

      {isSuper && (
        <form onSubmit={onInvite} className="toolbar admins-invite">
          <div className="field" style={{ flex: "1 1 260px", margin: 0 }}>
            <label htmlFor="invite-email">Invite new admin</label>
            <input
              id="invite-email"
              type="email"
              placeholder="newadmin@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <button className="btn" type="submit">Invite admin →</button>
        </form>
      )}

      {status.msg && (
        <div className={`login-status ${status.kind === "err" ? "err" : "ok"}`} style={{ marginTop: 12 }}>
          {status.kind === "ok" ? <IconCheck size={14} /> : <IconAlert size={14} />}
          {status.msg}
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Added by</th>
              <th>Added</th>
              {isSuper && <th aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={isSuper ? 4 : 3}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={isSuper ? 4 : 3}>No admins yet.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.email}>
                <td>
                  <span className="admin-email">{r.email}</span>
                  {r.email === SUPER_ADMIN_EMAIL && <span className="chip chip-super">super</span>}
                </td>
                <td>{r.added_by ?? "—"}</td>
                <td>{new Date(r.added_at).toLocaleDateString()}</td>
                {isSuper && (
                  <td className="row-actions">
                    {r.email !== SUPER_ADMIN_EMAIL && (
                      <button type="button" className="link-danger" onClick={() => onRemove(r.email)}>
                        Remove
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
