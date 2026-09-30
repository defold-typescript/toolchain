/** @noSelfInFile */
import type { Opaque, Quaternion, Vector3 } from "../src/core-types";

declare global {
  /**
   * Borrowed shape handles identify a one-based child slot on a Defold-owned
   * collision object. They remain attached to that logical slot when its native
   * shape is replaced and become invalid with their owning collision object.
   * Shape mutation is copy-on-write, so instances sharing a collision resource
   * are not modified together. Lengths use Defold world units.
   */
  namespace bullet3d.shape {
    type btCollisionShape = Opaque<"btCollisionShape">;
    type definition = { type: bullet3d.shape.SHAPE_TYPE; diameter: number; position?: Vector3; rotation?: Quaternion; target_rotation?: Quaternion } | { type: bullet3d.shape.SHAPE_TYPE; dimensions: Vector3; position?: Vector3; rotation?: Quaternion; target_rotation?: Quaternion } | { type: bullet3d.shape.SHAPE_TYPE; diameter: number; height: number; position?: Vector3; rotation?: Quaternion; target_rotation?: Quaternion } | { type: bullet3d.shape.SHAPE_TYPE; vertices: Vector3[]; position?: Vector3; rotation?: Quaternion; target_rotation?: Quaternion };
    type SHAPE_TYPE = typeof bullet3d.shape.SHAPE_TYPE_BOX | typeof bullet3d.shape.SHAPE_TYPE_CAPSULE | typeof bullet3d.shape.SHAPE_TYPE_HULL | typeof bullet3d.shape.SHAPE_TYPE_MESH | typeof bullet3d.shape.SHAPE_TYPE_SPHERE;
    /**
     * Box shape type Value `1`. Shape data contains positive vector3 `dimensions` in Defold units.
     */
    const SHAPE_TYPE_BOX: number & { readonly __brand: "bullet3d.shape.SHAPE_TYPE_BOX" };
    /**
     * Capsule shape type Value `2`. Shape data contains a positive numeric `diameter` and positive numeric cylindrical-section `height` in Defold units.
     */
    const SHAPE_TYPE_CAPSULE: number & { readonly __brand: "bullet3d.shape.SHAPE_TYPE_CAPSULE" };
    /**
     * Convex hull shape type Value `3`. Shape data contains a `vertices` array with at least four finite vector3 values in Defold units.
     */
    const SHAPE_TYPE_HULL: number & { readonly __brand: "bullet3d.shape.SHAPE_TYPE_HULL" };
    /**
     * Triangle mesh shape type Value `4`. Shape data contains only the `type`; triangle geometry is read-only.
     */
    const SHAPE_TYPE_MESH: number & { readonly __brand: "bullet3d.shape.SHAPE_TYPE_MESH" };
    /**
     * Sphere shape type Value `0`. Shape data contains a positive numeric `diameter` in Defold units.
     */
    const SHAPE_TYPE_SPHERE: number & { readonly __brand: "bullet3d.shape.SHAPE_TYPE_SPHERE" };
    /**
     * Get the owning collision object.
     *
     * @param shape - shape handle
     * @returns owning collision object
     */
    function get_collision_object(shape: bullet3d.shape.btCollisionShape): Opaque<"btCollisionObject" | "btRigidBody">;
    /**
     * Get the one-based child index.
     *
     * @param shape - shape handle
     * @returns one-based shape index. **⚠️ 1-based; passed to Defold unchanged.**
     */
    function get_index(shape: bullet3d.shape.btCollisionShape): number;
    /**
     * A non-compound collision object's only shape has no child transform, so this
     * function returns the identity transform for it.
     *
     * @param shape - shape handle
     */
    function get_local_transform(shape: bullet3d.shape.btCollisionShape): LuaMultiReturn<[Vector3, Quaternion]>;
    /**
     * The returned table always contains `type`, one of `bullet3d.shape.SHAPE_TYPE_*`.
     * A sphere also contains numeric `diameter`; a box contains vector3
     * `dimensions`; a capsule contains numeric `diameter` and cylindrical-section
     * `height`; a hull contains a `vertices` array of vector3 values; and a triangle
     * mesh contains only `type`. Primitive and hull tables use Defold units and can
     * be passed to a `bullet3d.world` shape query after adding the desired `position`
     * and optional `rotation` fields.
     *
     * @param shape - shape handle
     * @returns typed shape geometry in Defold units
     */
    function get_shape(shape: bullet3d.shape.btCollisionShape): bullet3d.shape.definition;
    /**
     * Get the normalized Defold shape type.
     *
     * @param shape - shape handle
     * @returns collision shape type
     */
    function get_type(shape: bullet3d.shape.btCollisionShape): bullet3d.shape.SHAPE_TYPE;
    /**
     * Test whether a shape handle and its owner still exist.
     *
     * @param shape - shape handle
     * @returns validity
     */
    function is_valid(shape: bullet3d.shape.btCollisionShape): boolean;
    /**
     * A non-compound collision object's only shape has no child transform and is
     * rejected. The binding normalizes the supplied rotation.
     *
     * @param shape - shape handle
     * @param position - finite local position
     * @param rotation - finite non-zero local rotation
     */
    function set_local_transform(shape: bullet3d.shape.btCollisionShape, position: Vector3, rotation: Quaternion): void;
    /**
     * The table uses the same format as `get_shape`. Its `type` must match the
     * existing shape because changing native shape type is not supported. Primitive
     * dimensions must be finite and greater than zero. Hulls require at least four
     * finite vertices. Triangle mesh geometry cannot be changed with this function.
     *
     * @param shape - shape handle
     * @param data - typed shape geometry in Defold units
     * @example
     * ```ts
     * // Increase the dimensions of the first box shape by 50 percent for this instance:
     * export default defineScript({
     *   init() {
     *     const object = bullet3d.get_collision_object("#collisionobject");
     *     if (object === undefined) return;
     *     const shape = bullet3d.collision_object.get_shape(object, 1);
     *     const data = bullet3d.shape.get_shape(shape);
     *
     *     if (data.type === bullet3d.shape.SHAPE_TYPE_BOX && "dimensions" in data) {
     *       data.dimensions = data.dimensions.mul(1.5);
     *       bullet3d.shape.set_shape(shape, data);
     *     }
     *   },
     * });
     * ```
     */
    function set_shape(shape: bullet3d.shape.btCollisionShape, data: bullet3d.shape.definition): void;
  }
}

export {};
