/** @noSelfInFile */
import type { Hash, Opaque } from "../../src/core-types";

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
     * Returns the id of the game object that owns the collision-object component.
     * Accepts both rigid bodies and ghost trigger objects.
     * Raises a Lua error if the handle is invalid or its game object has been deleted.
     *
     * @param object - the Bullet collision object
     * @returns the game object id, or `nil` if the collision object has no associated game object
     * @example
     * ```ts
     * const object = bullet3d.get_collision_object("#collisionobject");
     * if (object !== undefined) {
     *   const id = bullet3d.get_gameobject_id(object);
     * }
     * ```
     */
    function get_gameobject_id(object: Opaque<"btCollisionObject" | "btRigidBody">): Hash | undefined;
    /**
     * Get the Bullet version
     *
     * @returns version information
     */
    function get_version(): bullet3d.version_info;
  }
}

export {};
