/**
 * Authed shell + org-switcher. The org list comes from the RLS-scoped client, so
 * a user sees ONLY orgs they can access (Phase 0 isolation, exercised end-to-end).
 * Role-scoped lens routing (owner vs cpa vs admin) is the next Phase 1 sub-step;
 * for now the shell shows the active org and a placeholder workspace.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getClient } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import { SITE } from "@ff/site";

interface Org {
  id: string;
  name: string;
  type: "business" | "firm";
}

const ACTIVE_ORG_KEY = "ff.activeOrg";

export default function Home() {
  const { session, signOut } = useAuth();

  const orgsQuery = useQuery({
    queryKey: ["orgs"],
    queryFn: async (): Promise<Org[]> => {
      const { data, error } = await getClient()
        .from("organizations")
        .select("id,name,type")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Org[];
    },
  });

  const orgs = orgsQuery.data ?? [];
  const [activeOrgId, setActiveOrgId] = useState<string>(
    () => localStorage.getItem(ACTIVE_ORG_KEY) ?? "",
  );

  // Default the active org to the first available once loaded.
  useEffect(() => {
    if (!activeOrgId && orgs.length > 0) setActiveOrgId(orgs[0].id);
  }, [orgs, activeOrgId]);

  useEffect(() => {
    if (activeOrgId) localStorage.setItem(ACTIVE_ORG_KEY, activeOrgId);
  }, [activeOrgId]);

  const activeOrg = orgs.find((o) => o.id === activeOrgId) ?? null;

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">{SITE.company}</span>
        {orgs.length > 0 && (
          <select
            className="org-switcher"
            value={activeOrgId}
            onChange={(e) => setActiveOrgId(e.target.value)}
            aria-label="Active organization"
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} · {o.type}
              </option>
            ))}
          </select>
        )}
        <span className="spacer" />
        <span className="muted">{session?.user.email}</span>
        <button className="ghost" onClick={() => void signOut()}>
          Sign out
        </button>
      </header>

      <main className="workspace">
        {orgsQuery.isLoading && <p className="muted">Loading your workspaces…</p>}
        {orgsQuery.isError && (
          <p className="error">Couldn't load organizations.</p>
        )}
        {!orgsQuery.isLoading && orgs.length === 0 && (
          <div className="empty">
            <h1>Welcome.</h1>
            <p className="muted">
              You don't have any organizations yet. (Create-business / accept-invite
              flows land in the next Phase 1 step.)
            </p>
          </div>
        )}
        {activeOrg && (
          <div className="empty">
            <h1>{activeOrg.name}</h1>
            <p className="muted">
              {activeOrg.type === "firm" ? "CPA practice" : "Business"} workspace —
              role-scoped lens coming next.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
