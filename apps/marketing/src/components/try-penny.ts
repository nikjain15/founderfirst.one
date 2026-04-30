/**
 * Try Penny — owner / CPA tab toggle with lazy-mounted demo iframes.
 *
 * Behavior:
 *  - Click or arrow-key navigates between Business owner / CPA tabs.
 *  - Active tab + matching panel + matching subhead are kept in sync.
 *  - Iframes are lazy-mounted: owner mounts when the section scrolls into
 *    view (avoids the demo's autofocused input scrolling the page on load).
 *    CPA mounts on first activation.
 *  - If the demo URL fails to fetch, a placeholder is shown instead.
 *  - The "Join the waitlist" CTA does smooth-scroll to #waitlist
 *    (or jumps if the user prefers reduced motion).
 *
 * DOM contract:
 *  - Section root: #try-penny
 *  - Tabs: .tp__pill[data-stage="owner"|"cpa"]
 *  - Panels: #tp-panel-owner, #tp-panel-cpa
 *  - Subheads: [data-tp-sub="owner"|"cpa"]
 *  - Iframe mount points: [data-tp-mount="owner"|"cpa"]
 *      with [data-tp-src] (URL) and [data-tp-title] (a11y title)
 *  - Smooth-scroll CTA: [data-tp-scroll]
 */
type Stage = "owner" | "cpa";

const STAGES: readonly Stage[] = ["owner", "cpa"] as const;

function isStage(value: string | undefined): value is Stage {
  return value === "owner" || value === "cpa";
}

export function initTryPenny(): void {
  const section = document.getElementById("try-penny");
  if (!section) return;

  const tabs = Array.from(section.querySelectorAll<HTMLButtonElement>(".tp__pill"));
  if (tabs.length === 0) return;

  const panels: Record<Stage, HTMLElement | null> = {
    owner: section.querySelector<HTMLElement>("#tp-panel-owner"),
    cpa:   section.querySelector<HTMLElement>("#tp-panel-cpa"),
  };
  const subs: Record<Stage, HTMLElement | null> = {
    owner: section.querySelector<HTMLElement>('[data-tp-sub="owner"]'),
    cpa:   section.querySelector<HTMLElement>('[data-tp-sub="cpa"]'),
  };
  const mounted: Record<Stage, boolean> = { owner: false, cpa: false };

  function mountIframe(stage: Stage): void {
    if (mounted[stage]) return;
    const mount = section!.querySelector<HTMLElement>(`[data-tp-mount="${stage}"]`);
    if (!mount) return;
    const src = mount.getAttribute("data-tp-src");
    const title = mount.getAttribute("data-tp-title") ?? "";
    if (!src) return;
    const placeholder = mount.querySelector<HTMLElement>(".tp__placeholder");
    mounted[stage] = true;

    fetch(src, { method: "GET", credentials: "same-origin" })
      .then((r) => {
        if (!r.ok) throw new Error("not ok");
        const f = document.createElement("iframe");
        f.src = src;
        f.title = title;
        f.loading = "lazy";
        f.setAttribute("referrerpolicy", "no-referrer-when-downgrade");
        mount.appendChild(f);
      })
      .catch(() => {
        if (placeholder) placeholder.hidden = false;
      });
  }

  function activate(stage: Stage, focus: boolean): void {
    section!.classList.add("is-swapping");
    window.setTimeout(() => {
      for (const t of tabs) {
        const stageAttr = t.dataset.stage;
        if (!isStage(stageAttr)) continue;
        const isActive = stageAttr === stage;
        t.classList.toggle("is-active", isActive);
        t.setAttribute("aria-selected", isActive ? "true" : "false");
        t.tabIndex = isActive ? 0 : -1;
      }
      for (const k of STAGES) {
        const panel = panels[k];
        const sub = subs[k];
        if (panel) panel.hidden = k !== stage;
        if (sub) sub.hidden = k !== stage;
      }
      mountIframe(stage);
      section!.classList.remove("is-swapping");
      if (focus) {
        section!.querySelector<HTMLElement>(`#tp-tab-${stage}`)?.focus();
      }
    }, 180);
  }

  // Tab clicks + keyboard arrow navigation
  tabs.forEach((tab, idx) => {
    tab.addEventListener("click", () => {
      const stage = tab.dataset.stage;
      if (isStage(stage)) activate(stage, false);
    });
    tab.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const direction = e.key === "ArrowRight" ? 1 : -1;
      const next = tabs[(idx + direction + tabs.length) % tabs.length];
      const nextStage = next?.dataset.stage;
      if (isStage(nextStage)) activate(nextStage, true);
    });
  });

  // Lazy-mount the owner iframe only when the section scrolls into view.
  // Mounting eagerly causes the demo's autofocused input to scroll the
  // parent page down to this section on initial load.
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            mountIframe("owner");
            io.disconnect();
          }
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(section);
  } else {
    mountIframe("owner");
  }

  // CTA smooth-scroll
  const cta = section.querySelector<HTMLAnchorElement>("[data-tp-scroll]");
  if (cta) {
    cta.addEventListener("click", (e) => {
      const href = cta.getAttribute("href");
      if (!href) return;
      const target = document.querySelector<HTMLElement>(href);
      if (!target) return;
      e.preventDefault();
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    });
  }
}
