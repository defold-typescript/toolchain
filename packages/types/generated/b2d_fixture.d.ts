/** @noSelfInFile */
import type { Opaque, Vector3 } from "../src/core-types";

declare global {
  /**
   * Functions for interacting with fixtures attached to Box2D bodies.
   * Fixtures are addressed functionally by `(body, fixture_index)` rather than persistent Lua handles.
   */
  namespace b2d.fixture {
    /**
     * Get fixture AABB for a child shape.
     *
     * @param body - body
     * @param fixture_index - 1-based fixture index from `b2d.body.get_fixtures`
     * @param child_index - 1-based child shape index
     * @returns table with `lower` and `upper`
     */
    function get_aabb(body: Opaque<"b2Body">, fixture_index: number, child_index: number): Record<string | number, unknown>;
    /**
     * Get fixture density.
     *
     * @param body - body
     * @param fixture_index - 1-based fixture index from `b2d.body.get_fixtures`
     * @returns density in kg/m^2
     */
    function get_density(body: Opaque<"b2Body">, fixture_index: number): number;
    /**
     * Get fixture filter data for a child shape.
     *
     * @param body - body
     * @param fixture_index - 1-based fixture index from `b2d.body.get_fixtures`
     * @param child_index - 1-based child shape index
     * @returns table with `category_bits`, `mask_bits`, and `group_index`
     */
    function get_filter_data(body: Opaque<"b2Body">, fixture_index: number, child_index: number): Record<string | number, unknown>;
    /**
     * Get fixture friction.
     *
     * @param body - body
     * @param fixture_index - 1-based fixture index from `b2d.body.get_fixtures`
     */
    function get_friction(body: Opaque<"b2Body">, fixture_index: number): number;
    /**
     * Get fixture restitution.
     *
     * @param body - body
     * @param fixture_index - 1-based fixture index from `b2d.body.get_fixtures`
     */
    function get_restitution(body: Opaque<"b2Body">, fixture_index: number): number;
    /**
     * Get the fixture shape as a functional shape table.
     *
     * @param body - body
     * @param fixture_index - 1-based fixture index from `b2d.body.get_fixtures`
     * @returns shape table with numeric `type` from `b2d.shape.SHAPE_TYPE_*`,
     * suitable for reuse in `b2d.body.create_fixture`.
     * Circle shapes use `radius` and `center`, edge shapes use `v1`, `v2`, optional `v0`, `v3`,
     * polygon shapes use `vertices`, and chain shapes use `vertices`, `loop`, optional `prev_vertex`, and `next_vertex`.
     * Any angle values are in radians.
     */
    function get_shape(body: Opaque<"b2Body">, fixture_index: number): Record<string | number, unknown>;
    /**
     * Get the fixture type.
     *
     * @param body - body
     * @param fixture_index - 1-based fixture index from `b2d.body.get_fixtures`
     */
    function get_type(body: Opaque<"b2Body">, fixture_index: number): number;
    /**
     * Check if a fixture is a sensor.
     *
     * @param body - body
     * @param fixture_index - 1-based fixture index from `b2d.body.get_fixtures`
     */
    function is_sensor(body: Opaque<"b2Body">, fixture_index: number): boolean;
    /**
     * Refilter a fixture.
     *
     * @param body - body
     * @param fixture_index - 1-based fixture index from `b2d.body.get_fixtures`
     * @param touch_proxies - if true, touch broad-phase proxies
     */
    function refilter(body: Opaque<"b2Body">, fixture_index: number, touch_proxies: boolean): void;
    /**
     * Set fixture density.
     *
     * @param body - body
     * @param fixture_index - 1-based fixture index from `b2d.body.get_fixtures`
     * @param density - density in kg/m^2
     * @param update_mass - if true, reset body mass data after the change
     */
    function set_density(body: Opaque<"b2Body">, fixture_index: number, density: number, update_mass: boolean): void;
    /**
     * Set fixture filter data for a child shape.
     *
     * @param body - body
     * @param fixture_index - 1-based fixture index from `b2d.body.get_fixtures`
     * @param child_index - 1-based child shape index
     * @param filter - table with `category_bits`, `mask_bits`, and `group_index`
     */
    function set_filter_data(body: Opaque<"b2Body">, fixture_index: number, child_index: number, filter: Record<string | number, unknown>): void;
    /**
     * Set fixture friction.
     *
     * @param body - body
     * @param fixture_index - 1-based fixture index from `b2d.body.get_fixtures`
     */
    function set_friction(body: Opaque<"b2Body">, fixture_index: number, friction: number): void;
    /**
     * Set fixture restitution.
     *
     * @param body - body
     * @param fixture_index - 1-based fixture index from `b2d.body.get_fixtures`
     */
    function set_restitution(body: Opaque<"b2Body">, fixture_index: number, restitution: number): void;
    /**
     * Set sensor mode for a fixture.
     *
     * @param body - body
     * @param fixture_index - 1-based fixture index from `b2d.body.get_fixtures`
     */
    function set_sensor(body: Opaque<"b2Body">, fixture_index: number, enabled: boolean): void;
    /**
     * This updates the existing Box2D v2 shape using the same table format as
     * `b2d.body.create_fixture` and `b2d.fixture.get_shape`.
     * The shape type must match the current fixture shape type. Polygon updates must
     * keep the same vertex count. Chain shape geometry cannot be updated in-place.
     * The body mass is not updated unless `update_mass` is true.
     *
     * @param body - body
     * @param fixture_index - 1-based fixture index from `b2d.body.get_fixtures`
     * @param shape - shape table with numeric `type` from `b2d.shape.SHAPE_TYPE_*`
     * @param update_mass - if true, reset body mass data after the change
     * @example
     * ```ts
     * const body = b2d.get_body("#collisionobject");
     * const circle = b2d.fixture.get_shape(body, 1);
     * circle.center = vmath.vector3(24, 0, 0);
     * b2d.fixture.set_shape(body, 1, circle, true);
     * b2d.fixture.set_shape(body, 2, { type: b2d.shape.SHAPE_TYPE_EDGE, v1: vmath.vector3(-32, 0, 0), v2: vmath.vector3(32, 0, 0) });
     * ```
     */
    function set_shape(body: Opaque<"b2Body">, fixture_index: number, shape: Record<string | number, unknown>, update_mass: boolean): void;
    /**
     * Test a point against a fixture.
     *
     * @param body - body
     * @param fixture_index - 1-based fixture index from `b2d.body.get_fixtures`
     * @param point - point in world coordinates
     */
    function test_point(body: Opaque<"b2Body">, fixture_index: number, point: Vector3): boolean;
  }
}

export {};
