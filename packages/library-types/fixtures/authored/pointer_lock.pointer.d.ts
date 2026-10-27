/** @noSelfInFile **/

/**
 * Mouse lock state and a virtual in-game cursor. Add `pointer_lock/pointer_lock.script`
 * to the bootstrap collection: it locks the cursor on a click and unlocks it on
 * `key_esc`, and keeps `locked` current. The cursor fields are plain module fields;
 * assigning one goes through a cast, since a namespace import is read-only:
 * `(pointer as { cursor_visible: boolean }).cursor_visible = true`.
 * @see {@link https://github.com/indiesoftby/defold-pointer-lock|Github Source}
 * @noResolution
 */
declare module 'pointer_lock.pointer' {
  /** The `display.width` project setting, read once when the module loads. */
  export const DISPLAY_WIDTH: number;

  /** The `display.height` project setting, read once when the module loads. */
  export const DISPLAY_HEIGHT: number;

  /**
   * Whether the pointer is locked. Read-only for a project: `pointer_lock.script` sets
   * it, and `update_lock_state` copies the window's mouse lock into it. Starts `false`.
   */
  export let locked: boolean;

  /**
   * The X position of the virtual in-game cursor, between `0` and `DISPLAY_WIDTH`.
   * Starts at the middle of the display; `update_cursor_position` moves it.
   */
  export let cursor_x: number;

  /**
   * The Y position of the virtual in-game cursor, between `0` and `DISPLAY_HEIGHT`.
   * Starts at the middle of the display; `update_cursor_position` moves it.
   */
  export let cursor_y: number;

  /**
   * Whether the virtual in-game cursor is shown. Starts `false`. `transform_input`
   * passes the action id through only while the pointer is locked and this is `true`.
   */
  export let cursor_visible: boolean;

  /** The GUI render order of the virtual cursor, `15` being the top. Starts at `15`. */
  export let cursor_render_order: number;

  /**
   * Converts `on_input` arguments into the virtual in-game cursor system: sets
   * `action.x` and `action.y` to the cursor position, on the same table it returns, and
   * returns `undefined` as the action id unless the pointer is locked and the cursor is
   * visible. Call it first in `on_input`:
   * `[action_id, action] = pointer.transform_input(action_id, action)`.
   */
  export function transform_input<A extends { x?: number; y?: number }>(
    action_id: Hash | undefined,
    action: A,
  ): LuaMultiReturn<[Hash | undefined, A & { x: number; y: number }]>;

  /**
   * Moves the virtual cursor by the action's `dx` and `dy`, clamped to the display
   * size. Pass it a pointer-movement action, which carries both.
   */
  export function update_cursor_position(action: { dx: number; dy: number }): void;

  /** Copies the window's mouse lock state into `locked`. */
  export function update_lock_state(): void;
}
