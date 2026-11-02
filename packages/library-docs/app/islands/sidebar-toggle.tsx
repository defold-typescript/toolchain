import iconRaw from "@phosphor-icons/core/duotone/sidebar-simple-duotone.svg?raw";
import { useEffect, useState } from "hono/jsx";
import { applySidebarState, nextSidebarState, type SidebarState } from "./sidebar-state";

export default function SidebarToggle() {
  const [state, setState] = useState<SidebarState>("closed");

  const apply = (next: SidebarState) => {
    if (typeof document !== "undefined") {
      applySidebarState(document.documentElement, next);
    }
    setState(next);
  };

  useEffect(() => {
    if (state !== "open") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") apply("closed");
    };
    const backdrop = document.querySelector('[data-testid="sidebar-backdrop"]');
    const onBackdrop = () => apply("closed");
    document.addEventListener("keydown", onKey);
    backdrop?.addEventListener("click", onBackdrop);
    return () => {
      document.removeEventListener("keydown", onKey);
      backdrop?.removeEventListener("click", onBackdrop);
    };
  }, [state]);

  return (
    <button
      type="button"
      data-testid="sidebar-toggle"
      onClick={() => apply(nextSidebarState(state, "toggle"))}
      aria-label="Toggle sidebar navigation"
      aria-expanded={state === "open"}
      aria-controls="sidebar"
      class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-text-muted transition hover:border-border-strong hover:text-text lg:hidden [&_svg]:size-5"
      dangerouslySetInnerHTML={{ __html: iconRaw }}
    />
  );
}
