// Importable timer polyfills backed by Defold's frame-driven `timer.delay` /
// `timer.cancel` (packages/types/generated/timer.d.ts). Defold runs each script
// as an isolated Lua chunk with no shared global scope and no JS event loop, so
// these are named module exports (lowered to a `require`), not ambient globals:
// pay-for-use and explicit. The transpiler emits the runtime and the CLI writes
// it to `lib/defold_typescript/timers.lua` (moved by `runtime-dir`), respelling
// the import's `require` to that path.
declare module "@defold-typescript/types/timers" {
  /**
   * Run `callback` once after `delayMs` milliseconds, backed by Defold's
   * frame-driven `timer.delay`. Returns the timer handle to pass to
   * `clearTimeout`. There is no event loop — the callback fires from the engine
   * scheduler on a later frame, not a microtask drain.
   *
   * @param callback - invoked once when the delay elapses.
   * @param delayMs - delay in milliseconds (converted to Defold's seconds).
   * @returns the timer handle, for `clearTimeout`.
   */
  export function setTimeout(callback: () => void, delayMs: number): number;
  /**
   * Run `callback` every `delayMs` milliseconds (a repeating `timer.delay`).
   * Returns the timer handle to pass to `clearInterval`.
   *
   * @param callback - invoked on every tick.
   * @param delayMs - interval in milliseconds (converted to Defold's seconds).
   * @returns the timer handle, for `clearInterval`.
   */
  export function setInterval(callback: () => void, delayMs: number): number;
  /**
   * Cancel a pending `setTimeout` by its handle (`timer.cancel`). Cancelling an
   * already-fired or already-cancelled handle is safe.
   */
  export function clearTimeout(handle: number): void;
  /**
   * Cancel a repeating `setInterval` by its handle (`timer.cancel`).
   */
  export function clearInterval(handle: number): void;
  /**
   * Resolve after `seconds` (Defold-native seconds, not milliseconds), so
   * `await wait(0.5)` suspends an `async` function until the engine timer fires.
   * The returned `Promise` is resolved from inside the `timer.delay` callback —
   * nothing else advances it.
   *
   * @param seconds - delay in seconds before the promise resolves.
   * @returns a `Promise` that resolves once the timer fires.
   */
  export function wait(seconds: number): Promise<void>;
}
