import { GlobalRegistrator } from "@happy-dom/global-registrator";

// The tests serve real routes through Hono, which needs Bun's own fetch classes, and React keeps the
// timers it finds when it loads, which must outlive the window a later test file closes.
const NATIVE_GLOBALS = [
  "fetch",
  "Request",
  "Response",
  "Headers",
  "FormData",
  "Blob",
  "AbortController",
  "AbortSignal",
  "ReadableStream",
  "URL",
  "URLSearchParams",
  "TextEncoder",
  "TextDecoder",
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
  "setImmediate",
  "clearImmediate",
  "queueMicrotask",
  "MessageChannel",
] as const;

const VIEWPORT = { width: 1024, height: 768 };

export function registerDom(): void {
  if (GlobalRegistrator.isRegistered) {
    return;
  }
  const native = Object.fromEntries(NATIVE_GLOBALS.map((name) => [name, globalThis[name]]));
  GlobalRegistrator.register(VIEWPORT);
  Object.assign(globalThis, native);
  // Happy DOM lays nothing out, and a virtualized list in a zero-height box renders no rows.
  for (const [name, size] of [
    ["offsetWidth", VIEWPORT.width],
    ["offsetHeight", VIEWPORT.height],
  ] as const) {
    Object.defineProperty(globalThis.HTMLElement.prototype, name, {
      configurable: true,
      get: () => size,
    });
  }
}

export async function unregisterDom(): Promise<void> {
  if (GlobalRegistrator.isRegistered) {
    await GlobalRegistrator.unregister();
  }
}

// React DOM picks its input event handling when it loads, and Bun evaluates a CommonJS import
// before the importing module's body, so React DOM is loaded only once a document exists.
registerDom();
export const { act, cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
