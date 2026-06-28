import { Link } from "react-router-dom";

/**
 * Shared sub-nav across the Content surfaces (Penny's brain + site copy + blog).
 * Each editor lives on its own route so its full-page layout stays intact —
 * this strip is what makes them read as one grouped "Content" area.
 */
export type ContentTab = "prompt" | "voice" | "discord" | "site" | "blog";

const ITEMS: Array<{ id: ContentTab; label: string; to: string }> = [
  { id: "prompt",  label: "Prompt",    to: "/content#prompt"  },
  { id: "voice",   label: "Voice",     to: "/content#voice"   },
  { id: "discord", label: "Discord",   to: "/content#discord" },
  { id: "site",    label: "Site copy", to: "/site-content"    },
  { id: "blog",    label: "Blog",      to: "/blog-posts"      },
];

export function ContentSubnav({ active }: { active: ContentTab }) {
  return (
    <div className="tabs" role="tablist" aria-label="Content sections">
      {ITEMS.map((it) => (
        <Link
          key={it.id}
          to={it.to}
          role="tab"
          aria-selected={active === it.id}
          className={`tab ${active === it.id ? "active" : ""}`}
        >
          {it.label}
        </Link>
      ))}
    </div>
  );
}
