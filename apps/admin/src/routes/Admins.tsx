import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listAdmins, inviteAdmin, removeAdmin, setAdminRole, type AdminRow, type AdminTier } from "../lib/supabase";
import { IconAlert, IconCheck } from "../lib/icons";

const TIER_LABEL: Record<AdminTier, string> = {
  viewer: "Viewer · read only",
  editor: "Editor · can make changes",
  super: "Super · full + manage admins",
};

interface Props {
  currentEmail: string;
}

export function Admins({ currentEmail }: Props) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AdminTier>("viewer");
  const [status, setStatus] = useState<{ kind: "idle" | "ok" | "err"; msg?: string }>({ kind: "idle" });

  const { data: rows = [], isPending: loading, error } = useQuery({
    queryKey: ["admins"],
    queryFn: listAdmins,
  });

  // Super status is data now (is_super flag), not a hardcoded email.
  const isSuper = rows.some(
    (r) => r.email.toLowerCase() === currentEmail.toLowerCase() && r.is_super,
  );

  // Audit rows for both writes are produced by the admins_audit DB trigger.
  const inviteMut = useMutation({
    mutationFn: (target: string) => inviteAdmin(target, inviteRole),
    onSuccess: (res, target) => {
      setEmail("");
      setStatus({
        kind: "ok",
        msg: res.emailed ? `Added ${target} as ${inviteRole} — welcome email sent.` : `Added ${target} as ${inviteRole}.`,
      });
      void qc.invalidateQueries({ queryKey: ["admins"] });
    },
    onError: (err) => setStatus({ kind: "err", msg: (err as Error).message }),
  });

  const removeMut = useMutation({
    mutationFn: (target: string) => removeAdmin(target),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admins"] }),
    onError: (err) => setStatus({ kind: "err", msg: (err as Error).message }),
  });

  const roleMut = useMutation({
    mutationFn: ({ email: t, role }: { email: string; role: AdminTier }) => setAdminRole(t, role),
    onSuccess: (_r, vars) => {
      setStatus({ kind: "ok", msg: `${vars.email} is now ${vars.role}.` });
      void qc.invalidateQueries({ queryKey: ["admins"] });
    },
    onError: (err) => setStatus({ kind: "err", msg: (err as Error).message }),
  });

  function onInvite(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    inviteMut.mutate(trimmed);
  }

  function onChangeRole(row: AdminRow, role: AdminTier) {
    if (role === row.role) return;
    if (role === "super" && !confirm(`Make ${row.email} a SUPER admin? They'll be able to manage all admins.`)) return;
    if (row.email.toLowerCase() === currentEmail.toLowerCase() && row.role === "super" && role !== "super") {
      if (!confirm("Demote yourself from super? You'll lose admin-management rights.")) return;
    }
    roleMut.mutate({ email: row.email, role });
  }

  function onRemove(row: AdminRow) {
    if (row.is_super) return;
    if (!confirm(`Remove ${row.email} from admins?`)) return;
    removeMut.mutate(row.email);
  }

  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 10 }}>Admin · access</div>
      <h1 className="page-title">Admins.</h1>
      <p className="page-sub">Who can sign in — and what they can do. Viewers see everything; editors can make changes; supers also manage this list.</p>

      {isSuper && (
        <form onSubmit={onInvite} className="toolbar admins-invite">
          <div className="field" style={{ flex: "1 1 240px", margin: 0 }}>
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
          <div className="field" style={{ flex: "0 1 220px", margin: 0 }}>
            <label htmlFor="invite-role">Access</label>
            <select
              id="invite-role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as AdminTier)}
            >
              <option value="viewer">{TIER_LABEL.viewer}</option>
              <option value="editor">{TIER_LABEL.editor}</option>
              <option value="super">{TIER_LABEL.super}</option>
            </select>
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

      {error ? (
        <div className="empty" style={{ color: "var(--error)", borderColor: "var(--error-bg)" }}>
          <IconAlert size={18} />
          <p className="empty-title" style={{ marginTop: 10 }}>Couldn't load admins.</p>
          {error.message}
        </div>
      ) : (
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Admins">
        <table className="data-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Access</th>
              <th>Added by</th>
              <th>Added</th>
              {isSuper && <th aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={isSuper ? 5 : 4}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={isSuper ? 5 : 4}>No admins yet.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.email}>
                <td><span className="admin-email">{r.email}</span></td>
                <td>
                  {isSuper ? (
                    <select
                      aria-label={`Access level for ${r.email}`}
                      value={r.role}
                      disabled={roleMut.isPending}
                      onChange={(e) => onChangeRole(r, e.target.value as AdminTier)}
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                      <option value="super">Super</option>
                    </select>
                  ) : (
                    <span className={`chip${r.role === "super" ? " chip-super" : ""}`}>{r.role}</span>
                  )}
                </td>
                <td>{r.added_by ?? "—"}</td>
                <td>{new Date(r.added_at).toLocaleDateString()}</td>
                {isSuper && (
                  <td className="row-actions">
                    {!r.is_super && (
                      <button type="button" className="link-danger" onClick={() => onRemove(r)}>
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
      )}
    </div>
  );
}
