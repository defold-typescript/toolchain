import { useEffect } from "hono/jsx";

/**
 * Turns each `[data-hsm-demo]` placeholder a guide page writes into a live
 * state machine diagram. The demo code, and the `hsm` library it runs, load
 * only on a page that places one.
 */
export default function HsmDemos() {
  useEffect(() => {
    const hosts = document.querySelectorAll<HTMLElement>("[data-hsm-demo]");
    if (hosts.length === 0) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    import("../lib/hsm-demos/view").then(({ mountDemos }) => {
      if (!cancelled) dispose = mountDemos(hosts);
    });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);

  return <div class="hsm-demos-root" style={{ display: "contents" }} />;
}
