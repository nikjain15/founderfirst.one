/**
 * TopbarSlot — lets a lens render its PRIMARY tab strip up into the shared top bar
 * (the founderfirst.one/admin pattern: tabs inline in the white nav bar, sub-tabs
 * below). The lens keeps ALL its tab state + routing logic; only the DOM location
 * of the primary strip moves, via a portal into this slot. If no slot is mounted
 * (e.g. a surface that doesn't use Topbar), the lens falls back to rendering inline.
 */
import { createContext, useContext, useState, type ReactNode } from "react";

const Ctx = createContext<{
  slot: HTMLElement | null;
  setSlot: (el: HTMLElement | null) => void;
}>({ slot: null, setSlot: () => {} });

export function TopbarSlotProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return <Ctx.Provider value={{ slot, setSlot }}>{children}</Ctx.Provider>;
}

export function useTopbarSlot() {
  return useContext(Ctx);
}
