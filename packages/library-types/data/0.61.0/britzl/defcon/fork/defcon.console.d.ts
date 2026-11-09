/** @noSelfInFile **/

/** 
 * @see {@link https://github.com/britzl/defcon|Github Source}
 * @noResolution 
 */
declare module 'defcon.console' {
  /** @noSelf */
  export interface CommandCallback {
    (args: Array<string>, stream: unknown): string;
  }

  /**
   * The engine's own `print`, captured at load. `start()` replaces the global with a
   * logging wrapper that calls this, and `stop()` restores the global from it.
   */
  export const print: (...args: unknown[]) => void;

  /**
   * The engine's own `pprint`, captured at load. `start()` replaces the global with a
   * logging wrapper that calls this, and `stop()` restores the global from it.
   */
  export const pprint: (...args: unknown[]) => void;

  /**
   * The `defnet` http_server the console listens on. A router-only stand-in until
   * `start()` creates the real one; opaque here, `defnet` not being vendored by this
   * target.
   */
  export const server: unknown;

  export function start(port: number): void;

  export function stop(): void;

  export function update(): void;

  export function register_module(module: unknown, name?: string): void;

  export function register_command(command: string, description: string, callback: CommandCallback): void;

  export function set_environment(env: unknown): void;
}
