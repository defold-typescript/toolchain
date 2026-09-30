/** @noSelfInFile */
import type { Hash, Opaque, Url } from "../src/core-types";

declare global {
  /**
   * Native-style access to the Bullet 3D world and collision objects owned by
   * Defold. World creation, destruction and stepping remain controlled by Defold.
   * The backend name refers to three-dimensional physics.
   *
   * World, collision-object and rigid-body userdata are borrowed handles to
   * Defold-owned objects. Shape userdata are borrowed logical child-slot handles
   * attached to a collision object. Constraint userdata identify auxiliary native
   * objects owned by this Lua API; destroy them explicitly when no longer needed.
   * They are also destroyed automatically when a required body or world is
   * destroyed.
   *
   * A collision-object, rigid-body or shape handle becomes invalid when its
   * collision object is deleted or reloaded. A world handle remains valid across
   * collision-object reloads, but becomes invalid when its collection and physics
   * world are destroyed. The corresponding `is_valid()` function is safe for
   * checking a retained handle; every other operation rejects an invalid handle.
   */
  namespace bullet3d {
    type btCollisionObject = Opaque<"btCollisionObject" | "btRigidBody">;
    type btDiscreteDynamicsWorld = Opaque<"btDiscreteDynamicsWorld">;
    type btRigidBody = Opaque<"btRigidBody">;
    /**
     * Bullet version information
     */
    interface version_info {
      /**
       * full Bullet version string
       */
      version: string;
      /**
       * compact numeric Bullet version
       */
      number: number;
      /**
       * major version number
       */
      major: number;
      /**
       * minor version number
       */
      minor: number;
    }
    /**
     * This returns both rigid bodies and ghost trigger objects.
     * This function raises an error unless the collection uses 3D physics.
     *
     * @param url - collision object component URL
     * @returns the collision object, or `nil`
     */
    function get_collision_object(url: string | Hash | Url): Opaque<"btCollisionObject" | "btRigidBody"> | undefined;
    /**
     * Trigger components are ghost objects, so this function returns `nil` for them.
     * This function raises an error unless the collection uses 3D physics.
     *
     * @param url - collision object component URL
     * @returns the rigid body handle, or `nil`
     * @example
     * ```ts
     * const world = bullet3d.get_world();
     * const body = bullet3d.get_rigid_body("#collisionobject");
     * if (world !== undefined && body !== undefined && bullet3d.rigid_body.is_valid(body)) {
     *   bullet3d.rigid_body.apply_central_impulse(body, vmath.vector3(0, 10, 0));
     * }
     *
     * // A trigger is a collision object, not a rigid body.
     * const trigger = bullet3d.get_collision_object("#trigger");
     * assert(trigger !== undefined && bullet3d.get_rigid_body("#trigger") === undefined);
     * ```
     */
    function get_rigid_body(url: string | Hash | Url): Opaque<"btRigidBody"> | undefined;
    /**
     * Get the Bullet version
     *
     * @returns version information
     */
    function get_version(): bullet3d.version_info;
    /**
     * This function raises an error unless the collection uses 3D physics.
     *
     * @returns the world, or `nil` if the collection has no physics world
     */
    function get_world(): bullet3d.btDiscreteDynamicsWorld | undefined;
  }
}

export {};
