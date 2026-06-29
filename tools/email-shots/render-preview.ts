// Local email-preview renderer — builds the REAL digest HTML from the function's
// own builders (no DB, no send) so we can eyeball the rendered email before
// deploying. Run with SITE_URL="" so cover <img> src is /email/whatsnew/*.png
// (resolves against a locally-served dist/).
//
//   SITE_URL= deno run --allow-read --allow-write --allow-env --allow-net \
//     tools/email-shots/render-preview.ts
//
// Writes dist/email-preview.html.
import { BRAND, emailShell } from "../../supabase/functions/_shared/email.ts";
import { digestBody, digestVars, type Entry } from "../../supabase/functions/changelog-digest/index.ts";

const E = (kind: string, area: string, title: string, body: string): Entry => ({
  id: crypto.randomUUID(), kind, area, title, body,
  created_at: new Date().toISOString(), created_by: null,
});

const entries: Entry[] = [
  E("new", "site", "The new homepage is live", "Fresh green brand, a real footer, and our first proper Privacy and Terms pages."),
  E("improved", "site", "Penny now lives on the homepage", "No detour to a demo page. Land, tap Try Penny, start talking — owner or CPA."),
  E("improved", "site", "One source of truth for the brand", "Our address, contact email, and names now come from a single file."),
  E("new", "site", "We can write the blog without writing code", "Drafting, editing, publishing — all from the admin now. The CMS is real."),
  E("new", "site", "Our first search-built post is out", "“Is AI bookkeeping safe?” — written to get found in Google and quoted by AI assistants."),
  E("improved", "site", "Every post gets a face", "The blog index now carries a unique cover for each article."),
  E("new", "product", "Owners and CPAs share one app", "Same login, two views — each side sees exactly what it needs."),
  E("new", "product", "Owners can invite their CPA", "Send an invite, they accept, they're in the books. End to end."),
  E("new", "product", "The books always balance now", "Every transaction is recorded twice under the hood — proper double-entry."),
  E("improved", "product", "Every business sealed off from the rest", "One customer's data never touches another's, proven on every change."),
  E("improved", "product", "The demo wears the new brand", "Owner and CPA demos both moved to the green look, with cleaner actions."),
  E("new", "penny", "Every Penny answer gets graded", "A new layer scores her replies for quality and tracks what they cost."),
  E("new", "penny", "A human checks the close calls", "Anything the grader flags drops into a review queue to approve or fix."),
  E("improved", "penny", "Penny Insights got sharper", "Insights run on a stronger model and stay pinned to your real numbers."),
  E("new", "reach", "Signals finds better leads on its own", "It sources people who genuinely need a bookkeeper, every day."),
  E("improved", "reach", "Penny's Discord voice is editable live", "Tune her Discord persona from the admin — version history, live toggle, no deploy."),
  E("new", "reach", "One command to be forgotten", "Type /forgetme and a member's Penny messages are gone on the spot."),
  E("improved", "reach", "Sharper lead filters", "Slice the feed by location, role, and how fresh the post is."),
  E("new", "reach", "Emails you can write in plain words", "Edit any email in plain language, draft new ones with AI, and schedule them."),
  E("new", "infra", "We can finally see where we show up", "A dashboard tracks our standing in Google search and in AI answers."),
  E("improved", "infra", "Mobile gets tested for us", "Every change gets an automatic phone-and-tablet pass before it can ship."),
];

const vars = digestVars(entries);
const html = emailShell({
  eyebrow: "FounderFirst · What's new",
  title: `${vars.n} ${vars.thingword} shipped this week.`,
  intro: "Everything that moved this week, grouped by what it touches — the site, the product, and Penny. Skim the sections, dive where you like.",
  body: digestBody(entries)(BRAND),
  cta: { label: "See it all in the admin", href: "#" },
  footer: "You're getting this because you're a FounderFirst admin. It goes out weekly, only when an admin sends it.",
  preheader: `Starting with: ${vars.topShipped}.`,
});

await Deno.writeTextFile("dist/email-preview.html", html);
console.log("✓ dist/email-preview.html");
