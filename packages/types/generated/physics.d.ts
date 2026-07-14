/** @noSelfInFile */
import type { Hash, Url, Vector3 } from "../src/core-types";

declare global {
  /**
   * Collision object physics API documentation
   */
  namespace physics {
    /**
     * The following properties are available when connecting a joint of `JOINT_TYPE_FIXED` type:
     */
    const JOINT_TYPE_FIXED: number & { readonly __brand: "physics.JOINT_TYPE_FIXED" };
    /**
     * The following properties are available when connecting a joint of `JOINT_TYPE_HINGE` type:
     */
    const JOINT_TYPE_HINGE: number & { readonly __brand: "physics.JOINT_TYPE_HINGE" };
    /**
     * The following properties are available when connecting a joint of `JOINT_TYPE_SLIDER` type:
     */
    const JOINT_TYPE_SLIDER: number & { readonly __brand: "physics.JOINT_TYPE_SLIDER" };
    /**
     * The following properties are available when connecting a joint of `JOINT_TYPE_SPRING` type:
     */
    const JOINT_TYPE_SPRING: number & { readonly __brand: "physics.JOINT_TYPE_SPRING" };
    /**
     * The following properties are available when connecting a joint of `JOINT_TYPE_WELD` type:
     */
    const JOINT_TYPE_WELD: number & { readonly __brand: "physics.JOINT_TYPE_WELD" };
    /**
     * The following properties are available when connecting a joint of `JOINT_TYPE_WHEEL` type:
     */
    const JOINT_TYPE_WHEEL: number & { readonly __brand: "physics.JOINT_TYPE_WHEEL" };
    const SHAPE_TYPE_BOX: number & { readonly __brand: "physics.SHAPE_TYPE_BOX" };
    const SHAPE_TYPE_CAPSULE: number & { readonly __brand: "physics.SHAPE_TYPE_CAPSULE" };
    const SHAPE_TYPE_HULL: number & { readonly __brand: "physics.SHAPE_TYPE_HULL" };
    const SHAPE_TYPE_SPHERE: number & { readonly __brand: "physics.SHAPE_TYPE_SPHERE" };
    /**
     * Create a physics joint between two collision object components.
     * Note: Currently only supported in 2D physics.
     *
     * @param joint_type - the joint type
     * @param collisionobject_a - first collision object
     * @param joint_id - id of the joint
     * @param position_a - local position where to attach the joint on the first collision object
     * @param collisionobject_b - second collision object
     * @param position_b - local position where to attach the joint on the second collision object
     * @param properties - optional joint specific properties table
     * See each joint type for possible properties field. The one field that is accepted for all joint types is:
     * - boolean `collide_connected`: Set this flag to true if the attached bodies should collide.
     */
    function create_joint(joint_type: number, collisionobject_a: string | Hash | Url, joint_id: string | Hash, position_a: Vector3, collisionobject_b: string | Hash | Url, position_b: Vector3, properties?: { collide_connected?: boolean }): void;
    /**
     * Destroy an already physics joint. The joint has to be created before a
     * destroy can be issued.
     * Note: Currently only supported in 2D physics.
     *
     * @param collisionobject - collision object where the joint exist
     * @param joint_id - id of the joint
     */
    function destroy_joint(collisionobject: string | Hash | Url, joint_id: string | Hash): void;
    /**
     * Get the gravity in runtime. The gravity returned is not global, it will return
     * the gravity for the collection that the function is called from.
     * Note: For 2D physics the z component will always be zero.
     *
     * @returns gravity vector of collection
     * @example
     * ```ts
     * export default defineScript({
     *   init(self) {
     *     let gravity = physics.get_gravity();
     *     // Inverse gravity!
     *     gravity = -gravity;
     *     physics.set_gravity(gravity);
     *   },
     * });
     * ```
     */
    function get_gravity(): Vector3;
    /**
     * Returns the group name of a collision object as a hash.
     *
     * @param url - the collision object to return the group of.
     * @returns hash value of the group.
     *
     * `local function check_is_enemy()
     * local group = physics.get_group("#collisionobject")
     * return group == hash("enemy")
     * end
     * `
     */
    function get_group(url: string | Hash | Url): Hash;
    /**
     * Get a table for properties for a connected joint. The joint has to be created before
     * properties can be retrieved.
     * Note: Currently only supported in 2D physics.
     *
     * @param collisionobject - collision object where the joint exist
     * @param joint_id - id of the joint
     * @returns properties table. See the joint types for what fields are available, the only field available for all types is:
     *
     * - boolean `collide_connected`: Set this flag to true if the attached bodies should collide.
     */
    function get_joint_properties(collisionobject: string | Hash | Url, joint_id: string | Hash): { collide_connected: boolean };
    /**
     * Get the reaction force for a joint. The joint has to be created before
     * the reaction force can be calculated.
     * Note: Currently only supported in 2D physics.
     *
     * @param collisionobject - collision object where the joint exist
     * @param joint_id - id of the joint
     * @returns reaction force for the joint
     */
    function get_joint_reaction_force(collisionobject: string | Hash | Url, joint_id: string | Hash): Vector3;
    /**
     * Get the reaction torque for a joint. The joint has to be created before
     * the reaction torque can be calculated.
     * Note: Currently only supported in 2D physics.
     *
     * @param collisionobject - collision object where the joint exist
     * @param joint_id - id of the joint
     * @returns the reaction torque on bodyB in N*m.
     */
    function get_joint_reaction_torque(collisionobject: string | Hash | Url, joint_id: string | Hash): number;
    /**
     * Returns true if the specified group is set in the mask of a collision
     * object, false otherwise.
     *
     * @param url - the collision object to check the mask of.
     * @param group - the name of the group to check for.
     * @returns boolean value of the maskbit. 'true' if present, 'false' otherwise.
     *
     * `local function is_invincible()
     * -- check if the collisionobject would collide with the "bullet" group
     * local invincible = physics.get_maskbit("#collisionobject", "bullet")
     * return invincible
     * end
     * `
     */
    function get_maskbit(url: string | Hash | Url, group: string): boolean;
    /**
     * Gets collision shape data from a collision object
     *
     * @param url - the collision object.
     * @param shape - the name of the shape to get data for.
     * @returns A table containing meta data about the physics shape
     *
     * `type`
     * number The shape type. Supported values:
     *
     * - `physics.SHAPE_TYPE_SPHERE`
     *
     * - `physics.SHAPE_TYPE_BOX`
     *
     * - `physics.SHAPE_TYPE_CAPSULE` *Only supported for 3D physics*
     *
     * - `physics.SHAPE_TYPE_HULL`
     *
     * The returned table contains different fields depending on which type the shape is.
     * If the shape is a sphere:
     *
     * `diameter`
     * number the diameter of the sphere shape
     *
     * If the shape is a box:
     *
     * `dimensions`
     * vector3 a `vmath.vector3` of the box dimensions
     *
     * If the shape is a capsule:
     *
     * `diameter`
     * number the diameter of the capsule poles
     * `height`
     * number the height of the capsule
     *
     * `local function get_shape_meta()
     * local sphere = physics.get_shape("#collisionobject", "my_sphere_shape")
     * -- returns a table with sphere.diameter
     * return sphere
     * end
     * `
     */
    function get_shape(url: string | Hash | Url, shape: string | Hash): { type: number; diameter: number; dimensions: Vector3; diameter: number; height: number };
    /**
     * Ray casts are used to test for intersections against collision objects in the physics world.
     * Collision objects of types kinematic, dynamic and static are tested against. Trigger objects
     * do not intersect with ray casts.
     * Which collision objects to hit is filtered by their collision groups and can be configured
     * through `groups`.
     * NOTE: Ray casts will ignore collision objects that contain the starting point of the ray. This is a limitation in Box2D.
     *
     * @param from - the world position of the start of the ray
     * @param to - the world position of the end of the ray
     * @param groups - a lua table containing the hashed groups for which to test collisions against
     * @param options - a lua table containing options for the raycast.
     *
     * `all`
     * boolean Set to `true` to return all ray cast hits. If `false`, it will only return the closest hit.
     * @returns It returns a list. If missed it returns `nil`. See ray_cast_response for details on the returned values.
     * @example
     * ```ts
     * // How to perform a ray cast synchronously:
     * export default defineScript({
     *   init(self) {
     *     self.groups = [hash("world"), hash("enemy")];
     *   },
     *
     *   update(self, dt) {
     *     // request ray cast
     *     const result = physics.raycast(from, to, self.groups, { all: true });
     *     if (result !== undefined) {
     *       // act on the hit (see 'ray_cast_response')
     *       for (const result of results) {
     *         handle_result(result);
     *       }
     *     }
     *   },
     * });
     * ```
     */
    function raycast(from: Vector3, to: Vector3, groups: Hash[], options?: { all?: boolean }): { fraction: number; position: Vector3; normal: Vector3; id: Hash; group: Hash; request_id: number }[] | undefined;
    /**
     * Ray casts are used to test for intersections against collision objects in the physics world.
     * Collision objects of types kinematic, dynamic and static are tested against. Trigger objects
     * do not intersect with ray casts.
     * Which collision objects to hit is filtered by their collision groups and can be configured
     * through `groups`.
     * The actual ray cast will be performed during the physics-update.
     *
     * - If an object is hit, the result will be reported via a ray_cast_response message.
     *
     * - If there is no object hit, the result will be reported via a ray_cast_missed message.
     *
     * NOTE: Ray casts will ignore collision objects that contain the starting point of the ray. This is a limitation in Box2D.
     *
     * @param from - the world position of the start of the ray
     * @param to - the world position of the end of the ray
     * @param groups - a lua table containing the hashed groups for which to test collisions against
     * @param request_id - a number in range [0,255]. It will be sent back in the response for identification, 0 by default
     * @example
     * ```ts
     * // How to perform a ray cast asynchronously:
     * export default defineScript({
     *   init(self) {
     *     self.my_groups = [hash("my_group1"), hash("my_group2")];
     *   },
     *
     *   update(self, dt) {
     *     // request ray cast
     *     physics.raycast_async(my_start, my_end, self.my_groups);
     *   },
     *
     *   on_message(self, message_id, message, sender) {
     *     // check for the response
     *     if (message_id === hash("ray_cast_response")) {
     *       // act on the hit
     *     } else if (message_id === hash("ray_cast_missed")) {
     *       // act on the miss
     *     }
     *   },
     * });
     * ```
     */
    function raycast_async(from: Vector3, to: Vector3, groups: Hash[], request_id?: number): void;
    /**
     * Only one physics world event listener can be set at a time.
     *
     * @param callback - A callback that receives an information about all the physics interactions in this physics world.
     *
     * `self`
     * object The calling script
     * `event`
     * constant The type of event. Can be one of these messages:
     *
     * - contact_point_event
     *
     * - collision_event
     *
     * - trigger_event
     *
     * - ray_cast_response
     *
     * - ray_cast_missed
     *
     * `data`
     * table The callback value data is a table that contains event-related data. See the documentation for details on the messages.
     * @example
     * ```ts
     * function physics_world_listener(self, events) {
     *   for (const event of events) {
     *     const event_type = event["type"];
     *     if (event_type === hash("contact_point_event")) {
     *       pprint(event);
     *       // {
     *       //  distance = 2.1490633487701,
     *       //  applied_impulse = 0
     *       //  a = { --[[0x113f7c6c0]]
     *       //    group = hash: [box],
     *       //    id = hash: [/box]
     *       //    mass = 0,
     *       //    normal = vmath.vector3(0.379, 0.925, -0),
     *       //    position = vmath.vector3(517.337, 235.068, 0),
     *       //    instance_position = vmath.vector3(480, 144, 0),
     *       //    relative_velocity = vmath.vector3(-0, -0, -0),
     *       //  },
     *       //  b = { --[[0x113f7c840]]
     *       //    group = hash: [circle],
     *       //    id = hash: [/circle]
     *       //    mass = 0,
     *       //    normal = vmath.vector3(-0.379, -0.925, 0),
     *       //    position = vmath.vector3(517.337, 235.068, 0),
     *       //    instance_position = vmath.vector3(-0.0021, 0, -0.0022),
     *       //    relative_velocity = vmath.vector3(0, 0, 0),
     *       //  },
     *       // }
     *     } else if (event === hash("collision_event")) {
     *       pprint(event);
     *       // {
     *       //  a = {
     *       //          group = hash: [default],
     *       //          position = vmath.vector3(183, 666, 0),
     *       //          id = hash: [/go1]
     *       //      },
     *       //  b = {
     *       //          group = hash: [default],
     *       //          position = vmath.vector3(185, 704.05865478516, 0),
     *       //          id = hash: [/go2]
     *       //      }
     *       // }
     *     } else if (event === hash("trigger_event")) {
     *       pprint(event);
     *       // {
     *       //  enter = true,
     *       //  b = {
     *       //      group = hash: [default],
     *       //      id = hash: [/go2]
     *       //  },
     *       //  a = {
     *       //      group = hash: [default],
     *       //      id = hash: [/go1]
     *       //  }
     *       // },
     *     } else if (event === hash("ray_cast_response")) {
     *       pprint(event);
     *       // {
     *       //  group = hash: [default],
     *       //  request_id = 0,
     *       //  position = vmath.vector3(249.92222595215, 249.92222595215, 0),
     *       //  fraction = 0.68759721517563,
     *       //  normal = vmath.vector3(0, 1, 0),
     *       //  id = hash: [/go]
     *       // }
     *     } else if (event === hash("ray_cast_missed")) {
     *       pprint(event);
     *       // {
     *       //  request_id = 0
     *       // },
     *     }
     *   }
     * }
     *
     * export default defineScript({
     *   init(self) {
     *     physics.set_event_listener(physics_world_listener);
     *   },
     * });
     * ```
     */
    function set_event_listener(callback?: (self: unknown, events: unknown) => void): void;
    /**
     * Set the gravity in runtime. The gravity change is not global, it will only affect
     * the collection that the function is called from.
     * Note: For 2D physics the z component of the gravity vector will be ignored.
     *
     * @param gravity - the new gravity vector
     * @example
     * ```ts
     * export default defineScript({
     *   init(self) {
     *     // Set "upside down" gravity for this collection.
     *     physics.set_gravity(vmath.vector3(0, 10.0, 0));
     *   },
     * });
     * ```
     */
    function set_gravity(gravity: Vector3): void;
    /**
     * Updates the group property of a collision object to the specified
     * string value. The group name should exist i.e. have been used in
     * a collision object in the editor.
     *
     * @param url - the collision object affected.
     * @param group - the new group name to be assigned.
     *
     * `local function change_collision_group()
     * physics.set_group("#collisionobject", "enemy")
     * end
     * `
     */
    function set_group(url: string | Hash | Url, group: string): void;
    /**
     * Flips the collision shapes horizontally for a collision object
     *
     * @param url - the collision object that should flip its shapes
     * @param flip - `true` if the collision object should flip its shapes, `false` if not
     * @example
     * ```ts
     * export default defineScript({
     *   init(self) {
     *     self.fliph = true; // set on some condition
     *     physics.set_hflip("#collisionobject", self.fliph);
     *   },
     * });
     * ```
     */
    function set_hflip(url: string | Hash | Url, flip: boolean): void;
    /**
     * Updates the properties for an already connected joint. The joint has to be created before
     * properties can be changed.
     * Note: Currently only supported in 2D physics.
     *
     * @param collisionobject - collision object where the joint exist
     * @param joint_id - id of the joint
     * @param properties - joint specific properties table
     * Note: The `collide_connected` field cannot be updated/changed after a connection has been made.
     */
    function set_joint_properties(collisionobject: string | Hash | Url, joint_id: string | Hash, properties: { collide_connected?: boolean }): void;
    /**
     * Sets or clears the masking of a group (maskbit) in a collision object.
     *
     * @param url - the collision object to change the mask of.
     * @param group - the name of the group (maskbit) to modify in the mask.
     * @param maskbit - boolean value of the new maskbit. 'true' to enable, 'false' to disable.
     *
     * `local function make_invincible()
     * -- no longer collide with the "bullet" group
     * physics.set_maskbit("#collisionobject", "bullet", false)
     * end
     * `
     */
    function set_maskbit(url: string | Hash | Url, group: string, maskbit: boolean): void;
    /**
     * Sets collision shape data for a collision object. Please note that updating data in 3D
     * can be quite costly for box and capsules. Because of the physics engine, the cost
     * comes from having to recreate the shape objects when certain shapes needs to be updated.
     *
     * @param url - the collision object.
     * @param shape - the name of the shape to get data for.
     * @param table - the shape data to update the shape with.
     * See physics.get_shape for a detailed description of each field in the data table.
     *
     * `local function set_shape_data()
     * -- set capsule shape data
     * local data = {}
     * data.type = physics.SHAPE_TYPE_CAPSULE
     * data.diameter = 10
     * data.height = 20
     * physics.set_shape("#collisionobject", "my_capsule_shape", data)
     *
     * -- set sphere shape data
     * data = {}
     * data.type = physics.SHAPE_TYPE_SPHERE
     * data.diameter = 10
     * physics.set_shape("#collisionobject", "my_sphere_shape", data)
     *
     * -- set box shape data
     * data = {}
     * data.type = physics.SHAPE_TYPE_BOX
     * data.dimensions = vmath.vector3(10, 10, 5)
     * physics.set_shape("#collisionobject", "my_box_shape", data)
     * end
     * `
     */
    function set_shape(url: string | Hash | Url, shape: string | Hash, table: { type?: number; diameter?: number; dimensions?: Vector3; diameter?: number; height?: number }): void;
    /**
     * Flips the collision shapes vertically for a collision object
     *
     * @param url - the collision object that should flip its shapes
     * @param flip - `true` if the collision object should flip its shapes, `false` if not
     * @example
     * ```ts
     * export default defineScript({
     *   init(self) {
     *     self.flipv = true; // set on some condition
     *     physics.set_vflip("#collisionobject", self.flipv);
     *   },
     * });
     * ```
     */
    function set_vflip(url: string | Hash | Url, flip: boolean): void;
    /**
     * The function recalculates the density of each shape based on the total area of all shapes and the specified mass, then updates the mass of the body accordingly.
     * Note: Currently only supported in 2D physics.
     *
     * @param collisionobject - the collision object whose mass needs to be updated.
     * @param mass - the new mass value to set for the collision object.
     * @example
     * ```ts
     * physics.update_mass("#collisionobject", 14);
     * ```
     */
    function update_mass(collisionobject: string | Hash | Url, mass: number): void;
    /**
     * Collision objects tend to fall asleep when inactive for a small period of time for
     * efficiency reasons. This function wakes them up.
     *
     * @param url - the collision object to wake.
     *
     * `function on_input(self, action_id, action)
     * if action_id == hash("test") and action.pressed then
     * physics.wakeup("#collisionobject")
     * end
     * end
     * `
     */
    function wakeup(url: string | Hash | Url): void;
    interface properties {
      /**
       * The angular damping value for the collision object. Setting this value alters the damping of
       * angular motion of the object (rotation). Valid values are between 0 (no damping) and 1 (full damping).
       */
      angular_damping: number;
      /**
       * The current angular velocity of the collision object component as a vector3.
       * The velocity is measured as a rotation around the vector with a speed equivalent to the vector length
       * in radians/s.
       */
      angular_velocity: Vector3;
      /**
       * The linear damping value for the collision object. Setting this value alters the damping of
       * linear motion of the object. Valid values are between 0 (no damping) and 1 (full damping).
       */
      linear_damping: number;
      /**
       * The current linear velocity of the collision object component as a vector3.
       * The velocity is measured in units/s (pixels/s).
       */
      linear_velocity: Vector3;
      /**
       * READ ONLY Returns the defined physical mass of the collision object component as a number.
       */
      mass: number;
    }
  }
}

export {};
