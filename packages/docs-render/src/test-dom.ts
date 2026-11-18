import { GlobalRegistrator } from "@happy-dom/global-registrator";

// A test serves its fixtures through Bun's own fetch classes, and React keeps the timers it finds
// when it loads, which must outlive the window a later test file closes.
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

export function registerDom(): void {
  if (GlobalRegistrator.isRegistered) {
    return;
  }
  const native = Object.fromEntries(NATIVE_GLOBALS.map((name) => [name, globalThis[name]]));
  GlobalRegistrator.register();
  Object.assign(globalThis, native);
}

export async function unregisterDom(): Promise<void> {
  if (GlobalRegistrator.isRegistered) {
    // Radix hands focus back from a timer once a dialog unmounts, and that timer needs the window.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await GlobalRegistrator.unregister();
  }
}

// React DOM and Radix each pick an implementation when they load and take a no-op without a
// document, which leaves a Radix portal unmounted, so both load only once the document exists.
// Fumadocs' dialog module loads the Radix dialog Fumadocs itself resolves, which neither docs site
// can import by name.
// This body runs once per process, and an earlier file's `unregisterDom` removes the document, so
// each test file also calls `registerDom` before it renders, and before it spies on a global:
// unregistering puts back each global as registering found it, so a spy installed first outlives
// its own `mockRestore` and answers every later file's call with `undefined`.
registerDom();
await import("fumadocs-ui/components/dialog/search");
export const { act, fireEvent, render, waitFor, within } = await import("@testing-library/react");
