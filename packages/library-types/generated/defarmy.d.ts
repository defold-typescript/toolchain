/** @noSelfInFile **/

/**
 * Groups game objects (soldiers) into armies, places them in a built-in or customized
 * pattern, and moves and rotates each army as a group. Create an army with `army_create`
 * and a soldier for each game object with `soldier_create`, then call `soldier_move`
 * from each soldier's `update` and apply the position and rotation it returns.
 * @see {@link https://github.com/dev-masih/defarmy|Github Source}
 * @noResolution
 */
declare module 'defarmy.defarmy' {
  /**
   * Builds a customized army pattern. Gets the number of soldiers in the army and
   * returns how many stand in each row, the bottom row first: a triangle of 18 is
   * `[3, 5, 4, 3, 2, 1]`. The rows must add up to `total_count`, which upstream asserts,
   * and rows of `0` are dropped.
   */
  export type PatternFunc = (total_count: number) => number[];

  /**
   * The army patterns `army_create` and `army_update_pattern` take. The five named
   * patterns place the soldiers in built-in shapes. `CUSTOMIZED` takes its rows from the
   * `pattern_func` passed beside it.
   */
  export const PATTERN: {
    BOTTOM_TO_TOP_SQUARE: Hash;
    TOP_TO_BOTTOM_SQUARE: Hash;
    TRIANGLE: Hash;
    RHOMBUS_TALL: Hash;
    RHOMBUS_SHORT: Hash;
    CUSTOMIZED: Hash;
  };

  /**
   * Creates a group of game objects (an army) with the given member padding and pattern,
   * and returns its id. `PATTERN.CUSTOMIZED` requires `pattern_func`, which upstream
   * asserts, and every other pattern ignores it. Any value outside `PATTERN` fails an
   * assert.
   * @param army_center_position The army's center position.
   * @param army_initial_rotation The army's initial rotation.
   * @param member_padding The distance between members.
   * @param is_sticky Whether members are glued to their places in the army, rather than
   * following them. It shows most while the army rotates.
   * @param army_pattern One of `PATTERN`.
   * @param pattern_func Builds the rows for `PATTERN.CUSTOMIZED`.
   */
  export function army_create(
    army_center_position: Vector3,
    army_initial_rotation: Quaternion,
    member_padding: number,
    is_sticky: boolean,
    army_pattern: Hash,
    pattern_func?: PatternFunc,
  ): number;

  /**
   * Returns the ids of the soldiers in an army. The list is the army's own, so editing
   * it edits the army.
   * @param army_id The army's id.
   */
  export function army_members(army_id: number): number[];

  /**
   * Removes an army and releases its members, which stay as soldiers in no army.
   * @param army_id The army's id.
   */
  export function army_remove(army_id: number): void;

  /**
   * Moves an army's center.
   * @param army_id The army's id.
   * @param army_center_position The new center position.
   */
  export function army_update_position(army_id: number, army_center_position: Vector3): void;

  /**
   * Rotates an army.
   * @param army_id The army's id.
   * @param army_rotation The new rotation.
   */
  export function army_update_rotation(army_id: number, army_rotation: Quaternion): void;

  /**
   * Changes an army's pattern and rearranges its members at once. `PATTERN.CUSTOMIZED`
   * requires `pattern_func`, which upstream asserts, and every other pattern ignores it.
   * @param army_id The army's id.
   * @param army_pattern One of `PATTERN`.
   * @param pattern_func Builds the rows for `PATTERN.CUSTOMIZED`.
   */
  export function army_update_pattern(
    army_id: number,
    army_pattern: Hash,
    pattern_func?: PatternFunc,
  ): void;

  /**
   * Changes whether an army's members are glued to their places in it.
   * @param army_id The army's id.
   * @param is_sticky Whether members are glued to their places, rather than following
   * them.
   */
  export function army_update_stickiness(army_id: number, is_sticky: boolean): void;

  /**
   * Draws an army's center and facing for one frame, by posting `draw_line` to
   * `@render:`. Call it every frame to keep it shown.
   * @param army_id The army's id.
   * @param debug_color The color of the lines.
   */
  export function army_debug_draw(army_id: number, debug_color: Vector4): void;

  /**
   * Creates a soldier and returns its id, joining it to an army when `army_id` is given.
   * @param position The soldier's current position.
   * @param initial_direction The direction the soldier's game object faces at zero
   * rotation. Every rotation `soldier_move` returns is relative to it.
   * @param army_id The army to join.
   */
  export function soldier_create(
    position: Vector3,
    initial_direction: Vector3,
    army_id?: number,
  ): number;

  /**
   * Moves a soldier into an army, out of the army it was in.
   * @param soldier_id The soldier's id.
   * @param army_id The army's id.
   */
  export function soldier_join_army(soldier_id: number, army_id: number): void;

  /**
   * Takes a soldier out of its army and rearranges the members left. A soldier in no
   * army is left as it is. At `v1` the rearrangement raises a Lua error when the soldier
   * was the army's last member, so call `army_remove` instead in that case.
   * @param soldier_id The soldier's id.
   */
  export function soldier_leave_army(soldier_id: number): void;

  /**
   * Removes a soldier completely, rearranging the army it was in. `soldier_move` then
   * returns `undefined` for both values. At `v1` the rearrangement raises a Lua error
   * when the soldier was the army's last member, so call `army_remove` first in that
   * case.
   * @param soldier_id The soldier's id.
   */
  export function soldier_remove(soldier_id: number): void;

  /**
   * Turns on a soldier's debug marks: each `soldier_move` call then posts `draw_line` to
   * `@render:` to mark the position the soldier is heading for with a cross.
   * @param soldier_id The soldier's id.
   * @param debug_color The color of the marks.
   */
  export function soldier_debug_on(soldier_id: number, debug_color: Vector4): void;

  /**
   * Turns off a soldier's debug marks.
   * @param soldier_id The soldier's id.
   */
  export function soldier_debug_off(soldier_id: number): void;

  /**
   * Calculates a soldier's next position and rotation, moving it toward its place in its
   * army. A soldier in no army keeps `current_position`. Returns `undefined` for both
   * values once the soldier is removed:
   * `const [position, rotation] = defarmy.soldier_move(id, go.get_position(), speed)`.
   * @param soldier_id The soldier's id.
   * @param current_position The soldier's current position.
   * @param speed How far the soldier moves this call.
   * @param threshold The distance from its place within which the soldier counts as
   * placed. Defaults to `1`.
   */
  export function soldier_move(
    soldier_id: number,
    current_position: Vector3,
    speed: number,
    threshold?: number,
  ): LuaMultiReturn<[Vector3, Quaternion] | [undefined, undefined]>;
}
