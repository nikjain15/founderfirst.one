import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { SITE as SITE_CONFIG } from "../lib/site";

/**
 * Referral share — a React island on /confirmed. Reads the signup's ?slug= from
 * the URL, builds a personal referral link (founderfirst.one/?ref=<slug>), and
 * offers copy / X / LinkedIn / email share, plus a live "you've referred N"
 * count from the public referral_count RPC. Degrades gracefully with no slug
 * (generic invite) or no env (preview).
 */
const URL = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const ANON = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;
const SITE = SITE_CONFIG.url;
const SHARE_MSG =
  "I just joined the FounderFirst waitlist — Penny is an autonomous AI bookkeeper that does your books for you. Grab your spot:";

export default function ReferralShare() {
  const [slug, setSlug] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("slug");
    setSlug(s);
    if (s && URL && ANON) {
      const db = createClient(URL, ANON);
      db.rpc("referral_count", { p_slug: s })
        .then(({ data }) => { if (typeof data === "number") setCount(data); })
        .catch(() => { /* non-blocking */ });
    }
  }, []);

  const link = slug ? `${SITE}/?ref=${encodeURIComponent(slug)}` : SITE;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked — buttons below still work */ }
  }

  const xHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(SHARE_MSG)}&url=${encodeURIComponent(link)}`;
  const liHref = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`;
  const mailHref = `mailto:?subject=${encodeURIComponent("You should check out FounderFirst")}&body=${encodeURIComponent(`${SHARE_MSG} ${link}`)}`;

  return (
    <div className="ref">
      <p className="ref-lede">
        Each founder you refer adds a free month — up to 12 total.
        {count !== null && count > 0 && (
          <> You've referred <strong>{count}</strong> so far.</>
        )}
      </p>

      <div className="ref-link">
        <input type="text" readOnly value={link} aria-label="Your referral link" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" onClick={copy}>{copied ? "Copied ✓" : "Copy link"}</button>
      </div>

      <div className="ref-share">
        <a className="ref-btn" href={xHref} target="_blank" rel="noopener noreferrer">Share on X</a>
        <a className="ref-btn" href={liHref} target="_blank" rel="noopener noreferrer">LinkedIn</a>
        <a className="ref-btn" href={mailHref}>Email</a>
      </div>
    </div>
  );
}
