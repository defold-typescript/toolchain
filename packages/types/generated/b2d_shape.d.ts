/** @noSelfInFile */
import type { Opaque, Vector3 } from "../src/core-types";

declare global {
  /**
   * Constants for functional shape tables used with `b2d.body.create_fixture`
   * and returned from `b2d.fixture.get_shape`.
   */
  namespace b2d.shape {
    type b2Shape = Opaque<"b2Shape">;
    /**
     * Uses the polygon enum value, but indicates the `hx`/`hy` box convenience format.
     */
    const SHAPE_TYPE_BOX: number & { readonly __brand: "b2d.shape.SHAPE_TYPE_BOX" };
    /**
     * Capsule shape type.
     */
    const SHAPE_TYPE_CAPSULE: number & { readonly __brand: "b2d.shape.SHAPE_TYPE_CAPSULE" };
    /**
     * Chain shape type.
     */
    const SHAPE_TYPE_CHAIN: number & { readonly __brand: "b2d.shape.SHAPE_TYPE_CHAIN" };
    /**
     * Circle shape type.
     */
    const SHAPE_TYPE_CIRCLE: number & { readonly __brand: "b2d.shape.SHAPE_TYPE_CIRCLE" };
    /**
     * Edge shape type.
     */
    const SHAPE_TYPE_EDGE: number & { readonly __brand: "b2d.shape.SHAPE_TYPE_EDGE" };
    /**
     * Grid shape type.
     */
    const SHAPE_TYPE_GRID: number & { readonly __brand: "b2d.shape.SHAPE_TYPE_GRID" };
    /**
     * Polygon shape type.
     */
    const SHAPE_TYPE_POLYGON: number & { readonly __brand: "b2d.shape.SHAPE_TYPE_POLYGON" };
    /**
     * Segment shape type.
     */
    const SHAPE_TYPE_SEGMENT: number & { readonly __brand: "b2d.shape.SHAPE_TYPE_SEGMENT" };
    /**
     * Check if contact events are enabled for a shape.
     *
     * @param shape_id - shape handle from a shape info table, or pass `body, shape_index`
     * @returns true if contact events are enabled
     */
    function are_contact_events_enabled(shape_id: Opaque<"b2Shape">): boolean;
    /**
     * Check if hit events are enabled for a shape.
     *
     * @param shape_id - shape handle from a shape info table, or pass `body, shape_index`
     * @returns true if hit events are enabled
     */
    function are_hit_events_enabled(shape_id: Opaque<"b2Shape">): boolean;
    /**
     * Check if pre-solve events are enabled for a shape.
     *
     * @param shape_id - shape handle from a shape info table, or pass `body, shape_index`
     * @returns true if pre-solve events are enabled
     */
    function are_pre_solve_events_enabled(shape_id: Opaque<"b2Shape">): boolean;
    /**
     * Check if sensor events are enabled for a shape.
     *
     * @param shape_id - shape handle from a shape info table, or pass `body, shape_index`
     * @returns true if sensor events are enabled
     */
    function are_sensor_events_enabled(shape_id: Opaque<"b2Shape">): boolean;
    /**
     * Enable or disable contact events for a shape.
     *
     * @param shape_id - shape handle from a shape info table, or pass `body, shape_index`
     * @param enable - true to enable contact events
     */
    function enable_contact_events(shape_id: Opaque<"b2Shape">, enable: boolean): void;
    /**
     * Enable or disable hit events for a shape.
     *
     * @param shape_id - shape handle from a shape info table, or pass `body, shape_index`
     * @param enable - true to enable hit events
     */
    function enable_hit_events(shape_id: Opaque<"b2Shape">, enable: boolean): void;
    /**
     * Enable or disable pre-solve events for a shape.
     *
     * @param shape_id - shape handle from a shape info table, or pass `body, shape_index`
     * @param enable - true to enable pre-solve events
     */
    function enable_pre_solve_events(shape_id: Opaque<"b2Shape">, enable: boolean): void;
    /**
     * Enable or disable sensor events for a shape.
     *
     * @param shape_id - shape handle from a shape info table, or pass `body, shape_index`
     * @param enable - true to enable sensor events
     */
    function enable_sensor_events(shape_id: Opaque<"b2Shape">, enable: boolean): void;
    /**
     * Get the body owning a shape.
     *
     * @param shape_id - shape handle from a shape info table, or pass `body, shape_index`
     * @returns owning body
     */
    function get_body(shape_id: Opaque<"b2Shape">): Opaque<"b2Body">;
    /**
     * Get the closest point on a shape.
     *
     * @param shape_id - shape handle from a shape info table, or pass `body, shape_index`
     * @param target - world target point
     * @returns closest world point on the shape
     */
    function get_closest_point(shape_id: Opaque<"b2Shape">, target: Vector3): Vector3;
    /**
     * Get shape contact capacity.
     *
     * @param shape_id - shape handle from a shape info table, or pass `body, shape_index`
     * @returns maximum contact data count
     */
    function get_contact_capacity(shape_id: Opaque<"b2Shape">): number;
    /**
     * Get touching contact data for a shape.
     *
     * @param shape_id - shape handle from a shape info table, or pass `body, shape_index`
     * @returns array of contact tables
     */
    function get_contact_data(shape_id: Opaque<"b2Shape">): Record<string | number, unknown>;
    /**
     * Get mass data for a shape.
     *
     * @param shape_id - shape handle from a shape info table, or pass `body, shape_index`
     * @returns table with `mass`, `center`, and `inertia`
     */
    function get_mass_data(shape_id: Opaque<"b2Shape">): Record<string | number, unknown>;
    /**
     * Get shape material id.
     *
     * @param shape_id - shape handle from a shape info table, or pass `body, shape_index`
     * @returns shape material id
     */
    function get_material(shape_id: Opaque<"b2Shape">): number;
    /**
     * Get sensor overlap capacity.
     *
     * @param shape_id - shape handle from a shape info table, or pass `body, shape_index`
     * @returns maximum sensor overlap count
     */
    function get_sensor_capacity(shape_id: Opaque<"b2Shape">): number;
    /**
     * Get sensor overlaps.
     *
     * @param shape_id - shape handle from a shape info table, or pass `body, shape_index`
     * @returns array of shape info tables
     */
    function get_sensor_overlaps(shape_id: Opaque<"b2Shape">): Record<string | number, unknown>;
    /**
     * Get a shape's geometry.
     *
     * @param shape_id - shape handle from a shape info table, or pass `body, shape_index`
     * @returns shape table with numeric `type` from `b2d.shape.SHAPE_TYPE_*`
     */
    function get_shape(shape_id: Opaque<"b2Shape">): Record<string | number, unknown>;
    /**
     * Get the world owning a shape.
     *
     * @param shape_id - shape handle from a shape info table, or pass `body, shape_index`
     * @returns owning world
     */
    function get_world(shape_id: Opaque<"b2Shape">): Opaque<"b2World">;
    /**
     * Validate a shape handle.
     *
     * @param shape_id - shape handle from a shape info table, or pass `body, shape_index`
     * @returns true if the shape handle still refers to a live Box2D shape
     */
    function is_valid(shape_id: Opaque<"b2Shape">): boolean;
    /**
     * Ray cast a shape directly.
     *
     * @param shape_id - shape handle from a shape info table, or pass `body, shape_index`
     * @param origin - world ray origin
     * @param translation - world ray translation
     * @param max_fraction - optional maximum translation fraction, defaults to 1
     * @returns hit table with `point`, `normal`, `fraction`, and `iterations`, or nil
     */
    function ray_cast(shape_id: Opaque<"b2Shape">, origin: Vector3, translation: Vector3, max_fraction: number): Record<string | number, unknown>;
    /**
     * Set shape material id.
     *
     * @param shape_id - shape handle from a shape info table, or pass `body, shape_index`
     * @param material - shape material id
     */
    function set_material(shape_id: Opaque<"b2Shape">, material: number): void;
    /**
     * This updates the shape geometry using the same table format as
     * `b2d.body.create_shape` and `b2d.shape.get_shape`. The body mass is not
     * updated unless `update_mass` is true.
     *
     * @param shape_id - shape handle from a shape info table, or pass `body, shape_index`
     * @param definition - shape table with numeric `type` from `b2d.shape.SHAPE_TYPE_*`
     * @param update_mass - true to reset body mass from shapes
     * @example
     * ```ts
     * const body = b2d.get_body("#collisionobject");
     * const circle = b2d.shape.get_shape(body, 1);
     * circle.center = vmath.vector3(24, 0, 0);
     * b2d.shape.set_shape(body, 1, circle, true);
     * b2d.shape.set_shape(body, 2, { type: b2d.shape.SHAPE_TYPE_SEGMENT, v1: vmath.vector3(-32, 0, 0), v2: vmath.vector3(32, 0, 0) });
     * ```
     */
    function set_shape(shape_id: Opaque<"b2Shape">, definition: Record<string | number, unknown>, update_mass: boolean): void;
  }
}

export {};
