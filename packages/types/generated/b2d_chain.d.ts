/** @noSelfInFile */
import type { Opaque } from "../src/core-types";

declare global {
  /**
   * Functions for Box2D v3 chains. A chain owns multiple connected segment
   * shapes, so it is represented by a separate `b2Chain` handle.
   */
  namespace b2d.chain {
    type b2Chain = Opaque<"b2Chain">;
    /**
     * Destroying a chain removes all segment shapes owned by the chain. Destroying
     * any segment shape through `b2d.body.destroy_shape` also destroys its parent chain.
     *
     * @param chain - chain
     */
    function destroy(chain: Opaque<"b2Chain">): void;
    /**
     * Returns `nil` if the shape is not a chain segment.
     *
     * @param shape_id - shape handle from a shape info table, or pass `body, shape_index`
     * @returns parent chain, or `nil` if the shape is not a chain segment
     */
    function from_shape(shape_id: Opaque<"b2Shape">): Opaque<"b2Chain"> | unknown;
    /**
     * Get chain friction.
     *
     * @param chain - chain
     * @returns chain friction
     */
    function get_friction(chain: Opaque<"b2Chain">): number;
    /**
     * Returns a chain geometry table with `loop`, `segment_count`, and `vertices`.
     * Open chains also include `prev_vertex` and `next_vertex` ghost vertices.
     *
     * @param chain - chain
     * @returns chain geometry table
     */
    function get_geometry(chain: Opaque<"b2Chain">): Record<string | number, unknown>;
    /**
     * Get chain material id.
     *
     * @param chain - chain
     * @returns chain material id
     */
    function get_material(chain: Opaque<"b2Chain">): number;
    /**
     * Get chain restitution.
     *
     * @param chain - chain
     * @returns chain restitution
     */
    function get_restitution(chain: Opaque<"b2Chain">): number;
    /**
     * Get the number of segment shapes in a chain.
     *
     * @param chain - chain
     * @returns segment count
     */
    function get_segment_count(chain: Opaque<"b2Chain">): number;
    /**
     * Get the segment shapes owned by a chain.
     *
     * @param chain - chain
     * @returns array of shape info tables for the chain segments. Each entry includes `shape_id`.
     */
    function get_segments(chain: Opaque<"b2Chain">): Record<string | number, unknown>;
    /**
     * Get the world owning a chain.
     *
     * @param chain - chain
     * @returns owning world
     */
    function get_world(chain: Opaque<"b2Chain">): Opaque<"b2World">;
    /**
     * Validate a chain handle.
     *
     * @param chain - chain
     * @returns true if the chain handle still refers to a live Box2D chain
     */
    function is_valid(chain: Opaque<"b2Chain">): boolean;
    /**
     * Set chain friction.
     *
     * @param chain - chain
     * @param friction - chain friction
     */
    function set_friction(chain: Opaque<"b2Chain">, friction: number): void;
    /**
     * Set chain material id.
     *
     * @param chain - chain
     * @param material - chain material id
     */
    function set_material(chain: Opaque<"b2Chain">, material: number): void;
    /**
     * Set chain restitution.
     *
     * @param chain - chain
     * @param restitution - chain restitution
     */
    function set_restitution(chain: Opaque<"b2Chain">, restitution: number): void;
  }
}

export {};
